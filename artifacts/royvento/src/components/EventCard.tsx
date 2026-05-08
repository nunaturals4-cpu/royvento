import { Link } from "wouter";
import { Star, MapPin, GlassWater } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/api";
import { pubDetailSlug, eventDetailSlug } from "@/lib/seo-slug";

interface Props {
  event: {
    id: number;
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
    popular?: boolean;
    hasDrinkPlans?: boolean;
    freeEntryRules?: { enabled: boolean; genders: string[]; days: string[]; beforeTime?: string } | null;
    vendorCrowdLevel?: string | null;
  };
  hidePubBadge?: boolean;
}

const DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CROWD_BADGE: Record<string, { label: string; color: string }> = {
  low: { label: "Low Crowd", color: "bg-green-600" },
  moderate: { label: "Moderate Crowd", color: "bg-amber-500" },
  party: { label: "High Crowd 🔥", color: "bg-red-600" },
};

export function EventCard({ event, hidePubBadge }: Props) {
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

  const isNew = event.rating === 0 && event.reviewCount === 0;
  const ratingLabel = event.rating > 0 ? event.rating.toFixed(1) : null;
  const crowd = event.vendorCrowdLevel ? CROWD_BADGE[event.vendorCrowdLevel] : null;

  // Route to the canonical slugged URL so internal links match what the
  // sitemap and rel=canonical advertise. For pub-type cards this means
  // /pubs/{city}/{slug}-{id}; for event-type cards /events/{city}/{slug}-{id}.
  const href =
    event.type === "pub"
      ? pubDetailSlug({ id: event.id, name: event.title, city: event.city })
      : eventDetailSlug({ id: event.id, title: event.title, city: event.city });

  return (
    <Link href={href}>
      <div className="group cursor-pointer relative overflow-hidden rounded-2xl lift-3d border border-white/8 bg-black/30">
        {/* Image — 16:9 aspect ratio with full overlay layout */}
        <div className="relative aspect-video overflow-hidden bg-black/40">
          {event.imageUrl ? (
            <img
              src={event.imageUrl}
              alt={event.title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-card to-muted" />
          )}

          {/* Dark gradient overlay — stronger at bottom for text legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

          {/* Top-right: Rating badge */}
          <div className="absolute top-3 right-3">
            <div className="flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-2.5 py-1 text-xs border border-white/10">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {ratingLabel ? (
                <span className="font-semibold text-white">{ratingLabel}</span>
              ) : isNew ? (
                <span className="font-medium text-white/80">New</span>
              ) : (
                <span className="font-medium text-white/80">—</span>
              )}
            </div>
          </div>

          {/* Top-left: Popular badge + crowd */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5 items-start">
            {event.popular && (
              <Badge className="bg-primary text-primary-foreground border-0 red-glow text-[10px] px-2 py-0.5">
                ★ Popular
              </Badge>
            )}
            {crowd && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full ${crowd.color} text-white text-[10px] font-semibold border border-white/20 shadow`}>
                {crowd.label}
              </span>
            )}
          </div>

          {/* Bottom row: left chip + right drink deal */}
          <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-8 flex items-end justify-between">
            {/* Bottom-left: category or free-entry chip */}
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              {hasFreeEntry ? (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  isFreeToday
                    ? "bg-emerald-500/30 border-emerald-500/50 text-emerald-300"
                    : "bg-emerald-500/15 border-emerald-500/25 text-emerald-400"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full inline-block ${isFreeToday ? "bg-emerald-400 animate-pulse" : "bg-emerald-500"}`} />
                  {freeLabel}
                </span>
              ) : event.type !== "pub" ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-black/50 border border-white/15 text-[10px] font-medium text-white/80 backdrop-blur">
                  {event.category}
                </span>
              ) : null}
            </div>

            {/* Bottom-right: Drink deal */}
            {event.hasDrinkPlans && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/90 text-primary-foreground text-[10px] font-semibold uppercase tracking-wide backdrop-blur shrink-0">
                <GlassWater className="h-3 w-3" />
                Deal
              </span>
            )}
          </div>

          {/* Bottom: title + meta overlaid on image */}
          <div className="absolute bottom-0 left-0 right-0 px-3 pb-11">
            <h3 className="font-serif text-white text-lg leading-tight tracking-tight line-clamp-2 drop-shadow-md">
              {event.title}
            </h3>
            {partner && (
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/55 mt-0.5">{partner}</p>
            )}
          </div>
        </div>

        {/* Card footer: location + price */}
        <div className="px-3 py-2.5 flex items-center justify-between bg-black/20 border-t border-white/5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
            <MapPin className="h-3 w-3 text-primary shrink-0" />
            <span className="truncate">{loc}</span>
          </div>
          <span className="text-sm font-semibold text-white shrink-0 ml-2">{formatINR(event.price)}</span>
        </div>
      </div>
    </Link>
  );
}
