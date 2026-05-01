import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { EventCard } from "@/components/EventCard";
import { Input } from "@/components/ui/input";
import { Search, Wine, X } from "lucide-react";
import { apiGet, BUDGET_RANGES } from "@/lib/api";
import { LocationSelect } from "@/components/LocationSelect";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const DRINK_DEAL_OPTIONS = [
  { value: "welcome", label: "Welcome Drink" },
  { value: "unlimited", label: "Unlimited" },
  { value: "ticket", label: "Included with Ticket" },
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
}

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

  const hasFilters = search || country || stateF || city || pricePreset !== null || drinkPlanType;

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("pubs.search_placeholder")}
            className="pl-10 h-11 bg-black/40 border-white/10"
          />
        </div>

        {/* Drink Deal filter chips */}
        <div>
          <p className="text-xs text-muted-foreground mb-2 font-medium">Drink Deal</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setDrinkPlanType("")}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                drinkPlanType === ""
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-black/40 border-white/10 text-muted-foreground hover:border-white/20",
              )}
            >
              Any deal
            </button>
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
            onClick={() => { setSearch(""); setCountry(""); setStateF(""); setCity(""); setPricePreset(null); setDrinkPlanType(""); }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> Clear all filters
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : pubs.length === 0 ? (
        <div className="rounded-3xl glass-card p-16 text-center">
          <p className="font-serif text-2xl mb-2">{t("pubs.no_results")}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {pubs.map((p) => <EventCard key={p.id} event={p} />)}
        </div>
      )}
    </div>
  );
}
