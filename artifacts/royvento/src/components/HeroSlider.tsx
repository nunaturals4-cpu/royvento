import { Link } from "wouter";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  GlassWater,
  PartyPopper,
  Mic2,
  Gift,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

interface HeroSlide {
  /** Small gold eyebrow above the headline. */
  eyebrow: string;
  /** Big serif headline. */
  title: string;
  /** Supporting line under the headline. */
  sub: string;
  /** CTA button label. */
  cta: string;
  icon: LucideIcon;
  href: string;
  img: string;
}

// One slide per Royvento pillar — the complete ecosystem the homepage must
// communicate at a glance: nightlife, live events, private parties and rewards.
// Each slide carries its own strong call-to-action into the matching section.
const SLIDES: HeroSlide[] = [
  {
    eyebrow: "Nightlife",
    title: "Premium Pubs & Clubs",
    sub: "Rooftop bars, craft breweries and the city's hottest dance floors — book your table in seconds.",
    cta: "Explore Pubs & Clubs",
    icon: GlassWater,
    href: "/pubs",
    img: "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=1600&q=75",
  },
  {
    eyebrow: "Live",
    title: "Events & Concerts",
    sub: "From DJ nights and live gigs to standup shows — secure your spot before they sell out.",
    cta: "Discover Events",
    icon: Mic2,
    href: "/events",
    img: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&q=75",
  },
  {
    eyebrow: "Celebrate",
    title: "Host Your Private Party",
    sub: "Birthdays, reunions and house parties — create your own ticketed party and invite the crowd you want.",
    cta: "Create a Party",
    icon: PartyPopper,
    href: "/private-parties",
    img: "/images/house-party-hero.jpg",
  },
  {
    eyebrow: "Rewards",
    title: "Royvento Rewards & Exclusive Offers",
    sub: "Earn points on every booking and unlock members-only happy-hour deals across the city.",
    cta: "View Offers",
    icon: Gift,
    href: "/pub-offers",
    img: "https://images.unsplash.com/photo-1545128485-c400e7702796?w=1600&q=75",
  },
];

const AUTOPLAY_MS = 5000;

/**
 * Full-width premium hero carousel for the homepage. Cycles through every
 * Royvento pillar — Pubs & Clubs, Events, Private Parties and Rewards — each as
 * an immersive full-bleed poster with a strong call-to-action. Auto-plays,
 * pauses on hover, and offers manual control via arrows + dots.
 *
 * Shares the autoplay pattern of AnnouncementSlider (used on the Events page)
 * but is a distinct, homepage-specific design in the Blood Red / Matte Black /
 * Gold theme.
 */
export function HeroSlider() {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPausedRef = useRef(isPaused);

  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  const startTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (!isPausedRef.current) setCurrent((i) => (i + 1) % SLIDES.length);
    }, AUTOPLAY_MS);
  }, []);

  useEffect(() => {
    startTimer();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [startTimer]);

  const goTo = useCallback((idx: number) => { setCurrent(idx); startTimer(); }, [startTimer]);
  const prev = useCallback(() => goTo((current - 1 + SLIDES.length) % SLIDES.length), [current, goTo]);
  const next = useCallback(() => goTo((current + 1) % SLIDES.length), [current, goTo]);

  return (
    <div
      className="reveal group relative w-full overflow-hidden h-[440px] sm:h-[520px] md:h-[580px] lg:h-[640px]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Stacked slides — cross-fade + slow ken-burns zoom between pillars. */}
      {SLIDES.map((slide, i) => {
        const Icon = slide.icon;
        const active = i === current;
        return (
          <div
            key={slide.title}
            aria-hidden={!active}
            className={`absolute inset-0 transition-opacity duration-1000 ease-out ${active ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <img
              src={slide.img}
              alt=""
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className={`absolute inset-0 h-full w-full object-cover transition-transform duration-[7000ms] ease-out ${active ? "scale-110" : "scale-100"}`}
            />
            {/* Matte-black wash for legibility + a blood-red stage-light glow. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/65 to-black/25" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/35 to-transparent" />
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(720px 360px at 12% 110%, rgba(232,41,28,0.28), transparent 65%)" }}
            />

            {/* Copy + CTA — constrained to the page container, bottom-left. */}
            <div className="absolute inset-0 flex items-end md:items-center">
              <div className="container mx-auto px-4 md:px-6 pb-12 sm:pb-14 md:pb-0">
                <div className={`max-w-xl transition-all duration-700 ease-out ${active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                  <p className="flex items-center gap-2.5 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.26em] text-amber-400 mb-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-black/50 text-amber-400 backdrop-blur-sm">
                      <Icon className="h-4 w-4" />
                    </span>
                    {slide.eyebrow}
                  </p>
                  <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.6)]">
                    {slide.title}
                  </h2>
                  <p className="mt-4 max-w-md text-sm sm:text-base md:text-lg text-white/75 leading-relaxed">
                    {slide.sub}
                  </p>
                  <Link href={slide.href}>
                    <button
                      type="button"
                      tabIndex={active ? 0 : -1}
                      className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3 text-sm sm:text-base font-semibold text-primary-foreground red-glow border-0 transition-transform hover:scale-[1.03] active:scale-95"
                    >
                      {slide.cta} <ArrowRight className="h-4 w-4" />
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Arrows */}
      <button
        type="button"
        onClick={prev}
        aria-label="Previous slide"
        className="absolute left-3 md:left-5 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-black/55 border border-white/15 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 hover:border-primary/50"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={next}
        aria-label="Next slide"
        className="absolute right-3 md:right-5 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-black/55 border border-white/15 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 hover:border-primary/50"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* Dots */}
      <div className="absolute bottom-5 md:bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
        {SLIDES.map((s, i) => (
          <button
            key={s.title}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Show ${s.title}`}
            className={`rounded-full transition-all duration-300 ${i === current ? "w-7 h-1.5 bg-primary shadow-[0_0_10px_rgba(var(--theme-glow-rgb),0.7)]" : "w-1.5 h-1.5 bg-white/35 hover:bg-white/60"}`}
          />
        ))}
      </div>
    </div>
  );
}
