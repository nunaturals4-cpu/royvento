import { db, usersTable, expoPushTicketsTable } from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import { logger } from "./logger";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

/** Ticket TTL: Expo guarantees receipts are available for 24 hours. */
const TICKET_TTL_MS = 24 * 60 * 60 * 1000;

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  /** iOS notification category identifier (drives actionable-notification buttons, e.g. "booking-call"). */
  categoryId?: string;
}

/** Response from the /push/send endpoint — these are "tickets", not receipts. */
type ExpoTicketEntry =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

/** Response from the /push/getReceipts endpoint. */
type ExpoReceiptEntry =
  | { status: "ok" }
  | { status: "error"; message: string; details?: { error?: string } };

export type ExpoReceiptMap = Record<string, ExpoReceiptEntry>;

function isValidExpoToken(token: string): boolean {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

/** Persist a successful ticket ID so the receipt-poll job can check delivery later. */
async function storeTicket(ticketId: string, userId: number, token: string): Promise<void> {
  const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
  try {
    await db.insert(expoPushTicketsTable).values({ ticketId, userId, token, expiresAt });
  } catch (err) {
    logger.warn({ err, ticketId, userId }, "[ExpoPush] Failed to store ticket ID");
  }
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
    const json = (await res.json()) as { data?: ExpoTicketEntry | ExpoTicketEntry[] };
    const results: ExpoTicketEntry[] = Array.isArray(json?.data)
      ? json.data
      : json?.data
      ? [json.data]
      : [];

    for (const r of results) {
      if (r.status === "error") {
        logger.warn({ message: r.message, details: r.details }, "[ExpoPush] Expo reported error for message");
      }
    }
  } catch (err) {
    logger.warn({ err }, "[ExpoPush] Failed to send notification");
  }
}

/**
 * Send an Expo push notification using a pre-fetched token.
 * Stores the resulting ticket ID for later delivery-receipt polling.
 * Clears the token in the DB on an immediate DeviceNotRegistered error.
 * Use this in bulk-send loops where the token is already available to avoid N+1 queries.
 */
export async function sendExpoPushWithToken(
  userId: number,
  token: string,
  payload: { title: string; body: string; data?: Record<string, unknown>; categoryId?: string },
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
        ...(payload.categoryId ? { categoryId: payload.categoryId } : {}),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable)");
      logger.warn({ userId, status: res.status, body: text }, "[ExpoPush] HTTP error sending to user");
      return;
    }

    const json = (await res.json()) as { data?: ExpoTicketEntry | ExpoTicketEntry[] };
    const entry: ExpoTicketEntry | undefined = Array.isArray(json?.data) ? json.data[0] : json?.data;

    if (!entry) return;

    if (entry.status === "ok") {
      await storeTicket(entry.id, userId, token);
    } else {
      logger.warn({ userId, message: entry.message, details: entry.details }, "[ExpoPush] Immediate error ticket from Expo");
      if (entry.details?.error === "DeviceNotRegistered") {
        // Guard: only clear if the stored token still matches what we sent, so a
        // concurrent re-registration doesn't get wiped by a race condition.
        const result = await db
          .update(usersTable)
          .set({ expoPushToken: null })
          .where(
            and(
              eq(usersTable.id, userId),
              eq(usersTable.expoPushToken, token),
            ),
          )
          .returning({ id: usersTable.id });
        if (result.length > 0) {
          logger.info({ userId }, "[ExpoPush] Cleared stale push token (immediate DeviceNotRegistered)");
        }
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
  payload: { title: string; body: string; data?: Record<string, unknown>; categoryId?: string },
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

/**
 * Fetch delivery receipts from Expo for stored ticket IDs.
 * Called by the scheduled receipt-poll job in expoPushReceipts.ts.
 */
export async function fetchExpoReceipts(ticketIds: string[]): Promise<ExpoReceiptMap> {
  if (ticketIds.length === 0) return {};

  const res = await fetch(EXPO_RECEIPTS_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: ticketIds }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable)");
    throw new Error(`Expo getReceipts HTTP ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { data?: ExpoReceiptMap };
  return json?.data ?? {};
}

/** Delete expired ticket rows (safety net; the receipt-poll job also cleans up processed ones). */
export async function deleteExpiredTickets(): Promise<void> {
  const result = await db
    .delete(expoPushTicketsTable)
    .where(lt(expoPushTicketsTable.expiresAt, new Date()))
    .returning({ id: expoPushTicketsTable.id });

  if (result.length > 0) {
    logger.info({ count: result.length }, "[ExpoPush] Deleted expired push ticket rows");
  }
}
