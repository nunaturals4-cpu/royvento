import { db, eventsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

export interface EffectiveRevenueBooking {
  id: number;
  eventId: number;
  finalPrice: string | number;
  /**
   * Pre-discount gross stored on the booking row (sum of per-tier price ×
   * count, with free-entry-rules already zeroed out at booking time).
   * Needed so ticket-mode revenue can be scaled back down by the coupon /
   * points discount the guest received.
   */
  totalPrice: string | number | null;
  paymentMethod: string | null;
  pubMode: string | null;
  guests: number;
  // Booking date is needed to determine whether the event's FER applies
  // for this booking's weekday. Without it, mixed-tier bookings (one
  // free, one paid) over-count the free portion at the per-tier sticker
  // price, breaking the COD Collected (Actual) KPI.
  bookingDate: string | null;
  actualWomen: number | null;
  actualMen: number | null;
  actualCouple: number | null;
  actualGuests: number | null;
}

// Day-name list matches the abbreviations stored in events.freeEntryRules.days.
const FER_DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Returns which tiers (women/men/couple) are zero-priced for a booking under
 * the event's free-entry-rules on the booking's weekday. Mirrors the same
 * logic in routes/bookings.ts (calcActualAmountDue) and the create-booking
 * handler so all three surfaces compute identical per-tier prices.
 *
 * If FER is not active for the booking's weekday, all tiers are paid (no
 * change). If FER lists women only, women are free but men/couple still pay.
 */
export function ferTierFreeness(
  bookingDate: string | null | undefined,
  fer: { enabled?: boolean; days?: string[]; genders?: string[] } | null | undefined,
): { women: boolean; men: boolean; couple: boolean } {
  if (!fer?.enabled || !bookingDate) return { women: false, men: false, couple: false };
  const dayName = FER_DAY_ABBRS[new Date(`${bookingDate}T12:00:00`).getDay()];
  if (!dayName || !Array.isArray(fer.days) || !fer.days.includes(dayName)) {
    return { women: false, men: false, couple: false };
  }
  const genders = (fer.genders ?? []).map((g) => String(g).toLowerCase());
  return {
    women: genders.includes("women"),
    men: genders.includes("men"),
    couple: genders.includes("couple"),
  };
}

export interface EffectiveRevenueResult {
  byBookingId: Map<number, number>;
  actualCodRevenue: number;
  actualCodRecordedCount: number;
  pendingActualsCount: number;
}

/**
 * Fraction of the gross the guest actually owes after coupon + points were
 * applied at booking time. Used to scale ticket-mode per-tier revenue at
 * scan / analytics time so coupon discounts aren't silently reverted.
 *
 *   ratio = finalPrice / totalPrice
 *
 * Examples:
 *   - No discount:    finalPrice = totalPrice  → ratio = 1
 *   - 50% coupon:     finalPrice = totalPrice/2 → ratio = 0.5
 *   - 100% coupon:    finalPrice = 0           → ratio = 0
 *   - Legacy / weird data (totalPrice missing or 0): ratio = 1 (preserve old
 *     behaviour rather than divide by zero; the FER-zeroed per-tier prices
 *     still drive the result to 0 in genuinely-free cases).
 */
export function bookingDiscountRatio(
  b: { finalPrice: string | number; totalPrice: string | number | null | undefined },
): number {
  const tp = Number(b.totalPrice ?? 0);
  const fp = Number(b.finalPrice ?? 0);
  if (!Number.isFinite(tp) || tp <= 0) return 1;
  if (!Number.isFinite(fp) || fp <= 0) return 0;
  return Math.min(1, fp / tp);
}

/**
 * Compute per-booking effective revenue using the unified rule:
 *   - online (paymentMethod !== "cod") → finalPrice
 *   - COD with recorded actuals:
 *       ticket mode → sum(actual count × per-type event price)
 *       other modes  → (actualGuests / max(1, guests)) × finalPrice
 *   - COD without recorded actuals → ₹0 (STRICT mode)
 *
 * This is the source of truth for "Revenue" and "Total Earnings" across
 * `/partner/analytics`, `/bookings/vendor/summary`, and `/admin/analytics`.
 */
export async function computeEffectiveRevenues(
  bookings: EffectiveRevenueBooking[],
): Promise<EffectiveRevenueResult> {
  const byBookingId = new Map<number, number>();
  let actualCodRevenue = 0;
  let actualCodRecordedCount = 0;
  let pendingActualsCount = 0;

  const codTicketEventIds = Array.from(
    new Set(
      bookings
        .filter((b) => b.paymentMethod === "cod" && b.pubMode === "ticket")
        .map((b) => b.eventId),
    ),
  );
  const events =
    codTicketEventIds.length > 0
      ? await db
          .select()
          .from(eventsTable)
          .where(inArray(eventsTable.id, codTicketEventIds))
      : [];
  const eventMap = new Map(events.map((e) => [e.id, e]));

  for (const b of bookings) {
    const fp = Number(b.finalPrice);
    let rev = 0;
    if (b.paymentMethod !== "cod") {
      rev = fp;
    } else {
      const aw = b.actualWomen;
      const am = b.actualMen;
      const ac = b.actualCouple;
      const ag = b.actualGuests;
      const hasActuals = aw != null || am != null || ac != null || ag != null;
      if (hasActuals) {
        actualCodRecordedCount++;
        if (b.pubMode === "ticket") {
          // Ticket mode: gross-from-actuals × per-tier price, with FER-free
          // tiers zeroed out for THIS booking's weekday, then scaled by the
          // booking's discount ratio so coupons/points applied at booking
          // time aren't silently reverted at scan/analytics time.
          //
          // Mixed bookings — e.g. 1 female (FER-free) + 1 male (₹1000 paid)
          // — used to over-count the free tier at its sticker price OR
          // collapse to ₹0 when finalPrice equalled zero across a fully-
          // free portion. Per-tier FER zeroing fixes both: the woman
          // contributes ₹0, the man contributes ₹1000, COD Collected
          // (Actual) shows ₹1000.
          const ev = eventMap.get(b.eventId);
          const flags = ferTierFreeness(
            b.bookingDate,
            (ev as { freeEntryRules?: { enabled?: boolean; days?: string[]; genders?: string[] } | null } | undefined)?.freeEntryRules ?? null,
          );
          const pw = flags.women ? 0 : Number(ev?.priceWomen ?? 0);
          const pm = flags.men ? 0 : Number(ev?.priceMen ?? 0);
          const pc = flags.couple ? 0 : Number(ev?.priceCouple ?? 0);
          const gross = (aw ?? 0) * pw + (am ?? 0) * pm + (ac ?? 0) * pc;
          rev = gross * bookingDiscountRatio(b);
        } else {
          const guests = Math.max(1, b.guests);
          rev = ((ag ?? 0) / guests) * fp;
        }
        actualCodRevenue += rev;
      } else {
        pendingActualsCount++;
      }
    }
    byBookingId.set(b.id, rev);
  }

  return { byBookingId, actualCodRevenue, actualCodRecordedCount, pendingActualsCount };
}
