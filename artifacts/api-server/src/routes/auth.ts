import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { db, usersTable, referralsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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
  hashResetToken,
  type Role,
} from "../lib/auth";

const IS_PROD = process.env["NODE_ENV"] === "production";

// ─── Per-account login throttling (complements the per-IP loginLimiter) ────────
// Distributed credential-stuffing spreads across many IPs, defeating an IP-only
// limiter. Track consecutive failures per email and lock briefly after a burst.
// In-memory per instance (same model as express-rate-limit here); cleared on a
// successful login.
const LOGIN_MAX_FAILS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const loginFails = new Map<string, { count: number; resetAt: number; lockedUntil: number }>();

function loginLockRemainingMs(email: string): number {
  const e = loginFails.get(email.toLowerCase());
  if (!e) return 0;
  const now = Date.now();
  return e.lockedUntil > now ? e.lockedUntil - now : 0;
}
function recordLoginFail(email: string): void {
  const key = email.toLowerCase();
  const now = Date.now();
  const e = loginFails.get(key);
  if (!e || now > e.resetAt) {
    loginFails.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS, lockedUntil: 0 });
    return;
  }
  e.count += 1;
  if (e.count >= LOGIN_MAX_FAILS) e.lockedUntil = now + LOGIN_LOCK_MS;
}
function clearLoginFails(email: string): void {
  loginFails.delete(email.toLowerCase());
}
import { respondInvalid } from "../lib/validationError";
import {
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  sendWelcomeEmail,
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
    if (existing[0].googleId && existing[0].passwordHash === "") {
      res.status(409).json({
        error: "This email signed up with Google. Please continue with Google.",
        code: "USE_GOOGLE_SIGNIN",
      });
      return;
    }
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

  // Send verification + welcome emails (fire-and-forget)
  sendEmailVerificationEmail({
    to: created.email,
    toName: created.name,
    token: verifyToken,
  }).catch((err) => {
    req.log.error({ err }, "Failed to send verification email");
  });

  sendWelcomeEmail({
    to: created.email,
    toName: created.name,
  }).catch((err) => {
    req.log.error({ err }, "Failed to send welcome email");
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

  const lockMs = loginLockRemainingMs(email);
  if (lockMs > 0) {
    res.status(429).json({
      error: `Too many failed attempts for this account. Try again in about ${Math.ceil(lockMs / 60000)} minute(s).`,
      code: "ACCOUNT_LOCKED",
    });
    return;
  }

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
  if (u.googleId && u.passwordHash === "") {
    res.status(403).json({
      error: "This email signed up with Google. Please continue with Google.",
      code: "USE_GOOGLE_SIGNIN",
    });
    return;
  }
  const ok = await comparePassword(password, u.passwordHash);
  if (!ok) {
    recordLoginFail(email);
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
  clearLoginFails(email);
  const token = signToken({ userId: u.id, role: u.role as Role, tokenVersion: u.tokenVersion });
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
  const jwtToken = signToken({ userId: user.id, role: user.role as Role, tokenVersion: user.tokenVersion });
  setAuthCookie(res, jwtToken);

  // Same-origin relative redirect. Pinning it (instead of echoing the
  // client-supplied Origin header) prevents a forged Origin from bouncing the
  // freshly-authenticated session to an attacker-controlled host.
  res.redirect(`/?verified=1`);
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

const PRODUCTION_CALLBACK_URL = "https://royvento.com/api/auth/google/callback";

function getGoogleCallbackUrl(): string {
  // 1. Explicit override wins.
  if (process.env["GOOGLE_CALLBACK_URL"]) return process.env["GOOGLE_CALLBACK_URL"];

  // 2. Generic APP_URL (already used for PhonePe callbacks). Strip trailing slash.
  const appUrl = process.env["APP_URL"];
  if (appUrl) return `${appUrl.replace(/\/+$/, "")}/api/auth/google/callback`;

  // 3. Production = royvento.com. Anything else (preview deploys, staging) must
  // set APP_URL or GOOGLE_CALLBACK_URL explicitly.
  if (process.env["NODE_ENV"] === "production") return PRODUCTION_CALLBACK_URL;

  // 4. Railway preview / non-prod public domain.
  const railwayDomain = process.env["RAILWAY_PUBLIC_DOMAIN"];
  if (railwayDomain) return `https://${railwayDomain}/api/auth/google/callback`;

  // 5. Replit dev domains.
  const productionDomains = process.env["REPLIT_DOMAINS"];
  if (productionDomains) {
    const domain = productionDomains.split(",")[0]?.trim();
    if (domain) return `https://${domain}/api/auth/google/callback`;
  }
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain) return `https://${devDomain}/api/auth/google/callback`;

  // 6. Local dev fallback — Vite proxies /api to the api-server, so the frontend
  // port is the externally-visible one Google should redirect to.
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

// Reject anything that isn't a same-origin path (must start with single "/").
// Blocks "//evil.com", "https://...", "javascript:..." used to bounce off the
// auth flow to a third party.
function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

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

  const next = safeNextPath((req.query as Record<string, unknown>)["next"]);
  if (next !== "/") {
    res.cookie("google_oauth_next", next, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
      signed: true,
    });
  }

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

  const nextPath = safeNextPath(signedCookies?.["google_oauth_next"]);
  res.clearCookie("google_oauth_next");

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
        // Strict separation: this email is already registered with a
        // password. Don't merge — bounce to /login. Don't echo the email
        // back in the URL: keeps it out of browser history / referrers
        // and avoids signaling "this email exists" via a pre-filled form.
        res.redirect(`/login?error=email_signed_up_with_password`);
        return;
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

    const token = signToken({ userId: user.id, role: user.role as Role, tokenVersion: user.tokenVersion });
    setAuthCookie(res, token);
    res.redirect(nextPath);
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
  // Google-only users have no password to reset. Silently succeed (parity with
  // the no-account branch above) so we don't leak whether the email is a
  // Google account, and so the bypass-via-reset path is closed.
  if (rows[0].googleId && rows[0].passwordHash === "") {
    res.json({ ok: true, message: "If that email is registered, a reset link has been sent." });
    return;
  }
  // Cryptographically-random, single-use token. We email the raw token but only
  // persist its SHA-256, so a DB leak can't be replayed to reset passwords.
  const rawToken = randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 3600 * 1000);
  await db
    .update(usersTable)
    .set({ resetToken: hashResetToken(rawToken), resetTokenExpiry: expiry })
    .where(eq(usersTable.id, rows[0].id));
  try {
    await sendPasswordResetEmail({
      to: rows[0].email,
      toName: rows[0].name,
      token: rawToken,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to send password reset email");
  }
  res.json({ ok: true, message: "If that email is registered, a reset link has been sent." });
});

const ResetPasswordBody = z.object({
  token: z.string().min(1),
  newPassword: strongPassword,
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
    .where(eq(usersTable.resetToken, hashResetToken(token)))
    .limit(1);
  const user = rows[0];
  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }
  const hash = await hashPassword(newPassword);
  // Bump token_version so every previously-issued session token for this account
  // stops authenticating — a password reset should log out other sessions.
  await db
    .update(usersTable)
    .set({
      passwordHash: hash,
      resetToken: "",
      resetTokenExpiry: null,
      tokenVersion: sql`${usersTable.tokenVersion} + 1`,
    })
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
    if (!googleClientId) {
      // In production the audience check is mandatory: without it, an ID token
      // minted for any other Google OAuth client would be accepted.
      if (IS_PROD) {
        res.status(500).json({ error: "Google sign-in is not configured" });
        return;
      }
    } else {
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
        // Strict separation: this email already has a password account.
        // Tell the mobile client to redirect the user to email/password login.
        res.status(409).json({
          error: "This email already has a Royvento account with a password. Please log in with email and password instead.",
          code: "USE_PASSWORD_SIGNIN",
        });
        return;
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

    const token = signToken({ userId: user.id, role: user.role as Role, tokenVersion: user.tokenVersion });
    setAuthCookie(res, token);
    res.json({ token, user: userToPublic(user) });
  } catch (err) {
    req.log.error({ err }, "Google mobile auth error");
    res.status(500).json({ error: "Google authentication failed" });
  }
});

const GenderBody = z.object({ gender: z.enum(["male", "female"]) });

router.put("/auth/gender", async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = GenderBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  await db
    .update(usersTable)
    .set({ gender: parsed.data.gender, genderCompleted: true })
    .where(eq(usersTable.id, user.id));
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  const updated = rows[0];
  if (!updated) {
    res.status(500).json({ error: "Failed to load user" });
    return;
  }
  res.json({ user: userToPublic(updated) });
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
