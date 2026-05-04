import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import express from "express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { compressImage } from "../lib/imageCompressor";
import { requireAuth } from "../lib/auth";
import { verifyUploadToken, buildServerUploadUrl } from "../lib/uploadToken";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const ALLOWED_UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;


/**
 * POST /storage/uploads/request-url
 *
 * Request an upload URL for file upload. Requires any authenticated user.
 * Returns a short-lived HMAC-signed server-side upload URL instead of a
 * presigned GCS URL, allowing the server to compress images before storing.
 */
router.post("/storage/uploads/request-url", requireAuth(), async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { name, size, contentType } = parsed.data;

  if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
    res.status(400).json({ error: "Only JPEG, PNG, WebP, and GIF images are allowed" });
    return;
  }
  if (size > MAX_UPLOAD_BYTES) {
    res.status(400).json({ error: "Image must be under 8 MB" });
    return;
  }

  try {
    const uuid = randomUUID();
    const objectPath = `/objects/uploads/${uuid}`;
    const uploadURL = buildServerUploadUrl(req, uuid, size, contentType);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload token");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * PUT /storage/uploads/file/:uuid
 *
 * Receive raw image bytes, verify the HMAC-signed token issued by request-url,
 * compress to WebP, and store in object storage under uploads/{uuid}.
 *
 * Token carries: uuid, max allowed size, allowed content-type, expiry.
 * No authentication header required — the signed token is the credential.
 */
router.put(
  "/storage/uploads/file/:uuid",
  express.raw({ type: "*/*", limit: "10mb" }),
  async (req: Request, res: Response) => {
    const { uuid } = req.params;
    if (!uuid || !/^[0-9a-f-]{36}$/.test(uuid)) {
      res.status(400).json({ error: "Invalid upload token" });
      return;
    }

    // Verify signed token from query string
    const { token, expires, size: sizeStr, type: allowedType } = req.query as Record<string, string>;
    if (!token || !expires || !sizeStr || !allowedType) {
      res.status(401).json({ error: "Missing upload authorization" });
      return;
    }

    const expiresAt = Number(expires);
    const maxBytes = Number(sizeStr);
    if (!Number.isFinite(expiresAt) || !Number.isFinite(maxBytes)) {
      res.status(400).json({ error: "Invalid token parameters" });
      return;
    }

    if (Date.now() > expiresAt) {
      res.status(401).json({ error: "Upload token expired" });
      return;
    }

    if (!verifyUploadToken(uuid, maxBytes, allowedType, expiresAt, token)) {
      res.status(401).json({ error: "Invalid upload token" });
      return;
    }

    // Enforce allowed content type and size (from the signed token, not the request header)
    if (!ALLOWED_UPLOAD_TYPES.has(allowedType)) {
      res.status(400).json({ error: "Content type not allowed" });
      return;
    }

    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      res.status(400).json({ error: "Empty body" });
      return;
    }
    // Allow a small tolerance (10%) beyond declared size to account for encoding overhead
    if (rawBody.length > maxBytes * 1.1 + 1024) {
      res.status(413).json({ error: "File exceeds declared size" });
      return;
    }

    try {
      const { buffer, contentType, compressed } = await compressImage(rawBody, allowedType);
      await objectStorageService.uploadBuffer(uuid, buffer, contentType);
      req.log.info(
        { uuid, inputBytes: rawBody.length, outputBytes: buffer.length, compressed },
        "Image uploaded and compressed",
      );
      res.status(200).json({ ok: true });
    } catch (error) {
      req.log.error({ err: error }, "Error uploading/compressing image");
      res.status(500).json({ error: "Failed to store image" });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/uploads/*
 *
 * Serve uploaded files stored under the "uploads" prefix.
 * Intentionally public: announcement images must be viewable on public pages.
 */
router.get("/storage/objects/uploads/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/uploads/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
