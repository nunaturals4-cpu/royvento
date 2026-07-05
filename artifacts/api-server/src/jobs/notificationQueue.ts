import { dispatchDueNotifications, pruneNotificationQueue } from "../lib/notificationQueue";
import { logger } from "../lib/logger";

// Cron tick (every minute): deliver any follow notifications whose scheduled
// time has arrived. This is the reliable backbone for the 30-minute-spaced
// rows and the retry/backoff path — the enqueue call also flushes inline so the
// first notification of a burst goes out immediately, but this guarantees the
// staggered remainder are delivered even with no further traffic.
export async function runNotificationQueue(): Promise<void> {
  try {
    // Loop so a large due backlog drains within the tick rather than one page
    // per minute. Stop once a page comes back short (nothing left due).
    for (let i = 0; i < 20; i += 1) {
      const sent = await dispatchDueNotifications(100);
      if (sent < 100) break;
    }
  } catch (err) {
    logger.error({ err }, "[notificationQueue] Dispatch tick failed");
  }
}

// Occasional housekeeping: drop old delivered/failed queue rows. History is
// preserved in the notifications table; the queue only needs a short retention.
export async function runNotificationQueuePrune(): Promise<void> {
  try {
    await pruneNotificationQueue(7);
  } catch (err) {
    logger.warn({ err }, "[notificationQueue] Prune failed");
  }
}
