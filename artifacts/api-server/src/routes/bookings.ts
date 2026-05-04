import { Router, type IRouter } from "express";
import crypto from "crypto";
import {
  db,
  bookingsTable,
  eventsTable,
  vendorsTable,
  usersTable,
  availabilityTable,
  couponsTable,
  referralsTable,
  notificationsTable,
  partnerBlockedDatesTable,
  paymentsTable,
  vendorManagersTable,
  vendorCommissionsTable,
} from "@workspace/db";
import { sendExpoPushNotification } from "../lib/expoPush";
import { sendWebPushToUser } from "./webPush";
import { generateTicketCode, verifyTicketCode, generateUniqueTicketPrefix, generateTicketSalt } from "../lib/ticketCode";
import { eq, desc, and, inArray, sql, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { UpdateBookingStatusBody } from "@workspace/api-zod";
import { requireAuth, loadUserFromRequest, isNewUser } from "../lib/auth";
import {
  sendBookingCreatedEmails,
  sendBookingStatusEmail,
  sendCustomerCancelledBookingEmail,
  sendTicketScannedEmail,
} from "../lib/notifications";
import { initiatePayment, isPhonePeConfigured, getAppUrl } from "../lib/phonepe";

/** How many hours before the event date customers are locked out of self-service cancellation. */
const CANCELLATION_CUTOFF_HOURS = Number(process.env["CANCELLATION_CUTOFF_HOURS"] ?? 24);

const EVENT_TYPES = [
  "wedding",
  "birthday",
  "casual",
  "surprise",
  "corporate",
  "cultural",
  "other",
] as const;

const CreateBookingBody = z.object({
  eventId: z.number().int().positive(),
  bookingDate: z.string().min(1),
  guests: z.number().int().nonnegative().optional().default(0),
  notes: z.string().optional().default(""),
  eventType: z.enum(EVENT_TYPES).optional().default("other"),
  budgetRange: z.string().optional().default(""),
  couponCode: z.string().optional().default(""),
  pubMode: z.enum(["", "ticket", "event"]).optional().default(""),
  ticketWomen: z.number().int().nonnegative().optional().default(0),
  ticketMen: z.number().int().nonnegative().optional().default(0),
  ticketCouple: z.number().int().nonnegative().optional().default(0),
  selectedPubEvent: z.string().optional().default(""),
  personName: z.string().optional().default(""),
  phone: z.string().regex(/^\d{10}$/, "Phone must be 10 digits").optional().default(""),
  pointsToUse: z.number().int().nonnegative().optional().default(0),
  paymentMethod: z.enum(["cod", "online"]).optional().default("online"),
  callbackScheme: z.enum(["royvento"]).optional(),
  arrivalTime: z.string().optional().default(""),
});

const router: IRouter = Router();

interface BookingRow {
  id: number;
  eventId: number;
  userId: number;
  vendorId: number;
  bookingDate: string;
  guests: number;
  totalPrice: string;
  couponCode: string;
  discountAmount: string;
  finalPrice: string;
  budgetRange: string;
  notes: string;
  eventType: string;
  status: string;
  pubMode: string;
  ticketWomen: number;
  ticketMen: number;
  ticketCouple: number;
  selectedPubEvent: string;
  personName: string;
  phone: string;
  pointsUsed: number;
  approvedBy: string;
  rejectionReason: string | null;
  checkedIn: boolean;
  checkedInAt: Date | null;
  arrivalTime: string | null;
  createdAt: Date;
}

async function serializeBookings(rows: BookingRow[]) {
  if (rows.length === 0) return [];
  const eventIds = Array.from(new Set(rows.map((r) => r.eventId)));
  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const vendorIds = Array.from(new Set(rows.map((r) => r.vendorId)));
  const [events, users, vendors] = await Promise.all([
    db.select().from(eventsTable).where(inArray(eventsTable.id, eventIds)),
    db.select().from(usersTable).where(inArray(usersTable.id, userIds)),
    db.select().from(vendorsTable).where(inArray(vendorsTable.id, vendorIds)),
  ]);
  const eMap = new Map(events.map((e) => [e.id, e]));
  const uMap = new Map(users.map((u) => [u.id, u]));
  const vMap = new Map(vendors.map((v) => [v.id, v]));
  return rows.map((b) => {
    const e = eMap.get(b.eventId);
    const u = uMap.get(b.userId);
    const v = vMap.get(b.vendorId);
    return {
      id: b.id,
      eventId: b.eventId,
      userId: b.userId,
      vendorId: b.vendorId,
      bookingDate: b.bookingDate,
      guests: b.guests,
      totalPrice: Number(b.totalPrice),
      couponCode: b.couponCode,
      discountAmount: Number(b.discountAmount),
      finalPrice: Number(b.finalPrice),
      budgetRange: b.budgetRange,
      notes: b.notes,
      eventType: b.eventType,
      status: b.status,
      pubMode: b.pubMode,
      ticketWomen: b.ticketWomen,
      ticketMen: b.ticketMen,
      ticketCouple: b.ticketCouple,
      selectedPubEvent: b.selectedPubEvent,
      personName: b.personName || u?.name || "",
      phone: b.phone ?? "",
      pointsUsed: b.pointsUsed,
      approvedBy: b.approvedBy,
      rejectionReason: b.rejectionReason ?? null,
      checkedIn: b.checkedIn,
      checkedInAt: b.checkedInAt ? b.checkedInAt.toISOString() : null,
      arrivalTime: b.arrivalTime ?? "",
      createdAt: b.createdAt.toISOString(),
      eventTitle: e?.title ?? "",
      eventImage: e?.imageUrl ?? "",
      eventType_: e?.type ?? "",
      eventCity: e?.city ?? "",
      eventState: e?.state ?? "",
      eventCountry: e?.country ?? "",
      vendorName: v?.businessName ?? "",
      partnerName: v?.businessName ?? "",
      userName: u?.name ?? "",
      userEmail: u?.email ?? "",
      ticketCode: v ? generateTicketCode(b.id, { ticketPrefix: v.ticketPrefix ?? "", ticketSalt: v.ticketSalt ?? "" }) : `RV-${String(b.id).padStart(6, "0")}`,
      // True when the event is far enough away that self-service cancellation is permitted.
      // Interpreted as midnight (local server time) of the booking date to align with how
      // the cancel handler enforces the same check.
      cancellationAllowed: b.bookingDate
        ? (new Date(`${b.bookingDate}T00:00:00`).getTime() - Date.now()) / (1000 * 60 * 60) >= CANCELLATION_CUTOFF_HOURS
        : true,
    };
  });
}

router.post("/bookings", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const eRows = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, parsed.data.eventId))
    .limit(1);
  const evt = eRows[0];
  if (!evt) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  const rawDate = parsed.data.bookingDate as unknown;
  const dateStr =
    rawDate instanceof Date
      ? rawDate.toISOString().slice(0, 10)
      : String(rawDate).slice(0, 10);

  // Validate against vendor operating schedule and manually blocked dates
  const DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const [vendorScheduleRows, blockedDateRows] = await Promise.all([
    db.select().from(vendorsTable).where(eq(vendorsTable.id, evt.vendorId)).limit(1),
    db.select().from(partnerBlockedDatesTable).where(
      and(eq(partnerBlockedDatesTable.vendorId, evt.vendorId), eq(partnerBlockedDatesTable.date, dateStr))
    ).limit(1),
  ]);
  const vendorSchedule = vendorScheduleRows[0];
  if (blockedDateRows.length > 0) {
    res.status(400).json({ error: "That date is unavailable — the venue has blocked it." });
    return;
  }
  // openDays=[]: no restriction (all days open). openDays non-empty: only listed days are open.
  if (vendorSchedule && vendorSchedule.openDays && vendorSchedule.openDays.length > 0) {
    const bookingDay = DAY_ABBRS[new Date(`${dateStr}T12:00:00`).getDay()];
    if (!vendorSchedule.openDays.includes(bookingDay)) {
      res.status(400).json({ error: `This pub is closed on ${bookingDay}s. Please choose an open day.` });
      return;
    }
  }

  // Compute base total based on mode
  let totalPrice = 0;
  let guestsCount = parsed.data.guests || 0;

  if (evt.type === "pub" && parsed.data.pubMode === "ticket") {
    const w = parsed.data.ticketWomen || 0;
    const m = parsed.data.ticketMen || 0;
    const c = parsed.data.ticketCouple || 0;
    totalPrice =
      w * Number(evt.priceWomen) +
      m * Number(evt.priceMen) +
      c * Number(evt.priceCouple);
    guestsCount = w + m + c * 2;
  } else {
    totalPrice = Number(evt.price) * Math.max(1, guestsCount);
    if (guestsCount === 0) guestsCount = 1;
  }

  // Apply coupon — mark used immediately to prevent double-spend across concurrent pending bookings.
  // Restored on payment failure.
  let discountAmount = 0;
  let validCode = "";
  if (parsed.data.couponCode) {
    const couponRows = await db
      .select()
      .from(couponsTable)
      .where(
        and(
          eq(couponsTable.code, parsed.data.couponCode.trim().toUpperCase()),
          eq(couponsTable.userId, user.id),
          eq(couponsTable.used, false),
        ),
      )
      .limit(1);
    const coupon = couponRows[0];
    if (coupon) {
      if (coupon.vendorId !== null && coupon.vendorId !== undefined && coupon.vendorId !== evt.vendorId) {
        const lockRows = await db.select({ businessName: vendorsTable.businessName }).from(vendorsTable).where(eq(vendorsTable.id, coupon.vendorId)).limit(1);
        const lockName = lockRows[0]?.businessName ?? "another pub";
        res.status(400).json({ error: `This discount code is only valid for ${lockName}. It cannot be used here.` });
        return;
      }
      discountAmount = Math.round(totalPrice * (coupon.discountPercent / 100));
      validCode = coupon.code;
      await db
        .update(couponsTable)
        .set({ used: true })
        .where(eq(couponsTable.id, coupon.id));
    }
  }

  // Apply new-user 20% off (within 10 days of signup, no coupon used)
  if (!validCode && isNewUser(user.createdAt)) {
    const newUserDiscount = Math.round(totalPrice * 0.2);
    discountAmount = Math.max(discountAmount, newUserDiscount);
  }

  // Deduct points immediately to prevent double-spend. Restored on payment failure.
  // Rate: 100 pts = ₹10, i.e. 1 pt = ₹0.10
  const POINTS_RUPEE_RATE = 0.10;
  const pointsToUse = Math.min(parsed.data.pointsToUse || 0, user.points);
  const pointsCap = Math.max(0, totalPrice - discountAmount); // max ₹ deductible via points
  const maxPointsFromCap = Math.floor(pointsCap / POINTS_RUPEE_RATE);
  const pointsUsed = Math.min(pointsToUse, maxPointsFromCap); // points count consumed
  const pointsDeduction = pointsUsed * POINTS_RUPEE_RATE;     // ₹ value deducted
  if (pointsUsed > 0) {
    await db
      .update(usersTable)
      .set({ points: user.points - pointsUsed })
      .where(eq(usersTable.id, user.id));
  }

  const finalPrice = Math.max(0, totalPrice - discountAmount - pointsDeduction);

  const wantsOnline = parsed.data.paymentMethod !== "cod";
  const usePhonePe = wantsOnline && isPhonePeConfigured() && finalPrice > 0;
  const hasPaymentBypass = process.env.PAYMENT_BYPASS === "true";

  // Online payment requested but PhonePe not configured — reject unless bypass is on.
  // COD bookings always confirm immediately (no gateway needed).
  if (wantsOnline && !isPhonePeConfigured() && finalPrice > 0) {
    if (!hasPaymentBypass) {
      if (validCode) {
        await db.update(couponsTable).set({ used: false }).where(and(eq(couponsTable.code, validCode), eq(couponsTable.userId, user.id)));
      }
      if (pointsUsed > 0) {
        await db.update(usersTable).set({ points: user.points }).where(eq(usersTable.id, user.id));
      }
      return res.status(503).json({
        error: "Online payments are not set up yet — please choose Pay at Venue.",
        code: "PHONEPE_UNCONFIGURED",
      });
    }
    console.warn("[bookings] PAYMENT_BYPASS=true — auto-confirming booking without payment. Remove PAYMENT_BYPASS before going live.");
  }

  const bookingStatus = usePhonePe ? "payment_pending" : "confirmed";

  const [b] = await db
    .insert(bookingsTable)
    .values({
      eventId: evt.id,
      userId: user.id,
      vendorId: evt.vendorId,
      bookingDate: dateStr,
      guests: guestsCount,
      totalPrice: String(totalPrice),
      couponCode: validCode,
      discountAmount: String(discountAmount),
      finalPrice: String(finalPrice),
      budgetRange: parsed.data.budgetRange ?? "",
      notes: parsed.data.notes ?? "",
      eventType: parsed.data.eventType ?? "other",
      status: bookingStatus,
      pubMode: parsed.data.pubMode || "",
      ticketWomen: parsed.data.ticketWomen || 0,
      ticketMen: parsed.data.ticketMen || 0,
      ticketCouple: parsed.data.ticketCouple || 0,
      selectedPubEvent: parsed.data.selectedPubEvent || "",
      personName: parsed.data.personName || user.name,
      phone: parsed.data.phone ?? "",
      pointsUsed,
      arrivalTime: parsed.data.arrivalTime || null,
      approvedBy: usePhonePe ? "" : "auto",
      paymentMethod: wantsOnline ? "online" : "cod",
    })
    .returning();
  if (!b) {
    res.status(500).json({ error: "Failed" });
    return;
  }

  if (usePhonePe) {
    const merchantTransactionId = `BK${b.id}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
    const appUrl = getAppUrl();
    const { callbackScheme } = parsed.data;
    const callbackUrl = `${appUrl}/api/payments/booking-callback?merchantTransactionId=${merchantTransactionId}${callbackScheme ? `&callbackScheme=${encodeURIComponent(callbackScheme)}` : ""}`;
    const webhookUrl = `${appUrl}/api/payments/webhook`;

    await db.insert(paymentsTable).values({
      merchantTransactionId,
      bookingId: b.id,
      amount: Math.round(finalPrice * 100),
      status: "initiated",
    });

    try {
      const phone = parsed.data.phone || user.phone;
      const { redirectUrl } = await initiatePayment({
        merchantTransactionId,
        merchantUserId: `U${user.id}`,
        amountPaise: Math.round(finalPrice * 100),
        redirectUrl: callbackUrl,
        callbackUrl: webhookUrl,
        ...(phone ? { mobileNumber: phone } : {}),
      });
      res.json({ redirectUrl, bookingId: b.id, requiresPayment: true });
    } catch (err) {
      console.error("[bookings] PhonePe initiation failed:", err);
      await db.update(paymentsTable).set({ status: "failed", updatedAt: new Date() }).where(eq(paymentsTable.merchantTransactionId, merchantTransactionId));
      await db.update(bookingsTable).set({ status: "cancelled", rejectionReason: "Payment initiation failed" }).where(eq(bookingsTable.id, b.id));
      if (validCode) {
        await db.update(couponsTable).set({ used: false }).where(and(eq(couponsTable.code, validCode), eq(couponsTable.userId, user.id)));
      }
      if (pointsUsed > 0) {
        await db.update(usersTable).set({ points: user.points }).where(eq(usersTable.id, user.id));
      }
      res.status(502).json({ error: "Payment initiation failed. Please try again." });
    }
    return;
  }

  await db
    .insert(availabilityTable)
    .values({ vendorId: evt.vendorId, date: dateStr, status: "booked" })
    .onConflictDoUpdate({
      target: [availabilityTable.vendorId, availabilityTable.date],
      set: { status: "booked" },
    });
  const [out] = await serializeBookings([b]);

  try {
    const vRows = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.id, evt.vendorId))
      .limit(1);
    const vendor = vRows[0];
    let vendorEmail = "";
    let vendorName = out?.vendorName ?? "";
    if (vendor) {
      const vuRows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, vendor.userId))
        .limit(1);
      vendorEmail = vuRows[0]?.email ?? "";
      vendorName = vendor.businessName;
    }
    await sendBookingCreatedEmails({
      bookingId: b.id,
      eventTitle: out?.eventTitle ?? evt.title,
      vendorName,
      vendorEmail,
      userName: user.name,
      userEmail: user.email,
      bookingDate: b.bookingDate,
      guests: b.guests,
      totalPrice: Number(b.finalPrice),
      notes: b.notes || undefined,
      phone: b.phone || undefined,
      pubMode: b.pubMode || undefined,
      ticketWomen: b.ticketWomen || undefined,
      ticketMen: b.ticketMen || undefined,
      ticketCouple: b.ticketCouple || undefined,
    });

  } catch (err) {
    console.error("Failed to send booking notifications:", err);
  }

  try {
    const priorPaid = await db
      .select()
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.userId, user.id),
          inArray(bookingsTable.status, ["confirmed", "completed"]),
        ),
      );
    const otherPriorCount = priorPaid.filter((p) => p.id !== b.id).length;
    if (otherPriorCount === 0) {
      const refRows = await db
        .select()
        .from(referralsTable)
        .where(
          and(
            eq(referralsTable.referredId, user.id),
            eq(referralsTable.status, "pending"),
          ),
        )
        .limit(1);
      const ref = refRows[0];
      if (ref) {
        const [referrer] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, ref.referrerId))
          .limit(1);
        const [referred] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, user.id))
          .limit(1);
        if (referrer) {
          await db
            .update(usersTable)
            .set({ points: (referrer.points || 0) + 50 })
            .where(eq(usersTable.id, referrer.id));
        }
        if (referred) {
          await db
            .update(usersTable)
            .set({ points: (referred.points || 0) + 50 })
            .where(eq(usersTable.id, referred.id));
        }
        await db
          .update(referralsTable)
          .set({ status: "completed", pointsAwarded: 50, completedAt: new Date() })
          .where(eq(referralsTable.id, ref.id));
      }
    }
  } catch (err) {
    console.error("Failed to award referral points at booking creation:", err);
  }

  try {
    await db.insert(notificationsTable).values({
      userId: user.id,
      title: "Booking confirmed!",
      message: `Your booking for "${out?.eventTitle ?? evt.title}" is confirmed. See you there!`,
    });
    sendWebPushToUser(user.id, {
      title: "Booking confirmed!",
      body: `Your booking for "${out?.eventTitle ?? evt.title}" is confirmed. See you there!`,
      url: "/dashboard/bookings",
      tag: `booking-${out?.id ?? bookingId}`,
    }).catch(() => {});
  } catch (err) {
    console.error("Failed to create booking confirmation notification:", err);
  }

  res.json(out);
});

router.get("/bookings/me", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.userId, user.id))
    .orderBy(desc(bookingsTable.createdAt));
  res.json(await serializeBookings(rows));
});

router.post("/bookings/:id/retry-payment", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const paramId = Array.isArray(req.params["id"]) ? req.params["id"][0] : (req.params["id"] ?? "");
  const bookingId = parseInt(paramId, 10);
  if (!bookingId || isNaN(bookingId)) { res.status(400).json({ error: "Invalid booking id" }); return; }

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.userId, user.id)))
    .limit(1);

  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
  if (booking.status !== "payment_pending") {
    res.status(409).json({ error: `Booking is already ${booking.status}` });
    return;
  }
  if (!isPhonePeConfigured()) {
    res.status(503).json({ error: "Payment system not configured" });
    return;
  }

  const finalPrice = parseFloat(String(booking.finalPrice ?? booking.totalPrice ?? 0));
  if (finalPrice <= 0) { res.status(400).json({ error: "No payment required for this booking" }); return; }

  const ALLOWED_RETRY_SCHEMES = new Set(["royvento"]);
  const rawScheme = typeof req.body?.callbackScheme === "string" ? req.body.callbackScheme : undefined;
  const retryCallbackScheme = rawScheme && ALLOWED_RETRY_SCHEMES.has(rawScheme) ? rawScheme : undefined;

  const merchantTransactionId = `BK${booking.id}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
  const appUrl = getAppUrl();
  const callbackUrl = `${appUrl}/api/payments/booking-callback?merchantTransactionId=${merchantTransactionId}${retryCallbackScheme ? `&callbackScheme=${encodeURIComponent(retryCallbackScheme)}` : ""}`;
  const webhookUrl = `${appUrl}/api/payments/webhook`;

  await db.insert(paymentsTable).values({
    merchantTransactionId,
    bookingId: booking.id,
    amount: Math.round(finalPrice * 100),
    status: "initiated",
  });

  try {
    const { redirectUrl } = await initiatePayment({
      merchantTransactionId,
      merchantUserId: `U${user.id}`,
      amountPaise: Math.round(finalPrice * 100),
      redirectUrl: callbackUrl,
      callbackUrl: webhookUrl,
      ...(booking.phone ? { mobileNumber: booking.phone } : {}),
    });
    res.json({ redirectUrl, bookingId: booking.id, requiresPayment: true });
  } catch (err) {
    req.log.error({ err }, "[bookings] PhonePe retry initiation failed");
    await db.update(paymentsTable).set({ status: "failed", updatedAt: new Date() })
      .where(eq(paymentsTable.merchantTransactionId, merchantTransactionId));
    res.status(502).json({ error: "Payment initiation failed — please try again" });
  }
});

// Partner analytics — earnings summary, per-event breakdown, daily revenue
router.get("/partner/commission", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const vRows = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
  const vendor = vRows[0];
  if (!vendor) {
    res.json({ freeEntryRate: "0", ticketRate: "0", tableBookingRate: "0" });
    return;
  }
  const [row] = await db.select().from(vendorCommissionsTable).where(eq(vendorCommissionsTable.vendorId, vendor.id)).limit(1);
  res.json({
    freeEntryRate: row?.freeEntryRate ?? "0",
    ticketRate: row?.ticketRate ?? "0",
    tableBookingRate: row?.tableBookingRate ?? "0",
  });
});

router.get("/partner/analytics", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vRows = await db.select().from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
  const vendor = vRows[0];
  if (!vendor) { res.json({ totalEarnings: 0, monthEarnings: 0, codRevenue: 0, onlineRevenue: 0, perEvent: [], dailyRevenue: [], totalWomen: 0, totalMen: 0, totalCouple: 0, grossEarnings: 0, netEarnings: 0, totalCommission: 0, commissionRates: { freeEntryRate: "0", ticketRate: "0", tableBookingRate: "0" }, dailyCommission: [] }); return; }

  const fromStr = req.query["from"] as string | undefined;
  const toStr = req.query["to"] as string | undefined;
  const rangeStart = fromStr ? new Date(`${fromStr}T00:00:00Z`) : undefined;
  const rangeEnd = toStr ? new Date(`${toStr}T23:59:59Z`) : undefined;

  const [allBookings, commissions] = await Promise.all([
    db
      .select()
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.vendorId, vendor.id),
          inArray(bookingsTable.status, ["confirmed", "completed"]),
          rangeStart ? gte(bookingsTable.createdAt, rangeStart) : undefined,
          rangeEnd ? lte(bookingsTable.createdAt, rangeEnd) : undefined,
        ),
      ),
    db.select().from(vendorCommissionsTable).where(eq(vendorCommissionsTable.vendorId, vendor.id)).limit(1),
  ]);

  const commRow = commissions[0];
  const commFreeRate = Number(commRow?.freeEntryRate ?? 0) / 100;
  const commTicketRate = Number(commRow?.ticketRate ?? 0) / 100;
  const commTableRate = Number(commRow?.tableBookingRate ?? 0) / 100;

  function getCommRate(fp: number, pubMode: string): number {
    if (pubMode === "table") return commTableRate;
    if (fp === 0 || pubMode === "free") return commFreeRate;
    return commTicketRate;
  }

  // Summary figures
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  let totalEarnings = 0;
  let monthEarnings = 0;
  let codRevenue = 0;
  let onlineRevenue = 0;
  let totalCommission = 0;
  let codCommission = 0;
  let onlineCommission = 0;
  const commSummary = {
    freeEntry: { count: 0, grossRevenue: 0, commissionAmount: 0, netRevenue: 0 },
    ticket: { count: 0, grossRevenue: 0, commissionAmount: 0, netRevenue: 0 },
    table: { count: 0, grossRevenue: 0, commissionAmount: 0, netRevenue: 0 },
  };
  for (const b of allBookings) {
    const fp = Number(b.finalPrice);
    totalEarnings += fp;
    if (new Date(b.createdAt) >= monthStart) monthEarnings += fp;
    const isCod = b.paymentMethod === "cod";
    if (isCod) codRevenue += fp;
    else onlineRevenue += fp;
    const rate = getCommRate(fp, b.pubMode ?? "");
    const comm = fp * rate;
    totalCommission += comm;
    if (isCod) codCommission += comm;
    else onlineCommission += comm;
    // Per-booking-type commission summary
    const bType = b.pubMode === "table" ? "table" : (fp === 0 || b.pubMode === "free") ? "freeEntry" : "ticket";
    commSummary[bType].count++;
    commSummary[bType].grossRevenue += fp;
    commSummary[bType].commissionAmount += comm;
  }
  // Compute net per type
  for (const k of Object.keys(commSummary) as (keyof typeof commSummary)[]) {
    commSummary[k].netRevenue = commSummary[k].grossRevenue - commSummary[k].commissionAmount;
  }

  // Per-event breakdown
  const eventIds = Array.from(new Set(allBookings.map((b) => b.eventId)));
  const events = eventIds.length > 0
    ? await db.select().from(eventsTable).where(inArray(eventsTable.id, eventIds))
    : [];
  const eMap = new Map(events.map((e) => [e.id, e]));

  const perEventMap = new Map<number, {
    eventId: number; eventTitle: string;
    bookingCount: number; ticketWomen: number; ticketMen: number; ticketCouple: number; revenue: number;
  }>();
  for (const b of allBookings) {
    const existing = perEventMap.get(b.eventId);
    if (existing) {
      existing.bookingCount += 1;
      existing.ticketWomen += b.ticketWomen;
      existing.ticketMen += b.ticketMen;
      existing.ticketCouple += b.ticketCouple;
      existing.revenue += Number(b.finalPrice);
    } else {
      perEventMap.set(b.eventId, {
        eventId: b.eventId,
        eventTitle: eMap.get(b.eventId)?.title ?? `Event #${b.eventId}`,
        bookingCount: 1,
        ticketWomen: b.ticketWomen,
        ticketMen: b.ticketMen,
        ticketCouple: b.ticketCouple,
        revenue: Number(b.finalPrice),
      });
    }
  }

  // Daily revenue — bucketed over selected range (capped at 90 days to keep response small)
  const dailyMap = new Map<string, number>();
  const dailyCommissionMap = new Map<string, number>();
  const chartEnd = rangeEnd ?? now;
  const chartStart = rangeStart ?? new Date(chartEnd.getTime() - 29 * 24 * 60 * 60 * 1000);
  const dayMs = 24 * 60 * 60 * 1000;
  const totalDays = Math.round((chartEnd.getTime() - chartStart.getTime()) / dayMs) + 1;
  const cappedDays = Math.min(totalDays, 90);
  const effectiveStart = new Date(chartEnd.getTime() - (cappedDays - 1) * dayMs);
  effectiveStart.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < cappedDays; i++) {
    const d = new Date(effectiveStart.getTime() + i * dayMs);
    dailyMap.set(d.toISOString().slice(0, 10), 0);
    dailyCommissionMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const b of allBookings) {
    const day = new Date(b.createdAt).toISOString().slice(0, 10);
    const fp = Number(b.finalPrice);
    if (dailyMap.has(day)) {
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + fp);
      dailyCommissionMap.set(day, (dailyCommissionMap.get(day) ?? 0) + fp * getCommRate(fp, b.pubMode ?? ""));
    }
  }
  const dailyRevenue = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue }));
  const dailyCommission = Array.from(dailyCommissionMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, commission]) => ({ date, commission: Math.round(commission * 100) / 100 }));

  const perEventArr = Array.from(perEventMap.values());
  const totalWomen = perEventArr.reduce((s, r) => s + r.ticketWomen, 0);
  const totalMen = perEventArr.reduce((s, r) => s + r.ticketMen, 0);
  const totalCouple = perEventArr.reduce((s, r) => s + r.ticketCouple, 0);

  function rnd2(n: number) { return Math.round(n * 100) / 100; }
  res.json({
    totalEarnings: Math.round(totalEarnings),
    monthEarnings: Math.round(monthEarnings),
    codRevenue: Math.round(codRevenue),
    onlineRevenue: Math.round(onlineRevenue),
    grossEarnings: Math.round(totalEarnings),
    netEarnings: Math.round(totalEarnings - totalCommission),
    totalCommission: rnd2(totalCommission),
    codCommission: rnd2(codCommission),
    onlineCommission: rnd2(onlineCommission),
    commissionRates: {
      freeEntryRate: commRow?.freeEntryRate ?? "0",
      ticketRate: commRow?.ticketRate ?? "0",
      tableBookingRate: commRow?.tableBookingRate ?? "0",
    },
    commissionSummary: {
      freeEntry: { count: commSummary.freeEntry.count, grossRevenue: Math.round(commSummary.freeEntry.grossRevenue), commissionAmount: rnd2(commSummary.freeEntry.commissionAmount), netRevenue: Math.round(commSummary.freeEntry.netRevenue) },
      ticket: { count: commSummary.ticket.count, grossRevenue: Math.round(commSummary.ticket.grossRevenue), commissionAmount: rnd2(commSummary.ticket.commissionAmount), netRevenue: Math.round(commSummary.ticket.netRevenue) },
      table: { count: commSummary.table.count, grossRevenue: Math.round(commSummary.table.grossRevenue), commissionAmount: rnd2(commSummary.table.commissionAmount), netRevenue: Math.round(commSummary.table.netRevenue) },
    },
    perEvent: perEventArr,
    dailyRevenue,
    dailyCommission,
    totalWomen,
    totalMen,
    totalCouple,
  });
});

// Partner attendance / check-in report
const PARTNER_CHECKIN_PAGE_SIZE = 50;

router.get("/partner/checkin-report", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vRows = await db.select().from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
  const vendor = vRows[0];
  if (!vendor) { res.json({ rows: [], stats: { total: 0, checkedIn: 0, notArrived: 0 }, total: 0, page: 1, totalPages: 1 }); return; }

  const page = Math.max(1, Number(req.query["page"]) || 1);
  const offset = (page - 1) * PARTNER_CHECKIN_PAGE_SIZE;
  const dateParam = req.query["date"] as string | undefined;
  const eventIdParam = req.query["eventId"] ? Number(req.query["eventId"]) : null;
  const statusParam = (req.query["status"] as string | undefined) ?? "all";

  // Base conditions (vendor / date / event scope) — used for stats
  const baseConditions = [
    eq(bookingsTable.vendorId, vendor.id),
    sql`${bookingsTable.status} IN ('confirmed','completed')`,
  ];
  if (dateParam) baseConditions.push(eq(bookingsTable.bookingDate, dateParam) as ReturnType<typeof sql>);
  if (eventIdParam && Number.isFinite(eventIdParam)) baseConditions.push(eq(bookingsTable.eventId, eventIdParam) as ReturnType<typeof sql>);

  // Row-level conditions: base + optional checkedIn filter
  const rowConditions = [...baseConditions];
  if (statusParam === "checkedIn")
    rowConditions.push(eq(bookingsTable.checkedIn, true) as ReturnType<typeof sql>);
  else if (statusParam === "notArrived")
    rowConditions.push(eq(bookingsTable.checkedIn, false) as ReturnType<typeof sql>);

  const baseWhere = and(...baseConditions);
  const rowsWhere = and(...rowConditions);

  const [countRow, statsRow, rows] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(bookingsTable).where(rowsWhere),
    db.select({
      total: sql<number>`count(*)::int`,
      checkedInCount: sql<number>`coalesce(sum(case when ${bookingsTable.checkedIn} then 1 else 0 end),0)::int`,
      notArrivedCount: sql<number>`coalesce(sum(case when not ${bookingsTable.checkedIn} then 1 else 0 end),0)::int`,
    }).from(bookingsTable).where(baseWhere),
    db.select().from(bookingsTable).where(rowsWhere)
      .orderBy(desc(bookingsTable.bookingDate), desc(bookingsTable.id))
      .limit(PARTNER_CHECKIN_PAGE_SIZE).offset(offset),
  ]);

  const total = statsRow[0]?.total ?? 0;
  const rowTotal = countRow[0]?.c ?? 0;
  const totalPages = Math.ceil(rowTotal / PARTNER_CHECKIN_PAGE_SIZE);
  const checkedInCount = statsRow[0]?.checkedInCount ?? 0;
  const notArrivedCount = statsRow[0]?.notArrivedCount ?? 0;

  const eventIds = [...new Set(rows.map((r) => r.eventId))];
  const userIds = [...new Set(rows.map((r) => r.userId))];

  const [events, users] = await Promise.all([
    eventIds.length > 0 ? db.select({ id: eventsTable.id, title: eventsTable.title }).from(eventsTable).where(inArray(eventsTable.id, eventIds)) : [],
    userIds.length > 0 ? db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: sql<string>`coalesce(phone,'')` }).from(usersTable).where(inArray(usersTable.id, userIds)) : [],
  ]);

  const eventMap = new Map(events.map((e) => [e.id, e.title]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  const attendanceRows = rows.map((b) => {
    const u = userMap.get(b.userId);
    return {
      id: b.id,
      vendorId: b.vendorId,
      vendorName: vendor.businessName,
      eventId: b.eventId,
      eventTitle: eventMap.get(b.eventId) ?? "",
      userId: b.userId,
      userName: u?.name ?? "",
      userEmail: u?.email ?? "",
      phone: u?.phone ?? "",
      bookingDate: b.bookingDate,
      guests: b.guests,
      ticketWomen: b.ticketWomen,
      ticketMen: b.ticketMen,
      ticketCouple: b.ticketCouple,
      status: b.status,
      checkedIn: b.checkedIn,
      checkedInAt: b.checkedInAt?.toISOString() ?? null,
      arrivalTime: b.arrivalTime ?? null,
    };
  });

  res.json({
    rows: attendanceRows,
    stats: { total, checkedIn: checkedInCount, notArrived: notArrivedCount },
    total,
    page,
    totalPages,
  });
});

router.get("/bookings/vendor/summary", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const vRows = await db.select().from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
  const vendor = vRows[0];
  if (!vendor) {
    res.json({ totalBookings: 0, totalRevenue: 0, totalGuests: 0, countConfirmed: 0, countCompleted: 0, countCancelled: 0, countPending: 0, monthlyRevenue: [], monthlyTrend: [], perEvent: [] });
    return;
  }
  const rawFrom = String(req.query["from"] ?? "");
  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : null;
  const baseWhere = fromDate
    ? and(eq(bookingsTable.vendorId, vendor.id), gte(bookingsTable.bookingDate, fromDate))
    : eq(bookingsTable.vendorId, vendor.id);
  const confirmedStatuses = ["confirmed", "completed"] as const;
  const [statsRows, monthlyRevenueRows, monthlyTrendRows, perEventRows] = await Promise.all([
    db.select({
      totalBookings: sql<number>`count(*)::int`,
      countConfirmed: sql<number>`count(*) filter (where ${bookingsTable.status} = 'confirmed')::int`,
      countCompleted: sql<number>`count(*) filter (where ${bookingsTable.status} = 'completed')::int`,
      countCancelled: sql<number>`count(*) filter (where ${bookingsTable.status} = 'cancelled')::int`,
      countPending: sql<number>`count(*) filter (where ${bookingsTable.status} = 'pending')::int`,
      totalRevenue: sql<number>`coalesce(sum(case when ${bookingsTable.status} in ('confirmed','completed') then coalesce(${bookingsTable.finalPrice},${bookingsTable.totalPrice},0) else 0 end),0)::int`,
      totalGuests: sql<number>`coalesce(sum(case when ${bookingsTable.status} in ('confirmed','completed') then coalesce(${bookingsTable.ticketWomen},0)+coalesce(${bookingsTable.ticketMen},0)+coalesce(${bookingsTable.ticketCouple},0) else 0 end),0)::int`,
    }).from(bookingsTable).where(baseWhere),
    db.select({
      month: sql<string>`substring(${bookingsTable.bookingDate},1,7)`,
      revenue: sql<number>`coalesce(sum(coalesce(${bookingsTable.finalPrice},${bookingsTable.totalPrice},0)),0)::int`,
    }).from(bookingsTable)
      .where(and(baseWhere, inArray(bookingsTable.status, [...confirmedStatuses])))
      .groupBy(sql`substring(${bookingsTable.bookingDate},1,7)`)
      .orderBy(sql`substring(${bookingsTable.bookingDate},1,7)`),
    db.select({
      month: sql<string>`substring(${bookingsTable.bookingDate},1,7)`,
      confirmed: sql<number>`count(*) filter (where ${bookingsTable.status} in ('confirmed','completed'))::int`,
      cancelled: sql<number>`count(*) filter (where ${bookingsTable.status} = 'cancelled')::int`,
    }).from(bookingsTable).where(baseWhere)
      .groupBy(sql`substring(${bookingsTable.bookingDate},1,7)`)
      .orderBy(sql`substring(${bookingsTable.bookingDate},1,7)`),
    db.select({
      eventId: bookingsTable.eventId,
      eventTitle: eventsTable.title,
      bookingCount: sql<number>`count(*)::int`,
      ticketWomen: sql<number>`coalesce(sum(${bookingsTable.ticketWomen}),0)::int`,
      ticketMen: sql<number>`coalesce(sum(${bookingsTable.ticketMen}),0)::int`,
      ticketCouple: sql<number>`coalesce(sum(${bookingsTable.ticketCouple}),0)::int`,
      revenue: sql<number>`coalesce(sum(coalesce(${bookingsTable.finalPrice},${bookingsTable.totalPrice},0)),0)::int`,
    }).from(bookingsTable)
      .leftJoin(eventsTable, eq(bookingsTable.eventId, eventsTable.id))
      .where(and(baseWhere, inArray(bookingsTable.status, [...confirmedStatuses])))
      .groupBy(bookingsTable.eventId, eventsTable.title)
      .orderBy(desc(sql`coalesce(sum(coalesce(${bookingsTable.finalPrice},${bookingsTable.totalPrice},0)),0)`)),
  ]);
  const stats = statsRows[0] ?? { totalBookings: 0, countConfirmed: 0, countCompleted: 0, countCancelled: 0, countPending: 0, totalRevenue: 0, totalGuests: 0 };
  res.json({ ...stats, monthlyRevenue: monthlyRevenueRows, monthlyTrend: monthlyTrendRows, perEvent: perEventRows });
});

router.get("/bookings/vendor", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const vRows = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.userId, user.id))
    .limit(1);
  const vendor = vRows[0];
  if (!vendor) {
    res.json({ data: [], total: 0, page: 1, totalPages: 1 });
    return;
  }

  const rawPage = parseInt(String(req.query["page"] ?? "1"), 10);
  const rawLimit = parseInt(String(req.query["limit"] ?? "20"), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit <= 1000 ? rawLimit : 20;
  const offset = (page - 1) * limit;

  const rawFrom = String(req.query["from"] ?? "");
  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : null;
  const where = fromDate
    ? and(eq(bookingsTable.vendorId, vendor.id), gte(bookingsTable.bookingDate, fromDate))
    : eq(bookingsTable.vendorId, vendor.id);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(bookingsTable)
    .where(where);

  const total = countRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const rows = await db
    .select()
    .from(bookingsTable)
    .where(where)
    .orderBy(desc(bookingsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ data: await serializeBookings(rows), total, page, totalPages });
});

router.patch(
  "/bookings/:bookingId/status",
  requireAuth(["vendor", "admin"]),
  async (req, res) => {
    const id = Number(req.params["bookingId"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateBookingStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const user = await loadUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const bRows = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id))
      .limit(1);
    const b = bRows[0];
    if (!b) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    let approver: "partner" | "admin" = "admin";
    if (user.role !== "admin") {
      const vRows = await db
        .select()
        .from(vendorsTable)
        .where(
          and(
            eq(vendorsTable.id, b.vendorId),
            eq(vendorsTable.userId, user.id),
          ),
        )
        .limit(1);
      if (!vRows[0]) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      approver = "partner";
    }
    const rejectionReason =
      parsed.data.status === "cancelled"
        ? (parsed.data.rejectionReason ?? null)
        : null;

    if (parsed.data.status === "cancelled" && !rejectionReason?.trim()) {
      res.status(400).json({ error: "A rejection reason is required when cancelling a booking." });
      return;
    }

    const [updated] = await db
      .update(bookingsTable)
      .set({ status: parsed.data.status, approvedBy: approver, rejectionReason: rejectionReason?.trim() ?? null })
      .where(eq(bookingsTable.id, id))
      .returning();
    if (!updated) {
      res.status(500).json({ error: "Failed" });
      return;
    }

    // Award referral points when booking moves to confirmed (paid)
    if (
      (parsed.data.status === "confirmed" ||
        parsed.data.status === "completed") &&
      b.status !== "confirmed" &&
      b.status !== "completed"
    ) {
      try {
        // Was this user's first paid booking?
        const priorPaid = await db
          .select()
          .from(bookingsTable)
          .where(
            and(
              eq(bookingsTable.userId, b.userId),
              inArray(bookingsTable.status, ["confirmed", "completed"]),
            ),
          );
        const otherPriorCount = priorPaid.filter((p) => p.id !== b.id).length;
        if (otherPriorCount === 0) {
          // Find pending referral row for this user
          const refRows = await db
            .select()
            .from(referralsTable)
            .where(
              and(
                eq(referralsTable.referredId, b.userId),
                eq(referralsTable.status, "pending"),
              ),
            )
            .limit(1);
          const ref = refRows[0];
          if (ref) {
            const [referrer] = await db
              .select()
              .from(usersTable)
              .where(eq(usersTable.id, ref.referrerId))
              .limit(1);
            const [referred] = await db
              .select()
              .from(usersTable)
              .where(eq(usersTable.id, b.userId))
              .limit(1);
            if (referrer) {
              await db
                .update(usersTable)
                .set({ points: (referrer.points || 0) + 50 })
                .where(eq(usersTable.id, referrer.id));
            }
            if (referred) {
              await db
                .update(usersTable)
                .set({ points: (referred.points || 0) + 50 })
                .where(eq(usersTable.id, referred.id));
            }
            await db
              .update(referralsTable)
              .set({
                status: "completed",
                pointsAwarded: 50,
                completedAt: new Date(),
              })
              .where(eq(referralsTable.id, ref.id));
          }
        }
      } catch (err) {
        console.error("Failed to award referral points", err);
      }
    }

    const [out] = await serializeBookings([updated]);

    if (out && b.status !== updated.status) {
      try {
        await sendBookingStatusEmail({
          bookingId: updated.id,
          eventTitle: out.eventTitle,
          vendorName: out.vendorName,
          userName: out.userName,
          userEmail: out.userEmail,
          bookingDate: updated.bookingDate,
          status: updated.status,
        });
      } catch (err) {
        console.error("Failed to send status notification:", err);
      }

      // Create in-app notification for the booking user
      try {
        let notifTitle = "";
        let notifMessage = "";
        if (updated.status === "confirmed") {
          notifTitle = "Booking confirmed!";
          notifMessage = `Your booking for "${out.eventTitle}" has been confirmed.`;
        } else if (updated.status === "cancelled") {
          notifTitle = "Booking rejected";
          notifMessage = `Your booking for "${out.eventTitle}" was cancelled.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`;
        } else if (updated.status === "completed") {
          notifTitle = "Booking completed";
          notifMessage = `Your booking for "${out.eventTitle}" is marked as completed. We hope you had a great time!`;
        }
        if (notifTitle) {
          await db.insert(notificationsTable).values({
            userId: b.userId,
            title: notifTitle,
            message: notifMessage,
          });

          // Send Expo push notification to user's device if they have a token
          const [bookingUser] = await db
            .select({ pushToken: usersTable.pushToken })
            .from(usersTable)
            .where(eq(usersTable.id, b.userId))
            .limit(1);
          if (bookingUser?.pushToken) {
            sendExpoPushNotification([
              {
                to: bookingUser.pushToken,
                title: notifTitle,
                body: notifMessage,
                sound: "default",
                data: { bookingId: b.id, screen: "bookings" },
              },
            ]).catch(() => {});
          }
          sendWebPushToUser(b.userId, {
            title: notifTitle,
            body: notifMessage,
            url: "/dashboard/bookings",
            tag: `booking-status-${b.id}`,
          }).catch(() => {});
        }
      } catch (err) {
        console.error("Failed to create notification:", err);
      }
    }

    res.json(out);
  },
);

// Customer cancels their own confirmed booking
const CustomerCancelBody = z.object({
  cancellationReason: z.string().trim().min(1, "Reason is required"),
});

router.patch(
  "/bookings/:bookingId/cancel",
  requireAuth(),
  async (req, res) => {
    const id = Number(req.params["bookingId"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = CustomerCancelBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "A cancellation reason is required." });
      return;
    }
    const user = await loadUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const bRows = await db
      .select()
      .from(bookingsTable)
      .where(and(eq(bookingsTable.id, id), eq(bookingsTable.userId, user.id)))
      .limit(1);
    const b = bRows[0];
    if (!b) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (b.status !== "confirmed") {
      res.status(400).json({ error: "Only confirmed bookings can be cancelled." });
      return;
    }
    if (b.checkedIn) {
      res.status(400).json({ error: "Your ticket has already been scanned — this booking can no longer be cancelled." });
      return;
    }
    // Block cancellations within CANCELLATION_CUTOFF_HOURS of the event date
    if (b.bookingDate) {
      const eventStart = new Date(`${b.bookingDate}T00:00:00`);
      const hoursUntilEvent = (eventStart.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilEvent < CANCELLATION_CUTOFF_HOURS) {
        res.status(400).json({
          error: `Cancellations are not allowed within ${CANCELLATION_CUTOFF_HOURS} hours of the event date. Please contact the partner directly if you need assistance.`,
        });
        return;
      }
    }
    const reason = parsed.data.cancellationReason.trim();
    const [updated] = await db
      .update(bookingsTable)
      .set({ status: "cancelled", approvedBy: "customer", rejectionReason: reason })
      .where(eq(bookingsTable.id, id))
      .returning();
    if (!updated) {
      res.status(500).json({ error: "Failed to cancel booking." });
      return;
    }

    const [out] = await serializeBookings([updated]);

    // Notify the vendor/partner
    if (out) {
      try {
        const vRows = await db
          .select()
          .from(vendorsTable)
          .where(eq(vendorsTable.id, b.vendorId))
          .limit(1);
        const vendor = vRows[0];
        if (vendor) {
          const [vendorUser] = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, vendor.userId))
            .limit(1);
          const vendorEmail = vendorUser?.email ?? "";
          if (vendorEmail) {
            await sendCustomerCancelledBookingEmail({
              bookingId: updated.id,
              eventTitle: out.eventTitle,
              vendorName: out.vendorName,
              vendorEmail,
              userName: out.userName,
              userEmail: out.userEmail,
              bookingDate: updated.bookingDate,
              guests: updated.guests,
              cancellationReason: reason,
            });
          }
          // In-app notification for the vendor owner
          if (vendorUser) {
            await db.insert(notificationsTable).values({
              userId: vendorUser.id,
              title: "Booking cancelled by customer",
              message: `${out.userName} cancelled their booking for "${out.eventTitle}" on ${updated.bookingDate}. Reason: ${reason}`,
            });
          }
        }
      } catch (err) {
        console.error("Failed to send partner cancellation notification:", err);
      }

      // In-app notification for the customer confirming the cancellation
      try {
        await db.insert(notificationsTable).values({
          userId: user.id,
          title: "Booking cancelled",
          message: `Your booking for "${out.eventTitle}" has been cancelled as requested.`,
        });
      } catch (err) {
        console.error("Failed to create customer cancellation notification:", err);
      }
    }

    res.json(out);
  },
);

// Admin can approve any booking
router.patch(
  "/admin/bookings/:bookingId/status",
  requireAuth(["admin"]),
  async (req, res) => {
    const id = Number(req.params["bookingId"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateBookingStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const bRows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
    const b = bRows[0];
    if (!b) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const rejectionReason =
      parsed.data.status === "cancelled"
        ? (parsed.data.rejectionReason ?? null)
        : null;

    if (parsed.data.status === "cancelled" && !rejectionReason?.trim()) {
      res.status(400).json({ error: "A rejection reason is required when cancelling a booking." });
      return;
    }

    const [updated] = await db
      .update(bookingsTable)
      .set({ status: parsed.data.status, approvedBy: "admin", rejectionReason: rejectionReason?.trim() ?? null })
      .where(eq(bookingsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [out] = await serializeBookings([updated]);

    // Award referral points when booking moves to confirmed/completed (same logic as partner path)
    if (
      (parsed.data.status === "confirmed" || parsed.data.status === "completed") &&
      b.status !== "confirmed" &&
      b.status !== "completed"
    ) {
      try {
        const priorPaid = await db
          .select()
          .from(bookingsTable)
          .where(
            and(
              eq(bookingsTable.userId, b.userId),
              inArray(bookingsTable.status, ["confirmed", "completed"]),
            ),
          );
        const otherPriorCount = priorPaid.filter((p) => p.id !== b.id).length;
        if (otherPriorCount === 0) {
          const refRows = await db
            .select()
            .from(referralsTable)
            .where(
              and(
                eq(referralsTable.referredId, b.userId),
                eq(referralsTable.status, "pending"),
              ),
            )
            .limit(1);
          const ref = refRows[0];
          if (ref) {
            const [referrer] = await db.select().from(usersTable).where(eq(usersTable.id, ref.referrerId)).limit(1);
            const [referred] = await db.select().from(usersTable).where(eq(usersTable.id, b.userId)).limit(1);
            if (referrer) {
              await db.update(usersTable).set({ points: (referrer.points || 0) + 50 }).where(eq(usersTable.id, referrer.id));
            }
            if (referred) {
              await db.update(usersTable).set({ points: (referred.points || 0) + 50 }).where(eq(usersTable.id, referred.id));
            }
            await db.update(referralsTable).set({ status: "completed", pointsAwarded: 50, completedAt: new Date() }).where(eq(referralsTable.id, ref.id));
          }
        }
      } catch (err) {
        console.error("Failed to award referral points (admin path)", err);
      }
    }

    if (out && b.status !== updated.status) {
      // Email simulation
      try {
        await sendBookingStatusEmail({
          bookingId: updated.id,
          eventTitle: out.eventTitle,
          vendorName: out.vendorName,
          userName: out.userName,
          userEmail: out.userEmail,
          bookingDate: updated.bookingDate,
          status: updated.status,
        });
      } catch (err) {
        console.error("Failed to send status notification (admin path):", err);
      }

      // Create in-app notification for the booking user
      try {
        let notifTitle = "";
        let notifMessage = "";
        if (updated.status === "confirmed") {
          notifTitle = "Booking confirmed!";
          notifMessage = `Your booking for "${out.eventTitle}" has been confirmed by admin.`;
        } else if (updated.status === "cancelled") {
          notifTitle = "Booking rejected";
          notifMessage = `Your booking for "${out.eventTitle}" was cancelled.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`;
        } else if (updated.status === "completed") {
          notifTitle = "Booking completed";
          notifMessage = `Your booking for "${out.eventTitle}" is marked as completed.`;
        }
        if (notifTitle) {
          await db.insert(notificationsTable).values({
            userId: b.userId,
            title: notifTitle,
            message: notifMessage,
          });
          sendWebPushToUser(b.userId, {
            title: notifTitle,
            body: notifMessage,
            url: "/dashboard/bookings",
            tag: `booking-status-${b.id}`,
          }).catch(() => {});
        }
      } catch (err) {
        console.error("Failed to create notification (admin path):", err);
      }
    }

    res.json(out);
  },
);

// Partner ticket scanner
router.post("/partner/scan-ticket", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rawCode = (req.body as Record<string, unknown>)["code"];
  if (typeof rawCode !== "string" || !rawCode.trim()) {
    res.status(400).json({ code: "INVALID_CODE", message: "Please enter a ticket code." });
    return;
  }
  const code = rawCode.trim().toUpperCase();

  // Determine booking ID and whether this is a new-format code (needs checksum verification)
  let bookingId: number;
  let needsChecksumVerification = false;

  // New format: PREFIX-NNNNNN-XX (e.g. BLCK-000042-F9 or BLCK2-000042-F9 for deduped prefix)
  const newFormatMatch = code.match(/^([A-Z][A-Z0-9]{1,7})-(\d{1,10})-([0-9A-F]{2})$/);
  // Legacy format: RV-NNNNNN, RVNNNNNN, or plain number
  const legacyMatch = code.match(/^(?:RV-?)?(\d+)$/);

  if (newFormatMatch && newFormatMatch[2] && newFormatMatch[1] !== "RV") {
    bookingId = parseInt(newFormatMatch[2], 10);
    needsChecksumVerification = true;
  } else if (legacyMatch && legacyMatch[1]) {
    bookingId = parseInt(legacyMatch[1], 10);
  } else {
    res.status(400).json({ code: "INVALID_CODE", message: "Invalid ticket code format. Expected e.g. BLCK-000042-F9 or RV-000042." });
    return;
  }

  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    res.status(400).json({ code: "INVALID_CODE", message: "Invalid ticket code." });
    return;
  }

  // Collect all vendor IDs this user is allowed to scan for:
  // 1. Their own vendor profile (if any)
  // 2. All venues where they have an accepted manager relationship
  const allowedVendorIds = new Set<number>();

  if (user.role === "vendor" || user.role === "admin") {
    const vRows = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
    if (vRows[0]) allowedVendorIds.add(vRows[0].id);
  }

  // Always check manager rows regardless of role (covers vendor users invited as managers elsewhere)
  const mgRows = await db.select({ vendorId: vendorManagersTable.vendorId })
    .from(vendorManagersTable)
    .where(and(eq(vendorManagersTable.managerId, user.id), eq(vendorManagersTable.status, "accepted")));
  for (const r of mgRows) allowedVendorIds.add(r.vendorId);

  if (allowedVendorIds.size === 0) {
    res.status(403).json({ code: "FORBIDDEN", message: "No partner profile found." });
    return;
  }

  // Load booking
  const bRows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  const b = bRows[0];
  if (!b) {
    res.status(404).json({ code: "NOT_FOUND", message: "Ticket not found. Check the code and try again." });
    return;
  }

  // Verify the booking belongs to a venue this user may scan for
  if (!allowedVendorIds.has(b.vendorId)) {
    res.status(403).json({ code: "WRONG_VENDOR", message: "This ticket belongs to a different partner's event." });
    return;
  }

  // Load vendor (format/checksum) and commission rates in parallel
  const [vRows, scanCommissionRows] = await Promise.all([
    db.select({ ticketSalt: vendorsTable.ticketSalt, ticketPrefix: vendorsTable.ticketPrefix })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, b.vendorId))
      .limit(1),
    db.select().from(vendorCommissionsTable).where(eq(vendorCommissionsTable.vendorId, b.vendorId)).limit(1),
  ]);
  const scanVendor = vRows[0];

  // Pre-compute commission for this booking
  const scanComm = scanCommissionRows[0];
  function calcScanCommission(booking: typeof b) {
    const price = Number(booking.finalPrice);
    const freeRate = Number(scanComm?.freeEntryRate ?? 0) / 100;
    const tickRate = Number(scanComm?.ticketRate ?? 0) / 100;
    const tableRate = Number(scanComm?.tableBookingRate ?? 0) / 100;
    let rate: number;
    if (booking.pubMode === "table") rate = tableRate;
    else if (price === 0 || booking.pubMode === "free") rate = freeRate;
    else rate = tickRate;
    const commissionAmount = Math.round(price * rate * 100) / 100;
    return {
      commissionRate: Math.round(rate * 10000) / 100,
      commissionAmount,
      netAmount: Math.round((price - commissionAmount) * 100) / 100,
    };
  }
  const scanCommInfo = calcScanCommission(b);

  // Lazy backfill: if vendor has no prefix/salt yet, generate them now so all future codes are secure
  let resolvedVendor = scanVendor;
  if (scanVendor && (!scanVendor.ticketPrefix || !scanVendor.ticketSalt)) {
    const existingPrefixes = (await db.select({ p: vendorsTable.ticketPrefix }).from(vendorsTable)).map((r) => r.p).filter(Boolean);
    const newPrefix = await generateUniqueTicketPrefix(
      (await db.select({ name: vendorsTable.businessName }).from(vendorsTable).where(eq(vendorsTable.id, b.vendorId)).limit(1))[0]?.name ?? "VEND",
      existingPrefixes,
    );
    const newSalt = generateTicketSalt();
    await db.update(vendorsTable).set({ ticketPrefix: newPrefix, ticketSalt: newSalt }).where(eq(vendorsTable.id, b.vendorId));
    resolvedVendor = { ticketPrefix: newPrefix, ticketSalt: newSalt };
  }

  if (needsChecksumVerification) {
    // New-format code: verify prefix + checksum against this vendor's stored salt
    if (!resolvedVendor?.ticketPrefix || !resolvedVendor?.ticketSalt) {
      res.status(400).json({ code: "INVALID_CODE", message: "Cannot verify ticket code — vendor is not yet configured." });
      return;
    }
    if (!verifyTicketCode(code, bookingId, { ticketPrefix: resolvedVendor.ticketPrefix, ticketSalt: resolvedVendor.ticketSalt })) {
      res.status(400).json({ code: "INVALID_CODE", message: "Ticket code is invalid or has been tampered with." });
      return;
    }
  }
  // Legacy RV-* codes: always accepted for backwards compatibility (tickets issued before migration)

  // Status checks
  if (b.status === "pending") {
    res.status(422).json({ code: "NOT_CONFIRMED", message: "This booking has not been confirmed yet." });
    return;
  }
  if (b.status === "cancelled") {
    res.status(422).json({ code: "CANCELLED", message: "This booking was cancelled and cannot be used for entry." });
    return;
  }
  if (b.status !== "confirmed") {
    res.status(422).json({ code: "INVALID_STATUS", message: `Booking is in status "${b.status}" and cannot be used for entry.` });
    return;
  }

  // Already checked in?
  if (b.checkedIn) {
    const checkedInAt = b.checkedInAt ? b.checkedInAt.toISOString() : null;
    const [out] = await serializeBookings([b]);
    res.status(409).json({
      code: "ALREADY_CHECKED_IN",
      message: "This ticket has already been used for entry.",
      checkedInAt,
      booking: out ? { ...out, ...scanCommInfo } : null,
    });
    return;
  }

  // Atomic check-in: only update if checkedIn is still false (prevents double-scan race)
  const now = new Date();
  const [updated] = await db
    .update(bookingsTable)
    .set({ checkedIn: true, checkedInAt: now })
    .where(and(eq(bookingsTable.id, b.id), eq(bookingsTable.checkedIn, false)))
    .returning();

  // Zero rows updated = another request beat us to it; re-fetch the current state
  if (!updated) {
    const [current] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, b.id));
    if (current) {
      const checkedInAt = current.checkedInAt ? current.checkedInAt.toISOString() : null;
      const [out] = await serializeBookings([current]);
      const currComm = calcScanCommission(current);
      res.status(409).json({
        code: "ALREADY_CHECKED_IN",
        message: "This ticket has already been used for entry.",
        checkedInAt,
        booking: out ? { ...out, ...currComm } : null,
      });
    } else {
      res.status(500).json({ code: "SERVER_ERROR", message: "Failed to check in. Please try again." });
    }
    return;
  }

  const [out] = await serializeBookings([updated]);

  // Award 100 loyalty points to the booking owner for attending the event (atomic increment)
  try {
    const [scanEvt] = await db
      .select({ title: eventsTable.title })
      .from(eventsTable)
      .where(eq(eventsTable.id, updated.eventId))
      .limit(1);
    await Promise.all([
      db.update(usersTable)
        .set({ points: sql`${usersTable.points} + 100` })
        .where(eq(usersTable.id, updated.userId)),
      db.insert(notificationsTable).values({
        userId: updated.userId,
        title: "You earned 100 points!",
        message: `You earned 100 points for attending "${scanEvt?.title ?? "this event"}"!`,
      }),
    ]);
  } catch (err) {
    req.log.error({ err, bookingId: updated.id }, "Failed to award scan-in loyalty points");
  }

  // Ensure any coupon used on this booking is marked as used (idempotent — belt-and-suspenders for partner_lead codes)
  if (updated.couponCode) {
    try {
      await db
        .update(couponsTable)
        .set({ used: true })
        .where(and(eq(couponsTable.code, updated.couponCode), eq(couponsTable.used, false)));
    } catch (err) {
      req.log.error({ err, couponCode: updated.couponCode }, "Failed to mark coupon used at scan time");
    }
  }

  // Fire-and-forget ticket-scanned email to the customer
  try {
    const customerRows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, updated.userId))
      .limit(1);
    const customer = customerRows[0];
    const eRows = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, updated.eventId))
      .limit(1);
    const evt = eRows[0];
    if (customer && evt) {
      sendTicketScannedEmail({
        to: customer.email,
        toName: customer.name,
        bookingId: updated.id,
        eventTitle: evt.title,
        vendorName: out?.vendorName ?? "this venue",
        checkedInAt: now,
      }).catch((err) => {
        console.error("Failed to send ticket-scanned email:", err);
      });
    }
  } catch (err) {
    console.error("Failed to trigger ticket-scanned email:", err);
  }

  const okComm = calcScanCommission(updated);
  res.json({ code: "OK", checkedInAt: now.toISOString(), booking: out ? { ...out, ...okComm } : null });
});

router.get("/bookings/:bookingId/ticket-code", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const bookingId = Number(req.params["bookingId"]);
  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    res.status(400).json({ error: "Invalid booking ID" });
    return;
  }
  const bRows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  const b = bRows[0];
  if (!b) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  // Only the booking owner or admin may fetch the ticket code
  if (b.userId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const vRows = await db.select({ ticketPrefix: vendorsTable.ticketPrefix, ticketSalt: vendorsTable.ticketSalt })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, b.vendorId))
    .limit(1);
  const v = vRows[0];
  const ticketCode = v
    ? generateTicketCode(b.id, { ticketPrefix: v.ticketPrefix ?? "", ticketSalt: v.ticketSalt ?? "" })
    : `RV-${String(b.id).padStart(6, "0")}`;
  res.json({ ticketCode });
});

router.get("/admin/bookings", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(bookingsTable)
    .orderBy(desc(bookingsTable.createdAt));
  res.json(await serializeBookings(rows));
});

export default router;
