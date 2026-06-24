import app from "./app";
import { logger } from "./lib/logger";
import { runCleanup, autoCheckoutStaleBookings } from "./jobs/cleanup";
import { runMorningReminders, runPreArrivalReminders } from "./jobs/bookingReminders";
import { runExpoPushReceiptPoll } from "./jobs/expoPushReceipts";
import { runPointsExpiry } from "./jobs/pointsExpiry";
import { runTonightDigest, runStartingSoonReminders } from "./jobs/tonightNotifications";
import { runSoloGroupExpiry } from "./jobs/soloGroupExpiry";
import cron from "node-cron";
import { db, usersTable, vendorsTable, eventsTable, wishlistsTable, organizersTable } from "@workspace/db";
import { eq, or, sql, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { generateUniqueTicketPrefix, generateTicketSalt } from "./lib/ticketCode";
import { ensureEmailSchema } from "./lib/emailService";
import { runInboundSync } from "./routes/emails";

/**
 * Boot-time backfill: populate `ticketPrefix` / `ticketSalt` for any vendor
 * row whose values are still empty. Required so `generateTicketCode` (which
 * now throws on missing prefix/salt — no more silent `RV-` fallback) always
 * has data to work with. New vendors created via POST /vendors/me already get
 * these fields populated; this only affects legacy rows.
 */
async function backfillVendorTicketPrefixes() {
  try {
    const missing = await db
      .select({ id: vendorsTable.id, businessName: vendorsTable.businessName, ticketPrefix: vendorsTable.ticketPrefix, ticketSalt: vendorsTable.ticketSalt })
      .from(vendorsTable)
      .where(or(eq(vendorsTable.ticketPrefix, ""), eq(vendorsTable.ticketSalt, "")));
    if (missing.length === 0) {
      logger.info("Startup audit: all vendors have ticketPrefix/ticketSalt");
      return;
    }
    // Pre-load all currently-used prefixes so collision checks include rows
    // we're about to skip (already-set vendors).
    const used = new Set(
      (await db.select({ p: vendorsTable.ticketPrefix }).from(vendorsTable))
        .map((r) => r.p)
        .filter((p): p is string => Boolean(p)),
    );
    for (const v of missing) {
      const prefix = v.ticketPrefix
        ? v.ticketPrefix
        : await generateUniqueTicketPrefix(v.businessName || "Vendor", Array.from(used));
      const salt = v.ticketSalt || generateTicketSalt();
      used.add(prefix);
      await db
        .update(vendorsTable)
        .set({ ticketPrefix: prefix, ticketSalt: salt })
        .where(eq(vendorsTable.id, v.id));
    }
    logger.info({ backfilled: missing.length }, "Startup audit: backfilled vendor ticketPrefix/ticketSalt");
  } catch (err) {
    logger.error({ err }, "Startup audit failed (vendor ticket prefix backfill)");
  }
}

/**
 * Boot-time backfill: populate `ticketPrefix` / `ticketSalt` for any organizer
 * row whose values are still empty, so organizer QR ticket codes can be signed
 * (mirrors backfillVendorTicketPrefixes). New organizers get these on profile
 * creation; this only affects rows created before Phase 2A.
 */
async function backfillOrganizerTicketPrefixes() {
  try {
    const missing = await db
      .select({ id: organizersTable.id, name: organizersTable.name, ticketPrefix: organizersTable.ticketPrefix, ticketSalt: organizersTable.ticketSalt })
      .from(organizersTable)
      .where(or(eq(organizersTable.ticketPrefix, ""), eq(organizersTable.ticketSalt, "")));
    if (missing.length === 0) return;
    const used = new Set(
      (await db.select({ p: organizersTable.ticketPrefix }).from(organizersTable))
        .map((r) => r.p)
        .filter((p): p is string => Boolean(p)),
    );
    for (const o of missing) {
      const prefix = o.ticketPrefix || (await generateUniqueTicketPrefix(o.name || "Organizer", Array.from(used)));
      const salt = o.ticketSalt || generateTicketSalt();
      used.add(prefix);
      await db.update(organizersTable).set({ ticketPrefix: prefix, ticketSalt: salt }).where(eq(organizersTable.id, o.id));
    }
    logger.info({ backfilled: missing.length }, "Startup audit: backfilled organizer ticketPrefix/ticketSalt");
  } catch (err) {
    logger.error({ err }, "Startup audit failed (organizer ticket prefix backfill)");
  }
}

/**
 * Detect users who own a vendor profile AND are also `accepted` managers of a
 * different vendor. This is legal (a partner can manage another partner's
 * pub), but it's the exact condition that causes another pub's data to show
 * up in their scanner panels — see Task #598. Logging it on boot makes future
 * leaks immediately visible without needing a manual SQL audit. Each user
 * can use the "Pubs I manage for others" → Leave button on the Vendor
 * dashboard to detach themselves.
 */
async function auditVendorManagerOverlap() {
  try {
    const rows = await db.execute<{
      manager_id: number;
      email: string | null;
      own_vendor_id: number;
      managed_vendor_ids: number[];
    }>(sql`
      SELECT
        vm.manager_id,
        u.email,
        v_own.id AS own_vendor_id,
        array_agg(vm.vendor_id) AS managed_vendor_ids
      FROM vendor_managers vm
      JOIN vendors v_own ON v_own.user_id = vm.manager_id
      LEFT JOIN users u ON u.id = vm.manager_id
      WHERE vm.status = 'accepted' AND vm.vendor_id <> v_own.id
      GROUP BY vm.manager_id, u.email, v_own.id
    `);
    const list = (rows as unknown as { rows?: Array<{ manager_id: number; email: string | null; own_vendor_id: number; managed_vendor_ids: number[] }> }).rows
      ?? (rows as unknown as Array<{ manager_id: number; email: string | null; own_vendor_id: number; managed_vendor_ids: number[] }>);
    if (Array.isArray(list) && list.length > 0) {
      logger.warn(
        { overlap: list },
        `Startup audit: ${list.length} vendor owner(s) are also accepted managers of another pub — they will see those pubs in their scanner panels until they tap Leave.`,
      );
    }
  } catch (err) {
    logger.error({ err }, "Startup audit failed (vendor/manager overlap check)");
  }
}

async function auditPasswordHashes() {
  try {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(
        sql`${usersTable.passwordHash} IS NULL OR ${usersTable.passwordHash} !~ '^\\$2[aby]\\$'`,
      );
    const bad = rows[0]?.count ?? 0;
    if (bad > 0) {
      logger.error(
        { badPasswordHashCount: bad },
        "Startup audit: users.password_hash failed bcrypt prefix check. See replit.md gotcha.",
      );
    } else {
      logger.info("Startup audit: all users.password_hash values look like bcrypt");
    }
  } catch (err) {
    logger.error({ err }, "Startup audit failed (password_hash check)");
  }
}

/**
 * Idempotent startup cleanup: remove the legacy demo vendor "Royvento Studio"
 * (originally created by `pnpm seed`'s `ensureDemoPartner`, since disarmed)
 * from every environment it landed in. By explicit product decision the match
 * is now on `businessName = 'Royvento Studio'` alone — the previous owner-
 * email guard let stray copies created under different emails survive in
 * production. "Royvento Studio" is reserved for the demo vendor and is not
 * usable as a real partner business name.
 */
async function removeLegacyDemoVendor() {
  try {
    const targets = await db
      .select({ id: vendorsTable.id, userId: vendorsTable.userId })
      .from(vendorsTable)
      .where(eq(vendorsTable.businessName, "Royvento Studio"));
    if (targets.length === 0) {
      logger.info("Startup cleanup: no legacy 'Royvento Studio' vendor to remove");
      return;
    }
    for (const v of targets) {
      const [owner] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, v.userId)).limit(1);
      logger.warn({ vendorId: v.id, ownerEmail: owner?.email }, "Startup cleanup: removing 'Royvento Studio' vendor by business-name match");
      // Individual DELETEs (PostgreSQL DO $$ blocks don't support bind params).
      await db.transaction(async (tx) => {
        const evRows = await tx.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.vendorId, v.id));
        const eventIds = evRows.map((r) => r.id);

        await tx.execute(sql`DELETE FROM commission_ledger WHERE vendor_id = ${v.id}`);
        await tx.execute(sql`DELETE FROM bookings WHERE vendor_id = ${v.id}`);
        await tx.execute(sql`DELETE FROM reviews WHERE vendor_id = ${v.id}`);
        // Drizzle's typed delete + inArray emits `IN ($1, $2, ...)` which
        // PostgreSQL accepts — `ANY((1,2,3))` does NOT work for row tuples.
        if (eventIds.length > 0) {
          await tx.delete(wishlistsTable).where(inArray(wishlistsTable.eventId, eventIds));
        }
        await tx.execute(sql`DELETE FROM announcements WHERE vendor_id = ${v.id}`);
        await tx.execute(sql`DELETE FROM events WHERE vendor_id = ${v.id}`);
        await tx.execute(sql`DELETE FROM partner_media WHERE vendor_id = ${v.id}`);
        await tx.execute(sql`DELETE FROM partner_blocked_dates WHERE vendor_id = ${v.id}`);
        await tx.execute(sql`DELETE FROM ads_requests WHERE vendor_id = ${v.id}`);
        await tx.execute(sql`DELETE FROM profile_views WHERE vendor_id = ${v.id}`);
        await tx.execute(sql`DELETE FROM coupons WHERE vendor_id = ${v.id}`);
        await tx.execute(sql`DELETE FROM vendor_managers WHERE vendor_id = ${v.id}`);
        await tx.execute(sql`DELETE FROM availability WHERE vendor_id = ${v.id}`);
        await tx.execute(sql`DELETE FROM review_deletions WHERE vendor_id = ${v.id}`);
        await tx.execute(sql`DELETE FROM vendor_commissions WHERE vendor_id = ${v.id}`);
        await tx.execute(sql`DELETE FROM vendors WHERE id = ${v.id}`);
        // Only drop the owner user if this was their ONLY vendor.
        await tx.execute(sql`
          DELETE FROM users
            WHERE id = ${v.userId}
              AND NOT EXISTS (SELECT 1 FROM vendors WHERE user_id = ${v.userId})
        `);
      });
      logger.info({ vendorId: v.id, userId: v.userId }, "Startup cleanup: removed legacy demo vendor 'Royvento Studio' and its data");
    }
  } catch (err) {
    logger.error({ err }, "Startup cleanup failed (Royvento Studio demo vendor)");
  }
}

// Admin bootstrap credentials. Overridable via env so production can use a
// strong secret that never lives in source/the bundle. Falls back to the
// historical defaults when the env vars are absent, so existing deployments
// keep working with no behavioural change until they set ADMIN_PASSWORD.
const ADMIN_EMAIL = process.env["ADMIN_EMAIL"] || "royvento56@gmail.com";
const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"] || "admin123@";

async function ensureAdminAccount() {
  try {
    const target = await db.select().from(usersTable).where(eq(usersTable.email, ADMIN_EMAIL)).limit(1);
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    if (target[0]) {
      await db
        .update(usersTable)
        .set({ role: "admin", passwordHash, emailVerified: true })
        .where(eq(usersTable.id, target[0].id));
      logger.info("Admin account refreshed (password + verified)");
      return;
    }
    // Migrate from old email if present
    const old = await db.select().from(usersTable).where(eq(usersTable.email, "admin@admin.com")).limit(1);
    if (old[0]) {
      await db
        .update(usersTable)
        .set({ email: ADMIN_EMAIL, role: "admin", passwordHash, emailVerified: true })
        .where(eq(usersTable.id, old[0].id));
      logger.info("Admin email migrated to royvento56@gmail.com");
      return;
    }
    // Create fresh admin account
    await db.insert(usersTable).values({
      email: ADMIN_EMAIL,
      passwordHash,
      name: "Royvento Admin",
      role: "admin",
      emailVerified: true,
      phone: "+91 9000000000",
    });
    logger.info("Admin account created");
  } catch (err) {
    logger.error({ err }, "Failed to ensure admin account on startup");
  }
}

async function applyPendingSchemaChanges() {
  try {
    await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" varchar(10)`);
    await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender_completed" boolean NOT NULL DEFAULT false`);
    // ── Solo Connect vertical (Phase 1) ────────────────────────────────────
    // Verified, single-gender, same-city activity groups. Idempotent so a fresh
    // deploy ships the whole vertical without a drizzle-kit step. Mirrors
    // lib/db/src/schema/index.ts.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "solo_connect_verifications" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "id_type" varchar(20) NOT NULL DEFAULT '',
        "id_number" varchar(100) NOT NULL DEFAULT '',
        "id_document_url" text NOT NULL DEFAULT '',
        "selfie_url" text NOT NULL DEFAULT '',
        "phone" varchar(20) NOT NULL DEFAULT '',
        "otp_hash" varchar(255) NOT NULL DEFAULT '',
        "otp_expiry" timestamp with time zone,
        "phone_verified" boolean NOT NULL DEFAULT false,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "rejection_reason" text NOT NULL DEFAULT '',
        "reviewed_by_user_id" integer,
        "reviewed_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    // Added after the initial table ship — backfill onto existing prod rows.
    await db.execute(sql`ALTER TABLE "solo_connect_verifications" ADD COLUMN IF NOT EXISTS "id_number" varchar(100) NOT NULL DEFAULT ''`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "solo_verifications_user_uniq" ON "solo_connect_verifications" ("user_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "solo_verifications_status_idx" ON "solo_connect_verifications" ("status")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "solo_groups" (
        "id" serial PRIMARY KEY NOT NULL,
        "admin_user_id" integer NOT NULL,
        "name" varchar(160) NOT NULL,
        "activity_type" varchar(20) NOT NULL DEFAULT 'nightlife',
        "activity_label" varchar(160) NOT NULL DEFAULT '',
        "venue_name" varchar(255) NOT NULL DEFAULT '',
        "vendor_id" integer,
        "event_id" integer,
        "group_date" date,
        "start_time" varchar(8) NOT NULL DEFAULT '',
        "description" text NOT NULL DEFAULT '',
        "min_members" integer NOT NULL DEFAULT 3,
        "max_members" integer NOT NULL DEFAULT 15,
        "country" varchar(100) NOT NULL DEFAULT 'India',
        "state" varchar(100) NOT NULL DEFAULT '',
        "city" varchar(100) NOT NULL DEFAULT '',
        "gender_type" varchar(10) NOT NULL,
        "visibility" varchar(10) NOT NULL DEFAULT 'public',
        "status" varchar(10) NOT NULL DEFAULT 'open',
        "reputation_score" numeric(4,2) NOT NULL DEFAULT '0',
        "rating_count" integer NOT NULL DEFAULT 0,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "solo_groups_city_gender_status_idx" ON "solo_groups" ("city", "gender_type", "status")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "solo_groups_admin_idx" ON "solo_groups" ("admin_user_id")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "solo_group_members" (
        "id" serial PRIMARY KEY NOT NULL,
        "group_id" integer NOT NULL REFERENCES "solo_groups"("id") ON DELETE CASCADE,
        "user_id" integer NOT NULL,
        "role" varchar(10) NOT NULL DEFAULT 'member',
        "status" varchar(12) NOT NULL DEFAULT 'requested',
        "joined_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "solo_group_members_group_user_uniq" ON "solo_group_members" ("group_id", "user_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "solo_group_members_user_idx" ON "solo_group_members" ("user_id")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "solo_group_messages" (
        "id" serial PRIMARY KEY NOT NULL,
        "group_id" integer NOT NULL REFERENCES "solo_groups"("id") ON DELETE CASCADE,
        "user_id" integer NOT NULL,
        "body" text NOT NULL DEFAULT '',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "solo_group_messages_group_idx" ON "solo_group_messages" ("group_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "solo_group_messages_created_idx" ON "solo_group_messages" ("created_at")`);
    // ── Solo Connector redesign (phone-first onboarding, no gender gate,
    // reporting/moderation, auto-expiry). Idempotent; mirrors schema/index.ts.
    await db.execute(sql`ALTER TABLE "solo_connect_verifications" ADD COLUMN IF NOT EXISTS "firebase_uid" varchar(128) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "solo_connect_verifications" ADD COLUMN IF NOT EXISTS "consent_accepted_at" timestamp with time zone`);
    await db.execute(sql`ALTER TABLE "solo_connect_verifications" ADD COLUMN IF NOT EXISTS "consent_version" varchar(20) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "solo_connect_verifications" ADD COLUMN IF NOT EXISTS "suspended_until" timestamp with time zone`);
    await db.execute(sql`ALTER TABLE "solo_connect_verifications" ADD COLUMN IF NOT EXISTS "banned" boolean NOT NULL DEFAULT false`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "solo_verifications_phone_uniq" ON "solo_connect_verifications" ("phone") WHERE "phone" <> ''`);
    // solo_groups: gender_type becomes a non-gating label (default mixed) + activity/soft-delete cols.
    await db.execute(sql`ALTER TABLE "solo_groups" ALTER COLUMN "gender_type" SET DEFAULT 'mixed'`);
    await db.execute(sql`ALTER TABLE "solo_groups" ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp with time zone NOT NULL DEFAULT now()`);
    await db.execute(sql`ALTER TABLE "solo_groups" ADD COLUMN IF NOT EXISTS "expiry_warned_at" timestamp with time zone`);
    await db.execute(sql`ALTER TABLE "solo_groups" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone`);
    await db.execute(sql`ALTER TABLE "solo_groups" ADD COLUMN IF NOT EXISTS "deleted_reason" varchar(30) NOT NULL DEFAULT ''`);
    // "Create Your Own Party" fields (activity_type = 'party').
    await db.execute(sql`ALTER TABLE "solo_groups" ADD COLUMN IF NOT EXISTS "cover_image_url" text NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "solo_groups" ADD COLUMN IF NOT EXISTS "address" text NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "solo_groups" ADD COLUMN IF NOT EXISTS "pin_code" varchar(12) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "solo_groups" ADD COLUMN IF NOT EXISTS "map_location" text NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "solo_groups" ADD COLUMN IF NOT EXISTS "organizer_name" varchar(120) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "solo_groups" ADD COLUMN IF NOT EXISTS "end_time" varchar(8) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "solo_groups" ADD COLUMN IF NOT EXISTS "ticket_type" varchar(10) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "solo_groups" ADD COLUMN IF NOT EXISTS "ticket_price" numeric(10,2) NOT NULL DEFAULT '0'`);
    await db.execute(sql`ALTER TABLE "solo_groups" ADD COLUMN IF NOT EXISTS "capacity" integer`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "solo_groups_city_status_idx" ON "solo_groups" ("city", "status")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "solo_groups_activity_idx" ON "solo_groups" ("last_activity_at")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "solo_reports" (
        "id" serial PRIMARY KEY NOT NULL,
        "reporter_user_id" integer NOT NULL,
        "reported_user_id" integer NOT NULL,
        "group_id" integer NOT NULL,
        "reason" varchar(24) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "evidence_url" text NOT NULL DEFAULT '',
        "status" varchar(16) NOT NULL DEFAULT 'open',
        "action_taken" varchar(16) NOT NULL DEFAULT '',
        "admin_note" text NOT NULL DEFAULT '',
        "reviewed_by_user_id" integer,
        "reviewed_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "solo_reports_reported_idx" ON "solo_reports" ("reported_user_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "solo_reports_status_idx" ON "solo_reports" ("status")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "solo_reports_open_uniq" ON "solo_reports" ("reporter_user_id", "reported_user_id", "group_id") WHERE "status" = 'open'`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "solo_moderation_actions" (
        "id" serial PRIMARY KEY NOT NULL,
        "admin_user_id" integer NOT NULL,
        "target_user_id" integer,
        "group_id" integer,
        "report_id" integer,
        "action" varchar(16) NOT NULL,
        "note" text NOT NULL DEFAULT '',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "solo_moderation_actions_target_idx" ON "solo_moderation_actions" ("target_user_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "solo_moderation_actions_created_idx" ON "solo_moderation_actions" ("created_at")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "solo_deleted_groups_log" (
        "id" serial PRIMARY KEY NOT NULL,
        "group_id" integer NOT NULL,
        "name" varchar(160) NOT NULL DEFAULT '',
        "member_count" integer NOT NULL DEFAULT 0,
        "reason" varchar(30) NOT NULL DEFAULT 'inactivity',
        "deleted_at" timestamp with time zone NOT NULL DEFAULT now(),
        "restorable_until" timestamp with time zone,
        "restored_at" timestamp with time zone,
        "purged_at" timestamp with time zone
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "solo_deleted_groups_log_group_idx" ON "solo_deleted_groups_log" ("group_id")`);

    // ── "Create Your Own Party" vertical — isolated ticketing tables ──────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "create_your_party" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizer_user_id" integer NOT NULL,
        "name" varchar(160) NOT NULL,
        "slug" varchar(200) NOT NULL DEFAULT '',
        "cover_image_url" text NOT NULL DEFAULT '',
        "gallery_images" text[] NOT NULL DEFAULT '{}',
        "description" text NOT NULL DEFAULT '',
        "rules" text NOT NULL DEFAULT '',
        "category" varchar(80) NOT NULL DEFAULT '',
        "visibility" varchar(10) NOT NULL DEFAULT 'public',
        "venue_name" varchar(255) NOT NULL DEFAULT '',
        "address" text NOT NULL DEFAULT '',
        "city" varchar(100) NOT NULL DEFAULT '',
        "state" varchar(100) NOT NULL DEFAULT '',
        "pin_code" varchar(12) NOT NULL DEFAULT '',
        "map_location" text NOT NULL DEFAULT '',
        "party_date" date,
        "start_time" varchar(8) NOT NULL DEFAULT '',
        "end_time" varchar(8) NOT NULL DEFAULT '',
        "join_type" varchar(12) NOT NULL DEFAULT 'mixed',
        "organizer_name" varchar(120) NOT NULL DEFAULT '',
        "capacity" integer NOT NULL DEFAULT 0,
        "status" varchar(16) NOT NULL DEFAULT 'published',
        "created_by" integer NOT NULL,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    // Added after initial release — backfill for existing party tables.
    await db.execute(sql`ALTER TABLE "create_your_party" ADD COLUMN IF NOT EXISTS "gallery_images" text[] NOT NULL DEFAULT '{}'`);
    await db.execute(sql`ALTER TABLE "create_your_party" ADD COLUMN IF NOT EXISTS "age_group" varchar(12) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "create_your_party" ADD COLUMN IF NOT EXISTS "dress_code" varchar(20) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "create_your_party" ADD COLUMN IF NOT EXISTS "drinking" varchar(4) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "create_your_party" ADD COLUMN IF NOT EXISTS "smoking" varchar(4) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "create_your_party" ADD COLUMN IF NOT EXISTS "couple_friendly" varchar(4) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "create_your_party" ADD COLUMN IF NOT EXISTS "lgbtq_friendly" varchar(4) NOT NULL DEFAULT ''`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cyp_organizer_idx" ON "create_your_party" ("organizer_user_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cyp_city_status_idx" ON "create_your_party" ("city", "status")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cyp_slug_idx" ON "create_your_party" ("slug")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "create_your_party_tickets" (
        "id" serial PRIMARY KEY NOT NULL,
        "party_id" integer NOT NULL REFERENCES "create_your_party"("id") ON DELETE CASCADE,
        "type" varchar(10) NOT NULL DEFAULT 'free',
        "name" varchar(120) NOT NULL DEFAULT 'Entry',
        "price" numeric(10,2) NOT NULL DEFAULT '0',
        "quantity" integer NOT NULL DEFAULT 0,
        "sold_count" integer NOT NULL DEFAULT 0,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cyp_tickets_party_idx" ON "create_your_party_tickets" ("party_id")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "create_your_party_bookings" (
        "id" serial PRIMARY KEY NOT NULL,
        "party_id" integer NOT NULL REFERENCES "create_your_party"("id") ON DELETE CASCADE,
        "ticket_id" integer NOT NULL REFERENCES "create_your_party_tickets"("id") ON DELETE CASCADE,
        "user_id" integer NOT NULL,
        "booking_code" varchar(16) NOT NULL,
        "name" varchar(255) NOT NULL DEFAULT '',
        "email" varchar(255) NOT NULL DEFAULT '',
        "phone" varchar(50) NOT NULL DEFAULT '',
        "quantity" integer NOT NULL DEFAULT 1,
        "total_price" numeric(10,2) NOT NULL DEFAULT '0',
        "commission_amount" numeric(10,2) NOT NULL DEFAULT '0',
        "net_amount" numeric(10,2) NOT NULL DEFAULT '0',
        "status" varchar(20) NOT NULL DEFAULT 'confirmed',
        "payment_status" varchar(12) NOT NULL DEFAULT 'none',
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "cancelled_at" timestamp with time zone
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cyp_bookings_party_idx" ON "create_your_party_bookings" ("party_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cyp_bookings_user_idx" ON "create_your_party_bookings" ("user_id")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "cyp_bookings_code_uniq" ON "create_your_party_bookings" ("booking_code")`);
    await db.execute(sql`ALTER TABLE "create_your_party_bookings" ADD COLUMN IF NOT EXISTS "checked_in" boolean NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE "create_your_party_bookings" ADD COLUMN IF NOT EXISTS "checked_in_at" timestamp with time zone`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "create_your_party_payments" (
        "id" serial PRIMARY KEY NOT NULL,
        "booking_id" integer NOT NULL REFERENCES "create_your_party_bookings"("id") ON DELETE CASCADE,
        "user_id" integer NOT NULL,
        "amount" numeric(10,2) NOT NULL DEFAULT '0',
        "razorpay_order_id" varchar(64) NOT NULL DEFAULT '',
        "razorpay_payment_id" varchar(64) NOT NULL DEFAULT '',
        "status" varchar(12) NOT NULL DEFAULT 'initiated',
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cyp_payments_booking_idx" ON "create_your_party_payments" ("booking_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cyp_payments_order_idx" ON "create_your_party_payments" ("razorpay_order_id")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "create_your_party_commissions" (
        "id" serial PRIMARY KEY NOT NULL,
        "commission_type" varchar(12) NOT NULL DEFAULT 'percentage',
        "value" numeric(10,2) NOT NULL DEFAULT '10',
        "active" boolean NOT NULL DEFAULT true,
        "updated_by" integer,
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "create_your_party_attendees" (
        "id" serial PRIMARY KEY NOT NULL,
        "party_id" integer NOT NULL REFERENCES "create_your_party"("id") ON DELETE CASCADE,
        "booking_id" integer NOT NULL REFERENCES "create_your_party_bookings"("id") ON DELETE CASCADE,
        "user_id" integer NOT NULL,
        "name" varchar(255) NOT NULL DEFAULT '',
        "gender" varchar(20) NOT NULL DEFAULT '',
        "quantity" integer NOT NULL DEFAULT 1,
        "status" varchar(12) NOT NULL DEFAULT 'going',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cyp_attendees_party_idx" ON "create_your_party_attendees" ("party_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cyp_attendees_booking_idx" ON "create_your_party_attendees" ("booking_id")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "create_your_party_messages" (
        "id" serial PRIMARY KEY NOT NULL,
        "party_id" integer NOT NULL REFERENCES "create_your_party"("id") ON DELETE CASCADE,
        "user_id" integer NOT NULL,
        "body" text NOT NULL,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cyp_messages_party_idx" ON "create_your_party_messages" ("party_id")`);
    // Seed the single platform commission config row (10% default) if absent.
    await db.execute(sql`INSERT INTO "create_your_party_commissions" ("commission_type", "value", "active") SELECT 'percentage', 10, true WHERE NOT EXISTS (SELECT 1 FROM "create_your_party_commissions")`);
    // One-time idempotent migration: lift existing solo_groups 'party' rows into
    // the new standalone tables. The guard (slug marker 'sg-<id>') makes reboots
    // safe — already-migrated rows are skipped.
    await db.execute(sql`
      INSERT INTO "create_your_party"
        ("organizer_user_id", "name", "slug", "cover_image_url", "description", "category",
         "visibility", "venue_name", "address", "city", "state", "pin_code", "map_location",
         "party_date", "start_time", "end_time", "join_type", "organizer_name", "capacity",
         "status", "created_by", "created_at")
      SELECT sg."admin_user_id", sg."name", 'sg-' || sg."id", sg."cover_image_url", sg."description", 'party',
             sg."visibility", sg."venue_name", sg."address", sg."city", sg."state", sg."pin_code", sg."map_location",
             sg."group_date", sg."start_time", sg."end_time",
             CASE sg."gender_type" WHEN 'male' THEN 'male_only' WHEN 'female' THEN 'female_only' ELSE 'mixed' END,
             sg."organizer_name", COALESCE(sg."capacity", 0),
             'published', sg."admin_user_id", sg."created_at"
      FROM "solo_groups" sg
      WHERE sg."activity_type" = 'party'
        AND sg."deleted_at" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "create_your_party" cyp WHERE cyp."slug" = 'sg-' || sg."id")`);
    // Create the matching ticket row for each freshly-migrated party.
    await db.execute(sql`
      INSERT INTO "create_your_party_tickets" ("party_id", "type", "name", "price", "quantity")
      SELECT cyp."id",
             CASE WHEN sg."ticket_type" = 'paid' THEN 'paid' ELSE 'free' END,
             'Entry', COALESCE(sg."ticket_price", 0), COALESCE(sg."capacity", 0)
      FROM "create_your_party" cyp
      JOIN "solo_groups" sg ON cyp."slug" = 'sg-' || sg."id"
      WHERE cyp."category" = 'party'
        AND NOT EXISTS (SELECT 1 FROM "create_your_party_tickets" t WHERE t."party_id" = cyp."id")`);

    await db.execute(sql`ALTER TABLE "drink_plans" ADD COLUMN IF NOT EXISTS "global_priority" integer`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "drink_plans_global_priority_idx" ON "drink_plans" ("global_priority")`);
    await db.execute(sql`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "base_fee_percent" numeric(5,2) DEFAULT 3.50`);
    await db.execute(sql`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "base_fee_enabled" boolean DEFAULT true`);
    // ── Admin-owned venue lifecycle (create unassigned → assign to partner) ──
    // Admin can create & launch venues with no partner. Such rows use the
    // sentinel owner user_id = 0 and assignment_status = 'unassigned'. Existing
    // rows all have real owners, so the new column defaults to 'assigned'.
    // The unique index becomes partial (WHERE user_id <> 0) so multiple
    // unassigned venues can share id 0 while real partners stay 1:1.
    // Idempotent; mirrors lib/db/src/schema/index.ts.
    await db.execute(sql`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "assignment_status" varchar(20) NOT NULL DEFAULT 'assigned'`);
    await db.execute(sql`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "assigned_at" timestamp with time zone`);
    await db.execute(sql`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "assigned_by_admin_id" integer`);
    await db.execute(sql`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "created_by_admin_id" integer`);
    await db.execute(sql`DROP INDEX IF EXISTS "vendors_user_idx"`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "vendors_user_assigned_idx" ON "vendors" ("user_id") WHERE "user_id" <> 0`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "venue_assignment_log" (
        "id" serial PRIMARY KEY NOT NULL,
        "vendor_id" integer NOT NULL,
        "action" varchar(20) NOT NULL,
        "actor_admin_id" integer,
        "partner_user_id" integer,
        "partner_email" varchar(255) NOT NULL DEFAULT '',
        "previous_user_id" integer,
        "note" text NOT NULL DEFAULT '',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "venue_assignment_log_vendor_idx" ON "venue_assignment_log" ("vendor_id")`);
    await db.execute(sql`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "base_fee" integer DEFAULT 0`);
    await db.execute(sql`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "hidden" boolean NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "capacity" integer`);
    await db.execute(sql`ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "site_settings" (
        "key" varchar(100) PRIMARY KEY NOT NULL,
        "value" text NOT NULL DEFAULT '',
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "announcement_id" integer`);
    await db.execute(sql`ALTER TABLE "vendor_commissions" ADD COLUMN IF NOT EXISTS "event_rate" numeric(8,2) NOT NULL DEFAULT '0'`);
    await db.execute(sql`ALTER TABLE "vendor_commissions" ADD COLUMN IF NOT EXISTS "event_commission_enabled" boolean NOT NULL DEFAULT true`);
    await db.execute(sql`ALTER TABLE "vendor_commissions" ADD COLUMN IF NOT EXISTS "cover_charge_rate" numeric(8,2) NOT NULL DEFAULT '0'`);
    await db.execute(sql`ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "price" numeric(10,2) NOT NULL DEFAULT '0'`);
    await db.execute(sql`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "event_commission_pct" numeric(5,2)`);
    // ── Food & Drink discount offers (vendor_offers) ───────────────────────
    // Venue-pushed promotions shown on the customer booking page. Idempotent so
    // a fresh deploy can ship the partner Coupons-tab UI without a separate
    // drizzle-kit push step.
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
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "vendor_offers_vendor_idx" ON "vendor_offers" ("vendor_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "vendor_offers_vendor_active_idx" ON "vendor_offers" ("vendor_id", "active")`);
    // ── Hot-path event listing indexes ────────────────────────────────────
    // The public catalog endpoints (/events, /events/popular, /events/featured)
    // all filter on approval_status + (type|popular|featured) and ORDER BY
    // created_at DESC. Without these composite indexes Postgres falls back to a
    // sequential scan + sort on every listing request. Idempotent and purely
    // additive — query results are unchanged, only faster.
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "events_approval_popular_created_idx" ON "events" ("approval_status", "popular", "created_at" DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "events_approval_featured_created_idx" ON "events" ("approval_status", "featured", "created_at" DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "events_approval_type_created_idx" ON "events" ("approval_status", "type", "created_at" DESC)`);
    // ── events.approved_at ────────────────────────────────────────────────
    // Set when an admin flips approvalStatus to "approved"; powers the
    // storefront "New" badge (auto-hides 15 days later). The events route now
    // selects this column via Drizzle's `.select()`, so it MUST exist or every
    // events query (pubs catalog, admin panel, partner dashboard) fails with
    // `column "approved_at" does not exist`. Idempotent; backfill uses
    // created_at as the approval proxy for historical approved rows.
    await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone`);
    await db.execute(sql`UPDATE "events" SET "approved_at" = "created_at" WHERE "approval_status" = 'approved' AND "approved_at" IS NULL`);
    // ── points_ledger (migration 0039) ────────────────────────────────────
    // Loyalty-points ledger. Inserted on EVERY booking, so if the table is
    // missing in prod the points award throws on each booking. Idempotent.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "points_ledger" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "points" integer NOT NULL,
        "source" varchar(30) NOT NULL,
        "booking_id" integer,
        "expires_at" timestamp with time zone,
        "notified_day_20" boolean NOT NULL DEFAULT false,
        "notified_day_23" boolean NOT NULL DEFAULT false,
        "notified_day_26" boolean NOT NULL DEFAULT false,
        "notified_day_29" boolean NOT NULL DEFAULT false,
        "expired" boolean NOT NULL DEFAULT false,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "points_ledger_user_idx" ON "points_ledger" ("user_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "points_ledger_expires_idx" ON "points_ledger" ("expires_at")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "points_ledger_expired_idx" ON "points_ledger" ("expired")`);
    // ── vendor_coupons (migration 0038) ────────────────────────────────────
    // Vendor public discount codes, applied during booking. Idempotent.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "vendor_coupons" (
        "id" serial PRIMARY KEY NOT NULL,
        "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
        "code" varchar(10) NOT NULL,
        "discount_type" varchar(10) NOT NULL DEFAULT 'percent',
        "discount_value" numeric(10,2) NOT NULL DEFAULT '10',
        "applicable_to" varchar(20) NOT NULL DEFAULT 'both',
        "active" boolean NOT NULL DEFAULT true,
        "max_uses" integer,
        "used_count" integer NOT NULL DEFAULT 0,
        "expires_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "vendor_coupons_code_idx" ON "vendor_coupons" ("code")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "vendor_coupons_vendor_idx" ON "vendor_coupons" ("vendor_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "vendor_coupons_active_idx" ON "vendor_coupons" ("active")`);
    // ── events free-entry-for-table columns (migrations 0034 / 0035) ───────
    await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "free_entry_for_table" boolean NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "free_entry_for_table_days" jsonb`);
    await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "free_entry_for_table_before_time" text`);
    // ── drink_plans.image_url ──────────────────────────────────────────────
    await db.execute(sql`ALTER TABLE "drink_plans" ADD COLUMN IF NOT EXISTS "image_url" text`);
    await db.execute(sql`ALTER TABLE "drink_plans" ADD COLUMN IF NOT EXISTS "people_per_package" integer`);
    // ── announcements approval workflow ────────────────────────────────────
    await db.execute(sql`ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "approval_status" varchar(20) NOT NULL DEFAULT 'pending'`);
    await db.execute(sql`ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "rejection_reason" text NOT NULL DEFAULT ''`);
    // Approve all existing announcements so they stay visible after deploy
    await db.execute(sql`UPDATE "announcements" SET "approval_status" = 'approved' WHERE "approval_status" = 'pending'`);
    // ── Event Organizer vertical (separate from vendors/events) ─────────────
    // Idempotent so a fresh deploy ships the whole organizer ecosystem without
    // a drizzle-kit step. Mirrors lib/db/src/schema/index.ts.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "organizers" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "name" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL DEFAULT '',
        "description" text NOT NULL DEFAULT '',
        "logo_url" text NOT NULL DEFAULT '',
        "cover_image_url" text NOT NULL DEFAULT '',
        "website" varchar(255) NOT NULL DEFAULT '',
        "instagram" varchar(255) NOT NULL DEFAULT '',
        "facebook" varchar(255) NOT NULL DEFAULT '',
        "youtube" varchar(255) NOT NULL DEFAULT '',
        "support_email" varchar(255) NOT NULL DEFAULT '',
        "support_phone" varchar(50) NOT NULL DEFAULT '',
        "city" varchar(100) NOT NULL DEFAULT '',
        "state" varchar(100) NOT NULL DEFAULT '',
        "verified" boolean NOT NULL DEFAULT false,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "approved_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "organizers_user_idx" ON "organizers" ("user_id")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "organizers_slug_idx" ON "organizers" ("slug")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "organizers_status_idx" ON "organizers" ("status")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "organizer_events" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizer_id" integer NOT NULL,
        "title" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL DEFAULT '',
        "category" varchar(100) NOT NULL DEFAULT '',
        "subcategory" varchar(100) NOT NULL DEFAULT '',
        "short_description" varchar(500) NOT NULL DEFAULT '',
        "description" text NOT NULL DEFAULT '',
        "tags" text[] NOT NULL DEFAULT '{}'::text[],
        "language" varchar(100) NOT NULL DEFAULT '',
        "age_restriction" varchar(50) NOT NULL DEFAULT '',
        "cover_image_url" text NOT NULL DEFAULT '',
        "banner_url" text NOT NULL DEFAULT '',
        "mobile_banner_url" text NOT NULL DEFAULT '',
        "gallery_images" text[] NOT NULL DEFAULT '{}'::text[],
        "promo_videos" text[] NOT NULL DEFAULT '{}'::text[],
        "venue_name" varchar(255) NOT NULL DEFAULT '',
        "address" text NOT NULL DEFAULT '',
        "maps_url" text NOT NULL DEFAULT '',
        "capacity" integer NOT NULL DEFAULT 0,
        "city" varchar(100) NOT NULL DEFAULT '',
        "state" varchar(100) NOT NULL DEFAULT '',
        "start_date" date,
        "end_date" date,
        "start_time" varchar(8) NOT NULL DEFAULT '',
        "end_time" varchar(8) NOT NULL DEFAULT '',
        "is_multi_day" boolean NOT NULL DEFAULT false,
        "artists" jsonb,
        "highlights" jsonb,
        "schedule" jsonb,
        "policies" jsonb,
        "faqs" jsonb,
        "approval_status" varchar(20) NOT NULL DEFAULT 'pending',
        "rejection_reason" text NOT NULL DEFAULT '',
        "approved_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "organizer_events_organizer_idx" ON "organizer_events" ("organizer_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "organizer_events_approval_idx" ON "organizer_events" ("approval_status")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "organizer_events_slug_idx" ON "organizer_events" ("slug")`);
    await db.execute(sql`ALTER TABLE "organizer_events" ADD COLUMN IF NOT EXISTS "is_featured_slider" boolean NOT NULL DEFAULT false`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "event_tickets" (
        "id" serial PRIMARY KEY NOT NULL,
        "event_id" integer NOT NULL REFERENCES "organizer_events"("id") ON DELETE CASCADE,
        "type" varchar(20) NOT NULL DEFAULT 'paid',
        "name" varchar(120) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "price" numeric(10,2) NOT NULL DEFAULT '0',
        "quantity" integer NOT NULL DEFAULT 0,
        "sold_count" integer NOT NULL DEFAULT 0,
        "booking_limit" integer NOT NULL DEFAULT 0,
        "sales_start_at" timestamp with time zone,
        "sales_end_at" timestamp with time zone,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "event_tickets_event_idx" ON "event_tickets" ("event_id")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "organizer_reviews" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizer_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "rating" integer NOT NULL,
        "comment" text NOT NULL DEFAULT '',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "organizer_reviews_organizer_idx" ON "organizer_reviews" ("organizer_id")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "organizer_reviews_user_organizer_uniq" ON "organizer_reviews" ("user_id", "organizer_id")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "organizer_ticket_orders" (
        "id" serial PRIMARY KEY NOT NULL,
        "event_id" integer NOT NULL REFERENCES "organizer_events"("id") ON DELETE CASCADE,
        "ticket_id" integer NOT NULL REFERENCES "event_tickets"("id") ON DELETE CASCADE,
        "booking_code" varchar(16) NOT NULL,
        "name" varchar(255) NOT NULL DEFAULT '',
        "email" varchar(255) NOT NULL DEFAULT '',
        "phone" varchar(50) NOT NULL DEFAULT '',
        "quantity" integer NOT NULL DEFAULT 1,
        "total_price" numeric(10,2) NOT NULL DEFAULT '0',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "organizer_ticket_orders_event_idx" ON "organizer_ticket_orders" ("event_id")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "organizer_ticket_orders_code_idx" ON "organizer_ticket_orders" ("booking_code")`);
    // ── Phase 2A: polymorphic bookings + organizer ticketing wallet ─────────
    // Organizer ticket bookings reuse the SAME bookings table via a `kind`
    // discriminator; vendor_id/event_id become nullable so organizer rows omit
    // them. Idempotent and backward-compatible (existing rows default to 'pub').
    await db.execute(sql`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "kind" varchar(12) NOT NULL DEFAULT 'pub'`);
    await db.execute(sql`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "organizer_id" integer`);
    await db.execute(sql`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "organizer_event_id" integer`);
    await db.execute(sql`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "event_ticket_id" integer`);
    await db.execute(sql`ALTER TABLE "bookings" ALTER COLUMN "event_id" DROP NOT NULL`);
    await db.execute(sql`ALTER TABLE "bookings" ALTER COLUMN "vendor_id" DROP NOT NULL`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "bookings_organizer_idx" ON "bookings" ("organizer_id")`);
    // Organizer QR signing material + settlement wallet.
    await db.execute(sql`ALTER TABLE "organizers" ADD COLUMN IF NOT EXISTS "ticket_prefix" varchar(8) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "organizers" ADD COLUMN IF NOT EXISTS "ticket_salt" varchar(32) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "organizers" ADD COLUMN IF NOT EXISTS "online_balance" numeric(14,2) NOT NULL DEFAULT '0'`);
    await db.execute(sql`ALTER TABLE "organizers" ADD COLUMN IF NOT EXISTS "commission_owed" numeric(14,2) NOT NULL DEFAULT '0'`);
    // Per-event commission + gateway fee (Phase C admin-set).
    await db.execute(sql`ALTER TABLE "organizer_events" ADD COLUMN IF NOT EXISTS "commission_pct" numeric(5,2) NOT NULL DEFAULT '8'`);
    await db.execute(sql`ALTER TABLE "organizer_events" ADD COLUMN IF NOT EXISTS "gateway_fee_percent" numeric(5,2) NOT NULL DEFAULT '2'`);
    // ── Phase 2B: Event Managers (mirror vendor_managers) ───────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "organizer_managers" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizer_id" integer NOT NULL,
        "invited_email" varchar(255) NOT NULL,
        "invited_by" integer NOT NULL,
        "manager_id" integer,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "permissions" jsonb,
        "token" varchar(64) NOT NULL DEFAULT '',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "organizer_managers_organizer_idx" ON "organizer_managers" ("organizer_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "organizer_managers_manager_idx" ON "organizer_managers" ("manager_id")`);
    // ── Phase 2C: organizer commission / banking / settlements ──────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "organizer_commission_ledger" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizer_id" integer NOT NULL,
        "organizer_event_id" integer,
        "booking_id" integer REFERENCES "bookings"("id") ON DELETE SET NULL,
        "revenue" numeric(12,2) NOT NULL DEFAULT '0',
        "commission" numeric(12,2) NOT NULL DEFAULT '0',
        "gateway_fee" numeric(12,2) NOT NULL DEFAULT '0',
        "net" numeric(12,2) NOT NULL DEFAULT '0',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "ocl_organizer_idx" ON "organizer_commission_ledger" ("organizer_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "ocl_event_idx" ON "organizer_commission_ledger" ("organizer_event_id")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "ocl_booking_uniq" ON "organizer_commission_ledger" ("booking_id")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "organizer_banking_details" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizer_id" integer NOT NULL,
        "account_holder_name" varchar(255) NOT NULL DEFAULT '',
        "bank_name" varchar(255) NOT NULL DEFAULT '',
        "account_number" varchar(50) NOT NULL DEFAULT '',
        "ifsc_code" varchar(20) NOT NULL DEFAULT '',
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "obd_organizer_idx" ON "organizer_banking_details" ("organizer_id")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "organizer_settlements" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizer_id" integer NOT NULL,
        "amount" numeric(12,2) NOT NULL DEFAULT '0',
        "status" varchar(20) NOT NULL DEFAULT 'settled',
        "admin_note" text NOT NULL DEFAULT '',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "osr_organizer_idx" ON "organizer_settlements" ("organizer_id")`);
    // ── Phase 2D: organizer coupons + promote (ad) requests ─────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "organizer_coupons" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizer_id" integer NOT NULL,
        "event_id" integer,
        "code" varchar(24) NOT NULL,
        "discount_type" varchar(10) NOT NULL DEFAULT 'percent',
        "discount_value" numeric(10,2) NOT NULL DEFAULT '0',
        "active" boolean NOT NULL DEFAULT true,
        "max_uses" integer,
        "used_count" integer NOT NULL DEFAULT 0,
        "expires_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "ocp_organizer_idx" ON "organizer_coupons" ("organizer_id")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "ocp_org_code_uniq" ON "organizer_coupons" ("organizer_id", "code")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "organizer_ad_requests" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizer_id" integer NOT NULL,
        "organizer_event_id" integer NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "note" text NOT NULL DEFAULT '',
        "admin_note" text NOT NULL DEFAULT '',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "oar_organizer_idx" ON "organizer_ad_requests" ("organizer_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "oar_status_idx" ON "organizer_ad_requests" ("status")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "organizer_profile_views" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizer_id" integer NOT NULL,
        "viewer_user_id" integer,
        "viewer_name" varchar(255) NOT NULL DEFAULT '',
        "viewer_email" varchar(255) NOT NULL DEFAULT '',
        "viewed_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "opv_organizer_idx" ON "organizer_profile_views" ("organizer_id")`);

    // ── Game Organizer vertical (separate from organizers/vendors) ──────────
    // Idempotent so a fresh deploy ships the whole game-organizer ecosystem with
    // no drizzle-kit step. Mirrors lib/db/src/schema/index.ts (game_* tables).
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "game_organizers" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "name" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL DEFAULT '',
        "description" text NOT NULL DEFAULT '',
        "logo_url" text NOT NULL DEFAULT '',
        "cover_image_url" text NOT NULL DEFAULT '',
        "gallery_images" text[] NOT NULL DEFAULT '{}'::text[],
        "website" varchar(255) NOT NULL DEFAULT '',
        "instagram" varchar(255) NOT NULL DEFAULT '',
        "facebook" varchar(255) NOT NULL DEFAULT '',
        "youtube" varchar(255) NOT NULL DEFAULT '',
        "support_email" varchar(255) NOT NULL DEFAULT '',
        "support_phone" varchar(50) NOT NULL DEFAULT '',
        "address" text NOT NULL DEFAULT '',
        "maps_url" text NOT NULL DEFAULT '',
        "city" varchar(100) NOT NULL DEFAULT '',
        "state" varchar(100) NOT NULL DEFAULT '',
        "verified" boolean NOT NULL DEFAULT false,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "ticket_prefix" varchar(8) NOT NULL DEFAULT '',
        "ticket_salt" varchar(32) NOT NULL DEFAULT '',
        "online_balance" numeric(14,2) NOT NULL DEFAULT '0',
        "commission_owed" numeric(14,2) NOT NULL DEFAULT '0',
        "approved_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "game_organizers_user_idx" ON "game_organizers" ("user_id")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "game_organizers_slug_idx" ON "game_organizers" ("slug")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "game_organizers_status_idx" ON "game_organizers" ("status")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "games" (
        "id" serial PRIMARY KEY NOT NULL,
        "game_organizer_id" integer NOT NULL,
        "name" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL DEFAULT '',
        "category" varchar(100) NOT NULL DEFAULT '',
        "description" text NOT NULL DEFAULT '',
        "rules" text NOT NULL DEFAULT '',
        "cover_image_url" text NOT NULL DEFAULT '',
        "images" text[] NOT NULL DEFAULT '{}'::text[],
        "videos" text[] NOT NULL DEFAULT '{}'::text[],
        "capacity" integer NOT NULL DEFAULT 0,
        "age_restriction" varchar(50) NOT NULL DEFAULT '',
        "pricing_model" varchar(12) NOT NULL DEFAULT 'fixed',
        "price" numeric(10,2) NOT NULL DEFAULT '0',
        "hourly_rate" numeric(10,2) NOT NULL DEFAULT '0',
        "min_hours" integer NOT NULL DEFAULT 1,
        "max_hours" integer NOT NULL DEFAULT 0,
        "commission_pct" numeric(5,2) NOT NULL DEFAULT '8',
        "gateway_fee_percent" numeric(5,2) NOT NULL DEFAULT '2',
        "active" boolean NOT NULL DEFAULT true,
        "approval_status" varchar(20) NOT NULL DEFAULT 'pending',
        "rejection_reason" text NOT NULL DEFAULT '',
        "is_featured_slider" boolean NOT NULL DEFAULT false,
        "sold_count" integer NOT NULL DEFAULT 0,
        "approved_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "games_game_organizer_idx" ON "games" ("game_organizer_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "games_approval_idx" ON "games" ("approval_status")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "games_slug_idx" ON "games" ("slug")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "game_packages" (
        "id" serial PRIMARY KEY NOT NULL,
        "game_organizer_id" integer NOT NULL,
        "name" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL DEFAULT '',
        "description" text NOT NULL DEFAULT '',
        "cover_image_url" text NOT NULL DEFAULT '',
        "images" text[] NOT NULL DEFAULT '{}'::text[],
        "price" numeric(10,2) NOT NULL DEFAULT '0',
        "items" jsonb,
        "addons" jsonb,
        "group_size" integer NOT NULL DEFAULT 0,
        "capacity" integer NOT NULL DEFAULT 0,
        "age_restriction" varchar(50) NOT NULL DEFAULT '',
        "commission_pct" numeric(5,2) NOT NULL DEFAULT '10',
        "gateway_fee_percent" numeric(5,2) NOT NULL DEFAULT '2',
        "active" boolean NOT NULL DEFAULT true,
        "approval_status" varchar(20) NOT NULL DEFAULT 'pending',
        "rejection_reason" text NOT NULL DEFAULT '',
        "sold_count" integer NOT NULL DEFAULT 0,
        "approved_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "game_packages_game_organizer_idx" ON "game_packages" ("game_organizer_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "game_packages_approval_idx" ON "game_packages" ("approval_status")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "game_packages_slug_idx" ON "game_packages" ("slug")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "game_reviews" (
        "id" serial PRIMARY KEY NOT NULL,
        "game_organizer_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "rating" integer NOT NULL,
        "comment" text NOT NULL DEFAULT '',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "game_reviews_game_organizer_idx" ON "game_reviews" ("game_organizer_id")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "game_reviews_user_organizer_uniq" ON "game_reviews" ("user_id", "game_organizer_id")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "game_managers" (
        "id" serial PRIMARY KEY NOT NULL,
        "game_organizer_id" integer NOT NULL,
        "invited_email" varchar(255) NOT NULL,
        "invited_by" integer NOT NULL,
        "manager_id" integer,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "permissions" jsonb,
        "token" varchar(64) NOT NULL DEFAULT '',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "game_managers_game_organizer_idx" ON "game_managers" ("game_organizer_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "game_managers_manager_idx" ON "game_managers" ("manager_id")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "game_commission_ledger" (
        "id" serial PRIMARY KEY NOT NULL,
        "game_organizer_id" integer NOT NULL,
        "game_id" integer,
        "game_package_id" integer,
        "booking_id" integer REFERENCES "bookings"("id") ON DELETE SET NULL,
        "revenue" numeric(12,2) NOT NULL DEFAULT '0',
        "commission" numeric(12,2) NOT NULL DEFAULT '0',
        "gateway_fee" numeric(12,2) NOT NULL DEFAULT '0',
        "net" numeric(12,2) NOT NULL DEFAULT '0',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "gcl_game_organizer_idx" ON "game_commission_ledger" ("game_organizer_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "gcl_game_idx" ON "game_commission_ledger" ("game_id")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "gcl_booking_uniq" ON "game_commission_ledger" ("booking_id")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "game_banking_details" (
        "id" serial PRIMARY KEY NOT NULL,
        "game_organizer_id" integer NOT NULL,
        "account_holder_name" varchar(255) NOT NULL DEFAULT '',
        "bank_name" varchar(255) NOT NULL DEFAULT '',
        "account_number" varchar(50) NOT NULL DEFAULT '',
        "ifsc_code" varchar(20) NOT NULL DEFAULT '',
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "gbd_game_organizer_idx" ON "game_banking_details" ("game_organizer_id")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "game_settlements" (
        "id" serial PRIMARY KEY NOT NULL,
        "game_organizer_id" integer NOT NULL,
        "amount" numeric(12,2) NOT NULL DEFAULT '0',
        "status" varchar(20) NOT NULL DEFAULT 'settled',
        "admin_note" text NOT NULL DEFAULT '',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "gsr_game_organizer_idx" ON "game_settlements" ("game_organizer_id")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "game_coupons" (
        "id" serial PRIMARY KEY NOT NULL,
        "game_organizer_id" integer NOT NULL,
        "game_id" integer,
        "code" varchar(24) NOT NULL,
        "discount_type" varchar(10) NOT NULL DEFAULT 'percent',
        "discount_value" numeric(10,2) NOT NULL DEFAULT '0',
        "active" boolean NOT NULL DEFAULT true,
        "max_uses" integer,
        "used_count" integer NOT NULL DEFAULT 0,
        "expires_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "gcp_game_organizer_idx" ON "game_coupons" ("game_organizer_id")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "gcp_org_code_uniq" ON "game_coupons" ("game_organizer_id", "code")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "game_ad_requests" (
        "id" serial PRIMARY KEY NOT NULL,
        "game_organizer_id" integer NOT NULL,
        "game_id" integer NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "note" text NOT NULL DEFAULT '',
        "admin_note" text NOT NULL DEFAULT '',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "gar_game_organizer_idx" ON "game_ad_requests" ("game_organizer_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "gar_status_idx" ON "game_ad_requests" ("status")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "game_profile_views" (
        "id" serial PRIMARY KEY NOT NULL,
        "game_organizer_id" integer NOT NULL,
        "viewer_user_id" integer,
        "viewer_name" varchar(255) NOT NULL DEFAULT '',
        "viewer_email" varchar(255) NOT NULL DEFAULT '',
        "viewed_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "gpv_game_organizer_idx" ON "game_profile_views" ("game_organizer_id")`);
    // Game bookings reuse the shared bookings table via kind='game'.
    await db.execute(sql`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "game_organizer_id" integer`);
    await db.execute(sql`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "game_id" integer`);
    await db.execute(sql`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "game_package_id" integer`);
    await db.execute(sql`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "duration_hours" numeric(5,1)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "bookings_game_organizer_idx" ON "bookings" ("game_organizer_id")`);

    // ── Happening Tonight — real-time discovery fields on the three partner
    // listing tables. start/end time = the listing's tonight session window
    // ("HH:MM", IST). happening_tonight/starting_soon default true so existing
    // listings appear immediately; time-window logic decides the bucket.
    for (const tbl of ["events", "organizer_events", "games"] as const) {
      await db.execute(sql.raw(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS "happening_tonight" boolean NOT NULL DEFAULT true`));
      await db.execute(sql.raw(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS "starting_soon" boolean NOT NULL DEFAULT true`));
      await db.execute(sql.raw(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS "last_minute_deal" boolean NOT NULL DEFAULT false`));
      await db.execute(sql.raw(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS "deal_label" varchar(120) NOT NULL DEFAULT ''`));
    }
    // organizer_events already has start_time/end_time; events & games need them.
    await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "start_time" varchar(8) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "end_time" varchar(8) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "start_time" varchar(8) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "end_time" varchar(8) NOT NULL DEFAULT ''`);

    // ── Going Out With Friends — group-capacity controls on the three listing
    // tables. maxGroupSize/groupBookingEnabled/groupOffer are shared; events
    // (pubs/clubs) additionally get table_count/table_size/vip_capacity. All
    // default-permissive so existing listings stay group-bookable. Live
    // available capacity is computed at query time (capacity − today's guests).
    for (const tbl of ["events", "organizer_events", "games"] as const) {
      await db.execute(sql.raw(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS "max_group_size" integer NOT NULL DEFAULT 0`));
      await db.execute(sql.raw(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS "group_booking_enabled" boolean NOT NULL DEFAULT true`));
      await db.execute(sql.raw(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS "group_offer" varchar(160) NOT NULL DEFAULT ''`));
    }
    await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "table_count" integer NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "table_size" integer NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "vip_capacity" integer NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "date_night" boolean NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "disabled_genders" text[] NOT NULL DEFAULT '{}'`);
    await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "hidden" boolean NOT NULL DEFAULT false`);

    // ── Razorpay payment gateway columns ──────────────────────────────────
    await db.execute(sql`ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "razorpay_order_id" varchar(100) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "razorpay_payment_id" varchar(100) NOT NULL DEFAULT ''`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "payments_razorpay_order_idx" ON "payments" ("razorpay_order_id") WHERE "razorpay_order_id" <> ''`);

    logger.info("Schema: drink_plans.global_priority + vendors.base_fee + bookings.base_fee + event_booking + vendor_offers + event listing indexes + events.approved_at + points_ledger + vendor_coupons + events.free_entry_for_table + drink_plans.image_url + announcements.approval_status + razorpay columns + events.disabled_genders + events.hidden ensured");
  } catch (err) {
    logger.error({ err }, "Schema migration warning");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    ensureAdminAccount()
    .then(() => applyPendingSchemaChanges())
    .then(() => auditPasswordHashes())
    .then(() => backfillVendorTicketPrefixes())
    .then(() => backfillOrganizerTicketPrefixes())
    .then(() => auditVendorManagerOverlap())
    .then(() => removeLegacyDemoVendor())
    .then(() => ensureEmailSchema())
    .then(() => runInboundSync())
    .catch((err) => logger.error({ err }, "Startup admin/audit chain failed"));
  runCleanup();

  cron.schedule("0 2 * * *", () => {
    logger.info("Running daily cleanup job");
    runCleanup();
  });

  // Solo Connect — wipe ALL temporary group chat messages daily at 03:00 IST
  // for privacy/safety (users are warned in-app).
  cron.schedule("0 3 * * *", () => {
    logger.info("Running Solo Connect chat purge (3 AM IST)");
    db.execute(sql`DELETE FROM "solo_group_messages"`).catch((err) =>
      logger.error({ err }, "Solo Connect chat purge failed"),
    );
  });

  // Solo Connector — inactivity lifecycle at 03:30 IST: warn (3 days out),
  // soft-delete at 15 days, hard-purge after the restore grace window.
  cron.schedule(
    "30 3 * * *",
    () => {
      logger.info("Running Solo Connector group-expiry job (3:30 AM IST)");
      runSoloGroupExpiry().catch((err) =>
        logger.error({ err }, "Solo Connector group-expiry job failed"),
      );
    },
    { timezone: "Asia/Kolkata" },
  );

  // Auto-checkout — 3:50 AM IST: force-checkout guests still marked inside from the previous day.
  cron.schedule("50 3 * * *", () => {
    autoCheckoutStaleBookings().catch((err) =>
      logger.error({ err }, "Auto-checkout job failed"),
    );
  }, { timezone: "Asia/Kolkata" });

  // Reminder 1: 10:00 AM IST — morning reminder for all today's bookings
  cron.schedule("0 10 * * *", () => {
    logger.info("Running morning booking reminder job (10 AM IST)");
    runMorningReminders().catch((err) =>
      logger.error({ err }, "Morning reminder job failed"),
    );
  }, { timezone: "Asia/Kolkata" });

  // Reminder 2: every 5 min — fires exactly once per booking when now ≈ arrivalTime − 2 h
  cron.schedule("*/5 * * * *", () => {
    runPreArrivalReminders().catch((err) =>
      logger.error({ err }, "Pre-arrival reminder job failed"),
    );
  }, { timezone: "Asia/Kolkata" });

  // Points expiry — runs at 11:00 AM IST daily.
  // Expires stale ledger entries and sends reminder notifications.
  cron.schedule("0 11 * * *", () => {
    logger.info("Running points expiry job (11 AM IST)");
    runPointsExpiry().catch((err) =>
      logger.error({ err }, "Points expiry job failed"),
    );
  }, { timezone: "Asia/Kolkata" });

  // Expo push receipt poll — runs every 6 hours to detect delayed delivery failures
  // (e.g. APNs rejection) and clear stale device tokens.
  cron.schedule("0 */6 * * *", () => {
    logger.info("Running Expo push receipt-poll job");
    runExpoPushReceiptPoll().catch((err) =>
      logger.error({ err }, "Expo push receipt-poll job failed"),
    );
  });

  // Happening Tonight — evening digest at 17:00 IST: "N experiences tonight".
  cron.schedule("0 17 * * *", () => {
    logger.info("Running Happening Tonight digest job (5 PM IST)");
    runTonightDigest().catch((err) =>
      logger.error({ err }, "Tonight digest job failed"),
    );
  }, { timezone: "Asia/Kolkata" });

  // Happening Tonight — "starting soon" wishlist reminders, every 5 min (fires
  // once per event ~90 min before its tonight start time).
  cron.schedule("*/5 * * * *", () => {
    runStartingSoonReminders().catch((err) =>
      logger.error({ err }, "Tonight starting-soon reminder job failed"),
    );
  }, { timezone: "Asia/Kolkata" });

});

// ── Graceful shutdown ───────────────────────────────────────────────────────
// Railway sends SIGTERM to the old container during every deploy. Without an
// explicit handler the process is kept alive by the open HTTP server + the
// cron timers above, so SIGTERM is ignored, Railway waits out its stop-timeout
// and then SIGKILLs us (exit 137) — which the dashboard reports as a momentary
// "Crashed" on each deploy. Closing the server lets in-flight requests drain
// and exits 0 (clean) so deploys roll over without the crash flicker.
let shuttingDown = false;
function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Received shutdown signal — closing server gracefully");
  // Stop scheduled jobs so they don't hold the event loop open.
  cron.getTasks().forEach((task) => task.stop());
  const forceExit = setTimeout(() => {
    logger.warn("Graceful shutdown timed out — forcing exit");
    process.exit(0);
  }, 10_000);
  forceExit.unref();
  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error during server close");
      process.exit(1);
    }
    logger.info("Server closed — exiting cleanly");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Keep the server alive on stray background errors ─────────────────────────
// The many cron jobs + startup audit chain + email/push background tasks all run
// detached from any request. On Node ≥15 a single unhandled promise rejection
// (or an uncaught exception thrown off the event loop) terminates the whole
// process — which is why the local API server appeared to "turn off by itself".
// Log these loudly but DO NOT exit, so one failing background task can't take
// the HTTP server down with it.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection — keeping server alive");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — keeping server alive");
});
