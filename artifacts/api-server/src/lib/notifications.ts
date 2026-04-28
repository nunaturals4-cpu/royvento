import { Resend } from "resend";
import twilio from "twilio";

function getResendClient(): Resend | null {
  const key = process.env["RESEND_API_KEY"];
  if (!key) return null;
  return new Resend(key);
}

function getFromAddress(): string {
  return process.env["RESEND_FROM_EMAIL"] ?? "Royvento <onboarding@resend.dev>";
}

function getAppUrl(): string {
  if (process.env["APP_URL"]) return process.env["APP_URL"];
  const domain = process.env["REPLIT_DEV_DOMAIN"];
  if (domain) return `https://${domain}`;
  return "http://localhost:3000";
}

type EmailPayload = {
  to: string;
  toName?: string;
  subject: string;
  body: string;
};

function divider(char = "─", len = 64): string {
  return char.repeat(len);
}

function formatEmail(label: string, payload: EmailPayload): string {
  return [
    "",
    divider("═"),
    `📧  ${label}`,
    divider("─"),
    `To:      ${payload.toName ? `${payload.toName} <${payload.to}>` : payload.to}`,
    `Subject: ${payload.subject}`,
    divider("─"),
    payload.body,
    divider("═"),
    "",
  ].join("\n");
}

async function deliver(label: string, payload: EmailPayload): Promise<void> {
  const client = getResendClient();

  if (!client) {
    // No Resend key configured — print to console so notifications are
    // visible in workflow logs during development.
    // eslint-disable-next-line no-console
    console.log(formatEmail(label, payload));
    return;
  }

  const toAddress = payload.toName
    ? `${payload.toName} <${payload.to}>`
    : payload.to;

  const { error } = await client.emails.send({
    from: getFromAddress(),
    to: [toAddress],
    subject: payload.subject,
    text: payload.body,
  });

  if (error) {
    console.error(`[notifications] Failed to send "${label}" to ${payload.to}:`, error);
  } else {
    console.log(`[notifications] Sent "${label}" to ${payload.to}`);
  }
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fmtINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// ─── Forgot-password ────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(params: {
  to: string;
  toName: string;
  token: string;
}): Promise<void> {
  const resetUrl = `${getAppUrl()}/reset-password?token=${params.token}`;
  await deliver("Password Reset", {
    to: params.to,
    toName: params.toName,
    subject: "Reset your Royvento password",
    body: [
      `Hi ${params.toName.split(" ")[0]},`,
      ``,
      `We received a request to reset the password for your Royvento account.`,
      ``,
      `Click the link below to choose a new password (valid for 1 hour):`,
      ``,
      `  ${resetUrl}`,
      ``,
      `If you didn't request this, you can safely ignore this email — your password won't change.`,
      ``,
      `— The Royvento team`,
    ].join("\n"),
  });
}

// ─── Welcome email ───────────────────────────────────────────────────────────

export async function sendWelcomeEmail(params: {
  to: string;
  toName: string;
}): Promise<void> {
  await deliver("Welcome", {
    to: params.to,
    toName: params.toName,
    subject: "Welcome to Royvento!",
    body: [
      `Hi ${params.toName.split(" ")[0]},`,
      ``,
      `Welcome to Royvento! We're glad you're here.`,
      ``,
      `You can now browse and book events at top venues near you. Here's what you can do:`,
      ``,
      `  • Discover pubs, restaurants & event spaces`,
      `  • Book your spot in seconds`,
      `  • Earn loyalty points on every booking`,
      ``,
      `${getAppUrl()}`,
      ``,
      `See you soon!`,
      ``,
      `— The Royvento team`,
    ].join("\n"),
  });
}

// ─── Ticket scanned ──────────────────────────────────────────────────────────

export async function sendTicketScannedEmail(params: {
  to: string;
  toName: string;
  bookingId: number;
  eventTitle: string;
  vendorName: string;
  checkedInAt: Date;
}): Promise<void> {
  const refCode = `#RV-${String(params.bookingId).padStart(6, "0")}`;
  await deliver("Ticket Scanned", {
    to: params.to,
    toName: params.toName,
    subject: `You're checked in — ${params.eventTitle}`,
    body: [
      `Hi ${params.toName.split(" ")[0]},`,
      ``,
      `Your ticket has been scanned and you're officially checked in. Enjoy the event!`,
      ``,
      `  Reference: ${refCode}`,
      `  Event:     ${params.eventTitle}`,
      `  Venue:     ${params.vendorName}`,
      `  Checked in at: ${params.checkedInAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`,
      ``,
      `— The Royvento team`,
    ].join("\n"),
  });
}

// ─── Booking emails ──────────────────────────────────────────────────────────

export interface BookingNotification {
  bookingId: number;
  eventTitle: string;
  vendorName: string;
  vendorEmail: string;
  userName: string;
  userEmail: string;
  bookingDate: string;
  guests: number;
  totalPrice: number;
  notes?: string;
  phone?: string;
  pubMode?: string;
  ticketWomen?: number;
  ticketMen?: number;
  ticketCouple?: number;
}

export async function sendBookingCreatedEmails(b: BookingNotification): Promise<void> {
  const isPubTicket = b.pubMode === "ticket";
  const ticketLines = isPubTicket
    ? [
        ``,
        `  Ticket breakdown:`,
        ...[
          b.ticketWomen ? `    ♀ Women:   ${b.ticketWomen} ticket${b.ticketWomen > 1 ? "s" : ""}` : "",
          b.ticketMen ? `    ♂ Men:     ${b.ticketMen} ticket${b.ticketMen > 1 ? "s" : ""}` : "",
          b.ticketCouple ? `    ⚭ Couples: ${b.ticketCouple} ticket${b.ticketCouple > 1 ? "s" : ""}` : "",
        ].filter(Boolean),
      ]
    : [];

  const refCode = `#RV-${String(b.bookingId).padStart(6, "0")}`;

  await Promise.all([
    deliver("Booking Confirmation (to user)", {
      to: b.userEmail,
      toName: b.userName,
      subject: `Booking confirmed ${refCode}: ${b.eventTitle}`,
      body: [
        `Hi ${b.userName.split(" ")[0]},`,
        ``,
        `Your booking is confirmed! Here are your details:`,
        ``,
        `  Reference: ${refCode}`,
        `  Event:     ${b.eventTitle}`,
        `  Venue:     ${b.vendorName}`,
        `  Date:      ${fmtDate(b.bookingDate)}`,
        `  Guests:    ${b.guests}`,
        `  Total:     ${fmtINR(b.totalPrice)}`,
        ...ticketLines,
        ...(b.phone ? [``, `  Contact:   ${b.phone}`] : []),
        ...(b.notes ? [``, `Your note:`, `  "${b.notes}"`] : []),
        ``,
        `Sign in to your Royvento account to view your ticket and QR code.`,
        ``,
        `— The Royvento team`,
      ].join("\n"),
    }),
    deliver("New Confirmed Booking (to partner)", {
      to: b.vendorEmail,
      toName: b.vendorName,
      subject: `New booking ${refCode}: ${b.eventTitle} on ${fmtDate(b.bookingDate)}`,
      body: [
        `Hi ${b.vendorName},`,
        ``,
        `A new booking has been confirmed for your venue on Royvento.`,
        ``,
        `  Reference: ${refCode}`,
        `  Event:     ${b.eventTitle}`,
        `  Client:    ${b.userName} <${b.userEmail}>`,
        `  Date:      ${fmtDate(b.bookingDate)}`,
        `  Guests:    ${b.guests}`,
        `  Total:     ${fmtINR(b.totalPrice)}`,
        ...ticketLines,
        ...(b.phone ? [`  Phone:     ${b.phone}`] : []),
        ...(b.notes ? [``, `Client note:`, `  "${b.notes}"`] : []),
        ``,
        `— Royvento`,
      ].join("\n"),
    }),
  ]);
}

export interface BookingStatusNotification {
  bookingId: number;
  eventTitle: string;
  vendorName: string;
  userName: string;
  userEmail: string;
  bookingDate: string;
  status: string;
}

export interface CustomerCancelledNotification {
  bookingId: number;
  eventTitle: string;
  vendorName: string;
  vendorEmail: string;
  userName: string;
  userEmail: string;
  bookingDate: string;
  guests: number;
  cancellationReason: string;
}

export async function sendCustomerCancelledBookingEmail(
  b: CustomerCancelledNotification,
): Promise<void> {
  await deliver("Booking Cancelled by Customer (to partner)", {
    to: b.vendorEmail,
    toName: b.vendorName,
    subject: `Booking #${b.bookingId} cancelled by customer: ${b.eventTitle}`,
    body: [
      `Hi ${b.vendorName},`,
      ``,
      `A customer has cancelled their booking. Here are the details:`,
      ``,
      `  • Event:   ${b.eventTitle}`,
      `  • Client:  ${b.userName} <${b.userEmail}>`,
      `  • Date:    ${fmtDate(b.bookingDate)}`,
      `  • Guests:  ${b.guests}`,
      ``,
      `  Cancellation reason: "${b.cancellationReason}"`,
      ``,
      `The slot is now available again. Log in to your Royvento partner dashboard to view the full booking history.`,
      ``,
      `— Royvento`,
    ].join("\n"),
  });
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

function getTwilioClient(): ReturnType<typeof twilio> | null {
  const sid = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  if (!sid || !token) return null;
  return twilio(sid, token);
}

function getTwilioFrom(): string {
  return process.env["TWILIO_WHATSAPP_FROM"] ?? "";
}

export async function sendWhatsAppBookingConfirmation(params: {
  phone: string;
  userName: string;
  pubName: string;
  bookingId: number;
  bookingDate: string;
  ticketWomen?: number;
  ticketMen?: number;
  ticketCouple?: number;
  guests?: number;
  totalPrice: number;
  pubMode?: string;
}): Promise<void> {
  const client = getTwilioClient();
  const from = getTwilioFrom();

  if (!client || !from) {
    console.log("[whatsapp] Twilio not configured — skipping WhatsApp message");
    return;
  }

  // Normalize to E.164: strip all non-digit chars, then add country code.
  // Accept numbers already in 'whatsapp:+...' format or raw digits.
  const rawPhone = params.phone.replace(/^whatsapp:/i, "").trim();
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length < 7) {
    console.log(`[whatsapp] Skipping send — phone "${params.phone}" could not be normalized to E.164`);
    return;
  }
  // 10-digit Indian mobile (no country code) → prepend +91
  // 12-digit already starting with 91, or any number with an explicit + → keep digits
  const e164 = digits.length === 10 ? `+91${digits}` : `+${digits}`;
  const to = `whatsapp:${e164}`;
  console.log(`[whatsapp] Resolved to=${to} from raw="${params.phone}"`);
  const refCode = `#RV-${String(params.bookingId).padStart(6, "0")}`;
  const dateStr = fmtDate(params.bookingDate);

  let ticketSummary: string;
  if (params.pubMode === "ticket") {
    const parts: string[] = [];
    if (params.ticketWomen) parts.push(`${params.ticketWomen} Ladies`);
    if (params.ticketMen) parts.push(`${params.ticketMen} Gents`);
    if (params.ticketCouple) parts.push(`${params.ticketCouple} Couple${params.ticketCouple > 1 ? "s" : ""}`);
    ticketSummary = parts.join(" · ") || `${params.guests ?? 1} guest${(params.guests ?? 1) > 1 ? "s" : ""}`;
  } else {
    ticketSummary = `${params.guests ?? 1} guest${(params.guests ?? 1) > 1 ? "s" : ""}`;
  }

  const message = [
    `Hi ${params.userName.split(" ")[0]}! 🎉`,
    ``,
    `Your booking at *${params.pubName}* is confirmed.`,
    ``,
    `📋 Ref: ${refCode}`,
    `📅 Date: ${dateStr}`,
    `🎟️ Tickets: ${ticketSummary}`,
    `💰 Total: ${fmtINR(params.totalPrice)}`,
    ``,
    `See you there! — Royvento`,
  ].join("\n");

  try {
    await client.messages.create({ from, to, body: message });
    console.log(`[whatsapp] Sent booking confirmation to ${to}`);
  } catch (err) {
    console.error(`[whatsapp] Failed to send to ${to}:`, err);
  }
}

export async function sendBookingStatusEmail(b: BookingStatusNotification): Promise<void> {
  const statusLine: Record<string, string> = {
    confirmed: `Great news — ${b.vendorName} has CONFIRMED your booking.`,
    cancelled: `Unfortunately ${b.vendorName} has CANCELLED your booking.`,
    completed: `Your event with ${b.vendorName} is now marked as COMPLETED.`,
    pending: `${b.vendorName} has reset your booking status to PENDING.`,
  };
  await deliver("Booking Status Update (to user)", {
    to: b.userEmail,
    toName: b.userName,
    subject: `Booking #${b.bookingId} ${b.status.toUpperCase()}: ${b.eventTitle}`,
    body: [
      `Hi ${b.userName.split(" ")[0]},`,
      ``,
      statusLine[b.status] ?? `Your booking status has changed to: ${b.status}`,
      ``,
      `  • Event: ${b.eventTitle}`,
      `  • Date:  ${fmtDate(b.bookingDate)}`,
      ``,
      `Sign in to your Royvento account to see the full details.`,
      ``,
      `— The Royvento team`,
    ].join("\n"),
  });
}
