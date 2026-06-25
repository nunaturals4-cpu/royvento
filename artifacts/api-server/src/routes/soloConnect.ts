import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { randomBytes } from "crypto";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import {
  db,
  usersTable,
  soloConnectVerificationsTable,
  soloGroupsTable,
  soloGroupMembersTable,
  soloGroupMessagesTable,
  soloReportsTable,
  soloModerationActionsTable,
  soloDeletedGroupsLogTable,
} from "@workspace/db";
import { eq, and, desc, inArray, ne, sql, isNull, count } from "drizzle-orm";
import { z } from "zod";
import {
  requireAuth,
  loadUserFromRequest,
  type AuthedRequest,
  type AuthUser,
} from "../lib/auth";
import { respondInvalid } from "../lib/validationError";
import { getSoloAccess } from "../lib/soloConnect";
import {
  verifyFirebaseIdToken,
  PhoneVerificationError,
  firebaseConfigured,
} from "../lib/firebaseAuth";
import { createUserNotification } from "../lib/notify";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const norm = (s: string) => s.trim().toLowerCase();

// Unguessable token embedded in a host's share link. Joining a PRIVATE group
// requires presenting this exact token (?invite=…). 32 hex chars.
function genInviteToken(): string {
  return randomBytes(16).toString("hex");
}

// The consent text version the user acknowledges at onboarding. Bump when the
// legal copy (Terms / Community Guidelines / risk disclaimer) materially changes.
export const SOLO_CONSENT_VERSION = "2026-06-v1";

// Per-user limiter for phone-verify (anti-spam on top of Firebase's own limits).
const phoneVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const u = (req as AuthedRequest).user;
    return u ? `user:${u.id}` : ipKeyGenerator(req.ip ?? "");
  },
  message: { error: "Too many verification attempts — please wait a minute." },
});

// Limiter for report submissions — prevents report-spam flooding the queue.
const reportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const u = (req as AuthedRequest).user;
    return u ? `user:${u.id}` : ipKeyGenerator(req.ip ?? "");
  },
  message: { error: "Too many reports submitted — please try again later." },
});

// Accept only relative object paths produced by our signed-upload flow — never
// an arbitrary external URL (prevents storing attacker-controlled links).
// Handles every form the client may pass: the raw objectPath
// (/objects/uploads/<uuid>), the served path (/api/storage/objects/uploads/…),
// or a bare uploads/<uuid>.
function isUploadPath(url: string): boolean {
  return /^\/?(api\/)?(storage\/)?objects\/uploads\/[\w./-]+$/.test(url) || /^uploads\/[\w./-]+$/.test(url);
}

// Reduce any accepted upload reference to the canonical object-storage path
// "/objects/uploads/<rest>" used by ObjectStorageService.getObjectEntityFile.
function toObjectPath(url: string): string | null {
  const m = url.match(/uploads\/([\w./-]+)$/);
  return m ? `/objects/uploads/${m[1]}` : null;
}

// Strip server-only secret columns before sending a verification row to clients.
// Note `selfieUrl` is returned only as a relative object path; the bytes are
// served through the auth-gated /solo-connect/verification/selfie endpoint.
function verificationToPublic(v: typeof soloConnectVerificationsTable.$inferSelect) {
  return {
    id: v.id,
    userId: v.userId,
    selfieUrl: v.selfieUrl,
    phone: v.phone,
    phoneVerified: v.phoneVerified,
    consentAcceptedAt: v.consentAcceptedAt ? v.consentAcceptedAt.toISOString() : null,
    consentVersion: v.consentVersion,
    suspendedUntil: v.suspendedUntil ? v.suspendedUntil.toISOString() : null,
    banned: v.banned,
    status: v.status,
    rejectionReason: v.rejectionReason,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

// True when this user is currently blocked from Solo Connector participation by
// a moderation action (banned, or within an active suspension window).
function isModerationBlocked(v: { banned: boolean; suspendedUntil: Date | null } | undefined): {
  blocked: boolean;
  reason?: string;
} {
  if (!v) return { blocked: false };
  if (v.banned) return { blocked: true, reason: "Your Solo Connector access has been banned." };
  if (v.suspendedUntil && v.suspendedUntil.getTime() > Date.now()) {
    return {
      blocked: true,
      reason: `Your Solo Connector access is suspended until ${v.suspendedUntil.toISOString()}.`,
    };
  }
  return { blocked: false };
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

// Eligible AND verification-approved AND not moderation-blocked — required to
// create/join/view groups, chat, and report. Gender is captured at onboarding
// but is NOT a participation gate (groups are no longer gender-restricted).
async function requireApproved(
  req: Parameters<typeof loadUserFromRequest>[0],
  res: Response,
): Promise<AuthUser | null> {
  const user = await requireEligible(req, res);
  if (!user) return null;
  // Admins never need verification — they moderate Solo Connector.
  if (user.role !== "admin") {
    const rows = await db
      .select({
        status: soloConnectVerificationsTable.status,
        banned: soloConnectVerificationsTable.banned,
        suspendedUntil: soloConnectVerificationsTable.suspendedUntil,
      })
      .from(soloConnectVerificationsTable)
      .where(eq(soloConnectVerificationsTable.userId, user.id))
      .limit(1);
    if (rows[0]?.status !== "approved") {
      res.status(403).json({ error: "Verification required before joining groups." });
      return null;
    }
    const block = isModerationBlocked(rows[0]);
    if (block.blocked) {
      res.status(403).json({ error: block.reason });
      return null;
    }
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
//   party       → user's own party — no fixed catalog, venue is always a
//                 free-typed custom name (a home, rooftop, rented room…)
// `kind` tells the client which id to link on the group (vendorId / eventId);
// games have no group FK column, so they're stored by name only.
router.get("/solo-connect/venues", async (req, res) => {
  const user = await requireEligible(req, res);
  if (!user) return;
  const at = String(req.query["activityType"] ?? "nightlife");
  if (at === "party") {
    // No venue catalog for self-organized parties — always a custom name.
    res.json([]);
    return;
  }
  let result;
  switch (at) {
    case "happy_hours":
      result = await db.execute(sql`
        SELECT DISTINCT v.id, v.business_name AS name, v.location AS sub, 'vendor' AS kind
        FROM vendors v JOIN drink_plans dp ON dp.vendor_id = v.id
        WHERE v.status = 'approved' AND v.hidden = false
        ORDER BY name LIMIT 100`);
      break;
    case "food_drinks":
      result = await db.execute(sql`
        SELECT DISTINCT v.id, v.business_name AS name, v.location AS sub, 'vendor' AS kind
        FROM vendors v JOIN vendor_offers vo ON vo.vendor_id = v.id AND vo.active = true
        WHERE v.status = 'approved' AND v.hidden = false
        ORDER BY name LIMIT 100`);
      break;
    case "events":
    case "activities":
      result = await db.execute(sql`
        SELECT id, title AS name, location AS sub, 'event' AS kind
        FROM events e WHERE approval_status = 'approved' AND e.hidden = false
          AND EXISTS (SELECT 1 FROM vendors v WHERE v.id = e.vendor_id AND v.status = 'approved' AND v.hidden = false)
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
        FROM vendors WHERE status = 'approved' AND hidden = false
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

// Expose whether real Firebase is configured so the client knows whether to run
// the live OTP flow or the local dev-stub flow.
router.get("/solo-connect/phone/config", async (req, res) => {
  const user = await requireEligible(req, res);
  if (!user) return;
  res.json({ firebaseConfigured });
});

const PhoneVerifyBody = z.object({ idToken: z.string().min(1).max(8000) });

// Step 1–2 of onboarding: the client completes Firebase Phone Auth (or the dev
// stub) and posts the resulting ID token. We verify it server-side, read the
// phone FROM THE VERIFIED TOKEN, enforce one-account-per-phone, and mark the
// user's verification row phone-verified (creating a draft row if needed).
router.post("/solo-connect/phone/verify", phoneVerifyLimiter, async (req, res) => {
  const user = await requireEligible(req, res);
  if (!user) return;
  const parsed = PhoneVerifyBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  let verified;
  try {
    verified = await verifyFirebaseIdToken(parsed.data.idToken);
  } catch (err) {
    const msg = err instanceof PhoneVerificationError ? err.message : "Phone verification failed.";
    res.status(400).json({ error: msg });
    return;
  }

  // One account per verified phone (anti-duplicate). Also protected by a partial
  // unique index, but checked here for a friendly error.
  const clash = await db
    .select({ userId: soloConnectVerificationsTable.userId })
    .from(soloConnectVerificationsTable)
    .where(eq(soloConnectVerificationsTable.phone, verified.phoneNumber))
    .limit(1);
  if (clash[0] && clash[0].userId !== user.id) {
    res.status(409).json({ error: "This phone number is already linked to another account." });
    return;
  }

  const existing = await db
    .select()
    .from(soloConnectVerificationsTable)
    .where(eq(soloConnectVerificationsTable.userId, user.id))
    .limit(1);

  // Keep an already-approved user approved; otherwise this is onboarding (draft).
  const nextStatus = existing[0]?.status === "approved" ? "approved" : "draft";
  if (existing[0]) {
    await db
      .update(soloConnectVerificationsTable)
      .set({
        phone: verified.phoneNumber,
        firebaseUid: verified.uid,
        phoneVerified: true,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(soloConnectVerificationsTable.id, existing[0].id));
  } else {
    await db.insert(soloConnectVerificationsTable).values({
      userId: user.id,
      phone: verified.phoneNumber,
      firebaseUid: verified.uid,
      phoneVerified: true,
      status: "draft",
    });
  }
  const rows = await db
    .select()
    .from(soloConnectVerificationsTable)
    .where(eq(soloConnectVerificationsTable.userId, user.id))
    .limit(1);
  res.json(verificationToPublic(rows[0]!));
});

const SubmitBody = z.object({
  selfieUrl: z.string().min(1).max(500),
  gender: z.enum(["male", "female", "prefer_not_to_say"]),
  consent: z.literal(true),
});

// Step 3–5: capture the live selfie reference + gender + explicit consent, then
// flip the verification to `pending` for admin review. Requires a phone-verified
// draft row to exist first.
router.post("/solo-connect/verification/submit", async (req, res) => {
  const user = await requireEligible(req, res);
  if (!user) return;
  const parsed = SubmitBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const { selfieUrl, gender } = parsed.data;
  if (!isUploadPath(selfieUrl)) {
    res.status(400).json({ error: "Invalid selfie reference." });
    return;
  }
  const rows = await db
    .select()
    .from(soloConnectVerificationsTable)
    .where(eq(soloConnectVerificationsTable.userId, user.id))
    .limit(1);
  const ver = rows[0];
  if (!ver || !ver.phoneVerified) {
    res.status(400).json({ error: "Verify your phone number first." });
    return;
  }

  // Persist gender on the user record so it drives group member counts.
  await db
    .update(usersTable)
    .set({ gender, genderCompleted: true })
    .where(eq(usersTable.id, user.id));

  await db
    .update(soloConnectVerificationsTable)
    .set({
      selfieUrl,
      consentAcceptedAt: new Date(),
      consentVersion: SOLO_CONSENT_VERSION,
      status: "pending",
      rejectionReason: "",
      updatedAt: new Date(),
    })
    .where(eq(soloConnectVerificationsTable.id, ver.id));

  createUserNotification({
    userId: user.id,
    title: "Verification submitted",
    message: "Your Solo Connector verification is under review. We'll notify you once it's decided.",
    url: "/solo-connect",
    tag: "solo-verification",
  }).catch(() => {});

  const updated = await db
    .select()
    .from(soloConnectVerificationsTable)
    .where(eq(soloConnectVerificationsTable.id, ver.id))
    .limit(1);
  res.json(verificationToPublic(updated[0]!));
});

// Auth-gated selfie stream — owner or admin only. Selfies are NOT served from
// the public /storage/objects path; this proxies the bytes after an ACL check.
router.get("/solo-connect/verification/selfie/:userId", async (req: Request, res: Response) => {
  const me = await loadUserFromRequest(req);
  if (!me) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = parseInt(String(req.params["userId"]), 10);
  if (Number.isNaN(userId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (me.role !== "admin" && me.id !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rows = await db
    .select({ selfieUrl: soloConnectVerificationsTable.selfieUrl })
    .from(soloConnectVerificationsTable)
    .where(eq(soloConnectVerificationsTable.userId, userId))
    .limit(1);
  const objectPath = rows[0]?.selfieUrl ? toObjectPath(rows[0].selfieUrl) : null;
  if (!objectPath) {
    res.status(404).json({ error: "No selfie on file" });
    return;
  }
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    // Never let a private selfie be cached by shared proxies.
    res.setHeader("Cache-Control", "private, no-store");
    if (response.body) {
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Selfie not found" });
      return;
    }
    req.log.error({ err }, "Failed to stream Solo Connector selfie");
    res.status(500).json({ error: "Failed to load selfie" });
  }
});

// Admin: list verifications. Defaults to the review queue (pending first) but
// supports ?status= and ?q= (name/email/phone search) for the full history view.
router.get("/admin/solo-connect/verifications", requireAuth(["admin"]), async (req, res) => {
  const statusFilter = typeof req.query["status"] === "string" ? req.query["status"] : "";
  const q = (typeof req.query["q"] === "string" ? req.query["q"] : "").trim().toLowerCase();
  const rows = await db
    .select({
      id: soloConnectVerificationsTable.id,
      userId: soloConnectVerificationsTable.userId,
      selfieUrl: soloConnectVerificationsTable.selfieUrl,
      phone: soloConnectVerificationsTable.phone,
      phoneVerified: soloConnectVerificationsTable.phoneVerified,
      consentAcceptedAt: soloConnectVerificationsTable.consentAcceptedAt,
      consentVersion: soloConnectVerificationsTable.consentVersion,
      suspendedUntil: soloConnectVerificationsTable.suspendedUntil,
      banned: soloConnectVerificationsTable.banned,
      status: soloConnectVerificationsTable.status,
      rejectionReason: soloConnectVerificationsTable.rejectionReason,
      createdAt: soloConnectVerificationsTable.createdAt,
      updatedAt: soloConnectVerificationsTable.updatedAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
      gender: usersTable.gender,
    })
    .from(soloConnectVerificationsTable)
    .leftJoin(usersTable, eq(usersTable.id, soloConnectVerificationsTable.userId))
    .orderBy(desc(soloConnectVerificationsTable.updatedAt));
  let filtered = rows;
  if (statusFilter) filtered = filtered.filter((r) => r.status === statusFilter);
  if (q) {
    filtered = filtered.filter(
      (r) =>
        (r.userName ?? "").toLowerCase().includes(q) ||
        (r.userEmail ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q),
    );
  }
  // Pending first so the admin sees what needs action at the top.
  const order: Record<string, number> = { pending: 0, draft: 1, approved: 2, rejected: 3 };
  filtered.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  res.json(
    filtered.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName ?? "",
      userEmail: r.userEmail ?? "",
      gender: r.gender ?? null,
      selfieUrl: r.selfieUrl,
      // Auth-gated stream the admin UI loads instead of the raw object path.
      selfieStreamUrl: r.selfieUrl ? `/api/solo-connect/verification/selfie/${r.userId}` : "",
      phone: r.phone,
      phoneVerified: r.phoneVerified,
      consentAcceptedAt: r.consentAcceptedAt ? r.consentAcceptedAt.toISOString() : null,
      consentVersion: r.consentVersion,
      suspendedUntil: r.suspendedUntil ? r.suspendedUntil.toISOString() : null,
      banned: r.banned,
      status: r.status,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  );
});

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
  // Notify the applicant of the decision (in-app + web + mobile push).
  if (parsed.data.decision === "approved") {
    createUserNotification({
      userId: rows[0].userId,
      title: "Verification approved 🎉",
      message: "You're verified for Solo Connector. You can now join and create groups.",
      url: "/solo-connect",
      tag: "solo-verification",
    }).catch(() => {});
  } else {
    createUserNotification({
      userId: rows[0].userId,
      title: "Verification not approved",
      message: parsed.data.rejectionReason
        ? `Your Solo Connector verification was rejected: ${parsed.data.rejectionReason}`
        : "Your Solo Connector verification was not approved. You can re-submit from the Solo Connector page.",
      url: "/solo-connect",
      tag: "solo-verification",
    }).catch(() => {});
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

export interface GroupCounts {
  total: number;
  men: number;
  women: number;
  other: number;
}

const emptyCounts = (): GroupCounts => ({ total: 0, men: 0, women: 0, other: 0 });

// Approved-member counts per group, broken down by the member's onboarding
// gender (joined from users.gender) — powers the 👨/👩/total group-card stats.
async function memberCounts(groupIds: number[]): Promise<Map<number, GroupCounts>> {
  const map = new Map<number, GroupCounts>();
  if (groupIds.length === 0) return map;
  const rows = await db
    .select({ groupId: soloGroupMembersTable.groupId, gender: usersTable.gender })
    .from(soloGroupMembersTable)
    .leftJoin(usersTable, eq(usersTable.id, soloGroupMembersTable.userId))
    .where(
      and(
        inArray(soloGroupMembersTable.groupId, groupIds),
        eq(soloGroupMembersTable.status, "approved"),
      ),
    );
  for (const r of rows) {
    const c = map.get(r.groupId) ?? emptyCounts();
    c.total++;
    if (r.gender === "male") c.men++;
    else if (r.gender === "female") c.women++;
    else c.other++;
    map.set(r.groupId, c);
  }
  return map;
}

function groupToPublic(
  g: typeof soloGroupsTable.$inferSelect,
  counts: GroupCounts,
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
    // Non-gating vibe label now (male | female | mixed).
    genderType: g.genderType,
    visibility: g.visibility,
    // Join gate for private groups — only ever revealed to the group admin
    // (who builds the share link). "" for everyone else.
    inviteToken: isAdmin ? g.inviteToken : "",
    status: g.status,
    reputationScore: g.reputationScore,
    ratingCount: g.ratingCount,
    createdAt: g.createdAt.toISOString(),
    lastActivityAt: g.lastActivityAt ? g.lastActivityAt.toISOString() : null,
    // "Create Your Own Party" fields (empty/zero/null for non-party groups).
    coverImageUrl: g.coverImageUrl,
    address: g.address,
    pinCode: g.pinCode,
    mapLocation: g.mapLocation,
    organizerName: g.organizerName,
    endTime: g.endTime,
    ticketType: g.ticketType,
    ticketPrice: g.ticketPrice,
    capacity: g.capacity,
    // Real member-gender breakdown for the card.
    memberCount: counts.total,
    menCount: counts.men,
    womenCount: counts.women,
    otherCount: counts.other,
    myMembershipStatus: myStatus,
    isAdmin,
  };
}

// Bump a group's activity clock so the inactivity job leaves it alone. Also
// clears any pending expiry warning since the group is alive again.
async function touchGroupActivity(groupId: number): Promise<void> {
  await db
    .update(soloGroupsTable)
    .set({ lastActivityAt: new Date(), expiryWarnedAt: null })
    .where(eq(soloGroupsTable.id, groupId));
}

// List groups in the caller's current city. Gender is NO LONGER a filter —
// both genders may see/join any group. City is REQUIRED and validated on every
// request so users can never browse other-city groups. Soft-deleted groups
// (deletedAt set) are excluded.
router.get("/solo-connect/groups", async (req, res) => {
  // Public browse: logged-out and non-premium visitors can SEE every group in a
  // city. The premium + verified gate only applies when they try to join/create
  // (enforced by requireApproved on those endpoints). Membership/admin flags are
  // populated only when the caller is authenticated.
  const user = await loadUserFromRequest(req);
  const city = typeof req.query["city"] === "string" ? req.query["city"] : "";
  const state = typeof req.query["state"] === "string" ? req.query["state"] : "";
  const activityType = typeof req.query["activityType"] === "string" ? req.query["activityType"] : "";
  if (!city.trim() && !state.trim()) {
    res.status(400).json({ error: "Your current city or state is required to view groups." });
    return;
  }
  const all = await db
    .select()
    .from(soloGroupsTable)
    .where(and(ne(soloGroupsTable.status, "closed"), isNull(soloGroupsTable.deletedAt)))
    .orderBy(desc(soloGroupsTable.createdAt));
  // When a state is supplied, show every group across that state; otherwise fall
  // back to the original same-city scope. Optional activity filter on top.
  const filtered = all.filter(
    (g) =>
      (state.trim() ? norm(g.state) === norm(state) : norm(g.city) === norm(city)) &&
      (!activityType || g.activityType === activityType),
  );
  const counts = await memberCounts(filtered.map((g) => g.id));
  const myMap = new Map<number, string>();
  if (user) {
    const myMemberships = await db
      .select({ groupId: soloGroupMembersTable.groupId, status: soloGroupMembersTable.status })
      .from(soloGroupMembersTable)
      .where(eq(soloGroupMembersTable.userId, user.id));
    for (const m of myMemberships) myMap.set(m.groupId, m.status);
  }
  res.json(
    filtered.map((g) =>
      groupToPublic(g, counts.get(g.id) ?? emptyCounts(), myMap.get(g.id) ?? null, !!user && g.adminUserId === user.id),
    ),
  );
});

const CreateGroupBody = z
  .object({
    name: z.string().min(3).max(160),
    activityType: z.enum(["nightlife", "events", "games", "activities", "happy_hours", "food_drinks", "party"]),
    activityLabel: z.string().max(160).optional(),
    venueName: z.string().max(255).optional(),
    vendorId: z.number().int().optional(),
    eventId: z.number().int().optional(),
    groupDate: z.string().optional(),
    startTime: z.string().max(8).optional(),
    description: z.string().max(2000).optional(),
    // Optional: required for non-party groups, derived from capacity for parties.
    maxMembers: z.number().int().min(3).max(15).optional(),
    visibility: z.enum(["public", "private"]).optional(),
    // Non-gating vibe label chosen by the creator (defaults to mixed).
    genderType: z.enum(["male", "female", "mixed"]).optional(),
    country: z.string().optional(),
    state: z.string().optional(),
    city: z.string().min(1),
    // ── "Create Your Own Party" fields (required when activityType==='party') ──
    coverImageUrl: z.string().max(500).optional(),
    address: z.string().max(500).optional(),
    pinCode: z.string().max(12).optional(),
    mapLocation: z.string().max(500).optional(),
    organizerName: z.string().max(120).optional(),
    endTime: z.string().max(8).optional(),
    ticketType: z.enum(["free", "paid"]).optional(),
    ticketPrice: z.number().min(0).max(1_000_000).optional(),
    capacity: z.number().int().min(1).max(100_000).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.activityType === "party") {
      // Every party field is mandatory per the create-party workflow.
      const req = (cond: boolean, path: string, message: string) => {
        if (!cond) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      };
      req(!!d.coverImageUrl, "coverImageUrl", "Please upload a party cover photo.");
      req(!!d.venueName, "venueName", "Please enter the venue name.");
      req(!!d.address, "address", "Please enter the full address.");
      req(!!d.city, "city", "Please enter the city.");
      req(!!d.pinCode, "pinCode", "Please enter the pin code.");
      // mapLocation (Google Maps) is optional.
      req(!!d.organizerName, "organizerName", "Please enter the organizer name.");
      req(!!d.groupDate, "groupDate", "Please select the party date.");
      req(!!d.startTime, "startTime", "Please select the start time.");
      req(!!d.endTime, "endTime", "Please select the end time.");
      req(d.ticketType === "free" || d.ticketType === "paid", "ticketType", "Please choose Free or Paid ticket.");
      if (d.ticketType === "paid") {
        req(typeof d.ticketPrice === "number" && d.ticketPrice > 0, "ticketPrice", "Please enter a ticket price.");
        req(typeof d.capacity === "number" && d.capacity > 0, "capacity", "Please enter the total capacity.");
      }
      const desc = d.description?.trim() ?? "";
      req(desc.length >= 50, "description", "Describe your plan so people know what to expect.");
    } else {
      // Standard groups still require the member-cap slider value.
      req_maxMembers(d.maxMembers, ctx);
    }
  });

function req_maxMembers(v: number | undefined, ctx: z.RefinementCtx) {
  if (typeof v !== "number") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxMembers"], message: "maxMembers is required." });
  }
}

// Create a group. genderType is a non-gating vibe label (default mixed); the
// location is taken from the request body (the user's verified location); the
// creator is auto-enrolled as the approved admin member.
router.post("/solo-connect/groups", async (req, res) => {
  const user = await requireApproved(req, res);
  if (!user) return;
  const parsed = CreateGroupBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const d = parsed.data;
  const isParty = d.activityType === "party";
  // Party join-cap comes from the paid capacity (clamped to the column's
  // member model); free parties and standard groups fall back to the slider.
  const maxMembers = isParty
    ? Math.max(3, Math.min(15, d.capacity ?? 15))
    : (d.maxMembers ?? 15);
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
      maxMembers,
      visibility: d.visibility ?? "public",
      country: d.country ?? "India",
      state: d.state ?? "",
      city: d.city,
      genderType: d.genderType ?? "mixed",
      inviteToken: genInviteToken(),
      lastActivityAt: new Date(),
      // Party-specific fields (empty/zero for other activity types).
      coverImageUrl: isParty ? (d.coverImageUrl ?? "") : "",
      address: isParty ? (d.address ?? "") : "",
      pinCode: isParty ? (d.pinCode ?? "") : "",
      mapLocation: isParty ? (d.mapLocation ?? "") : "",
      organizerName: isParty ? (d.organizerName ?? "") : "",
      endTime: isParty ? (d.endTime ?? "") : "",
      ticketType: isParty ? (d.ticketType ?? "") : "",
      ticketPrice: isParty && d.ticketType === "paid" ? String(d.ticketPrice ?? 0) : "0",
      capacity: isParty && d.ticketType === "paid" ? (d.capacity ?? null) : null,
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
  const counts = emptyCounts();
  counts.total = 1;
  if (user.gender === "male") counts.men = 1;
  else if (user.gender === "female") counts.women = 1;
  else counts.other = 1;
  res.json(groupToPublic(group, counts, "approved", true));
});

// Loads a group and enforces caller-city access (gender is no longer a gate).
// Returns null + sends a response when access is denied or the group is gone.
async function loadAccessibleGroup(
  groupId: number,
  callerCity: string,
  res: Response,
): Promise<typeof soloGroupsTable.$inferSelect | null> {
  const rows = await db
    .select()
    .from(soloGroupsTable)
    .where(eq(soloGroupsTable.id, groupId))
    .limit(1);
  const g = rows[0];
  if (!g || g.deletedAt) {
    res.status(404).json({ error: "Group not found" });
    return null;
  }
  if (callerCity && norm(g.city) !== norm(callerCity)) {
    res.status(403).json({ error: "You can only access groups in your current city." });
    return null;
  }
  return g;
}

router.get("/solo-connect/groups/:id", async (req, res) => {
  // Public group profile — viewable by logged-out and non-premium visitors.
  // Joining/chat remain gated; the caller (if any) only drives the membership
  // and admin flags returned below.
  const user = await loadUserFromRequest(req);
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const callerCity = typeof req.query["city"] === "string" ? req.query["city"] : "";
  const g = await loadAccessibleGroup(id, callerCity, res);
  if (!g) return;

  const members = await db
    .select({
      id: soloGroupMembersTable.id,
      groupId: soloGroupMembersTable.groupId,
      userId: soloGroupMembersTable.userId,
      userName: usersTable.name,
      gender: usersTable.gender,
      role: soloGroupMembersTable.role,
      status: soloGroupMembersTable.status,
      joinedAt: soloGroupMembersTable.joinedAt,
      createdAt: soloGroupMembersTable.createdAt,
    })
    .from(soloGroupMembersTable)
    .leftJoin(usersTable, eq(usersTable.id, soloGroupMembersTable.userId))
    .where(eq(soloGroupMembersTable.groupId, id))
    .orderBy(desc(soloGroupMembersTable.id));

  const mine = user ? members.find((m) => m.userId === user.id) : undefined;
  const counts = emptyCounts();
  for (const m of members) {
    if (m.status !== "approved") continue;
    counts.total++;
    if (m.gender === "male") counts.men++;
    else if (m.gender === "female") counts.women++;
    else counts.other++;
  }
  res.json({
    group: groupToPublic(g, counts, mine?.status ?? null, !!user && g.adminUserId === user.id),
    members: members.map((m) => ({
      id: m.id,
      groupId: m.groupId,
      userId: m.userId,
      userName: m.userName ?? "",
      // Expose gender so the client can show a per-member 👨/👩 marker.
      gender: m.gender ?? null,
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
  // Invite token from the host's share link — required to join a PRIVATE group.
  inviteToken: z.string().max(64).optional(),
});

// Request to join. Location is validated on EVERY call (group.city === body.city)
// and gender is enforced via loadAccessibleGroup.
router.post("/solo-connect/groups/:id/join", async (req, res) => {
  const user = await requireApproved(req, res);
  if (!user) return;
  // Every joiner — any role — must have a binary gender on file (it drives the
  // group's 👨/👩 member counts). Already-set gender is reused; otherwise the
  // client collects it first. Safety net behind the frontend's gender prompt.
  if (user.gender !== "male" && user.gender !== "female") {
    res.status(400).json({ error: "Select your gender (male or female) before joining a group.", code: "gender_required" });
    return;
  }
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
  const g = await loadAccessibleGroup(id, parsed.data.city, res);
  if (!g) return;
  if (g.status !== "open") {
    res.status(403).json({ error: "This group is locked or closed." });
    return;
  }
  // Invite gate — a PRIVATE group only admits people who opened the host's
  // share link (carrying the matching invite token). The admin bypasses;
  // public groups have no gate.
  if (
    g.visibility === "private" &&
    g.adminUserId !== user.id &&
    (parsed.data.inviteToken ?? "") !== g.inviteToken
  ) {
    res.status(403).json({
      error: "This is a private group — open the host's invite link to join.",
      code: "invite_required",
    });
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
  const counts = await memberCounts([id]);
  if ((counts.get(id)?.total ?? 0) >= g.maxMembers) {
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
  // A join request keeps the group alive and pings the group admin.
  await touchGroupActivity(id);
  createUserNotification({
    userId: g.adminUserId,
    title: "New join request",
    message: `${user.name} asked to join "${g.name}".`,
    url: "/solo-connect",
    tag: `solo-group-${id}`,
  }).catch(() => {});
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
      const counts = await memberCounts([id]);
      if ((counts.get(id)?.total ?? 0) >= g.maxMembers) {
        res.status(403).json({ error: "This group is full." });
        return;
      }
    }
    // Resolve the affected member's user id (for notifications) before updating.
    const target = await db
      .select({ userId: soloGroupMembersTable.userId })
      .from(soloGroupMembersTable)
      .where(and(eq(soloGroupMembersTable.id, memberId), eq(soloGroupMembersTable.groupId, id)))
      .limit(1);
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
    if (action === "approved") await touchGroupActivity(id);
    const targetUserId = target[0]?.userId;
    if (targetUserId && (action === "approved" || action === "removed")) {
      createUserNotification({
        userId: targetUserId,
        title: action === "approved" ? "You're in!" : "Removed from group",
        message:
          action === "approved"
            ? `You were approved to join "${g.name}".`
            : `You were removed from "${g.name}".`,
        url: "/solo-connect",
        tag: `solo-group-${id}`,
      }).catch(() => {});
    }
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

// Reset the invite link (group admin only) — revokes any previously-shared link.
router.post("/solo-connect/groups/:id/reset-invite", async (req, res) => {
  const user = await requireApproved(req, res);
  if (!user) return;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const g = await requireGroupAdmin(id, user, res);
  if (!g) return;
  const inviteToken = genInviteToken();
  await db.update(soloGroupsTable).set({ inviteToken }).where(eq(soloGroupsTable.id, id));
  res.json({ inviteToken });
});

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
  // Chat activity keeps the group from auto-expiring.
  await touchGroupActivity(id);
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

// List groups with creator info, member counts, and inactivity bookkeeping.
// Excludes soft-deleted groups by default; ?includeDeleted=1 shows them too
// (for the Auto Deletion Logs view); ?inactiveDays=N filters the monitor.
router.get("/admin/solo-connect/groups", requireAuth(["admin"]), async (req, res) => {
  const includeDeleted = req.query["includeDeleted"] === "1";
  const inactiveDays = Number(req.query["inactiveDays"] ?? 0);
  let groups = await db.select().from(soloGroupsTable).orderBy(desc(soloGroupsTable.createdAt));
  if (!includeDeleted) groups = groups.filter((g) => !g.deletedAt);
  if (Number.isFinite(inactiveDays) && inactiveDays > 0) {
    const cutoff = Date.now() - inactiveDays * 24 * 60 * 60 * 1000;
    groups = groups.filter((g) => (g.lastActivityAt?.getTime() ?? 0) <= cutoff);
  }
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
    .select({ groupId: soloGroupMembersTable.groupId, status: soloGroupMembersTable.status, gender: usersTable.gender })
    .from(soloGroupMembersTable)
    .leftJoin(usersTable, eq(usersTable.id, soloGroupMembersTable.userId))
    .where(inArray(soloGroupMembersTable.groupId, groupIds));

  const stats = new Map<number, GroupCounts & { pending: number; allRows: number }>();
  for (const m of allMembers) {
    const s = stats.get(m.groupId) ?? { ...emptyCounts(), pending: 0, allRows: 0 };
    s.allRows++;
    if (m.status === "requested") s.pending++;
    if (m.status === "approved") {
      s.total++;
      if (m.gender === "male") s.men++;
      else if (m.gender === "female") s.women++;
      else s.other++;
    }
    stats.set(m.groupId, s);
  }

  const now = Date.now();
  res.json(
    groups.map((g) => {
      const s = stats.get(g.id);
      const daysSinceActivity = g.lastActivityAt
        ? Math.floor((now - g.lastActivityAt.getTime()) / (24 * 60 * 60 * 1000))
        : null;
      return {
        ...groupToPublic(g, s ?? emptyCounts(), null, false),
        creatorName: creatorMap.get(g.adminUserId)?.name ?? "",
        creatorEmail: creatorMap.get(g.adminUserId)?.email ?? "",
        pendingCount: s?.pending ?? 0,
        totalMemberCount: s?.allRows ?? 0,
        daysSinceActivity,
        expiryWarnedAt: g.expiryWarnedAt ? g.expiryWarnedAt.toISOString() : null,
        deletedAt: g.deletedAt ? g.deletedAt.toISOString() : null,
        deletedReason: g.deletedReason,
      };
    }),
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

// Hard-delete a group and its members + messages + reports.
router.delete("/admin/solo-connect/groups/:id", requireAuth(["admin"]), async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(soloGroupMessagesTable).where(eq(soloGroupMessagesTable.groupId, id));
  await db.delete(soloGroupMembersTable).where(eq(soloGroupMembersTable.groupId, id));
  await db.delete(soloReportsTable).where(eq(soloReportsTable.groupId, id));
  await db.delete(soloGroupsTable).where(eq(soloGroupsTable.id, id));
  res.json({ ok: true });
});

// Admin: reset a group's inactivity clock (manual "extend" from the monitor).
router.post("/admin/solo-connect/groups/:id/extend", requireAuth(["admin"]), async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await touchGroupActivity(id);
  res.json({ ok: true });
});

// ─── Member reporting ────────────────────────────────────────────────────────

const ReportBody = z.object({
  reportedUserId: z.number().int().positive(),
  reason: z.enum([
    "harassment",
    "fake_profile",
    "abuse",
    "spam",
    "inappropriate",
    "safety",
    "other",
  ]),
  description: z.string().max(2000).optional(),
  evidenceUrl: z.string().max(500).optional(),
});

// File a report against another member of a group the caller has joined.
router.post("/solo-connect/groups/:id/report", reportLimiter, async (req, res) => {
  const user = await requireApproved(req, res);
  if (!user) return;
  const groupId = parseInt(String(req.params["id"]), 10);
  if (Number.isNaN(groupId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = ReportBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const { reportedUserId, reason, description, evidenceUrl } = parsed.data;
  if (reportedUserId === user.id) {
    res.status(400).json({ error: "You can't report yourself." });
    return;
  }
  if (evidenceUrl && !isUploadPath(evidenceUrl)) {
    res.status(400).json({ error: "Invalid evidence reference." });
    return;
  }
  // The reporter must be a member of this group, and the reported user too.
  const memberships = await db
    .select({ userId: soloGroupMembersTable.userId, status: soloGroupMembersTable.status })
    .from(soloGroupMembersTable)
    .where(eq(soloGroupMembersTable.groupId, groupId));
  const me = memberships.find((m) => m.userId === user.id);
  const them = memberships.find((m) => m.userId === reportedUserId);
  if (!me || me.status !== "approved") {
    res.status(403).json({ error: "Join this group before reporting a member." });
    return;
  }
  if (!them) {
    res.status(400).json({ error: "That person is not a member of this group." });
    return;
  }

  try {
    await db.insert(soloReportsTable).values({
      reporterUserId: user.id,
      reportedUserId,
      groupId,
      reason,
      description: description ?? "",
      evidenceUrl: evidenceUrl ?? "",
      status: "open",
    });
  } catch (err) {
    // Partial unique index → an open report for this trio already exists.
    if ((err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "You already have an open report against this member." });
      return;
    }
    throw err;
  }

  createUserNotification({
    userId: user.id,
    title: "Report submitted",
    message: "Thanks — our team will review your report and follow up.",
    url: "/solo-connect",
    tag: "solo-report",
  }).catch(() => {});
  res.json({ ok: true });
});

// ─── Admin: reports management + moderation ──────────────────────────────────

// Apply a punitive moderation effect to a user's verification row, creating the
// row if the user never onboarded (so a ban sticks regardless).
async function setModerationState(
  userId: number,
  patch: { suspendedUntil?: Date | null; banned?: boolean },
): Promise<void> {
  const existing = await db
    .select({ id: soloConnectVerificationsTable.id })
    .from(soloConnectVerificationsTable)
    .where(eq(soloConnectVerificationsTable.userId, userId))
    .limit(1);
  if (existing[0]) {
    await db
      .update(soloConnectVerificationsTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(soloConnectVerificationsTable.id, existing[0].id));
  } else {
    await db.insert(soloConnectVerificationsTable).values({ userId, status: "rejected", ...patch });
  }
}

// List reports with reporter/reported/group context + repeat-offender counts.
// Filters: ?status= ?reason= ?q= (name/email search). Paginated via ?limit ?offset.
router.get("/admin/solo-connect/reports", requireAuth(["admin"]), async (req, res) => {
  const statusFilter = typeof req.query["status"] === "string" ? req.query["status"] : "";
  const reasonFilter = typeof req.query["reason"] === "string" ? req.query["reason"] : "";
  const q = (typeof req.query["q"] === "string" ? req.query["q"] : "").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(req.query["limit"] ?? 50), 1), 200);
  const offset = Math.max(Number(req.query["offset"] ?? 0), 0);

  const reporter = { id: usersTable.id, name: usersTable.name, email: usersTable.email };
  const all = await db
    .select({
      id: soloReportsTable.id,
      reporterUserId: soloReportsTable.reporterUserId,
      reportedUserId: soloReportsTable.reportedUserId,
      groupId: soloReportsTable.groupId,
      reason: soloReportsTable.reason,
      description: soloReportsTable.description,
      evidenceUrl: soloReportsTable.evidenceUrl,
      status: soloReportsTable.status,
      actionTaken: soloReportsTable.actionTaken,
      adminNote: soloReportsTable.adminNote,
      reviewedAt: soloReportsTable.reviewedAt,
      createdAt: soloReportsTable.createdAt,
      groupName: soloGroupsTable.name,
    })
    .from(soloReportsTable)
    .leftJoin(soloGroupsTable, eq(soloGroupsTable.id, soloReportsTable.groupId))
    .orderBy(desc(soloReportsTable.createdAt));

  // Resolve reporter + reported user identities in one pass.
  const userIds = [...new Set(all.flatMap((r) => [r.reporterUserId, r.reportedUserId]))];
  const users = userIds.length
    ? await db.select(reporter).from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const uMap = new Map(users.map((u) => [u.id, u]));

  // Repeat-offender: total reports filed against each reported user.
  const offenderIds = [...new Set(all.map((r) => r.reportedUserId))];
  const offenderRows = offenderIds.length
    ? await db
        .select({ uid: soloReportsTable.reportedUserId, c: count() })
        .from(soloReportsTable)
        .where(inArray(soloReportsTable.reportedUserId, offenderIds))
        .groupBy(soloReportsTable.reportedUserId)
    : [];
  const offenderMap = new Map(offenderRows.map((o) => [o.uid, Number(o.c)]));

  let filtered = all;
  if (statusFilter) filtered = filtered.filter((r) => r.status === statusFilter);
  if (reasonFilter) filtered = filtered.filter((r) => r.reason === reasonFilter);
  if (q) {
    filtered = filtered.filter((r) => {
      const rep = uMap.get(r.reporterUserId);
      const tgt = uMap.get(r.reportedUserId);
      return [rep?.name, rep?.email, tgt?.name, tgt?.email]
        .some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }
  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);

  res.json({
    total,
    reports: page.map((r) => ({
      id: r.id,
      reporterUserId: r.reporterUserId,
      reporterName: uMap.get(r.reporterUserId)?.name ?? "",
      reporterEmail: uMap.get(r.reporterUserId)?.email ?? "",
      reportedUserId: r.reportedUserId,
      reportedName: uMap.get(r.reportedUserId)?.name ?? "",
      reportedEmail: uMap.get(r.reportedUserId)?.email ?? "",
      reportCountAgainstReported: offenderMap.get(r.reportedUserId) ?? 0,
      groupId: r.groupId,
      groupName: r.groupName ?? "",
      reason: r.reason,
      description: r.description,
      evidenceUrl: r.evidenceUrl,
      status: r.status,
      actionTaken: r.actionTaken,
      adminNote: r.adminNote,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

const ReportActionBody = z.object({
  action: z.enum(["warn", "suspend", "ban", "remove", "resolve", "reject"]),
  suspendDays: z.number().int().min(1).max(365).optional(),
  note: z.string().max(1000).optional(),
});

router.post("/admin/solo-connect/reports/:id/action", requireAuth(["admin"]), async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = ReportActionBody.safeParse(req.body);
  if (!parsed.success) { respondInvalid(res, parsed.error); return; }
  const { action, suspendDays, note } = parsed.data;
  const admin = (req as AuthedRequest).user;

  const rows = await db.select().from(soloReportsTable).where(eq(soloReportsTable.id, id)).limit(1);
  const report = rows[0];
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }

  // Map the action to a punitive effect + the report's resulting status.
  let nextStatus = "resolved";
  let actionTaken = "none";
  if (action === "warn") {
    actionTaken = "warn";
    createUserNotification({
      userId: report.reportedUserId,
      title: "Warning from Royvento moderation",
      message: note || "A report about your conduct was reviewed. Please follow the Community Guidelines.",
      url: "/community-guidelines",
      tag: "solo-moderation",
    }).catch(() => {});
  } else if (action === "suspend") {
    actionTaken = "suspend";
    const until = new Date(Date.now() + (suspendDays ?? 7) * 24 * 60 * 60 * 1000);
    await setModerationState(report.reportedUserId, { suspendedUntil: until });
    createUserNotification({
      userId: report.reportedUserId,
      title: "Solo Connector access suspended",
      message: `Your access is suspended until ${until.toDateString()}.`,
      url: "/solo-connect",
      tag: "solo-moderation",
    }).catch(() => {});
  } else if (action === "ban") {
    actionTaken = "ban";
    await setModerationState(report.reportedUserId, { banned: true });
    createUserNotification({
      userId: report.reportedUserId,
      title: "Solo Connector access banned",
      message: "Your access to Solo Connector has been permanently revoked.",
      url: "/solo-connect",
      tag: "solo-moderation",
    }).catch(() => {});
  } else if (action === "remove") {
    actionTaken = "remove";
    await db
      .update(soloGroupMembersTable)
      .set({ status: "removed" })
      .where(
        and(
          eq(soloGroupMembersTable.groupId, report.groupId),
          eq(soloGroupMembersTable.userId, report.reportedUserId),
        ),
      );
  } else if (action === "reject") {
    nextStatus = "rejected";
  }

  await db
    .update(soloReportsTable)
    .set({
      status: nextStatus,
      actionTaken,
      adminNote: note ?? report.adminNote,
      reviewedByUserId: admin.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(soloReportsTable.id, id));

  await db.insert(soloModerationActionsTable).values({
    adminUserId: admin.id,
    targetUserId: report.reportedUserId,
    groupId: report.groupId,
    reportId: report.id,
    action,
    note: note ?? "",
  });

  // Tell the reporter the outcome.
  createUserNotification({
    userId: report.reporterUserId,
    title: "Your report was reviewed",
    message:
      nextStatus === "rejected"
        ? "We reviewed your report and took no action."
        : "We reviewed your report and acted on it. Thank you for keeping the community safe.",
    url: "/solo-connect",
    tag: "solo-report",
  }).catch(() => {});

  res.json({ ok: true, status: nextStatus, actionTaken });
});

// Append-only moderation audit feed (most recent first).
router.get("/admin/solo-connect/moderation-actions", requireAuth(["admin"]), async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query["limit"] ?? 100), 1), 500);
  const rows = await db
    .select()
    .from(soloModerationActionsTable)
    .orderBy(desc(soloModerationActionsTable.createdAt))
    .limit(limit);
  const ids = [...new Set(rows.flatMap((r) => [r.adminUserId, r.targetUserId].filter((x): x is number => !!x)))];
  const users = ids.length
    ? await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, ids))
    : [];
  const uMap = new Map(users.map((u) => [u.id, u]));
  res.json(
    rows.map((r) => ({
      id: r.id,
      adminUserId: r.adminUserId,
      adminName: uMap.get(r.adminUserId)?.name ?? "",
      targetUserId: r.targetUserId,
      targetName: r.targetUserId ? uMap.get(r.targetUserId)?.name ?? "" : "",
      groupId: r.groupId,
      reportId: r.reportId,
      action: r.action,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

// ─── Admin: auto-deletion logs + restore ─────────────────────────────────────

router.get("/admin/solo-connect/deleted-groups", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(soloDeletedGroupsLogTable)
    .orderBy(desc(soloDeletedGroupsLogTable.deletedAt))
    .limit(200);
  res.json(
    rows.map((r) => ({
      id: r.id,
      groupId: r.groupId,
      name: r.name,
      memberCount: r.memberCount,
      reason: r.reason,
      deletedAt: r.deletedAt.toISOString(),
      restorableUntil: r.restorableUntil ? r.restorableUntil.toISOString() : null,
      restoredAt: r.restoredAt ? r.restoredAt.toISOString() : null,
      purgedAt: r.purgedAt ? r.purgedAt.toISOString() : null,
      // Convenience flag for the UI's Restore button.
      restorable:
        !r.restoredAt && !r.purgedAt && !!r.restorableUntil && r.restorableUntil.getTime() > Date.now(),
    })),
  );
});

// Restore a soft-deleted group while still inside its grace window.
router.post("/admin/solo-connect/groups/:id/restore", requireAuth(["admin"]), async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const admin = (req as AuthedRequest).user;
  const rows = await db.select().from(soloGroupsTable).where(eq(soloGroupsTable.id, id)).limit(1);
  const g = rows[0];
  if (!g || !g.deletedAt) {
    res.status(404).json({ error: "No deleted group to restore." });
    return;
  }
  const logRows = await db
    .select()
    .from(soloDeletedGroupsLogTable)
    .where(and(eq(soloDeletedGroupsLogTable.groupId, id), isNull(soloDeletedGroupsLogTable.purgedAt), isNull(soloDeletedGroupsLogTable.restoredAt)))
    .orderBy(desc(soloDeletedGroupsLogTable.deletedAt))
    .limit(1);
  const log = logRows[0];
  if (log?.restorableUntil && log.restorableUntil.getTime() < Date.now()) {
    res.status(410).json({ error: "The restore window for this group has passed." });
    return;
  }
  await db
    .update(soloGroupsTable)
    .set({ deletedAt: null, deletedReason: "", lastActivityAt: new Date(), expiryWarnedAt: null })
    .where(eq(soloGroupsTable.id, id));
  if (log) {
    await db
      .update(soloDeletedGroupsLogTable)
      .set({ restoredAt: new Date() })
      .where(eq(soloDeletedGroupsLogTable.id, log.id));
  }
  await db.insert(soloModerationActionsTable).values({
    adminUserId: admin.id,
    groupId: id,
    action: "restore",
    note: "Group restored from auto-deletion.",
  });
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
