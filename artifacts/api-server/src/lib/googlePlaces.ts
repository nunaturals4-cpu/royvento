import { randomUUID } from "crypto";
import { objectStorageClient, ObjectStorageService } from "./objectStorage";
import { TtlCache } from "./ttlCache";

const DETAILS_TTL_MS  = 24 * 60 * 60 * 1000; // 24 hours
const URL_TTL_MS      =  1 * 60 * 60 * 1000; //  1 hour

const detailsCache = new TtlCache<PlaceDetails>();
const urlCache     = new TtlCache<PlaceDetails>();

const GOOGLE_PLACES_BASE = "https://maps.googleapis.com/maps/api/place";

const objectStorageService = new ObjectStorageService();

const DAY_MAP: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

type GoogleDetailsResult = {
  place_id: string;
  name: string;
  formatted_address: string;
  address_components?: AddressComponent[];
  international_phone_number?: string;
  website?: string;
  opening_hours?: {
    periods?: Array<{
      open: { day: number; time: string };
      close?: { day: number; time: string };
    }>;
  };
  photos?: Array<{ photo_reference: string }>;
};

function getComponent(components: AddressComponent[], types: string[]): string {
  for (const c of components) {
    if (types.some((t) => c.types.includes(t))) return c.long_name;
  }
  return "";
}

async function resolveUrl(url: string): Promise<string> {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname === "maps.app.goo.gl" ||
      parsed.hostname.endsWith(".goo.gl")
    ) {
      const resp = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
      return resp.url || url;
    }
  } catch {
    // not a URL or fetch failed — return as-is
  }
  return url;
}

function extractQueryFromUrl(resolvedUrl: string): string {
  try {
    const u = new URL(resolvedUrl);
    // /maps/place/Place+Name/@...
    const m = u.pathname.match(/\/maps\/place\/([^/]+)/);
    if (m?.[1]) return decodeURIComponent(m[1].replace(/\+/g, " "));
    // ?q= or ?query= param
    const q = u.searchParams.get("q") ?? u.searchParams.get("query");
    if (q) return q;
  } catch {
    // fall through
  }
  return resolvedUrl;
}

function formatTime(hhmm: string): string {
  return hhmm.replace(/^(\d{2})(\d{2})$/, "$1:$2");
}

function buildPlaceDetails(r: GoogleDetailsResult): PlaceDetails {
  const components = r.address_components ?? [];

  const city = getComponent(components, [
    "locality",
    "administrative_area_level_3",
    "administrative_area_level_2",
  ]);
  const state = getComponent(components, ["administrative_area_level_1"]);
  const country = getComponent(components, ["country"]);

  let openingHours: Record<
    string,
    { open: string; close: string } | null
  > | null = null;
  if (r.opening_hours?.periods?.length) {
    openingHours = {};
    for (const period of r.opening_hours.periods) {
      const dayKey = DAY_MAP[period.open.day];
      if (!dayKey) continue;
      openingHours[dayKey] = {
        open: formatTime(period.open.time),
        close: period.close ? formatTime(period.close.time) : "23:59",
      };
    }
    if (Object.keys(openingHours).length === 0) openingHours = null;
  }

  return {
    placeId: r.place_id,
    name: r.name,
    formattedAddress: r.formatted_address,
    city,
    state,
    country: country || "India",
    phone: r.international_phone_number ?? "",
    website: r.website ?? "",
    openingHours,
    photoRef: r.photos?.[0]?.photo_reference ?? null,
  };
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  website: string;
  openingHours: Record<string, { open: string; close: string } | null> | null;
  photoRef: string | null;
}

async function fetchPlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetails> {
  const cached = detailsCache.get(placeId);
  if (cached) return cached;

  const fields =
    "place_id,name,formatted_address,address_components,international_phone_number,website,opening_hours,photos";
  const detailsResp = await fetch(
    `${GOOGLE_PLACES_BASE}/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!detailsResp.ok) {
    throw Object.assign(new Error("Google Place details fetch failed"), {
      status: 502,
    });
  }
  const detailsData = (await detailsResp.json()) as {
    status: string;
    result?: GoogleDetailsResult;
    error_message?: string;
  };
  if (detailsData.status !== "OK" || !detailsData.result) {
    throw Object.assign(
      new Error(detailsData.error_message ?? "Place details not available"),
      { status: 502 },
    );
  }
  const details = buildPlaceDetails(detailsData.result);
  detailsCache.set(placeId, details, DETAILS_TTL_MS);
  return details;
}

export async function resolvePlaceFromUrl(
  googleUrl: string,
  apiKey: string,
): Promise<PlaceDetails> {
  const resolvedUrl = await resolveUrl(googleUrl.trim());
  const searchQuery = extractQueryFromUrl(resolvedUrl);
  const cacheKey = searchQuery.trim().toLowerCase();

  const urlCached = urlCache.get(cacheKey);
  if (urlCached) return urlCached;

  // Text search to find place_id
  const searchResp = await fetch(
    `${GOOGLE_PLACES_BASE}/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!searchResp.ok) {
    throw Object.assign(new Error("Google Places search request failed"), {
      status: 502,
    });
  }
  const searchData = (await searchResp.json()) as {
    status: string;
    results?: Array<{ place_id: string }>;
    error_message?: string;
  };
  if (searchData.status !== "OK" || !searchData.results?.length) {
    const msg =
      searchData.error_message ??
      `No place found for: "${searchQuery}". Try a more specific URL or business name.`;
    throw Object.assign(new Error(msg), { status: 404 });
  }
  const placeId = searchData.results[0]!.place_id;
  const details = await fetchPlaceDetails(placeId, apiKey);
  urlCache.set(cacheKey, details, URL_TTL_MS);
  return details;
}

export async function resolvePlaceById(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetails> {
  return fetchPlaceDetails(placeId, apiKey);
}

export async function downloadAndStorePhoto(
  photoRef: string,
  apiKey: string,
): Promise<string> {
  const photoUrl = `${GOOGLE_PLACES_BASE}/photo?maxwidth=800&photoreference=${encodeURIComponent(photoRef)}&key=${apiKey}`;
  const photoResp = await fetch(photoUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!photoResp.ok) {
    throw new Error(
      `Failed to download Google photo (HTTP ${photoResp.status})`,
    );
  }
  const contentType = photoResp.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await photoResp.arrayBuffer());

  const objectId = randomUUID();
  const privateObjectDir = objectStorageService.getPrivateObjectDir();
  const fullPath = privateObjectDir.startsWith("/")
    ? `${privateObjectDir}/uploads/${objectId}`
    : `/${privateObjectDir}/uploads/${objectId}`;

  const pathParts = fullPath.split("/").filter(Boolean);
  const bucketName = pathParts[0]!;
  const objectName = pathParts.slice(1).join("/");

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });

  return `/objects/uploads/${objectId}`;
}
