import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { EventCard } from "@/components/EventCard";
import { Input } from "@/components/ui/input";
import { Search, Wine } from "lucide-react";
import { apiGet } from "@/lib/api";
import { LocationSelect } from "@/components/LocationSelect";

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
}

export function Pubs() {
  const searchStr = useSearch();
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [stateF, setStateF] = useState("");
  const [city, setCity] = useState(() => new URLSearchParams(searchStr).get("city") ?? "");
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
    setLoading(true);
    apiGet<PublicEvent[]>(`/api/events?${params.toString()}`)
      .then(setPubs)
      .catch(() => setPubs([]))
      .finally(() => setLoading(false));
  }, [search, country, stateF, city]);

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <header className="max-w-3xl mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-3 accent-underline inline-flex items-center gap-2">
          <Wine className="h-3.5 w-3.5" /> Nightlife
        </p>
        <h1 className="font-serif text-4xl md:text-6xl tracking-tight mt-3">Pubs &amp; lounges</h1>
        <p className="mt-4 text-white/60 leading-relaxed">
          Hand-picked nightlife venues — book a table for tickets or a private event evening.
        </p>
      </header>

      <div className="rounded-3xl glass-card p-5 md:p-6 mb-8 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pubs…"
            className="pl-10 h-11 bg-black/40 border-white/10"
          />
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
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : pubs.length === 0 ? (
        <div className="rounded-3xl glass-card p-16 text-center">
          <p className="font-serif text-2xl mb-2">No pubs match your filter</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {pubs.map((p) => <EventCard key={p.id} event={p} />)}
        </div>
      )}
    </div>
  );
}
