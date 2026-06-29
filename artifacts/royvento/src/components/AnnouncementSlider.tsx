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
  href?: string;
}

const AUTOPLAY_MS = 5500;

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

  useEffect(() => {
    if (current >= announcements.length) setCurrent(0);
  }, [announcements.length, current]);

  const goTo = useCallback((idx: number) => { setCurrent(idx); startTimer(); }, [startTimer]);
  const goPrev = useCallback(() => goTo((current - 1 + announcements.length) % announcements.length), [current, announcements.length, goTo]);
  const goNext = useCallback(() => goTo((current + 1) % announcements.length), [current, announcements.length, goTo]);

  if (!announcements.length) return null;
  const a = announcements[current];
  if (!a) return null;

  const href = a.href ?? (a.eventId ? `/events/${a.eventId}?book=event&aid=${a.id}` : `/vendors/${a.vendorId}`);

  return (
    <div
      className="relative overflow-hidden rounded-3xl mb-8 group"
      style={{
        minHeight: "clamp(400px, 48vw, 480px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background image — keyed so it fades when slide changes */}
      <div key={a.id} className="absolute inset-0 animate-fadeIn">
        {a.imageUrl ? (
          <img
            src={a.imageUrl}
            alt={a.title}
            className="h-full w-full object-cover object-center"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />
        )}
      </div>

      {/* Cinematic gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/10 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/20 to-transparent pointer-events-none" />
      <div className="absolute top-0 inset-x-0 h-20 bg-gradient-to-b from-black/40 to-transparent pointer-events-none" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-9">
        <div className="max-w-2xl space-y-3">

          {/* Venue badge */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-black/50 backdrop-blur-md px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            <Megaphone className="h-2.5 w-2.5 shrink-0" />
            {a.vendorName}
          </span>

          {/* Title */}
          <h2
            className="font-serif text-2xl md:text-[2.1rem] tracking-tight text-white leading-snug"
            style={{ textShadow: "0 2px 24px rgba(0,0,0,0.8)" }}
          >
            {a.title}
          </h2>

          {/* Body */}
          {a.body && (
            <p className="text-sm md:text-base text-white/65 leading-relaxed line-clamp-2 max-w-lg">
              {a.body}
            </p>
          )}

          {/* Date & time */}
          {(a.announceDate || a.announceTime) && (
            <div className="flex flex-wrap items-center gap-2">
              {a.announceDate && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.07] backdrop-blur-sm px-3 py-1 text-xs font-medium text-white/80">
                  <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                  {new Date(a.announceDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
              {a.announceTime && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.07] backdrop-blur-sm px-3 py-1 text-xs font-medium text-white/80">
                  <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                  {a.announceTime}
                </span>
              )}
            </div>
          )}

          {/* CTA */}
          <div className="pt-1">
            <Link
              href={href}
              className="inline-flex items-center gap-2.5 rounded-xl bg-primary px-7 py-3 text-sm font-bold text-primary-foreground shadow-[0_8px_32px_-8px_rgba(var(--theme-glow-rgb),0.7)] transition-all duration-200 hover:brightness-110 hover:gap-3.5"
            >
              {t("pub_offers.book_now")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Navigation */}
      {announcements.length > 1 && (
        <>
          <button
            onClick={goPrev}
            aria-label={t("pub_offers.prev_slide")}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full border border-white/20 bg-black/50 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/75"
          >
            <ChevronLeft className="h-4 w-4 text-white" />
          </button>
          <button
            onClick={goNext}
            aria-label={t("pub_offers.next_slide")}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full border border-white/20 bg-black/50 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/75"
          >
            <ChevronRight className="h-4 w-4 text-white" />
          </button>

          {/* Dots */}
          <div className="absolute bottom-5 right-6 flex items-center gap-1.5 z-10">
            {announcements.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`rounded-full transition-all duration-300 ${i === current ? "w-6 h-1.5 bg-primary" : "w-1.5 h-1.5 bg-white/30 hover:bg-white/60"}`}
              />
            ))}
          </div>

          {/* Progress bar */}
          {!isPaused && (
            <div className="absolute bottom-0 inset-x-0 h-[2px] bg-white/10">
              <div
                key={current}
                className="h-full bg-primary origin-left"
                style={{ animation: `slideProgress ${AUTOPLAY_MS}ms linear forwards` }}
              />
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes slideProgress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fadeIn { animation: fadeIn 0.5s ease forwards; }
      `}</style>
    </div>
  );
}
