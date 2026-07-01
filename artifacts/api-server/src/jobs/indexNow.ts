import { db, vendorsTable, eventsTable, blogsTable, siteSettingsTable } from "@workspace/db";
import { and, eq, gt, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { submitUrls, indexNowOrigin } from "../lib/indexNow";

/**
 * Delta IndexNow sweep. Submits only content created since the last run
 * (tracked by max-id high-water marks in site_settings) so we follow IndexNow
 * etiquette of pinging changed URLs, not resubmitting the whole catalog every
 * time. On the very first run (no marks) it bootstraps by submitting the
 * current public catalog + the key static/vertical pages once.
 *
 * Self-contained: reads only public, already-indexable content. Touches no
 * approval/business-logic handler. Safe to run frequently (cheap, id-indexed).
 */

const MARK_VENDOR = "indexnow_vendor_max_id";
const MARK_EVENT = "indexnow_event_max_id";
const MARK_BLOG = "indexnow_blog_max_id";

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
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return CITY_ALIASES[s] ?? s;
}

function pubUrl(origin: string, id: number, businessName: string | null, city: string | null): string {
  const citySeg = slugifyCity(city) || "city";
  const namePart = slugifyCity(businessName) || "pub";
  return `${origin}/pubs/${citySeg}/${namePart}-${id}`;
}

function eventUrl(origin: string, id: number, title: string | null, city: string | null, date: string | Date | null): string {
  const citySeg = slugifyCity(city) || "city";
  const namePart = slugifyCity(title) || "event";
  const datePart = date
    ? slugifyCity((date instanceof Date ? date.toISOString() : String(date)).slice(0, 10))
    : "";
  const slug = [namePart, datePart].filter(Boolean).join("-");
  return `${origin}/events/${citySeg}/${slug}-${id}`;
}

const STATIC_PAGES = [
  "/", "/pubs", "/pub-offers", "/events", "/games",
  "/private-parties", "/solo-connect", "/tonight-plans", "/blogs",
];

async function readMark(key: string): Promise<number> {
  const rows = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, key)).limit(1);
  const n = rows[0]?.value ? Number(rows[0].value) : 0;
  return Number.isFinite(n) ? n : 0;
}

async function writeMark(key: string, value: number): Promise<void> {
  await db
    .insert(siteSettingsTable)
    .values({ key, value: String(value) })
    .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value: String(value), updatedAt: new Date() } });
}

export async function runIndexNowSweep(): Promise<void> {
  if (process.env["NODE_ENV"] !== "production") return;
  try {
    const origin = indexNowOrigin();
    const [vMark, eMark, bMark] = await Promise.all([
      readMark(MARK_VENDOR),
      readMark(MARK_EVENT),
      readMark(MARK_BLOG),
    ]);
    const firstRun = vMark === 0 && eMark === 0 && bMark === 0;

    const [vendors, events, blogs] = await Promise.all([
      db
        .select({ id: vendorsTable.id, businessName: vendorsTable.businessName, city: vendorsTable.city })
        .from(vendorsTable)
        .where(and(eq(vendorsTable.status, "approved"), eq(vendorsTable.hidden, false), gt(vendorsTable.id, vMark)))
        .orderBy(desc(vendorsTable.id))
        .limit(5000),
      db
        .select({ id: eventsTable.id, title: eventsTable.title, city: eventsTable.city, eventDate: eventsTable.eventDate })
        .from(eventsTable)
        .where(and(eq(eventsTable.approvalStatus, "approved"), eq(eventsTable.hidden, false), gt(eventsTable.id, eMark)))
        .orderBy(desc(eventsTable.id))
        .limit(5000),
      db
        .select({ id: blogsTable.id, slug: blogsTable.slug })
        .from(blogsTable)
        .where(and(eq(blogsTable.published, true), gt(blogsTable.id, bMark)))
        .orderBy(desc(blogsTable.id))
        .limit(5000),
    ]);

    const urls: string[] = [];
    if (firstRun) urls.push(...STATIC_PAGES.map((p) => `${origin}${p}`));
    for (const v of vendors) urls.push(pubUrl(origin, v.id, v.businessName, v.city));
    for (const e of events) urls.push(eventUrl(origin, e.id, e.title, e.city, e.eventDate));
    for (const b of blogs) urls.push(`${origin}/blogs/${encodeURIComponent(b.slug)}`);

    if (urls.length === 0) return; // nothing new

    const ok = await submitUrls(urls);
    if (!ok) return; // don't advance marks on failure — retried next run

    // Advance high-water marks to the newest ids we just submitted.
    const maxId = (rows: { id: number }[], fallback: number) =>
      rows.reduce((m, r) => Math.max(m, r.id), fallback);
    await Promise.all([
      vendors.length ? writeMark(MARK_VENDOR, maxId(vendors, vMark)) : Promise.resolve(),
      events.length ? writeMark(MARK_EVENT, maxId(events, eMark)) : Promise.resolve(),
      blogs.length ? writeMark(MARK_BLOG, maxId(blogs, bMark)) : Promise.resolve(),
    ]);
    logger.info(
      { vendors: vendors.length, events: events.length, blogs: blogs.length, firstRun },
      "IndexNow sweep submitted",
    );
  } catch (err) {
    logger.warn({ err }, "IndexNow sweep failed (non-fatal)");
  }
}
