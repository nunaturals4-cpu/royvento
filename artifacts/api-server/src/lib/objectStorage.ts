import { Storage, File as GCSFile } from "@google-cloud/storage";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { readFile, writeFile, mkdir, unlink, access } from "fs/promises";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";
import { getObjectAclPolicy } from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

type LocalFileRef = { _local: true; filePath: string; contentType?: string };
type S3Ref = { _s3: true; key: string };

function isLocalFileRef(f: GCSFile | LocalFileRef | S3Ref): f is LocalFileRef {
  return (f as LocalFileRef)._local === true;
}
function isS3Ref(f: GCSFile | LocalFileRef | S3Ref): f is S3Ref {
  return (f as S3Ref)._s3 === true;
}

type S3Config = { client: S3Client; bucket: string };

let cachedS3: S3Config | null | undefined;
function getS3(): S3Config | null {
  if (cachedS3 !== undefined) return cachedS3;
  const bucket = process.env.S3_BUCKET;
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    cachedS3 = null;
    return null;
  }
  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION || "auto",
    credentials: { accessKeyId, secretAccessKey },
    // Path-style addressing works for every S3-compatible host (Railway Bucket,
    // MinIO, Cloudflare R2, Backblaze B2). Real AWS still understands it too.
    forcePathStyle: true,
  });
  cachedS3 = { client, bucket };
  return cachedS3;
}

export class ObjectStorageService {
  constructor() {}

  private get s3(): S3Config | null {
    return getS3();
  }

  private get localDir(): string | null {
    if (this.s3) return null;
    if (process.env.LOCAL_STORAGE_DIR) return process.env.LOCAL_STORAGE_DIR;
    // When neither LOCAL_STORAGE_DIR, S3, nor the Replit GCS env vars are
    // configured, fall back to a system temp directory so uploads succeed
    // without explicit setup. Files written here are ephemeral.
    const hasGCS = process.env.PRIVATE_OBJECT_DIR || process.env.PUBLIC_OBJECT_SEARCH_PATHS;
    if (!hasGCS) return path.join(os.tmpdir(), "royvento-uploads");
    return null;
  }

  getPublicObjectSearchPaths(): Array<string> {
    if (this.localDir) return [path.join(this.localDir, "public")];
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    if (this.localDir) return this.localDir;
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<GCSFile | LocalFileRef | S3Ref | null> {
    if (this.s3) {
      const key = `public/${filePath}`;
      try {
        await this.s3.client.send(new HeadObjectCommand({ Bucket: this.s3.bucket, Key: key }));
        return { _s3: true, key };
      } catch {
        return null;
      }
    }

    if (this.localDir) {
      const fullPath = path.join(this.localDir, "public", filePath);
      try {
        await access(fullPath);
        return { _local: true, filePath: fullPath };
      } catch {
        return null;
      }
    }

    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (exists) return file;
    }
    return null;
  }

  async downloadObject(file: GCSFile | LocalFileRef | S3Ref, cacheTtlSec: number = 3600): Promise<Response> {
    if (isLocalFileRef(file)) {
      const buffer = await readFile(file.filePath);
      const contentType = file.contentType || "application/octet-stream";
      return new Response(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": `public, max-age=${cacheTtlSec}, immutable`,
          "Content-Length": String(buffer.length),
        },
      });
    }

    if (isS3Ref(file)) {
      const s3 = this.s3!;
      let out;
      try {
        out = await s3.client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: file.key }));
      } catch (err: unknown) {
        // S3 SDK throws NoSuchKey on missing objects. Translate so callers
        // can return a 404 instead of leaking a 500.
        const code = (err as { name?: string } | null)?.name ?? "";
        if (code === "NoSuchKey" || code === "NotFound") throw new ObjectNotFoundError();
        throw err;
      }
      const body = out.Body;
      const contentType = out.ContentType || "application/octet-stream";
      const headers: Record<string, string> = {
        "Content-Type": contentType,
        // Upload keys are UUID-suffixed and never overwritten, so the bytes
        // at this URL are immutable — let browsers/CDNs cache aggressively.
        "Cache-Control": `public, max-age=${cacheTtlSec}, immutable`,
      };
      if (out.ContentLength != null) headers["Content-Length"] = String(out.ContentLength);
      if (out.ETag) headers["ETag"] = out.ETag;
      if (!body) return new Response(null, { headers });
      // Body is a Node Readable when running on Node; cast to ReadableStream
      // for the Web Response.
      const webStream =
        body instanceof Readable
          ? (Readable.toWeb(body) as unknown as ReadableStream<Uint8Array>)
          : (body as unknown as ReadableStream<Uint8Array>);
      return new Response(webStream, { headers });
    }

    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": (metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    // S3 mode and the HMAC-signed server upload path don't need this — the
    // /storage/uploads/request-url route returns a server-issued URL and
    // streams the upload through the api so the image compressor can run.
    // This method is kept for the legacy direct-to-GCS callers.
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<GCSFile | LocalFileRef | S3Ref> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");

    if (this.s3) {
      // Skip an explicit HeadObject — the streaming GET in downloadObject()
      // already maps NoSuchKey to ObjectNotFoundError, saving one round trip
      // on every successful read.
      return { _s3: true, key: entityId };
    }

    if (this.localDir) {
      const filePath = path.join(this.localDir, entityId);
      try {
        await access(filePath);
        // Try to read content-type from sidecar metadata file
        let contentType: string | undefined;
        try {
          const meta = JSON.parse(await readFile(`${filePath}.meta`, "utf8"));
          contentType = meta.contentType;
        } catch {}
        return { _local: true, filePath, contentType };
      } catch {
        throw new ObjectNotFoundError();
      }
    }

    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  async uploadBuffer(uuid: string, buffer: Buffer, contentType: string): Promise<void> {
    if (this.s3) {
      await this.s3.client.send(
        new PutObjectCommand({
          Bucket: this.s3.bucket,
          Key: `uploads/${uuid}`,
          Body: buffer,
          ContentType: contentType,
          // CacheControl baked into the object so any direct/CDN access
          // (not just the proxied /objects/ route) gets long-lived caching.
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      return;
    }

    if (this.localDir) {
      const uploadsDir = path.join(this.localDir, "uploads");
      await mkdir(uploadsDir, { recursive: true });
      await writeFile(path.join(uploadsDir, uuid), buffer);
      await writeFile(path.join(uploadsDir, `${uuid}.meta`), JSON.stringify({ contentType }));
      return;
    }

    const privateObjectDir = this.getPrivateObjectDir();
    const fullPath = `${privateObjectDir}/uploads/${uuid}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    await file.save(buffer, { contentType, resumable: false });
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async deleteObject(imageUrl: string): Promise<void> {
    if (!imageUrl) return;
    try {
      let objectPath = imageUrl.startsWith("https://storage.googleapis.com/")
        ? this.normalizeObjectEntityPath(imageUrl)
        : imageUrl;

      if (!objectPath.startsWith("/objects/")) return;

      const parts = objectPath.slice(1).split("/");
      const entityId = parts.slice(1).join("/");
      if (!entityId) return;

      if (this.s3) {
        await this.s3.client.send(
          new DeleteObjectCommand({ Bucket: this.s3.bucket, Key: entityId }),
        );
        return;
      }

      if (this.localDir) {
        const filePath = path.join(this.localDir, entityId);
        await unlink(filePath).catch(() => {});
        await unlink(`${filePath}.meta`).catch(() => {});
        return;
      }

      let entityDir = this.getPrivateObjectDir();
      if (!entityDir.endsWith("/")) {
        entityDir = `${entityDir}/`;
      }
      const fullPath = `${entityDir}${entityId}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      if (!bucketName || !objectName) return;

      const bucket = objectStorageClient.bucket(bucketName);
      await bucket.file(objectName).delete({ ignoreNotFound: true });
    } catch {
      // best-effort — swallow all errors so caller is never blocked
    }
  }
}

function parseObjectPath(p: string): { bucketName: string; objectName: string } {
  if (!p.startsWith("/")) p = `/${p}`;
  const parts = p.split("/");
  if (parts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const body = (await response.json()) as { signed_url: string };
  if (typeof body.signed_url !== "string" || !body.signed_url) {
    throw new Error("Sidecar returned unexpected response: missing signed_url");
  }
  return body.signed_url;
}
