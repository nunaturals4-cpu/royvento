import { db, bookingsTable, eventsTable, vendorsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, inArray, and, gte, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendWebPushToUser } from "../routes/webPush";
import { sendExpoPushWithToken } from "../lib/expoPush";

export type ReminderSlot = "morning" | "evening";

/** Returns today's date string (YYYY-MM-DD) in IST (UTC+5:30). */
function getTodayIST(): string {
  const now = new Date();
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

/** Returns the start of today in IST as a UTC Date (for dedup queries). */
function getTodayStartUTC(): Date {
  const todayIST = getTodayIST();
  // midnight IST = midnight UTC-5:30 = previous day 18:30 UTC
  return new Date(`${todayIST}T00:00:00+05:30`);
}

function slotLabel(slot: ReminderSlot): string {
  return slot === "morning" ? "10 AM" : "5 PM";
}

/**
 * Sends booking-day reminder notifications.
 * Fires at 10 AM IST (morning) and 5 PM IST (evening) via cron.
 * Sends an in-app notification + web push + Expo push for every confirmed/completed
 * booking whose bookingDate is today (IST). Deduplicates to prevent double-sending
 * if the server restarts while a cron window is active.
 */
export async function runBookingReminders(slot: ReminderSlot): Promise<void> {
  const todayIST = getTodayIST();
  const todayStartUTC = getTodayStartUTC();
  const label = slotLabel(slot);

  logger.info({ slot, todayIST }, `[bookingReminders] Starting ${label} reminder job`);

  try {
    // Fetch all confirmed/completed bookings for today (IST)
    const bookings = await db
      .select({
        id: bookingsTable.id,
        userId: bookingsTable.userId,
        eventId: bookingsTable.eventId,
        vendorId: bookingsTable.vendorId,
        pubMode: bookingsTable.pubMode,
        arrivalTime: bookingsTable.arrivalTime,
      })
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.bookingDate, todayIST),
          inArray(bookingsTable.status, ["confirmed", "completed"]),
        ),
      );

    if (bookings.length === 0) {
      logger.info({ slot }, "[bookingReminders] No bookings today — nothing to remind");
      return;
    }

    // Batch-load events, vendors, users (including push tokens)
    const eventIds = [...new Set(bookings.map((b) => b.eventId))];
    const vendorIds = [...new Set(bookings.map((b) => b.vendorId))];
    const userIds = [...new Set(bookings.map((b) => b.userId))];

    const [events, vendors, users] = await Promise.all([
      db.select({ id: eventsTable.id, title: eventsTable.title }).from(eventsTable).where(inArray(eventsTable.id, eventIds)),
      db.select({ id: vendorsTable.id, businessName: vendorsTable.businessName }).from(vendorsTable).where(inArray(vendorsTable.id, vendorIds)),
      db.select({ id: usersTable.id, expoPushToken: usersTable.expoPushToken }).from(usersTable).where(inArray(usersTable.id, userIds)),
    ]);

    const eventMap = new Map(events.map((e) => [e.id, e.title]));
    const vendorMap = new Map(vendors.map((v) => [v.id, v.businessName]));
    const userMap = new Map(users.map((u) => [u.id, u.expoPushToken]));

    const notifTitle = `Booking Reminder · ${label}`;

    let sent = 0;
    let skipped = 0;

    for (const booking of bookings) {
      if (!userMap.has(booking.userId)) continue;

      const eventTitle = eventMap.get(booking.eventId) ?? "your event";
      const vendorName = vendorMap.get(booking.vendorId) ?? "the venue";
      const refCode = `#RV-${String(booking.id).padStart(6, "0")}`;

      // Deduplicate: skip if a reminder for this booking+slot was already sent today
      const existing = await db
        .select({ id: notificationsTable.id })
        .from(notificationsTable)
        .where(
          and(
            eq(notificationsTable.userId, booking.userId),
            eq(notificationsTable.title, notifTitle),
            sql`${notificationsTable.message} LIKE ${"%" + refCode + "%"}`,
            gte(notificationsTable.createdAt, todayStartUTC),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const bookingKind =
        booking.pubMode === "ticket"
          ? "ticket booking"
          : booking.pubMode === "event"
          ? "event booking"
          : "table booking";

      // Always include a time reference — use the booking's arrival time if set,
      // otherwise show the slot reminder time so the message always answers "when?"
      const timeRef = booking.arrivalTime
        ? `at ${booking.arrivalTime}`
        : `— reminder sent at ${label}`;

      const message =
        `${refCode}: You have a ${bookingKind} for "${eventTitle}" at ${vendorName} today ${timeRef}. Don't miss it! 🎉`;

      try {
        await db.insert(notificationsTable).values({
          userId: booking.userId,
          title: notifTitle,
          message,
        });

        sendWebPushToUser(booking.userId, {
          title: notifTitle,
          body: message,
          url: "/dashboard/bookings",
          tag: `reminder-${booking.id}-${slot}`,
        }).catch(() => {});

        const expoPushToken = userMap.get(booking.userId);
        if (expoPushToken) {
          sendExpoPushWithToken(booking.userId, expoPushToken, {
            title: notifTitle,
            body: message,
            data: { screen: "bookings", bookingId: booking.id },
          }).catch(() => {});
        }

        sent++;
      } catch (err) {
        logger.warn({ err, bookingId: booking.id, slot }, "[bookingReminders] Failed to send reminder");
      }
    }

    logger.info({ slot, sent, skipped }, `[bookingReminders] ${label} reminder job complete`);
  } catch (err) {
    logger.error({ err, slot }, "[bookingReminders] Job failed");
  }
}
