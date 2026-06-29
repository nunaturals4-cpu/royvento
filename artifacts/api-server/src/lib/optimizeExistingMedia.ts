/**
 * Re-optimise every already-uploaded image in place, powering the admin
 * "Optimise existing images" button (Ads tab).
 *
 * New uploads are compressed on the way in by `compressImage` (storage route),
 * but images uploaded before that pipeline existed — or via other paths — may
 * still be large. This walks every object under the `uploads/` prefix,
 * re-runs the same resize + sharpen + WebP pipeline, and overwrites the file
 * UNDER THE SAME KEY whenever the result is meaningfully smaller. Because the
 * storage key (the UUID) never changes, every DB row that references the image
 * keeps working without any table migration.
 *
 * Safe / idempotent: a file is only rewritten when the optimised bytes are
 * smaller than what's already stored, so a second run re-encodes but skips the
 * overwrite (already-optimised WebP doesn't shrink further).
 */
import { ObjectStorageService } from "./objectStorage";
import { compressImage } from "./imageCompressor";

export type OptimizeMediaReport = {
  scanned: number;
  optimized: number;
  skipped: number;
  failed: number;
  bytesBefore: number;
  bytesAfter: number;
  bytesSaved: number;
  failures: string[];
};

export type OptimizeMediaOptions = {
  /** Max concurrent files processed. Defaults to 4 (sharp is CPU-heavy). */
  concurrency?: number;
};

const IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/tiff",
]);

export async function optimizeExistingMedia(
  opts: OptimizeMediaOptions = {},
): Promise<OptimizeMediaReport> {
  const storage = new ObjectStorageService();
  const ids = await storage.listUploadKeys();

  const report: OptimizeMediaReport = {
    scanned: ids.length,
    optimized: 0,
    skipped: 0,
    failed: 0,
    bytesBefore: 0,
    bytesAfter: 0,
    bytesSaved: 0,
    failures: [],
  };

  const concurrency = Math.max(1, opts.concurrency ?? 4);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= ids.length) return;
      const uuid = ids[i]!;
      try {
        const file = await storage.getObjectEntityFile(`/objects/uploads/${uuid}`);
        const resp = await storage.downloadObject(file);
        const contentType = resp.headers.get("Content-Type") ?? "";
        const original = Buffer.from(await resp.arrayBuffer());

        // Leave videos / PDFs / anything non-image untouched.
        if (!IMAGE_CONTENT_TYPES.has(contentType.toLowerCase())) {
          report.skipped++;
          continue;
        }

        const { buffer, contentType: outType } = await compressImage(original, contentType);

        // Only overwrite when we actually saved space — never bloat a file that
        // is already well-optimised.
        if (buffer.length < original.length) {
          await storage.uploadBuffer(uuid, buffer, outType);
          report.optimized++;
          report.bytesBefore += original.length;
          report.bytesAfter += buffer.length;
          report.bytesSaved += original.length - buffer.length;
        } else {
          report.skipped++;
        }
      } catch (err) {
        report.failed++;
        report.failures.push(
          `${uuid}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return report;
}
