/**
 * One-shot production repair used by POST /api/admin/repair-prod-media.
 *
 * Does two safe, idempotent things:
 *
 *  1) BROKEN IMAGES — five Unsplash photo IDs that were baked into the original
 *     seed data have since started returning 404. They are persisted in prod
 *     rows (vendor galleries / dance-floor / menu, event galleries). This
 *     rewrites every occurrence to a verified-working photo ID, preserving the
 *     original `?w=…&q=…` query so sizes are unchanged.
 *
 *  2) SECTION SPREAD — the pubs page renders one section per vendor `category`
 *     (Pub → "Pubs & Bars", Club → "Nightclubs", Lounge → "Lounges"). When every
 *     approved pub shares one category only a single section appears. This cycles
 *     approved pub-type vendors (ordered by id) through Pub / Club / Lounge so the
 *     existing venues spread across sections. Deterministic ⇒ re-running is a
 *     no-op.
 *
 * SAFE / IDEMPOTENT: only known-dead URLs are touched (working images are left
 * exactly as the partner set them), and category assignment is a pure function of
 * the row's sort position, so a second run changes nothing.
 */
import { db, vendorsTable, eventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Dead Unsplash photo IDs → verified-working replacements (HTTP 200 as of the
// repair date). Matched on the `photo-…` token so the width/quality query is
// preserved when the token is swapped in place.
const DEAD_TO_GOOD: Record<string, string> = {
  "photo-1485872299712-d4fd9b96d0a6": "photo-1438557068880-c5f474830377",
  "photo-1571266028243-d220c6e6f9bd": "photo-1516450360452-9312f5e86fc7",
  "photo-1601481712810-8b09e0a3df93": "photo-1546171753-97d7676e4602",
  "photo-1574391884720-bbc049ec09ad": "photo-1551776235-dde6d482980b",
  "photo-1583244532610-2a234a0f0e89": "photo-1492684223066-81342ee5ff30",
};

// Sections to cycle approved pub vendors through (matches PUB_CATEGORY_SECTIONS
// on the pubs page).
const SECTION_CATEGORIES = ["Pub", "Club", "Lounge"] as const;

/** Rewrite a single URL if it contains a dead photo id. Returns [url, changed]. */
function fixUrl(u: string | null | undefined): [typeof u, boolean] {
  if (!u) return [u, false];
  let out = u;
  for (const [dead, good] of Object.entries(DEAD_TO_GOOD)) {
    if (out.includes(dead)) out = out.split(dead).join(good);
  }
  return [out as typeof u, out !== u];
}

/** Rewrite every dead url in an array. Returns [array, changed]. */
function fixArr(arr: string[] | null | undefined): [string[] | null | undefined, boolean] {
  if (!arr || arr.length === 0) return [arr, false];
  let changed = false;
  const out = arr.map((u) => {
    const [v, c] = fixUrl(u);
    if (c) changed = true;
    return v as string;
  });
  return [out, changed];
}

export type RepairProdMediaReport = {
  vendorsScanned: number;
  eventsScanned: number;
  vendorImagesFixed: number;
  eventImagesFixed: number;
  recategorized: Array<{ vendorId: number; businessName: string; category: string }>;
};

export async function repairProdMedia(): Promise<RepairProdMediaReport> {
  const report: RepairProdMediaReport = {
    vendorsScanned: 0,
    eventsScanned: 0,
    vendorImagesFixed: 0,
    eventImagesFixed: 0,
    recategorized: [],
  };

  // ── 1a. Repair broken images on vendors ─────────────────────────────────────
  const vendors = await db.select().from(vendorsTable);
  report.vendorsScanned = vendors.length;
  for (const v of vendors) {
    const patch: Partial<typeof vendorsTable.$inferInsert> = {};
    let changed = false;

    const [cover, c1] = fixUrl(v.coverImageUrl);
    if (c1) { patch.coverImageUrl = cover ?? undefined; changed = true; }
    const [banner, c2] = fixUrl(v.bannerImage);
    if (c2) { patch.bannerImage = banner ?? undefined; changed = true; }
    const [menu, c3] = fixUrl(v.menuUrl);
    if (c3) { patch.menuUrl = menu ?? undefined; changed = true; }
    const [portfolio, c4] = fixArr(v.portfolioImages);
    if (c4) { patch.portfolioImages = portfolio ?? undefined; changed = true; }
    const [floor, c5] = fixArr(v.danceFloorPhotos);
    if (c5) { patch.danceFloorPhotos = floor ?? undefined; changed = true; }
    const [menus, c6] = fixArr(v.menuUrls);
    if (c6) { patch.menuUrls = menus ?? undefined; changed = true; }

    if (changed) {
      await db.update(vendorsTable).set(patch).where(eq(vendorsTable.id, v.id));
      report.vendorImagesFixed++;
    }
  }

  // ── 1b. Repair broken images on events ──────────────────────────────────────
  const events = await db.select().from(eventsTable);
  report.eventsScanned = events.length;
  for (const e of events) {
    const patch: Partial<typeof eventsTable.$inferInsert> = {};
    let changed = false;

    const [img, c1] = fixUrl(e.imageUrl);
    if (c1) { patch.imageUrl = img ?? undefined; changed = true; }
    const [gallery, c2] = fixArr(e.galleryImages);
    if (c2) { patch.galleryImages = gallery ?? undefined; changed = true; }

    if (changed) {
      await db.update(eventsTable).set(patch).where(eq(eventsTable.id, e.id));
      report.eventImagesFixed++;
    }
  }

  // ── 2. Spread approved pub vendors across category sections ─────────────────
  // Ordered by id so assignment is deterministic (idempotent across re-runs).
  const pubVendors = vendors
    .filter((v) => v.status === "approved")
    .sort((a, b) => a.id - b.id);
  for (let i = 0; i < pubVendors.length; i++) {
    const v = pubVendors[i]!;
    const category = SECTION_CATEGORIES[i % SECTION_CATEGORIES.length]!;
    if (v.category !== category) {
      await db.update(vendorsTable).set({ category }).where(eq(vendorsTable.id, v.id));
    }
    report.recategorized.push({ vendorId: v.id, businessName: v.businessName, category });
  }

  return report;
}
