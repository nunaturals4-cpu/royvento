import { createContext, useContext, useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "royvento_city";
const LOCALITY_KEY = "royvento_locality";
const STATE_KEY = "royvento_state";
const MANUAL_KEY = "royvento_loc_manual";

interface LocationContextValue {
  selectedCity: string;
  selectedLocality: string;
  /** The user's detected administrative state/region (e.g. "West Bengal").
   *  Empty when unknown (manual city pick or no GPS). */
  selectedState: string;
  /** `manual` = true when the user explicitly picked a city from the list, so
   *  GPS auto-detect won't override it on the next load. */
  setSelectedCity: (city: string, locality?: string, manual?: boolean) => void;
  /** Triggers a high-accuracy GPS lookup + reverse-geocode. Resolves true on
   *  success. Safe to call from a user gesture (this is when we prompt). */
  detectLocation: () => Promise<boolean>;
  detecting: boolean;
  locationError: string;
}

const LocationContext = createContext<LocationContextValue>({
  selectedCity: "",
  selectedLocality: "",
  selectedState: "",
  setSelectedCity: () => {},
  detectLocation: async () => false,
  detecting: false,
  locationError: "",
});

export function useSelectedCity() {
  return useContext(LocationContext);
}

interface GeoResult { city: string; locality: string; state: string; }

const dedupe = (city: string, locality: string): GeoResult => {
  let c = (city ?? "").trim();
  let l = (locality ?? "").trim();
  if (l && c && l.toLowerCase() === c.toLowerCase()) l = "";
  return { city: c, locality: l, state: "" };
};

/** Google reverse-geocode via our server proxy. Google has far finer Indian
 *  sublocality/neighbourhood data than OSM (the difference between "Tarulia"
 *  and the wider "AP Block" / "Bidhannagar"). Returns null on any failure so
 *  the caller can fall back to OSM. */
async function reverseGeocodeGoogle(lat: number, lon: number): Promise<GeoResult | null> {
  try {
    const r = await fetch(`/api/places/reverse?lat=${lat}&lng=${lon}`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { city?: string | null; locality?: string | null; state?: string | null };
    const res = dedupe(d.city ?? "", d.locality ?? "");
    return res.city || res.locality ? { ...res, state: (d.state ?? "").trim() } : null;
  } catch {
    return null;
  }
}

/** OpenStreetMap Nominatim fallback (free, no key). */
async function reverseGeocodeOSM(lat: number, lon: number): Promise<GeoResult> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=18&addressdetails=1`,
      { headers: { "Accept-Language": "en" } },
    );
    const data = await r.json();
    const a = data.address ?? {};
    const cityRaw = a.city || a.town || a.municipality || a.state_district || a.county || a.state || "";
    const localityRaw =
      a.neighbourhood || a.suburb || a.quarter || a.hamlet || a.village ||
      a.city_district || a.residential || a.road || "";
    const clean = (s: string) => (s ? String(s).split(",")[0].trim() : "");
    return { ...dedupe(clean(cityRaw), clean(localityRaw)), state: clean(a.state || "") };
  } catch {
    return { city: "", locality: "", state: "" };
  }
}

/** Reverse-geocode lat/lon → { city, locality }. Google first (precise), then
 *  OSM as a fallback. */
async function reverseGeocodeDetailed(lat: number, lon: number): Promise<GeoResult> {
  return (await reverseGeocodeGoogle(lat, lon)) ?? (await reverseGeocodeOSM(lat, lon));
}

/** Resolve the most accurate GPS fix the device can give, quickly. Uses
 *  watchPosition (not getCurrentPosition) so we can wait for the reading to
 *  refine: a phone's first fix is often a coarse WiFi/cell estimate (which is
 *  what lands you in the *next* block), and GPS tightens it to a few metres a
 *  moment later. We keep the lowest-`accuracy` reading and:
 *    • resolve immediately once accuracy ≤ 65 m (building-level → exact enough),
 *    • otherwise resolve after 8 s with the best fix gathered.
 *  maximumAge:0 forces a fresh fix (never a stale cached one). */
function getBestPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("unsupported")); return; }
    let best: GeolocationPosition | null = null;
    let settled = false;
    let watchId: number | null = null;
    const cleanup = () => {
      if (watchId !== null) { try { navigator.geolocation.clearWatch(watchId); } catch {} }
      clearTimeout(timer);
    };
    const succeed = () => { if (settled) return; settled = true; cleanup(); resolve(best as GeolocationPosition); };
    const timer = setTimeout(() => {
      if (settled) return;
      if (best) { succeed(); }
      else { settled = true; cleanup(); reject(new Error("timeout")); }
    }, 8000);
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (pos.coords.accuracy <= 65) succeed();
      },
      (err) => { if (best) succeed(); else if (!settled) { settled = true; cleanup(); reject(err); } },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 },
    );
  });
}

/** Backward-compatible string helper (returns just the city). */
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  return (await reverseGeocodeDetailed(lat, lon)).city;
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [selectedCity, setSelectedCityState] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? ""; } catch { return ""; }
  });
  const [selectedLocality, setSelectedLocalityState] = useState<string>(() => {
    try { return localStorage.getItem(LOCALITY_KEY) ?? ""; } catch { return ""; }
  });
  const [selectedState, setSelectedStateRaw] = useState<string>(() => {
    try { return localStorage.getItem(STATE_KEY) ?? ""; } catch { return ""; }
  });
  const setSelectedState = useCallback((s: string) => {
    setSelectedStateRaw(s);
    try { if (s) localStorage.setItem(STATE_KEY, s); else localStorage.removeItem(STATE_KEY); } catch {}
  }, []);
  const [detecting, setDetecting] = useState(false);
  const [locationError, setLocationError] = useState("");

  const setSelectedCity = useCallback((city: string, locality = "", manual = false) => {
    setSelectedCityState(city);
    setSelectedLocalityState(locality);
    try {
      if (city) localStorage.setItem(STORAGE_KEY, city);
      else localStorage.removeItem(STORAGE_KEY);
      if (locality) localStorage.setItem(LOCALITY_KEY, locality);
      else localStorage.removeItem(LOCALITY_KEY);
      // Remember whether this was a deliberate manual pick so GPS auto-detect
      // respects it; a GPS detection clears the flag (GPS becomes the source).
      if (manual) localStorage.setItem(MANUAL_KEY, "1");
      else localStorage.removeItem(MANUAL_KEY);
    } catch {}
  }, []);

  const detectLocation = useCallback(async (): Promise<boolean> => {
    if (!navigator.geolocation) {
      setLocationError("Location is not supported on this device.");
      return false;
    }
    setDetecting(true);
    setLocationError("");
    try {
      const pos = await getBestPosition();
      const { city, locality, state } = await reverseGeocodeDetailed(
        pos.coords.latitude,
        pos.coords.longitude,
      );
      if (state) setSelectedState(state);
      // GPS detection is the source of truth → manual flag cleared (manual=false).
      if (city) { setSelectedCity(city, locality, false); return true; }
      if (locality) { setSelectedCity(locality, "", false); return true; }
      setLocationError("Couldn't determine your area. Please pick it manually.");
      return false;
    } catch (err: unknown) {
      const code = (err as GeolocationPositionError | undefined)?.code;
      setLocationError(
        code === 1
          ? "Location permission denied. Pick your city manually."
          : "Couldn't get your location. Pick your city manually.",
      );
      return false;
    } finally {
      setDetecting(false);
    }
  }, [setSelectedCity, setSelectedState]);

  // Auto-detect ONLY when the browser already granted geolocation permission —
  // a first-time visitor is never hit with an unprompted permission popup
  // ("ask only when required"). Crucially, when permission IS granted we refresh
  // the GPS location on every load (even if a city is cached) so the displayed
  // area stays accurate — UNLESS the user manually picked a city, which we never
  // override. This is what fixes a stale/imprecise cached city (e.g. showing
  // "Bidhannagar" when the user is actually in "Tarulia").
  useEffect(() => {
    if (!navigator.geolocation || !navigator.permissions?.query) return;
    let cancelled = false;
    const manual = (() => { try { return localStorage.getItem(MANUAL_KEY) === "1"; } catch { return false; } })();
    if (manual) return; // respect explicit manual selection
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (!cancelled && status.state === "granted") void detectLocation();
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // Run once on mount; detectLocation is stable (useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LocationContext.Provider
      value={{ selectedCity, selectedLocality, selectedState, setSelectedCity, detectLocation, detecting, locationError }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export { reverseGeocode, reverseGeocodeDetailed };
