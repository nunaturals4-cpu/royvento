import { Router, type IRouter } from "express";
import { db, reviewsTable, usersTable, bookingsTable } from "@workspace/db";
import { eq, desc, inArray, and } from "drizzle-orm";
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
    createdAt: r.createdAt.toISOString(),
    userName: uMap.get(r.userId)?.name ?? "Customer",
    userImage: uMap.get(r.userId)?.profileImage ?? "",
    verifiedBooking: verifiedSet.has(r.id),
  }));
}

router.post("/reviews", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const [r] = await db
    .insert(reviewsTable)
    .values({
      userId: user.id,
      eventId: parsed.data.eventId ?? null,
      vendorId: parsed.data.vendorId,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
    })
    .returning();
  if (!r) { res.status(500).json({ error: "Failed" }); return; }
  const [out] = await serializeReviews([r]);
  res.json(out);
});

router.get("/reviews/event/:eventId", async (req, res) => {
  const id = Number(req.params["eventId"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.eventId, id))
    .orderBy(desc(reviewsTable.createdAt));
  res.json(await serializeReviews(rows));
});

router.get("/reviews/vendor/:vendorId", async (req, res) => {
  const id = Number(req.params["vendorId"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.vendorId, id))
    .orderBy(desc(reviewsTable.createdAt));
  res.json(await serializeReviews(rows));
});

export default router;
