import { Router, type IRouter } from "express";
import crypto from "crypto";
import {
  db,
  gameOrganizersTable,
  gamesTable,
  gamePackagesTable,
  gameReviewsTable,
  gameManagersTable,
  gameCommissionLedgerTable,
  gameBankingDetailsTable,
  gameSettlementsTable,
  gameCouponsTable,
  gameAdRequestsTable,
  gameProfileViewsTable,
  bookingsTable,
  usersTable,
  vendorRequestsTable,
  pointsLedgerTable,
} from "@workspace/db";
import type { GameManagerPermissions, GamePackageItem, GamePackageAddon } from "@workspace/db";
import { eq, and, desc, sql, inArray, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { respondInvalid } from "../lib/validationError";
import { bookingLocationFromBody } from "../lib/geo";
import { logger } from "../lib/logger";
import { generateTicketCode, verifyTicketCode, generateUniqueTicketPrefix, generateTicketSalt } from "../lib/ticketCode";
import { createUserNotification } from "../lib/notify";
import { notifyPartnerNewBooking } from "../lib/partnerBookingNotify";

const DEFAULT_MANAGER_PERMS: GameManagerPermissions = { scan: true, attendance: true, reports: false };

function todayIstDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const router: IRouter = Router();

// ─── helpers ────────────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

async function uniqueOrganizerSlug(base: string, excludeId?: number): Promise<string> {
  const root = slugify(base) || "game-zone";
  let candidate = root;
  let n = 1;
  while (true) {
    const rows = await db
      .select({ id: gameOrganizersTable.id })
      .from(gameOrganizersTable)
      .where(eq(gameOrganizersTable.slug, candidate))
      .limit(1);
    const hit = rows[0];
    if (!hit || (excludeId && hit.id === excludeId)) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

async function uniqueGameSlug(base: string): Promise<string> {
  const root = slugify(base) || "game";
  let candidate = root;
  let n = 1;
  while (true) {
    const rows = await db.select({ id: gamesTable.id }).from(gamesTable).where(eq(gamesTable.slug, candidate)).limit(1);
    if (!rows[0]) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

async function uniquePackageSlug(base: string): Promise<string> {
  const root = slugify(base) || "package";
  let candidate = root;
  let n = 1;
  while (true) {
    const rows = await db.select({ id: gamePackagesTable.id }).from(gamePackagesTable).where(eq(gamePackagesTable.slug, candidate)).limit(1);
    if (!rows[0]) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

async function getMyOrganizer(userId: number) {
  const rows = await db.select().from(gameOrganizersTable).where(eq(gameOrganizersTable.userId, userId)).limit(1);
  return rows[0] ?? null;
}

// Earn-only Royvento Coins stub (mirrors awardOrganizerCoins).
async function awardCoins(userId: number, points: number) {
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await db.insert(pointsLedgerTable).values({ userId, points, source: "admin", expiresAt });
  } catch (err) {
    logger.error({ err }, "awardCoins (game) failed (non-critical)");
  }
}

// ─── validation ─────────────────────────────────────────────────────────────

const ProfileBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().default(""),
  logoUrl: z.string().optional().default(""),
  coverImageUrl: z.string().optional().default(""),
  galleryImages: z.array(z.string()).optional().default([]),
  website: z.string().optional().default(""),
  instagram: z.string().optional().default(""),
  facebook: z.string().optional().default(""),
  youtube: z.string().optional().default(""),
  supportEmail: z.string().optional().default(""),
  supportPhone: z.string().optional().default(""),
  address: z.string().optional().default(""),
  mapsUrl: z.string().optional().default(""),
  city: z.string().optional().default(""),
  state: z.string().optional().default(""),
});

const GameBody = z.object({
  name: z.string().min(1).max(255),
  category: z.string().optional().default(""),
  description: z.string().optional().default(""),
  rules: z.string().optional().default(""),
  coverImageUrl: z.string().optional().default(""),
  images: z.array(z.string()).optional().default([]),
  videos: z.array(z.string()).optional().default([]),
  capacity: z.coerce.number().int().min(0).optional().default(0),
  ageRestriction: z.string().optional().default(""),
  pricingModel: z.enum(["fixed", "hourly"]).optional().default("fixed"),
  price: z.coerce.number().min(0).max(9999999).optional().default(0),
  hourlyRate: z.coerce.number().min(0).max(9999999).optional().default(0),
  minHours: z.coerce.number().int().min(1).optional().default(1),
  maxHours: z.coerce.number().int().min(0).optional().default(0),
  // Happening Tonight — tonight session window + real-time visibility controls.
  startTime: z.string().optional().default(""),
  endTime: z.string().optional().default(""),
  happeningTonight: z.boolean().optional().default(true),
  startingSoon: z.boolean().optional().default(true),
  lastMinuteDeal: z.boolean().optional().default(false),
  dealLabel: z.string().max(120).optional().default(""),
});

function gameValuesFromBody(data: z.infer<typeof GameBody>) {
  return {
    name: data.name,
    category: data.category,
    description: data.description,
    rules: data.rules,
    coverImageUrl: data.coverImageUrl,
    images: data.images,
    videos: data.videos,
    capacity: data.capacity,
    ageRestriction: data.ageRestriction,
    pricingModel: data.pricingModel,
    price: String(data.price ?? 0),
    hourlyRate: String(data.hourlyRate ?? 0),
    minHours: data.minHours,
    maxHours: data.maxHours,
    startTime: data.startTime,
    endTime: data.endTime,
    happeningTonight: data.happeningTonight,
    startingSoon: data.startingSoon,
    lastMinuteDeal: data.lastMinuteDeal,
    dealLabel: data.dealLabel,
  };
}

const PackageItemSchema = z.object({
  gameId: z.coerce.number().int().positive().nullable().optional().default(null),
  label: z.string().default(""),
  quantity: z.coerce.number().int().min(1).optional().default(1),
});
const PackageAddonSchema = z.object({
  label: z.string().default(""),
  price: z.coerce.number().min(0).optional().default(0),
});
const PackageBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().default(""),
  coverImageUrl: z.string().optional().default(""),
  images: z.array(z.string()).optional().default([]),
  price: z.coerce.number().min(0).max(9999999).optional().default(0),
  items: z.array(PackageItemSchema).optional().default([]),
  addons: z.array(PackageAddonSchema).optional().default([]),
  groupSize: z.coerce.number().int().min(0).optional().default(0),
  capacity: z.coerce.number().int().min(0).optional().default(0),
  ageRestriction: z.string().optional().default(""),
});

function packageValuesFromBody(data: z.infer<typeof PackageBody>) {
  return {
    name: data.name,
    description: data.description,
    coverImageUrl: data.coverImageUrl,
    images: data.images,
    price: String(data.price ?? 0),
    items: (data.items ?? []) as GamePackageItem[],
    addons: (data.addons ?? []) as GamePackageAddon[],
    groupSize: data.groupSize,
    capacity: data.capacity,
    ageRestriction: data.ageRestriction,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// GAME ORGANIZER SELF
// ════════════════════════════════════════════════════════════════════════════

router.post("/game-organizer/profile", requireAuth(), async (req, res) => {
  const user = (req as any).user as { id: number };
  const parsed = ProfileBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const existing = await getMyOrganizer(user.id);
  if (existing) return res.status(409).json({ error: "Game organizer profile already exists" });
  const slug = await uniqueOrganizerSlug(parsed.data.name);
  const usedPrefixes = (await db.select({ p: gameOrganizersTable.ticketPrefix }).from(gameOrganizersTable))
    .map((r) => r.p).filter((p): p is string => Boolean(p));
  const ticketPrefix = await generateUniqueTicketPrefix(parsed.data.name, usedPrefixes);
  const ticketSalt = generateTicketSalt();
  const [row] = await db
    .insert(gameOrganizersTable)
    .values({ userId: user.id, slug, ...parsed.data, status: "pending", ticketPrefix, ticketSalt })
    .returning();
  await db.update(usersTable).set({ role: "game_organizer" }).where(eq(usersTable.id, user.id));
  return res.json(row);
});

router.get("/game-organizer/profile", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(404).json({ error: "No game organizer profile" });
  return res.json(org);
});

router.patch("/game-organizer/profile", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(404).json({ error: "No game organizer profile" });
  const parsed = ProfileBody.partial().safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.name && parsed.data.name !== org.name) {
    updates["slug"] = await uniqueOrganizerSlug(parsed.data.name, org.id);
  }
  const [row] = await db.update(gameOrganizersTable).set(updates).where(eq(gameOrganizersTable.id, org.id)).returning();
  return res.json(row);
});

// ════════════════════════════════════════════════════════════════════════════
// GAMES (owned)
// ════════════════════════════════════════════════════════════════════════════

router.get("/game-organizer/games", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.json([]);
  const rows = await db.select().from(gamesTable).where(eq(gamesTable.gameOrganizerId, org.id)).orderBy(desc(gamesTable.createdAt));
  return res.json(rows);
});

router.post("/game-organizer/games", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const parsed = GameBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const slug = await uniqueGameSlug(parsed.data.name);
  const [row] = await db.insert(gamesTable).values({
    gameOrganizerId: org.id,
    slug,
    approvalStatus: "pending",
    ...gameValuesFromBody(parsed.data),
  }).returning();
  return res.json(row);
});

router.get("/game-organizer/games/:id", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const rows = await db.select().from(gamesTable)
    .where(and(eq(gamesTable.id, id), eq(gamesTable.gameOrganizerId, org.id))).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  return res.json(rows[0]);
});

router.patch("/game-organizer/games/:id", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = GameBody.partial().safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const updates: Record<string, unknown> = { ...parsed.data, approvalStatus: "pending", rejectionReason: "" };
  if (parsed.data.price != null) updates["price"] = String(parsed.data.price);
  if (parsed.data.hourlyRate != null) updates["hourlyRate"] = String(parsed.data.hourlyRate);
  const [row] = await db.update(gamesTable).set(updates)
    .where(and(eq(gamesTable.id, id), eq(gamesTable.gameOrganizerId, org.id))).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.delete("/game-organizer/games/:id", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(gamesTable).where(and(eq(gamesTable.id, id), eq(gamesTable.gameOrganizerId, org.id)));
  return res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// PACKAGES (owned)
// ════════════════════════════════════════════════════════════════════════════

router.get("/game-organizer/packages", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.json([]);
  const rows = await db.select().from(gamePackagesTable).where(eq(gamePackagesTable.gameOrganizerId, org.id)).orderBy(desc(gamePackagesTable.createdAt));
  return res.json(rows);
});

router.post("/game-organizer/packages", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const parsed = PackageBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const slug = await uniquePackageSlug(parsed.data.name);
  const [row] = await db.insert(gamePackagesTable).values({
    gameOrganizerId: org.id,
    slug,
    approvalStatus: "pending",
    ...packageValuesFromBody(parsed.data),
  }).returning();
  return res.json(row);
});

router.get("/game-organizer/packages/:id", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const rows = await db.select().from(gamePackagesTable)
    .where(and(eq(gamePackagesTable.id, id), eq(gamePackagesTable.gameOrganizerId, org.id))).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  return res.json(rows[0]);
});

router.patch("/game-organizer/packages/:id", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = PackageBody.partial().safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const updates: Record<string, unknown> = { ...parsed.data, approvalStatus: "pending", rejectionReason: "" };
  if (parsed.data.price != null) updates["price"] = String(parsed.data.price);
  if (parsed.data.items != null) updates["items"] = parsed.data.items as GamePackageItem[];
  if (parsed.data.addons != null) updates["addons"] = parsed.data.addons as GamePackageAddon[];
  const [row] = await db.update(gamePackagesTable).set(updates)
    .where(and(eq(gamePackagesTable.id, id), eq(gamePackagesTable.gameOrganizerId, org.id))).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.delete("/game-organizer/packages/:id", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(gamePackagesTable).where(and(eq(gamePackagesTable.id, id), eq(gamePackagesTable.gameOrganizerId, org.id)));
  return res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN-AUTHORED GAMES & PACKAGES
// Admins author games/packages for a (possibly still unassigned) game organizer
// from the Venues tab, using the same forms partners use. Scoped by :orgId;
// by-id routes use singular /admin/game/:id and /admin/game-package/:id to avoid
// colliding with the plural admin routes (/admin/games/:id/approve, etc.).
// ════════════════════════════════════════════════════════════════════════════

router.get("/admin/game-organizer/:orgId/games", requireAuth(["admin"]), async (req, res) => {
  const orgId = Number(req.params["orgId"]);
  if (!Number.isFinite(orgId)) return res.status(400).json({ error: "Invalid id" });
  const rows = await db.select().from(gamesTable).where(eq(gamesTable.gameOrganizerId, orgId)).orderBy(desc(gamesTable.id));
  return res.json(rows);
});

router.post("/admin/game-organizer/:orgId/games", requireAuth(["admin"]), async (req, res) => {
  const orgId = Number(req.params["orgId"]);
  if (!Number.isFinite(orgId)) return res.status(400).json({ error: "Invalid id" });
  const [org] = await db.select({ id: gameOrganizersTable.id }).from(gameOrganizersTable).where(eq(gameOrganizersTable.id, orgId)).limit(1);
  if (!org) return res.status(404).json({ error: "Game organizer not found" });
  const parsed = GameBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const slug = await uniqueGameSlug(parsed.data.name);
  const [row] = await db.insert(gamesTable).values({
    gameOrganizerId: orgId, slug, approvalStatus: "pending", ...gameValuesFromBody(parsed.data),
  }).returning();
  return res.json(row);
});

router.get("/admin/game/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const [row] = await db.select().from(gamesTable).where(eq(gamesTable.id, id)).limit(1);
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.patch("/admin/game/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = GameBody.partial().safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.price != null) updates["price"] = String(parsed.data.price);
  if (parsed.data.hourlyRate != null) updates["hourlyRate"] = String(parsed.data.hourlyRate);
  const [row] = await db.update(gamesTable).set(updates).where(eq(gamesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.delete("/admin/game/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(gamesTable).where(eq(gamesTable.id, id));
  return res.json({ ok: true });
});

router.get("/admin/game-organizer/:orgId/packages", requireAuth(["admin"]), async (req, res) => {
  const orgId = Number(req.params["orgId"]);
  if (!Number.isFinite(orgId)) return res.status(400).json({ error: "Invalid id" });
  const rows = await db.select().from(gamePackagesTable).where(eq(gamePackagesTable.gameOrganizerId, orgId)).orderBy(desc(gamePackagesTable.createdAt));
  return res.json(rows);
});

router.post("/admin/game-organizer/:orgId/packages", requireAuth(["admin"]), async (req, res) => {
  const orgId = Number(req.params["orgId"]);
  if (!Number.isFinite(orgId)) return res.status(400).json({ error: "Invalid id" });
  const [org] = await db.select({ id: gameOrganizersTable.id }).from(gameOrganizersTable).where(eq(gameOrganizersTable.id, orgId)).limit(1);
  if (!org) return res.status(404).json({ error: "Game organizer not found" });
  const parsed = PackageBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const slug = await uniquePackageSlug(parsed.data.name);
  const [row] = await db.insert(gamePackagesTable).values({
    gameOrganizerId: orgId, slug, approvalStatus: "pending", ...packageValuesFromBody(parsed.data),
  }).returning();
  return res.json(row);
});

router.get("/admin/game-package/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const [row] = await db.select().from(gamePackagesTable).where(eq(gamePackagesTable.id, id)).limit(1);
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.patch("/admin/game-package/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = PackageBody.partial().safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.price != null) updates["price"] = String(parsed.data.price);
  if (parsed.data.items != null) updates["items"] = parsed.data.items as GamePackageItem[];
  if (parsed.data.addons != null) updates["addons"] = parsed.data.addons as GamePackageAddon[];
  const [row] = await db.update(gamePackagesTable).set(updates).where(eq(gamePackagesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.delete("/admin/game-package/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(gamePackagesTable).where(eq(gamePackagesTable.id, id));
  return res.json({ ok: true });
});

// ── Admin: a game organizer's Analytics / Leads / Coupons (scoped by :orgId).
// Mirror the game-dashboard endpoints so the Venues Manage view reuses the exact
// panels. Data is keyed by game_organizer_id, so it already belongs to the org
// regardless of which owner is assigned by email later. ────────────────────────

router.get("/admin/game-organizer/:orgId/analytics", requireAuth(["admin"]), async (req, res) => {
  const orgId = Number(req.params["orgId"]);
  if (!Number.isFinite(orgId)) return res.status(400).json({ error: "Invalid id" });
  const [kpi] = (await db.execute(sql`
    SELECT COUNT(*)::int AS "bookings", COALESCE(SUM(b.guests),0)::int AS "players",
      COALESCE(SUM(b.final_price),0) AS "revenue", COUNT(*) FILTER (WHERE b.checked_in)::int AS "attended"
    FROM bookings b WHERE b.kind='game' AND b.game_organizer_id = ${orgId} AND b.status='confirmed'
  `)).rows as any[];
  const popularGames = await db.execute(sql`
    SELECT g.id, g.name, COUNT(b.id)::int AS "bookings", COALESCE(SUM(b.guests),0)::int AS "players", COALESCE(SUM(b.final_price),0) AS "revenue"
    FROM games g LEFT JOIN bookings b ON b.game_id = g.id AND b.kind='game' AND b.status='confirmed'
    WHERE g.game_organizer_id = ${orgId} GROUP BY g.id, g.name ORDER BY "revenue" DESC
  `);
  const popularPackages = await db.execute(sql`
    SELECT p.id, p.name, COUNT(b.id)::int AS "bookings", COALESCE(SUM(b.final_price),0) AS "revenue"
    FROM game_packages p LEFT JOIN bookings b ON b.game_package_id = p.id AND b.kind='game' AND b.status='confirmed'
    WHERE p.game_organizer_id = ${orgId} GROUP BY p.id, p.name ORDER BY "revenue" DESC
  `);
  const peakHours = await db.execute(sql`
    SELECT COALESCE(NULLIF(split_part(b.arrival_time, ':', 1), ''), '--') AS "hour", COUNT(*)::int AS "bookings"
    FROM bookings b WHERE b.kind='game' AND b.game_organizer_id = ${orgId} AND b.status='confirmed'
    GROUP BY "hour" ORDER BY "hour"
  `);
  const [repeat] = (await db.execute(sql`
    SELECT COUNT(*)::int AS "totalCustomers", COUNT(*) FILTER (WHERE c > 1)::int AS "repeatCustomers"
    FROM (SELECT b.user_id, COUNT(*) AS c FROM bookings b WHERE b.kind='game' AND b.game_organizer_id = ${orgId} AND b.status='confirmed' GROUP BY b.user_id) t
  `)).rows as any[];
  const recent = await db.execute(sql`
    SELECT to_char(b.created_at, 'YYYY-MM-DD') AS "day", COUNT(*)::int AS "bookings", COALESCE(SUM(b.final_price),0) AS "revenue"
    FROM bookings b WHERE b.kind='game' AND b.game_organizer_id = ${orgId} AND b.status='confirmed' AND b.created_at >= now() - interval '30 days'
    GROUP BY "day" ORDER BY "day"
  `);
  const totalViews = (await db.execute(sql`SELECT COUNT(*)::int AS c FROM game_profile_views WHERE game_organizer_id = ${orgId}`)).rows[0] as any;
  const bookings = Number(kpi?.bookings ?? 0);
  const attended = Number(kpi?.attended ?? 0);
  const views = Number(totalViews?.c ?? 0);
  return res.json({
    totals: {
      bookings, players: Number(kpi?.players ?? 0), revenue: kpi?.revenue ?? "0", attended,
      attendanceRate: bookings > 0 ? Math.round((attended / bookings) * 100) : 0,
      conversionRate: views > 0 ? Math.round((bookings / views) * 100) : 0,
      totalCustomers: Number(repeat?.totalCustomers ?? 0), repeatCustomers: Number(repeat?.repeatCustomers ?? 0),
    },
    popularGames: popularGames.rows, popularPackages: popularPackages.rows, peakHours: peakHours.rows, recent: recent.rows,
  });
});

router.get("/admin/game-organizer/:orgId/bookings", requireAuth(["admin"]), async (req, res) => {
  const orgId = Number(req.params["orgId"]);
  if (!Number.isFinite(orgId)) return res.status(400).json({ error: "Invalid id" });
  const gameId = Number(req.query["gameId"]);
  const filter = Number.isFinite(gameId) && gameId > 0 ? sql` AND b.game_id = ${gameId}` : sql``;
  const rows = await db.execute(sql`
    SELECT b.id, b.created_at AS "createdAt", b.booking_date AS "bookingDate", b.arrival_time AS "time",
      b.duration_hours AS "durationHours", b.guests AS "persons", b.final_price AS "amount", b.checked_in AS "checkedIn",
      b.person_name AS "attendee", b.phone, u.email AS "email", b.selected_pub_event AS "itemName",
      b.booking_location AS "bookingLocation",
      g.name AS "gameName", p.name AS "packageName"
    FROM bookings b
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN games g ON g.id = b.game_id
    LEFT JOIN game_packages p ON p.id = b.game_package_id
    WHERE b.kind='game' AND b.game_organizer_id = ${orgId} AND b.status='confirmed'${filter}
    ORDER BY b.created_at DESC
  `);
  return res.json(rows.rows);
});

router.get("/admin/game-organizer/:orgId/leads", requireAuth(["admin"]), async (req, res) => {
  const orgId = Number(req.params["orgId"]);
  if (!Number.isFinite(orgId)) return res.status(400).json({ error: "Invalid id" });
  const knownAgg = await db
    .select({ viewerUserId: gameProfileViewsTable.viewerUserId, visitCount: sql<number>`count(*)::int`.as("visit_count"), lastViewedAt: sql<Date>`max(${gameProfileViewsTable.viewedAt})`.as("last_viewed_at") })
    .from(gameProfileViewsTable)
    .where(and(eq(gameProfileViewsTable.gameOrganizerId, orgId), sql`${gameProfileViewsTable.viewerUserId} is not null`))
    .groupBy(gameProfileViewsTable.viewerUserId);
  const [anonAgg] = await db
    .select({ visitCount: sql<number>`count(*)::int`.as("visit_count"), lastViewedAt: sql<Date>`max(${gameProfileViewsTable.viewedAt})`.as("last_viewed_at") })
    .from(gameProfileViewsTable)
    .where(and(eq(gameProfileViewsTable.gameOrganizerId, orgId), isNull(gameProfileViewsTable.viewerUserId)));
  const ids = knownAgg.map((r) => r.viewerUserId).filter((x): x is number => x != null);
  const users = ids.length ? await db.select().from(usersTable).where(inArray(usersTable.id, ids)) : [];
  const uMap = new Map(users.map((u) => [u.id, u]));
  const bookedUserIds = new Set<number>();
  if (ids.length) {
    const bookedRows = await db.select({ userId: bookingsTable.userId }).from(bookingsTable)
      .where(and(eq(bookingsTable.gameOrganizerId, orgId), eq(bookingsTable.kind, "game"), inArray(bookingsTable.userId, ids)));
    bookedRows.forEach((b) => bookedUserIds.add(b.userId));
  }
  const knownViews = knownAgg.map((r) => {
    const u = uMap.get(r.viewerUserId as number);
    return { viewerUserId: r.viewerUserId, viewerName: u?.name ?? "Anonymous", viewerEmail: u?.email ?? "", phone: u?.phone ?? "", visitCount: r.visitCount, lastViewedAt: r.lastViewedAt, hasBooked: bookedUserIds.has(r.viewerUserId as number) };
  }).sort((a, b) => new Date(b.lastViewedAt).getTime() - new Date(a.lastViewedAt).getTime());
  const anonCount = anonAgg?.visitCount ?? 0;
  const anonView = anonCount > 0 ? [{ viewerUserId: null, viewerName: "Anonymous", viewerEmail: "", phone: "", visitCount: anonCount, lastViewedAt: anonAgg!.lastViewedAt, hasBooked: false }] : [];
  const views = [...knownViews, ...anonView];
  return res.json({ totalViews: views.reduce((s, v) => s + v.visitCount, 0), bookedCount: knownViews.filter((v) => v.hasBooked).length, views });
});

router.get("/admin/game-organizer/:orgId/coupons", requireAuth(["admin"]), async (req, res) => {
  const orgId = Number(req.params["orgId"]);
  if (!Number.isFinite(orgId)) return res.status(400).json({ error: "Invalid id" });
  const rows = await db.select().from(gameCouponsTable).where(eq(gameCouponsTable.gameOrganizerId, orgId)).orderBy(desc(gameCouponsTable.createdAt));
  return res.json(rows);
});

router.post("/admin/game-organizer/:orgId/coupons", requireAuth(["admin"]), async (req, res) => {
  const orgId = Number(req.params["orgId"]);
  const [org] = await db.select({ id: gameOrganizersTable.id }).from(gameOrganizersTable).where(eq(gameOrganizersTable.id, orgId)).limit(1);
  if (!org) return res.status(404).json({ error: "Game organizer not found" });
  const parsed = CouponBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const d = parsed.data;
  try {
    const [row] = await db.insert(gameCouponsTable).values({
      gameOrganizerId: orgId, code: d.code.toUpperCase().trim(), discountType: d.discountType,
      discountValue: String(d.discountValue), gameId: d.gameId ?? null, active: d.active,
      maxUses: d.maxUses ?? null, expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
    }).returning();
    return res.json(row);
  } catch {
    return res.status(409).json({ error: "A coupon with that code already exists." });
  }
});

router.patch("/admin/game-coupon/:cid", requireAuth(["admin"]), async (req, res) => {
  const cid = Number(req.params["cid"]);
  if (!Number.isFinite(cid)) return res.status(400).json({ error: "Invalid id" });
  const active = (req.body as { active?: unknown })?.active;
  if (typeof active !== "boolean") return res.status(400).json({ error: "active must be boolean" });
  const [row] = await db.update(gameCouponsTable).set({ active }).where(eq(gameCouponsTable.id, cid)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.delete("/admin/game-coupon/:cid", requireAuth(["admin"]), async (req, res) => {
  const cid = Number(req.params["cid"]);
  if (!Number.isFinite(cid)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(gameCouponsTable).where(eq(gameCouponsTable.id, cid));
  return res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC
// ════════════════════════════════════════════════════════════════════════════

async function organizerStats(gameOrganizerId: number) {
  const [gamesAgg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(gamesTable)
    .where(and(eq(gamesTable.gameOrganizerId, gameOrganizerId), eq(gamesTable.approvalStatus, "approved")));
  const [pkgAgg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(gamePackagesTable)
    .where(and(eq(gamePackagesTable.gameOrganizerId, gameOrganizerId), eq(gamePackagesTable.approvalStatus, "approved")));
  const [ratingAgg] = await db
    .select({
      avg: sql<number>`COALESCE(AVG(${gameReviewsTable.rating}), 0)::float`,
      count: sql<number>`count(*)::int`,
    })
    .from(gameReviewsTable)
    .where(eq(gameReviewsTable.gameOrganizerId, gameOrganizerId));
  return {
    totalGames: gamesAgg?.count ?? 0,
    totalPackages: pkgAgg?.count ?? 0,
    avgRating: ratingAgg?.avg ?? 0,
    reviewCount: ratingAgg?.count ?? 0,
  };
}

router.get("/game-organizers/:slug", async (req, res) => {
  const slug = String(req.params["slug"]);
  const rows = await db.select().from(gameOrganizersTable).where(eq(gameOrganizersTable.slug, slug)).limit(1);
  const org = rows[0];
  if (!org || org.status !== "approved") return res.status(404).json({ error: "Game organizer not found" });
  const games = await db.select().from(gamesTable)
    .where(and(eq(gamesTable.gameOrganizerId, org.id), eq(gamesTable.approvalStatus, "approved"), eq(gamesTable.active, true)))
    .orderBy(desc(gamesTable.isFeaturedSlider), desc(gamesTable.createdAt));
  const packages = await db.select().from(gamePackagesTable)
    .where(and(eq(gamePackagesTable.gameOrganizerId, org.id), eq(gamePackagesTable.approvalStatus, "approved"), eq(gamePackagesTable.active, true)))
    .orderBy(desc(gamePackagesTable.createdAt));
  const reviews = await db.select().from(gameReviewsTable)
    .where(eq(gameReviewsTable.gameOrganizerId, org.id))
    .orderBy(desc(gameReviewsTable.createdAt)).limit(20);
  const stats = await organizerStats(org.id);
  // Public game-organizer profile (approved only) — edge-cache on success.
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return res.json({ organizer: org, games, packages, reviews, stats });
});

// All approved games (public grid). Declared before /games/:slug.
router.get("/games", async (_req, res) => {
  // Public approved-games grid — edge-cacheable (same bytes for everyone).
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  const rows = await db.execute(sql`
    SELECT
      g.id, g.name, g.slug, g.category, g.cover_image_url AS "coverImageUrl",
      g.pricing_model AS "pricingModel", g.price, g.hourly_rate AS "hourlyRate",
      o.name AS "organizerName", o.slug AS "organizerSlug", o.city, o.verified AS "organizerVerified"
    FROM games g
    JOIN game_organizers o ON o.id = g.game_organizer_id
    WHERE g.approval_status = 'approved' AND g.active = true AND o.status = 'approved'
    ORDER BY g.is_featured_slider DESC, g.created_at DESC
  `);
  return res.json(rows.rows);
});

router.get("/games/slider", async (_req, res) => {
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  const rows = await db.execute(sql`
    SELECT
      g.id, g.name AS "title",
      g.description AS "body",
      g.cover_image_url AS "imageUrl",
      o.name AS "vendorName",
      '/game-organizers/' || o.slug AS "href"
    FROM games g
    JOIN game_organizers o ON o.id = g.game_organizer_id
    WHERE g.approval_status = 'approved' AND g.active = true AND g.is_featured_slider = true
    ORDER BY g.created_at DESC
    LIMIT 10
  `);
  return res.json(rows.rows);
});

router.get("/games/:slug", async (req, res) => {
  const slug = String(req.params["slug"]);
  const rows = await db.select().from(gamesTable).where(eq(gamesTable.slug, slug)).limit(1);
  const game = rows[0];
  if (!game || game.approvalStatus !== "approved") return res.status(404).json({ error: "Game not found" });
  const orgRows = await db.select().from(gameOrganizersTable).where(eq(gameOrganizersTable.id, game.gameOrganizerId)).limit(1);
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return res.json({ game, organizer: orgRows[0] ?? null });
});

router.get("/game-packages/:slug", async (req, res) => {
  const slug = String(req.params["slug"]);
  const rows = await db.select().from(gamePackagesTable).where(eq(gamePackagesTable.slug, slug)).limit(1);
  const pkg = rows[0];
  if (!pkg || pkg.approvalStatus !== "approved") return res.status(404).json({ error: "Package not found" });
  const orgRows = await db.select().from(gameOrganizersTable).where(eq(gameOrganizersTable.id, pkg.gameOrganizerId)).limit(1);
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return res.json({ package: pkg, organizer: orgRows[0] ?? null });
});

// Public: active discount coupons a customer can apply for this organizer.
router.get("/game-organizers/:slug/coupons", async (req, res) => {
  // Public discount codes (not per-user; booking re-validates). Short cache ok.
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  const slug = String(req.params["slug"]);
  const orgRows = await db.select({ id: gameOrganizersTable.id }).from(gameOrganizersTable).where(eq(gameOrganizersTable.slug, slug)).limit(1);
  const org = orgRows[0];
  if (!org) return res.json([]);
  const rows = await db.select().from(gameCouponsTable).where(and(
    eq(gameCouponsTable.gameOrganizerId, org.id),
    eq(gameCouponsTable.active, true),
  ));
  const now = new Date();
  const valid = rows
    .filter((c) => (!c.expiresAt || c.expiresAt > now) && (c.maxUses == null || c.usedCount < c.maxUses))
    .map((c) => ({ code: c.code, discountType: c.discountType, discountValue: c.discountValue, gameId: c.gameId }));
  return res.json(valid);
});

// Booking — reuses the SAME bookings table (kind='game') so it shows in My
// Bookings with a QR code, exactly like pub/organizer bookings. COD /
// instant-confirm; commission is realised at scan (check-in). Auth required.
const BookBody = z.object({
  gameId: z.coerce.number().int().positive().optional().nullable().default(null),
  packageId: z.coerce.number().int().positive().optional().nullable().default(null),
  persons: z.coerce.number().int().min(1).max(200).default(1),
  hours: z.coerce.number().min(0).max(24).optional().default(0),
  quantity: z.coerce.number().int().min(1).max(50).optional().default(1),
  date: z.string().optional().default(""),
  time: z.string().optional().default(""),
  name: z.string().min(1).max(255),
  phone: z.string().max(50).optional().default(""),
  couponCode: z.string().max(24).optional().default(""),
  pointsToUse: z.coerce.number().int().min(0).optional().default(0),
});

router.post("/game-organizers/:slug/book", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const slug = String(req.params["slug"]);
  const parsed = BookBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const { gameId, packageId, persons, hours, quantity, date, time, name, phone, couponCode, pointsToUse } = parsed.data;
  if ((!gameId && !packageId) || (gameId && packageId)) {
    return res.status(400).json({ error: "Provide exactly one of gameId or packageId." });
  }

  const orgRows = await db.select().from(gameOrganizersTable).where(eq(gameOrganizersTable.slug, slug)).limit(1);
  const organizer = orgRows[0];
  if (!organizer || organizer.status !== "approved") return res.status(404).json({ error: "Game organizer not found" });

  // Resolve the bookable item + compute subtotal per pricing model.
  let itemName = "";
  let commissionPct = "0";
  let bookingGuests = persons;
  let durationHours: string | null = null;
  let subtotal = 0;

  if (gameId) {
    const gRows = await db.select().from(gamesTable)
      .where(and(eq(gamesTable.id, gameId), eq(gamesTable.gameOrganizerId, organizer.id))).limit(1);
    const game = gRows[0];
    if (!game || !game.active || game.approvalStatus !== "approved") return res.status(404).json({ error: "Game not available" });
    if (game.capacity > 0 && persons > game.capacity) return res.status(409).json({ error: `This game allows up to ${game.capacity} players.` });
    itemName = game.name;
    commissionPct = String(game.commissionPct ?? "0");
    if (game.pricingModel === "hourly") {
      const min = game.minHours || 1;
      const max = game.maxHours || 0;
      let hrs = hours || min;
      if (hrs < min) return res.status(400).json({ error: `Minimum booking is ${min} hour(s).` });
      if (max > 0 && hrs > max) return res.status(400).json({ error: `Maximum booking is ${max} hour(s).` });
      durationHours = String(hrs);
      subtotal = (Number(game.hourlyRate) || 0) * hrs;
    } else {
      subtotal = (Number(game.price) || 0) * persons;
    }
  } else {
    const pRows = await db.select().from(gamePackagesTable)
      .where(and(eq(gamePackagesTable.id, packageId!), eq(gamePackagesTable.gameOrganizerId, organizer.id))).limit(1);
    const pkg = pRows[0];
    if (!pkg || !pkg.active || pkg.approvalStatus !== "approved") return res.status(404).json({ error: "Package not available" });
    itemName = pkg.name;
    commissionPct = String(pkg.commissionPct ?? "0");
    bookingGuests = persons;
    subtotal = (Number(pkg.price) || 0) * quantity;
  }

  const total = Math.round(subtotal * 100) / 100;

  // Apply a coupon if supplied + valid.
  let discount = 0;
  let appliedCode = "";
  if (couponCode.trim() && total > 0) {
    const cc = couponCode.trim().toUpperCase();
    const cRows = await db.select().from(gameCouponsTable)
      .where(and(eq(gameCouponsTable.gameOrganizerId, organizer.id), eq(gameCouponsTable.code, cc))).limit(1);
    const coupon = cRows[0];
    const valid = coupon && coupon.active
      && (coupon.gameId == null || coupon.gameId === gameId)
      && (coupon.maxUses == null || coupon.usedCount < coupon.maxUses)
      && (!coupon.expiresAt || coupon.expiresAt > new Date());
    if (!valid) return res.status(400).json({ error: "Invalid or expired coupon code." });
    const val = Number(coupon!.discountValue);
    discount = coupon!.discountType === "fixed" ? Math.min(val, total) : Math.round((total * val) / 100 * 100) / 100;
    appliedCode = coupon!.code;
    await db.update(gameCouponsTable).set({ usedCount: coupon!.usedCount + 1 }).where(eq(gameCouponsTable.id, coupon!.id));
  }

  // Royvento Coins redemption — same formula as pub/organizer bookings.
  const POINTS_RUPEE_RATE = 0.05;
  let pointsUsed = 0;
  let pointsDeduction = 0;
  if (pointsToUse > 0 && total > 0) {
    const maxPointsDiscount = Math.floor(total * 0.02);
    const pointsCap = Math.min(Math.max(0, total - discount), maxPointsDiscount);
    const maxPointsFromCap = Math.floor(pointsCap / POINTS_RUPEE_RATE);
    pointsUsed = Math.min(pointsToUse, user.points, maxPointsFromCap);
    pointsDeduction = pointsUsed * POINTS_RUPEE_RATE;
    if (pointsUsed > 0) {
      await db.update(usersTable).set({ points: user.points - pointsUsed }).where(eq(usersTable.id, user.id));
      db.insert(pointsLedgerTable).values({ userId: user.id, points: -pointsUsed, source: "redemption" }).catch(() => {});
    }
  }

  const finalPrice = Math.max(0, total - discount - pointsDeduction);
  const bookingDate = date || todayIstDate();

  try {
    // Move inventory counters (informational; bookings are instant-confirm).
    if (gameId) await db.update(gamesTable).set({ soldCount: sql`${gamesTable.soldCount} + ${quantity}` }).where(eq(gamesTable.id, gameId));
    else if (packageId) await db.update(gamePackagesTable).set({ soldCount: sql`${gamePackagesTable.soldCount} + ${quantity}` }).where(eq(gamePackagesTable.id, packageId));

    const bookingValues = {
      kind: "game",
      userId: user.id,
      gameOrganizerId: organizer.id,
      gameId: gameId ?? null,
      gamePackageId: packageId ?? null,
      durationHours,
      bookingDate,
      arrivalTime: time || null,
      guests: bookingGuests,
      totalPrice: String(total),
      finalPrice: String(finalPrice),
      couponCode: appliedCode,
      discountAmount: String(discount),
      pointsUsed,
      eventCommissionPct: commissionPct,
      status: "confirmed",
      pubMode: "game_booking",
      selectedPubEvent: itemName,
      personName: name || user.name,
      phone,
      approvedBy: "auto",
      paymentMethod: "cod",
      // Customer's current location at booking time (for admin/game-organizer reports).
      ...bookingLocationFromBody(req.body),
    } as unknown as typeof bookingsTable.$inferInsert;
    const [booking] = await db.insert(bookingsTable).values(bookingValues).returning();
    if (!booking) return res.status(500).json({ error: "Could not complete booking" });

    const ticketCode = organizer.ticketPrefix && organizer.ticketSalt
      ? generateTicketCode(booking.id, { ticketPrefix: organizer.ticketPrefix, ticketSalt: organizer.ticketSalt })
      : `RV-${String(booking.id).padStart(6, "0")}`;

    createUserNotification({
      userId: user.id,
      title: "Booking confirmed!",
      message: `Your booking for "${itemName}" at ${organizer.name} is confirmed. Show your QR at entry.`,
      url: "/dashboard/bookings",
      tag: `game-booking-${booking.id}`,
    }).catch(() => {});

    // Instant "New booking received" notification to the game organizer.
    notifyPartnerNewBooking({
      id: booking.id,
      kind: booking.kind,
      vendorId: booking.vendorId,
      organizerId: booking.organizerId,
      hostVendorId: booking.hostVendorId,
      gameOrganizerId: booking.gameOrganizerId,
      personName: booking.personName,
      phone: booking.phone,
      bookingDate: booking.bookingDate,
      arrivalTime: booking.arrivalTime,
      guests: booking.guests,
      pubMode: booking.pubMode,
      paymentMethod: booking.paymentMethod,
    }).catch(() => {});

    return res.json({
      ok: true,
      bookingId: booking.id,
      ticketCode,
      itemName,
      venueName: organizer.name,
      venueAddress: organizer.address,
      date: bookingDate,
      time: time || "",
      durationHours: durationHours ? Number(durationHours) : null,
      persons: bookingGuests,
      quantity,
      subtotal: total,
      discount,
      pointsUsed,
      pointsValue: pointsDeduction,
      total: finalPrice,
      couponApplied: appliedCode || null,
      free: finalPrice === 0,
    });
  } catch (err) {
    logger.error({ err }, "Game booking failed");
    return res.status(500).json({ error: "Could not complete booking" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GAME MANAGERS  (mirror organizer_managers)
// ════════════════════════════════════════════════════════════════════════════

const PermsSchema = z.object({
  scan: z.boolean().optional(),
  attendance: z.boolean().optional(),
  reports: z.boolean().optional(),
});
const InviteManagerBody = z.object({
  email: z.string().email("Valid email required"),
  permissions: PermsSchema.optional(),
});

function normalizePerms(p?: Partial<GameManagerPermissions> | null): GameManagerPermissions {
  return {
    scan: p?.scan ?? DEFAULT_MANAGER_PERMS.scan,
    attendance: p?.attendance ?? DEFAULT_MANAGER_PERMS.attendance,
    reports: p?.reports ?? DEFAULT_MANAGER_PERMS.reports,
  };
}

router.get("/game-organizer/managers", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const rows = await db.select().from(gameManagersTable).where(eq(gameManagersTable.gameOrganizerId, org.id));
  const ids = rows.map((r) => r.managerId).filter((id): id is number => id != null);
  const people = ids.length
    ? await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, ids))
    : [];
  const uMap = new Map(people.map((u) => [u.id, u]));
  return res.json(rows.map((r) => ({
    id: r.id,
    invitedEmail: r.invitedEmail,
    status: r.status,
    permissions: normalizePerms(r.permissions),
    createdAt: r.createdAt.toISOString(),
    manager: r.managerId ? (uMap.get(r.managerId) ?? null) : null,
  })));
});

router.post("/game-organizer/managers/invite", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const parsed = InviteManagerBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const email = parsed.data.email.toLowerCase().trim();
  const perms = normalizePerms(parsed.data.permissions);

  const invitee = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!invitee[0]) return res.status(404).json({ error: "No Royvento account found for that email. They must sign up first." });
  const inviteeId = invitee[0].id;
  if (inviteeId === user.id) return res.status(400).json({ error: "You cannot invite yourself as a manager." });

  const existing = await db.select().from(gameManagersTable)
    .where(and(eq(gameManagersTable.gameOrganizerId, org.id), eq(gameManagersTable.managerId, inviteeId))).limit(1);
  if (existing[0] && existing[0].status !== "rejected") return res.status(409).json({ error: "This user has already been invited." });

  const token = crypto.randomBytes(32).toString("hex");
  if (existing[0] && existing[0].status === "rejected") {
    await db.update(gameManagersTable)
      .set({ status: "pending", token, createdAt: new Date(), invitedEmail: email, permissions: perms })
      .where(eq(gameManagersTable.id, existing[0].id));
  } else {
    await db.insert(gameManagersTable).values({
      gameOrganizerId: org.id, invitedEmail: email, invitedBy: user.id, managerId: inviteeId, status: "pending", token, permissions: perms,
    });
  }
  createUserNotification({
    userId: inviteeId,
    title: "You've been invited as a Game Manager",
    message: `${org.name} invited you to scan tickets & manage entry for their games. Open your profile to accept or decline.`,
    url: "/profile",
    tag: `game-manager-invite-${org.id}`,
  }).catch(() => {});
  return res.json({ message: "Invitation sent." });
});

router.patch("/game-organizer/managers/:id", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = PermsSchema.safeParse(req.body?.permissions ?? req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const existing = await db.select().from(gameManagersTable)
    .where(and(eq(gameManagersTable.id, id), eq(gameManagersTable.gameOrganizerId, org.id))).limit(1);
  if (!existing[0]) return res.status(404).json({ error: "Not found" });
  const merged = normalizePerms({ ...normalizePerms(existing[0].permissions), ...parsed.data });
  const [row] = await db.update(gameManagersTable).set({ permissions: merged }).where(eq(gameManagersTable.id, id)).returning();
  return res.json({ id: row?.id, permissions: merged });
});

router.delete("/game-organizer/managers/:id", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const rows = await db.select().from(gameManagersTable)
    .where(and(eq(gameManagersTable.id, id), eq(gameManagersTable.gameOrganizerId, org.id))).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  await db.delete(gameManagersTable).where(eq(gameManagersTable.id, id));
  return res.json({ message: "Manager removed." });
});

router.get("/game-manager/invitations", requireAuth(), async (req, res) => {
  const user = (req as any).user as { id: number };
  const rows = await db.select().from(gameManagersTable)
    .where(and(eq(gameManagersTable.managerId, user.id), eq(gameManagersTable.status, "pending")));
  const orgIds = rows.map((r) => r.gameOrganizerId);
  const orgs = orgIds.length
    ? await db.select({ id: gameOrganizersTable.id, name: gameOrganizersTable.name }).from(gameOrganizersTable).where(inArray(gameOrganizersTable.id, orgIds))
    : [];
  const oMap = new Map(orgs.map((o) => [o.id, o]));
  return res.json(rows.map((r) => ({
    id: r.id,
    gameOrganizerId: r.gameOrganizerId,
    organizerName: oMap.get(r.gameOrganizerId)?.name ?? "A game organizer",
    permissions: normalizePerms(r.permissions),
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/game-manager/invitations/:id/accept", requireAuth(), async (req, res) => {
  const user = (req as any).user as { id: number };
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const rows = await db.select().from(gameManagersTable)
    .where(and(eq(gameManagersTable.id, id), eq(gameManagersTable.status, "pending"))).limit(1);
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: "Invitation not found or already used." });
  if (inv.managerId !== user.id) return res.status(403).json({ error: "This invitation was not sent to your account." });
  await db.update(gameManagersTable).set({ status: "accepted" }).where(eq(gameManagersTable.id, inv.id));
  return res.json({ message: "You are now a Game Manager." });
});

router.post("/game-manager/invitations/:id/reject", requireAuth(), async (req, res) => {
  const user = (req as any).user as { id: number };
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const rows = await db.select().from(gameManagersTable)
    .where(and(eq(gameManagersTable.id, id), eq(gameManagersTable.status, "pending"))).limit(1);
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: "Invitation not found or already used." });
  if (inv.managerId !== user.id) return res.status(403).json({ error: "This invitation was not sent to your account." });
  await db.update(gameManagersTable).set({ status: "rejected" }).where(eq(gameManagersTable.id, inv.id));
  return res.json({ message: "Invitation declined." });
});

// ─── ticket scanner ───────────────────────────────────────────────────────
async function scannerOrganizerPerms(userId: number): Promise<Map<number, GameManagerPermissions>> {
  const map = new Map<number, GameManagerPermissions>();
  const own = await getMyOrganizer(userId);
  if (own) map.set(own.id, { scan: true, attendance: true, reports: true });
  const rows = await db.select().from(gameManagersTable)
    .where(and(eq(gameManagersTable.managerId, userId), eq(gameManagersTable.status, "accepted")));
  for (const r of rows) map.set(r.gameOrganizerId, normalizePerms(r.permissions));
  return map;
}

const ScanBody = z.object({
  code: z.string().min(1),
  confirm: z.boolean().optional().default(false),
});

router.post("/game-organizer/scan-ticket", requireAuth(), async (req, res) => {
  const user = (req as any).user as { id: number };
  const parsed = ScanBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_CODE", message: "Please provide a ticket code." });
  const code = parsed.data.code.trim().toUpperCase();

  const m = code.match(/^([A-Z][A-Z0-9]{1,7})-(\d{1,10})-([0-9A-F]{2})$/);
  const legacy = code.match(/^(?:RV-?)?(\d+)$/);
  let bookingId: number;
  let needsChecksum = false;
  if (m && m[2] && m[1] !== "RV") { bookingId = parseInt(m[2], 10); needsChecksum = true; }
  else if (legacy && legacy[1]) { bookingId = parseInt(legacy[1], 10); }
  else return res.status(400).json({ code: "INVALID_CODE", message: "Invalid ticket code format." });
  if (!Number.isFinite(bookingId) || bookingId <= 0) return res.status(400).json({ code: "INVALID_CODE", message: "Invalid ticket code." });

  const allowed = await scannerOrganizerPerms(user.id);
  if (allowed.size === 0) return res.status(403).json({ code: "FORBIDDEN", message: "You are not a game organizer or accepted manager." });

  const bRows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  const b = bRows[0];
  if (!b || b.kind !== "game" || b.gameOrganizerId == null) {
    return res.status(404).json({ code: "NOT_FOUND", message: "Game ticket not found." });
  }
  const perms = allowed.get(b.gameOrganizerId);
  if (!perms || !perms.scan) return res.status(403).json({ code: "WRONG_ORGANIZER", message: "This ticket belongs to a different game organizer." });

  const orgRows = await db.select().from(gameOrganizersTable).where(eq(gameOrganizersTable.id, b.gameOrganizerId)).limit(1);
  const organizer = orgRows[0];
  if (needsChecksum && organizer?.ticketPrefix && organizer?.ticketSalt) {
    if (!verifyTicketCode(code, bookingId, { ticketPrefix: organizer.ticketPrefix, ticketSalt: organizer.ticketSalt })) {
      return res.status(400).json({ code: "INVALID_CODE", message: "Ticket code failed verification." });
    }
  }

  const buyer = (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, b.userId)).limit(1))[0];
  const ticketInfo = {
    bookingId: b.id,
    itemName: b.selectedPubEvent ?? "",
    organizerName: organizer?.name ?? "",
    attendee: b.personName || buyer?.name || "",
    persons: b.guests,
    durationHours: b.durationHours ? Number(b.durationHours) : null,
    date: b.bookingDate,
    time: b.arrivalTime ?? "",
    venue: organizer?.name ?? "",
    checkedIn: b.checkedIn === true,
    checkedInAt: b.checkedInAt ? b.checkedInAt.toISOString() : null,
  };

  if (b.checkedIn) {
    return res.status(200).json({ status: "ALREADY_CHECKED_IN", message: "Already checked in.", ticket: ticketInfo });
  }
  if (!parsed.data.confirm) {
    return res.status(200).json({ status: "VALID", message: "Valid ticket.", ticket: ticketInfo });
  }
  if (!perms.attendance) return res.status(403).json({ code: "NO_PERMISSION", message: "You don't have permission to mark attendance." });

  const now = new Date();
  // Commission realisation at check-in (COD model). The per-item rate was
  // locked onto the booking at booking time (eventCommissionPct).
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const revenue = Number(b.finalPrice ?? 0);
  const commissionPct = Number(b.eventCommissionPct ?? 0);
  // Gateway fee % comes from the game/package; 0 for COD.
  let gatewayPct = 0;
  if (b.paymentMethod === "online") {
    if (b.gameId != null) {
      const g = (await db.select({ f: gamesTable.gatewayFeePercent }).from(gamesTable).where(eq(gamesTable.id, b.gameId)).limit(1))[0];
      gatewayPct = Number(g?.f ?? 0);
    } else if (b.gamePackageId != null) {
      const p = (await db.select({ f: gamePackagesTable.gatewayFeePercent }).from(gamePackagesTable).where(eq(gamePackagesTable.id, b.gamePackageId)).limit(1))[0];
      gatewayPct = Number(p?.f ?? 0);
    }
  }
  const commission = round2((revenue * commissionPct) / 100);
  const gatewayFee = round2((revenue * gatewayPct) / 100);
  const net = round2(revenue - commission - gatewayFee);
  await db.transaction(async (tx) => {
    await tx.update(bookingsTable).set({ checkedIn: true, checkedInAt: now }).where(eq(bookingsTable.id, b.id));
    const inserted = await tx.insert(gameCommissionLedgerTable).values({
      gameOrganizerId: b.gameOrganizerId!,
      gameId: b.gameId,
      gamePackageId: b.gamePackageId,
      bookingId: b.id,
      revenue: String(revenue),
      commission: String(commission),
      gatewayFee: String(gatewayFee),
      net: String(net),
    }).onConflictDoNothing({ target: gameCommissionLedgerTable.bookingId }).returning({ id: gameCommissionLedgerTable.id });
    if (inserted.length > 0) {
      await tx.update(gameOrganizersTable)
        .set({ commissionOwed: sql`${gameOrganizersTable.commissionOwed} + ${String(commission)}` })
        .where(eq(gameOrganizersTable.id, b.gameOrganizerId!));
    }
  });
  return res.status(200).json({ status: "CHECKED_IN", message: "Checked in!", ticket: { ...ticketInfo, checkedIn: true, checkedInAt: now.toISOString() } });
});

// ════════════════════════════════════════════════════════════════════════════
// BUSINESS TOOLS: Analytics · Reports · Attendance · Leads · Coupons · Promote
// ════════════════════════════════════════════════════════════════════════════

router.post("/game-organizers/:slug/view", async (req, res) => {
  const slug = String(req.params["slug"]);
  const rows = await db.select({ id: gameOrganizersTable.id, userId: gameOrganizersTable.userId })
    .from(gameOrganizersTable).where(eq(gameOrganizersTable.slug, slug)).limit(1);
  const org = rows[0];
  if (!org) return res.json({ ok: true });
  const user = await loadUserFromRequest(req);
  if (user && user.id === org.userId) return res.json({ ok: true, skipped: "self" });
  await db.insert(gameProfileViewsTable).values({
    gameOrganizerId: org.id,
    viewerUserId: user?.id ?? null,
    viewerName: user?.name ?? "",
    viewerEmail: user?.email ?? "",
  });
  return res.json({ ok: true });
});

router.get("/game-organizer/leads", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });

  const knownAgg = await db
    .select({
      viewerUserId: gameProfileViewsTable.viewerUserId,
      visitCount: sql<number>`count(*)::int`.as("visit_count"),
      lastViewedAt: sql<Date>`max(${gameProfileViewsTable.viewedAt})`.as("last_viewed_at"),
    })
    .from(gameProfileViewsTable)
    .where(and(eq(gameProfileViewsTable.gameOrganizerId, org.id), sql`${gameProfileViewsTable.viewerUserId} is not null`))
    .groupBy(gameProfileViewsTable.viewerUserId);

  const [anonAgg] = await db
    .select({ visitCount: sql<number>`count(*)::int`.as("visit_count"), lastViewedAt: sql<Date>`max(${gameProfileViewsTable.viewedAt})`.as("last_viewed_at") })
    .from(gameProfileViewsTable)
    .where(and(eq(gameProfileViewsTable.gameOrganizerId, org.id), isNull(gameProfileViewsTable.viewerUserId)));

  const ids = knownAgg.map((r) => r.viewerUserId).filter((x): x is number => x != null);
  const users = ids.length ? await db.select().from(usersTable).where(inArray(usersTable.id, ids)) : [];
  const uMap = new Map(users.map((u) => [u.id, u]));

  const bookedUserIds = new Set<number>();
  if (ids.length) {
    const bookedRows = await db
      .select({ userId: bookingsTable.userId })
      .from(bookingsTable)
      .where(and(eq(bookingsTable.gameOrganizerId, org.id), eq(bookingsTable.kind, "game"), inArray(bookingsTable.userId, ids)));
    bookedRows.forEach((b) => bookedUserIds.add(b.userId));
  }

  const knownViews = knownAgg.map((r) => {
    const u = uMap.get(r.viewerUserId as number);
    return {
      viewerUserId: r.viewerUserId,
      viewerName: u?.name ?? "Anonymous",
      viewerEmail: u?.email ?? "",
      phone: u?.phone ?? "",
      visitCount: r.visitCount,
      lastViewedAt: r.lastViewedAt,
      hasBooked: bookedUserIds.has(r.viewerUserId as number),
    };
  }).sort((a, b) => new Date(b.lastViewedAt).getTime() - new Date(a.lastViewedAt).getTime());

  const anonCount = anonAgg?.visitCount ?? 0;
  const anonView = anonCount > 0
    ? [{ viewerUserId: null, viewerName: "Anonymous", viewerEmail: "", phone: "", visitCount: anonCount, lastViewedAt: anonAgg!.lastViewedAt, hasBooked: false }]
    : [];

  const views = [...knownViews, ...anonView];
  return res.json({
    totalViews: views.reduce((s, v) => s + v.visitCount, 0),
    bookedCount: knownViews.filter((v) => v.hasBooked).length,
    views,
  });
});

// Analytics — KPIs, popular games/packages, peak hours, repeat customers.
router.get("/game-organizer/analytics", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });

  const [kpi] = (await db.execute(sql`
    SELECT
      COUNT(*)::int                                AS "bookings",
      COALESCE(SUM(b.guests), 0)::int              AS "players",
      COALESCE(SUM(b.final_price), 0)              AS "revenue",
      COUNT(*) FILTER (WHERE b.checked_in)::int    AS "attended"
    FROM bookings b
    WHERE b.kind = 'game' AND b.game_organizer_id = ${org.id} AND b.status = 'confirmed'
  `)).rows as any[];

  const popularGames = await db.execute(sql`
    SELECT g.id, g.name,
      COUNT(b.id)::int AS "bookings",
      COALESCE(SUM(b.guests), 0)::int AS "players",
      COALESCE(SUM(b.final_price), 0) AS "revenue"
    FROM games g
    LEFT JOIN bookings b ON b.game_id = g.id AND b.kind='game' AND b.status='confirmed'
    WHERE g.game_organizer_id = ${org.id}
    GROUP BY g.id, g.name ORDER BY "revenue" DESC
  `);

  const popularPackages = await db.execute(sql`
    SELECT p.id, p.name,
      COUNT(b.id)::int AS "bookings",
      COALESCE(SUM(b.final_price), 0) AS "revenue"
    FROM game_packages p
    LEFT JOIN bookings b ON b.game_package_id = p.id AND b.kind='game' AND b.status='confirmed'
    WHERE p.game_organizer_id = ${org.id}
    GROUP BY p.id, p.name ORDER BY "revenue" DESC
  `);

  // Peak booking hours (by arrival/slot time).
  const peakHours = await db.execute(sql`
    SELECT COALESCE(NULLIF(split_part(b.arrival_time, ':', 1), ''), '--') AS "hour",
      COUNT(*)::int AS "bookings"
    FROM bookings b
    WHERE b.kind='game' AND b.game_organizer_id = ${org.id} AND b.status='confirmed'
    GROUP BY "hour" ORDER BY "hour"
  `);

  const [repeat] = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS "totalCustomers",
      COUNT(*) FILTER (WHERE c > 1)::int AS "repeatCustomers"
    FROM (
      SELECT b.user_id, COUNT(*) AS c
      FROM bookings b
      WHERE b.kind='game' AND b.game_organizer_id = ${org.id} AND b.status='confirmed'
      GROUP BY b.user_id
    ) t
  `)).rows as any[];

  const recent = await db.execute(sql`
    SELECT to_char(b.created_at, 'YYYY-MM-DD') AS "day",
      COUNT(*)::int AS "bookings",
      COALESCE(SUM(b.final_price),0) AS "revenue"
    FROM bookings b
    WHERE b.kind='game' AND b.game_organizer_id = ${org.id} AND b.status='confirmed'
      AND b.created_at >= now() - interval '30 days'
    GROUP BY "day" ORDER BY "day"
  `);

  const totalViews = (await db.execute(sql`SELECT COUNT(*)::int AS c FROM game_profile_views WHERE game_organizer_id = ${org.id}`)).rows[0] as any;
  const bookings = Number(kpi?.bookings ?? 0);
  const attended = Number(kpi?.attended ?? 0);
  const views = Number(totalViews?.c ?? 0);
  return res.json({
    totals: {
      bookings,
      players: Number(kpi?.players ?? 0),
      revenue: kpi?.revenue ?? "0",
      attended,
      attendanceRate: bookings > 0 ? Math.round((attended / bookings) * 100) : 0,
      conversionRate: views > 0 ? Math.round((bookings / views) * 100) : 0,
      totalCustomers: Number(repeat?.totalCustomers ?? 0),
      repeatCustomers: Number(repeat?.repeatCustomers ?? 0),
    },
    popularGames: popularGames.rows,
    popularPackages: popularPackages.rows,
    peakHours: peakHours.rows,
    recent: recent.rows,
  });
});

// Booking report — every game booking with attendee contact.
router.get("/game-organizer/bookings", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const gameId = Number(req.query["gameId"]);
  const filter = Number.isFinite(gameId) && gameId > 0 ? sql` AND b.game_id = ${gameId}` : sql``;

  // Booking Report filter bar: exact date and status.
  const rawDate = String(req.query["date"] ?? "");
  const dateFilter = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? sql` AND b.booking_date = ${rawDate}` : sql``;
  const rawStatus = String(req.query["status"] ?? "");
  const statusFilter = rawStatus && rawStatus !== "all" ? sql` AND b.status = ${rawStatus}` : sql``;

  const rows = await db.execute(sql`
    SELECT b.id, b.created_at AS "createdAt", b.booking_date AS "bookingDate",
      b.arrival_time AS "time", b.duration_hours AS "durationHours", b.status, b.payment_method AS "paymentMethod",
      b.guests AS "persons", b.final_price AS "amount", b.checked_in AS "checkedIn",
      b.person_name AS "attendee", b.phone, u.email AS "email",
      b.booking_location AS "bookingLocation",
      b.selected_pub_event AS "itemName",
      g.name AS "gameName", p.name AS "packageName"
    FROM bookings b
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN games g ON g.id = b.game_id
    LEFT JOIN game_packages p ON p.id = b.game_package_id
    WHERE b.kind='game' AND b.game_organizer_id = ${org.id}${filter}${dateFilter}${statusFilter}
    ORDER BY b.created_at DESC
  `);
  return res.json(rows.rows);
});

// Single-booking fetch for the notification deep-link → Booking Detail modal.
router.get("/game-organizer/bookings/:bookingId", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const id = Number(req.params["bookingId"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid booking id" });

  const rows = await db.execute(sql`
    SELECT b.id, b.created_at AS "createdAt", b.booking_date AS "bookingDate",
      b.arrival_time AS "time", b.duration_hours AS "durationHours", b.status, b.payment_method AS "paymentMethod",
      b.guests AS "persons", b.final_price AS "amount", b.checked_in AS "checkedIn",
      b.person_name AS "attendee", b.phone, u.email AS "email",
      b.booking_location AS "bookingLocation",
      b.selected_pub_event AS "itemName",
      g.name AS "gameName", p.name AS "packageName"
    FROM bookings b
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN games g ON g.id = b.game_id
    LEFT JOIN game_packages p ON p.id = b.game_package_id
    WHERE b.kind='game' AND b.game_organizer_id = ${org.id} AND b.id = ${id}
    LIMIT 1
  `);
  const row = rows.rows[0];
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

// ─── coupons ────────────────────────────────────────────────────────────────
const CouponBody = z.object({
  code: z.string().min(2).max(24),
  discountType: z.enum(["percent", "fixed"]).default("percent"),
  discountValue: z.coerce.number().min(0).max(100000),
  gameId: z.coerce.number().int().positive().nullable().optional().default(null),
  active: z.boolean().optional().default(true),
  maxUses: z.coerce.number().int().positive().nullable().optional().default(null),
  expiresAt: z.string().nullable().optional().default(null),
});

router.get("/game-organizer/coupons", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const rows = await db.select().from(gameCouponsTable).where(eq(gameCouponsTable.gameOrganizerId, org.id)).orderBy(desc(gameCouponsTable.createdAt));
  return res.json(rows);
});

router.post("/game-organizer/coupons", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const parsed = CouponBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const d = parsed.data;
  try {
    const [row] = await db.insert(gameCouponsTable).values({
      gameOrganizerId: org.id, code: d.code.toUpperCase().trim(), discountType: d.discountType,
      discountValue: String(d.discountValue), gameId: d.gameId ?? null, active: d.active,
      maxUses: d.maxUses ?? null, expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
    }).returning();
    return res.json(row);
  } catch {
    return res.status(409).json({ error: "A coupon with that code already exists." });
  }
});

router.patch("/game-organizer/coupons/:id", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const active = req.body?.active;
  if (typeof active !== "boolean") return res.status(400).json({ error: "active must be boolean" });
  const [row] = await db.update(gameCouponsTable).set({ active })
    .where(and(eq(gameCouponsTable.id, id), eq(gameCouponsTable.gameOrganizerId, org.id))).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.delete("/game-organizer/coupons/:id", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(gameCouponsTable).where(and(eq(gameCouponsTable.id, id), eq(gameCouponsTable.gameOrganizerId, org.id)));
  return res.json({ ok: true });
});

// ─── promote (ad) requests ───────────────────────────────────────────────────
router.get("/game-organizer/ads", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const rows = await db.execute(sql`
    SELECT a.id, a.status, a.note, a.admin_note AS "adminNote", a.created_at AS "createdAt",
      g.name AS "gameName", g.is_featured_slider AS "featured"
    FROM game_ad_requests a JOIN games g ON g.id = a.game_id
    WHERE a.game_organizer_id = ${org.id} ORDER BY a.created_at DESC
  `);
  return res.json(rows.rows);
});

router.post("/game-organizer/ads", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const gameId = Number(req.body?.gameId);
  const note = String(req.body?.note ?? "").slice(0, 500);
  if (!Number.isFinite(gameId)) return res.status(400).json({ error: "gameId required" });
  const owns = await db.select({ id: gamesTable.id }).from(gamesTable)
    .where(and(eq(gamesTable.id, gameId), eq(gamesTable.gameOrganizerId, org.id))).limit(1);
  if (!owns[0]) return res.status(404).json({ error: "Game not found" });
  const [row] = await db.insert(gameAdRequestsTable).values({ gameOrganizerId: org.id, gameId, note }).returning();
  return res.json(row);
});

// ════════════════════════════════════════════════════════════════════════════
// REVENUE / BANKING / SETTLEMENTS
// ════════════════════════════════════════════════════════════════════════════

router.get("/game-organizer/revenue", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const games = await db.execute(sql`
    SELECT g.id, g.name, 'game' AS "type",
      g.commission_pct AS "commissionPct", g.gateway_fee_percent AS "gatewayFeePercent",
      COALESCE(SUM(l.revenue), 0) AS "revenue",
      COALESCE(SUM(l.commission), 0) AS "commission",
      COALESCE(SUM(l.gateway_fee), 0) AS "gatewayFee",
      COALESCE(SUM(l.net), 0) AS "net",
      COUNT(l.id)::int AS "attended"
    FROM games g
    LEFT JOIN game_commission_ledger l ON l.game_id = g.id
    WHERE g.game_organizer_id = ${org.id}
    GROUP BY g.id, g.name, g.commission_pct, g.gateway_fee_percent
    ORDER BY g.created_at DESC
  `);
  const packages = await db.execute(sql`
    SELECT p.id, p.name, 'package' AS "type",
      p.commission_pct AS "commissionPct", p.gateway_fee_percent AS "gatewayFeePercent",
      COALESCE(SUM(l.revenue), 0) AS "revenue",
      COALESCE(SUM(l.commission), 0) AS "commission",
      COALESCE(SUM(l.gateway_fee), 0) AS "gatewayFee",
      COALESCE(SUM(l.net), 0) AS "net",
      COUNT(l.id)::int AS "attended"
    FROM game_packages p
    LEFT JOIN game_commission_ledger l ON l.game_package_id = p.id
    WHERE p.game_organizer_id = ${org.id}
    GROUP BY p.id, p.name, p.commission_pct, p.gateway_fee_percent
    ORDER BY p.created_at DESC
  `);
  const [tot] = (await db.execute(sql`
    SELECT
      COALESCE(SUM(revenue), 0)     AS "revenue",
      COALESCE(SUM(commission), 0)  AS "commission",
      COALESCE(SUM(gateway_fee), 0) AS "gatewayFee",
      COALESCE(SUM(net), 0)         AS "net"
    FROM game_commission_ledger WHERE game_organizer_id = ${org.id}
  `)).rows as any[];
  return res.json({
    games: games.rows,
    packages: packages.rows,
    totals: tot ?? { revenue: 0, commission: 0, gatewayFee: 0, net: 0 },
    commissionOwed: org.commissionOwed,
  });
});

const BankingBody = z.object({
  accountHolderName: z.string().max(255).optional().default(""),
  bankName: z.string().max(255).optional().default(""),
  accountNumber: z.string().max(50).optional().default(""),
  ifscCode: z.string().max(20).optional().default(""),
});

router.get("/game-organizer/banking", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const banking = (await db.select().from(gameBankingDetailsTable).where(eq(gameBankingDetailsTable.gameOrganizerId, org.id)).limit(1))[0] ?? null;
  const settlements = await db.select().from(gameSettlementsTable).where(eq(gameSettlementsTable.gameOrganizerId, org.id)).orderBy(desc(gameSettlementsTable.createdAt)).limit(50);
  return res.json({ banking, settlements, commissionOwed: org.commissionOwed });
});

router.put("/game-organizer/banking", requireAuth(["game_organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No game organizer profile" });
  const parsed = BankingBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const existing = (await db.select().from(gameBankingDetailsTable).where(eq(gameBankingDetailsTable.gameOrganizerId, org.id)).limit(1))[0];
  if (existing) {
    const [row] = await db.update(gameBankingDetailsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(gameBankingDetailsTable.id, existing.id)).returning();
    return res.json(row);
  }
  const [row] = await db.insert(gameBankingDetailsTable).values({ gameOrganizerId: org.id, ...parsed.data }).returning();
  return res.json(row);
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN
// ════════════════════════════════════════════════════════════════════════════

router.get("/admin/game-organizers", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      o.*,
      u.email AS "ownerEmail",
      (SELECT COUNT(*)::int FROM games g WHERE g.game_organizer_id = o.id) AS "gameCount",
      (SELECT COUNT(*)::int FROM game_packages p WHERE p.game_organizer_id = o.id) AS "packageCount"
    FROM game_organizers o
    LEFT JOIN users u ON u.id = o.user_id
    ORDER BY o.created_at DESC
  `);
  return res.json(rows.rows);
});

// Sentinel owner id for unassigned admin-created game organizers (mirrors the
// unassigned-venue pattern). Partial unique index game_organizers_user_assigned_idx
// (WHERE user_id <> 0) lets many of these coexist before assignment.
const UNASSIGNED_GAME_ORG_USER_ID = 0;

// Admin: create a Game Organizer from the Venues tab WITHOUT an owner. It sits
// unassigned (owner id 0, status 'pending') until an admin assigns it to a
// partner by email later — exactly like admin-created venues.
const AdminCreateGameOrgBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional().default(""),
  logoUrl: z.string().optional().default(""),
  coverImageUrl: z.string().optional().default(""),
  website: z.string().max(255).optional().default(""),
  instagram: z.string().max(255).optional().default(""),
  facebook: z.string().max(255).optional().default(""),
  youtube: z.string().max(255).optional().default(""),
  supportEmail: z.string().max(255).optional().default(""),
  supportPhone: z.string().max(50).optional().default(""),
  address: z.string().max(2000).optional().default(""),
  mapsUrl: z.string().max(1000).optional().default(""),
  city: z.string().max(100).optional().default(""),
  state: z.string().max(100).optional().default(""),
});

router.post("/admin/create-game-organizer", requireAuth(["admin"]), async (req, res) => {
  const parsed = AdminCreateGameOrgBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const d = parsed.data;

  const slug = await uniqueOrganizerSlug(d.name);
  const usedPrefixes = (await db.select({ p: gameOrganizersTable.ticketPrefix }).from(gameOrganizersTable))
    .map((r) => r.p)
    .filter((p): p is string => Boolean(p));
  const ticketPrefix = await generateUniqueTicketPrefix(d.name, usedPrefixes);
  const ticketSalt = generateTicketSalt();

  const [row] = await db.insert(gameOrganizersTable).values({
    userId: UNASSIGNED_GAME_ORG_USER_ID,
    name: d.name.trim(),
    slug,
    description: d.description,
    logoUrl: d.logoUrl,
    coverImageUrl: d.coverImageUrl,
    website: d.website,
    instagram: d.instagram,
    facebook: d.facebook,
    youtube: d.youtube,
    supportEmail: d.supportEmail,
    supportPhone: d.supportPhone,
    address: d.address,
    mapsUrl: d.mapsUrl,
    city: d.city,
    state: d.state,
    status: "pending",
    ticketPrefix,
    ticketSalt,
  }).returning();
  return res.json(row);
});

// Admin: assign (or reassign) an unassigned game organizer to a partner by email.
router.post("/admin/game-organizers/:id/assign", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const emailRaw = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!emailRaw) return res.status(400).json({ error: "Partner email is required" });

  const [org] = await db.select().from(gameOrganizersTable).where(eq(gameOrganizersTable.id, id)).limit(1);
  if (!org) return res.status(404).json({ error: "Game organizer not found" });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, emailRaw)).limit(1);
  if (!user) {
    return res.status(404).json({ error: `No account found for "${emailRaw}". The partner must have a registered Royvento account before a game organizer can be assigned.` });
  }
  if (user.role === "admin") return res.status(400).json({ error: "Cannot assign a game organizer to an admin account." });
  if (org.userId === user.id) return res.status(409).json({ error: "This game organizer is already assigned to that partner." });

  const [otherOrg] = await db
    .select({ id: gameOrganizersTable.id, name: gameOrganizersTable.name })
    .from(gameOrganizersTable)
    .where(and(eq(gameOrganizersTable.userId, user.id), sql`${gameOrganizersTable.id} <> ${id}`))
    .limit(1);
  if (otherOrg) {
    return res.status(409).json({ error: `${user.email} already owns a game organizer ("${otherOrg.name}"). Each partner can own only one — unassign that one first.` });
  }

  const prevOwnerId = org.userId;
  await db.update(gameOrganizersTable)
    .set({ userId: user.id, status: "approved", approvedAt: org.approvedAt ?? new Date() })
    .where(eq(gameOrganizersTable.id, id));
  await db.update(usersTable).set({ role: "game_organizer" }).where(eq(usersTable.id, user.id));

  if (prevOwnerId && prevOwnerId !== UNASSIGNED_GAME_ORG_USER_ID && prevOwnerId !== user.id) {
    const [stillOwns] = await db.select({ id: gameOrganizersTable.id }).from(gameOrganizersTable).where(eq(gameOrganizersTable.userId, prevOwnerId)).limit(1);
    if (!stillOwns) await db.update(usersTable).set({ role: "user" }).where(eq(usersTable.id, prevOwnerId));
  }

  try {
    await createUserNotification({
      userId: user.id,
      title: "A game organizer profile has been assigned to you",
      message: `You can now manage "${org.name}" from your game organizer dashboard.`,
      url: "/dashboard/game-organizer",
      tag: `game-organizer-assigned-${id}`,
    });
  } catch { /* best-effort */ }

  const [row] = await db.select().from(gameOrganizersTable).where(eq(gameOrganizersTable.id, id)).limit(1);
  return res.json({ ...row, ownerEmail: user.email });
});

// Admin: unassign a game organizer — return it to the unassigned pool.
router.post("/admin/game-organizers/:id/unassign", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const [org] = await db.select().from(gameOrganizersTable).where(eq(gameOrganizersTable.id, id)).limit(1);
  if (!org) return res.status(404).json({ error: "Game organizer not found" });
  if (org.userId === UNASSIGNED_GAME_ORG_USER_ID) return res.status(409).json({ error: "Game organizer is already unassigned." });

  const prevOwnerId = org.userId;
  await db.update(gameOrganizersTable)
    .set({ userId: UNASSIGNED_GAME_ORG_USER_ID, status: "pending", approvedAt: null })
    .where(eq(gameOrganizersTable.id, id));
  if (prevOwnerId) {
    const [stillOwns] = await db.select({ id: gameOrganizersTable.id }).from(gameOrganizersTable).where(eq(gameOrganizersTable.userId, prevOwnerId)).limit(1);
    if (!stillOwns) await db.update(usersTable).set({ role: "user" }).where(eq(usersTable.id, prevOwnerId));
  }
  const [row] = await db.select().from(gameOrganizersTable).where(eq(gameOrganizersTable.id, id)).limit(1);
  return res.json({ ...row, ownerEmail: null });
});

// Admin: full game-organizer profile for the edit form prefill.
router.get("/admin/game-organizers/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const [row] = await db.select().from(gameOrganizersTable).where(eq(gameOrganizersTable.id, id)).limit(1);
  if (!row) return res.status(404).json({ error: "Not found" });
  const [owner] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, row.userId)).limit(1);
  return res.json({ ...row, ownerEmail: owner?.email ?? null });
});

// Admin: update a game-organizer's profile fields (edit form save).
const AdminUpdateGameOrgBody = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  logoUrl: z.string().optional(),
  coverImageUrl: z.string().optional(),
  website: z.string().max(255).optional(),
  instagram: z.string().max(255).optional(),
  facebook: z.string().max(255).optional(),
  youtube: z.string().max(255).optional(),
  supportEmail: z.string().max(255).optional(),
  supportPhone: z.string().max(50).optional(),
  address: z.string().max(2000).optional(),
  mapsUrl: z.string().max(1000).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
});

router.patch("/admin/game-organizers/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = AdminUpdateGameOrgBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const [org] = await db.select().from(gameOrganizersTable).where(eq(gameOrganizersTable.id, id)).limit(1);
  if (!org) return res.status(404).json({ error: "Not found" });

  const updates: Record<string, unknown> = {};
  for (const k of ["description", "logoUrl", "coverImageUrl", "website", "instagram", "facebook", "youtube", "supportEmail", "supportPhone", "address", "mapsUrl", "city", "state"] as const) {
    if (parsed.data[k] !== undefined) updates[k] = parsed.data[k];
  }
  if (parsed.data.name !== undefined && parsed.data.name.trim() && parsed.data.name.trim() !== org.name) {
    updates["name"] = parsed.data.name.trim();
    updates["slug"] = await uniqueOrganizerSlug(parsed.data.name, org.id);
  }
  const [row] = await db.update(gameOrganizersTable).set(updates).where(eq(gameOrganizersTable.id, id)).returning();
  return res.json(row);
});

router.patch("/admin/game-organizers/:id/verify", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const { verified } = req.body as { verified?: boolean };
  const [row] = await db.update(gameOrganizersTable).set({ verified: verified !== false }).where(eq(gameOrganizersTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.patch("/admin/game-organizers/:id/status", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const { status } = req.body as { status?: string };
  if (status !== "approved" && status !== "rejected" && status !== "pending") {
    return res.status(400).json({ error: "Invalid status" });
  }
  const [row] = await db.update(gameOrganizersTable)
    .set({ status, approvedAt: status === "approved" ? new Date() : null })
    .where(eq(gameOrganizersTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

// Admin: permanently delete a game organizer and everything they own.
router.delete("/admin/game-organizers/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const org = (await db.select().from(gameOrganizersTable).where(eq(gameOrganizersTable.id, id)).limit(1))[0];
  if (!org) return res.status(404).json({ error: "Not found" });

  await db.transaction(async (tx) => {
    await tx.delete(bookingsTable).where(eq(bookingsTable.gameOrganizerId, id));
    await tx.delete(gamesTable).where(eq(gamesTable.gameOrganizerId, id));
    await tx.delete(gamePackagesTable).where(eq(gamePackagesTable.gameOrganizerId, id));
    await tx.delete(gameAdRequestsTable).where(eq(gameAdRequestsTable.gameOrganizerId, id));
    await tx.delete(gameCommissionLedgerTable).where(eq(gameCommissionLedgerTable.gameOrganizerId, id));
    await tx.delete(gameCouponsTable).where(eq(gameCouponsTable.gameOrganizerId, id));
    await tx.delete(gameReviewsTable).where(eq(gameReviewsTable.gameOrganizerId, id));
    await tx.delete(gameManagersTable).where(eq(gameManagersTable.gameOrganizerId, id));
    await tx.delete(gameBankingDetailsTable).where(eq(gameBankingDetailsTable.gameOrganizerId, id));
    await tx.delete(gameSettlementsTable).where(eq(gameSettlementsTable.gameOrganizerId, id));
    await tx.delete(gameProfileViewsTable).where(eq(gameProfileViewsTable.gameOrganizerId, id));
    await tx.delete(gameOrganizersTable).where(eq(gameOrganizersTable.id, id));
    // Demote back to a regular user and wipe prior partner applications so the
    // become-vendor form treats them as fresh — a stale "approved" request
    // otherwise shows "You're already a partner!" and blocks re-applying.
    if (org.userId) {
      await tx.update(usersTable)
        .set({ role: "user" })
        .where(and(eq(usersTable.id, org.userId), eq(usersTable.role, "game_organizer")));
      await tx.delete(vendorRequestsTable).where(eq(vendorRequestsTable.userId, org.userId));
    }
  });

  logger.info({ gameOrganizerId: id, userId: org.userId }, "admin deleted game organizer");
  return res.json({ ok: true });
});

// Admin: all games (approval queue lives in /pending; this is the full list).
router.get("/admin/games", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      g.id, g.name, g.slug, g.category, g.cover_image_url AS "coverImageUrl",
      g.approval_status AS "approvalStatus", g.is_featured_slider AS "isFeaturedSlider",
      g.commission_pct AS "commissionPct", g.gateway_fee_percent AS "gatewayFeePercent",
      g.pricing_model AS "pricingModel", g.price, g.hourly_rate AS "hourlyRate",
      o.name AS "organizerName"
    FROM games g
    JOIN game_organizers o ON o.id = g.game_organizer_id
    ORDER BY g.created_at DESC
  `);
  return res.json(rows.rows);
});

router.get("/admin/game-packages", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      p.id, p.name, p.slug, p.cover_image_url AS "coverImageUrl",
      p.approval_status AS "approvalStatus", p.commission_pct AS "commissionPct",
      p.gateway_fee_percent AS "gatewayFeePercent", p.price,
      o.name AS "organizerName"
    FROM game_packages p
    JOIN game_organizers o ON o.id = p.game_organizer_id
    ORDER BY p.created_at DESC
  `);
  return res.json(rows.rows);
});

router.patch("/admin/games/:id/slider", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const { isFeaturedSlider } = req.body as { isFeaturedSlider?: boolean };
  if (typeof isFeaturedSlider !== "boolean") return res.status(400).json({ error: "isFeaturedSlider must be a boolean" });
  const [row] = await db.update(gamesTable).set({ isFeaturedSlider }).where(eq(gamesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.get("/admin/games/pending", requireAuth(["admin"]), async (_req, res) => {
  const games = await db.execute(sql`
    SELECT g.id, g.name, g.slug, g.category, g.cover_image_url AS "coverImageUrl",
      g.pricing_model AS "pricingModel", g.price, g.hourly_rate AS "hourlyRate", g.created_at AS "createdAt",
      o.id AS "organizerId", o.name AS "organizerName", o.verified AS "organizerVerified", 'game' AS "kind"
    FROM games g JOIN game_organizers o ON o.id = g.game_organizer_id
    WHERE g.approval_status = 'pending' ORDER BY g.created_at ASC
  `);
  const packages = await db.execute(sql`
    SELECT p.id, p.name, p.slug, '' AS "category", p.cover_image_url AS "coverImageUrl",
      'package' AS "pricingModel", p.price, '0' AS "hourlyRate", p.created_at AS "createdAt",
      o.id AS "organizerId", o.name AS "organizerName", o.verified AS "organizerVerified", 'package' AS "kind"
    FROM game_packages p JOIN game_organizers o ON o.id = p.game_organizer_id
    WHERE p.approval_status = 'pending' ORDER BY p.created_at ASC
  `);
  return res.json([...games.rows, ...packages.rows]);
});

router.patch("/admin/games/:id/approve", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const [row] = await db.update(gamesTable)
    .set({ approvalStatus: "approved", rejectionReason: "", approvedAt: new Date() })
    .where(eq(gamesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  const orgRows = await db.select({ userId: gameOrganizersTable.userId }).from(gameOrganizersTable).where(eq(gameOrganizersTable.id, row.gameOrganizerId)).limit(1);
  if (orgRows[0]) await awardCoins(orgRows[0].userId, 50);
  return res.json(row);
});

router.patch("/admin/games/:id/reject", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const { rejectionReason } = req.body as { rejectionReason?: string };
  const [row] = await db.update(gamesTable)
    .set({ approvalStatus: "rejected", rejectionReason: rejectionReason ?? "" })
    .where(eq(gamesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.patch("/admin/game-packages/:id/approve", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const [row] = await db.update(gamePackagesTable)
    .set({ approvalStatus: "approved", rejectionReason: "", approvedAt: new Date() })
    .where(eq(gamePackagesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.patch("/admin/game-packages/:id/reject", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const { rejectionReason } = req.body as { rejectionReason?: string };
  const [row] = await db.update(gamePackagesTable)
    .set({ approvalStatus: "rejected", rejectionReason: rejectionReason ?? "" })
    .where(eq(gamePackagesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

// Admin: per-game / per-package commission % (and gateway fee %).
const CommissionBody = z.object({
  commissionPct: z.coerce.number().min(0).max(100).optional(),
  gatewayFeePercent: z.coerce.number().min(0).max(100).optional(),
});
router.patch("/admin/games/:id/commission", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = CommissionBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const updates: Record<string, unknown> = {};
  if (parsed.data.commissionPct != null) updates["commissionPct"] = String(parsed.data.commissionPct);
  if (parsed.data.gatewayFeePercent != null) updates["gatewayFeePercent"] = String(parsed.data.gatewayFeePercent);
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: "Nothing to update" });
  const [row] = await db.update(gamesTable).set(updates).where(eq(gamesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json({ id: row.id, commissionPct: row.commissionPct, gatewayFeePercent: row.gatewayFeePercent });
});

router.patch("/admin/game-packages/:id/commission", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = CommissionBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const updates: Record<string, unknown> = {};
  if (parsed.data.commissionPct != null) updates["commissionPct"] = String(parsed.data.commissionPct);
  if (parsed.data.gatewayFeePercent != null) updates["gatewayFeePercent"] = String(parsed.data.gatewayFeePercent);
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: "Nothing to update" });
  const [row] = await db.update(gamePackagesTable).set(updates).where(eq(gamePackagesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json({ id: row.id, commissionPct: row.commissionPct, gatewayFeePercent: row.gatewayFeePercent });
});

// Admin: settlement dashboard.
router.get("/admin/game-settlements", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      o.id, o.name, o.slug, o.commission_owed AS "commissionOwed",
      b.account_holder_name AS "accountHolderName", b.bank_name AS "bankName",
      b.account_number AS "accountNumber", b.ifsc_code AS "ifscCode",
      COALESCE((SELECT SUM(l.revenue) FROM game_commission_ledger l WHERE l.game_organizer_id = o.id), 0) AS "lifetimeRevenue",
      COALESCE((SELECT SUM(l.commission) FROM game_commission_ledger l WHERE l.game_organizer_id = o.id), 0) AS "lifetimeCommission"
    FROM game_organizers o
    LEFT JOIN game_banking_details b ON b.game_organizer_id = o.id
    ORDER BY o.commission_owed DESC, o.created_at DESC
  `);
  return res.json(rows.rows);
});

const SettleBody = z.object({
  amount: z.coerce.number().min(0.01),
  note: z.string().max(500).optional().default(""),
});
router.post("/admin/game-organizers/:id/settle", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = SettleBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const org = (await db.select().from(gameOrganizersTable).where(eq(gameOrganizersTable.id, id)).limit(1))[0];
  if (!org) return res.status(404).json({ error: "Not found" });
  const owed = Number(org.commissionOwed ?? 0);
  const amount = Math.min(parsed.data.amount, owed);
  if (amount <= 0) return res.status(400).json({ error: "Nothing owed to settle." });
  await db.transaction(async (tx) => {
    await tx.update(gameOrganizersTable)
      .set({ commissionOwed: sql`GREATEST(0, ${gameOrganizersTable.commissionOwed} - ${String(amount)})` })
      .where(eq(gameOrganizersTable.id, id));
    await tx.insert(gameSettlementsTable).values({ gameOrganizerId: id, amount: String(amount), status: "settled", adminNote: parsed.data.note });
  });
  return res.json({ ok: true, settled: amount });
});

// Admin: promote (ad) requests.
router.get("/admin/game-ads", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT a.id, a.status, a.note, a.admin_note AS "adminNote", a.created_at AS "createdAt",
      o.name AS "organizerName", g.name AS "gameName", g.id AS "gameId", g.is_featured_slider AS "featured"
    FROM game_ad_requests a
    JOIN game_organizers o ON o.id = a.game_organizer_id
    JOIN games g ON g.id = a.game_id
    ORDER BY (a.status = 'pending') DESC, a.created_at DESC
  `);
  return res.json(rows.rows);
});

router.patch("/admin/game-ads/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const status = String(req.body?.status ?? "");
  const adminNote = String(req.body?.adminNote ?? "").slice(0, 500);
  if (status !== "approved" && status !== "rejected") return res.status(400).json({ error: "Invalid status" });
  const [row] = await db.update(gameAdRequestsTable).set({ status, adminNote }).where(eq(gameAdRequestsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  if (status === "approved") {
    await db.update(gamesTable).set({ isFeaturedSlider: true }).where(eq(gamesTable.id, row.gameId));
  }
  return res.json(row);
});

// Admin: create a game organizer profile on behalf of any user (seed/support).
router.post("/admin/game-organizers/seed", requireAuth(["admin"]), async (req, res) => {
  const AdminOrgBody = ProfileBody.extend({ userId: z.number().int() });
  const parsed = AdminOrgBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const { userId, ...profile } = parsed.data;
  const existing = await db.select({ id: gameOrganizersTable.id }).from(gameOrganizersTable).where(eq(gameOrganizersTable.userId, userId)).limit(1);
  if (existing[0]) return res.status(409).json({ error: "Game organizer profile already exists for this user", id: existing[0].id });
  const u = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u[0]) return res.status(404).json({ error: "User not found" });
  const slug = await uniqueOrganizerSlug(profile.name);
  const usedPrefixes = (await db.select({ p: gameOrganizersTable.ticketPrefix }).from(gameOrganizersTable)).map((r) => r.p).filter((p): p is string => Boolean(p));
  const ticketPrefix = await generateUniqueTicketPrefix(profile.name, usedPrefixes);
  const ticketSalt = generateTicketSalt();
  const [row] = await db.insert(gameOrganizersTable).values({ userId, slug, ...profile, status: "approved", verified: true, ticketPrefix, ticketSalt }).returning();
  await db.update(usersTable).set({ role: "game_organizer" }).where(eq(usersTable.id, userId));
  return res.json(row);
});

export default router;
