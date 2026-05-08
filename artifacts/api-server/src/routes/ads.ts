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
} from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
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
          eq(vendorsTable.isPremium, true),
        ),
      )
      .limit(8);
    return res.json(premiumPartners);
  }
  const vendors = await db.select().from(vendorsTable);
  const filtered = vendors.filter(
    (v) => vendorIds.includes(v.id) && v.status === "approved",
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
  requireAuth(["vendor"]),
  async (req, res) => {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const vendor = await getMyVendor(user.id);
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
    const crmAccessGranted = vendor.isPremium || crmTrialActive;

    if (!crmAccessGranted) {
      return res.json({
        premium: vendor.isPremium,
        crmAccessGranted: false,
        crmTrialActive: false,
        crmTrialDaysRemaining: 0,
        views: [],
        message:
          "Your 2-month free CRM trial has ended. Upgrade to Partner Premium to keep your leads.",
      });
    }

    // Pull all views for THIS vendor only — scoping is enforced by the
     // vendorId equality filter, never widen.
    const rows = await db
      .select()
      .from(profileViewsTable)
      .where(eq(profileViewsTable.vendorId, vendor.id))
      .orderBy(desc(profileViewsTable.viewedAt))
      .limit(2000);

    // Collect known viewer user IDs
    const ids = Array.from(
      new Set(rows.map((r) => r.viewerUserId).filter((x): x is number => !!x)),
    );

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

    // Aggregate views per visitor:
    //   - Each known viewer (viewerUserId !== null) collapses to ONE row,
    //     carrying visitCount + lastViewedAt.
    //   - Anonymous views collapse to a single synthetic row with the total
    //     anon visit count.
    type Aggregated = {
      id: number;                 // latest profileViewId — used by send-discount
      viewerUserId: number | null;
      viewerName: string;
      viewerEmail: string;
      phone: string;
      visitCount: number;
      lastViewedAt: Date;
      viewedAt: Date;             // alias of lastViewedAt for back-compat
      hasBooked: boolean;
      existingCode: string | null;
    };
    const knownMap = new Map<number, Aggregated>();
    let anonCount = 0;
    let anonLatestRow: typeof rows[number] | null = null;

    for (const r of rows) {
      if (r.viewerUserId) {
        const existing = knownMap.get(r.viewerUserId);
        if (existing) {
          existing.visitCount += 1;
          // rows are already DESC by viewedAt, so we keep the first id we saw
          continue;
        }
        const u = uMap.get(r.viewerUserId);
        knownMap.set(r.viewerUserId, {
          id: r.id,
          viewerUserId: r.viewerUserId,
          viewerName: u?.name ?? r.viewerName ?? "Anonymous",
          viewerEmail: u?.email ?? r.viewerEmail ?? "",
          phone: u?.phone ?? "",
          visitCount: 1,
          lastViewedAt: r.viewedAt,
          viewedAt: r.viewedAt,
          hasBooked: bookedUserIds.has(r.viewerUserId),
          existingCode: existingCouponMap.get(r.viewerUserId) ?? null,
        });
      } else {
        anonCount += 1;
        if (!anonLatestRow) anonLatestRow = r;
      }
    }

    const knownViews = Array.from(knownMap.values()).sort(
      (a, b) => b.lastViewedAt.getTime() - a.lastViewedAt.getTime(),
    );
    const anonView: Aggregated[] =
      anonCount > 0 && anonLatestRow
        ? [
            {
              id: anonLatestRow.id,
              viewerUserId: null,
              viewerName: "Anonymous",
              viewerEmail: "",
              phone: "",
              visitCount: anonCount,
              lastViewedAt: anonLatestRow.viewedAt,
              viewedAt: anonLatestRow.viewedAt,
              hasBooked: false,
              existingCode: null,
            },
          ]
        : [];

    const views = [...knownViews, ...anonView];

    return res.json({
      premium: vendor.isPremium,
      crmAccessGranted: true,
      crmTrialActive,
      crmTrialDaysRemaining,
      // Total profile views (sum of visit counts across all aggregated rows).
      totalViews: views.reduce((sum, v) => sum + v.visitCount, 0),
      bookedCount: views.filter((v) => v.hasBooked).length,
      views,
    });
  },
);

const SendDiscountBody = z.object({
  discountPercent: z.number().int().min(5).max(50).default(15),
});

router.post(
  "/partner/leads/:profileViewId/send-discount",
  requireAuth(["vendor"]),
  async (req, res) => {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const vendor = await getMyVendor(user.id);
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
