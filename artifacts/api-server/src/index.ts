import app from "./app";
import { logger } from "./lib/logger";
import { runCleanup } from "./jobs/cleanup";
import { runMorningReminders, runPreArrivalReminders } from "./jobs/bookingReminders";
import { runExpoPushReceiptPoll } from "./jobs/expoPushReceipts";
import cron from "node-cron";
import { db, usersTable, vendorsTable, eventsTable, wishlistsTable } from "@workspace/db";
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

const ADMIN_EMAIL = "royvento56@gmail.com";
const ADMIN_PASSWORD = "admin123@";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  ensureAdminAccount()
    .then(() => auditPasswordHashes())
    .then(() => backfillVendorTicketPrefixes())
    .then(() => auditVendorManagerOverlap())
    .then(() => removeLegacyDemoVendor())
    .then(() => ensureEmailSchema())
    .catch((err) => logger.error({ err }, "Startup admin/audit chain failed"));
  runCleanup();

  cron.schedule("0 2 * * *", () => {
    logger.info("Running daily cleanup job");
    runCleanup();
  });

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

  // Expo push receipt poll — runs every 6 hours to detect delayed delivery failures
  // (e.g. APNs rejection) and clear stale device tokens.
  cron.schedule("0 */6 * * *", () => {
    logger.info("Running Expo push receipt-poll job");
    runExpoPushReceiptPoll().catch((err) =>
      logger.error({ err }, "Expo push receipt-poll job failed"),
    );
  });

  // Inbound email poll — pulls received emails from Resend every 2 minutes as
  // a reliable fallback to the webhook (which can be misrouted, rejected, or
  // not yet configured). Idempotent: already-stored emails are skipped.
  cron.schedule("*/2 * * * *", () => {
    runInboundSync().catch((err) => logger.error({ err }, "Inbound email sync failed"));
  });
});
