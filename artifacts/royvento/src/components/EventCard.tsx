import { Link } from "wouter";
import { Star, MapPin, GlassWater } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  const partner = event.partnerName ?? event.vendorName ?? "";
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

  const hasBadges = crowd || hasFreeEntry || event.hasDrinkPlans || (!hasFreeEntry && event.type !== "pub" && event.category);

  return (
    <Link href={href}>
      <div className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl lift-3d border border-white/8 bg-card/40 backdrop-blur-sm">

        {/* ── IMAGE — cinematic, melts into the card ── */}
        <div className="relative aspect-video overflow-hidden bg-black/40 shrink-0">
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

          {/* Cinematic gradient so the photo dissolves into the card body */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/35 via-transparent to-transparent opacity-70" />
          {/* Subtle inner ring for a crafted edge */}
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/5" />

          {/* Popular — glassy, glowing pill */}
          {event.popular && (
            <div className="absolute top-3 left-3">
              <Badge className="border border-white/15 bg-primary/85 text-primary-foreground red-glow backdrop-blur-md text-[10px] px-2.5 py-1 font-semibold tracking-wide shadow-lg">
                ★ Popular
              </Badge>
            </div>
          )}

          {/* Rating / New — frosted glass pill */}
          <div className="absolute top-3 right-3">
            <div className="flex items-center gap-1 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[11px] shadow-lg backdrop-blur-md">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {ratingLabel ? (
                <span className="font-semibold text-white">{ratingLabel}</span>
              ) : isNew ? (
                <span className="font-medium text-white/80">New</span>
              ) : (
                <span className="font-medium text-white/40">—</span>
              )}
            </div>
          </div>
        </div>

        {/* ── CARD BODY ── */}
        <div className="flex flex-1 flex-col gap-2.5 px-4 pb-4 pt-3.5">

          {/* Title */}
          <h3 className="font-serif text-[16px] leading-snug tracking-tight text-white line-clamp-2 transition-colors duration-300 group-hover:text-primary">
            {event.title}
          </h3>

          {/* Partner eyebrow */}
          {partner && (
            <p className="-mt-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
              {partner}
            </p>
          )}

          {/* Status badges */}
          {hasBadges && (
            <div className="flex flex-wrap items-center gap-1.5">
              {crowd && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm border border-white/10 ${crowd.color}`}>
                  {crowd.label}
                </span>
              )}
              {hasFreeEntry && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm border ${
                  isFreeToday
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                    : "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                }`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${isFreeToday ? "bg-emerald-400 animate-pulse" : "bg-emerald-500"}`} />
                  {freeLabel}
                </span>
              )}
              {event.hasDrinkPlans && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/15 px-2.5 py-1 text-[10px] font-semibold text-primary shadow-sm">
                  <GlassWater className="h-3 w-3" />
                  Deal
                </span>
              )}
              {!hasFreeEntry && event.type !== "pub" && event.category && (
                <span className="inline-flex items-center rounded-full border border-white/8 bg-white/8 px-2.5 py-1 text-[10px] font-medium text-white/65 shadow-sm">
                  {event.category}
                </span>
              )}
            </div>
          )}

          {/* Footer — location + price, pinned to bottom */}
          <div className="mt-auto flex items-center justify-between border-t border-white/6 pt-3">
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate">{loc}</span>
            </div>
            <span className="ml-2 shrink-0 text-sm font-bold tracking-tight text-white">{formatINR(event.price)}</span>
          </div>
        </div>

        {/* Red hairline glow accent on hover */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>
    </Link>
  );
}
