import { Wine, Ticket, Clock, Coins, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CarouselRow } from "@/components/CarouselRow";
import { NightlifeOfferCard } from "@/components/NightlifeOfferCard";
import { OfferDayPills } from "@/components/OfferDayPills";
import { OfferSectionHeader } from "@/components/OfferSectionHeader";
import { OFFER_THEMES, type OfferTheme } from "@/components/offerThemes";
import { formatDayRanges } from "@/lib/days";
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

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fmtTime(hhmm: string): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = (h ?? 0) < 12 ? "AM" : "PM";
  const hr = (h ?? 0) % 12 || 12;
  return `${hr}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
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

/* Small gold eyebrow shown above the highlighted offer value (luxury mode). */
function offerEyebrowFor(type: string): string {
  switch (type) {
    case "welcome":      return "Enjoy";
    case "unlimited":    return "Enjoy";
    case "ticket":       return "Bundle";
    case "cover_charge": return "Entry";
    default:             return "Offer";
  }
}

function pickPrimaryPlan(plans: DrinkPlanSummary[]): DrinkPlanSummary {
  return plans[0]!;
}

const toImg = (v: string | null | undefined) => v || null;

/* Accent used by the section panels / tiles below. */
type Accent = "primary" | "amber" | "violet" | "darkred" | "gold";

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
  /** When set, adds a "Book now" button that deep-links to the venue booking. */
  bookHref?: string;
  /** Luxury no-image mode (Pub Offers page) — offer + days become the hero. */
  hideImage?: boolean;
  /** Per-category colour theme for VIP ticket mode (offerThemes.ts). */
  theme?: OfferTheme;
  onClick?: () => void;
}

export function DrinkDealCard({
  plan,
  title,
  fallbackImage,
  href,
  bookHref,
  hideImage = false,
  theme,
  onClick,
}: DrinkDealCardProps) {
  const { t } = useTranslation();
  const { badge, headline } = summarizePlan(plan);
  const items = (plan.lineItems ?? []).filter((it) => it.name);
  const isTicket = plan.type === "ticket";
  const isCoverCharge = plan.type === "cover_charge";
  const imageUrl = toImg(plan.imageUrl) ?? toImg(fallbackImage) ?? null;
  const gender = plan.gender === "female" ? t("pub_offers.filter_ladies") : null;
  const timeStr = (plan.timeFrom && plan.timeTo)
    ? `${fmtTime(plan.timeFrom)} – ${fmtTime(plan.timeTo)}`
    : null;
  const dealText = isTicket && items.length > 0
    ? items.slice(0, 2).map((it) => it.name).join(" · ") + (items.length > 2 ? " +more" : "")
    : headline;
  // Cover charges & tickets bundle "what's included" in lineItems — surface it.
  const includedText = items.map((it) => it.name).join(" · ");
  const showIncluded = (isCoverCharge || isTicket) && includedText.length > 0;

  const iconSize = hideImage ? "h-5 w-5" : "h-3.5 w-3.5";
  const offerIcon = isCoverCharge
    ? <Coins className={iconSize} />
    : isTicket
      ? <Ticket className={iconSize} />
      : <Wine className={iconSize} />;
  const priceLabel = isCoverCharge && (plan.price ?? 0) > 0 ? `₹${((plan.price ?? 0) / 100).toFixed(0)}` : undefined;
  const statusBadge = gender ? (
    <span className="rounded-full bg-pink-500/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">{gender}</span>
  ) : undefined;

  // Clean day · time footer row — mirrors the Happening Tonight card style.
  const daysLabel = formatDayRanges(plan.days ?? []);
  const extras = hideImage ? (
    /* VIP ticket mode — included items (cover charges & tickets) + pills + time. */
    <div className="flex flex-col gap-1.5">
      {showIncluded && (
        <div className="flex items-start gap-1.5 text-[11px] leading-snug text-white/65">
          <Check className="mt-[1px] h-3 w-3 shrink-0" style={{ color: theme?.accent }} />
          <span className="line-clamp-2">{includedText}</span>
        </div>
      )}
      <OfferDayPills days={plan.days} accent={theme?.accent} glow={theme?.glow} />
      <div className="flex items-center gap-1.5 text-[11px] text-white/55">
        <Clock className="h-3 w-3 shrink-0" style={{ color: theme?.accent }} />
        <span className="truncate">{timeStr ?? "All day"}</span>
      </div>
    </div>
  ) : (
    <div className="mt-auto flex items-center gap-1.5 pt-0.5 text-[12px] text-white/55">
      <Clock className="h-3.5 w-3.5 shrink-0 text-[#D4AF37]" />
      <span className="truncate">{daysLabel}{timeStr ? ` · ${timeStr}` : ""}</span>
    </div>
  );

  const card = (
    <NightlifeOfferCard
      href={href}
      bookHref={bookHref}
      hideImage={hideImage}
      theme={theme}
      imageUrl={imageUrl}
      title={hideImage ? headline : dealText}
      venueName={title}
      offerLabel={badge}
      offerEyebrow={hideImage ? offerEyebrowFor(plan.type) : undefined}
      offerIcon={offerIcon}
      priceLabel={priceLabel}
      statusBadge={statusBadge}
      imageAspectClass="aspect-[4/3]"
    >
      {extras}
    </NightlifeOfferCard>
  );

  // NightlifeOfferCard wraps itself in a Link when `href` is set; otherwise wrap
  // the click handler (single-venue Happy Hours tab) around it.
  if (!href && onClick) {
    return (
      <button type="button" onClick={onClick} className="group block h-full w-full text-left">
        {card}
      </button>
    );
  }
  return card;
}

/* ─── Vendor tile (wraps DrinkDealCard with offer → href) ────────────────── */
function DealTile({ offer, plans, accent = "primary", hideImage = false, theme }: { offer: VendorDrinkOffer; plans: DrinkPlanSummary[]; accent?: Accent; hideImage?: boolean; theme?: OfferTheme }) {
  const primary = pickPrimaryPlan(plans) as PlanWithDates;
  const offerWithImg = offer as OfferWithImage;
  const href = offer.pubEventId ? `/events/${offer.pubEventId}?book=1` : `/vendors/${offer.vendorId}`;
  const bookHref = offer.pubEventId ? `/events/${offer.pubEventId}?book=1` : `/vendors/${offer.vendorId}?book=1`;
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
      bookHref={hideImage ? bookHref : undefined}
      hideImage={hideImage}
      theme={theme}
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

function DealPanel({ vendors, accent, title, subtitle, hideImage = false, theme, sectionIcon }: SectionProps & { hideImage?: boolean; theme?: OfferTheme; sectionIcon?: typeof Wine }) {
  const Icon = sectionIcon ?? (accent === "amber" ? Ticket : (accent === "violet" || accent === "darkred") ? Coins : Wine);

  // Legacy (non-VIP) header box, kept for any image-mode reuse.
  const headerBox = accent === "amber"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
    : accent === "violet"
      ? "border-violet-500/30 bg-violet-500/10 text-violet-400"
      : accent === "darkred"
        ? "border-red-800/40 bg-red-800/10 text-red-400"
        : "border-primary/30 bg-primary/10 text-primary";

  return (
    <div>
      {hideImage && theme ? (
        <OfferSectionHeader theme={theme} Icon={Icon} title={title} subtitle={subtitle} viewAllHref="/pubs" />
      ) : (
        <>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg border ${headerBox}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-base md:text-lg font-bold tracking-tight">{title}</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-5 ml-[2.25rem]">{subtitle}</p>
        </>
      )}

      {/* Single-row rail with arrows — scroll for more, never wraps. */}
      <CarouselRow itemClassName={hideImage ? "w-[310px] sm:w-[345px]" : "w-[150px] sm:w-[180px] md:w-[200px]"} gapClass="gap-3 md:gap-4">
        {vendors.map((v) => (
          <DealTile key={v.offer.vendorId} offer={v.offer} plans={v.plans} accent={accent} hideImage={hideImage} theme={theme} />
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
      subtitle="Complimentary welcome & unlimited pours"
      hideImage
      theme={OFFER_THEMES.free}
      sectionIcon={Wine}
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
      subtitle="Food & drinks bundled with entry"
      hideImage
      theme={OFFER_THEMES.ticket}
      sectionIcon={Ticket}
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
      subtitle="Seamless entry, redeemable at the bar"
      hideImage
      theme={OFFER_THEMES.cover}
      sectionIcon={Coins}
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
