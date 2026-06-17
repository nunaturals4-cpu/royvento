import { logger } from "./logger";

// ─── Firebase Phone Auth — server-side ID-token verification ─────────────────
//
// Solo Connector onboarding verifies a phone number with Firebase Phone Auth on
// the CLIENT (web JS SDK / React-Native Firebase). The client then sends the
// resulting Firebase ID token here; the server verifies it with the Admin SDK
// and reads the phone number FROM THE VERIFIED TOKEN — never from a
// client-supplied string. This is what makes the phone trustworthy.
//
// Configuration is env-driven (no secrets in the bundle), mirroring the VAPID /
// Razorpay pattern:
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY   (PEM; literal "\n" sequences are unescaped)
//
// DEV-STUB FALLBACK: when those env vars are absent the verifier accepts a stub
// token of the form `dev:+<E164phone>` and returns that phone. This lets the
// whole onboarding flow be exercised locally without a real Firebase project.
// The fallback is hard-disabled in production.

export interface VerifiedPhone {
  uid: string;
  phoneNumber: string;
}

const PROJECT_ID = process.env["FIREBASE_PROJECT_ID"] ?? "";
const CLIENT_EMAIL = process.env["FIREBASE_CLIENT_EMAIL"] ?? "";
const PRIVATE_KEY = (process.env["FIREBASE_PRIVATE_KEY"] ?? "").replace(/\\n/g, "\n");
const IS_PROD = process.env["NODE_ENV"] === "production";

export const firebaseConfigured: boolean = Boolean(PROJECT_ID && CLIENT_EMAIL && PRIVATE_KEY);

// Lazily-initialised Admin SDK auth instance (only when configured). Typed
// loosely so the module compiles even though firebase-admin is externalised by
// the bundler.
let adminAuth: { verifyIdToken: (token: string) => Promise<Record<string, unknown>> } | null = null;
let initPromise: Promise<void> | null = null;

async function ensureAdmin(): Promise<void> {
  if (adminAuth || !firebaseConfigured) return;
  if (!initPromise) {
    initPromise = (async () => {
      const appMod = await import("firebase-admin/app");
      const authMod = await import("firebase-admin/auth");
      const existing = appMod.getApps();
      const app =
        existing.length > 0
          ? existing[0]!
          : appMod.initializeApp({
              credential: appMod.cert({
                projectId: PROJECT_ID,
                clientEmail: CLIENT_EMAIL,
                privateKey: PRIVATE_KEY,
              }),
            });
      adminAuth = authMod.getAuth(app) as unknown as typeof adminAuth;
      logger.info("Firebase Admin SDK initialised for Solo Connector phone auth");
    })().catch((err) => {
      initPromise = null;
      logger.error({ err }, "Failed to initialise Firebase Admin SDK");
      throw err;
    });
  }
  await initPromise;
}

export class PhoneVerificationError extends Error {}

function normalisePhone(raw: string): string {
  const trimmed = raw.trim();
  // E.164: leading + and 8–15 digits.
  if (!/^\+\d{8,15}$/.test(trimmed)) {
    throw new PhoneVerificationError("Phone number must be in E.164 format (e.g. +919000000000).");
  }
  return trimmed;
}

/**
 * Verify a Firebase ID token (or dev-stub token) and return the verified phone.
 * Throws PhoneVerificationError on any invalid / unverifiable token.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedPhone> {
  if (!idToken || typeof idToken !== "string") {
    throw new PhoneVerificationError("Missing verification token.");
  }

  // Dev-stub path — only when Firebase is NOT configured and NOT in production.
  if (!firebaseConfigured) {
    if (IS_PROD) {
      throw new PhoneVerificationError("Phone verification is not configured.");
    }
    if (!idToken.startsWith("dev:")) {
      throw new PhoneVerificationError(
        "Firebase is not configured. Use a dev token like 'dev:+919000000000'.",
      );
    }
    const phoneNumber = normalisePhone(idToken.slice(4));
    logger.warn({ phoneNumber }, "Solo Connector phone verified via DEV STUB (Firebase not configured)");
    return { uid: `dev:${phoneNumber}`, phoneNumber };
  }

  await ensureAdmin();
  if (!adminAuth) {
    throw new PhoneVerificationError("Phone verification is temporarily unavailable.");
  }

  let decoded: Record<string, unknown>;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch (err) {
    logger.warn({ err }, "Firebase ID token verification failed");
    throw new PhoneVerificationError("Could not verify your phone. Please try again.");
  }

  const phone = typeof decoded["phone_number"] === "string" ? (decoded["phone_number"] as string) : "";
  const uid = typeof decoded["uid"] === "string" ? (decoded["uid"] as string) : "";
  if (!phone) {
    throw new PhoneVerificationError("This sign-in did not include a verified phone number.");
  }
  return { uid, phoneNumber: normalisePhone(phone) };
}
