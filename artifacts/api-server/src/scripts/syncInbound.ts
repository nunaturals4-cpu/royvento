/**
 * One-off / cron-able: pull received emails from Resend into the DB.
 *
 *   RESEND_API_KEY=... pnpm --filter @workspace/api-server exec \
 *     tsx --env-file=.env.local src/scripts/syncInbound.ts
 *
 * Uses the same idempotent ingestion the server cron uses, so running it
 * against the production DATABASE_URL safely backfills the inbox.
 */

import { runInboundSync } from "../routes/emails";

async function main() {
  const hasKey = !!process.env["RESEND_API_KEY"];
  const hasDb = !!process.env["DATABASE_URL"];
  console.log("Inbound sync —", { resendKey: hasKey ? "present" : "MISSING", database: hasDb ? "present" : "MISSING" });
  if (!hasKey || !hasDb) {
    console.error("Both RESEND_API_KEY and DATABASE_URL are required.");
    process.exit(1);
  }
  const result = await runInboundSync();
  console.log("Result:", result);
  console.log(result.synced > 0
    ? `\n✅ Imported ${result.synced} new email(s) into the inbox.`
    : `\nℹ️  Found ${result.found} email(s) on Resend, ${result.synced} new (rest already stored).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Inbound sync threw:", err);
  process.exit(1);
});
