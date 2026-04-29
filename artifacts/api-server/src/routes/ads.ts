import { Router, type IRouter } from "express";
import {
  db,
  adsRequestsTable,
  vendorsTable,
  profileViewsTable,
  usersTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";

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
      return res.status(400).json({ error: "Invalid input" });
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

// Track profile view (optional auth — captures viewer if logged in)
router.post("/partners/:vendorId/view", async (req, res) => {
  const id = Number(req.params["vendorId"]);
  if (!Number.isFinite(id))
    return res.status(400).json({ error: "Invalid id" });
  const user = await loadUserFromRequest(req);
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

    const rows = await db
      .select()
      .from(profileViewsTable)
      .where(eq(profileViewsTable.vendorId, vendor.id))
      .orderBy(desc(profileViewsTable.viewedAt))
      .limit(200);
    // join users to enrich
    const ids = Array.from(
      new Set(rows.map((r) => r.viewerUserId).filter((x): x is number => !!x)),
    );
    const users = ids.length ? await db.select().from(usersTable) : [];
    const uMap = new Map(users.map((u) => [u.id, u]));
    return res.json({
      premium: vendor.isPremium,
      crmAccessGranted: true,
      crmTrialActive,
      crmTrialDaysRemaining,
      views: rows.map((r) => {
        const u = r.viewerUserId ? uMap.get(r.viewerUserId) : null;
        return {
          ...r,
          viewerName: u?.name ?? r.viewerName ?? "Anonymous",
          viewerEmail: u?.email ?? r.viewerEmail ?? "",
        };
      }),
    });
  },
);

export default router;
