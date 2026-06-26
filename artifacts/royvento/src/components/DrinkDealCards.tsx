import { Link } from "wouter";
import { Wine, Ticket, Clock, Calendar, Heart, GlassWater, Coins, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CarouselRow } from "@/components/CarouselRow";
import type { VendorDrinkOffer, DrinkPlanSummary } from "@workspace/api-client-react";

type PlanWithDates = DrinkPlanSummary & {
  validFrom?: string | null;
  validUntil?: string | null;
  imageUrl?: string | null;
};

type OfferWithImage = VendorDrinkOffer & {
  imageUrl?: string | null;
};

export type VendorWithPlans = { offer: VendorDrinkOffer; plans: DrinkPlanSummary[] };

/* Loose plan shape — accepts both the generated DrinkPlanSummary and the raw
   drink-plan row returned by /api/vendors/:id/drink-plans (event-detail). */
export interface DrinkDealPlanLike {
  type: string;
  productName?: string;
  gender?: string;
  price?: number;
  peoplePerPackage?: number | null;
  lineItems?: Array<{ name: string; discountedPrice?: number }> | null;
  days?: string[];
  timeFrom?: string;
  timeTo?: string;
  validUntil?: string | null;
  imageUrl?: string | null;
}

/* ─── Constants ─────────────────────────────────────────────────────────── */
const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_LETTER: Record<string, string> = {
  Mon: "M", Tue: "T", Wed: "W", Thu: "T", Fri: "F", Sat: "S", Sun: "S",
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fmtTime(hhmm: string): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = (h ?? 0) < 12 ? "AM" : "PM";
  const hr = (h ?? 0) % 12 || 12;
  return `${hr}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

function formatUntil(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function summarizePlan(plan: DrinkDealPlanLike): { badge: string; headline: string } {
  if (plan.type === "welcome") {
    return { badge: "FREE DRINK", headline: plan.productName || "Free welcome drink" };
  }
  if (plan.type === "unlimited") {
    return { badge: "UNLIMITED", headline: plan.productName || "Unlimited drinks" };
  }
  if (plan.type === "ticket") {
    const count = (plan.lineItems ?? []).filter((i) => i.name).length;
    return {
      badge: "WITH TICKET",
      headline: plan.productName || (count > 0 ? `${count} item${count !== 1 ? "s" : ""} included` : "Drinks with ticket"),
    };
  }
  if (plan.type === "cover_charge") {
    return { badge: "COVER CHARGE", headline: plan.productName || "Cover charge package" };
  }
  return { badge: "DRINKS DEAL", headline: plan.productName || "Drinks discount" };
}

function pickPrimaryPlan(plans: DrinkPlanSummary[]): DrinkPlanSummary {
  return plans[0]!;
}

const toImg = (v: string | null | undefined) => v || null;

/* ─── Day pills (M T W T F S S) ─────────────────────────────────────────── */
type Accent = "primary" | "amber" | "violet" | "darkred";

function DayPills({ activeDays, accent = "primary" }: { activeDays: string[]; accent?: Accent }) {
  // Match case-insensitively on the first three letters so any stored format
  // ("Thu" / "thu" / "Thursday") highlights correctly. Empty = every day.
  const activeSet = new Set((activeDays ?? []).map((d) => d.slice(0, 3).toLowerCase()));
  const isAll = activeSet.size === 0;
  return (
    <div className="flex items-center gap-[5px]">
      {ALL_DAYS.map((day) => {
        const active = isAll || activeSet.has(day.slice(0, 3).toLowerCase());
        const activeClass = accent === "amber"
          ? "bg-amber-500 text-black"
          : accent === "violet"
            ? "bg-violet-500 text-white"
            : accent === "darkred"
              ? "bg-red-800 text-white"
              : "bg-primary text-primary-foreground";
        return (
          <span
            key={day}
            className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[9px] font-bold leading-none select-none ${
              active ? activeClass : "bg-white/[0.08] text-white/25"
            }`}
          >
            {DAY_LETTER[day]}
          </span>
        );
      })}
    </div>
  );
}

/* ─── Reusable presentational deal card ──────────────────────────────────────
   Image on top + content below. Wrapper is a Link (href), a button (onClick),
   or a plain div. Shared by the homepage / pub-offers grids AND the event
   detail Happy Hours tab so the design stays identical everywhere. */
export interface DrinkDealCardProps {
  plan: DrinkDealPlanLike;
  /** Accent line above the headline (e.g. venue name). Omit on single-venue pages. */
  title?: string;
  /** Fallback image when the plan has none (e.g. the vendor cover). */
  fallbackImage?: string | null;
  accent?: Accent;
  /** "+N more plans" footnote. */
  extraPlansCount?: number;
  href?: string;
  onClick?: () => void;
}

export function DrinkDealCard({
  plan,
  title,
  fallbackImage,
  accent = "primary",
  extraPlansCount = 0,
  href,
  onClick,
}: DrinkDealCardProps) {
  const { t } = useTranslation();
  const { badge, headline } = summarizePlan(plan);
  const items = (plan.lineItems ?? []).filter((it) => it.name);
  const isTicket = plan.type === "ticket";
  const isCoverCharge = plan.type === "cover_charge";
  const imageUrl = toImg(plan.imageUrl) ?? toImg(fallbackImage) ?? null;
  const untilLabel = formatUntil(plan.validUntil);
  const gender = plan.gender === "female" ? t("pub_offers.filter_ladies") : null;
  const timeStr = (plan.timeFrom && plan.timeTo)
    ? `${fmtTime(plan.timeFrom)} – ${fmtTime(plan.timeTo)}`
    : null;

  const badgeCls = accent === "amber"
    ? "bg-amber-500 text-black"
    : accent === "violet"
      ? "bg-violet-500 text-white"
      : accent === "darkred"
        ? "bg-red-800 text-white"
        : "bg-primary text-primary-foreground";
  const accentText = accent === "amber"
    ? "text-amber-400"
    : accent === "violet"
      ? "text-violet-400"
      : accent === "darkred"
        ? "text-red-400"
        : "text-primary";

  const dealText = isTicket && items.length > 0
    ? items.slice(0, 2).map((it) => it.name).join(" · ") + (items.length > 2 ? " +more" : "")
    : headline;

  const inner = (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111] transition-all duration-300 group-hover:-translate-y-1 group-hover:border-primary/20 group-hover:shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
      {/* ── Image section ── */}
      <div className="relative aspect-[4/3] overflow-hidden bg-zinc-900">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title || badge}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/20 via-zinc-900 to-black flex flex-col items-center justify-center gap-1.5">
            <GlassWater className="h-10 w-10 text-primary/50" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{badge}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#111]/80 via-transparent to-transparent" />

        {/* Deal badge — top left */}
        <div className="absolute top-3 left-3 z-10">
          <span className={`inline-flex items-center rounded-lg px-2.5 py-[5px] text-[10px] font-black uppercase tracking-wide shadow-md ${badgeCls}`}>
            {badge}
          </span>
        </div>

        {/* Heart — top right */}
        <span
          aria-hidden
          className="absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm border border-white/[0.10] text-white/50 transition-all group-hover:text-primary group-hover:border-primary/40"
        >
          <Heart className="h-3.5 w-3.5" />
        </span>
      </div>

      {/* ── Content section ── */}
      <div className="px-4 pt-3.5 pb-4 space-y-2">
        {(title || gender) && (
          <div className="flex items-start justify-between gap-2 min-h-[20px]">
            {title ? (
              <p className={`text-[13px] font-bold leading-tight line-clamp-1 ${accentText}`}>{title}</p>
            ) : <span />}
            {gender && (
              <span className="shrink-0 rounded-full bg-pink-500/15 border border-pink-500/25 px-2 py-0.5 text-[9px] font-semibold text-pink-400 uppercase tracking-wide">
                {gender}
              </span>
            )}
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <p className="text-white font-black text-[15px] leading-snug line-clamp-2 min-h-[38px] flex-1">
            {dealText}
          </p>
          {isCoverCharge && (plan.price ?? 0) > 0 && (
            <span className={`shrink-0 font-black text-[15px] ${accentText}`}>₹{(plan.price! / 100).toFixed(0)}</span>
          )}
        </div>

        {isCoverCharge && (plan.peoplePerPackage ?? 0) > 0 && (
          <p className="text-[11px] text-white/55 flex items-center gap-1">
            <Users className="h-3 w-3 flex-shrink-0 text-white/35" />
            {plan.peoplePerPackage === 1 ? "Made just for you 🎉" : `Bring your squad of ${plan.peoplePerPackage} 🎉`}
          </p>
        )}

        {(isTicket || isCoverCharge) && items.length > 0 && (
          <ul className="space-y-1">
            {items.slice(0, 3).map((it, i) => (
              <li key={i} className="flex items-center justify-between text-xs text-white/70">
                <span className="truncate flex-1">{it.name}</span>
                <span className={`shrink-0 font-semibold ml-2 ${accentText}`}>
                  {(it.discountedPrice ?? 0) > 0 ? `₹${it.discountedPrice}` : "Free"}
                </span>
              </li>
            ))}
          </ul>
        )}

        {timeStr ? (
          <p className="text-white/45 text-[11px] flex items-center gap-1.5">
            <Clock className="h-3 w-3 flex-shrink-0 text-white/30" />
            {timeStr}
          </p>
        ) : (
          <div className="h-[16px]" />
        )}

        <DayPills activeDays={plan.days ?? []} accent={accent} />

        {untilLabel && (
          <p className={`text-[10px] uppercase tracking-wide flex items-center gap-1 mt-0.5 ${accentText} opacity-70`}>
            <Calendar className="h-3 w-3 flex-shrink-0" /> Until {untilLabel}
          </p>
        )}

        {extraPlansCount > 0 && (
          <p className="text-[10px] text-white/25 uppercase tracking-wide">
            +{extraPlansCount} more plan{extraPlansCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} className="group block">{inner}</Link>;
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="group block w-full text-left">
        {inner}
      </button>
    );
  }
  return <div className="group block">{inner}</div>;
}

/* ─── Vendor tile (wraps DrinkDealCard with offer → href) ────────────────── */
function DealTile({ offer, plans, accent = "primary" }: { offer: VendorDrinkOffer; plans: DrinkPlanSummary[]; accent?: Accent }) {
  const primary = pickPrimaryPlan(plans) as PlanWithDates;
  const offerWithImg = offer as OfferWithImage;
  const href = offer.pubEventId ? `/events/${offer.pubEventId}?book=1` : `/vendors/${offer.vendorId}`;
  const fallbackImage =
    toImg(offerWithImg.imageUrl) ?? toImg((offer as VendorDrinkOffer).coverImageUrl) ?? null;

  return (
    <DrinkDealCard
      plan={primary}
      title={offer.vendorName}
      fallbackImage={fallbackImage}
      accent={accent}
      extraPlansCount={plans.length - 1}
      href={href}
    />
  );
}

/* ─── Section panel (Free Drinks / Included with Ticket) ────────────────── */
interface SectionProps {
  vendors: VendorWithPlans[];
  accent: Accent;
  title: string;
  subtitle: string;
}

function DealPanel({ vendors, accent, title, subtitle }: SectionProps) {
  const Icon = accent === "amber" ? Ticket : (accent === "violet" || accent === "darkred") ? Coins : Wine;
  const headerBox = accent === "amber"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
    : accent === "violet"
      ? "border-violet-500/30 bg-violet-500/10 text-violet-400"
      : accent === "darkred"
        ? "border-red-800/40 bg-red-800/10 text-red-400"
        : "border-primary/30 bg-primary/10 text-primary";

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg border ${headerBox}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-base md:text-lg font-bold tracking-tight">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-5 ml-[2.25rem]">{subtitle}</p>

      {/* Single-row rail with arrows — scroll for more, never wraps. */}
      <CarouselRow itemClassName="w-[160px] sm:w-[200px] md:w-[220px]" gapClass="gap-3 md:gap-4">
        {vendors.map((v) => (
          <DealTile key={v.offer.vendorId} offer={v.offer} plans={v.plans} accent={accent} />
        ))}
      </CarouselRow>
    </div>
  );
}

/* ─── Public exports ─────────────────────────────────────────────────────── */
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

export function CoverChargeSection({ vendors }: { vendors: VendorWithPlans[] }) {
  if (vendors.length === 0) return null;
  return (
    <DealPanel
      vendors={vendors}
      accent="primary"
      title="Cover Charges"
      subtitle="Tap on any deal to view venue & book"
    />
  );
}

export function splitVendorsByPlanType(
  offers: VendorDrinkOffer[],
  genderFilter?: "" | "female" | "other",
): { freeVendors: VendorWithPlans[]; ticketVendors: VendorWithPlans[]; coverChargeVendors: VendorWithPlans[] } {
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
      plans: offer.plans.filter(
        (p) => (p.type === "welcome" || p.type === "unlimited") && genderMatch(p),
      ),
    }))
    .filter((v) => v.plans.length > 0);

  const ticketVendors = filtered
    .map((offer) => ({
      offer,
      plans: offer.plans.filter((p) => p.type === "ticket" && genderMatch(p)),
    }))
    .filter((v) => v.plans.length > 0);

  const coverChargeVendors = filtered
    .map((offer) => ({
      offer,
      plans: offer.plans.filter((p) => p.type === "cover_charge" && genderMatch(p)),
    }))
    .filter((v) => v.plans.length > 0);

  return { freeVendors, ticketVendors, coverChargeVendors };
}
