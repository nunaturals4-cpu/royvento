import { Router, type IRouter } from "express";
import {
  db,
  partnerBlockedDatesTable,
  vendorsTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { respondInvalid } from "../lib/validationError";

const router: IRouter = Router();

async function getMyVendor(userId: number) {
  const rows = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

router.get(
  "/partner/blocked-dates/me",
  requireAuth(["vendor"]),
  async (req, res) => {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const vendor = await getMyVendor(user.id);
    if (!vendor) return res.json([]);
    const rows = await db
      .select()
      .from(partnerBlockedDatesTable)
      .where(eq(partnerBlockedDatesTable.vendorId, vendor.id))
      .orderBy(desc(partnerBlockedDatesTable.date));
    return res.json(rows);
  },
);

router.get("/partners/:vendorId/blocked-dates", async (req, res) => {
  const id = Number(req.params["vendorId"]);
  if (!Number.isFinite(id))
    return res.status(400).json({ error: "Invalid id" });
  const rows = await db
    .select()
    .from(partnerBlockedDatesTable)
    .where(eq(partnerBlockedDatesTable.vendorId, id))
    .orderBy(desc(partnerBlockedDatesTable.date));
  return res.json(rows);
});

const AddBody = z.object({
  date: z.string().min(1),
  reason: z.string().optional().default(""),
  source: z.enum(["manual", "google"]).optional().default("manual"),
});

router.post(
  "/partner/blocked-dates",
  requireAuth(["vendor"]),
  async (req, res) => {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const vendor = await getMyVendor(user.id);
    if (!vendor)
      return res.status(400).json({ error: "Partner profile required" });
    const parsed = AddBody.safeParse(req.body);
    if (!parsed.success)
      return respondInvalid(res, parsed.error);
    const dateStr = parsed.data.date.slice(0, 10);
    try {
      const [b] = await db
        .insert(partnerBlockedDatesTable)
        .values({
          vendorId: vendor.id,
          date: dateStr,
          reason: parsed.data.reason ?? "",
          source: parsed.data.source ?? "manual",
        })
        .returning();
      return res.json(b);
    } catch {
      return res.status(409).json({ error: "Date already blocked" });
    }
  },
);

router.delete(
  "/partner/blocked-dates/:id",
  requireAuth(["vendor"]),
  async (req, res) => {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const vendor = await getMyVendor(user.id);
    if (!vendor) return res.status(400).json({ error: "Partner required" });
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id))
      return res.status(400).json({ error: "Invalid id" });
    await db
      .delete(partnerBlockedDatesTable)
      .where(
        and(
          eq(partnerBlockedDatesTable.id, id),
          eq(partnerBlockedDatesTable.vendorId, vendor.id),
        ),
      );
    return res.json({ ok: true });
  },
);

// Demo Google Calendar connect — stub returns guidance message
router.post(
  "/partner/blocked-dates/google-sync",
  requireAuth(["vendor"]),
  async (_req, res) => {
    return res.json({
      ok: false,
      message:
        "Google Calendar sync requires Google OAuth credentials. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable real-time sync. Manual blocked dates work fully.",
    });
  },
);

export default router;
