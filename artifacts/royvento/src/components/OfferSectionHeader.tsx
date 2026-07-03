import { Link } from "wouter";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { OfferTheme } from "@/components/offerThemes";

/**
 * Premium section header for a Pub Offers category rail: an embossed accent
 * icon, a clear title/subtitle, an elegant "View All" and a thin colour accent
 * line matching the category.
 */
export function OfferSectionHeader({
  theme,
  Icon,
  title,
  subtitle,
  viewAllHref,
}: {
  theme: OfferTheme;
  Icon: LucideIcon;
  title: string;
  subtitle?: string;
  viewAllHref?: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
            style={{
              borderColor: `${theme.accent}59`,
              backgroundColor: `${theme.accent}14`,
              color: theme.accent,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 18px ${theme.glow}`,
            }}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-[15px] md:text-[17px] font-semibold leading-tight tracking-tight text-white">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[11px] text-white/45">{subtitle}</p>}
          </div>
        </div>

        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="group/va inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-white/40 transition-colors hover:text-white/80"
          >
            View All
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover/va:translate-x-0.5" />
          </Link>
        )}
      </div>

      {/* Thin colour accent line */}
      <div className="mt-3 h-px w-full bg-white/[0.06]">
        <div
          className="h-full w-16 rounded-full"
          style={{ background: `linear-gradient(90deg, ${theme.accent}, transparent)` }}
        />
      </div>
    </div>
  );
}
