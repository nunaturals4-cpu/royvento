import { Link } from "wouter";
import { Star, MapPin, GlassWater } from "lucide-react";
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
  };
  hidePubBadge?: boolean;
  directBooking?: boolean;
}

const DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CROWD_BADGE: Record<string, { label: string; color: string }> = {
  low: { label: "Low Crowd", color: "bg-green-600" },
  moderate: { label: "Moderate Crowd", color: "bg-amber-500" },
  party: { label: "High Crowd 🔥", color: "bg-red-600" },
};

export function EventCard({ event, hidePubBadge, directBooking }: Props) {
  const loc = event.city
    ? `${event.city}${event.state ? ", " + event.state : ""}`
    : event.location;

  const fer = event.freeEntryRules;
  const freeDays = fer?.enabled === true ? (fer.days ?? []) : [];
  const hasFreeEntry = freeDays.length > 0;
  const todayAbbr = DAY_ABBRS[new Date().getDay()];
  const isFreeToday = hasFreeEntry && freeDays.includes(todayAbbr);
  const freeLabel = isFreeToday ? "Free Today" : "Free some days";

  // "New" badge: shown for 15 days after an admin approves the event, then it
  // disappears automatically. Driven by the server's `approvedAt` timestamp
  // (set when approvalStatus flips to "approved"), NOT by review count.
  const NEW_BADGE_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;
  const isNew = (() => {
    if (!event.approvedAt) return false;
    const approvedMs = new Date(event.approvedAt).getTime();
    if (Number.isNaN(approvedMs)) return false;
    return Date.now() - approvedMs <= NEW_BADGE_WINDOW_MS;
  })();
  const ratingLabel = event.rating > 0 ? event.rating.toFixed(1) : null;
  const crowd = event.vendorCrowdLevel ? CROWD_BADGE[event.vendorCrowdLevel] : null;

  const pubLinkId = event.vendorId ?? event.id;
  const eventHref = eventDetailSlug({ id: event.id, title: event.title, city: event.city });
  const href = directBooking
    ? `${eventHref}#book`
    : event.type === "pub"
      ? pubDetailSlug({ id: pubLinkId, name: event.title, city: event.city })
      : eventHref;

  // Primary badge on the photo (Popular wins, else New)
  const topBadge = event.popular
    ? { label: "★ Popular", cls: "text-primary" }
    : isNew
      ? { label: "New", cls: "text-white/90" }
      : null;

  return (
    <Link href={href}>
      <div className="reveal group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl lift-3d border border-white/[0.06] bg-card shadow-card">

        {/* ── IMAGE ── */}
        <div className="sheen relative aspect-[16/10] overflow-hidden bg-black/40 shrink-0">
          {event.imageUrl ? (
            <img
              src={event.imageUrl}
              alt={event.title}
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-card to-muted" />
          )}

          {/* Gradients for badge legibility (top + bottom) */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/55" />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/5" />

          {/* Primary badge — top-left */}
          {topBadge && (
            <div className="absolute top-3 left-3">
              <span className={`inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-semibold tracking-wide backdrop-blur-md ${topBadge.cls}`}>
                {topBadge.label}
              </span>
            </div>
          )}

          {/* Status pills — bottom-left over the photo (like the reference) */}
          {(crowd || hasFreeEntry || event.hasDrinkPlans) && (
            <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-1.5">
              {crowd && (
                <span className="inline-flex items-center rounded-full border border-white/15 bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-md">
                  {crowd.label}
                </span>
              )}
              {hasFreeEntry && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-black/55 px-2 py-0.5 text-[10px] font-medium text-emerald-300 backdrop-blur-md">
                  <span className={`inline-block h-1 w-1 rounded-full ${isFreeToday ? "bg-emerald-400 animate-pulse" : "bg-emerald-500"}`} />
                  {freeLabel}
                </span>
              )}
              {event.hasDrinkPlans && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-black/55 px-2 py-0.5 text-[10px] font-medium text-primary backdrop-blur-md">
                  <GlassWater className="h-2.5 w-2.5" />
                  Deal
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── BODY ── */}
        <div className="flex flex-1 flex-col p-3">

          {/* NAME */}
          <h3 className="text-[13px] font-semibold leading-snug tracking-tight text-white line-clamp-1 transition-colors duration-300 group-hover:text-primary">
            {event.title}
          </h3>

          {/* AREA / location — quiet subtitle */}
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-2.5 w-2.5 shrink-0 text-primary/70" />
            <span className="truncate">{loc}</span>
          </div>

          {/* RATING · PRICE — clean bottom row */}
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1 text-xs">
              {ratingLabel && (
                <>
                  <Star className="h-3 w-3 fill-primary text-primary" />
                  <span className="font-semibold text-white">{ratingLabel}</span>
                </>
              )}
            </div>
            <span className="text-xs font-bold tracking-tight text-white">{formatINR(event.price)}</span>
          </div>
        </div>

        {/* Hover hairline glow accent */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>
    </Link>
  );
}
