import type { MouseEvent } from "react";
import { Link, useLocation } from "wouter";
import { Star, MapPin, Music2, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { pubDetailSlug } from "@/lib/seo-slug";

interface FreeEntryRules {
  enabled: boolean;
  genders: string[];
  days: string[];
  beforeTime?: string;
}

const DANCE_FLOOR_LABELS: Record<string, string> = {
  dedicated: "Dedicated dance floor",
  general: "Dancing in main area",
  none: "Seated only",
};

const CROWD_LABEL: Record<string, { label: string; color: string }> = {
  low: { label: "Low Crowd", color: "bg-green-600" },
  moderate: { label: "Moderate Crowd", color: "bg-amber-500" },
  party: { label: "High Crowd 🔥", color: "bg-red-600" },
};

interface Props {
  vendor: {
    id: number;
    businessName: string;
    category: string;
    location: string;
    city?: string | null;
    bannerImage: string;
    rating: number;
    reviewCount: number;
    freeEntryRules?: FreeEntryRules | null;
    danceFloor?: string | null;
    crowdLevel?: string | null;
  };
}

export function VendorCard({ vendor }: Props) {
  const fer = vendor.freeEntryRules;
  const danceFloorLabel = vendor.danceFloor ? DANCE_FLOOR_LABELS[vendor.danceFloor] : null;
  const crowd = vendor.crowdLevel ? CROWD_LABEL[vendor.crowdLevel] : null;
  const [, navigate] = useLocation();
  const detailHref = pubDetailSlug({ id: vendor.id, name: vendor.businessName, city: vendor.city ?? undefined });
  // Jump straight to the venue's "Book a Table" tab. stopPropagation/preventDefault
  // so the click doesn't also trigger the card's outer Link navigation.
  const goBook = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`${detailHref}?tab=book`);
  };
  return (
    <Link href={pubDetailSlug({ id: vendor.id, name: vendor.businessName, city: vendor.city ?? undefined })}>
      <div className="group cursor-pointer overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-1 hover:shadow-xl">
        <div className="aspect-[16/10] overflow-hidden bg-muted relative">
          {vendor.bannerImage ? (
            <img
              src={vendor.bannerImage}
              alt={vendor.businessName}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
            />
          ) : null}
          {fer?.enabled && (
            <span className="absolute top-2 left-2 bg-emerald-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full shadow">
              Free Entry{fer.genders.length > 0 ? ` · ${fer.genders.join(" & ")}` : ""}
            </span>
          )}
          {crowd && (
            <span className={`absolute top-2 right-2 ${crowd.color} text-white text-xs font-semibold px-2 py-0.5 rounded-full shadow`}>
              {crowd.label}
            </span>
          )}
        </div>
        <div className="p-5 space-y-2">
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="font-normal">{vendor.category}</Badge>
            <div className="flex items-center gap-1 text-sm">
              <Star className="h-4 w-4 fill-primary text-primary" />
              <span className="font-medium">{vendor.rating > 0 ? vendor.rating.toFixed(1) : "New"}</span>
            </div>
          </div>
          <h3 className="font-serif text-xl tracking-tight group-hover:text-primary transition-colors">
            {vendor.businessName}
          </h3>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span>{vendor.location}</span>
          </div>
          {danceFloorLabel && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Music2 className="h-3.5 w-3.5 shrink-0" />
              <span>{danceFloorLabel}</span>
            </div>
          )}
          <button
            onClick={goBook}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Calendar className="h-4 w-4" /> Book now
          </button>
        </div>
      </div>
    </Link>
  );
}
