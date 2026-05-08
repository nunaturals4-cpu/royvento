import { useEffect, useMemo, useState } from "react";
import { EventCard } from "@/components/EventCard";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Wine, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import { LocationSelect } from "@/components/LocationSelect";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useSearch } from "wouter";

const DRINK_DEAL_OPTIONS = [
  { value: "welcome", label: "Welcome Drink" },
  { value: "unlimited", label: "Unlimited" },
  { value: "ticket", label: "Incl. with Ticket" },
  { value: "custom", label: "Custom Deal" },
] as const;

type DrinkPlanType = typeof DRINK_DEAL_OPTIONS[number]["value"] | "";

interface PublicEvent {
  id: number;
  title: string;
  category: string;
  type: string;
  location: string;
  city: string;
  state: string;
  country: string;
  price: number;
  startingPrice?: number;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  partnerName: string;
  popular: boolean;
  hasDrinkPlans?: boolean;
  freeEntryRules?: { enabled: boolean; genders: string[]; days: string[]; beforeTime?: string } | null;
  vendorCrowdLevel?: string | null;
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

export function Pubs() {
  const { t } = useTranslation();
  const searchStr = useSearch();
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [stateF, setStateF] = useState("");
  const [city, setCity] = useState(() => new URLSearchParams(searchStr).get("city") ?? "");
  const [pricePreset, setPricePreset] = useState<number | null>(null);
  const [drinkPlanType, setDrinkPlanType] = useState<DrinkPlanType>("");
  const [hasDrinkDeal, setHasDrinkDeal] = useState(false);
  const [freeEntry, setFreeEntry] = useState(false);
  const [crowdLevel, setCrowdLevel] = useState<CrowdFilter>("");
  const [pubs, setPubs] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cityParam = new URLSearchParams(searchStr).get("city") ?? "";
    setCity(cityParam);
  }, [searchStr]);

  useEffect(() => {
    const params = new URLSearchParams({ type: "pub" });
    if (search.trim()) params.set("search", search.trim());
    if (country) params.set("country", country);
    if (stateF) params.set("state", stateF);
    if (city) params.set("city", city);
    if (pricePreset !== null) {
      const preset = PRICE_PRESETS[pricePreset];
      if (preset) {
        params.set("minPrice", String(preset.min));
        params.set("maxPrice", String(preset.max));
      }
    }
    if (drinkPlanType) params.set("drinkPlanType", drinkPlanType);
    setLoading(true);
    apiGet<PublicEvent[]>(`/api/events?${params.toString()}`)
      .then(setPubs)
      .catch(() => setPubs([]))
      .finally(() => setLoading(false));
  }, [search, country, stateF, city, pricePreset, drinkPlanType]);

  function toggleHasDrinkDeal(val: boolean) {
    setHasDrinkDeal(val);
    if (!val) setDrinkPlanType("");
  }

  const displayedPubs = useMemo(() => {
    let list = pubs;
    if (hasDrinkDeal && !drinkPlanType) list = list.filter((p) => p.hasDrinkPlans);
    if (freeEntry) list = list.filter((p) => p.freeEntryRules?.enabled === true && (p.freeEntryRules?.days?.length ?? 0) > 0);
    if (crowdLevel) list = list.filter((p) => p.vendorCrowdLevel === crowdLevel);
    return list;
  }, [pubs, hasDrinkDeal, drinkPlanType, freeEntry, crowdLevel]);

  const hasFilters =
    search || country || stateF || city || pricePreset !== null || drinkPlanType || hasDrinkDeal || freeEntry || crowdLevel;

  function clearAll() {
    setSearch("");
    setCountry("");
    setStateF("");
    setCity("");
    setPricePreset(null);
    setDrinkPlanType("");
    setHasDrinkDeal(false);
    setFreeEntry(false);
    setCrowdLevel("");
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <SEO
        title="Pubs in India — Book a Table | Royvento"
        description="Find the best pubs, microbreweries, sports bars and rooftop lounges across India. Filter by city, vibe, dance floor and free entry — book a table instantly on Royvento."
        canonical="/pubs"
      />
      <header className="max-w-3xl mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-3 accent-underline inline-flex items-center gap-2">
          <Wine className="h-3.5 w-3.5" /> {t("pubs.nightlife_badge")}
        </p>
        <h1 className="font-serif text-4xl md:text-6xl tracking-tight mt-3">{t("pubs.title")}</h1>
        <p className="mt-4 text-white/60 leading-relaxed">
          {t("pubs.subtitle")}
        </p>
      </header>

      <div className="rounded-3xl glass-card p-5 md:p-6 mb-8 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("pubs.search_placeholder")}
            className="pl-10 h-11 bg-black/40 border-white/10"
          />
        </div>

        {/* Quick-toggle row: Free Entry + Drink Deal */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* Free Entry toggle */}
          <div className="flex items-center gap-2.5">
            <Switch
              id="free-entry-pubs"
              checked={freeEntry}
              onCheckedChange={setFreeEntry}
            />
            <Label htmlFor="free-entry-pubs" className="flex items-center gap-1.5 cursor-pointer select-none">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
              <span className="text-sm">{t("events.free_entry_label")}</span>
            </Label>
          </div>

          {/* Has Drink Deal toggle */}
          <div className="flex items-center gap-2.5">
            <Switch
              id="has-drink-deal"
              checked={hasDrinkDeal}
              onCheckedChange={toggleHasDrinkDeal}
            />
            <Label htmlFor="has-drink-deal" className="flex items-center gap-1.5 cursor-pointer select-none">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />
              <span className="text-sm">{t("events.drink_deals")}</span>
            </Label>
          </div>
        </div>

        {/* Deal-type chips — only visible when Drink Deal toggle is on */}
        {hasDrinkDeal && (
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">Deal type</p>
            <div className="flex flex-wrap gap-2">
              {DRINK_DEAL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDrinkPlanType(drinkPlanType === opt.value ? "" : opt.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    drinkPlanType === opt.value
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-black/40 border-white/10 text-muted-foreground hover:border-white/20",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Crowd level dropdown */}
        <div>
          <p className="text-xs text-muted-foreground mb-2 font-medium">Crowd level</p>
          <Select
            value={crowdLevel === "" ? "any" : crowdLevel}
            onValueChange={(v) => setCrowdLevel(v === "any" ? "" : (v as CrowdFilter))}
          >
            <SelectTrigger className="w-44 bg-black/40 border-white/10">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              {CROWD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Price range preset chips */}
        <div>
          <p className="text-xs text-muted-foreground mb-2 font-medium">Price Range</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPricePreset(null)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                pricePreset === null
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-black/40 border-white/10 text-muted-foreground hover:border-white/20",
              )}
            >
              Any price
            </button>
            {PRICE_PRESETS.map((preset, idx) => (
              <button
                key={preset.label}
                onClick={() => setPricePreset(pricePreset === idx ? null : idx)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  pricePreset === idx
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-black/40 border-white/10 text-muted-foreground hover:border-white/20",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <LocationSelect
          country={country}
          state={stateF}
          city={city}
          onChange={(next) => {
            setCountry(next.country);
            setStateF(next.state);
            setCity(next.city);
          }}
        />

        {hasFilters && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> Clear all filters
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : displayedPubs.length === 0 ? (
        <div className="rounded-3xl glass-card p-16 text-center">
          <p className="font-serif text-2xl mb-2">{t("pubs.no_results")}</p>
          {hasFilters && (
            <button
              onClick={clearAll}
              className="mt-4 text-sm text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedPubs.map((p) => <EventCard key={p.id} event={p} hidePubBadge directBooking />)}
        </div>
      )}
    </div>
  );
}
