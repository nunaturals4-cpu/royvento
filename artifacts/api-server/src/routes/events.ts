import { Router, type IRouter } from "express";
import { db, eventsTable, vendorsTable, drinkPlansTable, bookingsTable, wishlistsTable } from "@workspace/db";
import { eq, desc, and, ilike, sql, gte, lte, or, inArray } from "drizzle-orm";
import {
  CreateEventBody,
  UpdateEventBody,
  ListEventsQueryParams,
  UpdateEventParams,
} from "@workspace/api-zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { getEventRatings } from "../lib/aggregates";
import { ObjectStorageService } from "../lib/objectStorage";
import { respondInvalid } from "../lib/validationError";

const objectStorage = new ObjectStorageService();

const router: IRouter = Router();

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
  disabledGenders: string[] | null;
  dayPricing: Record<string, { women: number; men: number; couple: number } | null> | null;
  freeEntryRules?: { enabled: boolean; genders: string[]; days: string[]; beforeTime?: string } | null;
  galleryImages: string[] | null;
  galleryVideos: string[] | null;
  approvalStatus: string;
  rejectionReason: string | null;
  approvedAt: Date | null;
  createdAt: Date;
}

async function serializeEvents(rows: EventRow[]) {
  if (rows.length === 0) return [];
  const vendorIds = Array.from(new Set(rows.map((r) => r.vendorId)));
  // Only these four columns are ever read out of the vendor row below
  // (businessName → vendorName/partnerName, category → vendorCategory,
  // crowdLevel → vendorCrowdLevel, id → map key). Selecting just them avoids
  // pulling heavy per-vendor text/array columns (description, bannerImage,
  // portfolioImages, menuUrls, danceFloorPhotos, …) for every card in every
  // list. The serialized API response is byte-for-byte identical; the detail
  // endpoint loads the full vendor separately.
  const vendors =
    vendorIds.length === 0
      ? []
      : await db
          .select({
            id: vendorsTable.id,
            businessName: vendorsTable.businessName,
            category: vendorsTable.category,
            crowdLevel: vendorsTable.crowdLevel,
          })
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
      dateNight: (e as unknown as { dateNight?: boolean }).dateNight ?? false,
      pubMode: e.pubMode,
      priceWomen: Number(e.priceWomen),
      priceMen: Number(e.priceMen),
      priceCouple: Number(e.priceCouple),
      pubEventTypes: e.pubEventTypes ?? [],
      disabledGenders: e.disabledGenders ?? [],
      dayPricing: e.dayPricing ?? null,
      freeEntryRules: e.freeEntryRules ?? null,
      freeEntryForTable: (e as unknown as { freeEntryForTable?: boolean }).freeEntryForTable ?? false,
      freeEntryForTableDays: (e as unknown as { freeEntryForTableDays?: string[] | null }).freeEntryForTableDays ?? null,
      freeEntryForTableBeforeTime: (e as unknown as { freeEntryForTableBeforeTime?: string | null }).freeEntryForTableBeforeTime ?? null,
      startTime: (e as unknown as { startTime?: string }).startTime ?? "",
      endTime: (e as unknown as { endTime?: string }).endTime ?? "",
      happeningTonight: (e as unknown as { happeningTonight?: boolean }).happeningTonight ?? true,
      startingSoon: (e as unknown as { startingSoon?: boolean }).startingSoon ?? true,
      lastMinuteDeal: (e as unknown as { lastMinuteDeal?: boolean }).lastMinuteDeal ?? false,
      dealLabel: (e as unknown as { dealLabel?: string }).dealLabel ?? "",
      // ── Going Out With Friends ── group-capacity controls.
      tableCount: (e as unknown as { tableCount?: number }).tableCount ?? 0,
      tableSize: (e as unknown as { tableSize?: number }).tableSize ?? 0,
      vipCapacity: (e as unknown as { vipCapacity?: number }).vipCapacity ?? 0,
      maxGroupSize: (e as unknown as { maxGroupSize?: number }).maxGroupSize ?? 0,
      groupBookingEnabled: (e as unknown as { groupBookingEnabled?: boolean }).groupBookingEnabled ?? true,
      groupOffer: (e as unknown as { groupOffer?: string }).groupOffer ?? "",
      galleryImages: e.galleryImages ?? [],
      galleryVideos: e.galleryVideos ?? [],
      approvalStatus: e.approvalStatus,
      rejectionReason: e.rejectionReason ?? null,
      approvedAt: e.approvedAt ? e.approvedAt.toISOString() : null,
      rating: r.rating,
      reviewCount: r.reviewCount,
      vendorName: v?.businessName ?? "",
      partnerName: v?.businessName ?? "",
      createdAt: e.createdAt.toISOString(),
      hasDrinkPlans: vendorIdsWithPlans.has(e.vendorId),
      vendorCrowdLevel: (v as unknown as { crowdLevel?: string | null })?.crowdLevel ?? null,
      vendorCategory: v?.category ?? "",
    };
  });
}

router.get("/events", async (req, res) => {
  const parsedQ = ListEventsQueryParams.safeParse(req.query);
  if (!parsedQ.success) {
    respondInvalid(res, parsedQ.error, "Invalid query parameters");
    return;
  }
  const q = parsedQ.data;
  // Public, anonymous events catalog (approved only) — edge-cache so listing,
  // filter and pagination requests are served from Cloudflare, not the DB. Set
  // after validation so 400s aren't cached. Matches the featured/popular siblings.
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  const hasPage = q.page !== undefined;
  const conditions = [eq(eventsTable.approvalStatus, "approved")];
  if (q.category) conditions.push(eq(eventsTable.category, q.category));
  if (q.type) conditions.push(eq(eventsTable.type, q.type));
  if (q.state) conditions.push(ilike(eventsTable.state, `%${q.state}%`));
  if (q.city) conditions.push(ilike(eventsTable.city, `%${q.city}%`));
  if (q.country)
    conditions.push(ilike(eventsTable.country, `%${q.country}%`));
  if (q.minPrice) conditions.push(gte(eventsTable.price, q.minPrice));
  if (q.maxPrice) conditions.push(lte(eventsTable.price, q.maxPrice));
  if (q.search) {
    const s = `%${q.search}%`;
    const searchCond = or(
      ilike(eventsTable.title, s),
      ilike(eventsTable.description, s),
      ilike(eventsTable.city, s),
    );
    if (searchCond) conditions.push(searchCond);
  }
  if (q.drinkPlanType) {
    const vendorIdsWithPlan = await db
      .selectDistinct({ vendorId: drinkPlansTable.vendorId })
      .from(drinkPlansTable)
      .where(eq(drinkPlansTable.type, q.drinkPlanType));
    const ids = vendorIdsWithPlan.map((r) => r.vendorId);
    if (ids.length === 0) {
      if (hasPage) {
        const page = Math.max(1, q.page ?? 1);
        const limit = Math.min(50, Math.max(1, q.limit ?? 20));
        res.json({ data: [], page, limit, hasMore: false });
      } else {
        res.json([]);
      }
      return;
    }
    conditions.push(inArray(eventsTable.vendorId, ids));
  }

  if (hasPage) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(50, Math.max(1, q.limit ?? 20));
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
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
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

router.get("/events/popular", async (req, res) => {
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  const conditions = [eq(eventsTable.popular, true), eq(eventsTable.approvalStatus, "approved")];
  const country = req.query["country"] as string | undefined;
  const state = req.query["state"] as string | undefined;
  if (country) conditions.push(ilike(eventsTable.country, `%${country}%`));
  if (state) conditions.push(ilike(eventsTable.state, `%${state}%`));

  const rows = await db
    .select()
    .from(eventsTable)
    .where(and(...conditions))
    .orderBy(desc(eventsTable.createdAt))
    .limit(20);

  // If location-filtered results are fewer than 4, fall back to all popular events
  if (rows.length < 4 && (country || state)) {
    const fallback = await db
      .select()
      .from(eventsTable)
      .where(and(eq(eventsTable.popular, true), eq(eventsTable.approvalStatus, "approved")))
      .orderBy(desc(eventsTable.createdAt))
      .limit(20);
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
  // Public event detail — identical for all viewers. Edge-cache on the success
  // path only (the 400/404 returns above stay uncached).
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
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
          crowdLevel: (v as unknown as { crowdLevel?: string | null }).crowdLevel ?? null,
          danceFloor: (v as unknown as { danceFloor?: string | null }).danceFloor ?? null,
          danceFloorPhotos: (v as unknown as { danceFloorPhotos?: string[] | null }).danceFloorPhotos ?? [],
          menuUrl: (v as unknown as { menuUrl?: string | null }).menuUrl ?? "",
          menuUrls: (v as unknown as { menuUrls?: string[] | null }).menuUrls ?? [],
          baseFeePercent: v.baseFeePercent ?? "3.50",
          baseFeeEnabled: v.baseFeeEnabled ?? true,
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
  const {
    freeEntryForTable: rawFET, freeEntryForTableDays: rawFETD, freeEntryForTableBeforeTime: rawFETBT,
    // Happening Tonight fields — not in the generated zod schema, handled raw.
    startTime: rawStartTime, endTime: rawEndTime, happeningTonight: rawHT, startingSoon: rawSS,
    lastMinuteDeal: rawLMD, dealLabel: rawDealLabel,
    // Going Out With Friends — group-capacity fields, also handled raw.
    tableCount: rawTableCount, tableSize: rawTableSize, vipCapacity: rawVipCapacity,
    maxGroupSize: rawMaxGroup, groupBookingEnabled: rawGroupEnabled, groupOffer: rawGroupOffer,
    ...createCleanBody
  } = req.body as Record<string, unknown>;
  const parsed = CreateEventBody.safeParse(createCleanBody);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const data = parsed.data;
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
  const newType = data.type ?? "event";

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

  // An "enabled" free-entry rule with no genders or no days never matches any
  // booking — it just silently misleads the partner. Reject it here so neither
  // web nor mobile can persist a broken promotion.
  if (
    data.freeEntryRules?.enabled &&
    ((data.freeEntryRules.genders?.length ?? 0) === 0 ||
      (data.freeEntryRules.days?.length ?? 0) === 0)
  ) {
    res.status(400).json({ error: "Free entry needs at least one gender and at least one day." });
    return;
  }

  const [created] = await db
    .insert(eventsTable)
    .values({
      vendorId: vendor.id,
      title: data.title,
      description: data.description ?? "",
      category: data.category,
      type: newType,
      location: data.location ?? "",
      state: data.state ?? "",
      city: data.city ?? "",
      country: data.country ?? "India",
      price: String(data.price),
      capacity: data.capacity,
      imageUrl: data.imageUrl ?? "",
      pubMode: data.pubMode ?? "",
      priceWomen: data.priceWomen != null ? String(data.priceWomen) : "0",
      priceMen: data.priceMen != null ? String(data.priceMen) : "0",
      priceCouple: data.priceCouple != null ? String(data.priceCouple) : "0",
      pubEventTypes: data.pubEventTypes ?? [],
      disabledGenders: data.disabledGenders ?? [],
      dayPricing: data.dayPricing ?? null,
      freeEntryRules: data.freeEntryRules ?? null,
      freeEntryForTable: rawFET !== undefined ? Boolean(rawFET) : false,
      freeEntryForTableDays: Array.isArray(rawFETD) ? rawFETD : null,
      freeEntryForTableBeforeTime: rawFETBT ? String(rawFETBT) : null,
      startTime: rawStartTime ? String(rawStartTime) : "",
      endTime: rawEndTime ? String(rawEndTime) : "",
      happeningTonight: rawHT !== undefined ? Boolean(rawHT) : true,
      startingSoon: rawSS !== undefined ? Boolean(rawSS) : true,
      lastMinuteDeal: rawLMD !== undefined ? Boolean(rawLMD) : false,
      dealLabel: rawDealLabel ? String(rawDealLabel) : "",
      tableCount: rawTableCount != null ? Math.max(0, Math.trunc(Number(rawTableCount) || 0)) : 0,
      tableSize: rawTableSize != null ? Math.max(0, Math.trunc(Number(rawTableSize) || 0)) : 0,
      vipCapacity: rawVipCapacity != null ? Math.max(0, Math.trunc(Number(rawVipCapacity) || 0)) : 0,
      maxGroupSize: rawMaxGroup != null ? Math.max(0, Math.trunc(Number(rawMaxGroup) || 0)) : 0,
      groupBookingEnabled: rawGroupEnabled !== undefined ? Boolean(rawGroupEnabled) : true,
      groupOffer: rawGroupOffer ? String(rawGroupOffer) : "",
      galleryImages: data.galleryImages ?? null,
      galleryVideos: data.galleryVideos ?? null,
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
  const paramsParsed = UpdateEventParams.safeParse(req.params);
  if (!paramsParsed.success) {
    respondInvalid(res, paramsParsed.error);
    return;
  }
  const id = paramsParsed.data.eventId;
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
  const {
    freeEntryForTable: rawFET, freeEntryForTableDays: rawFETD, freeEntryForTableBeforeTime: rawFETBT,
    startTime: rawStartTime, endTime: rawEndTime, happeningTonight: rawHT, startingSoon: rawSS,
    lastMinuteDeal: rawLMD, dealLabel: rawDealLabel,
    tableCount: rawTableCount, tableSize: rawTableSize, vipCapacity: rawVipCapacity,
    maxGroupSize: rawMaxGroup, groupBookingEnabled: rawGroupEnabled, groupOffer: rawGroupOffer,
    ...patchCleanBody
  } = req.body as Record<string, unknown>;
  const parsed = UpdateEventBody.safeParse(patchCleanBody);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const data = parsed.data;
  const updates: Record<string, unknown> = {};
  if (data.title !== undefined) updates["title"] = data.title;
  if (data.description !== undefined) updates["description"] = data.description;
  if (data.category !== undefined) updates["category"] = data.category;
  if (data.location !== undefined) updates["location"] = data.location;
  if (data.imageUrl !== undefined) updates["imageUrl"] = data.imageUrl;
  if (data.state !== undefined) updates["state"] = data.state;
  if (data.city !== undefined) updates["city"] = data.city;
  if (data.country !== undefined) updates["country"] = data.country;
  if (data.pubMode !== undefined) updates["pubMode"] = data.pubMode;
  if (data.capacity !== undefined) updates["capacity"] = data.capacity;
  if (data.price !== undefined) updates["price"] = String(data.price);
  if (data.priceWomen !== undefined) updates["priceWomen"] = String(data.priceWomen);
  if (data.priceMen !== undefined) updates["priceMen"] = String(data.priceMen);
  if (data.priceCouple !== undefined) updates["priceCouple"] = String(data.priceCouple);
  if (data.pubEventTypes !== undefined) updates["pubEventTypes"] = data.pubEventTypes;
  if (data.disabledGenders !== undefined) updates["disabledGenders"] = data.disabledGenders;
  if (data.dayPricing !== undefined) updates["dayPricing"] = data.dayPricing;
  if (data.freeEntryRules !== undefined) {
    const fer = data.freeEntryRules;
    if (fer && fer.enabled && ((fer.genders?.length ?? 0) === 0 || (fer.days?.length ?? 0) === 0)) {
      res.status(400).json({ error: "Free entry needs at least one gender and at least one day." });
      return;
    }
    updates["freeEntryRules"] = fer;
  }
  if (data.galleryImages !== undefined) updates["galleryImages"] = data.galleryImages;
  if (data.galleryVideos !== undefined) updates["galleryVideos"] = data.galleryVideos;
  if (rawFET !== undefined) updates["freeEntryForTable"] = Boolean(rawFET);
  if (rawFETD !== undefined) updates["freeEntryForTableDays"] = rawFETD ?? null;
  if (rawFETBT !== undefined) updates["freeEntryForTableBeforeTime"] = rawFETBT ? String(rawFETBT) : null;
  if (rawStartTime !== undefined) updates["startTime"] = rawStartTime ? String(rawStartTime) : "";
  if (rawEndTime !== undefined) updates["endTime"] = rawEndTime ? String(rawEndTime) : "";
  if (rawHT !== undefined) updates["happeningTonight"] = Boolean(rawHT);
  if (rawSS !== undefined) updates["startingSoon"] = Boolean(rawSS);
  if (rawLMD !== undefined) updates["lastMinuteDeal"] = Boolean(rawLMD);
  if (rawDealLabel !== undefined) updates["dealLabel"] = rawDealLabel ? String(rawDealLabel) : "";
  if (rawTableCount !== undefined) updates["tableCount"] = Math.max(0, Math.trunc(Number(rawTableCount) || 0));
  if (rawTableSize !== undefined) updates["tableSize"] = Math.max(0, Math.trunc(Number(rawTableSize) || 0));
  if (rawVipCapacity !== undefined) updates["vipCapacity"] = Math.max(0, Math.trunc(Number(rawVipCapacity) || 0));
  if (rawMaxGroup !== undefined) updates["maxGroupSize"] = Math.max(0, Math.trunc(Number(rawMaxGroup) || 0));
  if (rawGroupEnabled !== undefined) updates["groupBookingEnabled"] = Boolean(rawGroupEnabled);
  if (rawGroupOffer !== undefined) updates["groupOffer"] = rawGroupOffer ? String(rawGroupOffer) : "";

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

// `bookings.event_id` is ON DELETE RESTRICT, so deleting an event while
// bookings still reference it FK-errors out as an unhandled 500. Wishlists
// have no FK but are cleaned up too so they don't dangle on a deleted event.
async function deleteEventCascade(id: number) {
  await db.transaction(async (tx) => {
    await tx.delete(bookingsTable).where(eq(bookingsTable.eventId, id));
    await tx.delete(wishlistsTable).where(eq(wishlistsTable.eventId, id));
    await tx.delete(eventsTable).where(eq(eventsTable.id, id));
  });
}

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
    try {
      await deleteEventCascade(id);
    } catch (err) {
      req.log.error({ err, eventId: id }, "Failed to delete event");
      res.status(500).json({ error: `Failed to delete event: ${err instanceof Error ? err.message : "Unknown error"}` });
      return;
    }
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
  try {
    await deleteEventCascade(id);
  } catch (err) {
    req.log.error({ err, eventId: id }, "Failed to delete event");
    res.status(500).json({ error: `Failed to delete event: ${err instanceof Error ? err.message : "Unknown error"}` });
    return;
  }
  if (imageUrl) { try { await objectStorage.deleteObject(imageUrl); } catch {} }
  res.json({ ok: true });
});

export default router;
