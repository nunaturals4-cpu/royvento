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
  // No real email provider configured. Print to server console so the
  // notification is visible in the workflow logs. To enable real delivery,
  // swap this body with a SendGrid / SMTP / Resend call.
  // eslint-disable-next-line no-console
  console.log(formatEmail(label, payload));
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string): string {
  // iso may be "2026-08-15"
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
