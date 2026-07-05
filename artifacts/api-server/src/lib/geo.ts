// ── Geolocation helpers ──────────────────────────────────────────────────────
// Small, dependency-free utilities for the location-based notification system:
// parsing coordinates out of a pasted Google-Maps link, computing great-circle
// distance, and building an indexed bounding-box prefilter for radius queries.

export interface Coords {
  lat: number;
  lng: number;
}

function validLat(n: number): boolean {
  return Number.isFinite(n) && n >= -90 && n <= 90;
}
function validLng(n: number): boolean {
  return Number.isFinite(n) && n >= -180 && n <= 180;
}

/**
 * Best-effort extraction of (lat,lng) from whatever the admin pasted into the
 * "Google Maps Location" field. Handles the common shapes:
 *   • "12.9716, 77.5946"                        (plain coordinates)
 *   • "https://maps.google.com/?q=12.97,77.59"  (?q= / &query= param)
 *   • ".../@12.9716,77.5946,15z/..."            (the @lat,lng,zoom form)
 *   • "https://www.google.com/maps/place/.../data=...!3d12.97!4d77.59"
 * Returns null when no plausible coordinate pair is found (e.g. a short
 * maps.app.goo.gl link that must be resolved by following the redirect — we
 * don't do network I/O here).
 */
export function parseCoords(input: string | null | undefined): Coords | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  // 1) Plain "lat, lng" (or "lat lng").
  const plain = /^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(s);
  if (plain) {
    const lat = Number(plain[1]);
    const lng = Number(plain[2]);
    if (validLat(lat) && validLng(lng)) return { lat, lng };
  }

  // 2) `@lat,lng` (Google Maps place URL).
  const at = /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(s);
  if (at) {
    const lat = Number(at[1]);
    const lng = Number(at[2]);
    if (validLat(lat) && validLng(lng)) return { lat, lng };
  }

  // 3) `!3dLAT!4dLNG` (embedded data form).
  const data = /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/.exec(s);
  if (data) {
    const lat = Number(data[1]);
    const lng = Number(data[2]);
    if (validLat(lat) && validLng(lng)) return { lat, lng };
  }

  // 4) `?q=lat,lng` / `&query=lat,lng` / `&ll=lat,lng`.
  const q = /[?&](?:q|query|ll|destination)=(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(s);
  if (q) {
    const lat = Number(q[1]);
    const lng = Number(q[2]);
    if (validLat(lat) && validLng(lng)) return { lat, lng };
  }

  return null;
}

const EARTH_RADIUS_KM = 6371;
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle (haversine) distance between two points, in kilometres. */
export function haversineKm(a: Coords, b: Coords): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when `point` is within `radiusKm` of `center`. */
export function withinRadius(center: Coords, point: Coords, radiusKm: number): boolean {
  return haversineKm(center, point) <= radiusKm;
}

/**
 * Degree deltas for a lat/lng bounding box around `center` covering `radiusKm`.
 * Use these to prefilter rows on the (latitude, longitude) index cheaply before
 * applying the exact haversine check — a bbox is a superset of the circle, so it
 * never drops a valid row, and it keeps the radius query off a full table scan.
 */
export function boundingBox(center: Coords, radiusKm: number): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  const latDelta = radiusKm / 111; // ~111 km per degree of latitude
  // Longitude degrees shrink with latitude; guard the poles so cos()→0 doesn't
  // blow the delta up to infinity.
  const cos = Math.max(0.01, Math.cos(toRad(center.lat)));
  const lngDelta = radiusKm / (111 * cos);
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

/** Parse a DB numeric column (string|number|null) into a finite number or null. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
