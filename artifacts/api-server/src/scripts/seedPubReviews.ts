/**
 * seedPubReviews.ts — Seed realistic fake reviews for every approved pub event.
 *
 * DESIGN NOTE — why supplemental accounts exist:
 * The `reviews` table has a unique constraint on (userId, vendorId), meaning a
 * user can only review a given vendor once — not once per event. With only 7
 * canonical seed reviewers, vendors that have multiple approved pub events can
 * only receive reviews on their first (lowest-id) event before the constraint
 * blocks further inserts for the same reviewer+vendor pair.
 *
 * To guarantee every pub listing card shows a rating, the script falls back to
 * supplemental per-event accounts (seed.reviewer.ev<eventId>.r<ri>@royvento.in)
 * whenever a canonical reviewer's insert is blocked by conflict. For vendors with
 * a single pub event the 7 canonical accounts are used exclusively. Supplemental
 * accounts are only created when the current schema makes them necessary.
 *
 * The script is idempotent: all inserts use ON CONFLICT DO NOTHING and reviewer
 * accounts are looked up by email before creation, so reruns are safe.
 */
import { db, usersTable, eventsTable, reviewsTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

/**
 * Exactly 7 primary seed reviewer accounts with the required email pattern.
 * These are the "canonical" fake reviewers referenced in the task spec.
 */
const PRIMARY_REVIEWERS = [
  { email: "seed.reviewer.001@royvento.in", name: "Arjun Mehta",    code: "SEEDREV001" },
  { email: "seed.reviewer.002@royvento.in", name: "Priya Sharma",   code: "SEEDREV002" },
  { email: "seed.reviewer.003@royvento.in", name: "Rohan Das",      code: "SEEDREV003" },
  { email: "seed.reviewer.004@royvento.in", name: "Kavya Reddy",    code: "SEEDREV004" },
  { email: "seed.reviewer.005@royvento.in", name: "Siddharth Nair", code: "SEEDREV005" },
  { email: "seed.reviewer.006@royvento.in", name: "Ananya Iyer",    code: "SEEDREV006" },
  { email: "seed.reviewer.007@royvento.in", name: "Vikram Bose",    code: "SEEDREV007" },
];

const REVIEWER_NAMES = PRIMARY_REVIEWERS.map((r) => r.name);

const RATINGS  = [4, 5, 4, 5, 5, 4, 4];

const COMMENTS = [
  "Amazing vibe and great cocktails! Will definitely come back.",
  "Loved the atmosphere, friendly staff, and the DJ was on point all night.",
  "Great place for a night out. The drinks are well-priced and the crowd is fun.",
  "Fantastic experience overall. The music selection and service were top-notch.",
  "Had a blast here. The energy on weekends is unmatched — a top-tier spot.",
  "One of the best pubs in the city. Superb cocktails and a really cool interior.",
  "Incredible ambience and attentive staff. Highly recommend for a special night out.",
];

async function upsertUser(
  email: string,
  name: string,
  referralCode: string,
  passwordHash: string,
): Promise<typeof usersTable.$inferSelect | undefined> {
  let user = (
    await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1)
  )[0];
  if (!user) {
    [user] = await db
      .insert(usersTable)
      .values({ email, passwordHash, name, role: "user", phone: "", referralCode })
      .returning();
  }
  return user;
}

async function main() {
  console.log("Seeding pub reviews…");

  const passwordHash = await bcrypt.hash("Seed@Reviewer#2024!", 10);

  // Step 1 — Ensure the 7 primary seed reviewer accounts always exist.
  const primaryUsers: (typeof usersTable.$inferSelect)[] = [];
  for (const r of PRIMARY_REVIEWERS) {
    const u = await upsertUser(r.email, r.name, r.code, passwordHash);
    if (u) primaryUsers.push(u);
  }
  console.log(`Ensured ${primaryUsers.length} primary reviewer accounts.`);

  // Stable ordering ensures deterministic (primary event = lowest id) per vendor.
  const pubs = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.type, "pub"), eq(eventsTable.approvalStatus, "approved")))
    .orderBy(asc(eventsTable.vendorId), asc(eventsTable.id));

  console.log(`Found ${pubs.length} approved pub events.`);

  /**
   * Strategy: attempt each review with the matching primary reviewer first.
   * The DB unique constraint is (userId, vendorId) — a primary reviewer can
   * only review a given vendor once. If an event's vendor was already reviewed
   * by that primary reviewer (conflict), fall back to a supplemental per-event
   * account (seed.reviewer.ev<eventId>.r<ri>@royvento.in). This guarantees
   * every pub event gets exactly 7 reviews while preserving the 7 canonical
   * named accounts as the primary reviewers for single-event vendors.
   */
  let inserted = 0;
  let skipped = 0;

  for (const event of pubs) {
    for (let ri = 0; ri < 7; ri++) {
      const primaryUser = primaryUsers[ri];
      if (!primaryUser) continue;

      // Try primary reviewer first.
      const primaryResult = await db
        .insert(reviewsTable)
        .values({
          userId:   primaryUser.id,
          eventId:  event.id,
          vendorId: event.vendorId,
          rating:   RATINGS[ri % RATINGS.length] ?? 4,
          comment:  COMMENTS[ri % COMMENTS.length] ?? "Great pub!",
        })
        .onConflictDoNothing()
        .returning();

      if (primaryResult.length > 0) {
        inserted++;
        continue;
      }

      // Primary reviewer is already used for this vendor — create/reuse a
      // supplemental per-event account to ensure this event gets coverage.
      const suppEmail = `seed.reviewer.ev${event.id}.r${ri}@royvento.in`;
      const suppCode  = `SREV${event.id}R${ri}`;
      const suppName  = REVIEWER_NAMES[ri % REVIEWER_NAMES.length]!;
      const suppUser  = await upsertUser(suppEmail, suppName, suppCode, passwordHash);

      if (!suppUser) { skipped++; continue; }

      const suppResult = await db
        .insert(reviewsTable)
        .values({
          userId:   suppUser.id,
          eventId:  event.id,
          vendorId: event.vendorId,
          rating:   RATINGS[ri % RATINGS.length] ?? 4,
          comment:  COMMENTS[ri % COMMENTS.length] ?? "Great pub!",
        })
        .onConflictDoNothing()
        .returning();

      if (suppResult.length > 0) inserted++;
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
