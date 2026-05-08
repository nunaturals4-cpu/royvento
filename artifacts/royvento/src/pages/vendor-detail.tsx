import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { SEO, buildBreadcrumbList } from "@/components/SEO";
import { pubDetailSlug } from "@/lib/seo-slug";
import {
  getGetVendorQueryOptions,
  useListVendorReviews,
  useListEvents,
  useGetMe,
  useCreateReview,
} from "@workspace/api-client-react";
import type { Vendor } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EventCard } from "@/components/EventCard";
import { Star, MapPin, Navigation, Clock, GlassWater, Music2, Utensils, Bell, Heart, ChevronLeft, ChevronRight, X, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { uploadImage, validateImageFile } from "@/lib/uploadImage";
import { useToast } from "@/hooks/use-toast";

interface Announcement {
  id: number;
  title: string;
  body: string;
  announceDate: string;
  announceTime: string;
  imageUrl: string;
}

interface DrinkPlanLineItem { name: string; qty: number; discountedPrice: number; }

interface DrinkPlan {
  id: number; type: string; productName: string; gender: string;
  price: number; days: string[]; timeFrom: string; timeTo: string; description: string;
  lineItems?: DrinkPlanLineItem[] | null;
  drinksOfferLabel?: string;
  foodDiscountLabel?: string;
  validUntil?: string | null;
}

const PLAN_TYPE_LABELS: Record<string, string> = {
  welcome: "Welcome Drink",
  unlimited: "Unlimited Drinks",
  ticket: "Included with Ticket",
  custom: "Custom Package",
};

export function VendorDetail({ vendorIdProp }: { vendorIdProp?: number } = {}) {
  const params = useParams();
  const rawIdParam = vendorIdProp ?? Number(params["id"]);
  const idValid = Number.isFinite(rawIdParam) && rawIdParam > 0;
  const id = idValid ? rawIdParam : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: me } = useGetMe();
  const vendorQueryOptions = getGetVendorQueryOptions(id);
  const { data: vendor, isLoading, isFetching, isError } = useQuery({
    ...vendorQueryOptions,
    enabled: idValid,
  });
  const REVIEWS_PAGE_SIZE = 5;
  const [reviewsPage, setReviewsPage] = useState(1);
  useEffect(() => { setReviewsPage(1); }, [id]);
  const { data: reviewsData, refetch: refetchReviews } = useListVendorReviews(id, { page: reviewsPage, pageSize: REVIEWS_PAGE_SIZE });
  const reviews = reviewsData?.items ?? [];
  const reviewsTotal = reviewsData?.total ?? 0;
  const reviewsTotalPages = Math.max(1, Math.ceil(reviewsTotal / REVIEWS_PAGE_SIZE));
  const createReview = useCreateReview();
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [reviewUploading, setReviewUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const { data: allEvents = [] } = useListEvents();
  const [drinkPlans, setDrinkPlans] = useState<DrinkPlan[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!id) return;
    apiGet<DrinkPlan[]>(`/api/vendors/${id}/drink-plans`)
      .then(setDrinkPlans)
      .catch(() => {});
    apiGet<Announcement[]>(`/api/vendors/${id}/announcements`)
      .then(setAnnouncements)
      .catch(() => {});
  }, [id]);

  // Track this profile view for the partner's leads/CRM. We skip the call
  // when the visitor IS the partner who owns this pub (no point logging
  // self-views in their own leads list). Guarded by sessionStorage so a
  // single tab session only counts once per pub even with React StrictMode
  // double-mounts or quick remounts.
  useEffect(() => {
    if (!id || !vendor) return;
    // `vendor` is the generated Vendor schema (already includes `userId`).
    // Self-skip is also enforced server-side as defense in depth against
    // auth-load races where `me` resolves after the page mounts.
    if (me?.user && vendor.userId === me.user.id) return;
    const storageKey = `royvento:viewed:${id}`;
    try {
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, "1");
    } catch { /* private mode etc — fall through and still POST */ }
    apiPost(`/api/partners/${id}/view`, {}).catch(() => {});
  }, [id, vendor, me?.user?.id]);

  const { data: wishlistItems = [] } = useQuery<{ id: number }[]>({
    queryKey: ["wishlist"],
    queryFn: () => apiGet<{ id: number }[]>("/api/wishlist"),
    enabled: !!me?.user,
  });

  if (!idValid) return <div className="container mx-auto px-4 py-20">Invalid pub link.</div>;
  if (isLoading || (isFetching && !vendor && !isError)) return <div className="container mx-auto px-4 py-20">Loading…</div>;
  if (!vendor) {
    if (isError) return <div className="container mx-auto px-4 py-20">Couldn't load this pub. Please try again.</div>;
    return <div className="container mx-auto px-4 py-20">Pub not found.</div>;
  }

  const events = allEvents.filter((e) => e.vendorId === vendor.id);
  const pubEvent = events.find((e) => e.type === "pub");
  const pubEventTypes: string[] = pubEvent?.pubEventTypes ?? [];
  const danceFloor = vendor.danceFloor;

  const inWishlist = pubEvent ? wishlistItems.some((w) => w.id === pubEvent.id) : false;
  const addToWishlist = () => {
    if (!me?.user) { setLocation("/login"); return; }
    if (!pubEvent) return;
    qc.setQueryData<{ id: number }[]>(["wishlist"], (old = []) => [...old, { id: pubEvent.id }]);
    apiPost("/api/wishlist", { eventId: pubEvent.id })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["wishlist"] });
        toast({ title: "Added to wishlist" });
      })
      .catch(() => {
        qc.invalidateQueries({ queryKey: ["wishlist"] });
        toast({ title: "Could not add to wishlist", variant: "destructive" });
      });
  };
  const removeFromWishlist = () => {
    if (!pubEvent) return;
    qc.setQueryData<{ id: number }[]>(["wishlist"], (old = []) => old.filter((w) => w.id !== pubEvent.id));
    apiDelete(`/api/wishlist/${pubEvent.id}`)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["wishlist"] });
        toast({ title: "Removed from wishlist" });
      })
      .catch(() => qc.invalidateQueries({ queryKey: ["wishlist"] }));
  };

  const fmtTime = (hhmm: string) => {
    if (!hhmm) return "";
    const [h, m] = hhmm.split(":").map(Number);
    const suffix = h < 12 ? "AM" : "PM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
  };

  const vendorCity = vendor.city || "";
  const vendorTitle = `${vendor.businessName}${vendor.location ? `, ${vendor.location}` : vendorCity ? `, ${vendorCity}` : ""} — Book a Table | Royvento`;
  const vendorDesc = `Book a table at ${vendor.businessName}${vendor.location ? `, ${vendor.location}` : ""}${vendorCity ? `, ${vendorCity}` : ""}. ${vendor.category ? `${vendor.category}. ` : ""}${vendor.description ? vendor.description.slice(0, 140) : "Verified by Royvento."}`.slice(0, 200);
  const vendorOgImage = vendor.coverImageUrl || vendor.bannerImage || (vendor.portfolioImages?.[0] ?? "");
  const vendorJsonLd: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "BarOrPub",
      name: vendor.businessName,
      description: vendor.description,
      image: [vendorOgImage].filter(Boolean),
      address: {
        "@type": "PostalAddress",
        streetAddress: vendor.address || vendor.location || undefined,
        addressLocality: vendor.city,
        addressRegion: vendor.state,
        addressCountry: vendor.country,
      },
      ...(vendor.menuUrl ? { hasMenu: vendor.menuUrl } : {}),
      ...((vendor.rating ?? 0) > 0 && (vendor.reviewCount ?? 0) > 0
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: vendor.rating,
              reviewCount: vendor.reviewCount,
            },
          }
        : {}),
    },
    buildBreadcrumbList([
      { name: "Home", url: "/" },
      { name: "Partners", url: "/partners" },
      { name: vendor.businessName, url: `/vendors/${vendor.id}` },
    ]),
  ];
  if (reviews.length > 0) {
    vendorJsonLd.push(
      ...reviews.slice(0, 5).map((r) => ({
        "@context": "https://schema.org",
        "@type": "Review",
        itemReviewed: { "@type": "BarOrPub", name: vendor.businessName },
        reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
        author: { "@type": "Person", name: r.userName || "Royvento user" },
        reviewBody: r.comment || "",
      })),
    );
  }

  return (
    <div>
      <SEO
        title={vendorTitle}
        description={vendorDesc}
        canonical={pubDetailSlug({ id: vendor.id, name: vendor.businessName, city: vendor.city })}
        ogImage={vendorOgImage}
        ogType="business.business"
        jsonLd={vendorJsonLd}
      />
      {/* Cinematic venue hero */}
      <div className="relative h-[420px] md:h-[540px] w-full overflow-hidden">
        {/* Full-bleed cover image */}
        {(vendor.coverImageUrl || vendor.bannerImage) ? (
          <div className="absolute inset-0">
            <img
              src={vendor.coverImageUrl || vendor.bannerImage}
              alt={vendor.businessName}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-stone-900 to-black">
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 30%, rgba(244,63,94,0.25), transparent 40%), radial-gradient(circle at 80% 70%, rgba(217,119,6,0.18), transparent 45%)",
              }}
              aria-hidden
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <GlassWater className="h-32 w-32 md:h-40 md:w-40 text-white/5" />
            </div>
          </div>
        )}
        {/* Top scrim */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
        {/* Bottom scrim — deep, cinematic fade */}
        <div className="absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none" />

        {/* Wishlist heart button — top right */}
        <button
          onClick={() => inWishlist ? removeFromWishlist() : addToWishlist()}
          className="absolute top-4 right-4 h-9 w-9 rounded-full bg-black/55 border border-white/15 flex items-center justify-center hover:bg-black/75 transition-colors z-10"
          aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
        >
          <Heart className={`h-4 w-4 transition-colors ${inWishlist ? "fill-primary text-primary" : "text-white"}`} />
        </button>

        {/* Bottom-anchored venue title block */}
        <div className="absolute bottom-0 left-0 right-0 px-5 md:px-10 pb-8">
          {/* Type + rating row */}
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium text-white tracking-wide">
              Pub
            </span>
            {vendor.rating > 0 && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 border border-white/10 text-xs">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="font-semibold text-white">{vendor.rating.toFixed(1)}</span>
                <span className="text-white/50">({vendor.reviewCount} reviews)</span>
              </div>
            )}
            {(vendor as Vendor & { crowdLevel?: string | null }).crowdLevel && (() => {
              const cl = (vendor as Vendor & { crowdLevel?: string | null }).crowdLevel!;
              const cfg: Record<string, { label: string; bg: string }> = {
                low: { label: "Low Crowd", bg: "bg-green-600/80" },
                moderate: { label: "Moderate Crowd", bg: "bg-amber-500/80" },
                party: { label: "High Crowd 🔥", bg: "bg-red-600/80" },
              };
              const c = cfg[cl];
              return c ? (
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full ${c.bg} border border-white/20 text-xs font-semibold text-white`}>
                  {c.label}
                </span>
              ) : null;
            })()}
          </div>
          <h1 className="font-serif text-4xl md:text-6xl tracking-tight leading-tight text-white">{vendor.businessName}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 text-sm">
            <Link
              href="/pubs"
              className="text-white/55 hover:text-white/80 transition-colors"
            >
              by <span className="text-white/75">{(vendor as Vendor & { partnerName?: string }).partnerName || vendor.businessName}</span>
            </Link>
            {vendor.location && (
              <span className="flex items-center gap-1.5 text-white/55">
                <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                {vendor.location}
              </span>
            )}
            {vendor.address && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(vendor.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-primary hover:underline"
              >
                <Navigation className="h-3.5 w-3.5 shrink-0" />
                {vendor.address}
              </a>
            )}
            {vendor.menuUrl && (
              <a
                href={vendor.menuUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary hover:bg-primary/20 transition-colors"
              >
                View Menu
              </a>
            )}
          </div>
          {/* Primary booking CTA */}
          {pubEvent && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href={`/events/${pubEvent.id}#book`}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90 transition-colors"
              >
                Book a Table
              </Link>
              {events.filter((e) => e.type !== "pub").length > 0 && (
                <a
                  href="#events"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-5 py-3 text-sm font-medium text-white hover:bg-black/60 transition-colors"
                >
                  See upcoming events
                </a>
              )}
            </div>
          )}
        </div>
      </div>

    {/* Offers & Deals Strip */}
    {(drinkPlans.some((p) => (p.drinksOfferLabel || p.foodDiscountLabel) && (!p.validUntil || p.validUntil >= new Date().toISOString().slice(0, 10))) || announcements.length > 0) && (
      <div className="border-y border-primary/10 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 py-4">
        <div className="container mx-auto px-4 md:px-6 flex items-center gap-4">
          <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-widest">
            <GlassWater className="h-3.5 w-3.5" />
            Today's Deals
          </span>
          <div className="flex gap-3 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {drinkPlans
              .filter((p) => (p.drinksOfferLabel || p.foodDiscountLabel) && (!p.validUntil || p.validUntil >= new Date().toISOString().slice(0, 10)))
              .map((plan) => (
                <div key={plan.id} className="shrink-0 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 min-w-[160px] space-y-1">
                  <span className="block text-[10px] font-semibold text-primary uppercase tracking-wider">
                    {PLAN_TYPE_LABELS[plan.type] ?? plan.type}
                  </span>
                  {plan.drinksOfferLabel && (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <GlassWater className="h-3 w-3 text-primary shrink-0" />
                      {plan.drinksOfferLabel}
                    </span>
                  )}
                  {plan.foodDiscountLabel && (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Utensils className="h-3 w-3 text-amber-400 shrink-0" />
                      {plan.foodDiscountLabel}
                    </span>
                  )}
                </div>
              ))}
            {announcements.map((a) => (
              <div key={a.id} className="shrink-0 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 min-w-[160px] max-w-[220px] space-y-1">
                <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-500 uppercase tracking-wider">
                  <Bell className="h-3 w-3" /> Announcement
                </span>
                <span className="block text-sm font-medium text-foreground line-clamp-2">{a.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

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

        {danceFloor && (
          <section>
            <h2 className="font-serif text-2xl mb-4 flex items-center gap-2">
              <Music2 className="h-5 w-5 text-primary" />
              Dance floor
            </h2>
            <div className="flex items-center gap-3">
              {danceFloor === "dedicated" && (
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                  <Music2 className="h-4 w-4" />
                  Dedicated dance floor
                </span>
              )}
              {danceFloor === "general" && (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-foreground">
                  <Music2 className="h-4 w-4 text-muted-foreground" />
                  Dancing in main area
                </span>
              )}
              {danceFloor === "none" && (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-muted-foreground">
                  No dancing / seated only
                </span>
              )}
            </div>
            {danceFloor === "dedicated" && (vendor.danceFloorPhotos ?? []).length > 0 && (
              <div className="flex gap-3 mt-4 flex-wrap">
                {(vendor.danceFloorPhotos ?? []).map((url, i) => (
                  <div key={i} className="w-32 h-24 md:w-40 md:h-28 rounded-xl overflow-hidden border border-white/10">
                    <img src={url} alt={`Dance floor ${i + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {drinkPlans.length > 0 && (
          <section>
            <h2 className="font-serif text-2xl mb-5 flex items-center gap-2">
              <GlassWater className="h-5 w-5 text-primary" />
              Drinks &amp; Offers
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {drinkPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="rounded-xl border border-white/10 bg-card px-5 py-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                      {PLAN_TYPE_LABELS[plan.type] ?? plan.type}
                    </span>
                    {plan.gender === "female" && (
                      <span className="rounded-full bg-pink-500/10 border border-pink-500/20 px-2 py-0.5 text-[10px] text-pink-400 font-medium">
                        Ladies only
                      </span>
                    )}
                    {plan.gender === "all" && (plan.type === "welcome" || plan.type === "unlimited") && (
                      <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-400 font-medium">
                        All guests
                      </span>
                    )}
                    {plan.price > 0 && (
                      <span className="rounded-full bg-white/5 text-muted-foreground border border-white/10 px-2 py-0.5 text-[10px] font-medium">
                        ₹{(plan.price / 100).toFixed(0)}
                      </span>
                    )}
                  </div>
                  {/* Fallback: show productName for legacy plans without line items */}
                  {(!plan.lineItems || plan.lineItems.length === 0) && plan.productName && plan.type !== "welcome" && plan.type !== "unlimited" && (
                    <p className="text-sm font-semibold">{plan.productName}</p>
                  )}
                  {plan.lineItems && plan.lineItems.length > 0 && (
                    <ul className="space-y-1 mt-1">
                      {plan.lineItems.map((item, i) => (
                        <li key={i} className="flex items-center gap-3 text-sm">
                          <span className="font-medium">{item.name}</span>
                          <span className="text-muted-foreground text-xs">×{item.qty}</span>
                          {item.discountedPrice > 0
                            ? <span className="text-xs text-emerald-400">₹{item.discountedPrice}</span>
                            : <span className="text-xs text-emerald-400">Free</span>
                          }
                        </li>
                      ))}
                    </ul>
                  )}
                  {((plan.days ?? []).length > 0 || plan.timeFrom || plan.timeTo) && (
                    <div className="flex flex-wrap gap-1.5">
                      {(plan.days ?? []).map((d) => (
                        <span key={d} className="rounded-md bg-black/40 border border-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
                          {d}
                        </span>
                      ))}
                      {(plan.timeFrom || plan.timeTo) && (
                        <span className="rounded-md bg-black/40 border border-white/15 px-2 py-0.5 text-[10px] font-semibold text-white flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5 shrink-0" />
                          {[plan.timeFrom ? fmtTime(plan.timeFrom) : null, plan.timeTo ? fmtTime(plan.timeTo) : null].filter(Boolean).join(" – ")}
                        </span>
                      )}
                    </div>
                  )}
                  {(plan.drinksOfferLabel || plan.foodDiscountLabel) && (!plan.validUntil || plan.validUntil >= new Date().toISOString().slice(0, 10)) && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {plan.drinksOfferLabel && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-primary/8 border border-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                          <GlassWater className="h-3 w-3 shrink-0" />
                          {plan.drinksOfferLabel}
                        </span>
                      )}
                      {plan.foodDiscountLabel && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/8 border border-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-400">
                          <Utensils className="h-3 w-3 shrink-0" />
                          {plan.foodDiscountLabel}
                        </span>
                      )}
                    </div>
                  )}
                  {plan.description && (
                    <p className="text-xs text-muted-foreground/80 leading-relaxed">{plan.description}</p>
                  )}
                </div>
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
          <section id="events">
            <h2 className="font-serif text-2xl mb-5">Events by {vendor.businessName}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map((e) => <EventCard key={e.id} event={e} />)}
            </div>
          </section>
        )}

        <section>
          <h2 className="font-serif text-2xl mb-5">Reviews</h2>
          {reviewsTotal === 0 ? (
            <p className="text-muted-foreground">No reviews yet.</p>
          ) : (
            <>
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
                    {r.comment && (
                      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{r.comment}</p>
                    )}
                    {Array.isArray(r.imageUrls) && r.imageUrls.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {r.imageUrls.map((url: string, i: number) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setLightbox(url)}
                            className="rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors"
                            aria-label="Open review image"
                          >
                            <img src={url} alt="" loading="lazy" className="w-20 h-20 object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {reviewsTotalPages > 1 && (
                <div className="mt-5 flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReviewsPage((p) => Math.max(1, p - 1))}
                    disabled={reviewsPage <= 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {reviewsPage} of {reviewsTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReviewsPage((p) => Math.min(reviewsTotalPages, p + 1))}
                    disabled={reviewsPage >= reviewsTotalPages}
                  >
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}

          {me?.user && (
            <div className="mt-8 rounded-xl border bg-card p-6 space-y-3">
              <p className="font-serif text-xl">Leave a review</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setReviewRating(n)}>
                    <Star className={`h-6 w-6 ${n <= reviewRating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                  </button>
                ))}
              </div>
              <Textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Share your experience…"
              />
              <div className="space-y-2">
                {reviewImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {reviewImages.map((url, i) => (
                      <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setReviewImages((prev) => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
                          aria-label="Remove image"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer hover:bg-muted/50 transition-colors ${reviewUploading || reviewImages.length >= 5 ? "opacity-50 pointer-events-none" : ""}`}>
                    <ImagePlus className="h-4 w-4" />
                    <span>{reviewUploading ? "Uploading…" : reviewImages.length === 0 ? "Add photos" : "Add more"}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      multiple
                      className="hidden"
                      disabled={reviewUploading || reviewImages.length >= 5}
                      onChange={async (e) => {
                        const files = e.target.files;
                        e.target.value = "";
                        if (!files || files.length === 0) return;
                        const remaining = 5 - reviewImages.length;
                        if (remaining <= 0) {
                          toast({ title: "Maximum 5 images", variant: "destructive" });
                          return;
                        }
                        const picked = Array.from(files).slice(0, remaining);
                        setReviewUploading(true);
                        try {
                          const uploaded: string[] = [];
                          for (const f of picked) {
                            const err = validateImageFile(f);
                            if (err) { toast({ title: err, variant: "destructive" }); continue; }
                            uploaded.push(await uploadImage(f));
                          }
                          if (uploaded.length > 0) setReviewImages((prev) => [...prev, ...uploaded].slice(0, 5));
                        } catch (err: unknown) {
                          toast({ title: "Upload failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
                        } finally {
                          setReviewUploading(false);
                        }
                      }}
                    />
                  </label>
                  <span className="text-xs text-muted-foreground">{reviewImages.length}/5 · JPEG/PNG/WebP/GIF · max 8 MB each</span>
                </div>
              </div>
              <Button
                disabled={createReview.isPending || reviewUploading || !reviewComment.trim()}
                onClick={() => {
                  createReview.mutate(
                    { data: { vendorId: id, rating: reviewRating, comment: reviewComment, imageUrls: reviewImages } },
                    {
                      onSuccess: () => {
                        toast({ title: "Review posted" });
                        setReviewComment("");
                        setReviewImages([]);
                        setReviewsPage(1);
                        refetchReviews();
                      },
                      onError: (e: unknown) => {
                        const msg = e instanceof Error ? e.message : "Please try again.";
                        const isDup = /already_reviewed|already reviewed/i.test(msg);
                        toast({
                          title: isDup ? "You've already reviewed this pub" : "Could not post review",
                          description: msg,
                          variant: "destructive",
                        });
                      },
                    },
                  );
                }}
              >
                Post review
              </Button>
            </div>
          )}
        </section>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
