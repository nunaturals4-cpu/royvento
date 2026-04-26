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
import { EVENT_TYPES, BUDGET_RANGES, formatINR, apiPost, apiGet } from "@/lib/api";
import { Star, MapPin, Users, Calendar as CalIcon, Tag, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Coupon { id: number; code: string; discountPercent: number; }

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

  const [date, setDate] = useState("");
  const [guests, setGuests] = useState(1);
  const [notes, setNotes] = useState("");
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

  const createReview = useCreateReview();

  useEffect(() => {
    if (!me?.user) return;
    apiGet<Coupon[]>("/api/coupons/me").then(setMyCoupons).catch(() => {});
  }, [me?.user]);

  if (isLoading) return <div className="container mx-auto px-4 py-20">Loading…</div>;
  if (!event) return <div className="container mx-auto px-4 py-20">Event not found.</div>;

  const blockedDates = new Set(
    availability.filter((a) => a.status !== "available").map((a) => a.date),
  );

  const subtotal = event.price * guests;
  const discount = couponState?.valid ? Math.round(subtotal * (couponState.discountPercent / 100)) : 0;
  const finalTotal = Math.max(0, subtotal - discount);

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
    setBooking(true);
    try {
      await apiPost("/api/bookings", {
        eventId: event.id,
        bookingDate: date,
        guests,
        notes,
        eventType,
        budgetRange: budget === "any" ? "" : budget,
        couponCode: couponState?.valid ? couponState.code : "",
      });
      toast({ title: "Booking requested!", description: "Your booking is pending partner confirmation." });
      setLocation("/dashboard/bookings");
    } catch (e: any) {
      toast({ title: "Booking failed", description: e?.message ?? "Try again.", variant: "destructive" });
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

  return (
    <div>
      <div className="relative h-[58vh] w-full overflow-hidden">
        {event.imageUrl ? (
          <img src={event.imageUrl} alt={event.title} className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="container mx-auto px-4 md:px-6 absolute inset-x-0 bottom-0 pb-12">
          <div className="flex items-center gap-2 mb-3">
            <Badge className="bg-white/10 border-white/10 text-white backdrop-blur">{event.category}</Badge>
            {(event as any).type === "pub" && <Badge className="bg-red-600/30 text-red-100 border-red-500/30">Pub</Badge>}
            {(event as any).popular && (
              <Badge className="bg-gradient-to-br from-red-500 to-red-700 border-0">★ Popular</Badge>
            )}
          </div>
          <h1 className="font-serif text-4xl md:text-7xl tracking-tight max-w-4xl">{event.title}</h1>
          <p className="mt-3 text-white/70">
            by <Link href={`/partners/${event.vendor?.id ?? ""}`} className="underline-offset-4 hover:underline text-white">{event.vendorName}</Link>
          </p>
        </div>
      </div>

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

          <section>
            <h2 className="font-serif text-3xl mb-5 accent-underline inline-block">Reviews</h2>
            {reviews.length === 0 ? (
              <p className="text-muted-foreground text-sm mt-4">No reviews yet — be the first.</p>
            ) : (
              <div className="space-y-4 mt-4">
                {reviews.map((r) => (
                  <div key={r.id} className="rounded-xl glass-card p-5">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{r.userName}</p>
                      <div className="flex items-center gap-1">
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
                <Button onClick={handleReview} disabled={createReview.isPending || !reviewComment.trim()} className="bg-gradient-to-br from-red-600 to-red-800 border-0">Post review</Button>
              </div>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start space-y-4">
          <div className="rounded-3xl glass-card-strong p-7 red-ring">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Starting at</p>
            <p className="font-serif text-5xl mt-1">{formatINR(event.price)}</p>
            <p className="text-xs text-muted-foreground mb-5">per person · per event</p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="bg-black/40 border-white/10 mt-1"
                />
                {date && blockedDates.has(date) && (
                  <p className="text-xs text-destructive mt-1">That date is unavailable.</p>
                )}
              </div>
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
                            className="text-[10px] px-2 py-1 rounded bg-red-600/15 border border-red-500/30 text-red-200 hover:bg-red-600/25"
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
                  <span>{formatINR(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex items-center justify-between text-green-400">
                    <span>Discount</span>
                    <span>– {formatINR(discount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between font-semibold text-lg pt-1">
                  <span>Total</span>
                  <span>{formatINR(finalTotal)}</span>
                </div>
              </div>
              <Button className="w-full bg-gradient-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 border-0 h-12" size="lg" onClick={handleBook} disabled={booking}>
                <CalIcon className="h-4 w-4 mr-2" />
                {booking ? "Booking…" : "Request booking"}
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

