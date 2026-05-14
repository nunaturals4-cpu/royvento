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
  vendorRequestsTable,
  vendorManagersTable,
  wishlistsTable,
} from "@workspace/db";
import { computeCommissionFromPlanned, REALISED_COMMISSION_TRIGGERS } from "../lib/commission";
import { eq, desc, sql, inArray, isNotNull, isNull, and, gte, lte } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { createUserNotification } from "../lib/notify";
import { sendEventApprovedEmail } from "../lib/notifications";
import { generateTicketCode } from "../lib/ticketCode";
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

router.get("/admin/analytics", requireAuth(["admin"]), async (req, res) => {
  // Parse optional date range; defaults: last 12 months
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setFullYear(defaultStart.getFullYear() - 1);
  defaultStart.setDate(1);
  defaultStart.setHours(0, 0, 0, 0);

  const startDateStr = req.query["startDate"] as string | undefined;
  const endDateStr = req.query["endDate"] as string | undefined;
  const rangeStart: Date = startDateStr ? new Date(`${startDateStr}T00:00:00Z`) : defaultStart;
  const rangeEnd: Date = endDateStr ? new Date(`${endDateStr}T23:59:59Z`) : now;

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

  const paymentSplitRows = await db
    .select({
      paymentMethod: bookingsTable.paymentMethod,
      total: sql<string>`coalesce(sum(${bookingsTable.finalPrice}), 0)::text`,
    })
    .from(bookingsTable)
    .where(
      sql`${bookingsTable.status} IN ('confirmed', 'completed') AND ${bookingsTable.createdAt} >= ${rangeStart} AND ${bookingsTable.createdAt} <= ${rangeEnd}`,
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
    })
    .from(bookingsTable)
    .where(
      sql`${bookingsTable.status} IN ('confirmed', 'completed') AND ${bookingsTable.createdAt} >= ${rangeStart} AND ${bookingsTable.createdAt} <= ${rangeEnd}`,
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

  // Per-booking effective revenue: online → finalPrice; COD → actual cash collected at door
  // (₹0 if no actuals recorded yet — STRICT mode). Drives totalRevenue, monthlyRevenue,
  // dailyRevenue, perVendor.revenue, and topVendors. finalPrice is still kept for the
  // `codRevenue` and `onlineRevenue` breakdown fields above (booked-price view).
  let actualCodRevenue = 0;
  let actualCodRecordedCount = 0;
  let pendingActualsCount = 0;
  for (const b of confirmedBookings) {
    let bookingRevenue = 0;
    if (b.paymentMethod !== "cod") {
      bookingRevenue = Number(b.finalPrice);
    } else {
      const aw = b.actualWomen, am = b.actualMen, ac = b.actualCouple, ag = b.actualGuests;
      const hasActuals = aw != null || am != null || ac != null || ag != null;
      if (hasActuals) {
        actualCodRecordedCount++;
        if (b.pubMode === "ticket") {
          const ev = _codEventMap.get(b.eventId);
          const pw = Number(ev?.priceWomen ?? 0);
          const pm = Number(ev?.priceMen ?? 0);
          const pc = Number(ev?.priceCouple ?? 0);
          bookingRevenue = (aw ?? 0) * pw + (am ?? 0) * pm + (ac ?? 0) * pc;
        } else {
          const guests = Math.max(1, b.guests);
          bookingRevenue = ((ag ?? 0) / guests) * Number(b.finalPrice);
        }
        actualCodRevenue += bookingRevenue;
      } else {
        pendingActualsCount++;
      }
    }
    // Attach revenue directly to booking object for downstream loops
    (b as unknown as { _rev: number })._rev = bookingRevenue;
  }
  const totalRevenue = confirmedBookings.reduce((s, b) => s + ((b as unknown as { _rev: number })._rev ?? 0), 0);

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
    dailyMap.set(dCursor.toISOString().slice(0, 10), 0);
    dCursor.setTime(dCursor.getTime() + dayMs);
  }
  const perVendorMap = new Map<number, {
    vendorId: number; bookingCount: number;
    ticketWomen: number; ticketMen: number; ticketCouple: number; revenue: number;
  }>();
  for (const b of confirmedBookings) {
    totalWomen += b.ticketWomen;
    totalMen += b.ticketMen;
    totalCouple += b.ticketCouple;
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
    const day = new Date(b.createdAt).toISOString().slice(0, 10);
    if (new Date(b.createdAt) >= dailyStart && dailyMap.has(day)) {
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + rev);
    }
    const pv = perVendorMap.get(b.vendorId);
    if (pv) {
      pv.bookingCount += 1;
      pv.ticketWomen += b.ticketWomen;
      pv.ticketMen += b.ticketMen;
      pv.ticketCouple += b.ticketCouple;
      pv.revenue += rev;
    } else {
      perVendorMap.set(b.vendorId, {
        vendorId: b.vendorId,
        bookingCount: 1,
        ticketWomen: b.ticketWomen,
        ticketMen: b.ticketMen,
        ticketCouple: b.ticketCouple,
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

  // "Total Commission" KPI = "Commission Collected" in the commission report.
  // Sum of planned commission (current rate card) for every confirmed/completed
  // booking in the window that has been realised — i.e. has a row in
  // commission_ledger with a REALISED trigger (online_payment / cod_checkin /
  // free_checkin). The ledger's UNIQUE (booking_id, trigger) constraint
  // guarantees one realisation per trigger so duplicate aggregation is
  // structurally impossible. Amounts come from the deterministic calc, not the
  // ledger amount, so historical buggy ledger values never leak into the KPI.
  const vendorCommissionRows = await db.select().from(vendorCommissionsTable);
  const vendorCommissionMap = new Map(vendorCommissionRows.map((r) => [r.vendorId, r]));

  const analyticsEventIds = Array.from(new Set(confirmedBookings.map((b) => b.eventId)));
  const analyticsEventRows = analyticsEventIds.length > 0
    ? await db
        .select({ id: eventsTable.id, freeEntryRules: eventsTable.freeEntryRules })
        .from(eventsTable)
        .where(inArray(eventsTable.id, analyticsEventIds))
    : [];
  const analyticsFerMap = new Map(
    analyticsEventRows.map((e) => [
      e.id,
      e.freeEntryRules as { enabled?: boolean; days?: string[]; genders?: string[] } | null,
    ]),
  );

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

  let totalCommission = 0;
  for (const b of confirmedBookings) {
    if (!realisedBookingIds.has(b.id)) continue;
    const rates = vendorCommissionMap.get(b.vendorId) ?? { freeEntryRate: 0, ticketRate: 0, tableBookingRate: 0 };
    const comm = computeCommissionFromPlanned(b, rates, analyticsFerMap.get(b.eventId) ?? null);
    totalCommission += comm.amount;
  }
  totalCommission = Math.round(totalCommission * 100) / 100;

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
    return {
      id: b.id,
      eventId: b.eventId,
      userId: b.userId,
      vendorId: b.vendorId,
      bookingDate: b.bookingDate,
      guests: b.guests,
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
    totalRevenue: Math.round(totalRevenue),
    // Not Math.round'd: commission-report sums per-booking round2'd amounts
    // without additional integer rounding. We mirror that policy so the
    // two endpoints agree to the rupee.
    totalCommission,
    codRevenue,
    actualCodRevenue: Math.round(actualCodRevenue),
    actualCodRecordedCount,
    pendingActualsCount,
    onlineRevenue,
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
      popular: e.popular,
      popularSince: e.popularSince ? e.popularSince.toISOString() : null,
      approvalStatus: e.approvalStatus,
      retainForever: e.retainForever,
      partnerName: vMap.get(e.vendorId)?.businessName ?? "",
      createdAt: e.createdAt.toISOString(),
    })),
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
  if (data.retainForever !== undefined) updates["retainForever"] = data.retainForever;
  if (data.approvalStatus !== undefined) {
    updates["approvalStatus"] = data.approvalStatus;
    updates["rejectionReason"] = typeof data.rejectionReason === "string"
      ? data.rejectionReason
      : null;
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
  await db.delete(eventsTable).where(eq(eventsTable.id, id));
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

  const userIds = rows.map((v) => v.userId);
  const users = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(sql`${usersTable.id} IN (${sql.join(userIds, sql`, `)})`);
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
    danceFloor, danceFloorPhotos, menuUrl, menuUrls,
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
  if (danceFloor !== undefined || (danceFloorPhotos && danceFloorPhotos.length > 0) || menus.length > 0) {
    const vendorUpdates: Record<string, unknown> = {};
    if (danceFloor !== undefined) vendorUpdates["danceFloor"] = danceFloor || null;
    if (danceFloorPhotos && danceFloorPhotos.length > 0) {
      vendorUpdates["danceFloorPhotos"] = danceFloorPhotos;
    }
    if (menus.length > 0) {
      vendorUpdates["menuUrl"] = menus[0];
      vendorUpdates["menuUrls"] = menus;
    }
    await db.update(vendorsTable).set(vendorUpdates).where(eq(vendorsTable.id, vendor.id));
  }

  res.json({ ok: true, pubId: created.id, vendorId: vendor.id, partnerName: vendor.businessName });
});

router.delete("/admin/vendors/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [target] = await db
    .select({ userId: vendorsTable.userId })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, id))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Manually delete every child row that does NOT cascade from `vendors`.
  // Wrapped in db.transaction; do NOT use DO $$ ... END $$ — PostgreSQL
  // rejects bind parameters inside DO blocks ("bind message supplies N
  // parameters, but prepared statement requires 0").
  // - `bookings.event_id` is `ON DELETE RESTRICT`, so deleting `events` while
  //   bookings exist FK-errors out (this was the original 500 root cause).
  // - `events.vendor_id`, `bookings.vendor_id`, and several other vendor-
  //   scoped tables have no FK to `vendors` at all (just an integer column),
  //   so the cascade chain skips them entirely.
  // Order matters: leaf rows first, then events, then vendors.
  //
  // We run individual DELETEs rather than a single `DO $$ ... END $$;` block
  // because PostgreSQL does NOT support bind parameters inside DO blocks
  // ("bind message supplies N parameters, but prepared statement requires 0").
  try {
    await db.transaction(async (tx) => {
      const evRows = await tx.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.vendorId, id));
      const eventIds = evRows.map((r) => r.id);

      await tx.execute(sql`DELETE FROM commission_ledger WHERE vendor_id = ${id}`);
      await tx.execute(sql`DELETE FROM bookings WHERE vendor_id = ${id}`);
      await tx.execute(sql`DELETE FROM reviews WHERE vendor_id = ${id}`);
      // Drizzle's typed delete + inArray produces `IN ($1, $2, ...)` which
      // PostgreSQL accepts — `ANY((1,2,3))` (a row, not an array) does NOT
      // work and was the cause of "Failed query: DELETE FROM wishlists".
      if (eventIds.length > 0) {
        await tx.delete(wishlistsTable).where(inArray(wishlistsTable.eventId, eventIds));
      }
      await tx.execute(sql`DELETE FROM announcements WHERE vendor_id = ${id}`);
      await tx.execute(sql`DELETE FROM events WHERE vendor_id = ${id}`);
      await tx.execute(sql`DELETE FROM partner_media WHERE vendor_id = ${id}`);
      await tx.execute(sql`DELETE FROM partner_blocked_dates WHERE vendor_id = ${id}`);
      await tx.execute(sql`DELETE FROM ads_requests WHERE vendor_id = ${id}`);
      await tx.execute(sql`DELETE FROM profile_views WHERE vendor_id = ${id}`);
      await tx.execute(sql`DELETE FROM coupons WHERE vendor_id = ${id}`);
      await tx.execute(sql`DELETE FROM vendor_managers WHERE vendor_id = ${id}`);
      await tx.execute(sql`DELETE FROM availability WHERE vendor_id = ${id}`);
      await tx.execute(sql`DELETE FROM review_deletions WHERE vendor_id = ${id}`);
      await tx.execute(sql`DELETE FROM vendor_commissions WHERE vendor_id = ${id}`);
      await tx.execute(sql`DELETE FROM vendors WHERE id = ${id}`);
    });
  } catch (err) {
    req.log.error({ err, vendorId: id }, "Failed to delete vendor");
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Failed to delete vendor: ${errMsg}` });
    return;
  }
  // Revoke partner access and wipe prior applications so the user is locked
  // out of the partner dashboard and the become-vendor form treats them as a
  // fresh applicant.
  await db
    .update(usersTable)
    .set({ role: "user" })
    .where(and(eq(usersTable.id, target.userId), eq(usersTable.role, "vendor")));
  await db
    .delete(vendorRequestsTable)
    .where(eq(vendorRequestsTable.userId, target.userId));
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
  const eventIds = [...new Set(rows.map((r) => r.eventId))];
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const vendorIds = [...new Set(rows.map((r) => r.vendorId))];
  const bookingIds = rows.map((r) => r.id);
  const [events, users, vendors, payments] = await Promise.all([
    db.select().from(eventsTable).where(inArray(eventsTable.id, eventIds)),
    db.select().from(usersTable).where(inArray(usersTable.id, userIds)),
    db.select().from(vendorsTable).where(inArray(vendorsTable.id, vendorIds)),
    db.select({ bookingId: paymentsTable.bookingId, phonepeTransactionId: paymentsTable.phonepeTransactionId, status: paymentsTable.status })
      .from(paymentsTable)
      .where(inArray(paymentsTable.bookingId, bookingIds)),
  ]);
  const eMap = new Map(events.map((e) => [e.id, e]));
  const uMap = new Map(users.map((u) => [u.id, u]));
  const vMap = new Map(vendors.map((v) => [v.id, v]));
  const payMap = new Map(payments.filter((p) => p.bookingId != null).map((p) => [p.bookingId!, p]));
  return rows.map((b) => {
    const e = eMap.get(b.eventId);
    const u = uMap.get(b.userId);
    const v = vMap.get(b.vendorId);
    const pay = payMap.get(b.id);
    const ticketCode = v
      ? (v.ticketPrefix && v.ticketSalt
          ? generateTicketCode(b.id, { ticketPrefix: v.ticketPrefix, ticketSalt: v.ticketSalt })
          : `RV-${String(b.id).padStart(6, "0")}`)
      : `RV-${String(b.id).padStart(6, "0")}`;
    let paymentMethod: string;
    if (pay) {
      paymentMethod = pay.phonepeTransactionId ? "PhonePe" : "Online";
    } else {
      paymentMethod = Number(b.finalPrice) === 0 ? "Free" : "COD";
    }
    return {
      id: b.id,
      vendorId: b.vendorId,
      vendorName: v?.businessName ?? "",
      eventId: b.eventId,
      eventTitle: e?.title ?? "",
      userId: b.userId,
      userName: u?.name ?? "",
      userEmail: u?.email ?? "",
      bookingDate: b.bookingDate,
      guests: b.guests,
      pubMode: b.pubMode,
      ticketWomen: b.ticketWomen,
      ticketMen: b.ticketMen,
      ticketCouple: b.ticketCouple,
      totalPrice: Number(b.totalPrice),
      discountAmount: Number(b.discountAmount),
      finalPrice: Number(b.finalPrice),
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

  const conditions: ReturnType<typeof sql>[] = [];
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
      .where(sql`lower(${usersTable.name}) LIKE ${likeStr} OR lower(${usersTable.email}) LIKE ${likeStr}`);
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
      revenue: sql<string>`coalesce(sum(case when ${bookingsTable.status} IN ('confirmed','completed') then ${bookingsTable.finalPrice} else 0 end), 0)::text`,
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
    phone: phoneMap.get(b.userId) ?? "",
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
        return Math.round(((aw ?? 0) * pw + (am ?? 0) * pm + (ac ?? 0) * pc) * 100) / 100;
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
  if (startDateStr) conditions.push(gte(profileViewsTable.viewedAt, new Date(`${startDateStr}T00:00:00Z`)));
  if (endDateStr) conditions.push(lte(profileViewsTable.viewedAt, new Date(`${endDateStr}T23:59:59Z`)));

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

  // Conversion: fetch ALL confirmed/completed booking timestamps per (userId, vendorId).
  // A view converts if ANY booking for that (userId, vendorId) was created AFTER this specific view.
  // Using all timestamps (not just MIN) correctly handles repeat-booking users who had an
  // earlier booking before the view and a later booking after.
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
  if (startDateStr) dateConditions.push(gte(profileViewsTable.viewedAt, new Date(`${startDateStr}T00:00:00Z`)));
  if (endDateStr) dateConditions.push(lte(profileViewsTable.viewedAt, new Date(`${endDateStr}T23:59:59Z`)));
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

  // Fetch ALL confirmed/completed booking timestamps per (userId, vendorId) — same approach as
  // /admin/leads: a view converts if ANY booking was created AFTER this specific view,
  // correctly handling users who had an earlier booking before the view.
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
  const conds: ReturnType<typeof sql>[] = [
    sql`${bookingsTable.status} IN ('confirmed', 'completed')`,
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
    res.json({ vendorId, freeEntryRate: "0", ticketRate: "0", tableBookingRate: "0" });
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
  const { freeEntryRate, ticketRate, tableBookingRate } = parsed.data;
  const [upserted] = await db
    .insert(vendorCommissionsTable)
    .values({
      vendorId,
      freeEntryRate: freeEntryRate.toFixed(2),
      ticketRate: ticketRate.toFixed(2),
      tableBookingRate: tableBookingRate.toFixed(2),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: vendorCommissionsTable.vendorId,
      set: {
        freeEntryRate: freeEntryRate.toFixed(2),
        ticketRate: ticketRate.toFixed(2),
        tableBookingRate: tableBookingRate.toFixed(2),
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
  const from = fromStr ? new Date(`${fromStr}T00:00:00Z`) : defaultStart;
  const to = toStr ? new Date(`${toStr}T23:59:59Z`) : now;

  const whereConditions = [
    sql`${bookingsTable.status} IN ('confirmed', 'completed')`,
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
        pubMode: bookingsTable.pubMode,
        guests: bookingsTable.guests,
        ticketWomen: bookingsTable.ticketWomen,
        ticketMen: bookingsTable.ticketMen,
        ticketCouple: bookingsTable.ticketCouple,
        createdAt: bookingsTable.createdAt,
        status: bookingsTable.status,
      })
      .from(bookingsTable)
      .where(and(...whereConditions)),
    db.select().from(vendorCommissionsTable),
    db
      .select({ id: vendorsTable.id, businessName: vendorsTable.businessName, city: vendorsTable.city })
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
        .select({ id: eventsTable.id, freeEntryRules: eventsTable.freeEntryRules })
        .from(eventsTable)
        .where(inArray(eventsTable.id, reportEventIds))
    : [];
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

  type BookingLineItem = {
    id: number;
    finalPrice: number;
    bookingType: "free_entry" | "ticket" | "table";
    commissionRate: number;
    unitCount: number;
    commissionAmount: number;
    /** True when this booking has a real commission_ledger entry (i.e. money
     * has actually moved or been recorded). False = the report's computed
     * commission is theoretical / pending realisation. */
    collected: boolean;
    createdAt: Date;
  };

  type VendorSummary = {
    vendorId: number;
    businessName: string;
    city: string;
    appliedRates: { freeEntryRate: string; ticketRate: string; tableBookingRate: string };
    totalBookings: number;
    totalRevenue: number;
    totalCommission: number;
    /** Sum of commission_ledger amounts for this vendor in the report window
     * (online_payment + cod_checkin + free_checkin). Source of truth for
     * "money realised by the platform". */
    collectedCommission: number;
    /** Sum of computed commission for bookings in the report window that have
     * NO ledger entry yet (i.e. eligible but not yet triggered — a COD booking
     * that hasn't been checked in, or an online booking still pending payment).
     * Computed per-booking, not as totalCommission − collectedCommission, so
     * actuals diverging from planned counts can't distort the figure. */
    pendingCommission: number;
    freeEntryCount: number;
    freeEntryRevenue: number;
    freeEntryCommission: number;
    freeEntryPeople: number;
    ticketCount: number;
    ticketRevenue: number;
    ticketCommission: number;
    ticketPeople: number;
    tableCount: number;
    tableRevenue: number;
    tableCommission: number;
    tablePeople: number;
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
      },
      totalBookings: 0,
      totalRevenue: 0,
      totalCommission: 0,
      collectedCommission: 0,
      pendingCommission: 0,
      freeEntryCount: 0,
      freeEntryRevenue: 0,
      freeEntryCommission: 0,
      freeEntryPeople: 0,
      ticketCount: 0,
      ticketRevenue: 0,
      ticketCommission: 0,
      ticketPeople: 0,
      tableCount: 0,
      tableRevenue: 0,
      tableCommission: 0,
      tablePeople: 0,
      bookings: [],
    });
  }

  for (const b of bookings) {
    const price = Number(b.finalPrice);
    const rates = commissionMap.get(b.vendorId);
    // Use the shared helper so this report always agrees with the live
    // online-payment + COD/free check-in flows.
    const comm = computeCommissionFromPlanned(
      b,
      rates ?? { freeEntryRate: 0, ticketRate: 0, tableBookingRate: 0 },
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
    s.totalBookings += 1;
    s.totalRevenue += price;
    s.totalCommission += commissionAmount;
    s.bookings.push({
      id: b.id,
      finalPrice: price,
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
    } else if (bookingType === "ticket") {
      s.ticketCount += 1;
      s.ticketRevenue += price;
      s.ticketCommission += commissionAmount;
      s.ticketPeople += unitCount;
    } else {
      s.tableCount += 1;
      s.tableRevenue += price;
      s.tableCommission += commissionAmount;
      s.tablePeople += unitCount;
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
      acc.collectedCommission += r.collectedCommission;
      acc.pendingCommission += r.pendingCommission;
      return acc;
    },
    { totalBookings: 0, totalRevenue: 0, totalCommission: 0, collectedCommission: 0, pendingCommission: 0 },
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

export default router;
