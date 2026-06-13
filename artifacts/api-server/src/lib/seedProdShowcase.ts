/**
 * Production "showcase" enrichment. Fills out the REAL approved pub profiles
 * (whatever the operator already has in prod) with everything a visitor needs
 * to understand how a finished profile looks:
 *   • cover / banner / gallery / dance-floor / menu images   (item 1: images)
 *   • an approved pub event with pricing + group capacity + free entry
 *   • drink_plans  → home "Drink Deals" + the venue "Drinks & Deals" tab  (happy hours)
 *   • vendor_offers (food + drink) → "Today's Offers"                     (offers)
 *   • announcements (approved)                                            (announcements)
 * …and ensures the demo Game Organizer profile exists (item 3: game profile).
 *
 * Used by POST /api/admin/seed-prod-showcase (one-shot admin endpoint).
 *
 * SAFE / IDEMPOTENT BY DESIGN:
 *   - Only touches vendors with status = 'approved'.
 *   - Images are filled ONLY when the field is currently empty, so a partner's
 *     real uploads are never overwritten on a re-run.
 *   - drink_plans / vendor_offers / announcements are inserted only when an
 *     entry with the same title doesn't already exist — existing partner rows
 *     are never deleted or duplicated.
 *   - The event profile (organizer account) is intentionally left untouched;
 *     it is already populated. Item 3's event profile = that existing organizer.
 */
import {
  db,
  vendorsTable,
  eventsTable,
  drinkPlansTable,
  vendorOffersTable,
  announcementsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { seedGameOrganizer, type SeedGameOrganizerReport } from "./seedGameOrganizer";

const COVERS = [
  "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1600&q=80",
  "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=1600&q=80",
  "https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=1600&q=80",
  "https://images.unsplash.com/photo-1519214605650-76a613ee3245?w=1600&q=80",
  "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=1600&q=80",
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
];
const DANCE_FLOOR = [
  "https://images.unsplash.com/photo-1571266028243-d220c6e6f9bd?w=1400&q=80",
  "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1400&q=80",
];
const MENUS = [
  "https://images.unsplash.com/photo-1556767576-5ec41e3239ea?w=1200&q=80",
  "https://images.unsplash.com/photo-1543353071-873f17a7a088?w=1200&q=80",
  "https://images.unsplash.com/photo-1559329007-40df8a9345d8?w=1200&q=80",
];
const DRINK_IMAGES = [
  "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=1000&q=80",
  "https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=1000&q=80",
  "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=1000&q=80",
  "https://images.unsplash.com/photo-1536935338788-846bb9981813?w=1000&q=80",
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]!;
}
function galleryFor(offset: number): string[] {
  return [0, 1, 2, 3, 4].map((i) => pick(GALLERY, offset + i));
}

export type SeedProdShowcaseReport = {
  vendors: Array<{
    vendorId: number;
    businessName: string;
    imagesFilled: boolean;
    eventId: number | null;
    drinkPlansAdded: number;
    offersAdded: number;
    announcementsAdded: number;
  }>;
  game: SeedGameOrganizerReport;
};

/** Fill images on a vendor row only where the column is currently empty. */
async function fillVendorImages(
  vendor: typeof vendorsTable.$inferSelect,
  i: number,
): Promise<boolean> {
  const cover = pick(COVERS, i);
  const gallery = galleryFor(i);
  const patch: Partial<typeof vendorsTable.$inferInsert> = {};
  if (!vendor.coverImageUrl) patch.coverImageUrl = cover;
  if (!vendor.bannerImage) patch.bannerImage = cover;
  if (!vendor.portfolioImages || vendor.portfolioImages.length === 0) patch.portfolioImages = gallery;
  if (!vendor.danceFloor) patch.danceFloor = "yes";
  if (!vendor.danceFloorPhotos || vendor.danceFloorPhotos.length === 0) patch.danceFloorPhotos = [pick(DANCE_FLOOR, i)];
  if (!vendor.menuUrl) patch.menuUrl = pick(MENUS, i);
  if (!vendor.menuUrls || vendor.menuUrls.length === 0) patch.menuUrls = [pick(MENUS, i), pick(MENUS, i + 1)];
  if (!vendor.isPremium) patch.isPremium = true;
  if (Object.keys(patch).length === 0) return false;
  await db.update(vendorsTable).set(patch).where(eq(vendorsTable.id, vendor.id));
  return true;
}

/** Ensure the vendor has one approved pub event (rich pricing + group + free entry). */
async function ensurePubEvent(
  vendor: typeof vendorsTable.$inferSelect,
  i: number,
): Promise<number | null> {
  const cover = vendor.coverImageUrl || pick(COVERS, i);
  const gallery = (vendor.portfolioImages && vendor.portfolioImages.length > 0) ? vendor.portfolioImages : galleryFor(i);
  const existing = (
    await db.select().from(eventsTable)
      .where(and(eq(eventsTable.vendorId, vendor.id), eq(eventsTable.type, "pub")))
      .limit(1)
  )[0];

  const groupOffer = i % 2 === 0 ? "Book for 6, get 1 entry free" : "Group of 8+ gets a free drink bucket";
  const values = {
    title: vendor.businessName,
    description: vendor.description || `${vendor.businessName} — live DJ nights, hand-crafted cocktails and the city's best weekend crowd.`,
    category: "Pubs",
    type: "pub",
    location: vendor.location,
    state: vendor.state,
    city: vendor.city,
    country: "India",
    price: "1500",
    capacity: 500,
    imageUrl: cover,
    galleryImages: gallery,
    pubMode: "ticket",
    priceWomen: "1100",
    priceMen: "1600",
    priceCouple: "2100",
    pubEventTypes: ["DJ Night", "Live Music", "Themed Party"],
    featured: true,
    popular: true,
    happeningTonight: true,
    startingSoon: true,
    startTime: "19:00",
    endTime: "01:00",
    tableCount: 30,
    tableSize: 8,
    vipCapacity: 60,
    maxGroupSize: 20,
    groupBookingEnabled: true,
    groupOffer,
    freeEntryRules: { enabled: true, genders: ["female"], days: ["Wed", "Thu"], beforeTime: "21:00" },
    approvalStatus: "approved",
    approvedAt: new Date(),
  } satisfies Partial<typeof eventsTable.$inferInsert>;

  if (existing) {
    // Only fill the showcase fields; keep the partner's title/description/pricing if already set.
    await db.update(eventsTable).set({
      type: "pub",
      approvalStatus: "approved",
      ...(existing.imageUrl ? {} : { imageUrl: cover }),
      ...((existing.galleryImages && existing.galleryImages.length > 0) ? {} : { galleryImages: gallery }),
      happeningTonight: true,
      startingSoon: true,
      ...(existing.startTime ? {} : { startTime: "19:00" }),
      ...(existing.endTime ? {} : { endTime: "01:00" }),
      ...(existing.tableCount ? {} : { tableCount: 30, tableSize: 8, vipCapacity: 60, maxGroupSize: 20 }),
      ...(existing.groupOffer ? {} : { groupOffer }),
      ...(existing.freeEntryRules ? {} : { freeEntryRules: values.freeEntryRules }),
    }).where(eq(eventsTable.id, existing.id));
    return existing.id;
  }
  const [created] = await db.insert(eventsTable).values({ vendorId: vendor.id, ...values }).returning();
  return created?.id ?? null;
}

/** Insert a drink_plan only if no plan with the same productName exists for the vendor. */
async function addDrinkPlanIfMissing(
  vendorId: number,
  plan: Omit<typeof drinkPlansTable.$inferInsert, "vendorId">,
): Promise<boolean> {
  const existing = (
    await db.select({ id: drinkPlansTable.id }).from(drinkPlansTable)
      .where(and(eq(drinkPlansTable.vendorId, vendorId), eq(drinkPlansTable.productName, plan.productName ?? "")))
      .limit(1)
  )[0];
  if (existing) return false;
  await db.insert(drinkPlansTable).values({ vendorId, ...plan });
  return true;
}

/** Insert a vendor_offer only if no offer with the same title exists for the vendor. */
async function addOfferIfMissing(
  vendorId: number,
  offer: Omit<typeof vendorOffersTable.$inferInsert, "vendorId">,
): Promise<boolean> {
  const existing = (
    await db.select({ id: vendorOffersTable.id }).from(vendorOffersTable)
      .where(and(eq(vendorOffersTable.vendorId, vendorId), eq(vendorOffersTable.title, offer.title)))
      .limit(1)
  )[0];
  if (existing) return false;
  await db.insert(vendorOffersTable).values({ vendorId, ...offer });
  return true;
}

/** Insert an announcement only if no approved announcement with the same title exists. */
async function addAnnouncementIfMissing(
  vendorId: number,
  ann: Omit<typeof announcementsTable.$inferInsert, "vendorId">,
): Promise<boolean> {
  const existing = (
    await db.select({ id: announcementsTable.id }).from(announcementsTable)
      .where(and(eq(announcementsTable.vendorId, vendorId), eq(announcementsTable.title, ann.title)))
      .limit(1)
  )[0];
  if (existing) return false;
  await db.insert(announcementsTable).values({ vendorId, ...ann });
  return true;
}

export async function seedProdShowcase(): Promise<SeedProdShowcaseReport> {
  const vendors = await db.select().from(vendorsTable).where(eq(vendorsTable.status, "approved"));
  const report: SeedProdShowcaseReport["vendors"] = [];

  for (let i = 0; i < vendors.length; i++) {
    const vendor = vendors[i]!;
    const imagesFilled = await fillVendorImages(vendor, i);
    // Re-read so ensurePubEvent / fallbacks see the freshly-filled cover.
    const fresh = (await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendor.id)).limit(1))[0]!;
    const eventId = await ensurePubEvent(fresh, i);

    // ── Drink plans (happy hours / drink deals) ──────────────────────────────
    const plans: Array<Omit<typeof drinkPlansTable.$inferInsert, "vendorId">> = [
      {
        type: "welcome", productName: "Free Welcome Cocktail", gender: "female", price: 0,
        days: ["Thu", "Fri", "Sat"], timeFrom: "19:00", timeTo: "23:00",
        description: "Complimentary signature cocktail for ladies on entry.",
        imageUrl: pick(DRINK_IMAGES, i),
      },
      {
        type: "unlimited", productName: "Unlimited Sangria (Ladies Night)", gender: "female", price: 0,
        days: ["Wed"], timeFrom: "20:00", timeTo: "23:30",
        description: "Free-flowing house sangria all night, every Wednesday.",
        imageUrl: pick(DRINK_IMAGES, i + 1),
      },
      {
        type: "ticket", productName: "Party Pass + 2 Drinks", gender: "all", price: 0,
        days: ["Fri", "Sat"], timeFrom: "21:00", timeTo: "01:00",
        description: "Cover charge includes two premium drinks of your choice.",
        lineItems: [
          { name: "Premium Spirit (30ml)", qty: 2, discountedPrice: 0 },
          { name: "Mixer & Garnish", qty: 2, discountedPrice: 0 },
        ],
        imageUrl: pick(DRINK_IMAGES, i + 2),
      },
    ];
    let drinkPlansAdded = 0;
    for (const p of plans) if (await addDrinkPlanIfMissing(vendor.id, p)) drinkPlansAdded++;

    // ── Food + drink offers (Today's Offers) ─────────────────────────────────
    const offers: Array<Omit<typeof vendorOffersTable.$inferInsert, "vendorId">> = [
      {
        category: "drink", title: "Happy Hours — 1+1 on all cocktails",
        description: "Buy one cocktail, get one free. Every day, all evening.",
        discountType: "bogo", discountValue: "0", days: [], timeFrom: "17:00", timeTo: "20:00", active: true,
      },
      {
        category: "food", title: "30% off the food menu",
        description: "Flat 30% off all starters and mains for dine-in groups.",
        discountType: "percent", discountValue: "30", days: ["Thu", "Fri", "Sat"], timeFrom: "18:00", timeTo: "23:00", active: true,
      },
      {
        category: "food", title: "Free dessert platter",
        description: "Complimentary dessert platter with any 2 main courses.",
        discountType: "free_item", discountValue: "0", freeItemName: "Assorted Dessert Platter",
        days: [], timeFrom: "", timeTo: "", active: true,
      },
    ];
    let offersAdded = 0;
    for (const o of offers) if (await addOfferIfMissing(vendor.id, o)) offersAdded++;

    // ── Announcements (approved → visible) ───────────────────────────────────
    const anns: Array<Omit<typeof announcementsTable.$inferInsert, "vendorId">> = [
      {
        title: "Saturday DJ Night — Resident DJ live!",
        body: "Join us this Saturday for the biggest party of the week. Resident DJ spinning house, disco and Bollywood classics. Free entry for ladies before 9 PM.",
        imageUrl: pick(GALLERY, i + 3), genre: "DJ Night", eventType: "Party",
        isActive: true, approvalStatus: "approved", price: "0",
      },
      {
        title: "Midweek Ladies Night — every Wednesday",
        body: "Unlimited sangria and a complimentary welcome cocktail for ladies, every Wednesday from 8 PM. Bring your crew.",
        imageUrl: pick(GALLERY, i + 6), genre: "Ladies Night", eventType: "Themed Party",
        isActive: true, approvalStatus: "approved", price: "0",
      },
    ];
    let announcementsAdded = 0;
    for (const a of anns) if (await addAnnouncementIfMissing(vendor.id, a)) announcementsAdded++;

    report.push({
      vendorId: vendor.id,
      businessName: vendor.businessName,
      imagesFilled,
      eventId,
      drinkPlansAdded,
      offersAdded,
      announcementsAdded,
    });
  }

  // ── Game profile (item 3) ──────────────────────────────────────────────────
  const game = await seedGameOrganizer();

  return { vendors: report, game };
}
