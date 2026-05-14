/**
 * Shared commission calculator. Single source of truth for the per-booking
 * commission math used by the online-payment success path, the COD/free-entry
 * check-in path, and the admin commission report.
 *
 * Industry-standard rule set: commission = unitCount × rate, deterministic.
 * No FER-tier discount, no price cap, no actuals haircut. Actuals are an
 * attendance log; they do NOT change the per-booking commission. This makes
 * the report match the rate card and gives vendors a predictable per-booking
 * fee they can audit.
 *
 *   Free Entry  → number of people × freeEntryRate
 *   Ticket      → number of tickets × ticketRate
 *   Table       → number of guests  × tableBookingRate
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
 * Retained for routes that still display "is today an FER day" badges in the
 * scanner UI. Commission math no longer consults FER — every booked unit
 * bills at the classification's flat rate regardless of which tier was free.
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

/** Classify a booking by its mode + price. */
export function classifyBookingType(b: { pubMode: string; finalPrice: string | number }): BookingType {
  const price = Number(b.finalPrice);
  if (b.pubMode === "table") return "table";
  if (price === 0 || b.pubMode === "free") return "free_entry";
  return "ticket";
}

/**
 * Count people for a free-entry booking: 1 woman = 1 person, 1 man = 1 person,
 * 1 couple = 2 people. Falls back to `guests` when no per-tier counts were
 * recorded (table-mode bookings that ended up as free entry).
 */
function freeEntryPeopleCount(b: PlannedBookingShape): number {
  const tierHeads = b.ticketWomen + b.ticketMen + b.ticketCouple * 2;
  if (tierHeads > 0) return Math.max(0, tierHeads);
  return Math.max(0, b.guests);
}

/** Count tickets for a ticket booking: 1 row per booked seat (couple = 1 ticket). */
function ticketCount(b: PlannedBookingShape): number {
  const total = b.ticketWomen + b.ticketMen + b.ticketCouple;
  if (total > 0) return Math.max(0, total);
  return Math.max(0, b.guests);
}

/**
 * Compute commission from the booking's planned counts. This is the
 * canonical commission for every trigger (online payment, COD check-in,
 * free-entry check-in). The admin report mirrors this exact computation.
 */
export function computeCommissionFromPlanned(
  b: PlannedBookingShape,
  rates: CommissionRatesInput,
  _fer?: FreeEntryRulesShape | null,
): CommissionResult {
  const freeEntryFee = Number(rates.freeEntryRate ?? 0);
  const ticketFee = Number(rates.ticketRate ?? 0);
  const tableFee = Number(rates.tableBookingRate ?? 0);

  const bookingType = classifyBookingType(b);

  let ratePerUnit = 0;
  let unitCount = 0;
  if (bookingType === "table") {
    ratePerUnit = tableFee;
    unitCount = Math.max(0, b.guests);
  } else if (bookingType === "free_entry") {
    ratePerUnit = freeEntryFee;
    unitCount = freeEntryPeopleCount(b);
  } else {
    ratePerUnit = ticketFee;
    unitCount = ticketCount(b);
  }

  return { bookingType, ratePerUnit, unitCount, amount: round2(ratePerUnit * unitCount) };
}

/**
 * Compute commission from booking actuals.
 *
 * Per the platform's deterministic-rate model, commission is fixed at booking
 * time (units × rate). Actuals serve as an attendance log only — they do not
 * change the platform's per-booking fee. This function therefore delegates to
 * `computeCommissionFromPlanned`, guaranteeing that re-scans with zero
 * actuals can never zero out a realised commission.
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
