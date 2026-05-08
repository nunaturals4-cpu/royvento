import { Router, type IRouter } from "express";
import { db, vendorsTable, usersTable, eventsTable, drinkPlansTable } from "@workspace/db";
import { eq, desc, and, ilike, inArray, or, sql } from "drizzle-orm";
import {
  CreateMyVendorBody,
  UpdateMyVendorBody,
  ListVendorsQueryParams,
  SetPartnerCrowdLevelBody,
} from "@workspace/api-zod";
import { z } from "zod";
import { requireAuth, loadUserFromRequest, type Role } from "../lib/auth";
import { getVendorRatings, getVendorRating } from "../lib/aggregates";
import { generateUniqueTicketPrefix, generateTicketSalt } from "../lib/ticketCode";

const router: IRouter = Router();

const CRM_TRIAL_DAYS = 60;

// Mirror of artifacts/royvento/src/lib/seo-slug.ts CITY_ALIASES so server
// queries match what the SEO routes canonicalise to.
// First entry in each group is the canonical slug.
const CITY_ALIAS_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ["bangalore", "bengaluru"],
  ["mumbai", "bombay"],
  ["gurgaon", "gurugram"],
  ["kolkata", "calcutta"],
  ["chennai", "madras"],
  ["pune", "poona"],
];

function expandCityAliases(input: string): string[] {
  const norm = input.trim().toLowerCase();
  if (!norm) return [input];
  for (const group of CITY_ALIAS_GROUPS) {
    if (group.includes(norm)) return [...group];
  }
  return [norm];
}

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
  address?: string | null;
  bannerImage: string;
  coverImageUrl: string;
  portfolioImages: string[];
  openDays: string[];
  dayHours?: string | null;
  danceFloor?: string | null;
  danceFloorPhotos?: string[] | null;
  menuUrl?: string | null;
  menuUrls?: string[] | null;
  crowdLevel?: string | null;
  onlineBalance?: string | null;
  status: string;
  isPremium?: boolean;
  approvedAt?: Date | null;
  createdAt: Date;
}

function parseDayHours(raw: string | null | undefined): Record<string, { open: string; close: string } | null> | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as Record<string, { open: string; close: string } | null>; }
  catch { return null; }
}

function computeCrmTrial(v: VendorRow) {
  const trialStart = v.approvedAt ?? v.createdAt;
  const days = (Date.now() - trialStart.getTime()) / (1000 * 60 * 60 * 24);
  const crmTrialDaysRemaining = Math.max(0, Math.ceil(CRM_TRIAL_DAYS - days));
  return { crmTrialDaysRemaining, crmTrialActive: crmTrialDaysRemaining > 0 };
}

async function serializeVendor(v: VendorRow) {
  const [summary, pubEvents] = await Promise.all([
    getVendorRating(v.id),
    db.select({ freeEntryRules: eventsTable.freeEntryRules })
      .from(eventsTable)
      .where(and(
        eq(eventsTable.vendorId, v.id),
        eq(eventsTable.type, "pub"),
        eq(eventsTable.approvalStatus, "approved"),
      ))
      .orderBy(desc(eventsTable.createdAt))
      .limit(1),
  ]);
  const freeEntryRules = pubEvents.length > 0
    ? parseFreeEntryRules(pubEvents[0]!.freeEntryRules)
    : null;
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
    address: v.address ?? null,
    dayHours: parseDayHours(v.dayHours),
    status: v.status,
    isPremium: v.isPremium ?? false,
    approvedAt: v.approvedAt?.toISOString() ?? null,
    rating: summary.rating,
    reviewCount: summary.reviewCount,
    createdAt: v.createdAt.toISOString(),
    crmTrialActive,
    crmTrialDaysRemaining,
    freeEntryRules,
    danceFloor: v.danceFloor ?? null,
    danceFloorPhotos: v.danceFloorPhotos ?? null,
    menuUrl: v.menuUrl ?? "",
    menuUrls: v.menuUrls ?? [],
    crowdLevel: v.crowdLevel ?? null,
  };
}

function parseFreeEntryRules(raw: unknown): { enabled: boolean; genders: string[]; days: string[]; beforeTime?: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!r["enabled"]) return null;
  return {
    enabled: true,
    genders: Array.isArray(r["genders"]) ? (r["genders"] as string[]) : [],
    days: Array.isArray(r["days"]) ? (r["days"] as string[]) : [],
    ...(typeof r["beforeTime"] === "string" && r["beforeTime"] ? { beforeTime: r["beforeTime"] } : {}),
  };
}

async function serializeVendorList(rows: VendorRow[]) {
  const ratings = await getVendorRatings(rows.map((r) => r.id));

  // Batch-fetch the pub event free entry rules for these vendors
  const vendorIds = rows.map((r) => r.id);
  const pubEvents = vendorIds.length > 0
    ? await db.select({ vendorId: eventsTable.vendorId, freeEntryRules: eventsTable.freeEntryRules })
        .from(eventsTable)
        .where(and(
          inArray(eventsTable.vendorId, vendorIds),
          eq(eventsTable.type, "pub"),
          eq(eventsTable.approvalStatus, "approved"),
        ))
        .orderBy(desc(eventsTable.createdAt))
    : [];
  const freeEntryByVendor = new Map<number, ReturnType<typeof parseFreeEntryRules>>();
  for (const ev of pubEvents) {
    if (ev.vendorId !== null && !freeEntryByVendor.has(ev.vendorId)) {
      freeEntryByVendor.set(ev.vendorId, parseFreeEntryRules(ev.freeEntryRules));
    }
  }

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
      address: v.address ?? null,
      dayHours: parseDayHours(v.dayHours),
      status: v.status,
      rating: r.rating,
      reviewCount: r.reviewCount,
      createdAt: v.createdAt.toISOString(),
      freeEntryRules: freeEntryByVendor.get(v.id) ?? null,
      danceFloor: v.danceFloor ?? null,
      danceFloorPhotos: v.danceFloorPhotos ?? null,
      menuUrl: v.menuUrl ?? "",
      menuUrls: v.menuUrls ?? [],
      crowdLevel: v.crowdLevel ?? null,
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
  if (filters.city) {
    // Expand the user-supplied city to its known aliases so that a request
    // for `?city=bangalore` also returns vendors stored as "Bengaluru" (and
    // vice-versa). Keeps SEO-friendly slug routes (`/bangalore`) in sync
    // with whatever spelling the data actually uses.
    const variants = expandCityAliases(filters.city);
    const cityConds = variants.map((v) => ilike(vendorsTable.city, `%${v}%`));
    const combined = cityConds.length === 1 ? cityConds[0]! : or(...cityConds)!;
    conditions.push(combined);
  }
  if (filters.danceFloor) conditions.push(eq(vendorsTable.danceFloor, filters.danceFloor));
  if (filters.drinkPlanType) {
    const vendorIdsWithPlan = await db
      .selectDistinct({ vendorId: drinkPlansTable.vendorId })
      .from(drinkPlansTable)
      .where(eq(drinkPlansTable.type, filters.drinkPlanType));
    const ids = vendorIdsWithPlan.map((r) => r.vendorId);
    if (ids.length === 0) { res.json([]); return; }
    conditions.push(inArray(vendorsTable.id, ids));
  }
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
    "menuUrl",
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

router.patch("/partner/crowd-level", requireAuth(["vendor"]), async (req, res) => {
  const user = (req as import("../lib/auth").AuthedRequest).user;
  const parsed = SetPartnerCrowdLevelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "crowdLevel must be low, moderate, or party" });
    return;
  }
  const crowdLevel = parsed.data.crowdLevel;
  const [v] = await db
    .update(vendorsTable)
    .set({ crowdLevel: crowdLevel })
    .where(eq(vendorsTable.userId, user.id))
    .returning();
  if (!v) {
    res.status(404).json({ error: "Vendor profile not found" });
    return;
  }
  res.json({ crowdLevel: v.crowdLevel ?? null });
});

router.get("/vendors/drink-offers", async (_req, res) => {
  const vendorIdsWithPlans = await db
    .selectDistinct({ vendorId: drinkPlansTable.vendorId })
    .from(drinkPlansTable);
  const ids = vendorIdsWithPlans.map((r) => r.vendorId);
  if (ids.length === 0) { res.json([]); return; }
  const vendors = await db
    .select({ id: vendorsTable.id, businessName: vendorsTable.businessName, coverImageUrl: vendorsTable.coverImageUrl })
    .from(vendorsTable)
    .where(and(eq(vendorsTable.status, "approved"), inArray(vendorsTable.id, ids)));
  const plans = await db
    .select()
    .from(drinkPlansTable)
    .where(inArray(drinkPlansTable.vendorId, ids))
    .orderBy(drinkPlansTable.createdAt);
  const pubEvents = await db
    .select({ id: eventsTable.id, vendorId: eventsTable.vendorId })
    .from(eventsTable)
    .where(and(
      inArray(eventsTable.vendorId, ids),
      eq(eventsTable.type, "pub"),
      eq(eventsTable.approvalStatus, "approved"),
    ))
    .orderBy(desc(eventsTable.createdAt));
  const pubEventByVendor = new Map<number, number>();
  for (const ev of pubEvents) {
    if (ev.vendorId !== null && !pubEventByVendor.has(ev.vendorId)) {
      pubEventByVendor.set(ev.vendorId, ev.id);
    }
  }
  const plansByVendor = new Map<number, typeof plans>();
  for (const plan of plans) {
    const arr = plansByVendor.get(plan.vendorId) ?? [];
    arr.push(plan);
    plansByVendor.set(plan.vendorId, arr);
  }
  const result = vendors
    .map((v) => ({
      vendorId: v.id,
      vendorName: v.businessName,
      coverImageUrl: v.coverImageUrl,
      pubEventId: pubEventByVendor.get(v.id) ?? null,
      plans: (plansByVendor.get(v.id) ?? []).map((p) => ({
        type: p.type,
        productName: p.productName,
        gender: p.gender,
        lineItems: p.lineItems,
        days: p.days,
        timeFrom: p.timeFrom,
        timeTo: p.timeTo,
        description: p.description,
      })),
    }))
    .filter((v) => v.plans.length > 0);
  res.json(result);
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

const VALID_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const DrinkPlanLineItem = z.object({
  name: z.string().min(1).max(255),
  qty: z.number().int().min(1),
  discountedPrice: z.number().int().min(0),
});

const DrinkPlanBody = z.object({
  type: z.enum(["welcome", "unlimited", "ticket", "custom"]),
  productName: z.string().max(255).default(""),
  gender: z.enum(["all", "female"]).default("all"),
  price: z.number().int().min(0).default(0),
  days: z.array(z.enum(VALID_DAYS)).default([]),
  timeFrom: z.string().refine((v) => v === "" || HH_MM_RE.test(v), { message: "timeFrom must be HH:MM or empty" }).default(""),
  timeTo: z.string().refine((v) => v === "" || HH_MM_RE.test(v), { message: "timeTo must be HH:MM or empty" }).default(""),
  description: z.string().max(500).default(""),
  lineItems: z.array(DrinkPlanLineItem).nullable().optional(),
  drinksOfferLabel: z.string().max(255).optional().default(""),
  foodDiscountLabel: z.string().max(255).optional().default(""),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

// Convert HH:MM to minutes since midnight (empty string = 0 / 24*60 = open window)
function toMinutes(hhmm: string): number {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// Returns true if two time windows overlap.
// Empty timeFrom+timeTo means "all day", which overlaps with everything.
function timesOverlap(fromA: string, toA: string, fromB: string, toB: string): boolean {
  if ((!fromA && !toA) || (!fromB && !toB)) return true;
  const a0 = toMinutes(fromA);
  const a1 = toMinutes(toA) || 24 * 60;
  const b0 = toMinutes(fromB);
  const b1 = toMinutes(toB) || 24 * 60;
  return a0 < b1 && b0 < a1;
}

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// Treat empty days array as "applies every day of the week"
function effectiveDays(days: string[]): string[] {
  return days.length > 0 ? days : [...ALL_DAYS];
}

async function checkDrinkPlanConflict(
  vendorId: number,
  type: string,
  days: string[],
  timeFrom: string,
  timeTo: string,
  excludePlanId?: number,
): Promise<{ type: string; days: string[]; timeFrom: string; timeTo: string } | null> {
  if (type !== "welcome" && type !== "ticket") return null;
  const incomingDays = effectiveDays(days);
  const existing = await db
    .select()
    .from(drinkPlansTable)
    .where(and(
      eq(drinkPlansTable.vendorId, vendorId),
      inArray(drinkPlansTable.type, ["welcome", "ticket"]),
    ));
  for (const plan of existing) {
    if (excludePlanId && plan.id === excludePlanId) continue;
    const planDays = effectiveDays(plan.days);
    const sharedDay = incomingDays.some((d) => planDays.includes(d));
    if (!sharedDay) continue;
    if (timesOverlap(timeFrom, timeTo, plan.timeFrom, plan.timeTo)) {
      return { type: plan.type, days: plan.days, timeFrom: plan.timeFrom, timeTo: plan.timeTo };
    }
  }
  return null;
}

function describeConflict(c: { type: string; days: string[]; timeFrom: string; timeTo: string }): string {
  const label = c.type === "welcome" ? "Free Entry" : "Ticket";
  const dayPart = c.days.length > 0 && c.days.length < 7 ? c.days.join(", ") : "every day";
  const timePart = c.timeFrom && c.timeTo ? ` ${c.timeFrom}–${c.timeTo}` : "";
  return `A ${label} plan already exists on ${dayPart}${timePart}. Please choose a different day or time, or edit the existing plan.`;
}

router.get("/vendors/:vendorId/drink-plans", async (req, res) => {
  const id = Number(req.params["vendorId"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const plans = await db
    .select()
    .from(drinkPlansTable)
    .where(eq(drinkPlansTable.vendorId, id))
    .orderBy(drinkPlansTable.createdAt);
  res.json(plans);
});

router.post("/vendors/me/drink-plans", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const vendor = await db.select().from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
  if (!vendor[0]) { res.status(404).json({ error: "Vendor profile not found" }); return; }
  const parsed = DrinkPlanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", issues: parsed.error.issues }); return; }
  const conflict = await checkDrinkPlanConflict(vendor[0].id, parsed.data.type, parsed.data.days, parsed.data.timeFrom, parsed.data.timeTo);
  if (conflict) {
    res.status(409).json({ error: describeConflict(conflict) });
    return;
  }
  const [plan] = await db.insert(drinkPlansTable).values({
    vendorId: vendor[0].id,
    ...parsed.data,
  }).returning();
  res.json(plan);
});

router.patch("/vendors/me/drink-plans/:planId", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const planId = Number(req.params["planId"]);
  if (!Number.isFinite(planId)) { res.status(400).json({ error: "Invalid plan id" }); return; }
  const vendor = await db.select().from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
  if (!vendor[0]) { res.status(404).json({ error: "Vendor profile not found" }); return; }
  const parsed = DrinkPlanBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", issues: parsed.error.issues }); return; }

  // Load the existing plan so we can compute effective values even for partial patches
  const [existingPlan] = await db
    .select()
    .from(drinkPlansTable)
    .where(and(eq(drinkPlansTable.id, planId), eq(drinkPlansTable.vendorId, vendor[0].id)));
  if (!existingPlan) { res.status(404).json({ error: "Plan not found" }); return; }

  // Merge patch over existing to derive effective conflict-check inputs
  const effectiveType = parsed.data.type ?? existingPlan.type;
  const effectiveDaysVal = parsed.data.days ?? existingPlan.days;
  const effectiveTimeFrom = parsed.data.timeFrom ?? existingPlan.timeFrom;
  const effectiveTimeTo = parsed.data.timeTo ?? existingPlan.timeTo;

  const conflict = await checkDrinkPlanConflict(vendor[0].id, effectiveType, effectiveDaysVal, effectiveTimeFrom, effectiveTimeTo, planId);
  if (conflict) {
    res.status(409).json({ error: describeConflict(conflict) });
    return;
  }

  const [updated] = await db
    .update(drinkPlansTable)
    .set(parsed.data)
    .where(and(eq(drinkPlansTable.id, planId), eq(drinkPlansTable.vendorId, vendor[0].id)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json(updated);
});

router.delete("/vendors/me/drink-plans/:planId", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const planId = Number(req.params["planId"]);
  if (!Number.isFinite(planId)) { res.status(400).json({ error: "Invalid plan id" }); return; }
  const vendor = await db.select().from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
  if (!vendor[0]) { res.status(404).json({ error: "Vendor profile not found" }); return; }
  const [deleted] = await db
    .delete(drinkPlansTable)
    .where(and(eq(drinkPlansTable.id, planId), eq(drinkPlansTable.vendorId, vendor[0].id)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json({ ok: true });
});

export default router;
