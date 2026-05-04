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
  req: Request,
  uuid: string,
  size: number,
  contentType: string,
): string {
  const host =
    req.get("x-forwarded-host") ??
    req.get("host") ??
    process.env.REPLIT_DEV_DOMAIN ??
    "localhost";
  const proto = (req.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  const expiresAt = Date.now() + UPLOAD_TTL_MS;
  const token = signUploadToken(uuid, size, contentType, expiresAt);
  const qs = new URLSearchParams({
    token,
    expires: String(expiresAt),
    size: String(size),
    type: contentType,
  });
  return `${proto}://${host}/api/storage/uploads/file/${uuid}?${qs}`;
}
