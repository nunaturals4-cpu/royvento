/**
 * One-shot migrator: copy every file under LOCAL_STORAGE_DIR into the
 * configured S3-compatible bucket using the same key structure the live
 * service uses (`uploads/<uuid>` and `public/<path>`).
 *
 * Idempotent: a HeadObject probe skips files already present in the bucket.
 * Safe to re-run after a partial failure — only missing files are uploaded.
 *
 * Required env vars:
 *   LOCAL_STORAGE_DIR         absolute path to the Railway Volume (e.g. /data)
 *   S3_ENDPOINT               https://<region>.bucket.railway.app (or other S3 host)
 *   S3_BUCKET                 bucket name
 *   S3_ACCESS_KEY_ID
 *   S3_SECRET_ACCESS_KEY
 *   S3_REGION                 optional, defaults to "auto"
 *
 * Run from Railway:
 *   railway run pnpm -F @workspace/api-server migrate:media
 * Or inside a one-off Railway shell:
 *   pnpm -F @workspace/api-server migrate:media
 */

import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const localDir = process.env.LOCAL_STORAGE_DIR;
const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

if (!localDir) die("LOCAL_STORAGE_DIR is required (path to the source volume)");
if (!endpoint) die("S3_ENDPOINT is required");
if (!bucket) die("S3_BUCKET is required");
if (!accessKeyId) die("S3_ACCESS_KEY_ID is required");
if (!secretAccessKey) die("S3_SECRET_ACCESS_KEY is required");

const s3 = new S3Client({
  endpoint,
  region: process.env.S3_REGION || "auto",
  credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
  forcePathStyle: true,
});

const EXT_CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

async function existsInBucket(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket!, Key: key }));
    return true;
  } catch (err: unknown) {
    const code = (err as { name?: string } | null)?.name ?? "";
    if (code === "NotFound" || code === "NoSuchKey") return false;
    throw err;
  }
}

async function uploadOne(absPath: string, key: string): Promise<"uploaded" | "skipped"> {
  if (await existsInBucket(key)) return "skipped";

  // Prefer the sidecar `<file>.meta` when present (the local backend writes
  // these when storing uploads via the api). Fall back to extension-based
  // detection so legacy files without sidecars still get a sensible
  // Content-Type instead of application/octet-stream.
  let contentType = "application/octet-stream";
  try {
    const meta = JSON.parse(await readFile(`${absPath}.meta`, "utf8"));
    if (typeof meta?.contentType === "string") contentType = meta.contentType;
  } catch {
    const ext = path.extname(absPath).toLowerCase();
    if (EXT_CONTENT_TYPE[ext]) contentType = EXT_CONTENT_TYPE[ext];
  }

  const body = await readFile(absPath);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket!,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return "uploaded";
}

function keyForLocalPath(rel: string): string | null {
  // Match the service's read paths:
  //   /<localDir>/uploads/<uuid>       -> uploads/<uuid>
  //   /<localDir>/public/<sub>/<file>  -> public/<sub>/<file>
  // Anything else (e.g. stray .meta sidecars handled by uploadOne, or root
  // files) is ignored — the service can't read them anyway.
  const norm = rel.split(path.sep).join("/");
  if (norm.endsWith(".meta")) return null;
  if (norm.startsWith("uploads/")) return norm;
  if (norm.startsWith("public/")) return norm;
  return null;
}

async function main() {
  const root = path.resolve(localDir!);
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) die(`LOCAL_STORAGE_DIR ${root} is not a directory`);

  console.log(`Migrating files from ${root} → s3://${bucket}/ (endpoint ${endpoint})`);

  let uploaded = 0;
  let skipped = 0;
  let ignored = 0;
  let failed = 0;
  let processed = 0;

  for await (const absPath of walk(root)) {
    const rel = path.relative(root, absPath);
    const key = keyForLocalPath(rel);
    if (!key) {
      ignored++;
      continue;
    }
    processed++;
    try {
      const result = await uploadOne(absPath, key);
      if (result === "uploaded") {
        uploaded++;
        if (uploaded % 50 === 0) console.log(`  uploaded ${uploaded} so far…`);
      } else {
        skipped++;
      }
    } catch (err) {
      failed++;
      console.error(`  FAILED ${rel}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log("\nDone.");
  console.log(`  Processed:  ${processed}`);
  console.log(`  Uploaded:   ${uploaded}`);
  console.log(`  Skipped:    ${skipped} (already in bucket)`);
  console.log(`  Ignored:    ${ignored} (meta sidecars / out-of-tree files)`);
  console.log(`  Failed:     ${failed}`);
  if (failed > 0) process.exit(1);
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
