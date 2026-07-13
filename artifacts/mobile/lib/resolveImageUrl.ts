import { getBaseUrl } from "@workspace/api-client-react";

/**
 * Resolve a stored (possibly relative) upload path to an absolute image URL.
 *
 * Most content is created via the web dashboard, whose uploader stores
 * relative paths like "/api/storage/objects/uploads/xyz.jpg" — a browser
 * resolves those against the page origin automatically, but React Native's
 * Image component has no such origin and needs a fully-qualified URL, or the
 * image silently fails to load. Always pass image URLs through this before
 * rendering with <Image source={{ uri }} />.
 */
export function resolveImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|data:|file:|content:|asset:|ph:\/\/)/i.test(url)) return url;
  const base = getBaseUrl() ?? "";
  if (!base) return url;
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}
