import { Link } from "wouter";
import { Star, MapPin, GlassWater } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/api";

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
  };
}

const DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function EventCard({ event }: Props) {
  const partner = event.partnerName ?? event.vendorName ?? "";
  const loc = event.city
    ? `${event.city}${event.state ? ", " + event.state : ""}`
    : event.location;

  const fer = event.freeEntryRules;
  const freeDays = fer?.enabled === true ? (fer.days ?? []) : [];
  const hasFreeEntry = freeDays.length > 0;
  const todayAbbr = DAY_ABBRS[new Date().getDay()];
  const isFreeToday = hasFreeEntry && freeDays.includes(todayAbbr);
  const freeLabel = isFreeToday ? "Free Entry Today" : "Free some days";

  return (
    <Link href={`/events/${event.id}`}>
      <div className="group cursor-pointer relative overflow-hidden rounded-2xl glass-card lift-3d perspective-card">
        <div className="aspect-[4/3] overflow-hidden bg-black/40 relative tilt-on-hover">
          {event.imageUrl ? (
            <img
              src={event.imageUrl}
              alt={event.title}
              className="h-full w-full object-cover transition-transform duration-[900ms] group-hover:scale-110"
              loading="lazy"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
          {event.popular && (
            <div className="absolute top-3 left-3">
              <Badge className="bg-primary text-primary-foreground border-0 red-glow">
                ★ Popular
              </Badge>
            </div>
          )}
          {event.type === "pub" && (
            <div className="absolute top-3 right-3">
              <Badge variant="outline" className="bg-black/70 border-white/20 text-white">
                Pub
              </Badge>
            </div>
          )}
          {event.hasDrinkPlans && (
            <div className="absolute bottom-11 right-3">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/90 text-primary-foreground text-[10px] font-semibold uppercase tracking-wide backdrop-blur">
                <GlassWater className="h-3 w-3" />
                Drink deal
              </span>
            </div>
          )}
          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
            <Badge variant="secondary" className="bg-white/10 text-white border-white/10 backdrop-blur">
              {event.category}
            </Badge>
            <div className="flex items-center gap-1 text-xs text-white/90 bg-black/50 px-2 py-1 rounded-md backdrop-blur">
              <Star className="h-3.5 w-3.5 fill-primary text-primary" />
              <span className="font-medium">{event.rating > 0 ? event.rating.toFixed(1) : "New"}</span>
              {event.reviewCount > 0 && <span className="opacity-70">({event.reviewCount})</span>}
            </div>
          </div>
        </div>
        <div className="p-5 space-y-2.5">
          <h3 className="font-serif text-xl leading-tight tracking-tight group-hover:text-primary transition-colors line-clamp-2">
            {event.title}
          </h3>
          {partner && (
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{partner}</p>
          )}
          {hasFreeEntry && (
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg w-fit border ${isFreeToday ? "bg-emerald-500/20 border-emerald-500/40" : "bg-emerald-500/10 border-emerald-500/20"}`}>
              <span className={`h-1.5 w-1.5 rounded-full inline-block ${isFreeToday ? "bg-emerald-400 animate-pulse" : "bg-emerald-500"}`} />
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">
                {freeLabel}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <span className="truncate">{loc}</span>
            </div>
            <div className="text-right">
              <span className="font-semibold text-white">{formatINR(event.price)}</span>
              <span className="text-xs text-muted-foreground"> /pp</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
