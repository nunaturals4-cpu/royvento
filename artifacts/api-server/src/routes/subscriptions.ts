import fs from "fs";
import path from "path";
import { Router, type IRouter } from "express";
import {
  db,
  subscriptionsTable,
  usersTable,
  vendorsTable,
  pointsLedgerTable,
} from "@workspace/db";
import { eq, desc, and, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { respondInvalid } from "../lib/validationError";

const router: IRouter = Router();

const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  user_plus:       { monthly: 149,   yearly: 1490  },
  user_vip:        { monthly: 499,   yearly: 4990  },
  partner_growth:  { monthly: 2999,  yearly: 32989 },
  partner_premium: { monthly: 7999,  yearly: 87989 },
  // Legacy aliases kept for backwards-compatibility
  user:    { monthly: 149,  yearly: 1490  },
  partner: { monthly: 2999, yearly: 32989 },
};

const PARTNER_PLAN_TYPES = new Set(["partner", "partner_growth", "partner_premium"]);

const SubscribeBody = z.object({
  planType: z.enum([
    "user_plus", "user_vip",
    "partner_growth", "partner_premium",
    "user", "partner",
  ]),
  planPeriod: z.enum(["monthly", "yearly"]),
});

function expiresFor(period: "monthly" | "yearly"): Date {
  const d = new Date();
  if (period === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

// ── Plan visibility config ────────────────────────────────────────────────────
// Persisted to LOCAL_STORAGE_DIR/plan-config.json when available, otherwise
// lives in memory and resets on restart (defaults: both plans visible).

interface PlanVisibility { showGrowthPlan: boolean; showPremiumPartner: boolean }

const CONFIG_FILE = path.join(process.env.LOCAL_STORAGE_DIR ?? "/data", "plan-config.json");
let planVisibility: PlanVisibility = { showGrowthPlan: true, showPremiumPartner: true };
try {
  if (fs.existsSync(CONFIG_FILE)) {
    planVisibility = { ...planVisibility, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) };
  }
} catch { /* use defaults */ }

function savePlanVisibility() {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (fs.existsSync(dir)) fs.writeFileSync(CONFIG_FILE, JSON.stringify(planVisibility));
  } catch { /* non-critical */ }
}

router.get("/plan-config", async (_req, res) => {
  res.json(planVisibility);
});

router.post("/admin/plan-config", requireAuth(["admin"]), async (req, res) => {
  const { showGrowthPlan, showPremiumPartner } = req.body;
  planVisibility = {
    showGrowthPlan:    Boolean(showGrowthPlan),
    showPremiumPartner: Boolean(showPremiumPartner),
  };
  savePlanVisibility();
  return res.json({ success: true, ...planVisibility });
});

// ── Public price list ─────────────────────────────────────────────────────────

router.get("/subscriptions/prices", async (_req, res) => {
  res.json({
    user_plus:       PLAN_PRICES.user_plus,
    user_vip:        PLAN_PRICES.user_vip,
    partner_growth:  PLAN_PRICES.partner_growth,
    partner_premium: PLAN_PRICES.partner_premium,
  });
});

// ── Subscribe / activate ──────────────────────────────────────────────────────

router.post("/subscriptions", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const parsed = SubscribeBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const { planType, planPeriod } = parsed.data;

  const prices = PLAN_PRICES[planType];
  if (!prices) return res.status(400).json({ error: "Invalid plan" });
  const price = planPeriod === "monthly" ? prices.monthly : prices.yearly;

  // Expire any existing active subscription
  await db
    .update(subscriptionsTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(subscriptionsTable.userId, user.id),
        eq(subscriptionsTable.status, "active"),
      ),
    );

  const [sub] = await db
    .insert(subscriptionsTable)
    .values({
      userId: user.id,
      planType,
      planPeriod,
      price: String(price),
      status: "active",
      expiresAt: expiresFor(planPeriod),
    })
    .returning();

  if (!sub) return res.status(500).json({ error: "Failed to create subscription" });

  if (PARTNER_PLAN_TYPES.has(planType)) {
    await db
      .update(vendorsTable)
      .set({ isPremium: true })
      .where(eq(vendorsTable.userId, user.id));
  }

  // Award 200 loyalty points for subscribing / renewing.
  try {
    const ptExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await Promise.all([
      db.update(usersTable)
        .set({ points: sql`${usersTable.points} + 200` })
        .where(eq(usersTable.id, user.id)),
      db.insert(pointsLedgerTable).values({
        userId: user.id,
        points: 200,
        source: "subscription",
        expiresAt: ptExpiresAt,
      }),
    ]);
  } catch { /* non-critical */ }

  return res.json(sub);
});

// ── Active subscription for current user ──────────────────────────────────────

router.get("/subscriptions/me", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const rows = await db
    .select()
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.userId, user.id),
        eq(subscriptionsTable.status, "active"),
        gt(subscriptionsTable.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(1);
  return res.json(rows[0] ?? null);
});

// ── Admin ─────────────────────────────────────────────────────────────────────

router.get("/admin/subscriptions", requireAuth(["admin"]), async (_req, res) => {
  const subs = await db
    .select()
    .from(subscriptionsTable)
    .orderBy(desc(subscriptionsTable.createdAt));
  if (subs.length === 0) return res.json([]);
  const users = await db.select().from(usersTable);
  const uMap = new Map(users.map((u) => [u.id, u]));
  return res.json(
    subs.map((s) => {
      const u = uMap.get(s.userId);
      return { ...s, userName: u?.name ?? "", userEmail: u?.email ?? "" };
    }),
  );
});

router.delete("/admin/subscriptions/:id", requireAuth(["admin"]), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.update(subscriptionsTable).set({ status: "expired" }).where(eq(subscriptionsTable.id, id));
  return res.json({ success: true });
});

export default router;
