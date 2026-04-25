import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { UpdateUserRoleBody } from "@workspace/api-zod";
import { requireAuth, userToPublic, type Role } from "../lib/auth";

const router: IRouter = Router();

router.get("/users", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt));
  res.json(rows.map(userToPublic));
});

router.patch(
  "/users/:userId/role",
  requireAuth(["admin"]),
  async (req, res) => {
    const userId = Number(req.params["userId"]);
    if (!Number.isFinite(userId)) {
      res.status(400).json({ error: "Invalid userId" });
      return;
    }
    const parsed = UpdateUserRoleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const role: Role = parsed.data.role as Role;
    const [updated] = await db
      .update(usersTable)
      .set({ role })
      .where(eq(usersTable.id, userId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(userToPublic(updated));
  },
);

router.delete("/users/:userId", requireAuth(["admin"]), async (req, res) => {
  const userId = Number(req.params["userId"]);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  res.json({ ok: true });
});

export default router;
