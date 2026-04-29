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
} from "@workspace/db";
import { eq, desc, sql, inArray, isNotNull, isNull, and, gte, lte } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { generateTicketCode } from "../lib/ticketCode";

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

  const revenueRow = await db
    .select({
      total: sql<string>`coalesce(sum(${bookingsTable.finalPrice}), 0)::text`,
    })
    .from(bookingsTable)
    .where(
      sql`${bookingsTable.status} IN ('confirmed', 'completed') AND ${bookingsTable.createdAt} >= ${rangeStart} AND ${bookingsTable.createdAt} <= ${rangeEnd}`,
    );

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

  const top = await db
    .select({
      vendorId: bookingsTable.vendorId,
      bookingCount: sql<number>`count(*)::int`,
      revenue: sql<string>`coalesce(sum(${bookingsTable.finalPrice}), 0)::text`,
    })
    .from(bookingsTable)
    .where(
      sql`${bookingsTable.status} IN ('confirmed', 'completed') AND ${bookingsTable.createdAt} >= ${rangeStart} AND ${bookingsTable.createdAt} <= ${rangeEnd}`,
    )
    .groupBy(bookingsTable.vendorId)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  const vendorRows =
    top.length > 0
      ? await db
          .select()
          .from(vendorsTable)
          .where(
            sql`${vendorsTable.id} IN (${sql.join(
              top.map((t) => t.vendorId),
              sql`, `,
            )})`,
          )
      : [];
  const vMap = new Map(vendorRows.map((v) => [v.id, v]));

  // Ticket breakdown + daily revenue + per-vendor breakdown (all filtered by date range)
  const confirmedBookings = await db
    .select({
      vendorId: bookingsTable.vendorId,
      finalPrice: bookingsTable.finalPrice,
      ticketWomen: bookingsTable.ticketWomen,
      ticketMen: bookingsTable.ticketMen,
      ticketCouple: bookingsTable.ticketCouple,
      createdAt: bookingsTable.createdAt,
    })
    .from(bookingsTable)
    .where(
      sql`${bookingsTable.status} IN ('confirmed', 'completed') AND ${bookingsTable.createdAt} >= ${rangeStart} AND ${bookingsTable.createdAt} <= ${rangeEnd}`,
    );

  // Monthly revenue aggregation via SQL
  const monthlyRevenueRows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${bookingsTable.createdAt}), 'YYYY-MM')`,
      revenue: sql<string>`coalesce(sum(${bookingsTable.finalPrice}), 0)::text`,
    })
    .from(bookingsTable)
    .where(
      sql`${bookingsTable.status} IN ('confirmed', 'completed') AND ${bookingsTable.createdAt} >= ${rangeStart} AND ${bookingsTable.createdAt} <= ${rangeEnd}`,
    )
    .groupBy(sql`date_trunc('month', ${bookingsTable.createdAt})`)
    .orderBy(sql`date_trunc('month', ${bookingsTable.createdAt})`);
  // Build full continuous monthly buckets for the range (zero-fill missing months)
  const monthlyMap = new Map<string, number>();
  const mCursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const mEnd = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);
  while (mCursor <= mEnd) {
    const key = `${mCursor.getFullYear()}-${String(mCursor.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, 0);
    mCursor.setMonth(mCursor.getMonth() + 1);
  }
  for (const r of monthlyRevenueRows) {
    monthlyMap.set(r.month, Number(r.revenue));
  }
  const monthlyRevenue = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue }));

  let totalWomen = 0;
  let totalMen = 0;
  let totalCouple = 0;
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
    const day = new Date(b.createdAt).toISOString().slice(0, 10);
    if (new Date(b.createdAt) >= dailyStart && dailyMap.has(day)) {
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + Number(b.finalPrice));
    }
    const pv = perVendorMap.get(b.vendorId);
    if (pv) {
      pv.bookingCount += 1;
      pv.ticketWomen += b.ticketWomen;
      pv.ticketMen += b.ticketMen;
      pv.ticketCouple += b.ticketCouple;
      pv.revenue += Number(b.finalPrice);
    } else {
      perVendorMap.set(b.vendorId, {
        vendorId: b.vendorId,
        bookingCount: 1,
        ticketWomen: b.ticketWomen,
        ticketMen: b.ticketMen,
        ticketCouple: b.ticketCouple,
        revenue: Number(b.finalPrice),
      });
    }
  }
  const adminDailyRevenue = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue }));

  const allVendors = await db.select().from(vendorsTable);
  const allVMap = new Map(allVendors.map((v) => [v.id, v]));
  const perVendor = Array.from(perVendorMap.values())
    .map((pv) => ({ ...pv, vendorName: allVMap.get(pv.vendorId)?.businessName ?? `Partner #${pv.vendorId}` }))
    .sort((a, b) => b.revenue - a.revenue);

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
      notes: b.notes,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
      eventTitle: e?.title ?? "",
      eventImage: e?.imageUrl ?? "",
      vendorName: v?.businessName ?? "",
      userName: u?.name ?? "",
      userEmail: u?.email ?? "",
    };
  });

  res.json({
    totalUsers: usersCount[0]?.c ?? 0,
    totalVendors: vendorsCount[0]?.c ?? 0,
    pendingVendors: pendingCount[0]?.c ?? 0,
    totalEvents: eventsCount[0]?.c ?? 0,
    totalBookings: bookingsCount[0]?.c ?? 0,
    totalRevenue: Number(revenueRow[0]?.total ?? 0),
    bookingsByStatus: statusCounts.map((s) => ({
      status: s.status,
      count: s.count,
    })),
    recentBookings,
    topVendors: top.map((t) => ({
      vendorId: t.vendorId,
      businessName: vMap.get(t.vendorId)?.businessName ?? "Partner",
      bookingCount: t.bookingCount,
      revenue: Number(t.revenue),
    })),
    totalWomen,
    totalMen,
    totalCouple,
    dailyRevenue: adminDailyRevenue,
    monthlyRevenue,
    perVendor,
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
      approvalStatus: e.approvalStatus,
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
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if (typeof body["popular"] === "boolean") updates["popular"] = body["popular"];
  if (typeof body["featured"] === "boolean") updates["featured"] = body["featured"];
  if (typeof body["approvalStatus"] === "string") {
    const status = body["approvalStatus"];
    if (!["approved", "rejected", "pending"].includes(status)) {
      res.status(400).json({ error: "Invalid approvalStatus" });
      return;
    }
    updates["approvalStatus"] = status;
    updates["rejectionReason"] = typeof body["rejectionReason"] === "string"
      ? body["rejectionReason"]
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

router.get("/admin/vendors", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(vendorsTable)
    .orderBy(desc(vendorsTable.createdAt));

  if (rows.length === 0) {
    res.json([]);
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

  res.json(
    rows.map((v) => ({
      id: v.id,
      userId: v.userId,
      businessName: v.businessName,
      category: v.category,
      description: v.description,
      location: v.location,
      city: v.city,
      state: v.state,
      bannerImage: v.bannerImage,
      status: v.status,
      eventCount: eCountMap.get(v.id) ?? 0,
      userEmail: uMap.get(v.userId) ?? "",
      createdAt: v.createdAt.toISOString(),
    })),
  );
});

router.patch("/admin/vendors/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if (typeof body["businessName"] === "string" && body["businessName"].trim())
    updates["businessName"] = body["businessName"].trim();
  if (typeof body["description"] === "string")
    updates["description"] = body["description"];
  if (typeof body["category"] === "string" && body["category"].trim())
    updates["category"] = body["category"].trim();
  if (
    typeof body["status"] === "string" &&
    ["approved", "pending", "rejected"].includes(body["status"])
  )
    updates["status"] = body["status"];
  if (typeof body["city"] === "string") updates["city"] = body["city"];
  if (typeof body["state"] === "string") updates["state"] = body["state"];

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

router.delete("/admin/vendors/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(eventsTable).where(eq(eventsTable.vendorId, id));
  await db.delete(vendorsTable).where(eq(vendorsTable.id, id));
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
      ? generateTicketCode(b.id, { ticketPrefix: v.ticketPrefix ?? "", ticketSalt: v.ticketSalt ?? "" })
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

  if (searchParam) {
    const likeStr = `%${searchParam}%`;
    const matchingUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(sql`lower(${usersTable.name}) LIKE ${likeStr} OR lower(${usersTable.email}) LIKE ${likeStr}`);
    if (matchingUsers.length === 0) {
      res.json({ bookings: [], total: 0, page: pageNum, totalPages: 0 });
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

const VALID_COUPON_TYPES = ["general", "event", "loyalty", "referral", "vip"] as const;
type CouponType = (typeof VALID_COUPON_TYPES)[number];

router.post("/admin/users/:userId/send-coupon", requireAuth(["admin"]), async (req, res) => {
  const userId = Number(req.params["userId"]);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const code = typeof body["code"] === "string" ? body["code"].trim().toUpperCase() : "";
  const discount = typeof body["discount"] === "number" ? body["discount"] : Number(body["discount"]);
  const typeRaw = typeof body["type"] === "string" ? body["type"] : "general";
  const couponType: CouponType = VALID_COUPON_TYPES.includes(typeRaw as CouponType)
    ? (typeRaw as CouponType)
    : "general";

  if (!code || !Number.isFinite(discount) || discount < 1 || discount > 100) {
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
