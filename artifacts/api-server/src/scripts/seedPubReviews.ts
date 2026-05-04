import { db, usersTable, eventsTable, reviewsTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const REVIEWER_NAMES = [
  "Arjun Mehta",
  "Priya Sharma",
  "Rohan Das",
  "Kavya Reddy",
  "Siddharth Nair",
  "Ananya Iyer",
  "Vikram Bose",
];

const RATINGS = [4, 5, 4, 5, 5, 4, 4];

const COMMENTS = [
  "Amazing vibe and great cocktails! Will definitely come back.",
  "Loved the atmosphere, friendly staff, and the DJ was on point all night.",
  "Great place for a night out. The drinks are well-priced and the crowd is fun.",
  "Fantastic experience overall. The music selection and service were top-notch.",
  "Had a blast here. The energy on weekends is unmatched — a top-tier spot.",
  "One of the best pubs in the city. Superb cocktails and a really cool interior.",
  "Incredible ambience and attentive staff. Highly recommend for a special night out.",
];

/**
 * Return or create a seed reviewer account for a specific event slot.
 *
 * Identity is keyed on stable (eventId, reviewerIndex) — eventId is immutable
 * so the mapping is deterministic across reruns regardless of query order.
 *
 * The DB unique constraint is on (userId, vendorId), not (userId, eventId).
 * To guarantee exactly 7 reviews per event, even when a vendor has multiple
 * pub events, we need 7 distinct (userId, vendorId) pairs per event. Scoping
 * reviewer identity to eventId achieves this without touching the schema.
 */
async function ensureReviewer(
  eventId: number,
  ri: number,
  passwordHash: string,
): Promise<typeof usersTable.$inferSelect | undefined> {
  const email = `seed.reviewer.ev${eventId}.r${ri}@royvento.in`;
  const referralCode = `SREV${eventId}R${ri}`;

  let user = (
    await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1)
  )[0];
  if (!user) {
    [user] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash,
        name: REVIEWER_NAMES[ri % REVIEWER_NAMES.length]!,
        role: "user",
        phone: "",
        referralCode,
      })
      .returning();
  }
  return user;
}

async function main() {
  console.log("Seeding pub reviews…");

  // Stable ordering makes iteration deterministic across reruns.
  const pubs = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.type, "pub"), eq(eventsTable.approvalStatus, "approved")))
    .orderBy(asc(eventsTable.vendorId), asc(eventsTable.id));

  console.log(`Found ${pubs.length} approved pub events.`);

  const passwordHash = await bcrypt.hash("Seed@Reviewer#2024!", 10);
  let inserted = 0;
  let skipped = 0;

  for (const event of pubs) {
    for (let ri = 0; ri < 7; ri++) {
      const reviewer = await ensureReviewer(event.id, ri, passwordHash);
      if (!reviewer) continue;

      const result = await db
        .insert(reviewsTable)
        .values({
          userId:   reviewer.id,
          eventId:  event.id,
          vendorId: event.vendorId,
          rating:   RATINGS[ri % RATINGS.length] ?? 4,
          comment:  COMMENTS[ri % COMMENTS.length] ?? "Great pub!",
        })
        .onConflictDoNothing()
        .returning();

      if (result.length > 0) inserted++;
      else skipped++;
    }
  }

  console.log(`Done! Inserted: ${inserted}, Skipped (already existed): ${skipped}`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
