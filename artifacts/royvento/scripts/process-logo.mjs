/**
 * Logo processing pipeline for the Royvento brand mark.
 *
 * Source: scripts/logo-source.png  (gold ROYVENTO crest + wordmark on black)
 *
 * Produces transparent-background, professionally trimmed variants:
 *   - public/images/logo.png        full crest + wordmark   (wide, hero/footer/email/auth)
 *   - public/images/logo-icon.png   crest-only square mark  (navbar, favicon, avatars)
 *
 * The black background is removed with an edge flood-fill so that the dark
 * texture *inside* the shield is preserved (a naive global threshold would
 * punch holes through the emblem).
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

const NEAR_BLACK = 48; // px with all channels below this are background candidates

/** Remove the connected black background reachable from the image border. */
async function removeBackground(srcBuffer) {
  const img = sharp(srcBuffer).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const buf = Buffer.from(data);

  const isDark = (i) => {
    const b = i * channels;
    return buf[b] < NEAR_BLACK && buf[b + 1] < NEAR_BLACK && buf[b + 2] < NEAR_BLACK;
  };

  const visited = new Uint8Array(width * height);
  const stack = [];
  // seed every border pixel
  for (let x = 0; x < width; x++) {
    stack.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    stack.push(y * width, y * width + (width - 1));
  }

  while (stack.length) {
    const idx = stack.pop();
    if (visited[idx]) continue;
    visited[idx] = 1;
    if (!isDark(idx)) continue;
    buf[idx * channels + 3] = 0; // transparent
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) stack.push(idx - 1);
    if (x < width - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - width);
    if (y < height - 1) stack.push(idx + width);
  }

  return sharp(buf, { raw: { width, height, channels } }).png({ compressionLevel: 9 });
}

async function main() {
  const raw = await sharp(input).png().toBuffer();

  // --- Full logo: transparent bg, trimmed to content ---
  const transparent = await (await removeBackground(raw)).toBuffer();
  const fullLogoPath = join(imagesDir, "logo.png");
  await sharp(transparent)
    .trim({ threshold: 1 })
    .png({ compressionLevel: 9 })
    .toFile(fullLogoPath);

  // --- Crest-only icon: crop the emblem above the wordmark, then square it ---
  // The "ROYVENTO" wordmark begins ~63% down; the crest sits in the top band.
  const full = await sharp(fullLogoPath).metadata();
  const crestHeight = Math.round(full.height * 0.62);
  const crestCrop = await sharp(fullLogoPath)
    .extract({ left: 0, top: 0, width: full.width, height: crestHeight })
    .trim({ threshold: 1 })
    .toBuffer();

  const crestMeta = await sharp(crestCrop).metadata();
  const side = Math.max(crestMeta.width, crestMeta.height);
  const iconPath = join(imagesDir, "logo-icon.png");
  await sharp({
    create: {
      width: side,
      height: side,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: crestCrop, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(iconPath);
  const transparentIcon = await sharp(iconPath).toBuffer();

  // --- Square crest padded onto the brand-dark background (favicons / app icon) ---
  // iOS/Android app icons and small favicons render better with a solid fill
  // than with transparency (transparent app icons show as black on iOS).
  const DARK = { r: 14, g: 13, b: 18, alpha: 1 }; // #0e0d12 — matches splash bg
  const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
  const filledIcon = async (size, pad = 0.1) => {
    const inner = Math.round(size * (1 - pad * 2));
    const innerBuf = await sharp(transparentIcon)
      .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
      .png()
      .toBuffer();
    return sharp({
      create: { width: size, height: size, channels: 4, background: DARK },
    }).composite([{ input: innerBuf, gravity: "center" }]);
  };
  // Transparent crest resized square (for PWA/maskable & web favicons that allow alpha)
  const transparentSquare = (size) =>
    sharp(transparentIcon).resize(size, size, { fit: "contain", background: TRANSPARENT });

  const publicDir = join(root, "public");
  const webAssets = [
    ["favicon-16x16.png", () => filledIcon(16, 0.06)],
    ["favicon-32x32.png", () => filledIcon(32, 0.06)],
    ["favicon-48x48.png", () => filledIcon(48, 0.06)],
    ["apple-touch-icon.png", () => filledIcon(180, 0.12)],
    ["pwa-192x192.png", () => transparentSquare(192)],
    ["pwa-512x512.png", () => transparentSquare(512)],
    ["favicon.png", () => filledIcon(64, 0.06)],
  ];
  for (const [name, make] of webAssets) {
    const pipeline = await make();
    await pipeline.png({ compressionLevel: 9 }).toFile(join(publicDir, name));
  }

  // --- Mobile (Expo) app icon: crest on solid dark, 1024 square ---
  const mobileImages = join(root, "..", "mobile", "assets", "images");
  await (await filledIcon(1024, 0.14)).png({ compressionLevel: 9 }).toFile(join(mobileImages, "icon.png"));
  // Transparent crest for in-app mobile UI (footer, headers)
  await transparentSquare(512).png({ compressionLevel: 9 }).toFile(join(mobileImages, "logo-icon.png"));

  const out1 = await sharp(join(imagesDir, "logo.png")).metadata();
  const out2 = await sharp(iconPath).metadata();
  console.log(`logo.png       ${out1.width}x${out1.height}`);
  console.log(`logo-icon.png  ${out2.width}x${out2.height}`);
  console.log(`favicons + pwa + apple-touch-icon written to public/`);
  console.log(`mobile icon.png (1024) + logo-icon.png (512) written`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
