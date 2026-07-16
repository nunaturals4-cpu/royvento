import { db, notificationsTable } from "@workspace/db";
import { sendWebPushToUser } from "../routes/webPush";
import { sendExpoPushToUser } from "./expoPush";
import { logger } from "./logger";

// A Postgres "column does not exist" (42703) — the DB is a schema behind.
function isMissingColumn(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code === "42703") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /column .* does not exist/i.test(msg);
}

export interface CreateUserNotificationInput {
  userId: number;
  title: string;
  message: string;
  url?: string;
  tag?: string;
  /** Category for iconography / analytics (e.g. "follow_event"). */
  type?: string;
  /**
   * When set, the notification carries a one-tap "Call" action (web push
   * notification action button; Expo notification category action on
   * mobile) that dials this number directly from the notification.
   */
  callPhone?: string;
}

export async function createUserNotification(
  input: CreateUserNotificationInput,
): Promise<void> {
  const { userId, title, message, url, tag, type, callPhone } = input;
  try {
    // Persist the deep-link `url` (+ type/tag) on the in-app row so tapping the
    // notification in the bell dropdown / notifications page navigates to the
    // right page — previously `url` was only attached to the transient push
    // payload and lost for the in-app list, so clicks went nowhere.
    await db.insert(notificationsTable).values({
      userId,
      title,
      message,
      url: url ?? "",
      type: type ?? "general",
      tag: tag ?? null,
    });
  } catch (err) {
    // Resilience: if the url/type/tag columns aren't present yet (e.g. a server
    // serving requests before applyPendingSchemaChanges() finished, or an
    // un-migrated environment), retry with the original minimal column set so a
    // notification is never silently dropped. Without this, adding those columns
    // would break *every* notification on any not-yet-migrated DB.
    if (isMissingColumn(err)) {
      try {
        await db.insert(notificationsTable).values({ userId, title, message });
      } catch (retryErr) {
        logger.warn({ err: retryErr, userId, title }, "Failed to insert in-app notification (minimal retry)");
        return;
      }
    } else {
      logger.warn({ err, userId, title }, "Failed to insert in-app notification");
      return;
    }
  }
  sendWebPushToUser(userId, {
    type: "royvento-notification",
    title,
    body: message,
    ...(url ? { url } : {}),
    ...(tag ? { tag } : {}),
    ...(callPhone ? { phone: callPhone } : {}),
  }).catch(() => {});

  // Fan out to the mobile app too (best-effort; no-op when the user has no
  // Expo token registered or push is unconfigured).
  sendExpoPushToUser(userId, {
    title,
    body: message,
    data: { ...(url ? { url } : {}), ...(tag ? { tag } : {}), ...(callPhone ? { phone: callPhone } : {}) },
    ...(callPhone ? { categoryId: "booking-call" } : {}),
  }).catch(() => {});
}
