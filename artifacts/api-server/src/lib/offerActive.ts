import type { VendorOffer } from "@workspace/db";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function dayKey(d: Date): string {
  return DAY_KEYS[d.getDay()] ?? "sun";
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function parseHHMM(s: string): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * Single source of truth: is `offer` visible to customers at instant `when`?
 *
 * Rules:
 *  - active flag must be true
 *  - if startsAt set, when >= startsAt
 *  - if endsAt set, when <= endsAt
 *  - if days non-empty, current day must be in the list
 *  - if timeFrom and timeTo are both set, current time must fall in [from, to].
 *    Overnight windows (e.g. 22:00 → 02:00) are supported.
 */
export function isOfferActiveAt(offer: Pick<VendorOffer,
  "active" | "startsAt" | "endsAt" | "days" | "timeFrom" | "timeTo">, when: Date): boolean {
  if (!offer.active) return false;
  if (offer.startsAt && when < new Date(offer.startsAt)) return false;
  if (offer.endsAt && when > new Date(offer.endsAt)) return false;

  if (offer.days && offer.days.length > 0) {
    if (!offer.days.includes(dayKey(when))) return false;
  }

  const from = parseHHMM(offer.timeFrom);
  const to = parseHHMM(offer.timeTo);
  if (from !== null && to !== null) {
    const now = minutesOfDay(when);
    if (from <= to) {
      if (now < from || now > to) return false;
    } else {
      // Overnight band: active if now >= from OR now <= to
      if (now < from && now > to) return false;
    }
  }
  return true;
}
