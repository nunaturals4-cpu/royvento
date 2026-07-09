import { db, vendorOffersTable } from "@workspace/db";
import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";
import { notifyVenueFollowers } from "../lib/venueFollowNotify";
import { logger } from "../lib/logger";

// ── Chronological publisher for Food & Drink Discount notifications ───────────
// Requirement 2: announce food & drink offers in the order they were created
// (OLDEST unpublished first), one at a time — never all at once. The actual
// "one notification, then the next after 30 minutes" pacing is enforced per user
// by the shared notification queue's 30-min spacing; this job's job is to (a)
// feed offers into that queue in chronological order and (b) stamp each offer
// `notified_at` so it is published exactly once (dedup is also guaranteed by the
// queue's per-(user,offer) unique key).
//
// Runs every few minutes. Expired offers are never published (filtered out); an
// unpublished offer that has already expired is stamped so it stops being
// rescanned.

export async function runFoodDrinkNotifier(): Promise<void> {
  try {
    // Retire unpublished offers that expired before we ever announced them, so
    // the "oldest unpublished" scan doesn't keep tripping over them and we never
    // notify about an expired offer.
    await db
      .update(vendorOffersTable)
      .set({ notifiedAt: new Date() })
      .where(and(
        isNull(vendorOffersTable.notifiedAt),
        lt(vendorOffersTable.endsAt, new Date()),
      ));

    // Oldest unpublished, currently-active offers first.
    const offers = await db
      .select({ id: vendorOffersTable.id, vendorId: vendorOffersTable.vendorId, category: vendorOffersTable.category })
      .from(vendorOffersTable)
      .where(and(
        isNull(vendorOffersTable.notifiedAt),
        eq(vendorOffersTable.active, true),
        sql`(${vendorOffersTable.startsAt} IS NULL OR ${vendorOffersTable.startsAt} <= now())`,
        sql`(${vendorOffersTable.endsAt} IS NULL OR ${vendorOffersTable.endsAt} >= now())`,
      ))
      .orderBy(asc(vendorOffersTable.createdAt))
      .limit(100);

    if (offers.length === 0) return;

    let published = 0;
    // Sequential so the per-user 30-min spacing chains in creation order (each
    // enqueue reads the previous offer's just-scheduled slot for a shared user).
    for (const o of offers) {
      // Food & drink discount categories share the "food_drink" copy; the
      // "exclusive" category gets its own "exclusive deal" notification.
      const kind = o.category === "exclusive" ? "exclusive" : "food_drink";
      await notifyVenueFollowers(o.vendorId, kind, o.id);
      await db
        .update(vendorOffersTable)
        .set({ notifiedAt: new Date() })
        .where(eq(vendorOffersTable.id, o.id));
      published += 1;
    }

    logger.info({ published }, "[foodDrinkNotifier] Published food & drink offer notifications");
  } catch (err) {
    logger.error({ err }, "[foodDrinkNotifier] Job failed");
  }
}
