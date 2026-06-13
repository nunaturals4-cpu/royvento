import { Link } from "wouter";
import { Star } from "lucide-react";
import { formatINR } from "@/lib/api";
import { pubDetailSlug, eventDetailSlug } from "@/lib/seo-slug";

interface Props {
  event: {
    id: number;
    vendorId?: number;
    title: string;
    category: string;
    type?: string;
    location: string;
    city?: string;
    state?: string;
    price: number;
    imageUrl: string;
    rating: number;
    reviewCount: number;
    vendorName?: string;
    partnerName?: string;
    approvedAt?: string | null;
    popular?: boolean;
    hasDrinkPlans?: boolean;
    freeEntryRules?: { enabled: boolean; genders: string[]; days: string[]; beforeTime?: string } | null;
    vendorCrowdLevel?: string | null;
    vendorCategory?: string;
  };
  hidePubBadge?: boolean;
  directBooking?: boolean;
}

const DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Shares the exact visual language of the Pubs page PubCard so every listing
// rail across the app (home, events, city pages…) reads consistently. The
// href/booking logic and props stay as-is; only the markup mirrors PubCard.
export function EventCard({ event, directBooking }: Props) {
  const loc = event.city
    ? `${event.city}${event.state ? ", " + event.state : ""}`
    : event.location;

  const fer = event.freeEntryRules;
  const freeDays = fer?.enabled === true ? (fer.days ?? []) : [];
  const hasFreeEntry = freeDays.length > 0;
  const todayAbbr = DAY_ABBRS[new Date().getDay()];
  const isFreeToday = hasFreeEntry && freeDays.includes(todayAbbr);

  // "New" badge: shown for 15 days after an admin approves the event, then it
  // disappears automatically. Driven by the server's `approvedAt` timestamp.
  const NEW_BADGE_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;
  const isNew = (() => {
    if (!event.approvedAt) return false;
    const approvedMs = new Date(event.approvedAt).getTime();
    if (Number.isNaN(approvedMs)) return false;
    return Date.now() - approvedMs <= NEW_BADGE_WINDOW_MS;
  })();
  const ratingLabel = event.rating > 0 ? event.rating.toFixed(1) : null;

  const pubLinkId = event.vendorId ?? event.id;
  const eventHref = eventDetailSlug({ id: event.id, title: event.title, city: event.city });
  const href = directBooking
    ? `${eventHref}#book`
    : event.type === "pub"
      ? pubDetailSlug({ id: pubLinkId, name: event.title, city: event.city })
      : eventHref;

  // Body chips: venue category / vibe only.
  const bodyTags: string[] = [];
  if (event.vendorCategory) bodyTags.push(event.vendorCategory);
  if (event.category && event.category !== event.vendorCategory) bodyTags.push(event.category);

  return (
    <Link href={href}>
      <article className="reveal group cursor-pointer overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111111] transition-all duration-300 hover:border-primary/25 hover:shadow-[0_0_0_1px_rgba(232,41,28,0.15),0_8px_32px_rgba(0,0,0,0.6)]">

        {/* ── Image ── */}
        <div className="relative aspect-video overflow-hidden bg-black/40">
          {event.imageUrl ? (
            <img
              src={event.imageUrl}
              alt={event.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-card to-muted" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30" />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/5" />
        </div>

        {/* ── Body ── */}
        <div className="p-3.5">
          {/* Colour-coded highlight badges: Popular (red) · Free Entry (green) · Drink Deal (amber) */}
          {(event.popular || isNew || hasFreeEntry || event.hasDrinkPlans) && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {(event.popular || isNew) && (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                  {event.popular ? "★ Popular" : "New"}
                </span>
              )}
              {hasFreeEntry && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full bg-white ${isFreeToday ? "animate-pulse" : ""}`} />
                  {isFreeToday ? "Free Today" : "Free Entry"}
                </span>
              )}
              {event.hasDrinkPlans && (
                <span className="inline-flex items-center rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
                  Drink Deal
                </span>
              )}
            </div>
          )}

          {/* Name */}
          <h3 className="text-[15px] font-bold leading-tight text-white line-clamp-1 group-hover:text-primary transition-colors duration-200">
            {event.title}
          </h3>

          {/* Area */}
          <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-1">{loc}</p>

          {/* Rating + review count */}
          {ratingLabel && (
            <div className="mt-1.5 flex items-center gap-1">
              <Star className="h-3 w-3 fill-primary text-primary" />
              <span className="text-[12px] font-semibold text-white">{ratingLabel}</span>
              {event.reviewCount > 0 && (
                <span className="text-[11px] text-muted-foreground">({event.reviewCount >= 1000
                  ? `${(event.reviewCount / 1000).toFixed(1)}K`
                  : event.reviewCount})</span>
              )}
            </div>
          )}

          {/* Tag chips — venue category / vibe */}
          {bodyTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {bodyTags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-md border border-white/20 bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/85"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Price row */}
          <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.06] pt-2.5">
            <span className="text-[11px] text-muted-foreground/70">Entry</span>
            <span className="text-sm font-bold text-white">{formatINR(event.price)}</span>
          </div>
        </div>
      </article>
    </Link>
  );
}
