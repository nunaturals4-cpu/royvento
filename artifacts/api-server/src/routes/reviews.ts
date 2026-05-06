import { Router, type IRouter } from "express";
import { db, reviewsTable, usersTable, bookingsTable } from "@workspace/db";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { CreateReviewBody } from "@workspace/api-zod";
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
  const users = await db.select().from(usersTable).where(inArray(usersTable.id, userIds));
  const uMap = new Map(users.map((u) => [u.id, u]));

  // For each review, check if the reviewer has a confirmed booking for this event
  const eventReviews = rows.filter((r) => r.eventId != null);
  const verifiedSet = new Set<number>();
  if (eventReviews.length > 0) {
    const bookings = await db
      .select()
      .from(bookingsTable)
      .where(
        inArray(
          bookingsTable.userId,
          eventReviews.map((r) => r.userId),
        ),
      );
    for (const review of eventReviews) {
      const hasBooking = bookings.some(
        (b) =>
          b.userId === review.userId &&
          b.eventId === review.eventId &&
          (b.status === "confirmed" || b.status === "completed"),
      );
      if (hasBooking) verifiedSet.add(review.id);
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
  }));
}

function parsePaging(req: { query: Record<string, unknown> }): { page: number; pageSize: number } {
  const pageRaw = Number(req.query["page"]);
  const sizeRaw = Number(req.query["pageSize"]);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize = Number.isFinite(sizeRaw) && sizeRaw >= 1 && sizeRaw <= 50 ? Math.floor(sizeRaw) : 5;
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

router.post("/reviews", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const imageUrls = sanitizeImageUrls(parsed.data.imageUrls);
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
