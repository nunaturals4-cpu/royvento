import { Storage, File as GCSFile } from "@google-cloud/storage";
import { readFile, writeFile, mkdir, unlink, access } from "fs/promises";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import path from "path";
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

function isLocalFileRef(f: GCSFile | LocalFileRef): f is LocalFileRef {
  return (f as LocalFileRef)._local === true;
}

export class ObjectStorageService {
  constructor() {}

  private get localDir(): string | null {
    return process.env.LOCAL_STORAGE_DIR || null;
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

  async searchPublicObject(filePath: string): Promise<GCSFile | LocalFileRef | null> {
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

  async downloadObject(file: GCSFile | LocalFileRef, cacheTtlSec: number = 3600): Promise<Response> {
    if (isLocalFileRef(file)) {
      const buffer = await readFile(file.filePath);
      const contentType = file.contentType || "application/octet-stream";
      return new Response(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": `public, max-age=${cacheTtlSec}`,
          "Content-Length": String(buffer.length),
        },
      });
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

  async getObjectEntityFile(objectPath: string): Promise<GCSFile | LocalFileRef> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");

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
