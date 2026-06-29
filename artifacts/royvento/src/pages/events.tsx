import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { SEO } from "@/components/SEO";
import { apiGet } from "@/lib/api";
import { AnnouncementSlider, type SliderAnnouncement } from "@/components/AnnouncementSlider";
import { EVENT_CATEGORIES, EVENT_CATEGORY_IMAGES, EVENT_CATEGORY_SUBTITLES } from "@/lib/eventCategories";
import {
  Calendar, Clock, Megaphone, ArrowRight,
  Sparkles, Disc3, Music2, Mic, PartyPopper, Waves, Mic2, Drama,
} from "lucide-react";

interface EventAnnouncement {
  id: number;
  title: string;
  body: string;
  announceDate: string;
  announceTime: string;
  vendorName: string;
  eventId: number;
  vendorId: number;
  imageUrl?: string;
  genre: string;
  eventType: string;
}

interface OrganizerEventCard {
  id: number;
  title: string;
  slug: string;
  category: string;
  shortDescription: string;
  coverImageUrl: string;
  bannerUrl: string;
  city: string;
  startDate: string | null;
  startTime: string;
  organizerName: string;
}

const ANN_GENRES = ["EDM", "Hip Hop", "Bollywood", "Rock", "Pop", "Jazz", "Retro", "House", "Techno", "R&B"];

// Icon per category — mirrors the home page "Popular Categories" tile design.
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Ladies Night": Sparkles,
  "DJ Night": Disc3,
  "Live Music": Music2,
  "Karaoke": Mic,
  "Theme Party": PartyPopper,
  "Pool Party": Waves,
  "Open Mics": Mic2,
  "Standup Shows": Drama,
};

export function Events() {
  const { t } = useTranslation();
  const [slider, setSlider] = useState<SliderAnnouncement[]>([]);
  const [orgSlider, setOrgSlider] = useState<SliderAnnouncement[]>([]);
  const [announcements, setAnnouncements] = useState<EventAnnouncement[]>([]);
  const [organizerEvents, setOrganizerEvents] = useState<OrganizerEventCard[]>([]);
  const [genreFilter, setGenreFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const whatsOnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    apiGet<SliderAnnouncement[]>("/api/announcements/slider").then(setSlider).catch(() => {});
    apiGet<EventAnnouncement[]>("/api/announcements/recent").then(setAnnouncements).catch(() => {});
    apiGet<OrganizerEventCard[]>("/api/organizer-events").then(setOrganizerEvents).catch(() => {});
    apiGet<SliderAnnouncement[]>("/api/organizer-events/slider").then(setOrgSlider).catch(() => {});
  }, []);

  // Admin-featured organizer events lead the hero slider, then pub announcements.
  const heroSlides = useMemo(() => [...orgSlider, ...slider], [orgSlider, slider]);

  // Count upcoming announcements per category (the eventType partners pick in
  // the dashboard announcement tab maps 1:1 to these category tiles).
  const countByCat = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of announcements) if (a.eventType) m[a.eventType] = (m[a.eventType] ?? 0) + 1;
    return m;
  }, [announcements]);

  const filteredAnnouncements = announcements.filter((a) => {
    if (genreFilter && a.genre !== genreFilter) return false;
    if (eventTypeFilter && a.eventType !== eventTypeFilter) return false;
    return true;
  });

  const hasAnnouncements = announcements.length > 0;

  // Clicking a category tile drives the same event-type filter the What's On
  // section uses, then scrolls down to the filtered result.
  const selectCategory = (cat: string) => {
    setEventTypeFilter((prev) => (prev === cat ? "" : cat));
    setTimeout(() => whatsOnRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Events in India — Ladies Nights, DJ Nights & Live Music | Royvento"
        description="Discover the hottest nightlife events near you: ladies' nights, DJ nights, live music, karaoke, theme & pool parties, open mics and standup shows. Updated daily on Royvento."
        canonical="/events"
      />

      {/* ── Events Hero — hidden only when the hero slider is actively showing ── */}
      {heroSlides.length === 0 && (
        <div
          className="relative w-full overflow-hidden bg-zinc-950"
          style={{ height: "clamp(260px, 45vw, 520px)" }}
        >
          <img
            src="/images/events-hero.png"
            alt="Luxury events"
            className="absolute inset-0 h-full w-full object-cover object-center"
            loading="eager"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          {/* layered gradient for depth */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

          <div className="absolute inset-0 flex flex-col justify-end pb-10 md:pb-14 px-6 md:px-12">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.28em] text-primary font-semibold mb-3">
                Royvento · Events
              </p>
              <h1 className="font-serif text-4xl md:text-6xl tracking-tight text-white leading-[1.05] mb-4">
                Unforgettable<br />Nights Await
              </h1>
              <p className="text-sm md:text-base text-white/60 leading-relaxed max-w-md">
                Discover exclusive DJ nights, live music, themed parties, and
                curated experiences — all in one place.
              </p>
            </div>
          </div>

          {/* bottom fade into page bg */}
          <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-background to-transparent" />
        </div>
      )}

      <div className="container mx-auto px-4 md:px-6 py-8">
        {/* ── Announcement slider (admin-controlled featured first) ── */}
        {heroSlides.length > 0 && <AnnouncementSlider announcements={heroSlides} />}

        {/* ── Event Categories — hidden ── */}

        {/* ── Live Events — ticketed events from Event Organizers ── */}
        {organizerEvents.length > 0 && (
          <section className="py-6 md:py-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">Live Events</span>
              </div>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scrollbar-none">
              {organizerEvents.map((e) => (
                <Link key={e.id} href={`/organizer-events/${e.slug}`} className="snap-start flex-shrink-0 cursor-pointer">
                  <div className="group w-[260px] sm:w-[280px] flex-shrink-0 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111] hover:border-primary/25 transition-colors">
                    <div className="relative h-36 bg-black/40 overflow-hidden">
                      {(e.coverImageUrl || e.bannerUrl) ? (
                        <img src={e.coverImageUrl || e.bannerUrl} alt={e.title} loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-black"><Sparkles className="h-8 w-8 text-primary/30" /></div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full border border-primary/30 bg-black/60 backdrop-blur-md px-2.5 py-1">
                        <Sparkles className="h-2.5 w-2.5 text-primary" />
                        <span className="text-[9px] font-semibold text-primary uppercase tracking-wider truncate max-w-[100px]">{e.organizerName}</span>
                      </div>
                    </div>
                    <div className="p-4 flex flex-col gap-2">
                      {e.category && <span className="self-start text-[10px] uppercase tracking-wider text-amber-400">{e.category}</span>}
                      <h3 className="font-serif text-base leading-snug tracking-tight text-white line-clamp-2">{e.title}</h3>
                      {e.shortDescription && <p className="text-xs text-white/50 line-clamp-2">{e.shortDescription}</p>}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1.5 border-t border-white/[0.06]">
                        {e.startDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3 text-primary" />{new Date(e.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
                        {e.startTime && <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-primary" />{e.startTime}</span>}
                        {e.city && <span className="truncate">{e.city}</span>}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── What's On — announcements (pub-offers style) ── */}
        {hasAnnouncements && (
          <section ref={whatsOnRef} className="py-6 md:py-8 scroll-mt-20">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-amber-400" />
                <span className="text-xs uppercase tracking-[0.2em] text-amber-400 font-semibold">{t("pub_offers.whats_on")}</span>
              </div>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            {/* Genre + event type filters */}
            <div className="mb-5 space-y-2.5">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-2">Genre</p>
                <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 pb-1">
                  {["", ...ANN_GENRES].map((g) => (
                    <button key={g || "all"} onClick={() => setGenreFilter(g === genreFilter ? "" : g)}
                      className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        genreFilter === g ? "border-amber-400 text-amber-400" : "border-white/15 text-white/60 hover:border-white/30 hover:text-white/80"
                      }`}>{g || "All"}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-2">Event Type</p>
                <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 pb-1">
                  {["", ...EVENT_CATEGORIES].map((et) => (
                    <button key={et || "all"} onClick={() => setEventTypeFilter(et === eventTypeFilter ? "" : et)}
                      className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        eventTypeFilter === et ? "border-amber-400 text-amber-400" : "border-white/15 text-white/60 hover:border-white/30 hover:text-white/80"
                      }`}>{et || "All"}</button>
                  ))}
                </div>
              </div>
            </div>

            {filteredAnnouncements.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No announcements match these filters.</p>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scrollbar-none">
                {filteredAnnouncements.map((a) => {
                  const inner = (
                    <div className="group w-[260px] sm:w-[280px] flex-shrink-0 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111] hover:border-primary/25 transition-colors">
                      <div className="relative h-36 bg-black/40 overflow-hidden">
                        {a.imageUrl ? (
                          <img src={a.imageUrl} alt={a.title} loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-black">
                            <Megaphone className="h-8 w-8 text-primary/30" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full border border-primary/30 bg-black/60 backdrop-blur-md px-2.5 py-1">
                          <Megaphone className="h-2.5 w-2.5 text-primary" />
                          <span className="text-[9px] font-semibold text-primary uppercase tracking-wider truncate max-w-[100px]">{a.vendorName}</span>
                        </div>
                      </div>
                      <div className="p-4 flex flex-col gap-2">
                        <h3 className="font-serif text-base leading-snug tracking-tight text-white line-clamp-2">{a.title}</h3>
                        {a.body && <p className="text-xs text-white/50 line-clamp-2">{a.body}</p>}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1.5 border-t border-white/[0.06]">
                          {a.announceDate && (
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3 text-primary" />
                              {new Date(a.announceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                            </span>
                          )}
                          {a.announceTime && <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-primary" />{a.announceTime}</span>}
                        </div>
                        {a.eventId && (
                          <div className="mt-1 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 flex items-center justify-between group-hover:bg-primary/15 transition-colors">
                            <span className="text-xs font-semibold text-primary">{t("pub_offers.book_now")}</span>
                            <ArrowRight className="h-3.5 w-3.5 text-primary" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                  return a.eventId ? (
                    <Link key={a.id} href={`/events/${a.eventId}?book=event&aid=${a.id}`} className="snap-start flex-shrink-0 cursor-pointer">{inner}</Link>
                  ) : (
                    <div key={a.id} className="snap-start flex-shrink-0">{inner}</div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
