import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";
import { TtlCache } from "../lib/ttlCache";

const router: IRouter = Router();

const AUTOCOMPLETE_TTL_MS = 60 * 60 * 1000;       // 1 hour
const DETAILS_TTL_MS      = 24 * 60 * 60 * 1000;  // 24 hours

type AutocompleteResult = { place_id: string; description: string; types: string[] }[];
type DetailsResult = { address: string | null; city: string | null; state: string | null; country: string | null };

const autocompleteCache = new TtlCache<AutocompleteResult>();
const detailsCache      = new TtlCache<DetailsResult>();

router.get("/places/autocomplete", requireAuth(["vendor", "admin"]), async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 3) {
    res.json([]);
    return;
  }
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    req.log.warn("GOOGLE_PLACES_API_KEY is not configured");
    res.status(503).json({ error: "Address autocomplete is not configured" });
    return;
  }
  const cached = autocompleteCache.get(q);
  if (cached) {
    res.json(cached);
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

router.get("/places/details", requireAuth(["vendor", "admin"]), async (req, res) => {
  const placeId = String(req.query.place_id ?? "").trim();
  if (!placeId) {
    res.status(400).json({ error: "place_id is required" });
    return;
  }
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    req.log.warn("GOOGLE_PLACES_API_KEY is not configured");
    res.status(503).json({ error: "Address lookup is not configured" });
    return;
  }
  const cachedDetail = detailsCache.get(placeId);
  if (cachedDetail) {
    res.json(cachedDetail);
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
