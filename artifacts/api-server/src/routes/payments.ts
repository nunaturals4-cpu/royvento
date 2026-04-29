import { Router, type IRouter } from "express";
import {
  db,
  paymentsTable,
  bookingsTable,
  subscriptionsTable,
  vendorsTable,
  usersTable,
  eventsTable,
  availabilityTable,
  couponsTable,
  referralsTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, inArray, ne } from "drizzle-orm";
import {
  checkPaymentStatus,
  verifyWebhookSignature,
  decodeWebhookResponse,
  getAppUrl,
} from "../lib/phonepe";
import {
  sendBookingCreatedEmails,
  sendWhatsAppBookingConfirmation,
} from "../lib/notifications";

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

  const gated = await db
    .update(paymentsTable)
    .set({ status: "success", phonepeTransactionId, updatedAt: new Date() })
    .where(and(eq(paymentsTable.bookingId, bookingId), eq(paymentsTable.status, "initiated")))
    .returning({ id: paymentsTable.id });

  if (gated.length === 0) return;

  await db
    .update(bookingsTable)
    .set({ status: "confirmed", approvedBy: "payment" })
    .where(eq(bookingsTable.id, bookingId));

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

      const whatsappPhone = booking.phone || user.phone;
      if (whatsappPhone) {
        sendWhatsAppBookingConfirmation({
          phone: whatsappPhone,
          userName: user.name,
          pubName: vendor.businessName,
          bookingId: booking.id,
          bookingDate: booking.bookingDate,
          pubMode: booking.pubMode || undefined,
          ticketWomen: booking.ticketWomen || undefined,
          ticketMen: booking.ticketMen || undefined,
          ticketCouple: booking.ticketCouple || undefined,
          guests: booking.guests,
          totalPrice: Number(booking.finalPrice),
        }).catch((err: unknown) => {
          console.error("[whatsapp] Error sending confirmation:", err);
        });
      }
    }
  } catch (err) {
    console.error("[payments] Failed to send booking notifications:", err);
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
    console.error("[payments] Failed to award referral points after payment:", err);
  }

  try {
    const [evt] = await db.select().from(eventsTable).where(eq(eventsTable.id, booking.eventId)).limit(1);
    await db.insert(notificationsTable).values({
      userId: booking.userId,
      title: "Booking confirmed!",
      message: `Your booking for "${evt?.title ?? `#${booking.id}`}" is confirmed. See you there!`,
    });
  } catch (err) {
    console.error("[payments] Failed to create booking confirmation notification:", err);
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

/**
 * GET /payments/booking-callback
 *
 * UX redirect after user returns from PhonePe. On success: activates booking.
 * On non-success: redirects user to failure page WITHOUT touching DB state —
 * the webhook is the authoritative finalizer for failed payments.
 */
router.get("/payments/booking-callback", async (req, res) => {
  const merchantTransactionId = req.query["merchantTransactionId"] as string | undefined;
  const appUrl = getAppUrl();

  if (!merchantTransactionId) {
    return res.redirect(`${appUrl}/payment-result?status=failed&type=booking`);
  }

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.merchantTransactionId, merchantTransactionId))
    .limit(1);

  if (!payment || !payment.bookingId) {
    console.warn(`[payments] booking-callback: no payment record for ${merchantTransactionId}`);
    return res.redirect(`${appUrl}/payment-result?status=failed&type=booking`);
  }

  const bookingId = payment.bookingId;

  try {
    const result = await checkPaymentStatus(merchantTransactionId);

    if (result.success) {
      await activateBookingAfterPayment(bookingId, result.transactionId);
      return res.redirect(`${appUrl}/payment-result?status=success&type=booking&id=${bookingId}`);
    }

    return res.redirect(`${appUrl}/payment-result?status=failed&type=booking&code=${encodeURIComponent(result.code)}`);
  } catch (err) {
    console.error("[payments] booking-callback error:", err);
    return res.redirect(`${appUrl}/payment-result?status=failed&type=booking`);
  }
});

/**
 * GET /payments/subscription-callback
 *
 * UX redirect after user returns from PhonePe. On success: activates subscription.
 * On non-success: redirects user without touching DB state.
 */
const ALLOWED_CALLBACK_SCHEMES = new Set(["royvento"]);

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

  if (!verifyWebhookSignature(base64Response, xVerify)) {
    console.warn("[payments] webhook signature mismatch");
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
    console.warn(`[payments] webhook: no payment found for ${merchantTransactionId}`);
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

export default router;
