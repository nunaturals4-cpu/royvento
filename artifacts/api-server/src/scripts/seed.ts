import {
  db,
  usersTable,
  vendorsTable,
  eventsTable,
} from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logger } from "../lib/logger";

async function ensureAdmin() {
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, "royvento56@gmail.com"))
    .limit(1);
  if (existing[0]) {
    await db
      .update(usersTable)
      .set({
        role: "admin",
        passwordHash: await bcrypt.hash("admin123@", 10),
        referralCode: existing[0].referralCode || "ADMIN0001",
      })
      .where(eq(usersTable.id, existing[0].id));
    logger.info("Admin user updated.");
    return existing[0];
  }
  const [admin] = await db
    .insert(usersTable)
    .values({
      email: "royvento56@gmail.com",
      passwordHash: await bcrypt.hash("admin123@", 10),
      name: "Royvento Admin",
      role: "admin",
      phone: "+91 9000000000",
      referralCode: "ADMIN0001",
    })
    .returning();
  logger.info("Admin user created.");
  return admin;
}

async function ensureDemoPartner() {
  const email = "showcase@royvento.in";
  let partnerUser = (
    await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1)
  )[0];
  if (!partnerUser) {
    [partnerUser] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash: await bcrypt.hash("partner123@", 10),
        name: "Royvento Showcase",
        role: "vendor",
        phone: "+91 9111111111",
        referralCode: "SHOWCASE01",
      })
      .returning();
  }
  if (!partnerUser) throw new Error("Failed to create demo partner user");

  let vendor = (
    await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.userId, partnerUser.id))
      .limit(1)
  )[0];
  if (!vendor) {
    [vendor] = await db
      .insert(vendorsTable)
      .values({
        userId: partnerUser.id,
        businessName: "Royvento Studio",
        category: "Pubs",
        description:
          "Royvento's in-house showcase of premium pubs and bars across Kolkata.",
        location: "Kolkata, West Bengal",
        state: "West Bengal",
        city: "Kolkata",
        country: "India",
        bannerImage:
          "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=1600&q=80",
        portfolioImages: [],
        eventTypes: ["Pubs"],
        budgetMin: "500",
        budgetMax: "5000",
        isPremium: true,
        status: "approved",
      })
      .returning();
  } else {
    // Ensure existing vendor is aligned: Pubs category, approved status
    await db
      .update(vendorsTable)
      .set({ category: "Pubs", eventTypes: ["Pubs"], status: "approved" })
      .where(eq(vendorsTable.id, vendor.id));
  }
  return vendor!;
}

const DEMO_PUBS: Array<{
  title: string;
  description: string;
  price: string;
  priceWomen: string;
  priceMen: string;
  priceCouple: string;
  capacity: number;
  image: string;
}> = [
  {
    title: "The Velvet Lounge — Park Street",
    description:
      "Dark-wood interiors, hand-crafted cocktails, and a resident DJ spinning house and disco classics every weekend.",
    price: "2500",
    priceWomen: "700",
    priceMen: "1300",
    priceCouple: "1500",
    capacity: 120,
    image:
      "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1600&q=80",
  },
  {
    title: "Howrah Sky Bar",
    description:
      "Rooftop bar with a 360° skyline view of the bridge, premium small plates, and a tightly-curated whiskey list.",
    price: "3200",
    priceWomen: "900",
    priceMen: "1600",
    priceCouple: "2000",
    capacity: 90,
    image:
      "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=1600&q=80",
  },
  {
    title: "Salt Lake Speakeasy",
    description:
      "Hidden behind a bookshelf door — an intimate jazz & cocktail bar with leather banquettes and tableside drink service.",
    price: "2800",
    priceWomen: "800",
    priceMen: "1400",
    priceCouple: "1800",
    capacity: 60,
    image:
      "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=1600&q=80",
  },
  {
    title: "New Market Brewhouse",
    description:
      "Industrial-chic micro-brewery serving 12 craft beers on tap, wood-fired pizzas, and weekend live bands.",
    price: "1800",
    priceWomen: "500",
    priceMen: "900",
    priceCouple: "1100",
    capacity: 200,
    image:
      "https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=1600&q=80",
  },
  {
    title: "Ballygunge Wine Cellar",
    description:
      "An elegant wine bar offering 80+ vintages, a sommelier-led tasting flight, and a refined tapas-style menu.",
    price: "3500",
    priceWomen: "1000",
    priceMen: "1800",
    priceCouple: "2200",
    capacity: 50,
    image:
      "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=1600&q=80",
  },
];

async function ensureDemoEvents(vendorId: number) {
  // Remove any non-pub events that may have been seeded previously for this vendor
  await db
    .delete(eventsTable)
    .where(and(eq(eventsTable.vendorId, vendorId), ne(eventsTable.type, "pub")));

  for (const e of DEMO_PUBS) {
    const existing = await db
      .select()
      .from(eventsTable)
      .where(and(eq(eventsTable.vendorId, vendorId), eq(eventsTable.title, e.title)))
      .limit(1);
    if (existing[0]) {
      // Always normalise to ticket mode with current target prices
      await db
        .update(eventsTable)
        .set({
          category: "Pubs",
          pubMode: "ticket",
          priceWomen: e.priceWomen,
          priceMen: e.priceMen,
          priceCouple: e.priceCouple,
          pubEventTypes: existing[0].pubEventTypes?.length
            ? existing[0].pubEventTypes
            : ["DJ Night", "Live Music", "Themed Party"],
        })
        .where(eq(eventsTable.id, existing[0].id));
      continue;
    }
    await db.insert(eventsTable).values({
      vendorId,
      title: e.title,
      description: e.description,
      category: "Pubs",
      type: "pub",
      price: e.price,
      priceWomen: e.priceWomen,
      priceMen: e.priceMen,
      priceCouple: e.priceCouple,
      pubMode: "ticket",
      pubEventTypes: ["DJ Night", "Live Music", "Themed Party"],
      capacity: e.capacity,
      imageUrl: e.image,
      location: "Kolkata, West Bengal",
      state: "West Bengal",
      city: "Kolkata",
      country: "India",
      featured: true,
      popular: true,
      approvalStatus: "approved",
    });
  }
  logger.info(`Seeded ${DEMO_PUBS.length} demo pub listings.`);
}

async function main() {
  await ensureAdmin();
  // Demo partner ("Royvento Studio") and its DEMO_PUBS listings are intentionally
  // NOT seeded — production tenants should not have placeholder vendors leaking
  // into the Commission tab. The helpers are retained below for ad-hoc local
  // demos but are not wired into the default seed.
  logger.info("Seed complete.");
  process.exit(0);
}

// Suppress "unused" warnings for the demo helpers; they are kept as a
// reference for spinning up local demo data on demand.
void ensureDemoPartner;
void ensureDemoEvents;

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
