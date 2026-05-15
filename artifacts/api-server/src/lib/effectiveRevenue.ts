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
  actualWomen: number | null;
  actualMen: number | null;
  actualCouple: number | null;
  actualGuests: number | null;
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
          // Ticket mode: gross-from-actuals × per-tier price, then scaled by
          // the booking's discount ratio so coupons/points applied at booking
          // time aren't silently reverted at scan/analytics time.
          // The non-ticket branch below uses finalPrice directly so it's
          // already discount-aware.
          const ev = eventMap.get(b.eventId);
          const pw = Number(ev?.priceWomen ?? 0);
          const pm = Number(ev?.priceMen ?? 0);
          const pc = Number(ev?.priceCouple ?? 0);
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
