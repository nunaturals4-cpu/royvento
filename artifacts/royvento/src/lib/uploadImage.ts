import { resolveImageMime } from "@workspace/validators";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateImageFile(file: File): string | null {
  // Resolve from the extension too — Windows reports an empty type for .avif.
  if (!ALLOWED_IMAGE_TYPES.includes(resolveImageMime(file))) {
    return "Only JPEG, PNG, WebP, GIF, or AVIF images are allowed.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
}

export async function uploadImage(file: File): Promise<string> {
  const contentType = resolveImageMime(file) || "application/octet-stream";
  const res = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType,
    }),
  });
  if (!res.ok) throw new Error("Could not get upload URL");
  const { uploadURL, objectPath } = (await res.json()) as { uploadURL: string; objectPath: string };
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": contentType },
  });
  if (!putRes.ok) throw new Error("Image upload failed");
  return `/api/storage${objectPath}`;
}
