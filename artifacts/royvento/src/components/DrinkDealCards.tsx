import { Link } from "wouter";
import { Wine, Ticket, Clock, Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { VendorDrinkOffer, DrinkPlanSummary } from "@workspace/api-client-react";

// Server emits these date fields too — the generated DrinkPlanSummary type
// hasn't been regenerated yet, so we widen locally rather than ship a stale
// schema bundle.
type PlanWithDates = DrinkPlanSummary & { validFrom?: string | null; validUntil?: string | null };

export type VendorWithPlans = { offer: VendorDrinkOffer; plans: DrinkPlanSummary[] };

function formatUntil(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function summarizePlan(plan: DrinkPlanSummary): { category: string; headline: string } {
  if (plan.type === "welcome") {
    return {
      category: "WELCOME DRINK",
      headline: plan.productName || "Free welcome drink",
    };
  }
  if (plan.type === "unlimited") {
    return {
      category: "UNLIMITED DRINKS",
      headline: plan.productName || "Unlimited drinks",
    };
  }
  if (plan.type === "ticket") {
    const count = (plan.lineItems ?? []).filter((i) => i.name).length;
    return {
      category: "TICKET PACKAGE",
      headline: plan.productName || (count > 0 ? `${count} item${count !== 1 ? "s" : ""} with ticket` : "Drinks with ticket"),
    };
  }
  return { category: "DRINKS DEAL", headline: plan.productName || "Drinks discount" };
}

function buildSubtitle(plan: DrinkPlanSummary, t: (k: string) => string): string {
  const parts: string[] = [];
  if (!plan.days || plan.days.length === 0 || plan.days.length === 7) {
    parts.push("Everyday");
  } else {
    parts.push(plan.days.map((d) => d.slice(0, 3)).join(", "));
  }
  if (plan.timeFrom && plan.timeTo) {
    parts.push(`${plan.timeFrom}–${plan.timeTo}`);
  }
  if (plan.gender === "female") parts.push(t("pub_offers.filter_ladies"));
  return parts.join(" • ");
}

function pickPrimaryPlan(plans: DrinkPlanSummary[]): DrinkPlanSummary {
  return plans[0];
}

interface TileProps {
  offer: VendorDrinkOffer;
  plans: DrinkPlanSummary[];
  featured?: boolean;
  accent?: "primary" | "amber";
}

function DealTile({ offer, plans, featured = false, accent = "primary" }: TileProps) {
  const { t } = useTranslation();
  const primary = pickPrimaryPlan(plans) as PlanWithDates;
  const { category, headline } = summarizePlan(primary);
  const subtitle = buildSubtitle(primary, t);
  const Icon = accent === "amber" ? Ticket : Wine;
  const href = offer.pubEventId ? `/events/${offer.pubEventId}?book=1` : `/vendors/${offer.vendorId}`;
  const untilLabel = formatUntil(primary.validUntil);
  const items = (primary.lineItems ?? []).filter((it) => it.name);
  const isTicket = primary.type === "ticket";

  if (featured) {
    const gradient = accent === "amber"
      ? "from-amber-500/95 via-amber-600/90 to-amber-700/85"
      : "from-primary/95 via-primary/80 to-primary/60";
    return (
      <Link href={href} className="group block">
        <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} text-white p-5 h-full flex flex-col min-h-[180px] red-glow border border-white/[0.10]`}>
          <Icon className="absolute -right-6 -bottom-6 h-32 w-32 text-white/10 rotate-12 pointer-events-none" />
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/85 mb-3">
            {category}
          </p>
          <p className="text-lg font-black leading-snug line-clamp-2 mb-1 text-white">
            {offer.vendorName}
          </p>
          {!isTicket && (
            <p className="text-sm text-white leading-snug line-clamp-2">{headline}</p>
          )}
          {isTicket && items.length > 0 && (
            <ul className="space-y-1 mt-1">
              {items.slice(0, 3).map((it, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm text-white">
                  <span className="truncate">{it.name}</span>
                  <span className="shrink-0 text-xs font-bold text-white">
                    {it.discountedPrice > 0 ? `₹${it.discountedPrice}` : "Free"}
                  </span>
                </li>
              ))}
              {items.length > 3 && (
                <li className="text-[10px] uppercase tracking-wider text-white/85">
                  +{items.length - 3} more
                </li>
              )}
            </ul>
          )}
          {subtitle && (
            <p className="text-xs text-white/90 mt-auto pt-3 line-clamp-1">{subtitle}</p>
          )}
          {untilLabel && (
            <p className="text-[10px] uppercase tracking-wider text-white/90 mt-1 flex items-center gap-1.5">
              <Calendar className="h-3 w-3 flex-shrink-0" /> Until {untilLabel}
            </p>
          )}
          {plans.length > 1 && (
            <p className="text-[10px] uppercase tracking-wider text-white/80 mt-1">
              +{plans.length - 1} more
            </p>
          )}
        </div>
      </Link>
    );
  }

  const labelColor = accent === "amber" ? "text-amber-400" : "text-primary";

  return (
    <Link href={href} className="group block">
      <div className="rounded-2xl glass-card p-5 h-full flex flex-col min-h-[180px] transition-colors hover:border-white/15">
        <p className={`text-[10px] font-bold uppercase tracking-[0.22em] ${labelColor} mb-3`}>
          {category}
        </p>
        <p className="text-lg font-black leading-snug line-clamp-2 mb-1 text-white">
          {offer.vendorName}
        </p>
        {!isTicket && (
          <p className="text-sm text-foreground/90 leading-snug line-clamp-2">{headline}</p>
        )}
        {isTicket && items.length > 0 && (
          <ul className="space-y-1 mt-1">
            {items.slice(0, 3).map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-foreground/90">{it.name}</span>
                <span className="shrink-0 text-xs font-bold text-emerald-400">
                  {it.discountedPrice > 0 ? `₹${it.discountedPrice}` : "Free"}
                </span>
              </li>
            ))}
            {items.length > 3 && (
              <li className="text-[10px] uppercase tracking-wider text-muted-foreground">
                +{items.length - 3} more
              </li>
            )}
          </ul>
        )}
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-auto pt-3 line-clamp-1 flex items-center gap-1.5">
            {(primary.timeFrom && primary.timeTo) && <Clock className="h-3 w-3 flex-shrink-0" />}
            {subtitle}
          </p>
        )}
        {untilLabel && (
          <p className="text-[10px] uppercase tracking-wider text-amber-400 mt-1 flex items-center gap-1.5">
            <Calendar className="h-3 w-3 flex-shrink-0" /> Until {untilLabel}
          </p>
        )}
        {plans.length > 1 && (
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
            +{plans.length - 1} more
          </p>
        )}
      </div>
    </Link>
  );
}

interface SectionProps {
  vendors: VendorWithPlans[];
  accent: "primary" | "amber";
  title: string;
  subtitle: string;
}

function DealPanel({ vendors, accent, title, subtitle }: SectionProps) {
  const Icon = accent === "amber" ? Ticket : Wine;
  const accentText = accent === "amber" ? "text-amber-400" : "text-primary";

  return (
    <div className="rounded-3xl glass-card-strong p-5 md:p-7">
      <div className="flex items-center gap-3 mb-1">
        <Icon className={`h-4 w-4 ${accentText}`} />
        <h3 className="text-base md:text-lg font-bold text-foreground tracking-tight">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-6">{subtitle}</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {vendors.map((v, i) => (
          <DealTile
            key={v.offer.vendorId}
            offer={v.offer}
            plans={v.plans}
            featured={i === 0}
            accent={accent}
          />
        ))}
      </div>
    </div>
  );
}

export function FreeDrinkSection({ vendors }: { vendors: VendorWithPlans[] }) {
  if (vendors.length === 0) return null;
  return (
    <DealPanel
      vendors={vendors}
      accent="primary"
      title="Free Drinks"
      subtitle="Tap on any deal to view venue & book"
    />
  );
}

export function TicketSection({ vendors }: { vendors: VendorWithPlans[] }) {
  if (vendors.length === 0) return null;
  return (
    <DealPanel
      vendors={vendors}
      accent="amber"
      title="Included With Ticket"
      subtitle="Tap on any deal to view venue & book"
    />
  );
}

export function splitVendorsByPlanType(
  offers: VendorDrinkOffer[],
  genderFilter?: "" | "female" | "other",
): { freeVendors: VendorWithPlans[]; ticketVendors: VendorWithPlans[] } {
  const genderMatch = (p: DrinkPlanSummary) =>
    !genderFilter ||
    (genderFilter === "female" ? p.gender === "female" : p.gender !== "female");

  const filtered = offers.filter((offer) => {
    if (!genderFilter) return true;
    return offer.plans.some((p) =>
      genderFilter === "female" ? p.gender === "female" : p.gender !== "female"
    );
  });

  const freeVendors = filtered
    .map((offer) => ({
      offer,
      plans: offer.plans.filter((p) => (p.type === "welcome" || p.type === "unlimited") && genderMatch(p)),
    }))
    .filter((v) => v.plans.length > 0);

  const ticketVendors = filtered
    .map((offer) => ({
      offer,
      plans: offer.plans.filter((p) => p.type === "ticket" && genderMatch(p)),
    }))
    .filter((v) => v.plans.length > 0);

  return { freeVendors, ticketVendors };
}

