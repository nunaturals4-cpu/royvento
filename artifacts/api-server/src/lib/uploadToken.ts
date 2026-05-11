import { createHmac, timingSafeEqual } from "crypto";
import type { Request } from "express";

export const UPLOAD_TTL_MS = 15 * 60 * 1000; // 15 minutes

function uploadSecret(): string {
  return process.env.SESSION_SECRET ?? "royvento-dev-secret";
}

export function signUploadToken(
  uuid: string,
  maxBytes: number,
  contentType: string,
  expiresAt: number,
): string {
  const payload = `${uuid}:${maxBytes}:${contentType}:${expiresAt}`;
  return createHmac("sha256", uploadSecret()).update(payload).digest("hex");
}

export function verifyUploadToken(
  uuid: string,
  maxBytes: number,
  contentType: string,
  expiresAt: number,
  token: string,
): boolean {
  try {
    const expected = Buffer.from(signUploadToken(uuid, maxBytes, contentType, expiresAt), "hex");
    const provided = Buffer.from(token, "hex");
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

export function buildServerUploadUrl(
  _req: Request,
  uuid: string,
  size: number,
  contentType: string,
): string {
  const expiresAt = Date.now() + UPLOAD_TTL_MS;
  const token = signUploadToken(uuid, size, contentType, expiresAt);
  const qs = new URLSearchParams({
    token,
    expires: String(expiresAt),
    size: String(size),
    type: contentType,
  });
  // Return a root-relative path so the client resolves it against the page
  // origin. This eliminates cross-origin CORS issues in local dev (frontend
  // on :3000 proxying to API on :5000) and removes host/protocol detection.
  return `/api/storage/uploads/file/${uuid}?${qs}`;
}
