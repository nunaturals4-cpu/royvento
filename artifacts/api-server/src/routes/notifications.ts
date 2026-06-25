import { Router, type IRouter } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, loadUserFromRequest } from "../lib/auth";

const router: IRouter = Router();

router.get("/notifications", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, user.id))
    .orderBy(desc(notificationsTable.createdAt));
  res.json(
    rows.map((n) => ({
      id: n.id,
      userId: n.userId,
      title: n.title,
      message: n.message,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    })),
  );
});

// Mark every unread notification for the current user as read in a single
// atomic UPDATE. Defined before the "/:id/read" route so the literal path is
// never shadowed by the param route, and so the client only fires one request
// (the previous per-id fan-out reverted its optimistic update if any single
// request failed, making "Mark all read" appear to do nothing).
router.patch("/notifications/read-all", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const updated = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(
      and(
        eq(notificationsTable.userId, user.id),
        eq(notificationsTable.isRead, false),
      ),
    )
    .returning({ id: notificationsTable.id });
  res.json({ ok: true, count: updated.length });
});

router.patch("/notifications/:id/read", requireAuth(), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [updated] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(
      and(
        eq(notificationsTable.id, id),
        eq(notificationsTable.userId, user.id),
      ),
    )
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    id: updated.id,
    userId: updated.userId,
    title: updated.title,
    message: updated.message,
    isRead: updated.isRead,
    createdAt: updated.createdAt.toISOString(),
  });
});

export default router;
