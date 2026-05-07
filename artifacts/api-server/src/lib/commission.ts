/**
 * Shared commission calculator. Single source of truth for the per-booking
 * commission math used by the online-payment success path, the COD/free-entry
 * check-in path, and the admin commission report.
 *
 * The rate model itself (free-entry / ticket / table-booking rates) is owned
 * by the `vendor_commissions` table and is not changed here.
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

/** Classify a booking by its mode + price. Mirrors the inline logic that used to
 * live in `/admin/commission-report`. */
export function classifyBookingType(b: { pubMode: string; finalPrice: string | number }): BookingType {
  const price = Number(b.finalPrice);
  if (b.pubMode === "table") return "table";
  if (price === 0 || b.pubMode === "free") return "free_entry";
  return "ticket";
}

/**
 * Compute commission for the **online** payment path using the booking's
 * planned counts. Capped by `finalPrice` (commission can never exceed the
 * money actually paid online).
 */
export function computeCommissionFromPlanned(
  b: PlannedBookingShape,
  rates: CommissionRatesInput,
): CommissionResult {
  const price = Number(b.finalPrice);
  const freeEntryFee = Number(rates.freeEntryRate ?? 0);
  const ticketFee = Number(rates.ticketRate ?? 0);
  const tableFee = Number(rates.tableBookingRate ?? 0);

  const bookingType = classifyBookingType(b);

  let ratePerUnit = 0;
  let unitCount = 0;
  let raw = 0;
  if (bookingType === "table") {
    ratePerUnit = tableFee;
    unitCount = 1;
    raw = tableFee;
  } else if (bookingType === "free_entry") {
    ratePerUnit = freeEntryFee;
    unitCount = Math.max(0, b.guests);
    raw = freeEntryFee * unitCount;
  } else {
    ratePerUnit = ticketFee;
    unitCount = Math.max(0, b.ticketWomen + b.ticketMen + b.ticketCouple);
    raw = ticketFee * unitCount;
  }
  // Online payments are always capped at the price actually collected.
  const amount = round2(Math.min(raw, price));
  return { bookingType, ratePerUnit, unitCount, amount };
}

/**
 * Compute commission for the **COD / free-entry check-in** path using the
 * booking's recorded `actual*` counts.
 *
 * - Free entry: per-head free-entry rate × actual heads (uncapped — there is
 *   no cash collected to cap against; the platform earns its per-head fee
 *   when the customer actually shows up).
 * - COD ticket: ticket rate × actual ticket count, capped by actual cash
 *   collected at the door (sum of per-type counts × per-type prices).
 * - COD table: flat table rate, capped by actual cash collected at the door
 *   (pro-rated finalPrice by attendance ratio).
 */
export function computeCommissionFromActuals(
  b: ActualBookingShape,
  rates: CommissionRatesInput,
  event: EventPriceShape,
): CommissionResult {
  const freeEntryFee = Number(rates.freeEntryRate ?? 0);
  const ticketFee = Number(rates.ticketRate ?? 0);
  const tableFee = Number(rates.tableBookingRate ?? 0);

  const bookingType = classifyBookingType(b);
  const aw = b.actualWomen ?? 0;
  const am = b.actualMen ?? 0;
  const ac = b.actualCouple ?? 0;
  const ag = b.actualGuests ?? 0;

  if (bookingType === "free_entry") {
    // Free entry: prefer actualGuests (table-mode free entry); for ticket-mode
    // free entry, fall back to per-type actuals (couples count as 2 heads).
    const heads = ag > 0 ? ag : aw + am + ac * 2;
    const ratePerUnit = freeEntryFee;
    const unitCount = Math.max(0, heads);
    return { bookingType, ratePerUnit, unitCount, amount: round2(freeEntryFee * unitCount) };
  }

  if (bookingType === "table") {
    const ratePerUnit = tableFee;
    const unitCount = 1;
    const guests = Math.max(1, b.guests);
    const cashCollected = (ag / guests) * Number(b.finalPrice);
    return { bookingType, ratePerUnit, unitCount, amount: round2(Math.min(tableFee, Math.max(0, cashCollected))) };
  }

  // ticket mode COD
  const ratePerUnit = ticketFee;
  const unitCount = Math.max(0, aw + am + ac);
  const pw = Number(event.priceWomen ?? 0);
  const pm = Number(event.priceMen ?? 0);
  const pc = Number(event.priceCouple ?? 0);
  const cashCollected = aw * pw + am * pm + ac * pc;
  const raw = ticketFee * unitCount;
  return { bookingType, ratePerUnit, unitCount, amount: round2(Math.min(raw, Math.max(0, cashCollected))) };
}

/** Commission ledger triggers that represent realised platform earnings.
 * Excludes `settlement_offset` which only records realisation against a
 * vendor's running balance (not new commission earned). This is the
 * canonical set used by both the Commissions tab's "Collected" column
 * and the Admin Analytics Total Commission KPI. */
export const REALISED_COMMISSION_TRIGGERS = [
  "online_payment",
  "cod_checkin",
  "free_checkin",
] as const satisfies readonly CommissionTrigger[];
