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
}

export async function sendBookingCreatedEmails(b: BookingNotification): Promise<void> {
  await Promise.all([
    deliver("Booking Confirmation (to user)", {
      to: b.userEmail,
      toName: b.userName,
      subject: `Your Royvento booking #${b.bookingId} for ${b.eventTitle}`,
      body: [
        `Hi ${b.userName.split(" ")[0]},`,
        ``,
        `Thank you for booking with Royvento. Your reservation has been received and is`,
        `awaiting confirmation from the vendor.`,
        ``,
        `  • Event:   ${b.eventTitle}`,
        `  • Vendor:  ${b.vendorName}`,
        `  • Date:    ${fmtDate(b.bookingDate)}`,
        `  • Guests:  ${b.guests}`,
        `  • Total:   ${fmtMoney(b.totalPrice)}`,
        ...(b.notes ? [``, `Your note to the vendor:`, `  "${b.notes}"`] : []),
        ``,
        `You'll receive another email once ${b.vendorName} confirms.`,
        ``,
        `— The Royvento team`,
      ].join("\n"),
    }),
    deliver("New Booking Alert (to vendor)", {
      to: b.vendorEmail,
      toName: b.vendorName,
      subject: `New booking request: ${b.eventTitle} on ${fmtDate(b.bookingDate)}`,
      body: [
        `Hi ${b.vendorName},`,
        ``,
        `You have a new booking request on Royvento.`,
        ``,
        `  • Event:   ${b.eventTitle}`,
        `  • Client:  ${b.userName} <${b.userEmail}>`,
        `  • Date:    ${fmtDate(b.bookingDate)}`,
        `  • Guests:  ${b.guests}`,
        `  • Total:   ${fmtMoney(b.totalPrice)}`,
        ...(b.notes ? [``, `Client note:`, `  "${b.notes}"`] : []),
        ``,
        `Open your vendor dashboard to confirm or decline.`,
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
