/**
 * CLI entry for seeding 10 demo pubs. See src/lib/seedDemoPubs.ts for
 * the actual logic — the same function is also exposed via the one-shot
 * admin endpoint POST /api/admin/seed-demo-pubs.
 *
 * Run:  pnpm --filter @workspace/api-server seed:demo-pubs
 *       (or `railway run …` against production, if a public DB URL is
 *       available — internal hostnames will not resolve from local.)
 */
import { logger } from "../lib/logger";
import { seedDemoPubs } from "../lib/seedDemoPubs";

async function main() {
  logger.info("Seeding demo pubs…");
  const report = await seedDemoPubs();
  logger.info(`Done. Seeded ${report.count} demo pubs.`);
  for (const p of report.pubs) {
    logger.info(`  ✓ ${p.title} (vendor #${p.vendorId}, event #${p.eventId ?? "-"})`);
  }
  process.exit(0);
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
