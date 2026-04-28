import { Router, type IRouter } from "express";
import { db, announcementsTable, vendorsTable, eventsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";

const router: IRouter = Router();

async function getMyVendor(userId: number) {
  const rows = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

const AnnouncementBody = z.object({
  title: z.string().min(1).max(255),
  body: z.string().optional().default(""),
  announceDate: z.string().optional().default(""),
  announceTime: z.string().optional().default(""),
  imageUrl: z.string().optional().default(""),
});

router.get("/partner/announcements", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const vendor = await getMyVendor(user.id);
  if (!vendor) return res.json([]);
  const rows = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.vendorId, vendor.id))
    .orderBy(desc(announcementsTable.createdAt));
  return res.json(rows);
});

router.post("/partner/announcements", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const vendor = await getMyVendor(user.id);
  if (!vendor) return res.status(403).json({ error: "No partner profile" });
  const parsed = AnnouncementBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const [row] = await db
    .insert(announcementsTable)
    .values({
      vendorId: vendor.id,
      title: parsed.data.title,
      body: parsed.data.body,
      announceDate: parsed.data.announceDate,
      announceTime: parsed.data.announceTime,
      imageUrl: parsed.data.imageUrl,
    })
    .returning();
  return res.json(row);
});

router.patch("/partner/announcements/:id", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const vendor = await getMyVendor(user.id);
  if (!vendor) return res.status(403).json({ error: "No partner profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = AnnouncementBody.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const [row] = await db
    .update(announcementsTable)
    .set(parsed.data)
    .where(and(eq(announcementsTable.id, id), eq(announcementsTable.vendorId, vendor.id)))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.delete("/partner/announcements/:id", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const vendor = await getMyVendor(user.id);
  if (!vendor) return res.status(403).json({ error: "No partner profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  await db
    .delete(announcementsTable)
    .where(and(eq(announcementsTable.id, id), eq(announcementsTable.vendorId, vendor.id)));
  return res.json({ ok: true });
});

router.get("/events/:eventId/announcements", async (req, res) => {
  const eventId = Number(req.params["eventId"]);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: "Invalid id" });
  const evRows = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId))
    .limit(1);
  const ev = evRows[0];
  if (!ev) return res.status(404).json({ error: "Event not found" });
  const rows = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.vendorId, ev.vendorId))
    .orderBy(desc(announcementsTable.createdAt));
  return res.json(rows);
});

export default router;
