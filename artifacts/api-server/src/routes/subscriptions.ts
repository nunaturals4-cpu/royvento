import { Router, type IRouter } from "express";
import {
  db,
  subscriptionsTable,
  usersTable,
  vendorsTable,
} from "@workspace/db";
import { eq, desc, and, gt } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";

const router: IRouter = Router();

// Demo prices (no real payment integration)
const PLAN_PRICES = {
  user: { monthly: 200, yearly: 2500 },
  partner: { monthly: 999, yearly: 9999 },
} as const;

const SubscribeBody = z.object({
  planType: z.enum(["user", "partner"]),
  planPeriod: z.enum(["monthly", "yearly"]),
});

function expiresFor(period: "monthly" | "yearly"): Date {
  const d = new Date();
  if (period === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

router.post("/subscriptions", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const parsed = SubscribeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const { planType, planPeriod } = parsed.data;
  const price = PLAN_PRICES[planType][planPeriod];

  // expire previous active
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

  // If partner subscription, mark vendor as premium
  if (planType === "partner") {
    await db
      .update(vendorsTable)
      .set({ isPremium: true })
      .where(eq(vendorsTable.userId, user.id));
  }
  return res.json(sub);
});

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

router.get("/admin/subscriptions", requireAuth(["admin"]), async (_req, res) => {
  const subs = await db
    .select()
    .from(subscriptionsTable)
    .orderBy(desc(subscriptionsTable.createdAt));
  if (subs.length === 0) return res.json([]);
  const userIds = Array.from(new Set(subs.map((s) => s.userId)));
  const users = await db.select().from(usersTable);
  const uMap = new Map(users.map((u) => [u.id, u]));
  return res.json(
    subs.map((s) => {
      const u = uMap.get(s.userId);
      return {
        ...s,
        userName: u?.name ?? "",
        userEmail: u?.email ?? "",
      };
    }),
  );
});

export default router;
