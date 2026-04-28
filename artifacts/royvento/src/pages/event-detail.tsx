import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetEvent,
  useListEventReviews,
  useListVendorAvailability,
  useCreateReview,
  useGetMe,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { EVENT_TYPES, BUDGET_RANGES, formatINR, formatINRExact, apiPost, apiGet, apiDelete } from "@/lib/api";
import { Star, MapPin, Users, Calendar as CalIcon, Tag, Lock, Wine, Sparkle, Coins, BadgeCheck, Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface Coupon { id: number; code: string; discountPercent: number; }
interface DiscountInfo { isNewUser: boolean; daysLeft: number; bookingDiscountPercent: number; subscriptionDiscountPercent: number; points: number; }

export function EventDetail() {
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

  const [date, setDate] = useState("");
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

  // Pub-specific state
  const isPub = (event as any)?.type === "pub";
  const [pubMode, setPubMode] = useState<"ticket" | "event">("ticket");
  const [ticketWomen, setTicketWomen] = useState(0);
  const [ticketMen, setTicketMen] = useState(0);
  const [ticketCouple, setTicketCouple] = useState(0);
  const [occasion, setOccasion] = useState("");
  const [pointsToUse, setPointsToUse] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "online">("cod");

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wishlist"] }); toast({ title: "Added to wishlist" }); },
    onError: () => toast({ title: "Could not add to wishlist", variant: "destructive" } as any),
  });
  const removeFromWishlist = useMutation({
    mutationFn: () => apiDelete(`/api/wishlist/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wishlist"] }); toast({ title: "Removed from wishlist" }); },
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
  if (!event) return <div className="container mx-auto px-4 py-20">Event not found.</div>;

  const ev = event as any;
  const blockedDates = new Set(
    availability.filter((a) => a.status !== "available").map((a) => a.date),
  );

  const DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const vendorOpenDays: string[] = (ev.vendor?.openDays ?? []) as string[];
  const selectedDayName = date ? DAY_ABBRS[new Date(`${date}T12:00:00`).getDay()] : "";
  const isClosedDay = !!(date && vendorOpenDays.length > 0 && !vendorOpenDays.includes(selectedDayName));

  const venueName = ev.vendor?.businessName ?? "This venue";

  // Compute subtotal based on mode
  let subtotal = 0;
  if (isPub && pubMode === "ticket") {
    subtotal =
      ticketWomen * Number(ev.priceWomen || 0) +
      ticketMen * Number(ev.priceMen || 0) +
      ticketCouple * Number(ev.priceCouple || 0);
  } else {
    subtotal = Number(ev.price) * Math.max(1, guests);
  }
  const couponDiscount = couponState?.valid ? Math.round(subtotal * (couponState.discountPercent / 100)) : 0;
  const newUserPercent = discountInfo?.isNewUser && !couponState?.valid ? (discountInfo.bookingDiscountPercent || 0) : 0;
  const newUserDiscount = newUserPercent > 0 ? Math.round(subtotal * (newUserPercent / 100)) : 0;
  const discount = Math.max(couponDiscount, newUserDiscount);
  const pointsCap = Math.max(0, subtotal - discount);
  const pointsAvail = Math.min(discountInfo?.points ?? 0, pointsCap);
  const pointsApplied = Math.min(pointsToUse, pointsAvail);
  const finalTotal = Math.max(0, subtotal - discount - pointsApplied);

  const startingAt = (() => {
    if (isPub) {
      const tiers = [Number(ev.priceWomen), Number(ev.priceMen), Number(ev.priceCouple)].filter((n) => n > 0);
      if (tiers.length > 0) return Math.min(...tiers);
    }
    return ev.startingPrice ?? ev.price ?? 0;
  })();

  const validateCoupon = async () => {
    if (!me?.user) {
      toast({ title: "Log in to use coupons", variant: "destructive" });
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
        toast({ title: `Coupon applied`, description: `${r.discountPercent}% off your booking.` });
      }
    } catch (e: any) {
      setCouponState(null);
      toast({ title: "Invalid coupon", description: e?.message, variant: "destructive" });
    }
  };

  const handleBook = async () => {
    if (!me?.user) {
      toast({ title: "Please log in to book", variant: "destructive" });
      setLocation("/login");
      return;
    }
    if (!date) {
      toast({ title: "Please select a date", variant: "destructive" });
      return;
    }
    if (isPub && pubMode === "ticket" && ticketWomen + ticketMen + ticketCouple === 0) {
      toast({ title: "Add at least one ticket", variant: "destructive" });
      return;
    }

    if (isPub && phone && !/^\d{10}$/.test(phone)) {
      toast({ title: "Invalid phone number", description: "Please enter a 10-digit mobile number.", variant: "destructive" });
      return;
    }
    if (isClosedDay) {
      toast({ title: `${ev.vendor?.businessName ?? "This venue"} is closed on ${selectedDayName}s`, description: "Please pick a date that falls on an open day.", variant: "destructive" });
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
            }
          : {}),
      });
      if (result?.requiresPayment && result?.redirectUrl) {
        toast({ title: "Redirecting to payment…", description: "You will be taken to PhonePe to complete your payment." });
        window.location.href = result.redirectUrl;
        return;
      }
      toast({ title: "Booking confirmed!", description: "Your booking is confirmed. Check your dashboard for details." });
      setLocation("/dashboard/bookings");
    } catch (e: any) {
      const errMsg: string = e?.message ?? "Try again.";
      if (paymentMethod === "online" && errMsg.toLowerCase().includes("payment system not configured")) {
        toast({ title: "Online payments not available", description: "Online payments are not set up yet — please choose Pay at Venue.", variant: "destructive" });
      } else {
        toast({ title: "Booking failed", description: errMsg, variant: "destructive" });
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
        onSuccess: () => { toast({ title: "Review posted" }); setReviewComment(""); refetchReviews(); },
        onError: (e: any) => toast({ title: "Failed to post", description: e?.message, variant: "destructive" }),
      },
    );
  };

  const loc = (event as any).city
    ? `${(event as any).city}${(event as any).state ? ", " + (event as any).state : ""}`
    : event.location;

  const vendorCover = ev.vendor?.coverImageUrl;

  return (
    <div>
      {/* Pub venue cover photo shown as a full-width banner above the event hero */}
      {isPub && vendorCover && (
        <div className="w-full h-48 md:h-64 overflow-hidden">
          <img src={vendorCover} alt="Venue cover" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="relative h-[58vh] w-full overflow-hidden">
        {event.imageUrl ? (
          <img src={event.imageUrl} alt={event.title} className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="container mx-auto px-4 md:px-6 absolute inset-x-0 bottom-0 pb-12">
          <div className="flex items-center gap-2 mb-3">
            <Badge className="bg-white/10 border-white/10 text-white backdrop-blur">{event.category}</Badge>
            {(event as any).type === "pub" && <Badge className="bg-primary/30 text-primary-foreground border-primary/30">Pub</Badge>}
            {(event as any).popular && (
              <Badge className="bg-primary border-0 text-primary-foreground">★ Popular</Badge>
            )}
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="font-serif text-4xl md:text-7xl tracking-tight max-w-4xl">{event.title}</h1>
              <p className="mt-3 text-white/70">
                by <Link href={`/partners/${event.vendor?.id ?? ""}`} className="underline-offset-4 hover:underline text-white">{event.vendorName}</Link>
              </p>
            </div>
            {me?.user && (
              <button
                onClick={() => inWishlist ? removeFromWishlist.mutate() : addToWishlist.mutate()}
                disabled={addToWishlist.isPending || removeFromWishlist.isPending}
                aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
                className="mt-2 shrink-0 p-2.5 rounded-full bg-black/40 backdrop-blur hover:bg-black/60 transition-colors"
              >
                <Heart className={`h-6 w-6 transition-colors ${inWishlist ? "fill-primary text-primary" : "text-white"}`} />
              </button>
            )}
          </div>
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

      <div className="container mx-auto px-4 md:px-6 py-12 grid lg:grid-cols-[1.7fr_1fr] gap-10">
        <div className="space-y-10">
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{loc}</div>
            <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Up to {event.capacity} guests</div>
            <div className="flex items-center gap-2"><Star className="h-4 w-4 fill-primary text-primary" />{event.rating > 0 ? `${event.rating.toFixed(1)} (${event.reviewCount})` : "New"}</div>
          </div>

          <section>
            <h2 className="font-serif text-3xl mb-3 accent-underline inline-block">About this event</h2>
            <p className="text-white/70 leading-relaxed whitespace-pre-line mt-4">{event.description}</p>
          </section>

          {event.vendor && (
            <section className="rounded-2xl glass-card p-6 lift-3d">
              <p className="text-xs uppercase tracking-wider text-primary mb-2">About the partner</p>
              <Link href={`/partners/${event.vendor.id}`} className="font-serif text-2xl hover:text-primary">{event.vendor.businessName}</Link>
              <p className="text-sm text-white/70 mt-2 leading-relaxed">{event.vendor.description}</p>
            </section>
          )}

          {isPub && announcements.length > 0 && (
            <section>
              <h2 className="font-serif text-3xl mb-5 accent-underline inline-block">Announcements</h2>
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
            <h2 className="font-serif text-3xl mb-5 accent-underline inline-block">Reviews</h2>
            {reviews.length === 0 ? (
              <p className="text-muted-foreground text-sm mt-4">No reviews yet — be the first.</p>
            ) : (
              <div className="space-y-4 mt-4">
                {reviews.map((r: any) => (
                  <div key={r.id} className="rounded-xl glass-card p-5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {r.userImage ? (
                          <img src={r.userImage} alt={r.userName} className="w-8 h-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-semibold shrink-0">
                            {r.userName?.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{r.userName}</p>
                          {r.verifiedBooking && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-green-400 font-medium">
                              <BadgeCheck className="h-3 w-3" /> Verified booking
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-4 w-4 ${i < r.rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                        ))}
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-white/70 leading-relaxed">{r.comment}</p>
                  </div>
                ))}
              </div>
            )}

            {me?.user && (
              <div className="mt-8 rounded-2xl glass-card-strong p-6 space-y-3">
                <p className="font-serif text-xl">Leave a review</p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setReviewRating(n)}>
                      <Star className={`h-6 w-6 ${n <= reviewRating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                    </button>
                  ))}
                </div>
                <Textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Share your experience…" className="bg-black/40 border-white/10" />
                <Button onClick={handleReview} disabled={createReview.isPending || !reviewComment.trim()} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">Post review</Button>
              </div>
            )}
          </section>

          {similarPubs.length > 0 && (
            <section>
              <h2 className="font-serif text-3xl mb-5 accent-underline inline-block">Similar Pubs Nearby</h2>
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
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start space-y-4">
          <div className="rounded-3xl glass-card-strong p-7 red-ring">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Starting at</p>
            <p className="font-serif text-5xl mt-1">{startingAt > 0 ? formatINR(startingAt) : "—"}</p>
            <p className="text-xs text-muted-foreground mb-5">
              {isPub ? "lowest entry price" : "per person · per event"}
            </p>

            {discountInfo?.isNewUser && (
              <div className="mb-4 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs flex items-center gap-2 text-primary">
                <Sparkle className="h-3.5 w-3.5" />
                New-member: {discountInfo.bookingDiscountPercent}% off this booking
              </div>
            )}

            <div className="space-y-4">
              <div>
                <Label htmlFor="bdate">Date</Label>
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
                    Open: {vendorOpenDays.join(", ")}
                  </p>
                )}
              </div>

              {isPub ? (
                <>
                  <div>
                    <Label className="flex items-center gap-1.5"><Wine className="h-3.5 w-3.5 text-primary" />Booking type</Label>
                    <RadioGroup
                      value={pubMode}
                      onValueChange={(v) => setPubMode(v as "ticket" | "event")}
                      className="grid grid-cols-2 gap-2 mt-2"
                    >
                      <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer ${pubMode === "ticket" ? "border-primary bg-primary/10" : "border-white/10"}`}>
                        <RadioGroupItem value="ticket" />
                        <span className="text-sm">Buy tickets</span>
                      </label>
                      <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer ${pubMode === "event" ? "border-primary bg-primary/10" : "border-white/10"}`}>
                        <RadioGroupItem value="event" />
                        <span className="text-sm">Group or corporate booking</span>
                      </label>
                    </RadioGroup>
                  </div>

                  {pubMode === "ticket" && (
                    <div className="space-y-2 rounded-xl border border-white/10 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Ticket counts</p>
                      <TicketRow label="Women" price={Number(ev.priceWomen || 0)} value={ticketWomen} onChange={setTicketWomen} />
                      <TicketRow label="Men" price={Number(ev.priceMen || 0)} value={ticketMen} onChange={setTicketMen} />
                      <TicketRow label="Couple" price={Number(ev.priceCouple || 0)} value={ticketCouple} onChange={setTicketCouple} />
                    </div>
                  )}

                  {pubMode === "event" && (
                    <>
                      <div>
                        <Label htmlFor="occasion">Occasion</Label>
                        <Select value={occasion} onValueChange={setOccasion}>
                          <SelectTrigger id="occasion" className="bg-black/40 border-white/10 mt-1">
                            <SelectValue placeholder="Select occasion…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="farewell">Farewell</SelectItem>
                            <SelectItem value="office-party">Office Party</SelectItem>
                            <SelectItem value="casual-party">Casual Party</SelectItem>
                            <SelectItem value="birthday">Birthday</SelectItem>
                            <SelectItem value="others">Others</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="guests">Guests <span className="text-muted-foreground font-normal text-xs">(min 10)</span></Label>
                        <Input id="guests" type="number" min={10} max={event.capacity} value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="bg-black/40 border-white/10 mt-1" />
                      </div>
                    </>
                  )}

                  <div>
                    <Label htmlFor="pname">Booking under name</Label>
                    <Input id="pname" value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Name on the booking" className="bg-black/40 border-white/10 mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="pphone">Phone number</Label>
                    <Input
                      id="pphone"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="10-digit mobile number"
                      className="bg-black/40 border-white/10 mt-1"
                    />
                    {phone.length > 0 && phone.length < 10 && (
                      <p className="text-xs text-destructive mt-1">Enter a valid 10-digit number</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label htmlFor="etype">Event type</Label>
                    <Select value={eventType} onValueChange={setEventType}>
                      <SelectTrigger id="etype" className="bg-black/40 border-white/10 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EVENT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="budget">Budget range</Label>
                    <Select value={budget} onValueChange={setBudget}>
                      <SelectTrigger id="budget" className="bg-black/40 border-white/10 mt-1">
                        <SelectValue placeholder="Optional" />
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
                    <Label htmlFor="guests">Guests</Label>
                    <Input id="guests" type="number" min={1} max={event.capacity} value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="bg-black/40 border-white/10 mt-1" />
                  </div>
                </>
              )}

              {pointsAvail > 0 && (
                <div>
                  <Label htmlFor="ppoints" className="flex items-center gap-1.5">
                    <Coins className="h-3.5 w-3.5 text-primary" />
                    Use points (1 pt = ₹1) — {discountInfo?.points ?? 0} available
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
              <div>
                <Label className="flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5 text-primary" /> Coupon code
                  {!me?.user && <Lock className="h-3 w-3 text-muted-foreground ml-1" />}
                </Label>
                {!me?.user ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    <Link href="/login" className="text-primary hover:underline">Log in</Link> to apply a coupon and unlock 10% off.
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
                      <Button type="button" variant="outline" onClick={validateCoupon} className="border-white/15">Apply</Button>
                    </div>
                    {couponState?.valid && (
                      <p className="text-xs text-green-400 mt-1">✓ {couponState.discountPercent}% off applied</p>
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
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should know?" className="bg-black/40 border-white/10 mt-1" />
              </div>
              <div className="space-y-1.5 border-t border-white/10 pt-3 text-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatINRExact(subtotal)}</span>
                </div>
                {couponDiscount > 0 && couponDiscount === discount && (
                  <div className="flex items-center justify-between text-green-400">
                    <span>Coupon</span>
                    <span>– {formatINRExact(couponDiscount)}</span>
                  </div>
                )}
                {newUserDiscount > 0 && newUserDiscount === discount && couponDiscount < newUserDiscount && (
                  <div className="flex items-center justify-between text-green-400">
                    <span>New-member {newUserPercent}% off</span>
                    <span>– {formatINRExact(newUserDiscount)}</span>
                  </div>
                )}
                {pointsApplied > 0 && (
                  <div className="flex items-center justify-between text-primary">
                    <span>Points</span>
                    <span>– {formatINRExact(pointsApplied)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between font-semibold text-lg pt-1">
                  <span>Total</span>
                  <span>{formatINRExact(finalTotal)}</span>
                </div>
              </div>
              {/* Payment method selector */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Payment Method</Label>
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
                    <span>Pay at Venue</span>
                  </Label>
                  <Label
                    htmlFor="pay-online"
                    className={`flex items-center gap-2 rounded-xl border px-3 py-3 cursor-pointer text-sm transition-colors ${paymentMethod === "online" ? "border-primary bg-primary/10 text-primary" : "border-white/10 bg-black/20 text-muted-foreground hover:border-white/20"}`}
                  >
                    <RadioGroupItem id="pay-online" value="online" className="sr-only" />
                    <span className={`h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 ${paymentMethod === "online" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
                    <span>Pay Online</span>
                  </Label>
                </RadioGroup>
                {paymentMethod === "cod" && (
                  <p className="text-xs text-muted-foreground">Your booking is confirmed instantly. Pay at the venue on the day.</p>
                )}
                {paymentMethod === "online" && (
                  <p className="text-xs text-muted-foreground">You will be redirected to PhonePe to pay securely online.</p>
                )}
              </div>
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground border-0 h-12" size="lg" onClick={handleBook} disabled={booking}>
                <CalIcon className="h-4 w-4 mr-2" />
                {booking ? "Booking…" : paymentMethod === "cod" ? "Confirm Booking" : "Pay & Book"}
              </Button>
            </div>
          </div>

          {availability.length > 0 && (
            <div className="rounded-3xl glass-card p-6">
              <p className="font-serif text-lg mb-3">Calendar</p>
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
  );
}

function TicketRow({ label, price, value, onChange }: { label: string; price: number; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground ml-2">{price > 0 ? formatINRExact(price) : "—"}</span>
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

