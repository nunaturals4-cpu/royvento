import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, vendorManagersTable, vendorsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";

const router: IRouter = Router();

const InviteManagerBody = z.object({
  email: z.string().email("Valid email required"),
});

// ─── Vendor: list their managers ────────────────────────────────────────────

router.get("/partner/managers", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vRows = await db.select().from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
  const vendor = vRows[0];
  if (!vendor) { res.status(403).json({ error: "No partner profile found." }); return; }

  const rows = await db
    .select()
    .from(vendorManagersTable)
    .where(eq(vendorManagersTable.vendorId, vendor.id));

  const managerIds = rows.map((r) => r.managerId).filter((id): id is number => id != null);
  const managerUsers = managerIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
        .from(usersTable)
        .where(inArray(usersTable.id, managerIds))
    : [];

  const uMap = new Map(managerUsers.map((u) => [u.id, u]));

  res.json(rows.map((r) => ({
    id: r.id,
    invitedEmail: r.invitedEmail,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    manager: r.managerId ? (uMap.get(r.managerId) ?? null) : null,
  })));
});

// ─── Vendor: invite a user by email ─────────────────────────────────────────

router.post("/partner/managers/invite", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = InviteManagerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const vRows = await db.select().from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
  const vendor = vRows[0];
  if (!vendor) { res.status(403).json({ error: "No partner profile found." }); return; }

  const email = parsed.data.email.toLowerCase().trim();

  // The invited person must already have a Royvento account
  const inviteeRows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (!inviteeRows[0]) {
    res.status(404).json({ error: "No Royvento account found for that email. They must sign up first." });
    return;
  }
  const inviteeId = inviteeRows[0].id;

  // Can't invite yourself
  if (inviteeId === user.id) {
    res.status(400).json({ error: "You cannot invite yourself as a manager." });
    return;
  }

  const existing = await db.select().from(vendorManagersTable)
    .where(and(eq(vendorManagersTable.vendorId, vendor.id), eq(vendorManagersTable.managerId, inviteeId)))
    .limit(1);
  if (existing.length > 0 && existing[0]!.status !== "rejected") {
    res.status(409).json({ error: "This user has already been invited." });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");

  if (existing.length > 0 && existing[0]!.status === "rejected") {
    // Re-invite after rejection: update in-place
    await db.update(vendorManagersTable)
      .set({ status: "pending", token, createdAt: new Date(), invitedEmail: email })
      .where(eq(vendorManagersTable.id, existing[0]!.id));
  } else {
    // New invitation: managerId is set immediately to the resolved invitee user ID
    await db.insert(vendorManagersTable).values({
      vendorId: vendor.id,
      invitedEmail: email,
      invitedBy: user.id,
      managerId: inviteeId,   // ← stored at invite time for stable identity
      status: "pending",
      token,
    });
  }

  // Create an in-app notification for the invitee
  try {
    await db.insert(notificationsTable).values({
      userId: inviteeId,
      title: "You've been invited as a scanner manager",
      message: `${vendor.businessName} invited you to scan tickets at their venue. Visit your profile to accept or decline.`,
    });
  } catch {
    // Non-fatal
  }

  res.json({ message: "Invitation sent." });
});

// ─── Vendor: remove a manager ─────────────────────────────────────────────

router.delete("/partner/managers/:id", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const vRows = await db.select().from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
  const vendor = vRows[0];
  if (!vendor) { res.status(403).json({ error: "No partner profile found." }); return; }

  const rows = await db.select().from(vendorManagersTable)
    .where(and(eq(vendorManagersTable.id, id), eq(vendorManagersTable.vendorId, vendor.id)))
    .limit(1);
  if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(vendorManagersTable).where(eq(vendorManagersTable.id, id));
  res.json({ message: "Manager removed." });
});

// ─── Invitee: list pending invitations for current user ──────────────────────
// Matches by stable managerId (user ID), not email

router.get("/manager/invitations", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select().from(vendorManagersTable)
    .where(and(eq(vendorManagersTable.managerId, user.id), eq(vendorManagersTable.status, "pending")));

  const vendorIds = rows.map((r) => r.vendorId);
  const vendors = vendorIds.length > 0
    ? await db.select({ id: vendorsTable.id, businessName: vendorsTable.businessName })
        .from(vendorsTable)
        .where(inArray(vendorsTable.id, vendorIds))
    : [];
  const vMap = new Map(vendors.map((v) => [v.id, v]));

  res.json(rows.map((r) => ({
    id: r.id,
    vendorId: r.vendorId,
    vendorName: vMap.get(r.vendorId)?.businessName ?? "A partner",
    createdAt: r.createdAt.toISOString(),
  })));
});

// ─── Invitee: accept an invitation by invitation ID ──────────────────────────
// Authorization: managerId on the row must equal currentUser.id

router.post("/manager/invitations/:id/accept", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid invitation ID" }); return; }

  const rows = await db.select().from(vendorManagersTable)
    .where(and(eq(vendorManagersTable.id, id), eq(vendorManagersTable.status, "pending")))
    .limit(1);
  const inv = rows[0];
  if (!inv) { res.status(404).json({ error: "Invitation not found or already used." }); return; }

  // Authorize by stable user ID stored at invite time
  if (inv.managerId !== user.id) {
    res.status(403).json({ error: "This invitation was not sent to your account." });
    return;
  }

  await db.update(vendorManagersTable)
    .set({ status: "accepted" })
    .where(eq(vendorManagersTable.id, inv.id));

  res.json({ message: "You are now a manager for this venue." });
});

// ─── Invitee: reject an invitation by invitation ID ──────────────────────────

router.post("/manager/invitations/:id/reject", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid invitation ID" }); return; }

  const rows = await db.select().from(vendorManagersTable)
    .where(and(eq(vendorManagersTable.id, id), eq(vendorManagersTable.status, "pending")))
    .limit(1);
  const inv = rows[0];
  if (!inv) { res.status(404).json({ error: "Invitation not found or already used." }); return; }

  // Authorize by stable user ID stored at invite time
  if (inv.managerId !== user.id) {
    res.status(403).json({ error: "This invitation was not sent to your account." });
    return;
  }

  await db.update(vendorManagersTable)
    .set({ status: "rejected" })
    .where(eq(vendorManagersTable.id, inv.id));

  res.json({ message: "Invitation declined." });
});

// ─── Invitee: list venues they manage (accepted relationships) ───────────────

router.get("/manager/my-vendors", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select().from(vendorManagersTable)
    .where(and(eq(vendorManagersTable.managerId, user.id), eq(vendorManagersTable.status, "accepted")));

  const vendorIds = rows.map((r) => r.vendorId);
  if (vendorIds.length === 0) { res.json([]); return; }

  const vendors = await db.select({ id: vendorsTable.id, businessName: vendorsTable.businessName })
    .from(vendorsTable)
    .where(inArray(vendorsTable.id, vendorIds));

  res.json(vendors.map((v) => ({ id: v.id, businessName: v.businessName })));
});

export default router;
