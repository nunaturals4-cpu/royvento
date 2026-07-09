import { Utensils, Wine, Clock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDayRanges } from "@/lib/days";
import { GuestTypeBadge } from "@/components/GuestTypeBadge";

export interface VendorOffer {
  id: number;
  vendorId?: number;
  category: "food" | "drink" | string;
  title: string;
  description: string;
  discountType: "percent" | "fixed" | "bogo" | "free_item" | string;
  discountValue: string | number;
  freeItemName: string;
  /** Audience: "all" guests, "female" (girls only) or "male" (men only). */
  gender?: "all" | "female" | "male" | string;
  days: string[];
  timeFrom: string;
  timeTo: string;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  imageUrl?: string | null;
  /** Server-resolved venue cover (vendor cover → banner → pub listing image). */
  venueCoverImage?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

function formatBadge(o: Pick<VendorOffer, "discountType" | "discountValue" | "freeItemName">): string {
  const v = Number(o.discountValue) || 0;
  switch (o.discountType) {
    case "percent":
      return `${v}% OFF`;
    case "fixed":
      return `₹${v} OFF`;
    case "bogo":
      return "BUY 1 GET 1";
    case "free_item":
      return o.freeItemName ? `FREE: ${o.freeItemName}` : "FREE ITEM";
    default:
      return "OFFER";
  }
}

function formatDays(days: string[]): string {
  return formatDayRanges(days);
}

function formatWindow(timeFrom: string, timeTo: string): string {
  if (!timeFrom || !timeTo) return "All day";
  return `${timeFrom} – ${timeTo}`;
}

/**
 * Premium dark-gold offer card for the customer-facing pub booking page.
 * Variants:
 *  - "customer" (default): polished glassy card with gold accents.
 *  - "partner": compact dashboard row with an edit action slot.
 */
export function OfferCard({
  offer,
  variant = "customer",
  greyed,
  trailing,
  coverImage,
  className,
}: {
  offer: VendorOffer;
  variant?: "customer" | "partner";
  greyed?: boolean;
  trailing?: React.ReactNode;
  /**
   * Partner cover image. Used as the fallback when an offer has no deal image
   * of its own, so the customer card never looks bare.
   */
  coverImage?: string | null;
  className?: string;
}) {
  const Icon = offer.category === "drink" ? Wine : Utensils;
  const badge = formatBadge(offer);
  // Prefer the offer's own deal image; fall back to the server-resolved venue
  // cover (covers partner pubs whose photo lives on the pub event), then any
  // cover passed by the parent.
  const dealImage = offer.imageUrl || offer.venueCoverImage || coverImage || null;
  const showCover = variant === "customer" && !!dealImage;

  return (
    <div
      className={cn(
        "relative rounded-2xl border overflow-hidden",
        variant === "customer"
          ? "border-amber-500/30 bg-gradient-to-br from-amber-500/[0.06] via-black/40 to-black/60 backdrop-blur-sm p-4 sm:p-5"
          : "border-white/10 bg-white/[0.02] p-4",
        greyed && "opacity-50",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {showCover ? (
          <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-white/10 relative">
            <img src={dealImage!} alt={offer.title} loading="lazy" className="h-full w-full object-cover" />
            <div
              className={cn(
                "absolute bottom-0 right-0 w-5 h-5 rounded-tl-lg flex items-center justify-center",
                offer.category === "drink" ? "bg-rose-500/80 text-white" : "bg-emerald-500/80 text-white",
              )}
            >
              <Icon className="w-3 h-3" />
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
              offer.category === "drink"
                ? "bg-rose-500/15 text-rose-300"
                : "bg-emerald-500/15 text-emerald-300",
            )}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h4 className="text-sm sm:text-base font-semibold text-foreground truncate">
              {offer.title}
            </h4>
            <span
              className={cn(
                "ml-auto shrink-0 text-[10px] sm:text-xs font-bold tracking-wider px-2 py-1 rounded-md",
                "bg-amber-500/15 text-amber-300 border border-amber-500/40",
              )}
            >
              {badge}
            </span>
          </div>
          {offer.description && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">
              {offer.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] sm:text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDays(offer.days)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatWindow(offer.timeFrom, offer.timeTo)}
            </span>
            <GuestTypeBadge gender={offer.gender} className="normal-case shadow-none px-2 py-0.5" />
          </div>
        </div>
        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>
    </div>
  );
}

export const formatOfferBadge = formatBadge;
