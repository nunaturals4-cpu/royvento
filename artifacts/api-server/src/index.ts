import app from "./app";
import { logger } from "./lib/logger";
import { runCleanup } from "./jobs/cleanup";
import { runBookingReminders } from "./jobs/bookingReminders";
import cron from "node-cron";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

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

  ensureAdminAccount();
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
});
