/**
 * Unified outbound email transport — Google Workspace only.
 *
 * Delivery strategy (first available wins):
 *   1. Gmail REST API (HTTPS 443) — used when GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET
 *      + GMAIL_REFRESH_TOKEN are set. This is the ONLY path that works in
 *      production on Railway: Railway blocks outbound SMTP ports (25/465/587),
 *      so smtp.gmail.com connections time out from the container. The Gmail API
 *      uses HTTPS (port 443) which is not blocked. Sends from support@royvento.com
 *      via the account's OAuth2 credentials.
 *   2. Gmail SMTP (App Password) — fallback when only SMTP_USER + SMTP_PASS
 *      are set. Works from local dev (no Railway SMTP block there). Forces IPv4
 *      and fail-fast timeouts so a blocked send fails in 10s, not 2 minutes.
 *   3. Dev-mode log — neither configured: payload logged, not delivered.
 *
 * Required env vars for production (set all three in Railway):
 *   GMAIL_CLIENT_ID       OAuth2 client ID (from Google Cloud Console)
 *   GMAIL_CLIENT_SECRET   OAuth2 client secret
 *   GMAIL_REFRESH_TOKEN   Refresh token for support@royvento.com
 *
 * Local dev fallback (Gmail SMTP):
 *   SMTP_USER   support@royvento.com
 *   SMTP_PASS   Google App Password (16 chars)
 *
 * From address override (optional, defaults to "Royvento <support@royvento.com>"):
 *   SMTP_FROM   e.g. "Royvento Support <support@royvento.com>"
 */
import nodemailer from "nodemailer";
import { OAuth2Client } from "google-auth-library";
import { logger } from "./logger";

export interface MailAttachment {
  filename: string;
  /** Base64-encoded content. */
  content: string;
  contentType?: string;
}

export interface MailInput {
  from: string;
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  /** Additional RFC 2822 headers (e.g. In-Reply-To, References). */
  headers?: Record<string, string>;
  attachments?: MailAttachment[];
}

export interface MailResult {
  ok: boolean;
  /** Provider message id when delivery succeeded. */
  id?: string;
  error?: string;
  /** Which transport handled the message. */
  via?: "gmail-api" | "smtp" | "dev";
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toArray(v: string | string[]): string[] {
  return Array.isArray(v) ? v : [v];
}

/**
 * Build a base64url-encoded RFC 2822 message using nodemailer's internal
 * MIME builder (streamTransport + buffer: true) without opening any SMTP
 * connection. Used to hand the raw payload to the Gmail REST API.
 */
async function buildRawMime(input: MailInput): Promise<string> {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
    buffer: true,
  } as Parameters<typeof nodemailer.createTransport>[0]);

  const options: nodemailer.SendMailOptions = {
    from: input.from,
    to: toArray(input.to),
    subject: input.subject,
  };
  if (input.cc && input.cc.length) options.cc = input.cc;
  if (input.bcc && input.bcc.length) options.bcc = input.bcc;
  if (input.html) options.html = input.html;
  if (input.text) options.text = input.text;
  if (input.headers && Object.keys(input.headers).length) options.headers = input.headers;
  if (input.attachments && input.attachments.length) {
    options.attachments = input.attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content, "base64"),
      contentType: a.contentType,
    }));
  }

  // sendMail returns a promise when no callback is given; info.message is
  // a Buffer because we set buffer: true above.
  const info = await transport.sendMail(options) as { message: Buffer };
  return info.message
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ── Gmail REST API transport ─────────────────────────────────────────────────

let _oauth2Client: OAuth2Client | null = null;

function getOAuth2Client(): OAuth2Client | null {
  const clientId = process.env["GMAIL_CLIENT_ID"];
  const clientSecret = process.env["GMAIL_CLIENT_SECRET"];
  const refreshToken = process.env["GMAIL_REFRESH_TOKEN"];
  if (!clientId || !clientSecret || !refreshToken) return null;
  if (!_oauth2Client) {
    _oauth2Client = new OAuth2Client(clientId, clientSecret);
    _oauth2Client.setCredentials({ refresh_token: refreshToken });
  }
  return _oauth2Client;
}

async function sendViaGmailAPI(input: MailInput): Promise<MailResult> {
  const oauthClient = getOAuth2Client()!;

  let accessToken: string | null | undefined;
  try {
    const resp = await oauthClient.getAccessToken();
    accessToken = resp.token;
  } catch (err) {
    logger.error({ err }, "[mail] Gmail API: failed to get access token");
    return { ok: false, error: "OAuth2 token refresh failed", via: "gmail-api" };
  }

  if (!accessToken) {
    return { ok: false, error: "No access token returned", via: "gmail-api" };
  }

  let rawMime: string;
  try {
    rawMime = await buildRawMime(input);
  } catch (err) {
    logger.error({ err }, "[mail] Gmail API: failed to build MIME message");
    return { ok: false, error: "MIME build failed", via: "gmail-api" };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: rawMime }),
        signal: controller.signal,
      },
    );
    clearTimeout(timer);

    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!res.ok) {
      const error = json.error?.message ?? `Gmail API HTTP ${res.status}`;
      logger.error({ status: res.status, error, to: input.to }, "[mail] Gmail API send failed");
      return { ok: false, error, via: "gmail-api" };
    }
    return { ok: true, id: json.id, via: "gmail-api" };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Gmail API request failed";
    logger.error({ err, to: input.to }, "[mail] Gmail API request error");
    return { ok: false, error, via: "gmail-api" };
  }
}

// ── Gmail SMTP transport (local dev fallback) ────────────────────────────────

function getSmtpTransport(): nodemailer.Transporter | null {
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user, pass },
    // Railway blocks outbound SMTP — this path only works locally.
    // Force IPv4 + fail-fast timeouts so a blocked send fails in 10s.
    family: 4,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

async function sendViaSmtp(input: MailInput): Promise<MailResult> {
  const transport = getSmtpTransport()!;
  try {
    const info = await transport.sendMail({
      from: input.from,
      to: toArray(input.to),
      ...(input.cc && input.cc.length ? { cc: input.cc } : {}),
      ...(input.bcc && input.bcc.length ? { bcc: input.bcc } : {}),
      subject: input.subject,
      ...(input.html ? { html: input.html } : {}),
      ...(input.text ? { text: input.text } : {}),
      ...(input.headers && Object.keys(input.headers).length ? { headers: input.headers } : {}),
      ...(input.attachments && input.attachments.length
        ? {
            attachments: input.attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.from(a.content, "base64"),
              contentType: a.contentType,
            })),
          }
        : {}),
    });
    return { ok: true, id: info.messageId, via: "smtp" };
  } catch (err) {
    const error = err instanceof Error ? err.message : "SMTP send failed";
    logger.error({ err, to: input.to }, "[mail] SMTP send failed");
    return { ok: false, error, via: "smtp" };
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** True when a real transport (Gmail API or SMTP) is configured. */
export function isMailConfigured(): boolean {
  return Boolean(getOAuth2Client()) || Boolean(process.env["SMTP_USER"] && process.env["SMTP_PASS"]);
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  if (getOAuth2Client()) return sendViaGmailAPI(input);
  if (process.env["SMTP_USER"] && process.env["SMTP_PASS"]) return sendViaSmtp(input);

  logger.info(
    { to: input.to, subject: input.subject },
    "[mail] dev mode — not sent (set GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN for production, or SMTP_USER/PASS for local dev)",
  );
  return { ok: true, id: `dev-${Date.now()}`, via: "dev" };
}
