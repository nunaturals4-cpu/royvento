import { db, eventsTable, announcementsTable, vendorsTable, usersTable } from "@workspace/db";
import { and, ne, sql, lt, gte, eq } from "drizzle-orm";
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
    await db.delete(eventsTable).where(sql`${eventsTable.id} = ANY(${ids})`);

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
    const today = new Date().toISOString().slice(0, 10);

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
      .where(sql`${announcementsTable.id} = ANY(${ids})`);

    logger.info(
      { count: rows.length, imageFailCount },
      "Cleanup: deleted expired announcements",
    );
  } catch (err) {
    logger.error({ err }, "Cleanup: failed to delete expired announcements");
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

export async function runCleanup(): Promise<void> {
  await warnPartnersAboutUpcomingDeletion();
  await deletePastEvents();
  await deleteExpiredAnnouncements();
}
