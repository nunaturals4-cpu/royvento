/**
 * One-off backfill: rewrite follow-notification deep links that still point at
 * the old /pubs venue-profile URL (or an /events URL with the wrong city) to the
 * canonical pub-EVENT URL with the right section (?to=offers|happyhours).
 *
 * Idempotent — safe to run repeatedly. After it runs, no rows match, so a second
 * run is a no-op.
 *
 *   Local:  pnpm --filter @workspace/api-server exec tsx --env-file=.env.local src/scripts/backfillFollowNotifUrls.ts
 *   Prod:   run the same with the prod DATABASE_URL in the environment.
 */
import { db, notificationsTable, notificationQueueTable, eventsTable, vendorsTable } from "@workspace/db";
import { and, eq, desc, like, or } from "drizzle-orm";

function slugify(input: string | null | undefined): string {
  if (!input) return "";
  return String(input).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const CITY_ALIASES: Record<string, string> = { bengaluru: "bangalore", bombay: "mumbai", gurugram: "gurgaon", calcutta: "kolkata", madras: "chennai", poona: "pune" };
function citySlug(s: string | null | undefined): string {
  const x = slugify(s ?? ""); return CITY_ALIASES[x] ?? (x || "city");
}
function toFor(type: string): "offers" | "happyhours" {
  return type === "follow_food_drink" ? "offers" : "happyhours";
}
function trailingId(url: string): number | null {
  const m = /-(\d+)(?:[?#/].*)?$/.exec(url);
  return m ? Number(m[1]) : null;
}

// Resolve the canonical pub-event URL for a vendor id.
async function eventUrlForVendor(vendorId: number, to: "offers" | "happyhours"): Promise<string | null> {
  const [ev] = await db
    .select({ id: eventsTable.id, title: eventsTable.title, city: eventsTable.city })
    .from(eventsTable)
    .where(and(eq(eventsTable.vendorId, vendorId), eq(eventsTable.type, "pub"), eq(eventsTable.approvalStatus, "approved"), eq(eventsTable.hidden, false)))
    .orderBy(desc(eventsTable.createdAt))
    .limit(1);
  if (!ev) return null;
  return `/events/${citySlug(ev.city)}/${slugify(ev.title) || "pub"}-${ev.id}?to=${to}`;
}

// Given an old /events URL (possibly wrong city), rebuild it canonically.
async function rebuildEventUrl(eventId: number, to: "offers" | "happyhours"): Promise<string | null> {
  const [ev] = await db.select({ id: eventsTable.id, title: eventsTable.title, city: eventsTable.city }).from(eventsTable).where(eq(eventsTable.id, eventId)).limit(1);
  if (!ev) return null;
  return `/events/${citySlug(ev.city)}/${slugify(ev.title) || "pub"}-${ev.id}?to=${to}`;
}

async function resolveNewUrl(type: string, url: string): Promise<string | null> {
  const to = toFor(type);
  const id = trailingId(url);
  if (!id) return null;
  if (url.startsWith("/pubs/")) return eventUrlForVendor(id, to); // id = vendorId
  if (url.startsWith("/events/")) return rebuildEventUrl(id, to); // id = eventId
  return null;
}

async function backfillTable(table: typeof notificationsTable | typeof notificationQueueTable, label: string) {
  const rows = await db
    .select({ id: table.id, type: table.type, url: table.url })
    .from(table)
    .where(and(like(table.type, "follow_%"), or(like(table.url, "/pubs/%"), like(table.url, "/events/%"))));
  let changed = 0;
  for (const r of rows) {
    const next = await resolveNewUrl(r.type, r.url);
    if (next && next !== r.url) {
      await db.update(table).set({ url: next }).where(eq(table.id, r.id));
      changed++;
      console.log(`  [${label} #${r.id}] ${r.url}  →  ${next}`);
    }
  }
  console.log(`${label}: ${changed}/${rows.length} rows updated.`);
}

async function main() {
  // Touch vendorsTable so the import is used even if no /pubs rows exist.
  void vendorsTable;
  console.log("Backfilling notifications…");
  await backfillTable(notificationsTable, "notifications");
  console.log("Backfilling notification_queue…");
  await backfillTable(notificationQueueTable, "notification_queue");
  console.log("Done.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
