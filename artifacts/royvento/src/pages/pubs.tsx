import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, X, Star,
  Wine, Coffee, Music, SlidersHorizontal, Store, Heart, Sunset,
} from "lucide-react";
import { apiGet, formatINR } from "@/lib/api";
import { LocationSelect } from "@/components/LocationSelect";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useSearch } from "wouter";
import { pubDetailSlug, eventDetailSlug } from "@/lib/seo-slug";

/* â”€â”€â”€ types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const DRINK_DEAL_OPTIONS = [
  { value: "welcome", label: "Welcome Drink" },
  { value: "unlimited", label: "Unlimited" },
  { value: "ticket", label: "Incl. with Ticket" },
  { value: "custom", label: "Custom Deal" },
] as const;

type DrinkPlanType = typeof DRINK_DEAL_OPTIONS[number]["value"] | "";

interface PublicEvent {
  id: number;
  vendorId?: number;
  title: string;
  category: string;
  type: string;
  location: string;
  city: string;
  state: string;
  country: string;
  price: number;
  priceCouple?: number;
  dateNight?: boolean;
  startingPrice?: number;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  partnerName: string;
  approvedAt?: string | null;
  popular: boolean;
  hasDrinkPlans?: boolean;
  freeEntryRules?: { enabled: boolean; genders: string[]; days: string[]; beforeTime?: string } | null;
  vendorCrowdLevel?: string | null;
  vendorCategory?: string;
}

const CROWD_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "party", label: "High Crowd" },
] as const;
type CrowdFilter = "" | typeof CROWD_OPTIONS[number]["value"];

const PRICE_PRESETS = [
  { label: "Under ₹500", min: 0, max: 500 },
  { label: "₹500 – ₹1.5K", min: 500, max: 1500 },
  { label: "₹1.5K+", min: 1500, max: 99999999 },
];

const DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* â”€â”€â”€ category config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
// Each venue category becomes its own section on the page. The `value` matches
// the vendor's `category` field (set by admins), so re-categorising a pub from
// the admin panel moves it into the matching section here. Venues whose
// category doesn't match any known value fall into the "Other" section.
const PUB_CATEGORY_SECTIONS = [
  { value: "Pub",     label: "Pubs & Bars",  icon: Wine   },
  { value: "Club",    label: "Nightclubs",   icon: Music  },
  { value: "Lounge",  label: "Lounges",      icon: Coffee },
  { value: "Rooftop", label: "Rooftop Bars", icon: Sunset },
  { value: "Other",   label: "Other",        icon: Store  },
] as const;

type PubCategory = typeof PUB_CATEGORY_SECTIONS[number]["value"];
type VenueTab = "All" | PubCategory;

const KNOWN_PUB_CATEGORIES = new Set<string>(["Pub", "Club", "Lounge", "Rooftop"]);
// Map a venue to its section value, bucketing anything unknown into "Other".
const sectionOf = (p: PublicEvent): PubCategory =>
  KNOWN_PUB_CATEGORIES.has(p.vendorCategory ?? "") ? (p.vendorCategory as PubCategory) : "Other";

const SIDEBAR_CATEGORY_DEFS = [
  { id: "All" as const,       label: "All Venues", icon: Store },
  { id: "DateNight" as const, label: "Date Night", icon: Heart },
  ...PUB_CATEGORY_SECTIONS.map((s) => ({ id: s.value, label: s.label, icon: s.icon })),
];

// "Date Night" is admin-curated: an event carries a `dateNight` flag that admins
// toggle from the panel. This is the single source of truth shared with the
// homepage Date Night rail, so both surfaces show the exact same set.
const isDateNightVenue = (p: PublicEvent) => p.dateNight === true;

/* â”€â”€â”€ PubCard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function PubCard({ pub }: { pub: PublicEvent }) {
  const loc = pub.city
    ? `${pub.city}${pub.state ? ", " + pub.state : ""}`
    : pub.location;

  const fer = pub.freeEntryRules;
  const freeDays = fer?.enabled === true ? (fer.days ?? []) : [];
  const hasFreeEntry = freeDays.length > 0;
  const todayAbbr = DAY_ABBRS[new Date().getDay()];
  const isFreeToday = hasFreeEntry && freeDays.includes(todayAbbr);

  const NEW_BADGE_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;
  const isNew = (() => {
    if (!pub.approvedAt) return false;
    const ms = new Date(pub.approvedAt).getTime();
    if (Number.isNaN(ms)) return false;
    return Date.now() - ms <= NEW_BADGE_WINDOW_MS;
  })();

  const ratingLabel = pub.rating > 0 ? pub.rating.toFixed(1) : null;
  // pub.id is the event ID â€” always use it with eventDetailSlug so the
  // EventSlugRoute â†’ EventDetail(eventId) lookup succeeds.
  // pub.vendorId is the vendor ID and only works with pubDetailSlug / VendorDetail.
  const href = pub.type === "pub"
    ? eventDetailSlug({ id: pub.id, title: pub.title, city: pub.city })
    : `${eventDetailSlug({ id: pub.id, title: pub.title, city: pub.city })}#book`;

  // Body chips: venue category / vibe only. Free-entry & drink-deal now render
  // as prominent colour-coded badges on the photo (see above), so they're not
  // repeated here.
  const bodyTags: string[] = [];
  if (pub.vendorCategory) bodyTags.push(pub.vendorCategory);
  if (pub.category && pub.category !== pub.vendorCategory) bodyTags.push(pub.category);

  return (
    <Link href={href}>
      <article className="reveal group cursor-pointer overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111111] transition-all duration-300 hover:border-primary/25 hover:shadow-[0_0_0_1px_rgba(232,41,28,0.15),0_8px_32px_rgba(0,0,0,0.6)]">

        {/* â”€â”€ Image â”€â”€ */}
        <div className="relative aspect-video overflow-hidden bg-black/40">
          {pub.imageUrl ? (
            <img
              src={pub.imageUrl}
              alt={pub.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-card to-muted" />
          )}
          {/* darkening overlay for text legibility */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30" />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/5" />
        </div>

        {/* â”€â”€ Body â”€â”€ */}
        <div className="p-3.5">
          {/* Prominent highlight badges — shown in the body (not over the image),
              colour-coded for hierarchy: Popular (red) · Free Entry (green) ·
              Drink Deal (amber). High contrast, easy to notice on all screens. */}
          {(pub.popular || isNew || hasFreeEntry || pub.hasDrinkPlans) && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {(pub.popular || isNew) && (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                  {pub.popular ? "★ Popular" : "New"}
                </span>
              )}
              {hasFreeEntry && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full bg-white ${isFreeToday ? "animate-pulse" : ""}`} />
                  {isFreeToday ? "Free Today" : "Free Entry"}
                </span>
              )}
              {pub.hasDrinkPlans && (
                <span className="inline-flex items-center rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
                  Drink Deal
                </span>
              )}
            </div>
          )}

          {/* Name */}
          <h3 className="text-[15px] font-bold leading-tight text-white line-clamp-1 group-hover:text-primary transition-colors duration-200">
            {pub.title}
          </h3>

          {/* Area */}
          <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-1">{loc}</p>

          {/* Rating + review count */}
          {ratingLabel && (
            <div className="mt-1.5 flex items-center gap-1">
              <Star className="h-3 w-3 fill-primary text-primary" />
              <span className="text-[12px] font-semibold text-white">{ratingLabel}</span>
              {pub.reviewCount > 0 && (
                <span className="text-[11px] text-muted-foreground">({pub.reviewCount >= 1000
                  ? `${(pub.reviewCount / 1000).toFixed(1)}K`
                  : pub.reviewCount})</span>
              )}
            </div>
          )}

          {/* Tag chips — colour-coded for hierarchy & contrast. Free/Deal are
              already shown as prominent badges on the photo, so here we show the
              venue category/vibe chips with a stronger, readable treatment. */}
          {bodyTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {bodyTags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-md border border-white/20 bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/85"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Price row */}
          <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.06] pt-2.5">
            <span className="text-[11px] text-muted-foreground/70">Entry</span>
            <span className="text-sm font-bold text-white">{formatINR(pub.price)}</span>
          </div>
        </div>
      </article>
    </Link>
  );
}

/* â”€â”€â”€ Main Pubs page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export function Pubs() {
  const { t } = useTranslation();
  const searchStr = useSearch();

  // â”€â”€ all filter state (unchanged) â”€â”€
  const [search, setSearch]         = useState(() => new URLSearchParams(searchStr).get("search") ?? "");
  const [country, setCountry]       = useState("");
  const [stateF, setStateF]         = useState("");
  const [city, setCity]             = useState(() => new URLSearchParams(searchStr).get("city") ?? "");
  const [pricePreset, setPricePreset]   = useState<number | null>(null);
  const [drinkPlanType, setDrinkPlanType] = useState<DrinkPlanType>("");
  const [hasDrinkDeal, setHasDrinkDeal] = useState(false);
  const [freeEntry, setFreeEntry]   = useState(false);
  const [crowdLevel, setCrowdLevel] = useState<CrowdFilter>("");
  // ?category= deep-links a Popular Category from the homepage straight to its
  // section here: a PUB_CATEGORY_SECTIONS value (Pub/Club/Lounge/Rooftop/Other)
  // selects that venue tab; "DateNight" flips the date-night filter instead.
  const [venueTab, setVenueTab]     = useState<VenueTab>(() => {
    const c = new URLSearchParams(searchStr).get("category");
    return PUB_CATEGORY_SECTIONS.some((s) => s.value === c) ? (c as VenueTab) : "All";
  });
  const [dateNight, setDateNight]   = useState(() => new URLSearchParams(searchStr).get("category") === "DateNight");
  const [pubs, setPubs]             = useState<PublicEvent[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);

  useEffect(() => {
    const sp = new URLSearchParams(searchStr);
    setCity(sp.get("city") ?? "");
    const s = sp.get("search");
    if (s !== null) setSearch(s);
  }, [searchStr]);

  useEffect(() => {
    const params = new URLSearchParams({ type: "pub" });
    if (search.trim())    params.set("search", search.trim());
    if (country)          params.set("country", country);
    if (stateF)           params.set("state", stateF);
    if (city)             params.set("city", city);
    if (pricePreset !== null) {
      const preset = PRICE_PRESETS[pricePreset];
      if (preset) { params.set("minPrice", String(preset.min)); params.set("maxPrice", String(preset.max)); }
    }
    if (drinkPlanType) params.set("drinkPlanType", drinkPlanType);
    setLoading(true);
    apiGet<PublicEvent[]>(`/api/events?${params.toString()}`)
      .then(setPubs).catch(() => setPubs([]))
      .finally(() => setLoading(false));
  }, [search, country, stateF, city, pricePreset, drinkPlanType]);

  function toggleHasDrinkDeal(val: boolean) {
    setHasDrinkDeal(val);
    if (!val) setDrinkPlanType("");
  }

  const displayedPubs = useMemo(() => {
    let list = pubs;
    if (venueTab !== "All") list = list.filter((p) => sectionOf(p) === venueTab);
    if (dateNight) list = list.filter(isDateNightVenue);
    if (hasDrinkDeal && !drinkPlanType) list = list.filter((p) => p.hasDrinkPlans);
    if (freeEntry) list = list.filter((p) => p.freeEntryRules?.enabled === true && (p.freeEntryRules?.days?.length ?? 0) > 0);
    if (crowdLevel) list = list.filter((p) => p.vendorCrowdLevel === crowdLevel);
    return list;
  }, [pubs, venueTab, dateNight, hasDrinkDeal, drinkPlanType, freeEntry, crowdLevel]);

  // Group the filtered venues into per-category sections. Only sections with at
  // least one venue are rendered. When a specific category tab is active this
  // naturally collapses to a single section.
  const groupedSections = useMemo(() =>
    PUB_CATEGORY_SECTIONS
      .map((sec) => ({ ...sec, items: displayedPubs.filter((p) => sectionOf(p) === sec.value) }))
      .filter((sec) => sec.items.length > 0),
  [displayedPubs]);

  const hasFilters = search || country || stateF || city || pricePreset !== null
    || drinkPlanType || hasDrinkDeal || freeEntry || crowdLevel || venueTab !== "All" || dateNight;

  // Real counts derived from fetched data
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: pubs.length };
    for (const sec of PUB_CATEGORY_SECTIONS) counts[sec.value] = 0;
    for (const p of pubs) counts[sectionOf(p)] += 1;
    counts["DateNight"] = pubs.filter(isDateNightVenue).length;
    return counts;
  }, [pubs]);

  function clearAll() {
    setSearch(""); setCountry(""); setStateF(""); setCity("");
    setPricePreset(null); setDrinkPlanType(""); setHasDrinkDeal(false);
    setFreeEntry(false); setCrowdLevel(""); setVenueTab("All"); setDateNight(false);
  }

  // sidebar category click â€” maps to existing venueTab filter
  function handleCategoryClick(id: VenueTab | "DateNight") {
    if (id === "DateNight") {
      // Independent toggle that composes with the venue-type tabs.
      setDateNight((v) => !v);
    } else {
      setVenueTab(id);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Pubs in India — Book a Table | Royvento"
        description="Find the best pubs, microbreweries, sports bars and rooftop lounges across India. Filter by city, vibe, dance floor and free entry — book a table instantly on Royvento."
        canonical="/pubs"
      />

      {/* â”€â”€ Page header â”€â”€ */}
      <div className="border-b border-white/[0.06] bg-black/40 backdrop-blur-sm">
        <div className="container mx-auto px-4 md:px-6 py-6 md:py-10">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight text-white">All Pubs &amp; Bars</h1>
            <p className="mt-1.5 text-muted-foreground text-xs sm:text-sm md:text-base">
              {t("pubs.subtitle")}
            </p>
          </div>

          {/* â”€â”€ Search + filter bar â”€â”€ */}
          <div className="mt-4 md:mt-6 flex flex-wrap gap-2 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("pubs.search_placeholder")}
                className="pl-10 h-10 bg-white/[0.04] border-white/[0.08] rounded-xl focus:border-primary/40 focus:ring-0"
              />
            </div>

            {/* Location inline */}
            <div className="shrink-0">
              <LocationSelect
                country={country}
                state={stateF}
                city={city}
                onChange={(next) => { setCountry(next.country); setStateF(next.state); setCity(next.city); }}
              />
            </div>

            {/* Crowd level */}
            <Select
              value={crowdLevel === "" ? "any" : crowdLevel}
              onValueChange={(v) => setCrowdLevel(v === "any" ? "" : (v as CrowdFilter))}
            >
              <SelectTrigger className="h-10 w-36 bg-white/[0.04] border-white/[0.08] rounded-xl text-sm">
                <SelectValue placeholder="Crowd" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any crowd</SelectItem>
                {CROWD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filters toggle */}
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={cn(
                "inline-flex items-center gap-2 h-10 px-4 rounded-xl border text-sm font-medium transition-colors",
                filtersOpen
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-white/[0.04] border-white/[0.08] text-muted-foreground hover:border-primary/40 hover:text-white",
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {hasFilters && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
            </button>

            {hasFilters && (
              <button onClick={clearAll} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-white transition-colors">
                <X className="h-3.5 w-3.5" /> Clear all
              </button>
            )}
          </div>

          {/* â”€â”€ Expanded filters â”€â”€ */}
          {filtersOpen && (
            <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 md:p-4 flex flex-wrap gap-x-6 gap-y-3 md:gap-x-8 md:gap-y-4">
              {/* Free entry + drink deal toggles */}
              <div className="flex items-center gap-2.5">
                <Switch id="free-entry-pubs" checked={freeEntry} onCheckedChange={setFreeEntry} />
                <Label htmlFor="free-entry-pubs" className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                  {t("events.free_entry_label")}
                </Label>
              </div>
              <div className="flex items-center gap-2.5">
                <Switch id="has-drink-deal" checked={hasDrinkDeal} onCheckedChange={toggleHasDrinkDeal} />
                <Label htmlFor="has-drink-deal" className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />
                  {t("events.drink_deals")}
                </Label>
              </div>

              {/* Deal type chips */}
              {hasDrinkDeal && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  {DRINK_DEAL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDrinkPlanType(drinkPlanType === opt.value ? "" : opt.value)}
                      className={cn(
                        "px-3 py-1 rounded-lg text-xs font-medium border transition-colors",
                        drinkPlanType === opt.value
                          ? "bg-primary border-primary text-primary-foreground"
                          : "bg-white/[0.04] border-white/[0.08] text-muted-foreground hover:border-primary/40",
                      )}
                    >{opt.label}</button>
                  ))}
                </div>
              )}

              {/* Price range */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-muted-foreground mr-1">Price:</span>
                <button
                  onClick={() => setPricePreset(null)}
                  className={cn("px-3 py-1 rounded-lg text-xs font-medium border transition-colors",
                    pricePreset === null
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-white/[0.04] border-white/[0.08] text-muted-foreground hover:border-primary/40")}
                >Any</button>
                {PRICE_PRESETS.map((preset, idx) => (
                  <button
                    key={preset.label}
                    onClick={() => setPricePreset(pricePreset === idx ? null : idx)}
                    className={cn("px-3 py-1 rounded-lg text-xs font-medium border transition-colors",
                      pricePreset === idx
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-white/[0.04] border-white/[0.08] text-muted-foreground hover:border-primary/40")}
                  >{preset.label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* â”€â”€ Two-column layout â”€â”€ */}
      <div className="container mx-auto px-4 md:px-6 py-6">
        <div className="flex gap-6">

          {/* â”€â”€ Sidebar â”€â”€ */}
          <aside className="hidden lg:flex flex-col gap-6 w-52 shrink-0">
            {/* Categories â€” real counts from live data */}
            <div className="rounded-xl border border-white/[0.06] bg-[#111111] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-3">Categories</h3>
              <ul className="space-y-0.5">
                {SIDEBAR_CATEGORY_DEFS.map(({ id, label, icon: Icon }) => {
                  const isActive = id === "DateNight" ? dateNight : venueTab === id;
                  const count = categoryCounts[id] ?? 0;
                  return (
                    <li key={id}>
                      <button
                        onClick={() => handleCategoryClick(id)}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-colors",
                          isActive
                            ? "bg-primary/15 text-primary font-semibold"
                            : "text-muted-foreground hover:bg-white/[0.04] hover:text-white",
                        )}
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon className="h-4 w-4 shrink-0" />
                          {label}
                        </span>
                        {count !== null && (
                          <span className={cn("text-[11px]", isActive ? "text-primary" : "text-muted-foreground/60")}>
                            {count}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>

          {/* â”€â”€ Main content â”€â”€ */}
          <div className="flex-1 min-w-0">
            {/* Result count + mobile tabs */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                {loading ? "Loading…" : (
                  <><span className="font-semibold text-white">{displayedPubs.length}</span> venues found</>
                )}
              </p>
              {/* Mobile venue type tabs */}
              <div className="flex lg:hidden gap-1.5 overflow-x-auto">
                {(["All", ...PUB_CATEGORY_SECTIONS.map((s) => s.value)] as const as VenueTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setVenueTab(tab)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap",
                      venueTab === tab
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-white/[0.04] border-white/[0.08] text-muted-foreground",
                    )}
                  >{tab === "All" ? "All" : PUB_CATEGORY_SECTIONS.find((s) => s.value === tab)?.label ?? tab}</button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 md:gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="rounded-2xl bg-[#111111] animate-pulse h-64" />
                ))}
              </div>
            ) : displayedPubs.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.06] bg-[#111111] p-10 md:p-16 text-center">
                <Wine className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-30" />
                <p className="text-xl font-semibold text-white mb-1">{t("pubs.no_results")}</p>
                {hasFilters && (
                  <button onClick={clearAll} className="mt-3 text-sm text-primary hover:underline">
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-10">
                {groupedSections.map(({ value, label, icon: Icon, items }) => (
                  <section key={value} aria-label={label}>
                    <div className="mb-4 flex items-center gap-2.5">
                      <Icon className="h-5 w-5 text-primary shrink-0" />
                      <h2 className="text-lg md:text-xl font-bold tracking-tight text-white">{label}</h2>
                      <span className="text-xs font-medium text-muted-foreground">({items.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 md:gap-4">
                      {items.map((p) => <PubCard key={p.id} pub={p} />)}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

