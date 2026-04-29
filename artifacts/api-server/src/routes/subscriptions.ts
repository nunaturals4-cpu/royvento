import { Router, type IRouter } from "express";
import crypto from "crypto";
import {
  db,
  subscriptionsTable,
  usersTable,
  vendorsTable,
  paymentsTable,
} from "@workspace/db";
import { eq, desc, and, gt } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest, isNewUser } from "../lib/auth";
import { initiatePayment, isPhonePeConfigured, getAppUrl } from "../lib/phonepe";

const router: IRouter = Router();

const PLAN_PRICES = {
  user: { monthly: 199, yearly: 1999 },
  partner: { monthly: 999, yearly: 9999 },
} as const;

const ALLOWED_CALLBACK_SCHEMES = ["royvento"] as const;

const SubscribeBody = z.object({
  planType: z.enum(["user", "partner"]),
  planPeriod: z.enum(["monthly", "yearly"]),
  callbackScheme: z.enum(ALLOWED_CALLBACK_SCHEMES).optional(),
});

function expiresFor(period: "monthly" | "yearly"): Date {
  const d = new Date();
  if (period === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

router.get("/subscriptions/prices", async (req, res) => {
  const user = await loadUserFromRequest(req);
  const newUser = user ? isNewUser(user.createdAt) : false;
  res.json({
    user: {
      monthly: PLAN_PRICES.user.monthly,
      yearly: PLAN_PRICES.user.yearly,
      newUserDiscountPercent: newUser ? 50 : 0,
    },
    partner: {
      monthly: PLAN_PRICES.partner.monthly,
      yearly: PLAN_PRICES.partner.yearly,
      newUserDiscountPercent: newUser ? 50 : 0,
    },
    isNewUser: newUser,
  });
});

router.post("/subscriptions", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const parsed = SubscribeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const { planType, planPeriod, callbackScheme } = parsed.data;
  let price = PLAN_PRICES[planType][planPeriod];
  if (isNewUser(user.createdAt)) {
    price = Math.round(price * 0.5);
  }

  const usePhonePe = isPhonePeConfigured() && price > 0;
  const hasPaymentBypass = process.env.PAYMENT_BYPASS === "true";

  if (!usePhonePe && price > 0) {
    if (!hasPaymentBypass) {
      return res.status(503).json({
        error: "Payment system not configured. Set PHONEPE_MERCHANT_ID, PHONEPE_SALT_KEY, PHONEPE_SALT_INDEX, and PHONEPE_ENV environment variables, or set PAYMENT_BYPASS=true for development.",
      });
    }
    console.warn("[subscriptions] PAYMENT_BYPASS=true — auto-activating subscription without payment. Remove PAYMENT_BYPASS before going live.");
  }

  const subStatus = usePhonePe ? "pending" : "active";

  if (!usePhonePe) {
    await db
      .update(subscriptionsTable)
      .set({ status: "expired" })
      .where(
        and(
          eq(subscriptionsTable.userId, user.id),
          eq(subscriptionsTable.status, "active"),
        ),
      );
  }

  const [sub] = await db
    .insert(subscriptionsTable)
    .values({
      userId: user.id,
      planType,
      planPeriod,
      price: String(price),
      status: subStatus,
      expiresAt: expiresFor(planPeriod),
    })
    .returning();

  if (!sub) return res.status(500).json({ error: "Failed to create subscription" });

  if (!usePhonePe) {
    if (planType === "partner") {
      await db
        .update(vendorsTable)
        .set({ isPremium: true })
        .where(eq(vendorsTable.userId, user.id));
    }
    return res.json(sub);
  }

  const merchantTransactionId = `SUB${sub.id}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
  const appUrl = getAppUrl();
  const callbackUrl = `${appUrl}/api/payments/subscription-callback?merchantTransactionId=${merchantTransactionId}${callbackScheme ? `&callbackScheme=${encodeURIComponent(callbackScheme)}` : ""}`;
  const webhookUrl = `${appUrl}/api/payments/webhook`;

  await db.insert(paymentsTable).values({
    merchantTransactionId,
    subscriptionId: sub.id,
    amount: price * 100,
    status: "initiated",
  });

  try {
    const phone = user.phone || undefined;
    const { redirectUrl } = await initiatePayment({
      merchantTransactionId,
      merchantUserId: `U${user.id}`,
      amountPaise: price * 100,
      redirectUrl: callbackUrl,
      callbackUrl: webhookUrl,
      ...(phone ? { mobileNumber: phone } : {}),
    });
    return res.json({ redirectUrl, subscriptionId: sub.id, requiresPayment: true });
  } catch (err) {
    console.error("[subscriptions] PhonePe initiation failed:", err);
    await db.update(subscriptionsTable).set({ status: "expired" }).where(eq(subscriptionsTable.id, sub.id));
    await db.update(paymentsTable).set({ status: "failed", updatedAt: new Date() }).where(eq(paymentsTable.merchantTransactionId, merchantTransactionId));
    return res.status(502).json({ error: "Payment initiation failed. Please try again." });
  }
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
