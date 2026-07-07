import { Router, type IRouter } from "express";
import { TtlCache } from "../lib/ttlCache";

const router: IRouter = Router();

const AUTOCOMPLETE_TTL_MS = 60 * 60 * 1000;       // 1 hour
const DETAILS_TTL_MS      = 24 * 60 * 60 * 1000;  // 24 hours

type AutocompleteResult = { place_id: string; description: string; types: string[] }[];
type DetailsResult = { address: string | null; city: string | null; state: string | null; country: string | null };

const autocompleteCache = new TtlCache<AutocompleteResult>();
const detailsCache      = new TtlCache<DetailsResult>();

router.get("/places/autocomplete", async (req, res) => {
  const q = String(req.query.q ?? "").trim().toLowerCase();
  if (q.length < 3) {
    res.json([]);
    return;
  }
  const cached = autocompleteCache.get(q);
  if (cached) {
    res.json(cached);
    return;
  }
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    req.log.warn("GOOGLE_PLACES_API_KEY is not configured");
    res.status(503).json({ error: "Address autocomplete is not configured" });
    return;
  }
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", q);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("components", "country:in");
    url.searchParams.set("language", "en");
    const response = await fetch(url.toString());
    if (!response.ok) {
      req.log.error({ status: response.status }, "Google Places API error");
      res.status(502).json({ error: "Address autocomplete request failed" });
      return;
    }
    const data = (await response.json()) as {
      status: string;
      predictions: { place_id: string; description: string; types?: string[] }[];
    };
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      req.log.error({ googleStatus: data.status }, "Google Places API non-OK status");
      res.status(502).json({ error: "Address autocomplete returned an error" });
      return;
    }
    const results = (data.predictions ?? []).map((p) => ({
      place_id: p.place_id,
      description: p.description,
      types: p.types ?? [],
    }));
    autocompleteCache.set(q, results, AUTOCOMPLETE_TTL_MS);
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Failed to call Google Places API");
    res.status(502).json({ error: "Address autocomplete unavailable" });
  }
});

type ReverseResult = { city: string | null; locality: string | null; area: string | null; route: string | null; state: string | null; formatted: string | null };
const reverseCache = new TtlCache<ReverseResult>();
// Short TTL: a "current location" lookup must reflect where the user is NOW, not
// a name cached from a previous visit. 10 min is enough to dedupe rapid repeat
// calls (e.g. dragging the map pin) without ever serving a stale label.
const REVERSE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Reverse-geocode lat/lng → precise Indian locality using Google's Geocoding
// API (much finer sublocality/neighbourhood data than OpenStreetMap, which is
// why Zomato/Swiggy-grade naming needs Google here). Falls back gracefully so
// the client can use OSM if Google isn't configured/enabled.
router.get("/places/reverse", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: "lat and lng are required" });
    return;
  }
  // Round to ~11m grid for cache hits without losing locality precision.
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  // `?fresh=1` (sent by explicit user detection / pin confirm) forces a live
  // lookup so the user always gets the current name, never a cached one.
  const fresh = req.query.fresh === "1" || req.query.fresh === "true";
  if (!fresh) {
    const cached = reverseCache.get(cacheKey);
    if (cached) { res.json(cached); return; }
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Reverse geocoding is not configured" });
    return;
  }
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("language", "en");
    const response = await fetch(url.toString());
    if (!response.ok) {
      res.status(502).json({ error: "Reverse geocoding request failed" });
      return;
    }
    const data = (await response.json()) as {
      status: string;
      results?: { formatted_address?: string; address_components?: { long_name: string; types: string[] }[] }[];
    };
    if (data.status !== "OK" || !data.results?.length) {
      res.status(502).json({ error: "Reverse geocoding returned no result", googleStatus: data.status });
      return;
    }
    // Google returns results ordered most-specific → broadest. Resolve each
    // field from the MOST specific result that carries it (walking the finest
    // component types first), so a broad political "block" from a coarse result
    // never wins over the true street-level neighbourhood. This is the fix for
    // "AN Block" showing instead of "Tarulia": we prefer the finest name Google
    // has for the exact point, and only broaden when it's genuinely absent.
    const results = data.results;
    const pick = (...types: string[]): string | null => {
      for (const r of results) {
        const comps = r.address_components ?? [];
        for (const t of types) {
          const hit = comps.find((c) => c.types.includes(t));
          if (hit) return hit.long_name;
        }
      }
      return null;
    };
    const route = pick("route");
    const neighbourhood = pick(
      "neighborhood",
      "sublocality_level_3",
      "sublocality_level_2",
      "sublocality_level_1",
      "sublocality",
    );
    const result: ReverseResult = {
      city: pick("locality", "postal_town", "administrative_area_level_3", "administrative_area_level_2", "administrative_area_level_1"),
      // Finest neighbourhood name (what Zomato/Blinkit show), falling back to the
      // street when Google has no named locality for the point.
      locality: neighbourhood ?? route,
      area: pick("sublocality_level_1", "sublocality", "administrative_area_level_2"),
      route,
      state: pick("administrative_area_level_1"),
      formatted: results[0]?.formatted_address ?? null,
    };
    reverseCache.set(cacheKey, result, REVERSE_TTL_MS);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to call Google Geocoding API");
    res.status(502).json({ error: "Reverse geocoding unavailable" });
  }
});

router.get("/places/details", async (req, res) => {
  const placeId = String(req.query.place_id ?? "").trim();
  if (!placeId) {
    res.status(400).json({ error: "place_id is required" });
    return;
  }
  const cachedDetail = detailsCache.get(placeId);
  if (cachedDetail) {
    res.json(cachedDetail);
    return;
  }
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    req.log.warn("GOOGLE_PLACES_API_KEY is not configured");
    res.status(503).json({ error: "Address lookup is not configured" });
    return;
  }
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    url.searchParams.set("place_id", placeId);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("fields", "address_components,formatted_address");
    url.searchParams.set("language", "en");
    const response = await fetch(url.toString());
    if (!response.ok) {
      req.log.error({ status: response.status }, "Google Places Details API error");
      res.status(502).json({ error: "Place details request failed" });
      return;
    }
    const data = (await response.json()) as {
      status: string;
      result?: {
        formatted_address?: string;
        address_components?: { long_name: string; short_name: string; types: string[] }[];
      };
    };
    if (data.status !== "OK") {
      req.log.error({ googleStatus: data.status }, "Google Places Details API non-OK status");
      res.status(502).json({ error: "Place details returned an error" });
      return;
    }
    const components = data.result?.address_components ?? [];
    const get = (...types: string[]) =>
      components.find((c) => types.some((t) => c.types.includes(t)))?.long_name ?? null;
    const result: DetailsResult = {
      address: data.result?.formatted_address ?? null,
      city: get("locality", "sublocality_level_1"),
      state: get("administrative_area_level_1"),
      country: get("country"),
    };
    detailsCache.set(placeId, result, DETAILS_TTL_MS);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to call Google Places Details API");
    res.status(502).json({ error: "Place details unavailable" });
  }
});

export default router;
