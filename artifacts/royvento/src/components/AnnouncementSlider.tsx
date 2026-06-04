import { Link } from "wouter";
import { useEffect, useState, useRef, useCallback } from "react";
import { ArrowRight, Calendar, ChevronLeft, ChevronRight, Clock, Megaphone } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface SliderAnnouncement {
  id: number;
  title: string;
  body: string;
  announceDate: string;
  announceTime: string;
  vendorName: string;
  eventId: number;
  vendorId: number;
  imageUrl?: string;
}

const AUTOPLAY_MS = 5000;

/**
 * Auto-playing announcement slider. Admin-controlled featured announcements are
 * served by GET /api/announcements/slider (falls back to recent), so the same
 * "Announcement Slider rules" the admin sets in the panel drive whatever shows
 * here — used on the Events page.
 */
export function AnnouncementSlider({ announcements }: { announcements: SliderAnnouncement[] }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPausedRef = useRef(isPaused);

  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  const startTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (announcements.length <= 1) return;
    intervalRef.current = setInterval(() => {
      if (!isPausedRef.current) setCurrent((i) => (i + 1) % announcements.length);
    }, AUTOPLAY_MS);
  }, [announcements.length]);

  useEffect(() => {
    startTimer();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [startTimer]);

  // Keep the index valid if the list shrinks.
  useEffect(() => {
    if (current > announcements.length - 1) setCurrent(0);
  }, [announcements.length, current]);

  const goTo = useCallback((idx: number) => { setCurrent(idx); startTimer(); }, [startTimer]);
  const prev = useCallback(() => goTo((current - 1 + announcements.length) % announcements.length), [current, announcements.length, goTo]);
  const next = useCallback(() => goTo((current + 1) % announcements.length), [current, announcements.length, goTo]);

  if (announcements.length === 0) return null;
  const a = announcements[current];
  if (!a) return null;
  const href = a.eventId ? `/events/${a.eventId}?book=event&aid=${a.id}` : `/vendors/${a.vendorId}`;

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-white/10 mb-8 bg-gradient-to-br from-zinc-900 via-[#131313] to-black shadow-[0_24px_70px_-24px_rgba(0,0,0,0.85)]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Soft themed accent glow — a radial gradient (no blur filter, so it
          renders on every theme) for a premium, lit feel behind the poster. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(720px 340px at 6% 0%, rgba(var(--theme-glow-rgb),0.13), transparent 65%)" }}
      />

      <div className="relative flex flex-col md:flex-row items-stretch md:min-h-[340px]">
        {a.imageUrl && (
          // The FULL uploaded poster, framed & lifted — object-contain so it's
          // never cropped, centered on the gradient (no black bars, no duplicate
          // backdrop). A ring + drop-shadow make it read like a premium poster.
          <div className="relative w-full md:w-[44%] lg:w-[40%] shrink-0 flex items-center justify-center p-5 md:p-7">
            <img
              src={a.imageUrl}
              alt={a.title}
              className="max-h-72 md:max-h-[320px] w-auto max-w-full rounded-xl object-contain ring-1 ring-white/10 shadow-[0_16px_50px_-12px_rgba(0,0,0,0.9)]"
            />
          </div>
        )}
        <div className="flex flex-col justify-center gap-3.5 p-6 md:p-8 md:pl-2 flex-1">
          <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
            <Megaphone className="h-3 w-3" />{a.vendorName}
          </span>
          <h2 className="font-serif text-2xl md:text-4xl tracking-tight text-white leading-[1.1]">{a.title}</h2>
          {a.body && <p className="text-sm md:text-[15px] text-white/60 leading-relaxed line-clamp-3 max-w-xl">{a.body}</p>}
          {(a.announceDate || a.announceTime) && (
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              {a.announceDate && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-white/75">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  {new Date(a.announceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
              {a.announceTime && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-white/75">
                  <Clock className="h-3.5 w-3.5 text-primary" />{a.announceTime}
                </span>
              )}
            </div>
          )}
          <Link
            href={href}
            className="mt-1 inline-flex items-center gap-2 self-start rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_rgba(var(--theme-glow-rgb),0.6)] transition-all hover:bg-primary-hover"
          >
            {t("pub_offers.book_now")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      {announcements.length > 1 && (
        <>
          <button onClick={prev} aria-label={t("pub_offers.prev_slide")} className="absolute left-3 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-black/60 border border-white/15 flex items-center justify-center hover:bg-black/80 transition-colors">
            <ChevronLeft className="h-4 w-4 text-white" />
          </button>
          <button onClick={next} aria-label={t("pub_offers.next_slide")} className="absolute right-3 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-black/60 border border-white/15 flex items-center justify-center hover:bg-black/80 transition-colors">
            <ChevronRight className="h-4 w-4 text-white" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            {announcements.map((_, i) => (
              <button key={i} onClick={() => goTo(i)} aria-label={`Go to slide ${i + 1}`} className={`rounded-full transition-all duration-300 ${i === current ? "w-5 h-1.5 bg-primary" : "w-1.5 h-1.5 bg-white/25 hover:bg-white/50"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
