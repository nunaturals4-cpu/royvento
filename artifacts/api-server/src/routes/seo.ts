import { Router, type IRouter } from "express";
import { db, vendorsTable, seoPagesTable } from "@workspace/db";
import { and, eq, ilike, or, sql, isNull, desc } from "drizzle-orm";
import { z } from "zod";
import { UpsertSeoPageBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// Mirror of artifacts/royvento/src/lib/seo-slug.ts CITY_ALIASES.
// First entry in each group is the canonical slug (matches frontend
// canonicalCitySlug() target in artifacts/royvento/src/lib/seo-slug.ts).
const CITY_ALIAS_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ["bangalore", "bengaluru"],
  ["mumbai", "bombay"],
  ["gurgaon", "gurugram"],
  ["kolkata", "calcutta"],
  ["chennai", "madras"],
  ["pune", "poona"],
];

function expandCityAliases(input: string): string[] {
  const norm = input.trim().toLowerCase();
  if (!norm) return [];
  for (const group of CITY_ALIAS_GROUPS) {
    if (group.includes(norm)) return [...group];
  }
  return [norm];
}

function canonicalCity(input: string): string {
  const norm = input.trim().toLowerCase();
  for (const group of CITY_ALIAS_GROUPS) {
    if (group.includes(norm)) return group[0]!;
  }
  return norm;
}

function slugify(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function localityFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  // Heuristic: first non-numeric, non-pin-code segment after the street name.
  for (const p of parts.slice(0, 3)) {
    if (/^\d+$/.test(p)) continue;
    if (/^\d{5,7}$/.test(p)) continue;
    if (p.length < 3) continue;
    return p;
  }
  return parts[0] ?? null;
}

// ─── /seo-pages (editorial overrides) ───────────────────────────────────────

const GetSeoPageQuery = z.object({
  template: z.enum(["city", "locality", "category"]),
  citySlug: z.string().min(1),
  secondSlug: z.string().optional(),
});

router.get("/seo-pages", async (req, res) => {
  const parsed = GetSeoPageQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const { template, citySlug, secondSlug } = parsed.data;
  const second = secondSlug ?? null;
  const where = and(
    eq(seoPagesTable.template, template),
    eq(seoPagesTable.citySlug, citySlug),
    second === null
      ? isNull(seoPagesTable.secondSlug)
      : eq(seoPagesTable.secondSlug, second),
  );
  const rows = await db.select().from(seoPagesTable).where(where).limit(1);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    id: row.id,
    template: row.template,
    citySlug: row.citySlug,
    secondSlug: row.secondSlug,
    title: row.title,
    metaDescription: row.metaDescription,
    introMd: row.introMd,
    faqs: row.faqs,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  });
});

router.put("/seo-pages", requireAuth(["admin"]), async (req, res) => {
  const parsed = UpsertSeoPageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;
  const second = body.secondSlug ?? null;
  // Manual upsert (NULL second_slug doesn't play nicely with onConflict on
  // older Postgres). Try update, fall back to insert.
  const updated = await db
    .update(seoPagesTable)
    .set({
      title: body.title ?? null,
      metaDescription: body.metaDescription ?? null,
      introMd: body.introMd,
      faqs: body.faqs,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(seoPagesTable.template, body.template),
        eq(seoPagesTable.citySlug, body.citySlug),
        second === null
          ? isNull(seoPagesTable.secondSlug)
          : eq(seoPagesTable.secondSlug, second),
      ),
    )
    .returning();

  let row = updated[0];
  if (!row) {
    const inserted = await db
      .insert(seoPagesTable)
      .values({
        template: body.template,
        citySlug: body.citySlug,
        secondSlug: second,
        title: body.title ?? null,
        metaDescription: body.metaDescription ?? null,
        introMd: body.introMd,
        faqs: body.faqs,
      })
      .returning();
    row = inserted[0]!;
  }

  res.json({
    id: row.id,
    template: row.template,
    citySlug: row.citySlug,
    secondSlug: row.secondSlug,
    title: row.title,
    metaDescription: row.metaDescription,
    introMd: row.introMd,
    faqs: row.faqs,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  });
});

// ─── /cities/:citySlug/summary (aggregation) ────────────────────────────────

const KNOWN_CATEGORIES = [
  "rooftop",
  "microbrewery",
  "sports-bar",
  "live-music",
  "couple-friendly",
  "lounge",
  "club",
  "pubs",
];

router.get("/cities/:citySlug/summary", async (req, res) => {
  const slug = String(req.params.citySlug ?? "").toLowerCase();
  if (!slug) {
    res.status(400).json({ error: "Invalid city slug" });
    return;
  }
  const variants = expandCityAliases(slug);
  const cityConds = variants.map((v) => ilike(vendorsTable.city, `%${v}%`));
  const cityWhere = cityConds.length === 1 ? cityConds[0]! : or(...cityConds)!;

  const rows = await db
    .select()
    .from(vendorsTable)
    .where(and(eq(vendorsTable.status, "approved"), cityWhere))
    .orderBy(desc(vendorsTable.createdAt))
    .limit(500);

  const localityMap = new Map<string, { slug: string; name: string; count: number }>();
  const categoryMap = new Map<string, number>();
  for (const v of rows) {
    const loc = localityFromAddress(v.address);
    if (loc) {
      const ls = slugify(loc);
      if (ls) {
        const existing = localityMap.get(ls);
        if (existing) existing.count += 1;
        else localityMap.set(ls, { slug: ls, name: loc, count: 1 });
      }
    }
    if (v.category) {
      const haystack = `${v.category} ${v.description ?? ""}`.toLowerCase();
      for (const cat of KNOWN_CATEGORIES) {
        const needle = cat.replace(/-/g, " ");
        if (haystack.includes(needle)) {
          categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
        }
      }
    }
  }

  // Reuse the existing /vendors serialization shape minimally — return the
  // top 12 raw rows; client can re-fetch full details if needed.
  const topVendors = rows.slice(0, 12).map((v) => ({
    id: v.id,
    userId: v.userId,
    businessName: v.businessName,
    category: v.category,
    description: v.description,
    location: v.location,
    country: v.country ?? null,
    state: v.state ?? null,
    city: v.city ?? null,
    address: v.address ?? null,
    bannerImage: v.bannerImage ?? "",
    galleryImages: (v as any).galleryImages ?? [],
    instagramUrl: (v as any).instagramUrl ?? "",
    websiteUrl: (v as any).websiteUrl ?? "",
    googlePlaceUrl: (v as any).googlePlaceUrl ?? "",
    status: v.status,
  }));

  res.json({
    citySlug: slug,
    canonicalCity: canonicalCity(slug),
    vendorCount: rows.length,
    localityCounts: [...localityMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 30),
    categoryCounts: [...categoryMap.entries()]
      .map(([s, count]) => ({ slug: s, count }))
      .sort((a, b) => b.count - a.count),
    topVendors,
  });
});

export default router;
