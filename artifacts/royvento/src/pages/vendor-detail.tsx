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
  const pubEvent = events.find((e) => e.type === "pub");
  const pubEventTypes: string[] = pubEvent?.pubEventTypes ?? [];

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
          const DAY_FULL: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
          const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
          const hours = vendor.dayHours as Record<string, { open: string; close: string } | null>;
          if (!DAY_ORDER.some((d) => d in hours)) return null;

          const fmt = (hhmm: string) => {
            const [h, m] = hhmm.split(":").map(Number);
            const suffix = h < 12 ? "AM" : "PM";
            const hr = h % 12 || 12;
            return `${hr}:${String(m).padStart(2, "0")} ${suffix}`;
          };
          const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

          const todayKey = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
          const todayTimes = hours[todayKey] ?? null;
          const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
          let isOpenNow = false;
          if (todayTimes) {
            const openMin = toMin(todayTimes.open);
            const closeMin = toMin(todayTimes.close);
            isOpenNow = closeMin < openMin
              ? nowMin >= openMin || nowMin < closeMin
              : nowMin >= openMin && nowMin < closeMin;
          }

          const leftDays = DAY_ORDER.slice(0, 4);
          const rightDays = DAY_ORDER.slice(4);

          const DayRow = ({ day }: { day: string }) => {
            const times = hours[day] ?? null;
            const isToday = day === todayKey;
            const isOvernight = times ? toMin(times.close) < toMin(times.open) : false;
            return (
              <div
                className={[
                  "flex justify-between items-center px-4 py-3 text-sm rounded-lg transition-colors",
                  isToday
                    ? "bg-primary/10 ring-1 ring-primary/20 border-l-[3px] border-primary"
                    : "hover:bg-white/3",
                ].join(" ")}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className={[
                    "h-2 w-2 rounded-full shrink-0",
                    times ? "bg-emerald-500" : "bg-muted-foreground/30",
                  ].join(" ")} />
                  <span className={["font-medium truncate", isToday ? "text-primary" : ""].join(" ")}>
                    {DAY_FULL[day]}
                  </span>
                  {isToday && (
                    <span className="shrink-0 text-[10px] font-semibold text-primary/70 uppercase tracking-wider border border-primary/30 rounded px-1 py-px">
                      today
                    </span>
                  )}
                </span>
                <span className={[
                  "ml-3 shrink-0 tabular-nums",
                  times
                    ? isToday
                      ? "font-semibold text-primary"
                      : "text-foreground text-sm"
                    : "text-muted-foreground/50 text-xs",
                ].join(" ")}>
                  {times ? (
                    <>
                      {fmt(times.open)} – {fmt(times.close)}
                      {isOvernight && (
                        <span className="ml-1 text-muted-foreground/50 text-[10px]">↪ next day</span>
                      )}
                    </>
                  ) : "–"}
                </span>
              </div>
            );
          };

          return (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-serif text-2xl flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Opening Hours
                </h2>
                <div className="flex items-center gap-3">
                  {todayTimes && (
                    <span className="hidden sm:block text-sm text-muted-foreground tabular-nums">
                      Today: <span className="text-foreground font-medium">{fmt(todayTimes.open)} – {fmt(todayTimes.close)}</span>
                    </span>
                  )}
                  {isOpenNow ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                      Open now
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
                      Closed now
                    </span>
                  )}
                </div>
              </div>

              {todayTimes && (
                <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
                  <Clock className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm text-muted-foreground">
                    Today ({DAY_FULL[todayKey]}):
                  </span>
                  <span className="font-semibold text-primary tabular-nums">
                    {fmt(todayTimes.open)} – {fmt(todayTimes.close)}
                    {toMin(todayTimes.close) < toMin(todayTimes.open) && (
                      <span className="ml-1.5 text-xs text-muted-foreground font-normal">↪ next day</span>
                    )}
                  </span>
                  <span className="ml-auto">
                    {isOpenNow ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                        Open now
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                        Closed now
                      </span>
                    )}
                  </span>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-1.5">
                <div className="space-y-0.5">
                  {leftDays.map((day) => <DayRow key={day} day={day} />)}
                </div>
                <div className="space-y-0.5">
                  {rightDays.map((day) => <DayRow key={day} day={day} />)}
                </div>
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

        {vendor.address && (
          <section>
            <h2 className="font-serif text-2xl mb-4 flex items-center gap-2">
              <Navigation className="h-5 w-5 text-primary" />
              Find us
            </h2>
            <iframe
              title="Venue location"
              src={`https://maps.google.com/maps?q=${encodeURIComponent(vendor.address)}&output=embed&hl=en`}
              className="w-full h-64 md:h-80 rounded-2xl border border-white/10"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(vendor.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <Navigation className="h-3.5 w-3.5" />
              {vendor.address} — Open in Google Maps ↗
            </a>
          </section>
        )}

        {pubEventTypes.length > 0 && (
          <section>
            <h2 className="font-serif text-2xl mb-4">What we host</h2>
            <div className="flex flex-wrap gap-2">
              {pubEventTypes.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary"
                >
                  {t}
                </span>
              ))}
            </div>
          </section>
        )}

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
