import { db, eventsTable, announcementsTable } from "@workspace/db";
import { and, ne, sql, lt } from "drizzle-orm";
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";

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

export async function runCleanup(): Promise<void> {
  await deletePastEvents();
  await deleteExpiredAnnouncements();
}
