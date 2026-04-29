import { Router, type IRouter } from "express";
import { db, vendorsTable, usersTable } from "@workspace/db";
import { eq, desc, and, ilike } from "drizzle-orm";
import {
  CreateMyVendorBody,
  UpdateMyVendorBody,
  ListVendorsQueryParams,
} from "@workspace/api-zod";
import { requireAuth, loadUserFromRequest, type Role } from "../lib/auth";
import { getVendorRatings, getVendorRating } from "../lib/aggregates";
import { generateUniqueTicketPrefix, generateTicketSalt } from "../lib/ticketCode";

const router: IRouter = Router();

const CRM_TRIAL_DAYS = 60;

interface VendorRow {
  id: number;
  userId: number;
  businessName: string;
  category: string;
  description: string;
  location: string;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  bannerImage: string;
  coverImageUrl: string;
  portfolioImages: string[];
  openDays: string[];
  status: string;
  isPremium?: boolean;
  approvedAt?: Date | null;
  createdAt: Date;
}

function computeCrmTrial(v: VendorRow) {
  const trialStart = v.approvedAt ?? v.createdAt;
  const days = (Date.now() - trialStart.getTime()) / (1000 * 60 * 60 * 24);
  const crmTrialDaysRemaining = Math.max(0, Math.ceil(CRM_TRIAL_DAYS - days));
  return { crmTrialDaysRemaining, crmTrialActive: crmTrialDaysRemaining > 0 };
}

async function serializeVendor(v: VendorRow) {
  const summary = await getVendorRating(v.id);
  const { crmTrialDaysRemaining, crmTrialActive } = computeCrmTrial(v);
  return {
    id: v.id,
    userId: v.userId,
    businessName: v.businessName,
    category: v.category,
    description: v.description,
    location: v.location,
    country: v.country ?? "",
    state: v.state ?? "",
    city: v.city ?? "",
    bannerImage: v.bannerImage,
    coverImageUrl: v.coverImageUrl ?? "",
    portfolioImages: v.portfolioImages,
    openDays: v.openDays ?? [],
    openTime: v.openTime ?? null,
    closeTime: v.closeTime ?? null,
    status: v.status,
    isPremium: v.isPremium ?? false,
    approvedAt: v.approvedAt?.toISOString() ?? null,
    rating: summary.rating,
    reviewCount: summary.reviewCount,
    createdAt: v.createdAt.toISOString(),
    crmTrialActive,
    crmTrialDaysRemaining,
  };
}

async function serializeVendorList(rows: VendorRow[]) {
  const ratings = await getVendorRatings(rows.map((r) => r.id));
  return rows.map((v) => {
    const r = ratings.get(v.id) ?? { rating: 0, reviewCount: 0 };
    return {
      id: v.id,
      userId: v.userId,
      businessName: v.businessName,
      category: v.category,
      description: v.description,
      location: v.location,
      country: v.country ?? "",
      state: v.state ?? "",
      city: v.city ?? "",
      bannerImage: v.bannerImage,
      coverImageUrl: v.coverImageUrl ?? "",
      portfolioImages: v.portfolioImages,
      openDays: v.openDays ?? [],
      openTime: v.openTime ?? null,
      closeTime: v.closeTime ?? null,
      status: v.status,
      rating: r.rating,
      reviewCount: r.reviewCount,
      createdAt: v.createdAt.toISOString(),
    };
  });
}

router.get("/vendors", async (req, res) => {
  const parsed = ListVendorsQueryParams.safeParse(req.query);
  const filters = parsed.success ? parsed.data : {};
  const conditions = [eq(vendorsTable.status, "approved")];
  if (filters.category) conditions.push(eq(vendorsTable.category, filters.category));
  if (filters.country) conditions.push(ilike(vendorsTable.country, `%${filters.country}%`));
  if (filters.state) conditions.push(ilike(vendorsTable.state, `%${filters.state}%`));
  if (filters.city) conditions.push(ilike(vendorsTable.city, `%${filters.city}%`));
  const rows = await db
    .select()
    .from(vendorsTable)
    .where(and(...conditions))
    .orderBy(desc(vendorsTable.createdAt));
  res.json(await serializeVendorList(rows));
});

router.get("/vendors/pending", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.status, "pending"))
    .orderBy(desc(vendorsTable.createdAt));
  res.json(await serializeVendorList(rows));
});

router.get("/vendors/me", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.userId, user.id))
    .limit(1);
  const v = rows[0];
  res.json({ vendor: v ? await serializeVendor(v) : null });
});

router.post("/vendors/me", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = CreateMyVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const existing = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.userId, user.id))
    .limit(1);
  if (existing[0]) {
    res.status(409).json({ error: "Vendor profile already exists" });
    return;
  }
  const existingPrefixes = (await db.select({ p: vendorsTable.ticketPrefix }).from(vendorsTable)).map((r) => r.p).filter(Boolean);
  const ticketPrefix = await generateUniqueTicketPrefix(parsed.data.businessName, existingPrefixes);
  const [v] = await db
    .insert(vendorsTable)
    .values({
      userId: user.id,
      businessName: parsed.data.businessName,
      category: parsed.data.category,
      description: parsed.data.description ?? "",
      location: parsed.data.location ?? "",
      country: parsed.data.country ?? "",
      state: parsed.data.state ?? "",
      city: parsed.data.city ?? "",
      bannerImage: parsed.data.bannerImage ?? "",
      portfolioImages: parsed.data.portfolioImages ?? [],
      status: "pending",
      ticketPrefix,
      ticketSalt: generateTicketSalt(),
    })
    .returning();
  if (!v) {
    res.status(500).json({ error: "Failed to create vendor" });
    return;
  }
  if (user.role === "user") {
    await db
      .update(usersTable)
      .set({ role: "vendor" as Role })
      .where(eq(usersTable.id, user.id));
  }
  res.json(await serializeVendor(v));
});

router.patch("/vendors/me", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = UpdateMyVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const updates: Record<string, unknown> = {};
  for (const k of [
    "businessName",
    "category",
    "description",
    "location",
    "country",
    "state",
    "city",
    "bannerImage",
    "coverImageUrl",
    "portfolioImages",
  ] as const) {
    const val = parsed.data[k];
    if (val !== undefined) updates[k] = val;
  }
  const [v] = await db
    .update(vendorsTable)
    .set(updates)
    .where(eq(vendorsTable.userId, user.id))
    .returning();
  if (!v) {
    res.status(404).json({ error: "Vendor profile not found" });
    return;
  }
  res.json(await serializeVendor(v));
});

router.get("/vendors/:vendorId", async (req, res) => {
  const id = Number(req.params["vendorId"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const rows = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.id, id))
    .limit(1);
  const v = rows[0];
  if (!v) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(await serializeVendor(v));
});

router.post(
  "/vendors/:vendorId/approve",
  requireAuth(["admin"]),
  async (req, res) => {
    const id = Number(req.params["vendorId"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const existing = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
    const alreadyApproved = existing[0]?.status === "approved" && existing[0]?.approvedAt != null;
    const extra: Record<string, unknown> = {
      status: "approved",
      ...(alreadyApproved ? {} : { approvedAt: new Date() }),
    };
    if (existing[0] && !existing[0].ticketPrefix) {
      const existingPrefixes = (await db.select({ p: vendorsTable.ticketPrefix }).from(vendorsTable)).map((r) => r.p).filter(Boolean);
      extra["ticketPrefix"] = await generateUniqueTicketPrefix(existing[0].businessName, existingPrefixes);
      extra["ticketSalt"] = generateTicketSalt();
    }
    const [v] = await db
      .update(vendorsTable)
      .set(extra)
      .where(eq(vendorsTable.id, id))
      .returning();
    if (!v) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db
      .update(usersTable)
      .set({ role: "vendor" as Role })
      .where(eq(usersTable.id, v.userId));
    res.json(await serializeVendor(v));
  },
);

router.post(
  "/vendors/:vendorId/reject",
  requireAuth(["admin"]),
  async (req, res) => {
    const id = Number(req.params["vendorId"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [v] = await db
      .update(vendorsTable)
      .set({ status: "rejected" })
      .where(eq(vendorsTable.id, id))
      .returning();
    if (!v) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(await serializeVendor(v));
  },
);

export default router;
