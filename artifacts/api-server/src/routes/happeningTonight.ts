import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// ── Happening Tonight ───────────────────────────────────────────────────────
// Real-time discovery: aggregates every "tonight-relevant" source (pub/club
// events, DJ-night announcements, organizer live events, gaming venues, active
// happy-hour offers) through a time-of-day lens and ranks by relevance — NOT by
// newest. All timing is IST (Asia/Kolkata), the project-wide convention.

const router: IRouter = Router();

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const SOON_WINDOW_MIN = 180; // "starting soon" = within the next 3 hours
const EVENING_START_MIN = 16 * 60; // venues with no explicit time count as "on" from 4 PM

function todayIstDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** A Date whose wall-clock fields (getHours/getDay) read as IST. */
function istNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function parseHHMM(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

type Bucket = "now" | "soon" | null;

/**
 * Decide the time bucket for a listing given its session window and the current
 * IST minute-of-day. Overnight windows (e.g. 22:00 → 02:00) are handled. A
 * listing with no start time is treated as an open venue: "now" in the evening.
 */
function computeBucket(startMin: number | null, endMin: number | null, nowMin: number): Bucket {
  if (startMin === null) {
    return nowMin >= EVENING_START_MIN ? "now" : null;
  }
  // Live window
  if (endMin !== null) {
    const live = startMin <= endMin
      ? nowMin >= startMin && nowMin <= endMin
      : nowMin >= startMin || nowMin <= endMin; // overnight
    if (live) return "now";
  } else if (nowMin >= startMin && nowMin - startMin <= SOON_WINDOW_MIN) {
    // started recently, open-ended
    return "now";
  }
  // Starting soon
  if (startMin > nowMin && startMin - nowMin <= SOON_WINDOW_MIN) return "soon";
  return null;
}

/**
 * "Is this offer's time window still open (or yet to open) today?" Used to gate
 * pub/club cards: an offer whose closing time has already passed no longer keeps
 * the venue in Happening Tonight. Open-ended / all-day windows never expire;
 * overnight windows (e.g. 22:00 → 02:00) are only "over" in the dead zone
 * between close and reopen.
 */
function timeNotOver(timeFrom: string | null | undefined, timeTo: string | null | undefined, nowMin: number): boolean {
  const to = parseHHMM(timeTo ?? null);
  if (to === null) return true; // all-day / open-ended
  const from = parseHHMM(timeFrom ?? null);
  if (from !== null && from > to) {
    return !(nowMin > to && nowMin < from); // overnight window
  }
  return nowMin <= to;
}

export interface TonightItem {
  key: string;
  id: number;
  kind: "pub" | "dj" | "event" | "game" | "happyhour" | "offer";
  title: string;
  subtitle: string;
  city: string;
  state: string;
  imageUrl: string;
  href: string;
  startTime: string;
  endTime: string;
  bucket: Bucket;
  /** For "offer" items: the vendor_offers category (food/drink/exclusive). */
  category?: string;
  /** Guest type ("all"/"female") for "happyhour"/"offer" items — drives the
   *  Everyone/Ladies badge on the card. */
  gender?: string;
  dealLabel: string;
  rating: number;
  todayBookings: number;
  /** Quick-filter chip keys this item satisfies. */
  filters: string[];
  score: number;
}

function cityMatch(itemCity: string, userCity: string): boolean {
  if (!userCity) return false;
  return itemCity.toLowerCase().includes(userCity.toLowerCase());
}

/**
 * Weighted relevance score (higher = more prominent). Deliberately blends time
 * relevance, city match, today's traction, rating and active promos so the feed
 * surfaces what's genuinely happening + performing — never just the newest.
 */
function scoreItem(
  it: { bucket: Bucket; startMin: number | null; nowMin: number; city: string; rating: number; todayBookings: number; isDeal: boolean },
  userCity: string,
): number {
  let s = 0;
  if (it.bucket === "now") s += 100;
  else if (it.bucket === "soon" && it.startMin !== null) {
    // sooner = higher, scaled across the soon window
    s += 60 + Math.round((1 - (it.startMin - it.nowMin) / SOON_WINDOW_MIN) * 30);
  }
  if (cityMatch(it.city, userCity)) s += 30;
  s += Math.min(it.todayBookings, 20) * 2; // today's traction, capped
  s += Math.round(it.rating * 4); // 0–20
  if (it.isDeal) s += 15;
  return s;
}

router.get("/happening-tonight", async (req, res) => {
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  const userCity = typeof req.query["city"] === "string" ? req.query["city"] : "";
  const now = istNow();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = todayIstDate();
  const todayKey = DAY_KEYS[now.getDay()] ?? "sun";
  // Optional day-of-week filter ("mon".."sun") — lets the client browse which
  // day's happy hours / food & drink / exclusive offers run, not just tonight.
  // Real-time-only sources (pub/club "happening tonight" flags, DJ nights,
  // organizer live events) only make sense for today, so they're skipped for
  // any other day; recurring deals are re-evaluated for the requested day
  // instead of "right now".
  const requestedDay = typeof req.query["day"] === "string" ? req.query["day"].toLowerCase().slice(0, 3) : "";
  const day = (DAY_KEYS as readonly string[]).includes(requestedDay) ? requestedDay : todayKey;
  const isToday = day === todayKey;
  const items: TonightItem[] = [];

  const push = (
    base: Omit<TonightItem, "bucket" | "score" | "filters"> & { startMin: number | null; endMin: number | null; extraFilters?: string[]; forceBucket?: Bucket; allowSoon?: boolean },
  ) => {
    // NOTE: forceBucket can legitimately be `null` (force "no bucket" — used for
    // day-filter queries on a day other than today, where "now"/"soon" don't
    // apply). `??` treats null as nullish too, so it must NOT be used here or a
    // forced null silently falls through to computeBucket() and gets a bogus
    // "now"/"soon" bucket computed against *today's* clock for a *different*
    // day's item.
    let bucket = base.forceBucket !== undefined ? base.forceBucket : computeBucket(base.startMin, base.endMin, nowMin);
    // Respect the partner's "Starting Soon" opt-out: drop from the soon bucket.
    if (bucket === "soon" && base.allowSoon === false) bucket = null;
    if (!bucket && !base.dealLabel) return; // not tonight-relevant and not a deal
    const isDeal = !!base.dealLabel;
    const filters = new Set<string>(base.extraFilters ?? []);
    if (bucket === "now") filters.add("now");
    if (bucket === "soon") filters.add("soon");
    if (isDeal) filters.add("deals");
    const { startMin, endMin, extraFilters, forceBucket, allowSoon, ...rest } = base;
    items.push({
      ...rest,
      bucket,
      filters: [...filters],
      score: scoreItem(
        { bucket, startMin, nowMin, city: base.city, rating: base.rating, todayBookings: base.todayBookings, isDeal },
        userCity,
      ),
    });
  };

  try {
    // ── Real-time-only sources: pub/club "happening tonight" flags, DJ nights,
    // organizer live events. These are inherently "right now" signals (live
    // flags + booking counts + starting-soon windows evaluated against the
    // actual current clock) so they only apply when browsing today; a day
    // filter for another day of the week skips this whole block.
    if (isToday) {
      // ── Which pub/club vendors have a live-tonight Food & Drink offer? ──────
      // A pub/club only earns a Happening Tonight card when its Food & Drink tab
      // is non-empty for today: at least one offer scheduled for today whose time
      // hasn't already passed — a cover charge, free / welcome / unlimited drink,
      // an included-with-ticket plan (drink_plans) or a food/drink discount
      // (vendor_offers). Venues with an empty tab, or whose offers already ended
      // today, are dropped from the pub/club source below.
      const offerVendorRows = (await db.execute(sql`
        SELECT vendor_id AS "vendorId", days, time_from AS "timeFrom", time_to AS "timeTo"
        FROM drink_plans
        WHERE (valid_from IS NULL OR valid_from <= ${today})
          AND (valid_until IS NULL OR valid_until >= ${today})
        UNION ALL
        SELECT vendor_id AS "vendorId", days, time_from AS "timeFrom", time_to AS "timeTo"
        FROM vendor_offers
        WHERE active = true
          AND (starts_at IS NULL OR starts_at <= now())
          AND (ends_at IS NULL OR ends_at >= now())
      `)).rows as Record<string, unknown>[];
      const offerVendorIds = new Set<number>();
      for (const r of offerVendorRows) {
        const days = ((r["days"] as string[] | null) ?? []).map((d) => d.slice(0, 3).toLowerCase());
        // Empty days = every day; otherwise today must be listed.
        if (days.length > 0 && !days.includes(todayKey)) continue;
        if (!timeNotOver(r["timeFrom"] as string, r["timeTo"] as string, nowMin)) continue;
        offerVendorIds.add(Number(r["vendorId"]));
      }

      // ── Pub/club events ────────────────────────────────────────────────────
      const pubRows = (await db.execute(sql`
        SELECT e.id, e.title, e.type, e.city, e.state, v.id AS "vendorId",
          e.start_time AS "startTime", e.end_time AS "endTime",
          e.last_minute_deal AS "lastMinuteDeal", e.deal_label AS "dealLabel",
          e.starting_soon AS "startingSoon",
          v.business_name AS "vendorName",
          COALESCE(NULLIF(e.image_url, ''), v.cover_image_url) AS "imageUrl",
          (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE vendor_id = v.id) AS "rating",
          (SELECT COUNT(*) FROM bookings b WHERE b.event_id = e.id AND b.booking_date = ${today}) AS "todayBookings"
        FROM events e JOIN vendors v ON v.id = e.vendor_id
        WHERE e.approval_status = 'approved' AND e.hidden = false AND v.status = 'approved' AND v.hidden = false AND e.happening_tonight = true
          AND (e.type = 'pub' OR e.event_date IS NULL OR e.event_date = ${today})
        LIMIT 200
      `)).rows as Record<string, unknown>[];
      for (const r of pubRows) {
        const startMin = parseHHMM(r["startTime"] as string);
        const endMin = parseHHMM(r["endTime"] as string);
        const isPub = r["type"] === "pub";
        // Pubs/clubs need a live-tonight Food & Drink offer to qualify; other
        // event types (ticketed events) are unaffected by this gate.
        if (isPub && !offerVendorIds.has(Number(r["vendorId"]))) continue;
        push({
          key: `pub-${r["id"]}`,
          id: Number(r["id"]),
          kind: "pub",
          title: String(r["title"] ?? ""),
          subtitle: String(r["vendorName"] ?? ""),
          city: String(r["city"] ?? ""),
          state: String(r["state"] ?? ""),
          imageUrl: String(r["imageUrl"] ?? ""),
          // Pubs land on the venue's Happy Hours section (falls back to Food &
          // Drink Offers, then Book a Table when those are empty — see event-detail).
          href: isPub ? `/events/${r["id"]}?to=happyhours` : `/events/${r["id"]}`,
          startTime: String(r["startTime"] ?? ""),
          endTime: String(r["endTime"] ?? ""),
          dealLabel: String(r["dealLabel"] ?? ""),
          rating: Number(r["rating"] ?? 0),
          todayBookings: Number(r["todayBookings"] ?? 0),
          startMin,
          endMin,
          allowSoon: Boolean(r["startingSoon"]),
          extraFilters: ["pub"],
        });
      }

      // ── DJ nights / what's-on (announcements) ─────────────────────────────
      const djRows = (await db.execute(sql`
        SELECT a.id, a.title, a.announce_time AS "startTime", v.city, v.state,
          v.business_name AS "vendorName",
          COALESCE(NULLIF(a.image_url, ''), v.cover_image_url) AS "imageUrl",
          COALESCE(a.event_id, (SELECT id FROM events WHERE vendor_id = a.vendor_id ORDER BY id DESC LIMIT 1)) AS "eventId",
          (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE vendor_id = v.id) AS "rating"
        FROM announcements a JOIN vendors v ON v.id = a.vendor_id
        WHERE a.approval_status = 'approved' AND v.status = 'approved' AND v.hidden = false
          AND (a.announce_date = '' OR a.announce_date = ${today})
          AND (a.event_id IS NULL OR EXISTS (
            SELECT 1 FROM events e
            WHERE e.id = a.event_id AND e.hidden = false AND e.approval_status = 'approved'
          ))
        LIMIT 100
      `)).rows as Record<string, unknown>[];
      for (const r of djRows) {
        const startMin = parseHHMM(r["startTime"] as string);
        const eventId = r["eventId"] != null ? Number(r["eventId"]) : null;
        push({
          key: `dj-${r["id"]}`,
          id: Number(r["id"]),
          kind: "dj",
          title: String(r["title"] ?? ""),
          subtitle: String(r["vendorName"] ?? ""),
          city: String(r["city"] ?? ""),
          state: String(r["state"] ?? ""),
          imageUrl: String(r["imageUrl"] ?? ""),
          href: eventId ? `/events/${eventId}` : "/pubs",
          startTime: String(r["startTime"] ?? ""),
          endTime: "",
          dealLabel: "",
          rating: Number(r["rating"] ?? 0),
          todayBookings: 0,
          startMin,
          endMin: null,
          extraFilters: ["dj"],
        });
      }

      // ── Organizer live events / concerts ──────────────────────────────────
      const evRows = (await db.execute(sql`
        SELECT oe.id, oe.title, oe.slug, oe.city, oe.state,
          oe.start_time AS "startTime", oe.end_time AS "endTime",
          oe.last_minute_deal AS "lastMinuteDeal", oe.deal_label AS "dealLabel",
          oe.starting_soon AS "startingSoon",
          COALESCE(NULLIF(oe.cover_image_url, ''), oe.banner_url) AS "imageUrl",
          (SELECT COALESCE(AVG(rating), 0) FROM organizer_reviews WHERE organizer_id = oe.organizer_id) AS "rating",
          (SELECT COUNT(*) FROM bookings b WHERE b.organizer_event_id = oe.id AND b.booking_date = ${today}) AS "todayBookings"
        FROM organizer_events oe
        WHERE oe.approval_status = 'approved' AND oe.happening_tonight = true
          AND (oe.start_date IS NULL OR (oe.start_date <= ${today} AND (oe.end_date IS NULL OR oe.end_date >= ${today})))
        LIMIT 100
      `)).rows as Record<string, unknown>[];
      for (const r of evRows) {
        push({
          key: `event-${r["id"]}`,
          id: Number(r["id"]),
          kind: "event",
          title: String(r["title"] ?? ""),
          subtitle: "Live Event",
          city: String(r["city"] ?? ""),
          state: String(r["state"] ?? ""),
          imageUrl: String(r["imageUrl"] ?? ""),
          href: `/organizer-events/${r["slug"]}`,
          startTime: String(r["startTime"] ?? ""),
          endTime: String(r["endTime"] ?? ""),
          dealLabel: String(r["dealLabel"] ?? ""),
          rating: Number(r["rating"] ?? 0),
          todayBookings: Number(r["todayBookings"] ?? 0),
          startMin: parseHHMM(r["startTime"] as string),
          endMin: parseHHMM(r["endTime"] as string),
          allowSoon: Boolean(r["startingSoon"]),
          extraFilters: ["live"],
        });
      }
    }

    // ── Gaming / VR / bowling venues are intentionally excluded from Happening
    // Tonight — this feed is for nightlife (pubs/clubs/bars), DJ nights and live
    // events only. (Games still surface in their own discovery sections.)

    // ── Happy hours (active vendor offers) ───────────────────────────────────
    const offerRows = (await db.execute(sql`
      SELECT vo.id, vo.title, vo.category, vo.description, vo.days, vo.time_from AS "timeFrom",
        vo.time_to AS "timeTo", vo.starts_at AS "startsAt", vo.ends_at AS "endsAt", vo.active, vo.gender,
        vo.discount_type AS "discountType", vo.discount_value AS "discountValue",
        v.id AS "vendorId", v.business_name AS "vendorName", v.city, v.state,
        -- The offer's own deal image, then the venue cover/banner, then the pub's
        -- listing image. Partner pubs keep their photo on the pub event, so the
        -- last fallback is what makes the card show a cover instead of a blank.
        COALESCE(
          NULLIF(vo.image_url, ''),
          NULLIF(v.cover_image_url, ''),
          NULLIF(v.banner_image, ''),
          (SELECT e.image_url FROM events e
             WHERE e.vendor_id = v.id AND e.type = 'pub' AND e.approval_status = 'approved'
               AND COALESCE(e.image_url, '') <> ''
             ORDER BY e.created_at DESC LIMIT 1)
        ) AS "imageUrl",
        (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE vendor_id = v.id) AS "rating",
        (SELECT id FROM events WHERE vendor_id = v.id AND type = 'pub' ORDER BY id DESC LIMIT 1) AS "pubEventId"
      FROM vendor_offers vo JOIN vendors v ON v.id = vo.vendor_id
      WHERE vo.active = true AND v.status = 'approved' AND v.hidden = false
      LIMIT 200
    `)).rows as Record<string, unknown>[];
    for (const r of offerRows) {
      // Surface a discount when it's scheduled for today and its closing time
      // hasn't passed — the same "today's offer, hide once it's over" rule used
      // for pub cards — instead of only during its exact live window. This keeps
      // time-windowed offers (e.g. evening food discounts) visible across the
      // day, so food & drink discounts surface alike rather than only the
      // always-on ones (which had been making the feed look "drinks only").
      if (!r["active"]) continue;
      if (isToday) {
        const startsAt = r["startsAt"] as Date | null;
        const endsAt = r["endsAt"] as Date | null;
        if (startsAt && now < new Date(startsAt)) continue;
        if (endsAt && now > new Date(endsAt)) continue;
      }
      const offerDays = ((r["days"] as string[] | null) ?? []).map((d) => d.slice(0, 3).toLowerCase());
      if (offerDays.length > 0 && !offerDays.includes(day)) continue;
      if (isToday && !timeNotOver(r["timeFrom"] as string, r["timeTo"] as string, nowMin)) continue;
      const oStart = parseHHMM(r["timeFrom"] as string);
      const oEnd = parseHHMM(r["timeTo"] as string);
      const pubEventId = r["pubEventId"] != null ? Number(r["pubEventId"]) : null;
      const offerCategory = String(r["category"] ?? "");
      const isExclusive = offerCategory === "exclusive";
      push({
        key: `offer-${r["id"]}`,
        id: Number(r["id"]),
        kind: "offer",
        title: String(r["title"] ?? ""),
        subtitle: String(r["vendorName"] ?? ""),
        city: String(r["city"] ?? ""),
        state: String(r["state"] ?? ""),
        imageUrl: String(r["imageUrl"] ?? ""),
        href: pubEventId ? `/events/${pubEventId}?to=offers` : "/pub-offers",
        startTime: String(r["timeFrom"] ?? ""),
        endTime: String(r["timeTo"] ?? ""),
        category: offerCategory,
        gender: String(r["gender"] ?? "all"),
        dealLabel: String(r["title"] ?? ""),
        rating: Number(r["rating"] ?? 0),
        todayBookings: 0,
        startMin: oStart,
        endMin: oEnd,
        // All-day offers (no time window) are live whenever the venue is open;
        // timed offers use the standard now/soon window logic and otherwise show
        // as an upcoming deal for today rather than a false "Live Now". Browsing
        // a different day of the week has no "live now" — just show the deal.
        forceBucket: !isToday ? null : oStart === null ? "now" : undefined,
        // Exclusive offers get their own "Exclusive Offer" filter; food & drink
        // discounts stay under the "Food & Drink Offers" filter.
        extraFilters: isExclusive ? ["exclusive", "deals"] : ["offers", "deals"],
      });
    }

    // ── Happy Hours (drink plans: Free Drinks / Included with Ticket / Cover
    // Charges). These are distinct from vendor_offers and power the "Happy Hours"
    // filter. Surfaced when live right now, or for any day of the week the
    // client asked to browse via the day filter. ────────────────────────────
    const planRows = (await db.execute(sql`
      SELECT dp.id, dp.type, dp.product_name AS "productName", dp.gender, dp.days,
        dp.time_from AS "timeFrom", dp.time_to AS "timeTo",
        v.id AS "vendorId", v.business_name AS "vendorName", v.city, v.state,
        COALESCE(
          NULLIF(dp.image_url, ''),
          NULLIF(v.cover_image_url, ''),
          NULLIF(v.banner_image, ''),
          (SELECT e.image_url FROM events e
             WHERE e.vendor_id = v.id AND e.type = 'pub' AND e.approval_status = 'approved'
               AND COALESCE(e.image_url, '') <> ''
             ORDER BY e.created_at DESC LIMIT 1)
        ) AS "imageUrl",
        (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE vendor_id = v.id) AS "rating",
        (SELECT id FROM events WHERE vendor_id = v.id AND type = 'pub' ORDER BY id DESC LIMIT 1) AS "pubEventId"
      FROM drink_plans dp JOIN vendors v ON v.id = dp.vendor_id
      WHERE v.status = 'approved' AND v.hidden = false
        AND (dp.valid_from IS NULL OR dp.valid_from <= ${today})
        AND (dp.valid_until IS NULL OR dp.valid_until >= ${today})
      LIMIT 300
    `)).rows as Record<string, unknown>[];
    const planLabel = (type: string, productName: string): string => {
      if (type === "welcome") return productName || "Free Welcome Drink";
      if (type === "unlimited") return productName || "Free Unlimited Drinks";
      if (type === "ticket") return "Included with Ticket";
      if (type === "cover_charge") return productName || "Cover Charge";
      if (type === "vip_table") return productName || "VIP Table Booking";
      return productName || "Drinks Deal";
    };
    for (const r of planRows) {
      const days = ((r["days"] as string[] | null) ?? []).map((d) => d.slice(0, 3).toLowerCase());
      // Empty days = every day; otherwise the requested day must be listed.
      if (days.length > 0 && !days.includes(day)) continue;
      const startMin = parseHHMM(r["timeFrom"] as string);
      const endMin = parseHHMM(r["timeTo"] as string);
      // Live-now check only applies when browsing today: when a time window is
      // set it must include now (overnight supported); no time window = all-day,
      // always live. Browsing another day of the week skips this — the deal
      // just needs to run on that day, "now" doesn't apply.
      if (isToday) {
        if (startMin !== null && endMin !== null) {
          const live = startMin <= endMin
            ? nowMin >= startMin && nowMin <= endMin
            : nowMin >= startMin || nowMin <= endMin;
          if (!live) continue;
        } else if (startMin !== null && nowMin < startMin) {
          continue;
        }
      }
      const pubEventId = r["pubEventId"] != null ? Number(r["pubEventId"]) : null;
      const label = planLabel(String(r["type"] ?? ""), String(r["productName"] ?? ""));
      push({
        key: `plan-${r["id"]}`,
        id: Number(r["id"]),
        kind: "happyhour",
        title: label,
        subtitle: String(r["vendorName"] ?? ""),
        city: String(r["city"] ?? ""),
        state: String(r["state"] ?? ""),
        imageUrl: String(r["imageUrl"] ?? ""),
        href: pubEventId ? `/events/${pubEventId}?to=happyhours` : "/pub-offers",
        startTime: String(r["timeFrom"] ?? ""),
        endTime: String(r["timeTo"] ?? ""),
        gender: String(r["gender"] ?? "all"),
        dealLabel: label,
        rating: Number(r["rating"] ?? 0),
        todayBookings: 0,
        startMin: null,
        endMin: null,
        forceBucket: isToday ? "now" : null,
        // "Happy Hours" filter — drink plans only.
        extraFilters: ["happy", "deals"],
      });
    }
  } catch (err) {
    return res.status(500).json({ error: "Failed to load happening tonight" });
  }

  // Rank within each bucket (highest score first).
  const byScore = (a: TonightItem, b: TonightItem) => b.score - a.score;
  const inCity = (it: TonightItem) => !userCity || cityMatch(it.city, userCity);

  const happeningNow = items.filter((i) => i.bucket === "now").sort(byScore);
  const startingSoon = items.filter((i) => i.bucket === "soon").sort(byScore);
  const lastMinuteDeals = items.filter((i) => !!i.dealLabel).sort(byScore);
  // Local-first: items in the user's city first (already score-sorted), then the rest.
  const tonightNearYou = [...items]
    .sort(byScore)
    .sort((a, b) => Number(inCity(b)) - Number(inCity(a)))
    .slice(0, 24);

  return res.json({
    happeningNow,
    startingSoon,
    lastMinuteDeals,
    tonightNearYou,
    day,
    isToday,
    counts: {
      now: happeningNow.length,
      soon: startingSoon.length,
      deals: lastMinuteDeals.length,
      total: items.length,
    },
  });
});

export default router;
