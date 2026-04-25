import { db, reviewsTable } from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";

export interface RatingSummary {
  rating: number;
  reviewCount: number;
}

export async function getVendorRatings(
  vendorIds: number[],
): Promise<Map<number, RatingSummary>> {
  const map = new Map<number, RatingSummary>();
  if (vendorIds.length === 0) return map;
  const rows = await db
    .select({
      vendorId: reviewsTable.vendorId,
      avg: sql<string>`avg(${reviewsTable.rating})::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(reviewsTable)
    .where(inArray(reviewsTable.vendorId, vendorIds))
    .groupBy(reviewsTable.vendorId);
  for (const r of rows) {
    map.set(r.vendorId, {
      rating: r.avg ? Number(r.avg) : 0,
      reviewCount: r.count ?? 0,
    });
  }
  for (const id of vendorIds) {
    if (!map.has(id)) map.set(id, { rating: 0, reviewCount: 0 });
  }
  return map;
}

export async function getEventRatings(
  eventIds: number[],
): Promise<Map<number, RatingSummary>> {
  const map = new Map<number, RatingSummary>();
  if (eventIds.length === 0) return map;
  const rows = await db
    .select({
      eventId: reviewsTable.eventId,
      avg: sql<string>`avg(${reviewsTable.rating})::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(reviewsTable)
    .where(inArray(reviewsTable.eventId, eventIds))
    .groupBy(reviewsTable.eventId);
  for (const r of rows) {
    if (r.eventId == null) continue;
    map.set(r.eventId, {
      rating: r.avg ? Number(r.avg) : 0,
      reviewCount: r.count ?? 0,
    });
  }
  for (const id of eventIds) {
    if (!map.has(id)) map.set(id, { rating: 0, reviewCount: 0 });
  }
  return map;
}

export async function getVendorRating(
  vendorId: number,
): Promise<RatingSummary> {
  const rows = await db
    .select({
      avg: sql<string>`avg(${reviewsTable.rating})::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(reviewsTable)
    .where(eq(reviewsTable.vendorId, vendorId));
  const r = rows[0];
  return {
    rating: r && r.avg ? Number(r.avg) : 0,
    reviewCount: r?.count ?? 0,
  };
}
