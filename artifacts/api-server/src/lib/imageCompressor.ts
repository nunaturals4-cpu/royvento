import sharp from "sharp";

const MAX_DIMENSION = 1920;
const WEBP_QUALITY = 80;
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
    const image = sharp(input, { failOn: "none" });
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

    const buffer = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
    return { buffer, contentType: "image/webp", compressed: true };
  } catch {
    return { buffer: input, contentType: inputMimeType ?? "application/octet-stream", compressed: false };
  }
}
