import { db, bookingsTable, eventsTable, vendorsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, inArray, and, gte, isNotNull, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { createUserNotification } from "../lib/notify";
import { sendExpoPushWithToken } from "../lib/expoPush";
import { loadPartnerRecipientMaps, sendPartnerArrivalReminder, type PartnerBookingLike } from "../lib/partnerBookingNotify";

const _istFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
/** Returns today's date string (YYYY-MM-DD) in IST (Asia/Kolkata). */
function getTodayIST(): string {
  return _istFmt.format(new Date());
}

/** Returns the start of today in IST as a UTC Date (for dedup queries). */
function getTodayStartUTC(): Date {
  const todayIST = getTodayIST();
  return new Date(`${todayIST}T00:00:00+05:30`);
}

/** Returns the current IST clock as total minutes since midnight. */
function getNowISTMinutes(): number {
  const now = new Date();
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/**
 * Parse "HH:MM" or "HH:MM:SS" into total minutes since midnight.
 * Returns null for blank/invalid values.
 */
function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const parts = timeStr.trim().split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

type BookingRow = {
  id: number;
  userId: number;
  eventId: number;
  vendorId: number;
  pubMode: string;
  arrivalTime: string | null;
  // Extra columns needed by the partner reminder job (unused by the
  // customer-facing reminders below, but fetched once for both).
  kind: string;
  organizerId: number | null;
  hostVendorId: number | null;
  gameOrganizerId: number | null;
  personName: string;
  phone: string;
  bookingDate: string;
  guests: number;
  paymentMethod: string;
};

async function fetchTodaysBookings(todayIST: string, requireArrivalTime = false): Promise<BookingRow[]> {
  const conditions = [
    eq(bookingsTable.bookingDate, todayIST),
    inArray(bookingsTable.status, ["confirmed", "completed"]),
    ...(requireArrivalTime ? [isNotNull(bookingsTable.arrivalTime)] : []),
  ];

  return db
    .select({
      id: bookingsTable.id,
      userId: bookingsTable.userId,
      eventId: bookingsTable.eventId,
      vendorId: bookingsTable.vendorId,
      pubMode: bookingsTable.pubMode,
      arrivalTime: bookingsTable.arrivalTime,
      kind: bookingsTable.kind,
      organizerId: bookingsTable.organizerId,
      hostVendorId: bookingsTable.hostVendorId,
      gameOrganizerId: bookingsTable.gameOrganizerId,
      personName: bookingsTable.personName,
      phone: bookingsTable.phone,
      bookingDate: bookingsTable.bookingDate,
      guests: bookingsTable.guests,
      paymentMethod: bookingsTable.paymentMethod,
    })
    .from(bookingsTable)
    .where(and(...conditions));
}

function toPartnerBookingLike(b: BookingRow): PartnerBookingLike {
  return {
    id: b.id,
    kind: b.kind,
    vendorId: b.vendorId,
    organizerId: b.organizerId,
    hostVendorId: b.hostVendorId,
    gameOrganizerId: b.gameOrganizerId,
    personName: b.personName,
    phone: b.phone,
    bookingDate: b.bookingDate,
    arrivalTime: b.arrivalTime,
    guests: b.guests,
    pubMode: b.pubMode,
    paymentMethod: b.paymentMethod,
  };
}

/** Exact-tag dedup — has a notification with this tag already been sent to this user today? */
async function alreadySentTag(userId: number, tag: string, todayStartUTC: Date): Promise<boolean> {
  const existing = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.tag, tag),
        gte(notificationsTable.createdAt, todayStartUTC),
      ),
    )
    .limit(1);
  return existing.length > 0;
}

async function loadMaps(bookings: BookingRow[]) {
  if (bookings.length === 0) {
    return {
      eventMap: new Map<number, string>(),
      vendorMap: new Map<number, string>(),
      userMap: new Map<number, string | null | undefined>(),
    };
  }

  const eventIds = [...new Set(bookings.map((b) => b.eventId))];
  const vendorIds = [...new Set(bookings.map((b) => b.vendorId))];
  const userIds = [...new Set(bookings.map((b) => b.userId))];

  const [events, vendors, users] = await Promise.all([
    db.select({ id: eventsTable.id, title: eventsTable.title }).from(eventsTable).where(inArray(eventsTable.id, eventIds)),
    db.select({ id: vendorsTable.id, businessName: vendorsTable.businessName }).from(vendorsTable).where(inArray(vendorsTable.id, vendorIds)),
    db.select({ id: usersTable.id, expoPushToken: usersTable.expoPushToken }).from(usersTable).where(inArray(usersTable.id, userIds)),
  ]);

  return {
    eventMap: new Map(events.map((e) => [e.id, e.title])),
    vendorMap: new Map(vendors.map((v) => [v.id, v.businessName])),
    userMap: new Map(users.map((u) => [u.id, u.expoPushToken])),
  };
}

/**
 * Checks whether a reminder with this title has already been sent for this
 * booking today. Returns true (already sent) if a matching notification exists.
 */
async function alreadySentToday(userId: number, notifTitle: string, refCode: string, todayStartUTC: Date): Promise<boolean> {
  const existing = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.title, notifTitle),
        sql`${notificationsTable.message} LIKE ${"%" + refCode + "%"}`,
        gte(notificationsTable.createdAt, todayStartUTC),
      ),
    )
    .limit(1);
  return existing.length > 0;
}

async function dispatch(
  booking: BookingRow,
  eventMap: Map<number, string>,
  vendorMap: Map<number, string>,
  userMap: Map<number, string | null | undefined>,
  notifTitle: string,
  notifTag: string,
  todayStartUTC: Date,
): Promise<"sent" | "skipped" | "no_user"> {
  if (!userMap.has(booking.userId)) return "no_user";

  const refCode = `#RV-${String(booking.id).padStart(6, "0")}`;

  if (await alreadySentToday(booking.userId, notifTitle, refCode, todayStartUTC)) return "skipped";

  const eventTitle = eventMap.get(booking.eventId) ?? "your event";
  const vendorName = vendorMap.get(booking.vendorId) ?? "the venue";
  const bookingKind =
    booking.pubMode === "ticket" ? "ticket booking"
    : booking.pubMode === "event" ? "event booking"
    : "table booking";

  const timeRef = booking.arrivalTime ? `at ${booking.arrivalTime}` : "";
  const message = timeRef
    ? `${refCode}: You have a ${bookingKind} for "${eventTitle}" at ${vendorName} today ${timeRef}. Don't miss it!`
    : `${refCode}: You have a ${bookingKind} for "${eventTitle}" at ${vendorName} today. Don't miss it!`;

  await createUserNotification({
    userId: booking.userId,
    title: notifTitle,
    message,
    url: "/dashboard/bookings",
    tag: notifTag,
  });

  const expoPushToken = userMap.get(booking.userId);
  if (expoPushToken) {
    sendExpoPushWithToken(booking.userId, expoPushToken, {
      title: notifTitle,
      body: message,
      data: { screen: "bookings", bookingId: booking.id },
    }).catch(() => {});
  }

  return "sent";
}

/**
 * Fires at 10:00 AM IST every day.
 * Sends a morning reminder to every user with a confirmed/completed booking today.
 */
export async function runMorningReminders(): Promise<void> {
  const todayIST = getTodayIST();
  const todayStartUTC = getTodayStartUTC();
  const notifTitle = "Booking Reminder · 10 AM";

  logger.info({ todayIST }, "[bookingReminders] Starting morning (10 AM) reminder job");

  try {
    const bookings = await fetchTodaysBookings(todayIST);

    if (bookings.length === 0) {
      logger.info("[bookingReminders] No bookings today — nothing to remind (morning)");
      return;
    }

    const { eventMap, vendorMap, userMap } = await loadMaps(bookings);

    let sent = 0;
    let skipped = 0;

    for (const booking of bookings) {
      try {
        const result = await dispatch(booking, eventMap, vendorMap, userMap, notifTitle, `reminder-${booking.id}-morning`, todayStartUTC);
        if (result === "sent") sent++;
        else skipped++;
      } catch (err) {
        logger.warn({ err, bookingId: booking.id }, "[bookingReminders] Failed to send morning reminder");
      }
    }

    logger.info({ sent, skipped }, "[bookingReminders] Morning reminder job complete");
  } catch (err) {
    logger.error({ err }, "[bookingReminders] Morning reminder job failed");
  }
}

/**
 * Runs every 5 minutes.
 * For each booking whose arrivalTime is ~2 hours from now (within the current
 * 5-minute tick window), sends one pre-arrival reminder. Deduplication via
 * the notifications table prevents double-sending if the job overlaps.
 */
export async function runPreArrivalReminders(): Promise<void> {
  const todayIST = getTodayIST();
  const todayStartUTC = getTodayStartUTC();
  const nowMinutes = getNowISTMinutes();
  const notifTitle = "Booking Reminder · 2 hrs before arrival";

  try {
    // Only fetch bookings that have an arrivalTime set
    const bookings = await fetchTodaysBookings(todayIST, true);

    // Keep only those whose (arrivalTime - 2h) falls within this 5-minute tick
    const due = bookings.filter((b) => {
      const arrMinutes = parseTimeToMinutes(b.arrivalTime);
      if (arrMinutes === null) return false;
      const targetMinutes = arrMinutes - 120; // 2 hours before
      return nowMinutes >= targetMinutes && nowMinutes < targetMinutes + 5;
    });

    if (due.length === 0) return;

    logger.info({ count: due.length, nowMinutes }, "[bookingReminders] Pre-arrival reminders due");

    const { eventMap, vendorMap, userMap } = await loadMaps(due);

    let sent = 0;
    let skipped = 0;

    for (const booking of due) {
      try {
        const result = await dispatch(booking, eventMap, vendorMap, userMap, notifTitle, `reminder-${booking.id}-pre_arrival`, todayStartUTC);
        if (result === "sent") sent++;
        else skipped++;
      } catch (err) {
        logger.warn({ err, bookingId: booking.id }, "[bookingReminders] Failed to send pre-arrival reminder");
      }
    }

    logger.info({ sent, skipped }, "[bookingReminders] Pre-arrival reminder tick complete");
  } catch (err) {
    logger.error({ err }, "[bookingReminders] Pre-arrival reminder job failed");
  }
}

/**
 * Runs every 5 minutes.
 * For each booking whose arrivalTime is ~30 minutes from now (within the
 * current 5-minute tick window), sends one "guest arriving soon" reminder to
 * the partner(s) who own it (vendor / organizer / game organizer). Because
 * this re-reads live booking rows every tick — instead of consulting a
 * pre-scheduled row — a cancelled booking simply drops out of the
 * confirmed/completed filter and a rescheduled arrivalTime is picked up by
 * the next tick, with no separate invalidation step required.
 */
export async function runPartnerPreArrivalReminders(): Promise<void> {
  const todayIST = getTodayIST();
  const todayStartUTC = getTodayStartUTC();
  const nowMinutes = getNowISTMinutes();

  try {
    const bookings = await fetchTodaysBookings(todayIST, true);

    // Keep only those whose (arrivalTime - 30min) falls within this 5-minute tick
    const due = bookings.filter((b) => {
      const arrMinutes = parseTimeToMinutes(b.arrivalTime);
      if (arrMinutes === null) return false;
      const targetMinutes = arrMinutes - 30;
      return nowMinutes >= targetMinutes && nowMinutes < targetMinutes + 5;
    });

    if (due.length === 0) return;

    logger.info({ count: due.length, nowMinutes }, "[bookingReminders] Partner pre-arrival reminders due");

    const partnerLikes = due.map(toPartnerBookingLike);
    const recipientMap = await loadPartnerRecipientMaps(partnerLikes);

    let sent = 0;
    let skipped = 0;

    for (const b of partnerLikes) {
      const recipients = recipientMap.get(b.id) ?? [];
      for (const recipient of recipients) {
        const tag = `partner-reminder-${b.id}-${recipient.userId}`;
        try {
          if (await alreadySentTag(recipient.userId, tag, todayStartUTC)) {
            skipped++;
            continue;
          }
          await sendPartnerArrivalReminder(recipient, b);
          sent++;
        } catch (err) {
          logger.warn({ err, bookingId: b.id, userId: recipient.userId }, "[bookingReminders] Failed to send partner pre-arrival reminder");
        }
      }
    }

    logger.info({ sent, skipped }, "[bookingReminders] Partner pre-arrival reminder tick complete");
  } catch (err) {
    logger.error({ err }, "[bookingReminders] Partner pre-arrival reminder job failed");
  }
}
