import { Link } from "wouter";
import { Star, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  event: {
    id: number;
    title: string;
    category: string;
    location: string;
    price: number;
    imageUrl: string;
    rating: number;
    reviewCount: number;
    vendorName: string;
  };
}

export function EventCard({ event }: Props) {
  return (
    <Link href={`/events/${event.id}`}>
      <div className="group cursor-pointer overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-1 hover:shadow-xl">
        <div className="aspect-[4/3] overflow-hidden bg-muted">
          {event.imageUrl ? (
            <img
              src={event.imageUrl}
              alt={event.title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
            />
          ) : null}
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="secondary" className="font-normal">{event.category}</Badge>
            <div className="flex items-center gap-1 text-sm">
              <Star className="h-4 w-4 fill-primary text-primary" />
              <span className="font-medium">{event.rating > 0 ? event.rating.toFixed(1) : "New"}</span>
              {event.reviewCount > 0 && (
                <span className="text-muted-foreground text-xs">({event.reviewCount})</span>
              )}
            </div>
          </div>
          <h3 className="font-serif text-xl leading-tight tracking-tight group-hover:text-primary transition-colors">
            {event.title}
          </h3>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{event.vendorName}</p>
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span className="truncate">{event.location}</span>
            </div>
            <div className="text-right">
              <span className="font-semibold">${event.price.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground"> / event</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
