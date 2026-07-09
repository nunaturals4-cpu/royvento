import { db, drinkPlansTable, vendorOffersTable } from "@workspace/db";
import { and, eq, lt, sql } from "drizzle-orm";
import {
  notifyVenueFollowersDailyReminder,
  drinkPlanKind,
  type VenueUpdateKind,
} from "../lib/venueFollowNotify";
import { logger } from "../lib/logger";

// ── Daily "your followed venue's offer is still on" reminder ──────────────────
// Runs once each evening (6 PM IST). For every venue that STILL has a live,
// non-expired offer, it re-notifies that venue's followers — until the offer is
// deleted or expires (both drop out of the queries below). Guarantees:
//   • One reminder per venue per day (dedup in notifyVenueFollowersDailyReminder)
//     → never multiple offers of the same venue at once.
//   • Per-user 30-min spacing (the shared queue) → different followed venues'
//     reminders are staggered, never fired all at once ("adjust time").
//   • Fresh wording daily (day-seeded copy) → no "I saw this yesterday" feeling.
//   • Never for expired/deleted offers (filtered out) and never on the offer's
//     creation day (it already got its instant "new offer" ping).

const IST_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function getTodayIST(): string {
  return IST_DATE.format(new Date());
}
function getTodayStartUTC(): Date {
  return new Date(`${getTodayIST()}T00:00:00+05:30`);
}
// Day-of-year in IST — advances by 1 each day, so day-seeded copy differs daily.
function dayOfYearIST(): number {
  const [y, m, d] = getTodayIST().split("-").map(Number);
  return Math.floor((Date.UTC(y!, m! - 1, d!) - Date.UTC(y!, 0, 0)) / 86_400_000);
}

// When a venue has several kinds of active offer, pick the most notable one to
// flavour the reminder (copy + deep-link section + queue priority).
const KIND_RANK: Record<VenueUpdateKind, number> = {
  cover_charge: 3,
  ticket: 2,
  free_drinks: 2,
  exclusive: 2,
  food_drink: 1,
};

export async function runDailyOfferReminders(): Promise<void> {
  try {
    const today = getTodayIST();
    const daySeed = dayOfYearIST();
    const todayStart = getTodayStartUTC();

    // Active drink plans: inside their valid-date window today, created before
    // today (an offer created today already got its instant "new offer" ping).
    const plans = await db
      .select({ vendorId: drinkPlansTable.vendorId, type: drinkPlansTable.type })
      .from(drinkPlansTable)
      .where(and(
        sql`(${drinkPlansTable.validFrom} IS NULL OR ${drinkPlansTable.validFrom} <= ${today})`,
        sql`(${drinkPlansTable.validUntil} IS NULL OR ${drinkPlansTable.validUntil} >= ${today})`,
        lt(drinkPlansTable.createdAt, todayStart),
      ));

    // Active food & drink offers: active flag on, inside their start/end window,
    // created before today.
    const offers = await db
      .select({ vendorId: vendorOffersTable.vendorId, category: vendorOffersTable.category })
      .from(vendorOffersTable)
      .where(and(
        eq(vendorOffersTable.active, true),
        sql`(${vendorOffersTable.startsAt} IS NULL OR ${vendorOffersTable.startsAt} <= now())`,
        sql`(${vendorOffersTable.endsAt} IS NULL OR ${vendorOffersTable.endsAt} >= now())`,
        lt(vendorOffersTable.createdAt, todayStart),
      ));

    // Collapse to one representative kind per venue.
    const bestKind = new Map<number, VenueUpdateKind>();
    const consider = (vendorId: number, kind: VenueUpdateKind) => {
      const cur = bestKind.get(vendorId);
      if (!cur || KIND_RANK[kind] > KIND_RANK[cur]) bestKind.set(vendorId, kind);
    };
    for (const p of plans) consider(p.vendorId, drinkPlanKind(p.type));
    for (const o of offers) consider(o.vendorId, o.category === "exclusive" ? "exclusive" : "food_drink");

    if (bestKind.size === 0) {
      logger.info("[dailyOfferReminders] No active offers to remind about — skipping");
      return;
    }

    // Sequentially so the per-user 30-min spacing chains correctly: each venue's
    // enqueue reads the previous one's just-scheduled slot for a shared follower.
    let notified = 0;
    let followersTotal = 0;
    for (const [vendorId, kind] of bestKind) {
      const n = await notifyVenueFollowersDailyReminder(vendorId, kind, daySeed, today);
      if (n > 0) {
        notified += 1;
        followersTotal += n;
      }
    }

    logger.info(
      { venuesWithOffers: bestKind.size, venuesNotified: notified, followerNotifications: followersTotal },
      "[dailyOfferReminders] Daily offer reminders queued",
    );
  } catch (err) {
    logger.error({ err }, "[dailyOfferReminders] Job failed");
  }
}
