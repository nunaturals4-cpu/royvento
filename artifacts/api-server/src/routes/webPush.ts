import { Router, type IRouter } from "express";
import webpush from "web-push";
import { db, usersTable, webPushSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { logger } from "../lib/logger";
import { z } from "zod";

const router: IRouter = Router();

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:support@royvento.com";

let vapidConfigured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
    logger.info("Web push VAPID configured");
  } catch (err) {
    logger.warn({ err }, "Failed to configure VAPID — web push disabled");
  }
}

router.get("/push/vapid-public-key", (_req, res) => {
  if (!vapidConfigured) {
    res.status(503).json({ error: "Web push not configured" });
    return;
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

const SubscribeBody = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }),
});

router.post("/push/subscribe", requireAuth(), async (req, res) => {
  if (!vapidConfigured) {
    res.status(503).json({ error: "Web push not configured" });
    return;
  }
  const me = await loadUserFromRequest(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = SubscribeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid subscription" }); return; }
  const sub = parsed.data.subscription;

  // Upsert by endpoint so resubscribing on the same browser refreshes keys
  // and reassigns ownership if the user changed.
  await db
    .insert(webPushSubscriptionsTable)
    .values({
      userId: me.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    })
    .onConflictDoUpdate({
      target: webPushSubscriptionsTable.endpoint,
      set: {
        userId: me.id,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
    });

  // Keep the legacy single-subscription column in sync as a best-effort
  // fallback for any code path that hasn't migrated yet.
  await db
    .update(usersTable)
    .set({ webPushSubscription: JSON.stringify(sub) })
    .where(eq(usersTable.id, me.id));
  res.json({ ok: true });
});

const UnsubscribeBody = z.object({
  endpoint: z.string().url().optional(),
});

router.delete("/push/subscribe", requireAuth(), async (req, res) => {
  const me = await loadUserFromRequest(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = UnsubscribeBody.safeParse(req.body ?? {});
  const endpoint = parsed.success ? parsed.data.endpoint : undefined;

  if (endpoint) {
    // Remove just this device's subscription
    await db
      .delete(webPushSubscriptionsTable)
      .where(
        and(
          eq(webPushSubscriptionsTable.userId, me.id),
          eq(webPushSubscriptionsTable.endpoint, endpoint),
        ),
      );
  } else {
    // No endpoint provided — drop all subscriptions for this user
    await db
      .delete(webPushSubscriptionsTable)
      .where(eq(webPushSubscriptionsTable.userId, me.id));
  }

  await db
    .update(usersTable)
    .set({ webPushSubscription: null })
    .where(eq(usersTable.id, me.id));
  res.json({ ok: true });
});

type WebPushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  type?: string;
};

export async function sendWebPushToUser(
  userId: number,
  payload: WebPushPayload,
): Promise<void> {
  if (!vapidConfigured) return;

  // Load every subscription this user has registered.
  const rows = await db
    .select({
      id: webPushSubscriptionsTable.id,
      endpoint: webPushSubscriptionsTable.endpoint,
      p256dh: webPushSubscriptionsTable.p256dh,
      auth: webPushSubscriptionsTable.auth,
    })
    .from(webPushSubscriptionsTable)
    .where(eq(webPushSubscriptionsTable.userId, userId));

  // Fall back to the legacy single-subscription column for users who
  // subscribed before the multi-device table existed.
  if (rows.length === 0) {
    const [user] = await db
      .select({ webPushSubscription: usersTable.webPushSubscription })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!user?.webPushSubscription) return;
    try {
      const sub = JSON.parse(user.webPushSubscription) as webpush.PushSubscription;
      await webpush.sendNotification(sub, JSON.stringify(payload));
    } catch (err) {
      logger.warn({ err, userId }, "Failed to send legacy web push notification");
      if ((err as { statusCode?: number }).statusCode === 410) {
        await db
          .update(usersTable)
          .set({ webPushSubscription: null })
          .where(eq(usersTable.id, userId));
      }
    }
    return;
  }

  // Fan out to every registered subscription. Each send is independent so
  // one bad endpoint can't block delivery to the user's other devices.
  await Promise.all(
    rows.map(async (row) => {
      const sub: webpush.PushSubscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload));
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        logger.warn(
          { err, userId, endpoint: row.endpoint, statusCode },
          "Failed to send web push notification",
        );
        // 404/410 = subscription is gone for good — prune just this row.
        if (statusCode === 404 || statusCode === 410) {
          await db
            .delete(webPushSubscriptionsTable)
            .where(eq(webPushSubscriptionsTable.id, row.id));
        }
      }
    }),
  );
}

export default router;
