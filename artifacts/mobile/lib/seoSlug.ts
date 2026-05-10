export function slugify(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
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
  madras: "chennai",
  poona: "pune",
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

export function buildCityFAQs(cityName: string): { question: string; answer: string }[] {
  return [
    {
      question: `Which area in ${cityName} has the best pubs?`,
      answer: `${cityName}'s nightlife is spread across several lively neighbourhoods. Browse by locality on Royvento to find the best pubs near you, with verified ratings, photos and instant table booking.`,
    },
    {
      question: `What's the legal drinking age in ${cityName}?`,
      answer: `The legal drinking age in ${cityName} follows the relevant state law. Carry a valid government photo ID — most pubs and clubs check at the door.`,
    },
    {
      question: `Are there ladies' nights in ${cityName}?`,
      answer: `Yes — many pubs in ${cityName} run weekly ladies' nights with free entry or complimentary drinks. Filter by Free Entry on Royvento to see today's options.`,
    },
    {
      question: `Can I book a table in advance in ${cityName}?`,
      answer: `Yes. Royvento lets you reserve a table at verified pubs in ${cityName} with instant confirmation. Look for the "Book a Table" button on each pub page.`,
    },
  ];
}

export function buildCategoryFAQs(category: string, cityName: string) {
  return [
    {
      question: `Which is the best ${category.toLowerCase()} venue in ${cityName}?`,
      answer: `Our top-rated ${category.toLowerCase()} venues in ${cityName} are listed above, sorted by Royvento member ratings and review volume. Tap any pub to see photos, today's offers and book a table instantly.`,
    },
    {
      question: `Do ${category.toLowerCase()} pubs in ${cityName} take advance bookings?`,
      answer: `Yes, every ${category.toLowerCase()} venue listed on Royvento accepts instant table reservations — no calls, no waiting. Bookings are confirmed in seconds.`,
    },
    {
      question: `Are there happy-hour offers at ${category.toLowerCase()} pubs in ${cityName}?`,
      answer: `Many partner pubs run happy-hour and ladies' night deals. Check the offers section on each pub's page for current drink plans and free-entry windows.`,
    },
  ];
}

export function buildLocalityFAQs(localityName: string, cityName: string) {
  return [
    {
      question: `Which is the most famous pub in ${localityName}?`,
      answer: `The top-rated pubs in ${localityName}, ${cityName} are listed above, ranked by Royvento member ratings. Tap any pub to see photos, hours and instant booking.`,
    },
    {
      question: `What's a typical cover charge in ${localityName} pubs?`,
      answer: `Cover charges vary by night and venue. Many pubs in ${localityName} have free entry on weekdays and a couple cover at weekends — Royvento shows the latest offers and free-entry days on each pub page.`,
    },
    {
      question: `Where can I park near ${localityName} pubs?`,
      answer: `Most pubs in ${localityName} either offer valet parking or are close to public parking lots. Check each pub's detail page on Royvento for parking notes and address.`,
    },
  ];
}
