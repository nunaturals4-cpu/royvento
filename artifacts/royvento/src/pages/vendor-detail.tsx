import { useEffect, useRef, useState } from "react";
import { todayIst } from "@/lib/utils";
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
import {
  Star, MapPin, Navigation, Clock, GlassWater, Music2, Utensils, Bell,
  Heart, ChevronLeft, ChevronRight, X, ImagePlus, Users, Calendar,
  Camera, Tag, Phone, User, CalendarDays, CheckCircle2, Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { uploadImage, validateImageFile } from "@/lib/uploadImage";
import { useToast } from "@/hooks/use-toast";
import { OfferCard, type VendorOffer as VendorOfferData } from "@/components/OfferCard";
import { formatDayRanges } from "@/lib/days";

function TodaysOffers({ vendorId }: { vendorId: number }) {
  const [offers, setOffers] = useState<VendorOfferData[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const load = () => {
      apiGet<VendorOfferData[]>(`/api/vendors/${vendorId}/offers`)
        .then((rows) => { if (alive) { setOffers(rows); setLoading(false); } })
        .catch(() => { if (alive) setLoading(false); });
    };
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [vendorId]);

  if (loading || offers.length === 0) return null;

  const food = offers.filter((o) => o.category === "food");
  const drink = offers.filter((o) => o.category === "drink");

  const renderGroup = (label: string, items: VendorOfferData[], Icon: typeof Utensils) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-amber-300" />
          <h3 className="font-serif text-lg">{label}</h3>
          <span className="text-xs text-muted-foreground">({items.length} live)</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {items.map((o) => (
            <OfferCard key={o.id} offer={o} variant="customer" />
          ))}
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-serif text-2xl flex items-center gap-2">
          <Tag className="h-5 w-5 text-amber-300" /> Today&apos;s Offers
        </h2>
        <p className="text-xs text-muted-foreground mt-1">Live deals at this venue — apply at the bar.</p>
      </div>
      {renderGroup("Food", food, Utensils)}
      {renderGroup("Drinks", drink, GlassWater)}
    </section>
  );
}

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

const TABS = [
  { key: "overview",    label: "Overview" },
  { key: "happyHours", label: "Happy Hours" },
  { key: "reviews",    label: "Reviews" },
  { key: "photos",     label: "Photos" },
  { key: "book",       label: "Book a Table" },
] as const;

type TabKey = typeof TABS[number]["key"];

const DAY_FULL: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
  Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};
const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const tabBarRef = useRef<HTMLDivElement>(null);

  // Book a Table form state
  const [bookName, setBookName] = useState("");
  const [bookPhone, setBookPhone] = useState("");
  const [bookDate, setBookDate] = useState("");
  const [bookOccasion, setBookOccasion] = useState("other");
  const [bookGuestType, setBookGuestType] = useState("couple");
  const [bookGuestCount, setBookGuestCount] = useState(2);
  const [bookNotes, setBookNotes] = useState("");
  const [bookLoading, setBookLoading] = useState(false);
  const [bookSuccess, setBookSuccess] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiGet<DrinkPlan[]>(`/api/vendors/${id}/drink-plans`).then(setDrinkPlans).catch(() => {});
    apiGet<Announcement[]>(`/api/vendors/${id}/announcements`).then(setAnnouncements).catch(() => {});
  }, [id]);

  const lastTrackedVendorIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!id || !vendor) return;
    if (me?.user && vendor.userId === me.user.id) return;
    if (lastTrackedVendorIdRef.current === id) return;
    lastTrackedVendorIdRef.current = id;
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
  const menuImages: string[] = ((vendor as unknown as { menuUrls?: string[] }).menuUrls ?? []).filter(Boolean);
  const maxCapacity = (vendor as Vendor & { maxCapacity?: number; maxGuests?: number }).maxCapacity
    ?? (vendor as Vendor & { maxCapacity?: number; maxGuests?: number }).maxGuests;

  type PubEventExt = {
    freeEntry?: boolean; freeEntryRules?: string;
    ladiesFreeEntry?: boolean; freeEntryLabel?: string;
  };
  const extPubEvent = pubEvent as (typeof pubEvent & PubEventExt) | undefined;

  const inWishlist = pubEvent ? wishlistItems.some((w) => w.id === pubEvent.id) : false;
  const addToWishlist = () => {
    if (!me?.user) { setLocation("/login"); return; }
    if (!pubEvent) return;
    qc.setQueryData<{ id: number }[]>(["wishlist"], (old = []) => [...old, { id: pubEvent.id }]);
    apiPost("/api/wishlist", { eventId: pubEvent.id })
      .then(() => { qc.invalidateQueries({ queryKey: ["wishlist"] }); toast({ title: "Added to wishlist" }); })
      .catch(() => { qc.invalidateQueries({ queryKey: ["wishlist"] }); toast({ title: "Could not add to wishlist", variant: "destructive" }); });
  };
  const removeFromWishlist = () => {
    if (!pubEvent) return;
    qc.setQueryData<{ id: number }[]>(["wishlist"], (old = []) => old.filter((w) => w.id !== pubEvent.id));
    apiDelete(`/api/wishlist/${pubEvent.id}`)
      .then(() => { qc.invalidateQueries({ queryKey: ["wishlist"] }); toast({ title: "Removed from wishlist" }); })
      .catch(() => qc.invalidateQueries({ queryKey: ["wishlist"] }));
  };

  const fmtTime = (hhmm: string) => {
    if (!hhmm) return "";
    const [h, m] = hhmm.split(":").map(Number);
    const suffix = h < 12 ? "AM" : "PM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
  };
  const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

  const hours = vendor.dayHours as Record<string, { open: string; close: string } | null> | null;
  const hasDayHours = !!hours && DAY_ORDER.some((d) => d in hours);
  const todayKey = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
  const todayTimes = hours?.[todayKey] ?? null;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  let isOpenNow = false;
  if (todayTimes) {
    const openMin = toMin(todayTimes.open);
    const closeMin = toMin(todayTimes.close);
    isOpenNow = closeMin < openMin ? nowMin >= openMin || nowMin < closeMin : nowMin >= openMin && nowMin < closeMin;
  }

  const switchTab = (tab: TabKey) => {
    setActiveTab(tab);
    requestAnimationFrame(() => tabBarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const handleBookSubmit = async () => {
    if (!pubEvent) return;
    if (!bookName.trim() || !bookPhone.trim() || !bookDate) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    setBookLoading(true);
    try {
      await apiPost(`/api/events/${pubEvent.id}/bookings`, {
        name: bookName, phone: bookPhone, date: bookDate,
        occasion: bookOccasion, guestType: bookGuestType,
        guestCount: bookGuestCount, notes: bookNotes,
      });
      setBookSuccess(true);
      toast({ title: "Table booked!", description: "We'll confirm your booking shortly." });
    } catch {
      setLocation(`/events/${pubEvent.id}#book`);
    } finally {
      setBookLoading(false);
    }
  };

  // SEO
  const vendorCity = vendor.city || "";
  const vendorTitle = `${vendor.businessName}${vendor.location ? `, ${vendor.location}` : vendorCity ? `, ${vendorCity}` : ""} — Book a Table | Royvento`;
  const vendorDesc = `Book a table at ${vendor.businessName}${vendor.location ? `, ${vendor.location}` : ""}${vendorCity ? `, ${vendorCity}` : ""}. ${vendor.category ? `${vendor.category}. ` : ""}${vendor.description ? vendor.description.slice(0, 140) : "Verified by Royvento."}`.slice(0, 200);
  const vendorOgImage = vendor.coverImageUrl || vendor.bannerImage || (vendor.portfolioImages?.[0] ?? "");
  const vendorJsonLd: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org", "@type": "BarOrPub",
      name: vendor.businessName, description: vendor.description,
      image: [vendorOgImage].filter(Boolean),
      address: { "@type": "PostalAddress", streetAddress: vendor.address || vendor.location || undefined, addressLocality: vendor.city, addressRegion: vendor.state, addressCountry: vendor.country },
      ...(vendor.menuUrl ? { hasMenu: vendor.menuUrl } : {}),
      ...((vendor.rating ?? 0) > 0 && (vendor.reviewCount ?? 0) > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: vendor.rating, reviewCount: vendor.reviewCount } } : {}),
    },
    buildBreadcrumbList([
      { name: "Home", url: "/" },
      { name: "Partners", url: "/partners" },
      { name: vendor.businessName, url: `/vendors/${vendor.id}` },
    ]),
  ];
  if (reviews.length > 0) {
    vendorJsonLd.push(...reviews.slice(0, 5).map((r) => ({
      "@context": "https://schema.org", "@type": "Review",
      itemReviewed: { "@type": "BarOrPub", name: vendor.businessName },
      reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
      author: { "@type": "Person", name: r.userName || "Royvento user" },
      reviewBody: r.comment || "",
    })));
  }

  const DayRow = ({ day }: { day: string }) => {
    if (!hours) return null;
    const times = hours[day] ?? null;
    const isToday = day === todayKey;
    const isOvernight = times ? toMin(times.close) < toMin(times.open) : false;
    return (
      <div className={["flex justify-between items-center px-4 py-3 text-sm rounded-lg transition-colors", isToday ? "bg-primary/10 ring-1 ring-primary/20 border-l-[3px] border-primary" : "hover:bg-white/3"].join(" ")}>
        <span className="flex items-center gap-2.5 min-w-0">
          <span className={["h-2 w-2 rounded-full shrink-0", times ? "bg-emerald-500" : "bg-muted-foreground/30"].join(" ")} />
          <span className={["font-medium truncate", isToday ? "text-primary" : ""].join(" ")}>{DAY_FULL[day]}</span>
          {isToday && <span className="shrink-0 text-[10px] font-semibold text-primary/70 uppercase tracking-wider border border-primary/30 rounded px-1 py-px">today</span>}
        </span>
        <span className={["ml-3 shrink-0 tabular-nums", times ? isToday ? "font-semibold text-primary" : "text-foreground" : "text-muted-foreground/50 text-xs"].join(" ")}>
          {times ? (<>{fmtTime(times.open)} – {fmtTime(times.close)}{isOvernight && <span className="ml-1 text-muted-foreground/50 text-[10px]">↪ next day</span>}</>) : "–"}
        </span>
      </div>
    );
  };

  return (
    <div>
      <SEO
        title={vendorTitle} description={vendorDesc}
        canonical={pubDetailSlug({ id: vendor.id, name: vendor.businessName, city: vendor.city })}
        ogImage={vendorOgImage} ogType="business.business" jsonLd={vendorJsonLd}
      />

      {/* ── Hero ── */}
      <div className="relative h-[420px] md:h-[560px] w-full overflow-hidden">
        {(vendor.coverImageUrl || vendor.bannerImage) ? (
          <div className="absolute inset-0">
            <img src={vendor.coverImageUrl || vendor.bannerImage} alt={vendor.businessName} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-stone-900 to-black">
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, rgba(244,63,94,0.25), transparent 40%), radial-gradient(circle at 80% 70%, rgba(217,119,6,0.18), transparent 45%)" }} aria-hidden />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <GlassWater className="h-32 w-32 md:h-40 md:w-40 text-white/5" />
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none" />

        <button
          onClick={() => inWishlist ? removeFromWishlist() : addToWishlist()}
          className="absolute top-4 right-4 h-9 w-9 rounded-full bg-black/55 border border-white/15 flex items-center justify-center hover:bg-black/75 transition-colors z-10"
          aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
        >
          <Heart className={`h-4 w-4 transition-colors ${inWishlist ? "fill-primary text-primary" : "text-white"}`} />
        </button>

        <div className="absolute bottom-0 left-0 right-0 px-5 md:px-10 pb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium text-white tracking-wide">Pub</span>
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
              return c ? <span className={`inline-flex items-center px-2.5 py-1 rounded-full ${c.bg} border border-white/20 text-xs font-semibold text-white`}>{c.label}</span> : null;
            })()}
            {isOpenNow
              ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-600/80 border border-white/20 text-xs font-semibold text-white"><span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse inline-block" />Open now</span>
              : null
            }
          </div>
          <h1 className="font-serif text-4xl md:text-6xl tracking-tight leading-tight text-white">{vendor.businessName}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 text-sm">
            <Link href="/pubs" className="text-white/55 hover:text-white/80 transition-colors">
              by <span className="text-white/75">{(vendor as Vendor & { partnerName?: string }).partnerName || vendor.businessName}</span>
            </Link>
            {vendor.location && (
              <span className="flex items-center gap-1.5 text-white/55">
                <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />{vendor.location}
              </span>
            )}
            {vendor.address && (
              <a href={`https://maps.google.com/?q=${encodeURIComponent(vendor.address)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline">
                <Navigation className="h-3.5 w-3.5 shrink-0" />{vendor.address}
              </a>
            )}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={() => switchTab("book")}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90 transition-colors"
            >
              <Calendar className="h-4 w-4" /> Book a Table
            </button>
            <button
              onClick={() => switchTab("reviews")}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-5 py-3 text-sm font-medium text-white hover:bg-black/60 transition-colors"
            >
              <Star className="h-3.5 w-3.5" /> Reviews
            </button>
          </div>
        </div>
      </div>

      {/* ── Announcements Strip ── */}
      {announcements.length > 0 && (
        <div className="border-y border-primary/10 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 py-4">
          <div className="container mx-auto px-4 md:px-6 flex items-center gap-4">
            <button
              onClick={() => switchTab("happyHours")}
              className="shrink-0 flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-widest hover:text-primary/80 transition-colors"
            >
              <GlassWater className="h-3.5 w-3.5" /> Today's Deals ↗
            </button>
            <div className="flex gap-3 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {announcements.map((a) => (
                <div key={a.id} className="shrink-0 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 min-w-[160px] max-w-[220px] space-y-1">
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-500 uppercase tracking-wider"><Bell className="h-3 w-3" /> Announcement</span>
                  <span className="block text-sm font-medium text-foreground line-clamp-2">{a.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky Tab Bar ── */}
      <div ref={tabBarRef} className="sticky top-[68px] z-30 bg-background/95 backdrop-blur-md border-b border-border shadow-sm">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "px-5 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-all duration-200 shrink-0",
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
                ].join(" ")}
              >
                {tab.label}
                {tab.key === "reviews" && reviewsTotal > 0 && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">({reviewsTotal})</span>
                )}
                {tab.key === "happyHours" && drinkPlans.length > 0 && (
                  <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{drinkPlans.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="container mx-auto px-4 md:px-6 py-10">

        {/* ══ OVERVIEW ══ */}
        {activeTab === "overview" && (
          <div className="space-y-12">
            {/* "About"/description section removed to keep the pub listing page
                concise and scannable (clutter reduction). */}

            <section>
              <h2 className="font-serif text-2xl mb-4">Venue Info</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {vendor.location && (
                  <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-card px-5 py-4">
                    <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Location</p>
                      <p className="text-sm font-medium">{vendor.location}</p>
                      {vendor.city && <p className="text-xs text-muted-foreground mt-0.5">{vendor.city}{vendor.state ? `, ${vendor.state}` : ""}</p>}
                    </div>
                  </div>
                )}
                {maxCapacity && (
                  <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-card px-5 py-4">
                    <Users className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Max Capacity</p>
                      <p className="text-sm font-medium">{maxCapacity.toLocaleString()} guests</p>
                    </div>
                  </div>
                )}
                {vendor.category && (
                  <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-card px-5 py-4">
                    <Tag className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Category</p>
                      <p className="text-sm font-medium">{vendor.category}</p>
                    </div>
                  </div>
                )}
                {danceFloor && (
                  <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-card px-5 py-4">
                    <Music2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Dance Floor</p>
                      <p className="text-sm font-medium">
                        {danceFloor === "dedicated" ? "Dedicated dance floor" : danceFloor === "general" ? "Dancing in main area" : "No dancing / seated only"}
                      </p>
                    </div>
                  </div>
                )}
                {todayTimes && (
                  <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-card px-5 py-4">
                    <Clock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Today's Hours</p>
                      <p className="text-sm font-medium">{fmtTime(todayTimes.open)} – {fmtTime(todayTimes.close)}</p>
                      {isOpenNow
                        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-500 mt-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />Open now</span>
                        : <span className="text-xs text-destructive mt-1 inline-block">Closed now</span>
                      }
                    </div>
                  </div>
                )}
                {pubEvent && (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => switchTab("book")}
                    onKeyDown={(e) => e.key === "Enter" && switchTab("book")}
                    className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-5 py-4 cursor-pointer hover:bg-primary/10 transition-colors"
                  >
                    <Calendar className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-primary font-medium uppercase tracking-wider mb-1">Book a Table</p>
                      <p className="text-sm font-medium">Reserve your spot →</p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {vendor.address && (
              <section>
                <h2 className="font-serif text-2xl mb-4 flex items-center gap-2">
                  <Navigation className="h-5 w-5 text-primary" />Find us
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
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <Navigation className="h-3.5 w-3.5" />{vendor.address} — Open in Google Maps ↗
                </a>
              </section>
            )}

            {hasDayHours && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-serif text-2xl flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />Opening Hours
                  </h2>
                  <div className="flex items-center gap-3">
                    {todayTimes && (
                      <span className="hidden sm:block text-sm text-muted-foreground tabular-nums">
                        Today: <span className="text-foreground font-medium">{fmtTime(todayTimes.open)} – {fmtTime(todayTimes.close)}</span>
                      </span>
                    )}
                    {isOpenNow
                      ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />Open now</span>
                      : <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">Closed now</span>
                    }
                  </div>
                </div>
                {todayTimes && (
                  <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
                    <Clock className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm text-muted-foreground">Today ({DAY_FULL[todayKey]}):</span>
                    <span className="font-semibold text-primary tabular-nums">
                      {fmtTime(todayTimes.open)} – {fmtTime(todayTimes.close)}
                      {toMin(todayTimes.close) < toMin(todayTimes.open) && <span className="ml-1.5 text-xs text-muted-foreground font-normal">↪ next day</span>}
                    </span>
                    <span className="ml-auto">
                      {isOpenNow
                        ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />Open now</span>
                        : <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">Closed now</span>
                      }
                    </span>
                  </div>
                )}
                <div className="grid md:grid-cols-2 gap-1.5">
                  <div className="space-y-0.5">{DAY_ORDER.slice(0, 4).map((day) => <DayRow key={day} day={day} />)}</div>
                  <div className="space-y-0.5">{DAY_ORDER.slice(4).map((day) => <DayRow key={day} day={day} />)}</div>
                </div>
              </section>
            )}

            {!hasDayHours && vendor.openDays && vendor.openDays.length > 0 && (
              <section>
                <h2 className="font-serif text-2xl mb-3 flex items-center gap-2"><Clock className="h-5 w-5 text-primary" />Open Days</h2>
                <p className="text-muted-foreground">{vendor.openDays.join(", ")}</p>
              </section>
            )}

            {pubEventTypes.length > 0 && (
              <section>
                <h2 className="font-serif text-2xl mb-4">What we host</h2>
                <div className="flex flex-wrap gap-2">
                  {pubEventTypes.map((t) => (
                    <span key={t} className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">{t}</span>
                  ))}
                </div>
              </section>
            )}

            {events.filter((e) => e.type !== "pub").length > 0 && (
              <section>
                <h2 className="font-serif text-2xl mb-5">Events by {vendor.businessName}</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {events.filter((e) => e.type !== "pub").map((e) => <EventCard key={e.id} event={e} />)}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ══ HAPPY HOURS ══ */}
        {activeTab === "happyHours" && (
          <div className="space-y-10">
            <section>
              <h2 className="font-serif text-2xl mb-6 flex items-center gap-2">
                <Ticket className="h-5 w-5 text-primary" />Free Entry
              </h2>
              {(extPubEvent?.freeEntry || extPubEvent?.ladiesFreeEntry || extPubEvent?.freeEntryLabel || extPubEvent?.freeEntryRules) ? (
                <div className="space-y-3">
                  {extPubEvent?.freeEntryLabel && (
                    <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                      <p className="font-semibold text-emerald-400">{extPubEvent.freeEntryLabel}</p>
                    </div>
                  )}
                  {extPubEvent?.ladiesFreeEntry && (
                    <div className="flex items-center gap-3 rounded-xl border border-pink-500/30 bg-pink-500/5 px-5 py-4">
                      <CheckCircle2 className="h-5 w-5 text-pink-400 shrink-0" />
                      <p className="font-semibold text-pink-400">Free Entry for Ladies</p>
                    </div>
                  )}
                  {extPubEvent?.freeEntry && !extPubEvent?.freeEntryLabel && (
                    <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                      <p className="font-semibold text-emerald-400">Free Entry Available</p>
                    </div>
                  )}
                  {extPubEvent?.freeEntryRules && (
                    <div className="rounded-xl border border-white/10 bg-card px-5 py-4">
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Entry Rules</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{extPubEvent.freeEntryRules}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-card/50 px-5 py-10 text-center">
                  <Ticket className="h-9 w-9 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No free entry information available for this venue.</p>
                </div>
              )}
            </section>

            <TodaysOffers vendorId={vendor.id} />

            <section>
              <h2 className="font-serif text-2xl mb-6 flex items-center gap-2">
                <GlassWater className="h-5 w-5 text-primary" />Drinks &amp; Deals
              </h2>
              {drinkPlans.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-card/50 px-5 py-10 text-center">
                  <GlassWater className="h-9 w-9 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No drink deals at this time.</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {drinkPlans.map((plan) => (
                    <div key={plan.id} className="rounded-xl border border-white/10 bg-card px-5 py-4 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                          {PLAN_TYPE_LABELS[plan.type] ?? plan.type}
                        </span>
                        {plan.gender === "female" && (
                          <span className="rounded-full bg-pink-500/10 border border-pink-500/20 px-2 py-0.5 text-[10px] text-pink-400 font-medium">Ladies only</span>
                        )}
                        {plan.gender === "all" && (plan.type === "welcome" || plan.type === "unlimited") && (
                          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-400 font-medium">All guests</span>
                        )}
                        {plan.price > 0 && (
                          <span className="rounded-full bg-white/5 text-muted-foreground border border-white/10 px-2 py-0.5 text-[10px] font-medium">₹{(plan.price / 100).toFixed(0)}</span>
                        )}
                      </div>
                      {(!plan.lineItems || plan.lineItems.length === 0) && plan.productName && plan.type !== "welcome" && plan.type !== "unlimited" && (
                        <p className="text-sm font-semibold">{plan.productName}</p>
                      )}
                      {plan.lineItems && plan.lineItems.length > 0 && (
                        <ul className="space-y-1 mt-1">
                          {plan.lineItems.map((item, i) => (
                            <li key={i} className="flex items-center gap-3 text-sm">
                              <span className="font-medium">{item.name}</span>
                              {item.discountedPrice > 0 ? <span className="text-xs text-emerald-400">₹{item.discountedPrice}</span> : <span className="text-xs text-emerald-400">Free</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {(plan.timeFrom || plan.timeTo || true) && (
                        <div className="flex flex-wrap gap-1.5">
                          {formatDayRanges(plan.days ?? []).split(", ").map((range) => (
                            <span key={range} className="rounded-md bg-black/40 border border-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">{range}</span>
                          ))}
                          {(plan.timeFrom || plan.timeTo) && (
                            <span className="rounded-md bg-black/40 border border-white/15 px-2 py-0.5 text-[10px] font-semibold text-white flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5 shrink-0" />
                              {[plan.timeFrom ? fmtTime(plan.timeFrom) : null, plan.timeTo ? fmtTime(plan.timeTo) : null].filter(Boolean).join(" – ")}
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
              )}
            </section>
          </div>
        )}

        {/* ══ REVIEWS ══ */}
        {activeTab === "reviews" && (
          <div className="space-y-8">
            {vendor.rating > 0 && (
              <div className="flex items-center gap-6 p-6 rounded-2xl border border-white/10 bg-card">
                <div className="text-center px-4">
                  <p className="text-5xl font-bold text-primary tabular-nums">{vendor.rating.toFixed(1)}</p>
                  <div className="flex items-center justify-center gap-0.5 mt-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-4 w-4 ${i < Math.round(vendor.rating) ? "fill-primary text-primary" : "text-muted-foreground/30"}`} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{vendor.reviewCount} {vendor.reviewCount === 1 ? "review" : "reviews"}</p>
                </div>
              </div>
            )}

            <div>
              <h2 className="font-serif text-2xl mb-5">All Reviews</h2>
              {reviewsTotal === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-card/50 px-5 py-10 text-center">
                  <Star className="h-9 w-9 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">No reviews yet. Be the first to review!</p>
                </div>
              ) : (
                <>
                  <div className="grid md:grid-cols-2 gap-4">
                    {reviews.map((r) => (
                      <div key={r.id} className="rounded-xl border bg-card p-5">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                              {(r.userName || "U")[0].toUpperCase()}
                            </div>
                            <p className="font-medium">{r.userName}</p>
                          </div>
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "fill-primary text-primary" : "text-muted-foreground/30"}`} />
                            ))}
                          </div>
                        </div>
                        {r.comment && <p className="text-sm text-muted-foreground leading-relaxed">{r.comment}</p>}
                        {Array.isArray(r.imageUrls) && r.imageUrls.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {r.imageUrls.map((url: string, i: number) => (
                              <button key={i} type="button" onClick={() => setLightbox(url)} className="rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors" aria-label="Open review image">
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
                      <Button variant="outline" size="sm" onClick={() => setReviewsPage((p) => Math.max(1, p - 1))} disabled={reviewsPage <= 1}>
                        <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                      </Button>
                      <span className="text-sm text-muted-foreground">Page {reviewsPage} of {reviewsTotalPages}</span>
                      <Button variant="outline" size="sm" onClick={() => setReviewsPage((p) => Math.min(reviewsTotalPages, p + 1))} disabled={reviewsPage >= reviewsTotalPages}>
                        Next <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>

            {me?.user ? (
              <div className="rounded-xl border bg-card p-6 space-y-4">
                <p className="font-serif text-xl">Leave a review</p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setReviewRating(n)}>
                      <Star className={`h-7 w-7 transition-colors ${n <= reviewRating ? "fill-primary text-primary" : "text-muted-foreground hover:text-primary/50"}`} />
                    </button>
                  ))}
                  <span className="ml-2 text-sm text-muted-foreground">{reviewRating} / 5</span>
                </div>
                <Textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Share your experience…" className="min-h-[100px]" />
                <div className="space-y-2">
                  {reviewImages.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {reviewImages.map((url, i) => (
                        <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
                          <img src={url} alt="" className="w-full h-full object-cover" />
                          <button type="button" onClick={() => setReviewImages((prev) => prev.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black" aria-label="Remove image">
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
                        type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden"
                        disabled={reviewUploading || reviewImages.length >= 5}
                        onChange={async (e) => {
                          const files = e.target.files; e.target.value = "";
                          if (!files || files.length === 0) return;
                          const remaining = 5 - reviewImages.length;
                          if (remaining <= 0) { toast({ title: "Maximum 5 images", variant: "destructive" }); return; }
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
                          } finally { setReviewUploading(false); }
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
                          setReviewComment(""); setReviewImages([]); setReviewsPage(1); refetchReviews();
                        },
                        onError: (e: unknown) => {
                          const msg = e instanceof Error ? e.message : "Please try again.";
                          const isDup = /already_reviewed|already reviewed/i.test(msg);
                          toast({ title: isDup ? "You've already reviewed this pub" : "Could not post review", description: msg, variant: "destructive" });
                        },
                      },
                    );
                  }}
                >
                  Post review
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/15 bg-card/50 px-5 py-10 text-center">
                <Star className="h-9 w-9 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-3">Sign in to leave a review</p>
                <Button variant="outline" size="sm" onClick={() => setLocation("/login")}>Sign in</Button>
              </div>
            )}
          </div>
        )}

        {/* ══ PHOTOS ══ */}
        {activeTab === "photos" && (
          <div className="space-y-10">
            <section>
              <h2 className="font-serif text-2xl mb-5 flex items-center gap-2">
                <Camera className="h-5 w-5 text-primary" />Gallery
              </h2>
              {vendor.portfolioImages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-card/50 px-5 py-10 text-center">
                  <Camera className="h-9 w-9 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No gallery photos yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {vendor.portfolioImages.map((src, i) => (
                    <button key={i} type="button" onClick={() => setLightbox(src)} className="group aspect-square overflow-hidden rounded-xl bg-muted hover:ring-2 hover:ring-primary/50 transition-all focus:outline-none focus:ring-2 focus:ring-primary">
                      <img src={src} alt={`${vendor.businessName} photo ${i + 1}`} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </section>

            {(vendor.danceFloorPhotos ?? []).length > 0 && (
              <section>
                <h2 className="font-serif text-2xl mb-5 flex items-center gap-2">
                  <Music2 className="h-5 w-5 text-primary" />Dance Floor
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {(vendor.danceFloorPhotos ?? []).map((url, i) => (
                    <button key={i} type="button" onClick={() => setLightbox(url)} className="group aspect-square overflow-hidden rounded-xl bg-muted hover:ring-2 hover:ring-primary/50 transition-all focus:outline-none focus:ring-2 focus:ring-primary">
                      <img src={url} alt={`Dance floor ${i + 1}`} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {menuImages.length > 0 && (
              <section>
                <h2 className="font-serif text-2xl mb-5 flex items-center gap-2">
                  <Utensils className="h-5 w-5 text-primary" />Menu
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {menuImages.map((url, i) => (
                    <button key={i} type="button" onClick={() => setLightbox(url)} className="group overflow-hidden rounded-xl bg-muted hover:ring-2 hover:ring-primary/50 transition-all focus:outline-none focus:ring-2 focus:ring-primary">
                      <img src={url} alt={`Menu page ${i + 1}`} className="w-full aspect-[3/4] object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {vendor.portfolioImages.length === 0 && (vendor.danceFloorPhotos ?? []).length === 0 && menuImages.length === 0 && (
              <div className="text-center py-16">
                <Camera className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No photos available for this venue yet.</p>
              </div>
            )}
          </div>
        )}

        {/* ══ BOOK A TABLE ══ */}
        {activeTab === "book" && (
          <div className="max-w-xl mx-auto">
            {!pubEvent ? (
              <div className="text-center py-16">
                <Calendar className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <h2 className="font-serif text-2xl mb-2">Booking Unavailable</h2>
                <p className="text-muted-foreground">Online booking is not set up for this venue yet. Please contact them directly.</p>
              </div>
            ) : bookSuccess ? (
              <div className="text-center py-16">
                <div className="h-16 w-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>
                <h2 className="font-serif text-2xl mb-2">Booking Requested!</h2>
                <p className="text-muted-foreground mb-6">
                  Your table request has been sent to <span className="text-foreground font-medium">{vendor.businessName}</span>. They'll confirm shortly via phone.
                </p>
                <Button variant="outline" onClick={() => setBookSuccess(false)}>Make another booking</Button>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <h2 className="font-serif text-3xl mb-1">Book a Table</h2>
                  <p className="text-muted-foreground">Reserve your spot at {vendor.businessName}</p>
                </div>

                <div className="space-y-5">
                  {/* Date */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">
                      Date <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <input
                        type="date"
                        value={bookDate}
                        min={todayIst()}
                        onChange={(e) => setBookDate(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Guest type */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Guest Type</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { value: "women", label: "Women" },
                        { value: "men", label: "Men" },
                        { value: "couple", label: "Couple" },
                        { value: "group", label: "Group" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setBookGuestType(opt.value)}
                          className={[
                            "py-2.5 rounded-lg border text-sm font-medium transition-colors",
                            bookGuestType === opt.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-input text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
                          ].join(" ")}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Guest count */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Number of Guests</label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setBookGuestCount((n) => Math.max(1, n - 1))}
                        className="h-10 w-10 rounded-lg border border-input flex items-center justify-center hover:bg-muted transition-colors text-xl font-medium select-none"
                      >−</button>
                      <span className="w-12 text-center font-semibold text-lg tabular-nums">{bookGuestCount}</span>
                      <button
                        type="button"
                        onClick={() => setBookGuestCount((n) => Math.min(maxCapacity ?? 200, n + 1))}
                        className="h-10 w-10 rounded-lg border border-input flex items-center justify-center hover:bg-muted transition-colors text-xl font-medium select-none"
                      >+</button>
                      {maxCapacity && <span className="text-xs text-muted-foreground">Max {maxCapacity}</span>}
                    </div>
                  </div>

                  {/* Name & Phone */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">
                        Full Name <span className="text-destructive">*</span>
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          value={bookName}
                          onChange={(e) => setBookName(e.target.value)}
                          placeholder="Your name"
                          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">
                        Phone <span className="text-destructive">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <input
                          type="tel"
                          value={bookPhone}
                          onChange={(e) => setBookPhone(e.target.value)}
                          placeholder="+91 98765 43210"
                          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Occasion */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Occasion</label>
                    <select
                      value={bookOccasion}
                      onChange={(e) => setBookOccasion(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    >
                      <option value="other">Just hanging out</option>
                      <option value="birthday">Birthday</option>
                      <option value="anniversary">Anniversary</option>
                      <option value="date">Date Night</option>
                      <option value="corporate">Corporate / Work</option>
                      <option value="bachelorette">Bachelorette / Stag</option>
                      <option value="gathering">Get-together</option>
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Special Requests</label>
                    <Textarea
                      value={bookNotes}
                      onChange={(e) => setBookNotes(e.target.value)}
                      placeholder="Any special requests, dietary requirements, or notes…"
                      className="min-h-[80px]"
                    />
                  </div>

                  <Button
                    className="w-full py-6 text-base font-semibold rounded-xl"
                    disabled={bookLoading || !bookName.trim() || !bookPhone.trim() || !bookDate}
                    onClick={handleBookSubmit}
                  >
                    {bookLoading ? "Sending request…" : "Confirm Booking"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    You'll receive confirmation via phone. By booking you agree to the venue's terms.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)} role="dialog" aria-modal="true">
          <button type="button" onClick={(e) => { e.stopPropagation(); setLightbox(null); }} className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
