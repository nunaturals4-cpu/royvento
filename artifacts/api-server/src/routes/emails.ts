/**
 * Email Management System — HTTP routes.
 *
 *   Admin (requireAuth(["admin"])):
 *     GET    /admin/emails/stats                folder counts
 *     GET    /admin/emails/threads              list conversations (inbox/sent) + search/paging
 *     GET    /admin/emails/messages             list flat messages (drafts/failed)
 *     GET    /admin/emails/threads/:id          full conversation + attachments
 *     POST   /admin/emails/threads/:id/read     mark thread read / unread
 *     POST   /admin/emails/send                 compose new OR reply (threadId)
 *     POST   /admin/emails/drafts               save a draft
 *     PUT    /admin/emails/drafts/:id           update a draft
 *     POST   /admin/emails/drafts/:id/send      send an existing draft
 *     DELETE /admin/emails/messages/:id         delete a message
 *     DELETE /admin/emails/threads/:id          delete a whole thread
 *     GET    /admin/emails/templates            built-in templates
 *     GET    /admin/emails/attachments/:id      download an attachment
 *
 *   Public webhooks (Svix-verified):
 *     POST   /webhooks/resend                   delivery/open/click/bounce + inbound
 *     POST   /webhooks/resend/inbound           inbound alias
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import {
  db,
  emailThreadsTable,
  emailMessagesTable,
  emailAttachmentsTable,
} from "@workspace/db";
import { eq, and, or, sql, desc, asc, inArray, ilike } from "drizzle-orm";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { respondInvalid } from "../lib/validationError";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import {
  sendEmailViaResend,
  recomputeThreadAggregates,
  resolveInboundThread,
  normalizeSubject,
  makeSnippet,
  htmlToText,
  parseAddress,
  verifyResendWebhook,
  wrapHtmlEmail,
  fetchInboundEmail,
  fetchInboundAttachment,
  listInboundEmails,
  BUILT_IN_TEMPLATES,
  INFO_EMAIL_ADDRESS,
  type SendAttachment,
} from "../lib/emailService";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

const PAGE_SIZE = 25;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB per attachment
const MAX_TOTAL_ATTACHMENT_BYTES = 40 * 1024 * 1024; // 40 MB per message (Resend limit)

// ─── Validation ───────────────────────────────────────────────────────────────

const emailListSchema = z.array(z.string().email()).max(50);

const attachmentSchema = z.object({
  filename: z.string().min(1).max(500),
  contentType: z.string().max(200).optional(),
  contentBase64: z.string().min(1),
});

const sendBodySchema = z.object({
  threadId: z.number().int().positive().optional(),
  to: emailListSchema.min(1),
  cc: emailListSchema.optional(),
  bcc: emailListSchema.optional(),
  subject: z.string().max(500).default(""),
  bodyText: z.string().max(500_000).optional(),
  bodyHtml: z.string().max(2_000_000).optional(),
  isHtml: z.boolean().default(false),
  attachments: z.array(attachmentSchema).max(20).optional(),
});

const draftBodySchema = z.object({
  threadId: z.number().int().positive().optional(),
  to: z.array(z.string()).max(50).default([]),
  cc: z.array(z.string()).max(50).optional(),
  bcc: z.array(z.string()).max(50).optional(),
  subject: z.string().max(500).default(""),
  bodyText: z.string().max(500_000).optional(),
  bodyHtml: z.string().max(2_000_000).optional(),
  isHtml: z.boolean().default(false),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function approxBase64Bytes(b64: string): number {
  const len = b64.length;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

/** Persist attachment bytes to object storage + DB rows, linked to a message. */
async function storeAttachments(messageId: number, attachments: SendAttachment[]): Promise<void> {
  for (const a of attachments) {
    const buffer = Buffer.from(a.content, "base64");
    const uuid = randomUUID();
    const contentType = a.contentType || "application/octet-stream";
    await objectStorage.uploadBuffer(uuid, buffer, contentType);
    await db.insert(emailAttachmentsTable).values({
      messageId,
      filename: a.filename.slice(0, 500),
      contentType: contentType.slice(0, 200),
      sizeBytes: buffer.length,
      storageKey: `/objects/uploads/${uuid}`,
    });
  }
}

async function attachmentsForMessages(messageIds: number[]) {
  if (messageIds.length === 0) return new Map<number, Array<{ id: number; filename: string; contentType: string; sizeBytes: number }>>();
  const rows = await db
    .select({
      id: emailAttachmentsTable.id,
      messageId: emailAttachmentsTable.messageId,
      filename: emailAttachmentsTable.filename,
      contentType: emailAttachmentsTable.contentType,
      sizeBytes: emailAttachmentsTable.sizeBytes,
    })
    .from(emailAttachmentsTable)
    .where(inArray(emailAttachmentsTable.messageId, messageIds));
  const map = new Map<number, Array<{ id: number; filename: string; contentType: string; sizeBytes: number }>>();
  for (const r of rows) {
    if (r.messageId == null) continue;
    const list = map.get(r.messageId) ?? [];
    list.push({ id: r.id, filename: r.filename, contentType: r.contentType, sizeBytes: r.sizeBytes });
    map.set(r.messageId, list);
  }
  return map;
}

// ─── Stats ──────────────────────────────────────────────────────────────────

router.get("/admin/emails/stats", requireAuth(["admin"]), async (_req, res) => {
  const [row] = await db
    .select({
      inboxTotal: sql<number>`coalesce(sum(case when ${emailThreadsTable.hasInbound} then 1 else 0 end),0)::int`,
      inboxUnread: sql<number>`coalesce(sum(case when ${emailThreadsTable.hasInbound} and ${emailThreadsTable.hasUnread} then 1 else 0 end),0)::int`,
      sentTotal: sql<number>`coalesce(sum(case when ${emailThreadsTable.hasSent} then 1 else 0 end),0)::int`,
      draftTotal: sql<number>`coalesce(sum(case when ${emailThreadsTable.hasDraft} then 1 else 0 end),0)::int`,
      failedTotal: sql<number>`coalesce(sum(case when ${emailThreadsTable.hasFailed} then 1 else 0 end),0)::int`,
    })
    .from(emailThreadsTable);
  res.json({
    inbox: row?.inboxTotal ?? 0,
    unread: row?.inboxUnread ?? 0,
    sent: row?.sentTotal ?? 0,
    drafts: row?.draftTotal ?? 0,
    failed: row?.failedTotal ?? 0,
  });
});

// ─── Thread list (inbox / sent) ────────────────────────────────────────────────

router.get("/admin/emails/threads", requireAuth(["admin"]), async (req, res) => {
  const folder = String(req.query["folder"] ?? "inbox");
  const q = (req.query["q"] as string | undefined)?.trim();
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const folderCond =
    folder === "sent" ? eq(emailThreadsTable.hasSent, true)
    : folder === "drafts" ? eq(emailThreadsTable.hasDraft, true)
    : folder === "failed" ? eq(emailThreadsTable.hasFailed, true)
    : eq(emailThreadsTable.hasInbound, true);

  const searchCond = q
    ? or(
        ilike(emailThreadsTable.subject, `%${q}%`),
        ilike(emailThreadsTable.counterpartyEmail, `%${q}%`),
        ilike(emailThreadsTable.counterpartyName, `%${q}%`),
        ilike(emailThreadsTable.lastMessagePreview, `%${q}%`),
      )
    : undefined;

  const where = searchCond ? and(folderCond, searchCond) : folderCond;

  const [rows, countRow] = await Promise.all([
    db
      .select()
      .from(emailThreadsTable)
      .where(where)
      .orderBy(desc(emailThreadsTable.lastMessageAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ c: sql<number>`count(*)::int` }).from(emailThreadsTable).where(where),
  ]);

  const total = countRow[0]?.c ?? 0;
  res.json({
    threads: rows.map((t) => ({
      id: t.id,
      subject: t.subject,
      counterpartyEmail: t.counterpartyEmail,
      counterpartyName: t.counterpartyName,
      preview: t.lastMessagePreview,
      lastMessageAt: t.lastMessageAt,
      lastDirection: t.lastDirection,
      messageCount: t.messageCount,
      hasUnread: t.hasUnread,
      hasDraft: t.hasDraft,
      hasFailed: t.hasFailed,
    })),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
});

// ─── Full conversation ─────────────────────────────────────────────────────────

router.get("/admin/emails/threads/:id", requireAuth(["admin"]), async (req, res) => {
  const threadId = Number(req.params["id"]);
  if (!Number.isFinite(threadId)) {
    res.status(400).json({ error: "Invalid thread id" });
    return;
  }
  const [thread] = await db.select().from(emailThreadsTable).where(eq(emailThreadsTable.id, threadId)).limit(1);
  if (!thread) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  const messages = await db
    .select()
    .from(emailMessagesTable)
    .where(eq(emailMessagesTable.threadId, threadId))
    .orderBy(asc(emailMessagesTable.createdAt));

  const attMap = await attachmentsForMessages(messages.map((m) => m.id));

  res.json({
    thread: {
      id: thread.id,
      subject: thread.subject,
      counterpartyEmail: thread.counterpartyEmail,
      counterpartyName: thread.counterpartyName,
      messageCount: thread.messageCount,
    },
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      status: m.status,
      fromEmail: m.fromEmail,
      fromName: m.fromName,
      toEmails: m.toEmails,
      ccEmails: m.ccEmails,
      bccEmails: m.bccEmails,
      subject: m.subject,
      bodyText: m.bodyText,
      bodyHtml: m.bodyHtml,
      snippet: m.snippet,
      isRead: m.isRead,
      errorMessage: m.errorMessage,
      openedAt: m.openedAt,
      clickedAt: m.clickedAt,
      deliveredAt: m.deliveredAt,
      createdAt: m.createdAt,
      messageId: m.messageId,
      attachments: attMap.get(m.id) ?? [],
    })),
  });
});

// ─── Mark read / unread ─────────────────────────────────────────────────────────

router.post("/admin/emails/threads/:id/read", requireAuth(["admin"]), async (req, res) => {
  const threadId = Number(req.params["id"]);
  if (!Number.isFinite(threadId)) {
    res.status(400).json({ error: "Invalid thread id" });
    return;
  }
  const read = req.body?.read !== false; // default → mark read
  await db
    .update(emailMessagesTable)
    .set({ isRead: read })
    .where(and(eq(emailMessagesTable.threadId, threadId), eq(emailMessagesTable.direction, "inbound")));
  await recomputeThreadAggregates(threadId);
  res.json({ ok: true });
});

// ─── Drafts: flat message list (drafts / failed) ────────────────────────────────

router.get("/admin/emails/messages", requireAuth(["admin"]), async (req, res) => {
  const folder = String(req.query["folder"] ?? "drafts");
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const cond =
    folder === "failed"
      ? and(eq(emailMessagesTable.direction, "outbound"), inArray(emailMessagesTable.status, ["failed", "bounced", "complained"]))
      : eq(emailMessagesTable.status, "draft");

  const [rows, countRow] = await Promise.all([
    db
      .select()
      .from(emailMessagesTable)
      .where(cond)
      .orderBy(desc(emailMessagesTable.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ c: sql<number>`count(*)::int` }).from(emailMessagesTable).where(cond),
  ]);

  const total = countRow[0]?.c ?? 0;
  res.json({
    messages: rows.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      status: m.status,
      toEmails: m.toEmails,
      ccEmails: m.ccEmails,
      bccEmails: m.bccEmails,
      subject: m.subject,
      preview: m.snippet,
      bodyText: m.bodyText,
      bodyHtml: m.bodyHtml,
      errorMessage: m.errorMessage,
      createdAt: m.createdAt,
    })),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
});

// ─── Templates ─────────────────────────────────────────────────────────────────

router.get("/admin/emails/templates", requireAuth(["admin"]), (_req, res) => {
  res.json({ templates: BUILT_IN_TEMPLATES });
});

// ─── Send (compose new or reply) ────────────────────────────────────────────────

router.post("/admin/emails/send", requireAuth(["admin"]), async (req, res) => {
  const parsed = sendBodySchema.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const body = parsed.data;
  const user = await loadUserFromRequest(req);

  // Build text + (optionally wrapped) HTML payloads.
  const isHtml = body.isHtml && !!body.bodyHtml;
  const rawHtml = body.bodyHtml ?? "";
  const finalHtml = isHtml ? wrapHtmlEmail(rawHtml) : undefined;
  const finalText = body.bodyText && body.bodyText.length > 0
    ? body.bodyText
    : (isHtml ? htmlToText(rawHtml) : "");

  // Validate attachment sizes before doing any work.
  let totalBytes = 0;
  for (const a of body.attachments ?? []) {
    const bytes = approxBase64Bytes(a.contentBase64);
    if (bytes > MAX_ATTACHMENT_BYTES) {
      res.status(400).json({ error: `Attachment "${a.filename}" exceeds 20 MB limit` });
      return;
    }
    totalBytes += bytes;
  }
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    res.status(400).json({ error: "Total attachments exceed 40 MB limit" });
    return;
  }

  // Resolve thread + reply threading headers.
  let threadId = body.threadId ?? null;
  let inReplyTo: string | undefined;
  let references: string[] | undefined;
  let subject = body.subject;

  if (threadId) {
    const [thread] = await db.select().from(emailThreadsTable).where(eq(emailThreadsTable.id, threadId)).limit(1);
    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    // Anchor the reply to the most recent inbound message's Message-ID.
    const [lastInbound] = await db
      .select({ messageId: emailMessagesTable.messageId, referencesIds: emailMessagesTable.referencesIds })
      .from(emailMessagesTable)
      .where(and(eq(emailMessagesTable.threadId, threadId), eq(emailMessagesTable.direction, "inbound")))
      .orderBy(desc(emailMessagesTable.createdAt))
      .limit(1);
    if (lastInbound?.messageId) {
      inReplyTo = lastInbound.messageId;
      references = [...(lastInbound.referencesIds ?? []), lastInbound.messageId];
    }
    if (!subject) subject = thread.subject;
  }

  const attachmentsForSend: SendAttachment[] = (body.attachments ?? []).map((a) => ({
    filename: a.filename,
    content: a.contentBase64,
    contentType: a.contentType,
  }));

  const sendResult = await sendEmailViaResend({
    to: body.to,
    cc: body.cc,
    bcc: body.bcc,
    subject: subject || "(no subject)",
    html: finalHtml,
    text: finalText,
    inReplyTo,
    references,
    attachments: attachmentsForSend,
  });

  // Create the thread now if this is a brand-new conversation.
  if (!threadId) {
    const primary = body.to[0]!;
    const [created] = await db
      .insert(emailThreadsTable)
      .values({
        subject: subject || "(no subject)",
        normalizedSubject: normalizeSubject(subject),
        counterpartyEmail: primary.toLowerCase(),
        counterpartyName: "",
      })
      .returning({ id: emailThreadsTable.id });
    threadId = created!.id;
  }

  const snippet = makeSnippet(finalText, rawHtml);
  const [msg] = await db
    .insert(emailMessagesTable)
    .values({
      threadId,
      direction: "outbound",
      status: sendResult.ok ? "sent" : "failed",
      fromEmail: INFO_EMAIL_ADDRESS,
      fromName: "Royvento",
      toEmails: body.to,
      ccEmails: body.cc ?? [],
      bccEmails: body.bcc ?? [],
      subject: subject || "(no subject)",
      bodyText: finalText,
      bodyHtml: finalHtml ?? "",
      snippet,
      resendId: sendResult.id ?? "",
      inReplyTo: inReplyTo ?? "",
      referencesIds: references ?? [],
      isRead: true,
      errorMessage: sendResult.ok ? "" : (sendResult.error ?? "Send failed"),
      sentByUserId: user?.id ?? null,
    })
    .returning({ id: emailMessagesTable.id });

  if ((body.attachments ?? []).length > 0 && msg) {
    try {
      await storeAttachments(msg.id, attachmentsForSend);
    } catch (err) {
      req.log.error({ err, messageId: msg.id }, "[email] failed to persist outbound attachments");
    }
  }

  await recomputeThreadAggregates(threadId!);

  if (!sendResult.ok) {
    res.status(502).json({ ok: false, threadId, messageId: msg?.id, error: sendResult.error });
    return;
  }
  res.json({ ok: true, threadId, messageId: msg?.id });
});

// ─── Drafts: create ─────────────────────────────────────────────────────────────

router.post("/admin/emails/drafts", requireAuth(["admin"]), async (req, res) => {
  const parsed = draftBodySchema.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const body = parsed.data;
  const user = await loadUserFromRequest(req);

  let threadId = body.threadId ?? null;
  if (!threadId) {
    const primary = (body.to[0] ?? "").toLowerCase();
    const [created] = await db
      .insert(emailThreadsTable)
      .values({
        subject: body.subject || "(draft)",
        normalizedSubject: normalizeSubject(body.subject),
        counterpartyEmail: primary,
        counterpartyName: "",
      })
      .returning({ id: emailThreadsTable.id });
    threadId = created!.id;
  }

  const snippet = makeSnippet(body.bodyText ?? "", body.bodyHtml ?? "");
  const [msg] = await db
    .insert(emailMessagesTable)
    .values({
      threadId,
      direction: "outbound",
      status: "draft",
      fromEmail: INFO_EMAIL_ADDRESS,
      fromName: "Royvento",
      toEmails: body.to,
      ccEmails: body.cc ?? [],
      bccEmails: body.bcc ?? [],
      subject: body.subject,
      bodyText: body.bodyText ?? "",
      bodyHtml: body.isHtml ? (body.bodyHtml ?? "") : "",
      snippet,
      isRead: true,
      sentByUserId: user?.id ?? null,
    })
    .returning({ id: emailMessagesTable.id });

  await recomputeThreadAggregates(threadId!);
  res.json({ ok: true, threadId, messageId: msg?.id });
});

// ─── Drafts: update ─────────────────────────────────────────────────────────────

router.put("/admin/emails/drafts/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = draftBodySchema.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const body = parsed.data;
  const [existing] = await db.select().from(emailMessagesTable).where(eq(emailMessagesTable.id, id)).limit(1);
  if (!existing || existing.status !== "draft") {
    res.status(404).json({ error: "Draft not found" });
    return;
  }
  const snippet = makeSnippet(body.bodyText ?? "", body.bodyHtml ?? "");
  await db
    .update(emailMessagesTable)
    .set({
      toEmails: body.to,
      ccEmails: body.cc ?? [],
      bccEmails: body.bcc ?? [],
      subject: body.subject,
      bodyText: body.bodyText ?? "",
      bodyHtml: body.isHtml ? (body.bodyHtml ?? "") : "",
      snippet,
    })
    .where(eq(emailMessagesTable.id, id));
  if (existing.threadId) await recomputeThreadAggregates(existing.threadId);
  res.json({ ok: true });
});

// ─── Delete a message ─────────────────────────────────────────────────────────

router.delete("/admin/emails/messages/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [existing] = await db.select({ threadId: emailMessagesTable.threadId }).from(emailMessagesTable).where(eq(emailMessagesTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  await db.delete(emailMessagesTable).where(eq(emailMessagesTable.id, id));
  if (existing.threadId) await recomputeThreadAggregates(existing.threadId);
  res.json({ ok: true });
});

// ─── Delete a thread ────────────────────────────────────────────────────────────

router.delete("/admin/emails/threads/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(emailThreadsTable).where(eq(emailThreadsTable.id, id));
  res.json({ ok: true });
});

// ─── Attachment download ─────────────────────────────────────────────────────────

router.get("/admin/emails/attachments/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [att] = await db.select().from(emailAttachmentsTable).where(eq(emailAttachmentsTable.id, id)).limit(1);
  if (!att) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }
  if (!att.storageKey) {
    res.status(404).json({ error: "Attachment content unavailable" });
    return;
  }
  // Inbound (Resend-hosted) attachments may be stored as absolute URLs.
  if (/^https?:\/\//i.test(att.storageKey)) {
    res.redirect(att.storageKey);
    return;
  }
  try {
    const file = await objectStorage.getObjectEntityFile(att.storageKey);
    const response = await objectStorage.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Content-Disposition", `attachment; filename="${att.filename.replace(/"/g, "")}"`);
    if (response.body) {
      Readable.fromWeb(response.body as unknown as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    req.log.error({ err, attachmentId: id }, "[email] attachment download failed");
    res.status(500).json({ error: "Failed to download attachment" });
  }
});

// ─── Resend webhooks (delivery tracking + inbound) ──────────────────────────────

const OUTBOUND_STATUS_BY_EVENT: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "sent",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};

async function handleResendWebhook(req: Request, res: Response): Promise<void> {
  const verification = verifyResendWebhook({
    rawBody: (req as unknown as { rawBody?: Buffer }).rawBody,
    svixId: req.headers["svix-id"] as string | undefined,
    svixTimestamp: req.headers["svix-timestamp"] as string | undefined,
    svixSignature: req.headers["svix-signature"] as string | undefined,
  });
  if (!verification.ok) {
    req.log.warn({ reason: verification.reason }, "[email] webhook signature rejected");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }
  if (verification.reason === "no-secret-dev-mode") {
    req.log.warn("[email] RESEND_WEBHOOK_SECRET not set — accepting webhook unverified (dev only)");
  }

  const payload = req.body as { type?: string; data?: Record<string, unknown> } | undefined;
  const type = payload?.type ?? "";
  const data = payload?.data ?? {};

  try {
    if (type.startsWith("inbound") || type === "email.received" || type === "email.inbound") {
      await processInboundEmail(data, req);
    } else if (OUTBOUND_STATUS_BY_EVENT[type]) {
      await processDeliveryEvent(type, data);
    } else {
      req.log.info({ type }, "[email] unhandled webhook event type");
    }
  } catch (err) {
    req.log.error({ err, type }, "[email] webhook processing failed");
    // Still 200 so Resend doesn't hammer retries for a non-transient bug.
  }
  res.json({ ok: true });
}

async function processDeliveryEvent(type: string, data: Record<string, unknown>): Promise<void> {
  const emailId = (data["email_id"] ?? data["id"]) as string | undefined;
  if (!emailId) return;
  const status = OUTBOUND_STATUS_BY_EVENT[type]!;
  const now = new Date();
  const set: Record<string, unknown> = { status };
  if (type === "email.opened") set["openedAt"] = now;
  if (type === "email.clicked") set["clickedAt"] = now;
  if (type === "email.delivered") set["deliveredAt"] = now;
  if (type === "email.bounced" || type === "email.failed") set["errorMessage"] = "Delivery failed (bounce)";

  const updated = await db
    .update(emailMessagesTable)
    .set(set)
    .where(eq(emailMessagesTable.resendId, emailId))
    .returning({ threadId: emailMessagesTable.threadId });
  for (const r of updated) {
    if (r.threadId) await recomputeThreadAggregates(r.threadId);
  }
}

function pickHeader(headers: unknown, name: string): string {
  const lower = name.toLowerCase();
  if (Array.isArray(headers)) {
    for (const h of headers) {
      const hn = (h?.name ?? h?.key ?? "") as string;
      if (typeof hn === "string" && hn.toLowerCase() === lower) return String(h?.value ?? "");
    }
  } else if (headers && typeof headers === "object") {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (k.toLowerCase() === lower) return String(v ?? "");
    }
  }
  return "";
}

function asEmailArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : (v as { email?: string })?.email ?? ""))
      .map((s) => String(s).trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((s) => parseAddress(s).email).filter(Boolean);
  }
  return [];
}

async function processInboundEmail(data: Record<string, unknown>, req: Request): Promise<void> {
  const emailId = (data["email_id"] ?? data["id"]) as string | undefined;
  if (!emailId) {
    req.log.warn("[email] inbound webhook missing email_id — skipped");
    return;
  }
  await ingestInboundEmailById(emailId);
}

/**
 * Fetch one received email from Resend by id and store it (idempotently).
 * Shared by the webhook handler and the sync/poll path. Dedupes on the Resend
 * email id stored in `resendId`, so re-running is safe. Returns the new
 * message id, or null when skipped (already stored / no content).
 */
async function ingestInboundEmailById(emailId: string): Promise<number | null> {
  const [existing] = await db
    .select({ id: emailMessagesTable.id })
    .from(emailMessagesTable)
    .where(and(eq(emailMessagesTable.resendId, emailId), eq(emailMessagesTable.direction, "inbound")))
    .limit(1);
  if (existing) return null;

  const full = await fetchInboundEmail(emailId);
  if (!full) {
    logger.warn({ emailId }, "[email] could not fetch inbound content");
    return null;
  }

  const from = parseAddress(full.from);
  if (!from.email) {
    logger.warn({ emailId }, "[email] inbound email missing sender — skipped");
    return null;
  }
  const subject = full.subject || "(no subject)";
  const inReplyTo = pickHeader(full.headers, "In-Reply-To");
  const refHeader = pickHeader(full.headers, "References");
  const references = refHeader ? refHeader.split(/\s+/).filter(Boolean) : [];
  const to = full.to.map((s) => s.toLowerCase());
  const cc = full.cc.map((s) => s.toLowerCase());

  const threadId = await resolveInboundThread({
    fromEmail: from.email,
    fromName: from.name,
    subject,
    inReplyTo,
    references,
  });

  // Use the email's real received time so the inbox orders correctly. Resend
  // returns e.g. "2026-05-20 06:54:50.068334+00" — normalise for Date().
  const receivedAt = (() => {
    if (!full.createdAt) return undefined;
    const d = new Date(full.createdAt.replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? undefined : d;
  })();

  const snippet = makeSnippet(full.text, full.html);
  const [msg] = await db
    .insert(emailMessagesTable)
    .values({
      threadId,
      direction: "inbound",
      status: "received",
      fromEmail: from.email,
      fromName: from.name,
      toEmails: to.length ? to : [INFO_EMAIL_ADDRESS],
      ccEmails: cc,
      bccEmails: [],
      subject,
      bodyText: full.text || htmlToText(full.html),
      bodyHtml: full.html,
      snippet,
      resendId: emailId,
      messageId: full.messageId.slice(0, 998),
      inReplyTo: inReplyTo.slice(0, 998),
      referencesIds: references,
      isRead: false,
      ...(receivedAt ? { createdAt: receivedAt } : {}),
    })
    .returning({ id: emailMessagesTable.id });

  if (msg) {
    for (const a of full.attachments) {
      try {
        const fetched = await fetchInboundAttachment(emailId, a.id);
        if (fetched) {
          const uuid = randomUUID();
          await objectStorage.uploadBuffer(uuid, fetched.buffer, fetched.contentType);
          await db.insert(emailAttachmentsTable).values({
            messageId: msg.id,
            filename: a.filename.slice(0, 500),
            contentType: (fetched.contentType || a.contentType).slice(0, 200),
            sizeBytes: fetched.buffer.length,
            storageKey: `/objects/uploads/${uuid}`,
          });
        } else {
          await db.insert(emailAttachmentsTable).values({
            messageId: msg.id,
            filename: a.filename.slice(0, 500),
            contentType: a.contentType.slice(0, 200),
            sizeBytes: 0,
            storageKey: "",
          });
        }
      } catch (err) {
        logger.error({ err, emailId }, "[email] failed to store inbound attachment");
      }
    }
  }

  await recomputeThreadAggregates(threadId);
  return msg?.id ?? null;
}

/**
 * Pull recent received emails from Resend and store any not already saved.
 * The dashboard's reliable receive path: works regardless of whether the
 * webhook is reaching us. Returns how many were found vs newly imported.
 */
export async function runInboundSync(): Promise<{ found: number; synced: number }> {
  const summaries = await listInboundEmails(100);
  let synced = 0;
  for (const s of summaries) {
    try {
      const id = await ingestInboundEmailById(s.id);
      if (id) synced++;
    } catch (err) {
      logger.error({ err, emailId: s.id }, "[email] sync ingest failed");
    }
  }
  if (summaries.length > 0) logger.info({ found: summaries.length, synced }, "[email] inbound sync complete");
  return { found: summaries.length, synced };
}

router.post("/admin/emails/sync", requireAuth(["admin"]), async (_req, res) => {
  const result = await runInboundSync();
  res.json({ ok: true, ...result });
});

router.post("/webhooks/resend", handleResendWebhook);
router.post("/webhooks/resend/inbound", handleResendWebhook);
router.post("/webhooks/resend/events", handleResendWebhook);

export default router;
