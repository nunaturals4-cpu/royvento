import {
  db,
  soloGroupsTable,
  soloGroupMembersTable,
  soloGroupMessagesTable,
  soloReportsTable,
  soloDeletedGroupsLogTable,
} from "@workspace/db";
import { and, eq, lte, isNull, isNotNull, lt, ne, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { createUserNotification } from "../lib/notify";

// ─── Solo Connector automatic group expiry ───────────────────────────────────
//
// A group is "inactive" when nothing has touched its lastActivityAt — no new
// message, no join request, no approval — for INACTIVITY_DAYS. Three days before
// that, members are warned once. At the deadline the group is SOFT-deleted (rows
// preserved, chat purged) and snapshotted so an admin can restore it within
// GRACE_DAYS. After the grace window it is hard-purged.
//
// All thresholds are env-overridable so QA can exercise the full lifecycle fast.

const DAY_MS = 24 * 60 * 60 * 1000;

function envDays(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const INACTIVITY_DAYS = envDays("SOLO_GROUP_INACTIVITY_DAYS", 15);
const WARN_DAYS_BEFORE = envDays("SOLO_GROUP_WARN_DAYS_BEFORE", 3);
const GRACE_DAYS = envDays("SOLO_GROUP_RESTORE_GRACE_DAYS", 7);

async function approvedMemberIds(groupId: number): Promise<number[]> {
  const rows = await db
    .select({ userId: soloGroupMembersTable.userId })
    .from(soloGroupMembersTable)
    .where(and(eq(soloGroupMembersTable.groupId, groupId), eq(soloGroupMembersTable.status, "approved")));
  return rows.map((r) => r.userId);
}

// Step 1 — warn members of groups about to expire (3 days out), once each.
async function warnExpiringGroups(now: number): Promise<void> {
  const warnCutoff = new Date(now - (INACTIVITY_DAYS - WARN_DAYS_BEFORE) * DAY_MS);
  const groups = await db
    .select()
    .from(soloGroupsTable)
    .where(
      and(
        isNull(soloGroupsTable.deletedAt),
        isNull(soloGroupsTable.expiryWarnedAt),
        lte(soloGroupsTable.lastActivityAt, warnCutoff),
        ne(soloGroupsTable.status, "closed"),
      ),
    );
  for (const g of groups) {
    await db
      .update(soloGroupsTable)
      .set({ expiryWarnedAt: new Date() })
      .where(eq(soloGroupsTable.id, g.id));
    const memberIds = await approvedMemberIds(g.id);
    for (const userId of memberIds) {
      createUserNotification({
        userId,
        title: "Group going quiet",
        message: `"${g.name}" will be deleted in ${WARN_DAYS_BEFORE} days due to inactivity. Say hi to keep it alive!`,
        url: "/solo-connect",
        tag: `solo-group-${g.id}`,
      }).catch(() => {});
    }
  }
  if (groups.length > 0) logger.info({ count: groups.length }, "Solo Connector: warned inactive groups");
}

// Step 2 — soft-delete groups past the inactivity deadline + purge their chat.
async function softDeleteExpiredGroups(now: number): Promise<void> {
  const deleteCutoff = new Date(now - INACTIVITY_DAYS * DAY_MS);
  const groups = await db
    .select()
    .from(soloGroupsTable)
    .where(
      and(
        isNull(soloGroupsTable.deletedAt),
        lte(soloGroupsTable.lastActivityAt, deleteCutoff),
        ne(soloGroupsTable.status, "closed"),
      ),
    );
  for (const g of groups) {
    const memberIds = await approvedMemberIds(g.id);
    await db
      .update(soloGroupsTable)
      .set({ deletedAt: new Date(), deletedReason: "inactivity" })
      .where(eq(soloGroupsTable.id, g.id));
    // Purge the temporary chat immediately (privacy + the data-retention policy).
    await db.delete(soloGroupMessagesTable).where(eq(soloGroupMessagesTable.groupId, g.id));
    await db.insert(soloDeletedGroupsLogTable).values({
      groupId: g.id,
      name: g.name,
      memberCount: memberIds.length,
      reason: "inactivity",
      deletedAt: new Date(),
      restorableUntil: new Date(now + GRACE_DAYS * DAY_MS),
    });
    for (const userId of memberIds) {
      createUserNotification({
        userId,
        title: "Group deleted",
        message: `"${g.name}" was removed after ${INACTIVITY_DAYS} days of inactivity.`,
        url: "/solo-connect",
        tag: `solo-group-${g.id}`,
      }).catch(() => {});
    }
  }
  if (groups.length > 0) logger.info({ count: groups.length }, "Solo Connector: soft-deleted inactive groups");
}

// Step 3 — hard-purge soft-deleted groups whose restore grace window has passed.
async function hardPurgeExpiredGroups(now: number): Promise<void> {
  const logs = await db
    .select()
    .from(soloDeletedGroupsLogTable)
    .where(
      and(
        isNull(soloDeletedGroupsLogTable.purgedAt),
        isNull(soloDeletedGroupsLogTable.restoredAt),
        isNotNull(soloDeletedGroupsLogTable.restorableUntil),
        lt(soloDeletedGroupsLogTable.restorableUntil, new Date(now)),
      ),
    );
  if (logs.length === 0) return;
  const groupIds = logs.map((l) => l.groupId);
  // Only purge groups that are still soft-deleted (not restored in the meantime).
  const stillDeleted = await db
    .select({ id: soloGroupsTable.id })
    .from(soloGroupsTable)
    .where(and(inArray(soloGroupsTable.id, groupIds), isNotNull(soloGroupsTable.deletedAt)));
  const purgeIds = stillDeleted.map((r) => r.id);
  if (purgeIds.length > 0) {
    await db.delete(soloGroupMessagesTable).where(inArray(soloGroupMessagesTable.groupId, purgeIds));
    await db.delete(soloGroupMembersTable).where(inArray(soloGroupMembersTable.groupId, purgeIds));
    await db.delete(soloReportsTable).where(inArray(soloReportsTable.groupId, purgeIds));
    await db.delete(soloGroupsTable).where(inArray(soloGroupsTable.id, purgeIds));
  }
  for (const l of logs) {
    await db
      .update(soloDeletedGroupsLogTable)
      .set({ purgedAt: new Date() })
      .where(eq(soloDeletedGroupsLogTable.id, l.id));
  }
  logger.info({ count: purgeIds.length }, "Solo Connector: hard-purged expired groups past grace window");
}

/** Run the full inactivity lifecycle. Safe to call repeatedly (idempotent). */
export async function runSoloGroupExpiry(): Promise<void> {
  const now = Date.now();
  try {
    await warnExpiringGroups(now);
    await softDeleteExpiredGroups(now);
    await hardPurgeExpiredGroups(now);
  } catch (err) {
    logger.error({ err }, "Solo Connector group-expiry job failed");
  }
}
