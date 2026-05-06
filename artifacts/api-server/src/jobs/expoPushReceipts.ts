import { db, usersTable, expoPushTicketsTable } from "@workspace/db";
import { and, eq, gt, inArray } from "drizzle-orm";
import { fetchExpoReceipts, deleteExpiredTickets } from "../lib/expoPush";
import { logger } from "../lib/logger";

/** Maximum ticket IDs to send per getReceipts call (Expo recommends ≤ 300). */
const BATCH_SIZE = 300;

/**
 * Poll Expo's delivery-receipt endpoint for all stored ticket IDs.
 *
 * For each ticket:
 *   - "ok"  → receipt confirmed delivered; delete the ticket row.
 *   - "error" + DeviceNotRegistered → clear users.expo_push_token and delete the row.
 *   - other errors → log and delete the row (no retry; tickets expire in 24 h).
 *
 * Also prunes expired ticket rows as a safety net.
 */
export async function runExpoPushReceiptPoll(): Promise<void> {
  logger.info("[ExpoPushReceipts] Starting receipt-poll job");

  try {
    await deleteExpiredTickets();

    const allRows = await db
      .select({
        id: expoPushTicketsTable.id,
        ticketId: expoPushTicketsTable.ticketId,
        userId: expoPushTicketsTable.userId,
        token: expoPushTicketsTable.token,
        expiresAt: expoPushTicketsTable.expiresAt,
      })
      .from(expoPushTicketsTable)
      .where(gt(expoPushTicketsTable.expiresAt, new Date()));

    if (allRows.length === 0) {
      logger.info("[ExpoPushReceipts] No pending tickets — nothing to poll");
      return;
    }

    logger.info({ count: allRows.length }, "[ExpoPushReceipts] Polling receipts for tickets");

    let totalOk = 0;
    let totalErrors = 0;
    let totalTokensCleared = 0;
    const processedDbIds: number[] = [];

    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      const batch = allRows.slice(i, i + BATCH_SIZE);
      const ticketIds = batch.map((r) => r.ticketId);

      let receipts: Awaited<ReturnType<typeof fetchExpoReceipts>>;
      try {
        receipts = await fetchExpoReceipts(ticketIds);
      } catch (err) {
        logger.warn({ err, batchStart: i }, "[ExpoPushReceipts] Failed to fetch receipt batch — will retry on next run");
        continue;
      }

      for (const row of batch) {
        const receipt = receipts[row.ticketId];

        if (!receipt) {
          logger.warn({ ticketId: row.ticketId, userId: row.userId }, "[ExpoPushReceipts] No receipt returned for ticket — may not be ready yet");
          continue;
        }

        processedDbIds.push(row.id);

        if (receipt.status === "ok") {
          totalOk++;
        } else {
          totalErrors++;
          const errorCode = receipt.details?.error;
          logger.warn(
            { ticketId: row.ticketId, userId: row.userId, message: receipt.message, errorCode },
            "[ExpoPushReceipts] Delivery failure receipt",
          );

          if (errorCode === "DeviceNotRegistered") {
            try {
              // Only clear the token if the user hasn't re-registered a new one in the
              // meantime. Matching on the stored token prevents wiping a valid fresh token
              // due to a stale receipt from an old registration.
              const result = await db
                .update(usersTable)
                .set({ expoPushToken: null })
                .where(
                  and(
                    eq(usersTable.id, row.userId),
                    eq(usersTable.expoPushToken, row.token),
                  ),
                )
                .returning({ id: usersTable.id });
              if (result.length > 0) {
                totalTokensCleared++;
                logger.info({ userId: row.userId }, "[ExpoPushReceipts] Cleared stale push token (DeviceNotRegistered via receipt)");
              } else {
                logger.info({ userId: row.userId }, "[ExpoPushReceipts] Skipped token clear — user already re-registered a new token");
              }
            } catch (err) {
              logger.warn({ err, userId: row.userId }, "[ExpoPushReceipts] Failed to clear stale push token");
            }
          }
        }
      }
    }

    if (processedDbIds.length > 0) {
      await db
        .delete(expoPushTicketsTable)
        .where(inArray(expoPushTicketsTable.id, processedDbIds));
    }

    logger.info(
      { totalOk, totalErrors, totalTokensCleared, deletedRows: processedDbIds.length },
      "[ExpoPushReceipts] Receipt-poll job complete",
    );
  } catch (err) {
    logger.error({ err }, "[ExpoPushReceipts] Receipt-poll job failed");
  }
}
