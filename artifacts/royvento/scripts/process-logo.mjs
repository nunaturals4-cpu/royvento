/**
 * Logo background removal script.
 * Removes the black background from the uploaded Royvento logo PNG,
 * outputs a clean PNG with transparent background.
 *
 * Usage:
 *   1. Save the uploaded logo image as: public/images/logo-raw.png
 *   2. Run: node scripts/process-logo.mjs
 *   3. Output: public/images/logo.png  (transparent background)
 *
 * Requires: sharp  (npm add -D sharp)
 */
import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const input = join(root, "public", "images", "logo-raw.png");
const output = join(root, "public", "images", "logo.png");

// Load the image and convert to raw RGBA
const img = sharp(input).ensureAlpha();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
const buf = Buffer.from(data);

// Make near-black pixels (r+g+b < 60 each) transparent
for (let i = 0; i < width * height; i++) {
  const base = i * channels;
  const r = buf[base];
  const g = buf[base + 1];
  const b = buf[base + 2];
  if (r < 40 && g < 40 && b < 40) {
    buf[base + 3] = 0; // fully transparent
  }
}

await sharp(buf, { raw: { width, height, channels } })
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`Logo saved to ${output}`);
