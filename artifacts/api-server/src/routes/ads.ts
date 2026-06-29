import { Router, type IRouter } from "express";
import {
  db,
  adsRequestsTable,
  vendorsTable,
  profileViewsTable,
  usersTable,
  couponsTable,
  bookingsTable,
  eventsTable,
  organizerEventsTable,
  organizersTable,
  eventTicketsTable,
} from "@workspace/db";
import { eq, desc, and, inArray, sql, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { respondInvalid } from "../lib/validationError";

async function genUniqueCode(prefix: string, maxAttempts = 8): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = `${prefix}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const existing = await db.select({ id: couponsTable.id }).from(couponsTable).where(eq(couponsTable.code, code)).limit(1);
    if (!existing.length) return code;
  }
  throw new Error("Could not generate unique code");
}

const router: IRouter = Router();

async function getMyVendor(userId: number) {
  const rows = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

// Admins (Venues → Leads) target a specific venue via ?vendorId=; partners
// always resolve to their own venue.
async function resolveLeadsVendor(
  req: { query: Record<string, unknown> },
  user: { id: number; role: string },
) {
  if (user.role === "admin") {
    const raw = req.query["vendorId"];
    const n = raw != null ? Number(raw) : NaN;
    if (Number.isFinite(n)) {
      const rows = await db.select().from(vendorsTable).where(eq(vendorsTable.id, n)).limit(1);
      return rows[0] ?? null;
    }
  }
  return getMyVendor(user.id);
}

router.post(
  "/partner/ads/request",
  requireAuth(["vendor"]),
  async (req, res) => {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const vendor = await getMyVendor(user.id);
    if (!vendor)
      return res.status(400).json({ error: "Partner profile required" });
    const parsed = z
      .object({ message: z.string().optional().default("") })
      .safeParse(req.body);
    if (!parsed.success)
      return respondInvalid(res, parsed.error);
    const [r] = await db
      .insert(adsRequestsTable)
      .values({
        vendorId: vendor.id,
        message: parsed.data.message ?? "",
        status: "pending",
      })
      .returning();
    return res.json(r);
  },
);

router.get(
  "/partner/ads/me",
  requireAuth(["vendor"]),
  async (req, res) => {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const vendor = await getMyVendor(user.id);
    if (!vendor) return res.json([]);
    const rows = await db
      .select()
      .from(adsRequestsTable)
      .where(eq(adsRequestsTable.vendorId, vendor.id))
      .orderBy(desc(adsRequestsTable.createdAt));
    return res.json(rows);
  },
);

router.get("/admin/ads", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(adsRequestsTable)
    .orderBy(desc(adsRequestsTable.createdAt));
  if (rows.length === 0) return res.json([]);
  const vendors = await db.select().from(vendorsTable);
  const vMap = new Map(vendors.map((v) => [v.id, v]));
  return res.json(
    rows.map((r) => ({
      ...r,
      vendorName: vMap.get(r.vendorId)?.businessName ?? "",
    })),
  );
});

router.post(
  "/admin/ads/:id/approve",
  requireAuth(["admin"]),
  async (req, res) => {
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id))
      return res.status(400).json({ error: "Invalid id" });
    const [updated] = await db
      .update(adsRequestsTable)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(adsRequestsTable.id, id))
      .returning();
    return res.json(updated);
  },
);

router.post(
  "/admin/ads/:id/reject",
  requireAuth(["admin"]),
  async (req, res) => {
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id))
      return res.status(400).json({ error: "Invalid id" });
    const [updated] = await db
      .update(adsRequestsTable)
      .set({ status: "rejected" })
      .where(eq(adsRequestsTable.id, id))
      .returning();
    return res.json(updated);
  },
);

// Public: list popular partners with currently approved ads
router.get("/partners/popular", async (_req, res) => {
  const ads = await db
    .select()
    .from(adsRequestsTable)
    .where(eq(adsRequestsTable.status, "approved"));
  const vendorIds = Array.from(new Set(ads.map((a) => a.vendorId)));
  if (vendorIds.length === 0) {
    // fallback: return premium partners
    const premiumPartners = await db
      .select()
      .from(vendorsTable)
      .where(
        and(
          eq(vendorsTable.status, "approved"),
          eq(vendorsTable.hidden, false),
          eq(vendorsTable.isPremium, true),
        ),
      )
      .limit(8);
    return res.json(premiumPartners);
  }
  const vendors = await db.select().from(vendorsTable);
  const filtered = vendors.filter(
    (v) => vendorIds.includes(v.id) && v.status === "approved" && !v.hidden,
  );
  return res.json(filtered);
});

// Track profile view (optional auth — captures viewer if logged in).
// Self-views (the partner viewing their own pub) are dropped server-side so
// the leads list is never polluted by the owner's own page loads. Doing the
// check here — rather than only on the client — eliminates auth-load races
// where the client doesn't yet know who `me` is when the page first mounts.
router.post("/partners/:vendorId/view", async (req, res) => {
  const id = Number(req.params["vendorId"]);
  if (!Number.isFinite(id))
    return res.status(400).json({ error: "Invalid id" });
  const user = await loadUserFromRequest(req);
  if (user) {
    const vendorRow = await db
      .select({ userId: vendorsTable.userId })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, id))
      .limit(1);
    if (vendorRow[0]?.userId === user.id) {
      return res.json({ ok: true, skipped: "self" });
    }
  }
  await db.insert(profileViewsTable).values({
    vendorId: id,
    viewerUserId: user?.id ?? null,
    viewerName: user?.name ?? "",
    viewerEmail: user?.email ?? "",
  });
  return res.json({ ok: true });
});

const CRM_TRIAL_DAYS = 60;

router.get(
  "/partner/leads/me",
  requireAuth(["vendor", "admin"]),
  async (req, res) => {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const vendor = await resolveLeadsVendor(req, user);
    if (!vendor) {
      return res.json({
        premium: false,
        crmAccessGranted: false,
        crmTrialActive: false,
        crmTrialDaysRemaining: 0,
        views: [],
      });
    }

    // Trial starts from approvedAt (set when admin approves), falling back to createdAt
    const trialStart = vendor.approvedAt ?? vendor.createdAt;
    const daysSinceTrialStart =
      (Date.now() - trialStart.getTime()) / (1000 * 60 * 60 * 24);
    const crmTrialDaysRemaining = Math.max(
      0,
      Math.ceil(CRM_TRIAL_DAYS - daysSinceTrialStart),
    );
    const crmTrialActive = crmTrialDaysRemaining > 0;
    const crmAccessGranted = true;

    // Aggregate at the DB so totals stay accurate as history grows.
    // Known viewers: one row per viewerUserId with visitCount + lastViewedAt.
    const knownAgg = await db
      .select({
        viewerUserId: profileViewsTable.viewerUserId,
        visitCount: sql<number>`count(*)::int`.as("visit_count"),
        lastViewedAt: sql<Date>`max(${profileViewsTable.viewedAt})`.as("last_viewed_at"),
        latestId: sql<number>`max(${profileViewsTable.id})`.as("latest_id"),
      })
      .from(profileViewsTable)
      .where(
        and(
          eq(profileViewsTable.vendorId, vendor.id),
          sql`${profileViewsTable.viewerUserId} is not null`,
        ),
      )
      .groupBy(profileViewsTable.viewerUserId);

    // Anonymous bucket: a single synthetic row carrying the total anon count.
    const [anonAgg] = await db
      .select({
        visitCount: sql<number>`count(*)::int`.as("visit_count"),
        lastViewedAt: sql<Date>`max(${profileViewsTable.viewedAt})`.as("last_viewed_at"),
        latestId: sql<number>`max(${profileViewsTable.id})`.as("latest_id"),
      })
      .from(profileViewsTable)
      .where(
        and(
          eq(profileViewsTable.vendorId, vendor.id),
          isNull(profileViewsTable.viewerUserId),
        ),
      );
    const anonCount = anonAgg?.visitCount ?? 0;
    const anonLatest = anonAgg && anonCount > 0
      ? { id: anonAgg.latestId, viewedAt: anonAgg.lastViewedAt }
      : null;

    const ids = knownAgg
      .map((r) => r.viewerUserId)
      .filter((x): x is number => !!x);

    // Fetch user details for enrichment (name, email, phone)
    const users = ids.length
      ? await db.select().from(usersTable).where(inArray(usersTable.id, ids))
      : [];
    const uMap = new Map(users.map((u) => [u.id, u]));

    // Pre-load any partner_lead coupons already sent to these viewers by this vendor
    const existingCouponMap = new Map<number, string>();
    if (ids.length) {
      const existingCoupons = await db
        .select({ userId: couponsTable.userId, code: couponsTable.code })
        .from(couponsTable)
        .where(
          and(
            inArray(couponsTable.userId, ids),
            eq(couponsTable.vendorId, vendor.id),
            eq(couponsTable.source, "partner_lead"),
            eq(couponsTable.used, false),
          ),
        );
      existingCoupons.forEach((c) => existingCouponMap.set(c.userId, c.code));
    }

    // Determine which known viewers have already booked one of THIS vendor's
    // events. We only join on this vendor's eventIds, so bookings at other
    // partners never leak into the count.
    const bookedUserIds = new Set<number>();
    if (ids.length) {
      const vendorEvents = await db
        .select({ id: eventsTable.id })
        .from(eventsTable)
        .where(eq(eventsTable.vendorId, vendor.id));
      const eventIds = vendorEvents.map((e) => e.id);
      if (eventIds.length) {
        const bookedRows = await db
          .select({ userId: bookingsTable.userId })
          .from(bookingsTable)
          .where(
            and(
              inArray(bookingsTable.userId, ids),
              inArray(bookingsTable.eventId, eventIds),
            ),
          );
        bookedRows.forEach((b) => bookedUserIds.add(b.userId));
      }
    }

    type Aggregated = {
      id: number;
      viewerUserId: number | null;
      viewerName: string;
      viewerEmail: string;
      phone: string;
      visitCount: number;
      lastViewedAt: Date;
      viewedAt: Date;
      hasBooked: boolean;
      existingCode: string | null;
    };

    const knownViews: Aggregated[] = knownAgg
      .map((r) => {
        const uid = r.viewerUserId as number;
        const u = uMap.get(uid);
        return {
          id: r.latestId,
          viewerUserId: uid,
          viewerName: u?.name ?? "Anonymous",
          viewerEmail: u?.email ?? "",
          phone: u?.phone ?? "",
          visitCount: r.visitCount,
          lastViewedAt: r.lastViewedAt,
          viewedAt: r.lastViewedAt,
          hasBooked: bookedUserIds.has(uid),
          existingCode: existingCouponMap.get(uid) ?? null,
        };
      })
      .sort((a, b) => b.lastViewedAt.getTime() - a.lastViewedAt.getTime());

    const anonView: Aggregated[] = anonLatest
      ? [{
          id: anonLatest.id,
          viewerUserId: null,
          viewerName: "Anonymous",
          viewerEmail: "",
          phone: "",
          visitCount: anonCount,
          lastViewedAt: anonLatest.viewedAt,
          viewedAt: anonLatest.viewedAt,
          hasBooked: false,
          existingCode: null,
        }]
      : [];

    const views = [...knownViews, ...anonView];

    return res.json({
      premium: vendor.isPremium,
      crmAccessGranted: true,
      crmTrialActive,
      crmTrialDaysRemaining,
      totalViews: views.reduce((sum, v) => sum + v.visitCount, 0),
      bookedCount: views.filter((v) => v.hasBooked).length,
      views,
    });
  },
);

// ── Top events leads ─────────────────────────────────────────────────────────
// Surfaces the most successful ticketed events (ranked by total tickets sold)
// so a pub/club/bar/lounge partner can find high-performing organizers to host.
// Two buckets: events in the partner's own state, and events across the country.
const soldExpr = sql<number>`coalesce(sum(${eventTicketsTable.soldCount}), 0)::int`;

async function topEventsByLocation(field: "state" | "country", value: string) {
  if (!value) return [];
  const col =
    field === "state" ? organizerEventsTable.state : organizerEventsTable.country;
  return db
    .select({
      eventId: organizerEventsTable.id,
      title: organizerEventsTable.title,
      slug: organizerEventsTable.slug,
      coverImageUrl: organizerEventsTable.coverImageUrl,
      venueName: organizerEventsTable.venueName,
      city: organizerEventsTable.city,
      state: organizerEventsTable.state,
      country: organizerEventsTable.country,
      startDate: organizerEventsTable.startDate,
      organizerId: organizersTable.id,
      organizerName: organizersTable.name,
      organizerSlug: organizersTable.slug,
      organizerCity: organizersTable.city,
      organizerState: organizersTable.state,
      supportEmail: organizersTable.supportEmail,
      supportPhone: organizersTable.supportPhone,
      website: organizersTable.website,
      instagram: organizersTable.instagram,
      verified: organizersTable.verified,
      ticketsSold: soldExpr.as("tickets_sold"),
    })
    .from(organizerEventsTable)
    .innerJoin(
      organizersTable,
      eq(organizersTable.id, organizerEventsTable.organizerId),
    )
    .leftJoin(
      eventTicketsTable,
      eq(eventTicketsTable.eventId, organizerEventsTable.id),
    )
    .where(
      and(
        eq(organizerEventsTable.approvalStatus, "approved"),
        eq(col, value),
      ),
    )
    .groupBy(organizerEventsTable.id, organizersTable.id)
    .having(sql`coalesce(sum(${eventTicketsTable.soldCount}), 0) > 0`)
    .orderBy(desc(soldExpr))
    .limit(20);
}

router.get(
  "/partner/leads/top-events",
  requireAuth(["vendor", "admin"]),
  async (req, res) => {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const vendor = await resolveLeadsVendor(req, user);
    if (!vendor) {
      return res.json({ state: "", country: "", stateEvents: [], countryEvents: [] });
    }
    const stateName = vendor.state ?? "";
    const countryName = vendor.country ?? "";
    const [stateEvents, countryEvents] = await Promise.all([
      topEventsByLocation("state", stateName),
      topEventsByLocation("country", countryName),
    ]);
    return res.json({
      state: stateName,
      country: countryName,
      stateEvents,
      countryEvents,
    });
  },
);

const SendDiscountBody = z.object({
  discountPercent: z.number().int().min(5).max(50).default(15),
});

router.post(
  "/partner/leads/:profileViewId/send-discount",
  requireAuth(["vendor", "admin"]),
  async (req, res) => {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const vendor = await resolveLeadsVendor(req, user);
    if (!vendor) return res.status(400).json({ error: "Partner profile required" });

    const profileViewId = Number(req.params["profileViewId"]);
    if (!Number.isFinite(profileViewId)) return res.status(400).json({ error: "Invalid id" });

    const viewRows = await db
      .select()
      .from(profileViewsTable)
      .where(and(eq(profileViewsTable.id, profileViewId), eq(profileViewsTable.vendorId, vendor.id)))
      .limit(1);
    const view = viewRows[0];
    if (!view) return res.status(404).json({ error: "Lead not found" });
    if (!view.viewerUserId) return res.status(400).json({ error: "This visitor is anonymous and has no account to receive a code" });

    const parsed = SendDiscountBody.safeParse(req.body);
    if (!parsed.success) return respondInvalid(res, parsed.error);

    const code = await genUniqueCode("PUB");
    const [coupon] = await db
      .insert(couponsTable)
      .values({
        userId: view.viewerUserId,
        code,
        discountPercent: parsed.data.discountPercent,
        source: "partner_lead",
        vendorId: vendor.id,
      })
      .returning();
    return res.json({ code: coupon.code, discountPercent: coupon.discountPercent });
  },
);

export default router;
