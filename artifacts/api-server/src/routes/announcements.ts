import { Router, type IRouter } from "express";
import { db, announcementsTable, vendorsTable, eventsTable, bookingsTable, usersTable } from "@workspace/db";
import { eq, desc, and, or, sql, inArray } from "drizzle-orm";
import { sendWebPushToUser } from "./webPush";
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

  // Notify all users with confirmed/completed bookings for this vendor's events
  setImmediate(async () => {
    try {
      const eventRows = await db
        .select({ id: eventsTable.id })
        .from(eventsTable)
        .where(eq(eventsTable.vendorId, vendor.id));
      const eventIds = eventRows.map((e) => e.id);
      if (eventIds.length === 0) return;
      const bookingRows = await db
        .selectDistinct({ userId: bookingsTable.userId })
        .from(bookingsTable)
        .where(
          and(
            inArray(bookingsTable.eventId, eventIds),
            inArray(bookingsTable.status, ["confirmed", "completed"]),
          ),
        );
      for (const { userId } of bookingRows) {
        sendWebPushToUser(userId, {
          title: `${vendor.businessName}: ${parsed.data.title}`,
          body: parsed.data.body || parsed.data.title,
          url: `/`,
          tag: `announcement-${row?.id ?? Date.now()}`,
        }).catch(() => {});
      }
    } catch {
      // non-critical — ignore errors
    }
  });

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

router.get("/announcements/recent", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.execute(sql`
    SELECT
      a.id,
      a.title,
      a.body,
      a.announce_date AS "announceDate",
      a.announce_time AS "announceTime",
      a.image_url     AS "imageUrl",
      COALESCE(NULLIF(a.image_url, ''), v.cover_image_url) AS "coverImageUrl",
      a.vendor_id     AS "vendorId",
      a.created_at    AS "createdAt",
      v.business_name AS "vendorName",
      COALESCE(
        a.event_id,
        (SELECT id FROM events WHERE vendor_id = a.vendor_id ORDER BY id DESC LIMIT 1)
      ) AS "eventId",
      COALESCE(
        (SELECT title FROM events WHERE id = a.event_id),
        (SELECT title FROM events WHERE vendor_id = a.vendor_id ORDER BY id DESC LIMIT 1)
      ) AS "eventTitle"
    FROM announcements a
    JOIN vendors v ON v.id = a.vendor_id
    WHERE (a.announce_date = '' OR a.announce_date >= ${today})
    ORDER BY a.created_at DESC
    LIMIT 10
  `);
  return res.json(rows.rows);
});

router.get("/vendors/:vendorId/announcements", async (req, res) => {
  const vendorId = Number(req.params["vendorId"]);
  if (!Number.isFinite(vendorId)) return res.status(400).json({ error: "Invalid id" });
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(announcementsTable)
    .where(
      and(
        eq(announcementsTable.vendorId, vendorId),
        or(
          eq(announcementsTable.announceDate, ""),
          sql`${announcementsTable.announceDate} >= ${today}`,
        ),
      ),
    )
    .orderBy(desc(announcementsTable.createdAt))
    .limit(5);
  return res.json(rows);
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
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(announcementsTable)
    .where(
      and(
        eq(announcementsTable.vendorId, ev.vendorId),
        or(
          eq(announcementsTable.announceDate, ""),
          sql`${announcementsTable.announceDate} >= ${today}`,
        ),
      ),
    )
    .orderBy(desc(announcementsTable.createdAt));
  return res.json(rows);
});

export default router;
