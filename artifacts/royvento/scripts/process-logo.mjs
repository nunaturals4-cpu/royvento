/**
 * Logo processing pipeline for the Royvento brand mark.
 *
 * Source: scripts/logo-source.png  (gold crown + shield "R" crest, transparent bg)
 *
 * The source already has a transparent background, but carries a soft golden
 * glow halo around the crest. We crop tightly to the *solid* crest (alpha
 * above a cutoff) so the mark fills the frame and stays legible at small
 * sizes — a loose trim would leave the crest tiny inside a haze of glow.
 *
 * Produces:
 *   - public/images/logo.png        crest, natural aspect (auth, email, hero)
 *   - public/images/logo-icon.png   crest padded to a square (navbar, favicons)
 *   plus favicons, PWA icons, apple-touch-icon, and the Expo mobile app icon.
 *
 * Requires: sharp  (pnpm add -D sharp)
 * Run:      node scripts/process-logo.mjs
 */
import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const imagesDir = join(root, "public", "images");
const input = join(__dirname, "logo-source.png");

const ALPHA_CUTOFF = 70; // pixels fainter than this (glow halo) are ignored when cropping

/** Tightly crop to the solid crest: bounding box of pixels with alpha > cutoff. */
async function cropToCrest(srcPath) {
  const { data, info } = await sharp(srcPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > ALPHA_CUTOFF) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("no opaque pixels found in source");

  return sharp(srcPath)
    .ensureAlpha()
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Pad a crest buffer into a transparent square with uniform margin. */
async function squarePadded(crestBuf, pad = 0.06) {
  const m = await sharp(crestBuf).metadata();
  const side = Math.round(Math.max(m.width, m.height) * (1 + pad * 2));
  return sharp({
    create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: crestBuf, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  const crest = await cropToCrest(input);

  // Full logo (natural aspect) + square icon.
  await sharp(crest).png({ compressionLevel: 9 }).toFile(join(imagesDir, "logo.png"));
  const iconBuf = await squarePadded(crest, 0.03);
  await sharp(iconBuf).png({ compressionLevel: 9 }).toFile(join(imagesDir, "logo-icon.png"));

  // --- Filled icons on the brand-dark background (favicons / app icon) ---
  // iOS/Android app icons and small favicons render better on a solid fill
  // than transparent (transparent app icons show as black on iOS).
  const DARK = { r: 14, g: 13, b: 18, alpha: 1 }; // #0e0d12 — matches splash bg
  const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

  // Favicons use the raw crest (natural portrait aspect) so it fills the full
  // height of the icon frame rather than being squished inside a padded square.
  const filledIcon = async (size, pad = 0.08) => {
    const inner = Math.round(size * (1 - pad * 2));
    const innerBuf = await sharp(crest)
      .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
      .png()
      .toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: DARK } })
      .composite([{ input: innerBuf, gravity: "center" }]);
  };
  const transparentSquare = (size) =>
    sharp(crest).resize(size, size, { fit: "contain", background: TRANSPARENT });

  const publicDir = join(root, "public");
  const webAssets = [
    // Browser favicons — transparent so no black box appears in browser tabs
    ["favicon-16x16.png", () => transparentSquare(16)],
    ["favicon-32x32.png", () => transparentSquare(32)],
    ["favicon-48x48.png", () => transparentSquare(48)],
    ["favicon.png", () => transparentSquare(96)],
    // Apple touch icons — solid dark bg required; iOS/iPadOS shows blank/black for transparent
    ["apple-touch-icon.png", () => filledIcon(180, 0.08)],       // iPhone Retina (recommended)
    ["apple-touch-icon-120x120.png", () => filledIcon(120, 0.08)], // iPhone
    ["apple-touch-icon-152x152.png", () => filledIcon(152, 0.08)], // iPad
    ["apple-touch-icon-167x167.png", () => filledIcon(167, 0.08)], // iPad Pro
    // PWA icons — transparent for any, maskable variant with safe-zone padding
    ["pwa-192x192.png", () => transparentSquare(192)],
    ["pwa-512x512.png", () => transparentSquare(512)],
    ["pwa-maskable-192x192.png", () => filledIcon(192, 0.20)],    // Android adaptive icon (safe zone)
  ];
  for (const [name, make] of webAssets) {
    const pipeline = await make();
    await pipeline.png({ compressionLevel: 9 }).toFile(join(publicDir, name));
  }

  // --- Mobile (Expo) ---
  const mobileImages = join(root, "..", "mobile", "assets", "images");
  await (await filledIcon(1024, 0.16)).png({ compressionLevel: 9 }).toFile(join(mobileImages, "icon.png"));
  await transparentSquare(512).png({ compressionLevel: 9 }).toFile(join(mobileImages, "logo-icon.png"));

  const out1 = await sharp(join(imagesDir, "logo.png")).metadata();
  const out2 = await sharp(join(imagesDir, "logo-icon.png")).metadata();
  console.log(`logo.png       ${out1.width}x${out1.height}`);
  console.log(`logo-icon.png  ${out2.width}x${out2.height}`);
  console.log(`favicons (transparent) + pwa + apple-touch-icon (filled) written to public/`);
  console.log(`mobile icon.png (1024) + logo-icon.png (512) written`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
