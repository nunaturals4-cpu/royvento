import { useEffect, useState } from "react";
import { EventCard } from "@/components/EventCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { apiGet, BUDGET_RANGES, EVENT_CATEGORIES, INDIAN_STATES } from "@/lib/api";

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

const CATEGORIES = ["All", ...EVENT_CATEGORIES] as const;

export function Explore() {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<string>("All");
  const [minRating, setMinRating] = useState<string>("any");
  const [budget, setBudget] = useState<string>("any");
  const [stateF, setStateF] = useState<string>("any");
  const [city, setCity] = useState<string>("");
  const [country, setCountry] = useState<string>("India");
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (active !== "All") params.set("category", active);
    if (search.trim()) params.set("search", search.trim());
    if (stateF !== "any") params.set("state", stateF);
    if (city.trim()) params.set("city", city.trim());
    if (country.trim()) params.set("country", country.trim());
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
  }, [active, search, budget, stateF, city, country, minRating]);

  const clear = () => {
    setSearch(""); setActive("All"); setMinRating("any");
    setBudget("any"); setStateF("any"); setCity(""); setCountry("India");
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <header className="max-w-3xl mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-3 accent-underline inline-block">Explore</p>
        <h1 className="font-serif text-4xl md:text-6xl tracking-tight mt-3">Find your next event</h1>
        <p className="mt-4 text-white/60 leading-relaxed">
          Filter by category, location, budget, and rating to discover the perfect partner for your moment.
        </p>
      </header>

      <div className="rounded-3xl glass-card p-5 md:p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Filters</span>
          <button onClick={clear} className="ml-auto text-xs text-white/50 hover:text-white inline-flex items-center gap-1">
            <X className="h-3 w-3" /> Clear all
          </button>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-10 h-11 bg-black/40 border-white/10"
            />
          </div>
          <div>
            <Select value={budget} onValueChange={setBudget}>
              <SelectTrigger className="h-11 bg-black/40 border-white/10"><SelectValue placeholder="Budget" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any budget</SelectItem>
                {BUDGET_RANGES.map((b) => (
                  <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={minRating} onValueChange={setMinRating}>
              <SelectTrigger className="h-11 bg-black/40 border-white/10"><SelectValue placeholder="Rating" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any rating</SelectItem>
                <SelectItem value="3">3★ &amp; up</SelectItem>
                <SelectItem value="4">4★ &amp; up</SelectItem>
                <SelectItem value="4.5">4.5★ &amp; up</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={stateF} onValueChange={setStateF}>
              <SelectTrigger className="h-11 bg-black/40 border-white/10"><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any state</SelectItem>
                {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              className="h-11 bg-black/40 border-white/10"
            />
          </div>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-6 gap-3 mt-3">
          <div className="lg:col-span-2">
            <Label className="text-xs text-muted-foreground">Country</Label>
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Country"
              className="h-11 bg-black/40 border-white/10 mt-1"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-10">
        {CATEGORIES.map((c) => (
          <Button
            key={c}
            variant={active === c ? "default" : "outline"}
            size="sm"
            onClick={() => setActive(c)}
            className={active === c
              ? "rounded-full bg-gradient-to-br from-red-600 to-red-800 border-0 red-glow"
              : "rounded-full border-white/15 hover:bg-white/5"
            }
          >
            {c}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading events…</p>
      ) : events.length === 0 ? (
        <div className="rounded-3xl glass-card p-16 text-center">
          <p className="font-serif text-3xl mb-2">No events match yet</p>
          <p className="text-muted-foreground">Try a different filter or search term.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      )}
    </div>
  );
}
