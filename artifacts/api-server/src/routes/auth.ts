import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
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
import { respondInvalid } from "../lib/validationError";
import {
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
} from "../lib/notifications";

const router: IRouter = Router();

// ─── Rate limiters ─────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts — please wait a few minutes before trying again." },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many accounts created from this IP address — please try again later." },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many password reset requests — please try again later." },
});

const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many resend requests — please try again later." },
});

function genReferralCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function genVerifyToken(): string {
  return randomBytes(32).toString("hex");
}

const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .refine((v) => /[A-Z]/.test(v), "Password must contain at least one uppercase letter")
  .refine((v) => /[a-z]/.test(v), "Password must contain at least one lowercase letter")
  .refine((v) => /[0-9]/.test(v), "Password must contain at least one number")
  .refine((v) => /[^A-Za-z0-9]/.test(v), "Password must contain at least one special character");

const RegisterBodyExt = z.object({
  email: z.string().email(),
  password: strongPassword,
  name: z.string().min(1),
  role: z.enum(["user", "vendor", "admin"]).optional(),
  phone: z.string().optional().default(""),
  referralCode: z.string().optional().default(""),
});

const LoginBodyExt = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/auth/register", registerLimiter, async (req, res) => {
  const parsed = RegisterBodyExt.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
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

  // Generate email verification token (24 h)
  const verifyToken = genVerifyToken();
  const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

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
      emailVerified: false,
      emailVerifyToken: verifyToken,
      emailVerifyExpiry: verifyExpiry,
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
      req.log.error({ err: e }, "Failed to record referral");
    }
  }

  // Send verification email (fire-and-forget)
  sendEmailVerificationEmail({
    to: created.email,
    toName: created.name,
    token: verifyToken,
  }).catch((err) => {
    req.log.error({ err }, "Failed to send verification email");
  });

  res.json({
    ok: true,
    message: "Account created! Please check your email and click the verification link to log in.",
  });
});

router.post("/auth/login", loginLimiter, async (req, res) => {
  const parsed = LoginBodyExt.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
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
    res.status(404).json({ error: "No account found for that email.", code: "NO_ACCOUNT" });
    return;
  }
  const ok = await comparePassword(password, u.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Incorrect password. Please try again.", code: "INVALID_PASSWORD" });
    return;
  }
  if (!u.emailVerified) {
    res.status(403).json({
      error: "EMAIL_NOT_VERIFIED",
      message: "Please verify your email address before logging in. Check your inbox for the verification link.",
    });
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

// ─── Email verification ────────────────────────────────────────────────────────

router.get("/auth/verify-email", async (req, res) => {
  const { token } = req.query as Record<string, string>;
  if (!token) {
    res.status(400).send("Missing token.");
    return;
  }
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.emailVerifyToken, token))
    .limit(1);
  const user = rows[0];
  if (!user || !user.emailVerifyExpiry || user.emailVerifyExpiry < new Date()) {
    res.status(400).send("This verification link is invalid or has expired. Please request a new one.");
    return;
  }
  // Mark verified and clear token
  await db
    .update(usersTable)
    .set({ emailVerified: true, emailVerifyToken: "", emailVerifyExpiry: null })
    .where(eq(usersTable.id, user.id));

  // Issue auth session so user is logged in immediately
  const jwtToken = signToken({ userId: user.id, role: user.role as Role });
  setAuthCookie(res, jwtToken);


  // Redirect back to app with success flag
  const base = req.headers.origin ?? "";
  const redirectBase = base || "";
  res.redirect(`${redirectBase}/?verified=1`);
});

const ResendVerificationBody = z.object({ email: z.string().email() });

router.post("/auth/resend-verification", resendVerificationLimiter, async (req, res) => {
  const parsed = ResendVerificationBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, parsed.data.email))
    .limit(1);
  const user = rows[0];
  // Always return ok to avoid revealing whether email is registered
  if (!user || user.emailVerified) {
    res.json({ ok: true, message: "If that email is pending verification, a new link has been sent." });
    return;
  }
  const verifyToken = genVerifyToken();
  const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db
    .update(usersTable)
    .set({ emailVerifyToken: verifyToken, emailVerifyExpiry: verifyExpiry })
    .where(eq(usersTable.id, user.id));
  sendEmailVerificationEmail({
    to: user.email,
    toName: user.name,
    token: verifyToken,
  }).catch((err) => {
    req.log.error({ err }, "Failed to resend verification email");
  });
  res.json({ ok: true, message: "If that email is pending verification, a new link has been sent." });
});

// ─── Google OAuth ──────────────────────────────────────────────────────────────

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
      req.log.error({ body: await tokenRes.text() }, "Google token exchange failed");
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
          .set({ googleId: profile.sub, emailVerified: true })
          .where(eq(usersTable.id, emailRows[0].id));
        user = { ...emailRows[0], googleId: profile.sub, emailVerified: true };
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
          emailVerified: true,
        })
        .returning();

      if (!created) {
        res.redirect("/?error=google_auth_failed");
        return;
      }
      user = created;
    }

    const token = signToken({ userId: user.id, role: user.role as Role });
    setAuthCookie(res, token);
    res.redirect("/");
  } catch (err) {
    req.log.error({ err }, "Google OAuth callback error");
    res.redirect("/?error=google_auth_failed");
  }
});

const ForgotPasswordBody = z.object({ email: z.string().email() });

router.post("/auth/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, parsed.data.email))
    .limit(1);
  if (!rows[0]) {
    res.json({ ok: true, message: "If that email is registered, a reset link has been sent." });
    return;
  }
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const expiry = new Date(Date.now() + 3600 * 1000);
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
    req.log.error({ err }, "Failed to send password reset email");
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
    respondInvalid(res, parsed.error);
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
    respondInvalid(res, parsed.error);
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
          .set({ googleId: info.sub, emailVerified: true })
          .where(eq(usersTable.id, emailRows[0].id));
        user = { ...emailRows[0], googleId: info.sub, emailVerified: true };
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
          emailVerified: true,
        })
        .returning();

      if (!created) {
        res.status(500).json({ error: "Failed to create user" });
        return;
      }
      user = created;
    }

    const token = signToken({ userId: user.id, role: user.role as Role });
    setAuthCookie(res, token);
    res.json({ token, user: userToPublic(user) });
  } catch (err) {
    req.log.error({ err }, "Google mobile auth error");
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
    respondInvalid(res, parsed.error);
    return;
  }
  await db
    .update(usersTable)
    .set({ expoPushToken: parsed.data.pushToken })
    .where(eq(usersTable.id, user.id));
  res.json({ ok: true });
});

export default router;
