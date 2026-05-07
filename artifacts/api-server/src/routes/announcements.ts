import { Router, type IRouter } from "express";
import { db, announcementsTable, vendorsTable, eventsTable, bookingsTable, usersTable } from "@workspace/db";
import { createUserNotification } from "../lib/notify";
import { eq, desc, and, or, sql, inArray } from "drizzle-orm";
import { sendExpoPushWithToken } from "../lib/expoPush";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorage = new ObjectStorageService();

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
  genre: z.string().optional().default(""),
  eventType: z.string().optional().default(""),
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
      genre: parsed.data.genre,
      eventType: parsed.data.eventType,
    })
    .returning();

  // Broadcast to ALL users in throttled batches so the server is never overwhelmed
  setImmediate(async () => {
    try {
      const notifTitle = `${vendor.businessName}: ${parsed.data.title}`;
      const notifBody = parsed.data.body || parsed.data.title;
      const tag = `announcement-${row?.id ?? Date.now()}`;

      // Fetch all users including their Expo push tokens in one query
      const allUsers = await db
        .select({ id: usersTable.id, expoPushToken: usersTable.expoPushToken })
        .from(usersTable);

      const BATCH_SIZE = 20;
      const BATCH_DELAY_MS = 150;

      for (let i = 0; i < allUsers.length; i += BATCH_SIZE) {
        const batch = allUsers.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async ({ id: userId, expoPushToken }) => {
            try {
              // In-app notification for every user (also fans out web push)
              await createUserNotification({
                userId,
                title: notifTitle,
                message: notifBody,
                url: `/`,
                tag,
              });
              // Expo push (only fires if the user has a registered mobile token)
              if (expoPushToken) {
                sendExpoPushWithToken(userId, expoPushToken, {
                  title: notifTitle,
                  body: notifBody,
                  data: { screen: "home", tag },
                }).catch(() => {});
              }
            } catch {
              // non-critical per user — continue with next
            }
          }),
        );

        // Pause between batches to avoid overwhelming the event loop
        if (i + BATCH_SIZE < allUsers.length) {
          await new Promise<void>((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }
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
  const existing = await db
    .select({ imageUrl: announcementsTable.imageUrl })
    .from(announcementsTable)
    .where(and(eq(announcementsTable.id, id), eq(announcementsTable.vendorId, vendor.id)))
    .limit(1);
  const imageUrl = existing[0]?.imageUrl;
  await db
    .delete(announcementsTable)
    .where(and(eq(announcementsTable.id, id), eq(announcementsTable.vendorId, vendor.id)));
  if (imageUrl) { try { await objectStorage.deleteObject(imageUrl); } catch {} }
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
      a.genre         AS "genre",
      a.event_type    AS "eventType",
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

router.get("/announcements/slider", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const featured = await db.execute(sql`
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
      AND a.is_featured_slider = true
    ORDER BY a.created_at DESC
    LIMIT 10
  `);

  if (featured.rows.length > 0) {
    return res.json(featured.rows);
  }

  // Fallback: return recent announcements so the slider is never empty
  const recent = await db.execute(sql`
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
  return res.json(recent.rows);
});

router.get("/admin/announcements", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      a.id,
      a.title,
      a.body,
      a.announce_date      AS "announceDate",
      a.announce_time      AS "announceTime",
      a.image_url          AS "imageUrl",
      a.is_featured_slider AS "isFeaturedSlider",
      a.vendor_id          AS "vendorId",
      a.created_at         AS "createdAt",
      v.business_name      AS "vendorName"
    FROM announcements a
    JOIN vendors v ON v.id = a.vendor_id
    ORDER BY a.created_at DESC
  `);
  return res.json(rows.rows);
});

// Admin: create announcement (linked to an existing vendor)
const AdminAnnouncementBody = z.object({
  vendorId: z.number().int().positive(),
  title: z.string().min(1).max(255),
  body: z.string().optional().default(""),
  announceDate: z.string().optional().default(""),
  announceTime: z.string().optional().default(""),
});

router.post("/admin/announcements", requireAuth(["admin"]), async (req, res) => {
  const parsed = AdminAnnouncementBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  const vendorRows = await db
    .select({ id: vendorsTable.id })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, parsed.data.vendorId))
    .limit(1);
  if (!vendorRows[0]) return res.status(404).json({ error: "Vendor not found" });
  const [row] = await db
    .insert(announcementsTable)
    .values({
      vendorId: parsed.data.vendorId,
      title: parsed.data.title,
      body: parsed.data.body ?? "",
      announceDate: parsed.data.announceDate ?? "",
      announceTime: parsed.data.announceTime ?? "",
      imageUrl: "",
    })
    .returning();
  return res.json(row);
});

// Admin: delete an announcement
router.delete("/admin/announcements/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(announcementsTable).where(eq(announcementsTable.id, id));
  return res.json({ ok: true });
});

router.patch("/admin/announcements/:id/slider", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const { isFeaturedSlider } = req.body as { isFeaturedSlider: boolean };
  if (typeof isFeaturedSlider !== "boolean") {
    return res.status(400).json({ error: "isFeaturedSlider must be a boolean" });
  }
  const [row] = await db
    .update(announcementsTable)
    .set({ isFeaturedSlider })
    .where(eq(announcementsTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
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
