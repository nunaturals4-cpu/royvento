import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetEvent,
  useListEventReviews,
  useListVendorAvailability,
  useCreateReview,
  useGetMe,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { EVENT_TYPES, BUDGET_RANGES, formatINR, formatINRExact, apiPost, apiGet, apiDelete } from "@/lib/api";
import { Star, MapPin, Users, Calendar as CalIcon, Tag, Lock, Wine, Sparkle, Coins, BadgeCheck, Heart, ExternalLink, Clock, Navigation } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface Coupon { id: number; code: string; discountPercent: number; }
interface DiscountInfo { isNewUser: boolean; daysLeft: number; bookingDiscountPercent: number; subscriptionDiscountPercent: number; points: number; }

function getPlanSummary(plan: { type: string; gender: string; productName?: string; lineItems?: { name: string }[] | null }, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (plan.type === "welcome") return plan.gender === "female" ? t("events.drink_welcome_ladies") : t("events.drink_welcome_all");
  if (plan.type === "unlimited") return plan.gender === "female" ? t("events.drink_unlimited_ladies") : t("events.drink_unlimited_all");
  if (plan.type === "ticket") {
    const count = (plan.lineItems ?? []).filter((i) => i.name).length;
    if (count === 1) return t("events.drink_ticket_items_one");
    return count > 1 ? t("events.drink_ticket_items_other", { count }) : t("events.drink_ticket_generic");
  }
  return plan.productName || t("events.drink_offer_generic");
}

export function EventDetail() {
  const { t } = useTranslation();
  const params = useParams();
  const id = Number(params["id"]);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: event, isLoading } = useGetEvent(id);
  const { data: reviews = [], refetch: refetchReviews } = useListEventReviews(id);
  const { data: availability = [] } = useListVendorAvailability(event?.vendor?.id ?? 0, {
    query: { enabled: !!event?.vendor?.id } as any,
  });
  const { data: me } = useGetMe({ query: { retry: false } as any });
  const { data: announcements = [] } = useQuery<any[]>({
    queryKey: ["event-announcements", id],
    queryFn: () => apiGet(`/api/events/${id}/announcements`),
    enabled: !!id,
  });
  const vendorId = (event as any)?.vendor?.id;
  const { data: partnerBlockedDates = [] } = useQuery<{ date: string }[]>({
    queryKey: ["partner-blocked-dates", vendorId],
    queryFn: () => apiGet(`/api/partners/${vendorId}/blocked-dates`),
    enabled: !!vendorId,
  });
  const { data: drinkPlans = [] } = useQuery<any[]>({
    queryKey: ["vendor-drink-plans", vendorId],
    queryFn: () => apiGet<any[]>(`/api/vendors/${vendorId}/drink-plans`),
    enabled: (event as any)?.type === "pub" && !!vendorId,
  });

  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [guests, setGuests] = useState(1);
  const [notes, setNotes] = useState("");
  const [personName, setPersonName] = useState("");
  const [phone, setPhone] = useState("");
  const [eventType, setEventType] = useState<string>("other");
  const [budget, setBudget] = useState<string>("any");
  const [couponInput, setCouponInput] = useState("");
  const [couponState, setCouponState] = useState<{
    valid: boolean; discountPercent: number; code: string;
  } | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [myCoupons, setMyCoupons] = useState<Coupon[]>([]);
  const [booking, setBooking] = useState(false);
  const [discountInfo, setDiscountInfo] = useState<DiscountInfo | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [expandedDrinkPlans, setExpandedDrinkPlans] = useState<Set<number>>(new Set());

  // Pub-specific state
  const isPub = (event as any)?.type === "pub";
  const [pubMode, setPubMode] = useState<"ticket" | "event">("ticket");
  const [ticketWomen, setTicketWomen] = useState(0);
  const [ticketMen, setTicketMen] = useState(0);
  const [ticketCouple, setTicketCouple] = useState(0);
  const [occasion, setOccasion] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [pointsToUse, setPointsToUse] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "online">("cod");
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [confirmedAge, setConfirmedAge] = useState(false);

  const createReview = useCreateReview();
  const qc = useQueryClient();

  const { data: wishlistItems = [] } = useQuery<{ id: number }[]>({
    queryKey: ["wishlist"],
    queryFn: () => apiGet<{ id: number }[]>("/api/wishlist"),
    enabled: !!me?.user,
  });
  const inWishlist = wishlistItems.some((w: any) => w.id === id);

  const addToWishlist = useMutation({
    mutationFn: () => apiPost("/api/wishlist", { eventId: id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wishlist"] }); toast({ title: t("events.wishlist_added") }); },
    onError: () => toast({ title: t("events.wishlist_add_error"), variant: "destructive" }),
  });
  const removeFromWishlist = useMutation({
    mutationFn: () => apiDelete(`/api/wishlist/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wishlist"] }); toast({ title: t("events.wishlist_removed") }); },
    onError: () => toast({ title: t("events.wishlist_remove_error"), variant: "destructive" }),
  });

  const { data: similarPubs = [] } = useQuery<any[]>({
    queryKey: ["similar-pubs", id],
    queryFn: () => apiGet<any[]>(`/api/events?type=pub&city=${encodeURIComponent((event as any)?.city ?? "")}&limit=4`),
    enabled: !!(event as any)?.city,
    select: (data) => data.filter((e: any) => e.id !== id).slice(0, 3),
  });

  useEffect(() => {
    if (!me?.user) return;
    apiGet<Coupon[]>("/api/coupons/me").then(setMyCoupons).catch(() => {});
    apiGet<DiscountInfo>("/api/users/me/discounts").then(setDiscountInfo).catch(() => {});
  }, [me?.user]);

  useEffect(() => {
    if (me?.user?.name && !personName) setPersonName(me.user.name);
  }, [me?.user?.name]);

  if (isLoading) return <div className="container mx-auto px-4 py-20">Loading…</div>;
  if (!event) return <div className="container mx-auto px-4 py-20">{t("events.not_found")}</div>;

  const ev = event as any;
  const blockedDates = new Set(
    availability.filter((a) => a.status !== "available").map((a) => a.date),
  );

  const DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const vendorOpenDays: string[] = (ev.vendor?.openDays ?? []) as string[];
  const vendorDayHours = ev.vendor?.dayHours as Record<string, { open: string; close: string } | null> | null | undefined;
  const vendorAddress: string = ev.vendor?.address ?? "";
  const dayPricingMap = ev.dayPricing as Record<string, { women: number; men: number; couple: number } | null> | null;

  const formatHour = (t: string): string => {
    const [h, m] = t.split(":").map(Number);
    if (isNaN(h)) return t;
    const period = h >= 12 ? "pm" : "am";
    const hour = h % 12 || 12;
    return m ? `${hour}:${String(m).padStart(2, "0")}${period}` : `${hour}${period}`;
  };
  const selectedDayName = date ? DAY_ABBRS[new Date(`${date}T12:00:00`).getDay()] : "";
  const isClosedDay = !!(date && vendorOpenDays.length > 0 && !vendorOpenDays.includes(selectedDayName));
  const dayOverride = selectedDayName && dayPricingMap?.[selectedDayName] ? dayPricingMap[selectedDayName] : null;
  const effectiveWomen = dayOverride ? Number(dayOverride.women) : Number(ev.priceWomen || 0);
  const effectiveMen = dayOverride ? Number(dayOverride.men) : Number(ev.priceMen || 0);
  const effectiveCouple = dayOverride ? Number(dayOverride.couple) : Number(ev.priceCouple || 0);

  const isDrinkPlanAvailableToday = (plan: any): boolean => {
    if (!plan.days || plan.days.length === 0) return false;
    const todayAbbr = DAY_ABBRS[new Date().getDay()];
    if (!plan.days.includes(todayAbbr)) return false;
    if (plan.timeFrom || plan.timeTo) {
      const now = new Date();
      const currentMins = now.getHours() * 60 + now.getMinutes();
      if (plan.timeFrom) {
        const [fh, fm] = plan.timeFrom.split(":").map(Number);
        if (currentMins < fh * 60 + (fm || 0)) return false;
      }
      if (plan.timeTo) {
        const [th, tm] = plan.timeTo.split(":").map(Number);
        if (currentMins > th * 60 + (tm || 0)) return false;
      }
    }
    return true;
  };

  const _fer = (ev as any)?.freeEntryRules as { enabled?: boolean; days?: string[]; genders?: string[] } | undefined;
  const ferDayActive = !!(_fer?.enabled === true && (_fer.days ?? []).includes(selectedDayName));
  const ferGenders = new Set(ferDayActive && Array.isArray(_fer?.genders) ? (_fer!.genders as string[]) : []);
  const isFreeEntryDay = isPub && (
    ferDayActive ||
    (effectiveWomen === 0 && effectiveMen === 0 && effectiveCouple === 0)
  );

  const venueName = ev.vendor?.businessName ?? "This venue";

  // Compute subtotal based on mode. Mirrors the server's free-entry zeroing in
  // bookings.ts so the form preview matches the actual charge: any booked
  // gender listed in the active rule contributes ₹0.
  const subtotalWomenPrice = ferGenders.has("women") ? 0 : effectiveWomen;
  const subtotalMenPrice = ferGenders.has("men") ? 0 : effectiveMen;
  const subtotalCouplePrice = ferGenders.has("couple") ? 0 : effectiveCouple;
  let subtotal = 0;
  if (isPub && pubMode === "ticket") {
    subtotal =
      ticketWomen * subtotalWomenPrice +
      ticketMen * subtotalMenPrice +
      ticketCouple * subtotalCouplePrice;
  } else {
    subtotal = Number(ev.price) * Math.max(1, guests);
  }
  const couponDiscount = couponState?.valid ? Math.round(subtotal * (couponState.discountPercent / 100)) : 0;
  const newUserPercent = discountInfo?.isNewUser && !couponState?.valid ? (discountInfo.bookingDiscountPercent || 0) : 0;
  const newUserDiscount = newUserPercent > 0 ? Math.round(subtotal * (newUserPercent / 100)) : 0;
  const discount = Math.max(couponDiscount, newUserDiscount);
  const POINTS_RUPEE_RATE = 0.10; // 100 pts = ₹10
  const pointsCap = Math.max(0, subtotal - discount);
  const pointsAvail = Math.min(discountInfo?.points ?? 0, Math.floor(pointsCap / POINTS_RUPEE_RATE));
  const pointsApplied = Math.min(pointsToUse, pointsAvail);
  const finalTotal = Math.max(0, subtotal - discount - pointsApplied * POINTS_RUPEE_RATE);

  const startingAt = (() => {
    if (isPub) {
      const tiers = [Number(ev.priceWomen), Number(ev.priceMen), Number(ev.priceCouple)].filter((n) => n > 0);
      if (tiers.length > 0) return Math.min(...tiers);
    }
    return ev.startingPrice ?? ev.price ?? 0;
  })();

  const validateCoupon = async () => {
    if (!me?.user) {
      toast({ title: t("events.login_coupons"), variant: "destructive" });
      return;
    }
    if (!couponInput.trim()) return;
    try {
      const r = await apiPost<{ valid: boolean; discountPercent: number }>(
        "/api/coupons/validate",
        { code: couponInput.trim().toUpperCase() },
      );
      if (r.valid) {
        setCouponState({ valid: true, discountPercent: r.discountPercent, code: couponInput.trim().toUpperCase() });
        toast({ title: t("events.coupon_applied_title"), description: t("events.coupon_applied_pct", { pct: r.discountPercent }) });
      }
    } catch (e: any) {
      setCouponState(null);
      toast({ title: t("events.coupon_invalid"), description: e?.message, variant: "destructive" });
    }
  };

  const handleBook = async () => {
    if (!me?.user) {
      toast({ title: t("events.login_to_book"), variant: "destructive" });
      setLocation("/login");
      return;
    }
    if (!date) {
      toast({ title: t("events.select_date"), variant: "destructive" });
      return;
    }
    if (isPub && pubMode === "ticket" && ticketWomen + ticketMen + ticketCouple === 0) {
      toast({ title: t("events.add_tickets"), variant: "destructive" });
      return;
    }
    if (isPub && pubMode === "event" && !arrivalTime) {
      toast({ title: t("events.arrival_time"), description: "Please enter the expected arrival time.", variant: "destructive" });
      return;
    }

    if (isPub && phone && !/^\d{10}$/.test(phone)) {
      toast({ title: t("events.invalid_phone"), description: t("events.phone_desc"), variant: "destructive" });
      return;
    }
    if (isClosedDay) {
      toast({ title: t("events.venue_closed", { venue: venueName, day: selectedDayName }), description: t("events.pick_open_day"), variant: "destructive" });
      return;
    }
    if (!agreedTerms) {
      toast({ title: "Please accept the Terms & Conditions and Privacy Policy to continue.", variant: "destructive" });
      return;
    }
    if (isPub && !confirmedAge) {
      toast({ title: "Please confirm you are 18+ to continue.", variant: "destructive" });
      return;
    }
    setBooking(true);
    try {
      const result = await apiPost<{ id?: number; status?: string; requiresPayment?: boolean; redirectUrl?: string; bookingId?: number }>("/api/bookings", {
        eventId: event.id,
        bookingDate: date,
        guests: isPub && pubMode === "ticket" ? (ticketWomen + ticketMen + ticketCouple * 2) : guests,
        notes,
        eventType,
        budgetRange: budget === "any" ? "" : budget,
        couponCode: couponState?.valid ? couponState.code : "",
        personName,
        phone,
        pointsToUse: pointsApplied,
        paymentMethod,
        ...(isPub
          ? {
              pubMode,
              ticketWomen, ticketMen, ticketCouple,
              selectedPubEvent: "",
              notes: pubMode === "event" ? occasion : notes,
              arrivalTime: pubMode === "event" ? arrivalTime : undefined,
            }
          : {}),
      });
      if (result?.redirectUrl) {
        toast({ title: t("events.redirecting_payment"), description: t("events.phonepe_desc") });
        window.location.href = result.redirectUrl;
        return;
      }
      toast({ title: t("events.booking_confirmed"), description: t("events.booking_confirmed_desc") });
      setLocation("/dashboard/bookings");
    } catch (e: any) {
      const errMsg: string = e?.message ?? "Try again.";
      const isPhonePeUnconfigured = paymentMethod === "online" && (
        errMsg.includes("PHONEPE_UNCONFIGURED") ||
        errMsg.toLowerCase().includes("online payments are not set up")
      );
      if (isPhonePeUnconfigured) {
        toast({ title: t("events.online_pay_unavailable"), description: t("events.online_pay_unavailable_desc"), variant: "destructive" });
      } else {
        toast({ title: t("events.booking_failed"), description: errMsg, variant: "destructive" });
      }
    } finally {
      setBooking(false);
    }
  };

  const handleReview = () => {
    if (!me?.user) { setLocation("/login"); return; }
    if (!event.vendor) return;
    createReview.mutate(
      { data: { eventId: event.id, vendorId: event.vendor.id, rating: reviewRating, comment: reviewComment } },
      {
        onSuccess: () => { toast({ title: t("events.review_posted") }); setReviewComment(""); refetchReviews(); },
        onError: (e: unknown) => toast({ title: t("events.review_failed"), description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
      },
    );
  };

  const cityState = (event as any).city
    ? `${(event as any).city}${(event as any).state ? ", " + (event as any).state : ""}`
    : event.location;
  const loc = vendorAddress || cityState;

  const vendorCover = ev.vendor?.coverImageUrl;

  return (
    <div>
      {/* Cinematic hero — full-bleed cover image */}
      <div className="relative h-[62vh] md:h-[72vh] w-full overflow-hidden">
        {/* Full-bleed cover image */}
        {(event.imageUrl || (isPub && vendorCover)) ? (
          <div className="absolute inset-0">
            <img
              src={event.imageUrl || vendorCover}
              alt={event.title}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 to-black" />
        )}
        {/* Top scrim */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
        {/* Bottom scrim — deep cinematic fade */}
        <div className="absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none" />

        {/* Wishlist button — top right */}
        {me?.user && (
          <button
            onClick={() => inWishlist ? removeFromWishlist.mutate() : addToWishlist.mutate()}
            disabled={addToWishlist.isPending || removeFromWishlist.isPending}
            aria-label={inWishlist ? t("events.remove_wishlist") : t("events.add_wishlist")}
            className="absolute top-4 right-4 z-10 p-2.5 rounded-full bg-black/50 border border-white/15 hover:bg-black/70 transition-colors"
          >
            <Heart className={`h-4 w-4 transition-colors ${inWishlist ? "fill-primary text-primary" : "text-white"}`} />
          </button>
        )}

        {/* Title block — anchored at bottom */}
        <div className="absolute bottom-0 left-0 right-0 px-4 md:px-10 pb-9">
          {/* Badges row — only Pub type + Popular; category ("Pubs") removed */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {(event as any).type === "pub" && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium text-white tracking-wide">
                Pub
              </span>
            )}
            {(event as any).popular && (
              <Badge className="bg-primary border-0 text-primary-foreground red-glow">{t("events.popular_badge")}</Badge>
            )}
            {event.rating > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 border border-white/10 text-xs">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="font-semibold text-white">{event.rating.toFixed(1)}</span>
                <span className="text-white/50">({event.reviewCount})</span>
              </div>
            )}
          </div>
          <h1 className="font-serif text-4xl md:text-6xl lg:text-7xl tracking-tight max-w-4xl leading-tight text-white">{event.title}</h1>
          <p className="mt-3 text-white/60">
            by{" "}
            <Link href={`/partners/${event.vendor?.id ?? ""}`} className="text-white/85 hover:text-white underline underline-offset-4 transition-colors">
              {event.vendorName}
            </Link>
          </p>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-[95vw] max-h-[90vh] rounded-2xl object-contain" />
          <button className="absolute top-4 right-6 text-white text-3xl leading-none" onClick={() => setLightbox(null)}>×</button>
        </div>
      )}

      {/* Gallery strip */}
      {((ev as any).galleryImages?.length > 0 || (ev as any).galleryVideos?.length > 0) && (
        <div className="container mx-auto px-4 md:px-6 pt-8">
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {((ev as any).galleryImages ?? []).map((src: string, i: number) => (
              <img
                key={`img-${i}`}
                src={src}
                alt=""
                onClick={() => setLightbox(src)}
                className="h-40 w-56 shrink-0 rounded-2xl object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
              />
            ))}
            {((ev as any).galleryVideos ?? []).map((src: string, i: number) => (
              <video
                key={`vid-${i}`}
                src={src}
                className="h-40 w-56 shrink-0 rounded-2xl object-cover"
                autoPlay
                muted
                loop
                playsInline
              />
            ))}
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 md:px-6 pt-12">
        <section className="pb-10">
          <h2 className="font-serif text-3xl mb-3 accent-underline inline-block">{t("events.about_section")}</h2>
          <p className="text-white/70 leading-relaxed whitespace-pre-line mt-4">{event.description}</p>
        </section>
        <div className="grid lg:grid-cols-[1.7fr_1fr] gap-10 pb-12">
        <div className="space-y-10">
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <MapPin className="h-4 w-4 text-primary" />
              <span>{loc}</span>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venueName} ${loc}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary/80 hover:text-primary border border-primary/30 rounded-full px-2 py-0.5 transition-colors"
              >
                <ExternalLink className="h-3 w-3" /> {t("events.open_maps")}
              </a>
            </div>
            <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" />{t("events.capacity", { n: event.capacity })}</div>
            <div className="flex items-center gap-2"><Star className="h-4 w-4 fill-primary text-primary" />{event.rating > 0 ? `${event.rating.toFixed(1)} (${event.reviewCount})` : t("events.new_venue")}</div>
          </div>

          {isPub && (ev.pubEventTypes as string[] | undefined)?.length ? (
            <div className="flex flex-wrap gap-2">
              {(ev.pubEventTypes as string[]).map((evType: string) => (
                <span
                  key={evType}
                  className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                >
                  {evType}
                </span>
              ))}
            </div>
          ) : null}

          {isPub && ev.freeEntryRules?.enabled && (() => {
            const fer = ev.freeEntryRules as { enabled: boolean; genders: string[]; days: string[]; beforeTime?: string };
            return (
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                  <h3 className="font-semibold text-emerald-400 text-sm uppercase tracking-wide">{t("events.free_entry_available")}</h3>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-white/70">
                  {fer.genders.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-300 text-xs font-medium">
                      {t("events.free_for", { genders: fer.genders.join(", ") })}
                    </span>
                  )}
                  {fer.days.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-white/60 text-xs">
                      {t("events.free_days", { days: fer.days.join(", ") })}
                    </span>
                  )}
                  {fer.beforeTime && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-white/60 text-xs">
                      {t("events.free_before", { time: fer.beforeTime })}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {isPub && drinkPlans.length > 0 && (
            <div className="rounded-2xl border border-primary/25 bg-primary/5 overflow-hidden">
              {/* Menu header */}
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-primary/15">
                <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <Wine className="h-3.5 w-3.5 text-primary" />
                </div>
                <h3 className="font-semibold text-primary text-xs uppercase tracking-[0.2em]">{t("events.drink_deals")}</h3>
                <span className="ml-auto text-[10px] text-primary/50 font-medium uppercase tracking-wide">{drinkPlans.length} plan{drinkPlans.length !== 1 ? "s" : ""}</span>
              </div>
              {/* Menu rows */}
              <div className="divide-y divide-primary/10">
                {drinkPlans.map((plan: any) => {
                  const hasItems = plan.lineItems && plan.lineItems.length > 0;
                  const isExpanded = expandedDrinkPlans.has(plan.id);
                  const typeIcon = plan.type === "unlimited" ? "🥂" : plan.type === "ticket" ? "🎫" : plan.type === "welcome" ? "🍹" : "🍸";
                  return (
                    <div key={plan.id} className="group">
                      <button
                        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-primary/5 transition-colors"
                        onClick={hasItems ? () => setExpandedDrinkPlans((prev) => {
                          const next = new Set(prev);
                          if (next.has(plan.id)) next.delete(plan.id); else next.add(plan.id);
                          return next;
                        }) : undefined}
                        type="button"
                      >
                        <span className="text-base shrink-0 leading-none">{typeIcon}</span>
                        <span className="flex-1 text-sm text-white/85 font-medium leading-snug">{getPlanSummary(plan, t)}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {isDrinkPlanAvailableToday(plan) && (
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold border bg-emerald-500/15 border-emerald-500/30 text-emerald-400">
                              {t("events.drink_deal_today")}
                            </span>
                          )}
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${plan.gender === "female" ? "bg-rose-500/15 border-rose-500/25 text-rose-300" : "bg-primary/15 border-primary/25 text-primary"}`}>
                            {plan.gender === "female" ? t("events.drink_gender_ladies") : t("events.drink_gender_all")}
                          </span>
                          {hasItems && (
                            <span className="text-white/25 text-[10px] group-hover:text-white/50 transition-colors">
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          )}
                        </div>
                      </button>
                      {/* Days / time / description detail */}
                      {((plan.days && plan.days.length > 0) || plan.timeFrom || plan.timeTo || plan.description) && (
                        <div className="px-5 pb-2.5 flex flex-col gap-1.5 -mt-1">
                          {((plan.days && plan.days.length > 0) || plan.timeFrom || plan.timeTo) && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {plan.days && plan.days.map((d: string) => (
                                <span key={d} className="rounded-md bg-black/40 border border-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
                                  {d}
                                </span>
                              ))}
                              {(plan.timeFrom || plan.timeTo) && (
                                <span className="rounded-md bg-black/40 border border-white/15 px-2 py-0.5 text-[10px] font-semibold text-white flex items-center gap-1">
                                  <Clock className="h-2.5 w-2.5 shrink-0" />
                                  {plan.timeFrom || ""}{plan.timeTo ? ` – ${plan.timeTo}` : ""}
                                </span>
                              )}
                            </div>
                          )}
                          {plan.description && (
                            <p className="text-[11px] text-white/40 leading-relaxed">{plan.description}</p>
                          )}
                        </div>
                      )}
                      {hasItems && isExpanded && (
                        <ul className="pb-3 px-5 pl-14 space-y-1.5">
                          {plan.lineItems.map((item: any, i: number) => (
                            <li key={i} className="text-xs text-white/50 flex items-center gap-2">
                              <span className="h-1 w-1 rounded-full bg-primary/40 shrink-0" />
                              <span className="tabular-nums font-medium text-white/40">{item.qty}×</span>
                              {item.name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isPub && vendorDayHours && (() => {
            const DAY_ORDER_h = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
            const DAY_FULL_h: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
            if (!DAY_ORDER_h.some((d) => d in vendorDayHours)) return null;
            const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
            const fmt = (hhmm: string) => {
              const [h, m] = hhmm.split(":").map(Number);
              const suffix = h < 12 ? "AM" : "PM";
              const hr = h % 12 || 12;
              return `${hr}:${String(m).padStart(2, "0")} ${suffix}`;
            };
            const todayKey = DAY_ABBRS[new Date().getDay()];
            const todayTimes = vendorDayHours[todayKey] ?? null;
            const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
            let isOpenNow = false;
            if (todayTimes) {
              const openMin = toMin(todayTimes.open);
              const closeMin = toMin(todayTimes.close);
              isOpenNow = closeMin < openMin
                ? nowMin >= openMin || nowMin < closeMin
                : nowMin >= openMin && nowMin < closeMin;
            }
            const leftDays = DAY_ORDER_h.slice(0, 4);
            const rightDays = DAY_ORDER_h.slice(4);
            return (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-serif text-3xl accent-underline inline-block">{t("events.opening_hours")}</h2>
                  <div className="flex items-center gap-3">
                    {todayTimes && (
                      <span className="hidden sm:block text-sm text-white/50 tabular-nums">
                        {t("events.today_tag")}: <span className="text-white/90 font-medium">{fmt(todayTimes.open)} – {fmt(todayTimes.close)}</span>
                      </span>
                    )}
                    {isOpenNow ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                        {t("events.open_now")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
                        {t("events.closed_now")}
                      </span>
                    )}
                  </div>
                </div>
                {todayTimes && (
                  <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
                    <Clock className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm text-white/60">{t("events.today_tag")} ({DAY_FULL_h[todayKey]}):</span>
                    <span className="font-semibold text-primary tabular-nums">
                      {fmt(todayTimes.open)} – {fmt(todayTimes.close)}
                      {toMin(todayTimes.close) < toMin(todayTimes.open) && (
                        <span className="ml-1.5 text-xs text-white/40 font-normal">{t("events.next_day")}</span>
                      )}
                    </span>
                    <span className="ml-auto">
                      {isOpenNow ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                          {t("events.open_now")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-400">
                          {t("events.closed_now")}
                        </span>
                      )}
                    </span>
                  </div>
                )}
                <div className="grid md:grid-cols-2 gap-1.5">
                  {[leftDays, rightDays].map((col, ci) => (
                    <div key={ci} className="space-y-0.5">
                      {col.map((day) => {
                        const times = vendorDayHours[day] ?? null;
                        const isToday = day === todayKey;
                        const isOvernight = times ? toMin(times.close) < toMin(times.open) : false;
                        return (
                          <div
                            key={day}
                            className={[
                              "flex justify-between items-center px-4 py-3 text-sm rounded-lg transition-colors",
                              isToday
                                ? "bg-primary/10 ring-1 ring-primary/20 border-l-[3px] border-primary"
                                : "hover:bg-white/3",
                            ].join(" ")}
                          >
                            <span className="flex items-center gap-2.5 min-w-0">
                              <span className={["h-2 w-2 rounded-full shrink-0", times ? "bg-emerald-500" : "bg-white/20"].join(" ")} />
                              <span className={["font-medium truncate", isToday ? "text-primary" : "text-white/80"].join(" ")}>
                                {DAY_FULL_h[day]}
                              </span>
                              {isToday && (
                                <span className="shrink-0 text-[10px] font-semibold text-primary/70 uppercase tracking-wider border border-primary/30 rounded px-1 py-px">
                                  {t("events.today_tag")}
                                </span>
                              )}
                            </span>
                            <span className={[
                              "ml-3 shrink-0 tabular-nums",
                              times
                                ? isToday ? "font-semibold text-primary" : "text-white/50 text-sm"
                                : "text-white/25 text-xs",
                            ].join(" ")}>
                              {times ? (
                                <>
                                  {fmt(times.open)} – {fmt(times.close)}
                                  {isOvernight && (
                                    <span className="ml-1 text-white/30 text-[10px]">{t("events.next_day")}</span>
                                  )}
                                </>
                              ) : "–"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </section>
            );
          })()}

          {isPub && vendorAddress && (
            <section>
              <h2 className="font-serif text-3xl mb-5 accent-underline inline-block flex items-center gap-2">
                <Navigation className="h-6 w-6 text-primary" />
                {t("events.find_us")}
              </h2>
              <iframe
                title="Venue location"
                src={`https://maps.google.com/maps?q=${encodeURIComponent(vendorAddress)}&output=embed&hl=en`}
                className="w-full h-64 md:h-80 rounded-2xl border border-white/10"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(vendorAddress)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <Navigation className="h-3.5 w-3.5" />
                {vendorAddress} — {t("events.open_google_maps")} ↗
              </a>
            </section>
          )}

          {isPub && announcements.length > 0 && (
            <section>
              <h2 className="font-serif text-3xl mb-5 accent-underline inline-block">{t("events.announcements")}</h2>
              <div className="space-y-4 mt-4">
                {announcements.map((a: any) => (
                  <div key={a.id} className="rounded-xl glass-card p-5 flex gap-4">
                    {a.imageUrl && (
                      <img src={a.imageUrl} alt={a.title} className="w-20 h-20 rounded-lg object-cover shrink-0" loading="lazy" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base text-white">{a.title}</p>
                      {a.announceDate && (
                        <p className="text-xs text-primary mt-0.5">
                          {new Date(a.announceDate + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                          {a.announceTime && ` · ${a.announceTime}`}
                        </p>
                      )}
                      {a.body && <p className="text-sm text-white/70 mt-1 leading-relaxed">{a.body}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
              <h2 className="font-serif text-3xl accent-underline inline-block">{t("events.reviews_section")}</h2>
              {reviews.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => {
                      const avg = reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length;
                      return <Star key={i} className={`h-3.5 w-3.5 ${i < Math.round(avg) ? "fill-amber-400 text-amber-400" : "text-white/20"}`} />;
                    })}
                  </div>
                  <span className="font-semibold text-white/80">
                    {(reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length).toFixed(1)}
                  </span>
                  <span>· {reviews.length} review{reviews.length !== 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
            {reviews.length === 0 ? (
              <p className="text-muted-foreground text-sm mt-4">{t("events.no_reviews")}</p>
            ) : (
              <div className="space-y-3 mt-4">
                {reviews.map((r: any) => (
                  <div key={r.id} className="rounded-2xl glass-card p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {r.userImage ? (
                          <img src={r.userImage} alt={r.userName} className="w-10 h-10 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                            {r.userName?.charAt(0)?.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{r.userName}</p>
                          {r.verifiedBooking && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium mt-0.5">
                              <BadgeCheck className="h-3 w-3" /> {t("events.verified_booking")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-4 w-4 ${i < r.rating ? "fill-amber-400 text-amber-400" : "text-white/15"}`} />
                        ))}
                      </div>
                    </div>
                    {r.comment && (
                      <p className="text-sm text-white/65 leading-relaxed">{r.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {me?.user && (
              <div className="mt-8 rounded-2xl glass-card-strong p-6 space-y-3">
                <p className="font-serif text-xl">{t("events.leave_review")}</p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setReviewRating(n)}>
                      <Star className={`h-6 w-6 ${n <= reviewRating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                    </button>
                  ))}
                </div>
                <Textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder={t("events.review_placeholder")} className="bg-black/40 border-white/10" />
                <Button onClick={handleReview} disabled={createReview.isPending || !reviewComment.trim()} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">{t("events.post_review")}</Button>
              </div>
            )}
          </section>

          {similarPubs.length > 0 && (
            <section>
              <h2 className="font-serif text-3xl mb-5 accent-underline inline-block">{t("events.similar_pubs")}</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {similarPubs.map((pub: any) => (
                  <Link key={pub.id} href={`/events/${pub.id}`}>
                    <div className="group rounded-2xl glass-card overflow-hidden border border-border hover:border-primary/30 transition-all cursor-pointer">
                      {pub.imageUrl && (
                        <div className="aspect-[4/3] overflow-hidden">
                          <img src={pub.imageUrl} alt={pub.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                        </div>
                      )}
                      <div className="p-4">
                        <Badge variant="secondary" className="mb-1.5 text-xs">{pub.category}</Badge>
                        <p className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">{pub.title}</p>
                        {pub.city && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="h-3 w-3" />{pub.city}</p>}
                        {pub.price != null && <p className="text-sm font-semibold text-primary mt-1">₹{Number(pub.price).toLocaleString("en-IN")}</p>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              {isPub && (event as any)?.city && (
                <div className="mt-5 text-right">
                  <Link
                    href={`/pubs?city=${encodeURIComponent((event as any).city)}`}
                    className="text-sm text-primary hover:underline underline-offset-4 inline-flex items-center gap-1 transition-colors"
                  >
                    {t("events.see_all_city", { city: (event as any).city })} →
                  </Link>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start space-y-4 order-first lg:order-none">
          <div className="rounded-3xl glass-card-strong p-7 red-ring">
            {isFreeEntryDay ? (
              <>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("events.starting_at")}</p>
                <p className="font-serif text-5xl mt-1 text-green-400 mb-3">{t("events.free_entry_label")}</p>
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("events.starting_at")}</p>
                <p className="font-serif text-5xl mt-1">{startingAt > 0 ? formatINR(startingAt) : "—"}</p>
                <p className="text-xs text-muted-foreground mb-3">
                  {isPub ? t("events.lowest_entry") : t("events.per_person_event")}
                </p>
              </>
            )}

            {isPub && !isFreeEntryDay && (Number(ev.priceWomen) > 0 || Number(ev.priceMen) > 0 || Number(ev.priceCouple) > 0 || (dayPricingMap && Object.keys(dayPricingMap).length > 0)) && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 mb-5 space-y-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {dayPricingMap && Object.keys(dayPricingMap).length > 0 ? t("events.entry_prices_by_day") : t("events.entry_prices")}
                </p>
                {dayPricingMap && Object.keys(dayPricingMap).length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-white/40">
                          <th className="text-left pb-1 font-medium">{t("events.day_col")}</th>
                          <th className="text-right pb-1 font-medium">{t("events.women")}</th>
                          <th className="text-right pb-1 font-medium">{t("events.men")}</th>
                          <th className="text-right pb-1 font-medium">{t("events.couple")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const).map((day) => {
                          const ov = dayPricingMap[day] ?? null;
                          const fw = ov ? Number(ov.women) : Number(ev.priceWomen || 0);
                          const fm = ov ? Number(ov.men) : Number(ev.priceMen || 0);
                          const fc = ov ? Number(ov.couple) : Number(ev.priceCouple || 0);
                          const isActive = selectedDayName === day;
                          return (
                            <tr key={day} className={isActive ? "text-primary font-semibold" : "text-white/60"}>
                              <td className="py-0.5">{day}</td>
                              <td className="text-right py-0.5">{fw > 0 ? formatINRExact(fw) : "—"}</td>
                              <td className="text-right py-0.5">{fm > 0 ? formatINRExact(fm) : "—"}</td>
                              <td className="text-right py-0.5">{fc > 0 ? formatINRExact(fc) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <>
                    {Number(ev.priceWomen) > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/70">{t("events.women")}</span>
                        <span className="font-semibold text-primary">{formatINRExact(Number(ev.priceWomen))}</span>
                      </div>
                    )}
                    {Number(ev.priceMen) > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/70">{t("events.men")}</span>
                        <span className="font-semibold text-primary">{formatINRExact(Number(ev.priceMen))}</span>
                      </div>
                    )}
                    {Number(ev.priceCouple) > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/70">{t("events.couple")}</span>
                        <span className="font-semibold text-primary">{formatINRExact(Number(ev.priceCouple))}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {!isFreeEntryDay && discountInfo?.isNewUser && (
              <div className="mb-4 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs flex items-center gap-2 text-primary">
                <Sparkle className="h-3.5 w-3.5" />
                {t("events.new_member_discount", { pct: discountInfo.bookingDiscountPercent })}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <Label htmlFor="bdate">{t("events.date_label")}</Label>
                <Input
                  id="bdate"
                  type="date"
                  value={date}
                  min={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })()}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-black/40 border-white/10 mt-1"
                />
                {vendorOpenDays.length > 0 && vendorOpenDays.length < 7 && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {t("events.open_days_note", { days: vendorOpenDays.join(", ") })}
                  </p>
                )}
              </div>

              {isFreeEntryDay && (
                <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-950/40 px-3 py-2.5">
                  <span className="text-green-400 text-base">✓</span>
                  <p className="text-sm font-medium text-green-300">{t("events.free_entry_form_notice")}</p>
                </div>
              )}

              {isPub ? (
                <>
                  <div>
                    <Label className="flex items-center gap-1.5"><Wine className="h-3.5 w-3.5 text-primary" />{t("events.booking_type")}</Label>
                    <RadioGroup
                      value={pubMode}
                      onValueChange={(v) => setPubMode(v as "ticket" | "event")}
                      className="grid grid-cols-2 gap-2 mt-2"
                    >
                      <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer ${pubMode === "ticket" ? "border-primary bg-primary/10" : "border-white/10"}`}>
                        <RadioGroupItem value="ticket" />
                        <span className="text-sm">{t("events.buy_tickets")}</span>
                      </label>
                      <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer ${pubMode === "event" ? "border-primary bg-primary/10" : "border-white/10"}`}>
                        <RadioGroupItem value="event" />
                        <span className="text-sm">{t("events.table_booking")}</span>
                      </label>
                    </RadioGroup>
                  </div>

                  {pubMode === "ticket" && (
                    <div className="space-y-2 rounded-xl border border-white/10 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("events.ticket_counts")}</p>
                      <TicketRow label={t("events.women")} price={effectiveWomen} value={ticketWomen} onChange={setTicketWomen} hidePrice={isFreeEntryDay} />
                      <TicketRow label={t("events.men")} price={effectiveMen} value={ticketMen} onChange={setTicketMen} hidePrice={isFreeEntryDay} />
                      <TicketRow label={t("events.couple")} price={effectiveCouple} value={ticketCouple} onChange={setTicketCouple} hidePrice={isFreeEntryDay} />
                    </div>
                  )}

                  {pubMode === "event" && (
                    <>
                      <div>
                        <Label htmlFor="occasion">{t("events.occasion_label")}</Label>
                        <Select value={occasion} onValueChange={setOccasion}>
                          <SelectTrigger id="occasion" className="bg-black/40 border-white/10 mt-1">
                            <SelectValue placeholder={t("events.select_occasion")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="farewell">{t("events.occ_farewell")}</SelectItem>
                            <SelectItem value="office-party">{t("events.occ_office_party")}</SelectItem>
                            <SelectItem value="casual-party">{t("events.occ_casual_party")}</SelectItem>
                            <SelectItem value="birthday">{t("events.occ_birthday")}</SelectItem>
                            <SelectItem value="others">{t("events.occ_others")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="guests">{t("events.guests_field")} <span className="text-muted-foreground font-normal text-xs">{t("events.guests_min_10")}</span></Label>
                        <Input id="guests" type="number" min={10} max={event.capacity} value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="bg-black/40 border-white/10 mt-1" />
                      </div>
                      <div>
                        <Label htmlFor="arrival-time">{t("events.arrival_time")} <span className="text-red-400 text-xs ml-1">*</span></Label>
                        <input
                          id="arrival-time"
                          type="time"
                          value={arrivalTime}
                          onChange={(e) => setArrivalTime(e.target.value)}
                          required
                          className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm mt-1 text-foreground [color-scheme:dark]"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <Label htmlFor="pname">{t("events.booking_name")}</Label>
                    <Input id="pname" value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder={t("events.name_on_booking")} className="bg-black/40 border-white/10 mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="pphone">{t("events.phone_number")}</Label>
                    <Input
                      id="pphone"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder={t("events.phone_placeholder")}
                      className="bg-black/40 border-white/10 mt-1"
                    />
                    {phone.length > 0 && phone.length < 10 && (
                      <p className="text-xs text-destructive mt-1">{t("events.phone_validation")}</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label htmlFor="etype">{t("events.event_type_label")}</Label>
                    <Select value={eventType} onValueChange={setEventType}>
                      <SelectTrigger id="etype" className="bg-black/40 border-white/10 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EVENT_TYPES.map((evT) => (
                          <SelectItem key={evT.value} value={evT.value}>{evT.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="budget">{t("events.budget_range")}</Label>
                    <Select value={budget} onValueChange={setBudget}>
                      <SelectTrigger id="budget" className="bg-black/40 border-white/10 mt-1">
                        <SelectValue placeholder={t("events.optional_label")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">— select —</SelectItem>
                        {BUDGET_RANGES.map((b) => (
                          <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="guests">{t("events.guests_field")}</Label>
                    <Input id="guests" type="number" min={1} max={event.capacity} value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="bg-black/40 border-white/10 mt-1" />
                  </div>
                </>
              )}

              {!isFreeEntryDay && pointsAvail > 0 && (
                <div>
                  <Label htmlFor="ppoints" className="flex items-center gap-1.5">
                    <Coins className="h-3.5 w-3.5 text-primary" />
                    {t("events.use_points_avail", { n: discountInfo?.points ?? 0 })}
                  </Label>
                  <Input
                    id="ppoints"
                    type="number"
                    min={0}
                    max={pointsAvail}
                    value={pointsToUse}
                    onChange={(e) => setPointsToUse(Math.min(pointsAvail, Math.max(0, Number(e.target.value) || 0)))}
                    className="bg-black/40 border-white/10 mt-1"
                  />
                </div>
              )}

              {/* Coupon — login gated */}
              {!isFreeEntryDay && <div>
                <Label className="flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5 text-primary" /> {t("events.coupon_code_label")}
                  {!me?.user && <Lock className="h-3 w-3 text-muted-foreground ml-1" />}
                </Label>
                {!me?.user ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    <Link href="/login" className="text-primary hover:underline">{t("events.log_in_link")}</Link> {t("events.coupon_login_hint")}
                  </p>
                ) : (
                  <>
                    <div className="flex gap-2 mt-1">
                      <Input
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        placeholder="RV-XXXXXX"
                        className="bg-black/40 border-white/10"
                      />
                      <Button type="button" variant="outline" onClick={validateCoupon} className="border-white/15">{t("events.apply_coupon")}</Button>
                    </div>
                    {couponState?.valid && (
                      <p className="text-xs text-green-400 mt-1">✓ {t("events.coupon_pct_off", { pct: couponState.discountPercent })}</p>
                    )}
                    {myCoupons.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {myCoupons.slice(0, 3).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setCouponInput(c.code)}
                            className="text-[10px] px-2 py-1 rounded bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25"
                          >
                            {c.code} — {c.discountPercent}%
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>}

              {!isFreeEntryDay && (
                <div>
                  <Label htmlFor="notes">{t("events.notes_label")}</Label>
                  <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("events.notes_placeholder")} className="bg-black/40 border-white/10 mt-1" />
                </div>
              )}
              {!isFreeEntryDay && (
                <div className="space-y-1.5 border-t border-white/10 pt-3 text-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{t("events.subtotal_label")}</span>
                    <span>{formatINRExact(subtotal)}</span>
                  </div>
                  {couponDiscount > 0 && couponDiscount === discount && (
                    <div className="flex items-center justify-between text-green-400">
                      <span>{t("events.coupon_label")}</span>
                      <span>– {formatINRExact(couponDiscount)}</span>
                    </div>
                  )}
                  {newUserDiscount > 0 && newUserDiscount === discount && couponDiscount < newUserDiscount && (
                    <div className="flex items-center justify-between text-green-400">
                      <span>{t("events.new_member_pct_off", { pct: newUserPercent })}</span>
                      <span>– {formatINRExact(newUserDiscount)}</span>
                    </div>
                  )}
                  {pointsApplied > 0 && (
                    <div className="flex items-center justify-between text-primary">
                      <span>{t("events.points_label")}</span>
                      <span>– {formatINRExact(pointsApplied * POINTS_RUPEE_RATE)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between font-semibold text-lg pt-1">
                    <span>{t("events.total_label")}</span>
                    <span>{formatINRExact(finalTotal)}</span>
                  </div>
                </div>
              )}
              {/* Payment method selector */}
              {!isFreeEntryDay && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t("events.payment_method")}</Label>
                  <RadioGroup
                    value={paymentMethod}
                    onValueChange={(v) => setPaymentMethod(v as "cod" | "online")}
                    className="grid grid-cols-2 gap-2"
                  >
                    <Label
                      htmlFor="pay-cod"
                      className={`flex items-center gap-2 rounded-xl border px-3 py-3 cursor-pointer text-sm transition-colors ${paymentMethod === "cod" ? "border-primary bg-primary/10 text-primary" : "border-white/10 bg-black/20 text-muted-foreground hover:border-white/20"}`}
                    >
                      <RadioGroupItem id="pay-cod" value="cod" className="sr-only" />
                      <span className={`h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 ${paymentMethod === "cod" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
                      <span>{t("events.pay_cod")}</span>
                    </Label>
                    <Label
                      htmlFor="pay-online"
                      className={`flex items-center gap-2 rounded-xl border px-3 py-3 cursor-pointer text-sm transition-colors ${paymentMethod === "online" ? "border-primary bg-primary/10 text-primary" : "border-white/10 bg-black/20 text-muted-foreground hover:border-white/20"}`}
                    >
                      <RadioGroupItem id="pay-online" value="online" className="sr-only" />
                      <span className={`h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 ${paymentMethod === "online" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
                      <span>{t("events.pay_online_phonepe")}</span>
                    </Label>
                  </RadioGroup>
                  {paymentMethod === "cod" && (
                    <p className="text-xs text-muted-foreground">{t("events.cod_hint")}</p>
                  )}
                  {paymentMethod === "online" && (
                    <p className="text-xs text-muted-foreground">{t("events.online_hint")}</p>
                  )}
                </div>
              )}
              {/* Consent checkboxes */}
              <div className="space-y-3 pt-2 border-t border-white/10">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="agree-terms"
                    checked={agreedTerms}
                    onCheckedChange={(v) => setAgreedTerms(!!v)}
                    className="mt-0.5 shrink-0"
                  />
                  <Label htmlFor="agree-terms" className="text-xs text-muted-foreground leading-relaxed cursor-pointer font-normal">
                    I agree to the{" "}
                    <Link href="/terms" className="text-primary hover:underline underline-offset-2">Terms &amp; Conditions</Link>
                    {" "}and{" "}
                    <Link href="/privacy" className="text-primary hover:underline underline-offset-2">Privacy Policy</Link>
                  </Label>
                </div>
                {isPub && (
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="confirm-age"
                      checked={confirmedAge}
                      onCheckedChange={(v) => setConfirmedAge(!!v)}
                      className="mt-0.5 shrink-0"
                    />
                    <Label htmlFor="confirm-age" className="text-xs text-muted-foreground leading-relaxed cursor-pointer font-normal">
                      I confirm I am 18 or older and understand that alcohol will be served at this venue
                    </Label>
                  </div>
                )}
                {(!agreedTerms || (isPub && !confirmedAge)) && (
                  <p className="text-[11px] text-muted-foreground/70 pl-7">
                    Please tick {!agreedTerms && isPub && !confirmedAge ? "both boxes" : "the box above"} to proceed with your booking.
                  </p>
                )}
              </div>

              <Button
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground border-0 h-12 disabled:opacity-50"
                size="lg"
                onClick={handleBook}
                disabled={booking || !agreedTerms || (isPub && !confirmedAge)}
              >
                <CalIcon className="h-4 w-4 mr-2" />
                {booking ? t("events.booking_processing") : isFreeEntryDay ? t("events.confirm_booking") : paymentMethod === "cod" ? t("events.confirm_booking") : t("events.pay_and_book")}
              </Button>
            </div>
          </div>

          {availability.length > 0 && (
            <div className="rounded-3xl glass-card p-6">
              <p className="font-serif text-lg mb-3">{t("events.calendar_section")}</p>
              <div className="grid grid-cols-7 gap-1 text-xs">
                {availability.slice(0, 28).map((a) => (
                  <div
                    key={a.id}
                    className={`aspect-square rounded flex items-center justify-center ${
                      a.status === "available"
                        ? "bg-primary/10 text-primary"
                        : a.status === "booked"
                          ? "bg-muted text-muted-foreground line-through"
                          : "bg-destructive/10 text-destructive"
                    }`}
                    title={`${a.date} — ${a.status}`}
                  >
                    {Number(a.date.slice(8, 10))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
        </div>
      </div>
    </div>
  );
}

function TicketRow({ label, price, value, onChange, hidePrice }: { label: string; price: number; value: number; onChange: (n: number) => void; hidePrice?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex-1">
        <span className="font-medium">{label}</span>
        {!hidePrice && <span className="text-muted-foreground ml-2">{price > 0 ? formatINRExact(price) : "—"}</span>}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="h-7 w-7 rounded border border-border bg-background hover:bg-muted flex items-center justify-center font-bold select-none"
        >−</button>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="h-7 w-12 rounded border border-border bg-background text-center text-sm text-foreground"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="h-7 w-7 rounded border border-border bg-background hover:bg-muted flex items-center justify-center font-bold select-none"
        >+</button>
      </div>
    </div>
  );
}

