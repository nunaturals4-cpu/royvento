import app from "./app";
import { logger } from "./lib/logger";
import { runCleanup } from "./jobs/cleanup";
import { runBookingReminders } from "./jobs/bookingReminders";
import { runExpoPushReceiptPoll } from "./jobs/expoPushReceipts";
import cron from "node-cron";
import { db, usersTable, vendorsTable } from "@workspace/db";
import { eq, or, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { generateUniqueTicketPrefix, generateTicketSalt } from "./lib/ticketCode";

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
    .catch((err) => logger.error({ err }, "Startup admin/audit chain failed"));
  runCleanup();

  cron.schedule("0 2 * * *", () => {
    logger.info("Running daily cleanup job");
    runCleanup();
  });

  // Booking-day reminders — fires at 10 AM and 5 PM IST every day
  cron.schedule("0 10 * * *", () => {
    logger.info("Running morning booking reminder job (10 AM IST)");
    runBookingReminders("morning").catch((err) =>
      logger.error({ err }, "Morning reminder job failed"),
    );
  }, { timezone: "Asia/Kolkata" });

  cron.schedule("0 17 * * *", () => {
    logger.info("Running evening booking reminder job (5 PM IST)");
    runBookingReminders("evening").catch((err) =>
      logger.error({ err }, "Evening reminder job failed"),
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
});
