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
 *     Paid tiers: commission = ticketRate% × final payable ticket revenue
 *       ticketRate is stored as a percentage (0–100), e.g. "10.00" = 10%.
 *       finalPrice is used as the revenue base — it is already the amount
 *       the guest owes after coupon / reward-points discounts.
 *     FER-free tiers (Free-Entry-Rules active for a gender on the booking
 *       date): commission = freeEntryRate × people for those tiers only.
 *       These tiers contributed ₹0 to finalPrice so the percentage term
 *       naturally excludes them; the flat freeEntryRate still applies.
 *
 *   Table classification (pubMode = "table")
 *     commission = tableBookingRate × verifiedGuestCount
 *       tableBookingRate is stored as a flat ₹ amount per person, e.g. "100.00" = ₹100/person.
 *       verifiedGuestCount = actual door counts (actualWomen + actualMen + actualCouple, or
 *       actualGuests as fallback) so guest-count edits at the scanner reduce commission in
 *       real time. Never uses revenue — purely headcount-based.
 *
 * Actuals-aware mode: when a booking has been finalised at the door
 * (Save Actual Entry on the scanner has set actualWomen/Men/Couple/
 * Guests), computeCommissionFromActuals uses those actual counts and, for
 * ticket-mode bookings, the per-tier event prices to compute actual revenue
 * before applying the percentage. Bookings that haven't been finalised yet
 * fall back to the booked counts / finalPrice so pending-estimate displays
 * still work.
 *
 * The "zero-actual wipe" risk that used to motivate locking commission
 * to booked counts no longer applies: the scanner endpoint now LOCKS
 * a booking after the first Save Actual Entry (30-second grace window
 * for duplicates), so a stray re-scan with zero actuals can't zero out
 * a realised ledger entry.
 */

export type BookingType = "free_entry" | "ticket" | "table" | "event_booking" | "cover_charge" | "vip_table";

export type CommissionTrigger =
  | "online_payment"
  | "cod_checkin"
  | "free_checkin"
  | "settlement_offset";

export interface CommissionRatesInput {
  freeEntryRate: string | number | null | undefined;
  /** Ticket commission as a percentage (0–100), e.g. 10 = 10% of ticket revenue. */
  ticketRate: string | number | null | undefined;
  tableBookingRate: string | number | null | undefined;
  /** VIP Table Booking commission — flat ₹ amount per verified guest, same shape as tableBookingRate. */
  vipTableBookingRate?: string | number | null | undefined;
  /** Event booking commission as a percentage (0–100) of ticket revenue. */
  eventRate?: string | number | null | undefined;
  /** When false, no event commission is charged (overrides eventRate). */
  eventCommissionEnabled?: boolean | null | undefined;
  /** Cover-charge commission as a percentage (0–100) of final package revenue. */
  coverChargeRate?: string | number | null | undefined;
}

export interface PlannedBookingShape {
  pubMode: string;
  finalPrice: string | number;
  /** Pre-discount gross (sum of per-tier price × count). Used in actuals path
   *  to compute the discount ratio when per-tier prices are available. */
  totalPrice?: string | number | null;
  guests: number;
  ticketWomen: number;
  ticketMen: number;
  ticketCouple: number;
  bookingDate?: string | null;
  /** Event commission percentage locked at booking time (historical rate). */
  eventCommissionPct?: string | number | null;
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
  /** For ticket: the percentage value (e.g. 10 for 10%).
   *  For free_entry / table: the flat ₹ amount per person/booking. */
  ratePerUnit: number;
  unitCount: number;
  amount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Resolve the effective event commission percentage for a booking.
 * Prefers the rate locked on the booking at creation time (historical), so
 * later changes to the partner's configured rate never re-price old bookings.
 * Falls back to the current configured rate; returns 0 when commission is
 * disabled and no historical rate was stored.
 */
function resolveEventPct(b: PlannedBookingShape, rates: CommissionRatesInput): number {
  if (b.eventCommissionPct != null && b.eventCommissionPct !== "") {
    return Math.max(0, Number(b.eventCommissionPct));
  }
  if (rates.eventCommissionEnabled === false) return 0;
  return Math.max(0, Number(rates.eventRate ?? 0));
}

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
  if (b.pubMode === "event_booking") return "event_booking";
  if (b.pubMode === "cover_charge") return "cover_charge";
  if (b.pubMode === "vip_table") return "vip_table";
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
 *
 * Ticket commission is now percentage-based:
 *   commission = freeEntryRate × FER-free-people
 *              + (ticketRate / 100) × finalPrice
 *
 * `finalPrice` is already discounted (after coupon / points), so this
 * formula automatically honours the requirement to "use final payable amount".
 * FER-free tiers contribute ₹0 to finalPrice, so the percentage term
 * naturally excludes them; only the flat freeEntryRate applies to those tiers.
 */
export function computeCommissionFromPlanned(
  b: PlannedBookingShape,
  rates: CommissionRatesInput,
  fer?: FreeEntryRulesShape | null,
): CommissionResult {
  const freeEntryFee = Number(rates.freeEntryRate ?? 0);
  const ticketPct = Number(rates.ticketRate ?? 0); // stored as percentage (0–100)
  const tablePct = Number(rates.tableBookingRate ?? 0); // stored as flat ₹ per person
  const vipTablePct = Number(rates.vipTableBookingRate ?? 0); // stored as flat ₹ per person

  const coverChargePct = Number(rates.coverChargeRate ?? 0); // stored as percentage (0–100)

  const bookingType = classifyBookingType(b);

  if (bookingType === "event_booking") {
    // Percentage of the final payable event revenue (ticket price × guests,
    // already net of coupon / points discounts via finalPrice).
    const pct = resolveEventPct(b, rates);
    const amount = round2((pct / 100) * Number(b.finalPrice));
    return { bookingType, ratePerUnit: pct, unitCount: Math.max(0, b.guests), amount };
  }

  if (bookingType === "cover_charge") {
    // Percentage of the final payable package revenue (package price × qty,
    // already net of coupon / points discounts via finalPrice). Mirrors the
    // ticket-style percentage model with its own configurable rate.
    const amount = round2((coverChargePct / 100) * Number(b.finalPrice));
    return { bookingType, ratePerUnit: coverChargePct, unitCount: Math.max(0, b.guests), amount };
  }

  if (bookingType === "table") {
    const unitCount = Math.max(0, b.guests);
    const amount = round2(tablePct * unitCount);
    return { bookingType, ratePerUnit: tablePct, unitCount, amount };
  }

  if (bookingType === "vip_table") {
    const unitCount = Math.max(0, b.guests);
    const amount = round2(vipTablePct * unitCount);
    return { bookingType, ratePerUnit: vipTablePct, unitCount, amount };
  }

  if (bookingType === "free_entry") {
    const unitCount = freeEntryPeopleCount(b);
    return { bookingType, ratePerUnit: freeEntryFee, unitCount, amount: round2(freeEntryFee * unitCount) };
  }

  // ── Ticket: percentage of final payable revenue ──────────────────────────
  const w = Math.max(0, b.ticketWomen);
  const m = Math.max(0, b.ticketMen);
  const c = Math.max(0, b.ticketCouple);
  const totalUnits = w + m + c;

  // Legacy / event-mode bookings store headcount in `guests`, not per-tier
  // counts. Fall back so those bookings never silently bill ₹0.
  if (totalUnits === 0) {
    const guests = Math.max(0, b.guests);
    const amount = round2((ticketPct / 100) * Number(b.finalPrice));
    return { bookingType, ratePerUnit: ticketPct, unitCount: guests, amount };
  }

  const flags = ferTierFreeFlags(b.bookingDate ?? null, fer ?? null);

  // FER-free tiers: flat freeEntryRate per person (unchanged from free-entry
  // workflow — only the ticket percentage changes here).
  const freeW = flags.women ? w : 0;
  const freeM = flags.men ? m : 0;
  const freeC = flags.couple ? c : 0;
  const freePeople = freeW + freeM + freeC * 2; // couple = 2 people
  const freePart = round2(freeEntryFee * freePeople);

  // Paid tiers: ticketPct of finalPrice. Because FER-free tiers have
  // price = ₹0 at booking time, they contribute ₹0 to finalPrice, so
  // the percentage is automatically applied only to paid-tier revenue.
  const ticketPart = round2((ticketPct / 100) * Number(b.finalPrice));

  // Surface the dominant per-unit rate for the report's "Rate" column.
  const paidUnits = (flags.women ? 0 : w) + (flags.men ? 0 : m) + (flags.couple ? 0 : c);
  const ratePerUnit = paidUnits > 0 ? ticketPct : freeEntryFee;

  return { bookingType, ratePerUnit, unitCount: totalUnits, amount: round2(freePart + ticketPart) };
}

/**
 * Actuals-aware commission for all booking types.
 *
 * Table formula:
 *   commission = tableBookingRate × verifiedGuestCount
 *   (verifiedGuestCount = actualWomen + actualMen + actualCouple, or
 *    actualGuests as fallback, or booked counts if actuals are null)
 *
 * Ticket formula:
 *   commission = freeEntryRate × FER-free actual people
 *              + (ticketRate / 100) × actualTicketRevenue
 *
 * Where actualTicketRevenue:
 *   - If per-tier event prices are available:
 *       Σ(paid-tier actual counts × perTierPrice) × discountRatio
 *       discountRatio = finalPrice / totalPrice (preserves coupon discounts)
 *   - Fallback (prices not available): finalPrice (planned estimate)
 *
 * Fallback to booked counts when actuals are null (booking not yet finalised
 * at the door) so pending-estimate displays in Admin still show a sensible
 * figure.
 *
 * classifyBookingType still keys off finalPrice, not actuals, so a booking
 * with finalPrice = 0 stays "free_entry" even if actuals land at zero.
 */
export function computeCommissionFromActuals(
  b: ActualBookingShape,
  rates: CommissionRatesInput,
  event: EventPriceShape,
  fer?: FreeEntryRulesShape | null,
): CommissionResult {
  const bookingType = classifyBookingType(b);

  // ── Event booking: percentage of event revenue ──────────────────────────
  if (bookingType === "event_booking") {
    const pct = resolveEventPct(b, rates);
    const ag = b.actualGuests ?? b.guests;
    const units = Math.max(0, ag);
    const amount = round2((pct / 100) * Number(b.finalPrice));
    return { bookingType: "event_booking", ratePerUnit: pct, unitCount: units, amount };
  }

  // ── Cover charge: percentage of final package revenue ────────────────────
  if (bookingType === "cover_charge") {
    const pct = Number(rates.coverChargeRate ?? 0);
    const ag = b.actualGuests ?? b.guests;
    const units = Math.max(0, ag);
    const amount = round2((pct / 100) * Number(b.finalPrice));
    return { bookingType: "cover_charge", ratePerUnit: pct, unitCount: units, amount };
  }

  // ── Table: flat ₹ per verified guest ────────────────────────────────────
  if (bookingType === "table") {
    const tableRatePerPerson = Number(rates.tableBookingRate ?? 0); // flat ₹ per person

    const aw = b.actualWomen ?? b.ticketWomen;
    const am = b.actualMen ?? b.ticketMen;
    const ac = b.actualCouple ?? b.ticketCouple;
    const ag = b.actualGuests ?? b.guests;
    const totalUnits = aw + am + ac;

    // Guest count: prefer per-tier actual sum; fall back to actualGuests / booked guests.
    const units = totalUnits > 0 ? totalUnits : Math.max(0, ag);
    const amount = round2(tableRatePerPerson * units);
    return { bookingType: "table", ratePerUnit: tableRatePerPerson, unitCount: units, amount };
  }

  // ── VIP Table: flat ₹ per verified guest (same shape as Table) ──────────
  if (bookingType === "vip_table") {
    const vipTableRatePerPerson = Number(rates.vipTableBookingRate ?? 0); // flat ₹ per person

    const aw = b.actualWomen ?? b.ticketWomen;
    const am = b.actualMen ?? b.ticketMen;
    const ac = b.actualCouple ?? b.ticketCouple;
    const ag = b.actualGuests ?? b.guests;
    const totalUnits = aw + am + ac;

    const units = totalUnits > 0 ? totalUnits : Math.max(0, ag);
    const amount = round2(vipTableRatePerPerson * units);
    return { bookingType: "vip_table", ratePerUnit: vipTableRatePerPerson, unitCount: units, amount };
  }

  // ── Ticket: percentage of actual ticket revenue ──────────────────────────
  if (bookingType === "ticket") {
    const freeEntryFee = Number(rates.freeEntryRate ?? 0);
    const ticketPct = Number(rates.ticketRate ?? 0); // percentage (0–100)

    const flags = ferTierFreeFlags(b.bookingDate ?? null, fer ?? null);
    const aw = b.actualWomen ?? b.ticketWomen;
    const am = b.actualMen ?? b.ticketMen;
    const ac = b.actualCouple ?? b.ticketCouple;
    const ag = b.actualGuests ?? b.guests;
    const totalUnits = aw + am + ac;

    // FER-free tiers: flat freeEntryRate per actual person (unchanged)
    const freeW = flags.women ? aw : 0;
    const freeM = flags.men ? am : 0;
    const freeC = flags.couple ? ac : 0;
    const freePeople = freeW + freeM + freeC * 2;
    const freePart = round2(freeEntryFee * freePeople);

    // Paid tiers: percentage of actual ticket revenue.
    const pw = Number(event.priceWomen ?? 0);
    const pm = Number(event.priceMen ?? 0);
    const pc = Number(event.priceCouple ?? 0);
    const hasPrices = pw > 0 || pm > 0 || pc > 0;

    let ticketRevenue: number;
    if (totalUnits === 0 || !hasPrices) {
      // No per-tier prices available (e.g. admin report with null prices)
      // or no ticket counts — use finalPrice as a best estimate. This is
      // exact for online bookings and a reasonable estimate for COD.
      ticketRevenue = Number(b.finalPrice);
    } else {
      const paidW = flags.women ? 0 : aw;
      const paidM = flags.men ? 0 : am;
      const paidC = flags.couple ? 0 : ac;
      const grossActual = paidW * pw + paidM * pm + paidC * pc;
      // Apply the booking's discount ratio so coupon / points deductions
      // applied at booking time flow through to the actuals commission.
      const tp = Number(b.totalPrice ?? 0);
      const fp = Number(b.finalPrice ?? 0);
      const discRatio = tp > 0 ? Math.min(1, fp / tp) : 1;
      ticketRevenue = grossActual * discRatio;
    }

    const ticketPart = round2((ticketPct / 100) * ticketRevenue);
    const amount = round2(freePart + ticketPart);
    const units = totalUnits > 0 ? totalUnits : Math.max(0, ag);

    return { bookingType: "ticket", ratePerUnit: ticketPct, unitCount: units, amount };
  }

  // ── Free entry: delegate to planned with actual counts ──────────────────
  const effective: PlannedBookingShape = {
    pubMode: b.pubMode,
    finalPrice: b.finalPrice,
    totalPrice: b.totalPrice,
    guests: b.actualGuests ?? b.guests,
    ticketWomen: b.actualWomen ?? b.ticketWomen,
    ticketMen: b.actualMen ?? b.ticketMen,
    ticketCouple: b.actualCouple ?? b.ticketCouple,
    bookingDate: b.bookingDate,
  };
  return computeCommissionFromPlanned(effective, rates, fer);
}

/** Commission ledger triggers that represent realised platform earnings. */
export const REALISED_COMMISSION_TRIGGERS = [
  "online_payment",
  "cod_checkin",
  "free_checkin",
] as const satisfies readonly CommissionTrigger[];
