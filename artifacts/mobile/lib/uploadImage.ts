import { customFetch, getBaseUrl } from "@workspace/api-client-react";

export const ALLOWED_IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "avif"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

const ALLOWED_MIMES = new Set(Object.values(MIME_MAP));

export function inferContentType(localUri: string, fallback?: string): string | null {
  if (fallback && ALLOWED_MIMES.has(fallback)) return fallback;
  const filename = localUri.split("/").pop() ?? "";
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  return MIME_MAP[ext] ?? null;
}

async function requestPresignedUrl(name: string, size: number, contentType: string) {
  return customFetch<{ uploadURL: string; objectPath: string }>(
    "/api/storage/uploads/request-url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, size, contentType }),
    },
  );
}

export async function uploadImageToStorage(localUri: string, mimeHint?: string): Promise<string> {
  const filename = localUri.split("/").pop() ?? "image.jpg";
  const contentType = inferContentType(localUri, mimeHint);

  if (!contentType) {
    throw new Error("Only JPEG, PNG, WebP, GIF, or AVIF images are allowed.");
  }

  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
  const size = blob.size || 1;

  if (size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }

  const { uploadURL, objectPath } = await requestPresignedUrl(filename, size, contentType);

  await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  const pathAfterObjects = objectPath.replace(/^\/objects\//, "");
  const base = getBaseUrl();
  if (!base) throw new Error("API base URL is not configured; cannot build storage URL.");
  return `${base}/api/storage/objects/${pathAfterObjects}`;
}
