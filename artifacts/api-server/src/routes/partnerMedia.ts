import { Router, type IRouter } from "express";
import { db, partnerMediaTable, vendorsTable } from "@workspace/db";
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

router.get("/partner/media/me", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const vendor = await getMyVendor(user.id);
  if (!vendor) return res.json([]);
  const rows = await db
    .select()
    .from(partnerMediaTable)
    .where(eq(partnerMediaTable.vendorId, vendor.id))
    .orderBy(desc(partnerMediaTable.createdAt));
  return res.json(rows);
});

router.get("/partners/:vendorId/media", async (req, res) => {
  const id = Number(req.params["vendorId"]);
  if (!Number.isFinite(id))
    return res.status(400).json({ error: "Invalid id" });
  const rows = await db
    .select()
    .from(partnerMediaTable)
    .where(eq(partnerMediaTable.vendorId, id))
    .orderBy(desc(partnerMediaTable.createdAt));
  return res.json(rows);
});

const AddMediaBody = z.object({
  type: z.enum(["photo", "video"]),
  url: z.string().min(1),
  caption: z.string().optional().default(""),
  eventCategories: z.array(z.string()).optional().default([]),
});

router.post("/partner/media", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const vendor = await getMyVendor(user.id);
  if (!vendor)
    return res.status(400).json({ error: "Partner profile required" });
  const parsed = AddMediaBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [m] = await db
    .insert(partnerMediaTable)
    .values({
      vendorId: vendor.id,
      type: parsed.data.type,
      url: parsed.data.url,
      caption: parsed.data.caption ?? "",
      eventCategories: parsed.data.eventCategories ?? [],
    })
    .returning();
  return res.json(m);
});

router.delete("/partner/media/:id", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const vendor = await getMyVendor(user.id);
  if (!vendor) return res.status(400).json({ error: "Partner required" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id))
    return res.status(400).json({ error: "Invalid id" });
  await db
    .delete(partnerMediaTable)
    .where(
      and(
        eq(partnerMediaTable.id, id),
        eq(partnerMediaTable.vendorId, vendor.id),
      ),
    );
  return res.json({ ok: true });
});

const VALID_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const DayTimesSchema = z.object({ open: z.string().max(10), close: z.string().max(10) }).nullable();

const UpdatePartnerProfileBody = z.object({
  eventTypes: z.array(z.string()).optional(),
  budgetMin: z.number().nonnegative().optional(),
  budgetMax: z.number().nonnegative().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  address: z.string().max(500).optional(),
  coverImageUrl: z.string().optional(),
  openDays: z.array(z.enum(VALID_DAYS)).optional(),
  dayHours: z.record(DayTimesSchema).optional(),
});

router.patch(
  "/partner/profile",
  requireAuth(["vendor"]),
  async (req, res) => {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const vendor = await getMyVendor(user.id);
    if (!vendor)
      return res.status(400).json({ error: "Partner profile required" });
    const parsed = UpdatePartnerProfileBody.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid input" });
    const updates: Record<string, unknown> = {};
    if (parsed.data.eventTypes !== undefined)
      updates["eventTypes"] = parsed.data.eventTypes;
    if (parsed.data.budgetMin !== undefined)
      updates["budgetMin"] = String(parsed.data.budgetMin);
    if (parsed.data.budgetMax !== undefined)
      updates["budgetMax"] = String(parsed.data.budgetMax);
    if (parsed.data.state !== undefined) updates["state"] = parsed.data.state;
    if (parsed.data.city !== undefined) updates["city"] = parsed.data.city;
    if (parsed.data.country !== undefined)
      updates["country"] = parsed.data.country;
    if (parsed.data.coverImageUrl !== undefined)
      updates["coverImageUrl"] = parsed.data.coverImageUrl;
    if (parsed.data.address !== undefined)
      updates["address"] = parsed.data.address || null;
    if (parsed.data.openDays !== undefined)
      updates["openDays"] = parsed.data.openDays;
    if (parsed.data.dayHours !== undefined)
      updates["dayHours"] = parsed.data.dayHours !== null ? JSON.stringify(parsed.data.dayHours) : null;
    const [v] = await db
      .update(vendorsTable)
      .set(updates)
      .where(eq(vendorsTable.id, vendor.id))
      .returning();
    return res.json(v);
  },
);

export default router;
