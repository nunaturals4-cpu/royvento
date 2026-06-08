import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Flame, Zap, GlassWater, Headphones, Ticket, Gamepad2, Mic2,
  MapPin, Clock, Star, Sparkles, ArrowRight, X,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { useSelectedCity } from "@/components/LocationContext";
import { CarouselRow } from "@/components/CarouselRow";

// ── Happening Tonight ───────────────────────────────────────────────────────
// Real-time discovery: "It's 7 PM — what can I do in the next few hours?"
// Consumes /api/happening-tonight (plain apiGet, like the rest of the homepage)
// and renders a high-urgency, FOMO-driven section with one-click quick filters
// and a "What Should I Do Tonight?" instant recommendation.

interface TonightItem {
  key: string;
  id: number;
  kind: "pub" | "dj" | "event" | "game" | "happyhour";
  title: string;
  subtitle: string;
  city: string;
  state: string;
  imageUrl: string;
  href: string;
  startTime: string;
  endTime: string;
  bucket: "now" | "soon" | null;
  dealLabel: string;
  rating: number;
  todayBookings: number;
  filters: string[];
  score: number;
}

interface TonightResponse {
  happeningNow: TonightItem[];
  startingSoon: TonightItem[];
  lastMinuteDeals: TonightItem[];
  tonightNearYou: TonightItem[];
  counts: { now: number; soon: number; deals: number; total: number };
}

const FILTERS: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: "all",   label: "All Tonight",      icon: <Sparkles className="h-3.5 w-3.5" /> },
  { key: "now",   label: "🔥 Happening Now", icon: <Flame className="h-3.5 w-3.5" /> },
  { key: "soon",  label: "⚡ Starting Soon",  icon: <Zap className="h-3.5 w-3.5" /> },
  { key: "happy", label: "🍻 Happy Hours",    icon: <GlassWater className="h-3.5 w-3.5" /> },
  { key: "dj",    label: "🎧 DJ Nights",      icon: <Headphones className="h-3.5 w-3.5" /> },
  { key: "deals", label: "🎟 Last-Minute",    icon: <Ticket className="h-3.5 w-3.5" /> },
  { key: "games", label: "🎮 Games Tonight",  icon: <Gamepad2 className="h-3.5 w-3.5" /> },
  { key: "live",  label: "🎤 Live Events",    icon: <Mic2 className="h-3.5 w-3.5" /> },
];

function TonightCard({ item }: { item: TonightItem }) {
  const live = item.bucket === "now";
  const loc = item.city ? `${item.city}${item.state ? ", " + item.state : ""}` : "";
  return (
    <Link
      href={item.href}
      className="group flex h-full w-[260px] sm:w-[280px] flex-col overflow-hidden rounded-2xl border border-white/8 bg-zinc-900/80 lift-3d"
    >
      {/* Image — fixed height so every card lines up identically. */}
      <div className="relative h-40 shrink-0 overflow-hidden bg-zinc-900">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-zinc-900">
            <Flame className="h-10 w-10 text-primary/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Status badge only (deal moves to the body so it always reads in full). */}
        {live ? (
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground red-glow">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Live Now
          </span>
        ) : item.bucket === "soon" ? (
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-amber-400/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-black">
            <Zap className="h-3 w-3" /> {item.startTime || "Soon"}
          </span>
        ) : null}
      </div>

      {/* Body — flex-1 with a pinned footer keeps all cards the same height. */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-serif text-lg leading-snug tracking-tight text-white line-clamp-1">{item.title}</h3>
        <p className="min-h-[16px] text-xs text-white/55 line-clamp-1">{item.subtitle}</p>

        {item.dealLabel && (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/10 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-amber-300 line-clamp-2">
            <Ticket className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{item.dealLabel}</span>
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/8 pt-2.5 text-xs text-white/55">
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{loc || "Tonight"}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {item.rating > 0 && (
              <span className="flex items-center gap-1 text-amber-400">
                <Star className="h-3.5 w-3.5 fill-amber-400" />{item.rating.toFixed(1)}
              </span>
            )}
            {!live && item.startTime && item.bucket !== "soon" && (
              <span className="flex items-center gap-1 text-white/45">
                <Clock className="h-3.5 w-3.5" />{item.startTime}
              </span>
            )}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function HappeningTonight() {
  const { selectedCity } = useSelectedCity();
  const [activeFilter, setActiveFilter] = useState("all");
  const [pick, setPick] = useState<TonightItem | null>(null);

  const { data } = useQuery({
    queryKey: ["happening-tonight", selectedCity],
    queryFn: () => {
      const qs = selectedCity ? `?city=${encodeURIComponent(selectedCity)}` : "";
      return apiGet<TonightResponse>(`/api/happening-tonight${qs}`);
    },
    staleTime: 60_000,
  });

  // Flat, de-duplicated, score-ordered list for the filter grid.
  const allItems = useMemo(() => {
    if (!data) return [] as TonightItem[];
    const seen = new Set<string>();
    const out: TonightItem[] = [];
    for (const it of [...data.tonightNearYou, ...data.happeningNow, ...data.startingSoon, ...data.lastMinuteDeals]) {
      if (seen.has(it.key)) continue;
      seen.add(it.key);
      out.push(it);
    }
    return out.sort((a, b) => b.score - a.score);
  }, [data]);

  const filtered = useMemo(() => {
    if (activeFilter === "all") return allItems;
    return allItems.filter((i) => i.filters.includes(activeFilter));
  }, [allItems, activeFilter]);

  // "What Should I Do Tonight?" — surface the single highest-scored experience.
  const recommend = () => {
    if (allItems.length === 0) return;
    // Light randomness among the top contenders so repeat taps feel alive.
    const top = allItems.slice(0, Math.min(5, allItems.length));
    setPick(top[Math.floor(Math.random() * top.length)] ?? top[0]!);
  };

  if (!data || allItems.length === 0) return null;

  return (
    <section className="relative py-12 md:py-16 overflow-hidden">
      {/* Ambient blood-red glow for urgency */}
      <div className="absolute -top-24 left-1/4 h-72 w-[32rem] max-w-full rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <div className="container mx-auto px-4 md:px-6 relative">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-primary mb-2.5 flex items-center gap-2">
              <Flame className="h-3.5 w-3.5" /> Real-time discovery
            </p>
            <h2 className="font-serif text-3xl md:text-5xl tracking-tight text-white">
              🔥 Happening Tonight
            </h2>
            <p className="text-sm text-white/55 mt-2">
              {data.counts.now > 0
                ? `${data.counts.now} live now · ${data.counts.soon} starting soon${selectedCity ? ` near ${selectedCity}` : ""}`
                : `${allItems.length} experiences for tonight${selectedCity ? ` near ${selectedCity}` : ""}`}
            </p>
          </div>

          {/* What Should I Do Tonight? CTA */}
          <button
            type="button"
            onClick={recommend}
            className="self-start sm:self-auto inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground red-glow transition-transform hover:scale-105 active:scale-95"
          >
            <Sparkles className="h-4 w-4" /> What Should I Do Tonight?
          </button>
        </div>

        {/* Quick filters */}
        <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
          {FILTERS.map((f) => {
            const active = activeFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={`whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors border ${
                  active
                    ? "bg-primary text-primary-foreground border-primary red-glow"
                    : "bg-white/5 text-white/70 border-white/10 hover:border-primary/40 hover:text-white"
                }`}
              >
                {f.icon}
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Cards */}
        {filtered.length > 0 ? (
          <CarouselRow className="mt-4">
            {filtered.map((it) => <TonightCard key={it.key} item={it} />)}
          </CarouselRow>
        ) : (
          <div className="mt-6 rounded-2xl border border-white/8 bg-white/3 p-8 text-center">
            <p className="text-sm text-white/55">Nothing in this category right now — try another filter.</p>
          </div>
        )}
      </div>

      {/* Recommendation reveal */}
      {pick && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setPick(null)}
        >
          <div
            className="relative w-full max-w-md rounded-3xl border border-primary/30 bg-zinc-950 overflow-hidden lift-3d"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPick(null)}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/70 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="relative h-52 bg-zinc-900">
              {pick.imageUrl ? (
                <img src={pick.imageUrl} alt={pick.title} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-zinc-900">
                  <Sparkles className="h-12 w-12 text-primary/40" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-4 right-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-primary mb-1 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> Tonight's pick for you
                </p>
                <h3 className="font-serif text-2xl tracking-tight text-white leading-tight line-clamp-2">{pick.title}</h3>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3 text-sm text-white/60 mb-4">
                {pick.bucket === "now" && (
                  <span className="flex items-center gap-1.5 text-primary font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> Live now
                  </span>
                )}
                {pick.startTime && <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{pick.startTime}</span>}
                {pick.city && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" />{pick.city}</span>}
              </div>
              <div className="flex gap-2">
                <Link
                  href={pick.href}
                  onClick={() => setPick(null)}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground red-glow"
                >
                  Book this <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  onClick={recommend}
                  className="rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-white/80 hover:bg-white/8 transition-colors"
                >
                  Surprise me again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
