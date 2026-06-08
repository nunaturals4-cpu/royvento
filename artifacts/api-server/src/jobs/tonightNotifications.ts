import { db, usersTable, notificationsTable, wishlistsTable, eventsTable, vendorsTable } from "@workspace/db";
import { eq, and, gte, sql, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { createUserNotification } from "../lib/notify";
import { sendExpoPushWithToken } from "../lib/expoPush";

// ── Happening Tonight — notification engine ─────────────────────────────────
// Two jobs power the real-time discovery push experience:
//   1. tonightDigest        — once each evening, broadcasts how many experiences
//      are happening tonight (FOMO driver) to every user.
//   2. startingSoonReminders — every 5 min, nudges users who wishlisted a pub
//      event that's about to start (~90 min out) — a strong, targeted signal.
// All timing is IST (Asia/Kolkata). Dedup mirrors bookingReminders: a matching
// notification row created since the start of the IST day means "already sent".

const _istFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
function getTodayIST(): string {
  return _istFmt.format(new Date());
}
function getTodayStartUTC(): Date {
  return new Date(`${getTodayIST()}T00:00:00+05:30`);
}
function getNowISTMinutes(): number {
  const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}
function parseHHMM(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 150;

/**
 * Count how many listings are genuinely "tonight-relevant" right now: live or
 * starting within the next 4 hours, opted into Happening Tonight. Mirrors the
 * /api/happening-tonight bucketing but only needs a headcount for the digest.
 */
async function countTonightItems(today: string): Promise<number> {
  const res = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM events
         WHERE approval_status = 'approved' AND happening_tonight = true
           AND (type = 'pub' OR event_date IS NULL OR event_date = ${today})) +
      (SELECT COUNT(*) FROM organizer_events
         WHERE approval_status = 'approved' AND happening_tonight = true
           AND (start_date IS NULL OR (start_date <= ${today} AND (end_date IS NULL OR end_date >= ${today})))) +
      (SELECT COUNT(*) FROM games
         WHERE approval_status = 'approved' AND active = true AND happening_tonight = true) +
      (SELECT COUNT(*) FROM announcements
         WHERE approval_status = 'approved' AND (announce_date = '' OR announce_date = ${today}))
      AS "total"
  `);
  const row = res.rows[0] as { total?: number | string } | undefined;
  return Number(row?.total ?? 0);
}

async function broadcastToAllUsers(title: string, message: string, tag: string): Promise<void> {
  const allUsers = await db
    .select({ id: usersTable.id, expoPushToken: usersTable.expoPushToken })
    .from(usersTable);
  for (let i = 0; i < allUsers.length; i += BATCH_SIZE) {
    const batch = allUsers.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async ({ id: userId, expoPushToken }) => {
        try {
          await createUserNotification({ userId, title, message, url: "/", tag });
          if (expoPushToken) {
            sendExpoPushWithToken(userId, expoPushToken, {
              title, body: message, data: { screen: "home", tag },
            }).catch(() => {});
          }
        } catch { /* non-critical per user */ }
      }),
    );
    if (i + BATCH_SIZE < allUsers.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }
}

/**
 * Evening digest — broadcast once per IST day (cron should fire it ~17:00 IST).
 * Skips silently when nothing is happening tonight.
 */
export async function runTonightDigest(): Promise<void> {
  const today = getTodayIST();
  const tag = `tonight-digest-${today}`;
  try {
    // Dedup: bail if we already broadcast today's digest.
    const already = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(and(
        sql`${notificationsTable.message} LIKE ${"%" + tag + "%"}`,
        gte(notificationsTable.createdAt, getTodayStartUTC()),
      ))
      .limit(1);
    if (already.length > 0) {
      logger.info("[tonightDigest] Already sent today — skipping");
      return;
    }

    const count = await countTonightItems(today);
    if (count <= 0) {
      logger.info("[tonightDigest] Nothing happening tonight — skipping");
      return;
    }
    const title = "🔥 Happening Tonight";
    // The tag is embedded in the message so the dedup LIKE query can find it.
    const message = `${count} experience${count === 1 ? "" : "s"} happening near you tonight — find your night out. [${tag}]`;
    await broadcastToAllUsers(title, message, tag);
    logger.info({ count }, "[tonightDigest] Broadcast complete");
  } catch (err) {
    logger.error({ err }, "[tonightDigest] Job failed");
  }
}

/**
 * Every 5 min: for pub events starting in ~90 min (within this tick), nudge
 * users who wishlisted them. wishlists references pub events (eventId), giving
 * a strong, targeted "your saved spot is starting soon" signal.
 */
export async function runStartingSoonReminders(): Promise<void> {
  const today = getTodayIST();
  const nowMin = getNowISTMinutes();
  const TARGET_AHEAD = 90; // minutes before start to remind
  const TICK = 5;          // cron tick width, so each event fires once
  try {
    const events = await db
      .select({
        id: eventsTable.id,
        title: eventsTable.title,
        startTime: eventsTable.startTime,
        vendorId: eventsTable.vendorId,
        startingSoon: eventsTable.startingSoon,
        happeningTonight: eventsTable.happeningTonight,
      })
      .from(eventsTable)
      .where(and(
        eq(eventsTable.approvalStatus, "approved"),
        eq(eventsTable.happeningTonight, true),
        eq(eventsTable.startingSoon, true),
      ));

    // Keep events whose (start - 90min) lands in this 5-minute tick.
    const due = events.filter((e) => {
      const startMin = parseHHMM(e.startTime);
      if (startMin === null) return false;
      const target = startMin - TARGET_AHEAD;
      return nowMin >= target && nowMin < target + TICK;
    });
    if (due.length === 0) return;

    const vendorIds = [...new Set(due.map((e) => e.vendorId))];
    const vendors = vendorIds.length
      ? await db.select({ id: vendorsTable.id, name: vendorsTable.businessName }).from(vendorsTable).where(inArray(vendorsTable.id, vendorIds))
      : [];
    const vendorName = new Map(vendors.map((v) => [v.id, v.name]));
    const todayStartUTC = getTodayStartUTC();

    let sent = 0;
    for (const ev of due) {
      const wishers = await db
        .select({ userId: wishlistsTable.userId })
        .from(wishlistsTable)
        .where(eq(wishlistsTable.eventId, ev.id));
      if (wishers.length === 0) continue;

      const tag = `tonight-soon-${ev.id}-${today}`;
      const title = "⚡ Starting soon tonight";
      const venue = vendorName.get(ev.vendorId) ?? "";
      const message = `${ev.title}${venue ? ` at ${venue}` : ""} starts around ${ev.startTime} — about 90 minutes away. [${tag}]`;

      for (const { userId } of wishers) {
        try {
          // Dedup per (user, event, day).
          const already = await db
            .select({ id: notificationsTable.id })
            .from(notificationsTable)
            .where(and(
              eq(notificationsTable.userId, userId),
              sql`${notificationsTable.message} LIKE ${"%" + tag + "%"}`,
              gte(notificationsTable.createdAt, todayStartUTC),
            ))
            .limit(1);
          if (already.length > 0) continue;
          await createUserNotification({ userId, title, message, url: `/events/${ev.id}`, tag });
          sent++;
        } catch { /* non-critical per user */ }
      }
    }
    if (sent > 0) logger.info({ sent, dueEvents: due.length }, "[startingSoonReminders] Reminders sent");
  } catch (err) {
    logger.error({ err }, "[startingSoonReminders] Job failed");
  }
}
