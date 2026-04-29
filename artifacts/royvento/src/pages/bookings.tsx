import { Link } from "wouter";
import { useState } from "react";
import QRCode from "qrcode";
import { useListMyBookings } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Users, Tag, Wine, Ticket as TicketIcon, Printer, Download, AlertCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatINR, formatINRExact, apiPatch } from "@/lib/api";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  payment_pending: "secondary",
  confirmed: "default",
  completed: "outline",
  cancelled: "destructive",
};

export function Bookings() {
  const { data: bookings = [], isLoading, refetch } = useListMyBookings();

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-2 accent-underline inline-block">Your account</p>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-3">My bookings</h1>
        <p className="mt-2 text-muted-foreground">Every event you've booked or requested.</p>
      </header>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : bookings.length === 0 ? (
        <div className="rounded-3xl glass-card p-16 text-center">
          <p className="font-serif text-2xl mb-2">No bookings yet</p>
          <p className="text-muted-foreground mb-6">Discover events to book your first one.</p>
          <Link href="/explore"><Button className="bg-gradient-to-br from-red-600 to-red-800 border-0">Browse events</Button></Link>
        </div>
      ) : (
        <div className="space-y-6">
          {bookings.map((b: any) => <BookingCard key={b.id} b={b} onRefetch={refetch} />)}
        </div>
      )}
    </div>
  );
}

function BookingCard({ b, onRefetch }: { b: any; onRefetch: () => void }) {
  const isPubTicket = (b.eventType_ === "pub" || b.pubMode === "ticket") && b.pubMode === "ticket";
  const showTicket = isPubTicket && (b.status === "confirmed" || b.status === "completed");
  const [cancelOpen, setCancelOpen] = useState(false);
  // cancellationAllowed is computed server-side; fall back to true so old API responses stay functional
  const cancellationBlocked = b.cancellationAllowed === false;
  const checkedIn = b.checkedIn === true;

  return (
    <div className="rounded-2xl glass-card overflow-hidden flex flex-col md:flex-row lift-3d">
      {b.eventImage && (
        <div className="md:w-56 aspect-video md:aspect-auto bg-muted">
          <img src={b.eventImage} alt={b.eventTitle} className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex-1 p-6 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={STATUS_VARIANT[b.status] ?? "default"}>{b.status}</Badge>
              {b.eventType_ === "pub" && <Badge className="bg-red-600/20 border-red-500/40 text-red-200"><Wine className="h-3 w-3 mr-1" />Pub</Badge>}
              {b.pubMode === "ticket" && <Badge variant="outline"><TicketIcon className="h-3 w-3 mr-1" />Ticket</Badge>}
              {b.pubMode === "event" && <Badge variant="outline">Event booking</Badge>}
              <span className="text-xs text-muted-foreground">Booked {new Date(b.createdAt).toLocaleDateString()}</span>
            </div>
            <Link href={`/events/${b.eventId}`} className="font-serif text-2xl hover:text-primary">{b.eventTitle}</Link>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{b.vendorName}</p>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-2">
              <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-primary" />{b.bookingDate}</span>
              <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" />{b.guests} guests</span>
              {b.couponCode && (
                <span className="flex items-center gap-1.5 text-green-400">
                  <Tag className="h-4 w-4" />Coupon {b.couponCode}
                </span>
              )}
              {b.pointsUsed > 0 && (
                <span className="flex items-center gap-1.5 text-primary">
                  ⬢ {b.pointsUsed} pts used
                </span>
              )}
            </div>
            {b.pubMode === "ticket" && (b.ticketWomen || b.ticketMen || b.ticketCouple) ? (
              <p className="text-sm text-muted-foreground">
                Tickets:
                {b.ticketWomen ? ` ${b.ticketWomen}× Women` : ""}
                {b.ticketMen ? ` ${b.ticketMen}× Men` : ""}
                {b.ticketCouple ? ` ${b.ticketCouple}× Couple` : ""}
              </p>
            ) : null}
            {b.pubMode === "event" && b.selectedPubEvent && (
              <p className="text-sm text-muted-foreground">Event: {b.selectedPubEvent}</p>
            )}
            {b.notes && <p className="text-sm italic text-muted-foreground">"{b.notes}"</p>}
            {b.status === "pending" && (
              <p className="text-xs text-amber-400">Awaiting partner or admin approval.</p>
            )}
            {b.status === "payment_pending" && (
              <p className="text-xs text-amber-400">Payment pending — complete your payment to confirm this booking.</p>
            )}
            {b.status === "cancelled" && b.rejectionReason && (
              <div className="mt-2 rounded-lg border border-red-500/30 bg-red-900/20 px-3 py-2">
                <p className="text-xs text-red-300 font-medium mb-0.5">Cancellation reason</p>
                <p className="text-xs text-red-200">{b.rejectionReason}</p>
              </div>
            )}
          </div>
          <div className="text-right flex flex-col items-end gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-serif text-3xl">{formatINRExact(b.finalPrice ?? b.totalPrice)}</p>
              {b.finalPrice != null && b.finalPrice !== b.totalPrice && (
                <p className="text-xs text-muted-foreground line-through">{formatINRExact(b.totalPrice)}</p>
              )}
            </div>
            {b.status === "confirmed" && (
              checkedIn ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-not-allowed select-none border border-white/10 rounded-md px-3 py-1.5">
                        <TicketIcon className="h-3.5 w-3.5 text-green-400" />
                        Checked in
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-56 text-center">
                      Your ticket has already been scanned — this booking can no longer be cancelled.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : cancellationBlocked ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-not-allowed select-none border border-white/10 rounded-md px-3 py-1.5">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                        Cancellation closed
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-56 text-center">
                      Cancellations are not allowed within 24 hours of the event date.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setCancelOpen(true)}
                  className="text-xs"
                >
                  Cancel booking
                </Button>
              )
            )}
          </div>
        </div>

        {showTicket && !cancelOpen && <PremiumTicket b={b} />}
      </div>

      <CancelBookingDialog
        open={!checkedIn && cancelOpen}
        onClose={() => setCancelOpen(false)}
        booking={b}
        onCancelled={onRefetch}
      />
    </div>
  );
}

function CancelBookingDialog({
  open,
  onClose,
  booking,
  onCancelled,
}: {
  open: boolean;
  onClose: () => void;
  booking: any;
  onCancelled: () => void;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleCancel = async () => {
    if (!reason.trim()) {
      toast({ title: "Please provide a cancellation reason.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiPatch(`/api/bookings/${booking.id}/cancel`, { cancellationReason: reason.trim() });
      toast({ title: "Booking cancelled", description: "Your booking has been cancelled." });
      onCancelled();
      onClose();
      setReason("");
    } catch (err: any) {
      toast({
        title: "Failed to cancel",
        description: err?.message ?? "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel booking</DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel your booking for <strong>{booking.eventTitle}</strong> on {booking.bookingDate}?
            The partner will be notified. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <label className="text-sm font-medium">Reason for cancellation</label>
          <Textarea
            placeholder="e.g. Plans have changed, wrong date selected…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Keep booking
          </Button>
          <Button variant="destructive" onClick={handleCancel} disabled={loading || !reason.trim()}>
            {loading ? "Cancelling…" : "Confirm cancellation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PremiumTicket({ b }: { b: any }) {
  const printTicket = async () => {
    const esc = (v: unknown): string =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const ticketCode: string = b.ticketCode ?? `RV-${String(b.id).padStart(6, "0")}`;

    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;

    let qrSvgHtml = "";
    try {
      const svgString = await QRCode.toString(ticketCode, {
        type: "svg",
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
        width: 120,
      });
      qrSvgHtml = `
        <div class="qr-wrap">
          ${svgString}
          <p class="qr-code">${esc(ticketCode)}</p>
        </div>`;
    } catch (_) {
      qrSvgHtml = `<div class="qr-wrap"><p class="qr-code">${esc(ticketCode)}</p></div>`;
    }

    const total = (b.ticketWomen ?? 0) + (b.ticketMen ?? 0) + (b.ticketCouple ?? 0) * 2;
    const ticketBreakdown = [
      b.ticketWomen ? `${b.ticketWomen}\u00d7 Women` : "",
      b.ticketMen ? `${b.ticketMen}\u00d7 Men` : "",
      b.ticketCouple ? `${b.ticketCouple}\u00d7 Couple` : "",
    ].filter(Boolean).map(esc).join(" &middot; ");
    w.document.write(`<!doctype html><html><head><title>Royvento Ticket #${esc(b.id)}</title>
      <style>
        *{box-sizing:border-box;}
        body{margin:0;font-family:Georgia,serif;background:#0a0a0a;color:#fff;padding:24px;}
        .ticket{background:linear-gradient(135deg,#1a0a0a 0%,#350f0f 100%);border:1px solid rgba(255,80,80,.4);border-radius:24px;padding:32px;max-width:640px;margin:0 auto;box-shadow:0 30px 60px rgba(220,38,38,.3);}
        .header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;}
        .header-info{flex:1;min-width:0;}
        .brand{font-size:13px;letter-spacing:.4em;text-transform:uppercase;color:#fca5a5;}
        .top-row{display:flex;justify-content:space-between;align-items:center;gap:8px;}
        .code{font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#fca5a5;background:rgba(255,255,255,.08);padding:4px 10px;border-radius:8px;}
        h1{font-size:30px;margin:8px 0 2px;font-family:'Playfair Display',Georgia,serif;font-weight:normal;}
        .venue{font-size:12px;color:#9ca3af;margin:0;}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px;}
        .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#9ca3af;margin:0;}
        .val{font-size:17px;margin:2px 0 0;}
        .val-sm{font-size:14px;margin:2px 0 0;color:#e5e7eb;}
        hr{border:none;border-top:1px dashed rgba(255,255,255,.15);margin:20px 0;}
        .totals{display:flex;justify-content:space-between;font-size:18px;align-items:center;}
        .totals-lbl{color:#9ca3af;}
        .totals-val{font-size:22px;font-family:'Playfair Display',Georgia,serif;}
        .small{font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;}
        .qr-wrap{display:flex;flex-direction:column;align-items:center;gap:6px;background:#fff;border-radius:12px;padding:10px;flex-shrink:0;}
        .qr-wrap svg{display:block;width:110px;height:110px;}
        .qr-code{font-family:ui-monospace,Menlo,monospace;font-size:9px;color:#1a0a0a;margin:0;letter-spacing:.08em;text-align:center;}
        @media print{
          body{background:#fff;color:#000;padding:0;}
          .ticket{background:#fff;color:#000;border:2px solid #c00;box-shadow:none;border-radius:16px;padding:24px;}
          .brand,.code,.qr-code{color:#900;}
          .venue,.lbl,.totals-lbl,.small{color:#555;}
          hr{border-top-color:#ccc;}
          .qr-wrap{background:#fff;border:1px solid #ddd;}
          h1,.val,.val-sm,.totals-val{color:#000;}
        }
      </style></head><body>
      <div class="ticket">
        <div class="header">
          <div class="header-info">
            <div class="top-row">
              <span class="brand">ROYVENTO</span>
              <span class="code">${esc(ticketCode)}</span>
            </div>
            <h1>${esc(b.eventTitle)}</h1>
            <p class="venue">${esc(b.vendorName)}${b.eventCity ? ` &middot; ${esc(b.eventCity)}` : ""}</p>
            <div class="grid">
              <div><p class="lbl">Guest</p><p class="val">${esc(b.personName || b.userName)}</p></div>
              <div><p class="lbl">Date</p><p class="val">${esc(b.bookingDate)}</p></div>
              <div><p class="lbl">Tickets</p><p class="val-sm">${ticketBreakdown || "&mdash;"}<br><span style="color:#9ca3af;font-size:12px;">${total} guest${total !== 1 ? "s" : ""}</span></p></div>
              <div><p class="lbl">Approved by</p><p class="val" style="text-transform:capitalize;">${esc(b.approvedBy || "partner")}</p></div>
            </div>
          </div>
          ${qrSvgHtml}
        </div>
        <hr/>
        <div class="totals">
          <span class="totals-lbl">Amount paid</span>
          <span class="totals-val">${esc(formatINR(b.finalPrice ?? b.totalPrice))}</span>
        </div>
        <p class="small">Present this ticket at the entrance. Non-transferable.</p>
      </div>
      <script>window.onload=()=>window.print();</script>
      </body></html>`);
    w.document.close();
  };

  const total = (b.ticketWomen ?? 0) + (b.ticketMen ?? 0) + (b.ticketCouple ?? 0) * 2;

  return (
    <div className="border-t border-white/10 pt-5 mt-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wider text-primary flex items-center gap-1.5">
          <TicketIcon className="h-3.5 w-3.5" /> Premium ticket — confirmed
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={printTicket} className="gap-1.5"><Printer className="h-3.5 w-3.5" />Print</Button>
          <Button size="sm" onClick={printTicket} className="bg-gradient-to-br from-red-600 to-red-800 border-0 gap-1.5"><Download className="h-3.5 w-3.5" />Download PDF</Button>
        </div>
      </div>
      <div className="ticket rounded-2xl border border-red-500/40 bg-gradient-to-br from-red-950/60 to-black p-6">
        <div className="row flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center">
              <span className="brand text-xs tracking-[0.4em] uppercase text-red-300">ROYVENTO</span>
              <span className="code text-xs font-mono text-red-300 bg-white/5 px-2 py-1 rounded">{b.ticketCode ?? `RV-${String(b.id).padStart(6, "0")}`}</span>
            </div>
            <h1 className="font-serif text-3xl mt-2">{b.eventTitle}</h1>
            <p className="text-xs text-muted-foreground">{b.vendorName}{b.eventCity ? ` · ${b.eventCity}` : ""}</p>
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div><p className="lbl text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Guest</p><p className="val text-lg mt-0.5">{b.personName || b.userName}</p></div>
              <div><p className="lbl text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Date</p><p className="val text-lg mt-0.5">{b.bookingDate}</p></div>
              <div><p className="lbl text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Tickets</p>
                <p className="val text-sm mt-0.5">
                  {b.ticketWomen ? `${b.ticketWomen}W ` : ""}
                  {b.ticketMen ? `${b.ticketMen}M ` : ""}
                  {b.ticketCouple ? `${b.ticketCouple}C` : ""}
                  <span className="text-muted-foreground"> · {total} guests</span>
                </p>
              </div>
              <div><p className="lbl text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Approved by</p><p className="val text-lg mt-0.5 capitalize">{b.approvedBy || "partner"}</p></div>
            </div>
          </div>
          {b.ticketCode && (
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div className="bg-white p-2 rounded-lg">
                <QRCodeSVG value={b.ticketCode} size={100} />
              </div>
              <p className="text-[10px] font-mono text-red-300 tracking-wider">{b.ticketCode}</p>
            </div>
          )}
        </div>
        <hr className="border-dashed border-white/15 my-5" />
        <div className="totals flex justify-between text-lg">
          <span className="text-muted-foreground">Amount paid</span>
          <span className="font-serif">{formatINR(b.finalPrice ?? b.totalPrice)}</span>
        </div>
        <p className="small text-xs text-muted-foreground text-center mt-4">Present this ticket at the entrance. Non-transferable.</p>
      </div>
    </div>
  );
}
