/**
 * Logo processing pipeline for the Royvento brand mark.
 *
 * Source: scripts/logo-source.png  (gold crown + shield "R" crest, transparent bg)
 *
 * Two crops are produced from the source:
 *   - crest  : full crown + shield (navbar logo, email header, auth cards)
 *   - shield : shield + R only, crown stripped (favicons, home-screen icons, PWA)
 *
 * Using the crown-stripped shield for small icons means the "R" fills the
 * entire icon frame and stays legible at 16–48 px where the crown would just
 * add visual noise.
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

const ALPHA_CUTOFF = 70;

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

/**
 * Remove the crown by slicing off the top 29 % of the crest height, then
 * tight-crop again so the shield+R fills the frame with no dead space.
 */
async function cropToShield(crestBuf) {
  const m = await sharp(crestBuf).metadata();
  const skipTop = Math.round(m.height * 0.29);
  const sliced = await sharp(crestBuf)
    .extract({ left: 0, top: skipTop, width: m.width, height: m.height - skipTop })
    .png()
    .toBuffer();

  const { data, info } = await sharp(sliced).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
  if (maxX < 0) return sliced;
  return sharp(sliced)
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Remove the dark shield fill so only the gold R and outline remain.
 * Gold pixels have high R+G values; the black interior is near (0,0,0).
 * Threshold: any opaque pixel with R<80, G<80, B<80 becomes transparent.
 */
async function removeShieldFill(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.from(data);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    const a = data[i * channels + 3];
    if (a > 80 && r < 80 && g < 80 && b < 80) {
      out[i * channels + 3] = 0;
    }
  }
  return sharp(out, { raw: { width, height, channels } }).png({ compressionLevel: 9 }).toBuffer();
}

/** Pad a buffer into a transparent square with uniform margin. */
async function squarePadded(buf, pad = 0.03) {
  const m = await sharp(buf).metadata();
  const side = Math.round(Math.max(m.width, m.height) * (1 + pad * 2));
  return sharp({
    create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: buf, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  const crest = await cropToCrest(input);         // full crown + shield
  const shield = await cropToShield(crest);       // shield + R only (no crown)
  const shieldClean = await removeShieldFill(shield); // black interior removed

  // Navbar / footer / auth card — full crest with crown
  await sharp(crest).png({ compressionLevel: 9 }).toFile(join(imagesDir, "logo.png"));
  const iconBuf = await squarePadded(crest, 0.03);
  await sharp(iconBuf).png({ compressionLevel: 9 }).toFile(join(imagesDir, "logo-icon.png"));

  const DARK = { r: 14, g: 13, b: 18, alpha: 1 }; // #0e0d12
  const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

  // All icon/favicon assets use the crown-stripped, fill-removed shield
  const filledIcon = async (size, pad = 0.08) => {
    const inner = Math.round(size * (1 - pad * 2));
    const innerBuf = await sharp(shieldClean)
      .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
      .png()
      .toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: DARK } })
      .composite([{ input: innerBuf, gravity: "center" }]);
  };
  const transparentSquare = (size) =>
    sharp(shieldClean).resize(size, size, { fit: "contain", background: TRANSPARENT });

  const publicDir = join(root, "public");
  const webAssets = [
    // Browser favicons — transparent bg, crown-free so R is clear even at 16 px
    ["favicon-16x16.png", () => transparentSquare(16)],
    ["favicon-32x32.png", () => transparentSquare(32)],
    ["favicon-48x48.png", () => transparentSquare(48)],
    ["favicon.png",       () => transparentSquare(96)],
    // Apple touch icons — solid dark bg (iOS requires it); crown-free R fills frame
    ["apple-touch-icon.png",       () => filledIcon(180, 0.08)],
    ["apple-touch-icon-120x120.png", () => filledIcon(120, 0.08)],
    ["apple-touch-icon-152x152.png", () => filledIcon(152, 0.08)],
    ["apple-touch-icon-167x167.png", () => filledIcon(167, 0.08)],
    // PWA icons
    ["pwa-192x192.png",          () => transparentSquare(192)],
    ["pwa-512x512.png",          () => transparentSquare(512)],
    ["pwa-maskable-192x192.png", () => filledIcon(192, 0.20)],
  ];
  for (const [name, make] of webAssets) {
    const pipeline = await make();
    await pipeline.png({ compressionLevel: 9 }).toFile(join(publicDir, name));
  }

  // Mobile Expo app icon — keep full crest (larger canvas, crown reads well)
  const mobileImages = join(root, "..", "mobile", "assets", "images");
  await (await filledIcon(1024, 0.12)).png({ compressionLevel: 9 }).toFile(join(mobileImages, "icon.png"));
  await transparentSquare(512).png({ compressionLevel: 9 }).toFile(join(mobileImages, "logo-icon.png"));

  const out1 = await sharp(join(imagesDir, "logo.png")).metadata();
  const out2 = await sharp(join(imagesDir, "logo-icon.png")).metadata();
  const shieldMeta = await sharp(shieldClean).metadata();
  console.log(`logo.png       ${out1.width}x${out1.height}  (full crest)`);
  console.log(`logo-icon.png  ${out2.width}x${out2.height}  (full crest square)`);
  console.log(`shield clean   ${shieldMeta.width}x${shieldMeta.height}  (crown + black fill removed)`);
  console.log(`favicons + pwa + apple-touch-icon written to public/`);
  console.log(`mobile icon.png (1024) + logo-icon.png (512) written`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
