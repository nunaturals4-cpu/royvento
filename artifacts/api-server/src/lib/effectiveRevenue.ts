import { db, eventsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

export interface EffectiveRevenueBooking {
  id: number;
  eventId: number;
  finalPrice: string | number;
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
          const ev = eventMap.get(b.eventId);
          const pw = Number(ev?.priceWomen ?? 0);
          const pm = Number(ev?.priceMen ?? 0);
          const pc = Number(ev?.priceCouple ?? 0);
          rev = (aw ?? 0) * pw + (am ?? 0) * pm + (ac ?? 0) * pc;
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
