import { Router, type IRouter } from "express";
import {
  db,
  bookingsTable,
  eventsTable,
  vendorsTable,
  usersTable,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/admin/analytics", requireAuth(["admin"]), async (_req, res) => {
  const [usersCount, vendorsCount, pendingCount, eventsCount, bookingsCount] =
    await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(usersTable),
      db.select({ c: sql<number>`count(*)::int` }).from(vendorsTable),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(vendorsTable)
        .where(eq(vendorsTable.status, "pending")),
      db.select({ c: sql<number>`count(*)::int` }).from(eventsTable),
      db.select({ c: sql<number>`count(*)::int` }).from(bookingsTable),
    ]);

  const revenueRow = await db
    .select({
      total: sql<string>`coalesce(sum(${bookingsTable.totalPrice}), 0)::text`,
    })
    .from(bookingsTable)
    .where(
      sql`${bookingsTable.status} IN ('confirmed', 'completed')`,
    );

  const statusCounts = await db
    .select({
      status: bookingsTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(bookingsTable)
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
      revenue: sql<string>`coalesce(sum(${bookingsTable.totalPrice}), 0)::text`,
    })
    .from(bookingsTable)
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
      businessName: vMap.get(t.vendorId)?.businessName ?? "Vendor",
      bookingCount: t.bookingCount,
      revenue: Number(t.revenue),
    })),
  });
});

export default router;
