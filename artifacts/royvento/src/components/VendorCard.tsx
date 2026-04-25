import { Link } from "wouter";
import { Star, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  vendor: {
    id: number;
    businessName: string;
    category: string;
    location: string;
    bannerImage: string;
    rating: number;
    reviewCount: number;
  };
}

export function VendorCard({ vendor }: Props) {
  return (
    <Link href={`/vendors/${vendor.id}`}>
      <div className="group cursor-pointer overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-1 hover:shadow-xl">
        <div className="aspect-[16/10] overflow-hidden bg-muted">
          {vendor.bannerImage ? (
            <img
              src={vendor.bannerImage}
              alt={vendor.businessName}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
            />
          ) : null}
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
        </div>
      </div>
    </Link>
  );
}
