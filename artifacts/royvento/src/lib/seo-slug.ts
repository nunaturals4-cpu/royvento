export function slugify(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CITY_ALIASES: Record<string, string> = {
  bengaluru: "bangalore",
  bombay: "mumbai",
  gurugram: "gurgaon",
  calcutta: "kolkata",
};

export function canonicalCitySlug(slug: string): string {
  const s = slugify(slug);
  return CITY_ALIASES[s] ?? s;
}

export function isAliasedCity(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(CITY_ALIASES, slugify(slug));
}

export const PUB_CATEGORY_SLUGS: { slug: string; label: string; query: string }[] = [
  { slug: "rooftop", label: "Rooftop Bars", query: "rooftop" },
  { slug: "microbrewery", label: "Microbreweries", query: "microbrewery" },
  { slug: "sports-bar", label: "Sports Bars", query: "sports bar" },
  { slug: "live-music", label: "Live Music Pubs", query: "live music" },
  { slug: "couple-friendly", label: "Couple-Friendly Pubs", query: "couple" },
  { slug: "lounge", label: "Lounges", query: "lounge" },
  { slug: "club", label: "Clubs", query: "club" },
  { slug: "pubs", label: "Pubs", query: "pubs" },
];

const CATEGORY_SLUG_SET = new Set(PUB_CATEGORY_SLUGS.map((c) => c.slug));

export function isCategorySlug(slug: string): boolean {
  return CATEGORY_SLUG_SET.has(slugify(slug));
}

export function findCategoryBySlug(slug: string) {
  const s = slugify(slug);
  return PUB_CATEGORY_SLUGS.find((c) => c.slug === s);
}

export function titleCase(input: string): string {
  return input
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function pubDetailSlug(args: {
  id: number;
  name: string | null | undefined;
  city: string | null | undefined;
  locality?: string | null | undefined;
}): string {
  const citySeg = canonicalCitySlug(args.city ?? "city");
  const namePart = slugify(args.name ?? "pub");
  const localPart = slugify(args.locality ?? "");
  const slug = [namePart, localPart].filter(Boolean).join("-");
  return `/pubs/${citySeg || "city"}/${slug}-${args.id}`;
}

export function eventDetailSlug(args: {
  id: number;
  title: string | null | undefined;
  city: string | null | undefined;
  date?: string | null | undefined;
}): string {
  const citySeg = canonicalCitySlug(args.city ?? "city");
  const namePart = slugify(args.title ?? "event");
  const datePart = args.date ? slugify(args.date.slice(0, 10)) : "";
  const slug = [namePart, datePart].filter(Boolean).join("-");
  return `/events/${citySeg || "city"}/${slug}-${args.id}`;
}

export function parseTrailingId(slug: string): number | null {
  const m = /-(\d+)$/.exec(slug);
  if (!m || !m[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Heuristic locality match against vendor address/location text.
export function vendorMatchesLocality(
  vendor: { address?: string | null; location?: string | null; city?: string | null },
  localitySlug: string,
): boolean {
  const target = slugify(localitySlug);
  if (!target) return false;
  const haystack = slugify(
    [vendor.address ?? "", vendor.location ?? "", vendor.city ?? ""].join(" "),
  );
  // simple containment, also accept tokenised match
  if (haystack.includes(target)) return true;
  const tokens = target.split("-").filter(Boolean);
  return tokens.length > 1 && tokens.every((t) => haystack.includes(t));
}
