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
  vendorCouponsTable,
  pointsLedgerTable,
  referralsTable,
  partnerBlockedDatesTable,
  paymentsTable,
  vendorManagersTable,
  vendorCommissionsTable,
  commissionLedgerTable,
  bookingAuditLogTable,
  announcementsTable,
} from "@workspace/db";
import {
  computeCommissionFromPlanned,
  computeCommissionFromActuals,
  classifyBookingType,
  REALISED_COMMISSION_TRIGGERS,
} from "../lib/commission";
import { sendExpoPushToUser } from "../lib/expoPush";
import { createUserNotification } from "../lib/notify";
import { generateTicketCode, verifyTicketCode, generateUniqueTicketPrefix, generateTicketSalt } from "../lib/ticketCode";
import { eq, desc, and, inArray, sql, gte, lte } from "drizzle-orm";
import { z } from "zod";
import {
  UpdateBookingStatusBody,
  RetryBookingPaymentBody,
  RetryBookingPaymentParams,
  PartnerCheckoutTicketBody,
  GetPartnerScannerBookingsQueryParams,
  GetAdminLiveOccupancyQueryParams,
  GetAdminLiveOccupancyBookingsParams,
  GetAdminLiveOccupancyBookingsQueryParams,
} from "@workspace/api-zod";
import { requireAuth, loadUserFromRequest, isNewUser } from "../lib/auth";
import {
  sendBookingCreatedEmails,
  sendBookingStatusEmail,
  sendCustomerCancelledBookingEmail,
} from "../lib/notifications";
import { initiatePayment, isPhonePeConfigured, getAppUrl } from "../lib/phonepe";
import { computeEffectiveRevenues, bookingDiscountRatio } from "../lib/effectiveRevenue";
import { respondInvalid } from "../lib/validationError";

/** How many hours before the event date customers are locked out of self-service cancellation. */
const CANCELLATION_CUTOFF_HOURS = Number(process.env["CANCELLATION_CUTOFF_HOURS"] ?? 3);

const EVENT_TYPES = [
  "wedding",
  "birthday",
  "casual",
  "surprise",
  "corporate",
  "cultural",
  "other",
] as const;

// Required-field policy: every booking-request field must be provided
// EXCEPT couponCode / pointsToUse / notes (and a handful of pub/event-only
// fields which the client only sends when relevant).
const CreateBookingBody = z.object({
  eventId: z.number().int().positive(),
  bookingDate: z.string().min(1, "Booking date is required"),
  guests: z.number().int().nonnegative().optional().default(0),
  // Optional per task spec.
  notes: z.string().optional().default(""),
  couponCode: z.string().optional().default(""),
  pointsToUse: z.number().int().nonnegative().optional().default(0),
  // Required.
  eventType: z.enum(EVENT_TYPES).default("other"),
  budgetRange: z.string().default(""),
  pubMode: z.enum(["", "ticket", "event", "event_booking"]).default(""),
  ticketWomen: z.number().int().nonnegative().default(0),
  ticketMen: z.number().int().nonnegative().default(0),
  ticketCouple: z.number().int().nonnegative().default(0),
  selectedPubEvent: z.string().default(""),
  announcementId: z.number().int().positive().optional(),
  personName: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  paymentMethod: z.enum(["cod", "online"]).default("online"),
  callbackScheme: z.enum(["royvento"]).optional(),
  arrivalTime: z.string().default(""),
}).superRefine((val, ctx) => {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  if (val.pubMode) {
    if (!val.personName.trim()) issue("personName", "Person name is required");
    if (!/^\d{10}$/.test(val.phone)) issue("phone", "Phone must be 10 digits");
    if (val.pubMode === "ticket" && val.ticketWomen + val.ticketMen + val.ticketCouple <= 0) {
      issue("ticketWomen", "Select at least one ticket");
    }
    if (val.pubMode !== "event_booking" && !val.arrivalTime.trim()) {
      issue("arrivalTime", "Arrival time is required");
    }
    if (val.pubMode === "event_booking" && !val.announcementId) {
      issue("announcementId", "Please select an event");
    }
  } else if (val.phone && !/^\d{10}$/.test(val.phone)) {
    issue("phone", "Phone must be 10 digits");
  }
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
  baseFee?: number | null;
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
  paymentMethod?: string;
  actualWomen?: number | null;
  actualMen?: number | null;
  actualCouple?: number | null;
  actualGuests?: number | null;
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
    const aw = b.actualWomen, am = b.actualMen, ac = b.actualCouple, ag = b.actualGuests;
    const hasActuals = aw != null || am != null || ac != null || ag != null;
    const actualEntry = hasActuals ? { women: aw, men: am, couple: ac, guests: ag } : null;
    const serFer = (e as { freeEntryRules?: { enabled?: boolean; genders?: string[]; days?: string[] } | null } | undefined)?.freeEntryRules ?? null;
    const serDayName = b.bookingDate ? ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(`${b.bookingDate}T12:00:00`).getDay()] : undefined;
    const serFerActive = !!(serFer?.enabled && serDayName && Array.isArray(serFer.days) && serFer.days.includes(serDayName));
    const serFerGenders = serFerActive ? (serFer?.genders ?? []).map((g) => String(g).toLowerCase()) : [];
    const serFerAllFree = serFerActive && ["women","men","couple"].every((g) => serFerGenders.includes(g));
    const serIsTierFree = (g: "women" | "men" | "couple") => serFerActive && serFerGenders.includes(g);
    let actualAmountDue: number | null = null;
    if (hasActuals) {
      if (b.pubMode === "ticket") {
        if (aw != null || am != null || ac != null) {
          const pw = serIsTierFree("women") ? 0 : Number(e?.priceWomen ?? 0);
          const pm = serIsTierFree("men") ? 0 : Number(e?.priceMen ?? 0);
          const pc = serIsTierFree("couple") ? 0 : Number(e?.priceCouple ?? 0);
          // Scale per-tier gross by the booking's discount ratio so coupon
          // codes and reward-points deductions applied at booking time flow
          // through to the door. Without this, a guest who paid online with
          // a 50% coupon would owe the full sticker price at the door —
          // mismatching the amount shown on their ticket.
          const gross = (aw ?? 0) * pw + (am ?? 0) * pm + (ac ?? 0) * pc;
          actualAmountDue = Math.round(gross * bookingDiscountRatio(b) * 100) / 100;
        }
      } else if (ag != null) {
        if (serFerAllFree) {
          actualAmountDue = 0;
        } else {
          // Non-ticket mode already uses finalPrice (post-discount) directly,
          // so the discount is implicitly applied.
          const guests = Math.max(1, b.guests);
          actualAmountDue = Math.round(((ag / guests) * Number(b.finalPrice)) * 100) / 100;
        }
      }
    }
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
      baseFee: b.baseFee ?? 0,
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
      paymentMethod: b.paymentMethod ?? "online",
      actualWomen: b.actualWomen ?? null,
      actualMen: b.actualMen ?? null,
      actualCouple: b.actualCouple ?? null,
      actualGuests: b.actualGuests ?? null,
      actualEntry,
      actualAmountDue,
      freeEntryRules: e?.freeEntryRules ?? null,
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
      ticketCode: v && v.ticketPrefix && v.ticketSalt
        ? generateTicketCode(b.id, { ticketPrefix: v.ticketPrefix, ticketSalt: v.ticketSalt })
        : `RV-${String(b.id).padStart(6, "0")}`,
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
    respondInvalid(res, parsed.error);
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
  // Mode-aware required-field enforcement: pub events MUST send pubMode and
  // contact details; pubMode/personName/phone/etc. cannot be silently
  // defaulted away. Mirrors the client's per-field validation.
  if (evt.type === "pub") {
    const issues: { path: string; message: string }[] = [];
    if (!parsed.data.pubMode) issues.push({ path: "pubMode", message: "Booking type is required" });
    if (!parsed.data.personName.trim()) issues.push({ path: "personName", message: "Person name is required" });
    if (!/^\d{10}$/.test(parsed.data.phone)) issues.push({ path: "phone", message: "Phone must be 10 digits" });
    if (parsed.data.pubMode === "ticket" && parsed.data.ticketWomen + parsed.data.ticketMen + parsed.data.ticketCouple <= 0) {
      issues.push({ path: "ticketWomen", message: "Select at least one ticket" });
    }
    if (parsed.data.pubMode && parsed.data.pubMode !== "event_booking" && !parsed.data.arrivalTime.trim()) {
      issues.push({ path: "arrivalTime", message: "Arrival time is required" });
    }
    if (issues.length > 0) {
      const summary = issues.map((i) => `${i.path}: ${i.message}`).join("; ");
      res.status(400).json({ error: summary, issues });
      return;
    }
  }

  // Validate announcement for event_booking mode
  let announcementRow: { id: number; title: string; announceDate: string; capacity: number | null; isActive: boolean } | undefined;
  if (parsed.data.pubMode === "event_booking" && parsed.data.announcementId) {
    const aRows = await db
      .select({ id: announcementsTable.id, title: announcementsTable.title, announceDate: announcementsTable.announceDate, capacity: announcementsTable.capacity, isActive: announcementsTable.isActive })
      .from(announcementsTable)
      .where(eq(announcementsTable.id, parsed.data.announcementId))
      .limit(1);
    announcementRow = aRows[0];
    if (!announcementRow) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (!announcementRow.isActive) {
      res.status(400).json({ error: "This event is no longer active" });
      return;
    }
    // Capacity check
    if (announcementRow.capacity != null && announcementRow.capacity > 0) {
      const [{ cnt }] = await db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(bookingsTable)
        .where(
          and(
            eq(bookingsTable.announcementId, announcementRow.id),
            inArray(bookingsTable.status, ["confirmed", "completed"]),
          ),
        );
      const booked = Number(cnt ?? 0);
      const requestedGuests = Math.max(1, parsed.data.guests || 0);
      if (booked + requestedGuests > announcementRow.capacity) {
        res.status(400).json({ error: `This event is at full capacity (${announcementRow.capacity} spots). Only ${Math.max(0, announcementRow.capacity - booked)} remaining.` });
        return;
      }
    }
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

  // Per-gender free-entry: only tiers in fer.genders are zero-priced; table
  // mode is free only when all three genders are listed.
  const FREE_ENTRY_DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const fer = (evt as { freeEntryRules?: { enabled?: boolean; genders?: string[]; days?: string[] } | null }).freeEntryRules;
  const bookingDayName = FREE_ENTRY_DAY_ABBRS[new Date(`${dateStr}T12:00:00`).getDay()];
  const ferActive = !!(fer?.enabled && bookingDayName && Array.isArray(fer.days) && fer.days.includes(bookingDayName));
  const ferGenders = ferActive ? (fer?.genders ?? []).map((g) => String(g).toLowerCase()) : [];
  const ferAllGendersFree = ferActive && ["women", "men", "couple"].every((g) => ferGenders.includes(g));
  const isTierFree = (g: "women" | "men" | "couple") => ferActive && ferGenders.includes(g);

  let totalPrice = 0;
  let guestsCount = parsed.data.guests || 0;

  if (evt.type === "pub" && parsed.data.pubMode === "ticket") {
    const w = parsed.data.ticketWomen || 0;
    const m = parsed.data.ticketMen || 0;
    const c = parsed.data.ticketCouple || 0;
    // Per-gender zero-pricing: only tiers in fer.genders are free.
    const pw = isTierFree("women") ? 0 : Number(evt.priceWomen);
    const pm = isTierFree("men") ? 0 : Number(evt.priceMen);
    const pc = isTierFree("couple") ? 0 : Number(evt.priceCouple);
    totalPrice = w * pw + m * pm + c * pc;
    guestsCount = w + m + c * 2;
  } else if (evt.type === "pub" && parsed.data.pubMode === "event_booking") {
    // Event bookings use the pub's standard price × guest count
    totalPrice = Number(evt.price) * Math.max(1, guestsCount);
    if (guestsCount === 0) guestsCount = 1;
  } else {
    // Table / event-mode: no per-gender concept, so only treat as free when
    // every gender is listed. Otherwise charge the regular cover.
    totalPrice = ferAllGendersFree ? 0 : Number(evt.price) * Math.max(1, guestsCount);
    if (guestsCount === 0) guestsCount = 1;
  }

  // Apply coupon — skip on free-entry days (totalPrice === 0).
  // Priority: user-specific coupons first, then vendor public coupons.
  let discountAmount = 0;
  let validCode = "";
  if (parsed.data.couponCode && totalPrice > 0) {
    const upperCode = parsed.data.couponCode.trim().toUpperCase();

    // 1. Check user-specific coupon
    const couponRows = await db
      .select()
      .from(couponsTable)
      .where(
        and(
          eq(couponsTable.code, upperCode),
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
      await db.update(couponsTable).set({ used: true }).where(eq(couponsTable.id, coupon.id));
    } else {
      // 2. Check vendor public coupon
      const vcRows = await db
        .select()
        .from(vendorCouponsTable)
        .where(
          and(
            eq(vendorCouponsTable.code, upperCode),
            eq(vendorCouponsTable.active, true),
            eq(vendorCouponsTable.vendorId, evt.vendorId),
          ),
        )
        .limit(1);
      const vc = vcRows[0];
      if (vc) {
        // Applicability check
        const isTicketMode = parsed.data.pubMode === "ticket";
        const bookingKind = isTicketMode ? "ticket" : "event";
        if (vc.applicableTo !== "both" && vc.applicableTo !== bookingKind) {
          res.status(400).json({ error: `This coupon is only valid for ${vc.applicableTo} bookings.` });
          return;
        }
        if (vc.maxUses !== null && vc.usedCount >= vc.maxUses) {
          res.status(400).json({ error: "This coupon has reached its usage limit." });
          return;
        }
        if (vc.expiresAt && new Date(vc.expiresAt) < new Date()) {
          res.status(400).json({ error: "This coupon has expired." });
          return;
        }
        const vcValue = Number(vc.discountValue);
        discountAmount = vc.discountType === "fixed"
          ? Math.min(Math.round(vcValue), totalPrice)
          : Math.round(totalPrice * (vcValue / 100));
        validCode = vc.code;
        // Increment usedCount (best-effort — concurrent over-use is acceptable)
        await db.update(vendorCouponsTable)
          .set({ usedCount: vc.usedCount + 1 })
          .where(eq(vendorCouponsTable.id, vc.id));
      }
    }
  }

  // Apply new-user 20% off (within 10 days of signup, no coupon used)
  if (!validCode && isNewUser(user.createdAt)) {
    const newUserDiscount = Math.round(totalPrice * 0.2);
    discountAmount = Math.max(discountAmount, newUserDiscount);
  }

  // Deduct points immediately to prevent double-spend. Restored on payment failure.
  // Rate: 100 pts = ₹5 (1 pt = ₹0.05). Cap: points discount ≤ 2% of booking value.
  const POINTS_RUPEE_RATE = 0.05;
  const pointsToUse = Math.min(parsed.data.pointsToUse || 0, user.points);
  const maxPointsDiscount = Math.floor(totalPrice * 0.02); // 2% of booking value
  const pointsCap = Math.min(Math.max(0, totalPrice - discountAmount), maxPointsDiscount);
  const maxPointsFromCap = Math.floor(pointsCap / POINTS_RUPEE_RATE);
  const pointsUsed = Math.min(pointsToUse, maxPointsFromCap); // points count consumed
  const pointsDeduction = pointsUsed * POINTS_RUPEE_RATE;     // ₹ value deducted
  if (pointsUsed > 0) {
    await db
      .update(usersTable)
      .set({ points: user.points - pointsUsed })
      .where(eq(usersTable.id, user.id));
    // Write spending entry to ledger (best-effort)
    db.insert(pointsLedgerTable).values({
      userId: user.id,
      points: -pointsUsed,
      source: "redemption",
    }).catch(() => {});
  }

  const finalPrice = Math.max(0, totalPrice - discountAmount - pointsDeduction);

  // Base fee: charged on top of finalPrice. Excluded for fully-free bookings (₹0).
  // Excluded for free-entry / subscription / ₹0 payable scenarios.
  const bfEnabled = vendorSchedule?.baseFeeEnabled ?? true;
  const bfPct = parseFloat(vendorSchedule?.baseFeePercent ?? "3.5");
  const baseFee = (bfEnabled && finalPrice > 0) ? Math.round(finalPrice * bfPct / 100) : 0;

  // Online payment / PhonePe disabled — all bookings are COD.
  const wantsOnline = false;
  const usePhonePe = false;
  const bookingStatus = "confirmed";

  const bookingValues = {
    eventId: evt.id,
    userId: user.id,
    vendorId: evt.vendorId,
    bookingDate: dateStr,
    guests: guestsCount,
    totalPrice: String(totalPrice),
    couponCode: validCode,
    discountAmount: String(discountAmount),
    finalPrice: String(finalPrice),
    baseFee,
    budgetRange: parsed.data.budgetRange ?? "",
    notes: parsed.data.notes ?? "",
    eventType: parsed.data.eventType ?? "other",
    status: bookingStatus,
    pubMode: parsed.data.pubMode || "",
    ticketWomen: parsed.data.ticketWomen || 0,
    ticketMen: parsed.data.ticketMen || 0,
    ticketCouple: parsed.data.ticketCouple || 0,
    selectedPubEvent: parsed.data.pubMode === "event_booking" && announcementRow ? announcementRow.title : (parsed.data.selectedPubEvent || ""),
    announcementId: parsed.data.announcementId ?? null,
    personName: parsed.data.personName || user.name,
    phone: parsed.data.phone ?? "",
    pointsUsed,
    arrivalTime: parsed.data.arrivalTime || null,
    approvedBy: "auto",
    paymentMethod: "cod" as const,
  };

  // All bookings are confirmed immediately (COD only — online payment disabled).
  // No vendor balance credit since commission is realised at scan time.
  const [bMaybe] = await db.insert(bookingsTable).values(bookingValues).returning();
  if (!bMaybe) {
    res.status(500).json({ error: "Failed" });
    return;
  }
  const b = bMaybe;

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
    req.log.error({ err }, "Failed to send booking notifications");
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
    req.log.error({ err }, "Failed to award referral points at booking creation");
  }

  try {
    await createUserNotification({
      userId: user.id,
      title: "Booking confirmed!",
      message: `Your booking for "${out?.eventTitle ?? evt.title}" is confirmed. See you there!`,
      url: "/dashboard/bookings",
      tag: `booking-${out?.id ?? b.id}`,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create booking confirmation notification");
  }

  // Award loyalty points for booking: +50 for ticket, +60 for table/event/event_booking.
  try {
    const isTicket = b.pubMode === "ticket";
    const earnedPts = isTicket ? 50 : 60;
    const ptSource = b.pubMode === "event_booking" ? "event_booking" : isTicket ? "ticket_booking" : "table_booking";
    const ptExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await Promise.all([
      db.update(usersTable)
        .set({ points: sql`${usersTable.points} + ${earnedPts}` })
        .where(eq(usersTable.id, user.id)),
      db.insert(pointsLedgerTable).values({
        userId: user.id,
        points: earnedPts,
        source: ptSource,
        bookingId: b.id,
        expiresAt: ptExpiresAt,
      }),
    ]);
  } catch (err) {
    req.log.error({ err, bookingId: b.id }, "Failed to award booking loyalty points");
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

// Online payment / retry-payment disabled — all bookings are COD
// router.post("/bookings/:id/retry-payment", ...);

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
    eventRate: row?.eventRate ?? "0",
  });
});

router.get("/partner/analytics", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vRows = await db.select().from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
  const vendor = vRows[0];
  const emptyTypeSummary = { count: 0, grossRevenue: 0, commissionAmount: 0, netRevenue: 0, peopleCount: 0 };
  if (!vendor) {
    res.json({
      totalEarnings: 0, monthEarnings: 0, codRevenue: 0, onlineRevenue: 0,
      grossEarnings: 0, netEarnings: 0, totalCommission: 0, codCommission: 0, onlineCommission: 0,
      commissionRates: { freeEntryRate: "0", ticketRate: "0", tableBookingRate: "0", eventRate: "0" },
      commissionSummary: { freeEntry: emptyTypeSummary, ticket: emptyTypeSummary, table: emptyTypeSummary, eventBooking: emptyTypeSummary },
      perEvent: [], dailyRevenue: [], dailyCommission: [],
      totalWomen: 0, totalMen: 0, totalCouple: 0,
    });
    return;
  }

  const fromStr = req.query["from"] as string | undefined;
  const toStr = req.query["to"] as string | undefined;
  const rangeStart = fromStr ? new Date(`${fromStr}T00:00:00Z`) : undefined;
  const rangeEnd = toStr ? new Date(`${toStr}T23:59:59Z`) : undefined;

  // Revenue / commission / earnings KPIs are gated on `checkedIn = true`.
  // After the QR-scan refactor, that flag flips ONLY when the manager taps
  // "Save Actual Entry" in the scanner — never on a bare scan. So Partner
  // Analytics shows ₹0 / 0 commission for a booking until its check-in is
  // finalized at the door, matching the spec: "Only when they click the
  // 'Save Actual Entry' button … trigger all analytics and commission
  // calculations." Bookings that are confirmed but not yet finalized still
  // exist for the partner — they appear in the Bookings tab and Live
  // Occupancy panel — they just don't move money in the analytics.
  const [allBookings, commissions] = await Promise.all([
    db
      .select()
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.vendorId, vendor.id),
          inArray(bookingsTable.status, ["confirmed", "completed"]),
          eq(bookingsTable.checkedIn, true),
          rangeStart ? gte(bookingsTable.createdAt, rangeStart) : undefined,
          rangeEnd ? lte(bookingsTable.createdAt, rangeEnd) : undefined,
        ),
      ),
    db.select().from(vendorCommissionsTable).where(eq(vendorCommissionsTable.vendorId, vendor.id)).limit(1),
  ]);

  const commRow = commissions[0];

  // Pre-fetch every event so we can read freeEntryRules without N+1 lookups.
  // Source of truth for commission math: lib/commission.ts → computeCommissionFromActuals.
  // The Admin Panel → Commission Report uses the same helper, so Partner
  // Dashboard → Analytics → Platform Charges agrees with admin to the rupee.
  const _commEventIds = Array.from(new Set(allBookings.map((b) => b.eventId)));
  const _commEventRows = _commEventIds.length > 0
    ? await db.select().from(eventsTable).where(inArray(eventsTable.id, _commEventIds))
    : [];
  const commEventMap = new Map(_commEventRows.map((e) => [e.id, e]));

  // Wrapper that emits the {freeEntry, ticket, table} split shape used by the
  // dashboard. Each booking falls into exactly ONE bucket (matching admin's
  // classifyBookingType). Per the rate-card spec:
  //   Free Entry    = freeEntryRate × people  (couple = 2 people)
  //   Ticket        = sum over tiers of ticketRate × tickets (free tiers
  //                   billed at freeEntryRate under FER)
  //   Table Booking = tableBookingRate × guests
  function calcCommSplit(b: typeof allBookings[number], grossRev: number) {
    const out = {
      freeEntry:    { count: 0, comm: 0, gross: 0, people: 0 },
      ticket:       { count: 0, comm: 0, gross: 0, people: 0 },
      table:        { count: 0, comm: 0, gross: 0, people: 0 },
      eventBooking: { count: 0, comm: 0, gross: 0, people: 0 },
    };
    const evt = commEventMap.get(b.eventId);
    const fer = (evt as { freeEntryRules?: { enabled?: boolean; days?: string[]; genders?: string[] } | null } | undefined)?.freeEntryRules ?? null;
    const result = computeCommissionFromActuals(
      b,
      commRow ?? { freeEntryRate: 0, ticketRate: 0, tableBookingRate: 0, eventRate: 0 },
      { priceWomen: evt?.priceWomen, priceMen: evt?.priceMen, priceCouple: evt?.priceCouple },
      fer,
    );
    const bucket = result.bookingType === "free_entry"
      ? "freeEntry"
      : result.bookingType === "ticket"
        ? "ticket"
        : result.bookingType === "event_booking"
          ? "eventBooking"
          : "table";
    out[bucket].count = 1;
    out[bucket].comm = result.amount;
    out[bucket].gross = grossRev;
    out[bucket].people = result.unitCount;
    return out;
  }

  function commTotal(split: ReturnType<typeof calcCommSplit>) {
    return split.freeEntry.comm + split.ticket.comm + split.table.comm + split.eventBooking.comm;
  }

  // Summary figures
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  let monthEarnings = 0;
  let codRevenue = 0;
  let onlineRevenue = 0;
  let totalCommission = 0;
  let collectedCommission = 0;
  let pendingCommission = 0;
  let codCommission = 0;
  let onlineCommission = 0;
  const commSummary = {
    freeEntry:    { count: 0, grossRevenue: 0, commissionAmount: 0, netRevenue: 0, peopleCount: 0 },
    ticket:       { count: 0, grossRevenue: 0, commissionAmount: 0, netRevenue: 0, peopleCount: 0 },
    table:        { count: 0, grossRevenue: 0, commissionAmount: 0, netRevenue: 0, peopleCount: 0 },
    eventBooking: { count: 0, grossRevenue: 0, commissionAmount: 0, netRevenue: 0, peopleCount: 0 },
  };

  // Per-booking effective revenue: online → finalPrice; COD → actual cash
  // collected (₹0 if not recorded). Still computed because the partner
  // dashboard's COD Collected (Actual) card needs the per-booking cash
  // value to attribute to scanned bookings. The recorded/pending counts
  // and aggregate from the helper are derived below from the QR-scan
  // gating instead, so we deliberately discard those helper outputs.
  const { byBookingId: revenueByBookingId } = await computeEffectiveRevenues(allBookings);

  // Fetch realised commission amounts from the ledger. For bookings that have
  // already been checked in or paid online the ledger entry is the source of
  // truth; calcCommSplit() is only used as a fallback for bookings not yet
  // realised (e.g. a COD booking awaiting check-in).
  const allBookingIds = allBookings.map((b) => b.id);
  const ledgerEntries = allBookingIds.length > 0
    ? await db
        .select({ bookingId: commissionLedgerTable.bookingId, amount: commissionLedgerTable.amount })
        .from(commissionLedgerTable)
        .where(
          and(
            inArray(commissionLedgerTable.trigger, [...REALISED_COMMISSION_TRIGGERS]),
            inArray(commissionLedgerTable.bookingId, allBookingIds),
          ),
        )
    : [];
  const ledgerAmtByBookingId = new Map<number, number>();
  for (const row of ledgerEntries) {
    if (row.bookingId != null) {
      ledgerAmtByBookingId.set(row.bookingId, (ledgerAmtByBookingId.get(row.bookingId) ?? 0) + Number(row.amount ?? 0));
    }
  }

  const splitCache = new Map<number, ReturnType<typeof calcCommSplit>>();
  // Gross Earnings KPI = sum of finalPrice for every confirmed/completed
  // booking, i.e. exactly the sum of the per-type Gross column in the
  // Breakdown by Booking Type table. This matches the Admin Commission
  // Report's per-vendor totalRevenue to the rupee.
  let grossEarnings = 0;
  // COD Collected (Actual) KPI = sum of actuals-based revenue for COD
  // bookings that have a realised commission_ledger entry (i.e. a QR scan
  // has happened). Bookings whose actuals were edited by some other path
  // without a scan don't count toward the displayed total — the spec calls
  // for cash collected AFTER a successful scan.
  let scannedCodRevenue = 0;
  let scannedCodRecordedCount = 0;
  let scannedPendingCount = 0;

  for (const b of allBookings) {
    const fp = Number(b.finalPrice);
    const isCod = b.paymentMethod === "cod";
    // Per-booking realised revenue. For COD bookings this is the actuals
    // × FER-aware per-tier price × discount ratio (from computeEffectiveRevenues).
    // For online bookings it's finalPrice (already settled upstream — we
    // don't issue refunds when fewer guests show up).
    const bookingRevenue = revenueByBookingId.get(b.id) ?? 0;

    if (isCod) codRevenue += bookingRevenue;
    else onlineRevenue += bookingRevenue;

    grossEarnings += bookingRevenue;
    if (new Date(b.createdAt) >= monthStart) monthEarnings += bookingRevenue;

    const isCollected = ledgerAmtByBookingId.has(b.id);
    if (isCod) {
      if (isCollected) {
        scannedCodRevenue += bookingRevenue;
        scannedCodRecordedCount++;
      } else {
        scannedPendingCount++;
      }
    }

    // Commission split — uses actuals via calcCommSplit → computeCommissionFromActuals.
    // The bucket Gross is the booking's realised revenue so a partner who
    // reduced 5 booked → 3 actual sees both gross and commission drop in
    // lockstep on this card.
    const split = calcCommSplit(b, bookingRevenue);
    splitCache.set(b.id, split);
    const commissionAmount = commTotal(split);
    totalCommission += commissionAmount;
    if (isCollected) collectedCommission += commissionAmount;
    else pendingCommission += commissionAmount;
    if (isCod) codCommission += commissionAmount;
    else onlineCommission += commissionAmount;
    for (const k of ["freeEntry", "ticket", "table", "eventBooking"] as const) {
      commSummary[k].count += split[k].count;
      commSummary[k].grossRevenue += split[k].gross;
      commSummary[k].commissionAmount += rnd2(split[k].comm);
      commSummary[k].peopleCount += split[k].people;
    }
  }
  // Compute net per type
  for (const k of Object.keys(commSummary) as (keyof typeof commSummary)[]) {
    commSummary[k].netRevenue = commSummary[k].grossRevenue - commSummary[k].commissionAmount;
  }

  // Per-event breakdown — fetch event titles for any events referenced by these bookings.
  const _eventIds = Array.from(new Set(allBookings.map((b) => b.eventId)));
  const _events = _eventIds.length > 0
    ? await db.select({ id: eventsTable.id, title: eventsTable.title }).from(eventsTable).where(inArray(eventsTable.id, _eventIds))
    : [];
  const eTitleMap = new Map(_events.map((e) => [e.id, e.title]));
  const perEventMap = new Map<number, {
    eventId: number; eventTitle: string;
    bookingCount: number; ticketWomen: number; ticketMen: number; ticketCouple: number;
    revenue: number; peopleCount: number;
  }>();
  for (const b of allBookings) {
    // Revenue, headcount, and people-count all follow ACTUAL door counts
    // when the manager has saved them; otherwise fall back to booked.
    // Keeps the per-event row consistent with the Gross Earnings KPI
    // above (which is now realised revenue, not sum-of-finalPrice).
    const rev = revenueByBookingId.get(b.id) ?? 0;
    const aw = b.actualWomen ?? b.ticketWomen;
    const am = b.actualMen ?? b.ticketMen;
    const ac = b.actualCouple ?? b.ticketCouple;
    const ag = b.actualGuests ?? b.guests;
    const tierHeads = aw + am + ac * 2;
    const people = tierHeads > 0 ? tierHeads : Math.max(0, ag);
    const existing = perEventMap.get(b.eventId);
    if (existing) {
      existing.bookingCount += 1;
      existing.ticketWomen += aw;
      existing.ticketMen += am;
      existing.ticketCouple += ac;
      existing.revenue += rev;
      existing.peopleCount += people;
    } else {
      perEventMap.set(b.eventId, {
        eventId: b.eventId,
        eventTitle: eTitleMap.get(b.eventId) ?? `Event #${b.eventId}`,
        bookingCount: 1,
        ticketWomen: aw,
        ticketMen: am,
        ticketCouple: ac,
        revenue: rev,
        peopleCount: people,
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
    // Daily revenue chart uses realised per-booking revenue (actuals-aware
    // for COD, finalPrice for online) so the column total reconciles with
    // Total Earnings / Gross Earnings tiles above.
    const rev = revenueByBookingId.get(b.id) ?? 0;
    if (dailyMap.has(day)) {
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + rev);
      const cachedSplit = splitCache.get(b.id);
      // Always use the actuals-based computed commission (same as totalCommission
      // above) so the daily chart is consistent with every other commission tile.
      // Using ledger amounts here caused stale values for online bookings whose
      // ledger was written at payment-webhook time (before actuals were known).
      const dayComm = cachedSplit ? commTotal(cachedSplit) : 0;
      dailyCommissionMap.set(day, (dailyCommissionMap.get(day) ?? 0) + dayComm);
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
  // Every revenue figure on this page is now actuals-aware: COD bookings
  // use sum(actualCounts × FER-aware per-tier price × discount ratio),
  // online bookings use finalPrice (no refund issued for fewer guests).
  // Gross Earnings, Total Earnings, and Net Earnings all derive from the
  // same realised number so the tiles can never diverge. Reducing
  // headcount at Save Actual Entry instantly drops every figure on the
  // page on next refetch.
  res.json({
    totalEarnings: Math.round(grossEarnings),
    monthEarnings: Math.round(monthEarnings),
    codRevenue: Math.round(codRevenue),
    onlineRevenue: Math.round(onlineRevenue),
    // COD Collected (Actual) — actuals × per-type prices for COD bookings
    // that have a realised commission_ledger entry. Mixed bookings (some
    // tiers FER-free, some paid) correctly count only the paid tiers.
    actualCodRevenue: Math.round(scannedCodRevenue),
    actualCodRecordedCount: scannedCodRecordedCount,
    pendingActualsCount: scannedPendingCount,
    grossEarnings: Math.round(grossEarnings),
    netEarnings: Math.round(grossEarnings - totalCommission),
    totalCommission: rnd2(totalCommission),
    collectedCommission: rnd2(collectedCommission),
    pendingCommission: rnd2(pendingCommission),
    codCommission: rnd2(codCommission),
    onlineCommission: rnd2(onlineCommission),
    commissionRates: {
      freeEntryRate: commRow?.freeEntryRate ?? "0",
      ticketRate: commRow?.ticketRate ?? "0",
      tableBookingRate: commRow?.tableBookingRate ?? "0",
      eventRate: commRow?.eventRate ?? "0",
    },
    commissionSummary: {
      freeEntry:    { count: commSummary.freeEntry.count,    grossRevenue: Math.round(commSummary.freeEntry.grossRevenue),    commissionAmount: rnd2(commSummary.freeEntry.commissionAmount),    netRevenue: Math.round(commSummary.freeEntry.netRevenue),    peopleCount: commSummary.freeEntry.peopleCount },
      ticket:       { count: commSummary.ticket.count,       grossRevenue: Math.round(commSummary.ticket.grossRevenue),       commissionAmount: rnd2(commSummary.ticket.commissionAmount),       netRevenue: Math.round(commSummary.ticket.netRevenue),       peopleCount: commSummary.ticket.peopleCount },
      table:        { count: commSummary.table.count,        grossRevenue: Math.round(commSummary.table.grossRevenue),        commissionAmount: rnd2(commSummary.table.commissionAmount),        netRevenue: Math.round(commSummary.table.netRevenue),        peopleCount: commSummary.table.peopleCount },
      eventBooking: { count: commSummary.eventBooking.count, grossRevenue: Math.round(commSummary.eventBooking.grossRevenue), commissionAmount: rnd2(commSummary.eventBooking.commissionAmount), netRevenue: Math.round(commSummary.eventBooking.netRevenue), peopleCount: commSummary.eventBooking.peopleCount },
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
    eventIds.length > 0 ? db.select({ id: eventsTable.id, title: eventsTable.title, priceWomen: eventsTable.priceWomen, priceMen: eventsTable.priceMen, priceCouple: eventsTable.priceCouple }).from(eventsTable).where(inArray(eventsTable.id, eventIds)) : [],
    userIds.length > 0 ? db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: sql<string>`coalesce(phone,'')` }).from(usersTable).where(inArray(usersTable.id, userIds)) : [],
  ]);

  const eventMap = new Map(events.map((e) => [e.id, e]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  const ATTEND_FREE_ENTRY_DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const attendEventRows = eventIds.length > 0
    ? await db.select({ id: eventsTable.id, freeEntryRules: eventsTable.freeEntryRules }).from(eventsTable).where(inArray(eventsTable.id, eventIds))
    : [];
  const attendFerMap = new Map(attendEventRows.map((e) => [e.id, e.freeEntryRules as { enabled?: boolean; genders?: string[]; days?: string[] } | null]));
  const attendanceRows = rows.map((b) => {
    const u = userMap.get(b.userId);
    const e = eventMap.get(b.eventId);
    const aw = b.actualWomen, am = b.actualMen, ac = b.actualCouple, ag = b.actualGuests;
    const hasActuals = aw != null || am != null || ac != null || ag != null;
    const fer = attendFerMap.get(b.eventId) ?? null;
    const dayName = b.bookingDate ? ATTEND_FREE_ENTRY_DAY_ABBRS[new Date(`${b.bookingDate}T12:00:00`).getDay()] : undefined;
    const ferActive = !!(fer?.enabled && dayName && Array.isArray(fer.days) && fer.days.includes(dayName));
    const ferGenders = ferActive ? (fer?.genders ?? []).map((g) => String(g).toLowerCase()) : [];
    const ferAllGendersFree = ferActive && ["women", "men", "couple"].every((g) => ferGenders.includes(g));
    const isTierFree = (g: "women" | "men" | "couple") => ferActive && ferGenders.includes(g);
    let actualAmountDue: number | null = null;
    if (hasActuals) {
      if (b.pubMode === "ticket") {
        if (aw != null || am != null || ac != null) {
          const pw = isTierFree("women") ? 0 : Number(e?.priceWomen ?? 0);
          const pm = isTierFree("men") ? 0 : Number(e?.priceMen ?? 0);
          const pc = isTierFree("couple") ? 0 : Number(e?.priceCouple ?? 0);
          actualAmountDue = Math.round(((aw ?? 0) * pw + (am ?? 0) * pm + (ac ?? 0) * pc) * 100) / 100;
        }
      } else if (ag != null) {
        if (ferAllGendersFree) {
          actualAmountDue = 0;
        } else {
          const guests = Math.max(1, b.guests);
          actualAmountDue = Math.round(((ag / guests) * Number(b.finalPrice)) * 100) / 100;
        }
      }
    }
    return {
      id: b.id,
      vendorId: b.vendorId,
      vendorName: vendor.businessName,
      eventId: b.eventId,
      eventTitle: e?.title ?? "",
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
      paymentMethod: b.paymentMethod ?? "online",
      finalPrice: Number(b.finalPrice),
      pubMode: b.pubMode,
      actualWomen: aw,
      actualMen: am,
      actualCouple: ac,
      actualGuests: ag,
      actualAmountDue,
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
  // Counts (across all statuses) and trend chart counts stay in SQL — they don't
  // depend on revenue logic.
  const [statsRows, monthlyTrendRows, confirmedBookings] = await Promise.all([
    db.select({
      totalBookings: sql<number>`count(*)::int`,
      countConfirmed: sql<number>`count(*) filter (where ${bookingsTable.status} = 'confirmed')::int`,
      countCompleted: sql<number>`count(*) filter (where ${bookingsTable.status} = 'completed')::int`,
      countCancelled: sql<number>`count(*) filter (where ${bookingsTable.status} = 'cancelled')::int`,
      countPending: sql<number>`count(*) filter (where ${bookingsTable.status} = 'pending')::int`,
      totalGuests: sql<number>`coalesce(sum(case when ${bookingsTable.status} in ('confirmed','completed') then coalesce(${bookingsTable.ticketWomen},0)+coalesce(${bookingsTable.ticketMen},0)+coalesce(${bookingsTable.ticketCouple},0) else 0 end),0)::int`,
    }).from(bookingsTable).where(baseWhere),
    db.select({
      month: sql<string>`to_char(${bookingsTable.bookingDate}, 'YYYY-MM')`,
      confirmed: sql<number>`count(*) filter (where ${bookingsTable.status} in ('confirmed','completed'))::int`,
      cancelled: sql<number>`count(*) filter (where ${bookingsTable.status} = 'cancelled')::int`,
    }).from(bookingsTable).where(baseWhere)
      .groupBy(sql`to_char(${bookingsTable.bookingDate}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${bookingsTable.bookingDate}, 'YYYY-MM')`),
    // Revenue / per-event totals only count FINALIZED bookings (checkedIn=true,
    // which now flips only when the manager taps Save Actual Entry). The
    // counts above (totalBookings / countConfirmed / …) still count every
    // confirmed booking so the partner can see "you have N bookings"; only
    // the money columns are gated.
    db.select().from(bookingsTable)
      .where(and(
        baseWhere,
        inArray(bookingsTable.status, [...confirmedStatuses]),
        eq(bookingsTable.checkedIn, true),
      )),
  ]);

  const { byBookingId } = await computeEffectiveRevenues(confirmedBookings);

  let totalRevenue = 0;
  const monthlyRevMap = new Map<string, number>();
  const perEventMap = new Map<number, {
    eventId: number; eventTitle: string;
    bookingCount: number; ticketWomen: number; ticketMen: number; ticketCouple: number; revenue: number;
  }>();
  for (const b of confirmedBookings) {
    const rev = byBookingId.get(b.id) ?? 0;
    totalRevenue += rev;
    const month = (b.bookingDate ?? "").slice(0, 7);
    if (month) monthlyRevMap.set(month, (monthlyRevMap.get(month) ?? 0) + rev);
    // All confirmedBookings are checkedIn=true, so prefer actual door counts.
    const ew = b.actualWomen ?? b.ticketWomen;
    const em = b.actualMen ?? b.ticketMen;
    const ec = b.actualCouple ?? b.ticketCouple;
    const existing = perEventMap.get(b.eventId);
    if (existing) {
      existing.bookingCount += 1;
      existing.ticketWomen += ew;
      existing.ticketMen += em;
      existing.ticketCouple += ec;
      existing.revenue += rev;
    } else {
      perEventMap.set(b.eventId, {
        eventId: b.eventId,
        eventTitle: "",
        bookingCount: 1,
        ticketWomen: ew,
        ticketMen: em,
        ticketCouple: ec,
        revenue: rev,
      });
    }
  }

  const eventIds = Array.from(perEventMap.keys());
  if (eventIds.length > 0) {
    const ev = await db.select({ id: eventsTable.id, title: eventsTable.title })
      .from(eventsTable).where(inArray(eventsTable.id, eventIds));
    for (const e of ev) {
      const rec = perEventMap.get(e.id);
      if (rec) rec.eventTitle = e.title;
    }
  }

  const monthlyRevenue = Array.from(monthlyRevMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue: Math.round(revenue) }));
  const perEvent = Array.from(perEventMap.values())
    .map((r) => ({ ...r, revenue: Math.round(r.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);

  const stats = statsRows[0] ?? { totalBookings: 0, countConfirmed: 0, countCompleted: 0, countCancelled: 0, countPending: 0, totalGuests: 0 };
  res.json({ ...stats, totalRevenue: Math.round(totalRevenue), monthlyRevenue, monthlyTrend: monthlyTrendRows, perEvent });
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

  const [serialized, { byBookingId: effById }] = await Promise.all([
    serializeBookings(rows),
    computeEffectiveRevenues(rows),
  ]);
  const data = serialized.map((b) => ({
    ...b,
    effectiveRevenue: effById.get(b.id) ?? b.finalPrice,
  }));
  res.json({ data, total, page, totalPages });
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
      respondInvalid(res, parsed.error);
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
        req.log.error({ err }, "Failed to award referral points");
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
        req.log.error({ err }, "Failed to send status notification");
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
          await createUserNotification({
            userId: b.userId,
            title: notifTitle,
            message: notifMessage,
            url: "/dashboard/bookings",
            tag: `booking-status-${b.id}`,
          });

          // Send Expo push notification to user's mobile device if they have a token
          sendExpoPushToUser(b.userId, {
            title: notifTitle,
            body: notifMessage,
            data: { bookingId: b.id, screen: "bookings" },
          }).catch(() => {});
        }
      } catch (err) {
        req.log.error({ err }, "Failed to create notification");
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
      respondInvalid(res, parsed.error);
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
            await createUserNotification({
              userId: vendorUser.id,
              title: "Booking cancelled by customer",
              message: `${out.userName} cancelled their booking for "${out.eventTitle}" on ${updated.bookingDate}. Reason: ${reason}`,
              url: "/dashboard/vendor",
              tag: `booking-cancelled-${updated.id}`,
            });
          }
        }
      } catch (err) {
        req.log.error({ err }, "Failed to send partner cancellation notification");
      }

      // In-app notification for the customer confirming the cancellation
      try {
        await createUserNotification({
          userId: user.id,
          title: "Booking cancelled",
          message: `Your booking for "${out.eventTitle}" has been cancelled as requested.`,
          url: "/dashboard/bookings",
          tag: `booking-cancelled-${updated.id}`,
        });
      } catch (err) {
        req.log.error({ err }, "Failed to create customer cancellation notification");
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
      respondInvalid(res, parsed.error);
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
            const refExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            if (referrer) {
              await db.update(usersTable).set({ points: (referrer.points || 0) + 50 }).where(eq(usersTable.id, referrer.id));
              db.insert(pointsLedgerTable).values({ userId: referrer.id, points: 50, source: "referral", expiresAt: refExpiresAt }).catch(() => {});
            }
            if (referred) {
              await db.update(usersTable).set({ points: (referred.points || 0) + 50 }).where(eq(usersTable.id, referred.id));
              db.insert(pointsLedgerTable).values({ userId: referred.id, points: 50, source: "referral", expiresAt: refExpiresAt }).catch(() => {});
            }
            await db.update(referralsTable).set({ status: "completed", pointsAwarded: 50, completedAt: new Date() }).where(eq(referralsTable.id, ref.id));
          }
        }
      } catch (err) {
        req.log.error({ err }, "Failed to award referral points (admin path)");
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
        req.log.error({ err }, "Failed to send status notification (admin path)");
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
          await createUserNotification({
            userId: b.userId,
            title: notifTitle,
            message: notifMessage,
            url: "/dashboard/bookings",
            tag: `booking-status-${b.id}`,
          });
        }
      } catch (err) {
        req.log.error({ err }, "Failed to create notification (admin path)");
      }
    }

    res.json(out);
  },
);

// Partner ticket scanner
const ScanActualEntry = z.object({
  women: z.number().int().nonnegative().optional(),
  men: z.number().int().nonnegative().optional(),
  couple: z.number().int().nonnegative().optional(),
  guests: z.number().int().nonnegative().optional(),
});

router.post("/partner/scan-ticket", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const rawCode = body["code"];
  if (typeof rawCode !== "string" || !rawCode.trim()) {
    res.status(400).json({ code: "INVALID_CODE", message: "Please enter a ticket code." });
    return;
  }
  const code = rawCode.trim().toUpperCase();
  const actualEntryRaw = body["actualEntry"];
  let actualEntry: z.infer<typeof ScanActualEntry> | null = null;
  if (actualEntryRaw && typeof actualEntryRaw === "object") {
    const parsed = ScanActualEntry.safeParse(actualEntryRaw);
    if (!parsed.success) {
      respondInvalid(res, parsed.error, "Invalid actualEntry payload.");
      return;
    }
    actualEntry = parsed.data;
  }
  // Single finalize-trigger flow: only requests carrying `actualEntry` mutate
  // state. Plain scans (with or without legacy `confirm: true`) are read-only
  // lookups — they open the booking on the scanner UI for the manager to
  // confirm headcounts and tap "Save Actual Entry". That Save is the ONE
  // transaction that flips `checkedIn`, writes `commission_ledger`, credits
  // `commissionOwed`, awards loyalty, locks coupons, and writes the audit
  // log. `confirm: true` is accepted for backwards compatibility with old
  // app builds but is treated as a lookup.
  const GRACE_WINDOW_MS = 30_000;

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

  // Load vendor (format/checksum), commission rates, and event (for actual-entry pricing) in parallel
  const [vRows, scanCommissionRows, evtRows] = await Promise.all([
    db.select({ ticketSalt: vendorsTable.ticketSalt, ticketPrefix: vendorsTable.ticketPrefix })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, b.vendorId))
      .limit(1),
    db.select().from(vendorCommissionsTable).where(eq(vendorCommissionsTable.vendorId, b.vendorId)).limit(1),
    db.select().from(eventsTable).where(eq(eventsTable.id, b.eventId)).limit(1),
  ]);
  const scanVendor = vRows[0];
  const scanEvent = evtRows[0];

  // Compute actualAmountDue from per-type actuals using event prices (ticket mode) or pro-rated finalPrice (otherwise).
  // Returns null if no actuals are recorded yet. Mirrors the per-gender free-
  // entry rule in the create-booking handler: when the rule is active for the
  // booking's weekday, only tiers whose gender is listed in `fer.genders` are
  // zero-priced at the door; other tiers still owe their per-type ticket price.
  // Table-mode (no per-gender concept) is treated as free only when ALL three
  // genders are listed. Admin commission still accrues on ALL guests via the
  // existing `freeEntryRate` / `ticketRate` paths.
  const SCAN_FREE_ENTRY_DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const scanFer = (scanEvent as { freeEntryRules?: { enabled?: boolean; genders?: string[]; days?: string[] } | null } | undefined)?.freeEntryRules;
  function calcActualAmountDue(
    booking: { pubMode: string; ticketWomen: number; ticketMen: number; ticketCouple: number; guests: number; finalPrice: string; totalPrice: string; bookingDate: string; actualWomen: number | null; actualMen: number | null; actualCouple: number | null; actualGuests: number | null },
  ): number | null {
    const aw = booking.actualWomen, am = booking.actualMen, ac = booking.actualCouple, ag = booking.actualGuests;
    const isTicketMode = booking.pubMode === "ticket";
    const dayName = booking.bookingDate
      ? SCAN_FREE_ENTRY_DAY_ABBRS[new Date(`${booking.bookingDate}T12:00:00`).getDay()]
      : undefined;
    const ferActive = !!(scanFer?.enabled && dayName && Array.isArray(scanFer.days) && scanFer.days.includes(dayName));
    const ferGenders = ferActive ? (scanFer?.genders ?? []).map((g) => String(g).toLowerCase()) : [];
    const ferAllGendersFree = ferActive && ["women", "men", "couple"].every((g) => ferGenders.includes(g));
    const isTierFree = (g: "women" | "men" | "couple") => ferActive && ferGenders.includes(g);
    if (isTicketMode) {
      if (aw == null && am == null && ac == null) return null;
      const w = aw ?? 0, m = am ?? 0, c = ac ?? 0;
      const pw = isTierFree("women") ? 0 : Number(scanEvent?.priceWomen ?? 0);
      const pm = isTierFree("men") ? 0 : Number(scanEvent?.priceMen ?? 0);
      const pc = isTierFree("couple") ? 0 : Number(scanEvent?.priceCouple ?? 0);
      // Cash collected at the door = per-type counts × per-type ticket price,
      // scaled by the booking's discount ratio so a guest who paid with a
      // coupon (or new-user discount, or loyalty points) only owes the
      // discounted amount at the door — not the full per-tier sticker price.
      const gross = w * pw + m * pm + c * pc;
      const due = gross * bookingDiscountRatio(booking);
      return Math.round(due * 100) / 100;
    }
    if (ag == null) return null;
    if (ferAllGendersFree) return 0;
    const guests = Math.max(1, booking.guests);
    const final = Number(booking.finalPrice);
    return Math.round((ag / guests) * final * 100) / 100;
  }

  // Per-type prices from the event (used by client to render a live cash total before save).
  const scanPriceInfo = {
    priceWomen: Number(scanEvent?.priceWomen ?? 0),
    priceMen: Number(scanEvent?.priceMen ?? 0),
    priceCouple: Number(scanEvent?.priceCouple ?? 0),
  };
  const buildActualEntry = (
    bk: { actualWomen: number | null; actualMen: number | null; actualCouple: number | null; actualGuests: number | null },
  ) => {
    if (bk.actualWomen == null && bk.actualMen == null && bk.actualCouple == null && bk.actualGuests == null) return null;
    return { women: bk.actualWomen, men: bk.actualMen, couple: bk.actualCouple, guests: bk.actualGuests };
  };

  // Pre-compute commission for this booking
  const scanComm = scanCommissionRows[0];
  // Actuals-aware wrapper: uses actual door counts when present (after Save
  // Actual Entry) and falls back to booked counts when actuals are null (lookup
  // phase). This keeps the scanner's commission display consistent with every
  // other analytics surface (partner dashboard, admin commission report).
  function calcScanCommission(booking: typeof b) {
    const price = Number(booking.finalPrice);
    const result = computeCommissionFromActuals(
      booking,
      scanComm ?? { freeEntryRate: 0, ticketRate: 0, tableBookingRate: 0 },
      scanPriceInfo,
      scanFer ?? null,
    );
    return {
      commissionRate: result.ratePerUnit,
      commissionAmount: result.amount,
      netAmount: Math.round((price - result.amount) * 100) / 100,
    };
  }
  const scanCommInfo = calcScanCommission(b);

  // Lazy backfill: if vendor has no prefix/salt yet, generate them now so all
  // future codes are secure. Skip on lookup-only requests so the read-only
  // lookup phase performs ZERO writes (Task #539). The backfill only runs
  // when the request is the actualEntry finalize transaction. (Vendors
  // needing the backfill are also those whose existing tickets are legacy
  // RV-* codes, which don't require checksum verification — so skipping
  // here doesn't break legacy lookups.)
  let resolvedVendor = scanVendor;
  const willMutate = actualEntry !== null;
  if (willMutate && scanVendor && (!scanVendor.ticketPrefix || !scanVendor.ticketSalt)) {
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

  // Best-effort audit log for any scan rejected after the booking is loaded.
  const logRejectedScan = async (rejectionCode: string, extra: Record<string, unknown> = {}) => {
    try {
      await db.insert(bookingAuditLogTable).values({
        bookingId: b.id,
        vendorId: b.vendorId,
        actorUserId: user.id,
        action: "scan_rejected",
        beforeJson: { status: b.status, bookingDate: b.bookingDate },
        afterJson: { rejectionCode, scanner: { userId: user.id, email: user.email }, ...extra },
      });
    } catch (_) { /* best-effort */ }
  };

  // Status checks
  if (b.status === "pending") {
    await logRejectedScan("NOT_CONFIRMED");
    res.status(422).json({ code: "NOT_CONFIRMED", message: "This booking has not been confirmed yet." });
    return;
  }
  if (b.status === "cancelled") {
    await logRejectedScan("CANCELLED");
    res.status(422).json({ code: "CANCELLED", message: "This booking was cancelled and cannot be used for entry." });
    return;
  }
  if (b.status === "refunded") {
    await logRejectedScan("REFUNDED");
    res.status(422).json({ code: "REFUNDED", message: "This booking has been refunded and cannot be used for entry." });
    return;
  }
  if (b.status !== "confirmed") {
    await logRejectedScan("INVALID_STATUS");
    res.status(422).json({ code: "INVALID_STATUS", message: `Booking is in status "${b.status}" and cannot be used for entry.` });
    return;
  }

  // Server-side date validation — never trust the scanner device's clock.
  // b.bookingDate is "YYYY-MM-DD"; compare against today in UTC so the check
  // is deterministic across timezones and DST boundaries.
  const _scanNow = new Date();
  const todayUTC = `${_scanNow.getUTCFullYear()}-${String(_scanNow.getUTCMonth() + 1).padStart(2, "0")}-${String(_scanNow.getUTCDate()).padStart(2, "0")}`;
  if (b.bookingDate < todayUTC) {
    await logRejectedScan("TICKET_EXPIRED", { serverDate: todayUTC });
    res.status(422).json({ code: "TICKET_EXPIRED", message: "This ticket has expired and can no longer be used." });
    return;
  }
  if (b.bookingDate > todayUTC) {
    await logRejectedScan("TICKET_FUTURE", { serverDate: todayUTC });
    res.status(422).json({ code: "TICKET_FUTURE", message: "This ticket is valid for a future date and cannot be used today." });
    return;
  }

  // ── Lookup path: any request without actualEntry is read-only ──
  // Returns the booking details and a status flag so the scanner UI can
  // open the editable headcount form. Performs ZERO writes — no checkedIn
  // flip, no ledger row, no loyalty, no coupon lock. All of those happen
  // only inside the actualEntry finalize transaction below.
  if (!actualEntry) {
    const [out] = await serializeBookings([b]);
    const lookupActualAmountDue = calcActualAmountDue(b);
    const checkedInAtIso = b.checkedInAt ? b.checkedInAt.toISOString() : null;
    const checkedOutAtIso = b.checkedOutAt ? b.checkedOutAt.toISOString() : null;
    // `checkedIn=true` now means "Save Actual Entry has been submitted" —
    // i.e. the ticket is fully finalized and locked. ALREADY_FINALIZED
    // tells the UI to render the read-only summary card.
    const finalized = b.checkedIn;
    const codeOut = b.checkedOut
      ? "ALREADY_CHECKED_OUT"
      : finalized
        ? "ALREADY_FINALIZED"
        : "READY";
    const statusOut = b.checkedOut
      ? "already_checked_out"
      : finalized
        ? "already_finalized"
        : "ready_to_finalize";
    res.json({
      code: codeOut,
      status: statusOut,
      lookupOnly: true,
      finalized,
      checkedInAt: checkedInAtIso,
      checkedOutAt: checkedOutAtIso,
      booking: out
        ? { ...out, ...scanCommInfo, ...scanPriceInfo, actualAmountDue: lookupActualAmountDue, actualEntry: buildActualEntry(b) }
        : null,
    });
    return;
  }

  // ── Finalize path: actualEntry provided → single transaction ──
  // This is the SOLE path that mutates state. It:
  //   1. Validates the ticket isn't already finalized (lock semantics).
  //   2. Validates per-tier counts against booked counts.
  //   3. Writes actuals + checkedIn + checkedInAt atomically.
  //   4. Inserts the commission_ledger row (cod_checkin / free_checkin /
  //      online_payment) and credits vendor commissionOwed (COD/free only).
  //   5. Awards 100 loyalty points and locks the coupon (if used).
  //   6. Writes a booking_audit_log row with before/after snapshots.
  // Duplicate Save inside a 30s grace window is treated as a benign no-op
  // (manager double-tap / camera double-fire); outside that window an
  // ALREADY_FINALIZED 409 protects against retro-edits to closed books.
  //
  // Reject empty payloads ({} or all-undefined).
  if (
    actualEntry.women === undefined &&
    actualEntry.men === undefined &&
    actualEntry.couple === undefined &&
    actualEntry.guests === undefined
  ) {
    res.status(400).json({
      code: "INVALID_ACTUAL_ENTRY",
      message: "actualEntry must include at least one of women/men/couple/guests.",
    });
    return;
  }

  // ── Lock check: refuse retro-edits once Save has been submitted ──
  if (b.checkedIn) {
    const checkedInAt = b.checkedInAt ? b.checkedInAt.toISOString() : null;
    const ageMs = b.checkedInAt ? Date.now() - b.checkedInAt.getTime() : Infinity;
    // Grace window: a duplicate Save within 30s is treated as a no-op
    // success (manager taps Save twice, camera double-fires, etc.) — we
    // re-serialize the existing state and return 200 instead of 409.
    if (ageMs >= 0 && ageMs <= GRACE_WINDOW_MS) {
      const [out] = await serializeBookings([b]);
      const recheckComm = calcScanCommission(b);
      const recheckDue = calcActualAmountDue(b);
      res.json({
        code: "OK",
        status: "already_finalized",
        finalized: true,
        recentlyFinalized: true,
        checkedInAt,
        booking: out
          ? { ...out, ...recheckComm, ...scanPriceInfo, actualAmountDue: recheckDue, actualEntry: buildActualEntry(b) }
          : null,
      });
      return;
    }
    const [out] = await serializeBookings([b]);
    const finComm = calcScanCommission(b);
    const finDue = calcActualAmountDue(b);
    res.status(409).json({
      code: "ALREADY_FINALIZED",
      status: "already_finalized",
      message: "This ticket has already been finalized and cannot be edited at the door. Contact admin to correct.",
      checkedInAt,
      booking: out
        ? { ...out, ...finComm, ...scanPriceInfo, actualAmountDue: finDue, actualEntry: buildActualEntry(b) }
        : null,
    });
    return;
  }

  // ── Validate per-tier counts ──
  const isTicket = b.pubMode === "ticket";
  let aw: number | null = b.actualWomen;
  let am: number | null = b.actualMen;
  let ac: number | null = b.actualCouple;
  let ag: number | null = b.actualGuests;
  const overLimit = (label: string, value: number, max: number) => {
    res.status(400).json({
      code: "INVALID_ACTUAL_ENTRY",
      message: `Actual ${label} (${value}) exceeds booked count (${max}).`,
    });
  };
  if (isTicket) {
    if (actualEntry.women !== undefined) {
      if (actualEntry.women < 0) { res.status(400).json({ code: "INVALID_ACTUAL_ENTRY", message: "Actual counts cannot be negative." }); return; }
      if (actualEntry.women > b.ticketWomen) { overLimit("women", actualEntry.women, b.ticketWomen); return; }
      aw = actualEntry.women;
    }
    if (actualEntry.men !== undefined) {
      if (actualEntry.men < 0) { res.status(400).json({ code: "INVALID_ACTUAL_ENTRY", message: "Actual counts cannot be negative." }); return; }
      if (actualEntry.men > b.ticketMen) { overLimit("men", actualEntry.men, b.ticketMen); return; }
      am = actualEntry.men;
    }
    if (actualEntry.couple !== undefined) {
      if (actualEntry.couple < 0) { res.status(400).json({ code: "INVALID_ACTUAL_ENTRY", message: "Actual counts cannot be negative." }); return; }
      if (actualEntry.couple > b.ticketCouple) { overLimit("couples", actualEntry.couple, b.ticketCouple); return; }
      ac = actualEntry.couple;
    }
    if (actualEntry.guests !== undefined) {
      res.status(400).json({ code: "INVALID_ACTUAL_ENTRY", message: "guests is not valid for ticket-mode bookings; use women/men/couple." });
      return;
    }
  } else {
    if (actualEntry.women !== undefined || actualEntry.men !== undefined || actualEntry.couple !== undefined) {
      res.status(400).json({ code: "INVALID_ACTUAL_ENTRY", message: "women/men/couple are only valid for ticket-mode bookings." });
      return;
    }
    if (actualEntry.guests !== undefined) {
      if (actualEntry.guests < 0) { res.status(400).json({ code: "INVALID_ACTUAL_ENTRY", message: "Actual guests cannot be negative." }); return; }
      const cap = Math.max(b.guests, 0);
      if (actualEntry.guests > cap) { overLimit("guests", actualEntry.guests, cap); return; }
      ag = actualEntry.guests;
    }
  }

  // Snapshot original state for the audit log before we mutate anything.
  const beforeSnapshot = {
    booked: {
      pubMode: b.pubMode,
      ticketWomen: b.ticketWomen,
      ticketMen: b.ticketMen,
      ticketCouple: b.ticketCouple,
      guests: b.guests,
      finalPrice: Number(b.finalPrice),
      totalPrice: Number(b.totalPrice),
    },
    actuals: {
      women: b.actualWomen,
      men: b.actualMen,
      couple: b.actualCouple,
      guests: b.actualGuests,
    },
    checkedIn: b.checkedIn,
    checkedInAt: b.checkedInAt ? b.checkedInAt.toISOString() : null,
    paymentMethod: b.paymentMethod,
  };

  // ── Atomic finalize: race-protected on checkedIn=false ──
  const finalizedAt = new Date();
  const [updatedActuals] = await db
    .update(bookingsTable)
    .set({
      actualWomen: aw,
      actualMen: am,
      actualCouple: ac,
      actualGuests: ag,
      checkedIn: true,
      checkedInAt: finalizedAt,
    })
    .where(and(eq(bookingsTable.id, b.id), eq(bookingsTable.checkedIn, false)))
    .returning();
  if (!updatedActuals) {
    // Another concurrent Save beat us. Re-read current state and apply the
    // same grace-window / lock rules as the pre-check above.
    const [current] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, b.id)).limit(1);
    if (!current) {
      res.status(500).json({ code: "SERVER_ERROR", message: "Failed to save actual entry. Please try again." });
      return;
    }
    const checkedInAtIso = current.checkedInAt ? current.checkedInAt.toISOString() : null;
    const ageMs = current.checkedInAt ? Date.now() - current.checkedInAt.getTime() : Infinity;
    const [out] = await serializeBookings([current]);
    const raceComm = calcScanCommission(current);
    const raceDue = calcActualAmountDue(current);
    const payload = out
      ? { ...out, ...raceComm, ...scanPriceInfo, actualAmountDue: raceDue, actualEntry: buildActualEntry(current) }
      : null;
    if (ageMs >= 0 && ageMs <= GRACE_WINDOW_MS) {
      res.json({
        code: "OK",
        status: "already_finalized",
        finalized: true,
        recentlyFinalized: true,
        checkedInAt: checkedInAtIso,
        booking: payload,
      });
    } else {
      res.status(409).json({
        code: "ALREADY_FINALIZED",
        status: "already_finalized",
        message: "This ticket has already been finalized and cannot be edited at the door. Contact admin to correct.",
        checkedInAt: checkedInAtIso,
        booking: payload,
      });
    }
    return;
  }

  // ── Commission ledger + commissionOwed credit ──
  // COD / free-entry: amount is computed from the manager's edited per-tier
  // counts so the manager-collected cash matches the realised commission.
  // Online: amount is computed from the original planned counts — the
  // customer already paid the full finalPrice upstream, and we don't
  // retroactively shrink platform revenue when fewer guests show up.
  // The booking_trigger uniqueIndex still protects against double-inserts.
  const isCod = updatedActuals.paymentMethod === "cod";
  const isFreeEntry =
    classifyBookingType({ pubMode: updatedActuals.pubMode, finalPrice: updatedActuals.finalPrice }) === "free_entry";
  const ledgerTrigger: "cod_checkin" | "free_checkin" | "online_payment" = isFreeEntry
    ? "free_checkin"
    : isCod
      ? "cod_checkin"
      : "online_payment";
  // Every path uses computeCommissionFromActuals now — including online —
  // so the ledger row records what the manager actually verified at the
  // door. Online still uses paymentMethod !== "cod" so the trigger stays
  // "online_payment", but the AMOUNT scales with actuals. Net effect: a
  // pre-paid online booking where 3 of 5 showed up bills the platform
  // for 3 × per-ticket-rate, not 5.
  const ledgerAmount = computeCommissionFromActuals(
    updatedActuals,
    scanComm ?? { freeEntryRate: 0, ticketRate: 0, tableBookingRate: 0 },
    { priceWomen: scanPriceInfo.priceWomen, priceMen: scanPriceInfo.priceMen, priceCouple: scanPriceInfo.priceCouple },
    scanFer ?? null,
  );

  try {
    await db.transaction(async (tx) => {
      if (isCod || isFreeEntry) {
        // Idempotent insert: the (booking_id, trigger) uniqueIndex makes a
        // duplicate Save inside the grace window a structural no-op. We
        // still bump commissionOwed only on the FIRST insert (i.e. when a
        // row was actually written), so concurrent retries can never
        // double-credit.
        const inserted = await tx
          .insert(commissionLedgerTable)
          .values({
            vendorId: updatedActuals.vendorId,
            bookingId: updatedActuals.id,
            amount: String(ledgerAmount.amount),
            bookingType: ledgerAmount.bookingType,
            trigger: ledgerTrigger,
          })
          .onConflictDoNothing()
          .returning({ id: commissionLedgerTable.id });
        if (inserted.length > 0 && ledgerAmount.amount !== 0) {
          await tx
            .update(vendorsTable)
            .set({ commissionOwed: sql`GREATEST(0, ${vendorsTable.commissionOwed} + ${String(ledgerAmount.amount)})` })
            .where(eq(vendorsTable.id, updatedActuals.vendorId));
        }
      } else {
        // Online: ledger may already exist from the payment-success webhook;
        // onConflictDoNothing leaves it alone in that case.
        await tx
          .insert(commissionLedgerTable)
          .values({
            vendorId: updatedActuals.vendorId,
            bookingId: updatedActuals.id,
            amount: String(ledgerAmount.amount),
            bookingType: ledgerAmount.bookingType,
            trigger: "online_payment",
          })
          .onConflictDoNothing();
      }
    });
  } catch (err) {
    req.log.error({ err, bookingId: updatedActuals.id }, "Failed to credit commission on Save Actual Entry");
  }

  // Award 50 loyalty points to the booking owner for attending the event.
  // Points expire 30 days after being earned. Errors are logged but don't
  // fail the finalize — loyalty is a non-financial side effect.
  try {
    const [scanEvt] = await db
      .select({ title: eventsTable.title })
      .from(eventsTable)
      .where(eq(eventsTable.id, updatedActuals.eventId))
      .limit(1);
    const pointsExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await Promise.all([
      db.update(usersTable)
        .set({ points: sql`${usersTable.points} + 50` })
        .where(eq(usersTable.id, updatedActuals.userId)),
      db.insert(pointsLedgerTable).values({
        userId: updatedActuals.userId,
        points: 50,
        source: "scan_in",
        bookingId: updatedActuals.id,
        expiresAt: pointsExpiresAt,
      }),
      createUserNotification({
        userId: updatedActuals.userId,
        title: "You earned 50 points!",
        message: `You earned 50 points for attending "${scanEvt?.title ?? "this event"}"!`,
      }),
    ]);
  } catch (err) {
    req.log.error({ err, bookingId: updatedActuals.id }, "Failed to award scan-in loyalty points");
  }

  // Lock any coupon used on this booking (idempotent).
  if (updatedActuals.couponCode) {
    try {
      await db
        .update(couponsTable)
        .set({ used: true })
        .where(and(eq(couponsTable.code, updatedActuals.couponCode), eq(couponsTable.used, false)));
    } catch (err) {
      req.log.error({ err, couponCode: updatedActuals.couponCode }, "Failed to mark coupon used at finalize time");
    }
  }

  const finalAmountDue = calcActualAmountDue(updatedActuals);
  const finalComm = calcScanCommission(updatedActuals);

  // Audit log: append-only, captures what we overwrote and what we wrote.
  // Best-effort — a logging failure does not roll back the finalize.
  try {
    await db.insert(bookingAuditLogTable).values({
      bookingId: updatedActuals.id,
      vendorId: updatedActuals.vendorId,
      actorUserId: user.id,
      action: "actual_entry_finalize",
      beforeJson: beforeSnapshot,
      afterJson: {
        actuals: {
          women: updatedActuals.actualWomen,
          men: updatedActuals.actualMen,
          couple: updatedActuals.actualCouple,
          guests: updatedActuals.actualGuests,
        },
        checkedInAt: finalizedAt.toISOString(),
        amountDue: finalAmountDue,
        commission: {
          rate: finalComm.commissionRate,
          amount: finalComm.commissionAmount,
          net: finalComm.netAmount,
        },
        ledger: {
          trigger: ledgerTrigger,
          amount: ledgerAmount.amount,
          bookingType: ledgerAmount.bookingType,
        },
        scanner: {
          userId: user.id,
          email: user.email,
        },
      },
    });
  } catch (err) {
    req.log.error({ err, bookingId: updatedActuals.id }, "Failed to write booking audit log");
  }

  const [out] = await serializeBookings([updatedActuals]);
  res.json({
    code: "OK",
    status: "finalized",
    finalized: true,
    justFinalized: true,
    checkedInAt: finalizedAt.toISOString(),
    booking: out
      ? { ...out, ...finalComm, ...scanPriceInfo, actualAmountDue: finalAmountDue, actualEntry: buildActualEntry(updatedActuals) }
      : null,
  });
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
  const ticketCode = v && v.ticketPrefix && v.ticketSalt
    ? generateTicketCode(b.id, { ticketPrefix: v.ticketPrefix, ticketSalt: v.ticketSalt })
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

// ── Scanner check-out & live occupancy (Task #581) ──────────────────────────

/**
 * Returns "today" as YYYY-MM-DD in IST. Pubs in India operate late at night;
 * a single calendar date in Asia/Kolkata is the natural business-day window
 * for occupancy / scanner filtering.
 */
function todayIstDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Resolves all vendor IDs the user is allowed to scan/manage tickets for:
 *   - their own vendor profile (vendor or admin role)
 *   - venues where they have an `accepted` manager relationship
 * Same eligibility surface as POST /partner/scan-ticket.
 */
export async function resolveScannerVendorIds(
  userId: number,
  role: string,
): Promise<Set<number>> {
  const ids = new Set<number>();
  if (role === "vendor" || role === "admin") {
    const vRows = await db
      .select({ id: vendorsTable.id })
      .from(vendorsTable)
      .where(eq(vendorsTable.userId, userId))
      .limit(1);
    if (vRows[0]) ids.add(vRows[0].id);
  }
  const mgRows = await db
    .select({ vendorId: vendorManagersTable.vendorId })
    .from(vendorManagersTable)
    .where(and(eq(vendorManagersTable.managerId, userId), eq(vendorManagersTable.status, "accepted")));
  for (const r of mgRows) ids.add(r.vendorId);
  return ids;
}

/**
 * Decodes a ticket code (PREFIX-NNNNNN-XX or legacy RV-NNNNNN / numeric) to a
 * booking ID, returning the parsed ID and whether checksum verification is
 * needed for the format. Mirrors the parser in /partner/scan-ticket.
 */
function parseTicketCode(raw: string): { bookingId: number; needsChecksum: boolean } | null {
  const code = raw.trim().toUpperCase();
  const m1 = code.match(/^([A-Z][A-Z0-9]{1,7})-(\d{1,10})-([0-9A-F]{2})$/);
  const m2 = code.match(/^(?:RV-?)?(\d+)$/);
  if (m1 && m1[2] && m1[1] !== "RV") {
    const id = parseInt(m1[2], 10);
    return Number.isFinite(id) && id > 0 ? { bookingId: id, needsChecksum: true } : null;
  }
  if (m2 && m2[1]) {
    const id = parseInt(m2[1], 10);
    return Number.isFinite(id) && id > 0 ? { bookingId: id, needsChecksum: false } : null;
  }
  return null;
}

router.post("/partner/checkout-ticket", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ code: "FORBIDDEN", message: "Unauthorized" });
    return;
  }

  // Validate request body against the generated zod schema. Keeps the
  // contract enforced server-side and rejects unknown fields.
  const parsedBody = PartnerCheckoutTicketBody.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    respondInvalid(res, parsedBody.error);
    return;
  }
  const body = parsedBody.data;
  // Accept any of: { bookingId } (preferred from scanner table), { ticketCode },
  // or legacy { code }. ticketCode takes precedence over code if both are sent.
  const bookingIdRaw = body.bookingId;
  const ticketCodeRaw = typeof body.ticketCode === "string" ? body.ticketCode : body.code;
  const confirmRequested = body.confirm === true;

  let parsed: { bookingId: number; needsChecksum: boolean } | null = null;
  let parsedFromCode: string | null = null;
  if (typeof bookingIdRaw === "number" && Number.isFinite(bookingIdRaw) && bookingIdRaw > 0) {
    parsed = { bookingId: Math.floor(bookingIdRaw), needsChecksum: false };
  } else if (typeof ticketCodeRaw === "string" && ticketCodeRaw.trim()) {
    parsed = parseTicketCode(ticketCodeRaw);
    parsedFromCode = ticketCodeRaw.trim().toUpperCase();
    if (!parsed) {
      res.status(400).json({ code: "INVALID_CODE", message: "Invalid ticket code format." });
      return;
    }
  } else {
    res.status(400).json({ code: "INVALID_CODE", message: "Provide bookingId or ticketCode." });
    return;
  }

  const allowed = await resolveScannerVendorIds(user.id, user.role);
  if (allowed.size === 0) {
    res.status(403).json({ code: "FORBIDDEN", message: "No partner profile found." });
    return;
  }

  const bRows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, parsed.bookingId)).limit(1);
  const b = bRows[0];
  if (!b) {
    res.status(404).json({ code: "NOT_FOUND", message: "Ticket not found." });
    return;
  }
  if (!allowed.has(b.vendorId)) {
    res.status(403).json({ code: "WRONG_VENDOR", message: "This ticket belongs to a different partner's venue." });
    return;
  }

  if (parsed.needsChecksum && parsedFromCode) {
    const v = await db
      .select({ ticketPrefix: vendorsTable.ticketPrefix, ticketSalt: vendorsTable.ticketSalt })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, b.vendorId))
      .limit(1);
    const vendor = v[0];
    if (!vendor?.ticketPrefix || !vendor?.ticketSalt) {
      res.status(400).json({ code: "INVALID_CODE", message: "Cannot verify ticket — vendor not configured." });
      return;
    }
    if (!verifyTicketCode(parsedFromCode, parsed.bookingId, { ticketPrefix: vendor.ticketPrefix, ticketSalt: vendor.ticketSalt })) {
      res.status(400).json({ code: "INVALID_CODE", message: "Ticket code is invalid or has been tampered with." });
      return;
    }
  }

  if (b.status !== "confirmed" && b.status !== "completed") {
    res.status(422).json({ code: "INVALID_STATUS", message: `Booking is in status "${b.status}" and cannot be checked out.` });
    return;
  }

  const [out] = await serializeBookings([b]);
  const bookingPayload = out
    ? { ...out, checkedOut: b.checkedOut, checkedOutAt: b.checkedOutAt ? b.checkedOutAt.toISOString() : null }
    : null;

  // Lookup-only: report current state without mutating.
  if (!confirmRequested) {
    if (!b.checkedIn) {
      res.json({
        code: "NOT_CHECKED_IN",
        status: "not_checked_in",
        lookupOnly: true,
        message: "This guest has not been checked in yet.",
        booking: bookingPayload,
      });
      return;
    }
    if (b.checkedOut) {
      res.json({
        code: "ALREADY_CHECKED_OUT",
        status: "already_checked_out",
        lookupOnly: true,
        checkedInAt: b.checkedInAt?.toISOString() ?? null,
        checkedOutAt: b.checkedOutAt?.toISOString() ?? null,
        message: "This ticket has already been checked out.",
        booking: bookingPayload,
      });
      return;
    }
    res.json({
      code: "OK",
      status: "ready_to_check_out",
      lookupOnly: true,
      checkedInAt: b.checkedInAt?.toISOString() ?? null,
      booking: bookingPayload,
    });
    return;
  }

  // Confirm path.
  if (!b.checkedIn) {
    res.status(409).json({
      code: "NOT_CHECKED_IN",
      status: "not_checked_in",
      message: "Cannot check out a guest who hasn't been checked in.",
      booking: bookingPayload,
    });
    return;
  }
  if (b.checkedOut) {
    res.status(409).json({
      code: "ALREADY_CHECKED_OUT",
      status: "already_checked_out",
      checkedInAt: b.checkedInAt?.toISOString() ?? null,
      checkedOutAt: b.checkedOutAt?.toISOString() ?? null,
      message: "This ticket has already been checked out.",
      booking: bookingPayload,
    });
    return;
  }

  // Atomic check-out: only update if checkedOut is still false.
  const now = new Date();
  const [updated] = await db
    .update(bookingsTable)
    .set({ checkedOut: true, checkedOutAt: now })
    .where(and(eq(bookingsTable.id, b.id), eq(bookingsTable.checkedOut, false), eq(bookingsTable.checkedIn, true)))
    .returning();
  if (!updated) {
    const [cur] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, b.id)).limit(1);
    const [outCur] = await serializeBookings(cur ? [cur] : []);
    res.status(409).json({
      code: "ALREADY_CHECKED_OUT",
      status: "already_checked_out",
      checkedInAt: cur?.checkedInAt?.toISOString() ?? null,
      checkedOutAt: cur?.checkedOutAt?.toISOString() ?? null,
      message: "This ticket has already been checked out.",
      booking: outCur ? { ...outCur, checkedOut: true, checkedOutAt: cur?.checkedOutAt?.toISOString() ?? null } : null,
    });
    return;
  }

  req.log.info({ bookingId: updated.id, vendorId: updated.vendorId, by: user.id }, "Booking checked out");

  const [outFresh] = await serializeBookings([updated]);
  // Compute fresh occupancy snapshot for this vendor so the client can
  // refresh capacity badges without a follow-up request.
  const occSnap = await fetchOccupancyForVendors([updated.vendorId]);
  res.json({
    code: "OK",
    status: "checked_out",
    justCheckedOut: true,
    checkedInAt: updated.checkedInAt?.toISOString() ?? null,
    checkedOutAt: now.toISOString(),
    booking: outFresh ? { ...outFresh, checkedOut: true, checkedOutAt: now.toISOString() } : null,
    occupancy: occSnap.rows[0] ?? null,
  });
});

/**
 * Build the rich rows + stats payload used by both the partner scanner list
 * and the admin live-occupancy drill-down. Filters are applied in SQL so
 * pagination math stays correct.
 */
type ScannerLiveStatus = "notArrived" | "inside" | "checkedOut" | "noShow" | "cancelled";

async function fetchScannerBookings(opts: {
  vendorIds: number[];
  date?: string;
  from?: string;
  to?: string;
  statuses: ScannerLiveStatus[]; // empty = all
  q: string;
  page: number;
  limit: number;
}) {
  const today = todayIstDate();
  const dateConditions = opts.from && opts.to
    ? [sql`${bookingsTable.bookingDate} >= ${opts.from}`, sql`${bookingsTable.bookingDate} <= ${opts.to}`]
    : [eq(bookingsTable.bookingDate, opts.date ?? today)];

  // Surface the full status spectrum required by Task #581 (Booked /
  // Checked-in / Checked-out / No-show / Cancelled). We do NOT hard-filter
  // to confirmed/completed anymore — cancelled rows must remain visible for
  // audit, and "no-show" is derived from confirmed-but-past-without-checkin.
  const conditions = [
    inArray(bookingsTable.vendorId, opts.vendorIds),
    ...dateConditions,
    inArray(bookingsTable.status, ["confirmed", "completed", "cancelled"]),
  ];
  const rowConditions = [...conditions];

  const liveStatusClause = (s: ScannerLiveStatus) => {
    switch (s) {
      case "cancelled":
        return sql`(${bookingsTable.status} = 'cancelled')`;
      case "checkedOut":
        return sql`(${bookingsTable.status} <> 'cancelled' and ${bookingsTable.checkedOut} = true)`;
      case "inside":
        return sql`(${bookingsTable.status} <> 'cancelled' and ${bookingsTable.checkedIn} = true and ${bookingsTable.checkedOut} = false)`;
      case "noShow":
        return sql`(${bookingsTable.status} <> 'cancelled' and ${bookingsTable.checkedIn} = false and ${bookingsTable.bookingDate} < ${today})`;
      case "notArrived":
      default:
        return sql`(${bookingsTable.status} <> 'cancelled' and ${bookingsTable.checkedIn} = false and ${bookingsTable.bookingDate} >= ${today})`;
    }
  };

  // Multi-status filter via OR. Empty array = no filter (= all).
  if (opts.statuses.length > 0) {
    const statusClauses = opts.statuses.map(liveStatusClause);
    rowConditions.push(sql`(${sql.join(statusClauses, sql` OR `)})`);
  }

  if (opts.q.trim()) {
    const raw = opts.q.trim();
    const q = `%${raw.toLowerCase()}%`;
    // Try to extract a numeric booking id from the search (handles plain "42",
    // "RV-000042", or any prefixed code containing digits).
    const numMatch = raw.match(/\d+/);
    const bookingId = numMatch ? Number(numMatch[0]) : null;
    const idClause = bookingId && Number.isFinite(bookingId)
      ? sql`or ${bookingsTable.id} = ${bookingId}`
      : sql``;
    // Ticket codes are derived from booking id + vendor prefix/salt, so we
    // match the embedded numeric portion against bookings.id rather than
    // hitting a non-existent ticket_code column.
    rowConditions.push(sql`(
      lower(${bookingsTable.personName}) like ${q}
      or lower(${bookingsTable.phone}) like ${q}
      ${idClause}
    )`);
  }

  const baseWhere = and(...conditions);
  const rowsWhere = and(...rowConditions);

  const offset = (opts.page - 1) * opts.limit;
  const [statsRows, countRow, rows] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        notArrived: sql<number>`coalesce(sum(case when ${bookingsTable.status} <> 'cancelled' and ${bookingsTable.checkedIn} = false and ${bookingsTable.bookingDate} >= ${today} then 1 else 0 end),0)::int`,
        inside: sql<number>`coalesce(sum(case when ${bookingsTable.status} <> 'cancelled' and ${bookingsTable.checkedIn} = true and ${bookingsTable.checkedOut} = false then 1 else 0 end),0)::int`,
        checkedOut: sql<number>`coalesce(sum(case when ${bookingsTable.status} <> 'cancelled' and ${bookingsTable.checkedOut} = true then 1 else 0 end),0)::int`,
        noShow: sql<number>`coalesce(sum(case when ${bookingsTable.status} <> 'cancelled' and ${bookingsTable.checkedIn} = false and ${bookingsTable.bookingDate} < ${today} then 1 else 0 end),0)::int`,
        cancelled: sql<number>`coalesce(sum(case when ${bookingsTable.status} = 'cancelled' then 1 else 0 end),0)::int`,
        currentlyInside: sql<number>`coalesce(sum(case when ${bookingsTable.status} <> 'cancelled' and ${bookingsTable.checkedIn} = true and ${bookingsTable.checkedOut} = false then ${bookingsTable.guests} + ${bookingsTable.ticketWomen} + ${bookingsTable.ticketMen} + ${bookingsTable.ticketCouple} * 2 else 0 end),0)::int`,
      })
      .from(bookingsTable)
      .where(baseWhere),
    db.select({ c: sql<number>`count(*)::int` }).from(bookingsTable).where(rowsWhere),
    db
      .select()
      .from(bookingsTable)
      .where(rowsWhere)
      .orderBy(desc(bookingsTable.checkedInAt), desc(bookingsTable.id))
      .limit(opts.limit)
      .offset(offset),
  ]);

  const total = countRow[0]?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / opts.limit));

  // Enrich rows with names + ticketCode.
  const eventIds = [...new Set(rows.map((r) => r.eventId))];
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const vendorIds = [...new Set(rows.map((r) => r.vendorId))];
  const [events, users, vendors] = await Promise.all([
    eventIds.length > 0 ? db.select({ id: eventsTable.id, title: eventsTable.title }).from(eventsTable).where(inArray(eventsTable.id, eventIds)) : Promise.resolve([] as { id: number; title: string }[]),
    userIds.length > 0 ? db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: sql<string>`coalesce(phone,'')` }).from(usersTable).where(inArray(usersTable.id, userIds)) : Promise.resolve([] as { id: number; name: string; email: string; phone: string }[]),
    vendorIds.length > 0 ? db.select({ id: vendorsTable.id, businessName: vendorsTable.businessName, ticketPrefix: vendorsTable.ticketPrefix, ticketSalt: vendorsTable.ticketSalt }).from(vendorsTable).where(inArray(vendorsTable.id, vendorIds)) : Promise.resolve([] as { id: number; businessName: string; ticketPrefix: string | null; ticketSalt: string | null }[]),
  ]);
  const eMap = new Map(events.map((e) => [e.id, e]));
  const uMap = new Map(users.map((u) => [u.id, u]));
  const vMap = new Map(vendors.map((v) => [v.id, v]));

  const out = rows.map((b) => {
    const u = uMap.get(b.userId);
    const v = vMap.get(b.vendorId);
    const e = eMap.get(b.eventId);
    const liveStatus: ScannerLiveStatus =
      b.status === "cancelled"
        ? "cancelled"
        : b.checkedOut
        ? "checkedOut"
        : b.checkedIn
        ? "inside"
        : b.bookingDate < today
        ? "noShow"
        : "notArrived";
    return {
      id: b.id,
      ticketCode: v && v.ticketPrefix && v.ticketSalt
        ? generateTicketCode(b.id, { ticketPrefix: v.ticketPrefix, ticketSalt: v.ticketSalt })
        : `RV-${String(b.id).padStart(6, "0")}`,
      eventId: b.eventId,
      eventTitle: e?.title ?? "",
      vendorId: b.vendorId,
      vendorName: v?.businessName ?? "",
      bookingDate: b.bookingDate,
      bookingTime: b.arrivalTime ?? null,
      personName: b.personName || u?.name || null,
      userName: u?.name ?? "",
      userEmail: u?.email ?? null,
      phone: (b.phone || u?.phone) ?? null,
      pubMode: b.pubMode ?? "",
      guests: b.guests,
      ticketWomen: b.ticketWomen,
      ticketMen: b.ticketMen,
      ticketCouple: b.ticketCouple,
      finalPrice: Number(b.finalPrice),
      paymentMethod: b.paymentMethod,
      status: b.status,
      checkedIn: b.checkedIn,
      checkedInAt: b.checkedInAt ? b.checkedInAt.toISOString() : null,
      checkedOut: b.checkedOut,
      checkedOutAt: b.checkedOutAt ? b.checkedOutAt.toISOString() : null,
      actualGuests: b.actualGuests ?? null,
      actualWomen: b.actualWomen ?? null,
      actualMen: b.actualMen ?? null,
      actualCouple: b.actualCouple ?? null,
      liveStatus,
    };
  });

  const stats = statsRows[0] ?? { total: 0, notArrived: 0, inside: 0, checkedOut: 0, noShow: 0, cancelled: 0, currentlyInside: 0 };
  return { rows: out, page: opts.page, totalPages, total, stats };
}

/**
 * Per-vendor occupancy snapshot for "today" (IST). Capacity is derived from
 * MAX(events.capacity) across each vendor's events — events store the venue
 * capacity, vendors do not (Task #581).
 */
async function fetchOccupancyForVendors(vendorIds: number[]) {
  const today = todayIstDate();
  if (vendorIds.length === 0) {
    return { today, rows: [], totals: { totalCapacity: 0, totalCurrentlyInside: 0, totalCheckedInToday: 0, totalCheckedOutToday: 0 } };
  }
  const [vendors, capRows, statRows] = await Promise.all([
    db
      .select({ id: vendorsTable.id, businessName: vendorsTable.businessName, city: vendorsTable.city })
      .from(vendorsTable)
      .where(inArray(vendorsTable.id, vendorIds)),
    db
      .select({ vendorId: eventsTable.vendorId, capacity: sql<number>`coalesce(max(${eventsTable.capacity}),0)::int` })
      .from(eventsTable)
      .where(inArray(eventsTable.vendorId, vendorIds))
      .groupBy(eventsTable.vendorId),
    db
      .select({
        vendorId: bookingsTable.vendorId,
        totalBookingsToday: sql<number>`count(*)::int`,
        checkedInCount: sql<number>`coalesce(sum(case when ${bookingsTable.checkedIn} = true then 1 else 0 end),0)::int`,
        checkedOutCount: sql<number>`coalesce(sum(case when ${bookingsTable.checkedOut} = true then 1 else 0 end),0)::int`,
        notArrivedCount: sql<number>`coalesce(sum(case when ${bookingsTable.checkedIn} = false then 1 else 0 end),0)::int`,
        currentlyInsideHeads: sql<number>`coalesce(sum(case when ${bookingsTable.checkedIn} = true and ${bookingsTable.checkedOut} = false then ${bookingsTable.guests} + ${bookingsTable.ticketWomen} + ${bookingsTable.ticketMen} + ${bookingsTable.ticketCouple} * 2 else 0 end),0)::int`,
        // Most recent scan (check-in OR check-out) recorded for this vendor today.
        lastScanAt: sql<Date | null>`max(greatest(${bookingsTable.checkedInAt}, ${bookingsTable.checkedOutAt}))`,
      })
      .from(bookingsTable)
      .where(and(
        inArray(bookingsTable.vendorId, vendorIds),
        eq(bookingsTable.bookingDate, today),
        inArray(bookingsTable.status, ["confirmed", "completed"]),
      ))
      .groupBy(bookingsTable.vendorId),
  ]);

  const capMap = new Map(capRows.map((r) => [r.vendorId, r.capacity]));
  const statMap = new Map(statRows.map((r) => [r.vendorId, r]));

  const rows = vendors
    .map((v) => {
      const capacity = capMap.get(v.id) ?? 0;
      const s = statMap.get(v.id);
      const currentlyInside = s?.currentlyInsideHeads ?? 0;
      const available = Math.max(0, capacity - currentlyInside);
      const occupancyPercent = capacity > 0 ? Math.round((currentlyInside / capacity) * 1000) / 10 : 0;
      const rawLastScan = s?.lastScanAt ?? null;
      const lastScanAt = rawLastScan ? (rawLastScan instanceof Date ? rawLastScan.toISOString() : String(rawLastScan)) : null;
      return {
        vendorId: v.id,
        businessName: v.businessName,
        city: v.city ?? null,
        capacity,
        currentlyInside,
        available,
        occupancyPercent,
        totalBookingsToday: s?.totalBookingsToday ?? 0,
        checkedInCount: s?.checkedInCount ?? 0,
        checkedOutCount: s?.checkedOutCount ?? 0,
        notArrivedCount: s?.notArrivedCount ?? 0,
        lastScanAt,
        today,
      };
    })
    .sort((a, b) => b.occupancyPercent - a.occupancyPercent || a.businessName.localeCompare(b.businessName));

  const totals = rows.reduce(
    (acc, r) => {
      acc.totalCapacity += r.capacity;
      acc.totalCurrentlyInside += r.currentlyInside;
      acc.totalCheckedInToday += r.checkedInCount;
      acc.totalCheckedOutToday += r.checkedOutCount;
      return acc;
    },
    { totalCapacity: 0, totalCurrentlyInside: 0, totalCheckedInToday: 0, totalCheckedOutToday: 0 },
  );

  return { today, rows, totals };
}

router.get("/partner/scanner/bookings", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const allowed = await resolveScannerVendorIds(user.id, user.role);
  if (allowed.size === 0) {
    res.json({ rows: [], page: 1, totalPages: 1, total: 0, stats: { total: 0, notArrived: 0, inside: 0, checkedOut: 0, noShow: 0, cancelled: 0, currentlyInside: 0 } });
    return;
  }
  // Validate query params with the generated zod schema.
  const parsedQuery = GetPartnerScannerBookingsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    respondInvalid(res, parsedQuery.error, "Invalid query parameters");
    return;
  }
  const qp = parsedQuery.data;

  let scope = Array.from(allowed);
  if (qp.vendorId != null) {
    if (!allowed.has(qp.vendorId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    scope = [qp.vendorId];
  }
  const isIso = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const fromParam = isIso(qp.from) ? qp.from : undefined;
  const toParam = isIso(qp.to) ? qp.to : undefined;
  const dateParam = isIso(qp.date) ? qp.date : todayIstDate();
  const statuses = parseStatusList(qp.status);
  const q = typeof qp.q === "string" ? qp.q : "";
  const page = Math.max(1, qp.page ?? 1);
  const rawLimit = qp.limit ?? 50;
  const limit = Math.min(200, Math.max(1, rawLimit));

  const result = await fetchScannerBookings({
    vendorIds: scope,
    ...(fromParam && toParam ? { from: fromParam, to: toParam } : { date: dateParam }),
    statuses, q, page, limit,
  });
  res.json(result);
});

function parseStatusList(raw: unknown): ScannerLiveStatus[] {
  if (typeof raw !== "string" || !raw.trim() || raw === "all") return [];
  const valid: ReadonlySet<ScannerLiveStatus> = new Set([
    "notArrived",
    "inside",
    "checkedOut",
    "noShow",
    "cancelled",
  ]);
  const out: ScannerLiveStatus[] = [];
  for (const part of raw.split(",").map((s) => s.trim())) {
    if (valid.has(part as ScannerLiveStatus) && !out.includes(part as ScannerLiveStatus)) {
      out.push(part as ScannerLiveStatus);
    }
  }
  return out;
}

/**
 * Returns the list of vendors (pubs) the current user is allowed to scan
 * tickets for. Sourced from `resolveScannerVendorIds` so the scanner UI
 * never derives venue scope from booking results — a manager with one pub
 * and zero bookings today still sees their pub here.
 */
router.get("/partner/scanner/allowed-vendors", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const allowed = await resolveScannerVendorIds(user.id, user.role);
  if (allowed.size === 0) {
    res.json({ vendors: [] });
    return;
  }
  const rows = await db
    .select({ id: vendorsTable.id, businessName: vendorsTable.businessName })
    .from(vendorsTable)
    .where(inArray(vendorsTable.id, Array.from(allowed)));
  res.json({ vendors: rows });
});

router.get("/partner/scanner/occupancy", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const allowed = await resolveScannerVendorIds(user.id, user.role);
  const result = await fetchOccupancyForVendors(Array.from(allowed));
  res.json(result);
});

router.get("/admin/live-occupancy", requireAuth(["admin"]), async (req, res) => {
  const parsedQuery = GetAdminLiveOccupancyQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    respondInvalid(res, parsedQuery.error, "Invalid query parameters");
    return;
  }
  const cityRaw = parsedQuery.data.city ? parsedQuery.data.city.trim().toLowerCase() : "";
  const qRaw = parsedQuery.data.q ? parsedQuery.data.q.trim().toLowerCase() : "";
  const where = [eq(vendorsTable.status, "approved")];
  if (cityRaw) where.push(sql`lower(coalesce(${vendorsTable.city}, '')) like ${`%${cityRaw}%`}`);
  if (qRaw) {
    const like = `%${qRaw}%`;
    where.push(sql`(lower(${vendorsTable.businessName}) like ${like} or lower(coalesce(${vendorsTable.city}, '')) like ${like})`);
  }
  const allVendors = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(and(...where));
  const result = await fetchOccupancyForVendors(allVendors.map((v) => v.id));
  res.json(result);
});

router.get("/admin/live-occupancy/:vendorId/bookings", requireAuth(["admin"]), async (req, res) => {
  const parsedParams = GetAdminLiveOccupancyBookingsParams.safeParse(req.params);
  if (!parsedParams.success || !Number.isFinite(parsedParams.data.vendorId) || parsedParams.data.vendorId <= 0) {
    if (!parsedParams.success) {
      respondInvalid(res, parsedParams.error);
    } else {
      res.status(400).json({ error: "Invalid vendorId", fieldErrors: { vendorId: "Invalid vendorId" } });
    }
    return;
  }
  const parsedQuery = GetAdminLiveOccupancyBookingsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    respondInvalid(res, parsedQuery.error, "Invalid query parameters");
    return;
  }
  const vendorId = parsedParams.data.vendorId;
  const qp = parsedQuery.data;
  const isIso = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const fromParam = isIso(qp.from) ? qp.from : undefined;
  const toParam = isIso(qp.to) ? qp.to : undefined;
  const dateParam = isIso(qp.date) ? qp.date : todayIstDate();
  const statuses = parseStatusList(qp.status);
  const q = typeof qp.q === "string" ? qp.q : "";
  const result = await fetchScannerBookings({
    vendorIds: [vendorId],
    ...(fromParam && toParam ? { from: fromParam, to: toParam } : { date: dateParam }),
    statuses, q, page: 1, limit: 200,
  });
  res.json(result);
});

export default router;
