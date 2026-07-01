import type { MouseEvent } from "react";
import { Link, useLocation } from "wouter";
import { MapPin, ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Premium nightlife offer card — reusable for Happy Hours, Food / Drink / Sheesha
 * offers, Live Music, Events, etc.
 *
 * Layout (top → bottom):
 *  1. A 1:1 promotional cover image with rounded top corners and a soft black
 *     gradient at the bottom for legibility; an optional status badge overlays
 *     the top-left.
 *  2. The offer title (white) and venue name (grey).
 *  3. A gold pill-shaped offer badge (icon · label · chevron).
 *  4. Optional extra content, then a location row with a gold pin.
 *
 * Dark (#121212) surface, gold (#D4AF37) accents, white primary / grey secondary
 * text. Consistent radius, soft shadow, generous padding — nothing overlaps or
 * gets cropped. The caller controls the card width.
 */
export function NightlifeOfferCard({
  href,
  bookHref,
  imageUrl,
  title,
  venueName,
  offerLabel,
  offerIcon,
  priceLabel,
  location,
  statusBadge,
  children,
  className,
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
  priceLabel?: string;
  location?: string;
  statusBadge?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const [, navigate] = useLocation();
  // Stop the card's outer Link from also firing when tapping "Book now".
  const goBook = (e: MouseEvent) => {
    if (!bookHref) return;
    e.preventDefault();
    e.stopPropagation();
    navigate(bookHref);
  };
  const inner = (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[#121212] shadow-[0_8px_28px_rgba(0,0,0,0.45)] transition-all duration-300 group-hover:-translate-y-1 group-hover:border-[#D4AF37]/35 group-hover:shadow-[0_14px_44px_rgba(0,0,0,0.6)]",
        className,
      )}
    >
      {/* 1:1 promotional cover — a square image fills it fully with no crop. */}
      <div className="relative aspect-square shrink-0 overflow-hidden rounded-t-2xl bg-zinc-900">
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
      <div className="flex flex-1 flex-col gap-2 p-3.5">
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
          <div className="flex items-center gap-2 rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-2">
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
            className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
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
