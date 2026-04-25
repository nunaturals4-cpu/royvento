import { Link } from "wouter";
import { useListMyBookings } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Users } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  confirmed: "default",
  completed: "outline",
  cancelled: "destructive",
};

export function Bookings() {
  const { data: bookings = [], isLoading } = useListMyBookings();

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Your account</p>
        <h1 className="font-serif text-4xl tracking-tight">My bookings</h1>
        <p className="mt-2 text-muted-foreground">Every event you've booked or requested.</p>
      </header>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : bookings.length === 0 ? (
        <div className="rounded-2xl border bg-card p-16 text-center">
          <p className="font-serif text-2xl mb-2">No bookings yet</p>
          <p className="text-muted-foreground mb-6">Discover events to book your first one.</p>
          <Link href="/explore"><Button>Browse events</Button></Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => (
            <div key={b.id} className="rounded-2xl border bg-card overflow-hidden flex flex-col md:flex-row">
              {b.eventImage && (
                <div className="md:w-56 aspect-video md:aspect-auto bg-muted">
                  <img src={b.eventImage} alt={b.eventTitle} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="flex-1 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[b.status] ?? "default"}>{b.status}</Badge>
                    <span className="text-xs text-muted-foreground">Booked {new Date(b.createdAt).toLocaleDateString()}</span>
                  </div>
                  <Link href={`/events/${b.eventId}`} className="font-serif text-2xl hover:text-primary">{b.eventTitle}</Link>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{b.vendorName}</p>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-2">
                    <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-primary" />{b.bookingDate}</span>
                    <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" />{b.guests} guests</span>
                  </div>
                  {b.notes && <p className="text-sm italic text-muted-foreground">"{b.notes}"</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-serif text-3xl">${b.totalPrice.toLocaleString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
