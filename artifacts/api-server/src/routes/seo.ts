import { Router, type IRouter } from "express";
import { db, vendorsTable, seoPagesTable } from "@workspace/db";
import { and, eq, ilike, or, isNull, desc, type SQL } from "drizzle-orm";
import { z } from "zod";
import { UpsertSeoPageBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { getVendorRatings } from "../lib/aggregates";

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
  for (const p of parts.slice(0, 3)) {
    if (/^\d+$/.test(p)) continue;
    if (/^\d{5,7}$/.test(p)) continue;
    if (p.length < 3) continue;
    return p;
  }
  return parts[0] ?? null;
}

type VendorRow = typeof vendorsTable.$inferSelect;

async function vendorRowsToSummaries(rows: VendorRow[]) {
  if (rows.length === 0) return [];
  const ratings = await getVendorRatings(rows.map((r) => r.id));
  return rows.map((v) => {
    const r = ratings.get(v.id) ?? { rating: 0, reviewCount: 0 };
    return {
      id: v.id,
      businessName: v.businessName,
      category: v.category,
      city: v.city ?? null,
      state: v.state ?? null,
      address: v.address ?? null,
      bannerImage: v.bannerImage ?? "",
      rating: r.rating,
      reviewCount: r.reviewCount,
    };
  });
}

function cityWhereClause(citySlug: string): SQL | undefined {
  const variants = expandCityAliases(citySlug);
  const conds = variants.map((v) => ilike(vendorsTable.city, `%${v}%`));
  if (conds.length === 0) return undefined;
  if (conds.length === 1) return conds[0]!;
  return or(...conds);
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

// ─── Category keyword matching (keep server in sync with frontend) ──────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  rooftop: ["rooftop"],
  microbrewery: ["microbrewery", "brewery"],
  "sports-bar": ["sports bar", "sports-bar", "sports"],
  "live-music": ["live music", "live-music", "gig"],
  "couple-friendly": ["couple", "date", "romantic"],
  lounge: ["lounge"],
  club: ["nightclub", "club"],
  pubs: ["pub", "bar"],
};

function vendorMatchesCategory(v: VendorRow, categorySlug: string): boolean {
  const keywords = CATEGORY_KEYWORDS[categorySlug];
  if (!keywords) return false;
  const haystack = `${v.category ?? ""} ${v.description ?? ""}`.toLowerCase();
  return keywords.some((k) => haystack.includes(k));
}

// ─── /cities/:citySlug/summary (aggregation) ────────────────────────────────

router.get("/cities/:citySlug/summary", async (req, res) => {
  const slug = String(req.params.citySlug ?? "").toLowerCase();
  if (!slug) {
    res.status(400).json({ error: "Invalid city slug" });
    return;
  }
  const cityWhere = cityWhereClause(slug);
  if (!cityWhere) {
    res.status(400).json({ error: "Invalid city slug" });
    return;
  }

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
    for (const cat of Object.keys(CATEGORY_KEYWORDS)) {
      if (vendorMatchesCategory(v, cat)) {
        categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
      }
    }
  }

  const topVendors = await vendorRowsToSummaries(rows.slice(0, 12));

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

// ─── /cities/:citySlug/localities/:localitySlug ─────────────────────────────

router.get("/cities/:citySlug/localities/:localitySlug", async (req, res) => {
  const citySlug = String(req.params.citySlug ?? "").toLowerCase();
  const localitySlug = String(req.params.localitySlug ?? "").toLowerCase();
  if (!citySlug || !localitySlug) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }
  const cityWhere = cityWhereClause(citySlug);
  if (!cityWhere) {
    res.status(400).json({ error: "Invalid city slug" });
    return;
  }
  const rows = await db
    .select()
    .from(vendorsTable)
    .where(and(eq(vendorsTable.status, "approved"), cityWhere))
    .orderBy(desc(vendorsTable.createdAt))
    .limit(500);

  let localityName = localitySlug.replace(/-/g, " ");
  const filtered = rows.filter((v) => {
    const loc = localityFromAddress(v.address);
    if (!loc) return false;
    if (slugify(loc) !== localitySlug) return false;
    localityName = loc;
    return true;
  });

  const topVendors = await vendorRowsToSummaries(filtered.slice(0, 24));

  res.json({
    citySlug,
    canonicalCity: canonicalCity(citySlug),
    localitySlug,
    localityName,
    vendorCount: filtered.length,
    topVendors,
  });
});

// ─── /cities/:citySlug/categories/:categorySlug ─────────────────────────────

router.get("/cities/:citySlug/categories/:categorySlug", async (req, res) => {
  const citySlug = String(req.params.citySlug ?? "").toLowerCase();
  const categorySlug = String(req.params.categorySlug ?? "").toLowerCase();
  if (!citySlug || !categorySlug) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }
  if (!CATEGORY_KEYWORDS[categorySlug]) {
    res.status(400).json({ error: "Unknown category" });
    return;
  }
  const cityWhere = cityWhereClause(citySlug);
  if (!cityWhere) {
    res.status(400).json({ error: "Invalid city slug" });
    return;
  }
  const rows = await db
    .select()
    .from(vendorsTable)
    .where(and(eq(vendorsTable.status, "approved"), cityWhere))
    .orderBy(desc(vendorsTable.createdAt))
    .limit(500);

  const filtered = rows.filter((v) => vendorMatchesCategory(v, categorySlug));
  const topVendors = await vendorRowsToSummaries(filtered.slice(0, 24));

  res.json({
    citySlug,
    canonicalCity: canonicalCity(citySlug),
    categorySlug,
    vendorCount: filtered.length,
    topVendors,
  });
});

export default router;
