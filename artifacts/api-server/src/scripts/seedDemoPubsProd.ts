/**
 * One-shot script: seed 10 demo pubs in production.
 *
 * Each pub is its own vendor with:
 *   - 1 cover image  (vendors.coverImageUrl / events.imageUrl)
 *   - 5 gallery photos (vendors.portfolioImages / events.galleryImages)
 *   - 1 dance floor image (vendors.danceFloorPhotos)
 *   - 2 menu images (vendors.menuUrls)
 *   - capacity 500
 *   - women / men / couple ticket prices, all > 1000 and distinct
 *
 * Run:  pnpm --filter @workspace/api-server seed:demo-pubs
 *       (or `railway run ...` to target production)
 */
import {
  db,
  usersTable,
  vendorsTable,
  eventsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logger } from "../lib/logger";

// Public Unsplash URLs — sized for web. Reused across pubs as a small pool.
const COVERS = [
  "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1600&q=80",
  "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=1600&q=80",
  "https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=1600&q=80",
  "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=1600&q=80",
  "https://images.unsplash.com/photo-1519214605650-76a613ee3245?w=1600&q=80",
  "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=1600&q=80",
  "https://images.unsplash.com/photo-1485872299712-d4fd9b96d0a6?w=1600&q=80",
  "https://images.unsplash.com/photo-1546171753-97d7676e4602?w=1600&q=80",
  "https://images.unsplash.com/photo-1438557068880-c5f474830377?w=1600&q=80",
  "https://images.unsplash.com/photo-1556767576-5ec41e3239ea?w=1600&q=80",
];

const GALLERY = [
  "https://images.unsplash.com/photo-1538488881038-e252a119ace7?w=1200&q=80",
  "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=1200&q=80",
  "https://images.unsplash.com/photo-1519214605650-76a613ee3245?w=1200&q=80",
  "https://images.unsplash.com/photo-1601481712810-8b09e0a3df93?w=1200&q=80",
  "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=1200&q=80",
  "https://images.unsplash.com/photo-1546171753-97d7676e4602?w=1200&q=80",
  "https://images.unsplash.com/photo-1438557068880-c5f474830377?w=1200&q=80",
  "https://images.unsplash.com/photo-1485872299712-d4fd9b96d0a6?w=1200&q=80",
  "https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=1200&q=80",
  "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=1200&q=80",
  "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1200&q=80",
  "https://images.unsplash.com/photo-1571266028243-d220c6e6f9bd?w=1200&q=80",
];

const DANCE_FLOOR = [
  "https://images.unsplash.com/photo-1571266028243-d220c6e6f9bd?w=1400&q=80",
  "https://images.unsplash.com/photo-1601481712810-8b09e0a3df93?w=1400&q=80",
  "https://images.unsplash.com/photo-1574391884720-bbc049ec09ad?w=1400&q=80",
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1400&q=80",
  "https://images.unsplash.com/photo-1583244532610-2a234a0f0e89?w=1400&q=80",
  "https://images.unsplash.com/photo-1551776235-dde6d482980b?w=1400&q=80",
  "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1400&q=80",
  "https://images.unsplash.com/photo-1574391884720-bbc049ec09ad?w=1400&q=80",
  "https://images.unsplash.com/photo-1571266028243-d220c6e6f9bd?w=1400&q=80",
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1400&q=80",
];

const MENUS = [
  "https://images.unsplash.com/photo-1556767576-5ec41e3239ea?w=1200&q=80",
  "https://images.unsplash.com/photo-1543353071-873f17a7a088?w=1200&q=80",
  "https://images.unsplash.com/photo-1559329007-40df8a9345d8?w=1200&q=80",
  "https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=1200&q=80",
];

type DemoPub = {
  slug: string;            // stable identifier for upsert
  title: string;
  description: string;
  city: string;
  state: string;
  location: string;
  address: string;
  capacity: number;
  priceWomen: string;
  priceMen: string;
  priceCouple: string;
  cover: string;
  gallery: string[];      // 5
  danceFloor: string;     // 1
  menus: string[];        // 2
};

function pick<T>(arr: T[], idx: number): T {
  return arr[idx % arr.length]!;
}

function galleryFor(offset: number): string[] {
  return [0, 1, 2, 3, 4].map((i) => pick(GALLERY, offset + i));
}

const DEMO_PUBS: DemoPub[] = [
  {
    slug: "the-velvet-lounge",
    title: "The Velvet Lounge — Park Street",
    description:
      "Dark-wood interiors, hand-crafted cocktails, and a resident DJ spinning house and disco classics every weekend.",
    city: "Kolkata",
    state: "West Bengal",
    location: "Park Street, Kolkata",
    address: "12 Park Street, Kolkata 700016",
    capacity: 500,
    priceWomen: "1100",
    priceMen: "1600",
    priceCouple: "2100",
    cover: pick(COVERS, 0),
    gallery: galleryFor(0),
    danceFloor: pick(DANCE_FLOOR, 0),
    menus: [pick(MENUS, 0), pick(MENUS, 1)],
  },
  {
    slug: "howrah-sky-bar",
    title: "Howrah Sky Bar",
    description:
      "Rooftop bar with a 360° skyline view of the Howrah bridge, premium small plates, and a tightly-curated whiskey list.",
    city: "Kolkata",
    state: "West Bengal",
    location: "Strand Road, Kolkata",
    address: "Strand Road, near Howrah Bridge, Kolkata 700001",
    capacity: 500,
    priceWomen: "1200",
    priceMen: "1750",
    priceCouple: "2300",
    cover: pick(COVERS, 1),
    gallery: galleryFor(1),
    danceFloor: pick(DANCE_FLOOR, 1),
    menus: [pick(MENUS, 1), pick(MENUS, 2)],
  },
  {
    slug: "salt-lake-speakeasy",
    title: "Salt Lake Speakeasy",
    description:
      "Hidden behind a bookshelf door — an intimate jazz & cocktail bar with leather banquettes and tableside drink service.",
    city: "Kolkata",
    state: "West Bengal",
    location: "Sector V, Salt Lake, Kolkata",
    address: "Block AA, Sector V, Salt Lake, Kolkata 700091",
    capacity: 500,
    priceWomen: "1150",
    priceMen: "1700",
    priceCouple: "2200",
    cover: pick(COVERS, 2),
    gallery: galleryFor(2),
    danceFloor: pick(DANCE_FLOOR, 2),
    menus: [pick(MENUS, 2), pick(MENUS, 3)],
  },
  {
    slug: "new-market-brewhouse",
    title: "New Market Brewhouse",
    description:
      "Industrial-chic micro-brewery serving 12 craft beers on tap, wood-fired pizzas, and weekend live bands.",
    city: "Kolkata",
    state: "West Bengal",
    location: "New Market, Kolkata",
    address: "S.S. Hogg Market Road, Kolkata 700087",
    capacity: 500,
    priceWomen: "1250",
    priceMen: "1800",
    priceCouple: "2400",
    cover: pick(COVERS, 3),
    gallery: galleryFor(3),
    danceFloor: pick(DANCE_FLOOR, 3),
    menus: [pick(MENUS, 3), pick(MENUS, 0)],
  },
  {
    slug: "ballygunge-wine-cellar",
    title: "Ballygunge Wine Cellar",
    description:
      "An elegant wine bar offering 80+ vintages, a sommelier-led tasting flight, and a refined tapas-style menu.",
    city: "Kolkata",
    state: "West Bengal",
    location: "Ballygunge, Kolkata",
    address: "23 Ballygunge Circular Road, Kolkata 700019",
    capacity: 500,
    priceWomen: "1300",
    priceMen: "1900",
    priceCouple: "2500",
    cover: pick(COVERS, 4),
    gallery: galleryFor(4),
    danceFloor: pick(DANCE_FLOOR, 4),
    menus: [pick(MENUS, 0), pick(MENUS, 2)],
  },
  {
    slug: "esplanade-electric-room",
    title: "Esplanade Electric Room",
    description:
      "High-energy nightclub with LED-wrapped DJ booth, EDM and Bollywood sets, and bottle-service VIP cabanas.",
    city: "Kolkata",
    state: "West Bengal",
    location: "Esplanade, Kolkata",
    address: "Lindsay Street, Esplanade, Kolkata 700087",
    capacity: 500,
    priceWomen: "1400",
    priceMen: "2000",
    priceCouple: "2700",
    cover: pick(COVERS, 5),
    gallery: galleryFor(5),
    danceFloor: pick(DANCE_FLOOR, 5),
    menus: [pick(MENUS, 1), pick(MENUS, 3)],
  },
  {
    slug: "rajarhat-rooftop-social",
    title: "Rajarhat Rooftop Social",
    description:
      "Open-air rooftop lounge with cabanas, shisha, and a fusion menu — sunset cocktail hour to late-night house sets.",
    city: "Kolkata",
    state: "West Bengal",
    location: "Rajarhat, New Town, Kolkata",
    address: "Action Area II, New Town, Kolkata 700156",
    capacity: 500,
    priceWomen: "1350",
    priceMen: "1850",
    priceCouple: "2450",
    cover: pick(COVERS, 6),
    gallery: galleryFor(6),
    danceFloor: pick(DANCE_FLOOR, 6),
    menus: [pick(MENUS, 2), pick(MENUS, 0)],
  },
  {
    slug: "camac-street-jazz-club",
    title: "Camac Street Jazz Club",
    description:
      "Velvet-lit basement jazz lounge with live quartets every night, classic-cocktail program and small-plate kitchen.",
    city: "Kolkata",
    state: "West Bengal",
    location: "Camac Street, Kolkata",
    address: "8B Camac Street, Kolkata 700017",
    capacity: 500,
    priceWomen: "1500",
    priceMen: "2100",
    priceCouple: "2800",
    cover: pick(COVERS, 7),
    gallery: galleryFor(7),
    danceFloor: pick(DANCE_FLOOR, 7),
    menus: [pick(MENUS, 3), pick(MENUS, 1)],
  },
  {
    slug: "alipore-garden-bar",
    title: "Alipore Garden Bar",
    description:
      "Tropical garden bar with fairy-lit pergolas, tiki cocktails, and an Asian small-plates menu. DJ on weekends.",
    city: "Kolkata",
    state: "West Bengal",
    location: "Alipore, Kolkata",
    address: "Belvedere Road, Alipore, Kolkata 700027",
    capacity: 500,
    priceWomen: "1450",
    priceMen: "1950",
    priceCouple: "2600",
    cover: pick(COVERS, 8),
    gallery: galleryFor(8),
    danceFloor: pick(DANCE_FLOOR, 8),
    menus: [pick(MENUS, 0), pick(MENUS, 3)],
  },
  {
    slug: "southern-avenue-disco-lounge",
    title: "Southern Avenue Disco Lounge",
    description:
      "Retro-disco lounge with mirrored ceilings, a sunken dance floor, and signature champagne cocktail flights.",
    city: "Kolkata",
    state: "West Bengal",
    location: "Southern Avenue, Kolkata",
    address: "Southern Avenue, Kolkata 700029",
    capacity: 500,
    priceWomen: "1550",
    priceMen: "2200",
    priceCouple: "2900",
    cover: pick(COVERS, 9),
    gallery: galleryFor(9),
    danceFloor: pick(DANCE_FLOOR, 9),
    menus: [pick(MENUS, 2), pick(MENUS, 1)],
  },
];

async function upsertPartnerUser(slug: string, businessName: string) {
  const email = `demo+${slug}@royvento.in`;
  const phone = `+91 90000${String(Math.abs(hashCode(slug)) % 100000).padStart(5, "0")}`;
  const existing = (
    await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1)
  )[0];
  if (existing) return existing;
  const referralCode = `DEMO${slug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}`;
  const [created] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash: await bcrypt.hash("partner123@", 10),
      name: businessName,
      role: "vendor",
      phone,
      referralCode,
    })
    .returning();
  if (!created) throw new Error(`Failed to create partner user for ${slug}`);
  return created;
}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

async function upsertVendor(userId: number, p: DemoPub) {
  const existing = (
    await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.userId, userId))
      .limit(1)
  )[0];

  const baseValues = {
    businessName: p.title,
    category: "Pubs",
    description: p.description,
    location: p.location,
    state: p.state,
    city: p.city,
    country: "India",
    address: p.address,
    bannerImage: p.cover,
    coverImageUrl: p.cover,
    portfolioImages: p.gallery,
    eventTypes: ["Pubs"],
    budgetMin: "500",
    budgetMax: "5000",
    isPremium: true,
    status: "approved" as const,
    danceFloor: "yes",
    danceFloorPhotos: [p.danceFloor],
    menuUrl: p.menus[0]!,
    menuUrls: p.menus,
  };

  if (existing) {
    await db
      .update(vendorsTable)
      .set(baseValues)
      .where(eq(vendorsTable.id, existing.id));
    return existing;
  }
  const [created] = await db
    .insert(vendorsTable)
    .values({ userId, ...baseValues })
    .returning();
  if (!created) throw new Error(`Failed to create vendor for ${p.slug}`);
  return created;
}

async function upsertEvent(vendorId: number, p: DemoPub) {
  const existing = (
    await db
      .select()
      .from(eventsTable)
      .where(and(eq(eventsTable.vendorId, vendorId), eq(eventsTable.title, p.title)))
      .limit(1)
  )[0];

  const baseValues = {
    title: p.title,
    description: p.description,
    category: "Pubs",
    type: "pub" as const,
    location: p.location,
    state: p.state,
    city: p.city,
    country: "India",
    price: p.priceMen, // legacy field — use men's price as the indicative one
    capacity: p.capacity,
    imageUrl: p.cover,
    galleryImages: p.gallery,
    pubMode: "ticket" as const,
    priceWomen: p.priceWomen,
    priceMen: p.priceMen,
    priceCouple: p.priceCouple,
    pubEventTypes: ["DJ Night", "Live Music", "Themed Party"],
    featured: true,
    popular: true,
    approvalStatus: "approved" as const,
  };

  if (existing) {
    await db
      .update(eventsTable)
      .set(baseValues)
      .where(eq(eventsTable.id, existing.id));
    return existing;
  }
  const [created] = await db
    .insert(eventsTable)
    .values({ vendorId, ...baseValues })
    .returning();
  return created;
}

async function main() {
  logger.info(`Seeding ${DEMO_PUBS.length} demo pubs into production…`);
  for (const p of DEMO_PUBS) {
    const user = await upsertPartnerUser(p.slug, p.title);
    const vendor = await upsertVendor(user.id, p);
    await upsertEvent(vendor.id, p);
    logger.info(`  ✓ ${p.title}`);
  }
  logger.info(`Done. Seeded ${DEMO_PUBS.length} demo pubs.`);
  process.exit(0);
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
