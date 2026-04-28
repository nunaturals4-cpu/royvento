import { Router, type IRouter } from "express";
import { db, wishlistsTable, eventsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { z } from "zod";

const router: IRouter = Router();

router.get("/wishlist", requireAuth(["user", "vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const rows = await db
    .select({ wishlist: wishlistsTable, event: eventsTable })
    .from(wishlistsTable)
    .innerJoin(eventsTable, eq(eventsTable.id, wishlistsTable.eventId))
    .where(eq(wishlistsTable.userId, user.id));
  res.json(rows.map((r) => ({ ...r.event, wishlistId: r.wishlist.id })));
});

const WishlistBody = z.object({ eventId: z.number().int().positive() });

router.post("/wishlist", requireAuth(["user", "vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const parsed = WishlistBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  const existing = await db
    .select()
    .from(wishlistsTable)
    .where(and(eq(wishlistsTable.userId, user.id), eq(wishlistsTable.eventId, parsed.data.eventId)))
    .limit(1);
  if (existing[0]) return res.json({ ok: true, id: existing[0].id });
  const [row] = await db
    .insert(wishlistsTable)
    .values({ userId: user.id, eventId: parsed.data.eventId })
    .returning();
  res.json({ ok: true, id: row.id });
});

router.delete("/wishlist/:eventId", requireAuth(["user", "vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const eventId = Number(req.params.eventId);
  if (isNaN(eventId)) return res.status(400).json({ error: "Invalid" });
  await db
    .delete(wishlistsTable)
    .where(and(eq(wishlistsTable.userId, user.id), eq(wishlistsTable.eventId, eventId)));
  res.json({ ok: true });
});

export default router;
