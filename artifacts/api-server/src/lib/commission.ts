/**
 * Shared commission calculator. Single source of truth for the per-booking
 * commission math used by online-payment, the COD/free-entry check-in path,
 * and the admin commission report.
 *
 * Per-tier mixed-booking model:
 *
 *   Free Entry classification (price = 0 or pubMode = "free")
 *     commission = freeEntryRate × people   (couple counts as 2 people)
 *
 *   Ticket classification (price > 0, pubMode = "ticket")
 *     For each tier (women / men / couple), the unit bills at
 *       freeEntryRate  if the event's Free-Entry-Rules mark that gender free
 *                      on the booking's date,
 *       ticketRate     otherwise.
 *     commission = Σ over tiers (ticketCount_tier × rate_tier)
 *     (1 couple ticket = 1 unit at this tier's rate.)
 *
 *   Table classification (pubMode = "table")
 *     commission = tableBookingRate × guests
 *
 * Actuals (door counts) are an attendance log only — they NEVER change the
 * per-booking commission. This keeps the report deterministic against the
 * current rate card and prevents zero-actual scans from wiping a realised
 * commission to ₹0.
 */

export type BookingType = "free_entry" | "ticket" | "table";

export type CommissionTrigger =
  | "online_payment"
  | "cod_checkin"
  | "free_checkin"
  | "settlement_offset";

export interface CommissionRatesInput {
  freeEntryRate: string | number | null | undefined;
  ticketRate: string | number | null | undefined;
  tableBookingRate: string | number | null | undefined;
}

export interface PlannedBookingShape {
  pubMode: string;
  finalPrice: string | number;
  guests: number;
  ticketWomen: number;
  ticketMen: number;
  ticketCouple: number;
  bookingDate?: string | null;
}

export interface FreeEntryRulesShape {
  enabled?: boolean | null;
  days?: string[] | null;
  genders?: string[] | null;
}

const FER_DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Returns which ticket tiers are zero-priced at the door for a given booking
 * date under the event's free-entry rules. Tokens in `genders` are normalised
 * to lowercase and matched against canonical "women" / "men" / "couple".
 */
export function ferTierFreeFlags(bookingDate: string | null | undefined, fer: FreeEntryRulesShape | null | undefined) {
  const day = bookingDate ? FER_DAY_ABBRS[new Date(`${bookingDate}T12:00:00`).getDay()] : "";
  const active = !!(fer?.enabled && day && Array.isArray(fer.days) && fer.days.includes(day));
  const genders = active ? (fer?.genders ?? []).map((g) => String(g).toLowerCase()) : [];
  return {
    active,
    women: active && genders.includes("women"),
    men: active && genders.includes("men"),
    couple: active && genders.includes("couple"),
  };
}

export interface ActualBookingShape extends PlannedBookingShape {
  actualWomen: number | null;
  actualMen: number | null;
  actualCouple: number | null;
  actualGuests: number | null;
}

export interface EventPriceShape {
  priceWomen: string | number | null | undefined;
  priceMen: string | number | null | undefined;
  priceCouple: string | number | null | undefined;
}

export interface CommissionResult {
  bookingType: BookingType;
  ratePerUnit: number;
  unitCount: number;
  amount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Classify a booking by its mode + price.
 *
 * `pubMode === "event"` is the legacy value the frontend Buy Tickets / Table
 * Booking radio sends when the user picks Table Booking (the option is
 * labelled "Table Booking" or "VIP Table" in the UI but submits the string
 * "event"). Treat it as `table` so the commission report's per-pub Booking
 * Type table puts these bookings in the Table Booking row — not the Ticket
 * Booking row, which was the symptom the team was seeing on the admin panel.
 */
export function classifyBookingType(b: { pubMode: string; finalPrice: string | number }): BookingType {
  const price = Number(b.finalPrice);
  if (b.pubMode === "table" || b.pubMode === "event") return "table";
  if (price === 0 || b.pubMode === "free") return "free_entry";
  return "ticket";
}

/** Count people for a free-entry classification: couple = 2 people, else 1. */
function freeEntryPeopleCount(b: PlannedBookingShape): number {
  const tierHeads = b.ticketWomen + b.ticketMen + b.ticketCouple * 2;
  if (tierHeads > 0) return Math.max(0, tierHeads);
  return Math.max(0, b.guests);
}

/**
 * Canonical commission computation. Called by online-payment success, the
 * COD / free-entry check-in path, and the admin commission report so all
 * three surfaces agree to the rupee.
 */
export function computeCommissionFromPlanned(
  b: PlannedBookingShape,
  rates: CommissionRatesInput,
  fer?: FreeEntryRulesShape | null,
): CommissionResult {
  const freeEntryFee = Number(rates.freeEntryRate ?? 0);
  const ticketFee = Number(rates.ticketRate ?? 0);
  const tableFee = Number(rates.tableBookingRate ?? 0);

  const bookingType = classifyBookingType(b);

  if (bookingType === "table") {
    const unitCount = Math.max(0, b.guests);
    return { bookingType, ratePerUnit: tableFee, unitCount, amount: round2(tableFee * unitCount) };
  }

  if (bookingType === "free_entry") {
    const unitCount = freeEntryPeopleCount(b);
    return { bookingType, ratePerUnit: freeEntryFee, unitCount, amount: round2(freeEntryFee * unitCount) };
  }

  // ticket — per-tier mixed split when FER is active for one or more tiers.
  const w = Math.max(0, b.ticketWomen);
  const m = Math.max(0, b.ticketMen);
  const c = Math.max(0, b.ticketCouple);
  const totalUnits = w + m + c;

  // Legacy / event-mode bookings store headcount in `guests`, not per-tier
  // counts. Fall back so those bookings never silently bill ₹0.
  if (totalUnits === 0) {
    const guests = Math.max(0, b.guests);
    return { bookingType, ratePerUnit: ticketFee, unitCount: guests, amount: round2(ticketFee * guests) };
  }

  const flags = ferTierFreeFlags(b.bookingDate ?? null, fer ?? null);
  const wRate = flags.women ? freeEntryFee : ticketFee;
  const mRate = flags.men ? freeEntryFee : ticketFee;
  const cRate = flags.couple ? freeEntryFee : ticketFee;

  const raw = wRate * w + mRate * m + cRate * c;

  // Surface the dominant per-unit rate so the report's "Rate" column shows a
  // sensible scalar. The exact amount is what the ledger and totals key off.
  const paidUnits = (flags.women ? 0 : w) + (flags.men ? 0 : m) + (flags.couple ? 0 : c);
  const ratePerUnit = paidUnits > 0 ? ticketFee : freeEntryFee;

  return { bookingType, ratePerUnit, unitCount: totalUnits, amount: round2(raw) };
}

/**
 * Actuals path delegates to the planned calculation. Actuals are an
 * attendance log; the platform's per-booking commission is fixed at booking
 * time against the current rate card so a re-scan with zero actuals can
 * never zero out a realised commission.
 */
export function computeCommissionFromActuals(
  b: ActualBookingShape,
  rates: CommissionRatesInput,
  _event: EventPriceShape,
  fer?: FreeEntryRulesShape | null,
): CommissionResult {
  return computeCommissionFromPlanned(b, rates, fer);
}

/** Commission ledger triggers that represent realised platform earnings. */
export const REALISED_COMMISSION_TRIGGERS = [
  "online_payment",
  "cod_checkin",
  "free_checkin",
] as const satisfies readonly CommissionTrigger[];
