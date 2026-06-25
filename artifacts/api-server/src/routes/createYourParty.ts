import { Router, type IRouter, type Response } from "express";
import { randomBytes } from "crypto";
import {
  db,
  usersTable,
  createYourPartyTable,
  createYourPartyTicketsTable,
  createYourPartyBookingsTable,
  createYourPartyPaymentsTable,
  createYourPartyCommissionsTable,
  createYourPartyAttendeesTable,
  createYourPartyMessagesTable,
} from "@workspace/db";
import { and, desc, eq, ne, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest, type AuthUser } from "../lib/auth";
import { respondInvalid } from "../lib/validationError";
import { getSoloAccess } from "../lib/soloConnect";
import { createUserNotification } from "../lib/notify";
import {
  createOrder,
  verifyPaymentSignature,
  isRazorpayConfigured,
  getKeyId,
} from "../lib/razorpay";

const router: IRouter = Router();

const norm = (s: string) => s.trim().toLowerCase();

// Same relative-object-path guard the upload flow uses elsewhere — never store
// an arbitrary external URL for the cover image.
function isUploadPath(url: string): boolean {
  return /^\/?(api\/)?(storage\/)?objects\/uploads\/[\w./-]+$/.test(url) || /^uploads\/[\w./-]+$/.test(url);
}

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
  return `${base || "party"}-${Math.random().toString(36).slice(2, 8)}`;
}

function genBookingCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// Unguessable token embedded in a host's share link. Booking a PRIVATE party
// requires presenting this exact token (?invite=…). 32 hex chars.
function genInviteToken(): string {
  return randomBytes(16).toString("hex");
}

// Gender gate: a male_only / female_only party only admits the matching gender;
// mixed admits everyone. Empty/unknown gender is blocked on gated parties.
function genderAllowed(joinType: string, gender: string | null): boolean {
  if (joinType === "mixed") return true;
  if (joinType === "male_only") return gender === "male";
  if (joinType === "female_only") return gender === "female";
  return true;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Read the single active platform commission config (falls back to 10%).
async function getActiveCommissionConfig(): Promise<{ commissionType: string; value: number }> {
  const rows = await db
    .select()
    .from(createYourPartyCommissionsTable)
    .where(eq(createYourPartyCommissionsTable.active, true))
    .orderBy(desc(createYourPartyCommissionsTable.id))
    .limit(1);
  const row = rows[0];
  if (!row) return { commissionType: "percentage", value: 10 };
  return { commissionType: row.commissionType, value: Number(row.value) };
}

// Platform commission split for a party booking. Fixed ₹ is capped at the total;
// percentage is value% of the total. Remainder is the organizer's net.
function computePartyCommission(
  cfg: { commissionType: string; value: number },
  total: number,
): { commission: number; net: number } {
  const commission = cfg.commissionType === "fixed"
    ? Math.min(cfg.value, total)
    : round2((total * cfg.value) / 100);
  return { commission: round2(commission), net: round2(Math.max(0, total - commission)) };
}

// Eligible (premium/verified-partner) AND verified — the same gate the party
// creation wizard sits behind in Solo Connect. Hosting a party is a premium act.
async function requireHost(
  req: Parameters<typeof loadUserFromRequest>[0],
  res: Response,
): Promise<AuthUser | null> {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  if (user.role === "admin") return user;
  const access = await getSoloAccess(user);
  if (!access.eligible) {
    res.status(403).json({ error: "Upgrade to Royvento Premium to host a party." });
    return null;
  }
  return user;
}

type PartyRow = typeof createYourPartyTable.$inferSelect;
type TicketRow = typeof createYourPartyTicketsTable.$inferSelect;

async function loadParty(id: number): Promise<PartyRow | null> {
  const rows = await db.select().from(createYourPartyTable).where(eq(createYourPartyTable.id, id)).limit(1);
  return rows[0] ?? null;
}

async function loadTicket(partyId: number): Promise<TicketRow | null> {
  const rows = await db
    .select()
    .from(createYourPartyTicketsTable)
    .where(eq(createYourPartyTicketsTable.partyId, partyId))
    .orderBy(desc(createYourPartyTicketsTable.active), createYourPartyTicketsTable.id)
    .limit(1);
  return rows[0] ?? null;
}

// Group-chat access: the host, OR anyone with a confirmed/completed booking.
// Everyone can SEE the chat panel exists on the profile, but reading/sending is
// gated here so only people who've actually joined can participate.
async function canChat(party: PartyRow, userId: number): Promise<boolean> {
  if (party.organizerUserId === userId) return true;
  const rows = await db
    .select({ id: createYourPartyBookingsTable.id })
    .from(createYourPartyBookingsTable)
    .where(
      and(
        eq(createYourPartyBookingsTable.partyId, party.id),
        eq(createYourPartyBookingsTable.userId, userId),
        inArray(createYourPartyBookingsTable.status, ["confirmed", "completed"]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

function partyToPublic(p: PartyRow, ticket: TicketRow | null, viewerId: number | null) {
  const sold = ticket?.soldCount ?? 0;
  const capacity = p.capacity || ticket?.quantity || 0;
  return {
    id: p.id,
    organizerUserId: p.organizerUserId,
    name: p.name,
    slug: p.slug,
    coverImageUrl: p.coverImageUrl,
    galleryImages: p.galleryImages ?? [],
    description: p.description,
    rules: p.rules,
    category: p.category,
    visibility: p.visibility,
    // The invite token is the join gate for private parties — only ever
    // revealed to the organizer (who builds the share link). "" for everyone else.
    inviteToken: viewerId != null && viewerId === p.organizerUserId ? p.inviteToken : "",
    venueName: p.venueName,
    address: p.address,
    city: p.city,
    state: p.state,
    pinCode: p.pinCode,
    mapLocation: p.mapLocation,
    partyDate: p.partyDate,
    startTime: p.startTime,
    endTime: p.endTime,
    joinType: p.joinType,
    organizerName: p.organizerName,
    capacity,
    ageGroup: p.ageGroup,
    dressCode: p.dressCode,
    drinking: p.drinking,
    smoking: p.smoking,
    coupleFriendly: p.coupleFriendly,
    lgbtqFriendly: p.lgbtqFriendly,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    ticketType: ticket?.type ?? "free",
    ticketPrice: ticket?.price ?? "0",
    soldCount: sold,
    seatsLeft: capacity > 0 ? Math.max(0, capacity - sold) : null,
    isOrganizer: viewerId != null && viewerId === p.organizerUserId,
  };
}

// ─── List published parties (optionally by city) ─────────────────────────────
router.get("/create-your-party", async (req, res) => {
  const viewer = await loadUserFromRequest(req);
  const city = typeof req.query["city"] === "string" ? req.query["city"] : "";
  // Both public AND private parties are listed (private stays VISIBLE for
  // discovery) — the booking endpoint enforces the invite gate, and the client
  // badges private rows + locks their Book button.
  const rows = await db
    .select()
    .from(createYourPartyTable)
    .where(ne(createYourPartyTable.status, "cancelled"))
    .orderBy(desc(createYourPartyTable.createdAt))
    .limit(200);
  const filtered = city ? rows.filter((r) => norm(r.city) === norm(city)) : rows;
  const tickets = await Promise.all(filtered.map((p) => loadTicket(p.id)));
  return res.json(filtered.map((p, i) => partyToPublic(p, tickets[i] ?? null, viewer?.id ?? null)));
});

// ─── The caller's own parties (organizer dashboard list) ─────────────────────
router.get("/create-your-party/mine", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const rows = await db
    .select()
    .from(createYourPartyTable)
    .where(eq(createYourPartyTable.organizerUserId, user.id))
    .orderBy(desc(createYourPartyTable.createdAt));
  const tickets = await Promise.all(rows.map((p) => loadTicket(p.id)));
  return res.json(rows.map((p, i) => partyToPublic(p, tickets[i] ?? null, user.id)));
});

// ─── Party detail ────────────────────────────────────────────────────────────
router.get("/create-your-party/:id", async (req, res) => {
  const viewer = await loadUserFromRequest(req);
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const p = await loadParty(id);
  if (!p) return res.status(404).json({ error: "Party not found" });
  const ticket = await loadTicket(id);
  const chat = viewer ? await canChat(p, viewer.id) : false;
  return res.json({ ...partyToPublic(p, ticket, viewer?.id ?? null), canChat: chat });
});

// ─── Create a party (+ its ticket row) ───────────────────────────────────────
const CreateBody = z.object({
  name: z.string().min(3).max(160),
  coverImageUrl: z.string().max(500).optional(),
  galleryImages: z.array(z.string().max(500)).max(12).optional(),
  description: z.string().max(2000).optional(),
  rules: z.string().max(2000).optional(),
  category: z.string().max(80).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  venueName: z.string().max(255).optional(),
  address: z.string().max(500).optional(),
  city: z.string().min(1).max(100),
  state: z.string().max(100).optional(),
  pinCode: z.string().max(12).optional(),
  mapLocation: z.string().max(500).optional(),
  partyDate: z.string().optional(),
  startTime: z.string().max(8).optional(),
  endTime: z.string().max(8).optional(),
  joinType: z.enum(["male_only", "female_only", "mixed"]),
  organizerName: z.string().min(1).max(120),
  ticketType: z.enum(["free", "paid"]),
  ticketPrice: z.number().min(0).max(1_000_000).optional(),
  capacity: z.number().int().min(0).max(100_000).optional(),
  // Optional vibe metadata
  ageGroup: z.enum(["", "18-25", "25-35", "35+"]).optional(),
  dressCode: z.enum(["", "casual", "smart_casual", "black_theme", "white_theme"]).optional(),
  drinking: z.enum(["", "yes", "no"]).optional(),
  smoking: z.enum(["", "yes", "no"]).optional(),
  coupleFriendly: z.enum(["", "yes", "no"]).optional(),
  lgbtqFriendly: z.enum(["", "yes", "no"]).optional(),
}).superRefine((d, ctx) => {
  if (d.coverImageUrl && !isUploadPath(d.coverImageUrl)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["coverImageUrl"], message: "Invalid cover image." });
  }
  (d.galleryImages ?? []).forEach((url, i) => {
    if (!isUploadPath(url)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["galleryImages", i], message: "Invalid gallery image." });
    }
  });
  if (d.ticketType === "paid") {
    if (!(typeof d.ticketPrice === "number" && d.ticketPrice > 0))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ticketPrice"], message: "Please enter a ticket price." });
    if (!(typeof d.capacity === "number" && d.capacity > 0))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["capacity"], message: "Please enter the total capacity." });
  }
});

router.post("/create-your-party", requireAuth(), async (req, res) => {
  const user = await requireHost(req, res);
  if (!user) return;
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const d = parsed.data;
  const now = new Date();
  const [party] = await db
    .insert(createYourPartyTable)
    .values({
      organizerUserId: user.id,
      name: d.name,
      slug: slugify(d.name),
      coverImageUrl: d.coverImageUrl ?? "",
      galleryImages: d.galleryImages ?? [],
      description: d.description ?? "",
      rules: d.rules ?? "",
      category: d.category ?? "party",
      visibility: d.visibility ?? "public",
      inviteToken: genInviteToken(),
      venueName: d.venueName ?? "",
      address: d.address ?? "",
      city: d.city,
      state: d.state ?? "",
      pinCode: d.pinCode ?? "",
      mapLocation: d.mapLocation ?? "",
      partyDate: d.partyDate ?? null,
      startTime: d.startTime ?? "",
      endTime: d.endTime ?? "",
      joinType: d.joinType,
      organizerName: d.organizerName,
      capacity: d.ticketType === "paid" ? (d.capacity ?? 0) : (d.capacity ?? 0),
      ageGroup: d.ageGroup ?? "",
      dressCode: d.dressCode ?? "",
      drinking: d.drinking ?? "",
      smoking: d.smoking ?? "",
      coupleFriendly: d.coupleFriendly ?? "",
      lgbtqFriendly: d.lgbtqFriendly ?? "",
      status: "published",
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const [ticket] = await db
    .insert(createYourPartyTicketsTable)
    .values({
      partyId: party!.id,
      type: d.ticketType,
      name: "Entry",
      price: d.ticketType === "paid" ? String(d.ticketPrice ?? 0) : "0",
      quantity: d.capacity ?? 0,
    })
    .returning();
  return res.json(partyToPublic(party!, ticket ?? null, user.id));
});

// ─── Edit a party (creator/admin only) ───────────────────────────────────────
const UpdateBody = z.object({
  name: z.string().min(3).max(160).optional(),
  coverImageUrl: z.string().max(500).optional(),
  galleryImages: z.array(z.string().max(500)).max(12).optional(),
  description: z.string().max(2000).optional(),
  rules: z.string().max(2000).optional(),
  category: z.string().max(80).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  venueName: z.string().max(255).optional(),
  address: z.string().max(500).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().max(100).optional(),
  pinCode: z.string().max(12).optional(),
  mapLocation: z.string().max(500).optional(),
  partyDate: z.string().optional(),
  startTime: z.string().max(8).optional(),
  endTime: z.string().max(8).optional(),
  joinType: z.enum(["male_only", "female_only", "mixed"]).optional(),
  organizerName: z.string().min(1).max(120).optional(),
  status: z.enum(["published", "sales_stopped", "cancelled"]).optional(),
  ageGroup: z.enum(["", "18-25", "25-35", "35+"]).optional(),
  dressCode: z.enum(["", "casual", "smart_casual", "black_theme", "white_theme"]).optional(),
  drinking: z.enum(["", "yes", "no"]).optional(),
  smoking: z.enum(["", "yes", "no"]).optional(),
  coupleFriendly: z.enum(["", "yes", "no"]).optional(),
  lgbtqFriendly: z.enum(["", "yes", "no"]).optional(),
});

router.patch("/create-your-party/:id", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const party = await loadParty(id);
  if (!party) return res.status(404).json({ error: "Party not found" });
  if (party.organizerUserId !== user.id && user.role !== "admin") {
    return res.status(403).json({ error: "Only the party host can edit this party." });
  }
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const d = parsed.data;
  if (d.coverImageUrl && !isUploadPath(d.coverImageUrl)) {
    return res.status(400).json({ error: "Invalid cover image." });
  }
  if (d.galleryImages && !d.galleryImages.every(isUploadPath)) {
    return res.status(400).json({ error: "Invalid gallery image." });
  }
  const patch: Partial<typeof createYourPartyTable.$inferInsert> = { updatedAt: new Date() };
  for (const k of [
    "name", "coverImageUrl", "galleryImages", "description", "rules", "category", "visibility",
    "venueName", "address", "city", "state", "pinCode", "mapLocation",
    "startTime", "endTime", "joinType", "organizerName", "status",
    "ageGroup", "dressCode", "drinking", "smoking", "coupleFriendly", "lgbtqFriendly",
  ] as const) {
    if (d[k] !== undefined) (patch as Record<string, unknown>)[k] = d[k];
  }
  if (d.partyDate !== undefined) patch.partyDate = d.partyDate || null;
  const [updated] = await db
    .update(createYourPartyTable)
    .set(patch)
    .where(eq(createYourPartyTable.id, id))
    .returning();
  const ticket = await loadTicket(id);
  // Notify attendees the party was updated (best-effort).
  if (d.status === "cancelled") {
    await notifyAttendees(id, "Party cancelled", `"${party.name}" has been cancelled by the host.`);
  } else {
    await notifyAttendees(id, "Party updated", `"${updated!.name}" details were updated by the host.`);
  }
  return res.json(partyToPublic(updated!, ticket, user.id));
});

// ─── Cancel a party (creator/admin only) ─────────────────────────────────────
router.delete("/create-your-party/:id", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const party = await loadParty(id);
  if (!party) return res.status(404).json({ error: "Party not found" });
  if (party.organizerUserId !== user.id && user.role !== "admin") {
    return res.status(403).json({ error: "Only the party host can cancel this party." });
  }
  await db.update(createYourPartyTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(createYourPartyTable.id, id));
  await notifyAttendees(id, "Party cancelled", `"${party.name}" has been cancelled by the host.`);
  return res.json({ ok: true });
});

// ─── Reset the invite link (organizer/admin only) — revokes old share links ───
router.post("/create-your-party/:id/reset-invite", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const party = await loadParty(id);
  if (!party) return res.status(404).json({ error: "Party not found" });
  if (party.organizerUserId !== user.id && user.role !== "admin") {
    return res.status(403).json({ error: "Only the party host can reset the invite link." });
  }
  const inviteToken = genInviteToken();
  await db.update(createYourPartyTable).set({ inviteToken, updatedAt: new Date() }).where(eq(createYourPartyTable.id, id));
  return res.json({ inviteToken });
});

// ─── Book a party. Free → confirmed instantly. Paid → Razorpay (online only). ─
const BookBody = z.object({
  quantity: z.number().int().min(1).max(10).optional(),
  name: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
  // Invite token from the host's share link — required to book a PRIVATE party.
  inviteToken: z.string().max(64).optional(),
});

router.post("/create-your-party/:id/book", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const party = await loadParty(id);
  if (!party) return res.status(404).json({ error: "Party not found" });
  if (party.status !== "published") return res.status(409).json({ error: "This party is not open for booking." });

  const parsed = BookBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const quantity = parsed.data.quantity ?? 1;

  // Invite gate — a PRIVATE party only admits people who opened the host's
  // share link (carrying the matching invite token). The organizer always
  // bypasses. Public parties have no gate.
  if (
    party.visibility === "private" &&
    party.organizerUserId !== user.id &&
    (parsed.data.inviteToken ?? "") !== party.inviteToken
  ) {
    return res.status(403).json({
      error: "This is a private party — open the host's invite link to book a spot.",
      code: "invite_required",
    });
  }

  // Every attendee — any role — must have a binary gender on file before booking
  // any party (mixed included). Already-set gender is reused; otherwise the client
  // collects it first. Safety net behind the frontend's gender prompt.
  if (user.gender !== "male" && user.gender !== "female") {
    return res.status(400).json({ error: "Select your gender (male or female) before booking.", code: "gender_required" });
  }
  // Gender gate for gender-restricted parties.
  if (!genderAllowed(party.joinType, user.gender)) {
    const label = party.joinType === "male_only" ? "men only" : "women only";
    return res.status(403).json({ error: `This party is ${label}.` });
  }

  const ticket = await loadTicket(id);
  if (!ticket) return res.status(409).json({ error: "This party has no ticket configured." });

  // Capacity check.
  const capacity = party.capacity || ticket.quantity || 0;
  if (capacity > 0 && ticket.soldCount + quantity > capacity) {
    return res.status(409).json({ error: "This party is sold out." });
  }

  // Block only a confirmed/completed duplicate — abandoned payment_pending
  // attempts shouldn't lock a user out of retrying a paid booking.
  const existing = await db
    .select({ id: createYourPartyBookingsTable.id })
    .from(createYourPartyBookingsTable)
    .where(
      and(
        eq(createYourPartyBookingsTable.partyId, id),
        eq(createYourPartyBookingsTable.userId, user.id),
        inArray(createYourPartyBookingsTable.status, ["confirmed", "completed"]),
      ),
    )
    .limit(1);
  if (existing.length > 0) return res.status(409).json({ error: "You've already booked this party." });

  const bookingName = parsed.data.name?.trim() || user.name;
  const bookingPhone = parsed.data.phone?.trim() || user.phone;

  // ── Paid party → online payment only (Razorpay) ──────────────────────────
  if (ticket.type === "paid") {
    if (!isRazorpayConfigured()) {
      return res.status(503).json({ error: "Online payments are not set up. Please try again later." });
    }
    const total = round2(Number(ticket.price) * quantity);
    const amountPaise = Math.round(total * 100);
    const [booking] = await db
      .insert(createYourPartyBookingsTable)
      .values({
        partyId: id,
        ticketId: ticket.id,
        userId: user.id,
        bookingCode: genBookingCode(),
        name: bookingName,
        email: user.email,
        phone: bookingPhone,
        quantity,
        totalPrice: String(total),
        commissionAmount: "0",
        netAmount: "0",
        status: "payment_pending",
        paymentStatus: "initiated",
      })
      .returning();
    let order;
    try {
      order = await createOrder({
        amountPaise,
        receipt: `party_${booking!.id}`,
        notes: { type: "party_booking", partyId: String(id), bookingId: String(booking!.id) },
      });
    } catch (err) {
      // Roll the booking back so a failed order doesn't leave an orphan.
      await db.delete(createYourPartyBookingsTable).where(eq(createYourPartyBookingsTable.id, booking!.id));
      req.log.error({ err }, "[party] Razorpay order creation failed");
      return res.status(502).json({ error: "Could not start payment. Please try again." });
    }
    await db.insert(createYourPartyPaymentsTable).values({
      bookingId: booking!.id,
      userId: user.id,
      amount: String(total),
      razorpayOrderId: order.id,
      status: "initiated",
    });
    return res.json({
      ok: true,
      paymentPending: true,
      bookingId: booking!.id,
      razorpayOrderId: order.id,
      razorpayKeyId: getKeyId(),
      amountPaise,
    });
  }

  // ── Free party → confirm instantly ───────────────────────────────────────
  const [booking] = await db
    .insert(createYourPartyBookingsTable)
    .values({
      partyId: id,
      ticketId: ticket.id,
      userId: user.id,
      bookingCode: genBookingCode(),
      name: bookingName,
      email: user.email,
      phone: bookingPhone,
      quantity,
      totalPrice: "0",
      commissionAmount: "0",
      netAmount: "0",
      status: "confirmed",
      paymentStatus: "none",
    })
    .returning();

  await db
    .update(createYourPartyTicketsTable)
    .set({ soldCount: sql`${createYourPartyTicketsTable.soldCount} + ${quantity}` })
    .where(eq(createYourPartyTicketsTable.id, ticket.id));

  await db.insert(createYourPartyAttendeesTable).values({
    partyId: id,
    bookingId: booking!.id,
    userId: user.id,
    name: booking!.name,
    gender: user.gender ?? "",
    quantity,
    status: "going",
  });

  await notifyBookingConfirmed(party, booking!.id, booking!.name, user.id);

  return res.json({ ok: true, bookingId: booking!.id, bookingCode: booking!.bookingCode });
});

// ─── Verify a Razorpay payment for a party booking (client-side fast path) ───
const VerifyBody = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

router.post("/create-your-party/payments/verify", requireAuth(), async (req, res) => {
  const parsed = VerifyBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Missing razorpay fields" });
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;
  if (!verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    return res.status(400).json({ error: "Payment signature verification failed" });
  }
  await activatePartyBookingAfterPayment(razorpayOrderId, razorpayPaymentId);
  return res.json({ ok: true });
});

// Atomically activate a paid party booking. Idempotent: the payments-row status
// gate ensures only one of {verify, webhook} performs the side effects.
export async function activatePartyBookingAfterPayment(razorpayOrderId: string, razorpayPaymentId: string): Promise<void> {
  const [payment] = await db
    .select()
    .from(createYourPartyPaymentsTable)
    .where(eq(createYourPartyPaymentsTable.razorpayOrderId, razorpayOrderId))
    .limit(1);
  if (!payment) return;

  const [booking] = await db
    .select()
    .from(createYourPartyBookingsTable)
    .where(eq(createYourPartyBookingsTable.id, payment.bookingId))
    .limit(1);
  if (!booking) return;

  const cfg = await getActiveCommissionConfig();
  const total = Number(booking.totalPrice);
  const { commission, net } = computePartyCommission(cfg, total);

  let activated = false;
  await db.transaction(async (tx) => {
    const gated = await tx
      .update(createYourPartyPaymentsTable)
      .set({ status: "success", razorpayPaymentId, updatedAt: new Date() })
      .where(and(eq(createYourPartyPaymentsTable.razorpayOrderId, razorpayOrderId), eq(createYourPartyPaymentsTable.status, "initiated")))
      .returning({ id: createYourPartyPaymentsTable.id });
    if (gated.length === 0) return; // already finalised by a concurrent caller

    await tx
      .update(createYourPartyBookingsTable)
      .set({ status: "confirmed", paymentStatus: "success", commissionAmount: String(commission), netAmount: String(net) })
      .where(eq(createYourPartyBookingsTable.id, booking.id));

    await tx
      .update(createYourPartyTicketsTable)
      .set({ soldCount: sql`${createYourPartyTicketsTable.soldCount} + ${booking.quantity}` })
      .where(eq(createYourPartyTicketsTable.id, booking.ticketId));

    activated = true;
  });
  if (!activated) return;

  const party = await loadParty(booking.partyId);
  if (!party) return;

  // Gender for the attendee row (best-effort).
  await db.insert(createYourPartyAttendeesTable).values({
    partyId: booking.partyId,
    bookingId: booking.id,
    userId: booking.userId,
    name: booking.name,
    gender: "",
    quantity: booking.quantity,
    status: "going",
  });

  await createUserNotification({
    userId: booking.userId,
    title: "Payment successful",
    message: `Your payment for "${party.name}" went through.`,
    url: "/dashboard/bookings",
    tag: `party-pay-${booking.id}`,
  });
  await notifyBookingConfirmed(party, booking.id, booking.name, booking.userId);
}

// Mark a party payment failed and release its (pending) booking.
export async function failPartyBookingAfterPayment(razorpayOrderId: string): Promise<void> {
  const marked = await db
    .update(createYourPartyPaymentsTable)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(createYourPartyPaymentsTable.razorpayOrderId, razorpayOrderId), eq(createYourPartyPaymentsTable.status, "initiated")))
    .returning({ bookingId: createYourPartyPaymentsTable.bookingId });
  const bookingId = marked[0]?.bookingId;
  if (!bookingId) return;
  await db
    .update(createYourPartyBookingsTable)
    .set({ status: "cancelled", paymentStatus: "failed", cancelledAt: new Date() })
    .where(and(eq(createYourPartyBookingsTable.id, bookingId), eq(createYourPartyBookingsTable.status, "payment_pending")));
}

// Handle a Razorpay refund for a party payment: cancel booking + release a seat.
export async function refundPartyBooking(razorpayPaymentId: string): Promise<void> {
  const [payment] = await db
    .select()
    .from(createYourPartyPaymentsTable)
    .where(eq(createYourPartyPaymentsTable.razorpayPaymentId, razorpayPaymentId))
    .limit(1);
  if (!payment) return;
  const [booking] = await db
    .select()
    .from(createYourPartyBookingsTable)
    .where(eq(createYourPartyBookingsTable.id, payment.bookingId))
    .limit(1);
  if (!booking || booking.status === "cancelled") return;
  // Only release a seat if this booking was actually counted (confirmed).
  const wasCounted = booking.status === "confirmed" || booking.status === "completed";
  await db.transaction(async (tx) => {
    await tx
      .update(createYourPartyBookingsTable)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(createYourPartyBookingsTable.id, booking.id));
    if (wasCounted) {
      await tx
        .update(createYourPartyTicketsTable)
        .set({ soldCount: sql`GREATEST(0, ${createYourPartyTicketsTable.soldCount} - ${booking.quantity})` })
        .where(eq(createYourPartyTicketsTable.id, booking.ticketId));
      await tx
        .update(createYourPartyAttendeesTable)
        .set({ status: "cancelled" })
        .where(eq(createYourPartyAttendeesTable.bookingId, booking.id));
    }
  });
  await createUserNotification({
    userId: booking.userId,
    title: "Refund processed",
    message: `Your booking was refunded and cancelled.`,
    url: "/dashboard/bookings",
    tag: `party-refund-${booking.id}`,
  });
}

// Confirm-to-guest + alert-host notification pair (shared by free + paid paths).
async function notifyBookingConfirmed(
  party: PartyRow,
  bookingId: number,
  guestName: string,
  guestUserId: number,
): Promise<void> {
  await createUserNotification({
    userId: guestUserId,
    title: "Booking confirmed!",
    message: `You're going to "${party.name}". See you there!`,
    url: "/dashboard/bookings",
    tag: `party-booking-${bookingId}`,
  });
  await createUserNotification({
    userId: party.organizerUserId,
    title: "New booking received",
    message: `${guestName} just booked "${party.name}".`,
    url: `/party/${party.id}`,
    tag: `party-host-${party.id}-${bookingId}`,
  });

  // Capacity-reached alert to the host.
  const ticket = await loadTicket(party.id);
  const capacity = party.capacity || ticket?.quantity || 0;
  if (capacity > 0 && ticket && ticket.soldCount >= capacity) {
    await createUserNotification({
      userId: party.organizerUserId,
      title: "Party reached capacity",
      message: `"${party.name}" is now fully booked.`,
      url: `/party/${party.id}`,
      tag: `party-full-${party.id}`,
    });
  }
}

// ─── Admin: platform party-commission config (single active row) ─────────────
router.get("/admin/create-your-party/commission", requireAuth(["admin"]), async (_req, res) => {
  const cfg = await getActiveCommissionConfig();
  return res.json(cfg);
});

const CommissionBody = z.object({
  commissionType: z.enum(["fixed", "percentage"]),
  value: z.number().min(0).max(1_000_000),
});

router.put("/admin/create-your-party/commission", requireAuth(["admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  const parsed = CommissionBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const { commissionType, value } = parsed.data;
  // Single-row config: deactivate the old, insert the new active row (audit trail).
  await db.update(createYourPartyCommissionsTable).set({ active: false }).where(eq(createYourPartyCommissionsTable.active, true));
  await db.insert(createYourPartyCommissionsTable).values({
    commissionType,
    value: String(value),
    active: true,
    updatedBy: user?.id ?? null,
  });
  return res.json({ commissionType, value });
});

// ─── Organizer dashboard for one party (creator/admin only) ──────────────────
router.get("/create-your-party/:id/dashboard", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const party = await loadParty(id);
  if (!party) return res.status(404).json({ error: "Party not found" });
  if (party.organizerUserId !== user.id && user.role !== "admin") {
    return res.status(403).json({ error: "Only the party host can view this dashboard." });
  }
  const ticket = await loadTicket(id);
  const bookings = await db
    .select()
    .from(createYourPartyBookingsTable)
    .where(eq(createYourPartyBookingsTable.partyId, id))
    .orderBy(desc(createYourPartyBookingsTable.id));

  const isConfirmed = (s: string) => s === "confirmed" || s === "completed";
  const confirmed = bookings.filter((b) => isConfirmed(b.status));
  const cancelled = bookings.filter((b) => b.status === "cancelled");
  const sum = (rows: typeof bookings, pick: (b: (typeof bookings)[number]) => string) =>
    round2(rows.reduce((acc, b) => acc + Number(pick(b)), 0));

  const revenue = sum(confirmed, (b) => b.totalPrice);
  const commission = sum(confirmed, (b) => b.commissionAmount);
  const netEarnings = sum(confirmed, (b) => b.netAmount);
  const guestsGoing = confirmed.reduce((acc, b) => acc + b.quantity, 0);
  const checkedInCount = confirmed.filter((b) => b.checkedIn).length;
  const capacity = party.capacity || ticket?.quantity || 0;
  // Surface the admin-set platform commission RATE (config) so the host sees the
  // cut even before any paid booking has realised commission.
  const commissionCfg = await getActiveCommissionConfig();

  const toRow = (b: (typeof bookings)[number]) => ({
    id: b.id,
    bookingCode: b.bookingCode,
    name: b.name,
    email: b.email,
    phone: b.phone,
    quantity: b.quantity,
    totalPrice: b.totalPrice,
    netAmount: b.netAmount,
    status: b.status,
    paymentStatus: b.paymentStatus,
    checkedIn: b.checkedIn,
    checkedInAt: b.checkedInAt ? b.checkedInAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
  });

  return res.json({
    party: partyToPublic(party, ticket, user.id),
    stats: {
      totalBookings: confirmed.length,
      cancelledBookings: cancelled.length,
      guestsGoing,
      checkedInCount,
      revenue: String(revenue),
      commission: String(commission),
      netEarnings: String(netEarnings),
      // Derived from the actual confirmed guest count (not the maintained
      // sold_count counter) so the figure is always consistent with the
      // "Guests going" KPI shown beside it.
      seatsLeft: capacity > 0 ? Math.max(0, capacity - guestsGoing) : null,
      capacity,
      commissionType: commissionCfg.commissionType,
      commissionValue: commissionCfg.value,
    },
    bookings: confirmed.map(toRow),
    cancelled: cancelled.map(toRow),
  });
});

// ─── Ticket scan / check-in (party host only) ────────────────────────────────
// The host scans an attendee's QR/ticket code at the door. Only the creator of
// THIS party may scan, and only tickets belonging to THIS party are accepted —
// every failure returns a clear, specific message.
const ScanBody = z.object({ code: z.string().min(1).max(32) });

router.post("/create-your-party/:id/scan", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const party = await loadParty(id);
  if (!party) return res.status(404).json({ error: "Party not found" });
  // Only the host (or an admin) may scan this party's tickets.
  if (party.organizerUserId !== user.id && user.role !== "admin") {
    return res.status(403).json({ error: "You can only scan tickets for parties you created." });
  }
  const parsed = ScanBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please scan or enter a ticket code." });
  const code = parsed.data.code.trim().toUpperCase();

  const [booking] = await db
    .select()
    .from(createYourPartyBookingsTable)
    .where(eq(createYourPartyBookingsTable.bookingCode, code))
    .limit(1);

  if (!booking) {
    return res.status(404).json({ error: "Invalid ticket — no booking found for this code." });
  }
  // Belongs to a DIFFERENT party → reject (can't scan another group's ticket).
  if (booking.partyId !== id) {
    return res.status(409).json({ error: "This ticket is for a different party — you can't scan it here." });
  }
  if (booking.status === "cancelled") {
    return res.status(409).json({ error: "This booking was cancelled — entry not allowed." });
  }
  if (booking.status !== "confirmed" && booking.status !== "completed") {
    return res.status(409).json({ error: "This booking isn't confirmed yet (payment pending)." });
  }
  if (booking.checkedIn) {
    const when = booking.checkedInAt ? new Date(booking.checkedInAt).toLocaleString("en-IN") : "earlier";
    return res.status(409).json({ error: `Already checked in (${when}).`, alreadyCheckedIn: true, name: booking.name });
  }

  const now = new Date();
  await db
    .update(createYourPartyBookingsTable)
    .set({ checkedIn: true, checkedInAt: now })
    .where(eq(createYourPartyBookingsTable.id, booking.id));

  return res.json({
    ok: true,
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    name: booking.name,
    quantity: booking.quantity,
    partyName: party.name,
    checkedInAt: now.toISOString(),
  });
});

// ─── The caller's own party bookings (booking history) ───────────────────────
router.get("/create-your-party/mine/bookings", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const rows = await db
    .select({
      id: createYourPartyBookingsTable.id,
      partyId: createYourPartyBookingsTable.partyId,
      partyName: createYourPartyTable.name,
      coverImageUrl: createYourPartyTable.coverImageUrl,
      partyDate: createYourPartyTable.partyDate,
      bookingCode: createYourPartyBookingsTable.bookingCode,
      quantity: createYourPartyBookingsTable.quantity,
      totalPrice: createYourPartyBookingsTable.totalPrice,
      status: createYourPartyBookingsTable.status,
      paymentStatus: createYourPartyBookingsTable.paymentStatus,
      checkedIn: createYourPartyBookingsTable.checkedIn,
      createdAt: createYourPartyBookingsTable.createdAt,
    })
    .from(createYourPartyBookingsTable)
    .leftJoin(createYourPartyTable, eq(createYourPartyTable.id, createYourPartyBookingsTable.partyId))
    .where(eq(createYourPartyBookingsTable.userId, user.id))
    .orderBy(desc(createYourPartyBookingsTable.id));
  return res.json(
    rows.map((r) => ({
      id: r.id,
      partyId: r.partyId,
      partyName: r.partyName ?? "",
      coverImageUrl: r.coverImageUrl ?? "",
      partyDate: r.partyDate,
      bookingCode: r.bookingCode,
      quantity: r.quantity,
      totalPrice: r.totalPrice,
      status: r.status,
      paymentStatus: r.paymentStatus,
      checkedIn: r.checkedIn,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

// ─── Attendee cancels their own booking ──────────────────────────────────────
router.post("/create-your-party/bookings/:bookingId/cancel", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const bookingId = parseInt(String(req.params.bookingId), 10);
  if (Number.isNaN(bookingId)) return res.status(400).json({ error: "Invalid id" });
  const [booking] = await db
    .select()
    .from(createYourPartyBookingsTable)
    .where(eq(createYourPartyBookingsTable.id, bookingId))
    .limit(1);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.userId !== user.id) return res.status(403).json({ error: "You can only cancel your own booking." });
  if (booking.status === "cancelled") return res.status(409).json({ error: "This booking is already cancelled." });

  // Only a confirmed/completed booking ever incremented sold_count and created
  // an attendee row. An abandoned payment_pending booking did neither, so we
  // must NOT release a seat for it (that would drift sold_count below reality).
  const wasCounted = booking.status === "confirmed" || booking.status === "completed";

  await db.transaction(async (tx) => {
    await tx
      .update(createYourPartyBookingsTable)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(createYourPartyBookingsTable.id, bookingId));
    if (wasCounted) {
      await tx
        .update(createYourPartyTicketsTable)
        .set({ soldCount: sql`GREATEST(0, ${createYourPartyTicketsTable.soldCount} - ${booking.quantity})` })
        .where(eq(createYourPartyTicketsTable.id, booking.ticketId));
      await tx
        .update(createYourPartyAttendeesTable)
        .set({ status: "cancelled" })
        .where(eq(createYourPartyAttendeesTable.bookingId, bookingId));
    }
  });

  const party = await loadParty(booking.partyId);
  if (party) {
    await createUserNotification({
      userId: party.organizerUserId,
      title: "Cancellation request",
      message: `${booking.name} cancelled their booking for "${party.name}".`,
      url: `/dashboard/parties`,
      tag: `party-cancel-${bookingId}`,
    });
    await createUserNotification({
      userId: user.id,
      title: "Booking cancelled",
      message: `Your booking for "${party.name}" was cancelled.${booking.paymentStatus === "success" ? " Any refund will be processed separately." : ""}`,
      url: "/dashboard/bookings",
      tag: `party-cancel-self-${bookingId}`,
    });
  }
  return res.json({ ok: true });
});

// ─── Party group chat (host + confirmed attendees only) ──────────────────────
router.get("/create-your-party/:id/messages", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const party = await loadParty(id);
  if (!party) return res.status(404).json({ error: "Party not found" });
  if (!(await canChat(party, user.id))) return res.status(403).json({ error: "Join this party to view the group chat." });
  const rows = await db
    .select({
      id: createYourPartyMessagesTable.id,
      partyId: createYourPartyMessagesTable.partyId,
      userId: createYourPartyMessagesTable.userId,
      userName: usersTable.name,
      body: createYourPartyMessagesTable.body,
      createdAt: createYourPartyMessagesTable.createdAt,
    })
    .from(createYourPartyMessagesTable)
    .leftJoin(usersTable, eq(usersTable.id, createYourPartyMessagesTable.userId))
    .where(eq(createYourPartyMessagesTable.partyId, id))
    .orderBy(createYourPartyMessagesTable.id);
  return res.json(
    rows.map((m) => ({
      id: m.id,
      partyId: m.partyId,
      userId: m.userId,
      userName: m.userName ?? "",
      isHost: m.userId === party.organizerUserId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      isMine: m.userId === user.id,
    })),
  );
});

const PartyMessageBody = z.object({ body: z.string().min(1).max(1000) });

router.post("/create-your-party/:id/messages", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const party = await loadParty(id);
  if (!party) return res.status(404).json({ error: "Party not found" });
  if (!(await canChat(party, user.id))) return res.status(403).json({ error: "Join this party to chat." });
  const parsed = PartyMessageBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const [m] = await db
    .insert(createYourPartyMessagesTable)
    .values({ partyId: id, userId: user.id, body: parsed.data.body.trim() })
    .returning();
  return res.json({
    id: m!.id,
    partyId: m!.partyId,
    userId: m!.userId,
    userName: user.name,
    isHost: user.id === party.organizerUserId,
    body: m!.body,
    createdAt: m!.createdAt.toISOString(),
    isMine: true,
  });
});

// Fan out an in-app notification to every confirmed attendee of a party.
async function notifyAttendees(partyId: number, title: string, message: string): Promise<void> {
  try {
    const rows = await db
      .select({ userId: createYourPartyBookingsTable.userId })
      .from(createYourPartyBookingsTable)
      .where(
        and(
          eq(createYourPartyBookingsTable.partyId, partyId),
          ne(createYourPartyBookingsTable.status, "cancelled"),
        ),
      );
    const seen = new Set<number>();
    for (const r of rows) {
      if (seen.has(r.userId)) continue;
      seen.add(r.userId);
      await createUserNotification({ userId: r.userId, title, message, url: `/party/${partyId}`, tag: `party-${partyId}-update` });
    }
  } catch {
    /* best-effort */
  }
}

export default router;
