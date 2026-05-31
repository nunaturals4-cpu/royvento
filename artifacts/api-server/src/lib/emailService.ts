/**
 * Email Management System — service layer.
 *
 * Single source of truth for the Admin Panel → "Send & Receive Email" feature:
 *   • Sending via Gmail SMTP (nodemailer) from SMTP_USER
 *   • Threading (matching inbound replies to existing conversations)
 *   • Thread aggregate / folder-flag recomputation
 *   • Built-in HTML templates + a responsive, dark/light email layout
 *   • Idempotent boot-time schema ensure (tables created if missing)
 *
 * Env:
 *   SMTP_USER   Gmail / Google Workspace address (e.g. info@royvento.com). Required.
 *   SMTP_PASS   Google App Password (16 chars). Required.
 *   SMTP_FROM   Optional "From" override (defaults to "Royvento <SMTP_USER>").
 */

import nodemailer from "nodemailer";
import { createHmac, timingSafeEqual } from "crypto";
import { resolveTxt, resolveCname } from "node:dns/promises";
import { sql, eq, desc, asc, inArray } from "drizzle-orm";
import { db, emailThreadsTable, emailMessagesTable } from "@workspace/db";
import { logger } from "./logger";

// ─── Configuration ──────────────────────────────────────────────────────────

export const INFO_EMAIL_ADDRESS = "info@royvento.com";

export function getInfoFromAddress(): string {
  const user = process.env["SMTP_USER"];
  return process.env["SMTP_FROM"] ?? (user ? `Royvento <${user}>` : `Royvento <${INFO_EMAIL_ADDRESS}>`);
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
  });
}

// ─── Deliverability diagnostics (live DNS lookups) ─────────────────────────────
//
// Honest, read-only checks against the sending domain's published DNS. These do
// not change placement; they surface whether SPF/DKIM/DMARC are actually present
// so misconfiguration is caught instead of silently hurting reputation.

export interface DeliverabilityCheck {
  id: "spf" | "dkim" | "dmarc" | "smtp_config";
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface DeliverabilityReport {
  domain: string;
  fromAddress: string;
  checks: DeliverabilityCheck[];
}

function sendingDomain(): string {
  const m = INFO_EMAIL_ADDRESS.match(/@(.+)$/);
  return m?.[1] ?? "royvento.com";
}

async function txtRecords(name: string): Promise<string[]> {
  try {
    const records = await resolveTxt(name);
    return records.map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

export async function runDeliverabilityChecks(): Promise<DeliverabilityReport> {
  const domain = sendingDomain();
  const checks: DeliverabilityCheck[] = [];

  // SPF — TXT on the root domain.
  const root = await txtRecords(domain);
  const spf = root.find((r) => /v=spf1/i.test(r));
  if (!spf) {
    checks.push({ id: "spf", label: "SPF", status: "fail", detail: `No "v=spf1" TXT record found on ${domain}.` });
  } else if (/include:.*google|_spf\.google|include:.*gmail/i.test(spf)) {
    checks.push({ id: "spf", label: "SPF", status: "pass", detail: "SPF present and authorises Google Workspace as sender." });
  } else {
    checks.push({ id: "spf", label: "SPF", status: "warn", detail: `SPF present but does not include Google Workspace (add "include:_spf.google.com"): ${spf}` });
  }

  // DMARC — TXT at _dmarc.<domain>.
  const dmarcRecs = await txtRecords(`_dmarc.${domain}`);
  const dmarc = dmarcRecs.find((r) => /v=DMARC1/i.test(r));
  if (!dmarc) {
    checks.push({ id: "dmarc", label: "DMARC", status: "fail", detail: `No DMARC record at _dmarc.${domain}. Add at least "v=DMARC1; p=none".` });
  } else {
    const policy = dmarc.match(/p=(none|quarantine|reject)/i)?.[1]?.toLowerCase();
    checks.push({
      id: "dmarc",
      label: "DMARC",
      status: policy === "none" || !policy ? "warn" : "pass",
      detail: policy ? `DMARC published with policy p=${policy}.` : "DMARC published.",
    });
  }

  // DKIM — Google Workspace uses the "google" selector.
  let dkimFound = false;
  try {
    const dk = await txtRecords(`google._domainkey.${domain}`);
    dkimFound = dk.some((r) => /v=DKIM1|k=rsa|p=/i.test(r));
  } catch { /* ignore */ }
  checks.push(
    dkimFound
      ? { id: "dkim", label: "DKIM", status: "pass", detail: "Google Workspace DKIM selector is published." }
      : { id: "dkim", label: "DKIM", status: "warn", detail: `Could not resolve google._domainkey.${domain}. Enable DKIM in Google Workspace Admin → Apps → Gmail → Authenticate email.` },
  );

  // SMTP config presence (sends are no-ops without it).
  checks.push(
    (process.env["SMTP_USER"] && process.env["SMTP_PASS"])
      ? { id: "smtp_config", label: "SMTP config", status: "pass", detail: `SMTP_USER is set to ${process.env["SMTP_USER"]}.` }
      : { id: "smtp_config", label: "SMTP config", status: "fail", detail: "SMTP_USER or SMTP_PASS is missing — emails are logged, not delivered." },
  );

  return { domain, fromAddress: getInfoFromAddress(), checks };
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

export function normalizeSubject(subject: string): string {
  return (subject ?? "")
    .replace(/^(\s*(re|fwd|fw|aw|wg)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase()
    .slice(0, 500);
}

export function htmlToText(html: string): string {
  return (html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function makeSnippet(text: string, html: string): string {
  const base = (text && text.trim()) ? text : htmlToText(html);
  return base.replace(/\s+/g, " ").trim().slice(0, 280);
}

function esc(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Parse a raw From header like `"Jane Doe" <jane@x.com>` into name + email. */
export function parseAddress(raw: string): { name: string; email: string } {
  if (!raw) return { name: "", email: "" };
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: (m[1] ?? "").trim(), email: (m[2] ?? "").trim().toLowerCase() };
  return { name: "", email: raw.trim().toLowerCase() };
}

// ─── Responsive, dark/light-compatible HTML email layout ──────────────────────

/** Wraps rich body HTML in a branded transactional shell. */
export function wrapHtmlEmail(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>Royvento</title>
</head>
<body style="margin:0;padding:0;background:#f2f2f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2f2;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

      <!-- Header -->
      <tr>
        <td style="background:#0f0f0f;padding:22px 32px;text-align:center;">
          <img src="https://royvento.com/images/logo-icon.png" alt="Royvento" width="64" height="64" style="display:inline-block;width:64px;height:64px;border:0;outline:none;text-decoration:none;" />
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:36px 32px;color:#1a1a1a;font-size:15px;line-height:1.7;">
          ${bodyHtml}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding:20px 32px;background:#f9f9f9;border-top:1px solid #eeeeee;text-align:center;color:#888888;font-size:12px;line-height:1.6;">
          &copy; ${new Date().getFullYear()} Royvento. All rights reserved.<br/>
          This is a transactional email. Please do not reply to this message.
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ─── Built-in templates ───────────────────────────────────────────────────────

export interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  /** Rich HTML body fragment (inserted into the composer; NOT yet layout-wrapped). */
  html: string;
}

export const BUILT_IN_TEMPLATES: EmailTemplate[] = [
  {
    id: "booking-confirmation",
    name: "Booking Confirmation",
    category: "Transactional",
    subject: "Your Royvento booking is confirmed",
    html: `<p>Hi there,</p>
<p>Your booking is confirmed! We're excited to host you. Here are your details:</p>
<table cellpadding="0" cellspacing="0" border="0" style="background:#f7f7f7;border-radius:8px;margin:18px 0;width:100%;">
  <tr><td style="padding:9px 16px;color:#666;font-size:13px;width:38%;">Event</td><td style="padding:9px 16px;color:#1a1a1a;font-size:13px;font-weight:600;">[Event name]</td></tr>
  <tr><td style="padding:9px 16px;color:#666;font-size:13px;">Venue</td><td style="padding:9px 16px;color:#1a1a1a;font-size:13px;font-weight:600;">[Venue]</td></tr>
  <tr><td style="padding:9px 16px;color:#666;font-size:13px;">Date</td><td style="padding:9px 16px;color:#1a1a1a;font-size:13px;font-weight:600;">[Date]</td></tr>
</table>
<p>See you soon!</p>
<p style="color:#888;font-size:13px;">— The Royvento team</p>`,
  },
  {
    id: "partner-approval",
    name: "Partner Approval",
    category: "Partners",
    subject: "You're approved as a Royvento partner!",
    html: `<p>Hi [Partner name],</p>
<p><span style="display:inline-block;background:#22c55e20;color:#16a34a;font-size:12px;font-weight:700;letter-spacing:1px;padding:4px 10px;border-radius:4px;">APPROVED</span></p>
<p>Great news — your application to become a Royvento partner has been approved. You can now log in to your partner dashboard to set up your venue, create events, and start accepting bookings.</p>
<p><a href="https://royvento.com/dashboard/vendor" style="display:inline-block;padding:12px 26px;background:#e53e3e;color:#fff;font-weight:700;text-decoration:none;border-radius:6px;">Open Partner Dashboard</a></p>
<p style="color:#888;font-size:13px;">— The Royvento team</p>`,
  },
  {
    id: "ticket-reminder",
    name: "Ticket Reminder",
    category: "Reminders",
    subject: "Reminder: your event is coming up",
    html: `<p>Hi there,</p>
<p>Just a friendly reminder that your upcoming event is almost here. Don't forget to bring your QR ticket for a smooth check-in at the door.</p>
<table cellpadding="0" cellspacing="0" border="0" style="background:#f7f7f7;border-radius:8px;margin:18px 0;width:100%;">
  <tr><td style="padding:9px 16px;color:#666;font-size:13px;width:38%;">Event</td><td style="padding:9px 16px;color:#1a1a1a;font-size:13px;font-weight:600;">[Event name]</td></tr>
  <tr><td style="padding:9px 16px;color:#666;font-size:13px;">When</td><td style="padding:9px 16px;color:#1a1a1a;font-size:13px;font-weight:600;">[Date & time]</td></tr>
</table>
<p>We can't wait to see you there!</p>
<p style="color:#888;font-size:13px;">— The Royvento team</p>`,
  },
  {
    id: "promotion",
    name: "Promotion",
    category: "Marketing",
    subject: "Something special from Royvento 🎉",
    html: `<p>Hi there,</p>
<p>We've got an exclusive offer just for you. Discover the hottest events near you and book your spot before they sell out.</p>
<p><a href="https://royvento.com" style="display:inline-block;padding:12px 26px;background:#e53e3e;color:#fff;font-weight:700;text-decoration:none;border-radius:6px;">Explore Events</a></p>
<p style="color:#888;font-size:13px;">You're receiving this because you're part of the Royvento community.</p>
<p style="color:#888;font-size:13px;">— The Royvento team</p>`,
  },
];

// ─── SMTP send wrapper ────────────────────────────────────────────────────────

export interface SendAttachment {
  filename: string;
  /** Base64-encoded file content. */
  content: string;
  contentType?: string;
}

export interface SendEmailArgs {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: SendAttachment[];
}

export interface SendEmailResult {
  ok: boolean;
  /** Message ID returned by the SMTP server, when delivery succeeded. */
  id?: string;
  error?: string;
}

export async function sendEmailViaResend(args: SendEmailArgs): Promise<SendEmailResult> {
  const transport = getSmtpTransport();
  const from = getInfoFromAddress();

  if (!transport) {
    logger.info({ to: args.to, subject: args.subject }, "[email] dev mode — not actually sent (SMTP_USER/SMTP_PASS missing)");
    return { ok: true, id: `dev-${Date.now()}` };
  }

  // Threading headers only — no List-Unsubscribe so Gmail routes to Primary.
  const headers: Record<string, string> = {};
  if (args.inReplyTo) headers["In-Reply-To"] = args.inReplyTo;
  if (args.references && args.references.length > 0) headers["References"] = args.references.join(" ");

  try {
    const info = await transport.sendMail({
      from,
      to: args.to,
      ...(args.cc && args.cc.length ? { cc: args.cc } : {}),
      ...(args.bcc && args.bcc.length ? { bcc: args.bcc } : {}),
      subject: args.subject,
      ...(args.html ? { html: args.html } : {}),
      ...(args.text ? { text: args.text } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
      ...(args.attachments && args.attachments.length
        ? {
            attachments: args.attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.from(a.content, "base64"),
              contentType: a.contentType,
            })),
          }
        : {}),
    });
    return { ok: true, id: info.messageId };
  } catch (err) {
    logger.error({ err, to: args.to }, "[email] SMTP send failed");
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

// ─── Inbound email (not supported via Gmail SMTP) ─────────────────────────────
//
// Gmail SMTP can only send; inbound polling is not available. These functions
// return null / [] so callers that relied on Resend's receiving API gracefully
// produce an empty inbox rather than crashing.

export interface FetchedInboundEmail {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  messageId: string;
  createdAt: string;
  attachments: { id: string; filename: string; contentType: string }[];
}

export async function fetchInboundEmail(_emailId: string): Promise<FetchedInboundEmail | null> {
  logger.warn("[email] fetchInboundEmail: inbound receiving not available with Gmail SMTP");
  return null;
}

export interface InboundEmailSummary {
  id: string;
  from: string;
  subject: string;
  createdAt: string;
}

export async function listInboundEmails(_limit = 50): Promise<InboundEmailSummary[]> {
  logger.debug("[email] listInboundEmails: inbound receiving not available with Gmail SMTP");
  return [];
}

export async function fetchInboundAttachment(
  _emailId: string,
  _attachmentId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  logger.warn("[email] fetchInboundAttachment: inbound receiving not available with Gmail SMTP");
  return null;
}

// ─── Threading ──────────────────────────────────────────────────────────────

/**
 * Recompute a thread's denormalized aggregates (folder flags, message count,
 * unread state, last-message preview) from its messages. Called after every
 * insert / status change so the Inbox/Sent/Drafts/Failed sidebar stays exact.
 */
export async function recomputeThreadAggregates(threadId: number): Promise<void> {
  const msgs = await db
    .select()
    .from(emailMessagesTable)
    .where(eq(emailMessagesTable.threadId, threadId))
    .orderBy(asc(emailMessagesTable.createdAt));

  if (msgs.length === 0) {
    // Orphaned thread (e.g. its only draft was discarded) — remove it.
    await db.delete(emailThreadsTable).where(eq(emailThreadsTable.id, threadId));
    return;
  }

  const sentStatuses = new Set(["sent", "delivered", "opened", "clicked", "queued"]);
  const failedStatuses = new Set(["failed", "bounced", "complained"]);

  let hasInbound = false;
  let hasSent = false;
  let hasDraft = false;
  let hasFailed = false;
  let hasUnread = false;
  // Last NON-draft message defines the conversation's surface preview.
  let last = msgs[msgs.length - 1]!;
  for (const m of msgs) {
    if (m.direction === "inbound") {
      hasInbound = true;
      if (!m.isRead) hasUnread = true;
    } else {
      if (m.status === "draft") hasDraft = true;
      else if (sentStatuses.has(m.status)) hasSent = true;
      if (failedStatuses.has(m.status)) hasFailed = true;
    }
  }
  const nonDraft = msgs.filter((m) => m.status !== "draft");
  if (nonDraft.length > 0) last = nonDraft[nonDraft.length - 1]!;

  await db
    .update(emailThreadsTable)
    .set({
      messageCount: msgs.length,
      hasInbound,
      hasSent,
      hasDraft,
      hasFailed,
      hasUnread,
      lastMessageAt: last.createdAt,
      lastMessagePreview: last.snippet,
      lastDirection: last.direction,
    })
    .where(eq(emailThreadsTable.id, threadId));
}

/**
 * Find the thread an inbound email belongs to, or create one.
 * Match priority: 1) In-Reply-To / References header → known message,
 * 2) normalized subject + counterparty email, 3) new thread.
 */
export async function resolveInboundThread(params: {
  fromEmail: string;
  fromName: string;
  subject: string;
  inReplyTo: string;
  references: string[];
}): Promise<number> {
  const refIds = [params.inReplyTo, ...params.references].filter(Boolean);
  if (refIds.length > 0) {
    const byHeader = await db
      .select({ threadId: emailMessagesTable.threadId })
      .from(emailMessagesTable)
      .where(inArray(emailMessagesTable.messageId, refIds))
      .limit(1);
    if (byHeader[0]?.threadId) return byHeader[0].threadId;
  }

  const norm = normalizeSubject(params.subject);
  if (norm) {
    const bySubject = await db
      .select({ id: emailThreadsTable.id })
      .from(emailThreadsTable)
      .where(
        sql`${emailThreadsTable.normalizedSubject} = ${norm} AND lower(${emailThreadsTable.counterpartyEmail}) = ${params.fromEmail.toLowerCase()}`,
      )
      .orderBy(desc(emailThreadsTable.lastMessageAt))
      .limit(1);
    if (bySubject[0]?.id) return bySubject[0].id;
  }

  const [created] = await db
    .insert(emailThreadsTable)
    .values({
      subject: params.subject || "(no subject)",
      normalizedSubject: norm,
      counterpartyEmail: params.fromEmail.toLowerCase(),
      counterpartyName: params.fromName,
    })
    .returning({ id: emailThreadsTable.id });
  return created!.id;
}

// ─── Webhook verification (no-op — Gmail SMTP has no inbound webhooks) ────────

export function verifyResendWebhook(_params: {
  rawBody: Buffer | string | undefined;
  svixId: string | undefined;
  svixTimestamp: string | undefined;
  svixSignature: string | undefined;
}): { ok: boolean; reason?: string } {
  // Inbound webhooks were a Resend feature. With Gmail SMTP there are no
  // inbound webhooks, so we always return ok so existing webhook routes don't
  // crash. The createHmac / timingSafeEqual imports are kept to avoid removing
  // the import that may be used elsewhere.
  void createHmac; void timingSafeEqual;
  return { ok: true, reason: "no-inbound-webhooks" };
}

// ─── Boot-time idempotent schema ensure ────────────────────────────────────────

/**
 * Creates the email_* tables if they don't exist. Runs on every boot so a
 * deploy doesn't require a manual `drizzle-kit migrate`. Mirrors
 * lib/db/drizzle/0037_email_management.sql exactly.
 */
export async function ensureEmailSchema(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "email_threads" (
        "id" serial PRIMARY KEY NOT NULL,
        "subject" text NOT NULL DEFAULT '',
        "normalized_subject" varchar(500) NOT NULL DEFAULT '',
        "counterparty_email" varchar(320) NOT NULL DEFAULT '',
        "counterparty_name" varchar(255) NOT NULL DEFAULT '',
        "last_message_at" timestamp with time zone NOT NULL DEFAULT now(),
        "last_message_preview" varchar(300) NOT NULL DEFAULT '',
        "last_direction" varchar(10) NOT NULL DEFAULT 'inbound',
        "message_count" integer NOT NULL DEFAULT 0,
        "has_unread" boolean NOT NULL DEFAULT false,
        "has_inbound" boolean NOT NULL DEFAULT false,
        "has_sent" boolean NOT NULL DEFAULT false,
        "has_draft" boolean NOT NULL DEFAULT false,
        "has_failed" boolean NOT NULL DEFAULT false,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "email_messages" (
        "id" serial PRIMARY KEY NOT NULL,
        "thread_id" integer REFERENCES "email_threads"("id") ON DELETE CASCADE,
        "direction" varchar(10) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'received',
        "from_email" varchar(320) NOT NULL DEFAULT '',
        "from_name" varchar(255) NOT NULL DEFAULT '',
        "to_emails" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "cc_emails" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "bcc_emails" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "subject" text NOT NULL DEFAULT '',
        "body_text" text NOT NULL DEFAULT '',
        "body_html" text NOT NULL DEFAULT '',
        "snippet" varchar(300) NOT NULL DEFAULT '',
        "resend_id" varchar(255) NOT NULL DEFAULT '',
        "message_id" varchar(998) NOT NULL DEFAULT '',
        "in_reply_to" varchar(998) NOT NULL DEFAULT '',
        "references_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "is_read" boolean NOT NULL DEFAULT false,
        "error_message" text NOT NULL DEFAULT '',
        "opened_at" timestamp with time zone,
        "clicked_at" timestamp with time zone,
        "delivered_at" timestamp with time zone,
        "sent_by_user_id" integer,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "email_attachments" (
        "id" serial PRIMARY KEY NOT NULL,
        "message_id" integer REFERENCES "email_messages"("id") ON DELETE CASCADE,
        "filename" varchar(500) NOT NULL DEFAULT 'attachment',
        "content_type" varchar(200) NOT NULL DEFAULT 'application/octet-stream',
        "size_bytes" integer NOT NULL DEFAULT 0,
        "storage_key" text NOT NULL DEFAULT '',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "email_threads_last_msg_idx" ON "email_threads" ("last_message_at")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "email_threads_counterparty_idx" ON "email_threads" ("counterparty_email")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "email_threads_norm_subject_idx" ON "email_threads" ("normalized_subject")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "email_messages_thread_idx" ON "email_messages" ("thread_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "email_messages_resend_idx" ON "email_messages" ("resend_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "email_messages_message_id_idx" ON "email_messages" ("message_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "email_attachments_message_idx" ON "email_attachments" ("message_id")`);
    logger.info("[email] schema ensured");
  } catch (err) {
    logger.error({ err }, "[email] ensureEmailSchema failed");
  }
}
