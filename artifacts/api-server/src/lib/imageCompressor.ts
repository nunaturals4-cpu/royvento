import sharp from "sharp";

const MAX_DIMENSION = 1920;
const WEBP_QUALITY = 80;
const AVIF_QUALITY = 60; // AVIF needs a lower number for visually-equivalent WebP-80 quality
const SMALL_FILE_THRESHOLD = 50 * 1024; // skip compression for files under 50 KB

const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/tiff",
]);

export interface CompressionResult {
  buffer: Buffer;
  contentType: string;
  compressed: boolean;
}

export async function compressImage(
  input: Buffer,
  inputMimeType?: string,
): Promise<CompressionResult> {
  if (inputMimeType && !SUPPORTED_MIME_TYPES.has(inputMimeType.toLowerCase())) {
    return { buffer: input, contentType: inputMimeType, compressed: false };
  }

  if (input.length < SMALL_FILE_THRESHOLD) {
    return { buffer: input, contentType: inputMimeType ?? "application/octet-stream", compressed: false };
  }

  try {
    // `rotate()` with no args bakes the EXIF orientation into the pixels so the
    // stored image is always upright (browsers ignore EXIF on WebP/AVIF), then
    // strips the now-redundant orientation tag.
    const image = sharp(input, { failOn: "none" }).rotate();
    const metadata = await image.metadata();
    const { width = 0, height = 0 } = metadata;

    const needsResize = width > MAX_DIMENSION || height > MAX_DIMENSION;

    let pipeline = image;
    if (needsResize) {
      pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    // A light sharpen counteracts the softening introduced by downscaling and
    // lossy quantisation, so the smaller file still looks crisp on screen.
    pipeline = pipeline.sharpen();

    // Keep AVIF inputs as AVIF — re-encoding an already-modern format to WebP
    // would usually make the file bigger, not smaller. Everything else becomes
    // WebP, which every supported browser can render.
    const isAvif = inputMimeType?.toLowerCase() === "image/avif";
    if (isAvif) {
      const buffer = await pipeline.avif({ quality: AVIF_QUALITY, effort: 4 }).toBuffer();
      return { buffer, contentType: "image/avif", compressed: true };
    }

    const buffer = await pipeline
      .webp({ quality: WEBP_QUALITY, effort: 4, smartSubsample: true })
      .toBuffer();
    return { buffer, contentType: "image/webp", compressed: true };
  } catch {
    return { buffer: input, contentType: inputMimeType ?? "application/octet-stream", compressed: false };
  }
}
