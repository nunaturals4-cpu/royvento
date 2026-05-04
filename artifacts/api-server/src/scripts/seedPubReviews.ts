import { db, usersTable, eventsTable, reviewsTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Exactly 7 deterministic seed reviewer accounts.
// Emails are stable across reruns; role is "user".
const SEED_REVIEWERS = [
  { email: "seed.reviewer.001@royvento.in", name: "Arjun Mehta",     code: "SEEDREV001" },
  { email: "seed.reviewer.002@royvento.in", name: "Priya Sharma",    code: "SEEDREV002" },
  { email: "seed.reviewer.003@royvento.in", name: "Rohan Das",       code: "SEEDREV003" },
  { email: "seed.reviewer.004@royvento.in", name: "Kavya Reddy",     code: "SEEDREV004" },
  { email: "seed.reviewer.005@royvento.in", name: "Siddharth Nair",  code: "SEEDREV005" },
  { email: "seed.reviewer.006@royvento.in", name: "Ananya Iyer",     code: "SEEDREV006" },
  { email: "seed.reviewer.007@royvento.in", name: "Vikram Bose",     code: "SEEDREV007" },
];

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

async function ensureReviewers(passwordHash: string) {
  const users: (typeof usersTable.$inferSelect)[] = [];
  for (const r of SEED_REVIEWERS) {
    let user = (
      await db.select().from(usersTable).where(eq(usersTable.email, r.email)).limit(1)
    )[0];
    if (!user) {
      [user] = await db
        .insert(usersTable)
        .values({
          email: r.email,
          passwordHash,
          name: r.name,
          role: "user",
          phone: "",
          referralCode: r.code,
        })
        .returning();
    }
    if (user) users.push(user);
  }
  return users;
}

async function main() {
  console.log("Seeding pub reviews...");

  const passwordHash = await bcrypt.hash("Seed@Reviewer#2024!", 10);
  const reviewers = await ensureReviewers(passwordHash);
  console.log(`Ensured ${reviewers.length} reviewer accounts.`);

  // Stable ordering ensures deterministic iteration across reruns.
  const pubs = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.type, "pub"), eq(eventsTable.approvalStatus, "approved")))
    .orderBy(asc(eventsTable.vendorId), asc(eventsTable.id));

  console.log(`Found ${pubs.length} approved pub events.`);

  // The DB unique constraint is (userId, vendorId). Each of the 7 reviewers can
  // review a given vendor once. For vendors with a single pub event that event
  // receives all 7 reviews. For vendors with multiple pub events the first event
  // (lowest id) gets the reviews; subsequent events are skipped by conflict guard.
  let inserted = 0;
  let skipped = 0;

  for (const event of pubs) {
    for (let ri = 0; ri < reviewers.length; ri++) {
      const reviewer = reviewers[ri]!;
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
