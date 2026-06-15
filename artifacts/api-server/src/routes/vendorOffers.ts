import { Router, type IRouter } from "express";
import { db, vendorOffersTable, vendorsTable, bookingsTable } from "@workspace/db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { respondInvalid } from "../lib/validationError";
import { isOfferActiveAt } from "../lib/offerActive";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Surface a DB / unexpected error as a useful JSON response instead of a bare 500.
 * Detects the common "table does not exist" case (the schema migration hasn't been
 * applied yet) and tells the operator exactly what to do.
 */
function dbErrorResponse(res: import("express").Response, scope: string, err: unknown): import("express").Response {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error({ err, scope }, `vendorOffers: ${scope} failed`);
  if (/relation .*"?vendor_offers"? does not exist/i.test(msg)) {
    return res.status(503).json({
      error:
        "The vendor_offers table is missing from the database. Run the migration first: " +
        "`pnpm --filter @workspace/db push` from a Railway-connected shell, or apply the CREATE TABLE SQL.",
    });
  }
  return res.status(500).json({ error: msg });
}

const DAY_ENUM = z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
const HHMM = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$|^$/, "Use HH:MM 24-hour or empty");

const OfferBody = z.object({
  category: z.enum(["food", "drink"]),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).default(""),
  discountType: z.enum(["percent", "fixed", "bogo", "free_item"]),
  discountValue: z.number().min(0).max(100000).default(0),
  freeItemName: z.string().max(120).default(""),
  days: z.array(DAY_ENUM).default([]),
  timeFrom: HHMM.default(""),
  timeTo: HHMM.default(""),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  active: z.boolean().default(true),
});

async function vendorIdForUser(userId: number): Promise<number | null> {
  const rows = await db
    .select({ id: vendorsTable.id })
    .from(vendorsTable)
    .where(eq(vendorsTable.userId, userId))
    .limit(1);
  return rows[0]?.id ?? null;
}

// Admins (Venues → Food & Drink Discounts) target a specific venue via
// ?vendorId=; partners always resolve to their own venue.
async function resolveVendorIdForReq(
  req: { query: Record<string, unknown> },
  user: { id: number; role: string },
): Promise<number | null> {
  if (user.role === "admin") {
    const raw = req.query["vendorId"];
    const n = raw != null ? Number(raw) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return vendorIdForUser(user.id);
}

// ─── Partner CRUD ─────────────────────────────────────────────────────────────

router.get("/partner/offers", requireAuth(["vendor", "admin"]), async (req, res) => {
  try {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const vendorId = await resolveVendorIdForReq(req, user);
    if (!vendorId) return res.status(403).json({ error: "No partner profile found." });
    const rows = await db
      .select()
      .from(vendorOffersTable)
      .where(eq(vendorOffersTable.vendorId, vendorId))
      .orderBy(desc(vendorOffersTable.createdAt));
    return res.json(rows);
  } catch (err) {
    return dbErrorResponse(res, "list partner offers", err);
  }
});

router.post("/partner/offers", requireAuth(["vendor", "admin"]), async (req, res) => {
  try {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const vendorId = await resolveVendorIdForReq(req, user);
    if (!vendorId) return res.status(403).json({ error: "No partner profile found." });

    const parsed = OfferBody.safeParse(req.body);
    if (!parsed.success) return respondInvalid(res, parsed.error);
    const d = parsed.data;

    // Free-item requires a label; bogo/free_item ignore numeric value.
    if (d.discountType === "free_item" && !d.freeItemName.trim()) {
      return res.status(400).json({ error: "Free-item offers need a free item name." });
    }
    if ((d.discountType === "percent" || d.discountType === "fixed") && d.discountValue <= 0) {
      return res.status(400).json({ error: "Discount value must be greater than zero." });
    }
    if (d.discountType === "percent" && d.discountValue > 100) {
      return res.status(400).json({ error: "Percent discount cannot exceed 100." });
    }

    // Duplicate check: same vendor, same category, same title (case-insensitive), same days+time
    const existing = await db
      .select({ id: vendorOffersTable.id })
      .from(vendorOffersTable)
      .where(and(
        eq(vendorOffersTable.vendorId, vendorId),
        eq(vendorOffersTable.category, d.category),
        sql`lower(${vendorOffersTable.title}) = lower(${d.title.trim()})`,
        eq(vendorOffersTable.timeFrom, d.timeFrom),
        eq(vendorOffersTable.timeTo, d.timeTo),
      ))
      .limit(1);
    if (existing.length > 0) {
      return res.status(409).json({
        error: `A ${d.category} offer with this title already exists for the same time slot. Please edit the existing offer or use a different title.`,
      });
    }

    const [created] = await db
      .insert(vendorOffersTable)
      .values({
        vendorId,
        category: d.category,
        title: d.title.trim(),
        description: d.description,
        discountType: d.discountType,
        discountValue: String(d.discountValue),
        freeItemName: d.freeItemName.trim(),
        days: d.days,
        timeFrom: d.timeFrom,
        timeTo: d.timeTo,
        startsAt: d.startsAt ? new Date(d.startsAt) : null,
        endsAt: d.endsAt ? new Date(d.endsAt) : null,
        active: d.active,
      })
      .returning();
    return res.status(201).json(created);
  } catch (err) {
    return dbErrorResponse(res, "create offer", err);
  }
});

router.patch("/partner/offers/:id", requireAuth(["vendor", "admin"]), async (req, res) => {
  try {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    const vendorId = await resolveVendorIdForReq(req, user);
    if (!vendorId) return res.status(403).json({ error: "No partner profile found." });

    const existing = await db
      .select()
      .from(vendorOffersTable)
      .where(and(eq(vendorOffersTable.id, id), eq(vendorOffersTable.vendorId, vendorId)))
      .limit(1);
    if (!existing[0]) return res.status(404).json({ error: "Offer not found." });

    const parsed = OfferBody.partial().safeParse(req.body);
    if (!parsed.success) return respondInvalid(res, parsed.error);
    const d = parsed.data;

    const [updated] = await db
      .update(vendorOffersTable)
      .set({
        ...(d.category !== undefined && { category: d.category }),
        ...(d.title !== undefined && { title: d.title.trim() }),
        ...(d.description !== undefined && { description: d.description }),
        ...(d.discountType !== undefined && { discountType: d.discountType }),
        ...(d.discountValue !== undefined && { discountValue: String(d.discountValue) }),
        ...(d.freeItemName !== undefined && { freeItemName: d.freeItemName.trim() }),
        ...(d.days !== undefined && { days: d.days }),
        ...(d.timeFrom !== undefined && { timeFrom: d.timeFrom }),
        ...(d.timeTo !== undefined && { timeTo: d.timeTo }),
        ...(d.startsAt !== undefined && { startsAt: d.startsAt ? new Date(d.startsAt) : null }),
        ...(d.endsAt !== undefined && { endsAt: d.endsAt ? new Date(d.endsAt) : null }),
        ...(d.active !== undefined && { active: d.active }),
        updatedAt: new Date(),
      })
      .where(and(eq(vendorOffersTable.id, id), eq(vendorOffersTable.vendorId, vendorId)))
      .returning();
    return res.json(updated);
  } catch (err) {
    return dbErrorResponse(res, "update offer", err);
  }
});

router.delete("/partner/offers/:id", requireAuth(["vendor", "admin"]), async (req, res) => {
  try {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    const vendorId = await resolveVendorIdForReq(req, user);
    if (!vendorId) return res.status(403).json({ error: "No partner profile found." });

    const [deleted] = await db
      .delete(vendorOffersTable)
      .where(and(eq(vendorOffersTable.id, id), eq(vendorOffersTable.vendorId, vendorId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Offer not found." });
    return res.json({ ok: true });
  } catch (err) {
    return dbErrorResponse(res, "delete offer", err);
  }
});

// ─── Public: all active drink offers across all vendors (for pub-offers page) ─
router.get("/vendors/all-drink-deals", async (_req, res) => {
  try {
    const now = new Date();
    const rows = await db
      .select({
        id: vendorOffersTable.id,
        vendorId: vendorOffersTable.vendorId,
        title: vendorOffersTable.title,
        description: vendorOffersTable.description,
        discountType: vendorOffersTable.discountType,
        discountValue: vendorOffersTable.discountValue,
        freeItemName: vendorOffersTable.freeItemName,
        days: vendorOffersTable.days,
        timeFrom: vendorOffersTable.timeFrom,
        timeTo: vendorOffersTable.timeTo,
        startsAt: vendorOffersTable.startsAt,
        endsAt: vendorOffersTable.endsAt,
        vendorName: vendorsTable.businessName,
        vendorLocation: vendorsTable.location,
        vendorCity: vendorsTable.city,
        vendorCoverImage: vendorsTable.bannerImage,
      })
      .from(vendorOffersTable)
      .innerJoin(vendorsTable, eq(vendorOffersTable.vendorId, vendorsTable.id))
      .where(and(
        eq(vendorOffersTable.active, true),
        eq(vendorOffersTable.category, "drink"),
        eq(vendorsTable.status, "approved"),
      ))
      .orderBy(desc(vendorOffersTable.createdAt));
    const live = rows.filter((o) => {
      if (o.startsAt && now < new Date(o.startsAt)) return false;
      if (o.endsAt && now > new Date(o.endsAt)) return false;
      return true;
    });
    return res.json(live);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/relation .*"?vendor_offers"? does not exist/i.test(msg)) return res.json([]);
    return dbErrorResponse(res, "all drink deals", err);
  }
});

// ─── Public: offers active right now for a vendor ────────────────────────────

router.get("/vendors/:vendorId/offers", async (req, res) => {
  try {
    const vendorId = Number(req.params["vendorId"]);
    if (!Number.isFinite(vendorId)) return res.status(400).json({ error: "Invalid vendorId" });
    const rows = await db
      .select()
      .from(vendorOffersTable)
      .where(and(eq(vendorOffersTable.vendorId, vendorId), eq(vendorOffersTable.active, true)))
      .orderBy(desc(vendorOffersTable.createdAt));
    // Show every active offer that is within its lifetime window. Day-of-week /
    // time-of-day are *displayed* on each card so customers browsing the venue
    // can plan a future visit — filtering them out at "right now" hid valid
    // offers from customers who weren't physically at the venue at that minute.
    const now = new Date();
    const live = rows.filter((o) => {
      if (o.startsAt && now < new Date(o.startsAt)) return false;
      if (o.endsAt && now > new Date(o.endsAt)) return false;
      return true;
    });
    return res.json(live);
  } catch (err) {
    // For the public endpoint, fall back silently to "no offers" if the table
    // is missing — keeps the customer-facing pub page rendering correctly even
    // before the migration has been applied. Other errors still 500 for visibility.
    const msg = err instanceof Error ? err.message : String(err);
    if (/relation .*"?vendor_offers"? does not exist/i.test(msg)) return res.json([]);
    return dbErrorResponse(res, "public offers list", err);
  }
});

// ─── Partner analytics: usage + revenue per offer ─────────────────────────────
// Impression-based: a booking is "attributed" to an offer if the booking's
// createdAt would have seen the offer active (validity + day + time match).
// Revenue uses bookingsTable.finalPrice.

router.get("/partner/offers/analytics", requireAuth(["vendor", "admin"]), async (req, res) => {
  try {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const vendorId = await resolveVendorIdForReq(req, user);
    if (!vendorId) return res.status(403).json({ error: "No partner profile found." });

    const windowDays = Math.min(Math.max(Number(req.query["window"]) || 30, 1), 365);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const [offers, bookings] = await Promise.all([
      db.select().from(vendorOffersTable).where(eq(vendorOffersTable.vendorId, vendorId)),
      db
        .select({
          id: bookingsTable.id,
          createdAt: bookingsTable.createdAt,
          finalPrice: bookingsTable.finalPrice,
          status: bookingsTable.status,
        })
        .from(bookingsTable)
        .where(and(eq(bookingsTable.vendorId, vendorId), gte(bookingsTable.createdAt, since))),
    ]);

    // Ignore cancelled/failed bookings in conversion + revenue.
    const counted = bookings.filter((b) => b.status !== "cancelled" && b.status !== "failed");

    const perOffer = offers.map((o) => {
      const matching = counted.filter((b) => isOfferActiveAt(o, new Date(b.createdAt)));
      const revenue = matching.reduce((sum, b) => sum + Number(b.finalPrice || 0), 0);
      return {
        id: o.id,
        title: o.title,
        category: o.category,
        discountType: o.discountType,
        discountValue: Number(o.discountValue),
        active: o.active,
        bookings: matching.length,
        revenue,
      };
    });

    const activeCount = offers.filter((o) => o.active).length;
    const bookingsDuringOffers = perOffer.reduce((s, x) => s + x.bookings, 0);
    const totalRevenue = perOffer.reduce((s, x) => s + x.revenue, 0);
    const top = perOffer.slice().sort((a, b) => b.bookings - a.bookings)[0] ?? null;

    return res.json({
      windowDays,
      activeCount,
      bookingsDuringOffers,
      totalRevenue,
      top,
      perOffer,
    });
  } catch (err) {
    // Analytics is a soft dependency on a freshly-pushed table — degrade gracefully
    // so the dashboard panels render zeros rather than failing the entire tab.
    const msg = err instanceof Error ? err.message : String(err);
    if (/relation .*"?vendor_offers"? does not exist/i.test(msg)) {
      return res.json({
        windowDays: Number(req.query["window"]) || 30,
        activeCount: 0,
        bookingsDuringOffers: 0,
        totalRevenue: 0,
        top: null,
        perOffer: [],
        warning: "vendor_offers table not yet provisioned",
      });
    }
    return dbErrorResponse(res, "offers analytics", err);
  }
});

// Admin: create a drink/food offer for any vendor by vendorId (seeding / support).
router.post("/admin/vendor-offers/seed", requireAuth(["admin"]), async (req, res) => {
  try {
    const AdminOfferBody = OfferBody.extend({ vendorId: z.number().int() });
    const parsed = AdminOfferBody.safeParse(req.body);
    if (!parsed.success) return respondInvalid(res, parsed.error);
    const { vendorId, ...d } = parsed.data;
    if (d.discountType === "free_item" && !d.freeItemName.trim()) {
      return res.status(400).json({ error: "Free-item offers need a free item name." });
    }
    if ((d.discountType === "percent" || d.discountType === "fixed") && d.discountValue <= 0) {
      return res.status(400).json({ error: "Discount value must be greater than zero." });
    }
    const [created] = await db.insert(vendorOffersTable).values({
      vendorId,
      category: d.category,
      title: d.title.trim(),
      description: d.description,
      discountType: d.discountType,
      discountValue: String(d.discountValue),
      freeItemName: d.freeItemName.trim(),
      days: d.days,
      timeFrom: d.timeFrom,
      timeTo: d.timeTo,
      startsAt: d.startsAt ? new Date(d.startsAt) : null,
      endsAt: d.endsAt ? new Date(d.endsAt) : null,
      active: d.active,
    }).returning();
    return res.status(201).json(created);
  } catch (err) {
    return dbErrorResponse(res, "admin seed offer", err);
  }
});

export default router;
