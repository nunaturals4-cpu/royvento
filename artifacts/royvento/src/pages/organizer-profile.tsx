import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { apiGet, apiPost, formatINR } from "@/lib/api";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  BadgeCheck, Heart, Share2, CalendarDays, MapPin, Star, Users, Ticket,
  Instagram, Facebook, Youtube, Globe, Clock, ChevronDown, ChevronRight,
  Sparkles, Plus, Minus, CheckCircle2, ShieldCheck, PartyPopper, ArrowRight,
  User, Phone, Tag, Check,
} from "lucide-react";

// ─── types (mirror public endpoints) ────────────────────────────────────────

interface Organizer {
  id: number; name: string; slug: string; description: string;
  logoUrl: string; coverImageUrl: string; website: string;
  instagram: string; facebook: string; youtube: string;
  supportEmail: string; supportPhone: string; city: string; state: string; verified: boolean;
}
interface PublicEvent {
  id: number; title: string; slug: string; category: string; shortDescription: string;
  coverImageUrl: string; city: string; startDate: string | null; startTime: string;
  galleryImages: string[] | null;
}
interface Review { id: number; userId: number; rating: number; comment: string; createdAt: string; }
interface Stats { totalEvents: number; ticketsSold: number; avgRating: number; reviewCount: number; }
interface ProfilePayload { organizer: Organizer; upcoming: PublicEvent[]; past: PublicEvent[]; reviews: Review[]; stats: Stats; }

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

function EventCard({ e }: { e: PublicEvent }) {
  return (
    <Link href={`/organizer-events/${e.slug}`} className="group block">
      <Glass className="overflow-hidden h-full transition-transform group-hover:-translate-y-0.5">
        <div className="aspect-[16/10] bg-white/5 overflow-hidden">
          {e.coverImageUrl ? <img src={e.coverImageUrl} alt={e.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform" /> : <div className="h-full w-full flex items-center justify-center"><CalendarDays className="h-8 w-8 text-white/20" /></div>}
        </div>
        <div className="p-4">
          {e.category && <Badge className="bg-primary/15 text-primary border border-primary/30 mb-2">{e.category}</Badge>}
          <h3 className="font-medium text-white truncate">{e.title}</h3>
          <p className="text-white/50 text-sm mt-1 flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> {e.city || "—"}{e.startDate ? ` · ${e.startDate}` : ""}</p>
        </div>
      </Glass>
    </Link>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ORGANIZER PROFILE
// ════════════════════════════════════════════════════════════════════════════

export function OrganizerProfile() {
  const params = useParams<{ slug: string }>();
  const [data, setData] = useState<ProfilePayload | null | undefined>(undefined);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    setData(undefined);
    apiGet<ProfilePayload>(`/api/organizers/${params.slug}`).then(setData).catch(() => setData(null));
    // Record a profile view for the organizer's Leads tab (self-views dropped server-side).
    apiPost(`/api/organizers/${params.slug}/view`, {}).catch(() => {});
  }, [params.slug]);

  useEffect(() => {
    if (data?.organizer) setFollowing(localStorage.getItem(`rv_follow_org_${data.organizer.id}`) === "1");
  }, [data?.organizer]);

  const share = useShare(data?.organizer.name ?? "Royvento Organizer");

  if (data === undefined) return <div className="flex justify-center py-32"><Spinner /></div>;
  if (data === null) return <div className="text-center py-32 text-white/60">Organizer not found.</div>;

  const { organizer: o, upcoming, past, reviews, stats } = data;
  const gallery = [...upcoming, ...past].flatMap((e) => e.galleryImages || []).slice(0, 12);

  // Follow is stored locally in Phase 1; server-side follow persistence lands later.
  function toggleFollow() {
    const next = !following;
    setFollowing(next);
    localStorage.setItem(`rv_follow_org_${o.id}`, next ? "1" : "0");
  }

  return (
    <div className="bg-black text-white">
      <SEO title={`${o.name} | Event Organizer on Royvento`} canonical={`/organizers/${o.slug}`} />

      {/* Cinematic cover — matte black + blood-red glow + gold accents */}
      <div className="relative">
        <div className="h-60 md:h-80 w-full overflow-hidden">
          {o.coverImageUrl
            ? <img src={o.coverImageUrl} alt="" className="h-full w-full object-cover scale-105" />
            : <div className="h-full w-full bg-gradient-to-br from-primary/30 via-black to-black" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(820px 380px at 10% 0%, rgba(232,41,28,0.2), transparent 60%)" }} />
        </div>
        <div className="max-w-6xl mx-auto px-4">
          <div className="relative -mt-20 md:-mt-24 flex flex-col md:flex-row md:items-end gap-5 pb-2">
            <div className="h-28 w-28 md:h-36 md:w-36 rounded-3xl border border-white/15 bg-black overflow-hidden shadow-[0_16px_48px_-12px_rgba(232,41,28,0.55)] ring-1 ring-white/10 shrink-0">
              {o.logoUrl ? <img src={o.logoUrl} alt={o.name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center"><Users className="h-10 w-10 text-white/30" /></div>}
            </div>
            <div className="flex-1 min-w-0 pb-1 text-left">
              {o.verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 border border-amber-400/30 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
                  <BadgeCheck className="h-3.5 w-3.5" /> Verified Organizer
                </span>
              )}
              <h1 className="font-serif text-3xl md:text-5xl mt-1.5 leading-tight">{o.name}</h1>
              <p className="text-white/55 text-sm mt-2 flex items-center gap-2"><MapPin className="h-4 w-4" /> {[o.city, o.state].filter(Boolean).join(", ") || "India"}</p>
            </div>
            <div className="flex items-center gap-2 md:pb-1">
              <Button onClick={toggleFollow} className={following ? "bg-white/10 text-white hover:bg-white/15 border border-white/15" : "bg-primary text-white hover:bg-primary/90"}>
                <Heart className={"h-4 w-4 mr-2 " + (following ? "fill-primary text-primary" : "")} /> {following ? "Following" : "Follow"}
              </Button>
              <Button variant="outline" className="border-white/15 text-white/80" onClick={share}><Share2 className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-12">
        {/* Stats strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={<CalendarDays className="h-4 w-4" />} label="Events hosted" value={String(stats.totalEvents)} />
          <Stat icon={<Ticket className="h-4 w-4" />} label="Tickets sold" value={stats.ticketsSold.toLocaleString("en-IN")} />
          <Stat icon={<Star className="h-4 w-4" />} label="Rating" value={stats.avgRating ? stats.avgRating.toFixed(1) : "New"} />
          <Stat icon={<Users className="h-4 w-4" />} label="Reviews" value={String(stats.reviewCount)} />
        </div>

        {/* About + Connect */}
        {(o.description || o.website || o.instagram || o.facebook || o.youtube) && (
          <section className="grid lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2">
              <h2 className="font-serif text-2xl mb-3">About {o.name}</h2>
              <p className="text-white/70 leading-relaxed whitespace-pre-line text-[15px]">
                {o.description || `${o.name} hosts ticketed live events on Royvento.`}
              </p>
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

        {/* Upcoming */}
        <Section title="Upcoming events" empty={upcoming.length === 0 ? "No upcoming events." : undefined}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{upcoming.map((e) => <EventCard key={e.id} e={e} />)}</div>
        </Section>

        {/* Past */}
        {past.length > 0 && (
          <Section title="Past events">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{past.map((e) => <EventCard key={e.id} e={e} />)}</div>
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
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-transparent p-4 backdrop-blur-xl">
      <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/25">{icon}</span><span className="text-[10px] uppercase tracking-wider text-white/50">{label}</span></div>
      <p className="font-serif text-2xl md:text-3xl mt-2">{value}</p>
    </div>
  );
}
function Section({ title, children, empty }: { title: string; children?: React.ReactNode; empty?: string }) {
  return (
    <section>
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
// ORGANIZER EVENT DETAIL
// ════════════════════════════════════════════════════════════════════════════

interface Artist { name: string; role: string; imageUrl: string; bio: string; socials: string; }
interface ScheduleItem { time: string; title: string; desc: string; }
interface Policies { dressCode: string; entryRules: string; agePolicy: string; refundPolicy: string; cancellationPolicy: string; }
interface Faq { q: string; a: string; }
interface FullEvent {
  id: number; title: string; slug: string; category: string; subcategory: string;
  shortDescription: string; description: string; tags: string[]; language: string; ageRestriction: string;
  coverImageUrl: string; bannerUrl: string; mobileBannerUrl: string; galleryImages: string[] | null; promoVideos: string[] | null;
  venueName: string; address: string; mapsUrl: string; capacity: number; city: string; state: string;
  startDate: string | null; endDate: string | null; startTime: string; endTime: string; isMultiDay: boolean;
  artists: Artist[] | null; highlights: string[] | null; schedule: ScheduleItem[] | null; policies: Policies | null; faqs: Faq[] | null;
}
interface TicketTier { id: number; type: string; name: string; description: string; price: string; quantity: number; soldCount: number; bookingLimit: number; }
interface EventPayload { event: FullEvent; organizer: Organizer | null; tickets: TicketTier[]; }

function formatEventDate(startDate: string | null, endDate: string | null, multi: boolean): string {
  if (!startDate) return "Date to be announced";
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  if (multi && endDate && endDate !== startDate) return `${fmt(startDate)} — ${fmt(endDate)}`;
  return fmt(startDate);
}

export function OrganizerEventDetail() {
  const params = useParams<{ slug: string }>();
  const [data, setData] = useState<EventPayload | null | undefined>(undefined);
  const [bookingTicket, setBookingTicket] = useState<TicketTier | null>(null);

  const reload = () => apiGet<EventPayload>(`/api/organizer-events/${params.slug}`).then(setData).catch(() => setData(null));
  useEffect(() => { setData(undefined); reload(); /* eslint-disable-next-line */ }, [params.slug]);

  // Record a profile view for the organizer's Leads tab once we know the organizer.
  const organizerSlug = data?.organizer?.slug;
  useEffect(() => {
    if (organizerSlug) apiPost(`/api/organizers/${organizerSlug}/view`, {}).catch(() => {});
  }, [organizerSlug]);

  const share = useShare(data?.event.title ?? "Royvento Event");

  if (data === undefined) return <div className="flex justify-center py-32"><Spinner /></div>;
  if (data === null) return <div className="text-center py-32 text-white/60">Event not found.</div>;

  const { event: e, organizer: o, tickets } = data;
  const heroImg = e.bannerUrl || e.coverImageUrl;
  const minPrice = tickets.length ? Math.min(...tickets.map((t) => Number(t.price))) : 0;
  const dateLabel = formatEventDate(e.startDate, e.endDate, e.isMultiDay);
  const timeLabel = e.startTime ? `${e.startTime}${e.endTime ? ` – ${e.endTime}` : ""}` : "";

  return (
    <div className="bg-black text-white min-h-screen">
      <SEO title={`${e.title} | Royvento`} description={e.shortDescription} canonical={`/organizer-events/${e.slug}`} />

      {/* ── Cinematic hero ─────────────────────────────────────────── */}
      <div className="relative">
        <div className="absolute inset-0 overflow-hidden">
          {heroImg
            ? <img src={heroImg} alt={e.title} className="h-full w-full object-cover scale-105" />
            : <div className="h-full w-full bg-gradient-to-br from-primary/40 via-black to-black" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent" />
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(900px 460px at 12% 12%, rgba(232,41,28,0.22), transparent 60%)" }} />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 pt-20 sm:pt-24 md:pt-28 pb-7 text-left">
          <Link href={o ? `/organizers/${o.slug}` : "/events"} className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white mb-3 transition-colors">
            <ChevronRight className="h-3 w-3 rotate-180" /> {o ? o.name : "Back to events"}
          </Link>
          <div className="flex flex-wrap gap-2 mb-2.5">
            {e.category && <span className="rounded-full bg-primary/20 border border-primary/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">{e.category}</span>}
            {e.subcategory && <span className="rounded-full bg-white/10 border border-white/15 px-3 py-1 text-[11px] text-white/80">{e.subcategory}</span>}
            {e.ageRestriction && <span className="rounded-full bg-white/10 border border-white/15 px-3 py-1 text-[11px] text-white/80">{e.ageRestriction}</span>}
            {e.language && <span className="rounded-full bg-white/10 border border-white/15 px-3 py-1 text-[11px] text-white/80">{e.language}</span>}
          </div>
          <h1 className="font-serif text-3xl md:text-5xl leading-[1.06] tracking-tight bg-gradient-to-br from-white via-white to-white/60 bg-clip-text text-transparent max-w-3xl">{e.title}</h1>
          {e.shortDescription && <p className="text-white/70 mt-3 text-sm md:text-base max-w-2xl leading-relaxed">{e.shortDescription}</p>}

          {/* quick-fact pills */}
          <div className="flex flex-wrap gap-2.5 mt-5">
            <HeroPill icon={<CalendarDays className="h-4 w-4 text-primary" />} label={dateLabel} />
            {timeLabel && <HeroPill icon={<Clock className="h-4 w-4 text-primary" />} label={timeLabel} />}
            {(e.venueName || e.city) && <HeroPill icon={<MapPin className="h-4 w-4 text-primary" />} label={[e.venueName, e.city].filter(Boolean).join(", ")} />}
          </div>

          {/* price + CTA */}
          <div className="flex flex-wrap items-center gap-4 mt-6">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">Tickets from</p>
              <p className="font-serif text-2xl md:text-3xl text-white">{minPrice > 0 ? formatINR(minPrice) : "Free"}</p>
            </div>
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-white shadow-[0_12px_40px_-10px_rgba(232,41,28,0.7)] h-12 px-7"
              disabled={tickets.length === 0}
              onClick={() => { const el = document.getElementById("tickets"); el?.scrollIntoView({ behavior: "smooth" }); }}
            >
              <Ticket className="h-5 w-5 mr-2" /> Book Tickets
            </Button>
            <Button size="lg" variant="outline" className="border-white/15 text-white/80 h-12" onClick={share}><Share2 className="h-5 w-5" /></Button>
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-10 grid lg:grid-cols-3 gap-8 lg:gap-10">
        <div className="lg:col-span-2 space-y-12">
          {e.description && (
            <section>
              <SectionHead icon={<Sparkles className="h-4 w-4" />}>About the event</SectionHead>
              <div className="text-white/70 leading-relaxed text-[15px] [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1" dangerouslySetInnerHTML={{ __html: e.description }} />
            </section>
          )}

          {(e.highlights?.length ?? 0) > 0 && (
            <section>
              <SectionHead icon={<PartyPopper className="h-4 w-4" />}>Highlights</SectionHead>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {e.highlights!.map((h) => (
                  <div key={h} className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/[0.08] to-transparent px-4 py-3">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" /><span className="text-sm text-white/85">{h}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(e.artists?.length ?? 0) > 0 && (
            <section>
              <SectionHead icon={<Users className="h-4 w-4" />}>Lineup</SectionHead>
              <div className="grid sm:grid-cols-2 gap-3">
                {e.artists!.map((a, i) => (
                  <div key={i} className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 flex gap-4 hover:border-primary/30 transition-colors">
                    <div className="h-16 w-16 rounded-xl overflow-hidden bg-white/5 shrink-0 ring-1 ring-white/10">
                      {a.imageUrl ? <img src={a.imageUrl} alt={a.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform" /> : <div className="h-full w-full flex items-center justify-center"><Users className="h-6 w-6 text-white/30" /></div>}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{a.name}</p>
                      {a.role && <p className="text-primary text-xs uppercase tracking-wider mt-0.5">{a.role}</p>}
                      {a.bio && <p className="text-white/50 text-sm mt-1.5 line-clamp-3">{a.bio}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(e.schedule?.length ?? 0) > 0 && (
            <section>
              <SectionHead icon={<Clock className="h-4 w-4" />}>Schedule</SectionHead>
              <div className="relative pl-6">
                <div className="absolute left-[7px] top-1 bottom-1 w-px bg-gradient-to-b from-primary/60 via-white/15 to-transparent" />
                <div className="space-y-5">
                  {e.schedule!.map((s, i) => (
                    <div key={i} className="relative">
                      <div className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full bg-primary ring-4 ring-primary/15" />
                      <p className="text-primary text-sm font-medium">{s.time || "—"}</p>
                      <p className="font-medium mt-0.5">{s.title}</p>
                      {s.desc && <p className="text-white/50 text-sm mt-0.5">{s.desc}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {(e.galleryImages?.length ?? 0) > 0 && (
            <section>
              <SectionHead icon={<Sparkles className="h-4 w-4" />}>Gallery</SectionHead>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {e.galleryImages!.map((src, i) => (
                  <div key={i} className={"group relative overflow-hidden rounded-2xl bg-white/5 " + (i === 0 ? "col-span-2 row-span-2 aspect-square sm:aspect-auto" : "aspect-square")}>
                    <img src={src} alt="" loading="lazy" className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
            </section>
          )}

          <PoliciesAndFaq policies={e.policies} faqs={e.faqs} />
        </div>

        {/* Sticky ticket panel */}
        <div className="lg:col-span-1" id="tickets">
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/[0.08] to-white/[0.02] backdrop-blur-xl p-5 shadow-[0_16px_48px_-16px_rgba(232,41,28,0.4)]">
              <div className="flex items-center gap-2 mb-4"><Ticket className="h-4 w-4 text-primary" /><span className="text-xs uppercase tracking-wider text-white/60 font-semibold">Tickets</span></div>
              <div className="space-y-2.5">
                {tickets.map((t) => {
                  const left = t.quantity > 0 ? t.quantity - t.soldCount : null;
                  const soldOut = left !== null && left <= 0;
                  return (
                    <div key={t.id} className="rounded-xl border border-white/10 bg-black/30 p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{t.name}</p>
                          {t.description && <p className="text-white/50 text-xs mt-0.5 line-clamp-2">{t.description}</p>}
                          <p className="text-white/40 text-[11px] mt-1">{left === null ? "Available" : soldOut ? "Sold out" : `${left} left`}</p>
                        </div>
                        <p className="text-primary font-semibold shrink-0">{Number(t.price) > 0 ? formatINR(Number(t.price)) : "Free"}</p>
                      </div>
                      <Button size="sm" className="w-full mt-2.5 bg-primary hover:bg-primary/90 text-white" disabled={soldOut} onClick={() => setBookingTicket(t)}>
                        {soldOut ? "Sold out" : <>Book now <ArrowRight className="h-3.5 w-3.5 ml-1" /></>}
                      </Button>
                    </div>
                  );
                })}
                {tickets.length === 0 && <p className="text-white/50 text-sm">Tickets coming soon.</p>}
              </div>
              <Button variant="outline" className="w-full mt-3 border-white/15 text-white/80" onClick={share}><Share2 className="h-4 w-4 mr-2" /> Share event</Button>
            </div>

            {o && (
              <Link href={`/organizers/${o.slug}`} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 group hover:border-primary/30 transition-colors">
                <div className="h-12 w-12 rounded-xl overflow-hidden bg-white/5 shrink-0 ring-1 ring-white/10">{o.logoUrl ? <img src={o.logoUrl} alt={o.name} className="h-full w-full object-cover" /> : <Users className="h-5 w-5 text-white/30 m-3.5" />}</div>
                <div className="min-w-0"><p className="text-white/40 text-[11px] uppercase tracking-wider">Organized by</p><p className="font-medium truncate group-hover:text-primary flex items-center gap-1">{o.name}{o.verified && <BadgeCheck className="h-4 w-4 text-amber-400" />}</p></div>
                <ChevronRight className="h-4 w-4 text-white/30 ml-auto group-hover:text-primary" />
              </Link>
            )}

            {/* Info cards — keep the sidebar balanced with the long main column. */}
            <InfoCard icon={<CalendarDays className="h-4 w-4 text-primary" />} title="Date & time">
              <p>{dateLabel}</p>
              {timeLabel && <p className="text-white/50 mt-0.5">{timeLabel}</p>}
            </InfoCard>

            {(e.venueName || e.address || e.city) && (
              <InfoCard icon={<MapPin className="h-4 w-4 text-primary" />} title="Location">
                {e.venueName && <p className="font-medium text-white">{e.venueName}</p>}
                <p className="text-white/50">{[e.address, e.city, e.state].filter(Boolean).join(", ")}</p>
                {e.mapsUrl && <a href={e.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-sm mt-1.5 inline-flex items-center gap-1">Open in Maps <ArrowRight className="h-3.5 w-3.5" /></a>}
              </InfoCard>
            )}

            {(e.ageRestriction || e.language || e.capacity > 0 || e.policies?.dressCode) && (
              <InfoCard icon={<ShieldCheck className="h-4 w-4 text-primary" />} title="Good to know">
                <dl className="space-y-1.5">
                  {e.ageRestriction && <InfoRow k="Age" v={e.ageRestriction} />}
                  {e.language && <InfoRow k="Language" v={e.language} />}
                  {e.capacity > 0 && <InfoRow k="Capacity" v={`${e.capacity.toLocaleString("en-IN")} guests`} />}
                  {e.policies?.dressCode && <InfoRow k="Dress code" v={e.policies.dressCode} />}
                </dl>
              </InfoCard>
            )}
          </div>
        </div>
      </div>

      <BookingDialog slug={e.slug} eventTitle={e.title} ticket={bookingTicket} onClose={() => setBookingTicket(null)} onBooked={reload} />
    </div>
  );
}

function HeroPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] backdrop-blur-md px-3.5 py-2 text-sm text-white/85">
      {icon}{label}
    </span>
  );
}
function InfoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
      <p className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/50 mb-2">{icon}{title}</p>
      <div className="text-sm text-white/80">{children}</div>
    </div>
  );
}
function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-white/45 shrink-0">{k}</dt>
      <dd className="text-white/80 text-right">{v}</dd>
    </div>
  );
}
function SectionHead({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/25">{icon}</span>
      <h2 className="font-serif text-xl md:text-2xl">{children}</h2>
    </div>
  );
}

// ─── booking dialog ─────────────────────────────────────────────────────────
// Reuses the platform booking workflow: the ticket is created as a real booking
// (kind='organizer') that appears in My Bookings with a QR e-ticket. Requires
// login so the ticket attaches to the user's account.
function BookingDialog({
  slug, eventTitle, ticket, onClose, onBooked,
}: { slug: string; eventTitle: string; ticket: TicketTier | null; onClose: () => void; onBooked: () => void }) {
  const { toast } = useToast();
  const [qty, setQty] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [coupon, setCoupon] = useState("");
  const [useCoins, setUseCoins] = useState(false);
  const [coupons, setCoupons] = useState<{ code: string; discountType: string; discountValue: string }[]>([]);
  const [points, setPoints] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ ticketCode: string; total: number; bookingId: number } | null>(null);

  useEffect(() => {
    if (!ticket) return;
    setQty(1); setName(""); setPhone(""); setCoupon(""); setUseCoins(false); setConfirmation(null);
    apiGet<{ code: string; discountType: string; discountValue: string }[]>(`/api/organizer-events/${slug}/coupons`).then(setCoupons).catch(() => setCoupons([]));
    apiGet<{ points: number }>("/api/users/me/discounts").then((d) => setPoints(d.points ?? 0)).catch(() => setPoints(0));
  }, [ticket, slug]);

  const price = ticket ? Number(ticket.price) : 0;
  const left = ticket && ticket.quantity > 0 ? ticket.quantity - ticket.soldCount : null;
  const maxQty = useMemo(() => {
    const caps = [20];
    if (left !== null) caps.push(left);
    if (ticket && ticket.bookingLimit > 0) caps.push(ticket.bookingLimit);
    return Math.max(1, Math.min(...caps));
  }, [left, ticket]);

  // Discount calc mirrors the pub booking flow (event-detail.tsx): subtotal −
  // coupon − coins, coins capped at 2% of subtotal (100 pts = ₹5).
  const POINTS_RUPEE_RATE = 0.05;
  const subtotal = price * qty;
  const matchedCoupon = coupons.find((c) => c.code === coupon.trim().toUpperCase());
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

  async function submit() {
    if (!ticket) return;
    if (!name.trim()) { toast({ title: "Please enter your name", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const res = await apiPost<{ ticketCode: string; total: number; bookingId: number }>(`/api/organizer-events/${slug}/book`, {
        ticketId: ticket.id, name: name.trim(), phone: phone.trim(), quantity: qty,
        couponCode: coupon.trim(), pointsToUse: pointsApplied,
      });
      setConfirmation({ ticketCode: res.ticketCode, total: res.total, bookingId: res.bookingId });
      onBooked();
    } catch (e: any) {
      // Not logged in → send to login and return here afterwards.
      if (e?.status === 401) {
        const next = encodeURIComponent(`/organizer-events/${slug}`);
        window.location.href = `/login?next=${next}`;
        return;
      }
      toast({ title: "Booking failed", description: e?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const redeemable = Math.min(points, maxPoints);
  const savings = couponDiscount + pointsValue;

  return (
    <Dialog open={!!ticket} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-gradient-to-b from-[#16080b] via-[#0c0c0f] to-[#0a0a0c] border-white/10 text-white sm:max-w-md p-0 overflow-hidden gap-0 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]">
        {/* blood-red top glow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32" style={{ background: "radial-gradient(420px 130px at 30% 0%, rgba(232,41,28,0.22), transparent 70%)" }} />

        {confirmation ? (
          <div className="relative text-center px-6 py-8">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 border border-emerald-400/30 flex items-center justify-center mb-4 shadow-[0_8px_32px_-8px_rgba(16,185,129,0.5)]">
              <PartyPopper className="h-8 w-8 text-emerald-400" />
            </div>
            <h3 className="font-serif text-2xl">You're booked!</h3>
            <p className="text-white/55 text-sm mt-1">{eventTitle}</p>
            <div className="mt-5 rounded-2xl border border-amber-400/25 bg-gradient-to-b from-amber-400/[0.06] to-transparent p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-amber-300/60">Ticket code</p>
              <p className="font-mono text-2xl text-amber-300 tracking-[0.18em] mt-1">{confirmation.ticketCode}</p>
              <p className="text-white/40 text-xs mt-2">{qty} × {ticket?.name} · {confirmation.total > 0 ? formatINR(confirmation.total) : "Free"}</p>
            </div>
            <Link href="/dashboard/bookings"><Button className="w-full mt-5 bg-primary hover:bg-primary-hover text-white h-11 shadow-[0_12px_36px_-10px_rgba(232,41,28,0.7)]">View QR ticket in My Bookings <ArrowRight className="h-4 w-4 ml-2" /></Button></Link>
            <button className="w-full mt-2 text-white/45 text-sm hover:text-white py-1.5" onClick={onClose}>Done</button>
          </div>
        ) : (
          <div className="relative">
            {/* Header */}
            <DialogHeader className="px-6 pt-6 pb-4 space-y-0 text-left">
              <p className="text-[10px] uppercase tracking-[0.3em] text-primary mb-1">Book tickets</p>
              <DialogTitle className="font-serif text-2xl leading-tight">{ticket?.name}</DialogTitle>
              <p className="text-white/45 text-xs mt-1 truncate">{eventTitle}</p>
            </DialogHeader>

            <div className="px-6 pb-6 space-y-4 max-h-[68vh] overflow-y-auto">
              {/* Ticket + quantity */}
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                <div className="min-w-0">
                  <p className="font-serif text-lg">{price > 0 ? formatINR(price) : "Free"}<span className="text-white/40 text-xs font-sans ml-1">each</span></p>
                  {left !== null && <p className="text-amber-300/80 text-[11px] mt-0.5">{left} left</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button className="h-9 w-9 rounded-xl border border-white/15 flex items-center justify-center hover:bg-white/5 hover:border-primary/40 disabled:opacity-30 transition-colors" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus className="h-4 w-4" /></button>
                  <span className="w-9 text-center font-serif text-xl">{qty}</span>
                  <button className="h-9 w-9 rounded-xl border border-white/15 flex items-center justify-center hover:bg-white/5 hover:border-primary/40 disabled:opacity-30 transition-colors" disabled={qty >= maxQty} onClick={() => setQty((q) => Math.min(maxQty, q + 1))}><Plus className="h-4 w-4" /></button>
                </div>
              </div>

              {/* Attendee details */}
              <div className="space-y-2.5">
                <div>
                  <Label className="text-white/60 text-[11px] uppercase tracking-wider">Attendee name *</Label>
                  <div className="relative mt-1">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                    <Input className="pl-9 bg-white/[0.04] border-white/10 text-white focus-visible:border-primary/50" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name on the ticket" />
                  </div>
                </div>
                <div>
                  <Label className="text-white/60 text-[11px] uppercase tracking-wider">Phone</Label>
                  <div className="relative mt-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                    <Input className="pl-9 bg-white/[0.04] border-white/10 text-white focus-visible:border-primary/50" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
                  </div>
                </div>
              </div>

              {/* Coupon */}
              {price > 0 && (
                <div>
                  <Label className="text-white/60 text-[11px] uppercase tracking-wider">Coupon code</Label>
                  <div className="relative mt-1">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                    <Input className="pl-9 bg-white/[0.04] border-white/10 text-white font-mono uppercase tracking-wide focus-visible:border-primary/50" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Enter or tap below" />
                    {matchedCoupon && <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400" />}
                  </div>
                  {coupons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {coupons.map((c) => {
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
                  {coupon && !matchedCoupon && <p className="text-amber-400/80 text-[11px] mt-1.5">Code will be validated at checkout.</p>}
                </div>
              )}

              {/* Royvento Coins */}
              {price > 0 && points > 0 && (
                <button type="button" onClick={() => redeemable > 0 && setUseCoins((v) => !v)} disabled={redeemable <= 0}
                  className={"w-full flex items-center justify-between rounded-2xl border p-3.5 text-left transition-all " + (useCoins ? "border-primary/50 bg-primary/10 shadow-[0_0_24px_-8px_rgba(232,41,28,0.5)]" : "border-white/10 bg-white/[0.03] hover:border-primary/30") + (redeemable <= 0 ? " opacity-60 cursor-not-allowed" : "")}>
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="h-9 w-9 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">⬢</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">Royvento Coins</span>
                      <span className="block text-white/45 text-[11px]">
                        {points} available{redeemable > 0 ? ` · redeem ${redeemable} for −${formatINR(redeemable * POINTS_RUPEE_RATE)}` : " · spend more to unlock"}
                      </span>
                    </span>
                  </span>
                  <span className={"h-6 w-11 rounded-full relative shrink-0 transition-colors " + (useCoins ? "bg-primary" : "bg-white/15")}>
                    <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all shadow " + (useCoins ? "left-[22px]" : "left-0.5")} />
                  </span>
                </button>
              )}

              {/* Price breakdown */}
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

function PoliciesAndFaq({ policies, faqs }: { policies: Policies | null; faqs: Faq[] | null }) {
  const polRows = policies ? ([
    ["Dress code", policies.dressCode], ["Entry rules", policies.entryRules], ["Age policy", policies.agePolicy],
    ["Refund policy", policies.refundPolicy], ["Cancellation policy", policies.cancellationPolicy],
  ] as const).filter(([, v]) => v) : [];
  return (
    <>
      {polRows.length > 0 && (
        <section><h2 className="font-serif text-xl mb-3">Policies</h2>
          <div className="space-y-2">{polRows.map(([k, v]) => (
            <Glass key={k} className="p-4"><p className="text-primary text-sm font-medium">{k}</p><p className="text-white/60 text-sm mt-0.5 whitespace-pre-line">{v}</p></Glass>
          ))}</div>
        </section>
      )}
      {(faqs?.length ?? 0) > 0 && (
        <section><h2 className="font-serif text-xl mb-3">FAQ</h2>
          <div className="space-y-2">{faqs!.map((q, i) => <FaqRow key={i} q={q} />)}</div>
        </section>
      )}
    </>
  );
}
function FaqRow({ q }: { q: Faq }) {
  const [open, setOpen] = useState(false);
  return (
    <Glass className="overflow-hidden">
      <button className="w-full flex items-center justify-between p-4 text-left" onClick={() => setOpen((o) => !o)}>
        <span className="font-medium">{q.q}</span>
        <ChevronDown className={"h-4 w-4 text-white/50 transition-transform " + (open ? "rotate-180" : "")} />
      </button>
      {open && <p className="px-4 pb-4 text-white/60 text-sm whitespace-pre-line">{q.a}</p>}
    </Glass>
  );
}
