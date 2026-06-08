import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Clock,
  Sparkles,
  ArrowRight,
  Star,
  Armchair,
  Ticket,
  Gamepad2,
  GlassWater,
  CalendarRange,
  Zap,
  PartyPopper,
  CheckCircle2,
  UsersRound,
  UtensilsCrossed,
} from "lucide-react";
import { useSelectedCity } from "@/components/LocationContext";
import { CarouselRow } from "@/components/CarouselRow";
import { apiGet } from "@/lib/api";

// ── Going Out With Friends ───────────────────────────────────────────────────
// Group-first discovery widget for the homepage. The user answers three quick
// questions — how many people, when, what kind of experience — and we surface
// ONLY the pubs/clubs/events/gaming venues that can actually seat the whole
// group right now (real-time availability from /api/going-out), ranked by a
// Group Fit score, plus auto-built group package suggestions.

type Kind = "pub" | "club" | "event" | "game";

interface GroupItem {
  key: string;
  id: number;
  kind: Kind;
  title: string;
  subtitle: string;
  city: string;
  state: string;
  imageUrl: string;
  href: string;
  rating: number;
  capacity: number;
  availableCapacity: number | null;
  maxGroupSize: number;
  groupOffer: string;
  fromPrice: number;
  groupFitScore: number;
}

interface GroupPackage {
  key: string;
  venueId: number;
  kind: Kind;
  title: string;
  venueName: string;
  city: string;
  imageUrl: string;
  href: string;
  includes: string[];
  estPrice: number;
  groupSize: number;
}

interface GoingOutResponse {
  size: number;
  when: string;
  type: string;
  results: GroupItem[];
  packages: GroupPackage[];
  counts: { total: number; pubs: number; events: number; games: number };
}

// Quick-pick group sizes. "Large Groups" maps to 15 (a sensible large-party
// default the availability engine can still match against maxGroupSize).
const SIZE_CHIPS: { label: string; value: number }[] = [
  { label: "2 People", value: 2 },
  { label: "4 People", value: 4 },
  { label: "6 People", value: 6 },
  { label: "8 People", value: 8 },
  { label: "10+", value: 10 },
  { label: "Large Groups", value: 15 },
];

const WHEN_CHIPS: { label: string; value: string; icon: React.ReactNode }[] = [
  { label: "Right Now", value: "now", icon: <Zap className="h-3.5 w-3.5" /> },
  { label: "Tonight", value: "tonight", icon: <Clock className="h-3.5 w-3.5" /> },
  { label: "Tomorrow", value: "tomorrow", icon: <CalendarRange className="h-3.5 w-3.5" /> },
  { label: "This Weekend", value: "weekend", icon: <PartyPopper className="h-3.5 w-3.5" /> },
];

const TYPE_CHIPS: { label: string; value: string; icon: React.ReactNode }[] = [
  { label: "All", value: "", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { label: "Pub", value: "pub", icon: <GlassWater className="h-3.5 w-3.5" /> },
  { label: "Club", value: "club", icon: <PartyPopper className="h-3.5 w-3.5" /> },
  { label: "Happy Hours", value: "happy-hours", icon: <GlassWater className="h-3.5 w-3.5" /> },
  { label: "Food & Drinks Offers", value: "food-drink-offers", icon: <UtensilsCrossed className="h-3.5 w-3.5" /> },
  { label: "Event", value: "event", icon: <Ticket className="h-3.5 w-3.5" /> },
  { label: "DJ Night", value: "dj-night", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { label: "Live Music", value: "live-music", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { label: "Bowling", value: "bowling", icon: <Gamepad2 className="h-3.5 w-3.5" /> },
  { label: "VR Gaming", value: "vr-gaming", icon: <Gamepad2 className="h-3.5 w-3.5" /> },
  { label: "Sports", value: "sports", icon: <Gamepad2 className="h-3.5 w-3.5" /> },
  { label: "Arcade", value: "arcade", icon: <Gamepad2 className="h-3.5 w-3.5" /> },
];

const KIND_BADGE: Record<Kind, { label: string; icon: React.ReactNode }> = {
  pub: { label: "Pub & Club", icon: <GlassWater className="h-3 w-3" /> },
  club: { label: "Club", icon: <PartyPopper className="h-3 w-3" /> },
  event: { label: "Live Event", icon: <Ticket className="h-3 w-3" /> },
  game: { label: "Gaming", icon: <Gamepad2 className="h-3 w-3" /> },
};

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all " +
        (active
          ? "bg-primary text-primary-foreground red-glow border border-primary"
          : "border border-white/12 bg-white/5 text-white/70 hover:border-primary/40 hover:text-white")
      }
    >
      {children}
    </button>
  );
}

function StepLabel({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold border border-primary/30">
        {n}
      </span>
      <span className="text-sm font-medium text-white/80">{title}</span>
    </div>
  );
}

function GroupCard({ item, size }: { item: GroupItem; size: number }) {
  const badge = KIND_BADGE[item.kind];
  const headroom =
    item.availableCapacity != null ? Math.max(item.availableCapacity - size, 0) : null;
  return (
    <Link
      href={item.href}
      className="reveal group relative flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-zinc-900/80 lift-3d"
    >
      <div className="relative h-40 overflow-hidden bg-zinc-800">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 to-zinc-900">
            {badge.icon}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm border border-white/15">
          {badge.icon}
          {badge.label}
        </span>
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[10px] font-bold text-black">
          <CheckCircle2 className="h-3 w-3" />
          Fits {size}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-serif text-lg leading-tight tracking-tight text-white line-clamp-1">
          {item.title}
        </h3>
        <p className="text-xs text-white/45 line-clamp-1">
          {item.subtitle}
          {item.city ? ` · ${item.city}` : ""}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-white/60">
          {item.rating > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <Star className="h-3 w-3 fill-amber-400" />
              {item.rating.toFixed(1)}
            </span>
          )}
          {item.availableCapacity != null ? (
            <span className="inline-flex items-center gap-1">
              <Armchair className="h-3 w-3 text-primary" />
              {item.availableCapacity} spots left
              {headroom != null && headroom > 0 ? ` · ${headroom} spare` : ""}
            </span>
          ) : item.capacity > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Armchair className="h-3 w-3 text-primary" />
              Seats {item.capacity}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <UsersRound className="h-3 w-3 text-primary" />
              Group-friendly
            </span>
          )}
        </div>

        {item.groupOffer && (
          <p className="rounded-lg bg-primary/10 border border-primary/25 px-2.5 py-1.5 text-[11px] font-medium text-primary line-clamp-1">
            🎉 {item.groupOffer}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-2 border-t border-white/8">
          <span className="text-xs text-white/55">
            {item.fromPrice > 0 ? (
              <>
                from <span className="font-semibold text-white">₹{item.fromPrice}</span>
              </>
            ) : (
              "Tap to book"
            )}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
            Book group <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function GoingOutWithFriends() {
  const { selectedCity: userCity } = useSelectedCity();
  const [size, setSize] = useState(4);
  const [when, setWhen] = useState("tonight");
  const [type, setType] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["going-out", size, when, type, userCity],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("size", String(size));
      params.set("when", when);
      if (type) params.set("type", type);
      if (userCity) params.set("city", userCity);
      return apiGet<GoingOutResponse>(`/api/going-out?${params.toString()}`);
    },
    staleTime: 30_000,
  });

  const results = data?.results ?? [];
  const packages = data?.packages ?? [];
  const sizeLabel = useMemo(
    () => SIZE_CHIPS.find((c) => c.value === size)?.label ?? `${size} People`,
    [size],
  );

  return (
    <section className="relative overflow-hidden py-14 md:py-20">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
      <div className="absolute -top-32 left-1/4 h-72 w-[36rem] max-w-full rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <div className="container relative mx-auto px-4 md:px-6">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="mb-2.5 inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-primary">
            <Users className="h-3.5 w-3.5" />
            Plan together, book together
          </p>
          <h2 className="font-serif text-3xl md:text-5xl tracking-tight">
            👥 Going Out With Friends?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/55">
            Tell us your group size and when — we'll show only the places that can
            actually fit all of you, right now.
          </p>
        </div>

        {/* Quick size chips */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {SIZE_CHIPS.map((c) => (
            <Chip key={c.value} active={size === c.value} onClick={() => setSize(c.value)}>
              <Users className="h-3.5 w-3.5" />
              {c.label}
            </Chip>
          ))}
        </div>

        {/* Discovery controls */}
        <div className="glass-card-strong mx-auto mb-10 max-w-4xl rounded-2xl border border-white/10 p-5 md:p-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <StepLabel n={1} title="How many people are going?" />
              <div className="flex flex-wrap gap-2">
                {SIZE_CHIPS.map((c) => (
                  <Chip key={c.value} active={size === c.value} onClick={() => setSize(c.value)}>
                    {c.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <StepLabel n={2} title="When?" />
              <div className="flex flex-wrap gap-2">
                {WHEN_CHIPS.map((c) => (
                  <Chip key={c.value} active={when === c.value} onClick={() => setWhen(c.value)}>
                    {c.icon}
                    {c.label}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6">
            <StepLabel n={3} title="What type of experience?" />
            <div className="flex flex-wrap gap-2">
              {TYPE_CHIPS.map((c) => (
                <Chip key={c.value} active={type === c.value} onClick={() => setType(c.value)}>
                  {c.icon}
                  {c.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-72 animate-pulse rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-white/8 bg-white/3 p-10 text-center text-sm text-white/55">
            Couldn't load group availability right now. Please try again.
          </div>
        ) : results.length > 0 ? (
          <>
            <div className="mb-5 flex items-center justify-between">
              <p className="text-sm text-white/60">
                <span className="font-semibold text-white">{results.length}</span> places can host{" "}
                <span className="font-semibold text-primary">{sizeLabel.toLowerCase()}</span>
              </p>
            </div>
            <CarouselRow itemClassName="w-[280px] sm:w-[300px]">
              {results.map((item) => (
                <GroupCard key={item.key} item={item} size={size} />
              ))}
            </CarouselRow>
          </>
        ) : (
          <div className="rounded-2xl border border-white/8 bg-white/3 p-10 text-center">
            <UsersRound className="mx-auto mb-3 h-8 w-8 text-white/30" />
            <p className="text-sm text-white/55">
              No venues currently have availability for {sizeLabel.toLowerCase()}{" "}
              {when === "now" ? "right now" : when}. Try a different time or group size.
            </p>
          </div>
        )}

        {/* Group packages */}
        {packages.length > 0 && (
          <div className="mt-14">
            <h3 className="mb-5 flex items-center gap-2 font-serif text-2xl tracking-tight">
              <Sparkles className="h-5 w-5 text-primary" />
              Group packages for {sizeLabel.toLowerCase()}
            </h3>
            <CarouselRow>
              {packages.map((p) => (
                <Link
                  key={p.key}
                  href={p.href}
                  className="group flex w-[280px] flex-col overflow-hidden rounded-2xl border border-primary/20 bg-zinc-900/80 lift-3d"
                >
                  <div className="relative h-32 overflow-hidden bg-zinc-800">
                    {p.imageUrl && (
                      <img
                        src={p.imageUrl}
                        alt={p.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <span className="absolute bottom-2 left-3 text-[11px] font-semibold uppercase tracking-wider text-white/80">
                      {p.venueName}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <h4 className="font-serif text-base tracking-tight text-white">{p.title}</h4>
                    <ul className="flex flex-col gap-1">
                      {p.includes.slice(0, 4).map((inc, i) => (
                        <li key={i} className="flex items-center gap-1.5 text-[11px] text-white/55">
                          <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-primary" />
                          <span className="line-clamp-1">{inc}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto flex items-center justify-between pt-2 border-t border-white/8">
                      {p.estPrice > 0 && (
                        <span className="text-xs text-white/55">
                          ~<span className="font-semibold text-white">₹{p.estPrice}</span> /group
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        Book <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </CarouselRow>
          </div>
        )}
      </div>
    </section>
  );
}
