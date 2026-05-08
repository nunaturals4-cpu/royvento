import { Router, type IRouter, type Request } from "express";
import { db, vendorsTable, eventsTable, blogsTable, drinkPlansTable } from "@workspace/db";
import { and, eq, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

type UrlEntry = {
  loc: string;
  lastmod?: string | undefined;
  changefreq?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
};

function siteOrigin(req: Request): string {
  const appUrl = process.env["APP_URL"];
  if (appUrl) return appUrl.replace(/\/$/, "");
  const replitDomains = process.env["REPLIT_DOMAINS"];
  if (replitDomains) {
    const first = replitDomains.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  const host = req.get("host");
  if (host) {
    const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
    return `${proto}://${host}`;
  }
  return "https://royvento.com";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toIsoDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function renderUrlset(origin: string, urls: UrlEntry[]): string {
  const body = urls
    .map((u) => {
      const parts = [`    <loc>${escapeXml(origin + u.loc)}</loc>`];
      if (u.lastmod) parts.push(`    <lastmod>${escapeXml(u.lastmod)}</lastmod>`);
      if (u.changefreq) parts.push(`    <changefreq>${u.changefreq}</changefreq>`);
      if (typeof u.priority === "number") {
        parts.push(`    <priority>${u.priority.toFixed(1)}</priority>`);
      }
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function renderIndex(origin: string, shards: { loc: string; lastmod?: string }[]): string {
  const body = shards
    .map((s) => {
      const parts = [`    <loc>${escapeXml(origin + s.loc)}</loc>`];
      if (s.lastmod) parts.push(`    <lastmod>${escapeXml(s.lastmod)}</lastmod>`);
      return `  <sitemap>\n${parts.join("\n")}\n  </sitemap>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

function sendXml(res: Parameters<Parameters<typeof router.get>[1]>[1], xml: string): void {
  res
    .status(200)
    .type("application/xml")
    .setHeader("Cache-Control", "public, max-age=600, s-maxage=3600")
    .send(xml);
}

const STATIC_URLS: UrlEntry[] = [
  { loc: "/", changefreq: "daily", priority: 1.0 },
  { loc: "/pubs", changefreq: "daily", priority: 0.9 },
  { loc: "/pub-offers", changefreq: "daily", priority: 0.9 },
  { loc: "/explore", changefreq: "daily", priority: 0.8 },
  { loc: "/vendors", changefreq: "weekly", priority: 0.7 },
  { loc: "/partners", changefreq: "weekly", priority: 0.5 },
  { loc: "/blogs", changefreq: "daily", priority: 0.7 },
  { loc: "/contact", changefreq: "yearly", priority: 0.4 },
  { loc: "/subscription", changefreq: "monthly", priority: 0.5 },
  { loc: "/terms", changefreq: "yearly", priority: 0.2 },
  { loc: "/privacy", changefreq: "yearly", priority: 0.2 },
];

async function maxTimestamp(
  table: "vendors" | "events" | "blogs" | "drink_plans",
): Promise<string | undefined> {
  try {
    const rows = await db.execute<{ max: Date | null }>(
      sql.raw(`SELECT MAX(created_at) AS max FROM ${table}`),
    );
    const r = (rows as unknown as { rows?: { max: Date | null }[] }).rows ?? (rows as unknown as { max: Date | null }[]);
    const first = Array.isArray(r) ? r[0] : undefined;
    return toIsoDate(first?.max ?? null);
  } catch {
    return undefined;
  }
}

router.get("/sitemap-index.xml", async (req, res) => {
  try {
    const origin = siteOrigin(req);
    const now = new Date().toISOString();
    const [vendorsMax, eventsMax, blogsMax, offersMax] = await Promise.all([
      maxTimestamp("vendors"),
      maxTimestamp("events"),
      maxTimestamp("blogs"),
      maxTimestamp("drink_plans"),
    ]);
    const xml = renderIndex(origin, [
      { loc: "/sitemap-static.xml", lastmod: now },
      { loc: "/sitemap-cities.xml", lastmod: now },
      { loc: "/sitemap-pubs.xml", lastmod: vendorsMax ?? now },
      { loc: "/sitemap-events.xml", lastmod: eventsMax ?? now },
      { loc: "/sitemap-offers.xml", lastmod: offersMax ?? now },
      { loc: "/sitemap-blogs.xml", lastmod: blogsMax ?? now },
    ]);
    sendXml(res, xml);
  } catch (err) {
    req.log.error({ err }, "Failed to render sitemap index");
    res.status(500).type("application/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<error/>\n");
  }
});

router.get("/sitemap-static.xml", (req, res) => {
  try {
    sendXml(res, renderUrlset(siteOrigin(req), STATIC_URLS));
  } catch (err) {
    req.log.error({ err }, "Failed to render static sitemap");
    res.status(500).type("application/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<error/>\n");
  }
});

// Programmatic city / locality / category landing pages (Task #566).
// City and category slugs are derived directly from approved vendor data;
// only city/category combos with at least 4 pubs are listed (matches the
// "thin content" noindex threshold in the page templates).
const CITY_ALIASES: Record<string, string> = {
  bengaluru: "bangalore",
  bombay: "mumbai",
  gurugram: "gurgaon",
  calcutta: "kolkata",
};

function slugifyCity(input: string | null | undefined): string {
  if (!input) return "";
  const s = String(input)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return CITY_ALIASES[s] ?? s;
}

const CATEGORY_SLUGS = [
  "rooftop",
  "microbrewery",
  "sports-bar",
  "live-music",
  "couple-friendly",
  "lounge",
  "club",
  "pubs",
];

const THIN_THRESHOLD = 4;

router.get("/sitemap-cities.xml", async (req, res) => {
  try {
    const rows = await db
      .select({
        businessName: vendorsTable.businessName,
        city: vendorsTable.city,
        category: vendorsTable.category,
        address: vendorsTable.address,
        location: vendorsTable.location,
      })
      .from(vendorsTable)
      .where(eq(vendorsTable.status, "approved"))
      .limit(50000);

    const cityCounts = new Map<string, number>();
    const cityCategoryCounts = new Map<string, number>();
    const cityLocalityCounts = new Map<string, number>();

    for (const r of rows) {
      const city = slugifyCity(r.city);
      if (!city) continue;
      cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);

      const blob = `${r.businessName ?? ""} ${r.category ?? ""} ${r.address ?? ""} ${r.location ?? ""}`.toLowerCase();
      for (const cat of CATEGORY_SLUGS) {
        const needle = cat.replace(/-/g, " ");
        if (blob.includes(needle) || (cat === "pubs" && (r.category ?? "").toLowerCase().includes("pub"))) {
          const key = `${city}/${cat}`;
          cityCategoryCounts.set(key, (cityCategoryCounts.get(key) ?? 0) + 1);
        }
      }

      // Derive locality from first useful comma-segment of the address
      const parts = (r.address ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const p of parts) {
        const s = slugifyCity(p);
        if (!s || s === city || s.length < 3 || /^\d/.test(s)) continue;
        const key = `${city}/${s}`;
        cityLocalityCounts.set(key, (cityLocalityCounts.get(key) ?? 0) + 1);
        break;
      }
    }

    const urls: UrlEntry[] = [];
    for (const [city, n] of cityCounts) {
      if (n >= THIN_THRESHOLD) {
        urls.push({ loc: `/${city}`, changefreq: "daily", priority: 0.8 });
      }
    }
    for (const [key, n] of cityLocalityCounts) {
      if (n >= THIN_THRESHOLD) {
        urls.push({ loc: `/${key}`, changefreq: "weekly", priority: 0.7 });
      }
    }
    for (const [key, n] of cityCategoryCounts) {
      if (n >= THIN_THRESHOLD) {
        urls.push({ loc: `/${key}`, changefreq: "weekly", priority: 0.7 });
      }
    }

    sendXml(res, renderUrlset(siteOrigin(req), urls));
  } catch (err) {
    req.log.error({ err }, "Failed to render cities sitemap");
    res.status(500).type("application/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<error/>\n");
  }
});

function buildPubSlugLoc(args: {
  id: number;
  businessName: string | null;
  city: string | null;
}): string {
  const citySeg = slugifyCity(args.city ?? "city") || "city";
  const namePart = slugifyCity(args.businessName ?? "pub") || "pub";
  return `/pubs/${citySeg}/${namePart}-${args.id}`;
}

function buildEventSlugLoc(args: {
  id: number;
  title: string | null;
  city: string | null;
  date: Date | string | null;
}): string {
  const citySeg = slugifyCity(args.city ?? "city") || "city";
  const namePart = slugifyCity(args.title ?? "event") || "event";
  const datePart = args.date
    ? slugifyCity(
        (args.date instanceof Date ? args.date.toISOString() : String(args.date)).slice(0, 10),
      )
    : "";
  const slug = [namePart, datePart].filter(Boolean).join("-");
  return `/events/${citySeg}/${slug}-${args.id}`;
}

router.get("/sitemap-pubs.xml", async (req, res) => {
  try {
    const rows = await db
      .select({
        id: vendorsTable.id,
        businessName: vendorsTable.businessName,
        city: vendorsTable.city,
        approvedAt: vendorsTable.approvedAt,
        createdAt: vendorsTable.createdAt,
      })
      .from(vendorsTable)
      .where(eq(vendorsTable.status, "approved"))
      .orderBy(desc(vendorsTable.id))
      .limit(50000);
    const urls: UrlEntry[] = rows.map((r) => ({
      loc: buildPubSlugLoc({ id: r.id, businessName: r.businessName, city: r.city }),
      lastmod: toIsoDate(r.approvedAt ?? r.createdAt),
      changefreq: "weekly",
      priority: 0.8,
    }));
    sendXml(res, renderUrlset(siteOrigin(req), urls));
  } catch (err) {
    req.log.error({ err }, "Failed to render pubs sitemap");
    res.status(500).type("application/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<error/>\n");
  }
});

router.get("/sitemap-events.xml", async (req, res) => {
  try {
    const rows = await db
      .select({
        id: eventsTable.id,
        title: eventsTable.title,
        city: eventsTable.city,
        eventDate: eventsTable.eventDate,
        createdAt: eventsTable.createdAt,
      })
      .from(eventsTable)
      .where(eq(eventsTable.approvalStatus, "approved"))
      .orderBy(desc(eventsTable.id))
      .limit(50000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const urls: UrlEntry[] = rows
      .filter((r) => {
        if (!r.eventDate) return true;
        const d = new Date(r.eventDate);
        return Number.isNaN(d.getTime()) ? true : d >= today;
      })
      .map((r) => ({
        loc: buildEventSlugLoc({
          id: r.id,
          title: r.title,
          city: r.city,
          date: r.eventDate,
        }),
        lastmod: toIsoDate(r.createdAt),
        changefreq: "daily",
        priority: 0.8,
      }));
    sendXml(res, renderUrlset(siteOrigin(req), urls));
  } catch (err) {
    req.log.error({ err }, "Failed to render events sitemap");
    res.status(500).type("application/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<error/>\n");
  }
});

router.get("/sitemap-offers.xml", async (req, res) => {
  try {
    // Offers don't have per-id detail pages today — they surface on the
    // listing page (/pub-offers) and on each pub's detail page. List the
    // listing page once, then deep-link to each pub that has at least one
    // active drink plan, deduped. When per-offer detail pages exist (future
    // task) this shard expands to include them.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    const rows = await db
      .select({
        vendorId: drinkPlansTable.vendorId,
        businessName: vendorsTable.businessName,
        city: vendorsTable.city,
        lastCreatedAt: sql<Date>`MAX(${drinkPlansTable.createdAt})`.as("last_created_at"),
      })
      .from(drinkPlansTable)
      .innerJoin(vendorsTable, eq(vendorsTable.id, drinkPlansTable.vendorId))
      .where(
        and(
          eq(vendorsTable.status, "approved"),
          sql`(${drinkPlansTable.validUntil} IS NULL OR ${drinkPlansTable.validUntil} >= ${todayStr})`,
        ),
      )
      .groupBy(drinkPlansTable.vendorId, vendorsTable.businessName, vendorsTable.city)
      .limit(50000);
    const offersMax = await maxTimestamp("drink_plans");
    const urls: UrlEntry[] = [
      {
        loc: "/pub-offers",
        lastmod: offersMax,
        changefreq: "daily",
        priority: 0.8,
      },
      ...rows.map((r) => ({
        loc: buildPubSlugLoc({
          id: r.vendorId,
          businessName: r.businessName,
          city: r.city,
        }),
        lastmod: toIsoDate(r.lastCreatedAt),
        changefreq: "weekly" as const,
        priority: 0.6,
      })),
    ];
    sendXml(res, renderUrlset(siteOrigin(req), urls));
  } catch (err) {
    req.log.error({ err }, "Failed to render offers sitemap");
    res.status(500).type("application/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<error/>\n");
  }
});

router.get("/sitemap-blogs.xml", async (req, res) => {
  try {
    const rows = await db
      .select({
        slug: blogsTable.slug,
        createdAt: blogsTable.createdAt,
      })
      .from(blogsTable)
      .where(eq(blogsTable.published, true))
      .orderBy(desc(blogsTable.createdAt))
      .limit(50000);
    const urls: UrlEntry[] = rows.map((r) => ({
      loc: `/blogs/${encodeURIComponent(r.slug)}`,
      lastmod: toIsoDate(r.createdAt),
      changefreq: "monthly",
      priority: 0.6,
    }));
    sendXml(res, renderUrlset(siteOrigin(req), urls));
  } catch (err) {
    req.log.error({ err }, "Failed to render blogs sitemap");
    res.status(500).type("application/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<error/>\n");
  }
});

export default router;
