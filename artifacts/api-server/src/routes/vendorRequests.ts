import { Router, type IRouter } from "express";
import {
  db,
  vendorRequestsTable,
  usersTable,
  vendorsTable,
  organizersTable,
  gameOrganizersTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { respondInvalid } from "../lib/validationError";
import { createUserNotification } from "../lib/notify";
import { sendPartnerRequestApprovedEmail } from "../lib/notifications";
import { generateUniqueTicketPrefix, generateTicketSalt } from "../lib/ticketCode";

const router: IRouter = Router();

// Partner categories that should unlock the Event Organizer vertical (organizer
// role + organizer dashboard) instead of the pub/club vendor dashboard. Kept as
// a set so future organizer-style categories can be added in one place.
const ORGANIZER_CATEGORIES = new Set<string>(["Event Organizer"]);

// Partner categories that unlock the Game Organizer vertical (game_organizer
// role + game organizer dashboard) for gaming businesses.
const GAME_ORGANIZER_CATEGORIES = new Set<string>(["Game Organizer"]);

async function uniqueGameOrganizerSlug(base: string): Promise<string> {
  const root = slugifyOrganizer(base) || "game-zone";
  let candidate = root;
  let n = 1;
  while (true) {
    const rows = await db
      .select({ id: gameOrganizersTable.id })
      .from(gameOrganizersTable)
      .where(eq(gameOrganizersTable.slug, candidate))
      .limit(1);
    if (!rows[0]) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

function slugifyOrganizer(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

// Generate a slug that no other organizer holds. The organizers table has a
// unique index on `slug`, so two blank/duplicate slugs would collide — we must
// resolve a unique value before inserting.
async function uniqueOrganizerSlug(base: string): Promise<string> {
  const root = slugifyOrganizer(base) || "organizer";
  let candidate = root;
  let n = 1;
  while (true) {
    const rows = await db
      .select({ id: organizersTable.id })
      .from(organizersTable)
      .where(eq(organizersTable.slug, candidate))
      .limit(1);
    if (!rows[0]) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

const CreateBody = z.object({
  businessName: z.string().min(1).max(255),
  category: z.string().min(1).max(100),
  message: z.string().max(2000).optional().default(""),
  country: z.string().max(100).optional().default(""),
  state: z.string().max(100).optional().default(""),
  city: z.string().max(100).optional().default(""),
});

async function joinUser(rows: { userId: number }[]) {
  if (rows.length === 0) return new Map<number, { name: string; email: string; phone: string }>();
  const ids = Array.from(new Set(rows.map((r) => r.userId)));
  const users = await db.select().from(usersTable);
  const map = new Map<number, { name: string; email: string; phone: string }>();
  for (const u of users) {
    if (ids.includes(u.id)) map.set(u.id, { name: u.name, email: u.email, phone: u.phone });
  }
  return map;
}

router.post("/vendor-requests", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.role !== "user") {
    res.status(400).json({ error: "Only standard users can request vendor access" });
    return;
  }
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const existing = await db
    .select()
    .from(vendorRequestsTable)
    .where(
      and(
        eq(vendorRequestsTable.userId, user.id),
        eq(vendorRequestsTable.status, "pending"),
      ),
    )
    .limit(1);
  if (existing[0]) {
    res.status(409).json({ error: "You already have a pending request" });
    return;
  }
  const locationParts = [parsed.data.city, parsed.data.state, parsed.data.country].filter(Boolean);
  const locationLine = locationParts.length > 0 ? `Location: ${locationParts.join(", ")}` : "";
  const fullMessage = [parsed.data.message, locationLine].filter(Boolean).join("\n");
  const [created] = await db
    .insert(vendorRequestsTable)
    .values({
      userId: user.id,
      businessName: parsed.data.businessName,
      category: parsed.data.category,
      message: fullMessage,
      status: "pending",
    })
    .returning();
  res.json(created);
});

router.get("/vendor-requests/me", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db
    .select()
    .from(vendorRequestsTable)
    .where(eq(vendorRequestsTable.userId, user.id))
    .orderBy(desc(vendorRequestsTable.createdAt))
    .limit(1);
  res.json({ request: rows[0] ?? null });
});

router.get("/admin/vendor-requests", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(vendorRequestsTable)
    .orderBy(desc(vendorRequestsTable.createdAt));
  const userMap = await joinUser(rows);
  res.json(
    rows.map((r) => ({
      ...r,
      user: userMap.get(r.userId) ?? { name: "", email: "", phone: "" },
    })),
  );
});

router.post(
  "/admin/vendor-requests/:id/approve",
  requireAuth(["admin"]),
  async (req, res) => {
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const rows = await db
      .select()
      .from(vendorRequestsTable)
      .where(eq(vendorRequestsTable.id, id))
      .limit(1);
    const r = rows[0];
    if (!r) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db
      .update(vendorRequestsTable)
      .set({ status: "approved" })
      .where(eq(vendorRequestsTable.id, id));

    // Unified partner onboarding: the requested category decides which role +
    // profile + dashboard the applicant unlocks. "Event Organizer" applicants
    // get the organizer vertical; everyone else gets the pub/club vendor flow.
    const isOrganizer = ORGANIZER_CATEGORIES.has(r.category);
    const isGameOrganizer = GAME_ORGANIZER_CATEGORIES.has(r.category);
    const dashboardUrl = isGameOrganizer
      ? "/dashboard/game-organizer"
      : isOrganizer
        ? "/dashboard/organizer"
        : "/dashboard/vendor";

    if (isGameOrganizer) {
      // Promote to game_organizer role and auto-create the game organizer
      // profile so the dashboard + role gating unlock immediately on approval.
      await db
        .update(usersTable)
        .set({ role: "game_organizer" })
        .where(eq(usersTable.id, r.userId));
      const existingGameOrg = await db
        .select()
        .from(gameOrganizersTable)
        .where(eq(gameOrganizersTable.userId, r.userId))
        .limit(1);
      if (!existingGameOrg[0]) {
        const slug = await uniqueGameOrganizerSlug(r.businessName);
        const usedPrefixes = (
          await db.select({ p: gameOrganizersTable.ticketPrefix }).from(gameOrganizersTable)
        )
          .map((row) => row.p)
          .filter((p): p is string => Boolean(p));
        const ticketPrefix = await generateUniqueTicketPrefix(r.businessName, usedPrefixes);
        const ticketSalt = generateTicketSalt();
        await db.insert(gameOrganizersTable).values({
          userId: r.userId,
          name: r.businessName,
          slug,
          status: "approved",
          approvedAt: new Date(),
          ticketPrefix,
          ticketSalt,
        });
      }
    } else if (isOrganizer) {
      // Promote to organizer role and auto-create the organizer profile so the
      // organizer dashboard + role gating unlock immediately on approval.
      await db
        .update(usersTable)
        .set({ role: "organizer" })
        .where(eq(usersTable.id, r.userId));
      const existingOrg = await db
        .select()
        .from(organizersTable)
        .where(eq(organizersTable.userId, r.userId))
        .limit(1);
      if (!existingOrg[0]) {
        const slug = await uniqueOrganizerSlug(r.businessName);
        const usedPrefixes = (
          await db.select({ p: organizersTable.ticketPrefix }).from(organizersTable)
        )
          .map((row) => row.p)
          .filter((p): p is string => Boolean(p));
        const ticketPrefix = await generateUniqueTicketPrefix(r.businessName, usedPrefixes);
        const ticketSalt = generateTicketSalt();
        await db.insert(organizersTable).values({
          userId: r.userId,
          name: r.businessName,
          slug,
          status: "approved",
          approvedAt: new Date(),
          ticketPrefix,
          ticketSalt,
        });
      }
    } else {
      // Promote the user to vendor role
      await db
        .update(usersTable)
        .set({ role: "vendor" })
        .where(eq(usersTable.id, r.userId));
      // Auto-create the vendor profile if it doesn't already exist
      const existing = await db
        .select()
        .from(vendorsTable)
        .where(eq(vendorsTable.userId, r.userId))
        .limit(1);
      if (!existing[0]) {
        await db.insert(vendorsTable).values({
          userId: r.userId,
          businessName: r.businessName,
          category: r.category,
          description: "",
          location: "",
          status: "approved",
        });
      }
    }

    // Fetch approved user to send notifications (email + in-app)
    const [approvedUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, r.userId))
      .limit(1);
    res.json({ ok: true });
    if (approvedUser) {
      await Promise.allSettled([
        sendPartnerRequestApprovedEmail({
          to: approvedUser.email,
          toName: approvedUser.name,
          businessName: r.businessName,
        }),
        createUserNotification({
          userId: approvedUser.id,
          title: "Partner request approved!",
          message: `Congratulations! Your application for ${r.businessName} has been approved. Access your dashboard to get started.`,
          url: dashboardUrl,
          tag: `partner-approved-${r.id}`,
        }),
      ]);
    }
  },
);

router.post(
  "/admin/vendor-requests/:id/reject",
  requireAuth(["admin"]),
  async (req, res) => {
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db
      .update(vendorRequestsTable)
      .set({ status: "rejected" })
      .where(eq(vendorRequestsTable.id, id));
    res.json({ ok: true });
  },
);

export default router;
