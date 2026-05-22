import { db, usersTable, pointsLedgerTable } from "@workspace/db";
import { eq, and, lt, lte, gt, gte, isNotNull, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { createUserNotification } from "../lib/notify";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Expire all points ledger entries whose expiresAt has passed.
 * For each expired entry, subtract those points from usersTable.points
 * and mark the entry as expired.
 */
async function expirePoints(): Promise<void> {
  const now = new Date();
  const expiredRows = await db
    .select()
    .from(pointsLedgerTable)
    .where(
      and(
        isNotNull(pointsLedgerTable.expiresAt),
        lte(pointsLedgerTable.expiresAt, now),
        eq(pointsLedgerTable.expired, false),
        gt(pointsLedgerTable.points, 0),
      ),
    )
    .limit(500);

  if (expiredRows.length === 0) return;

  // Group by userId to batch the deductions
  const byUser = new Map<number, number>();
  for (const row of expiredRows) {
    byUser.set(row.userId, (byUser.get(row.userId) ?? 0) + row.points);
  }

  for (const [userId, totalExpired] of byUser) {
    try {
      await db
        .update(usersTable)
        .set({ points: sql`GREATEST(0, ${usersTable.points} - ${totalExpired})` })
        .where(eq(usersTable.id, userId));

      await db
        .insert(pointsLedgerTable)
        .values({
          userId,
          points: -totalExpired,
          source: "expiry",
        });
    } catch (err) {
      logger.error({ err, userId, totalExpired }, "Failed to deduct expired points");
    }
  }

  // Mark all as expired
  const ids = expiredRows.map((r) => r.id);
  for (const id of ids) {
    await db.update(pointsLedgerTable).set({ expired: true }).where(eq(pointsLedgerTable.id, id)).catch(() => {});
  }

  logger.info({ count: expiredRows.length, usersAffected: byUser.size }, "Points expiry run complete");
}

/**
 * Send reminder notifications for points expiring soon.
 * Fires on day 20, 23, 26, 29 from when the points were earned.
 * "Day N" = earned N days ago (expiresAt = now + (30 - N) days).
 */
async function sendExpiryReminders(): Promise<void> {
  const now = new Date();

  const reminders: Array<{
    daysElapsed: number;
    daysLeft: number;
    field: "notifiedDay20" | "notifiedDay23" | "notifiedDay26" | "notifiedDay29";
  }> = [
    { daysElapsed: 20, daysLeft: 10, field: "notifiedDay20" },
    { daysElapsed: 23, daysLeft: 7,  field: "notifiedDay23" },
    { daysElapsed: 26, daysLeft: 4,  field: "notifiedDay26" },
    { daysElapsed: 29, daysLeft: 1,  field: "notifiedDay29" },
  ];

  for (const { daysElapsed, daysLeft, field } of reminders) {
    // expiresAt window: entries whose expiry is in (daysLeft-1, daysLeft] days
    const windowEnd = new Date(now.getTime() + daysLeft * 24 * 60 * 60 * 1000);
    const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);

    const rows = await db
      .select()
      .from(pointsLedgerTable)
      .where(
        and(
          isNotNull(pointsLedgerTable.expiresAt),
          gt(pointsLedgerTable.expiresAt, windowStart),
          lte(pointsLedgerTable.expiresAt, windowEnd),
          eq(pointsLedgerTable.expired, false),
          eq(pointsLedgerTable[field], false),
          gt(pointsLedgerTable.points, 0),
        ),
      )
      .limit(500);

    for (const row of rows) {
      try {
        await createUserNotification({
          userId: row.userId,
          title: `Your ${row.points} points expire in ${daysLeft} day${daysLeft === 1 ? "" : "s"}!`,
          message: `Redeem your ${row.points} reward points before they expire. Use them on your next booking!`,
        });
        await db
          .update(pointsLedgerTable)
          .set({ [field]: true })
          .where(eq(pointsLedgerTable.id, row.id));
      } catch (err) {
        logger.error({ err, ledgerRowId: row.id, field }, "Failed to send points expiry reminder");
      }
    }
  }
}

/**
 * Main entry point. Called once daily at 11:00 AM IST by the cron scheduler.
 */
export async function runPointsExpiry(): Promise<void> {
  logger.info("Points expiry job started");
  try {
    await expirePoints();
    await sendExpiryReminders();
  } catch (err) {
    logger.error({ err }, "Points expiry job failed");
  }
  logger.info("Points expiry job done");
}
