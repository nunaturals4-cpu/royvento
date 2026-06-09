import { Router, type IRouter, type Response } from "express";
import {
  db,
  usersTable,
  soloConnectVerificationsTable,
  soloGroupsTable,
  soloGroupMembersTable,
  soloGroupMessagesTable,
} from "@workspace/db";
import { eq, and, desc, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  requireAuth,
  loadUserFromRequest,
  hashPassword,
  comparePassword,
  type AuthUser,
} from "../lib/auth";
import { respondInvalid } from "../lib/validationError";
import { getSoloAccess } from "../lib/soloConnect";

const router: IRouter = Router();

const norm = (s: string) => s.trim().toLowerCase();

// Strip server-only secret columns before sending a verification row to clients.
function verificationToPublic(v: typeof soloConnectVerificationsTable.$inferSelect) {
  return {
    id: v.id,
    userId: v.userId,
    idType: v.idType,
    idDocumentUrl: v.idDocumentUrl,
    selfieUrl: v.selfieUrl,
    phone: v.phone,
    phoneVerified: v.phoneVerified,
    status: v.status,
    rejectionReason: v.rejectionReason,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

// Loads the caller and asserts Solo Connect eligibility. Returns null + responds
// 401/403 when the request should not proceed.
async function requireEligible(
  req: Parameters<typeof loadUserFromRequest>[0],
  res: Response,
): Promise<AuthUser | null> {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const access = await getSoloAccess(user);
  if (!access.eligible) {
    res.status(403).json({ error: "Upgrade to Royvento Premium to access Solo Connect." });
    return null;
  }
  return user;
}

// Eligible AND identity-approved — required to create/join/view groups.
async function requireApproved(
  req: Parameters<typeof loadUserFromRequest>[0],
  res: Response,
): Promise<AuthUser | null> {
  const user = await requireEligible(req, res);
  if (!user) return null;
  // Admins never need identity verification — they moderate Solo Connect.
  if (user.role !== "admin") {
    const rows = await db
      .select({ status: soloConnectVerificationsTable.status })
      .from(soloConnectVerificationsTable)
      .where(eq(soloConnectVerificationsTable.userId, user.id))
      .limit(1);
    if (rows[0]?.status !== "approved") {
      res.status(403).json({ error: "Identity verification required before joining groups." });
      return null;
    }
  }
  if (!user.gender) {
    res.status(403).json({ error: "Complete your profile (gender) before using Solo Connect." });
    return null;
  }
  return user;
}

// ─── Access ──────────────────────────────────────────────────────────────────

router.get("/solo-connect/access", async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const access = await getSoloAccess(user);
  res.json(access);
});

// ─── Venue options (per activity type) ───────────────────────────────────────
//
// Powers the Create Group venue picker. The data source CHANGES by activity
// type so the dropdown genuinely differs per type:
//   nightlife   → pubs / clubs (vendors)
//   happy_hours → venues running drink deals (vendors ⋈ drink_plans)
//   food_drinks → venues with food/drink offers (vendors ⋈ vendor_offers)
//   events      → ticketed events
//   activities  → events (sports screenings, trivia nights…)
//   games       → game zones (games ⋈ game_organizers)
// `kind` tells the client which id to link on the group (vendorId / eventId);
// games have no group FK column, so they're stored by name only.
router.get("/solo-connect/venues", async (req, res) => {
  const user = await requireEligible(req, res);
  if (!user) return;
  const at = String(req.query["activityType"] ?? "nightlife");
  let result;
  switch (at) {
    case "happy_hours":
      result = await db.execute(sql`
        SELECT DISTINCT v.id, v.business_name AS name, v.location AS sub, 'vendor' AS kind
        FROM vendors v JOIN drink_plans dp ON dp.vendor_id = v.id
        WHERE v.status = 'approved'
        ORDER BY name LIMIT 100`);
      break;
    case "food_drinks":
      result = await db.execute(sql`
        SELECT DISTINCT v.id, v.business_name AS name, v.location AS sub, 'vendor' AS kind
        FROM vendors v JOIN vendor_offers vo ON vo.vendor_id = v.id AND vo.active = true
        WHERE v.status = 'approved'
        ORDER BY name LIMIT 100`);
      break;
    case "events":
    case "activities":
      result = await db.execute(sql`
        SELECT id, title AS name, location AS sub, 'event' AS kind
        FROM events WHERE approval_status = 'approved'
        ORDER BY name LIMIT 100`);
      break;
    case "games":
      result = await db.execute(sql`
        SELECT g.id, g.name AS name, o.name AS sub, 'game' AS kind
        FROM games g JOIN game_organizers o ON o.id = g.game_organizer_id
        WHERE g.approval_status = 'approved' AND g.active = true AND o.status = 'approved'
        ORDER BY name LIMIT 100`);
      break;
    case "nightlife":
    default:
      result = await db.execute(sql`
        SELECT id, business_name AS name, location AS sub, 'vendor' AS kind
        FROM vendors WHERE status = 'approved'
        ORDER BY name LIMIT 100`);
  }
  const rows = (result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
  res.json(
    rows.map((r) => ({
      id: Number(r["id"]),
      name: String(r["name"] ?? ""),
      sub: String(r["sub"] ?? ""),
      kind: String(r["kind"] ?? "vendor"),
    })),
  );
});

// ─── Verification ──────────────────────────────────────────────────────────────

router.get("/solo-connect/verification", async (req, res) => {
  const user = await requireEligible(req, res);
  if (!user) return;
  const rows = await db
    .select()
    .from(soloConnectVerificationsTable)
    .where(eq(soloConnectVerificationsTable.userId, user.id))
    .limit(1);
  res.json(rows[0] ? verificationToPublic(rows[0]) : null);
});

const VerificationBody = z.object({
  idType: z.enum(["aadhaar", "passport", "driving_license", "voter_id"]),
  idDocumentUrl: z.string().min(1),
  selfieUrl: z.string().min(1),
  phone: z.string().min(6).max(20),
});

// Upsert the ID + selfie + phone. Resets the row to a fresh (un-verified,
// pending) state so a re-submission must re-do the OTP step.
router.post("/solo-connect/verification", async (req, res) => {
  const user = await requireEligible(req, res);
  if (!user) return;
  const parsed = VerificationBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const { idType, idDocumentUrl, selfieUrl, phone } = parsed.data;
  const existing = await db
    .select({ id: soloConnectVerificationsTable.id })
    .from(soloConnectVerificationsTable)
    .where(eq(soloConnectVerificationsTable.userId, user.id))
    .limit(1);

  if (existing[0]) {
    await db
      .update(soloConnectVerificationsTable)
      .set({
        idType,
        idDocumentUrl,
        selfieUrl,
        phone,
        phoneVerified: false,
        otpHash: "",
        otpExpiry: null,
        status: "pending",
        rejectionReason: "",
        updatedAt: new Date(),
      })
      .where(eq(soloConnectVerificationsTable.id, existing[0].id));
  } else {
    await db.insert(soloConnectVerificationsTable).values({
      userId: user.id,
      idType,
      idDocumentUrl,
      selfieUrl,
      phone,
      status: "pending",
    });
  }
  const rows = await db
    .select()
    .from(soloConnectVerificationsTable)
    .where(eq(soloConnectVerificationsTable.userId, user.id))
    .limit(1);
  res.json(verificationToPublic(rows[0]!));
});

// Dev-mode OTP: generate, hash + store with 10-min expiry, and (only outside
// production) return the code so the flow is testable end-to-end. A real SMS
// provider (Twilio/MSG91) drops in here behind the same request/verify pair.
router.post("/solo-connect/verification/otp/request", async (req, res) => {
  const user = await requireEligible(req, res);
  if (!user) return;
  const rows = await db
    .select()
    .from(soloConnectVerificationsTable)
    .where(eq(soloConnectVerificationsTable.userId, user.id))
    .limit(1);
  if (!rows[0]) {
    res.status(400).json({ error: "Upload your ID and selfie before requesting an OTP." });
    return;
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const otpHash = await hashPassword(code);
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await db
    .update(soloConnectVerificationsTable)
    .set({ otpHash, otpExpiry, updatedAt: new Date() })
    .where(eq(soloConnectVerificationsTable.id, rows[0].id));
  const isProd = process.env["NODE_ENV"] === "production";
  // TODO(solo-connect): replace with real SMS provider send.
  req.log.info({ phone: rows[0].phone, code }, "Solo Connect OTP generated (dev)");
  res.json({ ok: true, devCode: isProd ? undefined : code });
});

const OtpVerifyBody = z.object({ code: z.string().min(4).max(8) });

router.post("/solo-connect/verification/otp/verify", async (req, res) => {
  const user = await requireEligible(req, res);
  if (!user) return;
  const parsed = OtpVerifyBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const rows = await db
    .select()
    .from(soloConnectVerificationsTable)
    .where(eq(soloConnectVerificationsTable.userId, user.id))
    .limit(1);
  const ver = rows[0];
  if (!ver || !ver.otpHash || !ver.otpExpiry) {
    res.status(400).json({ error: "Request an OTP first." });
    return;
  }
  if (ver.otpExpiry.getTime() < Date.now()) {
    res.status(400).json({ error: "OTP expired. Please request a new one." });
    return;
  }
  const ok = await comparePassword(parsed.data.code, ver.otpHash);
  if (!ok) {
    res.status(400).json({ error: "Incorrect OTP." });
    return;
  }
  await db
    .update(soloConnectVerificationsTable)
    .set({ phoneVerified: true, otpHash: "", otpExpiry: null, status: "pending", updatedAt: new Date() })
    .where(eq(soloConnectVerificationsTable.id, ver.id));
  const updated = await db
    .select()
    .from(soloConnectVerificationsTable)
    .where(eq(soloConnectVerificationsTable.id, ver.id))
    .limit(1);
  res.json(verificationToPublic(updated[0]!));
});

// Admin: list all identity verifications (pending first), joined with the
// applicant's name/email so the admin panel can review and approve/reject.
router.get("/admin/solo-connect/verifications", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select({
      id: soloConnectVerificationsTable.id,
      userId: soloConnectVerificationsTable.userId,
      idType: soloConnectVerificationsTable.idType,
      idDocumentUrl: soloConnectVerificationsTable.idDocumentUrl,
      selfieUrl: soloConnectVerificationsTable.selfieUrl,
      phone: soloConnectVerificationsTable.phone,
      phoneVerified: soloConnectVerificationsTable.phoneVerified,
      status: soloConnectVerificationsTable.status,
      rejectionReason: soloConnectVerificationsTable.rejectionReason,
      createdAt: soloConnectVerificationsTable.createdAt,
      updatedAt: soloConnectVerificationsTable.updatedAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
    })
    .from(soloConnectVerificationsTable)
    .leftJoin(usersTable, eq(usersTable.id, soloConnectVerificationsTable.userId))
    .orderBy(desc(soloConnectVerificationsTable.updatedAt));
  // Pending first so the admin sees what needs action at the top.
  const order: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };
  rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  res.json(
    rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName ?? "",
      userEmail: r.userEmail ?? "",
      idType: r.idType,
      idDocumentUrl: r.idDocumentUrl,
      selfieUrl: r.selfieUrl,
      phone: r.phone,
      phoneVerified: r.phoneVerified,
      status: r.status,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  );
});

// Admin review (minimal — full moderation panel is Phase 3).
const ReviewBody = z.object({
  decision: z.enum(["approved", "rejected"]),
  rejectionReason: z.string().max(500).optional(),
});

router.post("/admin/solo-connect/verifications/:id/review", requireAuth(["admin"]), async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = ReviewBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const admin = await loadUserFromRequest(req);
  await db
    .update(soloConnectVerificationsTable)
    .set({
      status: parsed.data.decision,
      rejectionReason: parsed.data.rejectionReason ?? "",
      reviewedByUserId: admin?.id ?? null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(soloConnectVerificationsTable.id, id));
  const rows = await db
    .select()
    .from(soloConnectVerificationsTable)
    .where(eq(soloConnectVerificationsTable.id, id))
    .limit(1);
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(verificationToPublic(rows[0]));
});

// Admin: delete a verification record entirely. The user can then start the
// verification flow again from scratch.
router.delete("/admin/solo-connect/verifications/:id", requireAuth(["admin"]), async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(soloConnectVerificationsTable).where(eq(soloConnectVerificationsTable.id, id));
  res.json({ ok: true });
});

// ─── Groups ────────────────────────────────────────────────────────────────────

// Counts approved members per group id.
async function approvedCounts(groupIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (groupIds.length === 0) return map;
  const rows = await db
    .select({ groupId: soloGroupMembersTable.groupId })
    .from(soloGroupMembersTable)
    .where(
      and(
        inArray(soloGroupMembersTable.groupId, groupIds),
        eq(soloGroupMembersTable.status, "approved"),
      ),
    );
  for (const r of rows) map.set(r.groupId, (map.get(r.groupId) ?? 0) + 1);
  return map;
}

function groupToPublic(
  g: typeof soloGroupsTable.$inferSelect,
  memberCount: number,
  myStatus: string | null,
  isAdmin: boolean,
) {
  return {
    id: g.id,
    adminUserId: g.adminUserId,
    name: g.name,
    activityType: g.activityType,
    activityLabel: g.activityLabel,
    venueName: g.venueName,
    vendorId: g.vendorId,
    eventId: g.eventId,
    groupDate: g.groupDate,
    startTime: g.startTime,
    description: g.description,
    minMembers: g.minMembers,
    maxMembers: g.maxMembers,
    country: g.country,
    state: g.state,
    city: g.city,
    genderType: g.genderType,
    visibility: g.visibility,
    status: g.status,
    reputationScore: g.reputationScore,
    ratingCount: g.ratingCount,
    createdAt: g.createdAt.toISOString(),
    memberCount,
    myMembershipStatus: myStatus,
    isAdmin,
  };
}

// List groups in the caller's gender + current city. City is REQUIRED and
// validated on every request so users can never browse other-city groups.
router.get("/solo-connect/groups", async (req, res) => {
  const user = await requireApproved(req, res);
  if (!user) return;
  const city = typeof req.query["city"] === "string" ? req.query["city"] : "";
  const activityType = typeof req.query["activityType"] === "string" ? req.query["activityType"] : "";
  if (!city.trim()) {
    res.status(400).json({ error: "Your current city is required to view groups." });
    return;
  }
  const conds = [
    eq(soloGroupsTable.genderType, user.gender!),
    ne(soloGroupsTable.status, "closed"),
  ];
  const all = await db
    .select()
    .from(soloGroupsTable)
    .where(and(...conds))
    .orderBy(desc(soloGroupsTable.createdAt));
  // City + (optional) activity filtering done in JS for case-insensitive match.
  const filtered = all.filter(
    (g) => norm(g.city) === norm(city) && (!activityType || g.activityType === activityType),
  );
  const counts = await approvedCounts(filtered.map((g) => g.id));
  const myMemberships = await db
    .select({ groupId: soloGroupMembersTable.groupId, status: soloGroupMembersTable.status })
    .from(soloGroupMembersTable)
    .where(eq(soloGroupMembersTable.userId, user.id));
  const myMap = new Map(myMemberships.map((m) => [m.groupId, m.status]));
  res.json(
    filtered.map((g) =>
      groupToPublic(g, counts.get(g.id) ?? 0, myMap.get(g.id) ?? null, g.adminUserId === user.id),
    ),
  );
});

const CreateGroupBody = z.object({
  name: z.string().min(3).max(160),
  activityType: z.enum(["nightlife", "events", "games", "activities", "happy_hours", "food_drinks"]),
  activityLabel: z.string().max(160).optional(),
  venueName: z.string().max(255).optional(),
  vendorId: z.number().int().optional(),
  eventId: z.number().int().optional(),
  groupDate: z.string().optional(),
  startTime: z.string().max(8).optional(),
  description: z.string().max(2000).optional(),
  maxMembers: z.number().int().min(3).max(15),
  visibility: z.enum(["public", "private"]).optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  city: z.string().min(1),
});

// Create a group. genderType is FORCED to the creator's onboarding gender and
// the location is taken from the request body (the user's verified location);
// the creator is auto-enrolled as the approved admin member.
router.post("/solo-connect/groups", async (req, res) => {
  const user = await requireApproved(req, res);
  if (!user) return;
  const parsed = CreateGroupBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const d = parsed.data;
  const inserted = await db
    .insert(soloGroupsTable)
    .values({
      adminUserId: user.id,
      name: d.name,
      activityType: d.activityType,
      activityLabel: d.activityLabel ?? "",
      venueName: d.venueName ?? "",
      vendorId: d.vendorId ?? null,
      eventId: d.eventId ?? null,
      groupDate: d.groupDate ?? null,
      startTime: d.startTime ?? "",
      description: d.description ?? "",
      maxMembers: d.maxMembers,
      visibility: d.visibility ?? "public",
      country: d.country ?? "India",
      state: d.state ?? "",
      city: d.city,
      genderType: user.gender!,
    })
    .returning();
  const group = inserted[0]!;
  await db.insert(soloGroupMembersTable).values({
    groupId: group.id,
    userId: user.id,
    role: "admin",
    status: "approved",
    joinedAt: new Date(),
  });
  res.json(groupToPublic(group, 1, "approved", true));
});

// Loads a group and enforces gender + caller-city access. Returns null + sends a
// response when access is denied.
async function loadAccessibleGroup(
  groupId: number,
  user: AuthUser,
  callerCity: string,
  res: Response,
): Promise<typeof soloGroupsTable.$inferSelect | null> {
  const rows = await db
    .select()
    .from(soloGroupsTable)
    .where(eq(soloGroupsTable.id, groupId))
    .limit(1);
  const g = rows[0];
  if (!g) {
    res.status(404).json({ error: "Group not found" });
    return null;
  }
  if (g.genderType !== user.gender) {
    res.status(403).json({ error: "This group is not available for your account." });
    return null;
  }
  if (callerCity && norm(g.city) !== norm(callerCity)) {
    res.status(403).json({ error: "You can only access groups in your current city." });
    return null;
  }
  return g;
}

router.get("/solo-connect/groups/:id", async (req, res) => {
  const user = await requireApproved(req, res);
  if (!user) return;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const callerCity = typeof req.query["city"] === "string" ? req.query["city"] : "";
  const g = await loadAccessibleGroup(id, user, callerCity, res);
  if (!g) return;

  const members = await db
    .select({
      id: soloGroupMembersTable.id,
      groupId: soloGroupMembersTable.groupId,
      userId: soloGroupMembersTable.userId,
      userName: usersTable.name,
      role: soloGroupMembersTable.role,
      status: soloGroupMembersTable.status,
      joinedAt: soloGroupMembersTable.joinedAt,
      createdAt: soloGroupMembersTable.createdAt,
    })
    .from(soloGroupMembersTable)
    .leftJoin(usersTable, eq(usersTable.id, soloGroupMembersTable.userId))
    .where(eq(soloGroupMembersTable.groupId, id))
    .orderBy(desc(soloGroupMembersTable.id));

  const mine = members.find((m) => m.userId === user.id);
  const approvedCount = members.filter((m) => m.status === "approved").length;
  res.json({
    group: groupToPublic(g, approvedCount, mine?.status ?? null, g.adminUserId === user.id),
    members: members.map((m) => ({
      id: m.id,
      groupId: m.groupId,
      userId: m.userId,
      userName: m.userName ?? "",
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

const JoinBody = z.object({
  country: z.string().optional(),
  state: z.string().optional(),
  city: z.string().min(1),
});

// Request to join. Location is validated on EVERY call (group.city === body.city)
// and gender is enforced via loadAccessibleGroup.
router.post("/solo-connect/groups/:id/join", async (req, res) => {
  const user = await requireApproved(req, res);
  if (!user) return;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = JoinBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const g = await loadAccessibleGroup(id, user, parsed.data.city, res);
  if (!g) return;
  if (g.status !== "open") {
    res.status(403).json({ error: "This group is locked or closed." });
    return;
  }
  const existing = await db
    .select()
    .from(soloGroupMembersTable)
    .where(and(eq(soloGroupMembersTable.groupId, id), eq(soloGroupMembersTable.userId, user.id)))
    .limit(1);
  if (existing[0] && ["approved", "requested"].includes(existing[0].status)) {
    res.status(409).json({ error: "You have already requested to join this group." });
    return;
  }
  const counts = await approvedCounts([id]);
  if ((counts.get(id) ?? 0) >= g.maxMembers) {
    res.status(403).json({ error: "This group is full." });
    return;
  }
  if (existing[0]) {
    await db
      .update(soloGroupMembersTable)
      .set({ status: "requested", role: "member" })
      .where(eq(soloGroupMembersTable.id, existing[0].id));
  } else {
    await db.insert(soloGroupMembersTable).values({
      groupId: id,
      userId: user.id,
      role: "member",
      status: "requested",
    });
  }
  res.json({ ok: true, status: "requested" });
});

router.post("/solo-connect/groups/:id/leave", async (req, res) => {
  const user = await requireApproved(req, res);
  if (!user) return;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .update(soloGroupMembersTable)
    .set({ status: "left" })
    .where(
      and(
        eq(soloGroupMembersTable.groupId, id),
        eq(soloGroupMembersTable.userId, user.id),
        ne(soloGroupMembersTable.role, "admin"),
      ),
    );
  res.json({ ok: true });
});

// Asserts the caller is the admin of the group; returns the group or sends 403/404.
async function requireGroupAdmin(
  groupId: number,
  user: AuthUser,
  res: Response,
): Promise<typeof soloGroupsTable.$inferSelect | null> {
  const rows = await db.select().from(soloGroupsTable).where(eq(soloGroupsTable.id, groupId)).limit(1);
  const g = rows[0];
  if (!g) {
    res.status(404).json({ error: "Group not found" });
    return null;
  }
  if (g.adminUserId !== user.id) {
    res.status(403).json({ error: "Only the group admin can do that." });
    return null;
  }
  return g;
}

function memberAction(action: "approved" | "rejected" | "removed") {
  return async (
    req: Parameters<typeof loadUserFromRequest>[0] & { params: Record<string, string> },
    res: Response,
  ) => {
    const user = await requireApproved(req, res);
    if (!user) return;
    const id = parseInt(req.params["id"]!, 10);
    const memberId = parseInt(req.params["memberId"]!, 10);
    if (Number.isNaN(id) || Number.isNaN(memberId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const g = await requireGroupAdmin(id, user, res);
    if (!g) return;
    if (action === "approved") {
      const counts = await approvedCounts([id]);
      if ((counts.get(id) ?? 0) >= g.maxMembers) {
        res.status(403).json({ error: "This group is full." });
        return;
      }
    }
    await db
      .update(soloGroupMembersTable)
      .set({ status: action, joinedAt: action === "approved" ? new Date() : null })
      .where(
        and(
          eq(soloGroupMembersTable.id, memberId),
          eq(soloGroupMembersTable.groupId, id),
          ne(soloGroupMembersTable.role, "admin"),
        ),
      );
    res.json({ ok: true });
  };
}

router.post("/solo-connect/groups/:id/members/:memberId/approve", memberAction("approved"));
router.post("/solo-connect/groups/:id/members/:memberId/reject", memberAction("rejected"));
router.post("/solo-connect/groups/:id/members/:memberId/remove", memberAction("removed"));

function groupStateAction(next: "locked" | "closed") {
  return async (req: Parameters<typeof loadUserFromRequest>[0] & { params: Record<string, string> }, res: Response) => {
    const user = await requireApproved(req, res);
    if (!user) return;
    const id = parseInt(req.params["id"]!, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const g = await requireGroupAdmin(id, user, res);
    if (!g) return;
    await db.update(soloGroupsTable).set({ status: next }).where(eq(soloGroupsTable.id, id));
    res.json({ ok: true, status: next });
  };
}

router.post("/solo-connect/groups/:id/lock", groupStateAction("locked"));
router.post("/solo-connect/groups/:id/close", groupStateAction("closed"));

// ─── Group chat (temporary; purged daily at 3 AM) ────────────────────────────

// Returns true when the user may read/post in the group's chat: an approved
// member, the group admin, or a platform admin.
async function canChat(groupId: number, user: AuthUser): Promise<boolean> {
  if (user.role === "admin") return true;
  const rows = await db
    .select({ status: soloGroupMembersTable.status })
    .from(soloGroupMembersTable)
    .where(and(eq(soloGroupMembersTable.groupId, groupId), eq(soloGroupMembersTable.userId, user.id)))
    .limit(1);
  return rows[0]?.status === "approved";
}

router.get("/solo-connect/groups/:id/messages", async (req, res) => {
  const user = await requireApproved(req, res);
  if (!user) return;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!(await canChat(id, user))) {
    res.status(403).json({ error: "Join this group to view its chat." });
    return;
  }
  const rows = await db
    .select({
      id: soloGroupMessagesTable.id,
      groupId: soloGroupMessagesTable.groupId,
      userId: soloGroupMessagesTable.userId,
      userName: usersTable.name,
      body: soloGroupMessagesTable.body,
      createdAt: soloGroupMessagesTable.createdAt,
    })
    .from(soloGroupMessagesTable)
    .leftJoin(usersTable, eq(usersTable.id, soloGroupMessagesTable.userId))
    .where(eq(soloGroupMessagesTable.groupId, id))
    .orderBy(soloGroupMessagesTable.id);
  res.json(
    rows.map((m) => ({
      id: m.id,
      groupId: m.groupId,
      userId: m.userId,
      userName: m.userName ?? "",
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      isMine: m.userId === user.id,
    })),
  );
});

const MessageBody = z.object({ body: z.string().min(1).max(1000) });

router.post("/solo-connect/groups/:id/messages", async (req, res) => {
  const user = await requireApproved(req, res);
  if (!user) return;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!(await canChat(id, user))) {
    res.status(403).json({ error: "Join this group to chat." });
    return;
  }
  const parsed = MessageBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const inserted = await db
    .insert(soloGroupMessagesTable)
    .values({ groupId: id, userId: user.id, body: parsed.data.body.trim() })
    .returning();
  const m = inserted[0]!;
  res.json({
    id: m.id,
    groupId: m.groupId,
    userId: m.userId,
    userName: user.name,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    isMine: true,
  });
});

// ─── Admin: group monitoring ─────────────────────────────────────────────────

// List all groups (any gender, any city) with creator info + member counts.
router.get("/admin/solo-connect/groups", requireAuth(["admin"]), async (_req, res) => {
  const groups = await db.select().from(soloGroupsTable).orderBy(desc(soloGroupsTable.createdAt));
  if (groups.length === 0) {
    res.json([]);
    return;
  }
  const groupIds = groups.map((g) => g.id);
  const adminUserIds = [...new Set(groups.map((g) => g.adminUserId))];

  const creators = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(inArray(usersTable.id, adminUserIds));
  const creatorMap = new Map(creators.map((c) => [c.id, c]));

  const allMembers = await db
    .select({ groupId: soloGroupMembersTable.groupId, status: soloGroupMembersTable.status })
    .from(soloGroupMembersTable)
    .where(inArray(soloGroupMembersTable.groupId, groupIds));

  const stats = new Map<number, { approved: number; pending: number; total: number }>();
  for (const m of allMembers) {
    const s = stats.get(m.groupId) ?? { approved: 0, pending: 0, total: 0 };
    s.total++;
    if (m.status === "approved") s.approved++;
    if (m.status === "requested") s.pending++;
    stats.set(m.groupId, s);
  }

  res.json(
    groups.map((g) => ({
      ...groupToPublic(g, stats.get(g.id)?.approved ?? 0, null, false),
      creatorName: creatorMap.get(g.adminUserId)?.name ?? "",
      creatorEmail: creatorMap.get(g.adminUserId)?.email ?? "",
      pendingCount: stats.get(g.id)?.pending ?? 0,
      totalMemberCount: stats.get(g.id)?.total ?? 0,
    })),
  );
});

// Get all members of a group with email + verified phone (admin, no city/gender gate).
router.get("/admin/solo-connect/groups/:id/members", requireAuth(["admin"]), async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const members = await db
    .select({
      id: soloGroupMembersTable.id,
      groupId: soloGroupMembersTable.groupId,
      userId: soloGroupMembersTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
      phone: soloConnectVerificationsTable.phone,
      phoneVerified: soloConnectVerificationsTable.phoneVerified,
      role: soloGroupMembersTable.role,
      status: soloGroupMembersTable.status,
      joinedAt: soloGroupMembersTable.joinedAt,
      createdAt: soloGroupMembersTable.createdAt,
    })
    .from(soloGroupMembersTable)
    .leftJoin(usersTable, eq(usersTable.id, soloGroupMembersTable.userId))
    .leftJoin(soloConnectVerificationsTable, eq(soloConnectVerificationsTable.userId, soloGroupMembersTable.userId))
    .where(eq(soloGroupMembersTable.groupId, id))
    .orderBy(soloGroupMembersTable.id);
  res.json(
    members.map((m) => ({
      id: m.id,
      groupId: m.groupId,
      userId: m.userId,
      userName: m.userName ?? "",
      userEmail: m.userEmail ?? "",
      phone: m.phone ?? "",
      phoneVerified: m.phoneVerified ?? false,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  );
});

// Read chat messages for any group (admin — no membership check).
router.get("/admin/solo-connect/groups/:id/messages", requireAuth(["admin"]), async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db
    .select({
      id: soloGroupMessagesTable.id,
      groupId: soloGroupMessagesTable.groupId,
      userId: soloGroupMessagesTable.userId,
      userName: usersTable.name,
      body: soloGroupMessagesTable.body,
      createdAt: soloGroupMessagesTable.createdAt,
    })
    .from(soloGroupMessagesTable)
    .leftJoin(usersTable, eq(usersTable.id, soloGroupMessagesTable.userId))
    .where(eq(soloGroupMessagesTable.groupId, id))
    .orderBy(soloGroupMessagesTable.id);
  res.json(
    rows.map((m) => ({
      id: m.id,
      groupId: m.groupId,
      userId: m.userId,
      userName: m.userName ?? "",
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  );
});

// Force-close any group.
router.post("/admin/solo-connect/groups/:id/close", requireAuth(["admin"]), async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.update(soloGroupsTable).set({ status: "closed" }).where(eq(soloGroupsTable.id, id));
  res.json({ ok: true });
});

// Hard-delete a group and its members + messages.
router.delete("/admin/solo-connect/groups/:id", requireAuth(["admin"]), async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(soloGroupMessagesTable).where(eq(soloGroupMessagesTable.groupId, id));
  await db.delete(soloGroupMembersTable).where(eq(soloGroupMembersTable.groupId, id));
  await db.delete(soloGroupsTable).where(eq(soloGroupsTable.id, id));
  res.json({ ok: true });
});

// Remove any member from any group (admin — no group-admin check).
router.post("/admin/solo-connect/groups/:id/members/:memberId/remove", requireAuth(["admin"]), async (req, res) => {
  const groupId = parseInt(String(req.params["id"]), 10);
  const memberId = parseInt(String(req.params["memberId"]), 10);
  if (Number.isNaN(groupId) || Number.isNaN(memberId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .update(soloGroupMembersTable)
    .set({ status: "removed" })
    .where(and(eq(soloGroupMembersTable.id, memberId), eq(soloGroupMembersTable.groupId, groupId)));
  res.json({ ok: true });
});

export default router;
