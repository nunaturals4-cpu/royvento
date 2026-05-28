import { Utensils, Wine, Clock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VendorOffer {
  id: number;
  vendorId?: number;
  category: "food" | "drink" | string;
  title: string;
  description: string;
  discountType: "percent" | "fixed" | "bogo" | "free_item" | string;
  discountValue: string | number;
  freeItemName: string;
  days: string[];
  timeFrom: string;
  timeTo: string;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
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

const DAY_LABEL: Record<string, string> = {
  sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat",
};

function formatDays(days: string[]): string {
  if (!days || days.length === 0) return "Every day";
  if (days.length === 7) return "Every day";
  return days.map((d) => DAY_LABEL[d] ?? d).join(", ");
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
  className,
}: {
  offer: VendorOffer;
  variant?: "customer" | "partner";
  greyed?: boolean;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const Icon = offer.category === "drink" ? Wine : Utensils;
  const badge = formatBadge(offer);

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
          </div>
        </div>
        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>
    </div>
  );
}

export const formatOfferBadge = formatBadge;
