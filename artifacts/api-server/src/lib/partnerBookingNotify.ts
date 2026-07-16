import { db, vendorsTable, organizersTable, gameOrganizersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { createUserNotification } from "./notify";
import { logger } from "./logger";

// ── Partner Booking Notification System — recipient resolution ─────────────
//
// Single source of truth for "who is the partner for this booking" and "how
// do we describe it", shared by the instant new-booking notify hooks (in
// bookings.ts / organizers.ts / gameOrganizers.ts / payments.ts) and the
// 30-minute-before-arrival reminder job (jobs/bookingReminders.ts), so all of
// them stay in sync.

export interface PartnerBookingLike {
  id: number;
  kind: string;
  vendorId: number;
  organizerId: number | null;
  hostVendorId: number | null;
  gameOrganizerId: number | null;
  personName: string;
  phone: string;
  bookingDate: string;
  arrivalTime: string | null;
  guests: number;
  pubMode: string;
  paymentMethod: string;
}

/** Dashboard root path per partner role, before the booking-report deep-link is appended. */
type DashboardRoot = "/dashboard/vendor" | "/dashboard/organizer" | "/dashboard/game-organizer";

/**
 * The Booking Report table lives under a different tab key per dashboard: the
 * vendor dashboard has a dedicated "bookings" tab, while the organizer and
 * game-organizer dashboards fold their booking report into their "insights" tab.
 */
const BOOKING_REPORT_TAB: Record<DashboardRoot, string> = {
  "/dashboard/vendor": "bookings",
  "/dashboard/organizer": "insights",
  "/dashboard/game-organizer": "insights",
};

/** Deep-links straight to the Booking Report tab with this booking auto-opened in the detail modal. */
function bookingDeepLink(root: DashboardRoot, bookingId: number): string {
  return `${root}?tab=${BOOKING_REPORT_TAB[root]}&bookingId=${bookingId}`;
}

export interface PartnerRecipient {
  userId: number;
  dashboardUrl: string;
}

/**
 * Admin-owned venues/organizers that haven't been assigned to a partner yet
 * use the sentinel owner id 0 (see admin.ts) — there is no real user to
 * notify, so callers must filter these out before calling createUserNotification.
 */
function isRealUserId(userId: number | null | undefined): userId is number {
  return typeof userId === "number" && userId > 0;
}

/** Human label for the booking type shown in partner-facing notifications. */
export function bookingTypeLabel(pubMode: string): string {
  switch (pubMode) {
    case "event":
      return "Table";
    case "vip_table":
      return "VIP Table";
    case "ticket":
      return "Ticket";
    case "event_booking":
      return "Event Ticket";
    case "game_booking":
      return "Game Booking";
    default:
      return "Booking";
  }
}

/** Resolve the partner user(s) who own a given booking, for a single booking. */
export async function resolvePartnerRecipients(b: PartnerBookingLike): Promise<PartnerRecipient[]> {
  if (b.kind === "game") {
    if (!b.gameOrganizerId) return [];
    const [go] = await db
      .select({ userId: gameOrganizersTable.userId })
      .from(gameOrganizersTable)
      .where(eq(gameOrganizersTable.id, b.gameOrganizerId))
      .limit(1);
    return go && isRealUserId(go.userId)
      ? [{ userId: go.userId, dashboardUrl: bookingDeepLink("/dashboard/game-organizer", b.id) }]
      : [];
  }

  if (b.kind === "organizer") {
    const recipients: PartnerRecipient[] = [];
    if (b.organizerId) {
      const [org] = await db
        .select({ userId: organizersTable.userId })
        .from(organizersTable)
        .where(eq(organizersTable.id, b.organizerId))
        .limit(1);
      if (org && isRealUserId(org.userId)) {
        recipients.push({ userId: org.userId, dashboardUrl: bookingDeepLink("/dashboard/organizer", b.id) });
      }
    }
    if (b.hostVendorId) {
      const [v] = await db
        .select({ userId: vendorsTable.userId })
        .from(vendorsTable)
        .where(eq(vendorsTable.id, b.hostVendorId))
        .limit(1);
      if (v && isRealUserId(v.userId)) {
        recipients.push({ userId: v.userId, dashboardUrl: bookingDeepLink("/dashboard/vendor", b.id) });
      }
    }
    return recipients;
  }

  // kind === "pub"
  const [v] = await db
    .select({ userId: vendorsTable.userId })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, b.vendorId))
    .limit(1);
  return v && isRealUserId(v.userId)
    ? [{ userId: v.userId, dashboardUrl: bookingDeepLink("/dashboard/vendor", b.id) }]
    : [];
}

/**
 * Batched recipient resolution for many bookings at once (used by the
 * reminder job's tick loop, so a busy 5-minute tick doesn't N+1 query).
 * Returns a map keyed by booking id.
 */
export async function loadPartnerRecipientMaps(
  bookings: PartnerBookingLike[],
): Promise<Map<number, PartnerRecipient[]>> {
  const vendorIds = new Set<number>();
  const organizerIds = new Set<number>();
  const gameOrganizerIds = new Set<number>();

  for (const b of bookings) {
    if (b.kind === "game") {
      if (b.gameOrganizerId) gameOrganizerIds.add(b.gameOrganizerId);
    } else if (b.kind === "organizer") {
      if (b.organizerId) organizerIds.add(b.organizerId);
      if (b.hostVendorId) vendorIds.add(b.hostVendorId);
    } else {
      vendorIds.add(b.vendorId);
    }
  }

  const [vendors, organizers, gameOrganizers] = await Promise.all([
    vendorIds.size
      ? db.select({ id: vendorsTable.id, userId: vendorsTable.userId }).from(vendorsTable).where(inArray(vendorsTable.id, [...vendorIds]))
      : Promise.resolve([]),
    organizerIds.size
      ? db.select({ id: organizersTable.id, userId: organizersTable.userId }).from(organizersTable).where(inArray(organizersTable.id, [...organizerIds]))
      : Promise.resolve([]),
    gameOrganizerIds.size
      ? db.select({ id: gameOrganizersTable.id, userId: gameOrganizersTable.userId }).from(gameOrganizersTable).where(inArray(gameOrganizersTable.id, [...gameOrganizerIds]))
      : Promise.resolve([]),
  ]);

  const vendorMap = new Map(vendors.map((v) => [v.id, v.userId]));
  const organizerMap = new Map(organizers.map((o) => [o.id, o.userId]));
  const gameOrganizerMap = new Map(gameOrganizers.map((g) => [g.id, g.userId]));

  const result = new Map<number, PartnerRecipient[]>();
  for (const b of bookings) {
    const recipients: PartnerRecipient[] = [];
    if (b.kind === "game") {
      const userId = b.gameOrganizerId ? gameOrganizerMap.get(b.gameOrganizerId) : undefined;
      if (isRealUserId(userId)) recipients.push({ userId, dashboardUrl: bookingDeepLink("/dashboard/game-organizer", b.id) });
    } else if (b.kind === "organizer") {
      const orgUserId = b.organizerId ? organizerMap.get(b.organizerId) : undefined;
      if (isRealUserId(orgUserId)) recipients.push({ userId: orgUserId, dashboardUrl: bookingDeepLink("/dashboard/organizer", b.id) });
      const venueUserId = b.hostVendorId ? vendorMap.get(b.hostVendorId) : undefined;
      if (isRealUserId(venueUserId)) recipients.push({ userId: venueUserId, dashboardUrl: bookingDeepLink("/dashboard/vendor", b.id) });
    } else {
      const userId = vendorMap.get(b.vendorId);
      if (isRealUserId(userId)) recipients.push({ userId, dashboardUrl: bookingDeepLink("/dashboard/vendor", b.id) });
    }
    result.set(b.id, recipients);
  }
  return result;
}

const TABLE_MODES = new Set(["event", "vip_table"]);

/** "2026-07-19" → "Saturday, 19 July 2026". Parsed at local noon to dodge timezone date-shift. */
function formatLongDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

/** "20:30" → "8:30 PM". Returns null for anything that doesn't parse as HH:MM. */
function formatTime12h(time: string | null): string | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${suffix}`;
}

function paymentModeLabel(paymentMethod: string): string {
  return paymentMethod === "cod" ? "Cash on Arrival" : "Online Payment";
}

/** "a Table for 4 guests" / "a VIP Table" / "2 tickets" — the natural-language noun phrase for what was booked. */
function countPhrase(b: PartnerBookingLike): string {
  const type = bookingTypeLabel(b.pubMode);
  if (TABLE_MODES.has(b.pubMode)) {
    return b.guests > 1 ? `a ${type} for ${b.guests} guests` : `a ${type}`;
  }
  return `${b.guests} ticket${b.guests === 1 ? "" : "s"}`;
}

function formatNewBookingMessage(b: PartnerBookingLike): string {
  const name = b.personName || "Guest";
  const longDate = formatLongDate(b.bookingDate);
  const time = formatTime12h(b.arrivalTime);
  const atTime = time ? ` at ${time}` : "";
  const mode = paymentModeLabel(b.paymentMethod);
  return `${name} has booked ${countPhrase(b)} for ${longDate}${atTime} via ${mode}. Tap to view booking details.`;
}

/** Fire the instant "New booking received" notification to every partner who owns this booking. */
export async function notifyPartnerNewBooking(b: PartnerBookingLike): Promise<void> {
  try {
    const recipients = await resolvePartnerRecipients(b);
    if (recipients.length === 0) return;
    const message = formatNewBookingMessage(b);
    await Promise.all(
      recipients.map((r) =>
        createUserNotification({
          userId: r.userId,
          title: "🎉 New Booking Received",
          message,
          url: r.dashboardUrl,
          tag: `booking-new-${b.id}-${r.userId}`,
          type: "booking_new",
          callPhone: b.phone || undefined,
        }),
      ),
    );
  } catch (err) {
    logger.warn({ err, bookingId: b.id }, "[partnerBookingNotify] Failed to notify partner of new booking");
  }
}

/** 30-minute-before-arrival reminder message + send, for a single recipient (used by the reminder job). */
export async function sendPartnerArrivalReminder(recipient: PartnerRecipient, b: PartnerBookingLike): Promise<void> {
  const name = b.personName || "Guest";
  const message = `${name} is expected to arrive in 30 minutes. Please be ready to welcome your guest.`;
  await createUserNotification({
    userId: recipient.userId,
    title: "📍 Guest Arriving Soon",
    message,
    url: recipient.dashboardUrl,
    tag: `partner-reminder-${b.id}-${recipient.userId}`,
    type: "booking_reminder_partner",
    callPhone: b.phone || undefined,
  });
}
