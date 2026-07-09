import { db, followsTable, vendorsTable, eventsTable } from "@workspace/db";
import { eq, and, ne, desc, sql } from "drizzle-orm";
import { enqueueFollowNotifications } from "./notificationQueue";
import { renderFollowCopy, renderDailyReminderCopy, type FollowNotifyKind } from "./notifyTemplates";
import { boundingBox, num, type Coords } from "./geo";
import { logger } from "./logger";

// The kind of venue update that triggers a follower notification. Drink-plan
// types map onto the first three; vendor offers map onto "food_drink" (food /
// drink discount categories) or "exclusive" (the exclusive-offer category).
export type VenueUpdateKind =
  | "free_drinks"
  | "ticket"
  | "cover_charge"
  | "food_drink"
  | "exclusive";

// Map a drink-plan `type` (welcome | unlimited | ticket | cover_charge) to the
// notification kind. Free welcome/unlimited drinks both read as "free drinks".
export function drinkPlanKind(type: string): VenueUpdateKind {
  if (type === "ticket") return "ticket";
  if (type === "cover_charge") return "cover_charge";
  return "free_drinks";
}

// Cover-charge changes are the most time-sensitive to a night out, so they jump
// the queue ahead of a routine food discount when a user has several queued.
const PRIORITY: Record<VenueUpdateKind, number> = {
  cover_charge: 3,
  ticket: 2,
  free_drinks: 2,
  exclusive: 2,
  food_drink: 1,
};

function slugify(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CITY_ALIAS_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ["bangalore", "bengaluru"],
  ["mumbai", "bombay"],
  ["gurgaon", "gurugram"],
  ["kolkata", "calcutta"],
  ["chennai", "madras"],
  ["pune", "poona"],
];

function canonicalCitySlug(input: string | null | undefined): string {
  const s = slugify((input ?? "").trim());
  if (!s) return "city";
  for (const group of CITY_ALIAS_GROUPS) {
    if (group.includes(s)) return group[0]!;
  }
  return s;
}

// Deep link for an offer notification. A pub's primary "see & book" surface is
// its public EVENT page (/events/…), not the /pubs profile page — so we resolve
// the venue's pub event and link there, opening the relevant section:
//   • food & drink discounts / exclusive deals → ?to=offers  (the Offers tab)
//   • drink / ticket / cover                    → ?to=happyhours (Happy Hours)
// The event page auto-lands on that section (falling back to Book a Table), so
// the user sees the exact offer they were told about and can book/claim it.
// Falls back to the /pubs profile page only if the venue has no public pub event.
async function offerDeepLink(
  v: { id: number; businessName: string; city: string | null },
  kind: VenueUpdateKind,
): Promise<string> {
  // Vendor-offer categories (food & drink discount + exclusive deal) both live
  // on the Offers tab; drink-plan kinds land on Happy Hours.
  const to = kind === "food_drink" || kind === "exclusive" ? "offers" : "happyhours";

  const [pubEvent] = await db
    .select({ id: eventsTable.id, title: eventsTable.title, city: eventsTable.city })
    .from(eventsTable)
    .where(and(
      eq(eventsTable.vendorId, v.id),
      eq(eventsTable.type, "pub"),
      eq(eventsTable.approvalStatus, "approved"),
      eq(eventsTable.hidden, false),
    ))
    .orderBy(desc(eventsTable.createdAt))
    .limit(1);

  if (pubEvent) {
    // Use the EVENT's own city so the URL matches the event's canonical slug
    // (the pub event and the vendor can carry different cities). Falls back to
    // the vendor's city if the event has none.
    const evCity = canonicalCitySlug(pubEvent.city || v.city);
    const evName = slugify(pubEvent.title) || "pub";
    return `/events/${evCity}/${evName}-${pubEvent.id}?to=${to}`;
  }
  // No public pub event yet → fall back to the venue profile page's offers tab.
  const name = slugify(v.businessName) || "venue";
  return `/pubs/${canonicalCitySlug(v.city)}/${name}-${v.id}?tab=happyHours`;
}

function todayIst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Radius (km) for proximity notifications to NON-followers.
const GEO_RADIUS_KM = 25;

// Users within `radiusKm` of `center` who are NOT already followers of the venue
// (and aren't the owner). Indexed lat/lng bounding-box prefilter + exact
// haversine, so it stays efficient. These are the "nearby non-followers" who get
// proximity offer alerts in addition to the venue's own followers.
async function nearbyNonFollowerIds(
  vendorId: number,
  ownerId: number,
  center: Coords,
  radiusKm: number,
): Promise<number[]> {
  const bb = boundingBox(center, radiusKm);
  const rows = await db.execute(sql`
    SELECT u.id AS id
    FROM users u
    WHERE u.id <> ${ownerId}
      AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL
      AND u.latitude BETWEEN ${bb.minLat} AND ${bb.maxLat}
      AND u.longitude BETWEEN ${bb.minLng} AND ${bb.maxLng}
      AND (6371 * acos(LEAST(1, GREATEST(-1,
        cos(radians(${center.lat})) * cos(radians(u.latitude)) *
        cos(radians(u.longitude) - radians(${center.lng})) +
        sin(radians(${center.lat})) * sin(radians(u.latitude))
      )))) <= ${radiusKm}
      AND NOT EXISTS (
        SELECT 1 FROM follows f
        WHERE f.user_id = u.id AND f.target_type = 'vendor' AND f.target_id = ${vendorId}
      )
  `);
  return rows.rows.map((r) => Number((r as { id: number }).id)).filter((n) => Number.isFinite(n));
}

// Shared core: resolve the venue, then enqueue the notification to two audiences:
//   1. ALL of the venue's followers — always notified, no distance filter (they
//      opted in). No geo-fence attached to their rows.
//   2. When `includeNearby`, non-followers within 25 km of the venue's exact
//      Google-Maps coordinates — proximity discovery. Their rows carry a
//      geo-fence so eligibility is re-checked against each user's latest location
//      at send time (a user who moved out of range before delivery is skipped).
// The two audiences are disjoint, so nobody is double-notified. Returns the total
// number of recipients queued.
async function enqueueVenueOffer(
  vendorId: number,
  kind: VenueUpdateKind,
  dedupKey: string,
  copy: (venue: { businessName: string; city: string | null }) => { title: string; body: string },
  includeNearby = false,
): Promise<number> {
  const [venue] = await db
    .select({
      id: vendorsTable.id,
      businessName: vendorsTable.businessName,
      city: vendorsTable.city,
      status: vendorsTable.status,
      hidden: vendorsTable.hidden,
      ownerId: vendorsTable.userId,
      latitude: vendorsTable.latitude,
      longitude: vendorsTable.longitude,
    })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, vendorId))
    .limit(1);

  // Only approved, visible venues push to anyone.
  if (!venue || venue.status !== "approved" || venue.hidden) return 0;

  // (1) All non-owner followers, regardless of distance.
  const followers = await db
    .select({ userId: followsTable.userId })
    .from(followsTable)
    .where(and(
      eq(followsTable.targetType, "vendor"),
      eq(followsTable.targetId, vendorId),
      ne(followsTable.userId, venue.ownerId),
    ));
  const followerIds = followers.map((f) => f.userId);

  // (2) Nearby non-followers within 25 km (only when this notification opts in
  // and the venue has coordinates).
  const vLat = num(venue.latitude);
  const vLng = num(venue.longitude);
  const hasCoords = vLat != null && vLng != null;
  const nearbyIds = includeNearby && hasCoords
    ? await nearbyNonFollowerIds(vendorId, venue.ownerId, { lat: vLat!, lng: vLng! }, GEO_RADIUS_KM)
    : [];

  if (followerIds.length === 0 && nearbyIds.length === 0) return 0;

  const { title, body } = copy(venue);
  const url = await offerDeepLink(venue, kind);
  const tag = dedupKey.replace(/[^a-z0-9]+/gi, "-");
  const base = { title, message: body, url, type: `follow_${kind}`, tag, dedupKey, priority: PRIORITY[kind] };

  if (followerIds.length > 0) {
    await enqueueFollowNotifications(followerIds, base);
  }
  if (nearbyIds.length > 0) {
    await enqueueFollowNotifications(nearbyIds, {
      ...base,
      geo: { lat: vLat!, lng: vLng!, radiusKm: GEO_RADIUS_KM },
    });
  }
  return followerIds.length + nearbyIds.length;
}

/**
 * Notify every follower of a venue that it just posted a new deal/offer.
 *
 * Fire-and-forget: callers should NOT await this on the request path. Silently
 * no-ops if the venue isn't publicly visible or has no followers.
 *
 * `refId` is the id of the specific drink plan / offer that changed. It anchors
 * the dedup key so:
 *   • re-saving the SAME offer never re-notifies (same key), and
 *   • a genuinely NEW offer later the same day DOES notify (new key) —
 * exactly the "only newly added content, never duplicates" rule. When no refId
 * is available we fall back to a per-day key so a kind fires at most once/day.
 */
export async function notifyVenueFollowers(
  vendorId: number,
  kind: VenueUpdateKind,
  refId?: number,
): Promise<void> {
  try {
    const anchor = refId != null ? String(refId) : todayIst();
    const dedupKey = `vendor:${vendorId}:${kind}:${anchor}`;
    // A brand-new offer reaches followers AND nearby non-followers (≤25 km).
    const n = await enqueueVenueOffer(vendorId, kind, dedupKey, (venue) =>
      renderFollowCopy(kind as FollowNotifyKind, {
        name: venue.businessName,
        city: venue.city ?? undefined,
      }),
      /* includeNearby */ true,
    );
    if (n > 0) {
      logger.info({ vendorId, kind, refId, recipients: n }, "Queued venue offer notifications (followers + nearby)");
    }
  } catch (err) {
    // Never let notification failures break the venue's save flow.
    logger.warn({ err, vendorId, kind }, "notifyVenueFollowers failed");
  }
}

/**
 * Daily "your followed venue's offer is still on" reminder. Sends at most ONE
 * notification per venue per day (dedup key = vendor-daily:{vendorId}:{today}),
 * regardless of how many offers the venue has, so followers aren't spammed. The
 * copy is chosen deterministically from `daySeed` so the wording differs each
 * day. `kind` is the representative/most-notable active offer kind, which drives
 * the copy flavour, deep-link section and priority.
 *
 * Returns the number of followers queued so the daily job can aggregate. Errors
 * are swallowed (one bad venue must not abort the whole run).
 */
export async function notifyVenueFollowersDailyReminder(
  vendorId: number,
  kind: VenueUpdateKind,
  daySeed: number,
  today: string,
): Promise<number> {
  try {
    const dedupKey = `vendor-daily:${vendorId}:${today}`;
    return await enqueueVenueOffer(vendorId, kind, dedupKey, (venue) =>
      renderDailyReminderCopy(
        kind as FollowNotifyKind,
        { name: venue.businessName, city: venue.city ?? undefined },
        daySeed + vendorId,
      ),
    );
  } catch (err) {
    logger.warn({ err, vendorId, kind }, "notifyVenueFollowersDailyReminder failed");
    return 0;
  }
}
