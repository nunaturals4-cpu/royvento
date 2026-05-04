import { Resend } from "resend";

// ─── Required / optional environment variables ───────────────────────────────
//
//  RESEND_API_KEY                      (secret)  Resend API key for sending emails.
//                                                If absent, emails are printed to console (dev mode).
//  RESEND_FROM_EMAIL                   (optional) "From" address, e.g. "Royvento <hello@example.com>".
//                                                Defaults to "Royvento <onboarding@resend.dev>".
//  RESEND_FORGOT_PASSWORD_TEMPLATE_ID  (optional) Resend template ID for the password-reset email.
//                                                When set, the template is used with variables:
//                                                  firstname, reset_link.
//                                                When absent, a plain-text + HTML fallback is sent.
//
// ─────────────────────────────────────────────────────────────────────────────

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
  const productionDomains = process.env["REPLIT_DOMAINS"];
  if (productionDomains) {
    const domain = productionDomains.split(",")[0]?.trim();
    if (domain) return `https://${domain}`;
  }
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain) return `https://${devDomain}`;
  return "http://localhost:3000";
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(bodyHtml: string): string {
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
        <td style="background:#0f0f0f;padding:24px 32px;text-align:center;">
          <span style="font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">Roy</span><span style="font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#e53e3e;">vento</span>
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

function greeting(name: string): string {
  return `<p style="margin:0 0 20px 0;font-size:17px;font-weight:600;color:#1a1a1a;">Hi ${esc(name)},</p>`;
}

function para(text: string): string {
  return `<p style="margin:0 0 16px 0;color:#333333;">${esc(text)}</p>`;
}

function card(rows: { label: string; value: string }[]): string {
  const inner = rows
    .map(
      ({ label, value }) =>
        `<tr>
          <td style="padding:9px 16px;color:#666666;font-size:13px;white-space:nowrap;width:38%;">${esc(label)}</td>
          <td style="padding:9px 16px;color:#1a1a1a;font-size:13px;font-weight:600;">${esc(value)}</td>
        </tr>`,
    )
    .join("<tr><td colspan=\"2\" style=\"padding:0 16px;\"><div style=\"border-top:1px solid #eeeeee;\"></div></td></tr>");
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f7f7;border-radius:8px;margin:20px 0;">${inner}</table>`;
}

function btn(label: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td style="border-radius:6px;background:#e53e3e;">
        <a href="${esc(url)}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:6px;letter-spacing:0.2px;">${esc(label)}</a>
      </td>
    </tr>
  </table>`;
}

function refBadge(ref: string): string {
  return `<p style="margin:0 0 20px 0;"><span style="display:inline-block;background:#0f0f0f;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;padding:5px 12px;border-radius:4px;">${esc(ref)}</span></p>`;
}

function signature(team = true): string {
  return `<p style="margin:24px 0 0 0;color:#888888;font-size:13px;">— ${team ? "The Royvento team" : "Royvento"}</p>`;
}

function divider(): string {
  return `<div style="border-top:1px solid #eeeeee;margin:24px 0;"></div>`;
}

// ─── Delivery ─────────────────────────────────────────────────────────────────

type EmailPayload = {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  html: string;
};

function formatEmailConsole(label: string, payload: EmailPayload): string {
  const line = "─".repeat(64);
  const thick = "═".repeat(64);
  return [
    "",
    thick,
    `📧  ${label}`,
    line,
    `To:      ${payload.toName ? `${payload.toName} <${payload.to}>` : payload.to}`,
    `Subject: ${payload.subject}`,
    line,
    payload.text,
    thick,
    "",
  ].join("\n");
}

async function deliver(label: string, payload: EmailPayload): Promise<void> {
  const client = getResendClient();

  if (!client) {
    // eslint-disable-next-line no-console
    console.log(formatEmailConsole(label, payload));
    return;
  }

  const toAddress = payload.toName
    ? `${payload.toName} <${payload.to}>`
    : payload.to;

  const { error } = await client.emails.send({
    from: getFromAddress(),
    to: [toAddress],
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });

  if (error) {
    console.error(`[notifications] Failed to send "${label}" to ${payload.to}:`, error);
  } else {
    console.log(`[notifications] Sent "${label}" to ${payload.to}`);
  }
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

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

// ─── Email Verification ───────────────────────────────────────────────────────

export async function sendEmailVerificationEmail(params: {
  to: string;
  toName: string;
  token: string;
}): Promise<void> {
  const verifyUrl = `${getAppUrl()}/api/auth/verify-email?token=${params.token}`;
  const firstName = params.toName.split(" ")[0];

  const html = layout(`
    ${greeting(firstName)}
    ${para("Thanks for signing up for Royvento! One quick step — please verify your email address to activate your account.")}
    ${para("Click the button below to verify. This link expires in 24 hours.")}
    ${btn("Verify My Email", verifyUrl)}
    ${divider()}
    <p style="margin:0;color:#888888;font-size:13px;">If you didn't create a Royvento account, you can safely ignore this email.</p>
    ${signature()}
  `);

  const text = [
    `Hi ${firstName},`,
    ``,
    `Thanks for signing up for Royvento! Please verify your email address to activate your account.`,
    ``,
    `Click the link below (valid for 24 hours):`,
    ``,
    `  ${verifyUrl}`,
    ``,
    `If you didn't create a Royvento account, you can safely ignore this email.`,
    ``,
    `— The Royvento team`,
  ].join("\n");

  await deliver("Email Verification", {
    to: params.to,
    toName: params.toName,
    subject: "Verify your Royvento email address",
    text,
    html,
  });
}

// ─── Forgot-password ──────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(params: {
  to: string;
  toName: string;
  token: string;
}): Promise<void> {
  const resetUrl = `${getAppUrl()}/reset-password?token=${params.token}`;
  const firstName = params.toName.split(" ")[0];
  const templateId = process.env["RESEND_FORGOT_PASSWORD_TEMPLATE_ID"];

  if (templateId) {
    const client = getResendClient();
    if (!client) {
      console.warn(
        "[notifications] RESEND_FORGOT_PASSWORD_TEMPLATE_ID is set but RESEND_API_KEY is missing — " +
          "falling back to plain-text email. Set RESEND_API_KEY to use the template.",
      );
    }
    if (client) {
      const toAddress = `${params.toName} <${params.to}>`;
      const { error } = await client.emails.send({
        from: getFromAddress(),
        to: [toAddress],
        template: {
          id: templateId,
          variables: {
            firstname: firstName,
            reset_link: resetUrl,
          },
        },
      });
      if (error) {
        console.error("[notifications] Failed to send templated password reset email:", error);
      } else {
        console.log(`[notifications] Sent templated "Password Reset" to ${params.to}`);
      }
      return;
    }
  }

  const html = layout(`
    ${greeting(firstName)}
    ${para("We received a request to reset the password for your Royvento account.")}
    ${para("Click the button below to choose a new password. This link is valid for 1 hour.")}
    ${btn("Reset My Password", resetUrl)}
    ${divider()}
    <p style="margin:0;color:#888888;font-size:13px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
    ${signature()}
  `);

  const text = [
    `Hi ${firstName},`,
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
  ].join("\n");

  await deliver("Password Reset", {
    to: params.to,
    toName: params.toName,
    subject: "Reset your Royvento password",
    text,
    html,
  });
}

// ─── Welcome email ─────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(params: {
  to: string;
  toName: string;
}): Promise<void> {
  const firstName = params.toName.split(" ")[0];
  const appUrl = getAppUrl();

  const html = layout(`
    ${greeting(firstName)}
    ${para("Welcome to Royvento! We're glad you're here.")}
    ${para("You can now browse and book events at top venues near you. Here's what you can do:")}
    <ul style="margin:0 0 20px 0;padding-left:20px;color:#333333;line-height:2;">
      <li>Discover pubs, restaurants &amp; event spaces</li>
      <li>Book your spot in seconds</li>
      <li>Earn loyalty points on every booking</li>
    </ul>
    ${btn("Explore Events", appUrl)}
    <p style="margin:0;color:#888888;font-size:13px;">See you soon!</p>
    ${signature()}
  `);

  const text = [
    `Hi ${firstName},`,
    ``,
    `Welcome to Royvento! We're glad you're here.`,
    ``,
    `You can now browse and book events at top venues near you. Here's what you can do:`,
    ``,
    `  • Discover pubs, restaurants & event spaces`,
    `  • Book your spot in seconds`,
    `  • Earn loyalty points on every booking`,
    ``,
    appUrl,
    ``,
    `See you soon!`,
    ``,
    `— The Royvento team`,
  ].join("\n");

  await deliver("Welcome", {
    to: params.to,
    toName: params.toName,
    subject: "Welcome to Royvento!",
    text,
    html,
  });
}

// ─── Ticket scanned ────────────────────────────────────────────────────────────

export async function sendTicketScannedEmail(params: {
  to: string;
  toName: string;
  bookingId: number;
  eventTitle: string;
  vendorName: string;
  checkedInAt: Date;
}): Promise<void> {
  const firstName = params.toName.split(" ")[0];
  const refCode = `#RV-${String(params.bookingId).padStart(6, "0")}`;
  const checkedInStr = params.checkedInAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const html = layout(`
    ${greeting(firstName)}
    ${para("Your ticket has been scanned and you're officially checked in. Enjoy the event!")}
    ${refBadge(refCode)}
    ${card([
      { label: "Event", value: params.eventTitle },
      { label: "Venue", value: params.vendorName },
      { label: "Checked in at", value: checkedInStr },
    ])}
    ${signature()}
  `);

  const text = [
    `Hi ${firstName},`,
    ``,
    `Your ticket has been scanned and you're officially checked in. Enjoy the event!`,
    ``,
    `  Reference:    ${refCode}`,
    `  Event:        ${params.eventTitle}`,
    `  Venue:        ${params.vendorName}`,
    `  Checked in:   ${checkedInStr}`,
    ``,
    `— The Royvento team`,
  ].join("\n");

  await deliver("Ticket Scanned", {
    to: params.to,
    toName: params.toName,
    subject: `You're checked in — ${params.eventTitle}`,
    text,
    html,
  });
}

// ─── Booking emails ────────────────────────────────────────────────────────────

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
  const refCode = `#RV-${String(b.bookingId).padStart(6, "0")}`;
  const firstName = b.userName.split(" ")[0];

  // ── Build ticket breakdown rows ──
  const ticketRows: { label: string; value: string }[] = [];
  if (isPubTicket) {
    if (b.ticketWomen) ticketRows.push({ label: "Women tickets", value: String(b.ticketWomen) });
    if (b.ticketMen) ticketRows.push({ label: "Men tickets", value: String(b.ticketMen) });
    if (b.ticketCouple) ticketRows.push({ label: "Couple tickets", value: String(b.ticketCouple) });
  }

  // ── User confirmation email ──
  const userRows: { label: string; value: string }[] = [
    { label: "Reference", value: refCode },
    { label: "Event", value: b.eventTitle },
    { label: "Venue", value: b.vendorName },
    { label: "Date", value: fmtDate(b.bookingDate) },
    { label: "Guests", value: String(b.guests) },
    { label: "Total", value: fmtINR(b.totalPrice) },
    ...ticketRows,
    ...(b.phone ? [{ label: "Contact", value: b.phone }] : []),
  ];

  const userNoteHtml = b.notes
    ? `${divider()}<p style="margin:0 0 8px 0;font-size:13px;color:#666666;font-weight:600;">YOUR NOTE</p><p style="margin:0;font-size:14px;color:#333333;font-style:italic;">"${esc(b.notes)}"</p>`
    : "";

  const userHtml = layout(`
    ${greeting(firstName)}
    ${para("Your booking is confirmed! Here are your details:")}
    ${refBadge(refCode)}
    ${card(userRows)}
    ${userNoteHtml}
    ${para("Sign in to your Royvento account to view your ticket and QR code.")}
    ${btn("View My Booking", getAppUrl())}
    ${signature()}
  `);

  const ticketTextLines = isPubTicket
    ? [
        ``,
        `  Ticket breakdown:`,
        ...[
          b.ticketWomen ? `    Women:   ${b.ticketWomen}` : "",
          b.ticketMen ? `    Men:     ${b.ticketMen}` : "",
          b.ticketCouple ? `    Couples: ${b.ticketCouple}` : "",
        ].filter(Boolean),
      ]
    : [];

  const userText = [
    `Hi ${firstName},`,
    ``,
    `Your booking is confirmed! Here are your details:`,
    ``,
    `  Reference: ${refCode}`,
    `  Event:     ${b.eventTitle}`,
    `  Venue:     ${b.vendorName}`,
    `  Date:      ${fmtDate(b.bookingDate)}`,
    `  Guests:    ${b.guests}`,
    `  Total:     ${fmtINR(b.totalPrice)}`,
    ...ticketTextLines,
    ...(b.phone ? [``, `  Contact:   ${b.phone}`] : []),
    ...(b.notes ? [``, `Your note:`, `  "${b.notes}"`] : []),
    ``,
    `Sign in to your Royvento account to view your ticket and QR code.`,
    ``,
    `— The Royvento team`,
  ].join("\n");

  // ── Partner notification email ──
  const partnerRows: { label: string; value: string }[] = [
    { label: "Reference", value: refCode },
    { label: "Event", value: b.eventTitle },
    { label: "Client", value: `${b.userName} <${b.userEmail}>` },
    { label: "Date", value: fmtDate(b.bookingDate) },
    { label: "Guests", value: String(b.guests) },
    { label: "Total", value: fmtINR(b.totalPrice) },
    ...ticketRows,
    ...(b.phone ? [{ label: "Phone", value: b.phone }] : []),
  ];

  const partnerNoteHtml = b.notes
    ? `${divider()}<p style="margin:0 0 8px 0;font-size:13px;color:#666666;font-weight:600;">CLIENT NOTE</p><p style="margin:0;font-size:14px;color:#333333;font-style:italic;">"${esc(b.notes)}"</p>`
    : "";

  const partnerHtml = layout(`
    <p style="margin:0 0 20px 0;font-size:17px;font-weight:600;color:#1a1a1a;">Hi ${esc(b.vendorName)},</p>
    ${para("A new booking has been confirmed for your venue on Royvento.")}
    ${refBadge(refCode)}
    ${card(partnerRows)}
    ${partnerNoteHtml}
    ${btn("Open Partner Dashboard", `${getAppUrl()}/dashboard/vendor`)}
    ${signature(false)}
  `);

  const partnerText = [
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
    ...ticketTextLines,
    ...(b.phone ? [`  Phone:     ${b.phone}`] : []),
    ...(b.notes ? [``, `Client note:`, `  "${b.notes}"`] : []),
    ``,
    `— Royvento`,
  ].join("\n");

  await Promise.all([
    deliver("Booking Confirmation (to user)", {
      to: b.userEmail,
      toName: b.userName,
      subject: `Booking confirmed ${refCode}: ${b.eventTitle}`,
      text: userText,
      html: userHtml,
    }),
    deliver("New Confirmed Booking (to partner)", {
      to: b.vendorEmail,
      toName: b.vendorName,
      subject: `New booking ${refCode}: ${b.eventTitle} on ${fmtDate(b.bookingDate)}`,
      text: partnerText,
      html: partnerHtml,
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

export async function sendBookingStatusEmail(b: BookingStatusNotification): Promise<void> {
  const firstName = b.userName.split(" ")[0];

  const statusMessages: Record<string, { text: string; color: string }> = {
    confirmed: { text: `Great news — ${b.vendorName} has confirmed your booking.`, color: "#22c55e" },
    cancelled: { text: `Unfortunately ${b.vendorName} has cancelled your booking.`, color: "#e53e3e" },
    completed: { text: `Your event with ${b.vendorName} is now marked as completed.`, color: "#6366f1" },
    pending: { text: `${b.vendorName} has reset your booking status to pending.`, color: "#f59e0b" },
  };

  const statusInfo = statusMessages[b.status] ?? { text: `Your booking status has changed to: ${b.status}.`, color: "#666666" };
  const statusLabel = b.status.toUpperCase();

  const html = layout(`
    ${greeting(firstName)}
    <p style="margin:0 0 20px 0;">
      <span style="display:inline-block;background:${statusInfo.color}20;color:${statusInfo.color};font-size:12px;font-weight:700;letter-spacing:1px;padding:4px 10px;border-radius:4px;">${esc(statusLabel)}</span>
    </p>
    ${para(statusInfo.text)}
    ${card([
      { label: "Event", value: b.eventTitle },
      { label: "Date", value: fmtDate(b.bookingDate) },
    ])}
    ${btn("View Booking Details", getAppUrl())}
    ${signature()}
  `);

  const text = [
    `Hi ${firstName},`,
    ``,
    statusInfo.text,
    ``,
    `  • Event: ${b.eventTitle}`,
    `  • Date:  ${fmtDate(b.bookingDate)}`,
    ``,
    `Sign in to your Royvento account to see the full details.`,
    ``,
    `— The Royvento team`,
  ].join("\n");

  await deliver("Booking Status Update (to user)", {
    to: b.userEmail,
    toName: b.userName,
    subject: `Booking #${b.bookingId} ${statusLabel}: ${b.eventTitle}`,
    text,
    html,
  });
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
  const html = layout(`
    <p style="margin:0 0 20px 0;font-size:17px;font-weight:600;color:#1a1a1a;">Hi ${esc(b.vendorName)},</p>
    ${para("A customer has cancelled their booking. Here are the details:")}
    ${card([
      { label: "Event", value: b.eventTitle },
      { label: "Client", value: `${b.userName} <${b.userEmail}>` },
      { label: "Date", value: fmtDate(b.bookingDate) },
      { label: "Guests", value: String(b.guests) },
    ])}
    ${divider()}
    <p style="margin:0 0 8px 0;font-size:13px;color:#666666;font-weight:600;">CANCELLATION REASON</p>
    <p style="margin:0 0 20px 0;font-size:14px;color:#333333;font-style:italic;">"${esc(b.cancellationReason)}"</p>
    ${para("The slot is now available again. Log in to your partner dashboard to view the full booking history.")}
    ${btn("Open Partner Dashboard", `${getAppUrl()}/dashboard/vendor`)}
    ${signature(false)}
  `);

  const text = [
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
  ].join("\n");

  await deliver("Booking Cancelled by Customer (to partner)", {
    to: b.vendorEmail,
    toName: b.vendorName,
    subject: `Booking #${b.bookingId} cancelled by customer: ${b.eventTitle}`,
    text,
    html,
  });
}

