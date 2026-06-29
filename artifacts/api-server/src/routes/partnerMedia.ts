import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { db, partnerMediaTable, vendorsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { buildServerUploadUrl } from "../lib/uploadToken";
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
  if (!parsed.success) return respondInvalid(res, parsed.error);
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

const HH_MM_RE = /^(0\d|1\d|2[0-3]):([0-5]\d)$/;

const DayTimesSchema = z
  .object({
    open: z.string().max(10).refine((v) => !v || HH_MM_RE.test(v), { message: "Time must be HH:MM" }),
    close: z.string().max(10).refine((v) => !v || HH_MM_RE.test(v), { message: "Time must be HH:MM" }),
  })
  .refine((t) => {
    if (!t.open || !t.close) return true;
    return t.open !== t.close;
  }, { message: "Opening and closing time cannot be the same" })
  .nullable();

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
  danceFloor: z.enum(["dedicated", "general", "none"]).nullable().optional(),
  danceFloorPhotos: z.array(z.string().min(1)).optional(),
  menuUrl: z.string().optional(),
  menuUrls: z.array(z.string()).optional(),
  barMenuUrls: z.array(z.string()).optional(),
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
      return respondInvalid(res, parsed.error);
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
    if (parsed.data.danceFloor !== undefined)
      updates["danceFloor"] = parsed.data.danceFloor ?? null;
    if (parsed.data.danceFloorPhotos !== undefined)
      updates["danceFloorPhotos"] = parsed.data.danceFloorPhotos;
    if (parsed.data.menuUrl !== undefined)
      updates["menuUrl"] = parsed.data.menuUrl;
    if (parsed.data.menuUrls !== undefined)
      updates["menuUrls"] = parsed.data.menuUrls;
    if (parsed.data.barMenuUrls !== undefined)
      updates["barMenuUrls"] = parsed.data.barMenuUrls;
    const [v] = await db
      .update(vendorsTable)
      .set(updates)
      .where(eq(vendorsTable.id, vendor.id))
      .returning();
    return res.json(v);
  },
);

const DeleteMenuFileBody = z.object({
  url: z.string().min(1),
});

/**
 * DELETE /partner/menu-file
 *
 * Remove a specific URL from the vendor's menuUrls array.
 * Also clears the legacy menuUrl field if it matches.
 * Only accessible by authenticated vendors.
 */
router.delete(
  "/partner/menu-file",
  requireAuth(["vendor"]),
  async (req, res) => {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const vendor = await getMyVendor(user.id);
    if (!vendor)
      return res.status(400).json({ error: "Partner profile required" });

    const parsed = DeleteMenuFileBody.safeParse(req.body);
    if (!parsed.success) return respondInvalid(res, parsed.error);

    const { url } = parsed.data;

    const [updated] = await db
      .update(vendorsTable)
      .set({
        menuUrls: sql`array_remove(${vendorsTable.menuUrls}, ${url}::text)`,
        menuUrl: sql`CASE WHEN ${vendorsTable.menuUrl} = ${url} THEN '' ELSE ${vendorsTable.menuUrl} END`,
      })
      .where(eq(vendorsTable.id, vendor.id))
      .returning();

    return res.json(updated);
  },
);

const objectStorageService = new ObjectStorageService();

const ALLOWED_MENU_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const ALLOWED_MENU_TYPES = ["application/pdf", ...ALLOWED_MENU_IMAGE_TYPES];

// Filename-extension fallback for clients that report an empty/`octet-stream`
// content type (e.g. Windows browsers don't know the `.avif` MIME type).
const MENU_EXT_TO_TYPE: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

function resolveMenuType(name: string, contentType: string): string {
  if (ALLOWED_MENU_TYPES.includes(contentType)) return contentType;
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  return MENU_EXT_TO_TYPE[ext] ?? contentType;
}
const MAX_MENU_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB — same cap as managed proxy
const MAX_MENU_BYTES = 20 * 1024 * 1024; // 20 MB — PDF cap

const MenuUploadRequestBody = z.object({
  name: z.string().min(1),
  size: z.number().int().positive(),
  contentType: z.string().min(1),
});

/**
 * POST /partner/menu-upload
 *
 * Request an upload URL for a vendor menu file (PDF or image).
 * Only accessible by authenticated vendors.
 *
 * - Image files (JPEG, PNG, WebP) are routed through the server-side proxy
 *   and stored as-is (max 5 MB, no compression).
 * - PDF files receive a direct GCS presigned URL and are stored as-is.
 */
router.post(
  "/partner/menu-upload",
  requireAuth(["vendor"]),
  async (req, res) => {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const vendor = await getMyVendor(user.id);
    if (!vendor)
      return res.status(400).json({ error: "Partner profile required" });

    const parsed = MenuUploadRequestBody.safeParse(req.body);
    if (!parsed.success) return respondInvalid(res, parsed.error);

    const { name, size } = parsed.data;
    const contentType = resolveMenuType(name, parsed.data.contentType);

    if (!ALLOWED_MENU_TYPES.includes(contentType))
      return res
        .status(400)
        .json({ error: "Only PDF, JPEG, PNG, WebP, GIF, and AVIF files are allowed" });

    const isImage = ALLOWED_MENU_IMAGE_TYPES.has(contentType);
    const maxBytes = isImage ? MAX_MENU_IMAGE_BYTES : MAX_MENU_BYTES;
    if (size > maxBytes)
      return res.status(400).json({
        error: isImage ? "Image must be under 5 MB" : "Menu file must be under 20 MB",
      });

    try {
      if (isImage) {
        // Route image uploads through the server-side proxy so compression is applied.
        const uuid = randomUUID();
        const objectPath = `/objects/uploads/${uuid}`;
        const uploadURL = buildServerUploadUrl(req, uuid, size, contentType);
        res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
      } else {
        // PDF files bypass compression and go directly to GCS.
        const uploadURL = await objectStorageService.getObjectEntityUploadURL();
        const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
        res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
      }
    } catch (error) {
      req.log.error({ err: error }, "Error generating menu upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

export default router;
