import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
}

type ExpoReceiptEntry = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

function isValidExpoToken(token: string): boolean {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

export async function sendExpoPushNotification(
  messages: ExpoPushMessage[],
): Promise<void> {
  const valid = messages.filter((m) => m.to && isValidExpoToken(m.to));
  if (valid.length === 0) return;

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(valid.length === 1 ? valid[0] : valid),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable)");
      logger.warn({ status: res.status, body: text }, "[ExpoPush] HTTP error from Expo Push API");
      return;
    }
    const json = (await res.json()) as { data?: ExpoReceiptEntry[] };
    const results = Array.isArray(json?.data) ? json.data : [json?.data];
    for (const r of results) {
      if (r && r.status === "error") {
        logger.warn({ message: r.message, details: r.details }, "[ExpoPush] Expo reported error for message");
      }
    }
  } catch (err) {
    logger.warn({ err }, "[ExpoPush] Failed to send notification");
  }
}

/**
 * Send an Expo push notification using a pre-fetched token.
 * Clears the token in the DB on DeviceNotRegistered (410-style cleanup).
 * Use this in bulk-send loops where the token is already available to avoid N+1 queries.
 */
export async function sendExpoPushWithToken(
  userId: number,
  token: string,
  payload: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  if (!isValidExpoToken(token)) return;

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        title: payload.title,
        body: payload.body,
        sound: "default",
        data: payload.data,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable)");
      logger.warn({ userId, status: res.status, body: text }, "[ExpoPush] HTTP error sending to user");
      return;
    }

    const json = (await res.json()) as { data?: ExpoReceiptEntry | ExpoReceiptEntry[] };
    const entry = Array.isArray(json?.data) ? json.data[0] : json?.data;

    if (entry?.status === "error") {
      logger.warn({ userId, message: entry.message, details: entry.details }, "[ExpoPush] Error receipt from Expo");
      if (entry.details?.error === "DeviceNotRegistered") {
        await db
          .update(usersTable)
          .set({ expoPushToken: null })
          .where(eq(usersTable.id, userId));
        logger.info({ userId }, "[ExpoPush] Cleared stale push token (DeviceNotRegistered)");
      }
    }
  } catch (err) {
    logger.warn({ err, userId }, "[ExpoPush] Failed to send push to user");
  }
}

/**
 * Send an Expo push notification to a single user by userId.
 * Fetches the token from the DB, then delegates to sendExpoPushWithToken.
 * Use this when the token is not already available (e.g. single-user sends like booking status).
 */
export async function sendExpoPushToUser(
  userId: number,
  payload: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  const [row] = await db
    .select({ expoPushToken: usersTable.expoPushToken })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const token = row?.expoPushToken;
  if (!token) return;

  await sendExpoPushWithToken(userId, token, payload);
}
