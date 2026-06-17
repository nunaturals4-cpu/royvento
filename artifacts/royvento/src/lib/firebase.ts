// ─── Firebase Phone Auth — web client ────────────────────────────────────────
//
// Powers Solo Connector onboarding step 1–2 (phone → OTP). All config is read
// from VITE_FIREBASE_* env vars so no secrets live in source. When the config is
// absent the app runs in DEV-STUB mode: the OTP step accepts any 6-digit code
// and the verification token is `dev:+<phone>`, which the API's dev fallback
// understands. The server still re-verifies whatever token we send, so the
// client is never trusted on its own.

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type Auth,
  type ConfirmationResult,
} from "firebase/auth";

const cfg = {
  apiKey: import.meta.env["VITE_FIREBASE_API_KEY"] as string | undefined,
  authDomain: import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"] as string | undefined,
  projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"] as string | undefined,
  appId: import.meta.env["VITE_FIREBASE_APP_ID"] as string | undefined,
};

export const firebaseWebConfigured: boolean = Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function ensureAuth(): Auth {
  if (!firebaseWebConfigured) {
    throw new Error("Firebase is not configured on the web client.");
  }
  if (!app) app = initializeApp(cfg as Record<string, string>);
  if (!auth) {
    auth = getAuth(app);
    // LOCALHOST ONLY: disable reCAPTCHA app verification so Firebase TEST phone
    // numbers verify without the reCAPTCHA, which is flaky on localhost (third-
    // party cookies / extensions cause auth/invalid-app-credential). Production
    // domains (royvento.com) keep real reCAPTCHA + real SMS. Only effective with
    // numbers registered under "Phone numbers for testing".
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      auth.settings.appVerificationDisabledForTesting = true;
    }
  }
  return auth;
}

// A single invisible reCAPTCHA verifier per page; Firebase requires one for
// phone auth (it provides the anti-abuse / rate-limiting Firebase is known for).
let recaptcha: RecaptchaVerifier | null = null;

function ensureRecaptcha(containerId: string): RecaptchaVerifier {
  if (recaptcha) return recaptcha;
  recaptcha = new RecaptchaVerifier(ensureAuth(), containerId, { size: "invisible" });
  return recaptcha;
}

export interface PhoneVerification {
  // In real mode this confirms the SMS code; in dev-stub mode it just returns
  // the dev token for any 6-digit code.
  confirm(code: string): Promise<string>; // resolves to the ID token to POST
}

// Map Firebase phone-auth error codes to short, user-friendly messages so the UI
// never surfaces a raw "Firebase: Error (auth/...)" string to the user.
function friendlyOtpError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-verification-code":
      return "Incorrect code. Please check the 6-digit code and try again.";
    case "auth/code-expired":
      return "This code has expired. Tap “Resend code” to get a new one.";
    case "auth/missing-verification-code":
      return "Please enter the 6-digit code we sent you.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    default:
      return "We couldn’t verify that code. Please try again.";
  }
}

/**
 * Begin phone verification. In real mode this triggers Firebase to send an SMS
 * (Firebase enforces resend cooldowns, expiry, and rate limiting). In dev-stub
 * mode it resolves immediately and any code is accepted.
 */
export async function startPhoneVerification(
  phoneE164: string,
  recaptchaContainerId: string,
): Promise<PhoneVerification> {
  if (!firebaseWebConfigured) {
    return {
      async confirm(code: string) {
        if (!/^\d{4,8}$/.test(code)) throw new Error("Enter the 6-digit code.");
        return `dev:${phoneE164}`;
      },
    };
  }
  const verifier = ensureRecaptcha(recaptchaContainerId);
  const confirmation: ConfirmationResult = await signInWithPhoneNumber(ensureAuth(), phoneE164, verifier);
  return {
    async confirm(code: string) {
      try {
        const cred = await confirmation.confirm(code);
        return cred.user.getIdToken();
      } catch (err) {
        // Surface a clean validation message instead of the raw Firebase error.
        throw new Error(friendlyOtpError(err));
      }
    },
  };
}

/** Sign the Firebase user out (logout should invalidate the phone-auth session). */
export async function firebaseSignOut(): Promise<void> {
  if (auth) await auth.signOut().catch(() => {});
}
