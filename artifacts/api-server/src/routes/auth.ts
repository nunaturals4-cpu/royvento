import { Router, type IRouter } from "express";
import { db, usersTable, referralsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "crypto";
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
import { sendPasswordResetEmail, sendWelcomeEmail } from "../lib/notifications";

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

function getGoogleCallbackUrl(): string {
  if (process.env["GOOGLE_CALLBACK_URL"]) return process.env["GOOGLE_CALLBACK_URL"];
  const productionDomains = process.env["REPLIT_DOMAINS"];
  if (productionDomains) {
    const domain = productionDomains.split(",")[0]?.trim();
    if (domain) return `https://${domain}/api/auth/google/callback`;
  }
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain) return `https://${devDomain}/api/auth/google/callback`;
  return "http://localhost:3000/api/auth/google/callback";
}

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

router.get("/auth/google/start", (req, res) => {
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  if (!clientId) {
    res.redirect("/?error=google_not_configured");
    return;
  }

  const state = randomBytes(16).toString("hex");
  res.cookie("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    signed: true,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleCallbackUrl(),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get("/auth/google/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code) {
    res.redirect("/?error=google_auth_failed");
    return;
  }

  const signedCookies = (req as any).signedCookies as Record<string, string | false> | undefined;
  const savedState = signedCookies?.["google_oauth_state"] || undefined;

  if (!state || !savedState || state !== savedState) {
    res.redirect("/?error=google_auth_failed");
    return;
  }

  res.clearCookie("google_oauth_state");

  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    res.redirect("/?error=google_not_configured");
    return;
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getGoogleCallbackUrl(),
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", await tokenRes.text());
      res.redirect("/?error=google_auth_failed");
      return;
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileRes.ok) {
      res.redirect("/?error=google_auth_failed");
      return;
    }

    const profile = (await profileRes.json()) as {
      sub: string;
      email: string;
      name: string;
      picture?: string;
    };

    let userRows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.googleId, profile.sub))
      .limit(1);
    let user = userRows[0];

    if (!user) {
      const emailRows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, profile.email))
        .limit(1);
      if (emailRows[0]) {
        await db
          .update(usersTable)
          .set({ googleId: profile.sub })
          .where(eq(usersTable.id, emailRows[0].id));
        user = { ...emailRows[0], googleId: profile.sub };
      }
    }

    if (!user) {
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

      const [created] = await db
        .insert(usersTable)
        .values({
          email: profile.email,
          passwordHash: "",
          name: profile.name || profile.email.split("@")[0],
          role: "user",
          phone: "",
          referralCode: myCode,
          googleId: profile.sub,
          profileImage: profile.picture ?? "",
        })
        .returning();

      if (!created) {
        res.redirect("/?error=google_auth_failed");
        return;
      }
      user = created;
      // Send welcome email to newly created Google user (fire-and-forget)
      sendWelcomeEmail({ to: user.email, toName: user.name }).catch((err) => {
        console.error("Failed to send Google sign-up welcome email:", err);
      });
    }

    const token = signToken({ userId: user.id, role: user.role as Role });
    setAuthCookie(res, token);
    res.redirect("/");
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.redirect("/?error=google_auth_failed");
  }
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
  try {
    await sendPasswordResetEmail({
      to: rows[0].email,
      toName: rows[0].name,
      token,
    });
  } catch (err) {
    console.error("Failed to send password reset email:", err);
  }
  res.json({ ok: true, message: "If that email is registered, a reset link has been sent." });
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

const GoogleMobileBody = z.object({ idToken: z.string() });

router.post("/auth/google/mobile", async (req, res) => {
  const parsed = GoogleMobileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "idToken required" });
    return;
  }

  const { idToken } = parsed.data;

  try {
    const infoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!infoRes.ok) {
      res.status(401).json({ error: "Invalid Google ID token" });
      return;
    }
    const info = (await infoRes.json()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
      email_verified?: string;
      aud?: string;
      azp?: string;
    };

    if (!info.email || !info.sub) {
      res.status(401).json({ error: "Incomplete Google profile" });
      return;
    }

    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (googleClientId) {
      const aud = info.aud ?? "";
      const azp = info.azp ?? "";
      if (aud !== googleClientId && azp !== googleClientId) {
        res.status(401).json({ error: "Token audience mismatch" });
        return;
      }
    }

    let userRows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.googleId, info.sub))
      .limit(1);
    let user = userRows[0];

    if (!user) {
      const emailRows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, info.email))
        .limit(1);
      if (emailRows[0]) {
        await db
          .update(usersTable)
          .set({ googleId: info.sub })
          .where(eq(usersTable.id, emailRows[0].id));
        user = { ...emailRows[0], googleId: info.sub };
      }
    }

    if (!user) {
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

      const [created] = await db
        .insert(usersTable)
        .values({
          email: info.email,
          passwordHash: "",
          name: info.name || info.email.split("@")[0],
          role: "user",
          phone: "",
          referralCode: myCode,
          googleId: info.sub,
          profileImage: info.picture ?? "",
        })
        .returning();

      if (!created) {
        res.status(500).json({ error: "Failed to create user" });
        return;
      }
      user = created;
      sendWelcomeEmail({ to: user.email, toName: user.name }).catch(() => {});
    }

    const token = signToken({ userId: user.id, role: user.role as Role });
    setAuthCookie(res, token);
    res.json({ token, user: userToPublic(user) });
  } catch (err) {
    console.error("Google mobile auth error:", err);
    res.status(500).json({ error: "Google authentication failed" });
  }
});

const PushTokenBody = z.object({ pushToken: z.string().min(1) });

router.put("/auth/push-token", async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = PushTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "pushToken is required" });
    return;
  }
  await db
    .update(usersTable)
    .set({ pushToken: parsed.data.pushToken })
    .where(eq(usersTable.id, user.id));
  res.json({ ok: true });
});

export default router;
