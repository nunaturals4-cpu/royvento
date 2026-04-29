import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/api/places/autocomplete", requireAuth(["vendor", "admin"]), async (req, res) => {
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
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", q);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("components", "country:in");
    url.searchParams.set("language", "en");
    url.searchParams.set("types", "geocode");
    const response = await fetch(url.toString());
    if (!response.ok) {
      req.log.error({ status: response.status }, "Google Places API error");
      res.status(502).json({ error: "Address autocomplete request failed" });
      return;
    }
    const data = (await response.json()) as {
      status: string;
      predictions: { place_id: string; description: string }[];
    };
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      req.log.error({ googleStatus: data.status }, "Google Places API non-OK status");
      res.status(502).json({ error: "Address autocomplete returned an error" });
      return;
    }
    const results = (data.predictions ?? []).map((p) => ({
      place_id: p.place_id,
      description: p.description,
    }));
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Failed to call Google Places API");
    res.status(502).json({ error: "Address autocomplete unavailable" });
  }
});

export default router;
