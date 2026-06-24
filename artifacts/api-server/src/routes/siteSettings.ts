import { Router, type IRouter } from "express";
import { db, siteSettingsTable } from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { respondInvalid } from "../lib/validationError";

const router: IRouter = Router();

// site_settings key holding the JSON array of primary-nav item keys the admin
// has hidden site-wide (e.g. ["pubs","games"]). The canonical list of valid
// keys lives in the web app (lib/navItems.ts); the server stores whatever the
// admin sends and the navbar only hides items whose key matches, so unknown
// keys are harmless. We still cap the array to keep the row small.
const HIDDEN_NAV_LINKS_KEY = "hidden_nav_links";

async function readHiddenNavLinks(): Promise<string[]> {
  const rows = await db.select().from(siteSettingsTable);
  const raw = rows.find((r) => r.key === HIDDEN_NAV_LINKS_KEY)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Public: small payload the navbar reads on load. Cached briefly so it's cheap
// to poll but still reflects admin changes within a minute.
router.get("/site-settings", async (_req, res) => {
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
  try {
    return res.json({ hiddenNavLinks: await readHiddenNavLinks() });
  } catch {
    // Never break page render on a settings read failure — default to all shown.
    return res.json({ hiddenNavLinks: [] });
  }
});

const UpdateBody = z.object({
  hiddenNavLinks: z.array(z.string().min(1).max(64)).max(50),
});

// Admin: replace the full set of hidden nav-link keys.
router.patch("/admin/site-settings", requireAuth(["admin"]), async (req, res) => {
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);

  // Dedupe before storing.
  const value = JSON.stringify([...new Set(parsed.data.hiddenNavLinks)]);
  await db
    .insert(siteSettingsTable)
    .values({ key: HIDDEN_NAV_LINKS_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });

  return res.json({ hiddenNavLinks: await readHiddenNavLinks() });
});

export default router;
