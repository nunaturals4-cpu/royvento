import { Link } from "wouter";
import { useState } from "react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const { data: bookings = [], isLoading, refetch } = useListMyBookings();

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-2 accent-underline inline-block">{t("bookings.your_account")}</p>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-3">{t("bookings.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("bookings.subtitle")}</p>
      </header>

      {isLoading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : bookings.length === 0 ? (
        <div className="rounded-3xl glass-card p-16 text-center">
          <p className="font-serif text-2xl mb-2">{t("bookings.no_bookings")}</p>
          <p className="text-muted-foreground mb-6">{t("bookings.no_bookings_sub")}</p>
          <Link href="/explore"><Button className="bg-gradient-to-br from-red-600 to-red-800 border-0">{t("bookings.explore")}</Button></Link>
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
  const { t } = useTranslation();
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
              {b.eventType_ === "pub" && <Badge className="bg-red-600/20 border-red-500/40 text-red-200"><Wine className="h-3 w-3 mr-1" />{t("bookings.pub_badge")}</Badge>}
              {b.pubMode === "ticket" && <Badge variant="outline"><TicketIcon className="h-3 w-3 mr-1" />{t("bookings.ticket_badge")}</Badge>}
              {b.pubMode === "event" && <Badge variant="outline">{t("bookings.event_booking_badge")}</Badge>}
              <span className="text-xs text-muted-foreground">{t("bookings.booked_on")} {new Date(b.createdAt).toLocaleDateString()}</span>
            </div>
            <Link href={`/events/${b.eventId}`} className="font-serif text-2xl hover:text-primary">{b.eventTitle}</Link>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{b.vendorName}</p>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-2">
              <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-primary" />{b.bookingDate}</span>
              <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" />{b.guests} {t("bookings.guests_label")}</span>
              {b.couponCode && (
                <span className="flex items-center gap-1.5 text-green-400">
                  <Tag className="h-4 w-4" />{t("bookings.coupon_applied")} {b.couponCode}
                </span>
              )}
              {b.pointsUsed > 0 && (
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
  booking: any;
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
    } catch (err: any) {
      toast({
        title: t("bookings.cancel_failed"),
        description: err?.message ?? t("bookings.cancel_failed_desc"),
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

function TicketField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.22em] text-amber-400/50 mb-0.5">{label}</p>
      <p className="text-sm text-white/90 font-medium leading-tight">{value}</p>
    </div>
  );
}

function PremiumTicket({ b }: { b: any }) {
  const { t } = useTranslation();
  const ticketCode: string = b.ticketCode ?? `RV-${String(b.id).padStart(6, "0")}`;
  const total = (b.ticketWomen ?? 0) + (b.ticketMen ?? 0) + (b.ticketCouple ?? 0) * 2;

  const printTicket = async () => {
    const esc = (v: unknown): string =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const w = window.open("", "_blank", "width=760,height=980");
    if (!w) return;

    let qrSvgHtml = "";
    try {
      const svgString = await QRCode.toString(ticketCode, {
        type: "svg",
        margin: 1,
        color: { dark: "#1a1008", light: "#ffffff" },
        width: 150,
      });
      qrSvgHtml = `<div class="qr-frame">${svgString}<p class="qr-venue">${esc(b.vendorName)}</p></div>`;
    } catch (_) {
      qrSvgHtml = `<div class="qr-frame"><p class="qr-venue">${esc(b.vendorName)}</p></div>`;
    }

    const ticketBreakdown = [
      b.ticketWomen ? `${b.ticketWomen}\u00d7 ${t("bookings.women")}` : "",
      b.ticketMen ? `${b.ticketMen}\u00d7 ${t("bookings.men")}` : "",
      b.ticketCouple ? `${b.ticketCouple}\u00d7 ${t("bookings.couple")}` : "",
    ].filter(Boolean).map(esc).join(" &middot; ");

    w.document.write(`<!doctype html><html><head>
      <meta charset="utf-8">
      <title>Ticket — ${esc(b.eventTitle)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
      <style>
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0c0810;font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px;}
        .ticket{position:relative;background:linear-gradient(145deg,#14090f 0%,#1e0e1a 45%,#100c18 100%);border:1px solid rgba(212,168,83,.35);border-radius:24px;max-width:680px;width:100%;overflow:hidden;box-shadow:0 40px 80px rgba(0,0,0,.7),0 0 0 1px rgba(212,168,83,.1) inset;}
        .wm{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:96px;font-family:'Playfair Display',serif;color:rgba(212,168,83,.04);white-space:nowrap;pointer-events:none;letter-spacing:.15em;}
        .orn{position:absolute;width:60px;height:60px;opacity:.35;}
        .orn-tl{top:16px;left:16px;}
        .orn-tr{top:16px;right:16px;transform:scaleX(-1);}
        .body-sec{padding:32px 36px 28px;}
        .top-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;}
        .brand{font-size:11px;letter-spacing:.55em;text-transform:uppercase;color:rgba(212,168,83,.6);font-family:'Inter',sans-serif;}
        .badge{font-size:10px;font-family:ui-monospace,Menlo,monospace;color:rgba(212,168,83,.7);background:rgba(212,168,83,.08);border:1px solid rgba(212,168,83,.2);padding:3px 10px;border-radius:6px;letter-spacing:.08em;}
        .hero{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;}
        .hero-info{flex:1;min-width:0;}
        .venue-name{font-family:'Playfair Display',serif;font-size:32px;color:#d4a853;line-height:1.1;font-weight:600;}
        .event-title{font-size:16px;color:rgba(255,255,255,.75);margin-top:6px;font-weight:400;}
        .event-city{font-size:11px;color:rgba(255,255,255,.35);margin-top:3px;letter-spacing:.06em;}
        .fields{display:grid;grid-template-columns:1fr 1fr;gap:18px 28px;margin-top:24px;}
        .field-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.28em;color:rgba(212,168,83,.45);margin-bottom:3px;}
        .field-val{font-size:15px;color:rgba(255,255,255,.88);font-weight:500;}
        .field-val-sm{font-size:13px;color:rgba(255,255,255,.75);}
        .qr-frame{display:flex;flex-direction:column;align-items:center;gap:8px;background:#fff;border:2px solid rgba(212,168,83,.45);border-radius:14px;padding:12px;flex-shrink:0;}
        .qr-frame svg{display:block;width:140px;height:140px;}
        .qr-venue{font-size:9px;color:#5a4010;font-family:ui-monospace,Menlo,monospace;letter-spacing:.1em;text-align:center;max-width:140px;word-break:break-word;}
        .divider-row{display:flex;align-items:center;margin:0 -0px;}
        .notch{width:22px;height:44px;background:#0c0810;border-radius:0 22px 22px 0;flex-shrink:0;}
        .notch-r{border-radius:22px 0 0 22px;}
        .perf{flex:1;border-top:2px dashed rgba(212,168,83,.22);height:0;position:relative;}
        .tear-code{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-family:ui-monospace,Menlo,monospace;font-size:18px;letter-spacing:.35em;color:#d4a853;background:linear-gradient(145deg,#14090f,#1e0e1a);padding:4px 18px;white-space:nowrap;}
        .footer-sec{padding:22px 36px 28px;display:flex;justify-content:space-between;align-items:center;}
        .price-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.28em;color:rgba(212,168,83,.45);margin-bottom:4px;}
        .price-val{font-family:'Playfair Display',serif;font-size:28px;color:#d4a853;}
        .disclaimer{font-size:10px;color:rgba(255,255,255,.25);text-align:right;line-height:1.6;max-width:200px;}
        @media print{
          body{background:#fff;padding:0;}
          .ticket{background:linear-gradient(145deg,#fdf8f0 0%,#fffbf2 100%);border:2px solid #c5963a;box-shadow:none;}
          .wm{color:rgba(180,140,60,.06);}
          .venue-name{color:#9a6f1a;}
          .event-title{color:#333;}
          .event-city{color:#888;}
          .brand,.badge{color:#b8831e;}
          .badge{background:rgba(180,140,60,.1);border-color:rgba(180,140,60,.3);}
          .field-lbl{color:rgba(180,140,60,.6);}
          .field-val,.field-val-sm{color:#222;}
          .perf{border-top-color:rgba(180,140,60,.3);}
          .tear-code{color:#9a6f1a;background:#fdf8f0;}
          .qr-frame{border-color:rgba(180,140,60,.4);}
          .qr-venue{color:#6b4f0a;}
          .price-lbl{color:rgba(180,140,60,.6);}
          .price-val{color:#9a6f1a;}
          .disclaimer{color:#aaa;}
          .orn{opacity:.2;}
          .notch{background:#fff;}
        }
      </style></head><body>
      <div class="ticket">
        <div class="wm">ROYVENTO</div>
        <svg class="orn orn-tl" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2 L22 2 L2 22 Z" stroke="#d4a853" stroke-width="1" fill="none"/><path d="M2 2 L10 2 L2 10 Z" fill="rgba(212,168,83,.3)"/><circle cx="30" cy="2" r="1.5" fill="#d4a853"/><circle cx="2" cy="30" r="1.5" fill="#d4a853"/></svg>
        <svg class="orn orn-tr" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2 L22 2 L2 22 Z" stroke="#d4a853" stroke-width="1" fill="none"/><path d="M2 2 L10 2 L2 10 Z" fill="rgba(212,168,83,.3)"/><circle cx="30" cy="2" r="1.5" fill="#d4a853"/><circle cx="2" cy="30" r="1.5" fill="#d4a853"/></svg>
        <div class="body-sec">
          <div class="top-bar">
            <span class="brand">ROYVENTO</span>
            <span class="badge">${esc(ticketCode)}</span>
          </div>
          <div class="hero">
            <div class="hero-info">
              <div class="venue-name">${esc(b.vendorName)}</div>
              <div class="event-title">${esc(b.eventTitle)}</div>
              ${b.eventCity ? `<div class="event-city">${esc(b.eventCity)}</div>` : ""}
              <div class="fields">
                <div><div class="field-lbl">${esc(t("bookings.guest"))}</div><div class="field-val">${esc(b.personName || b.userName)}</div></div>
                <div><div class="field-lbl">${esc(t("bookings.date"))}</div><div class="field-val">${esc(b.bookingDate)}</div></div>
                <div><div class="field-lbl">${esc(t("bookings.tickets"))}</div><div class="field-val-sm">${ticketBreakdown || "&mdash;"}<br/><span style="color:rgba(255,255,255,.4);font-size:11px;">${total} ${esc(t("bookings.guests"))}</span></div></div>
                <div><div class="field-lbl">${esc(t("bookings.approved_by"))}</div><div class="field-val" style="text-transform:capitalize;">${esc(b.approvedBy || t("bookings.partner"))}</div></div>
              </div>
            </div>
            ${qrSvgHtml}
          </div>
        </div>
        <div class="divider-row">
          <div class="notch"></div>
          <div class="perf"><span class="tear-code">${esc(ticketCode)}</span></div>
          <div class="notch notch-r"></div>
        </div>
        <div class="footer-sec">
          <div>
            <div class="price-lbl">${esc(t("bookings.amount_paid"))}</div>
            <div class="price-val">${esc(formatINR(b.finalPrice ?? b.totalPrice))}</div>
          </div>
          <div class="disclaimer">${esc(t("bookings.present_at_entrance"))}<br/>${esc(t("bookings.non_transferable"))} &middot; Royvento</div>
        </div>
      </div>
      <script>window.onload=()=>window.print();</script>
      </body></html>`);
    w.document.close();
  };

  const ticketBreakdownParts = [
    b.ticketWomen ? `${b.ticketWomen}× ${t("bookings.women")}` : "",
    b.ticketMen ? `${b.ticketMen}× ${t("bookings.men")}` : "",
    b.ticketCouple ? `${b.ticketCouple}× ${t("bookings.couple")}` : "",
  ].filter(Boolean);

  return (
    <div className="border-t border-white/10 pt-5 mt-2">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs uppercase tracking-wider text-amber-400/80 flex items-center gap-1.5">
          <TicketIcon className="h-3.5 w-3.5" /> {t("bookings.your_ticket")}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={printTicket} className="gap-1.5 border-amber-400/20 text-amber-400/80 hover:text-amber-300 hover:border-amber-400/40">
            <Printer className="h-3.5 w-3.5" />{t("bookings.print")}
          </Button>
          <Button size="sm" onClick={printTicket} className="gap-1.5 bg-gradient-to-br from-amber-600 to-amber-800 border-0 text-black font-semibold hover:from-amber-500 hover:to-amber-700">
            <Download className="h-3.5 w-3.5" />{t("bookings.pdf")}
          </Button>
        </div>
      </div>

      {/* Premium Ticket Card */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #14090f 0%, #1e0e1a 45%, #100c18 100%)",
          border: "1px solid rgba(212,168,83,0.35)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,168,83,0.08) inset",
        }}
      >
        {/* Watermark */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden"
          aria-hidden
        >
          <span
            className="font-serif text-8xl tracking-[0.2em] whitespace-nowrap"
            style={{ color: "rgba(212,168,83,0.035)", transform: "rotate(-28deg) translateY(10%)" }}
          >
            ROYVENTO
          </span>
        </div>

        {/* Corner ornaments */}
        <svg className="absolute top-4 left-4 w-12 h-12 opacity-30" aria-hidden viewBox="0 0 48 48" fill="none">
          <path d="M2 2 L18 2 L2 18 Z" stroke="#d4a853" strokeWidth="1" fill="none"/>
          <path d="M2 2 L8 2 L2 8 Z" fill="rgba(212,168,83,0.4)"/>
          <circle cx="24" cy="2" r="1.2" fill="#d4a853"/>
          <circle cx="2" cy="24" r="1.2" fill="#d4a853"/>
        </svg>
        <svg className="absolute top-4 right-4 w-12 h-12 opacity-30" aria-hidden viewBox="0 0 48 48" fill="none" style={{ transform: "scaleX(-1)" }}>
          <path d="M2 2 L18 2 L2 18 Z" stroke="#d4a853" strokeWidth="1" fill="none"/>
          <path d="M2 2 L8 2 L2 8 Z" fill="rgba(212,168,83,0.4)"/>
          <circle cx="24" cy="2" r="1.2" fill="#d4a853"/>
          <circle cx="2" cy="24" r="1.2" fill="#d4a853"/>
        </svg>

        {/* Top section */}
        <div className="relative z-10 px-7 pt-7 pb-6">
          {/* Brand + ticket code row */}
          <div className="flex justify-between items-center mb-5">
            <span className="text-[10px] tracking-[0.55em] uppercase text-amber-400/55 font-medium">ROYVENTO</span>
            <span
              className="text-[10px] font-mono tracking-[0.1em] px-2.5 py-1 rounded"
              style={{
                color: "rgba(212,168,83,0.7)",
                background: "rgba(212,168,83,0.07)",
                border: "1px solid rgba(212,168,83,0.2)",
              }}
            >
              {ticketCode}
            </span>
          </div>

          {/* Hero + QR */}
          <div className="flex justify-between items-start gap-6">
            <div className="flex-1 min-w-0">
              <h2 className="font-serif text-2xl leading-tight" style={{ color: "#d4a853" }}>{b.vendorName}</h2>
              <p className="text-base text-white/75 mt-1 font-light">{b.eventTitle}</p>
              {b.eventCity && <p className="text-xs text-white/35 mt-0.5 tracking-wide">{b.eventCity}</p>}

              <div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-6">
                <TicketField label={t("bookings.guest")} value={b.personName || b.userName} />
                <TicketField label={t("bookings.date")} value={b.bookingDate} />
                <TicketField
                  label={t("bookings.tickets")}
                  value={
                    ticketBreakdownParts.length > 0 ? (
                      <>
                        {ticketBreakdownParts.join(" · ")}
                        <span className="text-white/35 ml-1 text-xs">({total} {t("bookings.guests")})</span>
                      </>
                    ) : `${total} ${t("bookings.guests")}`
                  }
                />
                <TicketField label={t("bookings.approved_by")} value={<span className="capitalize">{b.approvedBy || t("bookings.partner")}</span>} />
              </div>
            </div>

            {/* QR code block */}
            <div className="shrink-0 flex flex-col items-center gap-2">
              <div
                className="p-2.5 rounded-xl"
                style={{ background: "#fff", border: "2px solid rgba(212,168,83,0.4)" }}
              >
                <QRCodeSVG value={ticketCode} size={120} level="M" />
              </div>
              <p
                className="text-[9px] font-mono tracking-wider text-center max-w-[132px] leading-tight"
                style={{ color: "rgba(212,168,83,0.5)" }}
              >
                {b.vendorName}
              </p>
            </div>
          </div>
        </div>

        {/* Perforated tear line with ticket code */}
        <div className="relative z-10 flex items-center">
          <div className="w-5 h-10 rounded-r-full shrink-0" style={{ background: "rgba(0,0,0,0.55)" }} />
          <div className="relative flex-1 flex items-center justify-center" style={{ borderTop: "2px dashed rgba(212,168,83,0.22)", height: "2.5rem" }}>
            <span
              className="absolute font-mono text-base tracking-[0.35em] px-4 py-0.5"
              style={{
                color: "#d4a853",
                background: "linear-gradient(145deg, #14090f, #1e0e1a)",
                letterSpacing: "0.35em",
              }}
            >
              {ticketCode}
            </span>
          </div>
          <div className="w-5 h-10 rounded-l-full shrink-0" style={{ background: "rgba(0,0,0,0.55)" }} />
        </div>

        {/* Footer section */}
        <div className="relative z-10 flex justify-between items-center px-7 py-5">
          <div>
            <p className="text-[9px] uppercase tracking-[0.28em] mb-1" style={{ color: "rgba(212,168,83,0.45)" }}>Amount paid</p>
            <p className="font-serif text-2xl" style={{ color: "#d4a853" }}>{formatINR(b.finalPrice ?? b.totalPrice)}</p>
          </div>
          <p className="text-[10px] text-right leading-relaxed max-w-44" style={{ color: "rgba(255,255,255,0.25)" }}>
            Present this ticket at the entrance.<br />Non-transferable · Royvento
          </p>
        </div>
      </div>
    </div>
  );
}
