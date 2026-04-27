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
import { EVENT_TYPES, BUDGET_RANGES, formatINR, formatINRExact, apiPost, apiGet } from "@/lib/api";
import { Star, MapPin, Users, Calendar as CalIcon, Tag, Lock, Wine, Sparkle, Coins } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

  const [date, setDate] = useState("");
  const [guests, setGuests] = useState(1);
  const [notes, setNotes] = useState("");
  const [personName, setPersonName] = useState("");
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

  // Pub-specific state
  const isPub = (event as any)?.type === "pub";
  const [pubMode, setPubMode] = useState<"ticket" | "event">("ticket");
  const [ticketWomen, setTicketWomen] = useState(0);
  const [ticketMen, setTicketMen] = useState(0);
  const [ticketCouple, setTicketCouple] = useState(0);
  const [selectedPubEvent, setSelectedPubEvent] = useState("");
  const [pointsToUse, setPointsToUse] = useState(0);

  const createReview = useCreateReview();

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

  const startingAt = ev.startingPrice ?? ev.price;

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
    if (isPub && pubMode === "event" && !selectedPubEvent) {
      toast({ title: "Pick an event from the dropdown", variant: "destructive" });
      return;
    }
    setBooking(true);
    try {
      await apiPost("/api/bookings", {
        eventId: event.id,
        bookingDate: date,
        guests: isPub && pubMode === "ticket" ? (ticketWomen + ticketMen + ticketCouple * 2) : guests,
        notes,
        eventType,
        budgetRange: budget === "any" ? "" : budget,
        couponCode: couponState?.valid ? couponState.code : "",
        personName,
        pointsToUse: pointsApplied,
        ...(isPub
          ? {
              pubMode,
              ticketWomen, ticketMen, ticketCouple,
              selectedPubEvent: pubMode === "event" ? selectedPubEvent : "",
            }
          : {}),
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
            <p className="font-serif text-5xl mt-1">{formatINR(startingAt)}</p>
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
                        <span className="text-sm">Book the event</span>
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
                        <Label htmlFor="pevent">Pick an event</Label>
                        <Select value={selectedPubEvent} onValueChange={setSelectedPubEvent}>
                          <SelectTrigger id="pevent" className="bg-black/40 border-white/10 mt-1">
                            <SelectValue placeholder="Select event…" />
                          </SelectTrigger>
                          <SelectContent>
                            {(ev.pubEventTypes ?? []).length === 0 && <SelectItem value="general">General booking</SelectItem>}
                            {(ev.pubEventTypes ?? []).map((t: string) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
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

                  <div>
                    <Label htmlFor="pname">Booking under name</Label>
                    <Input id="pname" value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Name on the booking" className="bg-black/40 border-white/10 mt-1" />
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

function TicketRow({ label, price, value, onChange }: { label: string; price: number; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground ml-2">{price > 0 ? formatINRExact(price) : "—"}</span>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="h-7 w-7 rounded border border-white/15 hover:bg-white/5">−</button>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="h-7 w-12 rounded border border-white/15 bg-black/40 text-center text-sm"
          disabled={price <= 0}
        />
        <button type="button" onClick={() => onChange(value + 1)} className="h-7 w-7 rounded border border-white/15 hover:bg-white/5" disabled={price <= 0}>+</button>
      </div>
    </div>
  );
}

