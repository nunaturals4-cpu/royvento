import { Router, type IRouter } from "express";
import { db, usersTable, referralsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  hashPassword,
  comparePassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  loadUserFromRequest,
  userToPublic,
  type Role,
} from "../lib/auth";

const router: IRouter = Router();

function genReferralCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

const RegisterBodyExt = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(["user", "vendor", "admin"]).optional(),
  phone: z.string().optional().default(""),
  referralCode: z.string().optional().default(""),
});

const LoginBodyExt = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/auth/register", async (req, res) => {
  const parsed = RegisterBodyExt.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error });
    return;
  }
  const { email, password, name, role, phone, referralCode } = parsed.data;
  const safeRole: Role = role === "vendor" || role === "admin" ? role : "user";

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existing[0]) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  // Resolve referrer if code provided
  let referredBy: number | null = null;
  if (referralCode) {
    const refUsers = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.referralCode, referralCode.trim().toUpperCase()))
      .limit(1);
    referredBy = refUsers[0]?.id ?? null;
  }

  // Generate a unique referralCode
  let myCode = "";
  for (let i = 0; i < 5; i++) {
    const candidate = genReferralCode();
    const taken = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.referralCode, candidate))
      .limit(1);
    if (!taken[0]) { myCode = candidate; break; }
  }
  if (!myCode) myCode = genReferralCode() + Date.now().toString(36).slice(-2).toUpperCase();

  const passwordHash = await hashPassword(password);
  const [created] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      name,
      role: safeRole,
      phone: phone ?? "",
      referralCode: myCode,
      referredBy,
    })
    .returning();
  if (!created) {
    res.status(500).json({ error: "Failed to create user" });
    return;
  }

  // Track referral
  if (referredBy) {
    try {
      await db.insert(referralsTable).values({
        referrerId: referredBy,
        referredId: created.id,
        status: "pending",
      });
    } catch (e) {
      console.error("Failed to record referral", e);
    }
  }

  const token = signToken({ userId: created.id, role: safeRole });
  setAuthCookie(res, token);
  res.json({ token, user: userToPublic(created) });
});

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBodyExt.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { email, password } = parsed.data;
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  const u = rows[0];
  if (!u) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const ok = await comparePassword(password, u.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = signToken({ userId: u.id, role: u.role as Role });
  setAuthCookie(res, token);
  res.json({ token, user: userToPublic(u) });
});

router.post("/auth/logout", async (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/auth/me", async (req, res) => {
  const user = await loadUserFromRequest(req);
  res.json({ user });
});

router.get("/auth/google/status", async (_req, res) => {
  const enabled =
    !!process.env["GOOGLE_CLIENT_ID"] && !!process.env["GOOGLE_CLIENT_SECRET"];
  res.json({
    enabled,
    message: enabled
      ? "Google sign-in is enabled."
      : "Google sign-in requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.",
  });
});

router.get("/auth/google/start", async (_req, res) => {
  if (!process.env["GOOGLE_CLIENT_ID"]) {
    return res
      .status(503)
      .json({ error: "Google sign-in not configured on this deployment." });
  }
  return res.status(501).json({
    error: "OAuth initiation not implemented in this demo.",
  });
});

const ForgotPasswordBody = z.object({ email: z.string().email() });

router.post("/auth/forgot-password", async (req, res) => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email" });
    return;
  }
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, parsed.data.email))
    .limit(1);
  if (!rows[0]) {
    // Don't reveal if email exists
    res.json({ ok: true, message: "If that email is registered, a reset link has been sent." });
    return;
  }
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const expiry = new Date(Date.now() + 3600 * 1000); // 1 hour
  await db
    .update(usersTable)
    .set({ resetToken: token, resetTokenExpiry: expiry })
    .where(eq(usersTable.id, rows[0].id));
  // In production this would send an email; for now we return the token for demo
  res.json({ ok: true, token, message: "Reset token generated (demo mode — no email sent)." });
});

const ResetPasswordBody = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6),
});

router.post("/auth/reset-password", async (req, res) => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { token, newPassword } = parsed.data;
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.resetToken, token))
    .limit(1);
  const user = rows[0];
  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }
  const hash = await hashPassword(newPassword);
  await db
    .update(usersTable)
    .set({ passwordHash: hash, resetToken: "", resetTokenExpiry: null })
    .where(eq(usersTable.id, user.id));
  res.json({ ok: true, message: "Password reset successfully. You can now log in." });
});

export default router;
