import { db, usersTable, eventsTable, reviewsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
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

async function ensureUser(
  email: string,
  referralCode: string,
  name: string,
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
  console.log("Seeding pub reviews...");

  const pubs = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.type, "pub"), eq(eventsTable.approvalStatus, "approved")));

  console.log(`Found ${pubs.length} approved pub events.`);

  // Group events by vendorId so we can slot users per (vendor, eventIndex).
  // The DB has a unique constraint on (userId, vendorId), so each user can only
  // review a given vendor once. To give every event its own 7 reviews we create
  // 7 seed users per event slot: seed.rv.<vendorId>.<eventIndex>.<reviewerIndex>
  const byVendor = new Map<number, (typeof pubs)[number][]>();
  for (const pub of pubs) {
    const list = byVendor.get(pub.vendorId) ?? [];
    list.push(pub);
    byVendor.set(pub.vendorId, list);
  }

  const passwordHash = await bcrypt.hash("Seed@Reviewer#2024!", 10);
  let inserted = 0;
  let skipped = 0;

  for (const [vendorId, events] of byVendor) {
    for (let ei = 0; ei < events.length; ei++) {
      const event = events[ei]!;
      for (let ri = 0; ri < 7; ri++) {
        // Email and referralCode are scoped to (vendorId, eventIndex, reviewerIndex)
        // so (userId, vendorId) is always unique across all events for this vendor.
        const email = `seed.rv.${vendorId}.${ei}.${ri}@royvento.in`;
        const referralCode = `SRV${vendorId}E${ei}R${ri}`;
        const name = REVIEWER_NAMES[ri % REVIEWER_NAMES.length]!;

        const user = await ensureUser(email, referralCode, name, passwordHash);
        if (!user) continue;

        const result = await db
          .insert(reviewsTable)
          .values({
            userId: user.id,
            eventId: event.id,
            vendorId: event.vendorId,
            rating: RATINGS[ri % RATINGS.length] ?? 4,
            comment: COMMENTS[ri % COMMENTS.length] ?? "Great pub!",
          })
          .onConflictDoNothing()
          .returning();

        if (result.length > 0) inserted++;
        else skipped++;
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
