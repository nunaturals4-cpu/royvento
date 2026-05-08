import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SEO } from "@/components/SEO";
import { useInfiniteQuery } from "@tanstack/react-query";
import { customFetch, type ListEventsPaginatedResponse } from "@workspace/api-client-react";
import { EventCard } from "@/components/EventCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Search, SlidersHorizontal, X, Loader2 } from "lucide-react";
import { BUDGET_RANGES } from "@/lib/api";
import { LocationSelect } from "@/components/LocationSelect";
import { useLocation } from "wouter";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const DRINK_DEAL_OPTIONS = [
  { value: "welcome", label: "Welcome Drink" },
  { value: "unlimited", label: "Unlimited" },
  { value: "ticket", label: "Incl. with Ticket" },
  { value: "custom", label: "Custom Deal" },
] as const;

type DrinkPlanType = typeof DRINK_DEAL_OPTIONS[number]["value"] | "";

const PAGE_SIZE = 18;

export function Explore() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const initialSearch = (() => {
    try {
      const idx = location.indexOf("?");
      if (idx === -1) return "";
      return new URLSearchParams(location.slice(idx)).get("search") ?? "";
    } catch { return ""; }
  })();
  const [search, setSearch] = useState(initialSearch);
  const [minRating, setMinRating] = useState<string>("any");
  const [budget, setBudget] = useState<string>("any");
  const [country, setCountry] = useState<string>("");
  const [stateF, setStateF] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [freeEntry, setFreeEntry] = useState(false);
  const [drinkPlanType, setDrinkPlanType] = useState<DrinkPlanType>("");

  const queryParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (search.trim()) p.search = search.trim();
    if (stateF) p.state = stateF;
    if (city) p.city = city;
    if (country) p.country = country;
    if (budget !== "any") {
      const b = BUDGET_RANGES.find((x) => x.value === budget);
      if (b) { p.minPrice = String(b.min); p.maxPrice = String(b.max); }
    }
    if (drinkPlanType) p.drinkPlanType = drinkPlanType;
    return p;
  }, [search, budget, stateF, city, country, drinkPlanType]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<ListEventsPaginatedResponse>({
    queryKey: ["explore-events", queryParams, freeEntry],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams(queryParams);
      params.set("page", String(pageParam ?? 1));
      params.set("limit", String(PAGE_SIZE));
      return customFetch<ListEventsPaginatedResponse>(`/api/events?${params.toString()}`);
    },
    initialPageParam: 1,
    getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined,
  });

  const allEvents = useMemo(() => {
    const flat = (data?.pages ?? []).flatMap((p) => p.data);
    if (!freeEntry) return flat;
    return flat.filter((e) => e.freeEntryRules?.enabled === true && (e.freeEntryRules?.days?.length ?? 0) > 0);
  }, [data, freeEntry]);

  const clear = () => {
    setSearch(""); setMinRating("any");
    setBudget("any"); setCountry(""); setStateF(""); setCity(""); setFreeEntry(false); setDrinkPlanType("");
  };

  const hasFilters = search || country || stateF || city || budget !== "any" || freeEntry || minRating !== "any" || drinkPlanType;

  const filteredEvents = useMemo(() => {
    if (minRating === "any") return allEvents;
    return allEvents.filter((e) => (e.rating ?? 0) >= Number(minRating));
  }, [allEvents, minRating]);

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <SEO
        title="Explore Pubs, Parties & Events in India | Royvento"
        description="Browse verified pubs, microbreweries, rooftop bars and live events across India. Filter by city, category and rating to find your next night out — book instantly on Royvento."
        canonical="/explore"
      />
      <header className="max-w-3xl mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-3 accent-underline inline-block">{t("explore.eyebrow")}</p>
        <h1 className="font-serif text-4xl md:text-6xl tracking-tight mt-3">{t("explore.title")}</h1>
        <p className="mt-4 text-white/60 leading-relaxed">
          {t("explore.subtitle")}
        </p>
      </header>

      <div className="rounded-3xl glass-card p-5 md:p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{t("explore.filters")}</span>
          {hasFilters && (
            <button onClick={clear} className="ml-auto text-xs text-white/50 hover:text-white inline-flex items-center gap-1">
              <X className="h-3 w-3" /> {t("explore.clear_all")}
            </button>
          )}
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="relative md:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("explore.search")}
              className="pl-10 h-11 bg-black/40 border-white/10"
            />
          </div>
          <div>
            <Select value={budget} onValueChange={setBudget}>
              <SelectTrigger className="h-11 bg-black/40 border-white/10"><SelectValue placeholder={t("explore.budget")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("explore.any_budget")}</SelectItem>
                {BUDGET_RANGES.map((b) => (
                  <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {([
              { value: "any", label: t("explore.any_rating") },
              { value: "3", label: "3★+" },
              { value: "3.5", label: "3.5★+" },
              { value: "4", label: "4★+" },
              { value: "4.5", label: "4.5★+" },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMinRating(opt.value)}
                className={`h-11 px-3.5 rounded-lg border text-sm font-medium transition-colors ${
                  minRating === opt.value
                    ? "bg-primary/20 border-primary/60 text-primary"
                    : "bg-black/40 border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <Label className="text-xs text-muted-foreground mb-1 block">{t("explore.location")}</Label>
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
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Switch
            id="free-entry-toggle"
            checked={freeEntry}
            onCheckedChange={setFreeEntry}
          />
          <Label htmlFor="free-entry-toggle" className="flex items-center gap-1.5 cursor-pointer select-none">
            <span className="h-1.5 w-1.5 rounded-full inline-block bg-emerald-400" />
            <span className="text-sm">{t("explore.free_entry")}</span>
          </Label>
        </div>
        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-2 font-medium">{t("explore.drink_deal_type")}</p>
          <div className="flex flex-wrap gap-2">
            {DRINK_DEAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDrinkPlanType(drinkPlanType === opt.value ? "" : opt.value)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  drinkPlanType === opt.value
                    ? "bg-amber-500/20 border-amber-500/60 text-amber-400"
                    : "bg-black/40 border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p>{t("explore.loading")}</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="rounded-3xl glass-card p-16 text-center space-y-4">
          <p className="font-serif text-3xl mb-2">{t("explore.no_match")}</p>
          <p className="text-muted-foreground">{t("explore.no_match_sub")}</p>
          {hasNextPage && (
            <div className="flex justify-center mt-4">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="px-8 py-3 rounded-full border border-white/10 text-sm font-medium text-muted-foreground hover:border-white/20 hover:text-foreground transition-colors inline-flex items-center gap-2 disabled:opacity-60"
              >
                {isFetchingNextPage ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</>
                ) : (
                  "Load more events"
                )}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map((e) => <EventCard key={e.id} event={e} directBooking={e.type === "pub"} />)}
          </div>
          {hasNextPage && (
            <div className="flex justify-center mt-10">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="px-8 py-3 rounded-full border border-white/10 text-sm font-medium text-muted-foreground hover:border-white/20 hover:text-foreground transition-colors inline-flex items-center gap-2 disabled:opacity-60"
              >
                {isFetchingNextPage ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</>
                ) : (
                  "Load more events"
                )}
              </button>
            </div>
          )}
          {!hasNextPage && filteredEvents.length > PAGE_SIZE && (
            <p className="text-center text-xs text-muted-foreground mt-8">All {filteredEvents.length} results shown</p>
          )}
        </>
      )}
    </div>
  );
}
