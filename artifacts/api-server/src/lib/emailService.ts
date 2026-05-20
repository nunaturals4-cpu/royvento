/**
 * Email Management System — service layer.
 *
 * Single source of truth for the Admin Panel → "Send & Receive Email" feature:
 *   • Sending via Resend from info@royvento.com (plain-text or rich HTML)
 *   • Threading (matching inbound replies to existing conversations)
 *   • Resend webhook signature verification (Svix scheme)
 *   • Thread aggregate / folder-flag recomputation
 *   • Built-in HTML templates + a responsive, dark/light email layout
 *   • Idempotent boot-time schema ensure (tables created if missing)
 *
 * Env:
 *   RESEND_API_KEY          Resend API key. Without it, sends are logged, not delivered.
 *   RESEND_INFO_EMAIL       From address. Defaults to "Royvento <info@royvento.com>".
 *   RESEND_WEBHOOK_SECRET   Svix signing secret (whsec_...) for verifying webhooks.
 */

import { Resend } from "resend";
import { createHmac, timingSafeEqual } from "crypto";
import { sql, eq, desc, asc } from "drizzle-orm";
import { db, emailThreadsTable, emailMessagesTable } from "@workspace/db";
import { logger } from "./logger";

// ─── Configuration ──────────────────────────────────────────────────────────

export const INFO_EMAIL_ADDRESS = "info@royvento.com";

export function getInfoFromAddress(): string {
  return process.env["RESEND_INFO_EMAIL"] ?? `Royvento <${INFO_EMAIL_ADDRESS}>`;
}

function getResendClient(): Resend | null {
  const key = process.env["RESEND_API_KEY"];
  if (!key) return null;
  return new Resend(key);
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

/**
 * Wraps rich body HTML in a branded, responsive shell. `supports-color-schemes`
 * + the media query make it render cleanly in both light and dark mail clients.
 */
export function wrapHtmlEmail(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light dark"/>
<meta name="supported-color-schemes" content="light dark"/>
<title>Royvento</title>
<style>
  @media (max-width:620px){ .rv-container{width:100%!important;} .rv-pad{padding:24px 20px!important;} }
  @media (prefers-color-scheme:dark){
    .rv-bg{background:#0b0b0b!important;}
    .rv-card{background:#161616!important;}
    .rv-text{color:#e7e7e7!important;}
    .rv-muted{color:#9a9a9a!important;}
    .rv-footer{background:#111!important;border-color:#222!important;}
  }
</style>
</head>
<body class="rv-bg" style="margin:0;padding:0;background:#f2f2f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" class="rv-bg" style="background:#f2f2f2;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" border="0" class="rv-container rv-card" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:#0f0f0f;padding:22px 32px;text-align:center;">
          <span style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">Roy</span><span style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#e53e3e;">vento</span>
        </td>
      </tr>
      <tr>
        <td class="rv-pad rv-text" style="padding:36px 32px;color:#1a1a1a;font-size:15px;line-height:1.7;">
          ${bodyHtml}
        </td>
      </tr>
      <tr>
        <td class="rv-footer rv-muted" style="padding:20px 32px;background:#f9f9f9;border-top:1px solid #eeeeee;text-align:center;color:#888888;font-size:12px;line-height:1.6;">
          &copy; ${new Date().getFullYear()} Royvento. All rights reserved.<br/>
          Sent from <a href="mailto:${INFO_EMAIL_ADDRESS}" style="color:#e53e3e;text-decoration:none;">${INFO_EMAIL_ADDRESS}</a>
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

// ─── Resend send wrapper ───────────────────────────────────────────────────────

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
  /** Resend email id, when delivery succeeded. */
  id?: string;
  error?: string;
}

export async function sendEmailViaResend(args: SendEmailArgs): Promise<SendEmailResult> {
  const client = getResendClient();
  const from = getInfoFromAddress();

  if (!client) {
    logger.info({ to: args.to, subject: args.subject }, "[email] dev mode — not actually sent (RESEND_API_KEY missing)");
    return { ok: true, id: `dev-${Date.now()}` };
  }

  const headers: Record<string, string> = {};
  if (args.inReplyTo) headers["In-Reply-To"] = args.inReplyTo;
  if (args.references && args.references.length > 0) headers["References"] = args.references.join(" ");

  try {
    const { data, error } = await client.emails.send({
      from,
      to: args.to,
      ...(args.cc && args.cc.length ? { cc: args.cc } : {}),
      ...(args.bcc && args.bcc.length ? { bcc: args.bcc } : {}),
      subject: args.subject,
      ...(args.html ? { html: args.html } : {}),
      ...(args.text ? { text: args.text } : {}),
      replyTo: from,
      ...(Object.keys(headers).length ? { headers } : {}),
      ...(args.attachments && args.attachments.length
        ? { attachments: args.attachments.map((a) => ({ filename: a.filename, content: a.content })) }
        : {}),
    } as Parameters<typeof client.emails.send>[0]);

    if (error) {
      logger.error({ err: error, to: args.to }, "[email] Resend send failed");
      return { ok: false, error: typeof error === "string" ? error : (error.message ?? "Send failed") };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    logger.error({ err, to: args.to }, "[email] Resend send threw");
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

// ─── Inbound fetch (Resend Receiving API) ──────────────────────────────────────
//
// The `email.received` webhook carries metadata only — sender, subject, and an
// attachment list — never the body. The actual content lives behind the
// Receiving API and must be fetched with the event's email_id.

export interface FetchedInboundEmail {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  messageId: string;
  attachments: { id: string; filename: string; contentType: string }[];
}

export async function fetchInboundEmail(emailId: string): Promise<FetchedInboundEmail | null> {
  const client = getResendClient();
  if (!client) return null;
  try {
    const { data, error } = await client.emails.receiving.get(emailId);
    if (error || !data) {
      logger.error({ err: error, emailId }, "[email] failed to fetch inbound email content");
      return null;
    }
    return {
      from: data.from ?? "",
      to: data.to ?? [],
      cc: data.cc ?? [],
      subject: data.subject ?? "",
      html: data.html ?? "",
      text: data.text ?? "",
      headers: (data.headers ?? {}) as Record<string, string>,
      messageId: data.message_id ?? "",
      attachments: (data.attachments ?? []).map((a) => ({
        id: a.id,
        filename: a.filename ?? "attachment",
        contentType: a.content_type ?? "application/octet-stream",
      })),
    };
  } catch (err) {
    logger.error({ err, emailId }, "[email] fetchInboundEmail threw");
    return null;
  }
}

/** Download an inbound attachment's bytes via its short-lived signed URL. */
export async function fetchInboundAttachment(
  emailId: string,
  attachmentId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const client = getResendClient();
  if (!client) return null;
  try {
    const { data, error } = await client.emails.receiving.attachments.get({ emailId, id: attachmentId });
    if (error || !data?.download_url) {
      logger.error({ err: error, emailId, attachmentId }, "[email] failed to get attachment download url");
      return null;
    }
    const res = await fetch(data.download_url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, contentType: data.content_type ?? "application/octet-stream" };
  } catch (err) {
    logger.error({ err, emailId, attachmentId }, "[email] fetchInboundAttachment threw");
    return null;
  }
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
      .where(sql`${emailMessagesTable.messageId} = ANY(${refIds})`)
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

// ─── Resend webhook signature verification (Svix scheme) ───────────────────────

/**
 * Verify a Resend (Svix) webhook signature. Returns true when valid, or when
 * RESEND_WEBHOOK_SECRET is unset (dev mode — logged as a warning by caller).
 *
 * Svix signs `${id}.${timestamp}.${rawBody}` with HMAC-SHA256 using the secret
 * bytes (base64-decoded from the part after the `whsec_` prefix). The
 * svix-signature header is space-separated `v1,<base64sig>` tokens.
 */
export function verifyResendWebhook(params: {
  rawBody: Buffer | string | undefined;
  svixId: string | undefined;
  svixTimestamp: string | undefined;
  svixSignature: string | undefined;
}): { ok: boolean; reason?: string } {
  const secret = process.env["RESEND_WEBHOOK_SECRET"];
  if (!secret) return { ok: true, reason: "no-secret-dev-mode" };

  const { rawBody, svixId, svixTimestamp, svixSignature } = params;
  if (!rawBody || !svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, reason: "missing-headers" };
  }

  // Reject stale timestamps (>5 min skew) to blunt replay attacks.
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return { ok: false, reason: "timestamp-skew" };
  }

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  const passed = svixSignature.split(" ").some((token) => {
    const sig = token.includes(",") ? token.split(",")[1] : token;
    if (!sig) return false;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });

  return passed ? { ok: true } : { ok: false, reason: "signature-mismatch" };
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
