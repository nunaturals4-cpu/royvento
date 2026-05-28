import { Router, type IRouter } from "express";
import { db, vendorOffersTable, vendorsTable, bookingsTable } from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { respondInvalid } from "../lib/validationError";
import { isOfferActiveAt } from "../lib/offerActive";

const router: IRouter = Router();

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

// ─── Partner CRUD ─────────────────────────────────────────────────────────────

router.get("/partner/offers", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const vendorId = await vendorIdForUser(user.id);
  if (!vendorId) return res.status(403).json({ error: "No partner profile found." });
  const rows = await db
    .select()
    .from(vendorOffersTable)
    .where(eq(vendorOffersTable.vendorId, vendorId))
    .orderBy(desc(vendorOffersTable.createdAt));
  return res.json(rows);
});

router.post("/partner/offers", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const vendorId = await vendorIdForUser(user.id);
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
});

router.patch("/partner/offers/:id", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const vendorId = await vendorIdForUser(user.id);
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
});

router.delete("/partner/offers/:id", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const vendorId = await vendorIdForUser(user.id);
  if (!vendorId) return res.status(403).json({ error: "No partner profile found." });

  const [deleted] = await db
    .delete(vendorOffersTable)
    .where(and(eq(vendorOffersTable.id, id), eq(vendorOffersTable.vendorId, vendorId)))
    .returning();
  if (!deleted) return res.status(404).json({ error: "Offer not found." });
  return res.json({ ok: true });
});

// ─── Public: offers active right now for a vendor ────────────────────────────

router.get("/vendors/:vendorId/offers", async (req, res) => {
  const vendorId = Number(req.params["vendorId"]);
  if (!Number.isFinite(vendorId)) return res.status(400).json({ error: "Invalid vendorId" });
  const rows = await db
    .select()
    .from(vendorOffersTable)
    .where(and(eq(vendorOffersTable.vendorId, vendorId), eq(vendorOffersTable.active, true)))
    .orderBy(desc(vendorOffersTable.createdAt));
  const now = new Date();
  const live = rows.filter((o) => isOfferActiveAt(o, now));
  return res.json(live);
});

// ─── Partner analytics: usage + revenue per offer ─────────────────────────────
// Impression-based: a booking is "attributed" to an offer if the booking's
// createdAt would have seen the offer active (validity + day + time match).
// Revenue uses bookingsTable.finalPrice.

router.get("/partner/offers/analytics", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const vendorId = await vendorIdForUser(user.id);
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
});

export default router;
