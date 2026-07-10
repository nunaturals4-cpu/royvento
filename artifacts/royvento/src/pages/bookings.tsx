import { Link } from "wouter";
import { useState } from "react";
import { todayIst } from "@/lib/utils";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { useListMyBookings } from "@workspace/api-client-react";
import { SEO } from "@/components/SEO";
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
import { Calendar, Users, Tag, Wine, Ticket as TicketIcon, Printer, Download, AlertCircle, Share2, Gem } from "lucide-react";
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

interface BookingRecord {
  id: number;
  eventId: number;
  eventTitle: string;
  eventImage?: string | null;
  vendorName: string;
  bookingDate: string;
  createdAt: string;
  guests: number;
  totalPrice: number;
  finalPrice?: number | null;
  baseFee?: number | null;
  status: string;
  notes?: string | null;
  rejectionReason?: string | null;
  ticketCode?: string | null;
  // extended runtime fields
  eventType_?: string | null;
  pubMode?: string | null;
  checkedIn?: boolean | null;
  cancellationAllowed?: boolean | null;
  couponCode?: string | null;
  pointsUsed?: number | null;
  ticketWomen?: number | null;
  ticketMen?: number | null;
  ticketCouple?: number | null;
  selectedPubEvent?: string | null;
  eventCity?: string | null;
  personName?: string | null;
  userName?: string | null;
  approvedBy?: string | null;
  paymentMethod?: string | null;
  phone?: string | null;
  announcementId?: number | null;
  announcementEventType?: string | null;
  announcementDate?: string | null;
  // Organizer-ticket fields (kind='organizer')
  kind?: string | null;
  organizerName?: string | null;
  organizerEventSlug?: string | null;
  ticketType?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  eventStartTime?: string | null;
  freeEntryRules?: {
    enabled?: boolean;
    genders?: string[];
    days?: string[];
    beforeTime?: string | null;
  } | null;
}

export function Bookings() {
  const { t } = useTranslation();
  const { data: bookings = [], isLoading, refetch } = useListMyBookings();
  const [view, setView] = useState<"upcoming" | "past">("upcoming");

  const today = todayIst();

  const filtered = (bookings as BookingRecord[]).filter((b) => {
    const terminalStatus = b.status === "cancelled" || b.status === "completed";
    if (view === "past") return terminalStatus || (!!b.bookingDate && b.bookingDate < today);
    return !terminalStatus && (!b.bookingDate || b.bookingDate >= today);
  });

  return (
    <div className="container mx-auto px-4 md:px-6 py-8 md:py-14">
      <SEO title="My Bookings | Royvento" canonical="/dashboard/bookings" noindex />
      <header className="mb-6 md:mb-8">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-2 accent-underline inline-block">{t("bookings.your_account")}</p>
        <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl tracking-tight mt-2 md:mt-3">{t("bookings.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("bookings.subtitle")}</p>
      </header>

      {/* Upcoming / Past toggle */}
      <div className="flex gap-2 mb-8">
        <button
          onClick={() => setView("upcoming")}
          className={`px-5 py-2 rounded-full text-sm font-medium border transition-colors ${
            view === "upcoming"
              ? "bg-primary border-primary text-primary-foreground"
              : "bg-transparent border-white/10 text-muted-foreground hover:border-white/20"
          }`}
        >
          Upcoming
        </button>
        <button
          onClick={() => setView("past")}
          className={`px-5 py-2 rounded-full text-sm font-medium border transition-colors ${
            view === "past"
              ? "bg-primary border-primary text-primary-foreground"
              : "bg-transparent border-white/10 text-muted-foreground hover:border-white/20"
          }`}
        >
          Past
        </button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl glass-card p-16 text-center">
          <p className="font-serif text-2xl mb-2">
            {view === "upcoming" ? "No upcoming bookings" : "No past bookings"}
          </p>
          <p className="text-muted-foreground mb-6">
            {view === "upcoming" ? t("bookings.no_bookings_sub") : "Your completed bookings will appear here."}
          </p>
          {view === "upcoming" && (
            <Link href="/pubs"><Button className="bg-primary text-primary-foreground border-0">{t("bookings.explore")}</Button></Link>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map((b) => <BookingCard key={b.id} b={b} onRefetch={refetch} />)}
        </div>
      )}
    </div>
  );
}

function BookingCard({ b, onRefetch }: { b: BookingRecord; onRefetch: () => void }) {
  const { t } = useTranslation();
  const STATUS_LABEL: Record<string, string> = {
    pending: t("bookings.status_pending"),
    payment_pending: t("bookings.status_payment_pending"),
    confirmed: t("bookings.status_confirmed"),
    completed: t("bookings.status_completed"),
    cancelled: t("bookings.status_cancelled"),
  };
  const isOrganizer = b.kind === "organizer";
  const isEventBooking = b.pubMode === "event_booking";
  const isPubTicket = b.pubMode === "ticket" || b.pubMode === "free" || b.pubMode === "event" || b.pubMode === "cover_charge" || b.pubMode === "vip_table";
  const isCoverCharge = b.pubMode === "cover_charge";
  const isVipTable = b.pubMode === "vip_table";
  const showTicket = (isPubTicket || isOrganizer || isEventBooking) && (b.status === "confirmed" || b.status === "completed");
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
              <Badge variant={STATUS_VARIANT[b.status] ?? "default"}>{STATUS_LABEL[b.status] ?? b.status}</Badge>
              {b.eventType_ === "pub" && <Badge className="bg-red-600/20 border-red-500/40 text-red-200"><Wine className="h-3 w-3 mr-1" />{t("bookings.pub_badge")}</Badge>}
              {isOrganizer && <Badge className="bg-primary/20 border-primary/40 text-primary"><TicketIcon className="h-3 w-3 mr-1" />Event Ticket</Badge>}
              {isEventBooking && <Badge className="bg-purple-600/20 border-purple-500/40 text-purple-200"><TicketIcon className="h-3 w-3 mr-1" />Event Ticket</Badge>}
              {b.pubMode === "ticket" && <Badge variant="outline"><TicketIcon className="h-3 w-3 mr-1" />{t("bookings.ticket_badge")}</Badge>}
              {isCoverCharge && <Badge variant="outline"><TicketIcon className="h-3 w-3 mr-1" />Cover Charge</Badge>}
              {isVipTable && <Badge className="bg-red-950/60 border-white/50 text-white"><TicketIcon className="h-3 w-3 mr-1" />VIP Table Booking</Badge>}
              {b.pubMode === "event" && <Badge variant="outline">{t("bookings.event_booking_badge")}</Badge>}
              <span className="text-xs text-muted-foreground">{t("bookings.booked_on")} {new Date(b.createdAt).toLocaleDateString()}</span>
            </div>
            {isOrganizer
              ? <Link href={`/organizer-events/${b.organizerEventSlug ?? ""}`} className="font-serif text-2xl hover:text-primary">{b.eventTitle}</Link>
              : isEventBooking
                ? <p className="font-serif text-2xl">{b.selectedPubEvent || b.eventTitle}</p>
                : <Link href={`/events/${b.eventId}`} className="font-serif text-2xl hover:text-primary">{b.eventTitle}</Link>}
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{b.vendorName}</p>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-2">
              <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-primary" />{b.bookingDate}{isOrganizer && b.eventStartTime ? ` · ${b.eventStartTime}` : ""}</span>
              <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" />{b.guests} {isOrganizer || isEventBooking ? "ticket(s)" : isCoverCharge ? (b.guests === 1 ? "package" : "packages") : t("bookings.guests_label")}</span>
              {isOrganizer && b.venueName && <span className="flex items-center gap-1.5"><Tag className="h-4 w-4 text-primary" />{b.venueName}</span>}
              {b.couponCode && (
                <span className="flex items-center gap-1.5 text-green-400">
                  <Tag className="h-4 w-4" />{t("bookings.coupon_applied")} {b.couponCode}
                </span>
              )}
              {(b.pointsUsed ?? 0) > 0 && (
                <span className="flex items-center gap-1.5 text-primary">
                  ⬢ {b.pointsUsed} {t("bookings.pts_used")}
                </span>
              )}
            </div>
            {b.pubMode === "ticket" && (b.ticketWomen || b.ticketMen || b.ticketCouple) ? (
              <p className="text-sm text-muted-foreground">
                {t("bookings.ticket_badge")}:
                {b.ticketWomen ? ` ${b.ticketWomen}× ${t("bookings.women")}` : ""}
                {b.ticketMen ? ` ${b.ticketMen}× ${t("bookings.men")}` : ""}
                {b.ticketCouple ? ` ${b.ticketCouple}× ${t("bookings.couple")}` : ""}
              </p>
            ) : null}
            {b.pubMode === "event" && b.selectedPubEvent && (
              <p className="text-sm text-muted-foreground">{t("bookings.event_booking_badge")}: {b.selectedPubEvent}</p>
            )}
            {isEventBooking && b.announcementEventType && (
              <p className="text-sm text-muted-foreground">Event Type: <span className="text-foreground/80 capitalize">{b.announcementEventType}</span></p>
            )}
            {isCoverCharge && b.selectedPubEvent && (
              <p className="text-sm text-muted-foreground">Package: <span className="text-foreground/80 font-medium">{b.selectedPubEvent}</span>{b.guests > 1 ? ` × ${b.guests}` : ""}</p>
            )}
            {isVipTable && b.selectedPubEvent && (
              <p className="text-sm text-muted-foreground">VIP Package: <span className="text-foreground/80 font-medium">{b.selectedPubEvent}</span></p>
            )}
            {b.notes && <p className="text-sm italic text-muted-foreground">"{b.notes}"</p>}
            {b.status === "pending" && (
              <p className="text-xs text-amber-400">{t("bookings.awaiting_approval")}</p>
            )}
            {b.status === "payment_pending" && (
              <p className="text-xs text-amber-400">{t("bookings.payment_pending_msg")}</p>
            )}
            {b.status === "cancelled" && b.rejectionReason && (
              <div className="mt-2 rounded-lg border border-red-500/30 bg-red-900/20 px-3 py-2">
                <p className="text-xs text-red-300 font-medium mb-0.5">{t("bookings.cancellation_reason")}</p>
                <p className="text-xs text-red-200">{b.rejectionReason}</p>
              </div>
            )}
          </div>
          <div className="text-right flex flex-col items-end gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("bookings.total_label")}</p>
              <p className="font-serif text-3xl">{formatINRExact((b.finalPrice ?? b.totalPrice) + (b.baseFee ?? 0))}</p>
              {b.totalPrice > 0 && (b.finalPrice != null && b.finalPrice !== b.totalPrice) && (
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
                        {t("bookings.checked_in")}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-56 text-center">
                      {t("bookings.ticket_scanned")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : cancellationBlocked ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-not-allowed select-none border border-white/10 rounded-md px-3 py-1.5">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                        {t("bookings.cancellation_closed")}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-56 text-center">
                      {t("bookings.cancellation_closed_msg")}
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
                  {t("bookings.cancel")}
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
  booking: BookingRecord;
  onCancelled: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleCancel = async () => {
    if (!reason.trim()) {
      toast({ title: t("bookings.reason_required"), variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiPatch(`/api/bookings/${booking.id}/cancel`, { cancellationReason: reason.trim() });
      toast({ title: t("bookings.cancelled_title"), description: t("bookings.cancelled_desc") });
      onCancelled();
      onClose();
      setReason("");
    } catch (err: unknown) {
      toast({
        title: t("bookings.cancel_failed"),
        description: err instanceof Error ? err.message : t("bookings.cancel_failed_desc"),
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
          <DialogTitle>{t("bookings.cancel_dialog_title")}</DialogTitle>
          <DialogDescription>
            {t("bookings.cancel_dialog_desc")} <strong>{booking.eventTitle}</strong> {booking.bookingDate}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <label className="text-sm font-medium">{t("bookings.reason_for_cancellation")}</label>
          <Textarea
            placeholder={t("bookings.reason_placeholder")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t("bookings.keep_booking")}
          </Button>
          <Button variant="destructive" onClick={handleCancel} disabled={loading || !reason.trim()}>
            {loading ? t("bookings.cancelling") : t("bookings.confirm_cancellation")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TicketField({ label, value, vip }: { label: string; value: React.ReactNode; vip?: boolean }) {
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-[0.22em] mb-0.5 ${vip ? "text-white/55" : "text-amber-400/50"}`}>{label}</p>
      <p className="text-sm text-white/90 font-medium leading-tight">{value}</p>
    </div>
  );
}

function PremiumTicket({ b }: { b: BookingRecord }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isOrganizer = b.kind === "organizer";
  const isCoverCharge = b.pubMode === "cover_charge";
  const isVipTable = b.pubMode === "vip_table";
  const isEventBooking = b.pubMode === "event_booking";
  // Two distinct plate themes: standard bookings get a pure dark-black plate
  // with a golden border; VIP Table Booking gets a rich deep-navy plate
  // (#160517 anchor) with a white border, so it reads as a clearly separate,
  // higher tier ticket without touching any other booking type's design.
  const ticketBg = isVipTable
    ? "linear-gradient(150deg, #3B0E3E 0%, #160517 50%, #0A020A 100%)"
    : "linear-gradient(155deg, #0c0c0c 0%, #070707 55%, #000000 100%)";
  const ticketBorder = isVipTable ? "2px solid rgba(255,255,255,0.7)" : "2px solid rgba(212,168,83,0.55)";
  const ticketShadow = isVipTable
    // Double-ring foil edge — a crisp white hairline just inside the border,
    // plus a soft white glow and the aubergine's own ambient shadow, for a
    // richer, more premium plate than a single flat border.
    ? "0 28px 80px rgba(22,5,23,0.7), 0 0 46px -12px rgba(255,255,255,0.3), 0 0 0 1px rgba(22,5,23,0.9) inset, 0 0 0 4px rgba(255,255,255,0.18) inset"
    : "0 24px 64px rgba(0,0,0,0.75), 0 0 0 1px rgba(212,168,83,0.14) inset";
  const ornStroke = isVipTable ? "rgba(255,255,255,0.85)" : "#d4a853";
  const ornFill = isVipTable ? "rgba(255,255,255,0.4)" : "rgba(212,168,83,0.4)";
  const qrRingStyle = isVipTable
    ? { background: "#fff", border: "2px solid rgba(255,255,255,0.9)", boxShadow: "0 0 0 3px rgba(22,5,23,0.5)" }
    : { background: "#fff", border: "2px solid rgba(212,168,83,0.5)" };
  const venueNameStyle = isVipTable ? { color: "#ffffff" } : { color: "#d4a853" };
  const ticketCode: string = b.ticketCode ?? `RV-${String(b.id).padStart(6, "0")}`;
  const isEventMode = b.pubMode !== "ticket";
  const ticketSum = (b.ticketWomen ?? 0) + (b.ticketMen ?? 0) + (b.ticketCouple ?? 0) * 2;
  // For non-ticket pub modes (event/free/legacy) ticketWomen/Men/Couple are 0 — use b.guests instead.
  // Also fall back to b.guests for ticket mode if all counts are somehow 0.
  const total = ticketSum > 0 ? ticketSum : b.guests;
  const baseFee = b.baseFee ?? 0;
  const totalPayable = (b.finalPrice ?? b.totalPrice ?? 0) + baseFee;
  const hideAmountPaid = Number(totalPayable) === 0;
  const isCod = (b.paymentMethod ?? "").toLowerCase() === "cod";
  const amountLabel = isCod ? t("bookings.amount_due") : t("bookings.amount_paid");

  const shareTicket = async () => {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}dashboard/bookings`;
    const text = `My ticket to ${b.eventTitle} at ${b.vendorName} on ${b.bookingDate} — Code: ${ticketCode}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `Ticket: ${b.eventTitle}`, text, url });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast({ title: "Ticket link copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", description: url });
    }
  };

  const printTicket = async (w: Window | null) => {
    if (!w) return;

    const vipClass = isVipTable ? " vip" : "";

    const esc = (v: unknown): string =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    let qrSvgHtml = "";
    try {
      const svgString = await QRCode.toString(ticketCode, {
        type: "svg",
        margin: 1,
        color: { dark: "#1a1008", light: "#ffffff" },
        width: 150,
      });
      qrSvgHtml = `<div class="qr-frame${vipClass}">${svgString}<p class="qr-venue">${esc(b.vendorName)}</p></div>`;
    } catch (_) {
      qrSvgHtml = `<div class="qr-frame${vipClass}"><p class="qr-venue">${esc(b.vendorName)}</p></div>`;
    }

    const pdfBreakdownParts = [
      b.ticketWomen ? `${b.ticketWomen}\u00d7 ${t("bookings.women")}` : "",
      b.ticketMen ? `${b.ticketMen}\u00d7 ${t("bookings.men")}` : "",
      b.ticketCouple ? `${b.ticketCouple}\u00d7 ${t("bookings.couple")}` : "",
    ].filter(Boolean).map(esc);
    const ticketBreakdown = pdfBreakdownParts.join(" &middot; ");
    const ticketsFieldHtml = isCoverCharge
      ? `<div class="field-val-sm">${esc(b.selectedPubEvent || "Cover charge")}<br/><span style="color:rgba(255,255,255,.4);font-size:11px;">× ${total}</span></div>`
      : isVipTable
      ? `<div class="field-val-sm">${esc(b.selectedPubEvent || "VIP table package")}<br/><span style="color:rgba(255,255,255,.4);font-size:11px;">${total} ${esc(t("bookings.guests"))}</span></div>`
      : isEventBooking
      ? `<div class="field-val">${total} ticket${total !== 1 ? "s" : ""}</div>`
      : ticketBreakdown
      ? `<div class="field-val-sm">${ticketBreakdown}<br/><span style="color:rgba(255,255,255,.4);font-size:11px;">${total} ${esc(t("bookings.guests"))}</span></div>`
      : `<div class="field-val">${total} ${esc(t("bookings.guests"))}</div>`;

    w.document.write(`<!doctype html><html><head>
      <meta charset="utf-8">
      <title>Ticket — ${esc(b.eventTitle)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
      <style>
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0c0810;font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px;}
        .ticket{position:relative;background:linear-gradient(155deg,#0c0c0c 0%,#070707 55%,#000000 100%);border:2px solid rgba(212,168,83,.55);border-radius:24px;max-width:680px;width:100%;overflow:hidden;box-shadow:0 40px 80px rgba(0,0,0,.8),0 0 0 1px rgba(212,168,83,.14) inset;}
        .ticket.vip{background:linear-gradient(150deg,#3B0E3E 0%,#160517 50%,#0A020A 100%);border:2px solid rgba(255,255,255,.7);box-shadow:0 40px 90px rgba(22,5,23,.65),0 0 54px -14px rgba(255,255,255,.32),0 0 0 1px rgba(22,5,23,.9) inset,0 0 0 4px rgba(255,255,255,.18) inset;}
        .sheen{position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.09) 48%,rgba(255,255,255,.02) 55%,transparent 65%);}
        .wm{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:96px;font-family:'Playfair Display',serif;color:rgba(212,168,83,.04);white-space:nowrap;pointer-events:none;letter-spacing:.15em;}
        .wm.vip{font-size:40px;letter-spacing:.25em;color:rgba(255,255,255,.07);}
        .orn{position:absolute;width:60px;height:60px;opacity:.35;}
        .orn-tl{top:16px;left:16px;}
        .orn-tr{top:16px;right:16px;transform:scaleX(-1);}
        .body-sec{padding:32px 36px 28px;}
        .top-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;}
        .brand{font-size:11px;letter-spacing:.55em;text-transform:uppercase;color:rgba(212,168,83,.6);font-family:'Inter',sans-serif;}
        .brand.vip{color:rgba(255,255,255,.65);}
        .badge{font-size:10px;font-family:ui-monospace,Menlo,monospace;color:rgba(212,168,83,.7);background:rgba(212,168,83,.08);border:1px solid rgba(212,168,83,.2);padding:3px 10px;border-radius:6px;letter-spacing:.08em;}
        .badge.vip{color:rgba(255,255,255,.8);background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.3);}
        .vip-ribbon{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.16em;color:#ffffff;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.5);box-shadow:0 0 16px -4px rgba(255,255,255,.35);padding:5px 12px;border-radius:99px;margin-bottom:14px;}
        .hero{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;}
        .hero-info{flex:1;min-width:0;}
        .venue-name{font-family:'Playfair Display',serif;font-size:32px;color:#d4a853;line-height:1.1;font-weight:600;}
        .venue-name.vip{color:#ffffff;}
        .event-title{font-size:16px;color:rgba(255,255,255,.75);margin-top:6px;font-weight:400;}
        .event-city{font-size:11px;color:rgba(255,255,255,.35);margin-top:3px;letter-spacing:.06em;}
        .fields{display:grid;grid-template-columns:1fr 1fr;gap:18px 28px;margin-top:24px;}
        .field-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.28em;color:rgba(212,168,83,.45);margin-bottom:3px;}
        .field-lbl.vip{color:rgba(255,255,255,.55);}
        .field-val{font-size:15px;color:rgba(255,255,255,.88);font-weight:500;}
        .field-val-sm{font-size:13px;color:rgba(255,255,255,.75);}
        .qr-frame{display:flex;flex-direction:column;align-items:center;gap:8px;background:#fff;border:2px solid rgba(212,168,83,.5);border-radius:14px;padding:12px;flex-shrink:0;}
        .qr-frame.vip{border:2px solid rgba(255,255,255,.9);box-shadow:0 0 0 3px rgba(22,5,23,.5);}
        .qr-frame svg{display:block;width:140px;height:140px;}
        .qr-venue{font-size:9px;color:#5a4010;font-family:ui-monospace,Menlo,monospace;letter-spacing:.1em;text-align:center;max-width:140px;word-break:break-word;}
        .divider-row{display:flex;align-items:center;margin:0 -0px;}
        .notch{width:22px;height:44px;background:#000000;border-radius:0 22px 22px 0;flex-shrink:0;}
        .notch.vip{background:#0A020A;}
        .notch-r{border-radius:22px 0 0 22px;}
        .perf{flex:1;border-top:2px dashed rgba(212,168,83,.3);height:0;position:relative;}
        .perf.vip{border-top-color:rgba(255,255,255,.35);}
        .tear-code{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-family:ui-monospace,Menlo,monospace;font-size:18px;letter-spacing:.35em;color:#d4a853;background:linear-gradient(155deg,#0c0c0c,#070707);padding:4px 18px;white-space:nowrap;}
        .tear-code.vip{color:#ffffff;background:linear-gradient(150deg,#3B0E3E,#160517);}
        .footer-sec{padding:22px 36px 28px;display:flex;justify-content:space-between;align-items:center;}
        .price-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.28em;color:rgba(212,168,83,.45);margin-bottom:4px;}
        .price-lbl.vip{color:rgba(255,255,255,.55);}
        .price-val{font-family:'Playfair Display',serif;font-size:28px;color:#d4a853;}
        .price-val.vip{color:#ffffff;}
        .disclaimer{font-size:10px;color:rgba(255,255,255,.25);text-align:right;line-height:1.6;max-width:200px;}
        @media print{
          body{background:#fff;padding:0;}
          .ticket{background:linear-gradient(145deg,#fdf8f0 0%,#fffbf2 100%);border:2px solid #c5963a;box-shadow:none;}
          .ticket.vip{background:linear-gradient(145deg,#f7f1f7 0%,#ffffff 100%);border:2px solid #160517;}
          .sheen{display:none;}
          .wm{color:rgba(180,140,60,.06);}
          .venue-name{color:#9a6f1a;}
          .venue-name.vip{color:#160517;}
          .price-val.vip{color:#160517;}
          .vip-ribbon{color:#160517;background:rgba(22,5,23,.08);border-color:rgba(22,5,23,.35);box-shadow:none;}
          .event-title{color:#333;}
          .event-city{color:#888;}
          .brand,.badge{color:#b8831e;}
          .badge{background:rgba(180,140,60,.1);border-color:rgba(180,140,60,.3);}
          .field-lbl{color:rgba(180,140,60,.6);}
          .field-val,.field-val-sm{color:#222;}
          .perf{border-top-color:rgba(180,140,60,.3);}
          .tear-code{color:#9a6f1a;background:#fdf8f0;}
          .tear-code.vip{color:#160517;background:#f7f1f7;}
          .qr-frame{border-color:rgba(180,140,60,.4);}
          .qr-frame.vip{border-color:rgba(22,5,23,.35);box-shadow:none;}
          .qr-venue{color:#6b4f0a;}
          .price-lbl{color:rgba(180,140,60,.6);}
          .price-val{color:#9a6f1a;}
          .disclaimer{color:#aaa;}
          .orn{opacity:.2;}
          .notch,.notch.vip{background:#fff;}
        }
      </style></head><body>
      <div class="ticket${vipClass}">
        ${isVipTable ? `<div class="sheen"></div>` : ""}
        <div class="wm${vipClass}">${isVipTable ? "ROYVENTO VIP MEMBER" : "ROYVENTO"}</div>
        <svg class="orn orn-tl" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2 L22 2 L2 22 Z" stroke="${isVipTable ? "rgba(255,255,255,.75)" : "#d4a853"}" stroke-width="1" fill="none"/><path d="M2 2 L10 2 L2 10 Z" fill="${isVipTable ? "rgba(255,255,255,.35)" : "rgba(212,168,83,.3)"}"/><circle cx="30" cy="2" r="1.5" fill="${isVipTable ? "rgba(255,255,255,.75)" : "#d4a853"}"/><circle cx="2" cy="30" r="1.5" fill="${isVipTable ? "rgba(255,255,255,.75)" : "#d4a853"}"/></svg>
        <svg class="orn orn-tr" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2 L22 2 L2 22 Z" stroke="${isVipTable ? "rgba(255,255,255,.75)" : "#d4a853"}" stroke-width="1" fill="none"/><path d="M2 2 L10 2 L2 10 Z" fill="${isVipTable ? "rgba(255,255,255,.35)" : "rgba(212,168,83,.3)"}"/><circle cx="30" cy="2" r="1.5" fill="${isVipTable ? "rgba(255,255,255,.75)" : "#d4a853"}"/><circle cx="2" cy="30" r="1.5" fill="${isVipTable ? "rgba(255,255,255,.75)" : "#d4a853"}"/></svg>
        <div class="body-sec">
          <div class="top-bar">
            <span class="brand${vipClass}">ROYVENTO</span>
            <span class="badge${vipClass}">${esc(ticketCode)}</span>
          </div>
          ${isVipTable ? `<span class="vip-ribbon">&#9670; VIP Table Booking</span>` : ""}
          <div class="hero">
            <div class="hero-info">
              <div class="venue-name${vipClass}">${esc(isEventBooking ? (b.selectedPubEvent || b.eventTitle) : b.vendorName)}</div>
              <div class="event-title">${esc(isEventBooking ? b.vendorName : b.eventTitle)}</div>
              ${b.eventCity ? `<div class="event-city">${esc(b.eventCity)}</div>` : ""}
              <div class="fields">
                <div><div class="field-lbl${vipClass}">${esc(t("bookings.guest"))}</div><div class="field-val">${esc(b.personName || b.userName)}</div></div>
                <div><div class="field-lbl${vipClass}">${esc(t("bookings.date"))}</div><div class="field-val">${esc(b.bookingDate)}</div></div>
                <div><div class="field-lbl${vipClass}">${esc(t("bookings.tickets"))}</div>${ticketsFieldHtml}</div>
                <div><div class="field-lbl${vipClass}">${esc(t("bookings.approved_by"))}</div><div class="field-val" style="text-transform:capitalize;">${esc(b.approvedBy || t("bookings.partner"))}</div></div>
              </div>
            </div>
            ${qrSvgHtml}
          </div>
        </div>
        <div class="divider-row">
          <div class="notch${vipClass}"></div>
          <div class="perf${vipClass}"><span class="tear-code${vipClass}">${esc(ticketCode)}</span></div>
          <div class="notch notch-r${vipClass}"></div>
        </div>
        <div class="footer-sec">
          ${hideAmountPaid ? "" : `<div>
            <div class="price-lbl${vipClass}">${esc(amountLabel)}</div>
            <div class="price-val${vipClass}">${esc(formatINR(totalPayable))}</div>
          </div>`}
          <div class="disclaimer">${esc(t("bookings.present_at_entrance"))}<br/>${esc(t("bookings.non_transferable"))} &middot; Royvento</div>
        </div>
      </div>
      <script>window.onload=()=>window.print();</script>
      </body></html>`);
    w.document.close();
  };

  const _bFerWebDays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const _bFer = b.freeEntryRules ?? null;
  const _bDayName = b.bookingDate ? _bFerWebDays[new Date(`${b.bookingDate}T12:00:00`).getDay()] : undefined;
  const _bFerActive = !!(_bFer?.enabled && _bDayName && Array.isArray(_bFer.days) && _bFer.days.includes(_bDayName));
  const _bFerGenders = _bFerActive ? (_bFer?.genders ?? []).map((g) => String(g).toLowerCase()) : [];
  const isBookingTierFree = (g: "women" | "men" | "couple") => _bFerActive && _bFerGenders.includes(g);
  const fmtTier = (count: number, label: string, g: "women" | "men" | "couple") =>
    isBookingTierFree(g) ? `${count}× ${label} (${t("bookings.free_entry") ?? "free"})` : `${count}× ${label}`;
  const ticketBreakdownParts = [
    b.ticketWomen ? fmtTier(b.ticketWomen, t("bookings.women"), "women") : "",
    b.ticketMen ? fmtTier(b.ticketMen, t("bookings.men"), "men") : "",
    b.ticketCouple ? fmtTier(b.ticketCouple, t("bookings.couple"), "couple") : "",
  ].filter(Boolean);

  return (
    <div className="border-t border-white/10 pt-5 mt-2">
      {/* Header: label + action buttons */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <p className="text-xs uppercase tracking-wider text-amber-400/80 flex items-center gap-1.5 shrink-0">
          <TicketIcon className="h-3.5 w-3.5" />
          <span>{t("bookings.your_ticket")}</span>
        </p>
        <div className="flex gap-1.5">
          <Button
            size="sm" variant="outline" onClick={shareTicket}
            className="h-8 gap-1 px-2.5 sm:px-3 border-amber-400/20 text-amber-400/80 hover:text-amber-300 hover:border-amber-400/40"
          >
            <Share2 className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Share</span>
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={() => printTicket(window.open("about:blank", "_blank"))}
            className="h-8 gap-1 px-2.5 sm:px-3 border-amber-400/20 text-amber-400/80 hover:text-amber-300 hover:border-amber-400/40"
          >
            <Printer className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{t("bookings.print")}</span>
          </Button>
          <Button
            size="sm"
            onClick={() => printTicket(window.open("about:blank", "_blank"))}
            className="h-8 gap-1 px-2.5 sm:px-3 bg-gradient-to-br from-amber-600 to-amber-800 border-0 text-black font-semibold hover:from-amber-500 hover:to-amber-700"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span>{t("bookings.pdf")}</span>
          </Button>
        </div>
      </div>

      {/* Premium Ticket Card */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: ticketBg,
          border: ticketBorder,
          boxShadow: ticketShadow,
        }}
      >
        {/* VIP foil sheen — a soft diagonal highlight band for a richer plate finish */}
        {isVipTable && (
          <div
            className="absolute inset-0 pointer-events-none"
            aria-hidden
            style={{ background: "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.08) 48%, rgba(255,255,255,0.02) 55%, transparent 65%)" }}
          />
        )}

        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden" aria-hidden>
          <span
            className={isVipTable ? "font-serif text-2xl sm:text-4xl tracking-[0.3em] whitespace-nowrap" : "font-serif text-7xl sm:text-8xl tracking-[0.2em] whitespace-nowrap"}
            style={{ color: isVipTable ? "rgba(255,255,255,0.07)" : "rgba(212,168,83,0.035)", transform: "rotate(-28deg) translateY(10%)" }}
          >
            {isVipTable ? "ROYVENTO VIP MEMBER" : "ROYVENTO"}
          </span>
        </div>

        {/* Corner ornaments */}
        <svg className="absolute top-3 left-3 sm:top-4 sm:left-4 w-9 h-9 sm:w-12 sm:h-12 opacity-30" aria-hidden viewBox="0 0 48 48" fill="none">
          <path d="M2 2 L18 2 L2 18 Z" stroke={ornStroke} strokeWidth="1" fill="none"/>
          <path d="M2 2 L8 2 L2 8 Z" fill={ornFill}/>
          <circle cx="24" cy="2" r="1.2" fill={ornStroke}/>
          <circle cx="2" cy="24" r="1.2" fill={ornStroke}/>
        </svg>
        <svg className="absolute top-3 right-3 sm:top-4 sm:right-4 w-9 h-9 sm:w-12 sm:h-12 opacity-30" aria-hidden viewBox="0 0 48 48" fill="none" style={{ transform: "scaleX(-1)" }}>
          <path d="M2 2 L18 2 L2 18 Z" stroke={ornStroke} strokeWidth="1" fill="none"/>
          <path d="M2 2 L8 2 L2 8 Z" fill={ornFill}/>
          <circle cx="24" cy="2" r="1.2" fill={ornStroke}/>
          <circle cx="2" cy="24" r="1.2" fill={ornStroke}/>
        </svg>

        {/* Top section */}
        <div className="relative z-10 px-4 sm:px-7 pt-5 sm:pt-7 pb-4 sm:pb-6">

          {/* Brand + ticket code */}
          <div className="flex justify-between items-center mb-4 sm:mb-5">
            <span
              className={`text-[9px] sm:text-[10px] tracking-[0.4em] sm:tracking-[0.55em] uppercase font-medium ${isVipTable ? "text-white/60" : "text-amber-400/55"}`}
            >
              ROYVENTO
            </span>
            <span
              className="text-[8px] sm:text-[10px] font-mono px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded max-w-[52%] truncate"
              style={
                isVipTable
                  ? {
                      letterSpacing: "0.06em",
                      color: "rgba(255,255,255,0.8)",
                      background: "rgba(255,255,255,0.1)",
                      border: "1px solid rgba(255,255,255,0.3)",
                    }
                  : {
                      letterSpacing: "0.06em",
                      color: "rgba(212,168,83,0.7)",
                      background: "rgba(212,168,83,0.07)",
                      border: "1px solid rgba(212,168,83,0.2)",
                    }
              }
            >
              {ticketCode}
            </span>
          </div>

          {/* VIP ribbon — only for VIP Table Booking */}
          {isVipTable && (
            <div className="mb-3 sm:mb-4">
              <span
                className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full"
                style={{
                  color: "#ffffff",
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.5)",
                  boxShadow: "0 0 16px -4px rgba(255,255,255,0.35)",
                }}
              >
                <Gem className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                VIP Table Booking
              </span>
            </div>
          )}

          {/* Venue name + event + city — full width on all sizes */}
          <h2 className="font-serif text-xl sm:text-2xl leading-tight" style={venueNameStyle}>{isEventBooking ? (b.selectedPubEvent || b.eventTitle) : b.vendorName}</h2>
          <p className="text-sm sm:text-base text-white/75 mt-1 font-light">{isEventBooking ? b.vendorName : b.eventTitle}</p>
          {b.eventCity && <p className="text-[11px] sm:text-xs text-white/35 mt-0.5 tracking-wide">{b.eventCity}</p>}

          {/* QR code — mobile only, centered below venue info */}
          <div className="flex justify-center mt-4 sm:hidden">
            <div className="flex flex-col items-center gap-2">
              <div className="p-2 rounded-xl" style={qrRingStyle}>
                <QRCodeSVG value={ticketCode} size={112} level="M" />
              </div>
              <p className="text-[9px] font-mono tracking-wider text-center leading-tight" style={{ color: isVipTable ? "rgba(255,255,255,0.55)" : "rgba(212,168,83,0.5)", maxWidth: 120 }}>
                {b.vendorName}
              </p>
            </div>
          </div>

          {/* Details grid + QR (desktop) */}
          <div className="flex items-start gap-6 mt-4 sm:mt-6">
            <div className="grid grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-3 sm:gap-y-4 flex-1 min-w-0">
              {isOrganizer ? (
                <>
                  <TicketField vip={isVipTable} label={t("bookings.guest")} value={b.personName || b.userName} />
                  <TicketField vip={isVipTable} label="Booking ID" value={`#${b.id}`} />
                  <TicketField vip={isVipTable} label={t("bookings.date")} value={`${b.bookingDate}${b.eventStartTime ? ` · ${b.eventStartTime}` : ""}`} />
                  <TicketField vip={isVipTable} label="Ticket type" value={`${b.ticketType || "Ticket"}${b.guests > 1 ? ` ×${b.guests}` : ""}`} />
                  {b.venueName && <TicketField vip={isVipTable} label="Venue" value={b.venueName} />}
                  {b.venueAddress && <TicketField vip={isVipTable} label="Address" value={b.venueAddress} />}
                </>
              ) : (
                <>
                  <TicketField vip={isVipTable} label={t("bookings.guest")} value={b.personName || b.userName} />
                  <TicketField vip={isVipTable} label={t("bookings.date")} value={b.bookingDate} />
                  <TicketField
                    vip={isVipTable}
                    label={isCoverCharge ? "Package" : isVipTable ? "VIP Package" : t("bookings.tickets")}
                    value={
                      isCoverCharge ? (
                        <>
                          {b.selectedPubEvent || "Cover charge"}
                          <span className="text-white/35 ml-1 text-xs">(× {total})</span>
                        </>
                      ) : isVipTable ? (
                        <>
                          {b.selectedPubEvent || "VIP table package"}
                          <span className="text-white/35 ml-1 text-xs">({total} {t("bookings.guests")})</span>
                        </>
                      ) : isEventBooking ? (
                        `${total} ticket${total !== 1 ? "s" : ""}`
                      ) : ticketBreakdownParts.length > 0 ? (
                        <>
                          {ticketBreakdownParts.join(" · ")}
                          <span className="text-white/35 ml-1 text-xs">({total} {t("bookings.guests")})</span>
                        </>
                      ) : `${total} ${t("bookings.guests")}`
                    }
                  />
                  <TicketField vip={isVipTable} label={t("bookings.approved_by")} value={<span className="capitalize">{b.approvedBy || t("bookings.partner")}</span>} />
                </>
              )}
            </div>

            {/* QR — desktop only */}
            <div className="hidden sm:flex flex-col items-center gap-2 shrink-0">
              <div className="p-2.5 rounded-xl" style={qrRingStyle}>
                <QRCodeSVG value={ticketCode} size={120} level="M" />
              </div>
              <p className="text-[9px] font-mono tracking-wider text-center max-w-[132px] leading-tight" style={{ color: isVipTable ? "rgba(255,255,255,0.55)" : "rgba(212,168,83,0.5)" }}>
                {b.vendorName}
              </p>
            </div>
          </div>
        </div>

        {/* Perforated tear line */}
        <div className="relative z-10 flex items-center">
          <div className="w-4 sm:w-5 h-8 sm:h-10 rounded-r-full shrink-0" style={{ background: "rgba(0,0,0,0.55)" }} />
          <div className="relative flex-1 flex items-center justify-center overflow-hidden" style={{ borderTop: isVipTable ? "2px dashed rgba(255,255,255,0.35)" : "2px dashed rgba(212,168,83,0.3)", height: "2rem" }}>
            <span
              className="absolute font-mono text-[10px] sm:text-base px-2 sm:px-4 py-0.5 whitespace-nowrap"
              style={{
                letterSpacing: "0.15em",
                color: isVipTable ? "#ffffff" : "#d4a853",
                background: ticketBg,
              }}
            >
              {ticketCode}
            </span>
          </div>
          <div className="w-4 sm:w-5 h-8 sm:h-10 rounded-l-full shrink-0" style={{ background: "rgba(0,0,0,0.55)" }} />
        </div>

        {/* Footer */}
        <div className="relative z-10 flex justify-between items-center px-4 sm:px-7 py-4 sm:py-5 gap-3">
          {hideAmountPaid ? <div /> : (
            <div>
              <p className="text-[9px] uppercase tracking-[0.28em] mb-1" style={{ color: isVipTable ? "rgba(255,255,255,0.55)" : "rgba(212,168,83,0.45)" }}>{amountLabel}</p>
              <p
                className="font-serif text-xl sm:text-2xl"
                style={isVipTable ? { color: "#ffffff", filter: "drop-shadow(0 0 10px rgba(255,255,255,0.3))" } : { color: "#d4a853" }}
              >
                {formatINR(totalPayable)}
              </p>
            </div>
          )}
          <p className="text-[9px] text-right leading-relaxed flex items-center justify-end gap-1" style={{ color: "rgba(255,255,255,0.25)", maxWidth: 150 }}>
            {isVipTable && <Gem className="h-2.5 w-2.5 shrink-0" style={{ color: "rgba(255,255,255,0.5)" }} />}
            <span>Present this ticket at the entrance.<br />Non-transferable · Royvento</span>
          </p>
        </div>
      </div>
    </div>
  );
}
