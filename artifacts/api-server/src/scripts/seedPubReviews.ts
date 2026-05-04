import { db, usersTable, eventsTable, reviewsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const REVIEWER_EMAILS = [
  "seed.reviewer.001@royvento.in",
  "seed.reviewer.002@royvento.in",
  "seed.reviewer.003@royvento.in",
  "seed.reviewer.004@royvento.in",
  "seed.reviewer.005@royvento.in",
  "seed.reviewer.006@royvento.in",
  "seed.reviewer.007@royvento.in",
];

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

async function ensureReviewers() {
  const passwordHash = await bcrypt.hash("Seed@Reviewer#2024!", 10);
  const reviewers: (typeof usersTable.$inferSelect)[] = [];

  for (let i = 0; i < REVIEWER_EMAILS.length; i++) {
    const email = REVIEWER_EMAILS[i]!;
    let user = (
      await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1)
    )[0];
    if (!user) {
      const referralCode = `SEEDREV${String(i + 1).padStart(3, "0")}`;
      [user] = await db
        .insert(usersTable)
        .values({
          email,
          passwordHash,
          name: REVIEWER_NAMES[i]!,
          role: "user",
          phone: "",
          referralCode,
        })
        .returning();
    }
    if (user) reviewers.push(user);
  }
  return reviewers;
}

async function main() {
  console.log("Seeding pub reviews...");

  const reviewers = await ensureReviewers();
  console.log(`Ensured ${reviewers.length} reviewer accounts.`);

  const pubs = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.type, "pub"), eq(eventsTable.approvalStatus, "approved")));

  console.log(`Found ${pubs.length} approved pub events.`);

  let inserted = 0;
  let skipped = 0;

  for (const pub of pubs) {
    for (let i = 0; i < reviewers.length; i++) {
      const reviewer = reviewers[i];
      if (!reviewer) continue;

      const result = await db
        .insert(reviewsTable)
        .values({
          userId: reviewer.id,
          eventId: pub.id,
          vendorId: pub.vendorId,
          rating: RATINGS[i] ?? 4,
          comment: COMMENTS[i] ?? "Great pub!",
        })
        .onConflictDoNothing()
        .returning();

      if (result.length > 0) {
        inserted++;
      } else {
        skipped++;
      }
    }
  }

  console.log(`Done! Inserted: ${inserted}, Skipped (already existed): ${skipped}`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
