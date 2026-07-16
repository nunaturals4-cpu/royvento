import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Phone, Mail, Calendar as CalIcon, Clock, MapPin, IndianRupee } from "lucide-react";
import { apiGet, formatINR } from "@/lib/api";

export type BookingPartnerRole = "vendor" | "organizer" | "game";

interface BookingDetailModalProps {
  /** null closes the modal. */
  bookingId: number | null;
  role: BookingPartnerRole;
  onClose: () => void;
}

function endpointFor(role: BookingPartnerRole, id: number): string {
  if (role === "organizer") return `/api/organizer/bookings/${id}`;
  if (role === "game") return `/api/game-organizer/bookings/${id}`;
  return `/api/bookings/vendor/${id}`;
}

function pubModeLabel(pubMode: string | undefined): string {
  switch (pubMode) {
    case "event": return "Table";
    case "vip_table": return "VIP Table";
    case "ticket": return "Ticket";
    case "event_booking": return "Event Ticket";
    case "game_booking": return "Game Booking";
    default: return "Booking";
  }
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "cancelled") return "destructive";
  if (status === "confirmed" || status === "completed") return "default";
  return "secondary";
}

function formatLongDate(dateStr: string | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function BookingDetailModal({ bookingId, role, onClose }: BookingDetailModalProps) {
  const open = bookingId != null;

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["booking-detail", role, bookingId],
    queryFn: () => apiGet<any>(endpointFor(role, bookingId as number)),
    enabled: open,
  });

  const name = data?.personName || data?.attendee || "Guest";
  const phone = data?.phone || "";
  const email = data?.email || data?.userEmail || "";
  const bookingDate = data?.bookingDate || "";
  const time = data?.arrivalTime || data?.time || "";
  const status = data?.status || "";
  const paymentMethod = data?.paymentMethod || "online";
  const location = data?.bookingLocation || "";
  const eventTitle = data?.eventTitle || data?.itemName || data?.gameName || data?.packageName || "";

  const typeLabel = role === "vendor"
    ? pubModeLabel(data?.pubMode)
    : role === "organizer"
      ? (data?.ticketType || "Event Ticket")
      : (data?.itemName || data?.gameName || data?.packageName || "Game Booking");

  const guestsLabel = role === "vendor"
    ? `${data?.guests ?? 0} guest${(data?.guests ?? 0) === 1 ? "" : "s"}`
    : role === "organizer"
      ? `${data?.quantity ?? 0} ticket${(data?.quantity ?? 0) === 1 ? "" : "s"}`
      : `${data?.persons ?? 0} person${(data?.persons ?? 0) === 1 ? "" : "s"}`;

  const amount = role === "vendor" ? Number(data?.finalPrice ?? 0) : Number(data?.amount ?? 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-black border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">Booking details</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError || !data ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Couldn't load this booking.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-lg">{name}</p>
                {eventTitle && <p className="text-sm text-muted-foreground">{eventTitle}</p>}
              </div>
              {status && <Badge variant={statusBadgeVariant(status)} className="capitalize shrink-0">{status}</Badge>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Booking type</p>
                <p className="font-medium">{typeLabel} · {guestsLabel}</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Payment mode</p>
                <p className="font-medium">{paymentMethod === "cod" ? "Cash on Arrival" : "Online Payment"}</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-start gap-2">
                <CalIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Date &amp; time</p>
                  <p className="font-medium">{formatLongDate(bookingDate)}{time ? ` · ${time}` : ""}</p>
                </div>
              </div>
              {amount > 0 && (
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-start gap-2">
                  <IndianRupee className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Amount</p>
                    <p className="font-medium">{formatINR(amount)}</p>
                  </div>
                </div>
              )}
              {location && (
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-start gap-2 sm:col-span-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Guest location</p>
                    <p className="font-medium">{location}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
              {phone && (
                <Button asChild size="sm" className="gap-2">
                  <a href={`tel:${phone}`}><Phone className="h-4 w-4" /> Call {phone}</a>
                </Button>
              )}
              {email && (
                <Button asChild size="sm" variant="outline" className="gap-2">
                  <a href={`mailto:${email}`}><Mail className="h-4 w-4" /> Email</a>
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
