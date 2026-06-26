import { Router, type IRouter } from "express";
import {
  db,
  bookingsTable,
  eventsTable,
  vendorsTable,
  usersTable,
  paymentsTable,
  profileViewsTable,
  couponsTable,
  vendorCommissionsTable,
  commissionLedgerTable,
  organizerCommissionLedgerTable,
  gameCommissionLedgerTable,
  createYourPartyTable,
  createYourPartyTicketsTable,
  createYourPartyBookingsTable,
  vendorRequestsTable,
  vendorManagersTable,
  wishlistsTable,
  drinkPlansTable,
  organizersTable,
  organizerEventsTable,
  eventTicketsTable,
  venueAssignmentLogTable,
  partnerBlockedDatesTable,
} from "@workspace/db";
import { DrinkPlanBody } from "./vendors";
import { computeCommissionFromPlanned, computeCommissionFromActuals, REALISED_COMMISSION_TRIGGERS } from "../lib/commission";
import { bookingDiscountRatio, ferTierFreeness, computeEffectiveRevenues } from "../lib/effectiveRevenue";
import { migrateMediaToS3 } from "../lib/migrateMedia";
import { seedDemoPubs } from "../lib/seedDemoPubs";
import { seedProdShowcase } from "../lib/seedProdShowcase";
import { repairProdMedia } from "../lib/repairProdMedia";
import { eq, desc, asc, sql, inArray, isNotNull, isNull, and, gte, lte, or } from "drizzle-orm";
import * as XLSX from "xlsx";
import { requireAuth, hashPassword, type AuthedRequest } from "../lib/auth";
import { createUserNotification } from "../lib/notify";
import { sendEventApprovedEmail } from "../lib/notifications";
import { generateTicketCode, generateUniqueTicketPrefix, generateTicketSalt } from "../lib/ticketCode";
import { resolvePlaceFromUrl, resolvePlaceById, downloadAndStorePhoto } from "../lib/googlePlaces";
import { respondInvalid } from "../lib/validationError";
import {
  PatchAdminEventBody,
  PatchAdminEventParams,
  AdminUpdateVendorBody,
  AdminUpdateVendorParams,
  SetVendorCommissionBody,
  SetVendorCommissionParams,
  AdminSendCouponBody,
  AdminSendCouponParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Venue categories selectable from the admin Venues tab create/edit form.
const VENUE_CATEGORIES = ["Pub", "Club", "Pub & Club", "Bar & Club"] as const;

const _istFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function toIstDateStr(d: Date | string): string {
  return _istFmt.format(typeof d === "string" ? new Date(d) : d);
}

router.get("/admin/analytics", requireAuth(["admin"]), async (req, res) => {
  // Parse optional date range; defaults: last 12 months
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setFullYear(defaultStart.getFullYear() - 1);
  defaultStart.setDate(1);
  defaultStart.setHours(0, 0, 0, 0);

  const startDateStr = req.query["startDate"] as string | undefined;
  const endDateStr = req.query["endDate"] as string | undefined;
  const rangeStart: Date = startDateStr ? new Date(`${startDateStr}T00:00:00+05:30`) : defaultStart;
  const rangeEnd: Date = endDateStr ? new Date(`${endDateStr}T23:59:59+05:30`) : now;

  const [usersCount, vendorsCount, pendingCount, eventsCount, bookingsCount] =
    await Promise.all([
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(
          sql`${usersTable.createdAt} >= ${rangeStart} AND ${usersTable.createdAt} <= ${rangeEnd}`,
        ),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(vendorsTable)
        .where(
          sql`${vendorsTable.createdAt} >= ${rangeStart} AND ${vendorsTable.createdAt} <= ${rangeEnd}`,
        ),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(vendorsTable)
        .where(eq(vendorsTable.status, "pending")),
      db.select({ c: sql<number>`count(*)::int` }).from(eventsTable),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(bookingsTable)
        .where(
          sql`${bookingsTable.createdAt} >= ${rangeStart} AND ${bookingsTable.createdAt} <= ${rangeEnd}`,
        ),
    ]);

  // Revenue / commission KPIs gated on `checkedIn = true` (Save Actual Entry
  // is the sole trigger for that flag). Bookings that are paid but not yet
  // finalized at the door don't contribute to the KPIs — matches the spec:
  // analytics update only on Save Actual Entry, never on a bare QR scan.
  const paymentSplitRows = await db
    .select({
      paymentMethod: bookingsTable.paymentMethod,
      total: sql<string>`coalesce(sum(${bookingsTable.finalPrice}), 0)::text`,
    })
    .from(bookingsTable)
    .where(
      sql`${bookingsTable.status} IN ('confirmed', 'completed') AND ${bookingsTable.checkedIn} = true AND ${bookingsTable.createdAt} >= ${rangeStart} AND ${bookingsTable.createdAt} <= ${rangeEnd}`,
    )
    .groupBy(bookingsTable.paymentMethod);

  const statusCounts = await db
    .select({
      status: bookingsTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(bookingsTable)
    .where(
      sql`${bookingsTable.createdAt} >= ${rangeStart} AND ${bookingsTable.createdAt} <= ${rangeEnd}`,
    )
    .groupBy(bookingsTable.status);

  const recent = await db
    .select()
    .from(bookingsTable)
    .orderBy(desc(bookingsTable.createdAt))
    .limit(8);

  // Top vendors are now derived from the in-memory per-vendor aggregation below so they
  // use the new revenue formula (online + actual COD), not booked finalPrice.

  // Ticket breakdown + daily revenue + per-vendor breakdown (all filtered by date range)
  const confirmedBookings = await db
    .select({
      id: bookingsTable.id,
      vendorId: bookingsTable.vendorId,
      eventId: bookingsTable.eventId,
      bookingDate: bookingsTable.bookingDate,
      finalPrice: bookingsTable.finalPrice,
      // Needed by bookingDiscountRatio() so the admin COD figure scales
      // down for coupon/points discounts the same way the partner KPI does.
      totalPrice: bookingsTable.totalPrice,
      ticketWomen: bookingsTable.ticketWomen,
      ticketMen: bookingsTable.ticketMen,
      ticketCouple: bookingsTable.ticketCouple,
      createdAt: bookingsTable.createdAt,
      paymentMethod: bookingsTable.paymentMethod,
      pubMode: bookingsTable.pubMode,
      guests: bookingsTable.guests,
      actualWomen: bookingsTable.actualWomen,
      actualMen: bookingsTable.actualMen,
      actualCouple: bookingsTable.actualCouple,
      actualGuests: bookingsTable.actualGuests,
      baseFee: bookingsTable.baseFee,
      eventCommissionPct: bookingsTable.eventCommissionPct,
    })
    .from(bookingsTable)
    .where(
      sql`${bookingsTable.status} IN ('confirmed', 'completed') AND ${bookingsTable.checkedIn} = true AND ${bookingsTable.createdAt} >= ${rangeStart} AND ${bookingsTable.createdAt} <= ${rangeEnd}`,
    );

  // Pre-fetch events for ticket-mode per-type prices, used to compute actual COD revenue.
  const _codEventIds = Array.from(new Set(
    confirmedBookings
      .filter((b) => b.paymentMethod === "cod" && b.pubMode === "ticket")
      .map((b) => b.eventId),
  ));
  const _codEvents = _codEventIds.length > 0
    ? await db.select().from(eventsTable).where(
        sql`${eventsTable.id} IN (${sql.join(_codEventIds, sql`, `)})`,
      )
    : [];
  const _codEventMap = new Map(_codEvents.map((e) => [e.id, e]));

  // Marker for "this booking has been QR-scanned" — a row in commission_ledger
  // with a REALISED trigger (online_payment / cod_checkin / free_checkin).
  // The UNIQUE (booking_id, trigger) constraint makes the marker dedup-safe.
  // Source of truth for the "after QR scans" gating used by both the Revenue
  // KPI's COD slice and the COD Collected (Actual) KPI below.
  const analyticsBookingIds = confirmedBookings.map((b) => b.id);
  const realisedLedgerRows = analyticsBookingIds.length > 0
    ? await db
        .select({ bookingId: commissionLedgerTable.bookingId })
        .from(commissionLedgerTable)
        .where(
          and(
            inArray(commissionLedgerTable.trigger, [...REALISED_COMMISSION_TRIGGERS]),
            inArray(commissionLedgerTable.bookingId, analyticsBookingIds),
          ),
        )
    : [];
  const realisedBookingIds = new Set<number>();
  for (const row of realisedLedgerRows) {
    if (row.bookingId != null) realisedBookingIds.add(row.bookingId);
  }

  // Per-booking effective revenue.
  // Revenue KPI rule (matches user spec):
  //   online → finalPrice for every successful online booking (status reaches
  //            confirmed/completed only after payment success).
  //   cod    → ₹0 until the QR scan creates a cod_checkin ledger entry. After
  //            scan, revenue = actual cash collected (priceWomen × actualWomen
  //            + ... for ticket-mode, or pro-rata of finalPrice by actual
  //            guests for table/free-entry mode).
  // COD Collected (Actual) KPI is the COD slice of this same calculation, so
  // the two KPIs cannot diverge.
  let actualCodRevenue = 0;
  let actualCodRecordedCount = 0;
  let pendingActualsCount = 0;
  for (const b of confirmedBookings) {
    let bookingRevenue = 0;
    if (b.paymentMethod !== "cod") {
      bookingRevenue = Number(b.finalPrice);
    } else if (realisedBookingIds.has(b.id)) {
      const aw = b.actualWomen, am = b.actualMen, ac = b.actualCouple, ag = b.actualGuests;
      actualCodRecordedCount++;
      if (b.pubMode === "ticket") {
        // Per-tier prices with FER-free tiers zeroed for THIS booking's
        // weekday, then scaled by the booking's discount ratio so coupons
        // and reward-points deductions applied at booking time also reduce
        // the COD shown on the admin KPI. Mirrors lib/effectiveRevenue.ts
        // so admin and partner KPIs agree to the rupee. Example:
        //   Mixed booking 1F (FER-free) + 1M (₹1000 paid), no coupon →
        //   COD Collected (Actual) = ₹1000. With 50% coupon → ₹500.
        const ev = _codEventMap.get(b.eventId);
        const flags = ferTierFreeness(
          b.bookingDate,
          (ev as { freeEntryRules?: { enabled?: boolean; days?: string[]; genders?: string[] } | null } | undefined)?.freeEntryRules ?? null,
        );
        const pw = flags.women ? 0 : Number(ev?.priceWomen ?? 0);
        const pm = flags.men ? 0 : Number(ev?.priceMen ?? 0);
        const pc = flags.couple ? 0 : Number(ev?.priceCouple ?? 0);
        const gross = (aw ?? 0) * pw + (am ?? 0) * pm + (ac ?? 0) * pc;
        bookingRevenue = gross * bookingDiscountRatio(b);
      } else {
        const guests = Math.max(1, b.guests);
        bookingRevenue = ((ag ?? 0) / guests) * Number(b.finalPrice);
      }
      actualCodRevenue += bookingRevenue;
    } else {
      pendingActualsCount++;
    }
    // Attach revenue directly to booking object for downstream loops
    (b as unknown as { _rev: number })._rev = bookingRevenue;
  }
  const totalRevenue = confirmedBookings.reduce((s, b) => s + ((b as unknown as { _rev: number })._rev ?? 0), 0);
  const totalBaseFee = confirmedBookings.reduce((s, b) => s + (b.baseFee ?? 0), 0);

  // Monthly revenue: bucket in-memory using new revenue formula
  const monthlyMap = new Map<string, number>();
  const mCursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const mEnd = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);
  while (mCursor <= mEnd) {
    const key = `${mCursor.getFullYear()}-${String(mCursor.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, 0);
    mCursor.setMonth(mCursor.getMonth() + 1);
  }
  for (const b of confirmedBookings) {
    const d = new Date(b.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthlyMap.has(key)) {
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + ((b as unknown as { _rev: number })._rev ?? 0));
    }
  }
  const monthlyRevenue = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue: Math.round(revenue) }));

  let totalWomen = 0;
  let totalMen = 0;
  let totalCouple = 0;
  // Real check-ins captured at the door (sum of `actualWomen / actualMen /
  // actualCouple` across all confirmed/completed bookings in the window,
  // regardless of payment method). `actualsRecordedCount` is how many of
  // those bookings have ANY actuals recorded; `actualsEligibleCount` is
  // every confirmed/completed booking in the window. Together they let
  // the UI show a "X of Y bookings recorded" completeness hint.
  let actualWomenTotal = 0;
  let actualMenTotal = 0;
  let actualCoupleTotal = 0;
  let actualsRecordedCount = 0;
  const actualsEligibleCount = confirmedBookings.length;
  // Daily chart: last 30 days clamped to [rangeStart, rangeEnd]
  const dayMs = 24 * 60 * 60 * 1000;
  const dailyMap = new Map<string, number>();
  const dailyStart = new Date(Math.max(rangeStart.getTime(), rangeEnd.getTime() - 29 * dayMs));
  const dCursor = new Date(dailyStart);
  while (dCursor <= rangeEnd) {
    dailyMap.set(toIstDateStr(dCursor), 0);
    dCursor.setTime(dCursor.getTime() + dayMs);
  }
  const perVendorMap = new Map<number, {
    vendorId: number; bookingCount: number;
    ticketWomen: number; ticketMen: number; ticketCouple: number; revenue: number;
  }>();
  for (const b of confirmedBookings) {
    // Headcount totals follow ACTUAL door counts when present, fall back
    // to booked. Reducing a count via Save Actual Entry now flows
    // through to totalWomen/Men/Couple and the per-vendor row too.
    const aw = b.actualWomen ?? b.ticketWomen;
    const am = b.actualMen ?? b.ticketMen;
    const ac = b.actualCouple ?? b.ticketCouple;
    totalWomen += aw;
    totalMen += am;
    totalCouple += ac;
    actualWomenTotal += b.actualWomen ?? 0;
    actualMenTotal += b.actualMen ?? 0;
    actualCoupleTotal += b.actualCouple ?? 0;
    if (
      b.actualWomen != null ||
      b.actualMen != null ||
      b.actualCouple != null ||
      b.actualGuests != null
    ) {
      actualsRecordedCount += 1;
    }
    const rev = (b as unknown as { _rev: number })._rev ?? 0;
    const day = toIstDateStr(b.createdAt);
    if (new Date(b.createdAt) >= dailyStart && dailyMap.has(day)) {
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + rev);
    }
    const pv = perVendorMap.get(b.vendorId);
    if (pv) {
      pv.bookingCount += 1;
      pv.ticketWomen += aw;
      pv.ticketMen += am;
      pv.ticketCouple += ac;
      pv.revenue += rev;
    } else {
      perVendorMap.set(b.vendorId, {
        vendorId: b.vendorId,
        bookingCount: 1,
        ticketWomen: aw,
        ticketMen: am,
        ticketCouple: ac,
        revenue: rev,
      });
    }
  }
  const adminDailyRevenue = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue: Math.round(revenue) }));

  const codRevenue = Number(paymentSplitRows.find((r) => r.paymentMethod === "cod")?.total ?? 0);
  const onlineRevenue = Number(paymentSplitRows.find((r) => r.paymentMethod === "online")?.total ?? 0);

  const allVendors = await db.select().from(vendorsTable);
  const allVMap = new Map(allVendors.map((v) => [v.id, v]));

  // "Total Commission" KPI = Commission Report totals.totalCommission.
  // Sum of actuals-based commission (current rate card × verified door counts)
  // for every confirmed/completed+checkedIn booking in the window. Falls back
  // to booked counts only when actuals are null (should not happen for
  // checkedIn=true rows, but guards against partial data). Matches the
  // Commission Report's per-vendor totalCommission aggregation to the rupee.
  const vendorCommissionRows = await db.select().from(vendorCommissionsTable);
  const vendorCommissionMap = new Map(vendorCommissionRows.map((r) => [r.vendorId, r]));

  const analyticsEventIds = Array.from(new Set(confirmedBookings.map((b) => b.eventId)));
  const analyticsEventRows = analyticsEventIds.length > 0
    ? await db
        .select({
          id: eventsTable.id,
          freeEntryRules: eventsTable.freeEntryRules,
          priceWomen: eventsTable.priceWomen,
          priceMen: eventsTable.priceMen,
          priceCouple: eventsTable.priceCouple,
        })
        .from(eventsTable)
        .where(inArray(eventsTable.id, analyticsEventIds))
    : [];
  // Single map carries both FER rules and per-tier prices so the
  // percentage-based ticket commission has all the data it needs.
  const analyticsEventMap = new Map(analyticsEventRows.map((e) => [e.id, e]));

  let totalCommission = 0;
  for (const b of confirmedBookings) {
    const rates = vendorCommissionMap.get(b.vendorId) ?? { freeEntryRate: 0, ticketRate: 0, tableBookingRate: 0 };
    const ev = analyticsEventMap.get(b.eventId);
    const comm = computeCommissionFromActuals(
      b,
      rates,
      { priceWomen: ev?.priceWomen, priceMen: ev?.priceMen, priceCouple: ev?.priceCouple },
      (ev?.freeEntryRules as { enabled?: boolean; days?: string[]; genders?: string[] } | null) ?? null,
    );
    totalCommission += comm.amount;
  }
  totalCommission = Math.round(totalCommission * 100) / 100;

  // ── Per-vertical commission breakdown (realised ledgers, range-filtered) ────
  // Four disjoint sources so the boxes add up to the grand total below:
  //   Pubs & Clubs   → commission_ledger (vendor)
  //   Events         → organizer_commission_ledger (Event Organizer vertical)
  //   Games          → game_commission_ledger (Game Organizer vertical)
  //   Create a Party → create_your_party_bookings.commission_amount (confirmed)
  // Party is online-only, so its revenue == its online revenue.
  const round2c = (n: number) => Math.round(n * 100) / 100;
  const [pubClubCommRows, eventsCommRows, gamesCommRows, partyAggRows] = await Promise.all([
    db
      .select({ s: sql<string>`coalesce(sum(${commissionLedgerTable.amount}), 0)::text` })
      .from(commissionLedgerTable)
      .where(sql`${commissionLedgerTable.createdAt} >= ${rangeStart} AND ${commissionLedgerTable.createdAt} <= ${rangeEnd}`),
    db
      .select({ s: sql<string>`coalesce(sum(${organizerCommissionLedgerTable.commission}), 0)::text` })
      .from(organizerCommissionLedgerTable)
      .where(sql`${organizerCommissionLedgerTable.createdAt} >= ${rangeStart} AND ${organizerCommissionLedgerTable.createdAt} <= ${rangeEnd}`),
    db
      .select({ s: sql<string>`coalesce(sum(${gameCommissionLedgerTable.commission}), 0)::text` })
      .from(gameCommissionLedgerTable)
      .where(sql`${gameCommissionLedgerTable.createdAt} >= ${rangeStart} AND ${gameCommissionLedgerTable.createdAt} <= ${rangeEnd}`),
    db
      .select({
        comm: sql<string>`coalesce(sum(${createYourPartyBookingsTable.commissionAmount}), 0)::text`,
        rev: sql<string>`coalesce(sum(${createYourPartyBookingsTable.totalPrice}), 0)::text`,
      })
      .from(createYourPartyBookingsTable)
      .where(sql`${createYourPartyBookingsTable.status} IN ('confirmed', 'completed') AND ${createYourPartyBookingsTable.createdAt} >= ${rangeStart} AND ${createYourPartyBookingsTable.createdAt} <= ${rangeEnd}`),
  ]);
  const pubClubCommission = round2c(Number(pubClubCommRows[0]?.s ?? 0));
  const eventsCommission = round2c(Number(eventsCommRows[0]?.s ?? 0));
  const gamesCommission = round2c(Number(gamesCommRows[0]?.s ?? 0));
  const partyCommission = round2c(Number(partyAggRows[0]?.comm ?? 0));
  const partyRevenue = round2c(Number(partyAggRows[0]?.rev ?? 0));

  // Grand total now spans every vertical (incl. party) and equals the sum of
  // the four breakdown boxes shown on the dashboard.
  totalCommission = round2c(pubClubCommission + partyCommission + eventsCommission + gamesCommission);
  const commissionBreakdown = {
    pubClub: pubClubCommission,
    party: partyCommission,
    events: eventsCommission,
    games: gamesCommission,
  };

  const perVendor = Array.from(perVendorMap.values())
    .map((pv) => ({ ...pv, vendorName: allVMap.get(pv.vendorId)?.businessName ?? `Partner #${pv.vendorId}` }))
    .sort((a, b) => b.revenue - a.revenue);

  const pvPage = Math.max(1, Number(req.query["page"]) || 1);
  const pvLimit = Math.max(1, Number(req.query["limit"]) || 10);
  const pvTotal = perVendor.length;
  const pvTotalPages = Math.max(1, Math.ceil(pvTotal / pvLimit));
  const pvSafePage = Math.min(pvPage, pvTotalPages);
  const pvData = perVendor.slice((pvSafePage - 1) * pvLimit, pvSafePage * pvLimit)
    .map((pv) => ({ ...pv, revenue: Math.round(pv.revenue) }));

  // Top 5 vendors by new revenue formula (online + actual COD)
  const topVendors = perVendor.slice(0, 5).map((pv) => ({
    vendorId: pv.vendorId,
    businessName: pv.vendorName,
    bookingCount: pv.bookingCount,
    revenue: Math.round(pv.revenue),
  }));

  const { default: bookingsRouter } = await import("./bookings");
  void bookingsRouter;

  // Serialize recent bookings inline (small list)
  const eventIds = Array.from(new Set(recent.map((b) => b.eventId)));
  const userIds = Array.from(new Set(recent.map((b) => b.userId)));
  const vendorIds = Array.from(new Set(recent.map((b) => b.vendorId)));
  const [events, users, vendors] = await Promise.all([
    eventIds.length
      ? db
          .select()
          .from(eventsTable)
          .where(
            sql`${eventsTable.id} IN (${sql.join(eventIds, sql`, `)})`,
          )
      : Promise.resolve([]),
    userIds.length
      ? db
          .select()
          .from(usersTable)
          .where(
            sql`${usersTable.id} IN (${sql.join(userIds, sql`, `)})`,
          )
      : Promise.resolve([]),
    vendorIds.length
      ? db
          .select()
          .from(vendorsTable)
          .where(
            sql`${vendorsTable.id} IN (${sql.join(vendorIds, sql`, `)})`,
          )
      : Promise.resolve([]),
  ]);
  const eMap = new Map(events.map((e) => [e.id, e]));
  const uMap = new Map(users.map((u) => [u.id, u]));
  const vMap2 = new Map(vendors.map((v) => [v.id, v]));
  const recentBookings = recent.map((b) => {
    const e = eMap.get(b.eventId);
    const u = uMap.get(b.userId);
    const v = vMap2.get(b.vendorId);
    // Total people in the booking, matching freeEntryPeopleCount() in
    // lib/commission.ts: prefer per-tier headcount (couple = 2 people),
    // fall back to `guests` for table-mode and legacy event-mode rows.
    const tierHeads = (b.ticketWomen ?? 0) + (b.ticketMen ?? 0) + (b.ticketCouple ?? 0) * 2;
    const peopleCount = tierHeads > 0 ? tierHeads : Math.max(0, b.guests);
    return {
      id: b.id,
      eventId: b.eventId,
      userId: b.userId,
      vendorId: b.vendorId,
      bookingDate: b.bookingDate,
      guests: b.guests,
      peopleCount,
      totalPrice: Number(b.totalPrice),
      notes: b.notes ?? "",
      status: b.status,
      createdAt: b.createdAt.toISOString(),
      eventTitle: e?.title ?? "",
      eventImage: e?.imageUrl ?? "",
      vendorName: v?.businessName ?? "",
      userName: u?.name ?? "",
      userEmail: u?.email ?? "",
      // Required by the Booking schema. Was previously omitted, which
      // tripped client-side Zod validation on the generated React Query
      // hook and broke the entire Admin Analytics dashboard load.
      phone: b.phone ?? u?.phone ?? "",
    };
  });

  res.json({
    totalUsers: usersCount[0]?.c ?? 0,
    totalVendors: vendorsCount[0]?.c ?? 0,
    pendingVendors: pendingCount[0]?.c ?? 0,
    totalEvents: eventsCount[0]?.c ?? 0,
    totalBookings: bookingsCount[0]?.c ?? 0,
    // Revenue + online payments now span every vertical, incl. the
    // online-only "Create Your Own Party" bookings.
    totalRevenue: Math.round(totalRevenue + partyRevenue),
    totalBaseFee: Math.round(totalBaseFee),
    // Grand total across pubs/clubs, events, games and parties (= sum of the
    // commissionBreakdown boxes).
    totalCommission,
    commissionBreakdown,
    codRevenue,
    actualCodRevenue: Math.round(actualCodRevenue),
    actualCodRecordedCount,
    pendingActualsCount,
    onlineRevenue: round2c(onlineRevenue + partyRevenue),
    bookingsByStatus: statusCounts.map((s) => ({
      status: s.status,
      count: s.count,
    })),
    recentBookings,
    topVendors,
    totalWomen,
    totalMen,
    totalCouple,
    actualWomen: actualWomenTotal,
    actualMen: actualMenTotal,
    actualCouple: actualCoupleTotal,
    actualsRecordedCount,
    actualsEligibleCount,
    dailyRevenue: adminDailyRevenue,
    monthlyRevenue,
    perVendorPaginated: {
      data: pvData,
      total: pvTotal,
      page: pvSafePage,
      totalPages: pvTotalPages,
    },
  });
});

router.get("/admin/events", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(eventsTable)
    .orderBy(desc(eventsTable.createdAt));
  if (rows.length === 0) return res.json([]);
  const vendors = await db.select().from(vendorsTable);
  const vMap = new Map(vendors.map((v) => [v.id, v]));
  res.json(
    rows.map((e) => {
      const v = vMap.get(e.vendorId);
      return {
        id: e.id,
        vendorId: e.vendorId,
        title: e.title,
        type: e.type,
        category: e.category,
        city: e.city,
        state: e.state,
        price: Number(e.price),
        imageUrl: e.imageUrl,
        featured: e.featured,
        popular: e.popular,
        popularSince: e.popularSince ? e.popularSince.toISOString() : null,
        dateNight: e.dateNight,
        approvalStatus: e.approvalStatus,
        retainForever: e.retainForever,
        hidden: (e as unknown as { hidden?: boolean }).hidden ?? false,
        partnerName: v?.businessName ?? "",
        vendorCrowdLevel: (v as unknown as { crowdLevel?: string | null })?.crowdLevel ?? null,
        vendorCategory: v?.category ?? null,
        createdAt: e.createdAt.toISOString(),
      };
    }),
  );
});

router.get("/admin/events/pending", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.approvalStatus, "pending"))
    .orderBy(desc(eventsTable.createdAt));
  if (rows.length === 0) return res.json([]);
  const vendors = await db.select().from(vendorsTable);
  const vMap = new Map(vendors.map((v) => [v.id, v]));
  res.json(
    rows.map((e) => ({
      id: e.id,
      vendorId: e.vendorId,
      title: e.title,
      type: e.type,
      category: e.category,
      city: e.city,
      state: e.state,
      price: Number(e.price),
      imageUrl: e.imageUrl,
      description: e.description,
      galleryImages: e.galleryImages ?? [],
      approvalStatus: e.approvalStatus,
      partnerName: vMap.get(e.vendorId)?.businessName ?? "",
      createdAt: e.createdAt.toISOString(),
    })),
  );
});

router.patch("/admin/events/:id", requireAuth(["admin"]), async (req, res) => {
  const paramsParsed = PatchAdminEventParams.safeParse({ eventId: req.params["id"] });
  if (!paramsParsed.success) {
    respondInvalid(res, paramsParsed.error);
    return;
  }
  const id = paramsParsed.data.eventId;
  const parsed = PatchAdminEventBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const data = parsed.data;
  const updates: Record<string, unknown> = {};

  if (data.popular !== undefined) {
    updates["popular"] = data.popular;
    updates["popularSince"] = data.popular ? new Date() : null;
  }
  if (data.featured !== undefined) updates["featured"] = data.featured;
  if (data.dateNight !== undefined) updates["dateNight"] = data.dateNight;
  if (data.retainForever !== undefined) updates["retainForever"] = data.retainForever;
  if (data.hidden !== undefined) updates["hidden"] = data.hidden;
  if (data.approvalStatus !== undefined) {
    updates["approvalStatus"] = data.approvalStatus;
    updates["rejectionReason"] = typeof data.rejectionReason === "string"
      ? data.rejectionReason
      : null;
    // Stamp the approval time so the storefront can show a "New" badge for a
    // fixed window (15 days) after approval, then auto-hide it. Reset to null
    // when the event leaves "approved" so a later re-approval restarts the window.
    updates["approvedAt"] = data.approvalStatus === "approved" ? new Date() : null;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [updated] = await db
    .update(eventsTable)
    .set(updates)
    .where(eq(eventsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // A `type='pub'` event IS the venue's listing — hiding/showing it hides/shows
  // the whole venue (and therefore all its events, offers, announcements and
  // drink plans, via the vendor.hidden read-filters). Reversible: un-hiding the
  // pub row clears vendor.hidden again.
  if (data.hidden !== undefined && updated.type === "pub") {
    await db
      .update(vendorsTable)
      .set({ hidden: data.hidden })
      .where(eq(vendorsTable.id, updated.vendorId));
  }
  res.json({ ok: true, approvalStatus: updated.approvalStatus });
  // Send email + in-app notification to the vendor owner when their event is approved
  if (data.approvalStatus === "approved") {
    const [vendor] = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.id, updated.vendorId))
      .limit(1);
    if (vendor) {
      const [vendorUser] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, vendor.userId))
        .limit(1);
      if (vendorUser) {
        await Promise.allSettled([
          sendEventApprovedEmail({
            to: vendorUser.email,
            toName: vendorUser.name,
            businessName: vendor.businessName,
            eventTitle: updated.title,
            eventId: updated.id,
          }),
          createUserNotification({
            userId: vendorUser.id,
            title: "Event approved and live!",
            message: `Your event "${updated.title}" has been approved and is now live on Royvento.`,
            url: "/dashboard/vendor",
            tag: `event-approved-${updated.id}`,
          }),
        ]);
      }
    }
  }
});

router.delete("/admin/events/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  // A `type='pub'` event IS the venue's listing. Deleting it from the Events tab
  // deletes the entire venue and everything it created (all events, offers,
  // announcements, drink plans, bookings, …) via the shared vendor cascade.
  const [ev] = await db
    .select({ type: eventsTable.type, vendorId: eventsTable.vendorId })
    .from(eventsTable)
    .where(eq(eventsTable.id, id))
    .limit(1);
  if (ev && ev.type === "pub") {
    try {
      const ok = await deleteVendorCascade(ev.vendorId);
      if (!ok) {
        res.status(404).json({ error: "Not found" });
        return;
      }
    } catch (err) {
      req.log.error({ err, vendorId: ev.vendorId, eventId: id }, "Failed to delete venue from event row");
      res.status(500).json({ error: `Failed to delete venue: ${err instanceof Error ? err.message : "Unknown error"}` });
      return;
    }
    res.json({ ok: true, deletedVenue: true });
    return;
  }
  try {
    await db.transaction(async (tx) => {
      // `bookings.event_id` is ON DELETE RESTRICT, so deleting an event while
      // bookings still reference it FK-errors out as an unhandled 500 (the
      // bug reported from the admin Events tab). Wishlists have no FK but are
      // cleaned up too so they don't dangle on a deleted event.
      await tx.delete(bookingsTable).where(eq(bookingsTable.eventId, id));
      await tx.delete(wishlistsTable).where(eq(wishlistsTable.eventId, id));
      // Remove announcements created for this event so none dangle on a deleted
      // event (the slider/feeds would otherwise still surface them).
      await tx.execute(sql`DELETE FROM announcements WHERE event_id = ${id}`);
      await tx.delete(eventsTable).where(eq(eventsTable.id, id));
    });
  } catch (err) {
    req.log.error({ err, eventId: id }, "Failed to delete event");
    res.status(500).json({ error: `Failed to delete event: ${err instanceof Error ? err.message : "Unknown error"}` });
    return;
  }
  res.json({ ok: true });
});

router.get("/admin/users", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt));
  res.json(
    rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      phone: u.phone,
      createdAt: u.createdAt.toISOString(),
    })),
  );
});

// ── Admin vendor management ──────────────────────────────────────────────────

router.get("/admin/vendors", requireAuth(["admin"]), async (req, res) => {
  const page = Math.max(1, Number(req.query["page"] ?? 1));
  const limit = Math.max(1, Number(req.query["limit"] ?? 20));

  const [countRow, rows] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(vendorsTable),
    db.select().from(vendorsTable).orderBy(desc(vendorsTable.createdAt)).limit(limit).offset((page - 1) * limit),
  ]);
  const total = countRow[0]?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (rows.length === 0) {
    res.json({ data: [], total, page, totalPages });
    return;
  }

  const eventCounts = await db
    .select({
      vendorId: eventsTable.vendorId,
      count: sql<number>`count(*)::int`,
    })
    .from(eventsTable)
    .groupBy(eventsTable.vendorId);
  const eCountMap = new Map(eventCounts.map((e) => [e.vendorId, e.count]));

  // Skip the sentinel owner id 0 (unassigned admin-owned venues have no user).
  const userIds = Array.from(new Set(rows.map((v) => v.userId).filter((idVal) => idVal && idVal !== 0)));
  const users = userIds.length
    ? await db
        .select({ id: usersTable.id, email: usersTable.email })
        .from(usersTable)
        .where(sql`${usersTable.id} IN (${sql.join(userIds, sql`, `)})`)
    : [];
  const uMap = new Map(users.map((u) => [u.id, u.email]));

  res.json({
    data: rows.map((v) => ({
      id: v.id,
      userId: v.userId,
      businessName: v.businessName,
      category: v.category,
      description: v.description,
      location: v.location,
      city: v.city,
      state: v.state,
      country: v.country,
      bannerImage: v.bannerImage,
      status: v.status,
      eventCount: eCountMap.get(v.id) ?? 0,
      userEmail: uMap.get(v.userId) ?? "",
      createdAt: v.createdAt.toISOString(),
    })),
    total,
    page,
    totalPages,
  });
});

router.patch("/admin/vendors/:id", requireAuth(["admin"]), async (req, res) => {
  const paramsParsed = AdminUpdateVendorParams.safeParse(req.params);
  if (!paramsParsed.success) {
    respondInvalid(res, paramsParsed.error);
    return;
  }
  const id = paramsParsed.data.id;
  const parsed = AdminUpdateVendorBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const data = parsed.data;
  const updates: Record<string, unknown> = {};

  if (data.businessName !== undefined && data.businessName.trim())
    updates["businessName"] = data.businessName.trim();
  if (data.description !== undefined) updates["description"] = data.description;
  if (data.category !== undefined && data.category.trim())
    updates["category"] = data.category.trim();
  if (data.status !== undefined) updates["status"] = data.status;
  if (data.city !== undefined) updates["city"] = data.city;
  if (data.state !== undefined) updates["state"] = data.state;
  if (data.country !== undefined) updates["country"] = data.country;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [v] = await db
    .update(vendorsTable)
    .set(updates)
    .where(eq(vendorsTable.id, id))
    .returning();

  if (!v) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true, vendor: { id: v.id, businessName: v.businessName, status: v.status } });
});

// ── Admin: set live crowd level for a vendor ────────────────────────────────

const VALID_CROWD_LEVELS = ["low", "moderate", "party"] as const;

router.patch("/admin/vendors/:id/crowd-level", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: "Invalid vendor id" });
    return;
  }
  const { crowdLevel } = req.body as { crowdLevel: string | null };
  if (crowdLevel !== null && !VALID_CROWD_LEVELS.includes(crowdLevel as (typeof VALID_CROWD_LEVELS)[number])) {
    res.status(400).json({ error: "crowdLevel must be 'low', 'moderate', 'party', or null" });
    return;
  }
  const [v] = await db
    .update(vendorsTable)
    .set({ crowdLevel: crowdLevel })
    .where(eq(vendorsTable.id, id))
    .returning({ id: vendorsTable.id, businessName: vendorsTable.businessName, crowdLevel: vendorsTable.crowdLevel });
  if (!v) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  res.json({ ok: true, vendorId: v.id, crowdLevel: v.crowdLevel ?? null });
});

// ── Admin: look up a partner by email (diagnostic before create-pub) ────────

router.get("/admin/lookup-partner", requireAuth(["admin"]), async (req, res) => {
  const emailRaw = String(req.query["email"] ?? "").trim();
  if (!emailRaw) {
    res.status(400).json({ error: "email query param is required" });
    return;
  }
  const normalized = emailRaw.toLowerCase();

  // ilike covers case-insensitive exact match for both normal and Google accounts
  const [user] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${normalized}`)
    .limit(1);

  if (!user) {
    res.status(404).json({
      error: `No account found for "${emailRaw}". Make sure the partner has signed up on Royvento (normal or Google Sign-In) and that the email address is spelled correctly.`,
    });
    return;
  }

  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.userId, user.id))
    .limit(1);

  const existingPub = vendor
    ? await db
        .select({ id: eventsTable.id, title: eventsTable.title })
        .from(eventsTable)
        .where(and(eq(eventsTable.vendorId, vendor.id), eq(eventsTable.type, "pub")))
        .limit(1)
    : [];

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      signInMethod: user.googleId ? "Google" : "Email/Password",
    },
    vendor: vendor
      ? {
          id: vendor.id,
          businessName: vendor.businessName,
          status: vendor.status,
          category: vendor.category,
          city: vendor.city,
          state: vendor.state,
        }
      : null,
    existingPub: existingPub[0] ?? null,
    canCreate:
      user.role === "vendor" &&
      vendor?.status === "approved" &&
      !existingPub[0],
    blockReason:
      user.role !== "vendor"
        ? `Account role is "${user.role}" — partner must complete the Become a Partner application first.`
        : !vendor
          ? "No vendor profile found for this account."
          : vendor.status !== "approved"
            ? `Vendor profile is "${vendor.status}" — admin must approve it before assigning a listing.`
            : existingPub[0]
              ? `Already has a ${vendor.category === "Club" ? "club" : "pub"} listing: "${existingPub[0].title}" (#${existingPub[0].id}).`
              : null,
  });
});

// ── Admin: create pub and assign to a partner by email ───────────────────────

router.post("/admin/create-pub", requireAuth(["admin"]), async (req, res) => {
  const {
    email, title, description, location, city, state, country,
    capacity, imageUrl, pubMode, priceWomen, priceMen, priceCouple,
    galleryImages, galleryVideo,
    pubEventTypes, dayPricing,
    freeEntryEnabled, freeEntryGenders, freeEntryDays, freeEntryBeforeTime,
    danceFloor, danceFloorPhotos, menuUrl, menuUrls, barMenuUrls,
  } = req.body as {
    email: string;
    title: string;
    description?: string;
    location?: string;
    city?: string;
    state?: string;
    country?: string;
    capacity?: number;
    imageUrl?: string;
    pubMode?: string;
    priceWomen?: number;
    priceMen?: number;
    priceCouple?: number;
    galleryImages?: string[];
    galleryVideo?: string;
    pubEventTypes?: string[];
    dayPricing?: Record<string, { women: number; men: number; couple: number }>;
    freeEntryEnabled?: boolean;
    freeEntryGenders?: string[];
    freeEntryDays?: string[];
    freeEntryBeforeTime?: string;
    danceFloor?: string;
    danceFloorPhotos?: string[];
    menuUrl?: string;
    menuUrls?: string[];
    barMenuUrls?: string[];
  };

  if (!email || !title) {
    res.status(400).json({ error: "email and title are required" });
    return;
  }

  // Case-insensitive lookup: Google Sign-In stores email exactly as returned by
  // Google (e.g. "User@Gmail.com"). Using lower() on both sides ensures we find
  // the account regardless of how the email was entered or stored.
  const normalizedEmail = email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${normalizedEmail}`)
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "No user found with that email. Check that the partner has registered on Royvento (normal sign-up or Google Sign-In)." });
    return;
  }
  if (user.role !== "vendor") {
    res.status(400).json({ error: `User found (${user.email}) but they are not a pub partner. Their role is '${user.role}'. They must complete the Become a Partner application first.` });
    return;
  }

  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.userId, user.id))
    .limit(1);

  if (!vendor) {
    res.status(400).json({ error: "Partner has no vendor profile" });
    return;
  }
  if (vendor.status !== "approved") {
    res.status(400).json({ error: "Partner's vendor profile is not yet approved" });
    return;
  }

  const existingPub = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(and(eq(eventsTable.vendorId, vendor.id), eq(eventsTable.type, "pub")))
    .limit(1);

  if (existingPub[0]) {
    const kind = vendor.category === "Club" ? "Club" : "Pub";
    res.status(409).json({ error: `${kind} already created for this partner` });
    return;
  }

  const freeEntryRules =
    freeEntryEnabled &&
    (freeEntryGenders?.length ?? 0) > 0 &&
    (freeEntryDays?.length ?? 0) > 0
      ? {
          enabled: true,
          genders: freeEntryGenders!,
          days: freeEntryDays!,
          ...(freeEntryBeforeTime ? { beforeTime: freeEntryBeforeTime } : {}),
        }
      : null;

  const [created] = await db
    .insert(eventsTable)
    .values({
      vendorId: vendor.id,
      title: title.trim(),
      description: description ?? "",
      category: vendor.category ?? "Pub",
      type: "pub",
      location: location ?? vendor.location ?? "",
      state: state ?? vendor.state ?? "",
      city: city ?? vendor.city ?? "",
      country: country ?? vendor.country ?? "India",
      price: "0",
      capacity: capacity ?? 100,
      imageUrl: imageUrl ?? vendor.bannerImage ?? "",
      pubMode: pubMode ?? "both",
      priceWomen: String(priceWomen ?? 0),
      priceMen: String(priceMen ?? 0),
      priceCouple: String(priceCouple ?? 0),
      galleryImages: galleryImages ?? [],
      galleryVideos: galleryVideo ? [galleryVideo] : [],
      pubEventTypes: pubEventTypes ?? [],
      dayPricing: dayPricing && Object.keys(dayPricing).length > 0 ? dayPricing : null,
      freeEntryRules,
      approvalStatus: "approved",
    })
    .returning();

  // Update vendor profile with dance floor and menu data if provided
  const menus = (menuUrls && menuUrls.length > 0) ? menuUrls : (menuUrl ? [menuUrl] : []);
  const barMenus = (barMenuUrls && barMenuUrls.length > 0) ? barMenuUrls : [];
  if (danceFloor !== undefined || (danceFloorPhotos && danceFloorPhotos.length > 0) || menus.length > 0 || barMenus.length > 0) {
    const vendorUpdates: Record<string, unknown> = {};
    if (danceFloor !== undefined) vendorUpdates["danceFloor"] = danceFloor || null;
    if (danceFloorPhotos && danceFloorPhotos.length > 0) {
      vendorUpdates["danceFloorPhotos"] = danceFloorPhotos;
    }
    if (menus.length > 0) {
      vendorUpdates["menuUrl"] = menus[0];
      vendorUpdates["menuUrls"] = menus;
    }
    if (barMenus.length > 0) {
      vendorUpdates["barMenuUrls"] = barMenus;
    }
    await db.update(vendorsTable).set(vendorUpdates).where(eq(vendorsTable.id, vendor.id));
  }

  res.json({ ok: true, pubId: created.id, vendorId: vendor.id, partnerName: vendor.businessName });
});

// ════════════════════════════════════════════════════════════════════════════
// Admin-owned venues: create & launch with no partner, operate unassigned, then
// assign to a partner by email later — preserving all vendor_id-keyed history.
// A venue = a `vendors` row + its `type='pub'` `events` row. Unassigned venues
// use the sentinel owner id 0 and assignment_status='unassigned'.
// ════════════════════════════════════════════════════════════════════════════

const UNASSIGNED_VENUE_USER_ID = 0;

// ── Admin: create an unassigned venue (no email, no approval) ────────────────
router.post("/admin/create-venue", requireAuth(["admin"]), async (req, res) => {
  const adminId = (req as AuthedRequest).user.id;
  const {
    businessName, category, description, location, city, state, country,
    capacity, imageUrl, pubMode, priceWomen, priceMen, priceCouple,
    galleryImages, galleryVideo, pubEventTypes, dayPricing,
    freeEntryEnabled, freeEntryGenders, freeEntryDays, freeEntryBeforeTime,
    danceFloor, danceFloorPhotos, menuUrl, menuUrls, barMenuUrls,
    startTime, endTime, happeningTonight, startingSoon, lastMinuteDeal, dealLabel,
    freeEntryForTable, freeEntryForTableDays, freeEntryForTableBeforeTime,
  } = req.body as {
    businessName: string;
    category?: string;
    description?: string;
    location?: string;
    city?: string;
    state?: string;
    country?: string;
    capacity?: number;
    imageUrl?: string;
    pubMode?: string;
    priceWomen?: number;
    priceMen?: number;
    priceCouple?: number;
    galleryImages?: string[];
    galleryVideo?: string;
    pubEventTypes?: string[];
    dayPricing?: Record<string, { women: number; men: number; couple: number }>;
    freeEntryEnabled?: boolean;
    freeEntryGenders?: string[];
    freeEntryDays?: string[];
    freeEntryBeforeTime?: string;
    danceFloor?: string;
    danceFloorPhotos?: string[];
    menuUrl?: string;
    menuUrls?: string[];
    barMenuUrls?: string[];
    startTime?: string;
    endTime?: string;
    happeningTonight?: boolean;
    startingSoon?: boolean;
    lastMinuteDeal?: boolean;
    dealLabel?: string;
    freeEntryForTable?: boolean;
    freeEntryForTableDays?: string[];
    freeEntryForTableBeforeTime?: string | null;
  };

  const title = (businessName ?? "").trim();
  if (!title) {
    res.status(400).json({ error: "Venue name is required" });
    return;
  }
  const cat = (category ?? "Pub").trim() || "Pub";
  if (!VENUE_CATEGORIES.includes(cat as typeof VENUE_CATEGORIES[number])) {
    res.status(400).json({ error: `category must be one of: ${VENUE_CATEGORIES.join(", ")}` });
    return;
  }

  const freeEntryRules =
    freeEntryEnabled &&
    (freeEntryGenders?.length ?? 0) > 0 &&
    (freeEntryDays?.length ?? 0) > 0
      ? {
          enabled: true,
          genders: freeEntryGenders!,
          days: freeEntryDays!,
          ...(freeEntryBeforeTime ? { beforeTime: freeEntryBeforeTime } : {}),
        }
      : null;

  const existingPrefixes = (await db.select({ p: vendorsTable.ticketPrefix }).from(vendorsTable)).map((r) => r.p).filter(Boolean);
  const ticketPrefix = await generateUniqueTicketPrefix(title, existingPrefixes);
  const menus = (menuUrls && menuUrls.length > 0) ? menuUrls : (menuUrl ? [menuUrl] : []);
  const barMenus = (barMenuUrls && barMenuUrls.length > 0) ? barMenuUrls : [];

  try {
    const result = await db.transaction(async (tx) => {
      const [vendor] = await tx
        .insert(vendorsTable)
        .values({
          userId: UNASSIGNED_VENUE_USER_ID,
          businessName: title,
          category: cat,
          description: description ?? "",
          location: location ?? "",
          state: state ?? "",
          city: city ?? "",
          country: country ?? "India",
          bannerImage: imageUrl ?? "",
          status: "approved",
          assignmentStatus: "unassigned",
          createdByAdminId: adminId,
          ticketPrefix,
          ticketSalt: generateTicketSalt(),
          danceFloor: danceFloor || null,
          danceFloorPhotos: (danceFloorPhotos && danceFloorPhotos.length > 0) ? danceFloorPhotos : null,
          menuUrl: menus[0] ?? "",
          menuUrls: menus,
          barMenuUrls: barMenus,
        })
        .returning();

      const [created] = await tx
        .insert(eventsTable)
        .values({
          vendorId: vendor.id,
          title,
          description: description ?? "",
          category: cat,
          type: "pub",
          location: location ?? "",
          state: state ?? "",
          city: city ?? "",
          country: country ?? "India",
          price: "0",
          capacity: capacity ?? 100,
          imageUrl: imageUrl ?? "",
          pubMode: pubMode ?? "both",
          priceWomen: String(priceWomen ?? 0),
          priceMen: String(priceMen ?? 0),
          priceCouple: String(priceCouple ?? 0),
          galleryImages: galleryImages ?? [],
          galleryVideos: galleryVideo ? [galleryVideo] : [],
          pubEventTypes: pubEventTypes ?? [],
          dayPricing: dayPricing && Object.keys(dayPricing).length > 0 ? dayPricing : null,
          freeEntryRules,
          startTime: startTime ?? "",
          endTime: endTime ?? "",
          happeningTonight: happeningTonight ?? true,
          startingSoon: startingSoon ?? true,
          lastMinuteDeal: lastMinuteDeal ?? false,
          dealLabel: dealLabel ?? "",
          freeEntryForTable: freeEntryForTable ?? false,
          freeEntryForTableDays: freeEntryForTable ? (freeEntryForTableDays ?? []) : null,
          freeEntryForTableBeforeTime: freeEntryForTable ? (freeEntryForTableBeforeTime || null) : null,
          approvalStatus: "approved",
          approvedAt: new Date(),
        })
        .returning();

      await tx.insert(venueAssignmentLogTable).values({
        vendorId: vendor.id,
        action: "created",
        actorAdminId: adminId,
        note: `Venue "${title}" created unassigned`,
      });

      return { vendorId: vendor.id, pubId: created.id, businessName: title };
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    req.log.error({ err }, "Failed to create venue");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create venue" });
  }
});

// ── Admin: list all venues with assignment status ───────────────────────────
router.get("/admin/venues", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db.select().from(vendorsTable).orderBy(desc(vendorsTable.createdAt));
  if (rows.length === 0) {
    res.json({ data: [] });
    return;
  }

  const ownerIds = Array.from(
    new Set(rows.map((v) => v.userId).filter((idVal) => idVal && idVal !== UNASSIGNED_VENUE_USER_ID)),
  );
  const owners = ownerIds.length
    ? await db
        .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
        .from(usersTable)
        .where(inArray(usersTable.id, ownerIds))
    : [];
  const oMap = new Map(owners.map((u) => [u.id, u]));

  const vendorIds = rows.map((v) => v.id);
  const pubEvents = await db
    .select({ id: eventsTable.id, vendorId: eventsTable.vendorId })
    .from(eventsTable)
    .where(and(inArray(eventsTable.vendorId, vendorIds), eq(eventsTable.type, "pub")));
  const pubMap = new Map(pubEvents.map((e) => [e.vendorId, e.id]));

  const eventCounts = await db
    .select({ vendorId: eventsTable.vendorId, count: sql<number>`count(*)::int` })
    .from(eventsTable)
    .where(inArray(eventsTable.vendorId, vendorIds))
    .groupBy(eventsTable.vendorId);
  const ecMap = new Map(eventCounts.map((e) => [e.vendorId, e.count]));

  const bookingCounts = await db
    .select({ vendorId: bookingsTable.vendorId, count: sql<number>`count(*)::int` })
    .from(bookingsTable)
    .where(inArray(bookingsTable.vendorId, vendorIds))
    .groupBy(bookingsTable.vendorId);
  const bcMap = new Map(bookingCounts.map((b) => [b.vendorId, b.count]));

  res.json({
    data: rows.map((v) => {
      const owner = v.userId && v.userId !== UNASSIGNED_VENUE_USER_ID ? oMap.get(v.userId) : null;
      return {
        id: v.id,
        businessName: v.businessName,
        category: v.category,
        city: v.city,
        state: v.state,
        country: v.country,
        bannerImage: v.bannerImage,
        status: v.status,
        assignmentStatus: v.assignmentStatus,
        assignedAt: v.assignedAt ? v.assignedAt.toISOString() : null,
        pubId: pubMap.get(v.id) ?? null,
        eventCount: ecMap.get(v.id) ?? 0,
        bookingCount: bcMap.get(v.id) ?? 0,
        ownerUserId: owner?.id ?? null,
        ownerEmail: owner?.email ?? "",
        ownerName: owner?.name ?? "",
        createdByAdminId: v.createdByAdminId ?? null,
        createdAt: v.createdAt.toISOString(),
      };
    }),
  });
});

// ── Admin: assign / reassign a venue to a partner by email ──────────────────
router.post("/admin/venues/:id/assign", requireAuth(["admin"]), async (req, res) => {
  const adminId = (req as AuthedRequest).user.id;
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid venue id" });
    return;
  }
  const { email, note } = req.body as { email?: string; note?: string };
  const emailRaw = String(email ?? "").trim();
  if (!emailRaw) {
    res.status(400).json({ error: "Partner email is required" });
    return;
  }
  const normalized = emailRaw.toLowerCase();

  const [venue] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
  if (!venue) {
    res.status(404).json({ error: "Venue not found" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${normalized}`)
    .limit(1);
  if (!user) {
    res.status(404).json({
      error: `No account found for "${emailRaw}". The partner must have a registered Royvento account (email or Google Sign-In) before a venue can be assigned.`,
    });
    return;
  }
  if (user.role === "admin") {
    res.status(400).json({ error: "Cannot assign a venue to an admin account." });
    return;
  }
  if (user.role === "organizer" || user.role === "game_organizer") {
    res.status(400).json({ error: `That account is an ${user.role} and cannot own a pub/club venue.` });
    return;
  }
  if (venue.userId === user.id) {
    res.status(409).json({ error: "This venue is already assigned to that partner." });
    return;
  }

  // 1:1 rule — block if the target already owns a different venue.
  const [otherVenue] = await db
    .select({ id: vendorsTable.id, businessName: vendorsTable.businessName })
    .from(vendorsTable)
    .where(and(eq(vendorsTable.userId, user.id), sql`${vendorsTable.id} <> ${id}`))
    .limit(1);
  if (otherVenue) {
    res.status(409).json({
      error: `${user.email} already owns a venue ("${otherVenue.businessName}"). Each partner can own only one venue — unassign that one first.`,
    });
    return;
  }

  const wasAssigned = venue.assignmentStatus === "assigned" && venue.userId !== UNASSIGNED_VENUE_USER_ID;
  const previousUserId = wasAssigned ? venue.userId : null;

  try {
    await db.transaction(async (tx) => {
      // Relink ownership on the SAME vendor row → all vendor_id-keyed history
      // (bookings, commission, reviews) is preserved with no copy/duplication.
      await tx
        .update(vendorsTable)
        .set({
          userId: user.id,
          assignmentStatus: "assigned",
          assignedAt: new Date(),
          assignedByAdminId: adminId,
          status: "approved",
        })
        .where(eq(vendorsTable.id, id));

      if (user.role === "user") {
        await tx.update(usersTable).set({ role: "vendor" }).where(eq(usersTable.id, user.id));
      }

      // On reassignment, revert the previous owner to a plain user if they no
      // longer own any venue (1:1 ⇒ they now own none).
      if (previousUserId) {
        const stillOwns = await tx
          .select({ id: vendorsTable.id })
          .from(vendorsTable)
          .where(eq(vendorsTable.userId, previousUserId))
          .limit(1);
        if (stillOwns.length === 0) {
          await tx
            .update(usersTable)
            .set({ role: "user" })
            .where(and(eq(usersTable.id, previousUserId), eq(usersTable.role, "vendor")));
        }
      }

      await tx.insert(venueAssignmentLogTable).values({
        vendorId: id,
        action: wasAssigned ? "reassigned" : "assigned",
        actorAdminId: adminId,
        partnerUserId: user.id,
        partnerEmail: user.email,
        previousUserId,
        note: String(note ?? "").slice(0, 500),
      });
    });
  } catch (err) {
    req.log.error({ err, venueId: id }, "Failed to assign venue");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to assign venue" });
    return;
  }

  await createUserNotification({
    userId: user.id,
    title: "A venue has been assigned to you",
    message: `You now manage "${venue.businessName}" on Royvento. Open your Partner Studio to take over.`,
    url: "/vendor-dashboard",
  });

  res.json({
    ok: true,
    vendorId: id,
    partnerUserId: user.id,
    partnerEmail: user.email,
    action: wasAssigned ? "reassigned" : "assigned",
  });
});

// ── Admin: unassign a venue (override — returns it to unassigned state) ──────
router.post("/admin/venues/:id/unassign", requireAuth(["admin"]), async (req, res) => {
  const adminId = (req as AuthedRequest).user.id;
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid venue id" });
    return;
  }
  const { note } = req.body as { note?: string };
  const [venue] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
  if (!venue) {
    res.status(404).json({ error: "Venue not found" });
    return;
  }
  if (venue.assignmentStatus !== "assigned" || venue.userId === UNASSIGNED_VENUE_USER_ID) {
    res.status(409).json({ error: "Venue is already unassigned." });
    return;
  }
  const previousUserId = venue.userId;
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(vendorsTable)
        .set({
          userId: UNASSIGNED_VENUE_USER_ID,
          assignmentStatus: "unassigned",
          assignedAt: null,
          assignedByAdminId: null,
        })
        .where(eq(vendorsTable.id, id));

      const stillOwns = await tx
        .select({ id: vendorsTable.id })
        .from(vendorsTable)
        .where(eq(vendorsTable.userId, previousUserId))
        .limit(1);
      if (stillOwns.length === 0) {
        await tx
          .update(usersTable)
          .set({ role: "user" })
          .where(and(eq(usersTable.id, previousUserId), eq(usersTable.role, "vendor")));
      }

      await tx.insert(venueAssignmentLogTable).values({
        vendorId: id,
        action: "unassigned",
        actorAdminId: adminId,
        previousUserId,
        note: String(note ?? "").slice(0, 500),
      });
    });
  } catch (err) {
    req.log.error({ err, venueId: id }, "Failed to unassign venue");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to unassign venue" });
    return;
  }
  res.json({ ok: true, vendorId: id });
});

// ── Admin: venue assignment audit history ───────────────────────────────────
router.get("/admin/venues/:id/audit", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid venue id" });
    return;
  }
  const rows = await db
    .select()
    .from(venueAssignmentLogTable)
    .where(eq(venueAssignmentLogTable.vendorId, id))
    .orderBy(desc(venueAssignmentLogTable.createdAt));

  const idsToResolve = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.actorAdminId, r.previousUserId])
        .filter((x): x is number => typeof x === "number" && x > 0),
    ),
  );
  const usersRows = idsToResolve.length
    ? await db
        .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
        .from(usersTable)
        .where(inArray(usersTable.id, idsToResolve))
    : [];
  const uMap = new Map(usersRows.map((u) => [u.id, u]));

  res.json({
    data: rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorAdminId: r.actorAdminId,
      actorAdminEmail: r.actorAdminId ? uMap.get(r.actorAdminId)?.email ?? "" : "",
      partnerUserId: r.partnerUserId,
      partnerEmail: r.partnerEmail,
      previousUserId: r.previousUserId,
      previousOwnerEmail: r.previousUserId ? uMap.get(r.previousUserId)?.email ?? "" : "",
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

// ── Admin: full venue detail (vendor + its pub event) for the edit form ──────
router.get("/admin/venues/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid venue id" }); return; }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
  if (!vendor) { res.status(404).json({ error: "Venue not found" }); return; }
  const [pub] = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.vendorId, id), eq(eventsTable.type, "pub")))
    .limit(1);
  const owner = vendor.userId && vendor.userId !== UNASSIGNED_VENUE_USER_ID
    ? (await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, vendor.userId)).limit(1))[0]
    : null;

  res.json({
    id: vendor.id,
    pubId: pub?.id ?? null,
    businessName: vendor.businessName,
    category: vendor.category,
    description: vendor.description,
    location: pub?.location ?? vendor.location,
    city: vendor.city,
    state: vendor.state,
    country: vendor.country,
    bannerImage: vendor.bannerImage,
    assignmentStatus: vendor.assignmentStatus,
    status: vendor.status,
    ownerEmail: owner?.email ?? "",
    ownerName: owner?.name ?? "",
    baseFeePercent: vendor.baseFeePercent ?? "3.50",
    baseFeeEnabled: vendor.baseFeeEnabled !== false,
    // pub-event fields
    capacity: pub?.capacity ?? 0,
    pubMode: pub?.pubMode ?? "both",
    priceWomen: Number(pub?.priceWomen ?? 0),
    priceMen: Number(pub?.priceMen ?? 0),
    priceCouple: Number(pub?.priceCouple ?? 0),
    dayPricing: pub?.dayPricing ?? null,
    galleryImages: pub?.galleryImages ?? [],
    galleryVideos: pub?.galleryVideos ?? [],
    pubEventTypes: pub?.pubEventTypes ?? [],
    freeEntryRules: pub?.freeEntryRules ?? null,
    danceFloor: vendor.danceFloor ?? "",
    danceFloorPhotos: vendor.danceFloorPhotos ?? [],
    menuUrls: vendor.menuUrls ?? [],
    barMenuUrls: (vendor as { barMenuUrls?: string[] | null }).barMenuUrls ?? [],
    // Happening Tonight visibility + free-entry-for-table (pub-event fields)
    startTime: pub?.startTime ?? "",
    endTime: pub?.endTime ?? "",
    happeningTonight: pub?.happeningTonight ?? true,
    startingSoon: pub?.startingSoon ?? true,
    lastMinuteDeal: pub?.lastMinuteDeal ?? false,
    dealLabel: pub?.dealLabel ?? "",
    freeEntryForTable: pub?.freeEntryForTable ?? false,
    freeEntryForTableDays: (pub?.freeEntryForTableDays as string[] | null) ?? [],
    freeEntryForTableBeforeTime: pub?.freeEntryForTableBeforeTime ?? "",
  });
});

// ── Admin: edit a venue (updates the vendor row + its pub event) ─────────────
router.patch("/admin/venues/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid venue id" }); return; }
  const {
    businessName, category, description, location, city, state, country,
    capacity, imageUrl, pubMode, priceWomen, priceMen, priceCouple,
    galleryImages, galleryVideo, pubEventTypes, dayPricing,
    freeEntryEnabled, freeEntryGenders, freeEntryDays, freeEntryBeforeTime,
    danceFloor, danceFloorPhotos, menuUrls, barMenuUrls,
    startTime, endTime, happeningTonight, startingSoon, lastMinuteDeal, dealLabel,
    freeEntryForTable, freeEntryForTableDays, freeEntryForTableBeforeTime,
  } = req.body as Record<string, unknown>;

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
  if (!vendor) { res.status(404).json({ error: "Venue not found" }); return; }

  const title = typeof businessName === "string" ? businessName.trim() : vendor.businessName;
  if (!title) { res.status(400).json({ error: "Venue name is required" }); return; }
  const cat = typeof category === "string" && VENUE_CATEGORIES.includes(category as typeof VENUE_CATEGORIES[number]) ? category : vendor.category;

  const menus = Array.isArray(menuUrls) ? (menuUrls as string[]) : (vendor.menuUrls ?? []);
  const barMenus = Array.isArray(barMenuUrls) ? (barMenuUrls as string[]) : ((vendor as { barMenuUrls?: string[] | null }).barMenuUrls ?? []);
  const freeEntryRules =
    freeEntryEnabled &&
    Array.isArray(freeEntryGenders) && (freeEntryGenders as string[]).length > 0 &&
    Array.isArray(freeEntryDays) && (freeEntryDays as string[]).length > 0
      ? {
          enabled: true,
          genders: freeEntryGenders as string[],
          days: freeEntryDays as string[],
          ...(freeEntryBeforeTime ? { beforeTime: String(freeEntryBeforeTime) } : {}),
        }
      : null;

  try {
    await db.transaction(async (tx) => {
      await tx.update(vendorsTable).set({
        businessName: title,
        category: cat,
        description: typeof description === "string" ? description : vendor.description,
        location: typeof location === "string" ? location : vendor.location,
        city: typeof city === "string" ? city : vendor.city,
        state: typeof state === "string" ? state : vendor.state,
        country: typeof country === "string" ? country : vendor.country,
        bannerImage: typeof imageUrl === "string" ? imageUrl : vendor.bannerImage,
        danceFloor: typeof danceFloor === "string" ? (danceFloor || null) : vendor.danceFloor,
        danceFloorPhotos: Array.isArray(danceFloorPhotos) ? (danceFloorPhotos as string[]) : vendor.danceFloorPhotos,
        menuUrl: menus[0] ?? "",
        menuUrls: menus,
        barMenuUrls: barMenus,
      }).where(eq(vendorsTable.id, id));

      const [pub] = await tx
        .select({ id: eventsTable.id })
        .from(eventsTable)
        .where(and(eq(eventsTable.vendorId, id), eq(eventsTable.type, "pub")))
        .limit(1);
      if (pub) {
        await tx.update(eventsTable).set({
          title,
          category: cat,
          description: typeof description === "string" ? description : undefined,
          location: typeof location === "string" ? location : undefined,
          city: typeof city === "string" ? city : undefined,
          state: typeof state === "string" ? state : undefined,
          country: typeof country === "string" ? country : undefined,
          capacity: typeof capacity === "number" ? capacity : undefined,
          imageUrl: typeof imageUrl === "string" ? imageUrl : undefined,
          pubMode: typeof pubMode === "string" ? pubMode : undefined,
          priceWomen: priceWomen !== undefined ? String(priceWomen) : undefined,
          priceMen: priceMen !== undefined ? String(priceMen) : undefined,
          priceCouple: priceCouple !== undefined ? String(priceCouple) : undefined,
          galleryImages: Array.isArray(galleryImages) ? (galleryImages as string[]) : undefined,
          galleryVideos: typeof galleryVideo === "string" ? (galleryVideo ? [galleryVideo] : []) : undefined,
          pubEventTypes: Array.isArray(pubEventTypes) ? (pubEventTypes as string[]) : undefined,
          dayPricing: dayPricing && typeof dayPricing === "object" && Object.keys(dayPricing).length > 0 ? (dayPricing as Record<string, { women: number; men: number; couple: number }>) : null,
          freeEntryRules,
          startTime: typeof startTime === "string" ? startTime : undefined,
          endTime: typeof endTime === "string" ? endTime : undefined,
          happeningTonight: typeof happeningTonight === "boolean" ? happeningTonight : undefined,
          startingSoon: typeof startingSoon === "boolean" ? startingSoon : undefined,
          lastMinuteDeal: typeof lastMinuteDeal === "boolean" ? lastMinuteDeal : undefined,
          dealLabel: typeof dealLabel === "string" ? dealLabel : undefined,
          freeEntryForTable: typeof freeEntryForTable === "boolean" ? freeEntryForTable : undefined,
          freeEntryForTableDays: freeEntryForTable ? (Array.isArray(freeEntryForTableDays) ? (freeEntryForTableDays as string[]) : []) : null,
          freeEntryForTableBeforeTime: freeEntryForTable ? ((freeEntryForTableBeforeTime as string) || null) : null,
        }).where(eq(eventsTable.id, pub.id));
      }
    });
  } catch (err) {
    req.log.error({ err, venueId: id }, "Failed to edit venue");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to edit venue" });
    return;
  }
  res.json({ ok: true, vendorId: id });
});

// ── Admin: venue Food & Drinks plans (CRUD by vendorId) ─────────────────────
router.get("/admin/venues/:id/drink-plans", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid venue id" }); return; }
  const plans = await db
    .select()
    .from(drinkPlansTable)
    .where(eq(drinkPlansTable.vendorId, id))
    .orderBy(sql`COALESCE(${drinkPlansTable.globalPriority}, 999)`, drinkPlansTable.createdAt);
  res.json(plans);
});

router.post("/admin/venues/:id/drink-plans", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid venue id" }); return; }
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
  if (!vendor) { res.status(404).json({ error: "Venue not found" }); return; }
  const parsed = DrinkPlanBody.safeParse(req.body);
  if (!parsed.success) { respondInvalid(res, parsed.error); return; }
  const [plan] = await db.insert(drinkPlansTable).values({ vendorId: id, ...parsed.data }).returning();
  res.json(plan);
});

router.patch("/admin/venues/:id/drink-plans/:planId", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  const planId = Number(req.params["planId"]);
  if (!Number.isFinite(id) || !Number.isFinite(planId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = DrinkPlanBody.partial().safeParse(req.body);
  if (!parsed.success) { respondInvalid(res, parsed.error); return; }
  const [updated] = await db
    .update(drinkPlansTable)
    .set(parsed.data)
    .where(and(eq(drinkPlansTable.id, planId), eq(drinkPlansTable.vendorId, id)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json(updated);
});

router.delete("/admin/venues/:id/drink-plans/:planId", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  const planId = Number(req.params["planId"]);
  if (!Number.isFinite(id) || !Number.isFinite(planId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db
    .delete(drinkPlansTable)
    .where(and(eq(drinkPlansTable.id, planId), eq(drinkPlansTable.vendorId, id)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json({ ok: true });
});

// ── Admin: venue blocked dates / calendar (CRUD by vendorId) ────────────────
router.get("/admin/venues/:id/blocked-dates", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid venue id" }); return; }
  const rows = await db
    .select()
    .from(partnerBlockedDatesTable)
    .where(eq(partnerBlockedDatesTable.vendorId, id))
    .orderBy(desc(partnerBlockedDatesTable.date));
  res.json(rows);
});

router.post("/admin/venues/:id/blocked-dates", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid venue id" }); return; }
  const dateRaw = String((req.body as { date?: unknown }).date ?? "").trim();
  if (!dateRaw) { res.status(400).json({ error: "date is required" }); return; }
  const reason = String((req.body as { reason?: unknown }).reason ?? "");
  try {
    const [b] = await db
      .insert(partnerBlockedDatesTable)
      .values({ vendorId: id, date: dateRaw.slice(0, 10), reason, source: "manual" })
      .returning();
    res.json(b);
  } catch {
    res.status(409).json({ error: "Date already blocked" });
  }
});

router.delete("/admin/venues/:id/blocked-dates/:blockId", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  const blockId = Number(req.params["blockId"]);
  if (!Number.isFinite(id) || !Number.isFinite(blockId)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .delete(partnerBlockedDatesTable)
    .where(and(eq(partnerBlockedDatesTable.id, blockId), eq(partnerBlockedDatesTable.vendorId, id)));
  res.json({ ok: true });
});

// Fully delete a vendor and every row scoped to it, then revoke the owner's
// partner role. Returns false if no such vendor; throws on DB failure (caller
// maps to a 500). Shared by the vendor-delete route and the Events-tab pub/club
// delete (deleting a venue's pub row deletes the whole venue).
//
// Manually delete every child row that does NOT cascade from `vendors`.
// Wrapped in db.transaction; do NOT use DO $$ ... END $$ — PostgreSQL rejects
// bind parameters inside DO blocks ("bind message supplies N parameters, but
// prepared statement requires 0").
// - `bookings.event_id` is `ON DELETE RESTRICT`, so deleting `events` while
//   bookings exist FK-errors out (the original 500 root cause).
// - `events.vendor_id`, `bookings.vendor_id`, and several other vendor-scoped
//   tables have no FK to `vendors` at all (just an integer column), so the
//   cascade chain skips them entirely. Order matters: leaf rows, then events,
//   then vendors. (vendor_offers / vendor_coupons / drink_plans DO cascade via
//   FK, so they're removed automatically by the final `DELETE FROM vendors`.)
async function deleteVendorCascade(vendorId: number): Promise<boolean> {
  const [target] = await db
    .select({ userId: vendorsTable.userId })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, vendorId))
    .limit(1);
  if (!target) return false;
  await db.transaction(async (tx) => {
    const evRows = await tx.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.vendorId, vendorId));
    const eventIds = evRows.map((r) => r.id);

    await tx.execute(sql`DELETE FROM commission_ledger WHERE vendor_id = ${vendorId}`);
    await tx.execute(sql`DELETE FROM bookings WHERE vendor_id = ${vendorId}`);
    await tx.execute(sql`DELETE FROM reviews WHERE vendor_id = ${vendorId}`);
    // Drizzle's typed delete + inArray produces `IN ($1, $2, ...)` which
    // PostgreSQL accepts — `ANY((1,2,3))` (a row, not an array) does NOT work.
    if (eventIds.length > 0) {
      await tx.delete(wishlistsTable).where(inArray(wishlistsTable.eventId, eventIds));
    }
    await tx.execute(sql`DELETE FROM announcements WHERE vendor_id = ${vendorId}`);
    await tx.execute(sql`DELETE FROM events WHERE vendor_id = ${vendorId}`);
    await tx.execute(sql`DELETE FROM partner_media WHERE vendor_id = ${vendorId}`);
    await tx.execute(sql`DELETE FROM partner_blocked_dates WHERE vendor_id = ${vendorId}`);
    await tx.execute(sql`DELETE FROM ads_requests WHERE vendor_id = ${vendorId}`);
    await tx.execute(sql`DELETE FROM profile_views WHERE vendor_id = ${vendorId}`);
    await tx.execute(sql`DELETE FROM coupons WHERE vendor_id = ${vendorId}`);
    await tx.execute(sql`DELETE FROM vendor_managers WHERE vendor_id = ${vendorId}`);
    await tx.execute(sql`DELETE FROM availability WHERE vendor_id = ${vendorId}`);
    await tx.execute(sql`DELETE FROM review_deletions WHERE vendor_id = ${vendorId}`);
    await tx.execute(sql`DELETE FROM vendor_commissions WHERE vendor_id = ${vendorId}`);
    await tx.execute(sql`DELETE FROM venue_assignment_log WHERE vendor_id = ${vendorId}`);
    await tx.execute(sql`DELETE FROM vendors WHERE id = ${vendorId}`);
  });
  // Revoke partner access and wipe prior applications so the user is locked out
  // of the partner dashboard and the become-vendor form treats them as fresh.
  await db
    .update(usersTable)
    .set({ role: "user" })
    .where(and(eq(usersTable.id, target.userId), eq(usersTable.role, "vendor")));
  await db
    .delete(vendorRequestsTable)
    .where(eq(vendorRequestsTable.userId, target.userId));
  return true;
}

router.delete("/admin/vendors/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const ok = await deleteVendorCascade(id);
    if (!ok) {
      res.status(404).json({ error: "Not found" });
      return;
    }
  } catch (err) {
    req.log.error({ err, vendorId: id }, "Failed to delete vendor");
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Failed to delete vendor: ${errMsg}` });
    return;
  }
  res.json({ ok: true });
});

// ── Admin: vendor managers ────────────────────────────────────────────────────

router.get("/admin/vendors/:id/managers", requireAuth(["admin"]), async (req, res) => {
  const vendorId = Number(req.params["id"]);
  if (!Number.isFinite(vendorId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db.select().from(vendorManagersTable).where(eq(vendorManagersTable.vendorId, vendorId));

  const managerIds = rows.map((r) => r.managerId).filter((id): id is number => id != null);
  const inviterIds = [...new Set(rows.map((r) => r.invitedBy))];
  const allUserIds = [...new Set([...managerIds, ...inviterIds])];

  const userRows = allUserIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, profileImage: usersTable.profileImage, phone: usersTable.phone })
        .from(usersTable).where(inArray(usersTable.id, allUserIds))
    : [];
  const uMap = new Map(userRows.map((u) => [u.id, u]));

  res.json(rows.map((r) => ({
    id: r.id,
    vendorId: r.vendorId,
    invitedEmail: r.invitedEmail,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    manager: r.managerId ? (uMap.get(r.managerId) ?? null) : null,
    invitedBy: uMap.get(r.invitedBy) ?? null,
  })));
});

router.delete("/admin/vendors/:id/managers/:managerId", requireAuth(["admin"]), async (req, res) => {
  const vendorId = Number(req.params["id"]);
  const managerId = Number(req.params["managerId"]);
  if (!Number.isFinite(vendorId) || !Number.isFinite(managerId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(vendorManagersTable)
    .where(and(eq(vendorManagersTable.vendorId, vendorId), eq(vendorManagersTable.id, managerId)));
  res.json({ ok: true });
});

// ── Admin booking report ──────────────────────────────────────────────────────

const REPORT_PAGE_SIZE = 50;

async function enrichBookingRows(rows: (typeof bookingsTable.$inferSelect)[]) {
  if (rows.length === 0) return [];
  // Null-safe id collection: organizer bookings (kind='organizer') leave
  // eventId/vendorId null and carry organizer ids instead.
  const nums = (xs: (number | null | undefined)[]) => [...new Set(xs.filter((x): x is number => x != null))];
  const eventIds = nums(rows.map((r) => r.eventId));
  const userIds = nums(rows.map((r) => r.userId));
  const vendorIds = nums(rows.map((r) => r.vendorId));
  const orgIds = nums(rows.map((r) => r.organizerId));
  const orgEventIds = nums(rows.map((r) => r.organizerEventId));
  const ticketIds = nums(rows.map((r) => r.eventTicketId));
  const bookingIds = rows.map((r) => r.id);
  const [events, users, vendors, payments, organizers, orgEvents, orgTickets, { byBookingId: effectiveByBookingId }] = await Promise.all([
    eventIds.length ? db.select().from(eventsTable).where(inArray(eventsTable.id, eventIds)) : Promise.resolve([]),
    db.select().from(usersTable).where(inArray(usersTable.id, userIds)),
    vendorIds.length ? db.select().from(vendorsTable).where(inArray(vendorsTable.id, vendorIds)) : Promise.resolve([]),
    db.select({ bookingId: paymentsTable.bookingId, phonepeTransactionId: paymentsTable.phonepeTransactionId, status: paymentsTable.status })
      .from(paymentsTable)
      .where(inArray(paymentsTable.bookingId, bookingIds)),
    orgIds.length ? db.select().from(organizersTable).where(inArray(organizersTable.id, orgIds)) : Promise.resolve([]),
    orgEventIds.length ? db.select().from(organizerEventsTable).where(inArray(organizerEventsTable.id, orgEventIds)) : Promise.resolve([]),
    ticketIds.length ? db.select().from(eventTicketsTable).where(inArray(eventTicketsTable.id, ticketIds)) : Promise.resolve([]),
    computeEffectiveRevenues(rows),
  ]);
  const eMap = new Map(events.map((e) => [e.id, e]));
  const uMap = new Map(users.map((u) => [u.id, u]));
  const vMap = new Map(vendors.map((v) => [v.id, v]));
  const orgMap = new Map(organizers.map((o) => [o.id, o]));
  const oeMap = new Map(orgEvents.map((e) => [e.id, e]));
  const otMap = new Map(orgTickets.map((t) => [t.id, t]));
  const payMap = new Map(payments.filter((p) => p.bookingId != null).map((p) => [p.bookingId!, p]));
  return rows.map((b) => {
    const isOrg = b.kind === "organizer";
    const e = b.eventId != null ? eMap.get(b.eventId) : undefined;
    const u = uMap.get(b.userId);
    const v = b.vendorId != null ? vMap.get(b.vendorId) : undefined;
    const org = b.organizerId != null ? orgMap.get(b.organizerId) : undefined;
    const oe = b.organizerEventId != null ? oeMap.get(b.organizerEventId) : undefined;
    const ot = b.eventTicketId != null ? otMap.get(b.eventTicketId) : undefined;
    const pay = payMap.get(b.id);
    const ticketCode = isOrg
      ? (org?.ticketPrefix && org?.ticketSalt
          ? generateTicketCode(b.id, { ticketPrefix: org.ticketPrefix, ticketSalt: org.ticketSalt })
          : `RV-${String(b.id).padStart(6, "0")}`)
      : (v && v.ticketPrefix && v.ticketSalt
          ? generateTicketCode(b.id, { ticketPrefix: v.ticketPrefix, ticketSalt: v.ticketSalt })
          : `RV-${String(b.id).padStart(6, "0")}`);
    let paymentMethod: string;
    if (pay) {
      paymentMethod = pay.phonepeTransactionId ? "PhonePe" : "Online";
    } else {
      paymentMethod = Number(b.finalPrice) === 0 ? "Free" : "COD";
    }
    return {
      id: b.id,
      kind: b.kind ?? "pub",
      vendorId: b.vendorId,
      vendorName: isOrg ? (org?.name ?? "") : (v?.businessName ?? ""),
      eventId: b.eventId,
      eventTitle: isOrg ? (oe?.title ?? "") : (e?.title ?? ""),
      ticketType: isOrg ? (ot?.name ?? "") : null,
      userId: b.userId,
      userName: u?.name ?? "",
      userEmail: u?.email ?? "",
      phone: b.phone ?? "",
      bookingDate: b.bookingDate,
      guests: b.guests,
      pubMode: b.pubMode,
      ticketWomen: b.ticketWomen,
      ticketMen: b.ticketMen,
      ticketCouple: b.ticketCouple,
      actualWomen: b.actualWomen ?? null,
      actualMen: b.actualMen ?? null,
      actualCouple: b.actualCouple ?? null,
      actualGuests: b.actualGuests ?? null,
      totalPrice: Number(b.totalPrice),
      discountAmount: Number(b.discountAmount),
      finalPrice: Number(b.finalPrice),
      baseFee: b.baseFee ?? 0,
      totalPayable: Number(b.finalPrice) + (b.baseFee ?? 0),
      /** Actual amount collected: for online = finalPrice; for COD checked-in =
       *  actual-count-based revenue; for pending COD = 0. */
      effectiveRevenue: effectiveByBookingId.get(b.id) ?? Number(b.finalPrice),
      paymentMethod,
      status: b.status,
      notes: b.notes,
      ticketCode,
      checkedIn: b.checkedIn,
      checkedInAt: b.checkedInAt?.toISOString() ?? null,
      createdAt: b.createdAt.toISOString(),
    };
  });
}

router.get("/admin/bookings/report", requireAuth(["admin"]), async (req, res) => {
  const pageNum = Math.max(1, parseInt(req.query["page"] as string) || 1);
  const offset = (pageNum - 1) * REPORT_PAGE_SIZE;

  const vendorIdParam = req.query["vendorId"] ? Number(req.query["vendorId"]) : null;
  const userIdParam = req.query["userId"] ? Number(req.query["userId"]) : null;
  const statusParam = req.query["status"] as string | undefined;
  const startDateParam = req.query["startDate"] as string | undefined;
  const endDateParam = req.query["endDate"] as string | undefined;
  const pubModeParam = req.query["pubMode"] as string | undefined;
  const bookingTypeParam = req.query["bookingType"] as string | undefined;
  const searchParam = (req.query["search"] as string | undefined)?.trim().toLowerCase();
  const sortBy = req.query["sortBy"] as string | undefined;
  const checkedInParam = req.query["checkedIn"] as string | undefined;
  // Separate Event-Organizer ticket bookings from Pub/Club bookings. Defaults to
  // 'pub' so the existing pub report never mixes in organizer rows.
  const kindParam = (req.query["kind"] as string | undefined) === "organizer" ? "organizer" : "pub";

  const conditions: ReturnType<typeof sql>[] = [];
  conditions.push(sql`${bookingsTable.kind} = ${kindParam}`);
  if (vendorIdParam && Number.isFinite(vendorIdParam))
    conditions.push(sql`${bookingsTable.vendorId} = ${vendorIdParam}`);
  if (userIdParam && Number.isFinite(userIdParam))
    conditions.push(sql`${bookingsTable.userId} = ${userIdParam}`);
  if (statusParam && statusParam !== "all")
    conditions.push(sql`${bookingsTable.status} = ${statusParam}`);
  if (startDateParam)
    conditions.push(sql`${bookingsTable.bookingDate} >= ${startDateParam}`);
  if (endDateParam)
    conditions.push(sql`${bookingsTable.bookingDate} <= ${endDateParam}`);
  if (pubModeParam && pubModeParam !== "all")
    conditions.push(sql`${bookingsTable.pubMode} = ${pubModeParam}`);
  if (bookingTypeParam === "pub")
    conditions.push(sql`${bookingsTable.pubMode} = 'ticket'`);
  else if (bookingTypeParam === "group")
    conditions.push(sql`${bookingsTable.pubMode} IN ('event', '')`);
  if (checkedInParam === "true") conditions.push(sql`${bookingsTable.checkedIn} = true`);
  else if (checkedInParam === "false") conditions.push(sql`${bookingsTable.checkedIn} = false`);

  if (searchParam) {
    const likeStr = `%${searchParam}%`;
    const matchingUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(sql`lower(${usersTable.name}) LIKE ${likeStr} OR lower(${usersTable.email}) LIKE ${likeStr} OR ${usersTable.phone} LIKE ${`%${searchParam}%`}`);
    if (matchingUsers.length === 0) {
      res.json({ bookings: [], total: 0, page: pageNum, totalPages: 1 });
      return;
    }
    conditions.push(inArray(bookingsTable.userId, matchingUsers.map((u) => u.id)));
  }

  const whereSQL = conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined;
  const orderSQL = sortBy === "price" ? desc(bookingsTable.finalPrice) : desc(bookingsTable.createdAt);

  const [countRow, rows] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(bookingsTable).where(whereSQL),
    db.select().from(bookingsTable).where(whereSQL).orderBy(orderSQL).limit(REPORT_PAGE_SIZE).offset(offset),
  ]);

  const total = countRow[0]?.c ?? 0;
  const totalPages = Math.ceil(total / REPORT_PAGE_SIZE);
  const bookings = await enrichBookingRows(rows);

  res.json({ bookings, total, page: pageNum, totalPages });
});

router.get("/admin/bookings/partner-summary", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select({
      vendorId: bookingsTable.vendorId,
      bookingCount: sql<number>`count(*)::int`,
      ticketWomen: sql<number>`coalesce(sum(${bookingsTable.ticketWomen}), 0)::int`,
      ticketMen: sql<number>`coalesce(sum(${bookingsTable.ticketMen}), 0)::int`,
      ticketCouple: sql<number>`coalesce(sum(${bookingsTable.ticketCouple}), 0)::int`,
      // Revenue gated on `checkedIn = true` so a booking only contributes
      // after Save Actual Entry is tapped. bookingCount stays as-is — it
      // counts every booking regardless of finalize status.
      revenue: sql<string>`coalesce(sum(case when ${bookingsTable.status} IN ('confirmed','completed') AND ${bookingsTable.checkedIn} = true then ${bookingsTable.finalPrice} else 0 end), 0)::text`,
      checkedInCount: sql<number>`coalesce(sum(case when ${bookingsTable.checkedIn} then 1 else 0 end), 0)::int`,
    })
    .from(bookingsTable)
    .groupBy(bookingsTable.vendorId)
    .orderBy(desc(sql`count(*)`));

  if (rows.length === 0) {
    res.json([]);
    return;
  }

  const vendors = await db
    .select({ id: vendorsTable.id, businessName: vendorsTable.businessName })
    .from(vendorsTable)
    .where(inArray(vendorsTable.id, rows.map((r) => r.vendorId)));
  const vMap = new Map(vendors.map((v) => [v.id, v.businessName]));

  res.json(
    rows.map((r) => ({
      vendorId: r.vendorId,
      vendorName: vMap.get(r.vendorId) ?? `Partner #${r.vendorId}`,
      bookingCount: r.bookingCount,
      ticketWomen: r.ticketWomen,
      ticketMen: r.ticketMen,
      ticketCouple: r.ticketCouple,
      revenue: Number(r.revenue),
      checkedInCount: r.checkedInCount,
    })),
  );
});

// ── Admin Attendance / Check-in Report ──────────────────────────────────────

const CHECKIN_PAGE_SIZE = 50;

router.get("/admin/checkin-report", requireAuth(["admin"]), async (req, res) => {
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const offset = (page - 1) * CHECKIN_PAGE_SIZE;

  const vendorIdParam = req.query["vendorId"] ? Number(req.query["vendorId"]) : null;
  const dateParam = req.query["date"] as string | undefined;
  const eventIdParam = req.query["eventId"] ? Number(req.query["eventId"]) : null;
  const statusParam = (req.query["status"] as string | undefined) ?? "all";

  // Base conditions (vendor / date / event scope) — used for stats
  const baseConditions: ReturnType<typeof sql>[] = [];
  if (vendorIdParam && Number.isFinite(vendorIdParam))
    baseConditions.push(sql`${bookingsTable.vendorId} = ${vendorIdParam}`);
  if (dateParam)
    baseConditions.push(sql`${bookingsTable.bookingDate} = ${dateParam}`);
  if (eventIdParam && Number.isFinite(eventIdParam))
    baseConditions.push(sql`${bookingsTable.eventId} = ${eventIdParam}`);
  baseConditions.push(sql`${bookingsTable.status} IN ('confirmed','completed')`);

  const baseWhereSQL = sql.join(baseConditions, sql` AND `);

  // Row-level conditions: base + optional checkedIn filter
  const rowConditions = [...baseConditions];
  if (statusParam === "checkedIn")
    rowConditions.push(sql`${bookingsTable.checkedIn} = true`);
  else if (statusParam === "notArrived")
    rowConditions.push(sql`${bookingsTable.checkedIn} = false`);

  const rowsWhereSQL = sql.join(rowConditions, sql` AND `);

  const [countRow, statsRows, rows] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(bookingsTable).where(rowsWhereSQL),
    db.select({
      total: sql<number>`count(*)::int`,
      checkedInCount: sql<number>`coalesce(sum(case when ${bookingsTable.checkedIn} then 1 else 0 end),0)::int`,
      notArrivedCount: sql<number>`coalesce(sum(case when not ${bookingsTable.checkedIn} then 1 else 0 end),0)::int`,
    }).from(bookingsTable).where(baseWhereSQL),
    db.select().from(bookingsTable).where(rowsWhereSQL)
      .orderBy(desc(bookingsTable.bookingDate), desc(bookingsTable.id))
      .limit(CHECKIN_PAGE_SIZE).offset(offset),
  ]);

  const total = statsRows[0]?.total ?? 0;
  const rowTotal = countRow[0]?.c ?? 0;
  const totalPages = Math.ceil(rowTotal / CHECKIN_PAGE_SIZE);
  const checkedInCount = statsRows[0]?.checkedInCount ?? 0;
  const notArrivedCount = statsRows[0]?.notArrivedCount ?? 0;

  const enriched = await enrichBookingRows(rows);

  const eventIds = [...new Set(rows.map((r) => r.eventId))];
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const vendorIds = [...new Set(rows.map((r) => r.vendorId))];

  const [events, users, vendors] = await Promise.all([
    eventIds.length > 0 ? db.select().from(eventsTable).where(inArray(eventsTable.id, eventIds)) : [],
    userIds.length > 0 ? db.select({ id: usersTable.id, phone: sql<string>`coalesce(phone,'')` }).from(usersTable).where(inArray(usersTable.id, userIds)) : [],
    vendorIds.length > 0 ? db.select({ id: vendorsTable.id, businessName: vendorsTable.businessName }).from(vendorsTable).where(inArray(vendorsTable.id, vendorIds)) : [],
  ]);

  const phoneMap = new Map(users.map((u) => [u.id, u.phone]));
  const vMapLocal = new Map(vendors.map((v) => [v.id, v.businessName]));
  const eventMap = new Map(events.map((e) => [e.id, e.title]));

  const attendanceRows = rows.map((b, i) => ({
    id: b.id,
    vendorId: b.vendorId,
    vendorName: vMapLocal.get(b.vendorId) ?? `Partner #${b.vendorId}`,
    eventId: b.eventId,
    eventTitle: eventMap.get(b.eventId) ?? "",
    userId: b.userId,
    userName: enriched[i]?.userName ?? "",
    userEmail: enriched[i]?.userEmail ?? "",
    phone: b.phone ?? "",
    bookingDate: b.bookingDate,
    guests: b.guests,
    ticketWomen: b.ticketWomen,
    ticketMen: b.ticketMen,
    ticketCouple: b.ticketCouple,
    status: b.status,
    checkedIn: b.checkedIn,
    checkedInAt: b.checkedInAt?.toISOString() ?? null,
    arrivalTime: b.arrivalTime ?? null,
    paymentMethod: b.paymentMethod,
    finalPrice: Number(b.finalPrice),
    pubMode: b.pubMode ?? "",
    actualWomen: b.actualWomen ?? null,
    actualMen: b.actualMen ?? null,
    actualCouple: b.actualCouple ?? null,
    actualGuests: b.actualGuests ?? null,
    actualAmountDue: ((): number | null => {
      const aw = b.actualWomen, am = b.actualMen, ac = b.actualCouple, ag = b.actualGuests;
      const ev = events.find((e) => e.id === b.eventId);
      const fer = (ev as { freeEntryRules?: { enabled?: boolean; genders?: string[]; days?: string[] } | null } | undefined)?.freeEntryRules ?? null;
      const dayName = b.bookingDate ? ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(`${b.bookingDate}T12:00:00`).getDay()] : undefined;
      const ferActive = !!(fer?.enabled && dayName && Array.isArray(fer.days) && fer.days.includes(dayName));
      const ferGenders = ferActive ? (fer?.genders ?? []).map((g) => String(g).toLowerCase()) : [];
      const ferAllFree = ferActive && ["women","men","couple"].every((g) => ferGenders.includes(g));
      const isTierFree = (g: "women" | "men" | "couple") => ferActive && ferGenders.includes(g);
      if (b.pubMode === "ticket") {
        if (aw == null && am == null && ac == null) return null;
        const pw = isTierFree("women") ? 0 : Number(ev?.priceWomen ?? 0);
        const pm = isTierFree("men") ? 0 : Number(ev?.priceMen ?? 0);
        const pc = isTierFree("couple") ? 0 : Number(ev?.priceCouple ?? 0);
        // Scale by the booking's discount ratio so coupon / new-user discount
        // / loyalty-points reductions applied at booking time aren't reverted
        // when displaying the door-due amount.
        const gross = (aw ?? 0) * pw + (am ?? 0) * pm + (ac ?? 0) * pc;
        return Math.round(gross * bookingDiscountRatio(b) * 100) / 100;
      }
      if (ag == null) return null;
      if (ferAllFree) return 0;
      const guests = Math.max(1, b.guests);
      return Math.round((ag / guests) * Number(b.finalPrice) * 100) / 100;
    })(),
  }));

  res.json({
    rows: attendanceRows,
    stats: { total, checkedIn: checkedInCount, notArrived: notArrivedCount },
    total,
    page,
    totalPages,
  });
});

// ── Admin CRM & Leads ────────────────────────────────────────────────────────

router.get("/admin/leads", requireAuth(["admin"]), async (req, res) => {
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const PAGE_SIZE = 50;
  const offset = (page - 1) * PAGE_SIZE;

  const vendorIdParam = req.query["vendorId"] ? Number(req.query["vendorId"]) : undefined;
  const startDateStr = req.query["startDate"] as string | undefined;
  const endDateStr = req.query["endDate"] as string | undefined;
  const knownOnly = req.query["knownOnly"] === "true";
  const anonymousOnly = req.query["anonymousOnly"] === "true";

  const conditions: ReturnType<typeof and>[] = [];
  if (vendorIdParam) conditions.push(eq(profileViewsTable.vendorId, vendorIdParam));
  if (knownOnly) conditions.push(isNotNull(profileViewsTable.viewerUserId));
  if (anonymousOnly) conditions.push(isNull(profileViewsTable.viewerUserId));
  if (startDateStr) conditions.push(gte(profileViewsTable.viewedAt, new Date(`${startDateStr}T00:00:00+05:30`)));
  if (endDateStr) conditions.push(lte(profileViewsTable.viewedAt, new Date(`${endDateStr}T23:59:59+05:30`)));

  const where = conditions.length ? and(...conditions) : undefined;

  const [totalRow, rows] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(profileViewsTable).where(where),
    db.select().from(profileViewsTable).where(where)
      .orderBy(desc(profileViewsTable.viewedAt))
      .limit(PAGE_SIZE)
      .offset(offset),
  ]);

  const total = totalRow[0]?.c ?? 0;

  const vendorIds = Array.from(new Set(rows.map((r) => r.vendorId)));
  const userIds = Array.from(new Set(rows.map((r) => r.viewerUserId).filter((x): x is number => x !== null)));

  const [vendorRows, userRows] = await Promise.all([
    vendorIds.length
      ? db.select({ id: vendorsTable.id, businessName: vendorsTable.businessName, city: vendorsTable.city })
          .from(vendorsTable).where(inArray(vendorsTable.id, vendorIds))
      : Promise.resolve([]),
    userIds.length
      ? db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
          .from(usersTable).where(inArray(usersTable.id, userIds))
      : Promise.resolve([]),
  ]);

  const vMap = new Map(vendorRows.map((v) => [v.id, v]));
  const uMap = new Map(userRows.map((u) => [u.id, u]));

  // Conversion is FINALIZED (Save Actual Entry tapped at the door), not
  // merely "booked & paid". A profile view converts only when the user
  // later showed up AND the manager finalized their check-in. Matches the
  // spec — every value in the Leads tab updates only on Save Actual Entry.
  const allBookings = userIds.length && vendorIds.length
    ? await db.select({
        userId: bookingsTable.userId,
        vendorId: bookingsTable.vendorId,
        createdAt: bookingsTable.createdAt,
      })
        .from(bookingsTable)
        .where(and(
          inArray(bookingsTable.userId, userIds),
          inArray(bookingsTable.vendorId, vendorIds),
          sql`${bookingsTable.status} IN ('confirmed','completed')`,
          eq(bookingsTable.checkedIn, true),
        ))
    : [];
  // Group booking dates by (userId:vendorId) key
  const bookingDatesMap = new Map<string, Date[]>();
  for (const b of allBookings) {
    const key = `${b.userId}:${b.vendorId}`;
    if (!bookingDatesMap.has(key)) bookingDatesMap.set(key, []);
    bookingDatesMap.get(key)!.push(b.createdAt);
  }

  const leads = rows.map((r) => {
    const v = vMap.get(r.vendorId);
    const u = r.viewerUserId ? uMap.get(r.viewerUserId) : null;
    // Converted if ANY booking for this (userId, vendorId) was created AFTER this view
    const bookingDates = r.viewerUserId ? (bookingDatesMap.get(`${r.viewerUserId}:${r.vendorId}`) ?? []) : [];
    const converted = bookingDates.some((d) => d > r.viewedAt);
    return {
      id: r.id,
      vendorId: r.vendorId,
      vendorName: v?.businessName ?? `Partner #${r.vendorId}`,
      vendorCity: v?.city ?? "",
      viewerUserId: r.viewerUserId,
      viewerName: u?.name ?? r.viewerName ?? "",
      viewerEmail: u?.email ?? r.viewerEmail ?? "",
      viewedAt: r.viewedAt.toISOString(),
      converted,
    };
  });

  res.json({ leads, total, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
});

router.get("/admin/leads/summary", requireAuth(["admin"]), async (req, res) => {
  const startDateStr = req.query["startDate"] as string | undefined;
  const endDateStr = req.query["endDate"] as string | undefined;

  const dateConditions: ReturnType<typeof and>[] = [];
  if (startDateStr) dateConditions.push(gte(profileViewsTable.viewedAt, new Date(`${startDateStr}T00:00:00+05:30`)));
  if (endDateStr) dateConditions.push(lte(profileViewsTable.viewedAt, new Date(`${endDateStr}T23:59:59+05:30`)));
  const where = dateConditions.length ? and(...dateConditions) : undefined;

  const [allViewsResult, allTimeTotalRow, perVendorRows] = await Promise.all([
    db.select({
      totalViews: sql<number>`count(*)::int`,
      knownLeads: sql<number>`count(${profileViewsTable.viewerUserId})::int`,
    }).from(profileViewsTable).where(where),
    // All-time total views (no date filter)
    db.select({ c: sql<number>`count(*)::int` }).from(profileViewsTable),
    db.select({
      vendorId: profileViewsTable.vendorId,
      totalViews: sql<number>`count(*)::int`,
      knownLeads: sql<number>`count(${profileViewsTable.viewerUserId})::int`,
    })
    .from(profileViewsTable)
    .where(where)
    .groupBy(profileViewsTable.vendorId)
    .orderBy(desc(sql`count(*)`)),
  ]);

  const totals = allViewsResult[0] ?? { totalViews: 0, knownLeads: 0 };
  const totalViews = totals.totalViews;
  const knownLeads = totals.knownLeads;
  const anonymousVisitors = totalViews - knownLeads;
  const allTimeTotalViews = allTimeTotalRow[0]?.c ?? 0;

  // Fetch all known profile view records with timestamps for accurate conversion timing
  const knownViewRecords = knownLeads > 0
    ? await db.select({
        viewerUserId: profileViewsTable.viewerUserId,
        vendorId: profileViewsTable.vendorId,
        viewedAt: profileViewsTable.viewedAt,
      })
        .from(profileViewsTable)
        .where(where ? and(where, isNotNull(profileViewsTable.viewerUserId)) : isNotNull(profileViewsTable.viewerUserId))
    : [];

  const knownUserIds = Array.from(new Set(knownViewRecords.map((r) => r.viewerUserId).filter((x): x is number => x !== null)));
  const knownVendorIds = Array.from(new Set(knownViewRecords.map((r) => r.vendorId)));

  // Same finalize gate as /admin/leads — conversion = manager tapped
  // Save Actual Entry at the door, not merely "user booked".
  const allSummaryBookings = knownUserIds.length && knownVendorIds.length
    ? await db.select({
        userId: bookingsTable.userId,
        vendorId: bookingsTable.vendorId,
        createdAt: bookingsTable.createdAt,
      })
        .from(bookingsTable)
        .where(and(
          inArray(bookingsTable.userId, knownUserIds),
          inArray(bookingsTable.vendorId, knownVendorIds),
          sql`${bookingsTable.status} IN ('confirmed','completed')`,
          eq(bookingsTable.checkedIn, true),
        ))
    : [];
  const summaryBookingDatesMap = new Map<string, Date[]>();
  for (const b of allSummaryBookings) {
    const key = `${b.userId}:${b.vendorId}`;
    if (!summaryBookingDatesMap.has(key)) summaryBookingDatesMap.set(key, []);
    summaryBookingDatesMap.get(key)!.push(b.createdAt);
  }

  // Count conversions: a view converts when ANY confirmed/completed booking exists AFTER it
  let platformConversions = 0;
  const vendorConversionMap = new Map<number, number>();
  for (const view of knownViewRecords) {
    if (!view.viewerUserId) continue;
    const bookingDates = summaryBookingDatesMap.get(`${view.viewerUserId}:${view.vendorId}`) ?? [];
    if (bookingDates.some((d) => d > view.viewedAt)) {
      platformConversions++;
      vendorConversionMap.set(view.vendorId, (vendorConversionMap.get(view.vendorId) ?? 0) + 1);
    }
  }

  // Conversion rate: conversions / totalViews (views → bookings funnel)
  const conversionRate = totalViews > 0 ? Math.round((platformConversions / totalViews) * 100) : 0;

  const vendorIds = perVendorRows.map((r) => r.vendorId);
  const vendorRows = vendorIds.length
    ? await db.select({ id: vendorsTable.id, businessName: vendorsTable.businessName, city: vendorsTable.city })
        .from(vendorsTable).where(inArray(vendorsTable.id, vendorIds))
    : [];
  const vMap = new Map(vendorRows.map((v) => [v.id, v]));

  const vendors = perVendorRows.map((row) => {
    const v = vMap.get(row.vendorId);
    const conversions = vendorConversionMap.get(row.vendorId) ?? 0;
    return {
      vendorId: row.vendorId,
      vendorName: v?.businessName ?? `Partner #${row.vendorId}`,
      vendorCity: v?.city ?? "",
      totalViews: row.totalViews,
      knownLeads: row.knownLeads,
      anonymousVisitors: row.totalViews - row.knownLeads,
      conversions,
      // Conversion rate per vendor: conversions / totalViews for that vendor
      conversionRate: row.totalViews > 0 ? Math.round((conversions / row.totalViews) * 100) : 0,
    };
  });

  res.json({
    totalViews,
    allTimeTotalViews,
    knownLeads,
    anonymousVisitors,
    conversions: platformConversions,
    conversionRate,
    vendors,
  });
});

// ── Booking Report: top users & top pubs ──────────────────────────────────────

function buildTopBookingConditions(
  startDate?: string,
  endDate?: string,
  partnerId?: number | null,
) {
  // Top-users / top-pubs only count FINALIZED bookings (checkedIn=true,
  // flipped only by Save Actual Entry). A guest who booked 10 tickets
  // but never showed up doesn't show up on these leaderboards.
  const conds: ReturnType<typeof sql>[] = [
    sql`${bookingsTable.status} IN ('confirmed', 'completed')`,
    sql`${bookingsTable.checkedIn} = true`,
  ];
  if (startDate) conds.push(sql`${bookingsTable.bookingDate} >= ${startDate}`);
  if (endDate) conds.push(sql`${bookingsTable.bookingDate} <= ${endDate}`);
  if (partnerId && Number.isFinite(partnerId)) conds.push(sql`${bookingsTable.vendorId} = ${partnerId}`);
  return conds;
}

router.get("/admin/booking-report/top-users", requireAuth(["admin"]), async (req, res) => {
  const startDate = req.query["startDate"] as string | undefined;
  const endDate = req.query["endDate"] as string | undefined;
  const partnerId = req.query["partnerId"] ? Number(req.query["partnerId"]) : null;

  const conds = buildTopBookingConditions(startDate, endDate, partnerId);

  const rows = await db
    .select({
      userId: bookingsTable.userId,
      totalTickets: sql<number>`(SUM(${bookingsTable.ticketWomen}) + SUM(${bookingsTable.ticketMen}) + SUM(${bookingsTable.ticketCouple}))::int`,
      bookingCount: sql<number>`COUNT(*)::int`,
    })
    .from(bookingsTable)
    .where(and(...conds))
    .groupBy(bookingsTable.userId)
    .orderBy(desc(sql`SUM(${bookingsTable.ticketWomen}) + SUM(${bookingsTable.ticketMen}) + SUM(${bookingsTable.ticketCouple})`))
    .limit(3);

  if (rows.length === 0) return res.json([]);

  const users = await db.select().from(usersTable).where(inArray(usersTable.id, rows.map((r) => r.userId)));
  const uMap = new Map(users.map((u) => [u.id, u]));

  return res.json(rows.map((r) => ({
    userId: r.userId,
    name: uMap.get(r.userId)?.name ?? "",
    email: uMap.get(r.userId)?.email ?? "",
    phone: uMap.get(r.userId)?.phone ?? "",
    totalTickets: r.totalTickets,
    bookingCount: r.bookingCount,
  })));
});

router.get("/admin/booking-report/top-pubs", requireAuth(["admin"]), async (req, res) => {
  const startDate = req.query["startDate"] as string | undefined;
  const endDate = req.query["endDate"] as string | undefined;
  const partnerId = req.query["partnerId"] ? Number(req.query["partnerId"]) : null;

  const conds = buildTopBookingConditions(startDate, endDate, partnerId);

  const rows = await db
    .select({
      vendorId: bookingsTable.vendorId,
      totalTickets: sql<number>`(SUM(${bookingsTable.ticketWomen}) + SUM(${bookingsTable.ticketMen}) + SUM(${bookingsTable.ticketCouple}))::int`,
      bookingCount: sql<number>`COUNT(*)::int`,
    })
    .from(bookingsTable)
    .where(and(...conds))
    .groupBy(bookingsTable.vendorId)
    .orderBy(desc(sql`SUM(${bookingsTable.ticketWomen}) + SUM(${bookingsTable.ticketMen}) + SUM(${bookingsTable.ticketCouple})`))
    .limit(3);

  if (rows.length === 0) return res.json([]);

  const vendors = await db.select().from(vendorsTable).where(inArray(vendorsTable.id, rows.map((r) => r.vendorId)));
  const vMap = new Map(vendors.map((v) => [v.id, v]));

  return res.json(rows.map((r) => ({
    vendorId: r.vendorId,
    businessName: vMap.get(r.vendorId)?.businessName ?? `Partner #${r.vendorId}`,
    city: vMap.get(r.vendorId)?.city ?? "",
    totalTickets: r.totalTickets,
    bookingCount: r.bookingCount,
  })));
});

// ── Unique Customer Report ───────────────────────────────────────────────────

const UCR_PAGE_SIZE = 25;

async function getUniqueCustomerData(search?: string) {
  // Optional: filter users by search term
  let userIds: number[] | null = null;
  if (search) {
    const likeStr = `%${search.toLowerCase()}%`;
    const matched = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        or(
          sql`lower(${usersTable.name}) LIKE ${likeStr}`,
          sql`lower(${usersTable.email}) LIKE ${likeStr}`,
          sql`${usersTable.phone} LIKE ${`%${search}%`}`,
        ),
      );
    if (matched.length === 0) return null;
    userIds = matched.map((u) => u.id);
  }

  const bookingWhere = userIds ? inArray(bookingsTable.userId, userIds) : undefined;

  // Count bookings per user (used for both summary stats and booking-count sort)
  const perUserCounts = await db
    .select({ userId: bookingsTable.userId, cnt: sql<number>`COUNT(*)::int` })
    .from(bookingsTable)
    .where(bookingWhere)
    .groupBy(bookingsTable.userId);

  return { perUserCounts, bookingWhere };
}

router.get("/admin/bookings/unique-customers", requireAuth(["admin"]), async (req, res) => {
  const page = Math.max(1, parseInt(req.query["page"] as string) || 1);
  const offset = (page - 1) * UCR_PAGE_SIZE;
  const search = (req.query["search"] as string | undefined)?.trim();
  const sortBy = (req.query["sortBy"] as string) || "name";
  const sortDir = (req.query["sortDir"] as string) === "desc" ? "desc" : "asc";

  const result = await getUniqueCustomerData(search);
  const empty = { customers: [], total: 0, page, totalPages: 1, summary: { totalCustomers: 0, totalBookings: 0, returningCustomers: 0, newCustomers: 0 } };
  if (search && result === null) { res.json(empty); return; }

  const perUserCounts = result?.perUserCounts ?? [];
  const bookingWhere = result?.bookingWhere;

  const totalCustomers = perUserCounts.length;
  const totalBookings = perUserCounts.reduce((s, r) => s + r.cnt, 0);
  const returningCustomers = perUserCounts.filter((r) => r.cnt > 1).length;
  const newCustomers = perUserCounts.filter((r) => r.cnt === 1).length;
  const totalPages = Math.max(1, Math.ceil(totalCustomers / UCR_PAGE_SIZE));

  let customers: { userId: number; name: string; email: string; phone: string; bookingCount: number }[];

  if (sortBy === "bookings") {
    const sorted = [...perUserCounts].sort((a, b) => sortDir === "desc" ? b.cnt - a.cnt : a.cnt - b.cnt);
    const pageIds = sorted.slice(offset, offset + UCR_PAGE_SIZE).map((r) => r.userId);
    if (pageIds.length === 0) { res.json({ ...empty, total: totalCustomers, totalPages, summary: { totalCustomers, totalBookings, returningCustomers, newCustomers } }); return; }
    const userRows = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone })
      .from(usersTable).where(inArray(usersTable.id, pageIds));
    const countMap = new Map(perUserCounts.map((r) => [r.userId, r.cnt]));
    const uMap = new Map(userRows.map((u) => [u.id, u]));
    customers = pageIds.map((uid) => {
      const u = uMap.get(uid);
      return { userId: uid, name: u?.name ?? "", email: u?.email ?? "", phone: u?.phone ?? "", bookingCount: countMap.get(uid) ?? 0 };
    });
  } else {
    const orderExpr = sortBy === "email"
      ? (sortDir === "desc" ? desc(usersTable.email) : asc(usersTable.email))
      : (sortDir === "desc" ? desc(usersTable.name) : asc(usersTable.name));
    const rows = await db
      .select({
        userId: bookingsTable.userId,
        name: usersTable.name,
        email: usersTable.email,
        phone: usersTable.phone,
        bookingCount: sql<number>`COUNT(${bookingsTable.id})::int`,
      })
      .from(bookingsTable)
      .innerJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
      .where(bookingWhere)
      .groupBy(bookingsTable.userId, usersTable.id, usersTable.name, usersTable.email, usersTable.phone)
      .orderBy(orderExpr)
      .limit(UCR_PAGE_SIZE)
      .offset(offset);
    customers = rows.map((r) => ({ userId: r.userId, name: r.name ?? "", email: r.email ?? "", phone: r.phone ?? "", bookingCount: r.bookingCount }));
  }

  res.json({ customers, total: totalCustomers, page, totalPages, summary: { totalCustomers, totalBookings, returningCustomers, newCustomers } });
});

router.get("/admin/bookings/unique-customers/download", requireAuth(["admin"]), async (req, res) => {
  const search = (req.query["search"] as string | undefined)?.trim();

  const result = await getUniqueCustomerData(search);
  let rows: { name: string; email: string; phone: string; bookingCount: number }[] = [];

  if (!search || result !== null) {
    const bookingWhere = result?.bookingWhere;
    const dbRows = await db
      .select({
        name: usersTable.name,
        email: usersTable.email,
        phone: usersTable.phone,
        bookingCount: sql<number>`COUNT(${bookingsTable.id})::int`,
      })
      .from(bookingsTable)
      .innerJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
      .where(bookingWhere)
      .groupBy(usersTable.id, usersTable.name, usersTable.email, usersTable.phone)
      .orderBy(asc(usersTable.name));
    rows = dbRows.map((r) => ({ name: r.name ?? "", email: r.email ?? "", phone: r.phone ?? "", bookingCount: r.bookingCount }));
  }

  const ws = XLSX.utils.aoa_to_sheet([
    ["Customer Name", "Email Address", "Phone Number", "Total Bookings"],
    ...rows.map((r) => [r.name, r.email, r.phone, r.bookingCount]),
  ]);
  // Auto-size columns
  ws["!cols"] = [{ wch: 30 }, { wch: 35 }, { wch: 18 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Unique Customers");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const filename = `unique-customers-${toIstDateStr(new Date())}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
});

// ── Bookings Excel export ─────────────────────────────────────────────────────

router.get("/admin/bookings/report/download", requireAuth(["admin"]), async (req, res) => {
  const vendorIdParam = req.query["vendorId"] ? Number(req.query["vendorId"]) : null;
  const statusParam = req.query["status"] as string | undefined;
  const startDateParam = req.query["startDate"] as string | undefined;
  const endDateParam = req.query["endDate"] as string | undefined;

  const kindParam = (req.query["kind"] as string | undefined) === "organizer" ? "organizer" : "pub";
  const conditions: ReturnType<typeof sql>[] = [sql`${bookingsTable.status} != ${"cancelled"}`, sql`${bookingsTable.kind} = ${kindParam}`];
  if (vendorIdParam && Number.isFinite(vendorIdParam))
    conditions.push(sql`${bookingsTable.vendorId} = ${vendorIdParam}`);
  if (statusParam && statusParam !== "all")
    conditions.push(sql`${bookingsTable.status} = ${statusParam}`);
  if (startDateParam)
    conditions.push(sql`${bookingsTable.bookingDate} >= ${startDateParam}`);
  if (endDateParam)
    conditions.push(sql`${bookingsTable.bookingDate} <= ${endDateParam}`);

  const rows = await db
    .select()
    .from(bookingsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bookingsTable.createdAt))
    .limit(5000);

  const enriched = await enrichBookingRows(rows);

  const header = [
    "Booking ID", "Date", "Created At", "Vendor", "Guest Name", "Phone", "Email",
    "Pub Mode", "Women", "Men", "Couples", "Guests",
    "Ticket Price (₹)", "Discount (₹)", "Final Ticket (₹)", "Base Fee (₹)", "Total Payable (₹)",
    "Payment Method", "Status", "Checked In", "Check-In Time", "Ticket Code",
  ];

  const dataRows = enriched.map((b) => [
    b.id,
    b.bookingDate,
    b.createdAt ? new Date(b.createdAt).toLocaleString("en-IN") : "",
    b.vendorName,
    b.userName,
    b.phone,
    b.userEmail,
    b.pubMode,
    b.ticketWomen,
    b.ticketMen,
    b.ticketCouple,
    b.guests,
    b.totalPrice,
    b.discountAmount,
    b.finalPrice,
    b.baseFee,
    b.totalPayable,
    b.paymentMethod,
    b.status,
    b.checkedIn ? "Yes" : "No",
    b.checkedInAt ? new Date(b.checkedInAt).toLocaleString("en-IN") : "",
    b.ticketCode,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  ws["!cols"] = [
    { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 28 },
    { wch: 10 }, { wch: 7 }, { wch: 7 }, { wch: 8 }, { wch: 8 },
    { wch: 16 }, { wch: 13 }, { wch: 16 }, { wch: 13 }, { wch: 16 },
    { wch: 16 }, { wch: 12 }, { wch: 11 }, { wch: 18 }, { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bookings");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const filename = `bookings-${toIstDateStr(new Date())}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
});

// ── Google Places photo proxy (admin) ────────────────────────────────────────

router.get("/admin/places/photo", requireAuth(["admin"]), async (req, res) => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GOOGLE_PLACES_API_KEY is not configured" });
    return;
  }
  const ref = typeof req.query["ref"] === "string" ? req.query["ref"].trim() : "";
  if (!ref) {
    res.status(400).json({ error: "ref query parameter is required" });
    return;
  }
  try {
    const GOOGLE_PLACES_BASE = "https://maps.googleapis.com/maps/api/place";
    const photoUrl = `${GOOGLE_PLACES_BASE}/photo?maxwidth=400&photoreference=${encodeURIComponent(ref)}&key=${apiKey}`;
    const photoResp = await fetch(photoUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!photoResp.ok) {
      res.status(502).json({ error: `Google photo returned HTTP ${photoResp.status}` });
      return;
    }
    const contentType = photoResp.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await photoResp.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  } catch {
    res.status(502).json({ error: "Failed to fetch photo from Google" });
  }
});

// ── Import pub from Google Business Profile ───────────────────────────────────

router.post("/admin/pubs/preview-google", requireAuth(["admin"]), async (req, res) => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GOOGLE_PLACES_API_KEY is not configured on this server" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const googleUrl = typeof body["googleUrl"] === "string" ? body["googleUrl"].trim() : "";
  const partnerEmail = typeof body["partnerEmail"] === "string" ? body["partnerEmail"].trim().toLowerCase() : "";

  if (!googleUrl) {
    res.status(400).json({ error: "googleUrl is required" });
    return;
  }
  if (!partnerEmail) {
    res.status(400).json({ error: "partnerEmail is required" });
    return;
  }

  const [userRow] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.email, partnerEmail))
    .limit(1);
  if (!userRow) {
    res.status(404).json({ error: `No account found with email: ${partnerEmail}` });
    return;
  }

  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.userId, userRow.id))
    .limit(1);
  if (!vendor) {
    res.status(404).json({ error: "This user does not have a partner profile" });
    return;
  }
  if (vendor.status !== "approved") {
    res.status(403).json({ error: `Partner profile is not approved (status: ${vendor.status})` });
    return;
  }

  const existingPub = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(and(eq(eventsTable.vendorId, vendor.id), eq(eventsTable.type, "pub")))
    .limit(1);
  if (existingPub.length > 0) {
    res.status(409).json({ error: "This partner already has a pub listing. Delete it before importing a new one." });
    return;
  }

  let place;
  try {
    place = await resolvePlaceFromUrl(googleUrl, apiKey);
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    res.status(e.status ?? 502).json({ error: e.message ?? "Failed to resolve Google place" });
    return;
  }

  const photoPreviewUrl = place.photoRef
    ? `/api/admin/places/photo?ref=${encodeURIComponent(place.photoRef)}`
    : null;

  res.json({
    vendor: {
      id: vendor.id,
      businessName: vendor.businessName,
      userEmail: userRow.email,
    },
    place: {
      placeId: place.placeId,
      name: place.name,
      formattedAddress: place.formattedAddress,
      city: place.city,
      state: place.state,
      country: place.country,
      phone: place.phone,
      website: place.website,
      openingHours: place.openingHours,
      hasPhoto: place.photoRef !== null,
      photoPreviewUrl,
    },
  });
});

router.post("/admin/pubs/import-google", requireAuth(["admin"]), async (req, res) => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GOOGLE_PLACES_API_KEY is not configured" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const googleUrl = typeof body["googleUrl"] === "string" ? body["googleUrl"].trim() : "";
  const partnerEmail = typeof body["partnerEmail"] === "string" ? body["partnerEmail"].trim().toLowerCase() : "";
  const pubMode = typeof body["pubMode"] === "string" ? body["pubMode"] : "entry";
  const category = typeof body["category"] === "string" && body["category"].trim() ? body["category"].trim() : "bar";
  // Optional placeId from a prior preview call — skips the text search step
  const placeIdFromPreview = typeof body["placeId"] === "string" ? body["placeId"].trim() : "";

  if (!googleUrl && !placeIdFromPreview) {
    res.status(400).json({ error: "googleUrl is required" });
    return;
  }
  if (!partnerEmail) {
    res.status(400).json({ error: "partnerEmail is required" });
    return;
  }

  // Look up user by email
  const [userRow] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.email, partnerEmail))
    .limit(1);
  if (!userRow) {
    res.status(404).json({ error: `No account found with email: ${partnerEmail}` });
    return;
  }

  // Look up vendor
  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.userId, userRow.id))
    .limit(1);
  if (!vendor) {
    res.status(404).json({ error: "This user does not have a partner profile" });
    return;
  }
  if (vendor.status !== "approved") {
    res.status(403).json({ error: `Partner profile is not approved (status: ${vendor.status})` });
    return;
  }

  // Check one-pub-per-vendor rule
  const existingPub = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(and(eq(eventsTable.vendorId, vendor.id), eq(eventsTable.type, "pub")))
    .limit(1);
  if (existingPub.length > 0) {
    res.status(409).json({ error: "This partner already has a pub listing. Delete it before importing a new one." });
    return;
  }

  // Resolve place details from Google (use placeId shortcut if provided by preview)
  let place;
  try {
    place = placeIdFromPreview
      ? await resolvePlaceById(placeIdFromPreview, apiKey)
      : await resolvePlaceFromUrl(googleUrl, apiKey);
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    res.status(e.status ?? 502).json({ error: e.message ?? "Failed to resolve Google place" });
    return;
  }

  // Download and store the cover photo
  let imageUrl = "";
  if (place.photoRef) {
    try {
      imageUrl = await downloadAndStorePhoto(place.photoRef, apiKey);
    } catch {
      // Non-fatal: proceed without photo
    }
  }

  // Build description
  const descParts: string[] = [place.formattedAddress];
  if (place.phone) descParts.push(`Phone: ${place.phone}`);
  if (place.website) descParts.push(`Website: ${place.website}`);
  const description = descParts.join("\n");

  // Insert event
  const [created] = await db
    .insert(eventsTable)
    .values({
      vendorId: vendor.id,
      title: place.name,
      description,
      category,
      type: "pub",
      location: place.formattedAddress,
      city: place.city,
      state: place.state,
      country: place.country || "India",
      price: "0",
      capacity: 0,
      imageUrl,
      pubMode,
      priceWomen: "0",
      priceMen: "0",
      priceCouple: "0",
      pubEventTypes: [],
      approvalStatus: "approved",
    })
    .returning();

  if (!created) {
    res.status(500).json({ error: "Failed to create pub listing" });
    return;
  }

  res.json({
    ok: true,
    event: {
      id: created.id,
      vendorId: created.vendorId,
      title: created.title,
      type: created.type,
      category: created.category,
      location: created.location,
      city: created.city,
      state: created.state,
      country: created.country,
      imageUrl: created.imageUrl,
      approvalStatus: created.approvalStatus,
      createdAt: created.createdAt.toISOString(),
    },
    place: {
      placeId: place.placeId,
      name: place.name,
      formattedAddress: place.formattedAddress,
      city: place.city,
      state: place.state,
      country: place.country,
      phone: place.phone,
      website: place.website,
      openingHours: place.openingHours,
    },
  });
});

// ─── Commission Rates ─────────────────────────────────────────────────────────

router.get("/admin/vendors/:id/commission", requireAuth(["admin"]), async (req, res) => {
  const vendorId = Number(req.params["id"]);
  if (!Number.isFinite(vendorId)) {
    res.status(400).json({ error: "Invalid vendor id" });
    return;
  }
  const [row] = await db
    .select()
    .from(vendorCommissionsTable)
    .where(eq(vendorCommissionsTable.vendorId, vendorId))
    .limit(1);
  if (!row) {
    res.json({ vendorId, freeEntryRate: "0", ticketRate: "0", tableBookingRate: "0", eventRate: "0", coverChargeRate: "0", eventCommissionEnabled: true });
    return;
  }
  res.json(row);
});

router.put("/admin/vendors/:id/commission", requireAuth(["admin"]), async (req, res) => {
  const paramsParsed = SetVendorCommissionParams.safeParse(req.params);
  if (!paramsParsed.success) {
    respondInvalid(res, paramsParsed.error);
    return;
  }
  const vendorId = paramsParsed.data.id;
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.id, vendorId)).limit(1);
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  const parsed = SetVendorCommissionBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const { freeEntryRate, ticketRate, tableBookingRate, eventRate = 0, coverChargeRate = 0, eventCommissionEnabled = true } = parsed.data;
  const [upserted] = await db
    .insert(vendorCommissionsTable)
    .values({
      vendorId,
      freeEntryRate: freeEntryRate.toFixed(2),
      ticketRate: ticketRate.toFixed(2),
      tableBookingRate: tableBookingRate.toFixed(2),
      eventRate: eventRate.toFixed(2),
      coverChargeRate: coverChargeRate.toFixed(2),
      eventCommissionEnabled,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: vendorCommissionsTable.vendorId,
      set: {
        freeEntryRate: freeEntryRate.toFixed(2),
        ticketRate: ticketRate.toFixed(2),
        tableBookingRate: tableBookingRate.toFixed(2),
        eventRate: eventRate.toFixed(2),
        coverChargeRate: coverChargeRate.toFixed(2),
        eventCommissionEnabled,
        updatedAt: new Date(),
      },
    })
    .returning();
  res.json(upserted);
});

// ─── Commission Report ────────────────────────────────────────────────────────

router.get("/admin/commission-report", requireAuth(["admin"]), async (req, res) => {
  // Default window = same one `/admin/analytics` uses (last 12 months, starting
  // from the first of the month 12 months ago). Sharing this default guarantees
  // the commission-report's `collectedCommission` total equals the analytics
  // dashboard's `totalCommission` tile to the rupee when neither endpoint has
  // explicit date filters applied by the caller.
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setFullYear(defaultStart.getFullYear() - 1);
  defaultStart.setDate(1);
  defaultStart.setHours(0, 0, 0, 0);

  const fromStr = req.query["from"] as string | undefined;
  const toStr = req.query["to"] as string | undefined;
  const from = fromStr ? new Date(`${fromStr}T00:00:00+05:30`) : defaultStart;
  const to = toStr ? new Date(`${toStr}T23:59:59+05:30`) : now;

  // Gated on `checkedIn = true` (Save Actual Entry is the sole trigger).
  // The Commission Report only counts revenue / commission for bookings
  // that have been finalized at the door — paid-but-unscanned bookings
  // don't move money in the report.
  const whereConditions = [
    sql`${bookingsTable.status} IN ('confirmed', 'completed')`,
    eq(bookingsTable.checkedIn, true),
    gte(bookingsTable.createdAt, from),
    lte(bookingsTable.createdAt, to),
  ];

  const [bookings, commissions, approvedVendors] = await Promise.all([
    db
      .select({
        id: bookingsTable.id,
        vendorId: bookingsTable.vendorId,
        eventId: bookingsTable.eventId,
        bookingDate: bookingsTable.bookingDate,
        finalPrice: bookingsTable.finalPrice,
        totalPrice: bookingsTable.totalPrice,
        pubMode: bookingsTable.pubMode,
        guests: bookingsTable.guests,
        ticketWomen: bookingsTable.ticketWomen,
        ticketMen: bookingsTable.ticketMen,
        ticketCouple: bookingsTable.ticketCouple,
        actualWomen: bookingsTable.actualWomen,
        actualMen: bookingsTable.actualMen,
        actualCouple: bookingsTable.actualCouple,
        actualGuests: bookingsTable.actualGuests,
        paymentMethod: bookingsTable.paymentMethod,
        createdAt: bookingsTable.createdAt,
        status: bookingsTable.status,
        baseFee: bookingsTable.baseFee,
        eventCommissionPct: bookingsTable.eventCommissionPct,
      })
      .from(bookingsTable)
      .where(and(...whereConditions)),
    db.select().from(vendorCommissionsTable),
    db
      .select({ id: vendorsTable.id, businessName: vendorsTable.businessName, city: vendorsTable.city, baseFeePercent: vendorsTable.baseFeePercent, baseFeeEnabled: vendorsTable.baseFeeEnabled })
      .from(vendorsTable)
      .where(eq(vendorsTable.status, "approved")),
  ]);
  // Fetch ledger entries for exactly these bookings — filtering by bookingId
  // (not by createdAt) means a booking created in December that gets scanned
  // in January is correctly shown as "collected" in the December report.
  const bookingIds = bookings.map((b) => b.id);
  const ledgerRows = bookingIds.length > 0
    ? await db
        .select({
          vendorId: commissionLedgerTable.vendorId,
          bookingId: commissionLedgerTable.bookingId,
          amount: commissionLedgerTable.amount,
        })
        .from(commissionLedgerTable)
        .where(
          and(
            inArray(commissionLedgerTable.trigger, [...REALISED_COMMISSION_TRIGGERS]),
            inArray(commissionLedgerTable.bookingId, bookingIds),
          ),
        )
    : [];

  const commissionMap = new Map(commissions.map((c) => [c.vendorId, c]));

  // Pre-fetch every event referenced by these bookings so the per-tier
  // free-entry commission split can be applied without an N+1 lookup.
  const reportEventIds = Array.from(new Set(bookings.map((b) => b.eventId)));
  const reportEventRows = reportEventIds.length > 0
    ? await db
        .select({
          id: eventsTable.id,
          freeEntryRules: eventsTable.freeEntryRules,
          priceWomen: eventsTable.priceWomen,
          priceMen: eventsTable.priceMen,
          priceCouple: eventsTable.priceCouple,
        })
        .from(eventsTable)
        .where(inArray(eventsTable.id, reportEventIds))
    : [];
  const reportEventMap = new Map(reportEventRows.map((e) => [e.id, e]));
  const eventFerMap = new Map(
    reportEventRows.map((e) => [e.id, e.freeEntryRules as { enabled?: boolean; days?: string[]; genders?: string[] } | null]),
  );
  // We use the ledger purely as a realisation marker (has this booking been
  // QR-scanned / paid yet?). The reported commission AMOUNT always comes from
  // the deterministic `units × rate` calculation so the report matches the
  // current rate card to the rupee — even when historical ledger rows from
  // earlier code paths recorded actuals-based or FER-split values.
  const collectedBookingIds = new Set<number>();
  for (const row of ledgerRows) {
    if (row.bookingId != null) collectedBookingIds.add(row.bookingId);
  }

  // Compute per-booking effective revenue (actuals × price for COD, finalPrice for online)
  const { byBookingId: commReportEffRevById } = await computeEffectiveRevenues(bookings);

  type BookingLineItem = {
    id: number;
    finalPrice: number;
    effectiveRevenue: number;
    bookingType: "free_entry" | "ticket" | "table" | "event_booking" | "cover_charge";
    commissionRate: number;
    unitCount: number;
    commissionAmount: number;
    collected: boolean;
    createdAt: Date;
  };

  type VendorSummary = {
    vendorId: number;
    businessName: string;
    city: string;
    appliedRates: { freeEntryRate: string; ticketRate: string; tableBookingRate: string; eventRate: string; coverChargeRate: string; eventCommissionEnabled: boolean };
    baseFeePercent: string;
    baseFeeEnabled: boolean;
    totalBookings: number;
    totalRevenue: number;
    totalCommission: number;
    totalBaseFee: number;
    collectedCommission: number;
    pendingCommission: number;
    freeEntryCount: number;
    freeEntryRevenue: number;
    freeEntryCommission: number;
    freeEntryPeople: number;
    freeEntryBaseFee: number;
    ticketCount: number;
    ticketRevenue: number;
    ticketCommission: number;
    ticketPeople: number;
    ticketBaseFee: number;
    tableCount: number;
    tableRevenue: number;
    tableCommission: number;
    tablePeople: number;
    tableBaseFee: number;
    eventBookingCount: number;
    eventBookingRevenue: number;
    eventBookingCommission: number;
    eventBookingPeople: number;
    eventBookingBaseFee: number;
    coverChargeCount: number;
    coverChargeRevenue: number;
    coverChargeCommission: number;
    coverChargePeople: number;
    coverChargeBaseFee: number;
    bookings: BookingLineItem[];
  };

  const summaryMap = new Map<number, VendorSummary>();

  // Pre-populate every approved vendor so zero-booking pubs still appear in report
  for (const v of approvedVendors) {
    const vendorRates = commissionMap.get(v.id);
    summaryMap.set(v.id, {
      vendorId: v.id,
      businessName: v.businessName,
      city: v.city ?? "",
      appliedRates: {
        freeEntryRate: vendorRates?.freeEntryRate ?? "0",
        ticketRate: vendorRates?.ticketRate ?? "0",
        tableBookingRate: vendorRates?.tableBookingRate ?? "0",
        eventRate: vendorRates?.eventRate ?? "0",
        coverChargeRate: (vendorRates as { coverChargeRate?: string } | undefined)?.coverChargeRate ?? "0",
        eventCommissionEnabled: vendorRates?.eventCommissionEnabled ?? true,
      },
      baseFeePercent: v.baseFeePercent ?? "3.50",
      baseFeeEnabled: v.baseFeeEnabled ?? true,
      totalBookings: 0,
      totalRevenue: 0,
      totalCommission: 0,
      totalBaseFee: 0,
      collectedCommission: 0,
      pendingCommission: 0,
      freeEntryCount: 0,
      freeEntryRevenue: 0,
      freeEntryCommission: 0,
      freeEntryPeople: 0,
      freeEntryBaseFee: 0,
      ticketCount: 0,
      ticketRevenue: 0,
      ticketCommission: 0,
      ticketPeople: 0,
      ticketBaseFee: 0,
      tableCount: 0,
      tableRevenue: 0,
      tableCommission: 0,
      tablePeople: 0,
      tableBaseFee: 0,
      eventBookingCount: 0,
      eventBookingRevenue: 0,
      eventBookingCommission: 0,
      eventBookingPeople: 0,
      eventBookingBaseFee: 0,
      coverChargeCount: 0,
      coverChargeRevenue: 0,
      coverChargeCommission: 0,
      coverChargePeople: 0,
      coverChargeBaseFee: 0,
      bookings: [],
    });
  }

  for (const b of bookings) {
    // Use actual collected amount (actuals × price for COD, finalPrice for online).
    // Every booking here has checkedIn=true so effective revenue is always meaningful.
    const effRev = commReportEffRevById.get(b.id) ?? Number(b.finalPrice);
    const price = effRev;
    const rates = commissionMap.get(b.vendorId);
    // Use actuals-aware helper so the report reflects verified door counts,
    // not booked counts. Falls back to booked counts when actuals are null
    // (guards against edge cases; checkedIn=true rows should always have actuals).
    const reportEv = reportEventMap.get(b.eventId);
    const comm = computeCommissionFromActuals(
      b,
      rates ?? { freeEntryRate: 0, ticketRate: 0, tableBookingRate: 0 },
      { priceWomen: reportEv?.priceWomen, priceMen: reportEv?.priceMen, priceCouple: reportEv?.priceCouple },
      eventFerMap.get(b.eventId) ?? null,
    );
    const bookingType = comm.bookingType;
    const feePerUnit = comm.ratePerUnit;
    const unitCount = comm.unitCount;
    const isCollected = collectedBookingIds.has(b.id);
    // Deterministic per-booking commission: always units × rate from the
    // current rate card. The ledger only marks realisation (scanned vs pending).
    const commissionAmount = comm.amount;

    // Skip bookings from vendors not in the approved list
    if (!summaryMap.has(b.vendorId)) continue;

    const s = summaryMap.get(b.vendorId)!;
    const bkBaseFee = b.baseFee ?? 0;
    s.totalBookings += 1;
    s.totalRevenue += price;
    s.totalCommission += commissionAmount;
    s.totalBaseFee += bkBaseFee;
    s.bookings.push({
      id: b.id,
      finalPrice: Number(b.finalPrice),
      effectiveRevenue: price,
      bookingType,
      commissionRate: feePerUnit,
      unitCount,
      commissionAmount,
      collected: isCollected,
      createdAt: b.createdAt,
    });
    // Realised vs pending split is driven solely by the ledger marker.
    // Amounts on both sides come from the deterministic units × rate calc.
    if (isCollected) {
      s.collectedCommission += commissionAmount;
    } else {
      s.pendingCommission += commissionAmount;
    }

    if (bookingType === "free_entry") {
      s.freeEntryCount += 1;
      s.freeEntryRevenue += price;
      s.freeEntryCommission += commissionAmount;
      s.freeEntryPeople += unitCount;
      s.freeEntryBaseFee += bkBaseFee;
    } else if (bookingType === "ticket") {
      s.ticketCount += 1;
      s.ticketRevenue += price;
      s.ticketCommission += commissionAmount;
      s.ticketPeople += unitCount;
      s.ticketBaseFee += bkBaseFee;
    } else if (bookingType === "event_booking") {
      s.eventBookingCount += 1;
      s.eventBookingRevenue += price;
      s.eventBookingCommission += commissionAmount;
      s.eventBookingPeople += unitCount;
      s.eventBookingBaseFee += bkBaseFee;
    } else if (bookingType === "cover_charge") {
      s.coverChargeCount += 1;
      s.coverChargeRevenue += price;
      s.coverChargeCommission += commissionAmount;
      s.coverChargePeople += unitCount;
      s.coverChargeBaseFee += bkBaseFee;
    } else {
      s.tableCount += 1;
      s.tableRevenue += price;
      s.tableCommission += commissionAmount;
      s.tablePeople += unitCount;
      s.tableBaseFee += bkBaseFee;
    }
  }

  // Both buckets were accumulated per-booking above using planned amounts.
  for (const s of summaryMap.values()) {
    s.collectedCommission = Math.max(0, Math.round(s.collectedCommission * 100) / 100);
    s.pendingCommission = Math.max(0, Math.round(s.pendingCommission * 100) / 100);
  }

  const rows = Array.from(summaryMap.values()).sort((a, b) => b.totalCommission - a.totalCommission);

  const totals = rows.reduce(
    (acc, r) => {
      acc.totalBookings += r.totalBookings;
      acc.totalRevenue += r.totalRevenue;
      acc.totalCommission += r.totalCommission;
      acc.totalBaseFee += r.totalBaseFee;
      acc.collectedCommission += r.collectedCommission;
      acc.pendingCommission += r.pendingCommission;
      return acc;
    },
    { totalBookings: 0, totalRevenue: 0, totalCommission: 0, totalBaseFee: 0, collectedCommission: 0, pendingCommission: 0 },
  );

  res.json({ rows, totals });
});

const VALID_COUPON_TYPES = ["general", "event", "loyalty", "referral", "vip"] as const;
type CouponType = (typeof VALID_COUPON_TYPES)[number];

router.post("/admin/users/:userId/send-coupon", requireAuth(["admin"]), async (req, res) => {
  const paramsParsed = AdminSendCouponParams.safeParse(req.params);
  if (!paramsParsed.success) {
    respondInvalid(res, paramsParsed.error);
    return;
  }
  const userId = paramsParsed.data.userId;

  const parsed = AdminSendCouponBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const code = parsed.data.code.trim().toUpperCase();
  const discount = parsed.data.discount;
  const couponType: CouponType = parsed.data.type ?? "general";

  if (!code) {
    res.status(400).json({ error: "Provide a valid code and discount (1–100)" });
    return;
  }

  const [userRow] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!userRow) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [existing] = await db.select({ id: couponsTable.id }).from(couponsTable).where(eq(couponsTable.code, code)).limit(1);
  if (existing) {
    res.status(409).json({ error: "Coupon code already exists" });
    return;
  }

  const [c] = await db
    .insert(couponsTable)
    .values({
      userId,
      code,
      discountPercent: Math.round(discount),
      source: `admin_send_${couponType}`,
    })
    .returning();

  res.json(c);
});

/**
 * One-shot migrator for moving every file under LOCAL_STORAGE_DIR (the
 * Railway Volume) into the configured S3 bucket. Removed in a follow-up
 * commit once the migration is complete — this endpoint is not part of
 * the long-term admin surface.
 *
 * Body: { confirm: "yes" }. Idempotent — re-running skips files already
 * present in the bucket. Hard timeout left to the request gateway; if it
 * times out, just call it again.
 */
router.post("/admin/migrate-media", requireAuth(["admin"]), async (req, res) => {
  if (req.body?.confirm !== "yes") {
    res.status(400).json({ error: "Set { confirm: \"yes\" } in the body to run the migration." });
    return;
  }
  try {
    const report = await migrateMediaToS3({ concurrency: 8 });
    res.json(report);
  } catch (err) {
    req.log.error({ err }, "media migration failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Migration failed" });
  }
});

/**
 * One-shot endpoint for seeding 10 demo pubs into the active database.
 * Each pub becomes its own vendor with 1 cover, 5 gallery photos, 1
 * dance-floor photo and 2 menu images, capacity 500, and distinct
 * women/men/couple ticket prices all above ₹1000.
 *
 * Body: { confirm: "yes" }. Idempotent — re-running upserts by slug.
 */
router.post("/admin/seed-demo-pubs", requireAuth(["admin"]), async (req, res) => {
  if (req.body?.confirm !== "yes") {
    res.status(400).json({ error: "Set { confirm: \"yes\" } in the body to run the seed." });
    return;
  }
  try {
    const report = await seedDemoPubs();
    res.json(report);
  } catch (err) {
    req.log.error({ err }, "demo-pubs seed failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Seed failed" });
  }
});

/**
 * One-shot endpoint that enriches the operator's REAL approved profiles so a
 * visitor can see how a finished profile/event/announcement looks:
 *   • fills cover/banner/gallery/dance-floor/menu images (empty fields only),
 *   • ensures an approved pub event (pricing + group capacity + free entry),
 *   • adds drink_plans (happy hours), food+drink offers and announcements,
 *   • ensures the demo Game Organizer profile (gamezone@royvento.com) exists.
 *
 * Body: { confirm: "yes" }. Idempotent and non-destructive — it only fills
 * empty image fields and inserts content that doesn't already exist (matched
 * by title), so partner-entered data is never overwritten or duplicated.
 */
router.post("/admin/seed-prod-showcase", requireAuth(["admin"]), async (req, res) => {
  if (req.body?.confirm !== "yes") {
    res.status(400).json({ error: "Set { confirm: \"yes\" } in the body to run the seed." });
    return;
  }
  try {
    const report = await seedProdShowcase();
    res.json(report);
  } catch (err) {
    req.log.error({ err }, "prod-showcase seed failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Seed failed" });
  }
});

/**
 * Demo: attach 5 gallery photos to a "HouseParty" Create-Your-Own-Party. If no
 * such party exists yet it's created (free entry, public) owned by the admin so
 * the gallery is immediately viewable on /party/:id. Idempotent — re-running
 * just refreshes the gallery on the same party.
 */
router.post("/admin/seed-houseparty-demo", requireAuth(["admin"]), async (req, res) => {
  const adminId = (req as AuthedRequest).user?.id;
  if (!adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  // Five party photos (house-party vibe). External demo URLs are fine here since
  // this seed writes directly to the DB and bypasses the upload-path guard.
  const GALLERY = [
    "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=1200&q=80",
    "https://images.unsplash.com/photo-1496024840928-4c417adf211d?w=1200&q=80",
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80",
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1200&q=80",
    "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1200&q=80",
  ];
  const COVER = "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1600&q=80";
  try {
    const existing = await db
      .select()
      .from(createYourPartyTable)
      .where(eq(createYourPartyTable.name, "HouseParty"))
      .limit(1);
    if (existing[0]) {
      await db
        .update(createYourPartyTable)
        .set({
          galleryImages: GALLERY,
          coverImageUrl: existing[0].coverImageUrl || COVER,
          updatedAt: new Date(),
        })
        .where(eq(createYourPartyTable.id, existing[0].id));
      res.json({ ok: true, action: "updated", partyId: existing[0].id, galleryCount: GALLERY.length });
      return;
    }
    const now = new Date();
    const [party] = await db
      .insert(createYourPartyTable)
      .values({
        organizerUserId: adminId,
        name: "HouseParty",
        slug: `houseparty-${Math.random().toString(36).slice(2, 8)}`,
        coverImageUrl: COVER,
        galleryImages: GALLERY,
        description: "A cozy house party with great music, drinks and good company. Swipe through the gallery to get the vibe!",
        category: "party",
        visibility: "public",
        venueName: "Private Residence",
        address: "Sector V, Salt Lake",
        city: "Kolkata",
        state: "West Bengal",
        pinCode: "700091",
        joinType: "mixed",
        organizerName: "Royvento Demo",
        capacity: 0,
        status: "published",
        createdBy: adminId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await db.insert(createYourPartyTicketsTable).values({
      partyId: party!.id,
      type: "free",
      name: "Entry",
      price: "0",
      quantity: 0,
    });
    res.json({ ok: true, action: "created", partyId: party!.id, galleryCount: GALLERY.length });
  } catch (err) {
    req.log.error({ err }, "houseparty demo seed failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Seed failed" });
  }
});

/**
 * One-shot repair: rewrites the five dead Unsplash photo IDs (now 404) that are
 * persisted in prod vendor/event image fields to verified-working images, and
 * spreads approved pub vendors across the Pub / Club / Lounge category sections
 * so the pubs page shows populated sections instead of one.
 *
 * Body: { confirm: "yes" }. Idempotent — only known-dead URLs are rewritten and
 * category assignment is deterministic, so re-running is a no-op.
 */
router.post("/admin/repair-prod-media", requireAuth(["admin"]), async (req, res) => {
  if (req.body?.confirm !== "yes") {
    res.status(400).json({ error: "Set { confirm: \"yes\" } in the body to run the repair." });
    return;
  }
  try {
    const report = await repairProdMedia();
    res.json(report);
  } catch (err) {
    req.log.error({ err }, "repair-prod-media failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Repair failed" });
  }
});

/**
 * Admin: set (overwrite) a user's password. Used to recover access to partner
 * accounts whose owner-chosen password is unknown (passwords are bcrypt-hashed
 * and cannot be read back). Hashes with the same helper the login compares
 * against. Body: { password: string } (min 8 chars).
 */
router.post("/admin/users/:userId/set-password", requireAuth(["admin"]), async (req, res) => {
  const userId = Number(req.params["userId"]);
  if (!Number.isFinite(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (password.length < 8) { res.status(400).json({ error: "password (min 8 chars) is required" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const passwordHash = await hashPassword(password);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, userId));
  res.json({ ok: true, userId, email: user.email });
});

// ─── Vendor Base Fee Settings ─────────────────────────────────────────────────

router.patch("/admin/vendors/:id/base-fee", requireAuth(["admin"]), async (req, res) => {
  const vendorId = Number(req.params["id"]);
  if (!Number.isFinite(vendorId)) { res.status(400).json({ error: "Invalid vendor id" }); return; }
  const body = req.body as { baseFeePercent?: number; baseFeeEnabled?: boolean };
  if (body.baseFeePercent !== undefined) {
    await db.execute(sql`UPDATE vendors SET base_fee_percent = ${Number(body.baseFeePercent).toFixed(2)} WHERE id = ${vendorId}`);
  }
  if (body.baseFeeEnabled !== undefined) {
    await db.execute(sql`UPDATE vendors SET base_fee_enabled = ${!!body.baseFeeEnabled} WHERE id = ${vendorId}`);
  }
  res.json({ ok: true });
});

// ─── Drink Plan Priority Management ──────────────────────────────────────────

// GET /admin/drink-plans — all plans across all pubs (with vendor name)
router.get("/admin/drink-plans", requireAuth(["admin"]), async (_req, res) => {
  const plans = await db
    .select({
      id: drinkPlansTable.id,
      vendorId: drinkPlansTable.vendorId,
      vendorName: vendorsTable.businessName,
      type: drinkPlansTable.type,
      productName: drinkPlansTable.productName,
      price: drinkPlansTable.price,
      gender: drinkPlansTable.gender,
      days: drinkPlansTable.days,
      validUntil: drinkPlansTable.validUntil,
      globalPriority: drinkPlansTable.globalPriority,
      createdAt: drinkPlansTable.createdAt,
    })
    .from(drinkPlansTable)
    .leftJoin(vendorsTable, eq(vendorsTable.id, drinkPlansTable.vendorId))
    .orderBy(drinkPlansTable.globalPriority, drinkPlansTable.createdAt);
  res.json(plans);
});

// POST /admin/drink-plans/priorities — set the ordered top-10 list
// Body: { orderedIds: number[] }  (1–10 items; extra items beyond 10 are ignored)
router.post("/admin/drink-plans/priorities", requireAuth(["admin"]), async (req, res) => {
  const body = req.body as unknown;
  if (!body || typeof body !== "object" || !Array.isArray((body as Record<string, unknown>)["orderedIds"])) {
    res.status(400).json({ error: "orderedIds array required" });
    return;
  }
  const orderedIds: number[] = ((body as Record<string, unknown>)["orderedIds"] as unknown[])
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0)
    .slice(0, 10);

  // Clear all existing priorities, then set new ones
  await db.update(drinkPlansTable).set({ globalPriority: null }).where(sql`${drinkPlansTable.globalPriority} IS NOT NULL`);
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(drinkPlansTable)
      .set({ globalPriority: i + 1 })
      .where(eq(drinkPlansTable.id, orderedIds[i]!));
  }

  res.json({ ok: true, count: orderedIds.length });
});

// ── Manual (walk-in) booking report ─────────────────────────────────────────

const MANUAL_REPORT_PAGE_SIZE = 50;

router.get("/admin/bookings/manual-report", requireAuth(["admin"]), async (req, res) => {
  const pageNum = Math.max(1, parseInt(req.query["page"] as string) || 1);
  const offset = (pageNum - 1) * MANUAL_REPORT_PAGE_SIZE;
  const vendorIdParam = req.query["vendorId"] ? Number(req.query["vendorId"]) : null;
  const startDate = req.query["startDate"] as string | undefined;
  const endDate = req.query["endDate"] as string | undefined;

  const conds = [sql`${bookingsTable.pubMode} = 'manual'`];
  if (vendorIdParam && Number.isFinite(vendorIdParam))
    conds.push(sql`${bookingsTable.vendorId} = ${vendorIdParam}`);
  if (startDate) conds.push(sql`${bookingsTable.bookingDate} >= ${startDate}`);
  if (endDate) conds.push(sql`${bookingsTable.bookingDate} <= ${endDate}`);
  const whereSQL = sql.join(conds, sql` AND `);

  const [countRow, rows, phoneAgg, totals] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(bookingsTable).where(whereSQL),
    db.select().from(bookingsTable).where(whereSQL).orderBy(desc(bookingsTable.createdAt)).limit(MANUAL_REPORT_PAGE_SIZE).offset(offset),
    db.select({
      phone: bookingsTable.phone,
      name: bookingsTable.personName,
      visits: sql<number>`count(*)::int`,
      totalPersons: sql<number>`sum(${bookingsTable.guests})::int`,
      totalRevenue: sql<string>`sum(cast(${bookingsTable.finalPrice} as numeric))::text`,
    })
      .from(bookingsTable)
      .where(whereSQL)
      .groupBy(bookingsTable.phone, bookingsTable.personName)
      .orderBy(desc(sql`count(*)`)),
    db.select({
      totalPersons: sql<number>`coalesce(sum(${bookingsTable.guests}), 0)::int`,
      totalRevenue: sql<string>`coalesce(sum(cast(${bookingsTable.finalPrice} as numeric)), 0)::text`,
    }).from(bookingsTable).where(whereSQL),
  ]);

  const vendorIds = [...new Set(rows.map((r) => r.vendorId).filter((id): id is number => id != null))];
  const vendors = vendorIds.length
    ? await db.select({ id: vendorsTable.id, businessName: vendorsTable.businessName }).from(vendorsTable).where(inArray(vendorsTable.id, vendorIds))
    : [];
  const vMap = new Map(vendors.map((v) => [v.id, v.businessName]));

  const total = countRow[0]?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / MANUAL_REPORT_PAGE_SIZE));

  res.json({
    bookings: rows.map((b) => ({
      id: b.id,
      vendorId: b.vendorId,
      pubName: b.vendorId != null ? (vMap.get(b.vendorId) ?? "") : "",
      name: b.personName ?? "",
      phone: b.phone ?? "",
      email: b.notes ?? "",
      date: b.bookingDate,
      persons: b.guests,
      price: Number(b.finalPrice),
      arrivalTime: b.arrivalTime ?? "",
      checkedIn: b.checkedIn,
      checkedInAt: b.checkedInAt?.toISOString() ?? null,
      createdAt: b.createdAt.toISOString(),
    })),
    total,
    page: pageNum,
    totalPages,
    uniqueCustomers: phoneAgg.length,
    totalPersons: totals[0]?.totalPersons ?? 0,
    totalRevenue: Number(totals[0]?.totalRevenue ?? 0),
    customerDetails: phoneAgg.map((r) => ({
      phone: r.phone ?? "",
      name: r.name ?? "",
      visits: r.visits,
      totalPersons: r.totalPersons ?? 0,
      totalRevenue: Number(r.totalRevenue ?? 0),
    })),
  });
});

export default router;
