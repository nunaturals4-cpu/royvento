/**
 * Showcase seed — populates enough demo content to SEE every homepage section
 * working locally:
 *   • 10 demo pubs (vendors + approved pub events)  — via seedDemoPubs()
 *   • Group-capacity data on each pub                — "Going Out With Friends"
 *   • drink_plans (welcome / unlimited / ticket)     — home "Drink Deals"
 *   • vendor_offers (food + drink, active now)       — pub-offers + happy hours
 *
 * Idempotent: demo drink_plans / vendor_offers for these vendors are wiped and
 * re-inserted on every run, and it ensures its own columns/tables exist first
 * (so it works even before the new api-server build has booted once).
 *
 * Run:  pnpm --filter @workspace/api-server seed:showcase
 */
import { db, usersTable, vendorsTable, eventsTable, bookingsTable, drinkPlansTable, vendorOffersTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { seedDemoPubs } from "../lib/seedDemoPubs";

const DRINK_IMAGES = [
  "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=1000&q=80",
  "https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=1000&q=80",
  "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=1000&q=80",
  "https://images.unsplash.com/photo-1536935338788-846bb9981813?w=1000&q=80",
];
const FOOD_IMAGES = [
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1000&q=80",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1000&q=80",
];

// Per-pub group-capacity profile (cycled across the 10 demo pubs).
const GROUP_PROFILES = [
  { tableCount: 30, tableSize: 8, vipCapacity: 60, maxGroupSize: 20, groupOffer: "Book for 6, get 1 entry free" },
  { tableCount: 24, tableSize: 6, vipCapacity: 40, maxGroupSize: 16, groupOffer: "Group of 8+ gets a free drink bucket" },
  { tableCount: 18, tableSize: 4, vipCapacity: 24, maxGroupSize: 12, groupOffer: "" },
  { tableCount: 40, tableSize: 10, vipCapacity: 80, maxGroupSize: 30, groupOffer: "Large group VIP table — welcome shots on us" },
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]!;
}

/** Idempotent: ensure the columns/tables this seed writes to exist locally. */
async function ensureSchema() {
  for (const tbl of ["events", "organizer_events", "games"] as const) {
    await db.execute(sql.raw(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS "max_group_size" integer NOT NULL DEFAULT 0`));
    await db.execute(sql.raw(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS "group_booking_enabled" boolean NOT NULL DEFAULT true`));
    await db.execute(sql.raw(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS "group_offer" varchar(160) NOT NULL DEFAULT ''`));
  }
  await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "table_count" integer NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "table_size" integer NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "vip_capacity" integer NOT NULL DEFAULT 0`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "vendor_offers" (
      "id" serial PRIMARY KEY NOT NULL,
      "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
      "category" varchar(10) NOT NULL,
      "title" varchar(120) NOT NULL,
      "description" text NOT NULL DEFAULT '',
      "discount_type" varchar(16) NOT NULL,
      "discount_value" numeric(10,2) NOT NULL DEFAULT '0',
      "free_item_name" varchar(120) NOT NULL DEFAULT '',
      "days" text[] NOT NULL DEFAULT '{}'::text[],
      "time_from" varchar(5) NOT NULL DEFAULT '',
      "time_to" varchar(5) NOT NULL DEFAULT '',
      "starts_at" timestamp with time zone,
      "ends_at" timestamp with time zone,
      "active" boolean NOT NULL DEFAULT true,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )`);
}

async function main() {
  logger.info("Showcase seed: ensuring schema…");
  await ensureSchema();

  logger.info("Showcase seed: seeding demo pubs…");
  const fullReport = await seedDemoPubs();

  // Keep only the first KEEP_DEMO demo pubs (product decision: ~7 pubs total =
  // partner-created pubs + a few system demos). Prune the rest so re-runs stay
  // idempotent at this count. Only demo vendors (demo+<slug>@royvento.in) are
  // ever touched — partner-created pubs are never deleted here.
  const KEEP_DEMO = 4;
  const keep = fullReport.pubs.slice(0, KEEP_DEMO);
  const drop = fullReport.pubs.slice(KEEP_DEMO);
  if (drop.length) {
    const dropVendorIds = drop.map((p) => p.vendorId);
    const dropEventIds = drop.map((p) => p.eventId).filter((x): x is number => x != null);
    const dropEmails = drop.map((p) => `demo+${p.slug}@royvento.in`);
    if (dropEventIds.length) {
      await db.delete(bookingsTable).where(inArray(bookingsTable.eventId, dropEventIds));
    }
    await db.delete(eventsTable).where(inArray(eventsTable.vendorId, dropVendorIds));
    await db.delete(vendorOffersTable).where(inArray(vendorOffersTable.vendorId, dropVendorIds));
    await db.delete(drinkPlansTable).where(inArray(drinkPlansTable.vendorId, dropVendorIds));
    await db.delete(vendorsTable).where(inArray(vendorsTable.id, dropVendorIds));
    await db.delete(usersTable).where(inArray(usersTable.email, dropEmails));
    logger.info(`  ✓ pruned ${drop.length} extra demo pubs (kept ${keep.length})`);
  }
  const report = { count: keep.length, pubs: keep };
  const vendorIds = report.pubs.map((p) => p.vendorId);
  logger.info(`  ✓ ${report.count} demo pubs retained (vendors + events)`);

  // ── Group-capacity + group offers on each pub event ───────────────────────
  let groupUpdated = 0;
  for (let i = 0; i < report.pubs.length; i++) {
    const p = report.pubs[i]!;
    if (!p.eventId) continue;
    const g = pick(GROUP_PROFILES, i);
    await db
      .update(eventsTable)
      .set({
        tableCount: g.tableCount,
        tableSize: g.tableSize,
        vipCapacity: g.vipCapacity,
        maxGroupSize: g.maxGroupSize,
        groupBookingEnabled: true,
        groupOffer: g.groupOffer,
        // make sure they surface in Happening Tonight too
        happeningTonight: true,
        startTime: "19:00",
        endTime: "01:00",
      })
      .where(eq(eventsTable.id, p.eventId));
    groupUpdated++;
  }
  logger.info(`  ✓ group-capacity set on ${groupUpdated} pubs`);

  // ── Wipe previous demo drink_plans / vendor_offers for these vendors ──────
  if (vendorIds.length) {
    await db.delete(drinkPlansTable).where(inArray(drinkPlansTable.vendorId, vendorIds));
    await db.delete(vendorOffersTable).where(inArray(vendorOffersTable.vendorId, vendorIds));
  }

  // ── Drink plans → home "Drink Deals" section ──────────────────────────────
  let planCount = 0;
  for (let i = 0; i < report.pubs.length; i++) {
    const p = report.pubs[i]!;
    const img = pick(DRINK_IMAGES, i);
    const plans = [
      {
        vendorId: p.vendorId,
        type: "welcome",
        productName: "Free Welcome Cocktail",
        gender: "female",
        price: 0,
        days: ["Thu", "Fri", "Sat"],
        timeFrom: "19:00",
        timeTo: "23:00",
        description: "Complimentary signature cocktail for ladies on entry.",
        imageUrl: img,
      },
      {
        vendorId: p.vendorId,
        type: "unlimited",
        productName: "Unlimited Sangria (Ladies Night)",
        gender: "female",
        price: 0,
        days: ["Wed"],
        timeFrom: "20:00",
        timeTo: "23:30",
        description: "Free-flowing house sangria all night, every Wednesday.",
        imageUrl: pick(DRINK_IMAGES, i + 1),
      },
      {
        vendorId: p.vendorId,
        type: "ticket",
        productName: "Party Pass + 2 Drinks",
        gender: "all",
        price: 1499,
        days: ["Fri", "Sat"],
        timeFrom: "21:00",
        timeTo: "01:00",
        description: "Cover charge includes two premium drinks of your choice.",
        lineItems: [
          { name: "Premium Spirit (30ml)", qty: 2, discountedPrice: 0 },
          { name: "Mixer & Garnish", qty: 2, discountedPrice: 0 },
        ],
        imageUrl: pick(DRINK_IMAGES, i + 2),
      },
    ] as const;
    for (const plan of plans) {
      await db.insert(drinkPlansTable).values(plan as typeof drinkPlansTable.$inferInsert);
      planCount++;
    }
  }
  logger.info(`  ✓ ${planCount} drink plans inserted`);

  // ── Vendor offers (food + drink) → pub-offers + happy hours ───────────────
  let offerCount = 0;
  for (let i = 0; i < report.pubs.length; i++) {
    const p = report.pubs[i]!;
    const offers = [
      {
        vendorId: p.vendorId,
        category: "drink",
        title: "Happy Hours — 1+1 on all cocktails",
        description: "Buy one cocktail, get one free. Every day, all evening.",
        discountType: "bogo",
        discountValue: "0",
        days: [] as string[], // every day
        timeFrom: "",
        timeTo: "", // all-day → always "active now"
        active: true,
      },
      {
        vendorId: p.vendorId,
        category: "food",
        title: "30% off the food menu",
        description: "Flat 30% off all starters and mains for dine-in groups.",
        discountType: "percent",
        discountValue: "30",
        days: ["Thu", "Fri", "Sat"],
        timeFrom: "18:00",
        timeTo: "23:00",
        active: true,
      },
      {
        vendorId: p.vendorId,
        category: "food",
        title: "Free dessert platter",
        description: "Complimentary dessert platter with any 2 main courses.",
        discountType: "free_item",
        discountValue: "0",
        freeItemName: "Assorted Dessert Platter",
        days: [] as string[],
        timeFrom: "",
        timeTo: "",
        active: true,
      },
    ];
    for (const offer of offers) {
      await db.insert(vendorOffersTable).values(offer as typeof vendorOffersTable.$inferInsert);
      offerCount++;
    }
  }
  logger.info(`  ✓ ${offerCount} vendor offers inserted`);

  logger.info("Showcase seed complete. Open the homepage to see all sections populated.");
  process.exit(0);
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
