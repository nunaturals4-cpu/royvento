/**
 * Powers the admin "Optimise existing images" button (Ads tab).
 *
 * Walks every partner-facing image REFERENCE in the database — pub/club venues,
 * events, game venues and event organisers — and makes each one small and crisp:
 *
 *   • Stored objects (`/api/storage/objects/uploads/<uuid>`) are re-enhanced
 *     (resize → richer colour/contrast → sharpen → WebP/AVIF) and written under a
 *     NEW key, with the DB column repointed. A fresh key is used (rather than
 *     overwriting in place) because objects are served `immutable`, so reusing
 *     the URL would leave browsers showing the old, dull cached copy.
 *   • External images (e.g. seeded Unsplash URLs) are downloaded, enhanced,
 *     SELF-HOSTED as a new object, and the DB column is rewritten to point at it.
 *     This is the only way to shrink an off-site image, and it removes the
 *     third-party dependency so the page no longer waits on someone else's CDN.
 *
 * Enhancement is GENTLE and always runs from the pristine original (uploads are
 * stored raw; enhanced copies remember the original's uuid), so repeated runs
 * never stack effects into the grungy/over-sharpened "HDR" look earlier versions
 * produced. Each output is encoded at the highest quality that fits a size budget
 * (≈ original + 1 MB, hard-capped at 5 MB) so pages stay fast.
 *
 * Tagged with ENHANCE_VERSION; a re-run skips anything already at the current
 * version. Legacy images enhanced by an old pipeline (no preserved original)
 * are left as-is — they can only be fixed by re-uploading the source.
 *
 * Each image is isolated in its own try/catch, so one bad URL never aborts the
 * batch.
 */
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import { enhanceImage, ENHANCE_VERSION } from "./imageCompressor";

// Size budget per image: enhancement may grow a file, but never by more than
// ~1 MB over the original, and never past 5 MB — so pages stay fast.
const ONE_MB = 1024 * 1024;
const HARD_MAX_BYTES = 5 * ONE_MB;
const budgetFor = (originalBytes: number) => Math.min(originalBytes + ONE_MB, HARD_MAX_BYTES);

// Matches our own stored objects, whether the column holds a relative path
// (`/api/storage/objects/uploads/<uuid>`) or an absolute prod URL.
const STORED_OBJECT_RE = /\/objects\/uploads\/([0-9a-fA-F-]{36})/;

const IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/tiff",
]);

const MAX_EXTERNAL_BYTES = 25 * 1024 * 1024; // don't pull anything absurd off the network
const FETCH_TIMEOUT_MS = 20_000;
const MAX_EXTERNAL_FETCH_WIDTH = 2560; // request this width from CDNs that support it

type FieldKind = "scalar" | "array";
interface Field {
  table: string;
  col: string;
  kind: FieldKind;
  label: string;
}

// Every partner image column, grouped under the label shown in the report.
const FIELDS: Field[] = [
  // ── Pub / club venues ──
  { table: "vendors", col: "cover_image_url", kind: "scalar", label: "Cover & banner" },
  { table: "vendors", col: "banner_image", kind: "scalar", label: "Cover & banner" },
  { table: "vendors", col: "portfolio_images", kind: "array", label: "Gallery" },
  { table: "vendors", col: "dance_floor_photos", kind: "array", label: "Dance floor" },
  { table: "vendors", col: "menu_url", kind: "scalar", label: "Food menu" },
  { table: "vendors", col: "menu_urls", kind: "array", label: "Food menu" },
  { table: "vendors", col: "bar_menu_urls", kind: "array", label: "Bar menu" },
  { table: "partner_media", col: "url", kind: "scalar", label: "Gallery" },
  { table: "announcements", col: "image_url", kind: "scalar", label: "Announcements" },
  { table: "drink_plans", col: "image_url", kind: "scalar", label: "Offers & menus" },
  { table: "vendor_offers", col: "image_url", kind: "scalar", label: "Offers & menus" },
  // ── Events ──
  { table: "events", col: "image_url", kind: "scalar", label: "Event photos" },
  { table: "events", col: "gallery_images", kind: "array", label: "Event photos" },
  // ── Game venues ──
  { table: "games", col: "cover_image_url", kind: "scalar", label: "Game photos" },
  { table: "games", col: "images", kind: "array", label: "Game photos" },
  { table: "game_organizers", col: "logo_url", kind: "scalar", label: "Game photos" },
  { table: "game_organizers", col: "cover_image_url", kind: "scalar", label: "Game photos" },
  { table: "game_organizers", col: "gallery_images", kind: "array", label: "Game photos" },
  { table: "game_packages", col: "cover_image_url", kind: "scalar", label: "Game photos" },
  // ── Event organisers ──
  { table: "organizers", col: "logo_url", kind: "scalar", label: "Organizer photos" },
  { table: "organizers", col: "cover_image_url", kind: "scalar", label: "Organizer photos" },
  { table: "organizer_events", col: "cover_image_url", kind: "scalar", label: "Organizer photos" },
  { table: "organizer_events", col: "gallery_images", kind: "array", label: "Organizer photos" },
];

export type CategoryStat = { scanned: number; reduced: number; bytesSaved: number };

export type OptimizeMediaReport = {
  scanned: number;
  reoptimised: number; // stored objects re-enhanced under a fresh URL
  rehosted: number; // external images downloaded + self-hosted
  skipped: number; // already at the current look / empty / non-image
  failed: number;
  bytesBefore: number;
  bytesAfter: number;
  bytesSaved: number;
  byCategory: Record<string, CategoryStat>;
  failures: string[];
};

export type OptimizeMediaOptions = {
  /** Max images processed at once. Defaults to 4 (sharp + network are heavy). */
  concurrency?: number;
};

type UrlResult =
  | { status: "unchanged" }
  | { status: "reoptimised"; newUrl: string; before: number; after: number }
  | { status: "rehosted"; newUrl: string; before: number; after: number }
  | { status: "failed"; error: string };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Pull a higher-quality source where the CDN supports it, so the enhanced copy
// starts from more detail rather than an already-shrunk thumbnail. Unsplash
// honours width/quality query params; other hosts are fetched as-is.
function upgradeSourceUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "images.unsplash.com") {
      u.searchParams.set("w", String(MAX_EXTERNAL_FETCH_WIDTH));
      u.searchParams.set("q", "85");
      u.searchParams.set("auto", "format,compress");
      return u.toString();
    }
  } catch {
    /* not a parseable URL — fetch the original string */
  }
  return url;
}

async function processUrl(storage: ObjectStorageService, rawUrl: string): Promise<UrlResult> {
  const url = (rawUrl ?? "").trim();
  if (!url) return { status: "unchanged" };

  // 1) Our own stored object → enhance from the PRISTINE original, never from an
  //    already-enhanced copy (that's what produced the grungy, over-processed
  //    haze before). We resolve the source as:
  //      • version 0  → this object IS the raw original (uploads are stored raw)
  //      • enhanced, with a recorded originalUuid → re-enhance from that original
  //      • enhanced by an old version with NO original (legacy) → skip; it can't
  //        be recovered without re-uploading the source.
  //    The result is written under a NEW key (caller repoints the DB) because
  //    objects are served `immutable`, so reusing the URL would keep the old
  //    cached copy on screen.
  const stored = url.match(STORED_OBJECT_RE);
  if (stored) {
    const uuid = stored[1]!;
    try {
      const info = await storage.getUploadInfo(uuid);
      if (info.enhancedVersion >= ENHANCE_VERSION) return { status: "unchanged" };

      const originalUuid = info.enhancedVersion === 0 ? uuid : info.originalUuid;
      if (!originalUuid) return { status: "unchanged" };

      const file = await storage.getObjectEntityFile(`/objects/uploads/${originalUuid}`);
      const resp = await storage.downloadObject(file);
      const ct = (resp.headers.get("Content-Type") ?? "").toLowerCase();
      const original = Buffer.from(await resp.arrayBuffer());
      // The stored content-type may be missing or wrong (older uploads, migrated
      // objects). Pass it only when it's a known image type; otherwise let sharp
      // detect the format from the bytes. Non-images (e.g. PDF menus) come back
      // `enhanced: false` and are left untouched.
      const srcType = IMAGE_CONTENT_TYPES.has(ct) ? ct : undefined;
      const { buffer, contentType, enhanced } = await enhanceImage(original, srcType, {
        maxBytes: budgetFor(original.length),
      });
      if (!enhanced) return { status: "unchanged" };
      const newUuid = randomUUID();
      await storage.uploadBuffer(newUuid, buffer, contentType, {
        enhancedVersion: ENHANCE_VERSION,
        originalUuid,
      });
      return {
        status: "reoptimised",
        newUrl: `/api/storage/objects/uploads/${newUuid}`,
        before: original.length,
        after: buffer.length,
      };
    } catch (e) {
      return { status: "failed", error: `${uuid}: ${errMsg(e)}` };
    }
  }

  // 2) External http(s) image → download, enhance, self-host, return new URL.
  if (/^https?:\/\//i.test(url)) {
    try {
      const res = await fetch(upgradeSourceUrl(url), {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) return { status: "failed", error: `${url} → HTTP ${res.status}` };
      const ct = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      const original = Buffer.from(await res.arrayBuffer());
      if (original.length === 0 || original.length > MAX_EXTERNAL_BYTES) {
        return { status: "unchanged" };
      }
      const srcType = IMAGE_CONTENT_TYPES.has(ct) ? ct : undefined;
      const { buffer, contentType, enhanced } = await enhanceImage(original, srcType, {
        maxBytes: budgetFor(original.length),
      });
      // Only self-host when we actually produced an enhanced image — never store
      // un-decodable junk in place of the original reference.
      if (!enhanced) return { status: "unchanged" };
      const newUuid = randomUUID();
      await storage.uploadBuffer(newUuid, buffer, contentType, {
        enhancedVersion: ENHANCE_VERSION,
      });
      return {
        status: "rehosted",
        newUrl: `/api/storage/objects/uploads/${newUuid}`,
        before: original.length,
        after: buffer.length,
      };
    } catch (e) {
      return { status: "failed", error: `${url}: ${errMsg(e)}` };
    }
  }

  // data: URIs and other non-object relative paths are left as-is.
  return { status: "unchanged" };
}

function arrayLiteral(items: string[]) {
  if (items.length === 0) return sql`ARRAY[]::text[]`;
  return sql`ARRAY[${sql.join(
    items.map((i) => sql`${i}`),
    sql`, `,
  )}]::text[]`;
}

export async function optimizeExistingMedia(
  opts: OptimizeMediaOptions = {},
): Promise<OptimizeMediaReport> {
  const storage = new ObjectStorageService();

  const report: OptimizeMediaReport = {
    scanned: 0,
    reoptimised: 0,
    rehosted: 0,
    skipped: 0,
    failed: 0,
    bytesBefore: 0,
    bytesAfter: 0,
    bytesSaved: 0,
    byCategory: {},
    failures: [],
  };

  const cat = (label: string): CategoryStat =>
    (report.byCategory[label] ??= { scanned: 0, reduced: 0, bytesSaved: 0 });

  const record = (label: string, r: UrlResult) => {
    report.scanned++;
    const c = cat(label);
    c.scanned++;
    if (r.status === "reoptimised" || r.status === "rehosted") {
      const saved = Math.max(0, r.before - r.after);
      report.bytesBefore += r.before;
      report.bytesAfter += r.after;
      report.bytesSaved += saved;
      c.reduced++;
      c.bytesSaved += saved;
      if (r.status === "reoptimised") report.reoptimised++;
      else report.rehosted++;
    } else if (r.status === "failed") {
      report.failed++;
      if (report.failures.length < 50) report.failures.push(r.error);
    } else {
      report.skipped++;
    }
  };

  // Build one task per (row, column). A whole array column for a row is handled
  // by a single task so its rewritten array is written back atomically.
  const tasks: Array<() => Promise<void>> = [];

  for (const field of FIELDS) {
    const colRef = sql.raw(`"${field.col}"`);
    const tableRef = sql.raw(`"${field.table}"`);
    try {
      if (field.kind === "scalar") {
        const result = await db.execute(
          sql`SELECT id, ${colRef} AS v FROM ${tableRef} WHERE ${colRef} IS NOT NULL AND ${colRef} <> ''`,
        );
        for (const row of result.rows as Array<{ id: number; v: string }>) {
          const id = Number(row.id);
          const value = String(row.v);
          tasks.push(async () => {
            const r = await processUrl(storage, value);
            record(field.label, r);
            if (r.status === "rehosted" || r.status === "reoptimised") {
              await db.execute(
                sql`UPDATE ${tableRef} SET ${colRef} = ${r.newUrl} WHERE id = ${id}`,
              );
            }
          });
        }
      } else {
        const result = await db.execute(
          sql`SELECT id, ${colRef} AS v FROM ${tableRef} WHERE ${colRef} IS NOT NULL AND array_length(${colRef}, 1) > 0`,
        );
        for (const row of result.rows as Array<{ id: number; v: string[] }>) {
          const id = Number(row.id);
          const arr = (row.v ?? []) as string[];
          tasks.push(async () => {
            const out = [...arr];
            let changed = false;
            for (let i = 0; i < arr.length; i++) {
              const r = await processUrl(storage, arr[i]!);
              record(field.label, r);
              if (r.status === "rehosted" || r.status === "reoptimised") {
                out[i] = r.newUrl;
                changed = true;
              }
            }
            if (changed) {
              await db.execute(
                sql`UPDATE ${tableRef} SET ${colRef} = ${arrayLiteral(out)} WHERE id = ${id}`,
              );
            }
          });
        }
      }
    } catch (e) {
      // A missing table/column (schema drift between environments) shouldn't
      // abort the whole run — note it and move on.
      report.failures.push(`${field.table}.${field.col}: ${errMsg(e)}`);
    }
  }

  const concurrency = Math.max(1, opts.concurrency ?? 4);
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= tasks.length) return;
      await tasks[i]!();
    }
  });
  await Promise.all(workers);

  return report;
}
