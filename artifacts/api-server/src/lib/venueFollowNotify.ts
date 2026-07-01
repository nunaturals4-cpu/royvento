import { db, followsTable, vendorsTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { createUserNotification } from "./notify";
import { logger } from "./logger";

// The kind of venue update that triggers a follower notification. Drink-plan
// types map onto the first three; vendor offers map onto "food_drink".
export type VenueUpdateKind =
  | "free_drinks"
  | "ticket"
  | "cover_charge"
  | "food_drink";

// Map a drink-plan `type` (welcome | unlimited | ticket | cover_charge) to the
// notification kind. Free welcome/unlimited drinks both read as "free drinks".
export function drinkPlanKind(type: string): VenueUpdateKind {
  if (type === "ticket") return "ticket";
  if (type === "cover_charge") return "cover_charge";
  return "free_drinks";
}

// Funny, curiosity-driven, click-worthy copy per update kind. `{name}` is the
// venue name. Kept intentionally playful (not spammy) per product brief.
function copyFor(kind: VenueUpdateKind, name: string): { title: string; body: string } {
  switch (kind) {
    case "free_drinks":
      return {
        title: `🍹 Free drinks at ${name}?!`,
        body: `Wait... FREE drinks just dropped at ${name} 👀 Don't say we didn't warn you.`,
      };
    case "ticket":
      return {
        title: `🎟️ ${name} sweetened your ticket`,
        body: `Your favorite spot just added something to your ticket... Want to know what? 😏`,
      };
    case "cover_charge":
      return {
        title: `💰 Cover charge update at ${name}`,
        body: `Cover charge changed at ${name}. Good news or bad news? Tap to find out.`,
      };
    case "food_drink":
      return {
        title: `🍔 New deals at ${name}`,
        body: `Hungry? ${name} just unlocked food & drink deals you shouldn't miss 🍕🍺.`,
      };
    default:
      return {
        title: `🔥 ${name} is up to something`,
        body: `Looks like ${name} is cooking up something special tonight... Tap before everyone else does.`,
      };
  }
}

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

// Deep link straight to the venue's public page. Mirrors the canonical URL
// produced by legacyRedirects / sitemap so the notification opens the pub page.
function venueUrl(v: { id: number; businessName: string; city: string | null }): string {
  const city = canonicalCitySlug(v.city);
  const name = slugify(v.businessName) || "venue";
  return `/pubs/${city}/${name}-${v.id}`;
}

// Best-effort in-process cooldown so a burst of rapid edits (e.g. saving a form
// twice) doesn't spam every follower. Keyed by vendor+kind. Not shared across
// replicas — this is a soft guard, not a hard dedupe.
const COOLDOWN_MS = 60_000;
const lastNotifiedAt = new Map<string, number>();

/**
 * Notify every follower of a venue that it just created/updated a deal.
 * Fire-and-forget: callers should not await this on the request path. Silently
 * no-ops if the venue is not publicly visible or has no followers.
 */
export async function notifyVenueFollowers(
  vendorId: number,
  kind: VenueUpdateKind,
): Promise<void> {
  try {
    const cooldownKey = `${vendorId}:${kind}`;
    const now = Date.now();
    const prev = lastNotifiedAt.get(cooldownKey);
    if (prev && now - prev < COOLDOWN_MS) return;

    const [venue] = await db
      .select({
        id: vendorsTable.id,
        businessName: vendorsTable.businessName,
        city: vendorsTable.city,
        status: vendorsTable.status,
        hidden: vendorsTable.hidden,
        ownerId: vendorsTable.userId,
      })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, vendorId))
      .limit(1);

    // Only approved, visible venues push to followers.
    if (!venue || venue.status !== "approved" || venue.hidden) return;

    const followers = await db
      .select({ userId: followsTable.userId })
      .from(followsTable)
      .where(and(
        eq(followsTable.targetType, "vendor"),
        eq(followsTable.targetId, vendorId),
        // Don't notify the venue owner about their own update.
        ne(followsTable.userId, venue.ownerId),
      ));
    if (followers.length === 0) return;

    lastNotifiedAt.set(cooldownKey, now);

    const { title, body } = copyFor(kind, venue.businessName);
    const url = venueUrl(venue);
    // Coalesce repeated pushes of the same kind for the same venue on-device.
    const tag = `venue-follow-${vendorId}-${kind}`;

    await Promise.all(
      followers.map((f) =>
        createUserNotification({ userId: f.userId, title, message: body, url, tag }).catch(
          () => {},
        ),
      ),
    );
    logger.info(
      { vendorId, kind, followers: followers.length },
      "Notified venue followers of update",
    );
  } catch (err) {
    // Never let notification failures break the venue's save flow.
    logger.warn({ err, vendorId, kind }, "notifyVenueFollowers failed");
  }
}
