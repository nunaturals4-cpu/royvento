import { Router, type IRouter } from "express";
import { db, eventsTable, vendorsTable } from "@workspace/db";
import { eq, desc, and, ilike, sql } from "drizzle-orm";
import {
  CreateEventBody,
  UpdateEventBody,
  ListEventsQueryParams,
} from "@workspace/api-zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { getEventRatings } from "../lib/aggregates";

const router: IRouter = Router();

interface EventRow {
  id: number;
  vendorId: number;
  title: string;
  description: string;
  category: string;
  location: string;
  price: string;
  capacity: number;
  imageUrl: string;
  featured: boolean;
  createdAt: Date;
}

async function serializeEvents(rows: EventRow[]) {
  if (rows.length === 0) return [];
  const vendorIds = Array.from(new Set(rows.map((r) => r.vendorId)));
  const vendors =
    vendorIds.length === 0
      ? []
      : await db
          .select()
          .from(vendorsTable)
          .where(sql`${vendorsTable.id} IN (${sql.join(vendorIds, sql`, `)})`);
  const vendorMap = new Map(vendors.map((v) => [v.id, v]));
  const ratings = await getEventRatings(rows.map((r) => r.id));
  return rows.map((e) => {
    const v = vendorMap.get(e.vendorId);
    const r = ratings.get(e.id) ?? { rating: 0, reviewCount: 0 };
    return {
      id: e.id,
      vendorId: e.vendorId,
      title: e.title,
      description: e.description,
      category: e.category,
      location: e.location,
      price: Number(e.price),
      capacity: e.capacity,
      imageUrl: e.imageUrl,
      rating: r.rating,
      reviewCount: r.reviewCount,
      vendorName: v?.businessName ?? "",
      createdAt: e.createdAt.toISOString(),
    };
  });
}

router.get("/events", async (req, res) => {
  const parsed = ListEventsQueryParams.safeParse(req.query);
  const category = parsed.success ? parsed.data.category : undefined;
  const search = parsed.success ? parsed.data.search : undefined;
  const conditions = [];
  if (category) conditions.push(eq(eventsTable.category, category));
  if (search) conditions.push(ilike(eventsTable.title, `%${search}%`));
  const rows = await db
    .select()
    .from(eventsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(eventsTable.createdAt));
  res.json(await serializeEvents(rows));
});

router.get("/events/featured", async (_req, res) => {
  const rows = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.featured, true))
    .orderBy(desc(eventsTable.createdAt))
    .limit(8);
  if (rows.length === 0) {
    const fallback = await db
      .select()
      .from(eventsTable)
      .orderBy(desc(eventsTable.createdAt))
      .limit(6);
    res.json(await serializeEvents(fallback));
    return;
  }
  res.json(await serializeEvents(rows));
});

router.get("/events/vendor/me", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const vrows = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.userId, user.id))
    .limit(1);
  const vendor = vrows[0];
  if (!vendor) {
    res.json([]);
    return;
  }
  const rows = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.vendorId, vendor.id))
    .orderBy(desc(eventsTable.createdAt));
  res.json(await serializeEvents(rows));
});

router.get("/events/:eventId", async (req, res) => {
  const id = Number(req.params["eventId"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const rows = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, id))
    .limit(1);
  const e = rows[0];
  if (!e) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [base] = await serializeEvents([e]);
  if (!base) {
    res.status(500).json({ error: "Failed" });
    return;
  }
  const vrows = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.id, e.vendorId))
    .limit(1);
  const v = vrows[0];
  const { getVendorRating } = await import("../lib/aggregates");
  const rating = v ? await getVendorRating(v.id) : { rating: 0, reviewCount: 0 };
  res.json({
    ...base,
    vendor: v
      ? {
          id: v.id,
          userId: v.userId,
          businessName: v.businessName,
          category: v.category,
          description: v.description,
          location: v.location,
          bannerImage: v.bannerImage,
          portfolioImages: v.portfolioImages,
          status: v.status,
          rating: rating.rating,
          reviewCount: rating.reviewCount,
          createdAt: v.createdAt.toISOString(),
        }
      : null,
  });
});

router.post("/events", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const vrows = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.userId, user.id))
    .limit(1);
  const vendor = vrows[0];
  if (!vendor) {
    res.status(400).json({ error: "Vendor profile required" });
    return;
  }
  if (vendor.status !== "approved") {
    res.status(403).json({ error: "Vendor not approved yet" });
    return;
  }
  const [created] = await db
    .insert(eventsTable)
    .values({
      vendorId: vendor.id,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      category: parsed.data.category,
      location: parsed.data.location ?? "",
      price: String(parsed.data.price),
      capacity: parsed.data.capacity,
      imageUrl: parsed.data.imageUrl ?? "",
    })
    .returning();
  if (!created) {
    res.status(500).json({ error: "Failed" });
    return;
  }
  const [out] = await serializeEvents([created]);
  res.json(out);
});

router.patch("/events/:eventId", requireAuth(["vendor"]), async (req, res) => {
  const id = Number(req.params["eventId"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = UpdateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const eRows = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, id))
    .limit(1);
  const evt = eRows[0];
  if (!evt) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const vrows = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.id, evt.vendorId))
    .limit(1);
  const vendor = vrows[0];
  if (!vendor || vendor.userId !== user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const updates: Record<string, unknown> = {};
  for (const k of [
    "title",
    "description",
    "category",
    "location",
    "capacity",
    "imageUrl",
  ] as const) {
    const v = parsed.data[k];
    if (v !== undefined) updates[k] = v;
  }
  if (parsed.data.price !== undefined) updates["price"] = String(parsed.data.price);
  const [updated] = await db
    .update(eventsTable)
    .set(updates)
    .where(eq(eventsTable.id, id))
    .returning();
  if (!updated) {
    res.status(500).json({ error: "Failed" });
    return;
  }
  const [out] = await serializeEvents([updated]);
  res.json(out);
});

router.delete("/events/:eventId", requireAuth(["vendor"]), async (req, res) => {
  const id = Number(req.params["eventId"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const eRows = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, id))
    .limit(1);
  const evt = eRows[0];
  if (!evt) {
    res.json({ ok: true });
    return;
  }
  const vrows = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.id, evt.vendorId))
    .limit(1);
  const vendor = vrows[0];
  if (!vendor || vendor.userId !== user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(eventsTable).where(eq(eventsTable.id, id));
  res.json({ ok: true });
});

export default router;
