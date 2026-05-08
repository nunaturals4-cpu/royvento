import crypto from "crypto";

export function generateTicketCode(
  bookingId: number,
  vendor: { ticketPrefix: string; ticketSalt: string },
): string {
  if (!vendor.ticketPrefix || !vendor.ticketSalt) {
    // Hard error: every vendor must have a per-pub prefix and salt. Boot
    // backfill (`backfillVendorTicketPrefixes`) and the create-vendor path in
    // routes/vendors.ts ensure this — if we hit this, something inserted a
    // vendor row without populating ticketPrefix/ticketSalt.
    throw new Error(
      `generateTicketCode: vendor is missing ticketPrefix/ticketSalt (bookingId=${bookingId}). Run backfillVendorTicketPrefixes.`,
    );
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
  vendor: { ticketPrefix: string; ticketSalt: string },
): boolean {
  const parts = code.toUpperCase().split("-");
  if (parts.length !== 3) return false;
  // Prefix must match this vendor's prefix exactly
  if (parts[0] !== vendor.ticketPrefix.toUpperCase()) return false;
  // Booking ID must match
  if (parseInt(parts[1] ?? "0", 10) !== bookingId) return false;
  // Checksum must match
  const expected = crypto
    .createHmac("sha256", vendor.ticketSalt)
    .update(String(bookingId))
    .digest("hex")
    .slice(0, 2)
    .toUpperCase();
  return parts[2] === expected;
}

/** Returns a base 4-char uppercase alpha slug from a business name. */
export function baseTicketPrefix(businessName: string): string {
  const cleaned = businessName.toUpperCase().replace(/[^A-Z]/g, "");
  return cleaned.slice(0, 4).padEnd(4, "X");
}

/**
 * Generates a unique ticket prefix for a new vendor, consulting existing prefixes
 * to avoid collisions. Appends a numeric suffix (e.g. BLCK2) if needed.
 */
export async function generateUniqueTicketPrefix(
  businessName: string,
  existingPrefixes: string[],
): Promise<string> {
  const base = baseTicketPrefix(businessName);
  if (!existingPrefixes.includes(base)) return base;
  // Try numeric suffixes: BLCK2, BLCK3, ..., BLCK9 (keep full base, append digit)
  for (let i = 2; i <= 9; i++) {
    const candidate = `${base}${i}`;
    if (!existingPrefixes.includes(candidate)) return candidate;
  }
  // Try letter suffixes: BLCKA, BLCKB, ..., BLCKZ
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const ch of ALPHA) {
    const candidate = `${base}${ch}`;
    if (!existingPrefixes.includes(candidate)) return candidate;
  }
  // Last resort: random 5-char hex prefix (checked against existing)
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = crypto.randomBytes(3).toString("hex").slice(0, 5).toUpperCase();
    if (!existingPrefixes.includes(candidate)) return candidate;
  }
  // Absolute fallback: timestamp-based (collision virtually impossible)
  return `V${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

export function generateTicketSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}
