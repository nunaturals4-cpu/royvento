import { useState, useEffect, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetParty,
  useBookParty,
  useCancelParty,
  useResetPartyInvite,
  useGetMe,
  useGetSoloAccess,
  getGetPartyQueryKey,
  useListPartyMessages,
  useSendPartyMessage,
  getListPartyMessagesQueryKey,
  type Party,
} from "@workspace/api-client-react";
import { SEO } from "@/components/SEO";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { apiPost } from "@/lib/api";
import { joinBadge, prettyDressCode, PARTY_PREFS } from "@/components/solo-connect/CreatePartyWizard";
import { EditPartyModal } from "@/components/party/EditPartyModal";
import { useRequireGender } from "@/components/useRequireGender";
import {
  MapPin,
  CalendarDays,
  Clock,
  Users,
  Ticket,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  PartyPopper,
  Pencil,
  Ban,
  ShieldCheck,
  Loader2,
  LayoutDashboard,
  Images,
  X,
  Sparkles,
  CheckCircle2,
  Zap,
  Crown,
  ShieldAlert,
  Flag,
  MessageCircle,
  Lock,
  Send,
  SlidersHorizontal,
  Share2,
  RefreshCw,
} from "lucide-react";

const GOLD = "#d4af37";
const RED = "#b91c1c";
const PARTY = "#f472b6";
const SURFACE = "#0d0c0f"; // matte-black page surface (used for ticket punch-holes)

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) { resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function PartyDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [editing, setEditing] = useState(false);

  const { data: me } = useGetMe({ query: { retry: false } as any });
  const { data: party, isLoading } = useGetParty(id, { query: { enabled: !Number.isNaN(id), retry: false } as any });
  const loggedIn = !!me?.user;
  const { data: access, isLoading: accessLoading } = useGetSoloAccess({
    query: { enabled: loggedIn, retry: false } as any,
  });

  const book = useBookParty();
  const cancel = useCancelParty();
  const { ensureGender, modal: genderModal } = useRequireGender();

  // Invite token carried in the host's share link (?invite=…). Required to book
  // a private party for everyone except the organizer.
  const inviteToken = new URLSearchParams(window.location.search).get("invite") ?? "";

  const refresh = () => qc.invalidateQueries({ queryKey: getGetPartyQueryKey(id) });

  if (isLoading) {
    return <div className="min-h-[60vh] flex items-center justify-center bg-background"><Spinner /></div>;
  }
  if (!party) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 bg-background text-center px-4">
        <PartyPopper className="h-10 w-10" style={{ color: PARTY }} />
        <p className="font-serif text-2xl" style={{ color: "#fff" }}>Party not found</p>
        <Link href="/" className="text-sm" style={{ color: GOLD }}>Back home</Link>
      </div>
    );
  }

  const isPaid = party.ticketType === "paid";
  const cancelled = party.status === "cancelled";
  const salesStopped = party.status === "sales_stopped";
  // Private party + viewer isn't the host, hasn't already joined, and arrived
  // without an invite token → booking is locked behind the host's invite link.
  const needsInvite = party.visibility === "private" && !party.isOrganizer && !party.canChat && !inviteToken;
  const seatsLeft = party.seatsLeft;
  const soldOut = seatsLeft != null && seatsLeft <= 0;
  const booked = seatsLeft != null && party.capacity > 0 ? party.capacity - seatsLeft : 0;
  const fillPct = party.capacity > 0 && seatsLeft != null ? Math.min(100, Math.round((booked / party.capacity) * 100)) : 0;

  function handleBook() {
    if (!loggedIn) {
      // Preserve ?invite=… across login so a private invite survives the round-trip.
      setLocation(`/login?next=${encodeURIComponent(`/party/${id}${window.location.search}`)}`);
      return;
    }
    // Require a binary gender first (reused silently if already set).
    ensureGender(() => doBook());
  }

  function doBook() {
    book.mutate(
      { id, data: { quantity: 1, inviteToken: inviteToken || undefined } },
      {
        onSuccess: async (res) => {
          // Paid party → open Razorpay checkout, then verify server-side.
          if (res?.paymentPending && res.razorpayOrderId) {
            const loaded = await loadRazorpay();
            if (!loaded) {
              toast({ title: "Payment error", description: "Could not load the payment gateway.", variant: "destructive" });
              return;
            }
            const rzp = new (window as any).Razorpay({
              key: res.razorpayKeyId,
              amount: res.amountPaise,
              currency: "INR",
              order_id: res.razorpayOrderId,
              name: "Royvento",
              description: party!.name,
              prefill: { name: me?.user?.name ?? "", contact: me?.user?.phone ?? "" },
              theme: { color: "#f472b6" },
              handler: async (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
                try {
                  await apiPost("/api/create-your-party/payments/verify", {
                    razorpayOrderId: r.razorpay_order_id,
                    razorpayPaymentId: r.razorpay_payment_id,
                    razorpaySignature: r.razorpay_signature,
                  });
                  toast({ title: "🎉 Payment successful!", description: "Your booking is confirmed. See it in My Bookings." });
                  refresh();
                } catch (err) {
                  toast({ title: "Payment verification failed", description: err instanceof Error ? err.message : "Contact support with your payment ID.", variant: "destructive" });
                }
              },
              modal: {
                ondismiss: () => toast({ title: "Payment cancelled", description: "Your booking is on hold — try again.", variant: "destructive" }),
              },
            });
            rzp.open();
            return;
          }
          // Free party → confirmed immediately.
          toast({ title: "🎉 Booking confirmed!", description: "You're going. See it in My Bookings." });
          refresh();
        },
        onError: (e) => toast({ title: e instanceof Error ? e.message : "Could not book", variant: "destructive" }),
      },
    );
  }

  function handleCancelParty() {
    if (!confirm("Cancel this party? All attendees will be notified.")) return;
    cancel.mutate(
      { id },
      {
        onSuccess: () => { toast({ title: "Party cancelled." }); refresh(); },
        onError: (e) => toast({ title: e instanceof Error ? e.message : "Could not cancel", variant: "destructive" }),
      },
    );
  }

  const locationLine = [party.venueName, party.address, party.city, party.pinCode].filter(Boolean).join(", ");

  return (
    <>
      <SEO title={`${party.name} | Royvento`} noindex />
      <div className="relative min-h-screen bg-background pb-24 overflow-hidden">
        {/* Ambient luxury glow field */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 right-0 h-[460px] w-[560px] rounded-full blur-[140px] opacity-40"
            style={{ background: `radial-gradient(circle, ${PARTY}33, transparent 70%)` }} />
          <div className="absolute top-[40%] -left-32 h-[420px] w-[520px] rounded-full blur-[150px] opacity-25"
            style={{ background: `radial-gradient(circle, ${GOLD}22, transparent 70%)` }} />
        </div>

        {/* ── Hero — compact announcement-card style (static, not a slider) ── */}
        <div className="relative container mx-auto px-4 md:px-6 pt-6">
          <button type="button" onClick={() => (history.length > 1 ? history.back() : setLocation("/solo-connect"))}
            className="inline-flex items-center gap-1.5 mb-3 text-xs font-medium transition-colors hover:text-white"
            style={{ color: "rgba(255,255,255,0.6)" }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>

          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-[#131313] to-black"
            style={{ boxShadow: "0 24px 70px -24px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px rgba(255,255,255,0.04)" }}>
            <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(660px 320px at 4% 0%, ${PARTY}1f, transparent 62%)` }} />

            <div className="relative flex flex-col md:flex-row items-stretch md:min-h-[300px]">
              {/* Cover — absolutely filled so it always covers its panel cleanly */}
              <div className="relative w-full md:w-[42%] lg:w-[38%] shrink-0 h-52 sm:h-60 md:h-auto overflow-hidden">
                {party.coverImageUrl ? (
                  <img src={party.coverImageUrl} alt={party.name} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0" style={{ background: `radial-gradient(120% 120% at 20% 0%, ${PARTY}33, transparent 55%), linear-gradient(135deg, #1a1820, #0d0c0f)` }} />
                )}
                {/* Depth + seam blend into the content panel */}
                <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(118deg, rgba(0,0,0,0.28), transparent 46%)" }} />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 md:hidden" style={{ background: "linear-gradient(180deg, transparent, #161616)" }} />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-20 hidden md:block" style={{ background: "linear-gradient(90deg, transparent, #161616)" }} />
                <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.16em] backdrop-blur-md"
                  style={{ background: "rgba(0,0,0,0.5)", color: GOLD, border: `1px solid ${GOLD}40` }}>
                  <Crown className="h-3 w-3" /> Royvento Party
                </span>
              </div>

              {/* Content */}
              <div className="relative flex flex-col justify-center gap-2.5 p-5 md:p-7 md:pl-4 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <HeroChip icon={PartyPopper} text="Create Your Own Party" tint={PARTY} />
                  <HeroChip text={joinBadge(party.joinType)} />
                  {isPaid
                    ? <HeroChip icon={Ticket} text="Ticketed" tint={GOLD} />
                    : <HeroChip icon={Sparkles} text="Free entry" tint="#4ade80" />}
                  {cancelled && <HeroChip text="Cancelled" tint={RED} />}
                  {salesStopped && !cancelled && <HeroChip text="Sales paused" tint={GOLD} />}
                </div>
                <h1 className="font-serif font-bold leading-[1.08] tracking-tight text-2xl md:text-3xl"
                  style={{ background: "linear-gradient(180deg, #ffffff 0%, #f3e4c2 140%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  {party.name}
                </h1>
                {party.organizerName && (
                  <div className="flex items-center gap-2.5">
                    <span className="flex items-center justify-center h-8 w-8 rounded-full shrink-0 text-xs font-semibold"
                      style={{ background: `linear-gradient(145deg, ${GOLD}, ${RED})`, color: "#fff", boxShadow: `0 0 16px ${GOLD}55` }}>
                      {party.organizerName.trim().charAt(0).toUpperCase()}
                    </span>
                    <p className="text-sm" style={{ color: "rgba(255,255,255,0.82)" }}>
                      <span style={{ color: "rgba(255,255,255,0.45)" }}>Hosted by </span>{party.organizerName}
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <FactPill icon={CalendarDays} text={party.partyDate || "Date TBA"} />
                  {(party.startTime || party.endTime) && <FactPill icon={Clock} text={`${party.startTime || "—"}${party.endTime ? ` – ${party.endTime}` : ""}`} />}
                  <FactPill icon={Users} text={joinBadge(party.joinType)} />
                  {/* Capacity: only the host sees exact remaining/sold numbers.
                      Public viewers get a status word so ticket inventory stays
                      private (the API also withholds the real counts from them). */}
                  <FactPill
                    icon={Ticket}
                    text={
                      party.capacity > 0
                        ? party.isOrganizer && seatsLeft != null
                          ? `${seatsLeft} of ${party.capacity} left`
                          : soldOut
                            ? "Sold out"
                            : "Limited seats"
                        : "Open entry"
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Photo gallery — host-uploaded, shown below the facts bar */}
        {party.galleryImages && party.galleryImages.length > 0 && (
          <PartyGallery images={party.galleryImages} />
        )}

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="relative container mx-auto px-4 md:px-6 mt-10 md:mt-12 grid lg:grid-cols-3 gap-7">
          {/* Left: editorial content */}
          <div className="lg:col-span-2 space-y-6">
            {party.description && (
              <DetailCard icon={Sparkles} eyebrow="The vibe" title="About this party">
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.78)" }}>{party.description}</p>
              </DetailCard>
            )}

            <PartyVibe party={party} />

            <PartyChat partyId={id} canChat={!!party.canChat} loggedIn={loggedIn} isPaid={isPaid} />

            {locationLine && (
              <DetailCard icon={MapPin} eyebrow="Where" title="Location">
                <p className="text-[15px] leading-relaxed" style={{ color: "rgba(255,255,255,0.78)" }}>{locationLine}</p>
                {party.mapLocation && (
                  <a href={party.mapLocation} target="_blank" rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
                    style={{ background: `${PARTY}14`, color: PARTY, border: `1px solid ${PARTY}40` }}>
                    <ExternalLink className="h-4 w-4" /> Open in Google Maps
                  </a>
                )}
              </DetailCard>
            )}

            {party.rules && (
              <DetailCard icon={ShieldCheck} eyebrow="Good to know" title="House rules">
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.78)" }}>{party.rules}</p>
              </DetailCard>
            )}

            <ZeroTolerance />
          </div>

          {/* Right: premium boarding-pass ticket card */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 rounded-[28px] overflow-hidden"
              style={{ background: "linear-gradient(180deg, rgba(28,25,30,0.96), rgba(14,12,16,0.97))", border: "1px solid rgba(255,255,255,0.12)", boxShadow: `0 30px 70px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 1px ${PARTY}12` }}>
              {/* gold hairline */}
              <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />

              {/* Price zone */}
              <div className="p-6 pb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] mb-1.5" style={{ color: isPaid ? GOLD : "#4ade80" }}>
                      {isPaid ? "Paid ticket" : "Free entry"}
                    </p>
                    <p className="font-serif text-4xl leading-none" style={{ color: "#fff" }}>
                      {isPaid ? `₹${Number(party.ticketPrice).toLocaleString("en-IN")}` : "Free"}
                    </p>
                  </div>
                  <span className="flex items-center justify-center h-12 w-12 rounded-2xl shrink-0"
                    style={{ background: `linear-gradient(145deg, ${PARTY}26, ${RED}1a)`, border: `1px solid ${PARTY}44`, boxShadow: `0 0 22px ${PARTY}22` }}>
                    <Ticket className="h-5 w-5" style={{ color: PARTY }} />
                  </span>
                </div>

                {/* Capacity meter — booked/left counts are private to the host.
                    Public viewers never see how many tickets are sold or pending;
                    at most a neutral "Sold out" once no seats remain. */}
                {seatsLeft != null && party.capacity > 0 && party.isOrganizer ? (
                  <div className="mt-5">
                    <div className="flex items-center justify-between text-[11px] mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                      <span>{booked} booked</span>
                      <span style={{ color: soldOut ? "#fca5a5" : PARTY }}>{soldOut ? "Sold out" : `${seatsLeft} left`}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${fillPct}%`, background: `linear-gradient(90deg, ${PARTY}, ${GOLD})` }} />
                    </div>
                  </div>
                ) : soldOut ? (
                  <div className="mt-5 text-[11px] font-semibold" style={{ color: "#fca5a5" }}>Sold out</div>
                ) : null}
              </div>

              {/* Perforated divider */}
              <div className="relative h-6">
                <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 h-6 w-6 rounded-full" style={{ background: SURFACE }} />
                <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-6 w-6 rounded-full" style={{ background: SURFACE }} />
                <span className="absolute left-5 right-5 top-1/2 -translate-y-1/2 border-t border-dashed" style={{ borderColor: "rgba(255,255,255,0.18)" }} />
              </div>

              {/* Action zone */}
              <div className="p-6 pt-4">
                {party.isOrganizer ? (
                  <div className="space-y-2.5">
                    <Link href="/dashboard/parties">
                      <a className="group w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold transition-all hover:scale-[1.02]"
                        style={{ background: `linear-gradient(135deg, ${PARTY}, #db2777)`, color: "#fff", boxShadow: `0 14px 36px ${PARTY}40` }}>
                        <LayoutDashboard className="h-4 w-4" /> Open dashboard
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </a>
                    </Link>
                    <button type="button" onClick={() => setEditing(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all hover:bg-white/[0.06]"
                      style={{ background: "rgba(255,255,255,0.04)", color: "#fff", border: "1px solid rgba(255,255,255,0.14)" }}>
                      <Pencil className="h-4 w-4" style={{ color: PARTY }} /> Edit party
                    </button>
                    {!cancelled && (
                      <button type="button" onClick={handleCancelParty} disabled={cancel.isPending}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all"
                        style={{ background: `${RED}14`, color: "#fca5a5", border: `1px solid ${RED}3a` }}>
                        <Ban className="h-4 w-4" /> Cancel party
                      </button>
                    )}
                    <div className="flex items-center justify-center gap-1.5 mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                      <Crown className="h-3 w-3" style={{ color: GOLD }} /> You're the host of this party
                    </div>
                  </div>
                ) : cancelled ? (
                  <div className="text-center py-3.5 rounded-2xl text-sm font-medium" style={{ background: `${RED}14`, color: "#fca5a5", border: `1px solid ${RED}33` }}>
                    This party has been cancelled.
                  </div>
                ) : needsInvite ? (
                  <div className="flex flex-col items-center text-center gap-3 p-5 rounded-2xl"
                    style={{ background: `linear-gradient(180deg, ${PARTY}0f, rgba(14,12,16,0.9))`, border: `1px solid ${PARTY}44` }}>
                    <span className="flex items-center justify-center h-12 w-12 rounded-2xl"
                      style={{ background: `${PARTY}18`, border: `1px solid ${PARTY}55`, boxShadow: `0 0 22px ${PARTY}22` }}>
                      <Lock className="h-5 w-5" style={{ color: PARTY }} />
                    </span>
                    <div>
                      <p className="font-serif text-lg" style={{ color: "#fff" }}>Private party — invite only</p>
                      <p className="text-[13px] mt-1 leading-snug" style={{ color: "rgba(255,255,255,0.58)" }}>
                        This party is private. Open the host's invite link to book your spot.
                      </p>
                    </div>
                  </div>
                ) : !loggedIn ? (
                  // Logged-out visitor — show book button; handleBook will redirect to login.
                  <button type="button" onClick={handleBook}
                    className="group w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-[15px] font-bold transition-all hover:scale-[1.02]"
                    style={{ background: `linear-gradient(135deg, ${PARTY} 0%, #db2777 55%, ${RED} 120%)`, color: "#fff", boxShadow: `0 16px 44px ${PARTY}44, 0 0 0 1px ${GOLD}26` }}>
                    <Ticket className="h-4 w-4" />
                    {isPaid ? "Book Ticket" : "Reserve Free Spot"}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ) : accessLoading ? (
                  // Checking premium status — don't flash the book button yet.
                  <div className="w-full flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin" style={{ color: "rgba(255,255,255,0.4)" }} />
                  </div>
                ) : access && !access.eligible ? (
                  // Logged-in but non-premium: gated.
                  <div>
                    <div className="flex flex-col items-center text-center gap-3 p-5 rounded-2xl mb-3"
                      style={{ background: `linear-gradient(180deg, rgba(212,175,55,0.08), rgba(14,12,16,0.9))`, border: `1px solid ${GOLD}44` }}>
                      <span className="flex items-center justify-center h-12 w-12 rounded-2xl"
                        style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}55`, boxShadow: `0 0 22px ${GOLD}22` }}>
                        <Crown className="h-5 w-5" style={{ color: GOLD }} />
                      </span>
                      <div>
                        <p className="font-serif text-lg" style={{ color: "#fff" }}>Premium members only</p>
                        <p className="text-[13px] mt-1 leading-snug" style={{ color: "rgba(255,255,255,0.58)" }}>
                          Booking tickets is exclusive to Royvento Premium. Upgrade to reserve your spot.
                        </p>
                      </div>
                    </div>
                    <Link href="/subscription?plan=user_vip">
                      <a className="group w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold transition-all hover:brightness-110"
                        style={{ background: `linear-gradient(135deg, ${GOLD}, #b8962e)`, color: "#000", boxShadow: `0 10px 30px ${GOLD}40` }}>
                        <Crown className="h-4 w-4" /> Upgrade to Premium
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </a>
                    </Link>
                    <p className="text-[11px] text-center mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
                      Unlocks party bookings, group chats & Solo Connect
                    </p>
                  </div>
                ) : (
                  <>
                    <button type="button" onClick={handleBook} disabled={book.isPending || soldOut || salesStopped}
                      className="group w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-[15px] font-bold transition-all hover:scale-[1.02] disabled:hover:scale-100"
                      style={{
                        background: soldOut || salesStopped ? "rgba(255,255,255,0.07)" : `linear-gradient(135deg, ${PARTY} 0%, #db2777 55%, ${RED} 120%)`,
                        color: soldOut || salesStopped ? "rgba(255,255,255,0.5)" : "#fff",
                        boxShadow: soldOut || salesStopped ? "none" : `0 16px 44px ${PARTY}44, 0 0 0 1px ${GOLD}26`,
                        opacity: book.isPending ? 0.7 : 1,
                      }}>
                      {book.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
                      {soldOut ? "Sold out" : salesStopped ? "Sales paused" : book.isPending ? "Processing…" : isPaid ? "Book Ticket" : "Reserve Free Spot"}
                      {!soldOut && !salesStopped && !book.isPending && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                    </button>

                    {/* Trust row */}
                    <div className="mt-4 grid grid-cols-1 gap-2">
                      {(isPaid
                        ? [
                            { icon: ShieldCheck, text: "Secure online payment via Razorpay" },
                            { icon: Zap, text: "Instant booking confirmation" },
                            { icon: CheckCircle2, text: "Added straight to your bookings" },
                          ]
                        : [
                            { icon: Zap, text: "Instant RSVP — no payment needed" },
                            { icon: CheckCircle2, text: "Added straight to your bookings" },
                          ]
                      ).map((t) => (
                        <div key={t.text} className="flex items-center gap-2.5 text-[12px]" style={{ color: "rgba(255,255,255,0.6)" }}>
                          <t.icon className="h-3.5 w-3.5 shrink-0" style={{ color: "#4ade80" }} /> {t.text}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Share — everyone can share the party; the host's link carries
                    the invite token that unlocks a private party. */}
                {!cancelled && <ShareParty party={party} onReset={refresh} />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {editing && party.isOrganizer && (
        <EditPartyModal party={party} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />
      )}
      {genderModal}
    </>
  );
}

// Share the party. Everyone can copy/share the plain profile link; the host
// additionally gets the invite-token link (which unlocks a PRIVATE party) plus a
// Reset action that revokes previously-shared invite links.
function ShareParty({ party, onReset }: { party: Party; onReset: () => void }) {
  const { toast } = useToast();
  const reset = useResetPartyInvite();
  const isPrivate = party.visibility === "private";
  // Only the host receives a non-empty inviteToken from the API, so only the host
  // can build an invite link. Everyone else shares the plain profile URL.
  const base = `${window.location.origin}/party/${party.id}`;
  const shareUrl = party.isOrganizer && isPrivate && party.inviteToken
    ? `${base}?invite=${party.inviteToken}`
    : base;

  async function doShare() {
    const text = isPrivate ? `You're invited to ${party.name} on Royvento` : `Check out ${party.name} on Royvento`;
    if (navigator.share) {
      try {
        await navigator.share({ title: party.name, text, url: shareUrl });
      } catch {
        /* user dismissed the share sheet */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Link copied!",
        description: isPrivate && party.isOrganizer ? "Anyone with this link can book your private party." : "Share it with your friends.",
      });
    } catch {
      toast({ title: "Could not copy the link", description: shareUrl, variant: "destructive" });
    }
  }

  function doReset() {
    if (!confirm("Reset the invite link? Anyone using the old link will no longer be able to book.")) return;
    reset.mutate(
      { id: party.id },
      {
        onSuccess: () => { toast({ title: "Invite link reset", description: "Old links no longer work — share the new one." }); onReset(); },
        onError: (e) => toast({ title: e instanceof Error ? e.message : "Could not reset link", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      <button type="button" onClick={doShare}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all hover:bg-white/[0.06]"
        style={{ background: "rgba(255,255,255,0.04)", color: "#fff", border: "1px solid rgba(255,255,255,0.14)" }}>
        <Share2 className="h-4 w-4" style={{ color: PARTY }} />
        {isPrivate && party.isOrganizer ? "Share invite link" : "Share party"}
      </button>
      {party.isOrganizer && isPrivate && (
        <button type="button" onClick={doReset} disabled={reset.isPending}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-medium transition-all hover:bg-white/[0.04]"
          style={{ color: "rgba(255,255,255,0.55)" }}>
          {reset.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Reset invite link
        </button>
      )}
    </div>
  );
}

function HeroChip({ icon: Icon, text, tint }: { icon?: typeof Ticket; text: string; tint?: string }) {
  const c = tint ?? "rgba(255,255,255,0.8)";
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium backdrop-blur-md"
      style={{ background: tint ? `${tint}1f` : "rgba(255,255,255,0.08)", color: tint ? c : "#fff", border: `1px solid ${tint ? `${tint}55` : "rgba(255,255,255,0.16)"}` }}>
      {Icon && <Icon className="h-3 w-3" />} {text}
    </span>
  );
}

function FactPill({ icon: Icon, text }: { icon: typeof MapPin; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.82)" }}>
      <Icon className="h-3.5 w-3.5" style={{ color: PARTY }} /> {text}
    </span>
  );
}

// Royvento platform safety policy shown on every party — not host-dependent.
function ZeroTolerance() {
  const points = [
    { icon: ShieldAlert, text: "Harassment, threats or misconduct lead to immediate removal from the party." },
    { icon: Ban, text: "Repeat or serious violations result in account suspension or a permanent ban." },
    { icon: Flag, text: "Report anyone who makes you uncomfortable — our team reviews every report." },
    { icon: ShieldCheck, text: "Meet in public, stay aware of your surroundings, and look out for each other." },
  ];
  return (
    <div className="relative rounded-3xl p-6 md:p-7 overflow-hidden"
      style={{ background: "linear-gradient(180deg, rgba(45,18,18,0.4), rgba(17,12,13,0.6))", border: `1px solid ${RED}33`, boxShadow: `0 16px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)` }}>
      <span className="absolute top-0 left-7 right-7 h-px" style={{ background: `linear-gradient(90deg, transparent, ${RED}66, transparent)` }} />
      <div className="flex items-center gap-3 mb-3.5">
        <span className="flex items-center justify-center h-10 w-10 rounded-2xl shrink-0"
          style={{ background: `${RED}1f`, border: `1px solid ${RED}44`, boxShadow: `0 0 20px ${RED}1f` }}>
          <ShieldAlert className="h-4 w-4" style={{ color: "#fca5a5" }} />
        </span>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#fca5a5" }}>Safety first</p>
          <h3 className="font-serif text-xl leading-tight" style={{ color: "#fff" }}>Zero-tolerance policy</h3>
        </div>
      </div>
      <p className="text-[15px] leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.78)" }}>
        Royvento enforces a strict zero-tolerance policy against harassment, abuse, or any unsafe or
        inappropriate behaviour at this party. Every guest is expected to treat others with respect.
      </p>
      <ul className="space-y-2.5">
        {points.map((p) => (
          <li key={p.text} className="flex items-start gap-2.5 text-[14px]" style={{ color: "rgba(255,255,255,0.7)" }}>
            <p.icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#fca5a5" }} /> {p.text}
          </li>
        ))}
      </ul>
      <Link href="/community-guidelines">
        <a className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
          style={{ background: `${RED}14`, color: "#fca5a5", border: `1px solid ${RED}3a` }}>
          Read our community guidelines <ArrowRight className="h-4 w-4" />
        </a>
      </Link>
    </div>
  );
}

function DetailCard({ icon: Icon, eyebrow, title, children }: { icon: typeof MapPin; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-3xl p-6 md:p-7 overflow-hidden"
      style={{ background: "linear-gradient(180deg, rgba(24,22,26,0.7), rgba(15,13,17,0.7))", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 16px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
      <span className="absolute top-0 left-7 right-7 h-px" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}55, transparent)` }} />
      <div className="flex items-center gap-3 mb-3.5">
        <span className="flex items-center justify-center h-10 w-10 rounded-2xl shrink-0"
          style={{ background: `${PARTY}14`, border: `1px solid ${PARTY}33`, boxShadow: `0 0 20px ${PARTY}1a` }}>
          <Icon className="h-4 w-4" style={{ color: PARTY }} />
        </span>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: GOLD }}>{eyebrow}</p>
          <h3 className="font-serif text-xl leading-tight" style={{ color: "#fff" }}>{title}</h3>
        </div>
      </div>
      {children}
    </div>
  );
}

// ── Optional vibe metadata (age group, dress code, yes/no preferences) ───────
function PartyVibe({ party }: { party: Party }) {
  const prefs = PARTY_PREFS.filter((p) => party[p.key] === "yes" || party[p.key] === "no");
  if (!party.ageGroup && !party.dressCode && prefs.length === 0) return null;
  return (
    <DetailCard icon={SlidersHorizontal} eyebrow="Party vibe" title="Good to know">
      <div className="flex flex-wrap gap-2">
        {party.ageGroup && <VibeChip label="Age" value={party.ageGroup} />}
        {party.dressCode && <VibeChip label="Dress code" value={prettyDressCode(party.dressCode)} />}
        {prefs.map((p) => (
          <VibeChip key={p.key} label={p.label} value={party[p.key] === "yes" ? "Yes" : "No"} positive={party[p.key] === "yes"} />
        ))}
      </div>
    </DetailCard>
  );
}

function VibeChip({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const accent = positive === undefined ? GOLD : positive ? "#4ade80" : "#fca5a5";
  return (
    <span className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
      <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.45)" }}>{label}</span>
      <span style={{ color: accent }}>{value}</span>
    </span>
  );
}

// ── Group chat — visible to all but locked until you join (book) ─────────────
function PartyChat({ partyId, canChat, loggedIn, isPaid }: { partyId: number; canChat: boolean; loggedIn: boolean; isPaid: boolean }) {
  if (!canChat) {
    return (
      <DetailCard icon={MessageCircle} eyebrow="Members only" title="Group chat">
        <div className="relative rounded-2xl overflow-hidden" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="p-4 space-y-2.5 blur-[6px] select-none pointer-events-none" aria-hidden>
            <FakeBubble side="left" w="58%" /><FakeBubble side="right" w="44%" />
            <FakeBubble side="left" w="68%" /><FakeBubble side="right" w="52%" />
            <FakeBubble side="left" w="40%" />
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6" style={{ background: "rgba(13,12,15,0.6)" }}>
            <span className="flex items-center justify-center h-11 w-11 rounded-2xl mb-3" style={{ background: `${PARTY}1f`, border: `1px solid ${PARTY}44`, boxShadow: `0 0 22px ${PARTY}22` }}>
              <Lock className="h-5 w-5" style={{ color: PARTY }} />
            </span>
            <p className="font-serif text-lg" style={{ color: "#fff" }}>Chat unlocks after you join</p>
            <p className="text-[13px] mt-1 max-w-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
              {loggedIn
                ? `${isPaid ? "Book your ticket" : "Reserve your free spot"} to chat with the host and other guests.`
                : "Log in and join to chat with the host and other guests."}
            </p>
          </div>
        </div>
      </DetailCard>
    );
  }
  return <PartyChatLive partyId={partyId} />;
}

function FakeBubble({ side, w }: { side: "left" | "right"; w: string }) {
  return (
    <div className={`flex ${side === "right" ? "justify-end" : "justify-start"}`}>
      <div className="h-7 rounded-2xl" style={{ width: w, background: side === "right" ? RED : "rgba(255,255,255,0.08)" }} />
    </div>
  );
}

function PartyChatLive({ partyId }: { partyId: number }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: messages } = useListPartyMessages(partyId, {
    query: { refetchInterval: 2500, refetchIntervalInBackground: false, retry: false } as any,
  });
  const send = useSendPartyMessage();

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  function submit() {
    const body = text.trim();
    if (!body || send.isPending) return;
    setText("");
    send.mutate(
      { id: partyId, data: { body } },
      {
        onSuccess: (msg) =>
          qc.setQueryData(getListPartyMessagesQueryKey(partyId), (old: any) => (Array.isArray(old) ? [...old, msg] : [msg])),
        onError: () => setText(body),
      },
    );
  }

  const list = messages ?? [];
  return (
    <DetailCard icon={MessageCircle} eyebrow="You're in" title="Group chat">
      <div ref={scrollRef} className="h-64 overflow-y-auto space-y-2 p-3 rounded-2xl mb-3"
        style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {list.length === 0 && <p className="text-xs text-center py-10" style={{ color: "rgba(255,255,255,0.35)" }}>No messages yet. Say hi 👋</p>}
        {list.map((m) => (
          <div key={m.id} className={`flex ${m.isMine ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[78%] px-3 py-1.5 rounded-2xl"
              style={{ background: m.isMine ? RED : "rgba(255,255,255,0.07)", color: "#fff", borderBottomRightRadius: m.isMine ? 4 : undefined, borderBottomLeftRadius: m.isMine ? undefined : 4 }}>
              {!m.isMine && (
                <p className="text-[10px] font-semibold mb-0.5 flex items-center gap-1" style={{ color: m.isHost ? GOLD : PARTY }}>
                  {m.userName}{m.isHost && <Crown className="h-2.5 w-2.5" />}
                </p>
              )}
              <p className="text-sm break-words whitespace-pre-wrap">{m.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Message the group…" maxLength={1000}
          className="flex-1 px-3.5 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
        <button type="button" onClick={submit} disabled={send.isPending || !text.trim()}
          className="px-4 rounded-xl flex items-center justify-center transition-all"
          style={{ background: `linear-gradient(135deg, ${PARTY}, #db2777)`, color: "#fff", opacity: !text.trim() ? 0.5 : 1 }}>
          <Send className="h-4 w-4" />
        </button>
      </div>
    </DetailCard>
  );
}

// Host-uploaded photo gallery shown below the hero. A compact, horizontally
// scrolling strip of small landscape thumbnails with a tap-to-zoom lightbox.
// Optional — only rendered when the party has gallery images.
function PartyGallery({ images }: { images: string[] }) {
  const [active, setActive] = useState<number | null>(null);
  const close = () => setActive(null);
  const show = (delta: number) =>
    setActive((i) => (i == null ? i : (i + delta + images.length) % images.length));

  return (
    <div className="relative container mx-auto px-4 md:px-6 mt-10">
      <h2 className="flex items-center gap-2 font-serif text-lg md:text-xl mb-3.5" style={{ color: "#fff" }}>
        <Images className="h-4 w-4" style={{ color: PARTY }} /> Gallery
        <span className="text-[11px] font-sans px-2 py-0.5 rounded-full" style={{ background: `${PARTY}1f`, color: PARTY, border: `1px solid ${PARTY}40` }}>{images.length}</span>
      </h2>
      {/* Horizontal scroll strip — landscape thumbnails */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x">
        {images.map((url, i) => (
          <button
            key={url + i}
            type="button"
            onClick={() => setActive(i)}
            className="group relative shrink-0 overflow-hidden rounded-2xl transition-all hover:brightness-110 snap-start"
            style={{ width: 200, height: 130, border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 10px 26px rgba(0,0,0,0.4)" }}
          >
            <img
              src={url}
              alt={`Party photo ${i + 1}`}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.55))" }} />
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {active != null && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.93)", backdropFilter: "blur(6px)" }}
          onClick={close}
        >
          <button type="button" onClick={close} aria-label="Close"
            className="absolute top-4 right-4 h-10 w-10 flex items-center justify-center rounded-full text-white transition-all hover:scale-110"
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}>
            <X className="h-5 w-5" />
          </button>
          <img
            src={images[active]}
            alt={`Party photo ${active + 1}`}
            className="max-h-[88vh] max-w-[92vw] object-contain rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {images.length > 1 && (
            <>
              <button type="button" onClick={(e) => { e.stopPropagation(); show(-1); }} aria-label="Previous"
                className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center rounded-full text-white transition-all hover:scale-110"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}>
                <ArrowLeft className="h-5 w-5" />
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); show(1); }} aria-label="Next"
                className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center rounded-full text-white transition-all hover:scale-110"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}>
                <ArrowRight className="h-5 w-5" />
              </button>
              <span className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs px-3 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.8)" }}>
                {active + 1} / {images.length}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
