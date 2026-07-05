import { db, notificationQueueTable, usersTable } from "@workspace/db";
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { createUserNotification } from "./notify";
import { haversineKm, num } from "./geo";
import { logger } from "./logger";

// ── Smart follow-notification delivery queue ─────────────────────────────────
//
// Every follow-driven notification (a followed organizer publishing an event, a
// followed venue posting a new offer) is *enqueued* here rather than sent
// inline. The queue gives the product brief's guarantees in one place:
//
//   • Dedup      — a unique (user_id, dedup_key) row means the same event/offer
//                  can never be delivered twice to the same user.
//   • Anti-spam  — when several followed profiles post around the same time, a
//                  user's notifications are spaced 30 minutes apart: the first
//                  fires (almost) immediately, the rest are staggered.
//   • Resilience — a claim-based dispatcher (pending → sending → sent) retries
//                  with backoff on failure and is safe across replicas.
//
// Delivery itself reuses createUserNotification(), so each queued row fans out
// to the in-app list + web push + Expo push exactly like a direct notification.

/** Minimum gap between two follow notifications for the same user. */
const SPACING_MS = 30 * 60 * 1000;
/** Give up after this many delivery attempts and mark the row failed. */
const MAX_ATTEMPTS = 5;
/** Rows stuck "sending" longer than this are presumed crashed and reclaimed. */
const STUCK_SENDING_MS = 5 * 60 * 1000;

export interface QueueItem {
  userId: number;
  title: string;
  message: string;
  url: string;
  /** Category for iconography / analytics, e.g. "follow_event". */
  type: string;
  /** Optional coalesce tag mirrored onto the push payload. */
  tag?: string;
  /** Idempotency key per subject, e.g. "organizer-event:42". */
  dedupKey: string;
  /** Higher = delivered first within a due batch. Default 0. */
  priority?: number;
  /**
   * Optional geo-fence. When set, the notification is only delivered if the
   * recipient's LATEST saved location is within `radiusKm` of (lat,lng) — and
   * that is re-checked at dispatch time (see dispatchDueNotifications), so a
   * user who moved out of range between enqueue and send is skipped.
   */
  geo?: { lat: number; lng: number; radiusKm: number };
}

/**
 * Enqueue one notification per follower for a single subject (event/offer).
 *
 * All items in a call share the same dedupKey/payload but target different
 * users. Per-user 30-minute spacing is computed from that user's most recent
 * queued/sent slot in the last window, so a burst of updates staggers instead
 * of flooding. Duplicate (user, dedupKey) rows are ignored, so re-saving the
 * same offer or double-firing a trigger never double-notifies.
 *
 * Fire-and-forget: callers must NOT await this on the request path.
 */
export async function enqueueFollowNotifications(
  userIds: number[],
  payload: Omit<QueueItem, "userId">,
): Promise<void> {
  const unique = [...new Set(userIds)].filter((id) => Number.isFinite(id) && id > 0);
  if (unique.length === 0) return;

  try {
    const now = Date.now();
    const windowStart = new Date(now - SPACING_MS);

    // Latest already-scheduled slot per user within the rolling window. Only
    // pending/sent rows matter — a failed row shouldn't push future ones out.
    const recent = await db
      .select({
        userId: notificationQueueTable.userId,
        last: sql<string>`max(${notificationQueueTable.scheduledAt})`,
      })
      .from(notificationQueueTable)
      .where(
        and(
          inArray(notificationQueueTable.userId, unique),
          gte(notificationQueueTable.scheduledAt, windowStart),
          inArray(notificationQueueTable.status, ["pending", "sending", "sent"]),
        ),
      )
      .groupBy(notificationQueueTable.userId);

    const lastByUser = new Map<number, number>();
    for (const r of recent) {
      const t = new Date(r.last).getTime();
      if (Number.isFinite(t)) lastByUser.set(r.userId, t);
    }

    const rows = unique.map((userId) => {
      const last = lastByUser.get(userId);
      // First notification for this user in the window → send now; otherwise
      // queue one 30-minute slot after their latest pending/sent one.
      const scheduledAt = last ? new Date(Math.max(now, last + SPACING_MS)) : new Date(now);
      return {
        userId,
        title: payload.title,
        message: payload.message,
        url: payload.url,
        type: payload.type,
        tag: payload.tag ?? null,
        dedupKey: payload.dedupKey,
        priority: payload.priority ?? 0,
        geoLat: payload.geo ? payload.geo.lat.toFixed(6) : null,
        geoLng: payload.geo ? payload.geo.lng.toFixed(6) : null,
        geoRadiusKm: payload.geo ? payload.geo.radiusKm : null,
        scheduledAt,
      };
    });

    await db
      .insert(notificationQueueTable)
      .values(rows)
      .onConflictDoNothing({
        target: [notificationQueueTable.userId, notificationQueueTable.dedupKey],
      });

    // Best-effort inline flush so the *first* notification of a burst goes out
    // right away instead of waiting for the next cron tick. The cron dispatcher
    // remains the reliable fallback and handles the 30-min-spaced rows + retries.
    void dispatchDueNotifications().catch(() => {});
  } catch (err) {
    // Resilience: if the queue table isn't present yet (un-migrated DB / deploy
    // window before applyPendingSchemaChanges() ran), deliver directly rather
    // than dropping the notifications. We lose spacing/retry, but followers
    // still get notified — which is the whole point.
    if (isMissingTable(err)) {
      logger.warn({ dedupKey: payload.dedupKey }, "notification_queue missing — delivering directly");
      await Promise.all(
        unique.map((userId) =>
          createUserNotification({
            userId,
            title: payload.title,
            message: payload.message,
            url: payload.url,
            type: payload.type,
            tag: payload.tag,
          }).catch(() => {}),
        ),
      );
      return;
    }
    // Never let a notification failure break the caller's save flow.
    logger.warn({ err, dedupKey: payload.dedupKey }, "enqueueFollowNotifications failed");
  }
}

// A Postgres "relation does not exist" (42P01) for the queue table.
function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code === "42P01") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /relation .*"?notification_queue"? does not exist/i.test(msg);
}

/**
 * Deliver every due row. Claim-based so it is safe to run from both the inline
 * flush and the cron tick (and across replicas): a row is only sent by whoever
 * flips it pending → sending. Retries with linear backoff; gives up after
 * MAX_ATTEMPTS. Also reclaims rows wedged in "sending" by a crashed dispatcher.
 */
export async function dispatchDueNotifications(limit = 100): Promise<number> {
  const now = new Date();

  // Reaper: return long-stuck "sending" rows to pending so a crashed run's rows
  // aren't lost forever.
  await db
    .update(notificationQueueTable)
    .set({ status: "pending" })
    .where(
      and(
        eq(notificationQueueTable.status, "sending"),
        lte(notificationQueueTable.scheduledAt, new Date(now.getTime() - STUCK_SENDING_MS)),
      ),
    );

  const dueIds = await db
    .select({ id: notificationQueueTable.id })
    .from(notificationQueueTable)
    .where(
      and(
        eq(notificationQueueTable.status, "pending"),
        lte(notificationQueueTable.scheduledAt, now),
      ),
    )
    .orderBy(desc(notificationQueueTable.priority), asc(notificationQueueTable.scheduledAt))
    .limit(limit);

  if (dueIds.length === 0) return 0;

  // Atomically claim the batch: only rows still 'pending' flip to 'sending', so
  // concurrent dispatchers never double-send the same row.
  const claimed = await db
    .update(notificationQueueTable)
    .set({ status: "sending" })
    .where(
      and(
        inArray(
          notificationQueueTable.id,
          dueIds.map((d) => d.id),
        ),
        eq(notificationQueueTable.status, "pending"),
      ),
    )
    .returning();

  // Geo re-check: for any claimed row carrying a geo-fence, load the recipient's
  // CURRENT saved location (one batched query) so eligibility is recalculated
  // against their most recent position right before sending (requirement 4).
  const geoUserIds = [
    ...new Set(claimed.filter((r) => r.geoLat != null && r.geoLng != null && r.geoRadiusKm != null).map((r) => r.userId)),
  ];
  const userLoc = new Map<number, { lat: number; lng: number } | null>();
  if (geoUserIds.length > 0) {
    const locs = await db
      .select({ id: usersTable.id, lat: usersTable.latitude, lng: usersTable.longitude })
      .from(usersTable)
      .where(inArray(usersTable.id, geoUserIds));
    for (const u of locs) {
      const lat = num(u.lat);
      const lng = num(u.lng);
      userLoc.set(u.id, lat != null && lng != null ? { lat, lng } : null);
    }
  }

  let sent = 0;
  for (const row of claimed) {
    // Enforce the geo-fence against the user's latest location.
    if (row.geoLat != null && row.geoLng != null && row.geoRadiusKm != null) {
      const loc = userLoc.get(row.userId) ?? null;
      const gLat = num(row.geoLat);
      const gLng = num(row.geoLng);
      const inRange =
        loc != null && gLat != null && gLng != null &&
        haversineKm({ lat: gLat, lng: gLng }, loc) <= row.geoRadiusKm;
      if (!inRange) {
        // Out of range (or no known location) → don't deliver, don't retry.
        await db
          .update(notificationQueueTable)
          .set({ status: "skipped", attempts: row.attempts + 1 })
          .where(eq(notificationQueueTable.id, row.id));
        continue;
      }
    }
    try {
      await createUserNotification({
        userId: row.userId,
        title: row.title,
        message: row.message,
        url: row.url,
        type: row.type,
        tag: row.tag ?? undefined,
      });
      await db
        .update(notificationQueueTable)
        .set({ status: "sent", sentAt: new Date(), attempts: row.attempts + 1 })
        .where(eq(notificationQueueTable.id, row.id));
      sent += 1;
    } catch (err) {
      const attempts = row.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await db
          .update(notificationQueueTable)
          .set({ status: "failed", attempts })
          .where(eq(notificationQueueTable.id, row.id));
        logger.warn({ err, id: row.id, userId: row.userId }, "Notification permanently failed");
      } else {
        // Requeue with linear backoff (1m, 2m, 3m …).
        const retryAt = new Date(Date.now() + attempts * 60_000);
        await db
          .update(notificationQueueTable)
          .set({ status: "pending", attempts, scheduledAt: retryAt })
          .where(eq(notificationQueueTable.id, row.id));
      }
    }
  }
  if (sent > 0) logger.info({ sent }, "[notificationQueue] Delivered queued notifications");
  return sent;
}

/**
 * Housekeeping: drop delivered/failed rows older than `olderThanDays`. The
 * durable notification history lives in the notifications table; the queue only
 * needs to retain enough sent rows to keep the 30-min spacing window meaningful.
 */
export async function pruneNotificationQueue(olderThanDays = 7): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  await db
    .delete(notificationQueueTable)
    .where(
      and(
        or(eq(notificationQueueTable.status, "sent"), eq(notificationQueueTable.status, "failed")),
        lte(notificationQueueTable.createdAt, cutoff),
      ),
    );
}
