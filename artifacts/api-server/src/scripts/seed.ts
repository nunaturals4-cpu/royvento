import {
  db,
  usersTable,
  vendorsTable,
  eventsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function ensureAdmin() {
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, "admin@admin.com"))
    .limit(1);
  if (existing[0]) {
    await db
      .update(usersTable)
      .set({ role: "admin", passwordHash: await bcrypt.hash("admin123@", 10) })
      .where(eq(usersTable.id, existing[0].id));
    console.log("Admin user updated.");
    return existing[0];
  }
  const [admin] = await db
    .insert(usersTable)
    .values({
      email: "admin@admin.com",
      passwordHash: await bcrypt.hash("admin123@", 10),
      name: "Royvento Admin",
      role: "admin",
      phone: "+91 9000000000",
    })
    .returning();
  console.log("Admin user created.");
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
        category: "Wedding",
        description:
          "Royvento's in-house team for showcasing demo events and pubs across Kolkata.",
        location: "Kolkata, West Bengal",
        state: "West Bengal",
        city: "Kolkata",
        country: "India",
        bannerImage:
          "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=1600&q=80",
        portfolioImages: [],
        eventTypes: ["Wedding", "Corporate", "Birthday", "Cultural", "Concert"],
        budgetMin: "5000",
        budgetMax: "10000000",
        isPremium: true,
        status: "approved",
      })
      .returning();
  }
  return vendor!;
}

const DEMO_EVENTS = [
  {
    title: "Heritage Wedding at Tollygunge Club",
    description:
      "A timeless wedding showcase set inside a colonial-era courtyard with floral arches, candlelit aisles, and a curated South-Asian fusion menu.",
    category: "Wedding",
    type: "event",
    price: "350000",
    capacity: 350,
    image:
      "https://images.unsplash.com/photo-1519741497674-611481863552?w=1600&q=80",
    eventDate: "2026-12-12",
  },
  {
    title: "Park Street Corporate Summit",
    description:
      "A premium corporate evening with keynote stages, networking lounges, and a curated single-malt bar served by Kolkata's best mixologists.",
    category: "Corporate",
    type: "event",
    price: "180000",
    capacity: 250,
    image:
      "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1600&q=80",
    eventDate: "2026-09-22",
  },
  {
    title: "Sunset Birthday Soirée — Eco Park",
    description:
      "Riverside birthday celebration with live acoustic sets, lawn games, balloon installations and a customised dessert table.",
    category: "Birthday",
    type: "event",
    price: "85000",
    capacity: 120,
    image:
      "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=1600&q=80",
    eventDate: "2026-08-05",
  },
  {
    title: "Durga Puja Cultural Night",
    description:
      "An elevated puja-night experience featuring traditional dhakis, fusion dance ensembles and a curated Bengali tasting menu.",
    category: "Cultural",
    type: "event",
    price: "220000",
    capacity: 600,
    image:
      "https://images.unsplash.com/photo-1604867350133-7b3a1ee48d40?w=1600&q=80",
    eventDate: "2026-10-02",
  },
  {
    title: "Riverfront Concert at Princep Ghat",
    description:
      "An open-air concert with full lighting rigs, premium sound, and tiered seating overlooking the Hooghly. A statement evening for any audience.",
    category: "Concert",
    type: "event",
    price: "500000",
    capacity: 1500,
    image:
      "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=1600&q=80",
    eventDate: "2026-11-15",
  },
];

const DEMO_PUBS = [
  {
    title: "The Velvet Lounge — Park Street",
    description:
      "Dark-wood interiors, hand-crafted cocktails, and a resident DJ spinning house and disco classics every weekend.",
    category: "Pub",
    type: "pub",
    price: "2500",
    capacity: 120,
    image:
      "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1600&q=80",
    eventDate: null as string | null,
  },
  {
    title: "Howrah Sky Bar",
    description:
      "Rooftop bar with a 360° skyline view of the bridge, premium small plates, and a tightly-curated whiskey list.",
    category: "Pub",
    type: "pub",
    price: "3200",
    capacity: 90,
    image:
      "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=1600&q=80",
    eventDate: null,
  },
  {
    title: "Salt Lake Speakeasy",
    description:
      "Hidden behind a bookshelf door — an intimate jazz & cocktail bar with leather banquettes and tableside drink service.",
    category: "Pub",
    type: "pub",
    price: "2800",
    capacity: 60,
    image:
      "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=1600&q=80",
    eventDate: null,
  },
  {
    title: "New Market Brewhouse",
    description:
      "Industrial-chic micro-brewery serving 12 craft beers on tap, wood-fired pizzas, and weekend live bands.",
    category: "Pub",
    type: "pub",
    price: "1800",
    capacity: 200,
    image:
      "https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=1600&q=80",
    eventDate: null,
  },
  {
    title: "Ballygunge Wine Cellar",
    description:
      "An elegant wine bar offering 80+ vintages, a sommelier-led tasting flight, and a refined tapas-style menu.",
    category: "Pub",
    type: "pub",
    price: "3500",
    capacity: 50,
    image:
      "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=1600&q=80",
    eventDate: null,
  },
];

const PUB_TICKET_DEFAULTS = {
  pubMode: "both",
  priceWomen: "1500",
  priceMen: "2000",
  priceCouple: "3500",
  pubEventTypes: ["DJ Night", "Live Music", "Themed Party"],
};

async function ensureDemoEvents(vendorId: number) {
  const all = [...DEMO_EVENTS, ...DEMO_PUBS];
  for (const e of all) {
    const existing = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.title, e.title))
      .limit(1);
    if (existing[0]) {
      // Update pub events: fix category to "Pubs" and add pub fields if missing
      if (e.type === "pub") {
        await db
          .update(eventsTable)
          .set({
            category: "Pubs",
            pubMode: existing[0].pubMode || PUB_TICKET_DEFAULTS.pubMode,
            priceWomen: existing[0].priceWomen === "0" ? PUB_TICKET_DEFAULTS.priceWomen : existing[0].priceWomen,
            priceMen: existing[0].priceMen === "0" ? PUB_TICKET_DEFAULTS.priceMen : existing[0].priceMen,
            priceCouple: existing[0].priceCouple === "0" ? PUB_TICKET_DEFAULTS.priceCouple : existing[0].priceCouple,
            pubEventTypes: existing[0].pubEventTypes?.length ? existing[0].pubEventTypes : PUB_TICKET_DEFAULTS.pubEventTypes,
          })
          .where(eq(eventsTable.id, existing[0].id));
      }
      continue;
    }
    const isPub = e.type === "pub";
    await db.insert(eventsTable).values({
      vendorId,
      title: e.title,
      description: e.description,
      category: isPub ? "Pubs" : e.category,
      type: e.type,
      price: e.price,
      capacity: e.capacity,
      imageUrl: e.image,
      location: "Kolkata, West Bengal",
      state: "West Bengal",
      city: "Kolkata",
      country: "India",
      eventDate: e.eventDate ?? null,
      featured: true,
      popular: true,
      approvalStatus: "approved",
      ...(isPub ? PUB_TICKET_DEFAULTS : {}),
    });
  }
  console.log(`Seeded ${all.length} demo events/pubs.`);
}

async function main() {
  await ensureAdmin();
  const vendor = await ensureDemoPartner();
  await ensureDemoEvents(vendor.id);
  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
