import sharp from "sharp";

// Marker value written alongside each enhanced object. The "Optimise images"
// tool enhances an image ONCE per version and always works from the preserved
// ORIGINAL (never an already-enhanced copy), so the look never compounds into
// the grungy / over-sharpened result earlier versions produced.
export const ENHANCE_VERSION = 6;

// Web-sane ceiling. Anything larger is brought down so heroes/galleries stay
// fast to load; smaller images keep their original dimensions.
const MAX_DIMENSION = 2560;

// Absolute upper bound on any output. The optimiser passes a tighter per-image
// budget (≈ original size + 1 MB) which is clamped to this.
const HARD_MAX_BYTES = 5 * 1024 * 1024;

// Highest quality first; we keep the first encode that fits the byte budget, so
// quality is only traded away when a file would otherwise be too big/slow.
const WEBP_QUALITY_LADDER = [92, 88, 84, 80, 76, 72, 68];

const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/tiff",
]);

export interface EnhanceResult {
  buffer: Buffer;
  contentType: string;
  enhanced: boolean;
}

/**
 * Enhance an image's perceived quality (a touch more colour, lifted shadows and
 * a light, noise-aware sharpen) and encode it at the highest quality that still
 * fits the size budget. This is enhancement, not aggressive compression: the
 * pipeline is deliberately gentle so photos look clean and crisp — never the
 * over-processed "HDR/grunge" haze — and the adaptive quality only steps down
 * when needed to keep the file light and fast to load.
 *
 * `opts.maxBytes` is the size budget (clamped to ≤ 5 MB). If omitted, 5 MB.
 */
export async function enhanceImage(
  input: Buffer,
  inputMimeType?: string,
  opts?: { maxBytes?: number },
): Promise<EnhanceResult> {
  if (inputMimeType && !SUPPORTED_MIME_TYPES.has(inputMimeType.toLowerCase())) {
    return { buffer: input, contentType: inputMimeType, enhanced: false };
  }

  const budget = Math.max(64 * 1024, Math.min(opts?.maxBytes ?? HARD_MAX_BYTES, HARD_MAX_BYTES));

  try {
    const isAvif = inputMimeType?.toLowerCase() === "image/avif";
    const meta = await sharp(input, { failOn: "none" }).metadata();
    const needResize = (meta.width ?? 0) > MAX_DIMENSION || (meta.height ?? 0) > MAX_DIMENSION;

    // Run the (relatively costly) enhancement ONCE into a lossless intermediate,
    // then only re-encode that when probing the quality ladder.
    let pipe = sharp(input, { failOn: "none" }).rotate();
    if (needResize) {
      pipe = pipe.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true });
    }
    pipe = pipe
      // Gentle, natural finish — restrained on purpose so it reads as a clean,
      // professional photo rather than an over-edited one.
      .modulate({ saturation: 1.08, brightness: 1.02 })
      .gamma(1.05) // lift shadows/mid-tones slightly for more depth
      // Light noise-aware sharpen: m1:0 leaves flat areas (walls/sky) untouched
      // so noise & block artifacts aren't amplified into haze; real edges crisp.
      .sharpen({ sigma: 0.8, m1: 0, m2: 2 });

    const enhancedPng = await pipe.png({ compressionLevel: 3 }).toBuffer();

    let best: Buffer | null = null;
    for (const q of WEBP_QUALITY_LADDER) {
      const buf = isAvif
        ? await sharp(enhancedPng).avif({ quality: Math.max(45, q - 16), effort: 4 }).toBuffer()
        : await sharp(enhancedPng).webp({ quality: q, effort: 5, smartSubsample: true }).toBuffer();
      best = buf;
      if (buf.length <= budget) break; // highest quality that fits — done
    }

    return {
      buffer: best!,
      contentType: isAvif ? "image/avif" : "image/webp",
      enhanced: true,
    };
  } catch {
    return { buffer: input, contentType: inputMimeType ?? "application/octet-stream", enhanced: false };
  }
}
