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
  bookingDate?: string | null;
}

export interface FreeEntryRulesShape {
  enabled?: boolean | null;
  days?: string[] | null;
  genders?: string[] | null;
}

const FER_DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Returns which ticket tiers are zero-priced at the door for a given booking
 * date under the event's free-entry rules. Tokens in `genders` are normalised
 * to lowercase and matched against canonical "women"/"men"/"couple". */
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
  fer?: FreeEntryRulesShape | null,
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
    unitCount = Math.max(0, b.guests);
    raw = tableFee * unitCount;
  } else if (bookingType === "free_entry") {
    ratePerUnit = freeEntryFee;
    // Ticket-mode bookings that end up free (all tiers free on an FER day) store
    // counts in ticketWomen/Men/Couple, not guests. Use ticket counts when present.
    const ticketTotal = Math.max(0, b.ticketWomen + b.ticketMen + b.ticketCouple);
    unitCount = ticketTotal > 0 ? ticketTotal : Math.max(0, b.guests);
    raw = freeEntryFee * unitCount;
  } else {
    // ticket mode. On a partial-FER day, free tiers are billed at freeEntryFee
    // and paid tiers at ticketFee; otherwise all tickets bill at ticketFee.
    const totalUnits = Math.max(0, b.ticketWomen + b.ticketMen + b.ticketCouple);
    unitCount = totalUnits;
    const flags = ferTierFreeFlags(b.bookingDate ?? null, fer ?? null);
    if (flags.active) {
      const freeUnits =
        (flags.women ? b.ticketWomen : 0) +
        (flags.men ? b.ticketMen : 0) +
        (flags.couple ? b.ticketCouple : 0);
      const paidUnits = Math.max(0, totalUnits - freeUnits);
      raw = freeEntryFee * freeUnits + ticketFee * paidUnits;
      // Surface the dominant per-unit fee (paid if any paid tickets, else free).
      ratePerUnit = paidUnits > 0 ? ticketFee : freeEntryFee;
    } else {
      ratePerUnit = ticketFee;
      raw = ticketFee * totalUnits;
    }
  }
  // Paid bookings: cap commission at the price actually collected so the platform
  // never earns more than the customer paid.
  // Free-entry bookings: the platform fee is a per-head VENDOR charge — the
  // customer pays nothing, so there is no revenue to cap against. Never cap it.
  const amount = bookingType === "free_entry" ? round2(raw) : round2(Math.min(raw, price));
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
  fer?: FreeEntryRulesShape | null,
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
    // Table commission scales with attendees; cash collected is pro-rated by
    // attendance ratio so partial no-shows aren't over-charged.
    const ratePerUnit = tableFee;
    const guests = Math.max(1, b.guests);
    const unitCount = Math.max(0, ag);
    const cashCollected = (ag / guests) * Number(b.finalPrice);
    const raw = tableFee * unitCount;
    return { bookingType, ratePerUnit, unitCount, amount: round2(Math.min(raw, Math.max(0, cashCollected))) };
  }

  // ticket mode COD — split per-tier when FER is active (free tiers billed
  // at freeEntryFee × actuals; paid tiers at ticketFee × actuals; aggregate
  // capped by cash actually collected at the door).
  const flags = ferTierFreeFlags(b.bookingDate ?? null, fer ?? null);
  const pw = Number(event.priceWomen ?? 0);
  const pm = Number(event.priceMen ?? 0);
  const pc = Number(event.priceCouple ?? 0);
  const unitCount = Math.max(0, aw + am + ac);
  let raw: number;
  let ratePerUnit: number;
  let cashCollected: number;
  if (flags.active) {
    const freeUnits =
      (flags.women ? aw : 0) +
      (flags.men ? am : 0) +
      (flags.couple ? ac : 0);
    const paidUnits = Math.max(0, unitCount - freeUnits);
    raw = freeEntryFee * freeUnits + ticketFee * paidUnits;
    ratePerUnit = paidUnits > 0 ? ticketFee : freeEntryFee;
    cashCollected =
      (flags.women ? 0 : aw * pw) +
      (flags.men ? 0 : am * pm) +
      (flags.couple ? 0 : ac * pc);
  } else {
    ratePerUnit = ticketFee;
    raw = ticketFee * unitCount;
    cashCollected = aw * pw + am * pm + ac * pc;
  }
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
