import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { apiGet, apiPost, formatINR } from "@/lib/api";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FollowButton } from "@/components/FollowButton";
import {
  BadgeCheck, Share2, MapPin, Star, Users, Gamepad2, Package,
  Instagram, Facebook, Youtube, Globe, Plus, Minus, CheckCircle2, ShieldCheck,
  PartyPopper, ArrowRight, User, Phone, Tag, Check, Clock, Timer, IndianRupee, CalendarDays,
} from "lucide-react";

// ─── types (mirror public game-organizer endpoints) ─────────────────────────

interface GameOrganizer {
  id: number; name: string; slug: string; description: string;
  logoUrl: string; coverImageUrl: string; galleryImages: string[] | null; website: string;
  instagram: string; facebook: string; youtube: string;
  supportEmail: string; supportPhone: string; address: string; mapsUrl: string;
  city: string; state: string; verified: boolean;
}
interface PublicGame {
  id: number; name: string; slug: string; category: string; description: string; rules: string;
  coverImageUrl: string; images: string[]; videos: string[]; capacity: number; ageRestriction: string;
  pricingModel: "fixed" | "hourly"; price: string; hourlyRate: string; minHours: number; maxHours: number;
}
interface PackageItem { gameId: number | null; label: string; quantity: number; }
interface PackageAddon { label: string; price: number; }
interface PublicPackage {
  id: number; name: string; slug: string; description: string; coverImageUrl: string; images: string[];
  price: string; items: PackageItem[] | null; addons: PackageAddon[] | null; groupSize: number;
  capacity: number; ageRestriction: string;
}
interface Review { id: number; userId: number; rating: number; comment: string; createdAt: string; }
interface Stats { totalGames: number; totalPackages: number; avgRating: number; reviewCount: number; }
interface ProfilePayload { organizer: GameOrganizer; games: PublicGame[]; packages: PublicPackage[]; reviews: Review[]; stats: Stats; }

// what the booking dialog accepts — either a game or a package
type Bookable =
  | { kind: "game"; game: PublicGame }
  | { kind: "package"; pkg: PublicPackage };

// ─── shared ──────────────────────────────────────────────────────────────────

function Glass({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={"rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent backdrop-blur-xl " + className}>{children}</div>;
}

function useShare(title: string) {
  const { toast } = useToast();
  return async () => {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title, url }); } catch { /* cancelled */ } return; }
    try { await navigator.clipboard.writeText(url); toast({ title: "Link copied" }); } catch { /* ignore */ }
  };
}

function gamePriceLabel(g: PublicGame): string {
  if (g.pricingModel === "hourly") return `${formatINR(Number(g.hourlyRate))}/hr`;
  return Number(g.price) > 0 ? `${formatINR(Number(g.price))}/person` : "Free";
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-transparent p-4 backdrop-blur-xl">
      <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/25">{icon}</span><span className="text-[10px] uppercase tracking-wider text-white/50">{label}</span></div>
      <p className="font-serif text-2xl md:text-3xl mt-2">{value}</p>
    </div>
  );
}
function Section({ id, title, children, empty }: { id?: string; title: string; children?: React.ReactNode; empty?: string }) {
  return (
    <section id={id} className={id ? "scroll-mt-28" : undefined}>
      <h2 className="font-serif text-xl mb-4">{title}</h2>
      {empty ? <p className="text-white/50 text-sm">{empty}</p> : children}
    </section>
  );
}
function SocialLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  const url = /^https?:\/\//.test(href) ? href : `https://${href}`;
  return <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-white/60 hover:text-white px-3 py-1.5 rounded-full border border-white/10 hover:border-primary/40 transition-colors">{icon}{label}</a>;
}

// ════════════════════════════════════════════════════════════════════════════
// GAME ORGANIZER PROFILE
// ════════════════════════════════════════════════════════════════════════════

export function GameOrganizerProfile() {
  const params = useParams<{ slug: string }>();
  const [data, setData] = useState<ProfilePayload | null | undefined>(undefined);
  const [booking, setBooking] = useState<Bookable | null>(null);

  useEffect(() => {
    setData(undefined);
    apiGet<ProfilePayload>(`/api/game-organizers/${params.slug}`).then(setData).catch(() => setData(null));
    apiPost(`/api/game-organizers/${params.slug}/view`, {}).catch(() => {});
  }, [params.slug]);

  // When arrived via a game card on the Games & Sports page (which links with a
  // #available-games hash), jump straight to that section once it has rendered.
  useEffect(() => {
    if (!data?.organizer) return;
    if (typeof window === "undefined" || window.location.hash !== "#available-games") return;
    const t = setTimeout(() => {
      document.getElementById("available-games")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(t);
  }, [data?.organizer]);

  const share = useShare(data?.organizer.name ?? "Royvento Game Zone");

  if (data === undefined) return <div className="flex justify-center py-32"><Spinner /></div>;
  if (data === null) return <div className="text-center py-32 text-white/60">Game organizer not found.</div>;

  const { organizer: o, games, packages, reviews, stats } = data;
  const gallery = [...(o.galleryImages ?? []), ...games.flatMap((g) => g.images || [])].slice(0, 12);

  return (
    <div className="bg-black text-white">
      <SEO title={`${o.name} | Game Zone on Royvento`} canonical={`/game-organizers/${o.slug}`} />

      {/* Cinematic cover */}
      <div className="relative">
        <div className="h-60 md:h-80 w-full overflow-hidden">
          {o.coverImageUrl ? <img src={o.coverImageUrl} alt="" className="h-full w-full object-cover scale-105" /> : <div className="h-full w-full bg-gradient-to-br from-primary/30 via-black to-black" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(820px 380px at 10% 0%, rgba(232,41,28,0.2), transparent 60%)" }} />
        </div>
        <div className="max-w-6xl mx-auto px-4">
          <div className="relative -mt-20 md:-mt-24 flex flex-col md:flex-row md:items-end gap-5 pb-2">
            <div className="h-28 w-28 md:h-36 md:w-36 rounded-3xl border border-white/15 bg-black overflow-hidden shadow-[0_16px_48px_-12px_rgba(232,41,28,0.55)] ring-1 ring-white/10 shrink-0">
              {o.logoUrl ? <img src={o.logoUrl} alt={o.name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center"><Gamepad2 className="h-10 w-10 text-white/30" /></div>}
            </div>
            <div className="flex-1 min-w-0 pb-1 text-left">
              {o.verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 border border-amber-400/30 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
                  <BadgeCheck className="h-3.5 w-3.5" /> Verified Game Zone
                </span>
              )}
              <h1 className="font-serif text-3xl md:text-5xl mt-1.5 leading-tight">{o.name}</h1>
              <p className="text-white/55 text-sm mt-2 flex items-center gap-2"><MapPin className="h-4 w-4" /> {[o.city, o.state].filter(Boolean).join(", ") || "India"}</p>
            </div>
            <div className="flex flex-col items-start gap-2 md:pb-1">
              <FollowButton targetType="game_organizer" targetId={o.id} name={o.name} />
              <Button variant="outline" className="border-white/15 text-white/80" onClick={share}><Share2 className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-12">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={<Gamepad2 className="h-4 w-4" />} label="Games" value={String(stats.totalGames)} />
          <Stat icon={<Package className="h-4 w-4" />} label="Packages" value={String(stats.totalPackages)} />
          <Stat icon={<Star className="h-4 w-4" />} label="Rating" value={stats.avgRating ? stats.avgRating.toFixed(1) : "New"} />
          <Stat icon={<Users className="h-4 w-4" />} label="Reviews" value={String(stats.reviewCount)} />
        </div>

        {/* About + Connect */}
        {(o.description || o.website || o.instagram || o.facebook || o.youtube) && (
          <section className="grid lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2">
              <h2 className="font-serif text-2xl mb-3">About {o.name}</h2>
              <p className="text-white/70 leading-relaxed whitespace-pre-line text-[15px]">{o.description || `${o.name} is a gaming venue on Royvento.`}</p>
            </div>
            {(o.website || o.instagram || o.facebook || o.youtube || o.supportEmail) && (
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
                <p className="text-[11px] uppercase tracking-wider text-white/50 mb-3">Connect</p>
                <div className="flex flex-wrap gap-2">
                  {o.website && <SocialLink href={o.website} icon={<Globe className="h-4 w-4" />} label="Website" />}
                  {o.instagram && <SocialLink href={o.instagram} icon={<Instagram className="h-4 w-4" />} label="Instagram" />}
                  {o.facebook && <SocialLink href={o.facebook} icon={<Facebook className="h-4 w-4" />} label="Facebook" />}
                  {o.youtube && <SocialLink href={o.youtube} icon={<Youtube className="h-4 w-4" />} label="YouTube" />}
                </div>
                {o.supportEmail && <a href={`mailto:${o.supportEmail}`} className="block text-sm text-white/50 hover:text-white mt-3 truncate">{o.supportEmail}</a>}
              </div>
            )}
          </section>
        )}

        {/* Available games */}
        <Section id="available-games" title="Available games" empty={games.length === 0 ? "No games available yet." : undefined}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((g) => (
              <Glass key={g.id} className="overflow-hidden flex flex-col">
                <div className="aspect-[16/10] bg-white/5 overflow-hidden">
                  {g.coverImageUrl ? <img src={g.coverImageUrl} alt={g.name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center"><Gamepad2 className="h-8 w-8 text-white/20" /></div>}
                </div>
                <div className="p-4 flex flex-col flex-1">
                  {g.category && <Badge className="bg-primary/15 text-primary border border-primary/30 mb-2 w-fit">{g.category}</Badge>}
                  <h3 className="font-medium text-white">{g.name}</h3>
                  {g.description && <p className="text-white/50 text-sm mt-1 line-clamp-2">{g.description}</p>}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
                    <span className="text-primary font-semibold flex items-center gap-1">
                      {g.pricingModel === "hourly" ? <Timer className="h-3.5 w-3.5" /> : <IndianRupee className="h-3.5 w-3.5" />}{gamePriceLabel(g)}
                    </span>
                    <Button size="sm" className="bg-primary hover:bg-primary/90 text-white" onClick={() => setBooking({ kind: "game", game: g })}>Book now <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
                  </div>
                </div>
              </Glass>
            ))}
          </div>
        </Section>

        {/* Available packages */}
        {packages.length > 0 && (
          <Section title="Packages & combos">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {packages.map((p) => (
                <Glass key={p.id} className="overflow-hidden flex flex-col border-primary/20">
                  <div className="aspect-[16/10] bg-white/5 overflow-hidden">
                    {p.coverImageUrl ? <img src={p.coverImageUrl} alt={p.name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center"><Package className="h-8 w-8 text-white/20" /></div>}
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-amber-400/15 text-amber-300 border border-amber-400/30 w-fit">Package</Badge>
                      {p.groupSize > 0 && <Badge className="bg-white/10 border-white/15 text-white/70 w-fit">Group of {p.groupSize}</Badge>}
                    </div>
                    <h3 className="font-medium text-white">{p.name}</h3>
                    {(p.items?.length ?? 0) > 0 && (
                      <ul className="mt-2 space-y-1">
                        {p.items!.slice(0, 4).map((it, i) => <li key={i} className="text-white/55 text-xs flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" />{it.label}{it.quantity > 1 ? ` ×${it.quantity}` : ""}</li>)}
                      </ul>
                    )}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
                      <span className="text-primary font-semibold">{formatINR(Number(p.price))}</span>
                      <Button size="sm" className="bg-primary hover:bg-primary/90 text-white" onClick={() => setBooking({ kind: "package", pkg: p })}>Book now <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
                    </div>
                  </div>
                </Glass>
              ))}
            </div>
          </Section>
        )}

        {/* Gallery */}
        {gallery.length > 0 && (
          <Section title="Gallery">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {gallery.map((src, i) => <div key={i} className="aspect-square rounded-xl overflow-hidden bg-white/5"><img src={src} alt="" className="h-full w-full object-cover" /></div>)}
            </div>
          </Section>
        )}

        {/* Location */}
        {(o.address || o.mapsUrl) && (
          <Section title="Location">
            <Glass className="p-5">
              <p className="flex items-start gap-2 text-white/80"><MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />{[o.address, o.city, o.state].filter(Boolean).join(", ") || "India"}</p>
              {o.mapsUrl && <a href={o.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-sm mt-2 inline-flex items-center gap-1">Open in Maps <ArrowRight className="h-3.5 w-3.5" /></a>}
            </Glass>
          </Section>
        )}

        {/* Reviews */}
        {reviews.length > 0 && (
          <Section title="Reviews & ratings">
            <div className="grid gap-3 sm:grid-cols-2">
              {reviews.map((r) => (
                <Glass key={r.id} className="p-4">
                  <div className="flex items-center gap-1 mb-1">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={"h-3.5 w-3.5 " + (i < r.rating ? "fill-amber-400 text-amber-400" : "text-white/20")} />)}</div>
                  <p className="text-white/70 text-sm">{r.comment || "—"}</p>
                </Glass>
              ))}
            </div>
          </Section>
        )}
      </div>

      <BookingDialog slug={o.slug} venueName={o.name} venueAddress={[o.address, o.city].filter(Boolean).join(", ")} bookable={booking} onClose={() => setBooking(null)} />
    </div>
  );
}

// ─── booking dialog ─────────────────────────────────────────────────────────
// Reuses the platform booking workflow: a real booking (kind='game') that shows
// in My Bookings with a QR e-ticket. Requires login so it attaches to the user.

function BookingDialog({
  slug, venueName, venueAddress, bookable, onClose,
}: { slug: string; venueName: string; venueAddress: string; bookable: Bookable | null; onClose: () => void }) {
  const { toast } = useToast();
  const [persons, setPersons] = useState(1);
  const [hours, setHours] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [coupon, setCoupon] = useState("");
  const [useCoins, setUseCoins] = useState(false);
  const [coupons, setCoupons] = useState<{ code: string; discountType: string; discountValue: string; gameId: number | null }[]>([]);
  const [points, setPoints] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ ticketCode: string; total: number; bookingId: number } | null>(null);

  const isGame = bookable?.kind === "game";
  const game = bookable?.kind === "game" ? bookable.game : null;
  const pkg = bookable?.kind === "package" ? bookable.pkg : null;
  const itemName = game?.name ?? pkg?.name ?? "";
  const itemId = game?.id ?? pkg?.id ?? 0;
  const isHourly = game?.pricingModel === "hourly";

  useEffect(() => {
    if (!bookable) return;
    setPersons(1); setQuantity(1); setHours(game?.minHours || 1); setDate(""); setTime("");
    setName(""); setPhone(""); setCoupon(""); setUseCoins(false); setConfirmation(null);
    apiGet<{ code: string; discountType: string; discountValue: string; gameId: number | null }[]>(`/api/game-organizers/${slug}/coupons`).then(setCoupons).catch(() => setCoupons([]));
    apiGet<{ points: number }>("/api/users/me/discounts").then((d) => setPoints(d.points ?? 0)).catch(() => setPoints(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookable, slug]);

  // Pricing per model.
  const subtotal = useMemo(() => {
    if (game) {
      if (game.pricingModel === "hourly") return (Number(game.hourlyRate) || 0) * hours;
      return (Number(game.price) || 0) * persons;
    }
    if (pkg) return (Number(pkg.price) || 0) * quantity;
    return 0;
  }, [game, pkg, persons, hours, quantity]);

  const maxPersons = game?.capacity && game.capacity > 0 ? game.capacity : 50;

  const POINTS_RUPEE_RATE = 0.05;
  const applicable = coupons.filter((c) => c.gameId == null || (isGame && c.gameId === itemId));
  const matchedCoupon = applicable.find((c) => c.code === coupon.trim().toUpperCase());
  const couponDiscount = matchedCoupon
    ? (matchedCoupon.discountType === "fixed"
        ? Math.min(Math.round(Number(matchedCoupon.discountValue)), subtotal)
        : Math.round(subtotal * (Number(matchedCoupon.discountValue) / 100)))
    : 0;
  const maxPointsDiscount = Math.floor(subtotal * 0.02);
  const pointsCap = Math.min(Math.max(0, subtotal - couponDiscount), maxPointsDiscount);
  const maxPoints = Math.floor(pointsCap / POINTS_RUPEE_RATE);
  const pointsApplied = useCoins ? Math.min(points, maxPoints) : 0;
  const pointsValue = pointsApplied * POINTS_RUPEE_RATE;
  const total = Math.max(0, subtotal - couponDiscount - pointsValue);
  const redeemable = Math.min(points, maxPoints);
  const savings = couponDiscount + pointsValue;

  async function submit() {
    if (!bookable) return;
    if (!name.trim()) { toast({ title: "Please enter your name", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const res = await apiPost<{ ticketCode: string; total: number; bookingId: number }>(`/api/game-organizers/${slug}/book`, {
        gameId: isGame ? itemId : null,
        packageId: isGame ? null : itemId,
        persons, hours: isHourly ? hours : 0, quantity,
        date: date || undefined, time: time || undefined,
        name: name.trim(), phone: phone.trim(), couponCode: coupon.trim(), pointsToUse: pointsApplied,
      });
      setConfirmation({ ticketCode: res.ticketCode, total: res.total, bookingId: res.bookingId });
    } catch (e: any) {
      if (e?.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(`/game-organizers/${slug}`)}`;
        return;
      }
      toast({ title: "Booking failed", description: e?.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  }

  // Nothing selected → render nothing. (The body below dereferences game!/pkg!,
  // so it must never run with bookable === null — otherwise the whole profile
  // page crashes the moment it mounts the always-present dialog.)
  if (!bookable) return null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-gradient-to-b from-[#16080b] via-[#0c0c0f] to-[#0a0a0c] border-white/10 text-white w-[calc(100vw-1.5rem)] max-w-md p-0 overflow-hidden gap-0 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)] max-h-[92dvh] flex flex-col">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32" style={{ background: "radial-gradient(420px 130px at 30% 0%, rgba(232,41,28,0.22), transparent 70%)" }} />

        {confirmation ? (
          <div className="relative text-center px-5 sm:px-6 py-8 overflow-y-auto">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 border border-emerald-400/30 flex items-center justify-center mb-4 shadow-[0_8px_32px_-8px_rgba(16,185,129,0.5)]">
              <PartyPopper className="h-8 w-8 text-emerald-400" />
            </div>
            <h3 className="font-serif text-2xl">You're booked!</h3>
            <p className="text-white/55 text-sm mt-1">{itemName} · {venueName}</p>
            <div className="mt-5 rounded-2xl border border-amber-400/25 bg-gradient-to-b from-amber-400/[0.06] to-transparent p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-amber-300/60">Booking code</p>
              <p className="font-mono text-2xl text-amber-300 tracking-[0.18em] mt-1">{confirmation.ticketCode}</p>
              <p className="text-white/40 text-xs mt-2">{confirmation.total > 0 ? formatINR(confirmation.total) : "Free"}</p>
            </div>
            <Link href="/dashboard/bookings"><Button className="w-full mt-5 bg-primary hover:bg-primary-hover text-white h-11 shadow-[0_12px_36px_-10px_rgba(232,41,28,0.7)]">View QR ticket in My Bookings <ArrowRight className="h-4 w-4 ml-2" /></Button></Link>
            <button className="w-full mt-2 text-white/45 text-sm hover:text-white py-1.5" onClick={onClose}>Done</button>
          </div>
        ) : (
          <div className="relative flex flex-col min-h-0 flex-1">
            <DialogHeader className="px-5 sm:px-6 pt-6 pb-4 space-y-0 text-left shrink-0 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.3em] text-primary mb-1">{isGame ? "Book a game" : "Book a package"}</p>
              <DialogTitle className="font-serif text-2xl leading-tight">{itemName}</DialogTitle>
              <p className="text-white/45 text-xs mt-1 truncate">{venueName}{venueAddress ? ` · ${venueAddress}` : ""}</p>
            </DialogHeader>

            <div className="px-5 sm:px-6 pb-6 pt-1 space-y-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0">
              {/* Quantity selector — persons / hours / packages */}
              {isHourly ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div className="min-w-0">
                    <p className="font-serif text-lg">{formatINR(Number(game!.hourlyRate))}<span className="text-white/40 text-xs font-sans ml-1">/hour</span></p>
                    <p className="text-white/45 text-[11px] mt-0.5 flex items-center gap-1"><Timer className="h-3 w-3" /> {game!.minHours}h min{game!.maxHours > 0 ? ` · ${game!.maxHours}h max` : ""}</p>
                  </div>
                  <Stepper value={hours} min={game!.minHours || 1} max={game!.maxHours || 12} onChange={setHours} suffix="h" />
                </div>
              ) : isGame ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div className="min-w-0">
                    <p className="font-serif text-lg">{Number(game!.price) > 0 ? formatINR(Number(game!.price)) : "Free"}<span className="text-white/40 text-xs font-sans ml-1">/person</span></p>
                    <p className="text-white/45 text-[11px] mt-0.5 flex items-center gap-1"><Users className="h-3 w-3" /> up to {maxPersons} players</p>
                  </div>
                  <Stepper value={persons} min={1} max={maxPersons} onChange={setPersons} />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div className="min-w-0">
                    <p className="font-serif text-lg">{formatINR(Number(pkg!.price))}<span className="text-white/40 text-xs font-sans ml-1">/package</span></p>
                    {pkg!.groupSize > 0 && <p className="text-white/45 text-[11px] mt-0.5">Group of {pkg!.groupSize}</p>}
                  </div>
                  <Stepper value={quantity} min={1} max={20} onChange={setQuantity} />
                </div>
              )}

              {/* For hourly / packages we still capture group size for capacity planning */}
              {!isHourly && isGame ? null : (
                <div>
                  <Label className="text-white/60 text-[11px] uppercase tracking-wider">Number of players</Label>
                  <div className="relative mt-1">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                    <Input type="number" min={1} className="pl-9 bg-white/[0.04] border-white/10 text-white" value={persons} onChange={(e) => setPersons(Math.max(1, Number(e.target.value) || 1))} />
                  </div>
                </div>
              )}

              {/* Date + time */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <Label className="text-white/60 text-[11px] uppercase tracking-wider">Date</Label>
                  <div className="relative mt-1">
                    <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                    <Input type="date" className="pl-9 bg-white/[0.04] border-white/10 text-white" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label className="text-white/60 text-[11px] uppercase tracking-wider">Time</Label>
                  <div className="relative mt-1">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                    <Input type="time" className="pl-9 bg-white/[0.04] border-white/10 text-white" value={time} onChange={(e) => setTime(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Attendee */}
              <div className="space-y-2.5">
                <div>
                  <Label className="text-white/60 text-[11px] uppercase tracking-wider">Your name *</Label>
                  <div className="relative mt-1">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                    <Input className="pl-9 bg-white/[0.04] border-white/10 text-white" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name on the booking" />
                  </div>
                </div>
                <div>
                  <Label className="text-white/60 text-[11px] uppercase tracking-wider">Phone</Label>
                  <div className="relative mt-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                    <Input className="pl-9 bg-white/[0.04] border-white/10 text-white" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
                  </div>
                </div>
              </div>

              {/* Coupon */}
              {subtotal > 0 && (
                <div>
                  <Label className="text-white/60 text-[11px] uppercase tracking-wider">Coupon code</Label>
                  <div className="relative mt-1">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                    <Input className="pl-9 bg-white/[0.04] border-white/10 text-white font-mono uppercase tracking-wide" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Enter or tap below" />
                    {matchedCoupon && <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400" />}
                  </div>
                  {applicable.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {applicable.map((c) => {
                        const on = coupon === c.code;
                        return (
                          <button key={c.code} type="button" onClick={() => setCoupon(on ? "" : c.code)}
                            className={"rounded-full border px-3 py-1 text-[11px] font-mono transition-all " + (on ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300" : "border-white/15 text-white/55 hover:border-primary/50 hover:text-white")}>
                            {c.code} · {c.discountType === "fixed" ? formatINR(Number(c.discountValue)) : `${Number(c.discountValue)}%`} off
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Coins */}
              {subtotal > 0 && points > 0 && (
                <button type="button" onClick={() => redeemable > 0 && setUseCoins((v) => !v)} disabled={redeemable <= 0}
                  className={"w-full flex items-center justify-between rounded-2xl border p-3.5 text-left transition-all " + (useCoins ? "border-primary/50 bg-primary/10" : "border-white/10 bg-white/[0.03] hover:border-primary/30") + (redeemable <= 0 ? " opacity-60 cursor-not-allowed" : "")}>
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="h-9 w-9 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">⬢</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">Royvento Coins</span>
                      <span className="block text-white/45 text-[11px]">{points} available{redeemable > 0 ? ` · redeem ${redeemable} for −${formatINR(redeemable * POINTS_RUPEE_RATE)}` : " · spend more to unlock"}</span>
                    </span>
                  </span>
                  <span className={"h-6 w-11 rounded-full relative shrink-0 transition-colors " + (useCoins ? "bg-primary" : "bg-white/15")}>
                    <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all shadow " + (useCoins ? "left-[22px]" : "left-0.5")} />
                  </span>
                </button>
              )}

              {/* Breakdown */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2 text-sm">
                {savings > 0 && (
                  <>
                    <div className="flex justify-between text-white/50"><span>Subtotal</span><span>{formatINR(subtotal)}</span></div>
                    {couponDiscount > 0 && <div className="flex justify-between text-emerald-400"><span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" />{matchedCoupon?.code}</span><span>−{formatINR(couponDiscount)}</span></div>}
                    {pointsValue > 0 && <div className="flex justify-between text-amber-300"><span className="flex items-center gap-1">⬢ Coins ×{pointsApplied}</span><span>−{formatINR(pointsValue)}</span></div>}
                    <div className="border-t border-white/10 pt-2" />
                  </>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-white/55">Total payable</span>
                  <span className="font-serif text-3xl leading-none">{total > 0 ? formatINR(total) : "Free"}</span>
                </div>
                {savings > 0 && <p className="text-emerald-400/80 text-[11px] text-right">You save {formatINR(savings)}</p>}
              </div>

              <Button className="w-full bg-primary hover:bg-primary-hover text-white h-12 text-base shadow-[0_14px_40px_-10px_rgba(232,41,28,0.7)]" disabled={submitting} onClick={submit}>
                {submitting ? <Spinner /> : <>Confirm booking <ShieldCheck className="h-4 w-4 ml-2" /></>}
              </Button>
              <p className="text-white/35 text-[11px] text-center flex items-center justify-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-400/70" /> Instant confirmation · QR e-ticket · pay at venue
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ value, min, max, onChange, suffix }: { value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button className="h-9 w-9 rounded-xl border border-white/15 flex items-center justify-center hover:bg-white/5 hover:border-primary/40 disabled:opacity-30 transition-colors shrink-0" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}><Minus className="h-4 w-4" /></button>
      <span className="w-10 text-center font-serif text-xl tabular-nums">{value}{suffix}</span>
      <button className="h-9 w-9 rounded-xl border border-white/15 flex items-center justify-center hover:bg-white/5 hover:border-primary/40 disabled:opacity-30 transition-colors" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}><Plus className="h-4 w-4" /></button>
    </div>
  );
}
