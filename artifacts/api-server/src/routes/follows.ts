import { Router, type IRouter } from "express";
import {
  db,
  followsTable,
  vendorsTable,
  eventsTable,
  gameOrganizersTable,
  organizersTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// The kinds of profile a user can follow.
const TARGET_TYPES = ["vendor", "event", "game_organizer", "organizer"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

function isTargetType(v: string): v is TargetType {
  return (TARGET_TYPES as readonly string[]).includes(v);
}

// Graceful degradation before the follows table has been provisioned.
function isMissingTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /relation .*"?follows"? does not exist/i.test(msg);
}

async function followerCount(type: TargetType, id: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(followsTable)
    .where(and(eq(followsTable.targetType, type), eq(followsTable.targetId, id)));
  return row?.n ?? 0;
}

// Confirm the follow target exists and is publicly visible. Vendors and events
// must be approved + not hidden; game zones / organizers just need to exist and
// not be hidden. Returns false → the follow is rejected.
async function targetVisible(type: TargetType, id: number): Promise<boolean> {
  if (type === "vendor") {
    const [v] = await db
      .select({ status: vendorsTable.status, hidden: vendorsTable.hidden })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, id))
      .limit(1);
    return !!v && v.status === "approved" && !v.hidden;
  }
  if (type === "event") {
    const [e] = await db
      .select({ status: eventsTable.approvalStatus, hidden: eventsTable.hidden })
      .from(eventsTable)
      .where(eq(eventsTable.id, id))
      .limit(1);
    return !!e && e.status === "approved" && !e.hidden;
  }
  if (type === "game_organizer") {
    const [g] = await db
      .select({ status: gameOrganizersTable.status })
      .from(gameOrganizersTable)
      .where(eq(gameOrganizersTable.id, id))
      .limit(1);
    return !!g && g.status === "approved";
  }
  // organizer
  const [o] = await db
    .select({ hidden: organizersTable.hidden })
    .from(organizersTable)
    .where(eq(organizersTable.id, id))
    .limit(1);
  return !!o && !o.hidden;
}

// Public: is the current user following this target + how many followers total.
// Auth is optional — logged-out visitors get `following: false` and the count.
router.get("/follows/:type/:id", async (req, res) => {
  const type = String(req.params["type"] ?? "");
  const id = Number(req.params["id"]);
  if (!isTargetType(type) || !Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid follow target" });
    return;
  }
  try {
    const me = await loadUserFromRequest(req);
    let following = false;
    if (me) {
      const rows = await db
        .select({ id: followsTable.id })
        .from(followsTable)
        .where(and(
          eq(followsTable.targetType, type),
          eq(followsTable.targetId, id),
          eq(followsTable.userId, me.id),
        ))
        .limit(1);
      following = rows.length > 0;
    }
    res.json({ following, followerCount: await followerCount(type, id) });
  } catch (err) {
    if (isMissingTable(err)) { res.json({ following: false, followerCount: 0 }); return; }
    logger.error({ err, type, id }, "follow status failed");
    res.status(500).json({ error: "Failed to load follow status" });
  }
});

// Follow a visible target.
router.post("/follows/:type/:id", requireAuth(), async (req, res) => {
  const type = String(req.params["type"] ?? "");
  const id = Number(req.params["id"]);
  if (!isTargetType(type) || !Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid follow target" });
    return;
  }
  try {
    const me = await loadUserFromRequest(req);
    if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }

    if (!(await targetVisible(type, id))) {
      res.status(403).json({ error: "You can only follow an approved, visible profile." });
      return;
    }

    await db
      .insert(followsTable)
      .values({ userId: me.id, targetType: type, targetId: id })
      .onConflictDoNothing({
        target: [followsTable.userId, followsTable.targetType, followsTable.targetId],
      });

    res.json({ following: true, followerCount: await followerCount(type, id) });
  } catch (err) {
    if (isMissingTable(err)) {
      res.status(503).json({ error: "Follow is not available yet. Please try again shortly." });
      return;
    }
    logger.error({ err, type, id }, "follow failed");
    res.status(500).json({ error: "Failed to follow" });
  }
});

// Unfollow.
router.delete("/follows/:type/:id", requireAuth(), async (req, res) => {
  const type = String(req.params["type"] ?? "");
  const id = Number(req.params["id"]);
  if (!isTargetType(type) || !Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid follow target" });
    return;
  }
  try {
    const me = await loadUserFromRequest(req);
    if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
    await db
      .delete(followsTable)
      .where(and(
        eq(followsTable.targetType, type),
        eq(followsTable.targetId, id),
        eq(followsTable.userId, me.id),
      ));
    res.json({ following: false, followerCount: await followerCount(type, id) });
  } catch (err) {
    if (isMissingTable(err)) { res.json({ following: false, followerCount: 0 }); return; }
    logger.error({ err, type, id }, "unfollow failed");
    res.status(500).json({ error: "Failed to unfollow" });
  }
});

export default router;
