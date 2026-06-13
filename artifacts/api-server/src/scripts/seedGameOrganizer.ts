/**
 * CLI entry for seeding a fully-detailed demo Game Organizer (venue + games +
 * packages). The actual logic lives in src/lib/seedGameOrganizer.ts — the same
 * function is also run by seedProdShowcase() and the one-shot admin endpoint
 * POST /api/admin/seed-prod-showcase.
 *
 * Run:  pnpm --filter @workspace/api-server exec tsx --env-file=.env.local src/scripts/seedGameOrganizer.ts
 */
import { logger } from "../lib/logger";
import {
  seedGameOrganizer,
  GAME_ORGANIZER_EMAIL,
  GAME_ORGANIZER_PASSWORD,
} from "../lib/seedGameOrganizer";

async function main() {
  const report = await seedGameOrganizer();
  logger.info(report, "Game organizer seeded");
  // eslint-disable-next-line no-console
  console.log(`\n✅ Game Organizer seeded.\n   Login email:    ${GAME_ORGANIZER_EMAIL}\n   Login password: ${GAME_ORGANIZER_PASSWORD}\n   Dashboard:      /dashboard/game-organizer\n   Public page:    /game-organizers/${report.slug}\n`);
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "seedGameOrganizer failed");
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
