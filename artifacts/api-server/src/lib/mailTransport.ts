/**
 * Unified outbound email transport.
 *
 * Delivery strategy (first available wins):
 *   1. Resend HTTP API  — used whenever RESEND_API_KEY is set. This is the
 *      ONLY path that works in production: Railway blocks outbound SMTP ports
 *      (25/465/587), so smtp.gmail.com connections time out from the container.
 *      Resend sends over HTTPS (443), which is not blocked, and royvento.com is
 *      a verified Resend sending domain (SPF/DKIM handled by Resend).
 *   2. Gmail SMTP (nodemailer) — fallback for local development, where SMTP
 *      egress is available. Forces IPv4 + fail-fast timeouts.
 *   3. Dev-mode log — neither configured: the payload is logged, not sent.
 *
 * Both the transactional emails (notifications.ts) and the admin "Send &
 * Receive" feature (emailService.ts) funnel through sendMail() so there is a
 * single, consistent delivery path.
 */
import nodemailer from "nodemailer";
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
  /** Threading headers (In-Reply-To / References) etc. */
  headers?: Record<string, string>;
  attachments?: MailAttachment[];
}

export interface MailResult {
  ok: boolean;
  /** Provider message id when delivery succeeded. */
  id?: string;
  error?: string;
  /** Which transport handled the message: "resend" | "smtp" | "dev". */
  via?: "resend" | "smtp" | "dev";
}

function toArray(v: string | string[]): string[] {
  return Array.isArray(v) ? v : [v];
}

async function sendViaResend(key: string, input: MailInput): Promise<MailResult> {
  const body: Record<string, unknown> = {
    from: input.from,
    to: toArray(input.to),
    subject: input.subject,
  };
  if (input.html) body["html"] = input.html;
  if (input.text) body["text"] = input.text;
  if (input.cc && input.cc.length) body["cc"] = input.cc;
  if (input.bcc && input.bcc.length) body["bcc"] = input.bcc;
  if (input.headers && Object.keys(input.headers).length) body["headers"] = input.headers;
  if (input.attachments && input.attachments.length) {
    body["attachments"] = input.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      ...(a.contentType ? { content_type: a.contentType } : {}),
    }));
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) {
      const error = json.message || json.name || `Resend HTTP ${res.status}`;
      logger.error({ status: res.status, error, to: input.to }, "[mail] Resend send failed");
      return { ok: false, error, via: "resend" };
    }
    return { ok: true, id: json.id, via: "resend" };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Resend request failed";
    logger.error({ err, to: input.to }, "[mail] Resend request error");
    return { ok: false, error, via: "resend" };
  }
}

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
    // Force IPv4 + fail-fast timeouts (see module header). Only used locally.
    family: 4,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

async function sendViaSmtp(input: MailInput): Promise<MailResult> {
  const transport = getSmtpTransport();
  if (!transport) return { ok: false, error: "SMTP not configured", via: "smtp" };
  try {
    const info = await transport.sendMail({
      from: input.from,
      to: input.to,
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

/** True when some real transport (Resend or SMTP) is configured. */
export function isMailConfigured(): boolean {
  return Boolean(process.env["RESEND_API_KEY"]) || Boolean(process.env["SMTP_USER"] && process.env["SMTP_PASS"]);
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  const resendKey = process.env["RESEND_API_KEY"];
  if (resendKey) return sendViaResend(resendKey, input);

  if (process.env["SMTP_USER"] && process.env["SMTP_PASS"]) return sendViaSmtp(input);

  logger.info({ to: input.to, subject: input.subject }, "[mail] dev mode — not sent (no RESEND_API_KEY / SMTP creds)");
  return { ok: true, id: `dev-${Date.now()}`, via: "dev" };
}
