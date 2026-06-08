import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { apiGet, formatINR } from "@/lib/api";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import {
  Gamepad2, MapPin, BadgeCheck, ArrowRight, Timer, IndianRupee, Search, Trophy,
} from "lucide-react";

interface GameCard {
  id: number; name: string; slug: string; category: string; coverImageUrl: string;
  pricingModel: "fixed" | "hourly"; price: string; hourlyRate: string;
  organizerName: string; organizerSlug: string; city: string; organizerVerified: boolean;
}

function priceLabel(g: GameCard): string {
  if (g.pricingModel === "hourly") return `${formatINR(Number(g.hourlyRate))}/hr`;
  return Number(g.price) > 0 ? `${formatINR(Number(g.price))}/person` : "Free";
}

export function GamesAndSports() {
  const [games, setGames] = useState<GameCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<string>("All");
  const [q, setQ] = useState("");

  useEffect(() => {
    apiGet<GameCard[]>("/api/games").then(setGames).catch(() => setGames([])).finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    games.forEach((g) => g.category && set.add(g.category));
    return ["All", ...Array.from(set)];
  }, [games]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return games.filter((g) =>
      (cat === "All" || g.category === cat) &&
      (!term || g.name.toLowerCase().includes(term) || g.organizerName.toLowerCase().includes(term) || (g.city || "").toLowerCase().includes(term))
    );
  }, [games, cat, q]);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Games & Sports Near You — Book Gaming Zones & Sports Arenas | Royvento"
        description="Book VR arenas, bowling, go-kart racing, laser tag, PS5 lounges, plus turf football, cricket nets, badminton, pickleball & sports courts near you. Instant QR tickets on Royvento."
        canonical="/games"
      />

      {/* ── Compact games & sports hero (kept short on purpose) ── */}
      <section className="relative overflow-hidden border-b border-white/10">
        <img
          src="https://images.unsplash.com/photo-1551958219-acbc608c6377?w=1600&q=80"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/40" />
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(680px 280px at 12% 20%, rgba(232,41,28,0.30), transparent 60%)" }} />
        <div className="relative container mx-auto px-4 md:px-6 py-10 md:py-14 max-w-6xl">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge className="bg-primary/20 text-primary border border-primary/40 gap-1.5"><Gamepad2 className="h-3.5 w-3.5" /> Play & compete</Badge>
            <Badge className="bg-primary/20 text-primary border border-primary/40 gap-1.5"><Trophy className="h-3.5 w-3.5" /> Train & play sports</Badge>
          </div>
          <h1 className="font-serif text-3xl md:text-5xl tracking-tight text-white leading-tight max-w-2xl">
            Book the city's best gaming zones <span className="text-gradient-red">&amp; sports arenas</span>
          </h1>
          <p className="text-white/70 mt-3 max-w-xl text-sm md:text-base">
            From VR arenas, bowling, go-kart racing & PS5 lounges to turf football, cricket nets, badminton & pickleball courts — reserve your slot and walk in with a QR ticket.
          </p>
          {/* search */}
          <div className="mt-5 relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search games, sports, venues or city…"
              className="w-full rounded-xl border border-white/15 bg-white/[0.06] backdrop-blur-md pl-10 pr-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 md:px-6 py-8 max-w-6xl">
        {/* category chips */}
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-7">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={"rounded-full border px-4 py-1.5 text-sm transition-colors " + (cat === c ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40")}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[16/11] rounded-2xl bg-muted/40 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <Gamepad2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No games or sports venues found{cat !== "All" ? ` in ${cat}` : ""}. Check back soon!</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((g) => (
              <Link key={g.id} href={`/game-organizers/${g.organizerSlug}#available-games`} className="group block">
                <div className="overflow-hidden rounded-2xl border border-border bg-card h-full transition-transform group-hover:-translate-y-0.5 hover:border-primary/40">
                  <div className="relative aspect-[16/10] bg-muted overflow-hidden">
                    {g.coverImageUrl
                      ? <img src={g.coverImageUrl} alt={g.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      : <div className="h-full w-full flex items-center justify-center"><Gamepad2 className="h-9 w-9 text-muted-foreground/40" /></div>}
                    {g.category && <span className="absolute top-2.5 left-2.5 rounded-full bg-black/55 backdrop-blur-sm border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white">{g.category}</span>}
                    <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground flex items-center gap-1">
                      {g.pricingModel === "hourly" ? <Timer className="h-3.5 w-3.5" /> : <IndianRupee className="h-3.5 w-3.5" />}{priceLabel(g)}
                    </span>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold leading-tight">{g.name}</h3>
                    <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{g.organizerName}</span>
                      {g.organizerVerified && <BadgeCheck className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                    </p>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                      <span className="text-muted-foreground text-xs flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{g.city || "India"}</span>
                      <span className="text-primary text-sm font-medium flex items-center gap-1 group-hover:gap-1.5 transition-all">Book now <ArrowRight className="h-3.5 w-3.5" /></span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
