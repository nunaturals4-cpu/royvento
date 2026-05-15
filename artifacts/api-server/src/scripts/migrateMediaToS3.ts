/**
 * Standalone runner for the media migrator. Equivalent to calling
 * POST /admin/migrate-media on a running api-server, but executed from a
 * shell on the deploy (so `/data` is visible).
 *
 * Required env vars (see lib/migrateMedia.ts for the full list).
 *
 * Run inside a Railway container shell:
 *   pnpm -F @workspace/api-server migrate:media
 */

import { migrateMediaToS3 } from "../lib/migrateMedia";

async function main() {
  console.log("Starting media migration…");
  const report = await migrateMediaToS3({
    onProgress: (r) =>
      console.log(`  …${r.processed} processed (uploaded ${r.uploaded}, skipped ${r.skipped}, failed ${r.failed})`),
  });

  console.log(`\nMigrating ${report.localDir} → s3://${report.bucket}/ (endpoint ${report.endpoint})`);
  console.log("Done.");
  console.log(`  Processed:  ${report.processed}`);
  console.log(`  Uploaded:   ${report.uploaded}`);
  console.log(`  Skipped:    ${report.skipped} (already in bucket)`);
  console.log(`  Ignored:    ${report.ignored} (meta sidecars / out-of-tree files)`);
  console.log(`  Failed:     ${report.failed}`);
  if (report.failed > 0) {
    console.log("\nFailures:");
    for (const f of report.failedFiles.slice(0, 25)) console.log(`  - ${f}`);
    if (report.failedFiles.length > 25) console.log(`  …and ${report.failedFiles.length - 25} more`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
