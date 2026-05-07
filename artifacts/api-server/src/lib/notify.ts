import { db, notificationsTable } from "@workspace/db";
import { sendWebPushToUser } from "../routes/webPush";
import { logger } from "./logger";

export interface CreateUserNotificationInput {
  userId: number;
  title: string;
  message: string;
  url?: string;
  tag?: string;
}

export async function createUserNotification(
  input: CreateUserNotificationInput,
): Promise<void> {
  const { userId, title, message, url, tag } = input;
  try {
    await db.insert(notificationsTable).values({
      userId,
      title,
      message,
    });
  } catch (err) {
    logger.warn({ err, userId, title }, "Failed to insert in-app notification");
    return;
  }
  sendWebPushToUser(userId, {
    type: "royvento-notification",
    title,
    body: message,
    ...(url ? { url } : {}),
    ...(tag ? { tag } : {}),
  }).catch(() => {});
}
