import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetEvent,
  useListEventReviews,
  useListVendorAvailability,
  useCreateBooking,
  useCreateReview,
  useGetMe,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EVENT_TYPES } from "@/lib/api";
import { Star, MapPin, Users, Calendar as CalIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");

  const createBooking = useCreateBooking();
  const createReview = useCreateReview();

  if (isLoading) return <div className="container mx-auto px-4 py-20">Loading…</div>;
  if (!event) return <div className="container mx-auto px-4 py-20">Event not found.</div>;

  const blockedDates = new Set(
    availability.filter((a) => a.status !== "available").map((a) => a.date),
  );

  const handleBook = () => {
    if (!me?.user) {
      toast({ title: "Please log in to book", variant: "destructive" });
      setLocation("/login");
      return;
    }
    if (!date) {
      toast({ title: "Please select a date", variant: "destructive" });
      return;
    }
    createBooking.mutate(
      { data: { eventId: event.id, bookingDate: date, guests, notes, eventType } as any },
      {
        onSuccess: () => {
          toast({ title: "Booking requested!", description: "Your booking is pending vendor confirmation." });
          setLocation("/dashboard/bookings");
        },
        onError: (e: any) =>
          toast({ title: "Booking failed", description: e?.message ?? "Try again.", variant: "destructive" }),
      },
    );
  };

  const handleReview = () => {
    if (!me?.user) {
      toast({ title: "Log in to leave a review", variant: "destructive" });
      setLocation("/login");
      return;
    }
    if (!event.vendor) return;
    createReview.mutate(
      { data: { eventId: event.id, vendorId: event.vendor.id, rating: reviewRating, comment: reviewComment } },
      {
        onSuccess: () => {
          toast({ title: "Review posted" });
          setReviewComment("");
          refetchReviews();
        },
        onError: (e: any) =>
          toast({ title: "Failed to post", description: e?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div>
      <div className="relative h-[55vh] w-full overflow-hidden">
        {event.imageUrl ? (
          <img src={event.imageUrl} alt={event.title} className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="container mx-auto px-4 md:px-6 absolute inset-x-0 bottom-0 pb-10">
          <Badge className="mb-3" variant="secondary">{event.category}</Badge>
          <h1 className="font-serif text-4xl md:text-6xl tracking-tight max-w-3xl">{event.title}</h1>
          <p className="mt-3 text-muted-foreground">
            by <Link href={`/vendors/${event.vendor?.id ?? ""}`} className="underline-offset-4 hover:underline text-foreground">{event.vendorName}</Link>
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-12 grid lg:grid-cols-[1.7fr_1fr] gap-10">
        <div className="space-y-10">
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{event.location}</div>
            <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Up to {event.capacity} guests</div>
            <div className="flex items-center gap-2"><Star className="h-4 w-4 fill-primary text-primary" />{event.rating > 0 ? `${event.rating.toFixed(1)} (${event.reviewCount})` : "New"}</div>
          </div>

          <section>
            <h2 className="font-serif text-2xl mb-3">About this event</h2>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{event.description}</p>
          </section>

          {event.vendor && (
            <section className="rounded-2xl border bg-card p-6">
              <p className="text-xs uppercase tracking-wider text-primary mb-2">About the vendor</p>
              <Link href={`/vendors/${event.vendor.id}`} className="font-serif text-2xl hover:text-primary">{event.vendor.businessName}</Link>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{event.vendor.description}</p>
            </section>
          )}

          <section>
            <h2 className="font-serif text-2xl mb-5">Reviews</h2>
            {reviews.length === 0 ? (
              <p className="text-muted-foreground text-sm">No reviews yet — be the first.</p>
            ) : (
              <div className="space-y-4">
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

            {me?.user && (
              <div className="mt-8 rounded-2xl border bg-card p-6 space-y-3">
                <p className="font-serif text-xl">Leave a review</p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setReviewRating(n)}>
                      <Star className={`h-6 w-6 ${n <= reviewRating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                    </button>
                  ))}
                </div>
                <Textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Share your experience…" />
                <Button onClick={handleReview} disabled={createReview.isPending || !reviewComment.trim()}>Post review</Button>
              </div>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start space-y-4">
          <div className="rounded-2xl border bg-card p-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Starting at</p>
            <p className="font-serif text-4xl">${event.price.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mb-5">per event / per person</p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                />
                {date && blockedDates.has(date) && (
                  <p className="text-xs text-destructive mt-1">That date is unavailable.</p>
                )}
              </div>
              <div>
                <Label htmlFor="etype">Event type</Label>
                <Select value={eventType} onValueChange={setEventType}>
                  <SelectTrigger id="etype"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="guests">Guests</Label>
                <Input id="guests" type="number" min={1} max={event.capacity} value={guests} onChange={(e) => setGuests(Number(e.target.value))} />
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should know?" />
              </div>
              <div className="flex items-center justify-between text-sm border-t pt-3">
                <span className="text-muted-foreground">Estimated total</span>
                <span className="font-semibold">${(event.price * guests).toLocaleString()}</span>
              </div>
              <Button className="w-full" size="lg" onClick={handleBook} disabled={createBooking.isPending}>
                <CalIcon className="h-4 w-4 mr-2" />
                {createBooking.isPending ? "Booking…" : "Request booking"}
              </Button>
            </div>
          </div>

          {availability.length > 0 && (
            <div className="rounded-2xl border bg-card p-6">
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
              <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
                <span><span className="inline-block h-2 w-2 rounded-full bg-primary mr-1" />Open</span>
                <span><span className="inline-block h-2 w-2 rounded-full bg-muted-foreground mr-1" />Booked</span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
