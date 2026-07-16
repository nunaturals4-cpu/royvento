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
import { notifyPartnerNewBooking } from "../lib/partnerBookingNotify";
import { computeCommissionFromPlanned } from "../lib/commission";
import { eq, and, inArray, ne, sql } from "drizzle-orm";
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
import {
  activatePartyBookingAfterPayment,
  failPartyBookingAfterPayment,
  refundPartyBooking,
} from "./createYourParty";
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

  // Instant "New booking received" notification to the partner — this one
  // hook covers the paid path for every booking kind (pub/organizer/game),
  // since they all confirm through this same activator.
  await notifyPartnerNewBooking({
    id: booking.id,
    kind: booking.kind,
    vendorId: booking.vendorId,
    organizerId: booking.organizerId,
    hostVendorId: booking.hostVendorId,
    gameOrganizerId: booking.gameOrganizerId,
    personName: booking.personName,
    phone: booking.phone,
    bookingDate: booking.bookingDate,
    arrivalTime: booking.arrivalTime,
    guests: booking.guests,
    pubMode: booking.pubMode,
    paymentMethod: booking.paymentMethod,
  });
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
      } else if (!payment) {
        // Not a shared payment — may be a "Create Your Own Party" booking.
        await activatePartyBookingAfterPayment(razorpayOrderId, razorpayPaymentId);
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
        } else {
          // Not a shared payment — may be a party booking.
          await failPartyBookingAfterPayment(razorpayOrderId);
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
        } else if (!payment) {
          // Not a shared payment — may be a party booking refund.
          await refundPartyBooking(razorpayPaymentId);
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

// ─── Hosted Razorpay checkout page (for native apps without an SDK) ──────────
// The mobile app opens this page in an in-app browser (WebBrowser). It loads
// Razorpay Checkout for an order that was ALREADY created server-side (so the
// amount/charge is bound to the order id, not to any query param), then deep-
// links back to the app on success / failure / dismiss. The Razorpay webhook is
// the authoritative confirmation — this page is only the launch + UX redirect.
//
// Query params:
//   order_id  (required)  Razorpay order id created by the booking/sub/party flow
//   amount    (paise)     display only
//   name                  checkout title (e.g. venue / "Royvento Premium")
//   desc                  checkout description
//   pname/email/contact   prefill fields
//   rid                   context id echoed back (e.g. bookingId) — display/return only
//   redirect              deep link base to return to (default royvento://payment-result)
function jsStr(v: unknown): string {
  // JSON-encode a value, then neutralise sequences that could break out of
  // the surrounding <script> block (XSS-safe embedding).
  return JSON.stringify(String(v ?? ""))
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

router.get("/pay/checkout", (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const orderId = (q["order_id"] ?? "").trim();
  if (!isRazorpayConfigured()) {
    return res.status(503).send("Online payments are not configured.");
  }
  if (!orderId) {
    return res.status(400).send("Missing order_id.");
  }
  const redirect = (q["redirect"] ?? "royvento://payment-result").trim();
  const rid = (q["rid"] ?? "").trim();
  const amount = Number(q["amount"] ?? 0) || 0;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<title>Secure payment · Royvento</title>
<style>
  html,body{height:100%;margin:0;background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center}
  .spin{width:34px;height:34px;border:3px solid rgba(255,255,255,.15);border-top-color:#e8291c;border-radius:50%;animation:s 1s linear infinite}
  @keyframes s{to{transform:rotate(360deg)}}
  .muted{color:#a0a0a0;font-size:14px}
  button{margin-top:8px;background:#e8291c;color:#fff;border:0;border-radius:12px;padding:12px 20px;font-size:15px;font-weight:600}
</style>
</head>
<body>
<div class="wrap">
  <div class="spin"></div>
  <div class="muted">Opening secure Razorpay checkout…</div>
  <button id="retry" style="display:none" onclick="startPay()">Pay now</button>
</div>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  var KEY = ${jsStr(getKeyId())};
  var ORDER = ${jsStr(orderId)};
  var AMOUNT = ${Math.max(0, Math.round(amount))};
  var NAME = ${jsStr(q["name"] || "Royvento")};
  var DESC = ${jsStr(q["desc"] || "Payment")};
  var REDIRECT = ${jsStr(redirect)};
  var RID = ${jsStr(rid)};
  function back(status, paymentId){
    var sep = REDIRECT.indexOf('?') >= 0 ? '&' : '?';
    var url = REDIRECT + sep + 'payment=' + encodeURIComponent(status)
      + (RID ? '&id=' + encodeURIComponent(RID) : '')
      + (paymentId ? '&razorpay_payment_id=' + encodeURIComponent(paymentId) : '');
    window.location.href = url;
  }
  function startPay(){
    document.getElementById('retry').style.display = 'none';
    var options = {
      key: KEY,
      order_id: ORDER,
      amount: AMOUNT,
      currency: 'INR',
      name: NAME,
      description: DESC,
      prefill: { name: ${jsStr(q["pname"] || "")}, email: ${jsStr(q["email"] || "")}, contact: ${jsStr(q["contact"] || "")} },
      theme: { color: '#e8291c' },
      handler: function(resp){ back('success', resp && resp.razorpay_payment_id); },
      modal: { ondismiss: function(){ document.getElementById('retry').style.display='inline-block'; back('cancelled'); } }
    };
    try {
      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function(){ back('failed'); });
      rzp.open();
    } catch (e) {
      document.getElementById('retry').style.display = 'inline-block';
    }
  }
  window.onload = startPay;
</script>
</body>
</html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // This one page must run Razorpay's inline checkout — allow its script/frames
  // explicitly (the global policy is report-only, but be explicit here).
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com; " +
    "style-src 'self' 'unsafe-inline'; frame-src https://api.razorpay.com https://checkout.razorpay.com; " +
    "connect-src https://api.razorpay.com https://checkout.razorpay.com https://lumberjack.razorpay.com; " +
    "img-src 'self' data: https:; font-src 'self' data:;",
  );
  return res.send(html);
});

export default router;
