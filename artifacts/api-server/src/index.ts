import app from "./app";
import { logger } from "./lib/logger";
import { db, announcementsTable } from "@workspace/db";
import { and, ne, sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function deleteExpiredAnnouncements() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await db
      .delete(announcementsTable)
      .where(
        and(
          ne(announcementsTable.announceDate, ""),
          sql`${announcementsTable.announceDate} < ${today}`,
        ),
      )
      .returning({ id: announcementsTable.id });
    if (result.length > 0) {
      logger.info({ count: result.length }, "Deleted expired announcements");
    }
  } catch (err) {
    logger.error({ err }, "Failed to delete expired announcements");
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  deleteExpiredAnnouncements();
  setInterval(deleteExpiredAnnouncements, 60 * 60 * 1000);
});
