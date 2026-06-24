import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// ── Going Out With Friends ───────────────────────────────────────────────────
// Group-first discovery: instead of "what venue do you want?", the user tells us
// "we're N people, going out <when>, looking for <type>" and we return ONLY the
// pubs/clubs/events/gaming venues that can actually seat the whole group right
// now. Availability is real-time — capacity minus today's booked guests — so a
// venue that is already full for the night drops out automatically. Results are
// ranked by a Group Fit score and the engine also synthesises ready-to-book
// group package suggestions from live venue inventory.
//
// All timing is IST (Asia/Kolkata), the project-wide convention.

const router: IRouter = Router();

/** A Date whose wall-clock fields (getHours/getDay) read as IST. */
function istNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function istDate(offsetDays = 0): string {
  const d = new Date(istNow());
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

type When = "now" | "tonight" | "tomorrow" | "weekend";
function parseWhen(v: unknown): When {
  return v === "now" || v === "tomorrow" || v === "weekend" ? v : "tonight";
}

// The discovery "type" chips map to one or more underlying inventory kinds.
type Kind = "pub" | "club" | "event" | "game";
const TYPE_TO_KINDS: Record<string, Kind[]> = {
  pub: ["pub"],
  club: ["club"],
  event: ["event"],
  // Date night = couple-friendly outings: pubs/clubs plus live events/DJ nights.
  "date-night": ["pub", "club", "event"],
  "dj-night": ["event", "club"],
  "live-music": ["event"],
  bowling: ["game"],
  "vr-gaming": ["game"],
  sports: ["game"],
  arcade: ["game"],
  // Pub-only content types: only venues that actually have happy hours / offers.
  "happy-hours": ["pub"],
  "food-drink-offers": ["pub"],
};
// Keyword filter applied to a game's category/name for the gaming sub-types.
const GAME_TYPE_KEYWORDS: Record<string, string[]> = {
  bowling: ["bowl"],
  "vr-gaming": ["vr", "virtual"],
  sports: ["sport", "turf", "football", "cricket", "badminton", "pool", "snooker"],
  arcade: ["arcade", "game", "play"],
};

export interface GroupItem {
  key: string;
  id: number;
  kind: Kind;
  title: string;
  subtitle: string;
  city: string;
  state: string;
  imageUrl: string;
  href: string;
  rating: number;
  /** Total venue/lane/ticket capacity (0 = not stated by the partner). */
  capacity: number;
  /** Live remaining capacity after today's booked guests (null = unknown). */
  availableCapacity: number | null;
  maxGroupSize: number;
  /** Partner's free-text group promo, e.g. "Book for 6, get 1 free entry". */
  groupOffer: string;
  fromPrice: number;
  /** Higher = better fit for this group, this time, this place. */
  groupFitScore: number;
}

export interface GroupPackage {
  key: string;
  venueId: number;
  kind: Kind;
  title: string;
  venueName: string;
  city: string;
  imageUrl: string;
  href: string;
  /** Auto-built inclusion lines, e.g. ["Reserved Table", "Drink Bucket"]. */
  includes: string[];
  /** Indicative total for the whole group (₹), estimated from venue pricing. */
  estPrice: number;
  groupSize: number;
}

function cityMatch(itemCity: string, userCity: string): boolean {
  if (!userCity) return false;
  return itemCity.toLowerCase().includes(userCity.toLowerCase());
}

/**
 * Group Fit score (higher = more prominent). Blends how comfortably the venue
 * holds the group (headroom), local relevance, rating, today's booking traction
 * and whether a dedicated group offer exists. A venue that *just* fits ranks
 * below one with comfortable spare capacity — we want the night to go smoothly.
 */
function scoreGroupItem(
  it: {
    size: number;
    capacity: number;
    availableCapacity: number | null;
    maxGroupSize: number;
    groupOffer: string;
    city: string;
    rating: number;
    todayBookings: number;
  },
  userCity: string,
): number {
  let s = 50; // base: it already passed the "fits the group" gate
  const avail = it.availableCapacity;
  if (avail !== null && avail > 0) {
    // headroom ratio capped at 3x the group — comfortable but not cavernous
    const ratio = Math.min(avail / it.size, 3);
    s += Math.round(ratio * 20); // up to +60
  } else {
    s += 25; // unknown capacity — assume it can host, but below proven headroom
  }
  if (cityMatch(it.city, userCity)) s += 30;
  s += Math.round(it.rating * 4); // 0–20
  s += Math.min(it.todayBookings, 15) * 2; // social proof, capped
  if (it.groupOffer) s += 18; // a real group deal is a strong signal
  return s;
}

router.get("/going-out", async (req, res) => {
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
  const size = Math.max(1, Math.min(200, Number(req.query["size"]) || 2));
  const when = parseWhen(req.query["when"]);
  const typeRaw = typeof req.query["type"] === "string" ? req.query["type"] : "";
  const userCity = typeof req.query["city"] === "string" ? req.query["city"] : "";
  const kinds = TYPE_TO_KINDS[typeRaw] ?? (["pub", "club", "event", "game"] as Kind[]);
  const wantPub = kinds.includes("pub") || kinds.includes("club");
  const wantEvent = kinds.includes("event");
  const wantGame = kinds.includes("game");
  const gameKeywords = GAME_TYPE_KEYWORDS[typeRaw] ?? [];

  const today = istDate(0);
  const targetDate = when === "tomorrow" ? istDate(1) : today;
  const items: GroupItem[] = [];
  const packages: GroupPackage[] = [];

  try {
    // ── Pubs & Clubs (events) ────────────────────────────────────────────────
    // Live availability = capacity − today's booked guests (non-cancelled).
    // Only rows the partner left group-bookable and that fit the party show up.
    if (wantPub) {
      const rows = (await db.execute(sql`
        SELECT e.id, e.title, e.type, e.city, e.state,
          COALESCE(NULLIF(e.image_url, ''), v.cover_image_url) AS "imageUrl",
          e.capacity, e.max_group_size AS "maxGroupSize", e.group_offer AS "groupOffer",
          e.table_count AS "tableCount", e.table_size AS "tableSize", e.vip_capacity AS "vipCapacity",
          e.price, e.price_couple AS "priceCouple",
          v.business_name AS "vendorName",
          (e.free_entry_rules->>'enabled' = 'true'
             OR EXISTS (SELECT 1 FROM drink_plans dp WHERE dp.vendor_id = v.id)) AS "hasHappyHours",
          EXISTS (SELECT 1 FROM vendor_offers vo WHERE vo.vendor_id = v.id AND vo.active = true) AS "hasOffers",
          (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE vendor_id = v.id) AS "rating",
          (SELECT COALESCE(SUM(b.guests), 0) FROM bookings b
             WHERE b.event_id = e.id AND b.booking_date = ${targetDate}
               AND b.status NOT IN ('rejected', 'cancelled')) AS "bookedGuests",
          (SELECT COUNT(*) FROM bookings b WHERE b.event_id = e.id AND b.booking_date = ${today}) AS "todayBookings"
        FROM events e JOIN vendors v ON v.id = e.vendor_id
        WHERE e.approval_status = 'approved' AND e.hidden = false AND e.type = 'pub'
          AND v.status = 'approved' AND v.hidden = false
          AND e.group_booking_enabled = true
        LIMIT 300
      `)).rows as Record<string, unknown>[];
      for (const r of rows) {
        const capacity = Number(r["capacity"] ?? 0);
        const maxGroupSize = Number(r["maxGroupSize"] ?? 0);
        const booked = Number(r["bookedGuests"] ?? 0);
        const available = capacity > 0 ? Math.max(capacity - booked, 0) : null;
        // Fit gate: stated max group (if any) must allow the party, and live
        // capacity (if known) must still seat them.
        if (maxGroupSize > 0 && maxGroupSize < size) continue;
        if (available !== null && available < size) continue;
        // Content-type gates: only surface venues that actually have the asked-for
        // content, and deep-link straight to that section.
        const hasHappyHours = Boolean(r["hasHappyHours"]);
        const hasOffers = Boolean(r["hasOffers"]);
        if (typeRaw === "happy-hours" && !hasHappyHours) continue;
        if (typeRaw === "food-drink-offers" && !hasOffers) continue;
        const pubHref = typeRaw === "happy-hours"
          ? `/events/${r["id"]}?to=happyhours`
          : typeRaw === "food-drink-offers"
            ? `/events/${r["id"]}?to=offers`
            : `/events/${r["id"]}#book`;
        const groupOffer = String(r["groupOffer"] ?? "");
        const fromPrice = Number(r["price"] ?? 0) || Number(r["priceCouple"] ?? 0);
        items.push({
          key: `pub-${r["id"]}`,
          id: Number(r["id"]),
          kind: "pub",
          title: String(r["title"] ?? ""),
          subtitle: String(r["vendorName"] ?? "Pub & Club"),
          city: String(r["city"] ?? ""),
          state: String(r["state"] ?? ""),
          imageUrl: String(r["imageUrl"] ?? ""),
          href: pubHref,
          rating: Number(r["rating"] ?? 0),
          capacity,
          availableCapacity: available,
          maxGroupSize,
          groupOffer,
          fromPrice,
          groupFitScore: scoreGroupItem(
            { size, capacity, availableCapacity: available, maxGroupSize, groupOffer, city: String(r["city"] ?? ""), rating: Number(r["rating"] ?? 0), todayBookings: Number(r["todayBookings"] ?? 0) },
            userCity,
          ),
        });
        // Synthesised group package from live pub inventory.
        const vip = Number(r["vipCapacity"] ?? 0);
        const includes = [
          "Reserved table for " + size,
          "Guaranteed group entry",
          "Drink bucket package",
        ];
        if (vip >= size) includes.push("VIP section available");
        if (groupOffer) includes.push(groupOffer);
        packages.push({
          key: `pkg-pub-${r["id"]}`,
          venueId: Number(r["id"]),
          kind: "pub",
          title: vip >= size ? "Club VIP Group Package" : "Pub Group Package",
          venueName: String(r["vendorName"] ?? r["title"] ?? ""),
          city: String(r["city"] ?? ""),
          imageUrl: String(r["imageUrl"] ?? ""),
          href: `/events/${r["id"]}#book`,
          includes,
          estPrice: Math.round(fromPrice * size),
          groupSize: size,
        });
      }
    }

    // ── Events / DJ nights / live music (organizer_events) ───────────────────
    // Availability = remaining tickets across active ticket types.
    if (wantEvent) {
      const rows = (await db.execute(sql`
        SELECT oe.id, oe.title, oe.slug, oe.city, oe.state,
          COALESCE(NULLIF(oe.cover_image_url, ''), oe.banner_url) AS "imageUrl",
          oe.capacity, oe.max_group_size AS "maxGroupSize", oe.group_offer AS "groupOffer",
          (SELECT COALESCE(AVG(rating), 0) FROM organizer_reviews WHERE organizer_id = oe.organizer_id) AS "rating",
          (SELECT COUNT(*) FROM bookings b WHERE b.organizer_event_id = oe.id AND b.booking_date = ${today}) AS "todayBookings",
          (SELECT COUNT(*) FROM event_tickets t WHERE t.event_id = oe.id AND t.active = true) AS "ticketTypes",
          (SELECT COALESCE(SUM(GREATEST(t.quantity - t.sold_count, 0)), 0) FROM event_tickets t WHERE t.event_id = oe.id AND t.active = true) AS "ticketsAvailable",
          (SELECT COALESCE(MIN(t.price), 0) FROM event_tickets t WHERE t.event_id = oe.id AND t.active = true) AS "minPrice"
        FROM organizer_events oe
        WHERE oe.approval_status = 'approved' AND oe.group_booking_enabled = true
          AND (oe.start_date IS NULL OR (oe.start_date <= ${targetDate} AND (oe.end_date IS NULL OR oe.end_date >= ${targetDate})))
        LIMIT 200
      `)).rows as Record<string, unknown>[];
      for (const r of rows) {
        const maxGroupSize = Number(r["maxGroupSize"] ?? 0);
        const ticketTypes = Number(r["ticketTypes"] ?? 0);
        const ticketsAvailable = Number(r["ticketsAvailable"] ?? 0);
        // If the organizer defined ticket types, the group needs that many seats.
        const available = ticketTypes > 0 ? ticketsAvailable : null;
        if (maxGroupSize > 0 && maxGroupSize < size) continue;
        if (available !== null && available < size) continue;
        const groupOffer = String(r["groupOffer"] ?? "");
        const fromPrice = Number(r["minPrice"] ?? 0);
        items.push({
          key: `event-${r["id"]}`,
          id: Number(r["id"]),
          kind: "event",
          title: String(r["title"] ?? ""),
          subtitle: "Live Event",
          city: String(r["city"] ?? ""),
          state: String(r["state"] ?? ""),
          imageUrl: String(r["imageUrl"] ?? ""),
          href: `/organizer-events/${r["slug"]}`,
          rating: Number(r["rating"] ?? 0),
          capacity: Number(r["capacity"] ?? 0),
          availableCapacity: available,
          maxGroupSize,
          groupOffer,
          fromPrice,
          groupFitScore: scoreGroupItem(
            { size, capacity: Number(r["capacity"] ?? 0), availableCapacity: available, maxGroupSize, groupOffer, city: String(r["city"] ?? ""), rating: Number(r["rating"] ?? 0), todayBookings: Number(r["todayBookings"] ?? 0) },
            userCity,
          ),
        });
      }
    }

    // ── Gaming / bowling / VR / sports / arcade (games + packages) ───────────
    if (wantGame) {
      const rows = (await db.execute(sql`
        SELECT g.id, g.name AS "title", g.slug, g.category, go.slug AS "orgSlug", go.name AS "orgName",
          go.city, go.state,
          COALESCE(NULLIF(g.cover_image_url, ''), go.cover_image_url) AS "imageUrl",
          g.capacity, g.max_group_size AS "maxGroupSize", g.group_offer AS "groupOffer", g.price,
          (SELECT COALESCE(AVG(rating), 0) FROM game_reviews WHERE game_organizer_id = g.game_organizer_id) AS "rating",
          (SELECT COUNT(*) FROM bookings b WHERE b.game_id = g.id AND b.booking_date = ${today}) AS "todayBookings",
          (SELECT COALESCE(SUM(b.guests), 0) FROM bookings b
             WHERE b.game_id = g.id AND b.booking_date = ${targetDate}
               AND b.status NOT IN ('rejected', 'cancelled')) AS "bookedGuests"
        FROM games g JOIN game_organizers go ON go.id = g.game_organizer_id
        WHERE g.approval_status = 'approved' AND g.active = true AND g.group_booking_enabled = true
        LIMIT 200
      `)).rows as Record<string, unknown>[];
      for (const r of rows) {
        const category = String(r["category"] ?? "").toLowerCase();
        const name = String(r["title"] ?? "").toLowerCase();
        if (gameKeywords.length && !gameKeywords.some((k) => category.includes(k) || name.includes(k))) continue;
        const capacity = Number(r["capacity"] ?? 0);
        const maxGroupSize = Number(r["maxGroupSize"] ?? 0);
        const booked = Number(r["bookedGuests"] ?? 0);
        const available = capacity > 0 ? Math.max(capacity - booked, 0) : null;
        if (maxGroupSize > 0 && maxGroupSize < size) continue;
        if (available !== null && available < size) continue;
        const groupOffer = String(r["groupOffer"] ?? "");
        const fromPrice = Number(r["price"] ?? 0);
        items.push({
          key: `game-${r["id"]}`,
          id: Number(r["id"]),
          kind: "game",
          title: String(r["title"] ?? ""),
          subtitle: String(r["orgName"] ?? r["category"] ?? "Gaming"),
          city: String(r["city"] ?? ""),
          state: String(r["state"] ?? ""),
          imageUrl: String(r["imageUrl"] ?? ""),
          href: `/game-organizers/${r["orgSlug"]}`,
          rating: Number(r["rating"] ?? 0),
          capacity,
          availableCapacity: available,
          maxGroupSize,
          groupOffer,
          fromPrice,
          groupFitScore: scoreGroupItem(
            { size, capacity, availableCapacity: available, maxGroupSize, groupOffer, city: String(r["city"] ?? ""), rating: Number(r["rating"] ?? 0), todayBookings: Number(r["todayBookings"] ?? 0) },
            userCity,
          ),
        });
      }

      // Real partner-built group packages that fit the party.
      const pkgRows = (await db.execute(sql`
        SELECT p.id, p.name, p.slug, p.price, p.group_size AS "groupSize", p.capacity,
          COALESCE(NULLIF(p.cover_image_url, ''), go.cover_image_url) AS "imageUrl",
          go.slug AS "orgSlug", go.name AS "orgName", go.city
        FROM game_packages p JOIN game_organizers go ON go.id = p.game_organizer_id
        WHERE p.approval_status = 'approved' AND p.active = true
          AND (p.capacity = 0 OR p.capacity >= ${size})
        LIMIT 60
      `)).rows as Record<string, unknown>[];
      for (const r of pkgRows) {
        packages.push({
          key: `pkg-game-${r["id"]}`,
          venueId: Number(r["id"]),
          kind: "game",
          title: String(r["name"] ?? "Gaming Package"),
          venueName: String(r["orgName"] ?? ""),
          city: String(r["city"] ?? ""),
          imageUrl: String(r["imageUrl"] ?? ""),
          href: `/game-organizers/${r["orgSlug"]}`,
          includes: ["Group gaming session", "Reserved for " + size, "Food & arcade combo"],
          estPrice: Math.round(Number(r["price"] ?? 0)),
          groupSize: size,
        });
      }
    }
  } catch {
    return res.status(500).json({ error: "Failed to load group discovery" });
  }

  // Rank: best group fit first; local-city items float up within equal scores.
  const inCity = (it: GroupItem) => !userCity || cityMatch(it.city, userCity);
  const results = items
    .sort((a, b) => b.groupFitScore - a.groupFitScore)
    .sort((a, b) => Number(inCity(b)) - Number(inCity(a)))
    .slice(0, 36);

  // Surface package suggestions for venues that actually made the cut, best-fit
  // first, deduped, capped — dynamically generated from live inventory.
  const resultIds = new Set(results.map((r) => r.key));
  const rankedPackages = packages
    .filter((p) => p.kind === "game" || resultIds.has(`pub-${p.venueId}`))
    .slice(0, 8);

  return res.json({
    size,
    when,
    type: typeRaw,
    results,
    packages: rankedPackages,
    counts: {
      total: results.length,
      pubs: results.filter((r) => r.kind === "pub").length,
      events: results.filter((r) => r.kind === "event").length,
      games: results.filter((r) => r.kind === "game").length,
    },
  });
});

export default router;
