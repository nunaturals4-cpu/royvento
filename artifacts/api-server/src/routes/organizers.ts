import { Router, type IRouter, type Response } from "express";
import crypto from "crypto";
import {
  db,
  organizersTable,
  organizerEventsTable,
  eventTicketsTable,
  organizerReviewsTable,
  organizerManagersTable,
  organizerCommissionLedgerTable,
  organizerBankingDetailsTable,
  organizerSettlementsTable,
  organizerCouponsTable,
  organizerAdRequestsTable,
  organizerProfileViewsTable,
  bookingsTable,
  paymentsTable,
  usersTable,
  vendorRequestsTable,
  vendorsTable,
  pointsLedgerTable,
} from "@workspace/db";
import { createOrder as createRazorpayOrder, isRazorpayConfigured, getKeyId as getRazorpayKeyId } from "../lib/razorpay";
import type { OrganizerManagerPermissions } from "@workspace/db";
import { eq, and, desc, sql, inArray, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { respondInvalid } from "../lib/validationError";
import { logger } from "../lib/logger";
import { generateTicketCode, verifyTicketCode, generateUniqueTicketPrefix, generateTicketSalt } from "../lib/ticketCode";
import { createUserNotification } from "../lib/notify";

const DEFAULT_MANAGER_PERMS: OrganizerManagerPermissions = { scan: true, attendance: true, reports: false };

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
  const root = slugify(base) || "organizer";
  let candidate = root;
  let n = 1;
  // Loop until no other organizer holds this slug.
  while (true) {
    const rows = await db
      .select({ id: organizersTable.id })
      .from(organizersTable)
      .where(eq(organizersTable.slug, candidate))
      .limit(1);
    const hit = rows[0];
    if (!hit || (excludeId && hit.id === excludeId)) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

async function uniqueEventSlug(base: string): Promise<string> {
  const root = slugify(base) || "event";
  let candidate = root;
  let n = 1;
  while (true) {
    const rows = await db
      .select({ id: organizerEventsTable.id })
      .from(organizerEventsTable)
      .where(eq(organizerEventsTable.slug, candidate))
      .limit(1);
    if (!rows[0]) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

async function getMyOrganizer(userId: number) {
  const rows = await db
    .select()
    .from(organizersTable)
    .where(eq(organizersTable.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

// The pub/club/bar/lounge an organizer can link an event to. Any approved venue
// is an eligible host — including ones hidden from the public catalog, so an
// organizer can always find a partner to collaborate with.
async function getApprovedVenue(venueId: number) {
  const rows = await db
    .select()
    .from(vendorsTable)
    .where(and(eq(vendorsTable.id, venueId), eq(vendorsTable.status, "approved")))
    .limit(1);
  return rows[0] ?? null;
}

// Resolve the vendor (venue) owned by a partner user, for the approval endpoints.
async function getMyVendor(userId: number) {
  const rows = await db.select().from(vendorsTable).where(eq(vendorsTable.userId, userId)).limit(1);
  return rows[0] ?? null;
}

type VenueRow = typeof vendorsTable.$inferSelect;

// Validate an optional venue link. Returns the venue row when linked, null when
// not linked, or the "invalid" sentinel (after sending a 400) for a bad id.
async function resolveVenueLink(
  venueId: number | null | undefined,
  res: Response,
): Promise<VenueRow | null | "invalid"> {
  if (venueId == null) return null;
  const venue = await getApprovedVenue(venueId);
  if (!venue) {
    res.status(400).json({ error: "Selected venue is not available" });
    return "invalid";
  }
  return venue;
}

// Link/approval columns for an organizer event. A linked event starts as
// venue-pending; an unlinked one clears the link. Visible venue fields
// (name/address/city) are auto-filled client-side and kept editable, so they
// flow through the normal event body — not overridden here.
function venueValues(venue: VenueRow | null) {
  if (!venue) return { venueId: null, venueApprovalStatus: "", venueRejectionReason: "" };
  return { venueId: venue.id, venueApprovalStatus: "pending" as const, venueRejectionReason: "" };
}

// Earn-only Royvento Coins stub. Full redemption/cashback lands in a later phase.
async function awardOrganizerCoins(userId: number, points: number) {
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await db.insert(pointsLedgerTable).values({
      userId,
      points,
      source: "admin", // reuse existing allowed source until a dedicated one is added
      expiresAt,
    });
  } catch (err) {
    logger.error({ err }, "awardOrganizerCoins failed (non-critical)");
  }
}

// ─── validation ─────────────────────────────────────────────────────────────

const ProfileBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().default(""),
  logoUrl: z.string().optional().default(""),
  coverImageUrl: z.string().optional().default(""),
  website: z.string().optional().default(""),
  instagram: z.string().optional().default(""),
  facebook: z.string().optional().default(""),
  youtube: z.string().optional().default(""),
  supportEmail: z.string().optional().default(""),
  supportPhone: z.string().optional().default(""),
  city: z.string().optional().default(""),
  state: z.string().optional().default(""),
});

const ArtistSchema = z.object({
  name: z.string().default(""),
  role: z.string().default(""),
  imageUrl: z.string().default(""),
  bio: z.string().default(""),
  socials: z.string().default(""),
});
const ScheduleSchema = z.object({
  time: z.string().default(""),
  title: z.string().default(""),
  desc: z.string().default(""),
});
const PoliciesSchema = z.object({
  dressCode: z.string().default(""),
  entryRules: z.string().default(""),
  agePolicy: z.string().default(""),
  refundPolicy: z.string().default(""),
  cancellationPolicy: z.string().default(""),
});
const FaqSchema = z.object({ q: z.string().default(""), a: z.string().default("") });

const EventBody = z.object({
  title: z.string().min(1).max(255),
  category: z.string().optional().default(""),
  subcategory: z.string().optional().default(""),
  shortDescription: z.string().max(500).optional().default(""),
  description: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  language: z.string().optional().default(""),
  ageRestriction: z.string().optional().default(""),
  coverImageUrl: z.string().optional().default(""),
  bannerUrl: z.string().optional().default(""),
  mobileBannerUrl: z.string().optional().default(""),
  galleryImages: z.array(z.string()).optional().default([]),
  promoVideos: z.array(z.string()).optional().default([]),
  venueName: z.string().optional().default(""),
  address: z.string().optional().default(""),
  mapsUrl: z.string().optional().default(""),
  capacity: z.coerce.number().int().min(0).optional().default(0),
  country: z.string().optional().default("India"),
  city: z.string().optional().default(""),
  state: z.string().optional().default(""),
  startDate: z.string().optional().nullable().default(null),
  endDate: z.string().optional().nullable().default(null),
  startTime: z.string().optional().default(""),
  endTime: z.string().optional().default(""),
  isMultiDay: z.boolean().optional().default(false),
  // Happening Tonight — real-time discovery visibility controls.
  happeningTonight: z.boolean().optional().default(true),
  startingSoon: z.boolean().optional().default(true),
  lastMinuteDeal: z.boolean().optional().default(false),
  dealLabel: z.string().max(120).optional().default(""),
  artists: z.array(ArtistSchema).optional().default([]),
  highlights: z.array(z.string()).optional().default([]),
  schedule: z.array(ScheduleSchema).optional().default([]),
  policies: PoliciesSchema.optional().default({
    dressCode: "", entryRules: "", agePolicy: "", refundPolicy: "", cancellationPolicy: "",
  }),
  faqs: z.array(FaqSchema).optional().default([]),
  // Host venue link (pub/club/bar/lounge). When set, the event must be approved
  // by that venue's partner before going public. null = standalone event.
  venueId: z.coerce.number().int().positive().optional().nullable().default(null),
});

const TicketBody = z.object({
  type: z.enum(["free", "paid", "early_bird", "vip", "couple", "group", "student"]).default("paid"),
  name: z.string().min(1).max(120),
  description: z.string().optional().default(""),
  price: z.coerce.number().min(0).max(9999999).optional().default(0),
  quantity: z.coerce.number().int().min(0).optional().default(0),
  bookingLimit: z.coerce.number().int().min(0).optional().default(0),
  salesStartAt: z.string().optional().nullable().default(null),
  salesEndAt: z.string().optional().nullable().default(null),
  active: z.boolean().optional().default(true),
});

function eventValuesFromBody(data: z.infer<typeof EventBody>) {
  return {
    title: data.title,
    category: data.category,
    subcategory: data.subcategory,
    shortDescription: data.shortDescription,
    description: data.description,
    tags: data.tags,
    language: data.language,
    ageRestriction: data.ageRestriction,
    coverImageUrl: data.coverImageUrl,
    bannerUrl: data.bannerUrl,
    mobileBannerUrl: data.mobileBannerUrl,
    galleryImages: data.galleryImages,
    promoVideos: data.promoVideos,
    venueName: data.venueName,
    address: data.address,
    mapsUrl: data.mapsUrl,
    capacity: data.capacity,
    country: data.country,
    city: data.city,
    state: data.state,
    startDate: data.startDate || null,
    endDate: data.endDate || null,
    startTime: data.startTime,
    endTime: data.endTime,
    isMultiDay: data.isMultiDay,
    happeningTonight: data.happeningTonight,
    startingSoon: data.startingSoon,
    lastMinuteDeal: data.lastMinuteDeal,
    dealLabel: data.dealLabel,
    artists: data.artists,
    highlights: data.highlights,
    schedule: data.schedule,
    policies: data.policies,
    faqs: data.faqs,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ORGANIZER SELF
// ════════════════════════════════════════════════════════════════════════════

// Create (upgrade current user to organizer) or no-op if already exists.
router.post("/organizer/profile", requireAuth(), async (req, res) => {
  const user = (req as any).user as { id: number };
  const parsed = ProfileBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const existing = await getMyOrganizer(user.id);
  if (existing) return res.status(409).json({ error: "Organizer profile already exists" });
  const slug = await uniqueOrganizerSlug(parsed.data.name);
  // Generate per-organizer QR signing material so ticket codes can be issued.
  const usedPrefixes = (await db.select({ p: organizersTable.ticketPrefix }).from(organizersTable))
    .map((r) => r.p).filter((p): p is string => Boolean(p));
  const ticketPrefix = await generateUniqueTicketPrefix(parsed.data.name, usedPrefixes);
  const ticketSalt = generateTicketSalt();
  const [row] = await db
    .insert(organizersTable)
    .values({ userId: user.id, slug, ...parsed.data, status: "pending", ticketPrefix, ticketSalt })
    .returning();
  // Promote the account to organizer so the dashboard + role gating unlock.
  await db.update(usersTable).set({ role: "organizer" }).where(eq(usersTable.id, user.id));
  return res.json(row);
});

router.get("/organizer/profile", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(404).json({ error: "No organizer profile" });
  return res.json(org);
});

router.patch("/organizer/profile", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(404).json({ error: "No organizer profile" });
  const parsed = ProfileBody.partial().safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.name && parsed.data.name !== org.name) {
    updates["slug"] = await uniqueOrganizerSlug(parsed.data.name, org.id);
  }
  const [row] = await db
    .update(organizersTable)
    .set(updates)
    .where(eq(organizersTable.id, org.id))
    .returning();
  return res.json(row);
});

// ════════════════════════════════════════════════════════════════════════════
// ORGANIZER EVENTS (owned)
// ════════════════════════════════════════════════════════════════════════════

router.get("/organizer/events", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.json([]);
  const rows = await db
    .select()
    .from(organizerEventsTable)
    .where(eq(organizerEventsTable.organizerId, org.id))
    .orderBy(desc(organizerEventsTable.createdAt));
  return res.json(rows);
});

// Venues an organizer can pick as a host for their event. Returns every approved
// venue (including ones hidden from the public catalog) ordered by name, with the
// minimal fields the searchable dropdown needs.
router.get("/organizer/host-venues", requireAuth(["organizer"]), async (_req, res) => {
  const rows = await db
    .select({
      id: vendorsTable.id,
      businessName: vendorsTable.businessName,
      category: vendorsTable.category,
      country: vendorsTable.country,
      city: vendorsTable.city,
      state: vendorsTable.state,
      address: vendorsTable.address,
    })
    .from(vendorsTable)
    .where(eq(vendorsTable.status, "approved"))
    .orderBy(vendorsTable.businessName);
  return res.json(rows);
});

router.post("/organizer/events", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const parsed = EventBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const slug = await uniqueEventSlug(parsed.data.title);

  // Host-venue link: when set, the event awaits that venue partner's approval
  // and its venue fields are auto-filled from the vendor record.
  const venue = await resolveVenueLink(parsed.data.venueId, res);
  if (venue === "invalid") return; // response already sent

  const [row] = await db
    .insert(organizerEventsTable)
    .values({
      organizerId: org.id,
      slug,
      approvalStatus: "pending",
      ...eventValuesFromBody(parsed.data),
      ...venueValues(venue),
    })
    .returning();
  return res.json(row);
});

router.get("/organizer/events/:id", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const rows = await db
    .select()
    .from(organizerEventsTable)
    .where(and(eq(organizerEventsTable.id, id), eq(organizerEventsTable.organizerId, org.id)))
    .limit(1);
  const ev = rows[0];
  if (!ev) return res.status(404).json({ error: "Not found" });
  const tickets = await db
    .select()
    .from(eventTicketsTable)
    .where(eq(eventTicketsTable.eventId, id))
    .orderBy(eventTicketsTable.id);
  return res.json({ ...ev, tickets });
});

router.patch("/organizer/events/:id", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = EventBody.partial().safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const { venueId: venueIdInput, ...rest } = parsed.data;
  // Re-evaluate the venue link only when the edit references venueId, so a
  // partial update that doesn't touch the venue keeps its current link.
  let venueSet: Record<string, unknown> = {};
  if ("venueId" in parsed.data) {
    const venue = await resolveVenueLink(venueIdInput, res);
    if (venue === "invalid") return; // response already sent
    venueSet = venueValues(venue);
  }
  // Edits send the event back to pending review (admin or venue partner).
  const [row] = await db
    .update(organizerEventsTable)
    .set({ ...rest, ...venueSet, approvalStatus: "pending", rejectionReason: "" })
    .where(and(eq(organizerEventsTable.id, id), eq(organizerEventsTable.organizerId, org.id)))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.delete("/organizer/events/:id", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  await db
    .delete(organizerEventsTable)
    .where(and(eq(organizerEventsTable.id, id), eq(organizerEventsTable.organizerId, org.id)));
  return res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// VENUE PARTNER ↔ ORGANIZER EVENT APPROVAL
// A partner (pub/club/bar/lounge) reviews organizer events hosted at their venue
// from their dashboard. Approving makes the event public (it also flips the
// admin-facing approvalStatus to 'approved' so all existing public queries work).
// ════════════════════════════════════════════════════════════════════════════

// Admins target a specific venue via ?vendorId=; partners resolve to their own.
async function resolvePartnerVenue(
  req: { query: Record<string, unknown> },
  user: { id: number; role: string },
) {
  if (user.role === "admin") {
    const raw = req.query["vendorId"];
    const n = raw != null ? Number(raw) : NaN;
    if (Number.isFinite(n)) {
      const rows = await db.select().from(vendorsTable).where(eq(vendorsTable.id, n)).limit(1);
      return rows[0] ?? null;
    }
  }
  return getMyVendor(user.id);
}

// Organizer events hosted at the partner's venue (any status) — the partner's
// inbox of incoming requests shown in the Announcements tab.
router.get("/partner/organizer-events", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const venue = await resolvePartnerVenue(req, user);
  if (!venue) return res.json([]);
  const rows = await db
    .select({
      id: organizerEventsTable.id,
      title: organizerEventsTable.title,
      slug: organizerEventsTable.slug,
      coverImageUrl: organizerEventsTable.coverImageUrl,
      category: organizerEventsTable.category,
      city: organizerEventsTable.city,
      startDate: organizerEventsTable.startDate,
      startTime: organizerEventsTable.startTime,
      shortDescription: organizerEventsTable.shortDescription,
      venueApprovalStatus: organizerEventsTable.venueApprovalStatus,
      venueRejectionReason: organizerEventsTable.venueRejectionReason,
      organizerName: organizersTable.name,
      organizerId: organizersTable.id,
    })
    .from(organizerEventsTable)
    .innerJoin(organizersTable, eq(organizersTable.id, organizerEventsTable.organizerId))
    .where(eq(organizerEventsTable.venueId, venue.id))
    .orderBy(desc(organizerEventsTable.createdAt));
  return res.json(rows);
});

// Load a venue-linked event the partner is authorised to act on.
async function loadPartnerVenueEvent(eventId: number, venueId: number) {
  const rows = await db
    .select()
    .from(organizerEventsTable)
    .where(and(eq(organizerEventsTable.id, eventId), eq(organizerEventsTable.venueId, venueId)))
    .limit(1);
  return rows[0] ?? null;
}

// Full details of a venue-linked event so the partner can review it (with the
// organizer's name + ticket tiers) before approving.
router.get("/partner/organizer-events/:id", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const venue = await resolvePartnerVenue(req, user);
  if (!venue) return res.status(403).json({ error: "No partner profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const ev = await loadPartnerVenueEvent(id, venue.id);
  if (!ev) return res.status(404).json({ error: "Not found" });
  const organizer = (await db.select({ id: organizersTable.id, name: organizersTable.name, supportPhone: organizersTable.supportPhone }).from(organizersTable).where(eq(organizersTable.id, ev.organizerId)).limit(1))[0] ?? null;
  const tickets = await db.select().from(eventTicketsTable).where(eq(eventTicketsTable.eventId, id)).orderBy(eventTicketsTable.id);
  return res.json({ ...ev, organizer, tickets });
});

// The host venue partner can edit the event details before approving. The venue
// link itself can't be changed here (it's their own venue); approval status is
// left untouched so the partner can edit then approve in either order.
router.patch("/partner/organizer-events/:id", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const venue = await resolvePartnerVenue(req, user);
  if (!venue) return res.status(403).json({ error: "No partner profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const ev = await loadPartnerVenueEvent(id, venue.id);
  if (!ev) return res.status(404).json({ error: "Not found" });
  const parsed = EventBody.partial().safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  // Never let the partner re-point the venue link from this endpoint.
  const { venueId: _ignore, ...rest } = parsed.data;
  // Empty date strings must become NULL — the columns are typed `date`.
  if (rest.startDate === "") rest.startDate = null;
  if (rest.endDate === "") rest.endDate = null;
  const [row] = await db
    .update(organizerEventsTable)
    .set(rest)
    .where(eq(organizerEventsTable.id, id))
    .returning();
  return res.json(row);
});

// ── Partner-side ticket tiers for a venue-linked event ──────────────────────
// Mirror the organizer ticket endpoints but authorise via venue ownership so the
// host partner can fully manage tiers on events at their venue.
router.get("/partner/organizer-events/:id/tickets", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const venue = await resolvePartnerVenue(req, user);
  if (!venue) return res.status(403).json({ error: "No partner profile" });
  const eventId = Number(req.params["id"]);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: "Invalid id" });
  if (!(await loadPartnerVenueEvent(eventId, venue.id))) return res.status(404).json({ error: "Not found" });
  const rows = await db.select().from(eventTicketsTable).where(eq(eventTicketsTable.eventId, eventId)).orderBy(eventTicketsTable.id);
  return res.json(rows);
});

router.post("/partner/organizer-events/:id/tickets", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const venue = await resolvePartnerVenue(req, user);
  if (!venue) return res.status(403).json({ error: "No partner profile" });
  const eventId = Number(req.params["id"]);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: "Invalid id" });
  if (!(await loadPartnerVenueEvent(eventId, venue.id))) return res.status(404).json({ error: "Not found" });
  const parsed = TicketBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const { price, salesStartAt, salesEndAt, ...rest } = parsed.data;
  const [row] = await db
    .insert(eventTicketsTable)
    .values({
      eventId,
      ...rest,
      price: String(price ?? 0),
      salesStartAt: salesStartAt ? new Date(salesStartAt) : null,
      salesEndAt: salesEndAt ? new Date(salesEndAt) : null,
    })
    .returning();
  return res.json(row);
});

// Verify the partner's venue hosts the event a given ticket belongs to.
async function partnerOwnsTicket(tid: number, venueId: number) {
  const existing = await db.select().from(eventTicketsTable).where(eq(eventTicketsTable.id, tid)).limit(1);
  const ticket = existing[0];
  if (!ticket) return null;
  if (!(await loadPartnerVenueEvent(ticket.eventId, venueId))) return null;
  return ticket;
}

router.patch("/partner/organizer-tickets/:tid", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const venue = await resolvePartnerVenue(req, user);
  if (!venue) return res.status(403).json({ error: "No partner profile" });
  const tid = Number(req.params["tid"]);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: "Invalid id" });
  if (!(await partnerOwnsTicket(tid, venue.id))) return res.status(404).json({ error: "Not found" });
  const parsed = TicketBody.partial().safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const { price, salesStartAt, salesEndAt, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest };
  if (price != null) updates["price"] = String(price);
  if (salesStartAt !== undefined) updates["salesStartAt"] = salesStartAt ? new Date(salesStartAt) : null;
  if (salesEndAt !== undefined) updates["salesEndAt"] = salesEndAt ? new Date(salesEndAt) : null;
  const [row] = await db.update(eventTicketsTable).set(updates).where(eq(eventTicketsTable.id, tid)).returning();
  return res.json(row);
});

router.delete("/partner/organizer-tickets/:tid", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const venue = await resolvePartnerVenue(req, user);
  if (!venue) return res.status(403).json({ error: "No partner profile" });
  const tid = Number(req.params["tid"]);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: "Invalid id" });
  if (!(await partnerOwnsTicket(tid, venue.id))) return res.status(404).json({ error: "Not found" });
  await db.delete(eventTicketsTable).where(eq(eventTicketsTable.id, tid));
  return res.json({ ok: true });
});

router.patch("/partner/organizer-events/:id/approve", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const venue = await resolvePartnerVenue(req, user);
  if (!venue) return res.status(403).json({ error: "No partner profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const ev = await loadPartnerVenueEvent(id, venue.id);
  if (!ev) return res.status(404).json({ error: "Not found" });
  // Partner approval is the public gate for venue-linked events.
  const [row] = await db
    .update(organizerEventsTable)
    .set({ venueApprovalStatus: "approved", venueRejectionReason: "", approvalStatus: "approved", rejectionReason: "", approvedAt: new Date() })
    .where(eq(organizerEventsTable.id, id))
    .returning();
  // Notify the organizer that their event is live at the venue.
  const org = (await db.select({ userId: organizersTable.userId }).from(organizersTable).where(eq(organizersTable.id, ev.organizerId)).limit(1))[0];
  if (org?.userId) {
    await createUserNotification({
      userId: org.userId,
      title: "Event approved by venue",
      message: `${venue.businessName} approved "${ev.title}". It's now live and bookable.`,
      url: `/organizer-events/${ev.slug}`,
      tag: `org-event-venue-approved-${ev.id}`,
    }).catch(() => {});
  }
  return res.json(row);
});

router.patch("/partner/organizer-events/:id/reject", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const venue = await resolvePartnerVenue(req, user);
  if (!venue) return res.status(403).json({ error: "No partner profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const { rejectionReason } = req.body as { rejectionReason?: string };
  const ev = await loadPartnerVenueEvent(id, venue.id);
  if (!ev) return res.status(404).json({ error: "Not found" });
  const [row] = await db
    .update(organizerEventsTable)
    .set({ venueApprovalStatus: "rejected", venueRejectionReason: rejectionReason ?? "", approvalStatus: "rejected", rejectionReason: rejectionReason ?? "" })
    .where(eq(organizerEventsTable.id, id))
    .returning();
  const org = (await db.select({ userId: organizersTable.userId }).from(organizersTable).where(eq(organizersTable.id, ev.organizerId)).limit(1))[0];
  if (org?.userId) {
    await createUserNotification({
      userId: org.userId,
      title: "Event declined by venue",
      message: `${venue.businessName} declined "${ev.title}"${rejectionReason ? `: ${rejectionReason}` : ""}.`,
      url: `/dashboard/organizer`,
      tag: `org-event-venue-rejected-${ev.id}`,
    }).catch(() => {});
  }
  return res.json(row);
});

// Public: approved organizer events hosted at a given venue, for the venue's
// public page. Same shape as the public organizer-events grid.
router.get("/vendors/:vendorId/organizer-events", async (req, res) => {
  const vendorId = Number(req.params["vendorId"]);
  if (!Number.isFinite(vendorId)) return res.status(400).json({ error: "Invalid id" });
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  const rows = await db.execute(sql`
    SELECT
      e.id, e.title, e.slug, e.category, e.short_description AS "shortDescription",
      e.cover_image_url AS "coverImageUrl", e.banner_url AS "bannerUrl",
      e.city, e.start_date AS "startDate", e.start_time AS "startTime",
      o.name AS "organizerName", o.verified AS "organizerVerified"
    FROM organizer_events e
    JOIN organizers o ON o.id = e.organizer_id
    WHERE e.venue_id = ${vendorId}
      AND e.approval_status = 'approved'
      AND e.venue_approval_status = 'approved'
      AND o.hidden IS NOT TRUE
    ORDER BY e.start_date ASC NULLS LAST, e.created_at DESC
  `);
  return res.json(rows.rows);
});

// Bookings for organizer events hosted at the partner's venue — the host pub/club
// sees who booked tickets for events held there (read-only). Admins target a
// specific venue via ?vendorId=.
router.get("/partner/hosted-event-bookings", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const venue = await resolvePartnerVenue(req, user);
  if (!venue) return res.json([]);
  const rows = await db.execute(sql`
    SELECT
      b.id, b.booking_date AS "date", b.guests AS "quantity",
      (b.final_price + COALESCE(b.base_fee, 0)) AS "amount", b.checked_in AS "checkedIn",
      b.checked_in_at AS "checkedInAt", b.person_name AS "personName",
      b.phone AS "phone", b.created_at AS "createdAt",
      e.title AS "eventTitle", e.start_time AS "startTime", e.slug AS "eventSlug",
      o.name AS "organizerName",
      t.name AS "ticketName",
      u.name AS "buyerName"
    FROM bookings b
    JOIN organizer_events e ON e.id = b.organizer_event_id
    LEFT JOIN organizers o ON o.id = b.organizer_id
    LEFT JOIN event_tickets t ON t.id = b.event_ticket_id
    LEFT JOIN users u ON u.id = b.user_id
    -- Filter on the event's live venue link (source of truth) so the report works
    -- even for bookings whose denormalized host_vendor_id wasn't populated.
    WHERE e.venue_id = ${venue.id} AND b.kind = 'organizer'
    ORDER BY b.created_at DESC
  `);
  return res.json(rows.rows);
});

// ─── ticket tiers ────────────────────────────────────────────────────────────

async function assertOwnsEvent(userId: number, eventId: number): Promise<boolean> {
  const org = await getMyOrganizer(userId);
  if (!org) return false;
  const rows = await db
    .select({ id: organizerEventsTable.id })
    .from(organizerEventsTable)
    .where(and(eq(organizerEventsTable.id, eventId), eq(organizerEventsTable.organizerId, org.id)))
    .limit(1);
  return Boolean(rows[0]);
}

router.get("/organizer/events/:id/tickets", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const eventId = Number(req.params["id"]);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: "Invalid id" });
  if (!(await assertOwnsEvent(user.id, eventId))) return res.status(404).json({ error: "Not found" });
  const rows = await db
    .select()
    .from(eventTicketsTable)
    .where(eq(eventTicketsTable.eventId, eventId))
    .orderBy(eventTicketsTable.id);
  return res.json(rows);
});

router.post("/organizer/events/:id/tickets", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const eventId = Number(req.params["id"]);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: "Invalid id" });
  if (!(await assertOwnsEvent(user.id, eventId))) return res.status(404).json({ error: "Not found" });
  const parsed = TicketBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const { price, salesStartAt, salesEndAt, ...rest } = parsed.data;
  const [row] = await db
    .insert(eventTicketsTable)
    .values({
      eventId,
      ...rest,
      price: String(price ?? 0),
      salesStartAt: salesStartAt ? new Date(salesStartAt) : null,
      salesEndAt: salesEndAt ? new Date(salesEndAt) : null,
    })
    .returning();
  return res.json(row);
});

router.patch("/organizer/tickets/:tid", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const tid = Number(req.params["tid"]);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: "Invalid id" });
  const existing = await db.select().from(eventTicketsTable).where(eq(eventTicketsTable.id, tid)).limit(1);
  const ticket = existing[0];
  if (!ticket) return res.status(404).json({ error: "Not found" });
  if (!(await assertOwnsEvent(user.id, ticket.eventId))) return res.status(404).json({ error: "Not found" });
  const parsed = TicketBody.partial().safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const { price, salesStartAt, salesEndAt, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest };
  if (price != null) updates["price"] = String(price);
  if (salesStartAt !== undefined) updates["salesStartAt"] = salesStartAt ? new Date(salesStartAt) : null;
  if (salesEndAt !== undefined) updates["salesEndAt"] = salesEndAt ? new Date(salesEndAt) : null;
  const [row] = await db
    .update(eventTicketsTable)
    .set(updates)
    .where(eq(eventTicketsTable.id, tid))
    .returning();
  return res.json(row);
});

router.delete("/organizer/tickets/:tid", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const tid = Number(req.params["tid"]);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: "Invalid id" });
  const existing = await db.select().from(eventTicketsTable).where(eq(eventTicketsTable.id, tid)).limit(1);
  const ticket = existing[0];
  if (!ticket) return res.status(404).json({ error: "Not found" });
  if (!(await assertOwnsEvent(user.id, ticket.eventId))) return res.status(404).json({ error: "Not found" });
  await db.delete(eventTicketsTable).where(eq(eventTicketsTable.id, tid));
  return res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC
// ════════════════════════════════════════════════════════════════════════════

async function organizerStats(organizerId: number) {
  const [eventsAgg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(organizerEventsTable)
    .where(and(eq(organizerEventsTable.organizerId, organizerId), eq(organizerEventsTable.approvalStatus, "approved")));
  const [soldAgg] = await db
    .select({ sold: sql<number>`COALESCE(SUM(${eventTicketsTable.soldCount}), 0)::int` })
    .from(eventTicketsTable)
    .innerJoin(organizerEventsTable, eq(eventTicketsTable.eventId, organizerEventsTable.id))
    .where(eq(organizerEventsTable.organizerId, organizerId));
  const [ratingAgg] = await db
    .select({
      avg: sql<number>`COALESCE(AVG(${organizerReviewsTable.rating}), 0)::float`,
      count: sql<number>`count(*)::int`,
    })
    .from(organizerReviewsTable)
    .where(eq(organizerReviewsTable.organizerId, organizerId));
  return {
    totalEvents: eventsAgg?.count ?? 0,
    ticketsSold: soldAgg?.sold ?? 0,
    avgRating: ratingAgg?.avg ?? 0,
    reviewCount: ratingAgg?.count ?? 0,
  };
}

router.get("/organizers/:slug", async (req, res) => {
  const slug = String(req.params["slug"]);
  const rows = await db.select().from(organizersTable).where(eq(organizersTable.slug, slug)).limit(1);
  const org = rows[0];
  if (!org || org.status !== "approved") return res.status(404).json({ error: "Organizer not found" });
  const events = await db
    .select()
    .from(organizerEventsTable)
    .where(and(eq(organizerEventsTable.organizerId, org.id), eq(organizerEventsTable.approvalStatus, "approved")))
    .orderBy(desc(organizerEventsTable.startDate));
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => !e.startDate || e.startDate >= today);
  const past = events.filter((e) => e.startDate && e.startDate < today);
  const reviews = await db
    .select()
    .from(organizerReviewsTable)
    .where(eq(organizerReviewsTable.organizerId, org.id))
    .orderBy(desc(organizerReviewsTable.createdAt))
    .limit(20);
  const stats = await organizerStats(org.id);
  // Public organizer profile (approved only) — edge-cache on the success path.
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return res.json({ organizer: org, upcoming, past, reviews, stats });
});

router.get("/organizers/:slug/events", async (req, res) => {
  const slug = String(req.params["slug"]);
  const rows = await db.select({ id: organizersTable.id }).from(organizersTable).where(eq(organizersTable.slug, slug)).limit(1);
  const org = rows[0];
  if (!org) return res.json([]);
  const events = await db
    .select()
    .from(organizerEventsTable)
    .where(and(eq(organizerEventsTable.organizerId, org.id), eq(organizerEventsTable.approvalStatus, "approved")))
    .orderBy(desc(organizerEventsTable.createdAt));
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return res.json(events);
});

// All approved organizer events (public grid on the Events page). NOTE: this and
// /organizer-events/slider MUST be declared before /organizer-events/:slug so
// "slider" isn't captured as a slug.
router.get("/organizer-events", async (_req, res) => {
  // Public approved-events grid — edge-cacheable (same bytes for everyone).
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  const rows = await db.execute(sql`
    SELECT
      e.id, e.title, e.slug, e.category, e.short_description AS "shortDescription",
      e.cover_image_url AS "coverImageUrl", e.banner_url AS "bannerUrl",
      e.city, e.start_date AS "startDate", e.start_time AS "startTime",
      o.name AS "organizerName", o.verified AS "organizerVerified"
    FROM organizer_events e
    JOIN organizers o ON o.id = e.organizer_id
    WHERE e.approval_status = 'approved' AND o.hidden IS NOT TRUE
    ORDER BY e.start_date ASC NULLS LAST, e.created_at DESC
  `);
  return res.json(rows.rows);
});

// Featured approved organizer events, shaped for the Events-page hero slider.
router.get("/organizer-events/slider", async (_req, res) => {
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  const rows = await db.execute(sql`
    SELECT
      e.id, e.title,
      e.short_description AS "body",
      e.start_date AS "announceDate",
      e.start_time AS "announceTime",
      COALESCE(NULLIF(e.banner_url, ''), e.cover_image_url) AS "imageUrl",
      o.name AS "vendorName",
      '/organizer-events/' || e.slug AS "href"
    FROM organizer_events e
    JOIN organizers o ON o.id = e.organizer_id
    WHERE e.approval_status = 'approved' AND e.is_featured_slider = true AND o.hidden IS NOT TRUE
    ORDER BY e.created_at DESC
    LIMIT 10
  `);
  return res.json(rows.rows);
});

router.get("/organizer-events/:slug", async (req, res) => {
  const slug = String(req.params["slug"]);
  const rows = await db.select().from(organizerEventsTable).where(eq(organizerEventsTable.slug, slug)).limit(1);
  const ev = rows[0];
  if (!ev || ev.approvalStatus !== "approved") return res.status(404).json({ error: "Event not found" });
  const orgRows = await db.select().from(organizersTable).where(eq(organizersTable.id, ev.organizerId)).limit(1);
  const tickets = await db
    .select()
    .from(eventTicketsTable)
    .where(and(eq(eventTicketsTable.eventId, ev.id), eq(eventTicketsTable.active, true)))
    .orderBy(eventTicketsTable.price);
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return res.json({ event: ev, organizer: orgRows[0] ?? null, tickets });
});

// Public: active discount coupons a customer can apply for this event.
router.get("/organizer-events/:slug/coupons", async (req, res) => {
  // Public discount codes shown on the event page (not per-user; booking-time
  // validation still re-checks expiry/usage). Short edge-cache is safe.
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  const slug = String(req.params["slug"]);
  const evRows = await db.select({ id: organizerEventsTable.id, organizerId: organizerEventsTable.organizerId })
    .from(organizerEventsTable).where(eq(organizerEventsTable.slug, slug)).limit(1);
  const ev = evRows[0];
  if (!ev) return res.json([]);
  const rows = await db.select().from(organizerCouponsTable).where(and(
    eq(organizerCouponsTable.organizerId, ev.organizerId),
    eq(organizerCouponsTable.active, true),
    or(isNull(organizerCouponsTable.eventId), eq(organizerCouponsTable.eventId, ev.id)),
  ));
  const now = new Date();
  const valid = rows
    .filter((c) => (!c.expiresAt || c.expiresAt > now) && (c.maxUses == null || c.usedCount < c.maxUses))
    .map((c) => ({ code: c.code, discountType: c.discountType, discountValue: c.discountValue }));
  return res.json(valid);
});

// Ticket booking — reuses the SAME bookings table (kind='organizer') so tickets
// appear in My Bookings with a QR code, exactly like pub bookings. Mirrors the
// live pub flow which is COD / instant-confirm (online PhonePe is disabled
// platform-wide — see bookings.ts); paid tiers are pay-at-venue and commission
// is realised at scan (Phase C). Auth required so the ticket attaches to a user.
const BookBody = z.object({
  ticketId: z.coerce.number().int().positive(),
  name: z.string().min(1).max(255),
  phone: z.string().max(50).optional().default(""),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
  couponCode: z.string().max(24).optional().default(""),
  pointsToUse: z.coerce.number().int().min(0).optional().default(0),
});

router.post("/organizer-events/:slug/book", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const slug = String(req.params["slug"]);
  const parsed = BookBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const { ticketId, name, phone, quantity, couponCode, pointsToUse } = parsed.data;

  const evRows = await db.select().from(organizerEventsTable).where(eq(organizerEventsTable.slug, slug)).limit(1);
  const ev = evRows[0];
  if (!ev || ev.approvalStatus !== "approved") return res.status(404).json({ error: "Event not found" });

  const orgRows = await db.select().from(organizersTable).where(eq(organizersTable.id, ev.organizerId)).limit(1);
  const organizer = orgRows[0];
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });

  const ticketRows = await db
    .select()
    .from(eventTicketsTable)
    .where(and(eq(eventTicketsTable.id, ticketId), eq(eventTicketsTable.eventId, ev.id)))
    .limit(1);
  const ticket = ticketRows[0];
  if (!ticket || !ticket.active) return res.status(404).json({ error: "Ticket not available" });

  // Capacity check (only when a finite quantity is configured; 0 = unlimited).
  if (ticket.quantity > 0 && ticket.soldCount + quantity > ticket.quantity) {
    return res.status(409).json({ error: "Not enough tickets remaining" });
  }

  const total = (Number(ticket.price) || 0) * quantity;

  // Apply an organizer coupon if supplied + valid (skipped on free tickets).
  let discount = 0;
  let appliedCode = "";
  if (couponCode.trim() && total > 0) {
    const cc = couponCode.trim().toUpperCase();
    const cRows = await db.select().from(organizerCouponsTable)
      .where(and(eq(organizerCouponsTable.organizerId, organizer.id), eq(organizerCouponsTable.code, cc))).limit(1);
    const coupon = cRows[0];
    const valid = coupon && coupon.active
      && (coupon.eventId == null || coupon.eventId === ev.id)
      && (coupon.maxUses == null || coupon.usedCount < coupon.maxUses)
      && (!coupon.expiresAt || coupon.expiresAt > new Date());
    if (!valid) return res.status(400).json({ error: "Invalid or expired coupon code." });
    const val = Number(coupon!.discountValue);
    discount = coupon!.discountType === "fixed" ? Math.min(val, total) : Math.round((total * val) / 100 * 100) / 100;
    appliedCode = coupon!.code;
    await db.update(organizerCouponsTable).set({ usedCount: coupon!.usedCount + 1 }).where(eq(organizerCouponsTable.id, coupon!.id));
  }

  // Royvento Coins redemption — same formula as pub bookings: 100 pts = ₹5
  // (1 pt = ₹0.05), capped at 2% of the booking value, applied after coupons.
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
  const bookingDate = ev.startDate || todayIstDate();

  // Platform base fee (incl. GST) added on top of the ticket price — mirrors the
  // pub booking flow. Hosted events use the host venue's configured percent;
  // standalone events use the 3.5% default. Stored separately so it shows on the
  // ticket "Amount due" / manager views without inflating the organizer's revenue.
  let baseFeePct = 3.5;
  if (ev.venueId) {
    const v = (await db.select({ pct: vendorsTable.baseFeePercent, en: vendorsTable.baseFeeEnabled }).from(vendorsTable).where(eq(vendorsTable.id, ev.venueId)).limit(1))[0];
    if (v && v.en === false) baseFeePct = 0;
    else if (v?.pct != null) baseFeePct = Number(v.pct);
  }
  const baseFee = finalPrice > 0 ? Math.round((finalPrice * baseFeePct) / 100) : 0;

  try {
    // Reserve inventory + create the booking. soldCount moves now because the
    // booking is confirmed immediately (COD model), so it can't be oversold.
    await db.update(eventTicketsTable)
      .set({ soldCount: ticket.soldCount + quantity })
      .where(eq(eventTicketsTable.id, ticket.id));

    // eventId/vendorId are NULL for organizer bookings (DB columns are nullable;
    // the TS schema keeps them non-null for the pub codebase, so cast here).
    const bookingValues = {
      kind: "organizer",
      userId: user.id,
      organizerId: organizer.id,
      organizerEventId: ev.id,
      eventTicketId: ticket.id,
      // Host venue (if the event is hosted at a partner pub/club) so they can
      // see and scan the booking. Null for standalone organizer events.
      hostVendorId: ev.venueId ?? null,
      bookingDate,
      guests: quantity,
      totalPrice: String(total),
      finalPrice: String(finalPrice),
      baseFee,
      couponCode: appliedCode,
      discountAmount: String(discount),
      pointsUsed,
      // Lock the per-event commission rate at booking time (Phase C uses it).
      eventCommissionPct: String(ev.commissionPct ?? "0"),
      status: total > 0 && isRazorpayConfigured() ? "pending" : "confirmed",
      pubMode: "event_booking",
      selectedPubEvent: ev.title,
      personName: name || user.name,
      phone,
      approvedBy: total > 0 && isRazorpayConfigured() ? "payment" : "auto",
      paymentMethod: total > 0 && isRazorpayConfigured() ? "online" : "cod",
    } as unknown as typeof bookingsTable.$inferInsert;
    const [booking] = await db.insert(bookingsTable).values(bookingValues).returning();

    if (!booking) return res.status(500).json({ error: "Could not complete booking" });

    const ticketCode = organizer.ticketPrefix && organizer.ticketSalt
      ? generateTicketCode(booking.id, { ticketPrefix: organizer.ticketPrefix, ticketSalt: organizer.ticketSalt })
      : `RV-${String(booking.id).padStart(6, "0")}`;

    // Paid ticket → create Razorpay order and return payment details for the client
    if (total > 0 && isRazorpayConfigured()) {
      try {
        const amountPaise = Math.round((finalPrice + baseFee) * 100);
        const order = await createRazorpayOrder({
          amountPaise,
          receipt: `org_booking_${booking.id}`,
          notes: { bookingId: String(booking.id), userId: String(user.id) },
        });
        await db.insert(paymentsTable).values({
          merchantTransactionId: order.id,
          bookingId: booking.id,
          amount: amountPaise,
          status: "initiated",
          razorpayOrderId: order.id,
          phonepeTransactionId: "",
        });
        return res.json({
          ok: true,
          paymentPending: true,
          bookingId: booking.id,
          ticketCode,
          eventTitle: ev.title,
          razorpayOrderId: order.id,
          razorpayKeyId: getRazorpayKeyId(),
          amountPaise,
          total,
        });
      } catch (err) {
        logger.error({ err, bookingId: booking.id }, "[razorpay] organizer booking order failed");
        await db.update(bookingsTable).set({ status: "cancelled" }).where(eq(bookingsTable.id, booking.id));
        return res.status(502).json({ error: "Payment gateway unavailable. Please try again." });
      }
    }

    // Free / COD booking → confirm immediately
    createUserNotification({
      userId: user.id,
      title: "Ticket booked!",
      message: `Your ${ticket.name} ticket for "${ev.title}" is confirmed. Show your QR at entry.`,
      url: "/dashboard/bookings",
      tag: `organizer-booking-${booking.id}`,
    }).catch(() => {});

    return res.json({
      ok: true,
      bookingId: booking.id,
      ticketCode,
      eventTitle: ev.title,
      ticketName: ticket.name,
      quantity,
      subtotal: total,
      discount,
      pointsUsed,
      pointsValue: pointsDeduction,
      baseFee,
      total: finalPrice + baseFee,
      couponApplied: appliedCode || null,
      free: finalPrice + baseFee === 0,
    });
  } catch (err) {
    logger.error({ err }, "Organizer ticket booking failed");
    return res.status(500).json({ error: "Could not complete booking" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// EVENT MANAGERS  (mirror vendor_managers: invite existing user + configurable perms)
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

function normalizePerms(p?: Partial<OrganizerManagerPermissions> | null): OrganizerManagerPermissions {
  return {
    scan: p?.scan ?? DEFAULT_MANAGER_PERMS.scan,
    attendance: p?.attendance ?? DEFAULT_MANAGER_PERMS.attendance,
    reports: p?.reports ?? DEFAULT_MANAGER_PERMS.reports,
  };
}

// Organizer: list their managers
router.get("/organizer/managers", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const rows = await db.select().from(organizerManagersTable).where(eq(organizerManagersTable.organizerId, org.id));
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

// Organizer: invite a user by email
router.post("/organizer/managers/invite", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const parsed = InviteManagerBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const email = parsed.data.email.toLowerCase().trim();
  const perms = normalizePerms(parsed.data.permissions);

  const invitee = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!invitee[0]) return res.status(404).json({ error: "No Royvento account found for that email. They must sign up first." });
  const inviteeId = invitee[0].id;
  if (inviteeId === user.id) return res.status(400).json({ error: "You cannot invite yourself as a manager." });

  const existing = await db.select().from(organizerManagersTable)
    .where(and(eq(organizerManagersTable.organizerId, org.id), eq(organizerManagersTable.managerId, inviteeId))).limit(1);
  if (existing[0] && existing[0].status !== "rejected") return res.status(409).json({ error: "This user has already been invited." });

  const token = crypto.randomBytes(32).toString("hex");
  if (existing[0] && existing[0].status === "rejected") {
    await db.update(organizerManagersTable)
      .set({ status: "pending", token, createdAt: new Date(), invitedEmail: email, permissions: perms })
      .where(eq(organizerManagersTable.id, existing[0].id));
  } else {
    await db.insert(organizerManagersTable).values({
      organizerId: org.id, invitedEmail: email, invitedBy: user.id, managerId: inviteeId, status: "pending", token, permissions: perms,
    });
  }
  createUserNotification({
    userId: inviteeId,
    title: "You've been invited as an Event Manager",
    message: `${org.name} invited you to scan tickets & manage entry for their events. Open your profile to accept or decline.`,
    url: "/profile",
    tag: `organizer-manager-invite-${org.id}`,
  }).catch(() => {});
  return res.json({ message: "Invitation sent." });
});

// Organizer: update a manager's permissions
router.patch("/organizer/managers/:id", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = PermsSchema.safeParse(req.body?.permissions ?? req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const existing = await db.select().from(organizerManagersTable)
    .where(and(eq(organizerManagersTable.id, id), eq(organizerManagersTable.organizerId, org.id))).limit(1);
  if (!existing[0]) return res.status(404).json({ error: "Not found" });
  const merged = normalizePerms({ ...normalizePerms(existing[0].permissions), ...parsed.data });
  const [row] = await db.update(organizerManagersTable).set({ permissions: merged }).where(eq(organizerManagersTable.id, id)).returning();
  return res.json({ id: row?.id, permissions: merged });
});

// Organizer: remove a manager
router.delete("/organizer/managers/:id", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const rows = await db.select().from(organizerManagersTable)
    .where(and(eq(organizerManagersTable.id, id), eq(organizerManagersTable.organizerId, org.id))).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  await db.delete(organizerManagersTable).where(eq(organizerManagersTable.id, id));
  return res.json({ message: "Manager removed." });
});

// Invitee: list pending Event Manager invitations
router.get("/organizer-manager/invitations", requireAuth(), async (req, res) => {
  const user = (req as any).user as { id: number };
  const rows = await db.select().from(organizerManagersTable)
    .where(and(eq(organizerManagersTable.managerId, user.id), eq(organizerManagersTable.status, "pending")));
  const orgIds = rows.map((r) => r.organizerId);
  const orgs = orgIds.length
    ? await db.select({ id: organizersTable.id, name: organizersTable.name }).from(organizersTable).where(inArray(organizersTable.id, orgIds))
    : [];
  const oMap = new Map(orgs.map((o) => [o.id, o]));
  return res.json(rows.map((r) => ({
    id: r.id,
    organizerId: r.organizerId,
    organizerName: oMap.get(r.organizerId)?.name ?? "An organizer",
    permissions: normalizePerms(r.permissions),
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/organizer-manager/invitations/:id/accept", requireAuth(), async (req, res) => {
  const user = (req as any).user as { id: number };
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const rows = await db.select().from(organizerManagersTable)
    .where(and(eq(organizerManagersTable.id, id), eq(organizerManagersTable.status, "pending"))).limit(1);
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: "Invitation not found or already used." });
  if (inv.managerId !== user.id) return res.status(403).json({ error: "This invitation was not sent to your account." });
  await db.update(organizerManagersTable).set({ status: "accepted" }).where(eq(organizerManagersTable.id, inv.id));
  return res.json({ message: "You are now an Event Manager." });
});

router.post("/organizer-manager/invitations/:id/reject", requireAuth(), async (req, res) => {
  const user = (req as any).user as { id: number };
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const rows = await db.select().from(organizerManagersTable)
    .where(and(eq(organizerManagersTable.id, id), eq(organizerManagersTable.status, "pending"))).limit(1);
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: "Invitation not found or already used." });
  if (inv.managerId !== user.id) return res.status(403).json({ error: "This invitation was not sent to your account." });
  await db.update(organizerManagersTable).set({ status: "rejected" }).where(eq(organizerManagersTable.id, inv.id));
  return res.json({ message: "Invitation declined." });
});

// ─── ticket scanner ───────────────────────────────────────────────────────
// Resolve which organizers a user may scan for, with the permission flags that
// apply: their own organizer profile (full), plus any organizer where they hold
// an accepted manager relationship (per-row permissions).
async function scannerOrganizerPerms(userId: number): Promise<Map<number, OrganizerManagerPermissions>> {
  const map = new Map<number, OrganizerManagerPermissions>();
  const own = await getMyOrganizer(userId);
  if (own) map.set(own.id, { scan: true, attendance: true, reports: true });
  const rows = await db.select().from(organizerManagersTable)
    .where(and(eq(organizerManagersTable.managerId, userId), eq(organizerManagersTable.status, "accepted")));
  for (const r of rows) map.set(r.organizerId, normalizePerms(r.permissions));
  return map;
}

const ScanBody = z.object({
  code: z.string().min(1),
  confirm: z.boolean().optional().default(false),
});

// Parse a ticket code into its bookingId. New format PREFIX-NNNNNN-XX needs an
// HMAC checksum verify; legacy RV-/numeric forms don't.
export function parseTicketBookingId(code: string): { bookingId: number; needsChecksum: boolean } | null {
  const c = code.trim().toUpperCase();
  const m = c.match(/^([A-Z][A-Z0-9]{1,7})-(\d{1,10})-([0-9A-F]{2})$/);
  const legacy = c.match(/^(?:RV-?)?(\d+)$/);
  if (m && m[2] && m[1] !== "RV") { const id = parseInt(m[2], 10); return id > 0 ? { bookingId: id, needsChecksum: true } : null; }
  if (legacy && legacy[1]) { const id = parseInt(legacy[1], 10); return id > 0 ? { bookingId: id, needsChecksum: false } : null; }
  return null;
}

// An organizer event is "over" once its last date (end, else start) is before
// today (IST). Past that, tickets can no longer be scanned by anyone.
function isOrganizerEventOver(ev?: { startDate: string | null; endDate: string | null }): boolean {
  if (!ev) return false;
  const last = ev.endDate || ev.startDate;
  return !!last && last < todayIstDate();
}

type ScanPerms = { scan: boolean; attendance: boolean };

// Shared organizer-ticket scan/check-in. Used by both the organizer scanner and
// the host-venue partner scanner; `authorize` decides who may scan a given
// ticket. Enforces the event-date gate, HMAC verify, duplicate-checkin guard,
// attendance permission, and the Phase-C commission realisation at check-in.
export async function scanOrganizerTicket(params: {
  booking: typeof bookingsTable.$inferSelect;
  code: string;
  confirm: boolean;
  authorize: (b: typeof bookingsTable.$inferSelect, ev: typeof organizerEventsTable.$inferSelect | undefined) => Promise<ScanPerms | null>;
  denyMessage?: string;
}): Promise<{ http: number; body: Record<string, unknown> }> {
  const b = params.booking;
  const ev = b.organizerEventId != null
    ? (await db.select().from(organizerEventsTable).where(eq(organizerEventsTable.id, b.organizerEventId)).limit(1))[0]
    : undefined;
  const organizer = b.organizerId != null
    ? (await db.select().from(organizersTable).where(eq(organizersTable.id, b.organizerId)).limit(1))[0]
    : undefined;

  const perms = await params.authorize(b, ev);
  if (!perms || !perms.scan) {
    return { http: 403, body: { code: "WRONG_SCANNER", message: params.denyMessage ?? "You can't scan this ticket here." } };
  }

  // Verify the HMAC checksum with the organizer's signing material.
  const parsedCode = parseTicketBookingId(params.code);
  if (parsedCode?.needsChecksum && organizer?.ticketPrefix && organizer?.ticketSalt) {
    if (!verifyTicketCode(params.code, b.id, { ticketPrefix: organizer.ticketPrefix, ticketSalt: organizer.ticketSalt })) {
      return { http: 400, body: { code: "INVALID_CODE", message: "Ticket code failed verification." } };
    }
  }

  const tk = b.eventTicketId != null ? (await db.select().from(eventTicketsTable).where(eq(eventTicketsTable.id, b.eventTicketId)).limit(1))[0] : undefined;
  const buyer = (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, b.userId)).limit(1))[0];
  const ticketInfo = {
    bookingId: b.id,
    eventTitle: ev?.title ?? b.selectedPubEvent ?? "",
    organizerName: organizer?.name ?? "",
    ticketType: tk?.name ?? "",
    attendee: b.personName || buyer?.name || "",
    quantity: b.guests,
    date: b.bookingDate,
    time: ev?.startTime ?? "",
    venue: ev?.venueName ?? "",
    checkedIn: b.checkedIn === true,
    checkedInAt: b.checkedInAt ? b.checkedInAt.toISOString() : null,
  };

  // Event-date gate: once the event is over, no one can scan (org or venue side).
  if (isOrganizerEventOver(ev)) {
    return { http: 200, body: { status: "EVENT_ENDED", message: "This event has ended — tickets can no longer be scanned.", ticket: ticketInfo } };
  }
  if (b.checkedIn) {
    return { http: 200, body: { status: "ALREADY_CHECKED_IN", message: "Already checked in.", ticket: ticketInfo } };
  }
  if (!params.confirm) {
    return { http: 200, body: { status: "VALID", message: "Valid ticket.", ticket: ticketInfo } };
  }
  if (!perms.attendance) {
    return { http: 403, body: { code: "NO_PERMISSION", message: "You don't have permission to mark attendance." } };
  }
  const now = new Date();
  // ── Commission realisation (Phase C) — COD revenue is real only at check-in.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const revenue = Number(b.finalPrice ?? 0);
  const commissionPct = Number(b.eventCommissionPct ?? 0);
  const gatewayPct = b.paymentMethod === "online" ? Number(ev?.gatewayFeePercent ?? 0) : 0;
  const commission = round2((revenue * commissionPct) / 100);
  const gatewayFee = round2((revenue * gatewayPct) / 100);
  const net = round2(revenue - commission - gatewayFee);
  await db.transaction(async (tx) => {
    await tx.update(bookingsTable).set({ checkedIn: true, checkedInAt: now }).where(eq(bookingsTable.id, b.id));
    const inserted = await tx.insert(organizerCommissionLedgerTable).values({
      organizerId: b.organizerId!,
      organizerEventId: b.organizerEventId,
      bookingId: b.id,
      revenue: String(revenue),
      commission: String(commission),
      gatewayFee: String(gatewayFee),
      net: String(net),
    }).onConflictDoNothing({ target: organizerCommissionLedgerTable.bookingId }).returning({ id: organizerCommissionLedgerTable.id });
    if (inserted.length > 0) {
      await tx.update(organizersTable)
        .set({ commissionOwed: sql`${organizersTable.commissionOwed} + ${String(commission)}` })
        .where(eq(organizersTable.id, b.organizerId!));
    }
  });
  return { http: 200, body: { status: "CHECKED_IN", message: "Checked in!", ticket: { ...ticketInfo, checkedIn: true, checkedInAt: now.toISOString() } } };
}

router.post("/organizer/scan-ticket", requireAuth(), async (req, res) => {
  const user = (req as any).user as { id: number };
  const parsed = ScanBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_CODE", message: "Please provide a ticket code." });
  const code = parsed.data.code.trim().toUpperCase();
  const parsedCode = parseTicketBookingId(code);
  if (!parsedCode) return res.status(400).json({ code: "INVALID_CODE", message: "Invalid ticket code format." });

  const allowed = await scannerOrganizerPerms(user.id);
  if (allowed.size === 0) return res.status(403).json({ code: "FORBIDDEN", message: "You are not an organizer or accepted manager." });

  const bRows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, parsedCode.bookingId)).limit(1);
  const b = bRows[0];
  if (!b || b.kind !== "organizer" || b.organizerId == null) {
    return res.status(404).json({ code: "NOT_FOUND", message: "Event ticket not found." });
  }
  const result = await scanOrganizerTicket({
    booking: b,
    code,
    confirm: parsed.data.confirm,
    denyMessage: "This ticket belongs to a different organizer's event.",
    authorize: async (bk) => {
      const p = bk.organizerId != null ? allowed.get(bk.organizerId) : undefined;
      return p && p.scan ? { scan: true, attendance: !!p.attendance } : null;
    },
  });
  return res.status(result.http).json(result.body);
});

// ════════════════════════════════════════════════════════════════════════════
// BUSINESS TOOLS  (Phase D): Analytics · Reports · Attendance · Leads · Coupons · Promote
// ════════════════════════════════════════════════════════════════════════════

// Record a profile view (public, optional auth). Self-views are dropped so the
// organizer's own page loads never pollute their leads.
router.post("/organizers/:slug/view", async (req, res) => {
  const slug = String(req.params["slug"]);
  const rows = await db.select({ id: organizersTable.id, userId: organizersTable.userId })
    .from(organizersTable).where(eq(organizersTable.slug, slug)).limit(1);
  const org = rows[0];
  if (!org) return res.json({ ok: true });
  const user = await loadUserFromRequest(req);
  if (user && user.id === org.userId) return res.json({ ok: true, skipped: "self" });
  await db.insert(organizerProfileViewsTable).values({
    organizerId: org.id,
    viewerUserId: user?.id ?? null,
    viewerName: user?.name ?? "",
    viewerEmail: user?.email ?? "",
  });
  return res.json({ ok: true });
});

// Organizer Leads — profile views aggregated per visitor + whether they've
// booked one of this organizer's events (mirrors the partner leads tab).
router.get("/organizer/leads", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });

  const knownAgg = await db
    .select({
      viewerUserId: organizerProfileViewsTable.viewerUserId,
      visitCount: sql<number>`count(*)::int`.as("visit_count"),
      lastViewedAt: sql<Date>`max(${organizerProfileViewsTable.viewedAt})`.as("last_viewed_at"),
    })
    .from(organizerProfileViewsTable)
    .where(and(eq(organizerProfileViewsTable.organizerId, org.id), sql`${organizerProfileViewsTable.viewerUserId} is not null`))
    .groupBy(organizerProfileViewsTable.viewerUserId);

  const [anonAgg] = await db
    .select({ visitCount: sql<number>`count(*)::int`.as("visit_count"), lastViewedAt: sql<Date>`max(${organizerProfileViewsTable.viewedAt})`.as("last_viewed_at") })
    .from(organizerProfileViewsTable)
    .where(and(eq(organizerProfileViewsTable.organizerId, org.id), isNull(organizerProfileViewsTable.viewerUserId)));

  const ids = knownAgg.map((r) => r.viewerUserId).filter((x): x is number => x != null);
  const users = ids.length ? await db.select().from(usersTable).where(inArray(usersTable.id, ids)) : [];
  const uMap = new Map(users.map((u) => [u.id, u]));

  // Which viewers have booked one of THIS organizer's events.
  const bookedUserIds = new Set<number>();
  if (ids.length) {
    const bookedRows = await db
      .select({ userId: bookingsTable.userId })
      .from(bookingsTable)
      .where(and(eq(bookingsTable.organizerId, org.id), eq(bookingsTable.kind, "organizer"), inArray(bookingsTable.userId, ids)));
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

// Analytics — KPIs, per-event, ticket-type mix, attendance, recent daily.
router.get("/organizer/analytics", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });

  const [kpi] = (await db.execute(sql`
    SELECT
      COUNT(*)::int                                         AS "bookings",
      COALESCE(SUM(b.guests), 0)::int                       AS "tickets",
      COALESCE(SUM(b.final_price), 0)                       AS "revenue",
      COUNT(*) FILTER (WHERE b.checked_in)::int             AS "attended"
    FROM bookings b
    WHERE b.kind = 'organizer' AND b.organizer_id = ${org.id} AND b.status = 'confirmed'
  `)).rows as any[];

  const perEvent = await db.execute(sql`
    SELECT e.id, e.title,
      COUNT(b.id)::int AS "bookings",
      COALESCE(SUM(b.guests), 0)::int AS "tickets",
      COALESCE(SUM(b.final_price), 0) AS "revenue",
      COUNT(b.id) FILTER (WHERE b.checked_in)::int AS "attended"
    FROM organizer_events e
    LEFT JOIN bookings b ON b.organizer_event_id = e.id AND b.kind='organizer' AND b.status='confirmed'
    WHERE e.organizer_id = ${org.id}
    GROUP BY e.id, e.title ORDER BY "revenue" DESC
  `);

  const byTicketType = await db.execute(sql`
    SELECT t.name AS "ticketType",
      COALESCE(SUM(b.guests),0)::int AS "tickets",
      COALESCE(SUM(b.final_price),0) AS "revenue"
    FROM bookings b JOIN event_tickets t ON t.id = b.event_ticket_id
    WHERE b.kind='organizer' AND b.organizer_id = ${org.id} AND b.status='confirmed'
    GROUP BY t.name ORDER BY "revenue" DESC
  `);

  const recent = await db.execute(sql`
    SELECT to_char(b.created_at, 'YYYY-MM-DD') AS "day",
      COUNT(*)::int AS "bookings",
      COALESCE(SUM(b.final_price),0) AS "revenue"
    FROM bookings b
    WHERE b.kind='organizer' AND b.organizer_id = ${org.id} AND b.status='confirmed'
      AND b.created_at >= now() - interval '30 days'
    GROUP BY "day" ORDER BY "day"
  `);

  const bookings = Number(kpi?.bookings ?? 0);
  const attended = Number(kpi?.attended ?? 0);
  return res.json({
    totals: {
      bookings,
      tickets: Number(kpi?.tickets ?? 0),
      revenue: kpi?.revenue ?? "0",
      attended,
      attendanceRate: bookings > 0 ? Math.round((attended / bookings) * 100) : 0,
    },
    perEvent: perEvent.rows,
    byTicketType: byTicketType.rows,
    recent: recent.rows,
  });
});

// Booking report / leads — every organizer booking with attendee contact.
router.get("/organizer/bookings", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const eventId = Number(req.query["eventId"]);
  const filter = Number.isFinite(eventId) && eventId > 0 ? sql` AND b.organizer_event_id = ${eventId}` : sql``;
  const rows = await db.execute(sql`
    SELECT b.id, b.created_at AS "createdAt", b.booking_date AS "bookingDate",
      b.guests AS "quantity", (b.final_price + COALESCE(b.base_fee, 0)) AS "amount", b.checked_in AS "checkedIn",
      b.person_name AS "attendee", b.phone, u.email AS "email",
      e.title AS "eventTitle", t.name AS "ticketType"
    FROM bookings b
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN organizer_events e ON e.id = b.organizer_event_id
    LEFT JOIN event_tickets t ON t.id = b.event_ticket_id
    WHERE b.kind='organizer' AND b.organizer_id = ${org.id} AND b.status='confirmed'${filter}
    ORDER BY b.created_at DESC
  `);
  return res.json(rows.rows);
});

// ─── coupons ────────────────────────────────────────────────────────────────
const CouponBody = z.object({
  code: z.string().min(2).max(24),
  discountType: z.enum(["percent", "fixed"]).default("percent"),
  discountValue: z.coerce.number().min(0).max(100000),
  eventId: z.coerce.number().int().positive().nullable().optional().default(null),
  active: z.boolean().optional().default(true),
  maxUses: z.coerce.number().int().positive().nullable().optional().default(null),
  expiresAt: z.string().nullable().optional().default(null),
});

router.get("/organizer/coupons", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const rows = await db.select().from(organizerCouponsTable).where(eq(organizerCouponsTable.organizerId, org.id)).orderBy(desc(organizerCouponsTable.createdAt));
  return res.json(rows);
});

router.post("/organizer/coupons", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const parsed = CouponBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const d = parsed.data;
  try {
    const [row] = await db.insert(organizerCouponsTable).values({
      organizerId: org.id, code: d.code.toUpperCase().trim(), discountType: d.discountType,
      discountValue: String(d.discountValue), eventId: d.eventId ?? null, active: d.active,
      maxUses: d.maxUses ?? null, expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
    }).returning();
    return res.json(row);
  } catch {
    return res.status(409).json({ error: "A coupon with that code already exists." });
  }
});

router.patch("/organizer/coupons/:id", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const active = req.body?.active;
  if (typeof active !== "boolean") return res.status(400).json({ error: "active must be boolean" });
  const [row] = await db.update(organizerCouponsTable).set({ active })
    .where(and(eq(organizerCouponsTable.id, id), eq(organizerCouponsTable.organizerId, org.id))).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.delete("/organizer/coupons/:id", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(organizerCouponsTable).where(and(eq(organizerCouponsTable.id, id), eq(organizerCouponsTable.organizerId, org.id)));
  return res.json({ ok: true });
});

// ─── promote (ad) requests ───────────────────────────────────────────────────
router.get("/organizer/ads", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const rows = await db.execute(sql`
    SELECT a.id, a.status, a.note, a.admin_note AS "adminNote", a.created_at AS "createdAt",
      e.title AS "eventTitle", e.is_featured_slider AS "featured"
    FROM organizer_ad_requests a JOIN organizer_events e ON e.id = a.organizer_event_id
    WHERE a.organizer_id = ${org.id} ORDER BY a.created_at DESC
  `);
  return res.json(rows.rows);
});

router.post("/organizer/ads", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const eventId = Number(req.body?.organizerEventId);
  const note = String(req.body?.note ?? "").slice(0, 500);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: "organizerEventId required" });
  const owns = await db.select({ id: organizerEventsTable.id }).from(organizerEventsTable)
    .where(and(eq(organizerEventsTable.id, eventId), eq(organizerEventsTable.organizerId, org.id))).limit(1);
  if (!owns[0]) return res.status(404).json({ error: "Event not found" });
  const [row] = await db.insert(organizerAdRequestsTable).values({ organizerId: org.id, organizerEventId: eventId, note }).returning();
  return res.json(row);
});

// ════════════════════════════════════════════════════════════════════════════
// REVENUE / BANKING / SETTLEMENTS  (Phase C)
// ════════════════════════════════════════════════════════════════════════════

// Per-event revenue / commission / gateway / net, realised at check-in.
router.get("/organizer/revenue", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const rows = await db.execute(sql`
    SELECT
      e.id,
      e.title,
      e.commission_pct           AS "commissionPct",
      e.gateway_fee_percent       AS "gatewayFeePercent",
      COALESCE((SELECT SUM(t.sold_count) FROM event_tickets t WHERE t.event_id = e.id), 0)::int AS "ticketsSold",
      COALESCE(SUM(l.revenue), 0)     AS "revenue",
      COALESCE(SUM(l.commission), 0)  AS "commission",
      COALESCE(SUM(l.gateway_fee), 0) AS "gatewayFee",
      COALESCE(SUM(l.net), 0)         AS "net",
      COUNT(l.id)::int                AS "attended"
    FROM organizer_events e
    LEFT JOIN organizer_commission_ledger l ON l.organizer_event_id = e.id
    WHERE e.organizer_id = ${org.id}
    GROUP BY e.id, e.title, e.commission_pct, e.gateway_fee_percent
    ORDER BY e.created_at DESC
  `);
  const [tot] = (await db.execute(sql`
    SELECT
      COALESCE(SUM(revenue), 0)     AS "revenue",
      COALESCE(SUM(commission), 0)  AS "commission",
      COALESCE(SUM(gateway_fee), 0) AS "gatewayFee",
      COALESCE(SUM(net), 0)         AS "net"
    FROM organizer_commission_ledger WHERE organizer_id = ${org.id}
  `)).rows as any[];
  return res.json({
    events: rows.rows,
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

router.get("/organizer/banking", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const banking = (await db.select().from(organizerBankingDetailsTable).where(eq(organizerBankingDetailsTable.organizerId, org.id)).limit(1))[0] ?? null;
  const settlements = await db.select().from(organizerSettlementsTable).where(eq(organizerSettlementsTable.organizerId, org.id)).orderBy(desc(organizerSettlementsTable.createdAt)).limit(50);
  return res.json({ banking, settlements, commissionOwed: org.commissionOwed });
});

router.put("/organizer/banking", requireAuth(["organizer"]), async (req, res) => {
  const user = (req as any).user as { id: number };
  const org = await getMyOrganizer(user.id);
  if (!org) return res.status(403).json({ error: "No organizer profile" });
  const parsed = BankingBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const existing = (await db.select().from(organizerBankingDetailsTable).where(eq(organizerBankingDetailsTable.organizerId, org.id)).limit(1))[0];
  if (existing) {
    const [row] = await db.update(organizerBankingDetailsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(organizerBankingDetailsTable.id, existing.id)).returning();
    return res.json(row);
  }
  const [row] = await db.insert(organizerBankingDetailsTable).values({ organizerId: org.id, ...parsed.data }).returning();
  return res.json(row);
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN
// ════════════════════════════════════════════════════════════════════════════

router.get("/admin/organizers", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      o.*,
      u.email AS "ownerEmail",
      (SELECT COUNT(*)::int FROM organizer_events e WHERE e.organizer_id = o.id) AS "eventCount"
    FROM organizers o
    LEFT JOIN users u ON u.id = o.user_id
    ORDER BY o.created_at DESC
  `);
  return res.json(rows.rows);
});

router.patch("/admin/organizers/:id/verify", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const { verified } = req.body as { verified?: boolean };
  const [row] = await db
    .update(organizersTable)
    .set({ verified: verified !== false })
    .where(eq(organizersTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.patch("/admin/organizers/:id/status", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const { status } = req.body as { status?: string };
  if (status !== "approved" && status !== "rejected" && status !== "pending") {
    return res.status(400).json({ error: "Invalid status" });
  }
  const [row] = await db
    .update(organizersTable)
    .set({ status, approvedAt: status === "approved" ? new Date() : null })
    .where(eq(organizersTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.patch("/admin/organizers/:id/hide", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const { hidden } = req.body as { hidden?: boolean };
  const hiddenVal = hidden !== false;
  await db.execute(sql`UPDATE organizers SET hidden = ${hiddenVal} WHERE id = ${id}`);
  const rows = (await db.execute(sql`SELECT id, name, status, hidden FROM organizers WHERE id = ${id}`)) as unknown as any[];
  const row = rows[0];
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

// Admin: permanently delete an organizer and everything they own. Removing an
// organizer cascades to all events they organize plus the surrounding
// per-organizer records (managers, reviews, coupons, banking, settlements,
// ledger, ad requests, profile views, ticket bookings). Most of these tables
// store organizer_id as a plain integer with no FK, so the cleanup is explicit;
// event_tickets / organizer_ticket_orders cascade off organizer_events.
router.delete("/admin/organizers/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const org = (await db.select().from(organizersTable).where(eq(organizersTable.id, id)).limit(1))[0];
  if (!org) return res.status(404).json({ error: "Not found" });

  const eventRows = await db
    .select({ id: organizerEventsTable.id })
    .from(organizerEventsTable)
    .where(eq(organizerEventsTable.organizerId, id));
  const eventIds = eventRows.map((e) => e.id);

  await db.transaction(async (tx) => {
    // Ticket bookings made against this organizer's events.
    await tx.delete(bookingsTable).where(eq(bookingsTable.organizerId, id));
    // Events — cascades to event_tickets and organizer_ticket_orders via FK.
    await tx.delete(organizerEventsTable).where(eq(organizerEventsTable.organizerId, id));
    // Per-organizer records (organizer_id is a plain column, no cascade).
    await tx.delete(organizerAdRequestsTable).where(eq(organizerAdRequestsTable.organizerId, id));
    await tx.delete(organizerCommissionLedgerTable).where(eq(organizerCommissionLedgerTable.organizerId, id));
    await tx.delete(organizerCouponsTable).where(eq(organizerCouponsTable.organizerId, id));
    await tx.delete(organizerReviewsTable).where(eq(organizerReviewsTable.organizerId, id));
    await tx.delete(organizerManagersTable).where(eq(organizerManagersTable.organizerId, id));
    await tx.delete(organizerBankingDetailsTable).where(eq(organizerBankingDetailsTable.organizerId, id));
    await tx.delete(organizerSettlementsTable).where(eq(organizerSettlementsTable.organizerId, id));
    await tx.delete(organizerProfileViewsTable).where(eq(organizerProfileViewsTable.organizerId, id));
    await tx.delete(organizersTable).where(eq(organizersTable.id, id));
    // The person keeps their account — only the organizer profile is removed.
    // Demote them from the "organizer" partner role back to a regular user, and
    // wipe their prior partner applications so the become-vendor form treats them
    // as fresh (a stale "approved" request otherwise shows "You're already a
    // partner!" and blocks re-applying).
    if (org.userId) {
      await tx.update(usersTable)
        .set({ role: "user" })
        .where(and(eq(usersTable.id, org.userId), eq(usersTable.role, "organizer")));
      await tx.delete(vendorRequestsTable).where(eq(vendorRequestsTable.userId, org.userId));
    }
  });

  logger.info({ organizerId: id, userId: org.userId, deletedEvents: eventIds.length }, "admin deleted organizer");
  return res.json({ ok: true, deletedEvents: eventIds.length });
});

// All organizer events for the Announcement Slider admin tab (feature toggle).
router.get("/admin/organizer-events", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      e.id, e.title, e.slug, e.category,
      e.cover_image_url AS "imageUrl",
      e.approval_status AS "approvalStatus",
      e.is_featured_slider AS "isFeaturedSlider",
      e.commission_pct AS "commissionPct",
      e.gateway_fee_percent AS "gatewayFeePercent",
      e.start_date AS "startDate",
      o.name AS "organizerName"
    FROM organizer_events e
    JOIN organizers o ON o.id = e.organizer_id
    WHERE e.approval_status = 'approved'
    ORDER BY e.created_at DESC
  `);
  return res.json(rows.rows);
});

router.patch("/admin/organizer-events/:id/slider", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const { isFeaturedSlider } = req.body as { isFeaturedSlider?: boolean };
  if (typeof isFeaturedSlider !== "boolean") return res.status(400).json({ error: "isFeaturedSlider must be a boolean" });
  const [row] = await db
    .update(organizerEventsTable)
    .set({ isFeaturedSlider })
    .where(eq(organizerEventsTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.get("/admin/organizer-events/pending", requireAuth(["admin"]), async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        e.id,
        e.title,
        e.slug,
        e.category,
        e.short_description AS "shortDescription",
        e.cover_image_url   AS "coverImageUrl",
        e.city,
        e.start_date        AS "startDate",
        e.created_at        AS "createdAt",
        o.id                AS "organizerId",
        o.name              AS "organizerName",
        o.verified          AS "organizerVerified"
      FROM organizer_events e
      JOIN organizers o ON o.id = e.organizer_id
      WHERE e.approval_status = 'pending'
      ORDER BY e.created_at ASC
    `);
    return res.json(rows.rows);
  } catch (err) {
    logger.error({ err }, "Failed to load pending organizer events");
    return res.status(500).json({ error: "Failed to load pending organizer events" });
  }
});

router.patch("/admin/organizer-events/:id/approve", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [row] = await db
      .update(organizerEventsTable)
      .set({ approvalStatus: "approved", rejectionReason: "", approvedAt: new Date() })
      .where(eq(organizerEventsTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    // Coins stub: reward the organizer's owner for a successfully published event.
    const orgRows = await db
      .select({ userId: organizersTable.userId })
      .from(organizersTable)
      .where(eq(organizersTable.id, row.organizerId))
      .limit(1);
    if (orgRows[0]) await awardOrganizerCoins(orgRows[0].userId, 50);
    return res.json(row);
  } catch (err) {
    logger.error({ err }, "Failed to approve organizer event");
    return res.status(500).json({ error: "Failed to approve event" });
  }
});

router.patch("/admin/organizer-events/:id/reject", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const { rejectionReason } = req.body as { rejectionReason?: string };
  try {
    const [row] = await db
      .update(organizerEventsTable)
      .set({ approvalStatus: "rejected", rejectionReason: rejectionReason ?? "" })
      .where(eq(organizerEventsTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    logger.error({ err }, "Failed to reject organizer event");
    return res.status(500).json({ error: "Failed to reject event" });
  }
});

// Admin: set per-event commission % (and gateway fee %). New bookings lock the
// new rate; already-realised (checked-in) bookings keep their locked rate.
const CommissionBody = z.object({
  commissionPct: z.coerce.number().min(0).max(100).optional(),
  gatewayFeePercent: z.coerce.number().min(0).max(100).optional(),
});
router.patch("/admin/organizer-events/:id/commission", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = CommissionBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const updates: Record<string, unknown> = {};
  if (parsed.data.commissionPct != null) updates["commissionPct"] = String(parsed.data.commissionPct);
  if (parsed.data.gatewayFeePercent != null) updates["gatewayFeePercent"] = String(parsed.data.gatewayFeePercent);
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: "Nothing to update" });
  const [row] = await db.update(organizerEventsTable).set(updates).where(eq(organizerEventsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json({ id: row.id, commissionPct: row.commissionPct, gatewayFeePercent: row.gatewayFeePercent });
});

// Admin: settlement dashboard — organizers with their dues, banking + revenue.
router.get("/admin/organizer-settlements", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      o.id, o.name, o.slug, o.commission_owed AS "commissionOwed",
      b.account_holder_name AS "accountHolderName", b.bank_name AS "bankName",
      b.account_number AS "accountNumber", b.ifsc_code AS "ifscCode",
      COALESCE((SELECT SUM(l.revenue) FROM organizer_commission_ledger l WHERE l.organizer_id = o.id), 0) AS "lifetimeRevenue",
      COALESCE((SELECT SUM(l.commission) FROM organizer_commission_ledger l WHERE l.organizer_id = o.id), 0) AS "lifetimeCommission"
    FROM organizers o
    LEFT JOIN organizer_banking_details b ON b.organizer_id = o.id
    ORDER BY o.commission_owed DESC, o.created_at DESC
  `);
  return res.json(rows.rows);
});

const SettleBody = z.object({
  amount: z.coerce.number().min(0.01),
  note: z.string().max(500).optional().default(""),
});
router.post("/admin/organizers/:id/settle", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = SettleBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const org = (await db.select().from(organizersTable).where(eq(organizersTable.id, id)).limit(1))[0];
  if (!org) return res.status(404).json({ error: "Not found" });
  const owed = Number(org.commissionOwed ?? 0);
  const amount = Math.min(parsed.data.amount, owed);
  if (amount <= 0) return res.status(400).json({ error: "Nothing owed to settle." });
  await db.transaction(async (tx) => {
    await tx.update(organizersTable)
      .set({ commissionOwed: sql`GREATEST(0, ${organizersTable.commissionOwed} - ${String(amount)})` })
      .where(eq(organizersTable.id, id));
    await tx.insert(organizerSettlementsTable).values({ organizerId: id, amount: String(amount), status: "settled", adminNote: parsed.data.note });
  });
  return res.json({ ok: true, settled: amount });
});

// Admin: promote (ad) requests — approve flips the event into the hero slider.
router.get("/admin/organizer-ads", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT a.id, a.status, a.note, a.admin_note AS "adminNote", a.created_at AS "createdAt",
      o.name AS "organizerName", e.title AS "eventTitle", e.id AS "eventId", e.is_featured_slider AS "featured"
    FROM organizer_ad_requests a
    JOIN organizers o ON o.id = a.organizer_id
    JOIN organizer_events e ON e.id = a.organizer_event_id
    ORDER BY (a.status = 'pending') DESC, a.created_at DESC
  `);
  return res.json(rows.rows);
});

router.patch("/admin/organizer-ads/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const status = String(req.body?.status ?? "");
  const adminNote = String(req.body?.adminNote ?? "").slice(0, 500);
  if (status !== "approved" && status !== "rejected") return res.status(400).json({ error: "Invalid status" });
  const [row] = await db.update(organizerAdRequestsTable).set({ status, adminNote }).where(eq(organizerAdRequestsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  // Approval features the event in the Events-page hero slider.
  if (status === "approved") {
    await db.update(organizerEventsTable).set({ isFeaturedSlider: true }).where(eq(organizerEventsTable.id, row.organizerEventId));
  }
  return res.json(row);
});

// Admin: verify a user's email address (for seeding / support)
router.post("/admin/users/:id/verify-email", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const [row] = await db
    .update(usersTable)
    .set({ emailVerified: true, emailVerifyToken: "", emailVerifyExpiry: null })
    .where(eq(usersTable.id, id))
    .returning({ id: usersTable.id, email: usersTable.email, emailVerified: usersTable.emailVerified });
  if (!row) return res.status(404).json({ error: "User not found" });
  return res.json(row);
});

// Admin: create an organizer profile on behalf of any user + optionally promote their role.
router.post("/admin/organizers/seed", requireAuth(["admin"]), async (req, res) => {
  const AdminOrgBody = ProfileBody.extend({ userId: z.number().int() });
  const parsed = AdminOrgBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const { userId, ...profile } = parsed.data;
  const existing = await db.select({ id: organizersTable.id }).from(organizersTable).where(eq(organizersTable.userId, userId)).limit(1);
  if (existing[0]) return res.status(409).json({ error: "Organizer profile already exists for this user", id: existing[0].id });
  const user = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user[0]) return res.status(404).json({ error: "User not found" });
  const slug = await uniqueOrganizerSlug(profile.name);
  const usedPrefixes = (await db.select({ p: organizersTable.ticketPrefix }).from(organizersTable)).map((r) => r.p).filter((p): p is string => Boolean(p));
  const ticketPrefix = await generateUniqueTicketPrefix(profile.name, usedPrefixes);
  const ticketSalt = generateTicketSalt();
  const [row] = await db.insert(organizersTable).values({ userId, slug, ...profile, status: "approved", verified: true, ticketPrefix, ticketSalt }).returning();
  await db.update(usersTable).set({ role: "organizer" }).where(eq(usersTable.id, userId));
  return res.json(row);
});

// Admin: create an organizer event directly for any organizerId (auto-approved).
router.post("/admin/organizer-events/seed", requireAuth(["admin"]), async (req, res) => {
  const SeedEventBody = EventBody.extend({ organizerId: z.number().int() });
  const parsed = SeedEventBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const { organizerId, ...eventData } = parsed.data;
  const org = await db.select({ id: organizersTable.id }).from(organizersTable).where(eq(organizersTable.id, organizerId)).limit(1);
  if (!org[0]) return res.status(404).json({ error: "Organizer not found" });
  const slug = await uniqueEventSlug(eventData.title);
  const [row] = await db.insert(organizerEventsTable).values({
    organizerId,
    slug,
    approvalStatus: "approved",
    ...eventValuesFromBody(eventData),
  }).returning();
  return res.json(row);
});

export default router;
