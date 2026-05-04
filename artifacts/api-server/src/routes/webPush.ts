import { Router, type IRouter } from "express";
import webpush from "web-push";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
  await db
    .update(usersTable)
    .set({ webPushSubscription: JSON.stringify(parsed.data.subscription) })
    .where(eq(usersTable.id, me.id));
  res.json({ ok: true });
});

router.delete("/push/subscribe", requireAuth(), async (req, res) => {
  const me = await loadUserFromRequest(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  await db
    .update(usersTable)
    .set({ webPushSubscription: null })
    .where(eq(usersTable.id, me.id));
  res.json({ ok: true });
});

export async function sendWebPushToUser(
  userId: number,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  if (!vapidConfigured) return;
  const [user] = await db
    .select({ webPushSubscription: usersTable.webPushSubscription })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user?.webPushSubscription) return;
  try {
    const sub = JSON.parse(user.webPushSubscription) as webpush.PushSubscription;
    await webpush.sendNotification(sub, JSON.stringify(payload));
  } catch (err) {
    logger.warn({ err, userId }, "Failed to send web push notification");
    if ((err as { statusCode?: number }).statusCode === 410) {
      await db
        .update(usersTable)
        .set({ webPushSubscription: null })
        .where(eq(usersTable.id, userId));
    }
  }
}

export default router;
