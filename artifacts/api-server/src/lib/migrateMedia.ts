/**
 * Core migration loop, shared by the standalone tsx script and the admin
 * one-shot endpoint. Walks LOCAL_STORAGE_DIR, uploads every file to the
 * configured S3 bucket under the matching key (`uploads/<uuid>`,
 * `public/<sub>/<file>`). Idempotent — uses HeadObject to skip files
 * already in the bucket.
 */

import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

export type MigrateReport = {
  processed: number;
  uploaded: number;
  skipped: number;
  ignored: number;
  failed: number;
  failedFiles: string[];
  localDir: string;
  bucket: string;
  endpoint: string;
};

export type MigrateOptions = {
  /** Max concurrent file uploads. Defaults to 8. */
  concurrency?: number;
  /** Optional progress callback fired every N processed files. */
  onProgress?: (report: MigrateReport) => void;
};

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

function readEnv() {
  const localDir = process.env.LOCAL_STORAGE_DIR;
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const missing: string[] = [];
  if (!localDir) missing.push("LOCAL_STORAGE_DIR");
  if (!endpoint) missing.push("S3_ENDPOINT");
  if (!bucket) missing.push("S3_BUCKET");
  if (!accessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("S3_SECRET_ACCESS_KEY");
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
  return {
    localDir: localDir!,
    endpoint: endpoint!,
    bucket: bucket!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    region: process.env.S3_REGION || "auto",
  };
}

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

function keyForLocalPath(rel: string): string | null {
  // Match the service's read paths:
  //   /<localDir>/uploads/<uuid>       -> uploads/<uuid>
  //   /<localDir>/public/<sub>/<file>  -> public/<sub>/<file>
  // Anything else (stray .meta sidecars, root files) is ignored — the
  // service can't read them anyway. Sidecar Content-Type is restored from
  // <file>.meta inside uploadOne().
  const norm = rel.split(path.sep).join("/");
  if (norm.endsWith(".meta")) return null;
  if (norm.startsWith("uploads/")) return norm;
  if (norm.startsWith("public/")) return norm;
  return null;
}

async function existsInBucket(s3: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err: unknown) {
    const code = (err as { name?: string } | null)?.name ?? "";
    if (code === "NotFound" || code === "NoSuchKey") return false;
    throw err;
  }
}

async function uploadOne(
  s3: S3Client,
  bucket: string,
  absPath: string,
  key: string,
): Promise<"uploaded" | "skipped"> {
  if (await existsInBucket(s3, bucket, key)) return "skipped";

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
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return "uploaded";
}

export async function migrateMediaToS3(opts: MigrateOptions = {}): Promise<MigrateReport> {
  const env = readEnv();
  const root = path.resolve(env.localDir);
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) {
    throw new Error(`LOCAL_STORAGE_DIR ${root} is not a directory`);
  }

  const s3 = new S3Client({
    endpoint: env.endpoint,
    region: env.region,
    credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
    forcePathStyle: true,
  });

  const report: MigrateReport = {
    processed: 0,
    uploaded: 0,
    skipped: 0,
    ignored: 0,
    failed: 0,
    failedFiles: [],
    localDir: root,
    bucket: env.bucket,
    endpoint: env.endpoint,
  };

  // Collect files first so we can run uploads with bounded concurrency.
  const jobs: { absPath: string; key: string }[] = [];
  for await (const absPath of walk(root)) {
    const rel = path.relative(root, absPath);
    const key = keyForLocalPath(rel);
    if (!key) {
      report.ignored++;
      continue;
    }
    jobs.push({ absPath, key });
  }

  const concurrency = Math.max(1, opts.concurrency ?? 8);
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= jobs.length) return;
      const { absPath, key } = jobs[i];
      report.processed++;
      try {
        const result = await uploadOne(s3, env.bucket, absPath, key);
        if (result === "uploaded") report.uploaded++;
        else report.skipped++;
      } catch (err) {
        report.failed++;
        report.failedFiles.push(`${path.relative(root, absPath)}: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (opts.onProgress && report.processed % 25 === 0) {
        opts.onProgress({ ...report, failedFiles: [...report.failedFiles] });
      }
    }
  });
  await Promise.all(workers);

  return report;
}
