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
  announcementsTable,
} from "@workspace/db";
import { eq, desc, and, inArray, sql, isNull } from "drizzle-orm";
import { z } from "zod";
import { randomInt } from "crypto";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { respondInvalid } from "../lib/validationError";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

async function genUniqueCode(prefix: string, maxAttempts = 8): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = `${prefix}-${randomCode(8)}`;
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
// Includes both organizer events (ranked by ticket sold_count) and venue
// announcements (ranked by booking count). Results are merged and sorted.
//
// Uses raw SQL via db.execute() to avoid Drizzle ORM sql-fragment stitching
// issues that caused the state filter to silently drop.
function extractRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const r = result as any;
  if (r?.rows && Array.isArray(r.rows)) return r.rows as Record<string, unknown>[];
  return [];
}

async function topEventsByLocation(field: "state" | "country", value: string) {
  if (!value) return [];

  const orgLocSql =
    field === "state"
      ? sql`(e.state ILIKE ${value} OR TRIM(e.state) = '' OR e.state IS NULL)`
      : sql`e.country ILIKE ${value}`;

  const venLocSql =
    field === "state"
      ? sql`v.state ILIKE ${value}`
      : sql`v.country ILIKE ${value}`;

  const [orgResult, venResult] = await Promise.all([
    db.execute(sql`
      SELECT
        e.id                                AS "eventId",
        e.title,
        e.slug,
        e.cover_image_url                   AS "coverImageUrl",
        e.venue_name                        AS "venueName",
        e.city,
        e.state,
        e.country,
        e.start_date::text                  AS "startDate",
        e.category,
        'organizer'                         AS "sourceType",
        o.id                                AS "organizerId",
        o.name                              AS "organizerName",
        o.slug                              AS "organizerSlug",
        o.city                              AS "organizerCity",
        o.state                             AS "organizerState",
        o.support_email                     AS "supportEmail",
        o.support_phone                     AS "supportPhone",
        o.website,
        o.instagram,
        o.verified,
        COALESCE(SUM(t.sold_count), 0)::int AS "ticketsSold"
      FROM organizer_events e
      JOIN organizers o ON o.id = e.organizer_id
      LEFT JOIN event_tickets t ON t.event_id = e.id
      WHERE e.approval_status <> 'rejected'
        AND ${orgLocSql}
        AND (o.hidden IS NOT TRUE)
      GROUP BY e.id, o.id
      HAVING COALESCE(SUM(t.sold_count), 0) > 0
      ORDER BY "ticketsSold" DESC
      LIMIT 20
    `),
    db.execute(sql`
      SELECT
        a.id                    AS "eventId",
        a.title,
        ''                      AS slug,
        a.image_url             AS "coverImageUrl",
        v.business_name         AS "venueName",
        v.city,
        v.state,
        v.country,
        a.announce_date         AS "startDate",
        a.event_type            AS category,
        'venue'                 AS "sourceType",
        NULL::int               AS "organizerId",
        v.business_name         AS "organizerName",
        ''                      AS "organizerSlug",
        v.city                  AS "organizerCity",
        v.state                 AS "organizerState",
        ''                      AS "supportEmail",
        ''                      AS "supportPhone",
        ''                      AS website,
        ''                      AS instagram,
        false                   AS verified,
        COUNT(b.id)::int        AS "ticketsSold"
      FROM announcements a
      JOIN vendors v ON v.id = a.vendor_id
      LEFT JOIN bookings b ON b.announcement_id = a.id
      WHERE a.approval_status <> 'rejected'
        AND ${venLocSql}
        AND v.hidden = false
      GROUP BY a.id, v.id
      HAVING COUNT(b.id) > 0
      ORDER BY "ticketsSold" DESC
      LIMIT 20
    `),
  ]);

  const combined = [...extractRows(orgResult), ...extractRows(venResult)];
  combined.sort((a, b) => (Number(b.ticketsSold) || 0) - (Number(a.ticketsSold) || 0));
  return combined.slice(0, 20);
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
    const stateName = (vendor.state ?? "").trim();
    const countryName = ((vendor.country ?? "").trim()) || "India";
    // If the vendor has no state set, fall back to country-level events for the
    // state tab so the partner still sees ranked events rather than an empty list.
    const [stateEvents, countryEvents] = await Promise.all([
      stateName
        ? topEventsByLocation("state", stateName)
        : topEventsByLocation("country", countryName),
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

// ── Organizer history (for Leads "click organizer name" drill-down) ──────────
// Returns the organizer's profile + their last 12 months of events.
// Available to venue partners and admins so they can evaluate who to host.
router.get(
  "/partner/organizer-history/:organizerId",
  requireAuth(["vendor", "admin"]),
  async (req, res) => {
    const id = Number(req.params["organizerId"]);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const cutoff = oneYearAgo.toISOString().split("T")[0]; // "YYYY-MM-DD"

    const [orgRows, eventRows] = await Promise.all([
      db
        .select({
          id: organizersTable.id,
          name: organizersTable.name,
          slug: organizersTable.slug,
          logoUrl: organizersTable.logoUrl,
          city: organizersTable.city,
          state: organizersTable.state,
          verified: organizersTable.verified,
          supportEmail: organizersTable.supportEmail,
          supportPhone: organizersTable.supportPhone,
          website: organizersTable.website,
          instagram: organizersTable.instagram,
        })
        .from(organizersTable)
        .where(eq(organizersTable.id, id))
        .limit(1),

      db
        .select({
          id: organizerEventsTable.id,
          title: organizerEventsTable.title,
          slug: organizerEventsTable.slug,
          coverImageUrl: organizerEventsTable.coverImageUrl,
          venueName: organizerEventsTable.venueName,
          city: organizerEventsTable.city,
          state: organizerEventsTable.state,
          startDate: organizerEventsTable.startDate,
          category: organizerEventsTable.category,
          approvalStatus: organizerEventsTable.approvalStatus,
        })
        .from(organizerEventsTable)
        .where(
          and(
            eq(organizerEventsTable.organizerId, id),
            sql`${organizerEventsTable.approvalStatus} <> 'rejected'`,
            sql`(${organizerEventsTable.startDate} IS NULL OR ${organizerEventsTable.startDate} >= ${cutoff}::date)`,
          ),
        )
        .orderBy(desc(organizerEventsTable.startDate))
        .limit(50),
    ]);

    const organizer = orgRows[0];
    if (!organizer) return res.status(404).json({ error: "Organizer not found" });
    return res.json({ organizer, events: eventRows });
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
