import { Router, type IRouter } from "express";
import { db, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

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

const CITY_ALIAS_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ["bangalore", "bengaluru"],
  ["mumbai", "bombay"],
  ["gurgaon", "gurugram"],
  ["kolkata", "calcutta"],
  ["chennai", "madras"],
  ["pune", "poona"],
];

function canonicalCitySlug(input: string | null | undefined): string {
  const norm = (input ?? "").trim().toLowerCase();
  if (!norm) return "city";
  const s = slugify(norm);
  for (const group of CITY_ALIAS_GROUPS) {
    if (group.includes(s)) return group[0]!;
  }
  return s || "city";
}

async function vendorRedirect(
  rawId: string,
): Promise<{ status: 301 | 404; location?: string }> {
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) return { status: 404 };
  const rows = await db
    .select({
      id: vendorsTable.id,
      businessName: vendorsTable.businessName,
      city: vendorsTable.city,
    })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, id))
    .limit(1);
  const v = rows[0];
  if (!v) return { status: 404 };
  const citySlug = canonicalCitySlug(v.city);
  const nameSlug = slugify(v.businessName) || "venue";
  return { status: 301, location: `/pubs/${citySlug}/${nameSlug}-${v.id}` };
}

// The artifact.toml claims the `/vendors` and `/partners` prefixes so the
// proxy forwards every path beneath them (not just `/:id`). Redirect the
// bare listing URLs to the canonical SPA listing so we don't accidentally
// 404 traffic that used to hit the SPA's listing page.
router.get("/vendors", (_req, res) => {
  res.redirect(301, "/pubs");
});
router.get("/partners", (_req, res) => {
  res.redirect(301, "/pubs");
});

router.get("/vendors/:id", async (req, res) => {
  const result = await vendorRedirect(String(req.params.id ?? ""));
  if (result.status === 404 || !result.location) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  res.redirect(301, result.location);
});

router.get("/partners/:id", async (req, res) => {
  const result = await vendorRedirect(String(req.params.id ?? ""));
  if (result.status === 404 || !result.location) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  res.redirect(301, result.location);
});

export default router;
