import crypto from "crypto";

export function generateTicketCode(
  bookingId: number,
  vendor: { ticketPrefix: string; ticketSalt: string },
): string {
  if (!vendor.ticketPrefix || !vendor.ticketSalt) {
    return `RV-${String(bookingId).padStart(6, "0")}`;
  }
  const checksum = crypto
    .createHmac("sha256", vendor.ticketSalt)
    .update(String(bookingId))
    .digest("hex")
    .slice(0, 2)
    .toUpperCase();
  return `${vendor.ticketPrefix}-${String(bookingId).padStart(6, "0")}-${checksum}`;
}

export function verifyTicketCode(
  code: string,
  bookingId: number,
  vendor: { ticketSalt: string },
): boolean {
  const checksum = crypto
    .createHmac("sha256", vendor.ticketSalt)
    .update(String(bookingId))
    .digest("hex")
    .slice(0, 2)
    .toUpperCase();
  const parts = code.toUpperCase().split("-");
  return (
    parts.length === 3 &&
    parts[2] === checksum &&
    parseInt(parts[1] ?? "0", 10) === bookingId
  );
}

export function generateTicketPrefix(businessName: string): string {
  const cleaned = businessName.toUpperCase().replace(/[^A-Z]/g, "");
  return cleaned.slice(0, 4).padEnd(4, "X");
}

export function generateTicketSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}
