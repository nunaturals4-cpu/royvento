import { useParams, Link } from "wouter";
import {
  useGetVendor,
  useListVendorReviews,
  useListEvents,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { EventCard } from "@/components/EventCard";
import { Star, MapPin, Navigation, Clock } from "lucide-react";

export function VendorDetail() {
  const params = useParams();
  const id = Number(params["id"]);
  const { data: vendor, isLoading } = useGetVendor(id);
  const { data: reviews = [] } = useListVendorReviews(id);
  const { data: allEvents = [] } = useListEvents();

  if (isLoading) return <div className="container mx-auto px-4 py-20">Loading…</div>;
  if (!vendor) return <div className="container mx-auto px-4 py-20">Partner not found.</div>;

  const events = allEvents.filter((e) => e.vendorId === vendor.id);

  return (
    <div>
      {/* Cover photo (full-width) displayed above the banner hero when set */}
      {vendor.coverImageUrl && (
        <div className="w-full h-52 md:h-72 overflow-hidden">
          <img src={vendor.coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="relative h-[50vh] w-full overflow-hidden">
        {vendor.bannerImage ? (
          <img src={vendor.bannerImage} alt={vendor.businessName} className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="container mx-auto px-4 md:px-6 absolute inset-x-0 bottom-0 pb-10">
          <Badge className="mb-3" variant="secondary">{vendor.category}</Badge>
          <h1 className="font-serif text-4xl md:text-6xl tracking-tight">{vendor.businessName}</h1>
          <div className="flex flex-wrap gap-5 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" />{vendor.location}</span>
            {vendor.address && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(vendor.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-primary hover:underline"
              >
                <Navigation className="h-4 w-4" />
                {vendor.address}
              </a>
            )}
            <span className="flex items-center gap-1.5">
              <Star className="h-4 w-4 fill-primary text-primary" />
              {vendor.rating > 0 ? `${vendor.rating.toFixed(1)} (${vendor.reviewCount} reviews)` : "Newly listed"}
            </span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-12 space-y-14">
        <section>
          <h2 className="font-serif text-2xl mb-3">About</h2>
          <p className="text-muted-foreground leading-relaxed max-w-3xl">{vendor.description}</p>
        </section>

        {vendor.dayHours ? (() => {
          const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
          const hours = vendor.dayHours as Record<string, { open: string; close: string } | null>;
          const entries = dayOrder.filter((d) => d in hours);
          if (entries.length === 0) return null;
          return (
            <section>
              <h2 className="font-serif text-2xl mb-5 flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Hours
              </h2>
              <div className="rounded-xl border divide-y max-w-sm">
                {entries.map((day) => {
                  const times = hours[day];
                  return (
                    <div key={day} className="flex justify-between items-center px-4 py-2.5 text-sm">
                      <span className="font-medium">{day}</span>
                      <span className="text-muted-foreground">
                        {times ? `${times.open} – ${times.close}` : "Closed"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })() : vendor.openDays && vendor.openDays.length > 0 ? (
          <section>
            <h2 className="font-serif text-2xl mb-3 flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Open Days
            </h2>
            <p className="text-muted-foreground">{vendor.openDays.join(", ")}</p>
          </section>
        ) : null}

        {vendor.portfolioImages.length > 0 && (
          <section>
            <h2 className="font-serif text-2xl mb-5">Portfolio</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {vendor.portfolioImages.map((src, i) => (
                <div key={i} className="aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
                  <img src={src} alt="" className="h-full w-full object-cover hover:scale-105 transition-transform duration-700" loading="lazy" />
                </div>
              ))}
            </div>
          </section>
        )}

        {events.length > 0 && (
          <section>
            <h2 className="font-serif text-2xl mb-5">Events by {vendor.businessName}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map((e) => <EventCard key={e.id} event={e} />)}
            </div>
          </section>
        )}

        <section>
          <h2 className="font-serif text-2xl mb-5">Reviews</h2>
          {reviews.length === 0 ? (
            <p className="text-muted-foreground">No reviews yet.</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {reviews.map((r) => (
                <div key={r.id} className="rounded-xl border bg-card p-5">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{r.userName}</p>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`h-4 w-4 ${i < r.rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                      ))}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{r.comment}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
