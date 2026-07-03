import type { CSSProperties, MouseEvent } from "react";
import { Link, useLocation } from "wouter";
import { MapPin, ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { OFFER_THEMES, type OfferTheme } from "@/components/offerThemes";

/**
 * Premium nightlife offer card — reusable for Happy Hours, Food / Drink / Sheesha
 * offers, Live Music, Events, etc.
 *
 * Two visual modes:
 *
 *  • Default (image mode) — 1:1 promotional cover on top, content below. Used on
 *    the homepage, event detail, Happening Tonight, vendor dashboard, etc.
 *
 *  • hideImage (VIP ticket mode) — NO image. A horizontal two-part card: the
 *    left panel is a luxury VIP-membership-style plate (per-category metallic
 *    gradient, sheen, embossed icon + inner hairline) carrying the OFFER; a
 *    perforated notch seam; then a rich dark (#171717) details panel with the
 *    venue, highlighted accent day pills, time, city and an accent Book Now
 *    pill. Colour comes from the `theme` prop (see offerThemes.ts). Used on the
 *    Pub Offers page.
 */

export function NightlifeOfferCard({
  href,
  bookHref,
  imageUrl,
  title,
  venueName,
  offerLabel,
  offerIcon,
  offerEyebrow,
  priceLabel,
  location,
  statusBadge,
  children,
  className,
  imageAspectClass = "aspect-square",
  hideImage = false,
  theme,
  onBook,
}: {
  href?: string;
  /** When set, renders a "Book now" button that deep-links to the venue's
   *  Book a Table form (independent of the card's own click destination). */
  bookHref?: string;
  imageUrl?: string | null;
  title: string;
  venueName?: string;
  offerLabel?: string;
  offerIcon?: React.ReactNode;
  /** Small eyebrow above the highlighted offer value (luxury mode only),
   *  e.g. "Save Up To", "Cover Charge", "Complimentary". */
  offerEyebrow?: string;
  priceLabel?: string;
  location?: string;
  statusBadge?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Aspect ratio of the cover image (image mode only). Defaults to 1:1. */
  imageAspectClass?: string;
  /** Luxury no-image mode — see component doc. */
  hideImage?: boolean;
  /** Per-category colour theme for VIP ticket mode (offerThemes.ts). */
  theme?: OfferTheme;
  /** VIP-mode Book Now callback for in-page booking (used when there is no
   *  bookHref URL, e.g. a tab switch). Ignored when bookHref is set. */
  onBook?: () => void;
}) {
  const [, navigate] = useLocation();
  // Stop the card's outer Link from also firing when tapping "Book now".
  const goBook = (e: MouseEvent) => {
    if (!bookHref && !onBook) return;
    e.preventDefault();
    e.stopPropagation();
    if (bookHref) navigate(bookHref);
    else onBook?.();
  };

  /* ─────────────────────────── VIP ticket mode ──────────────────────────── */
  if (hideImage) {
    const th = theme ?? OFFER_THEMES.free;
    const heroValue = priceLabel ?? offerLabel;
    const heroEyebrow = offerEyebrow ?? (priceLabel ? offerLabel : undefined);
    const inner = (
      <div
        className={cn(
          "offer-card relative flex h-full overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#171717] shadow-[0_8px_28px_rgba(0,0,0,0.45)]",
          className,
        )}
        style={{
          "--offer-accent-border": th.border,
          "--offer-accent-glow": th.glow,
          "--offer-btn-color": th.accent,
          "--offer-btn-border": `${th.accent}73`,
          "--offer-btn-hover-bg": `${th.accent}1f`,
        } as CSSProperties}
      >
        {/* ── Left VIP plate — deep metallic gradient, the OFFER ── */}
        <div
          className="relative flex w-[36%] shrink-0 flex-col justify-center gap-1 overflow-hidden px-3.5 py-4"
          style={{ backgroundImage: `linear-gradient(135deg, ${th.from} 0%, ${th.to} 100%)`, color: th.plateIcon }}
        >
          {/* gold halftone dots, concentrated toward the bottom */}
          <span
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage: `radial-gradient(${th.plateIcon}2b 1px, transparent 1.4px)`,
              backgroundSize: "8px 8px",
              WebkitMaskImage: "radial-gradient(120% 85% at 50% 118%, #000 22%, transparent 68%)",
              maskImage: "radial-gradient(120% 85% at 50% 118%, #000 22%, transparent 68%)",
            }}
          />
          {/* soft metallic sheen */}
          <span
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(125deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 26%, transparent 48%, transparent 62%, rgba(0,0,0,0.24) 100%)" }}
          />
          {/* soft radial corner glow */}
          <span
            className="pointer-events-none absolute -left-6 -top-8 h-24 w-24 rounded-full opacity-40"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.26), transparent 70%)" }}
          />
          {/* inner hairline frame */}
          <span className="pointer-events-none absolute inset-[6px] rounded-[14px] ring-1 ring-inset ring-white/12" />
          {/* embossed watermark icon */}
          {offerIcon && (
            <span
              className="pointer-events-none absolute -bottom-3 -right-2 opacity-[0.16] [&_svg]:!h-20 [&_svg]:!w-20"
              style={{ color: th.plateIcon }}
            >
              {offerIcon}
            </span>
          )}
          {/* content */}
          {offerIcon && (
            <span className="relative mb-0.5" style={{ color: th.plateIcon, filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.30))" }}>{offerIcon}</span>
          )}
          {heroEyebrow && (
            <p className="relative text-[9.5px] font-bold uppercase tracking-[0.18em] opacity-75" style={{ color: th.plateIcon }}>{heroEyebrow}</p>
          )}
          {heroValue && (
            <p
              className="relative text-[18px] font-black uppercase leading-[1.04]"
              style={{ color: th.plateIcon, textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
            >
              {heroValue}
            </p>
          )}
        </div>

        {/* ── Ticket seam: notch cut-outs (top & bottom) reveal the page bg ── */}
        <span className="pointer-events-none absolute left-[36%] top-0 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0B0B0D]" />
        <span className="pointer-events-none absolute left-[36%] bottom-0 z-10 h-3.5 w-3.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-[#0B0B0D]" />

        {/* ── Right panel — rich dark surface + details ── */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 border-l border-dashed border-white/[0.12] px-3.5 py-4">
          {statusBadge && <div>{statusBadge}</div>}
          {venueName && <h3 className="text-[13px] font-semibold leading-tight text-white line-clamp-1">{venueName}</h3>}
          <p className="text-[11px] leading-snug text-white/50 line-clamp-2">{title}</p>

          {/* Day pills + time (passed by the caller) */}
          {children}

          {location && (
            <div className="flex items-center gap-1.5 text-[11px] text-white/50">
              <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: th.accent }} />
              <span className="truncate">{location}</span>
            </div>
          )}

          {(bookHref || onBook) && (
            <button
              type="button"
              onClick={goBook}
              className="offer-book mt-auto flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold"
            >
              <Calendar className="h-3.5 w-3.5" /> Book Now
            </button>
          )}
        </div>
      </div>
    );

    return href ? (
      <Link href={href} className="group block h-full">
        {inner}
      </Link>
    ) : (
      <div className="group block h-full">{inner}</div>
    );
  }

  /* ─────────────────────────── Default image mode ───────────────────────── */
  const inner = (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[#121212] shadow-[0_8px_28px_rgba(0,0,0,0.45)] transition-all duration-300 group-hover:-translate-y-1 group-hover:border-[#D4AF37]/35 group-hover:shadow-[0_14px_44px_rgba(0,0,0,0.6)]",
        className,
      )}
    >
      {/* Promotional cover (1:1 by default; callers may pass a shorter ratio to
          keep the card compact). Image fills via object-cover, no letterboxing. */}
      <div className={cn("relative shrink-0 overflow-hidden rounded-t-2xl bg-zinc-900", imageAspectClass)}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#D4AF37]/15 via-zinc-900 to-black" />
        )}
        {/* Soft black gradient at the bottom of the image for readability. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
        {statusBadge && <div className="absolute left-3 top-3 z-10">{statusBadge}</div>}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-[15px] font-bold leading-snug text-white line-clamp-2">{title}</h3>
            {venueName && <p className="text-[12px] text-white/50 line-clamp-1">{venueName}</p>}
          </div>
          {priceLabel && (
            <span className="shrink-0 text-[15px] font-black leading-snug text-[#D4AF37]">{priceLabel}</span>
          )}
        </div>

        {offerLabel && (
          <div className="flex items-center gap-2 rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-1.5">
            {offerIcon && <span className="shrink-0 text-[#D4AF37]">{offerIcon}</span>}
            <span className="flex-1 truncate text-[12px] font-semibold leading-tight text-[#D4AF37]">{offerLabel}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#D4AF37]/70" />
          </div>
        )}

        {children}

        {location && (
          <div className={cn("flex items-center gap-1.5 pt-0.5 text-[12px] text-white/55", !bookHref && "mt-auto")}>
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[#D4AF37]" />
            <span className="truncate">{location}</span>
          </div>
        )}

        {bookHref && (
          <button
            type="button"
            onClick={goBook}
            className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Calendar className="h-3.5 w-3.5" /> Book now
          </button>
        )}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="group block h-full">
      {inner}
    </Link>
  ) : (
    <div className="group block h-full">{inner}</div>
  );
}
