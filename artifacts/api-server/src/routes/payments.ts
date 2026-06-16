import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import {
  db,
  paymentsTable,
  bookingsTable,
  subscriptionsTable,
  vendorsTable,
  vendorCommissionsTable,
  usersTable,
  eventsTable,
  availabilityTable,
  couponsTable,
  referralsTable,
} from "@workspace/db";
import { createUserNotification } from "../lib/notify";
import { computeCommissionFromPlanned } from "../lib/commission";
import { eq, and, inArray, ne, sql } from "drizzle-orm";
import {
  checkPaymentStatus,
  verifyWebhookSignature as verifyPhonePeWebhookSignature,
  decodeWebhookResponse,
  getAppUrl,
} from "../lib/phonepe";
import {
  verifyWebhookSignature as verifyRazorpayWebhookSignature,
  verifyPaymentSignature,
  isRazorpayConfigured,
  getKeyId,
} from "../lib/razorpay";
import {
  sendBookingCreatedEmails,
  sendInvoiceEmail,
} from "../lib/notifications";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { z } from "zod";

const router: IRouter = Router();

async function restoreBookingInstruments(booking: {
  userId: number;
  couponCode: string | null;
  pointsUsed: number | null;
}) {
  if (booking.couponCode) {
    await db
      .update(couponsTable)
      .set({ used: false })
      .where(
        and(
          eq(couponsTable.code, booking.couponCode),
          eq(couponsTable.userId, booking.userId),
          eq(couponsTable.used, true),
        ),
      );
  }

  const pts = booking.pointsUsed ?? 0;
  if (pts > 0) {
    const [usr] = await db
      .select({ points: usersTable.points })
      .from(usersTable)
      .where(eq(usersTable.id, booking.userId))
      .limit(1);
    if (usr) {
      await db
        .update(usersTable)
        .set({ points: usr.points + pts })
        .where(eq(usersTable.id, booking.userId));
    }
  }
}

/**
 * Atomically gate activation: update payments row from initiated→success.
 * If concurrent callback+webhook both reach here, only one will match the
 * WHERE clause — the other exits early, preventing duplicate side effects.
 */
async function activateBookingAfterPayment(bookingId: number, phonepeTransactionId: string) {
  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId))
    .limit(1);

  if (!booking) return;

  // Look up commission rates BEFORE the transaction (read-only) to keep the
  // tx short. The rates table is effectively immutable per vendor in this flow.
  const [vcRow, evtRow] = await Promise.all([
    db.select().from(vendorCommissionsTable).where(eq(vendorCommissionsTable.vendorId, booking.vendorId)).limit(1),
    db.select({ freeEntryRules: eventsTable.freeEntryRules }).from(eventsTable).where(eq(eventsTable.id, booking.eventId)).limit(1),
  ]);
  const comm = computeCommissionFromPlanned(
    {
      pubMode: booking.pubMode,
      finalPrice: booking.finalPrice,
      guests: booking.guests,
      ticketWomen: booking.ticketWomen,
      ticketMen: booking.ticketMen,
      ticketCouple: booking.ticketCouple,
      bookingDate: booking.bookingDate,
    },
    vcRow[0] ?? { freeEntryRate: 0, ticketRate: 0, tableBookingRate: 0 },
    (evtRow[0]?.freeEntryRules ?? null) as { enabled?: boolean; days?: string[]; genders?: string[] } | null,
  );
  const netCredit = Math.max(0, Number(booking.finalPrice ?? 0) - comm.amount);

  // Atomic activation: payment status gate, booking confirmation, and vendor
  // net credit happen in a single transaction. The initiated→success gate
  // lives INSIDE the tx so a concurrent caller either sees us mid-flight (and
  // rolls back) or finds status=success and no-ops. If anything inside fails,
  // payment status stays `initiated` and the next callback/webhook can safely
  // retry.
  //
  // Admin commission is intentionally NOT recorded here anymore — by product
  // decision, commission is realised in `commission_ledger` only when the
  // pub/partner scans the user's QR at check-in (see scan-ticket route).
  // Booking-time still computes commission so the vendor wallet credit
  // (`onlineBalance += finalPrice − commission`) stays correct.
  let activated = false;
  await db.transaction(async (tx) => {
    const gated = await tx
      .update(paymentsTable)
      .set({ status: "success", phonepeTransactionId, updatedAt: new Date() })
      .where(and(eq(paymentsTable.bookingId, bookingId), eq(paymentsTable.status, "initiated")))
      .returning({ id: paymentsTable.id });

    if (gated.length === 0) return; // already activated by a concurrent caller — nothing to do

    await tx
      .update(bookingsTable)
      .set({ status: "confirmed", approvedBy: "payment" })
      .where(eq(bookingsTable.id, bookingId));

    await tx
      .update(vendorsTable)
      .set({ onlineBalance: sql`${vendorsTable.onlineBalance} + ${String(netCredit)}` })
      .where(eq(vendorsTable.id, booking.vendorId));

    activated = true;
  });

  if (!activated) return;

  await db
    .insert(availabilityTable)
    .values({ vendorId: booking.vendorId, date: booking.bookingDate, status: "booked" })
    .onConflictDoUpdate({
      target: [availabilityTable.vendorId, availabilityTable.date],
      set: { status: "booked" },
    });

  try {
    const [evt] = await db.select().from(eventsTable).where(eq(eventsTable.id, booking.eventId)).limit(1);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, booking.userId)).limit(1);
    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, booking.vendorId)).limit(1);
    let vendorEmail = "";
    if (vendor) {
      const [vu] = await db.select().from(usersTable).where(eq(usersTable.id, vendor.userId)).limit(1);
      vendorEmail = vu?.email ?? "";
    }
    if (user && evt && vendor) {
      await sendBookingCreatedEmails({
        bookingId: booking.id,
        eventTitle: evt.title,
        vendorName: vendor.businessName,
        vendorEmail,
        userName: user.name,
        userEmail: user.email,
        bookingDate: booking.bookingDate,
        guests: booking.guests,
        totalPrice: Number(booking.finalPrice),
        notes: booking.notes || undefined,
        phone: booking.phone || undefined,
        pubMode: booking.pubMode || undefined,
        ticketWomen: booking.ticketWomen || undefined,
        ticketMen: booking.ticketMen || undefined,
        ticketCouple: booking.ticketCouple || undefined,
      });

    }
  } catch (err) {
    logger.error({ err }, "[payments] Failed to send booking notifications");
  }

  try {
    const priorPaid = await db
      .select()
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.userId, booking.userId),
          inArray(bookingsTable.status, ["confirmed", "completed"]),
        ),
      );
    const otherPriorCount = priorPaid.filter((p) => p.id !== booking.id).length;
    if (otherPriorCount === 0) {
      const refRows = await db
        .select()
        .from(referralsTable)
        .where(
          and(
            eq(referralsTable.referredId, booking.userId),
            eq(referralsTable.status, "pending"),
          ),
        )
        .limit(1);
      const ref = refRows[0];
      if (ref) {
        const [referrer] = await db.select().from(usersTable).where(eq(usersTable.id, ref.referrerId)).limit(1);
        const [referred] = await db.select().from(usersTable).where(eq(usersTable.id, booking.userId)).limit(1);
        if (referrer) {
          await db.update(usersTable).set({ points: (referrer.points || 0) + 50 }).where(eq(usersTable.id, referrer.id));
        }
        if (referred) {
          await db.update(usersTable).set({ points: (referred.points || 0) + 50 }).where(eq(usersTable.id, referred.id));
        }
        await db
          .update(referralsTable)
          .set({ status: "completed", pointsAwarded: 50, completedAt: new Date() })
          .where(eq(referralsTable.id, ref.id));
      }
    }
  } catch (err) {
    logger.error({ err }, "[payments] Failed to award referral points after payment");
  }

  try {
    const [evt] = await db.select().from(eventsTable).where(eq(eventsTable.id, booking.eventId)).limit(1);
    await createUserNotification({
      userId: booking.userId,
      title: "Booking confirmed!",
      message: `Your booking for "${evt?.title ?? `#${booking.id}`}" is confirmed. See you there!`,
      url: "/dashboard/bookings",
      tag: `booking-${booking.id}`,
    });
  } catch (err) {
    logger.error({ err }, "[payments] Failed to create booking confirmation notification");
  }
}

async function activateSubscriptionAfterPayment(subscriptionId: number, phonepeTransactionId: string) {
  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.id, subscriptionId))
    .limit(1);

  if (!sub) return;

  const gated = await db
    .update(paymentsTable)
    .set({ status: "success", phonepeTransactionId, updatedAt: new Date() })
    .where(and(eq(paymentsTable.subscriptionId, subscriptionId), eq(paymentsTable.status, "initiated")))
    .returning({ id: paymentsTable.id });

  if (gated.length === 0) return;

  await db
    .update(subscriptionsTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(subscriptionsTable.userId, sub.userId),
        eq(subscriptionsTable.status, "active"),
        ne(subscriptionsTable.id, subscriptionId),
      ),
    );

  await db
    .update(subscriptionsTable)
    .set({ status: "active" })
    .where(eq(subscriptionsTable.id, subscriptionId));

  if (sub.planType === "partner") {
    await db
      .update(vendorsTable)
      .set({ isPremium: true })
      .where(eq(vendorsTable.userId, sub.userId));
  }
}

async function handleBookingPaymentFailure(payment: { id: number; bookingId: number | null }) {
  if (!payment.bookingId) return;

  const marked = await db
    .update(paymentsTable)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(paymentsTable.id, payment.id), eq(paymentsTable.status, "initiated")))
    .returning({ id: paymentsTable.id });

  if (marked.length === 0) return;

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(and(eq(bookingsTable.id, payment.bookingId), eq(bookingsTable.status, "payment_pending")))
    .limit(1);

  if (!booking) return;

  await restoreBookingInstruments(booking);
}

async function handleSubscriptionPaymentFailure(payment: { id: number; subscriptionId: number | null }) {
  if (!payment.subscriptionId) return;

  const marked = await db
    .update(paymentsTable)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(paymentsTable.id, payment.id), eq(paymentsTable.status, "initiated")))
    .returning({ id: paymentsTable.id });

  if (marked.length === 0) return;

  await db
    .update(subscriptionsTable)
    .set({ status: "expired" })
    .where(and(eq(subscriptionsTable.id, payment.subscriptionId), eq(subscriptionsTable.status, "pending")));
}

const ALLOWED_CALLBACK_SCHEMES = new Set(["royvento"]);

/**
 * GET /payments/booking-callback
 *
 * UX redirect after user returns from PhonePe. On success: activates booking.
 * On non-success: redirects user to failure page WITHOUT touching DB state —
 * the webhook is the authoritative finalizer for failed payments.
 */
router.get("/payments/booking-callback", async (req, res) => {
  const merchantTransactionId = req.query["merchantTransactionId"] as string | undefined;
  const rawScheme = req.query["callbackScheme"] as string | undefined;
  const callbackScheme = rawScheme && ALLOWED_CALLBACK_SCHEMES.has(rawScheme) ? rawScheme : undefined;
  const appUrl = getAppUrl();

  function buildBookingRedirect(status: "success" | "failed", extra?: Record<string, string>): string {
    const params = new URLSearchParams({ status, payment: status, type: "booking", ...extra });
    if (callbackScheme) {
      return `${callbackScheme}://payment-result?${params.toString()}`;
    }
    return `${appUrl}/payment-result?${params.toString()}`;
  }

  if (!merchantTransactionId) {
    return res.redirect(buildBookingRedirect("failed"));
  }

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.merchantTransactionId, merchantTransactionId))
    .limit(1);

  if (!payment || !payment.bookingId) {
    req.log.warn(`[payments] booking-callback: no payment record for ${merchantTransactionId}`);
    return res.redirect(buildBookingRedirect("failed"));
  }

  const bookingId = payment.bookingId;

  try {
    const result = await checkPaymentStatus(merchantTransactionId);

    if (result.success) {
      await activateBookingAfterPayment(bookingId, result.transactionId);
      return res.redirect(buildBookingRedirect("success", { id: String(bookingId) }));
    }

    return res.redirect(buildBookingRedirect("failed", { code: result.code }));
  } catch (err) {
    req.log.error({ err }, "[payments] booking-callback error");
    return res.redirect(buildBookingRedirect("failed"));
  }
});

/**
 * GET /payments/subscription-callback
 *
 * UX redirect after user returns from PhonePe. On success: activates subscription.
 * On non-success: redirects user without touching DB state.
 */
router.get("/payments/subscription-callback", async (req, res) => {
  const merchantTransactionId = req.query["merchantTransactionId"] as string | undefined;
  const rawScheme = req.query["callbackScheme"] as string | undefined;
  const callbackScheme = rawScheme && ALLOWED_CALLBACK_SCHEMES.has(rawScheme) ? rawScheme : undefined;
  const appUrl = getAppUrl();

  function buildRedirectUrl(status: "success" | "failed", extra?: string): string {
    if (callbackScheme) {
      const base = `${callbackScheme}://subscription?payment=${status}`;
      return extra ? `${base}&${extra}` : base;
    }
    const base = `${appUrl}/subscription?payment=${status}`;
    return extra ? `${base}&${extra}` : base;
  }

  if (!merchantTransactionId) {
    return res.redirect(buildRedirectUrl("failed"));
  }

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.merchantTransactionId, merchantTransactionId))
    .limit(1);

  if (!payment || !payment.subscriptionId) {
    req.log.warn(`[payments] subscription-callback: no payment record for ${merchantTransactionId}`);
    return res.redirect(buildRedirectUrl("failed"));
  }

  const subscriptionId = payment.subscriptionId;

  try {
    const result = await checkPaymentStatus(merchantTransactionId);

    if (result.success) {
      await activateSubscriptionAfterPayment(subscriptionId, result.transactionId);
      return res.redirect(buildRedirectUrl("success"));
    }

    return res.redirect(buildRedirectUrl("failed", `code=${encodeURIComponent(result.code)}`));
  } catch (err) {
    req.log.error({ err }, "[payments] subscription-callback error");
    return res.redirect(buildRedirectUrl("failed"));
  }
});

/**
 * POST /payments/webhook
 *
 * Server-to-server authoritative finalizer from PhonePe.
 * Activates on success; cancels + restores instruments on failure.
 */
router.post("/payments/webhook", async (req, res) => {
  const xVerify = req.headers["x-verify"] as string | undefined;
  const { response: base64Response } = req.body as { response?: string };

  if (!base64Response || !xVerify) {
    return res.status(400).json({ error: "Missing payload" });
  }

  if (!verifyPhonePeWebhookSignature(base64Response, xVerify)) {
    req.log.warn("[payments] webhook signature mismatch");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const payload = decodeWebhookResponse(base64Response);
  if (!payload) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const merchantTransactionId: string = payload.data?.merchantTransactionId ?? payload.merchantTransactionId ?? "";
  const transactionId: string = payload.data?.transactionId ?? "";
  const isSuccess = payload.code === "PAYMENT_SUCCESS";

  if (!merchantTransactionId) {
    return res.status(400).json({ error: "Missing merchantTransactionId" });
  }

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.merchantTransactionId, merchantTransactionId))
    .limit(1);

  if (!payment) {
    req.log.warn({ merchantTransactionId }, "[payments] webhook: no payment found");
    return res.status(200).json({ ok: true });
  }

  if (isSuccess) {
    if (payment.bookingId) {
      await activateBookingAfterPayment(payment.bookingId, transactionId);
    } else if (payment.subscriptionId) {
      await activateSubscriptionAfterPayment(payment.subscriptionId, transactionId);
    }
  } else if (payment.status === "initiated") {
    if (payment.bookingId) {
      await handleBookingPaymentFailure({ id: payment.id, bookingId: payment.bookingId });
    } else if (payment.subscriptionId) {
      await handleSubscriptionPaymentFailure({ id: payment.id, subscriptionId: payment.subscriptionId });
    }
  }

  return res.status(200).json({ ok: true });
});

// ─── Razorpay: activate booking after confirmed payment ────────────────────────

async function activateBookingAfterRazorpayPayment(bookingId: number, razorpayPaymentId: string, razorpayOrderId: string) {
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) return;

  const [vcRow, evtRow] = await Promise.all([
    db.select().from(vendorCommissionsTable).where(eq(vendorCommissionsTable.vendorId, booking.vendorId)).limit(1),
    db.select({ freeEntryRules: eventsTable.freeEntryRules }).from(eventsTable).where(eq(eventsTable.id, booking.eventId)).limit(1),
  ]);
  const comm = computeCommissionFromPlanned(
    {
      pubMode: booking.pubMode,
      finalPrice: booking.finalPrice,
      guests: booking.guests,
      ticketWomen: booking.ticketWomen,
      ticketMen: booking.ticketMen,
      ticketCouple: booking.ticketCouple,
      bookingDate: booking.bookingDate,
    },
    vcRow[0] ?? { freeEntryRate: 0, ticketRate: 0, tableBookingRate: 0 },
    (evtRow[0]?.freeEntryRules ?? null) as { enabled?: boolean; days?: string[]; genders?: string[] } | null,
  );
  const netCredit = Math.max(0, Number(booking.finalPrice ?? 0) - comm.amount);

  let activated = false;
  await db.transaction(async (tx) => {
    const gated = await tx
      .update(paymentsTable)
      .set({ status: "success", razorpayPaymentId, updatedAt: new Date() })
      .where(and(eq(paymentsTable.razorpayOrderId, razorpayOrderId), eq(paymentsTable.status, "initiated")))
      .returning({ id: paymentsTable.id });

    if (gated.length === 0) return;

    await tx.update(bookingsTable)
      .set({ status: "confirmed", approvedBy: "payment" })
      .where(eq(bookingsTable.id, bookingId));

    await tx.update(vendorsTable)
      .set({ onlineBalance: sql`${vendorsTable.onlineBalance} + ${String(netCredit)}` })
      .where(eq(vendorsTable.id, booking.vendorId));

    activated = true;
  });

  if (!activated) return;

  await db.insert(availabilityTable)
    .values({ vendorId: booking.vendorId, date: booking.bookingDate, status: "booked" })
    .onConflictDoUpdate({
      target: [availabilityTable.vendorId, availabilityTable.date],
      set: { status: "booked" },
    });

  // Send booking confirmation + invoice
  try {
    const [evt] = await db.select().from(eventsTable).where(eq(eventsTable.id, booking.eventId)).limit(1);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, booking.userId)).limit(1);
    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, booking.vendorId)).limit(1);
    let vendorEmail = "";
    if (vendor) {
      const [vu] = await db.select().from(usersTable).where(eq(usersTable.id, vendor.userId)).limit(1);
      vendorEmail = vu?.email ?? "";
    }
    if (user && evt && vendor) {
      await sendBookingCreatedEmails({
        bookingId: booking.id,
        eventTitle: evt.title,
        vendorName: vendor.businessName,
        vendorEmail,
        userName: user.name,
        userEmail: user.email,
        bookingDate: booking.bookingDate,
        guests: booking.guests,
        totalPrice: Number(booking.finalPrice),
        notes: booking.notes || undefined,
        phone: booking.phone || undefined,
        pubMode: booking.pubMode || undefined,
        ticketWomen: booking.ticketWomen || undefined,
        ticketMen: booking.ticketMen || undefined,
        ticketCouple: booking.ticketCouple || undefined,
      });
      await sendInvoiceEmail({
        bookingId: booking.id,
        userName: user.name,
        userEmail: user.email,
        userPhone: booking.phone || "",
        eventTitle: evt.title,
        venueName: vendor.businessName,
        bookingDate: booking.bookingDate,
        pubMode: booking.pubMode || "",
        ticketWomen: booking.ticketWomen || 0,
        ticketMen: booking.ticketMen || 0,
        ticketCouple: booking.ticketCouple || 0,
        guests: booking.guests,
        totalPrice: Number(booking.totalPrice),
        discountAmount: Number(booking.discountAmount),
        pointsUsed: booking.pointsUsed || 0,
        finalPrice: Number(booking.finalPrice),
        baseFee: Number(booking.baseFee ?? 0),
        razorpayPaymentId,
      });
    }
  } catch (err) {
    logger.error({ err }, "[razorpay] Failed to send post-payment emails");
  }

  try {
    const priorPaid = await db.select().from(bookingsTable)
      .where(and(eq(bookingsTable.userId, booking.userId), inArray(bookingsTable.status, ["confirmed", "completed"])));
    const otherPriorCount = priorPaid.filter((p) => p.id !== booking.id).length;
    if (otherPriorCount === 0) {
      const refRows = await db.select().from(referralsTable)
        .where(and(eq(referralsTable.referredId, booking.userId), eq(referralsTable.status, "pending")))
        .limit(1);
      const ref = refRows[0];
      if (ref) {
        const [referrer] = await db.select().from(usersTable).where(eq(usersTable.id, ref.referrerId)).limit(1);
        const [referred] = await db.select().from(usersTable).where(eq(usersTable.id, booking.userId)).limit(1);
        if (referrer) await db.update(usersTable).set({ points: (referrer.points || 0) + 50 }).where(eq(usersTable.id, referrer.id));
        if (referred) await db.update(usersTable).set({ points: (referred.points || 0) + 50 }).where(eq(usersTable.id, referred.id));
        await db.update(referralsTable)
          .set({ status: "completed", pointsAwarded: 50, completedAt: new Date() })
          .where(eq(referralsTable.id, ref.id));
      }
    }
  } catch (err) {
    logger.error({ err }, "[razorpay] Failed to award referral points");
  }

  try {
    const [evt] = await db.select().from(eventsTable).where(eq(eventsTable.id, booking.eventId)).limit(1);
    await createUserNotification({
      userId: booking.userId,
      title: "Booking confirmed!",
      message: `Your booking for "${evt?.title ?? `#${booking.id}`}" is confirmed. See you there!`,
      url: "/dashboard/bookings",
      tag: `booking-${booking.id}`,
    });
  } catch (err) {
    logger.error({ err }, "[razorpay] Failed to create booking confirmation notification");
  }
}

async function activateSubscriptionAfterRazorpayPayment(subscriptionId: number, razorpayPaymentId: string, razorpayOrderId: string) {
  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, subscriptionId)).limit(1);
  if (!sub) return;

  const gated = await db
    .update(paymentsTable)
    .set({ status: "success", razorpayPaymentId, updatedAt: new Date() })
    .where(and(eq(paymentsTable.razorpayOrderId, razorpayOrderId), eq(paymentsTable.status, "initiated")))
    .returning({ id: paymentsTable.id });

  if (gated.length === 0) return;

  await db.update(subscriptionsTable)
    .set({ status: "expired" })
    .where(and(
      eq(subscriptionsTable.userId, sub.userId),
      eq(subscriptionsTable.status, "active"),
      ne(subscriptionsTable.id, subscriptionId),
    ));

  await db.update(subscriptionsTable)
    .set({ status: "active" })
    .where(eq(subscriptionsTable.id, subscriptionId));

  if (sub.planType === "partner" || sub.planType === "partner_growth" || sub.planType === "partner_premium" || sub.planType === "partner_royal") {
    await db.update(vendorsTable).set({ isPremium: true }).where(eq(vendorsTable.userId, sub.userId));
  }
}

// ─── POST /payments/razorpay/webhook ─────────────────────────────────────────
//
// Server-to-server authoritative finalizer from Razorpay.
// Handles: payment.captured, payment.failed, refund.processed, refund.failed,
//          subscription.charged, subscription.halted, subscription.cancelled,
//          subscription.completed.

interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number } };
    refund?: { entity?: { id?: string; payment_id?: string; amount?: number } };
    subscription?: { entity?: { id?: string } };
  };
}

router.post("/payments/razorpay/webhook", async (req, res) => {
  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  const signature = req.headers["x-razorpay-signature"] as string | undefined;

  if (!rawBody || !signature) {
    return res.status(400).json({ error: "Missing payload or signature" });
  }

  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    req.log.warn("[razorpay] webhook signature mismatch");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const body = req.body as RazorpayWebhookPayload;
  const event = body.event ?? "";

  req.log.info({ event }, "[razorpay] webhook received");

  try {
    // ── Payment captured ──────────────────────────────────────────────────────
    if (event === "payment.captured") {
      const paymentEntity = body.payload?.payment?.entity;
      const razorpayPaymentId = paymentEntity?.id ?? "";
      const razorpayOrderId = paymentEntity?.order_id ?? "";

      if (!razorpayOrderId) {
        return res.status(200).json({ ok: true });
      }

      const [payment] = await db.select().from(paymentsTable)
        .where(eq(paymentsTable.razorpayOrderId, razorpayOrderId))
        .limit(1);

      if (payment?.bookingId) {
        await activateBookingAfterRazorpayPayment(payment.bookingId, razorpayPaymentId, razorpayOrderId);
      } else if (payment?.subscriptionId) {
        await activateSubscriptionAfterRazorpayPayment(payment.subscriptionId, razorpayPaymentId, razorpayOrderId);
      }
    }

    // ── Payment failed ────────────────────────────────────────────────────────
    else if (event === "payment.failed") {
      const razorpayOrderId = body.payload?.payment?.entity?.order_id ?? "";

      if (razorpayOrderId) {
        const [payment] = await db.select().from(paymentsTable)
          .where(and(eq(paymentsTable.razorpayOrderId, razorpayOrderId), eq(paymentsTable.status, "initiated")))
          .limit(1);

        if (payment) {
          await db.update(paymentsTable)
            .set({ status: "failed", updatedAt: new Date() })
            .where(eq(paymentsTable.id, payment.id));

          if (payment.bookingId) {
            const [booking] = await db.select().from(bookingsTable)
              .where(and(eq(bookingsTable.id, payment.bookingId), eq(bookingsTable.status, "payment_pending")))
              .limit(1);
            if (booking) {
              await db.update(bookingsTable).set({ status: "cancelled" }).where(eq(bookingsTable.id, booking.id));
              await restoreBookingInstruments(booking);
            }
          } else if (payment.subscriptionId) {
            await db.update(subscriptionsTable)
              .set({ status: "expired" })
              .where(and(eq(subscriptionsTable.id, payment.subscriptionId), eq(subscriptionsTable.status, "pending")));
          }
        }
      }
    }

    // ── Refund processed ──────────────────────────────────────────────────────
    else if (event === "refund.processed") {
      const razorpayPaymentId = body.payload?.refund?.entity?.payment_id ?? "";
      if (razorpayPaymentId) {
        const [payment] = await db.select().from(paymentsTable)
          .where(eq(paymentsTable.razorpayPaymentId, razorpayPaymentId))
          .limit(1);
        if (payment?.bookingId) {
          await db.update(bookingsTable)
            .set({ status: "cancelled", approvedBy: "refund" })
            .where(eq(bookingsTable.id, payment.bookingId));
        }
      }
    }

    // ── Refund failed ─────────────────────────────────────────────────────────
    else if (event === "refund.failed") {
      const razorpayPaymentId = body.payload?.refund?.entity?.payment_id ?? "";
      req.log.error({ razorpayPaymentId }, "[razorpay] Refund failed — manual action required");
    }

    // ── Subscription charged (recurring payment) ──────────────────────────────
    else if (event === "subscription.charged") {
      const razorpayPaymentId = body.payload?.payment?.entity?.id ?? "";
      const razorpayOrderId = body.payload?.payment?.entity?.order_id ?? "";
      if (razorpayOrderId) {
        const [payment] = await db.select().from(paymentsTable)
          .where(eq(paymentsTable.razorpayOrderId, razorpayOrderId))
          .limit(1);
        if (payment?.subscriptionId) {
          await activateSubscriptionAfterRazorpayPayment(payment.subscriptionId, razorpayPaymentId, razorpayOrderId);
        }
      }
    }

    // ── Subscription halted (repeated payment failures) ───────────────────────
    else if (event === "subscription.halted" || event === "subscription.cancelled") {
      const subscriptionEntityId = body.payload?.subscription?.entity?.id ?? "";
      if (subscriptionEntityId) {
        // Find by razorpay subscription ID stored in merchantTransactionId
        const [payment] = await db.select().from(paymentsTable)
          .where(eq(paymentsTable.merchantTransactionId, subscriptionEntityId))
          .limit(1);
        if (payment?.subscriptionId) {
          await db.update(subscriptionsTable)
            .set({ status: "expired" })
            .where(eq(subscriptionsTable.id, payment.subscriptionId));
          if (payment.subscriptionId) {
            const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, payment.subscriptionId)).limit(1);
            if (sub && (sub.planType === "partner" || sub.planType?.startsWith("partner_"))) {
              await db.update(vendorsTable).set({ isPremium: false }).where(eq(vendorsTable.userId, sub.userId));
            }
          }
        }
      }
    }
  } catch (err) {
    req.log.error({ err, event }, "[razorpay] webhook handler error");
  }

  return res.status(200).json({ ok: true });
});

// ─── POST /payments/razorpay/verify ──────────────────────────────────────────
//
// Called by the client after the Razorpay checkout popup reports success.
// Verifies the payment signature so the UI can show a confirmed state without
// waiting for the webhook. The webhook remains the authoritative finalizer.

const VerifyBody = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

router.post("/payments/razorpay/verify", requireAuth(), async (req, res) => {
  const parsed = VerifyBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Missing razorpayOrderId / razorpayPaymentId / razorpaySignature" });
  }

  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;

  if (!verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    req.log.warn({ razorpayOrderId }, "[razorpay] verify: invalid signature");
    return res.status(400).json({ error: "Payment signature verification failed" });
  }

  // Activate immediately on valid signature — webhook may arrive later and will no-op via the idempotency gate
  const [payment] = await db.select().from(paymentsTable)
    .where(eq(paymentsTable.razorpayOrderId, razorpayOrderId))
    .limit(1);

  if (!payment) {
    return res.status(404).json({ error: "Payment record not found" });
  }

  try {
    if (payment.bookingId) {
      await activateBookingAfterRazorpayPayment(payment.bookingId, razorpayPaymentId, razorpayOrderId);
    } else if (payment.subscriptionId) {
      await activateSubscriptionAfterRazorpayPayment(payment.subscriptionId, razorpayPaymentId, razorpayOrderId);
    }
  } catch (err) {
    req.log.error({ err }, "[razorpay] verify: activation error");
  }

  return res.json({ ok: true, bookingId: payment.bookingId, subscriptionId: payment.subscriptionId });
});

// ─── GET /payments/razorpay/config ───────────────────────────────────────────
//
// Returns the public key ID so the frontend can initialise the Razorpay checkout
// without hard-coding the key.

router.get("/payments/razorpay/config", requireAuth(), (_req, res) => {
  if (!isRazorpayConfigured()) {
    return res.status(503).json({ error: "Razorpay not configured" });
  }
  return res.json({ keyId: getKeyId() });
});

export default router;
