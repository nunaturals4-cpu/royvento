import { Router, type IRouter } from "express";
import { db, eventsTable, vendorsTable, drinkPlansTable } from "@workspace/db";
import { eq, desc, and, ilike, sql, gte, lte, or, inArray } from "drizzle-orm";
import { CreateEventBody, UpdateEventBody } from "@workspace/api-zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { getEventRatings } from "../lib/aggregates";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorage = new ObjectStorageService();

const router: IRouter = Router();

const VALID_DAY_KEYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

function validateDayPricing(
  dp: unknown,
): Record<string, { women: number; men: number; couple: number } | null> | null {
  if (dp === null || dp === undefined) return null;
  if (typeof dp !== "object" || Array.isArray(dp)) {
    throw Object.assign(new Error("dayPricing must be a plain object or null"), { status: 400 });
  }
  const result: Record<string, { women: number; men: number; couple: number } | null> = {};
  for (const [key, val] of Object.entries(dp as Record<string, unknown>)) {
    if (!VALID_DAY_KEYS.has(key)) {
      throw Object.assign(new Error(`Invalid day key: ${key}. Must be Mon/Tue/Wed/Thu/Fri/Sat/Sun`), { status: 400 });
    }
    if (val === null) { result[key] = null; continue; }
    if (typeof val !== "object" || Array.isArray(val)) {
      throw Object.assign(new Error(`dayPricing.${key} must be an object or null`), { status: 400 });
    }
    const v = val as Record<string, unknown>;
    const women = Number(v["women"]);
    const men = Number(v["men"]);
    const couple = Number(v["couple"]);
    if (!isFinite(women) || !isFinite(men) || !isFinite(couple)) {
      throw Object.assign(new Error(`dayPricing.${key}: women, men, couple must be finite numbers`), { status: 400 });
    }
    if (women < 0 || men < 0 || couple < 0) {
      throw Object.assign(new Error(`dayPricing.${key}: prices must be >= 0`), { status: 400 });
    }
    result[key] = { women, men, couple };
  }
  return result;
}

const FREE_ENTRY_GENDERS = new Set(["Everyone", "Ladies", "Men", "Couples"]);
const FREE_ENTRY_DAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
const FREE_ENTRY_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validateFreeEntryRules(
  val: unknown,
): { enabled: boolean; genders: string[]; days: string[]; beforeTime?: string } | null {
  if (val === null || val === undefined) return null;
  if (typeof val !== "object" || Array.isArray(val)) {
    throw Object.assign(new Error("freeEntryRules must be a plain object or null"), { status: 400 });
  }
  const v = val as Record<string, unknown>;
  const enabled = !!v["enabled"];
  const rawGenders = Array.isArray(v["genders"]) ? (v["genders"] as unknown[]) : [];
  const genders = rawGenders.filter((g): g is string => typeof g === "string" && FREE_ENTRY_GENDERS.has(g));
  if (rawGenders.length !== genders.length) {
    throw Object.assign(new Error(`freeEntryRules.genders contains invalid values; allowed: ${[...FREE_ENTRY_GENDERS].join(", ")}`), { status: 400 });
  }
  const rawDays = Array.isArray(v["days"]) ? (v["days"] as unknown[]) : [];
  const days = rawDays.filter((d): d is string => typeof d === "string" && FREE_ENTRY_DAYS.has(d));
  if (rawDays.length !== days.length) {
    throw Object.assign(new Error(`freeEntryRules.days contains invalid values; allowed: ${[...FREE_ENTRY_DAYS].join(", ")}`), { status: 400 });
  }
  let beforeTime: string | undefined;
  if (typeof v["beforeTime"] === "string" && v["beforeTime"]) {
    if (!FREE_ENTRY_TIME_RE.test(v["beforeTime"])) {
      throw Object.assign(new Error("freeEntryRules.beforeTime must be in HH:mm format"), { status: 400 });
    }
    beforeTime = v["beforeTime"];
  }
  return { enabled, genders, days, ...(beforeTime !== undefined ? { beforeTime } : {}) };
}

interface EventRow {
  id: number;
  vendorId: number;
  title: string;
  description: string;
  category: string;
  type: string;
  location: string;
  state: string;
  city: string;
  country: string;
  price: string;
  capacity: number;
  imageUrl: string;
  eventDate: string | null;
  featured: boolean;
  popular: boolean;
  pubMode: string;
  priceWomen: string;
  priceMen: string;
  priceCouple: string;
  pubEventTypes: string[];
  dayPricing: Record<string, { women: number; men: number; couple: number } | null> | null;
  freeEntryRules?: { enabled: boolean; genders: string[]; days: string[]; beforeTime?: string } | null;
  galleryImages: string[] | null;
  galleryVideos: string[] | null;
  approvalStatus: string;
  rejectionReason: string | null;
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
  const vendorsWithPlans = vendorIds.length > 0
    ? await db
        .selectDistinct({ vendorId: drinkPlansTable.vendorId })
        .from(drinkPlansTable)
        .where(inArray(drinkPlansTable.vendorId, vendorIds))
    : [];
  const vendorIdsWithPlans = new Set(vendorsWithPlans.map((r) => r.vendorId));
  return rows.map((e) => {
    const v = vendorMap.get(e.vendorId);
    const r = ratings.get(e.id) ?? { rating: 0, reviewCount: 0 };
    const tierPrices = [Number(e.priceWomen), Number(e.priceMen), Number(e.priceCouple)].filter((n) => n > 0);
    const startingAt =
      e.type === "pub"
        ? (tierPrices.length > 0 ? Math.min(...tierPrices) : Number(e.price))
        : Number(e.price);
    return {
      id: e.id,
      vendorId: e.vendorId,
      title: e.title,
      description: e.description,
      category: e.category,
      type: e.type,
      location: e.location,
      state: e.state,
      city: e.city,
      country: e.country,
      price: Number(e.price),
      startingPrice: Number.isFinite(startingAt) ? startingAt : (Number(e.price) || 0),
      capacity: e.capacity,
      imageUrl: e.imageUrl,
      eventDate: e.eventDate,
      featured: e.featured,
      popular: e.popular,
      pubMode: e.pubMode,
      priceWomen: Number(e.priceWomen),
      priceMen: Number(e.priceMen),
      priceCouple: Number(e.priceCouple),
      pubEventTypes: e.pubEventTypes ?? [],
      dayPricing: e.dayPricing ?? null,
      freeEntryRules: e.freeEntryRules ?? null,
      galleryImages: e.galleryImages ?? [],
      galleryVideos: e.galleryVideos ?? [],
      approvalStatus: e.approvalStatus,
      rejectionReason: e.rejectionReason ?? null,
      rating: r.rating,
      reviewCount: r.reviewCount,
      vendorName: v?.businessName ?? "",
      partnerName: v?.businessName ?? "",
      createdAt: e.createdAt.toISOString(),
      hasDrinkPlans: vendorIdsWithPlans.has(e.vendorId),
    };
  });
}

router.get("/events", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const conditions = [eq(eventsTable.approvalStatus, "approved")];
  if (q["category"]) conditions.push(eq(eventsTable.category, q["category"]));
  if (q["type"]) conditions.push(eq(eventsTable.type, q["type"]));
  if (q["state"]) conditions.push(ilike(eventsTable.state, `%${q["state"]}%`));
  if (q["city"]) conditions.push(ilike(eventsTable.city, `%${q["city"]}%`));
  if (q["country"])
    conditions.push(ilike(eventsTable.country, `%${q["country"]}%`));
  if (q["minPrice"]) conditions.push(gte(eventsTable.price, q["minPrice"]));
  if (q["maxPrice"]) conditions.push(lte(eventsTable.price, q["maxPrice"]));
  if (q["search"]) {
    const s = `%${q["search"]}%`;
    const searchCond = or(
      ilike(eventsTable.title, s),
      ilike(eventsTable.description, s),
      ilike(eventsTable.city, s),
    );
    if (searchCond) conditions.push(searchCond);
  }
  if (q["drinkPlanType"]) {
    const vendorIdsWithPlan = await db
      .selectDistinct({ vendorId: drinkPlansTable.vendorId })
      .from(drinkPlansTable)
      .where(eq(drinkPlansTable.type, q["drinkPlanType"]));
    const ids = vendorIdsWithPlan.map((r) => r.vendorId);
    if (ids.length === 0) {
      if (q["page"] !== undefined) {
        const page = Math.max(1, parseInt(q["page"], 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(q["limit"] ?? "20", 10) || 20));
        res.json({ data: [], page, limit, hasMore: false });
      } else {
        res.json([]);
      }
      return;
    }
    conditions.push(inArray(eventsTable.vendorId, ids));
  }

  if (q["page"] !== undefined) {
    const page = Math.max(1, parseInt(q["page"], 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(q["limit"] ?? "20", 10) || 20));
    const offset = (page - 1) * limit;

    const rows = await db
      .select()
      .from(eventsTable)
      .where(and(...conditions))
      .orderBy(desc(eventsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const serialized = await serializeEvents(rows);
    res.json({ data: serialized, page, limit, hasMore: rows.length === limit });
  } else {
    const rows = await db
      .select()
      .from(eventsTable)
      .where(and(...conditions))
      .orderBy(desc(eventsTable.createdAt));

    res.json(await serializeEvents(rows));
  }
});

router.get("/events/featured", async (_req, res) => {
  const rows = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.featured, true), eq(eventsTable.approvalStatus, "approved")))
    .orderBy(desc(eventsTable.createdAt))
    .limit(8);
  if (rows.length === 0) {
    const fallback = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.approvalStatus, "approved"))
      .orderBy(desc(eventsTable.createdAt))
      .limit(6);
    res.json(await serializeEvents(fallback));
    return;
  }
  res.json(await serializeEvents(rows));
});

router.get("/events/popular", async (_req, res) => {
  const rows = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.popular, true), eq(eventsTable.approvalStatus, "approved")))
    .orderBy(desc(eventsTable.createdAt))
    .limit(8);
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
    res.json({ data: [], total: 0, page: 1, totalPages: 1 });
    return;
  }

  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.max(1, Math.min(Number(req.query["limit"]) || 500, 500));
  const [countRow, rows] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(eventsTable).where(eq(eventsTable.vendorId, vendor.id)),
    db.select().from(eventsTable).where(eq(eventsTable.vendorId, vendor.id)).orderBy(desc(eventsTable.createdAt)).limit(limit).offset((page - 1) * limit),
  ]);
  const total = countRow[0]?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  res.json({ data: await serializeEvents(rows), total, page, totalPages });
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
          state: v.state,
          city: v.city,
          country: v.country,
          bannerImage: v.bannerImage,
          coverImageUrl: v.coverImageUrl ?? "",
          portfolioImages: v.portfolioImages,
          openDays: v.openDays ?? [],
          address: v.address ?? null,
          dayHours: v.dayHours ? (() => { try { return JSON.parse(v.dayHours!); } catch { return null; } })() : null,
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
    res.status(400).json({ error: "Partner profile required" });
    return;
  }
  if (vendor.status !== "approved") {
    res.status(403).json({ error: "Partner not approved yet" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const newType =
    typeof body["type"] === "string" ? (body["type"] as string) : "event";

  // Mutual exclusivity: if first event is pub, only pubs allowed; if first is non-pub, no pubs allowed.
  const existingRows = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.vendorId, vendor.id))
    .limit(50);
  if (existingRows.length > 0) {
    const hasPub = existingRows.some((e) => e.type === "pub");
    const hasNonPub = existingRows.some((e) => e.type !== "pub");
    if (newType === "pub" && hasNonPub) {
      res.status(400).json({
        error:
          "Your profile already has non-pub events. You can't add pubs alongside other event types.",
      });
      return;
    }
    if (newType !== "pub" && hasPub) {
      res.status(400).json({
        error:
          "Your profile is set up for pubs. You can't mix other event types in the same profile.",
      });
      return;
    }
    if (newType === "pub" && hasPub) {
      res.status(400).json({
        error:
          "You already have a pub listing. Delete it before creating a new one.",
      });
      return;
    }
  }

  const pubMode =
    typeof body["pubMode"] === "string" ? (body["pubMode"] as string) : "";
  const priceWomen = body["priceWomen"];
  const priceMen = body["priceMen"];
  const priceCouple = body["priceCouple"];
  const pubEventTypes = Array.isArray(body["pubEventTypes"])
    ? (body["pubEventTypes"] as string[])
    : [];
  let dayPricing: Record<string, { women: number; men: number; couple: number } | null> | null;
  try {
    dayPricing = validateDayPricing(body["dayPricing"]);
  } catch (e: unknown) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }
  let freeEntryRules: { enabled: boolean; genders: string[]; days: string[]; beforeTime?: string } | null;
  try {
    freeEntryRules = validateFreeEntryRules(body["freeEntryRules"]);
  } catch (e: unknown) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }

  const [created] = await db
    .insert(eventsTable)
    .values({
      vendorId: vendor.id,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      category: parsed.data.category,
      type: newType,
      location: parsed.data.location ?? "",
      state: typeof body["state"] === "string" ? (body["state"] as string) : "",
      city: typeof body["city"] === "string" ? (body["city"] as string) : "",
      country:
        typeof body["country"] === "string"
          ? (body["country"] as string)
          : "India",
      price: String(parsed.data.price),
      capacity: parsed.data.capacity,
      imageUrl: parsed.data.imageUrl ?? "",
      pubMode,
      priceWomen: priceWomen != null ? String(priceWomen) : "0",
      priceMen: priceMen != null ? String(priceMen) : "0",
      priceCouple: priceCouple != null ? String(priceCouple) : "0",
      pubEventTypes,
      dayPricing,
      freeEntryRules,
      galleryImages: parsed.data.galleryImages ?? null,
      galleryVideos: parsed.data.galleryVideos ?? null,
      approvalStatus: "pending",
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
  const parsed = UpdateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const updates: Record<string, unknown> = {};
  const body = req.body as Record<string, unknown>;
  for (const k of [
    "title",
    "description",
    "category",
    "location",
    "imageUrl",
    "state",
    "city",
    "country",
    "pubMode",
  ]) {
    if (typeof body[k] === "string") updates[k] = body[k];
  }
  if (typeof body["capacity"] === "number") updates["capacity"] = body["capacity"];
  if (body["price"] !== undefined) updates["price"] = String(body["price"]);
  if (body["priceWomen"] !== undefined)
    updates["priceWomen"] = String(body["priceWomen"]);
  if (body["priceMen"] !== undefined)
    updates["priceMen"] = String(body["priceMen"]);
  if (body["priceCouple"] !== undefined)
    updates["priceCouple"] = String(body["priceCouple"]);
  if (Array.isArray(body["pubEventTypes"]))
    updates["pubEventTypes"] = body["pubEventTypes"];
  if ("dayPricing" in body) {
    try {
      updates["dayPricing"] = validateDayPricing(body["dayPricing"]);
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }
  }
  if ("freeEntryRules" in body) {
    try {
      updates["freeEntryRules"] = validateFreeEntryRules(body["freeEntryRules"]);
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }
  }
  if (parsed.data.galleryImages !== undefined)
    updates["galleryImages"] = parsed.data.galleryImages;
  if (parsed.data.galleryVideos !== undefined)
    updates["galleryVideos"] = parsed.data.galleryVideos;

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

router.delete("/events/:eventId", requireAuth(), async (req, res) => {
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
  if (user.role === "admin") {
    const imageUrl = evt.imageUrl;
    await db.delete(eventsTable).where(eq(eventsTable.id, id));
    if (imageUrl) { try { await objectStorage.deleteObject(imageUrl); } catch {} }
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
  const imageUrl = evt.imageUrl;
  await db.delete(eventsTable).where(eq(eventsTable.id, id));
  if (imageUrl) { try { await objectStorage.deleteObject(imageUrl); } catch {} }
  res.json({ ok: true });
});

export default router;
