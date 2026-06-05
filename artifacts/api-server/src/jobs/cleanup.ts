import { db, eventsTable, announcementsTable, notificationsTable, vendorsTable, usersTable, emailMessagesTable, emailAttachmentsTable, emailThreadsTable, drinkPlansTable, organizerEventsTable } from "@workspace/db";
import { and, ne, sql, lt, gte, eq, isNotNull, inArray } from "drizzle-orm";

const _istFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
function todayIstDate() { return _istFmt.format(new Date()); }
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";
import { sendUpcomingDeletionWarningEmail } from "../lib/notifications";

const objectStorage = new ObjectStorageService();

async function deleteImages(urls: (string | null | undefined)[]): Promise<number> {
  let failCount = 0;
  for (const url of urls) {
    if (!url) continue;
    try {
      await objectStorage.deleteObject(url);
    } catch (err) {
      failCount++;
      logger.warn({ err, url }, "Cleanup: failed to delete image from storage");
    }
  }
  return failCount;
}

export async function deletePastEvents(): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const rows = await db
      .select({
        id: eventsTable.id,
        imageUrl: eventsTable.imageUrl,
        galleryImages: eventsTable.galleryImages,
      })
      .from(eventsTable)
      .where(
        and(
          sql`${eventsTable.eventDate} IS NOT NULL`,
          lt(eventsTable.eventDate, cutoffStr),
          eq(eventsTable.retainForever, false),
        ),
      );

    if (rows.length === 0) return;

    const imageUrls: (string | null | undefined)[] = rows.flatMap((r) => [
      r.imageUrl,
      ...(r.galleryImages ?? []),
    ]);
    const imageFailCount = await deleteImages(imageUrls);

    const ids = rows.map((r) => r.id);
    await db.delete(eventsTable).where(inArray(eventsTable.id, ids));

    logger.info(
      { count: rows.length, imageFailCount },
      "Cleanup: deleted past events",
    );
  } catch (err) {
    logger.error({ err }, "Cleanup: failed to delete past events");
  }
}

export async function deleteExpiredAnnouncements(): Promise<void> {
  try {
    const today = todayIstDate();

    const rows = await db
      .select({
        id: announcementsTable.id,
        imageUrl: announcementsTable.imageUrl,
      })
      .from(announcementsTable)
      .where(
        and(
          ne(announcementsTable.announceDate, ""),
          sql`${announcementsTable.announceDate} < ${today}`,
        ),
      );

    if (rows.length === 0) return;

    const imageFailCount = await deleteImages(rows.map((r) => r.imageUrl));

    const ids = rows.map((r) => r.id);
    await db
      .delete(announcementsTable)
      .where(inArray(announcementsTable.id, ids));

    logger.info(
      { count: rows.length, imageFailCount },
      "Cleanup: deleted expired announcements",
    );
  } catch (err) {
    logger.error({ err }, "Cleanup: failed to delete expired announcements");
  }
}

// Delete drink plans whose explicit `validUntil` date has passed. Plans without
// a validUntil (day-of-week recurring offers) are kept so they keep firing on
// their selected weekdays.
export async function deleteExpiredDrinkPlans(): Promise<void> {
  try {
    const today = todayIstDate();

    const result = await db
      .delete(drinkPlansTable)
      .where(
        and(
          isNotNull(drinkPlansTable.validUntil),
          sql`${drinkPlansTable.validUntil} < ${today}`,
        ),
      )
      .returning({ id: drinkPlansTable.id });

    if (result.length === 0) return;

    logger.info({ count: result.length }, "Cleanup: deleted expired drink plans");
  } catch (err) {
    logger.error({ err }, "Cleanup: failed to delete expired drink plans");
  }
}

/**
 * Emails each partner whose events are 23–24 days past their event date —
 * i.e., will be auto-deleted in roughly 6–7 days by the 30-day cleanup rule.
 * Runs once per day so each vendor gets at most one warning email per window.
 */
export async function warnPartnersAboutUpcomingDeletion(): Promise<void> {
  try {
    const warningHigh = new Date();
    warningHigh.setDate(warningHigh.getDate() - 23);
    const warningLow = new Date();
    warningLow.setDate(warningLow.getDate() - 24);

    const highStr = warningHigh.toISOString().slice(0, 10);
    const lowStr = warningLow.toISOString().slice(0, 10);

    const rows = await db
      .select({
        eventId: eventsTable.id,
        eventTitle: eventsTable.title,
        eventDate: eventsTable.eventDate,
        vendorId: vendorsTable.id,
        vendorName: vendorsTable.businessName,
        ownerEmail: usersTable.email,
        ownerName: usersTable.name,
      })
      .from(eventsTable)
      .innerJoin(vendorsTable, eq(eventsTable.vendorId, vendorsTable.id))
      .innerJoin(usersTable, eq(vendorsTable.userId, usersTable.id))
      .where(
        and(
          sql`${eventsTable.eventDate} IS NOT NULL`,
          gte(eventsTable.eventDate, lowStr),
          lt(eventsTable.eventDate, highStr),
        ),
      );

    if (rows.length === 0) return;

    type VendorGroup = {
      vendorName: string;
      ownerEmail: string;
      ownerName: string;
      events: { id: number; title: string; eventDate: string }[];
    };
    const byVendor = new Map<number, VendorGroup>();

    for (const row of rows) {
      let group = byVendor.get(row.vendorId);
      if (!group) {
        group = {
          vendorName: row.vendorName,
          ownerEmail: row.ownerEmail,
          ownerName: row.ownerName,
          events: [],
        };
        byVendor.set(row.vendorId, group);
      }
      group.events.push({
        id: row.eventId,
        title: row.eventTitle,
        eventDate: row.eventDate ?? "",
      });
    }

    let emailsSent = 0;
    let emailsFailed = 0;

    for (const [vendorId, group] of byVendor) {
      try {
        await sendUpcomingDeletionWarningEmail({
          to: group.ownerEmail,
          toName: group.ownerName,
          vendorName: group.vendorName,
          events: group.events,
          daysLeft: 7,
        });
        emailsSent++;
      } catch (err) {
        emailsFailed++;
        logger.warn({ err, vendorId }, "Cleanup: failed to send deletion warning email");
      }
    }

    logger.info(
      { eventCount: rows.length, emailsSent, emailsFailed },
      "Cleanup: sent upcoming deletion warnings",
    );
  } catch (err) {
    logger.error({ err }, "Cleanup: failed to run upcoming deletion warnings");
  }
}

// Delete Event-Organizer events whose date has passed. "Past" = the event's
// end date (or start date when single-day) is before today (IST). Ticket tiers
// and ticket orders cascade-delete via their FKs. Cover/banner/gallery images
// are removed from storage too.
export async function deletePastOrganizerEvents(): Promise<void> {
  try {
    const today = todayIstDate();
    const rows = await db
      .select({
        id: organizerEventsTable.id,
        coverImageUrl: organizerEventsTable.coverImageUrl,
        bannerUrl: organizerEventsTable.bannerUrl,
        mobileBannerUrl: organizerEventsTable.mobileBannerUrl,
        galleryImages: organizerEventsTable.galleryImages,
      })
      .from(organizerEventsTable)
      .where(sql`COALESCE(${organizerEventsTable.endDate}, ${organizerEventsTable.startDate}) < ${today}`);

    if (rows.length === 0) return;

    const imageUrls: (string | null | undefined)[] = rows.flatMap((r) => [
      r.coverImageUrl, r.bannerUrl, r.mobileBannerUrl, ...(r.galleryImages ?? []),
    ]);
    const imageFailCount = await deleteImages(imageUrls);

    const ids = rows.map((r) => r.id);
    await db.delete(organizerEventsTable).where(inArray(organizerEventsTable.id, ids));

    logger.info({ count: rows.length, imageFailCount }, "Cleanup: deleted past organizer events");
  } catch (err) {
    logger.error({ err }, "Cleanup: failed to delete past organizer events");
  }
}

// SAFETY GUARD: This cleanup job only touches events, announcements, and
// notifications. Vendor/pub listings (vendorsTable), user accounts, bookings,
// and all other business records are NEVER deleted by any function here.
// Do not add any delete operation against vendorsTable or usersTable.

const NOTIFICATION_MAX_AGE_DAYS = 60;

export async function deleteOldNotifications(): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - NOTIFICATION_MAX_AGE_DAYS);

    const result = await db
      .delete(notificationsTable)
      .where(lt(notificationsTable.createdAt, cutoff))
      .returning({ id: notificationsTable.id });

    logger.info({ count: result.length }, "Cleanup: deleted old notifications");
  } catch (err) {
    logger.error({ err }, "Cleanup: failed to delete old notifications");
  }
}

// ─── Email retention ───────────────────────────────────────────────────────
//
// Keeps the email_* tables (and their attachment blobs) from growing without
// bound. Attachments are heavier than message rows, so they're purged sooner.

const EMAIL_ATTACHMENT_MAX_AGE_DAYS = 30;
const EMAIL_MESSAGE_MAX_AGE_DAYS = 90;

/** Delete email attachments (storage blob + row) older than 30 days. */
export async function deleteOldEmailAttachments(): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - EMAIL_ATTACHMENT_MAX_AGE_DAYS);

    const rows = await db
      .select({ id: emailAttachmentsTable.id, storageKey: emailAttachmentsTable.storageKey })
      .from(emailAttachmentsTable)
      .where(lt(emailAttachmentsTable.createdAt, cutoff));

    if (rows.length === 0) return;

    // deleteObject is a no-op for non-"/objects/" keys (e.g. Resend-hosted
    // inbound URLs), so passing every storageKey is safe.
    const fileFailCount = await deleteImages(rows.map((r) => r.storageKey));

    const ids = rows.map((r) => r.id);
    await db.delete(emailAttachmentsTable).where(inArray(emailAttachmentsTable.id, ids));

    logger.info({ count: rows.length, fileFailCount }, "Cleanup: deleted old email attachments");
  } catch (err) {
    logger.error({ err }, "Cleanup: failed to delete old email attachments");
  }
}

/** Delete email messages older than 90 days, then prune now-empty threads. */
export async function deleteOldEmails(): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - EMAIL_MESSAGE_MAX_AGE_DAYS);

    const msgs = await db
      .select({ id: emailMessagesTable.id })
      .from(emailMessagesTable)
      .where(lt(emailMessagesTable.createdAt, cutoff));
    const msgIds = msgs.map((m) => m.id);

    if (msgIds.length > 0) {
      // Free any attachment blobs first (DB rows cascade-delete with the
      // message, but the storage objects would otherwise be orphaned).
      const atts = await db
        .select({ storageKey: emailAttachmentsTable.storageKey })
        .from(emailAttachmentsTable)
        .where(inArray(emailAttachmentsTable.messageId, msgIds));
      await deleteImages(atts.map((a) => a.storageKey));

      await db.delete(emailMessagesTable).where(inArray(emailMessagesTable.id, msgIds));
    }

    // Remove conversation shells that no longer have any messages.
    const pruned = await db
      .delete(emailThreadsTable)
      .where(sql`NOT EXISTS (SELECT 1 FROM email_messages em WHERE em.thread_id = ${emailThreadsTable.id})`)
      .returning({ id: emailThreadsTable.id });

    logger.info({ messages: msgIds.length, threadsPruned: pruned.length }, "Cleanup: deleted old emails");
  } catch (err) {
    logger.error({ err }, "Cleanup: failed to delete old emails");
  }
}

export async function runCleanup(): Promise<void> {
  await warnPartnersAboutUpcomingDeletion();
  await deletePastEvents();
  await deletePastOrganizerEvents();
  await deleteExpiredAnnouncements();
  await deleteExpiredDrinkPlans();
  await deleteOldNotifications();
  await deleteOldEmailAttachments();
  await deleteOldEmails();
}
