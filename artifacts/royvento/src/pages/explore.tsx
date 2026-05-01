import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EventCard } from "@/components/EventCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { apiGet, BUDGET_RANGES } from "@/lib/api";
import { LocationSelect } from "@/components/LocationSelect";
import { useLocation } from "wouter";

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
  imageUrl: string;
  rating: number;
  reviewCount: number;
  partnerName: string;
  popular: boolean;
}

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
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (stateF) params.set("state", stateF);
    if (city) params.set("city", city);
    if (country) params.set("country", country);
    if (budget !== "any") {
      const b = BUDGET_RANGES.find((x) => x.value === budget);
      if (b) {
        params.set("minPrice", String(b.min));
        params.set("maxPrice", String(b.max));
      }
    }
    setLoading(true);
    apiGet<PublicEvent[]>(`/api/events?${params.toString()}`)
      .then((r) => {
        const filtered =
          minRating === "any"
            ? r
            : r.filter((e) => e.rating >= Number(minRating));
        setEvents(filtered);
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [search, budget, stateF, city, country, minRating]);

  const clear = () => {
    setSearch(""); setMinRating("any");
    setBudget("any"); setCountry(""); setStateF(""); setCity("");
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
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
          <button onClick={clear} className="ml-auto text-xs text-white/50 hover:text-white inline-flex items-center gap-1">
            <X className="h-3 w-3" /> {t("explore.clear_all")}
          </button>
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
          <div>
            <Select value={minRating} onValueChange={setMinRating}>
              <SelectTrigger className="h-11 bg-black/40 border-white/10"><SelectValue placeholder={t("explore.rating")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("explore.any_rating")}</SelectItem>
                <SelectItem value="3">3★ &amp; up</SelectItem>
                <SelectItem value="4">4★ &amp; up</SelectItem>
                <SelectItem value="4.5">4.5★ &amp; up</SelectItem>
              </SelectContent>
            </Select>
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
      </div>

      {loading ? (
        <p className="text-muted-foreground">{t("explore.loading")}</p>
      ) : events.length === 0 ? (
        <div className="rounded-3xl glass-card p-16 text-center">
          <p className="font-serif text-3xl mb-2">{t("explore.no_match")}</p>
          <p className="text-muted-foreground">{t("explore.no_match_sub")}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      )}
    </div>
  );
}
