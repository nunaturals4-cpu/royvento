import { Link, useLocation } from "wouter";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSelectedCity } from "@/components/LocationContext";
import { CityPickerModal } from "@/components/CityPickerModal";
import {
  ArrowRight,
  Calendar,
  Sparkles,
  ShieldCheck,
  Flame,
  PartyPopper,
  Megaphone,
  Clock,
  GlassWater,
  MapPin,
  ChevronDown,
  Search,
  Ticket,
  Users,
  Store,
  Music,
  Mic2,
  Gamepad2,
  Drama,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useListFeaturedEvents, useListVendorDrinkOffers, useGetMe } from "@workspace/api-client-react";
import type { VendorDrinkOffer } from "@workspace/api-client-react";
import { EventCard } from "@/components/EventCard";
import { apiGet } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { SEO } from "@/components/SEO";
import { FreeDrinkSection, TicketSection, splitVendorsByPlanType } from "@/components/DrinkDealCards";
import { COUNTRIES } from "@/lib/locations";

interface PublicEvent {
  id: number;
  title: string;
  category: string;
  type: string;
  location: string;
  city: string;
  state: string;
  price: number;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  partnerName: string;
  popular: boolean;
}

interface Announcement {
  id: number;
  title: string;
  body: string;
  announceDate: string;
  announceTime: string;
  imageUrl?: string;
  vendorName: string;
  eventId: number;
  eventTitle: string;
}

function cityMatch(eventCity: string, userCity: string): boolean {
  return eventCity.toLowerCase().includes(userCity.toLowerCase());
}

// Requested local-first discovery order: Pubs → Clubs → Events → Gaming
// Venues → Stand-Up Shows, then everything else. Ranked by keyword match on
// the event's category/type so it works without any backend change.
const CATEGORY_PRIORITY: { rank: number; keywords: string[] }[] = [
  { rank: 0, keywords: ["pub", "bar", "brewery"] },
  { rank: 1, keywords: ["club", "night", "lounge", "disco"] },
  { rank: 2, keywords: ["event", "concert", "gig", "live", "music", "festival"] },
  { rank: 3, keywords: ["game", "gaming", "arcade", "play", "esport"] },
  { rank: 4, keywords: ["standup", "stand-up", "stand up", "comedy", "drama"] },
];
function categoryRank(e: { category?: string; type?: string }): number {
  const hay = `${e.category ?? ""} ${e.type ?? ""}`.toLowerCase();
  for (const { rank, keywords } of CATEGORY_PRIORITY) {
    if (keywords.some((k) => hay.includes(k))) return rank;
  }
  return 5;
}

// Prioritise nearby experiences first: local-city items (ordered by the
// category priority above), then items from other cities (same ordering).
// Array.sort is stable, so equal-rank items keep their original order.
function sortCityFirst<T extends { city: string; category?: string; type?: string }>(
  items: T[],
  userCity: string,
): T[] {
  const ranked = (group: T[]) => [...group].sort((a, b) => categoryRank(a) - categoryRank(b));
  if (!userCity) return ranked(items);
  const local = items.filter((e) => cityMatch(e.city, userCity));
  const rest = items.filter((e) => !cityMatch(e.city, userCity));
  return [...ranked(local), ...ranked(rest)];
}

function SectionHeader({
  icon,
  eyebrow,
  title,
  seeAllHref,
  seeAllLabel,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  seeAllHref?: string;
  seeAllLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between mb-8">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-primary mb-2.5 flex items-center gap-2">
          {icon}
          {eyebrow}
        </p>
        <h2 className="font-serif text-3xl md:text-5xl tracking-tight">{title}</h2>
      </div>
      {seeAllHref && (
        <Link
          href={seeAllHref}
          className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          {seeAllLabel ?? "See all"}
          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}
    </div>
  );
}

function useUserLocation() {
  const [country, setCountry] = useState<string>("");
  const [state, setState] = useState<string>("");
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation || detected) return;
    // Only auto-read GPS when the browser ALREADY granted permission — never
    // trigger an unprompted permission popup on page load ("ask only when
    // required"). First-time users set country/state via the manual filters.
    const run = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const r = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            );
            if (!r.ok) return;
            const data = await r.json();
            const addr = data?.address ?? {};
            const detectedCountry: string = addr.country ?? "";
            const detectedState: string = addr.state ?? "";
            if (detectedCountry) setCountry(detectedCountry);
            if (detectedState) setState(detectedState);
            setDetected(true);
          } catch {}
        },
        () => { setDetected(true); },
        { timeout: 5000 },
      );
    };
    if (!navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => { if (status.state === "granted") run(); })
      .catch(() => {});
  }, [detected]);

  return { country, state, setCountry, setState };
}

// Presentational category tiles — each links to an existing route (no new
// backend / functionality). Mirrors the reference design's "Popular Categories".
const CATEGORIES = [
  { label: "Pubs & Bars",    sub: "Find nearby pubs",        icon: GlassWater, href: "/pubs",       img: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600&q=70" },
  { label: "Nightclubs",     sub: "Dance the night away",    icon: Music,      href: "/pubs",       img: "https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?w=600&q=70" },
  { label: "Exciting Games", sub: "Play & compete",          icon: Gamepad2,   href: "/pubs",       img: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&q=70" },
  { label: "Live Events",    sub: "Concerts & gigs",         icon: Mic2,       href: "/pubs",       img: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&q=70" },
  { label: "Ladies Nights",  sub: "Special offers & events", icon: Sparkles,   href: "/pub-offers", img: "https://images.unsplash.com/photo-1545128485-c400e7702796?w=600&q=70" },
  { label: "Standup Shows",  sub: "Laugh out loud",          icon: Drama,      href: "/pubs",       img: "https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=600&q=70" },
] as const;

export function Home() {
  const { t } = useTranslation();
  const { data: me } = useGetMe();
  const isLoggedIn = !!(me?.user);
  const { data: featured = [] } = useListFeaturedEvents();
  const { data: drinkOffers = [] } = useListVendorDrinkOffers();
  const { selectedCity: userCity } = useSelectedCity();

  // Hero search bar (functional): location → global city context + picker,
  // search term → /pubs?search=… which the Pubs page reads on load.
  const [, navigate] = useLocation();
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [heroSearch, setHeroSearch] = useState("");
  const [heroWhen, setHeroWhen] = useState("weekend");

  const submitHeroSearch = useCallback(() => {
    const params = new URLSearchParams();
    if (heroSearch.trim()) params.set("search", heroSearch.trim());
    if (userCity) params.set("city", userCity);
    if (heroWhen) params.set("when", heroWhen);
    const qs = params.toString();
    navigate(`/pubs${qs ? `?${qs}` : ""}`);
  }, [heroSearch, heroWhen, userCity, navigate]);

  const { country: detectedCountry, state: detectedState, setCountry: setDetectedCountry, setState: setDetectedState } = useUserLocation();
  const [filterCountry, setFilterCountry] = useState("");
  const [filterState, setFilterState] = useState("");

  // Sync detected location into filters (once, on first detection)
  useEffect(() => {
    if (detectedCountry && !filterCountry) setFilterCountry(detectedCountry);
    if (detectedState && !filterState) setFilterState(detectedState);
  }, [detectedCountry, detectedState]);

  const { data: popular = [], isLoading: popularLoading } = useQuery({
    queryKey: ["events-popular", filterCountry, filterState],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterCountry) params.set("country", filterCountry);
      if (filterState) params.set("state", filterState);
      const qs = params.toString();
      return apiGet<PublicEvent[]>(`/api/events/popular${qs ? `?${qs}` : ""}`);
    },
    staleTime: 120_000,
  });

  const { data: pubs = [] } = useQuery({
    queryKey: ["events-pubs"],
    queryFn: () => apiGet<PublicEvent[]>("/api/events?type=pub"),
    staleTime: 120_000,
    select: (data: PublicEvent[]) => data.slice(0, 6),
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements-recent"],
    queryFn: () => apiGet<Announcement[]>("/api/announcements/recent"),
    staleTime: 60_000,
  });

  const sortedPopular = useMemo(() => sortCityFirst(popular, userCity), [popular, userCity]);
  const sortedPubs = useMemo(() => sortCityFirst(pubs, userCity), [pubs, userCity]);

  const countryOptions = COUNTRIES.map((c) => c.name);
  const stateOptions = useMemo(() => {
    const found = COUNTRIES.find((c) => c.name.toLowerCase() === filterCountry.toLowerCase());
    return found ? found.states.map((s) => s.name) : [];
  }, [filterCountry]);

  const features = [
    { icon: ShieldCheck, title: t("home.feature1_title"), body: t("home.feature1_body") },
    { icon: PartyPopper, title: t("home.feature2_title"), body: t("home.feature2_body") },
    { icon: Sparkles, title: t("home.feature3_title"), body: t("home.feature3_body") },
  ];

  return (
    <div>
      <SEO
        title="Royvento — Book Pubs, Parties & Events Across India"
        description="Discover and book pubs, parties and events across India — rooftop bars in Bandra, microbreweries in Indiranagar, ladies' nights and verified offers. Instant table booking on Royvento."
        canonical="/"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Royvento",
            url: "https://royvento.com",
            logo: "https://royvento.com/images/logo.png",
            image: "https://royvento.com/images/logo.png",
            sameAs: [
              "https://www.instagram.com/royvento",
              "https://www.facebook.com/royvento",
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Royvento",
            url: "https://royvento.com",
            potentialAction: {
              "@type": "SearchAction",
              target: "https://royvento.com/pubs?search={search_term_string}",
              "query-input": "required name=search_term_string",
            },
          },
        ]}
      />
      {/* Hero — two-column: copy left, cinematic image right */}
      <section className="relative overflow-hidden">
        {/* Right-side cinematic image — bleeds to the top-right, dissolves into the background.
            Constrained to the headline area so the search bar below sits on pure black. */}
        <div className="pointer-events-none absolute top-0 right-0 -z-10 h-[58vh] md:h-[66vh] w-full lg:w-[58%]">
          <img
            src="https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1600&q=80"
            alt=""
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover object-center"
          />
          {/* Blood-red stage-light wash — matches the luxury nightlife reference */}
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/35 via-primary/12 to-transparent mix-blend-screen" />
          {/* Vignette for depth */}
          <div className="absolute inset-0 bg-black/25" />
          {/* Fade into the background on the left & bottom so copy stays legible */}
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
          <div className="absolute inset-0 lg:hidden bg-background/60" />
        </div>

        <div className="container mx-auto px-4 md:px-6">
          {/* Copy + image area */}
          <div className="grid lg:grid-cols-2 gap-8 items-center pt-14 md:pt-20 pb-8 min-h-[58vh] md:min-h-[66vh]">
            <div className="max-w-xl">
              <p className="reveal text-xs font-semibold uppercase tracking-[0.28em] text-primary mb-5">
                {t("home.hero_eyebrow")}
              </p>
              <h1 className="reveal font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.04] tracking-tight">
                <span className="text-white">{t("home.hero_title_1")}</span>
                <br />
                <span className="text-gradient-red">{t("home.hero_title_2")}</span>
              </h1>
              <p className="reveal mt-4 md:mt-5 text-sm md:text-base lg:text-lg text-muted-foreground max-w-xs sm:max-w-sm md:max-w-md leading-relaxed">
                {t("home.hero_subtitle")}
              </p>

              <div className="reveal mt-5 md:mt-7 flex flex-wrap gap-3">
                <Link href="/pubs">
                  <Button
                    size="lg"
                    className="gap-2 bg-primary text-primary-foreground red-glow border-0 h-12 px-7 rounded-xl text-base font-semibold"
                  >
                    {t("home.explore_events")} <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/pub-offers">
                  <Button
                    size="lg"
                    variant="outline"
                    className="gap-2 h-12 px-7 border-white/20 hover:bg-white/8 rounded-xl text-base font-semibold"
                  >
                    <GlassWater className="h-4 w-4" /> {t("home.happy_hours")}
                  </Button>
                </Link>
              </div>

              {/* Social proof */}
              <div className="reveal mt-5 md:mt-7 flex items-center gap-3">
                <div className="flex -space-x-2.5">
                  {[12, 32, 45, 5].map((n) => (
                    <img
                      key={n}
                      src={`https://i.pravatar.cc/72?img=${n}`}
                      alt=""
                      loading="lazy"
                      className="h-9 w-9 rounded-full border-2 border-background object-cover"
                    />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Join <span className="font-semibold text-primary">50K+</span> {t("home.join_enthusiasts")}
                </p>
              </div>
            </div>

            {/* Right column reserved for the bleeding background image */}
            <div className="hidden lg:block" aria-hidden />
          </div>

          {/* Search bar */}
          <div className="reveal relative z-10">
            <div className="glass-card-strong rounded-2xl p-2 md:p-2.5 flex flex-col sm:flex-row items-stretch gap-1">
              {/* Location → opens the shared city picker, updates global city context */}
              <button
                type="button"
                onClick={() => setCityModalOpen(true)}
                className="flex flex-1 items-center gap-3 rounded-xl px-3 md:px-4 py-2 md:py-2.5 text-left hover:bg-white/5 transition-colors"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t("home.search_location_label")}</span>
                  <span className="block truncate text-sm font-semibold text-white">
                    {userCity || t("home.search_location_placeholder")}
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>

              <div className="hidden sm:block w-px self-stretch bg-white/10" />

              {/* Date */}
              <label className="flex flex-1 items-center gap-3 rounded-xl px-3 md:px-4 py-2 md:py-2.5 cursor-pointer hover:bg-white/5 transition-colors">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                  <Calendar className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t("home.search_date_label")}</span>
                  <select
                    value={heroWhen}
                    onChange={(e) => setHeroWhen(e.target.value)}
                    className="w-full bg-transparent text-sm font-semibold text-white focus:outline-none cursor-pointer [&>option]:bg-card [&>option]:text-white"
                  >
                    <option value="weekend">This Weekend</option>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="any">Any time</option>
                  </select>
                </span>
              </label>

              <div className="hidden sm:block w-px self-stretch bg-white/10" />

              {/* What are you looking for → search term */}
              <div className="flex flex-[1.4] items-center gap-3 rounded-xl px-3 md:px-4 py-2 md:py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                  <Ticket className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t("home.search_what_label")}</span>
                  <input
                    value={heroSearch}
                    onChange={(e) => setHeroSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitHeroSearch(); }}
                    placeholder={t("home.search_what_placeholder")}
                    className="w-full bg-transparent text-sm font-semibold text-white placeholder:font-normal placeholder:text-muted-foreground focus:outline-none"
                  />
                </span>
              </div>

              {/* Search */}
              <button
                type="button"
                onClick={submitHeroSearch}
                aria-label="Search"
                className="flex h-12 w-12 shrink-0 items-center justify-center self-center rounded-full bg-primary text-primary-foreground red-glow transition-transform hover:scale-105 active:scale-95"
              >
                <Search className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="reveal grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-6 md:gap-x-6 md:gap-y-8 border-t border-white/10 mt-8 md:mt-10 pt-8 md:pt-10 pb-10 md:pb-14">
            {[
              { icon: Users, value: "50K+", label: t("home.stat_happy_users") },
              { icon: Store, value: "1,200+", label: t("home.stat_venues_listed") },
              { icon: Ticket, value: "3,500+", label: t("home.stat_events_hosted") },
              { icon: MapPin, value: "25+", label: t("home.stat_cities") },
            ].map(({ icon: Icon, value, label }) => (
              <div key={label} className="flex items-center gap-3 justify-center md:justify-start">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xl md:text-2xl font-bold tracking-tight text-white leading-none">{value}</p>
                  <p className="text-[11px] md:text-xs text-muted-foreground mt-1 leading-tight">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CityPickerModal open={cityModalOpen} onOpenChange={setCityModalOpen} />

      {/* Popular Categories */}
      <section className="container mx-auto px-4 md:px-6 pt-4 pb-10">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-serif text-2xl md:text-4xl tracking-tight">{t("home.categories_title")}</h2>
          <Link
            href="/pubs"
            className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover transition-colors group"
          >
            {t("home.categories_view_all")}
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          {CATEGORIES.map(({ label, sub, icon: Icon, href, img }) => (
            <Link
              key={label}
              href={href}
              className="reveal sheen group relative overflow-hidden rounded-2xl border border-white/8 lift-3d aspect-[4/5]"
            >
              <img
                src={img}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/15" />
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/25 via-transparent to-transparent mix-blend-screen opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute inset-0 flex flex-col items-center justify-end text-center p-3 md:p-4">
                <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/40 bg-black/40 text-primary backdrop-blur-sm">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-white leading-tight">{label}</span>
                <span className="text-[11px] text-white/55 mt-0.5">{sub}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Trending / Popular section */}
      <section className="container mx-auto px-4 md:px-6 py-12">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-primary mb-2.5 flex items-center gap-2">
                <Flame className="h-3.5 w-3.5" />
                {t("home.trending_label")}
              </p>
              <h2 className="font-serif text-2xl sm:text-3xl md:text-5xl tracking-tight">{t("home.trending_title")}</h2>
            </div>
            <Link
              href="/pubs"
              className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
            >
              {t("home.view_all_events")}
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* Location filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <span>Filter by location:</span>
            </div>
            <div className="relative">
              <select
                value={filterCountry}
                onChange={(e) => { setFilterCountry(e.target.value); setFilterState(""); }}
                className="appearance-none h-8 pl-3 pr-8 rounded-full border border-border/70 bg-card/60 text-sm text-foreground/80 hover:border-primary/50 transition-colors focus:outline-none focus:border-primary/60 cursor-pointer"
              >
                <option value="">All Countries</option>
                {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            </div>
            {filterCountry && stateOptions.length > 0 && (
              <div className="relative">
                <select
                  value={filterState}
                  onChange={(e) => setFilterState(e.target.value)}
                  className="appearance-none h-8 pl-3 pr-8 rounded-full border border-border/70 bg-card/60 text-sm text-foreground/80 hover:border-primary/50 transition-colors focus:outline-none focus:border-primary/60 cursor-pointer"
                >
                  <option value="">All States</option>
                  {stateOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              </div>
            )}
            {(filterCountry || filterState) && (
              <button
                onClick={() => { setFilterCountry(""); setFilterState(""); }}
                className="h-8 px-3 rounded-full text-xs text-muted-foreground border border-border/50 hover:border-destructive/50 hover:text-destructive transition-colors"
              >
                Clear
              </button>
            )}
            {(filterCountry || filterState) && (
              <span className="text-xs text-primary/70 ml-1">
                {filterState ? `${filterState}, ${filterCountry}` : filterCountry}
              </span>
            )}
          </div>
        </div>

        {popularLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mt-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white/5 animate-pulse h-64" />
            ))}
          </div>
        ) : sortedPopular.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mt-8">
            {sortedPopular.slice(0, 8).map((e) => <EventCard key={e.id} event={e} directBooking={e.type === "pub"} />)}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-white/8 bg-white/3 p-10 text-center">
            <Flame className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground text-sm">No popular venues found for this location.</p>
            <button onClick={() => { setFilterCountry(""); setFilterState(""); }} className="mt-3 text-xs text-primary hover:underline">
              Show all popular venues
            </button>
          </div>
        )}
      </section>

      {/* Drink Deals */}
      {drinkOffers.length > 0 && (() => {
        const { freeVendors, ticketVendors } = splitVendorsByPlanType(drinkOffers as VendorDrinkOffer[]);
        if (freeVendors.length === 0 && ticketVendors.length === 0) return null;
        return (
          <section className="py-16 md:py-20">
            <div className="container mx-auto px-4 md:px-6">
              <SectionHeader
                icon={<GlassWater className="h-3.5 w-3.5" />}
                eyebrow={t("pub_offers.deal_eyebrow")}
                title={t("events.drink_deals")}
                seeAllHref="/pub-offers"
                seeAllLabel={t("pub_offers.browse_pubs")}
              />
              <div className="space-y-10">
                <FreeDrinkSection vendors={freeVendors} />
                <TicketSection vendors={ticketVendors} />
              </div>
            </div>
          </section>
        );
      })()}

      {/* Top Pubs & Clubs */}
      {sortedPubs.length > 0 && (
        <section className="container mx-auto px-4 md:px-6 py-12">
          <SectionHeader
            icon={<PartyPopper className="h-3.5 w-3.5" />}
            eyebrow={t("home.pubs_label")}
            title={t("home.pubs_title")}
            seeAllHref="/pubs"
            seeAllLabel={t("home.view_all_pubs")}
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedPubs.map((e) => <EventCard key={e.id} event={e} hidePubBadge directBooking />)}
          </div>
        </section>
      )}

      {/* Promo banner */}
      <section className="container mx-auto px-4 md:px-6 py-8">
        <Link
          href="/pub-offers"
          className="reveal sheen group relative block overflow-hidden rounded-2xl border border-primary/20 lift-3d"
        >
          <img
            src="https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1600&q=70"
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-30 transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-transparent to-primary/10 mix-blend-screen" />
          <div className="relative flex items-center gap-4 md:gap-6 p-6 md:p-8">
            <span className="hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground red-glow">
              <Megaphone className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-serif text-xl md:text-3xl tracking-tight text-white">{t("home.promo_title")}</h3>
              <p className="text-sm text-white/60 mt-1">{t("home.promo_sub")}</p>
            </div>
            <span className="hidden md:inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shrink-0">
              {t("home.promo_cta")} <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </Link>
      </section>

      {/* Featured events */}
      <section className="container mx-auto px-4 md:px-6 py-12">
        <SectionHeader
          icon={<Sparkles className="h-3.5 w-3.5" />}
          eyebrow={t("home.featured_label")}
          title={t("home.featured_title")}
          seeAllHref="/pubs"
          seeAllLabel={t("home.view_all")}
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {featured.map((e) => <EventCard key={e.id} event={e as any} directBooking={(e as any).type === "pub"} />)}
        </div>
      </section>

      {/* What's On — Announcements */}
      {announcements.length > 0 && (
        <section className="relative py-16 md:py-20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/15 to-black/30 pointer-events-none" />

          <div className="container mx-auto px-4 md:px-6 relative">
            <SectionHeader
              icon={<Megaphone className="h-3.5 w-3.5 text-amber-400" />}
              eyebrow={t("home.announcements_label")}
              title={t("home.announcements_title")}
            />

            <div className="flex gap-5 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scrollbar-none">
              {announcements.map((a) => {
                const cardInner = (
                  <div className="rounded-2xl border border-amber-400/15 bg-zinc-900/90 hover:bg-zinc-800/80 transition-colors w-[300px] sm:w-[320px] flex flex-col overflow-hidden h-full group">
                    {/* Image area */}
                    <div className="relative h-40 flex-shrink-0 bg-zinc-800 overflow-hidden">
                      {a.imageUrl ? (
                        <img
                          src={a.imageUrl}
                          alt={a.title}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-400/8 to-zinc-900">
                          <Megaphone className="h-10 w-10 text-amber-400/25" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      {/* Vendor badge pinned to top-left of image */}
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/55 backdrop-blur-sm border border-amber-400/30 rounded-full px-2.5 py-1">
                        <Megaphone className="h-3 w-3 text-amber-400 flex-shrink-0" />
                        <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider truncate max-w-[110px]">{a.vendorName}</span>
                      </div>
                    </div>

                    {/* Text body */}
                    <div className="p-5 flex flex-col gap-2.5 flex-1">
                      <h3 className="font-serif text-xl leading-snug tracking-tight text-white">{a.title}</h3>
                      {a.body && <p className="text-sm text-white/50 leading-relaxed line-clamp-2 flex-1">{a.body}</p>}
                      <div className="flex items-center gap-4 text-xs text-amber-400/80 pt-2 border-t border-white/8">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-amber-400" />
                          {new Date(a.announceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        {a.announceTime && (
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-amber-400" />
                            {a.announceTime}
                          </span>
                        )}
                      </div>
                      {a.eventId && (
                        <div className="mt-auto rounded-lg bg-primary/10 border border-primary/25 px-4 py-2 flex items-center justify-between group-hover:bg-primary/20 transition-colors">
                          <span className="text-sm font-semibold text-primary">{t("pub_offers.book_now")}</span>
                          <ArrowRight className="h-4 w-4 text-primary" />
                        </div>
                      )}
                    </div>
                  </div>
                );
                return a.eventId ? (
                  <Link key={a.id} href={`/events/${a.eventId}`} className="snap-start flex-shrink-0 cursor-pointer">{cardInner}</Link>
                ) : (
                  <div key={a.id} className="snap-start flex-shrink-0">{cardInner}</div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Value props */}
      <section className="container mx-auto px-4 md:px-6 py-20">
        <div className="grid md:grid-cols-3 gap-5">
          {features.map((f) => (
            <div key={f.title} className="rounded-3xl glass-card p-7 lift-3d border border-white/6">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center mb-5 red-ring">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-2xl tracking-tight mb-2">{f.title}</h3>
              <p className="text-sm text-white/60 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA — Ready for your next night out */}
      <section className="container mx-auto px-4 md:px-6 py-16 md:py-24">
        <div className="reveal sheen relative overflow-hidden rounded-[2rem] border border-primary/20 lift-3d">
          <img
            src="https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=1600&q=70"
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/40" />
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/25 via-transparent to-primary/10 mix-blend-screen" />
          <div className="absolute -top-24 left-1/3 h-72 w-[28rem] max-w-full rounded-full bg-primary/15 blur-3xl pointer-events-none" />
          <div className="relative p-10 md:p-16 max-w-2xl">
            <h2 className="font-serif text-3xl md:text-5xl tracking-tight text-white leading-tight">
              {t("home.nightout_title")}
            </h2>
            <p className="mt-4 text-white/70 leading-relaxed md:text-lg">
              {t("home.nightout_sub")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/register">
                <Button
                  size="lg"
                  className="gap-2 bg-primary text-primary-foreground red-glow border-0 h-12 px-7 rounded-xl text-base font-semibold"
                >
                  {t("home.nightout_cta")} <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/pubs">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-7 border-white/20 hover:bg-white/8 rounded-xl text-base font-semibold"
                >
                  {t("home.browse_pubs")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
