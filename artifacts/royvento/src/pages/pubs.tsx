import { Link } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { EventCard } from "@/components/EventCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, Calendar, Clock, GlassWater, Megaphone, Search, Star, Ticket, Wine, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import { LocationSelect } from "@/components/LocationSelect";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useListVendorDrinkOffers } from "@workspace/api-client-react";
import type { VendorDrinkOffer, DrinkPlanSummary } from "@workspace/api-client-react";
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
}

interface Announcement {
  id: number;
  title: string;
  body: string;
  announceDate: string;
  announceTime: string;
  vendorName: string;
  eventId: number;
  vendorId: number;
}

const PRICE_PRESETS = [
  { label: "Under ₹500", min: 0, max: 500 },
  { label: "₹500 – ₹1.5K", min: 500, max: 1500 },
  { label: "₹1.5K+", min: 1500, max: 99999999 },
];

function getPlanLabel(plan: DrinkPlanSummary): string {
  if (plan.type === "welcome") return "Free welcome drink";
  if (plan.type === "unlimited") return "Unlimited drinks";
  if (plan.type === "ticket") {
    const count = (plan.lineItems ?? []).filter((i) => i.name).length;
    return count > 0 ? `${count} item${count !== 1 ? "s" : ""} with ticket` : "Drinks with ticket";
  }
  return plan.productName || "Drinks discount";
}

function PlanIcon({ type }: { type: string }) {
  if (type === "unlimited") return <GlassWater className="h-3 w-3 text-primary" />;
  if (type === "ticket") return <Ticket className="h-3 w-3 text-primary" />;
  return <Star className="h-3 w-3 text-primary" />;
}

function PubOffersSection({
  drinkOffers,
  announcements,
}: {
  drinkOffers: VendorDrinkOffer[];
  announcements: Announcement[];
}) {
  const hasDeals = drinkOffers.length > 0;
  const hasAnnouncements = announcements.length > 0;
  if (!hasDeals && !hasAnnouncements) return null;

  return (
    <div className="mb-8 space-y-5">
      {/* Drink Deals track */}
      {hasDeals && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <GlassWater className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">Drink Deals</span>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scrollbar-none">
            {drinkOffers.map((offer: VendorDrinkOffer) => (
              <Link
                key={offer.vendorId}
                href={offer.pubEventId ? `/events/${offer.pubEventId}` : `/vendors/${offer.vendorId}`}
                className="snap-start flex-shrink-0"
              >
                <div className="glass-card rounded-xl overflow-hidden w-60 hover:bg-white/[0.06] transition-all cursor-pointer group h-full flex flex-col">
                  {/* Image */}
                  <div className="h-28 bg-white/5 relative overflow-hidden">
                    {offer.coverImageUrl ? (
                      <img
                        src={offer.coverImageUrl}
                        alt={offer.vendorName}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-transparent">
                        <GlassWater className="h-8 w-8 text-white/20" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                    <div className="absolute bottom-2 left-3 right-3">
                      <h3 className="font-serif text-sm font-semibold text-white drop-shadow leading-tight truncate">
                        {offer.vendorName}
                      </h3>
                    </div>
                  </div>
                  {/* Plan rows */}
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    <div className="flex flex-col gap-1.5 flex-1">
                      {offer.plans.slice(0, 2).map((plan: DrinkPlanSummary, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="flex-shrink-0 h-5 w-5 rounded-md bg-primary/15 flex items-center justify-center">
                            <PlanIcon type={plan.type} />
                          </span>
                          <span className="text-xs text-white/85 flex-1 leading-snug truncate">
                            {getPlanLabel(plan)}
                          </span>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${plan.gender === "female" ? "bg-rose-500/20 text-rose-300" : "bg-primary/20 text-primary"}`}>
                            {plan.gender === "female" ? "Ladies" : "All"}
                          </span>
                        </div>
                      ))}
                      {offer.plans.length > 2 && (
                        <span className="text-[10px] text-white/40 pl-7">
                          +{offer.plans.length - 2} more
                        </span>
                      )}
                    </div>
                    <div className="rounded-lg bg-primary/10 border border-primary/25 px-3 py-1.5 flex items-center justify-between group-hover:bg-primary/20 transition-colors mt-auto">
                      <span className="text-xs font-semibold text-primary">
                        {offer.pubEventId ? "Book now" : "View venue"}
                      </span>
                      <ArrowRight className="h-3 w-3 text-primary" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Announcements track */}
      {hasAnnouncements && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Megaphone className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">What's On</span>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scrollbar-none">
            {announcements.map((a) => (
              <Link key={a.id} href={a.eventId ? `/events/${a.eventId}` : `/vendors/${a.vendorId}`} className="snap-start flex-shrink-0">
                <div className="glass-card rounded-xl p-4 cursor-pointer hover:bg-white/5 transition-colors w-60">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-md bg-primary/20 text-primary flex items-center justify-center flex-shrink-0">
                      <Megaphone className="h-3 w-3" />
                    </div>
                    <span className="text-[10px] font-medium text-primary/90 uppercase tracking-wider truncate">{a.vendorName}</span>
                  </div>
                  <h3 className="font-serif text-sm leading-snug tracking-tight mb-1.5 line-clamp-1">{a.title}</h3>
                  <p className="text-xs text-white/55 leading-relaxed line-clamp-2 mb-3">{a.body}</p>
                  <div className="flex items-center gap-3 text-[10px] text-white/40">
                    {a.announceDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(a.announceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    )}
                    {a.announceTime && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {a.announceTime}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [pubs, setPubs] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const { data: drinkOffers = [] } = useListVendorDrinkOffers();

  useEffect(() => {
    apiGet<Announcement[]>("/api/announcements/recent").then(setAnnouncements).catch(() => {});
  }, []);

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
    return list;
  }, [pubs, hasDrinkDeal, drinkPlanType, freeEntry]);

  const hasFilters =
    search || country || stateF || city || pricePreset !== null || drinkPlanType || hasDrinkDeal || freeEntry;

  function clearAll() {
    setSearch("");
    setCountry("");
    setStateF("");
    setCity("");
    setPricePreset(null);
    setDrinkPlanType("");
    setHasDrinkDeal(false);
    setFreeEntry(false);
  }

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

      <PubOffersSection drinkOffers={drinkOffers} announcements={announcements} />

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
          {displayedPubs.map((p) => <EventCard key={p.id} event={p} />)}
        </div>
      )}
    </div>
  );
}
