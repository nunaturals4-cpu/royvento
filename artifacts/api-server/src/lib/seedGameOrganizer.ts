/**
 * Shared seeding logic for the demo Game Organizer. Used by:
 *   - src/scripts/seedGameOrganizer.ts          (CLI runner)
 *   - seedProdShowcase()                         (prod showcase enrichment)
 *   - POST /api/admin/seed-prod-showcase         (one-shot admin endpoint)
 *
 * Creates a fully-detailed, approved + verified game venue ("Neon Arcade &
 * Gaming Zone") under a dedicated game_organizer account, with 6 games and
 * 2 packages so the public game profile + dashboard can be explored end-to-end.
 *
 * Idempotent: upserts the account by email, the organizer by user, and the
 * games/packages by slug (re-runs refresh images/details, never duplicate).
 */
import {
  db,
  usersTable,
  gameOrganizersTable,
  gamesTable,
  gamePackagesTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { generateUniqueTicketPrefix, generateTicketSalt } from "./ticketCode";

export const GAME_ORGANIZER_EMAIL = "gamezone@royvento.com";
export const GAME_ORGANIZER_PASSWORD = "Game@1234";
const VENUE = "Neon Arcade & Gaming Zone";

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80);
}

// Ensure the game tables exist even if the API server hasn't booted yet on this
// DB (mirrors the idempotent DDL in src/index.ts; CREATE IF NOT EXISTS is safe).
async function ensureTables() {
  await db.execute(sql`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "game_organizer_id" integer`);
  await db.execute(sql`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "game_id" integer`);
  await db.execute(sql`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "game_package_id" integer`);
  await db.execute(sql`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "duration_hours" numeric(5,1)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "game_organizers" (
      "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL,
      "name" varchar(255) NOT NULL, "slug" varchar(255) NOT NULL DEFAULT '',
      "description" text NOT NULL DEFAULT '', "logo_url" text NOT NULL DEFAULT '',
      "cover_image_url" text NOT NULL DEFAULT '', "gallery_images" text[] NOT NULL DEFAULT '{}'::text[],
      "website" varchar(255) NOT NULL DEFAULT '', "instagram" varchar(255) NOT NULL DEFAULT '',
      "facebook" varchar(255) NOT NULL DEFAULT '', "youtube" varchar(255) NOT NULL DEFAULT '',
      "support_email" varchar(255) NOT NULL DEFAULT '', "support_phone" varchar(50) NOT NULL DEFAULT '',
      "address" text NOT NULL DEFAULT '', "maps_url" text NOT NULL DEFAULT '',
      "city" varchar(100) NOT NULL DEFAULT '', "state" varchar(100) NOT NULL DEFAULT '',
      "verified" boolean NOT NULL DEFAULT false, "status" varchar(20) NOT NULL DEFAULT 'pending',
      "ticket_prefix" varchar(8) NOT NULL DEFAULT '', "ticket_salt" varchar(32) NOT NULL DEFAULT '',
      "online_balance" numeric(14,2) NOT NULL DEFAULT '0', "commission_owed" numeric(14,2) NOT NULL DEFAULT '0',
      "approved_at" timestamp with time zone, "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "game_organizers_user_idx" ON "game_organizers" ("user_id")`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "game_organizers_slug_idx" ON "game_organizers" ("slug")`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "games" (
      "id" serial PRIMARY KEY NOT NULL, "game_organizer_id" integer NOT NULL,
      "name" varchar(255) NOT NULL, "slug" varchar(255) NOT NULL DEFAULT '',
      "category" varchar(100) NOT NULL DEFAULT '', "description" text NOT NULL DEFAULT '',
      "rules" text NOT NULL DEFAULT '', "cover_image_url" text NOT NULL DEFAULT '',
      "images" text[] NOT NULL DEFAULT '{}'::text[], "videos" text[] NOT NULL DEFAULT '{}'::text[],
      "capacity" integer NOT NULL DEFAULT 0, "age_restriction" varchar(50) NOT NULL DEFAULT '',
      "pricing_model" varchar(12) NOT NULL DEFAULT 'fixed', "price" numeric(10,2) NOT NULL DEFAULT '0',
      "hourly_rate" numeric(10,2) NOT NULL DEFAULT '0', "min_hours" integer NOT NULL DEFAULT 1,
      "max_hours" integer NOT NULL DEFAULT 0, "commission_pct" numeric(5,2) NOT NULL DEFAULT '8',
      "gateway_fee_percent" numeric(5,2) NOT NULL DEFAULT '2', "active" boolean NOT NULL DEFAULT true,
      "approval_status" varchar(20) NOT NULL DEFAULT 'pending', "rejection_reason" text NOT NULL DEFAULT '',
      "is_featured_slider" boolean NOT NULL DEFAULT false, "sold_count" integer NOT NULL DEFAULT 0,
      "approved_at" timestamp with time zone, "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "games_game_organizer_idx" ON "games" ("game_organizer_id")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "games_slug_idx" ON "games" ("slug")`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "game_packages" (
      "id" serial PRIMARY KEY NOT NULL, "game_organizer_id" integer NOT NULL,
      "name" varchar(255) NOT NULL, "slug" varchar(255) NOT NULL DEFAULT '',
      "description" text NOT NULL DEFAULT '', "cover_image_url" text NOT NULL DEFAULT '',
      "images" text[] NOT NULL DEFAULT '{}'::text[], "price" numeric(10,2) NOT NULL DEFAULT '0',
      "items" jsonb, "addons" jsonb, "group_size" integer NOT NULL DEFAULT 0,
      "capacity" integer NOT NULL DEFAULT 0, "age_restriction" varchar(50) NOT NULL DEFAULT '',
      "commission_pct" numeric(5,2) NOT NULL DEFAULT '10', "gateway_fee_percent" numeric(5,2) NOT NULL DEFAULT '2',
      "active" boolean NOT NULL DEFAULT true, "approval_status" varchar(20) NOT NULL DEFAULT 'pending',
      "rejection_reason" text NOT NULL DEFAULT '', "sold_count" integer NOT NULL DEFAULT 0,
      "approved_at" timestamp with time zone, "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "game_packages_game_organizer_idx" ON "game_packages" ("game_organizer_id")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "game_packages_slug_idx" ON "game_packages" ("slug")`);
}

export type SeedGameOrganizerReport = {
  userId: number;
  organizerId: number;
  slug: string;
  email: string;
};

export async function seedGameOrganizer(): Promise<SeedGameOrganizerReport> {
  await ensureTables();

  // 1) User
  const passwordHash = await bcrypt.hash(GAME_ORGANIZER_PASSWORD, 10);
  let user = (await db.select().from(usersTable).where(eq(usersTable.email, GAME_ORGANIZER_EMAIL)).limit(1))[0];
  if (user) {
    await db.update(usersTable).set({ role: "game_organizer", passwordHash, emailVerified: true }).where(eq(usersTable.id, user.id));
  } else {
    [user] = await db.insert(usersTable).values({
      email: GAME_ORGANIZER_EMAIL, name: "Neon Arcade Owner", passwordHash, role: "game_organizer",
      phone: "+91 90000 00000", emailVerified: true, referralCode: "GAMEZONE1",
    }).returning();
  }
  if (!user) throw new Error("failed to create user");

  // 2) Game organizer profile (approved + verified)
  let org = (await db.select().from(gameOrganizersTable).where(eq(gameOrganizersTable.userId, user.id)).limit(1))[0];
  if (!org) {
    const usedPrefixes = (await db.select({ p: gameOrganizersTable.ticketPrefix }).from(gameOrganizersTable)).map((r) => r.p).filter((p): p is string => Boolean(p));
    const ticketPrefix = await generateUniqueTicketPrefix(VENUE, usedPrefixes);
    [org] = await db.insert(gameOrganizersTable).values({
      userId: user.id,
      name: VENUE,
      slug: slugify(VENUE),
      description:
        "Kolkata's premier indoor gaming destination. 15,000 sq ft of VR arenas, bowling lanes, arcade machines, PS5 lounges, go-kart racing, laser tag and a pro pool & snooker club — all under one neon-lit roof. Perfect for friends, families, birthday parties and corporate events.",
      logoUrl: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=300&q=80",
      coverImageUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1600&q=80",
      galleryImages: [
        "https://images.unsplash.com/photo-1622979135225-d2ba269cf1ac?w=800&q=80",
        "https://images.unsplash.com/photo-1577416412292-747c6607f055?w=800&q=80",
        "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800&q=80",
        "https://images.unsplash.com/photo-1611329532992-0b7ba27d85fb?w=800&q=80",
      ],
      website: "https://neonarcade.example.com",
      instagram: "https://instagram.com/neonarcade",
      facebook: "https://facebook.com/neonarcade",
      youtube: "",
      supportEmail: "hello@neonarcade.example.com",
      supportPhone: "+91 90000 00000",
      address: "3rd Floor, City Centre Mall, Salt Lake Sector 1",
      mapsUrl: "https://maps.google.com/?q=Salt+Lake+City+Centre+Kolkata",
      city: "Kolkata",
      state: "West Bengal",
      verified: true,
      status: "approved",
      approvedAt: new Date(),
      ticketPrefix,
      ticketSalt: generateTicketSalt(),
    }).returning();
  }
  if (!org) throw new Error("failed to create game organizer");

  // Refresh the venue's cover/logo/gallery on every run (game-themed, verified).
  await db.update(gameOrganizersTable).set({
    coverImageUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1600&q=80",
    logoUrl: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=300&q=80",
    galleryImages: [
      "https://images.unsplash.com/photo-1622979135225-d2ba269cf1ac?w=800&q=80",
      "https://images.unsplash.com/photo-1538511059256-46e76f13f071?w=800&q=80",
      "https://images.unsplash.com/photo-1594507905944-a2c8c4050850?w=800&q=80",
      "https://images.unsplash.com/photo-1761591847985-2184afaab747?w=800&q=80",
    ],
  }).where(eq(gameOrganizersTable.id, org.id));

  // 3) Games — upsert by slug so re-runs fix images/details on existing rows.
  const games = [
    { name: "VR Battle Arena", category: "VR Gaming Arena", pricingModel: "hourly", hourlyRate: "500", minHours: 1, maxHours: 3, price: "0", capacity: 6, ageRestriction: "12+", cover: "https://images.unsplash.com/photo-1622979135225-d2ba269cf1ac?w=900&q=80", featured: true, desc: "Step into fully immersive multiplayer VR worlds — zombie survival, space combat and escape rooms." },
    { name: "Premium Bowling Lane", category: "Bowling Alley", pricingModel: "fixed", price: "299", hourlyRate: "0", minHours: 1, maxHours: 0, capacity: 8, ageRestriction: "All ages", cover: "https://images.unsplash.com/photo-1538511059256-46e76f13f071?w=900&q=80", featured: true, desc: "10-pin bowling on glow-in-the-dark lanes with automatic scoring. ₹299 per person per game." },
    { name: "PS5 Gaming Lounge", category: "PlayStation/Xbox Lounge", pricingModel: "hourly", hourlyRate: "200", minHours: 1, maxHours: 6, price: "0", capacity: 4, ageRestriction: "All ages", cover: "https://images.unsplash.com/photo-1486401899868-0e435ed85128?w=900&q=80", featured: false, desc: "Latest PS5 consoles with FIFA, COD, Tekken and racing wheels on 65\" 4K screens." },
    { name: "Go-Kart Racing", category: "Go-Kart Racing", pricingModel: "fixed", price: "599", hourlyRate: "0", minHours: 1, maxHours: 0, capacity: 10, ageRestriction: "14+", cover: "https://images.unsplash.com/photo-1594507905944-a2c8c4050850?w=900&q=80", featured: true, desc: "Electric go-karts on a 400m indoor track with live lap timing. ₹599 per racer (10 laps)." },
    { name: "Pool & Snooker Table", category: "Pool & Snooker Club", pricingModel: "hourly", hourlyRate: "300", minHours: 1, maxHours: 4, price: "0", capacity: 4, ageRestriction: "All ages", cover: "https://images.unsplash.com/photo-1761591847985-2184afaab747?w=900&q=80", featured: false, desc: "Tournament-grade pool and snooker tables. ₹300 per hour per table." },
    { name: "Laser Tag Arena", category: "Laser Tag", pricingModel: "fixed", price: "399", hourlyRate: "0", minHours: 1, maxHours: 0, capacity: 12, ageRestriction: "8+", cover: "https://images.unsplash.com/photo-1593349480785-6ba0825f57f5?w=900&q=80", featured: false, desc: "Multi-level neon laser-tag battlefield with team modes. ₹399 per player (20 min match)." },
  ];
  for (const g of games) {
    const slug = slugify(g.name);
    const existing = (await db.select({ id: gamesTable.id }).from(gamesTable)
      .where(and(eq(gamesTable.gameOrganizerId, org.id), eq(gamesTable.slug, slug))).limit(1))[0];
    const values = {
      gameOrganizerId: org.id, name: g.name, slug, category: g.category, description: g.desc,
      rules: "Wear closed shoes. Listen to the safety briefing. No food or drinks inside the play area. Minimum age applies.",
      coverImageUrl: g.cover, images: [g.cover], videos: [],
      capacity: g.capacity, ageRestriction: g.ageRestriction, pricingModel: g.pricingModel,
      price: g.price, hourlyRate: g.hourlyRate, minHours: g.minHours, maxHours: g.maxHours,
      commissionPct: "8", gatewayFeePercent: "2", active: true,
      approvalStatus: "approved", isFeaturedSlider: g.featured, approvedAt: new Date(),
    };
    if (existing) await db.update(gamesTable).set({ coverImageUrl: g.cover, images: [g.cover], category: g.category, description: g.desc }).where(eq(gamesTable.id, existing.id));
    else await db.insert(gamesTable).values(values);
  }

  // 4) Packages — upsert by slug.
  const packages = [
    {
      name: "Weekend Combo", price: "999", groupSize: 4, cover: "https://images.unsplash.com/photo-1511882150382-421056c89033?w=900&q=80",
      desc: "The perfect weekend hangout — bowling, VR and arcade credits bundled at a discount.",
      items: [{ gameId: null, label: "1 Game of Bowling", quantity: 1 }, { gameId: null, label: "VR Battle Arena (30 min)", quantity: 1 }, { gameId: null, label: "Arcade Credits", quantity: 200 }],
      addons: [{ label: "Soft drinks (per person)", price: 49 }],
    },
    {
      name: "Ultimate Party Pack", price: "1499", groupSize: 6, cover: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=900&q=80",
      desc: "Birthday-ready bundle: go-kart racing, laser tag and a food combo for the whole squad.",
      items: [{ gameId: null, label: "Go-Kart Racing (10 laps)", quantity: 1 }, { gameId: null, label: "Laser Tag Match", quantity: 1 }, { gameId: null, label: "Food Combo (per person)", quantity: 1 }],
      addons: [{ label: "Birthday decoration", price: 499 }, { label: "Reserved party room (1 hr)", price: 799 }],
    },
  ];
  for (const p of packages) {
    const slug = slugify(p.name);
    const existing = (await db.select({ id: gamePackagesTable.id }).from(gamePackagesTable)
      .where(and(eq(gamePackagesTable.gameOrganizerId, org.id), eq(gamePackagesTable.slug, slug))).limit(1))[0];
    const values = {
      gameOrganizerId: org.id, name: p.name, slug, description: p.desc, coverImageUrl: p.cover, images: [p.cover],
      price: p.price, items: p.items, addons: p.addons, groupSize: p.groupSize, capacity: p.groupSize,
      ageRestriction: "All ages", commissionPct: "10", gatewayFeePercent: "2", active: true,
      approvalStatus: "approved", approvedAt: new Date(),
    };
    if (existing) await db.update(gamePackagesTable).set({ coverImageUrl: p.cover, images: [p.cover], description: p.desc }).where(eq(gamePackagesTable.id, existing.id));
    else await db.insert(gamePackagesTable).values(values);
  }

  return { userId: user.id, organizerId: org.id, slug: org.slug, email: GAME_ORGANIZER_EMAIL };
}
