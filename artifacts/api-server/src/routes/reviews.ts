import { Router, type IRouter } from "express";
import { db, reviewsTable, usersTable, bookingsTable, vendorsTable, vendorManagersTable } from "@workspace/db";
import { eq, desc, inArray, sql, and } from "drizzle-orm";
import { CreateReviewBody, UpdateReviewBody } from "@workspace/api-zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";

const router: IRouter = Router();

interface ReviewRow {
  id: number;
  userId: number;
  eventId: number | null;
  vendorId: number;
  rating: number;
  comment: string;
  imageUrls: string[];
  createdAt: Date;
}

async function serializeReviews(rows: ReviewRow[]) {
  if (rows.length === 0) return [];
  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const vendorIds = Array.from(new Set(rows.map((r) => r.vendorId)));
  const [users, vendors] = await Promise.all([
    db.select().from(usersTable).where(inArray(usersTable.id, userIds)),
    db.select().from(vendorsTable).where(inArray(vendorsTable.id, vendorIds)),
  ]);
  const uMap = new Map(users.map((u) => [u.id, u]));
  const vMap = new Map(vendors.map((v) => [v.id, v]));

  // A review is "verified" if the reviewer has a checked-in booking at this vendor.
  const verifiedSet = new Set<number>();
  if (rows.length > 0) {
    const bookings = await db
      .select()
      .from(bookingsTable)
      .where(
        and(
          inArray(bookingsTable.userId, userIds),
          inArray(bookingsTable.vendorId, vendorIds),
          eq(bookingsTable.checkedIn, true),
        ),
      );
    for (const review of rows) {
      const hasCheckIn = bookings.some(
        (b) => b.userId === review.userId && b.vendorId === review.vendorId && b.checkedIn === true,
      );
      if (hasCheckIn) verifiedSet.add(review.id);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    eventId: r.eventId ?? undefined,
    vendorId: r.vendorId,
    rating: r.rating,
    comment: r.comment,
    imageUrls: r.imageUrls ?? [],
    createdAt: r.createdAt.toISOString(),
    userName: uMap.get(r.userId)?.name ?? "Customer",
    userImage: uMap.get(r.userId)?.profileImage ?? "",
    verifiedBooking: verifiedSet.has(r.id),
    vendorName: vMap.get(r.vendorId)?.businessName ?? "",
  }));
}

function parsePaging(req: { query: Record<string, unknown> }, defaultSize = 5, maxSize = 100): { page: number; pageSize: number } {
  const pageRaw = Number(req.query["page"]);
  const sizeRaw = Number(req.query["pageSize"]);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize = Number.isFinite(sizeRaw) && sizeRaw >= 1 && sizeRaw <= maxSize ? Math.floor(sizeRaw) : defaultSize;
  return { page, pageSize };
}

const ALLOWED_IMAGE_PREFIX = /^(https?:\/\/|\/api\/storage\/)/;

function sanitizeImageUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed || trimmed.length > 2048) continue;
    if (!ALLOWED_IMAGE_PREFIX.test(trimmed)) continue;
    out.push(trimmed);
    if (out.length >= 5) break;
  }
  return out;
}

/** Returns true if the user has at least one checked-in booking at this vendor. */
async function hasCheckInForVendor(userId: number, vendorId: number): Promise<boolean> {
  const rows = await db
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.userId, userId),
        eq(bookingsTable.vendorId, vendorId),
        eq(bookingsTable.checkedIn, true),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Returns the list of vendor IDs owned (or managed) by this user. */
async function vendorIdsOwnedBy(userId: number): Promise<number[]> {
  const [owned, managed] = await Promise.all([
    db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.userId, userId)),
    db.select({ vendorId: vendorManagersTable.vendorId }).from(vendorManagersTable)
      .where(and(eq(vendorManagersTable.managerId, userId), eq(vendorManagersTable.status, "accepted"))),
  ]);
  const ids = new Set<number>();
  for (const r of owned) ids.add(r.id);
  for (const r of managed) ids.add(r.vendorId);
  return Array.from(ids);
}

router.get("/reviews/eligibility/vendor/:vendorId", async (req, res) => {
  const vendorId = Number(req.params["vendorId"]);
  if (!Number.isFinite(vendorId)) { res.status(400).json({ error: "Invalid vendorId" }); return; }
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.json({ eligible: false, reason: "not_authenticated" });
    return;
  }
  const existing = await db
    .select({ id: reviewsTable.id })
    .from(reviewsTable)
    .where(and(eq(reviewsTable.userId, user.id), eq(reviewsTable.vendorId, vendorId)))
    .limit(1);
  if (existing[0]) {
    res.json({ eligible: false, reason: "already_reviewed", existingReviewId: existing[0].id });
    return;
  }
  const ok = await hasCheckInForVendor(user.id, vendorId);
  if (!ok) {
    res.json({ eligible: false, reason: "no_checkin" });
    return;
  }
  res.json({ eligible: true, reason: "ok" });
});

router.get("/reviews/mine", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.userId, user.id))
    .orderBy(desc(reviewsTable.createdAt));
  res.json(await serializeReviews(rows as ReviewRow[]));
});

router.get("/reviews/admin", requireAuth(["admin"]), async (req, res) => {
  const { page, pageSize } = parsePaging(req, 20, 100);
  const offset = (page - 1) * pageSize;
  const filters = [];
  const vendorIdRaw = Number(req.query["vendorId"]);
  if (Number.isFinite(vendorIdRaw) && vendorIdRaw > 0) filters.push(eq(reviewsTable.vendorId, vendorIdRaw));
  const ratingRaw = Number(req.query["rating"]);
  if (Number.isFinite(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5) filters.push(eq(reviewsTable.rating, ratingRaw));
  const verifiedRaw = req.query["verified"];
  if (verifiedRaw === "true" || verifiedRaw === "false") {
    const wantVerified = verifiedRaw === "true";
    const existsClause = sql`EXISTS (SELECT 1 FROM ${bookingsTable} b WHERE b.${sql.raw("user_id")} = ${reviewsTable.userId} AND b.${sql.raw("vendor_id")} = ${reviewsTable.vendorId} AND b.${sql.raw("checked_in")} = true)`;
    filters.push(wantVerified ? existsClause : sql`NOT ${existsClause}`);
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const totalRows = where
    ? await db.select({ value: sql<number>`count(*)::int` }).from(reviewsTable).where(where)
    : await db.select({ value: sql<number>`count(*)::int` }).from(reviewsTable);
  const total = Number(totalRows[0]?.value ?? 0);

  const baseQuery = db.select().from(reviewsTable);
  const rows = await (where ? baseQuery.where(where) : baseQuery)
    .orderBy(desc(reviewsTable.createdAt))
    .limit(pageSize)
    .offset(offset);

  res.json({ items: await serializeReviews(rows as ReviewRow[]), total, page, pageSize });
});

router.get("/reviews/partner", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const vendorIds = await vendorIdsOwnedBy(user.id);
  const { page, pageSize } = parsePaging(req, 20, 100);
  const offset = (page - 1) * pageSize;
  if (vendorIds.length === 0) {
    res.json({ items: [], total: 0, page, pageSize });
    return;
  }
  const totalRows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(reviewsTable)
    .where(inArray(reviewsTable.vendorId, vendorIds));
  const total = Number(totalRows[0]?.value ?? 0);
  const rows = await db
    .select()
    .from(reviewsTable)
    .where(inArray(reviewsTable.vendorId, vendorIds))
    .orderBy(desc(reviewsTable.createdAt))
    .limit(pageSize)
    .offset(offset);
  res.json({ items: await serializeReviews(rows as ReviewRow[]), total, page, pageSize });
});

router.post("/reviews", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  // Eligibility: must have a checked-in booking at this vendor.
  const eligible = await hasCheckInForVendor(user.id, parsed.data.vendorId);
  if (!eligible) {
    res.status(403).json({
      error: "Only verified guests can review — book and check in first.",
      code: "not_eligible",
    });
    return;
  }

  const imageUrls = sanitizeImageUrls(parsed.data.imageUrls);
  try {
    const [r] = await db
      .insert(reviewsTable)
      .values({
        userId: user.id,
        eventId: parsed.data.eventId ?? null,
        vendorId: parsed.data.vendorId,
        rating: parsed.data.rating,
        comment: parsed.data.comment,
        imageUrls,
      })
      .returning();
    if (!r) { res.status(500).json({ error: "Failed" }); return; }
    const [out] = await serializeReviews([r as ReviewRow]);
    res.json(out);
  } catch (err: unknown) {
    // Catch the unique-index violation surface a friendly message instead of 500.
    const msg = err instanceof Error ? err.message : String(err);
    if (/reviews_user_vendor_uniq|duplicate key|unique/i.test(msg)) {
      res.status(409).json({
        error: "You've already reviewed this pub. You can edit your existing review.",
        code: "already_reviewed",
      });
      return;
    }
    req.log.error({ err }, "Failed to create review");
    res.status(500).json({ error: "Failed" });
  }
});

router.patch("/reviews/:reviewId", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reviewId = Number(req.params["reviewId"]);
  if (!Number.isFinite(reviewId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateReviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const [existing] = await db.select().from(reviewsTable).where(eq(reviewsTable.id, reviewId)).limit(1);
  if (!existing) { res.status(404).json({ error: "Review not found" }); return; }
  const isOwner = existing.userId === user.id;
  const isAdmin = user.role === "admin";
  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const patch: Partial<{ rating: number; comment: string; imageUrls: string[] }> = {};
  if (parsed.data.rating !== undefined) patch.rating = parsed.data.rating;
  if (parsed.data.comment !== undefined) patch.comment = parsed.data.comment;
  if (parsed.data.imageUrls !== undefined) patch.imageUrls = sanitizeImageUrls(parsed.data.imageUrls);

  if (Object.keys(patch).length === 0) {
    const [out] = await serializeReviews([existing as ReviewRow]);
    res.json(out);
    return;
  }

  const [updated] = await db
    .update(reviewsTable)
    .set(patch)
    .where(eq(reviewsTable.id, reviewId))
    .returning();
  if (!updated) { res.status(500).json({ error: "Failed" }); return; }
  const [out] = await serializeReviews([updated as ReviewRow]);
  res.json(out);
});

router.delete("/reviews/:reviewId", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reviewId = Number(req.params["reviewId"]);
  if (!Number.isFinite(reviewId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(reviewsTable).where(eq(reviewsTable.id, reviewId)).limit(1);
  if (!existing) { res.status(404).json({ error: "Review not found" }); return; }

  const isOwner = existing.userId === user.id;
  const isAdmin = user.role === "admin";
  let isPartnerOfVendor = false;
  if (!isOwner && !isAdmin) {
    const ownedIds = await vendorIdsOwnedBy(user.id);
    isPartnerOfVendor = ownedIds.includes(existing.vendorId);
  }
  if (!isOwner && !isAdmin && !isPartnerOfVendor) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(reviewsTable).where(eq(reviewsTable.id, reviewId));
  req.log.info({ reviewId, deletedBy: user.id, role: user.role }, "Review deleted");
  res.json({ ok: true });
});

router.get("/reviews/event/:eventId", async (req, res) => {
  const id = Number(req.params["eventId"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { page, pageSize } = parsePaging(req);
  const offset = (page - 1) * pageSize;

  const [{ value: total }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(reviewsTable)
    .where(eq(reviewsTable.eventId, id));

  const rows = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.eventId, id))
    .orderBy(desc(reviewsTable.createdAt))
    .limit(pageSize)
    .offset(offset);

  res.json({
    items: await serializeReviews(rows as ReviewRow[]),
    total: Number(total) || 0,
    page,
    pageSize,
  });
});

router.get("/reviews/vendor/:vendorId", async (req, res) => {
  const id = Number(req.params["vendorId"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { page, pageSize } = parsePaging(req);
  const offset = (page - 1) * pageSize;

  const [{ value: total }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(reviewsTable)
    .where(eq(reviewsTable.vendorId, id));

  const rows = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.vendorId, id))
    .orderBy(desc(reviewsTable.createdAt))
    .limit(pageSize)
    .offset(offset);

  res.json({
    items: await serializeReviews(rows as ReviewRow[]),
    total: Number(total) || 0,
    page,
    pageSize,
  });
});

export default router;
