import { useState } from "react";
import { useListEvents } from "@workspace/api-client-react";
import { EventCard } from "@/components/EventCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

const CATEGORIES = ["All", "Wedding", "Corporate", "Festival", "Private", "Birthday"];

export function Explore() {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<string>("All");

  const params: Record<string, string> = {};
  if (active !== "All") params["category"] = active;
  if (search.trim()) params["search"] = search.trim();
  const { data: events = [], isLoading } = useListEvents(params);

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <header className="max-w-2xl mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Explore</p>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight">Find your next event</h1>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          Browse curated weddings, corporate productions, festivals, and private soirées from our network of vetted vendors.
        </p>
      </header>

      <div className="flex flex-col md:flex-row gap-3 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events by name…"
            className="pl-10 h-12"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-10">
        {CATEGORIES.map((c) => (
          <Button
            key={c}
            variant={active === c ? "default" : "outline"}
            size="sm"
            onClick={() => setActive(c)}
            className="rounded-full"
          >
            {c}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading events…</p>
      ) : events.length === 0 ? (
        <div className="rounded-2xl border bg-card p-16 text-center">
          <p className="font-serif text-2xl mb-2">No events match yet</p>
          <p className="text-muted-foreground">Try a different category or search term.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      )}
    </div>
  );
}
