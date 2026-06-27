import { Link, useLocation } from "wouter";
import { useState, useCallback, useEffect } from "react";
import { SEO } from "@/components/SEO";
import {
  ArrowRight, Bell, ChevronLeft,
  Clock, GlassWater, Tag, Percent, RotateCcw, Gift, Utensils, Heart, MapPin,
  type LucideIcon,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { useListVendorDrinkOffers, useGetMe } from "@workspace/api-client-react";
import type { VendorDrinkOffer } from "@workspace/api-client-react";
import { FreeDrinkSection, TicketSection, CoverChargeSection, splitVendorsByPlanType } from "@/components/DrinkDealCards";
import { CarouselRow } from "@/components/CarouselRow";
import { SquareImage } from "@/components/SquareImage";
import { useToast } from "@/hooks/use-toast";

interface AllDrinkDeal {
  id: number;
  vendorId: number;
  category: "food" | "drink";
  vendorName: string;
  vendorLocation: string;
  vendorCity: string;
  vendorCoverImage: string;
  imageUrl?: string | null;
  title: string;
  description: string;
  discountType: "percent" | "fixed" | "bogo" | "free_item";
  discountValue: string;
  freeItemName: string;
  days: string[];
  timeFrom: string;
  timeTo: string;
}

const DAYS_OF_WEEK = [
  { key: "",    label: "All Days"   },
  { key: "Mon", label: "Monday"    },
  { key: "Tue", label: "Tuesday"   },
  { key: "Wed", label: "Wednesday" },
  { key: "Thu", label: "Thursday"  },
  { key: "Fri", label: "Friday"    },
  { key: "Sat", label: "Saturday"  },
  { key: "Sun", label: "Sunday"    },
] as const;

/* ─── Food & Drink Discount card (mirrors the Cover Charges card design from
   DrinkDealCards, but renders vendor_offer discount data and takes its own
   colour accent). Each discount category gets a distinct colour. ──────────── */
const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_LETTER: Record<string, string> = {
  Mon: "M", Tue: "T", Wed: "W", Thu: "T", Fri: "F", Sat: "S", Sun: "S",
};

type DiscountAccent = "darkyellow" | "primary";
const DISCOUNT_ACCENT: Record<DiscountAccent, {
  badge: string; text: string; pill: string; headerBox: string; hoverBorder: string; tag: string;
}> = {
  // Food Discounts — dark yellow
  darkyellow: {
    badge: "bg-yellow-600 text-black",
    text: "text-yellow-500",
    pill: "bg-yellow-600 text-black",
    headerBox: "border-yellow-600/40 bg-yellow-600/10 text-yellow-500",
    hoverBorder: "group-hover:border-yellow-600/40",
    tag: "text-yellow-500",
  },
  // Drink Discounts — same as Free Drinks / Cover Charges (primary red)
  primary: {
    badge: "bg-primary text-primary-foreground",
    text: "text-primary",
    pill: "bg-primary text-primary-foreground",
    headerBox: "border-primary/30 bg-primary/10 text-primary",
    hoverBorder: "group-hover:border-primary/30",
    tag: "text-primary",
  },
};

function DiscountDayPills({ activeDays, accentPill }: { activeDays: string[]; accentPill: string }) {
  // Days are stored as 3-letter lowercase abbreviations (empty = every day).
  const activeSet = new Set((activeDays ?? []).map((d) => d.slice(0, 3).toLowerCase()));
  const isAll = activeSet.size === 0;
  return (
    <div className="flex items-center gap-[5px]">
      {ALL_DAYS.map((day) => {
        const active = isAll || activeSet.has(day.slice(0, 3).toLowerCase());
        return (
          <span
            key={day}
            className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[9px] font-bold leading-none select-none ${
              active ? accentPill : "bg-white/[0.08] text-white/25"
            }`}
          >
            {DAY_LETTER[day]}
          </span>
        );
      })}
    </div>
  );
}

function discountBadge(deal: AllDrinkDeal): { text: string; Icon: LucideIcon } {
  if (deal.discountType === "percent") return { text: `${deal.discountValue}% OFF`, Icon: Percent };
  if (deal.discountType === "fixed") return { text: `₹${deal.discountValue} FLAT`, Icon: Tag };
  if (deal.discountType === "bogo") return { text: "BUY 1 GET 1", Icon: RotateCcw };
  return { text: deal.freeItemName ? `FREE ${deal.freeItemName.toUpperCase()}` : "FREE ITEM", Icon: Gift };
}

function DiscountCard({ deal, accent }: { deal: AllDrinkDeal; accent: DiscountAccent }) {
  const a = DISCOUNT_ACCENT[accent];
  const { text: badgeText, Icon: BadgeIcon } = discountBadge(deal);
  // Prefer the offer's own deal image; fall back to the venue cover.
  const dealImg = deal.imageUrl || deal.vendorCoverImage;
  const timeLabel = deal.timeFrom && deal.timeTo
    ? `${deal.timeFrom} – ${deal.timeTo}`
    : deal.timeFrom || "";

  return (
    <Link href={`/vendors/${deal.vendorId}`} className="group block">
      <div className={`overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111] transition-all duration-300 group-hover:-translate-y-1 ${a.hoverBorder} group-hover:shadow-[0_12px_40px_rgba(0,0,0,0.55)]`}>
        {/* ── Image section (1:1, whole image shown — never cropped) ── */}
        {(() => {
          const overlays = (
            <>
              <div className="absolute inset-0 z-[2] bg-gradient-to-t from-[#111]/80 via-transparent to-transparent pointer-events-none" />
              <div className="absolute top-3 left-3 z-10">
                <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-[5px] text-[10px] font-black uppercase tracking-wide shadow-md ${a.badge}`}>
                  <BadgeIcon className="h-3 w-3" />{badgeText}
                </span>
              </div>
              <span
                aria-hidden
                className="absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm border border-white/[0.10] text-white/50 transition-all group-hover:text-white"
              >
                <Heart className="h-3.5 w-3.5" />
              </span>
            </>
          );
          return dealImg ? (
            <SquareImage src={dealImg} alt={deal.vendorName} imgClassName="transition-transform duration-700 group-hover:scale-105">
              {overlays}
            </SquareImage>
          ) : (
            <div className="relative aspect-square overflow-hidden bg-zinc-900">
              <div className="h-full w-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-black flex items-center justify-center">
                <Tag className="h-10 w-10 text-white/20" />
              </div>
              {overlays}
            </div>
          );
        })()}

        {/* ── Content section ── */}
        <div className="px-4 pt-3.5 pb-4 space-y-2">
          <p className={`text-[13px] font-bold leading-tight line-clamp-1 ${a.text}`}>{deal.vendorName}</p>
          <p className="text-white font-black text-[15px] leading-snug line-clamp-2 min-h-[38px]">{deal.title}</p>
          {deal.description && (
            <p className="text-[11px] text-white/55 line-clamp-2">{deal.description}</p>
          )}
          {timeLabel ? (
            <p className="text-white/45 text-[11px] flex items-center gap-1.5">
              <Clock className="h-3 w-3 flex-shrink-0 text-white/30" />{timeLabel}
            </p>
          ) : (
            <div className="h-[16px]" />
          )}
          <DiscountDayPills activeDays={deal.days} accentPill={a.pill} />
          {deal.vendorCity && (
            <p className={`text-[10px] uppercase tracking-wide flex items-center gap-1 mt-0.5 ${a.tag} opacity-70`}>
              <MapPin className="h-3 w-3 flex-shrink-0" /> {deal.vendorCity}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

function DiscountPanel({ deals, accent, title, subtitle, Icon }: {
  deals: AllDrinkDeal[]; accent: DiscountAccent; title: string; subtitle: string; Icon: LucideIcon;
}) {
  if (deals.length === 0) return null;
  const a = DISCOUNT_ACCENT[accent];
  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg border ${a.headerBox}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-base md:text-lg font-bold tracking-tight">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-5 ml-[2.25rem]">{subtitle}</p>

      {/* Single-row rail with arrows — mirrors the Cover Charges layout. */}
      <CarouselRow itemClassName="w-[160px] sm:w-[200px] md:w-[220px]" gapClass="gap-3 md:gap-4">
        {deals.map((deal) => (
          <DiscountCard key={deal.id} deal={deal} accent={accent} />
        ))}
      </CarouselRow>
    </div>
  );
}

/* â"€â"€â"€ Main page â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */
export function PubOffers() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // â"€â"€ data (all hooks unchanged) â"€â"€
  const { data: me } = useGetMe({ query: { retry: false } as any });
  const user = me?.user as any;
  const { data: drinkOffers = [] } = useListVendorDrinkOffers();

  // â"€â"€ all filter state (unchanged) â"€â"€
  const [dealGenderFilter, setDealGenderFilter]   = useState("");
  const [dayFilter, setDayFilter]                 = useState("");

  // â"€â"€ split deals, then filter by selected day â"€â"€
  const { freeVendors: allFreeVendors, ticketVendors: allTicketVendors, coverChargeVendors: allCoverChargeVendors } = splitVendorsByPlanType(
    drinkOffers as VendorDrinkOffer[],
    dealGenderFilter as "" | "female" | "other",
  );

  // Task 4: wire day filter â€" keep only vendors that have at least one plan
  // whose `days` array includes the selected day abbreviation.
  const freeVendors = dayFilter
    ? allFreeVendors.filter((v) =>
        v.plans.some((p) => Array.isArray(p.days) && p.days.includes(dayFilter))
      )
    : allFreeVendors;

  const ticketVendors = dayFilter
    ? allTicketVendors.filter((v) =>
        v.plans.some((p) => Array.isArray(p.days) && p.days.includes(dayFilter))
      )
    : allTicketVendors;

  const coverChargeVendors = dayFilter
    ? allCoverChargeVendors.filter((v) =>
        v.plans.some((p) => Array.isArray(p.days) && p.days.includes(dayFilter))
      )
    : allCoverChargeVendors;

  const hasDeals        = (drinkOffers as VendorDrinkOffer[]).length > 0;

  const [allDrinkDeals, setAllDrinkDeals] = useState<AllDrinkDeal[]>([]);
  useEffect(() => {
    apiGet<AllDrinkDeal[]>("/api/vendors/all-drink-deals")
      .then((rows) => setAllDrinkDeals(rows))
      .catch(() => {});
  }, []);

  const filteredDeals = dayFilter
    ? allDrinkDeals.filter((d) => {
        const dayLower = dayFilter.toLowerCase().slice(0, 3);
        return d.days.length === 0 || d.days.includes(dayLower);
      })
    : allDrinkDeals;

  // Keep Food and Drink discounts in their own colour-coded sections.
  const foodDeals = filteredDeals.filter((d) => d.category === "food");
  const drinkDeals = filteredDeals.filter((d) => d.category === "drink");

  // â"€â"€ Task 3: Notify Me â€" goes to /subscription; if already subscribed show sweet toast â"€â"€
  const handleNotifyMe = useCallback(async () => {
    if (user) {
      try {
        const sub = await apiGet<{ planType: string; status: string } | null>("/api/subscriptions/me");
        if (sub && sub.status === "active") {
          toast({
            title: "ðŸŽ‰ You're all set!",
            description: "We'll send you exclusive coupons and happy-hour alerts straight to your inbox. Watch out for something special! ðŸ¸",
          });
          return;
        }
      } catch {}
    }
    navigate("/subscription");
  }, [user, navigate, toast]);

  return (
    <div className="min-h-screen bg-background pb-16">
      <SEO
        title="Hot Pub Offers in India — Free Entry, Happy Hours & More | Royvento"
        description="Live pub offers from across India: ladies' nights, happy hours, free entry, unlimited drinks and weekend deals. Updated daily on Royvento."
        canonical="/pub-offers"
      />

      {/* â•â•â• HERO â€" Premium full-bleed with split layout â•â•â• */}
      <div className="relative overflow-hidden border-b border-white/[0.06] bg-black">

        {/* Full-bleed background image â€" hidden on mobile, visible md+ */}
        <div className="pointer-events-none absolute inset-0 hidden md:block">
          <img
            src="https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=1400&q=85"
            alt=""
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover object-center"
            style={{ transform: "scale(1.06)", transformOrigin: "center center" }}
          />
          {/* Light dark base — keeps the image clearly visible */}
          <div className="absolute inset-0 bg-black/30" />
          {/* Left-side gradient so text stays legible, fading to clear image on the right */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/45 to-transparent" />
          {/* Soft bottom fade to background */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
          {/* Brand accent glow â€" bottom-left */}
          <div className="absolute bottom-0 left-0 w-[400px] h-[200px] bg-primary/15 blur-[80px] pointer-events-none" />
        </div>

        {/* Mobile: subtle dark gradient background */}
        <div className="pointer-events-none absolute inset-0 md:hidden bg-gradient-to-br from-black via-[#0d0205] to-black" />
        <div className="pointer-events-none absolute bottom-0 left-0 w-64 h-48 bg-primary/10 blur-[60px] md:hidden" />

        {/* Bottom accent line */}
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />

        <div className="relative container mx-auto px-4 md:px-6 pt-6 md:pt-8 pb-8 md:pb-10">
          {/* Back link */}
          <Link href="/pubs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors mb-6 md:mb-8">
            <ChevronLeft className="h-4 w-4" /> Back to Venues
          </Link>

          {/* Title block */}
          <div className="flex items-start gap-4 md:gap-5 max-w-xl">
            <div className="flex h-12 w-12 md:h-14 md:w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/40 bg-primary/15 text-primary shadow-[0_0_20px_rgba(232,41,28,0.45)]">
              <Clock className="h-6 w-6 md:h-7 md:w-7" />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight">Happy Hours</h1>
              <p className="mt-1.5 text-sm md:text-base font-semibold text-white/75">Great Drinks. Great Prices. Good Times!</p>
              <p className="mt-1 text-xs md:text-sm text-muted-foreground max-w-xs md:max-w-sm">Explore the best happy hours and offers near you.</p>
            </div>
          </div>

          {/* Day-of-week filter pills â€" scrollable on mobile */}
          <div className="mt-6 md:mt-8">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
              {DAYS_OF_WEEK.map(({ key, label }) => (
                <button
                  key={key || "all"}
                  onClick={() => setDayFilter(key === dayFilter ? "" : key)}
                  className={`flex-shrink-0 px-3.5 md:px-4 py-1.5 rounded-full text-xs md:text-sm font-medium border transition-all ${
                    dayFilter === key
                      ? "bg-primary border-primary text-primary-foreground shadow-[0_0_14px_rgba(232,41,28,0.5)]"
                      : "border-white/[0.12] text-white/70 hover:border-primary/40 hover:text-white bg-transparent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-8">

        {/* Announcements ("What's On") removed from Happy Hours — they now live
            on the dedicated Events page. */}

        {/* Loading / empty state — show only if both offer sources are empty */}
        {!hasDeals && allDrinkDeals.length === 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-16 text-center">
            <GlassWater className="h-10 w-10 text-primary/30 mx-auto mb-3" />
            <p className="text-lg font-semibold text-white/60">No drink deals available right now.</p>
            <p className="text-sm text-muted-foreground mt-1">Check back soon — new happy hour deals are added regularly.</p>
          </div>
        )}

        {/* â"€â"€ DRINK DEALS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        {hasDeals && (
          <section className="mb-12">
            {/* Section header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <GlassWater className="h-4 w-4 text-primary" />
                <span className="text-xs uppercase tracking-[0.22em] text-primary font-semibold">
                  {t("pub_offers.drink_deals")}
                </span>
                {dayFilter && (
                  <span className="text-xs text-white/50 ml-1">— {DAYS_OF_WEEK.find(d => d.key === dayFilter)?.label}</span>
                )}
              </div>
              <Link href="/pubs" className="text-xs text-muted-foreground hover:text-white flex items-center gap-1 transition-colors">
                {t("pub_offers.browse_pubs")} <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Gender filter */}
            <div className="flex items-center gap-3 mb-7 flex-wrap">
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">{t("pub_offers.filter_for")}</p>
              <div className="flex gap-2 flex-wrap">
                {[
                  { key: "",       label: t("pub_offers.filter_everyone")  },
                  { key: "female", label: t("pub_offers.filter_ladies")    },
                  { key: "other",  label: t("pub_offers.filter_mixed_all") },
                ].map((opt) => (
                  <button
                    key={opt.key || "all"}
                    onClick={() => setDealGenderFilter(opt.key === dealGenderFilter ? "" : opt.key)}
                    className={`px-4 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${
                      dealGenderFilter === opt.key
                        ? "bg-primary/15 border-primary/50 text-primary"
                        : "border-white/[0.08] text-white/40 hover:border-white/20 hover:text-white/60"
                    }`}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            {freeVendors.length === 0 && ticketVendors.length === 0 && coverChargeVendors.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-10 text-center">
                <GlassWater className="h-8 w-8 text-primary/30 mx-auto mb-3" />
                <p className="text-white/60">
                  {dayFilter
                    ? `No deals available on ${DAYS_OF_WEEK.find(d => d.key === dayFilter)?.label}. Try another day.`
                    : "No deals match these filters."}
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                <FreeDrinkSection vendors={freeVendors} />
                {freeVendors.length > 0 && ticketVendors.length > 0 && (
                  <div className="premium-divider" />
                )}
                <TicketSection vendors={ticketVendors} />
                {(freeVendors.length > 0 || ticketVendors.length > 0) && coverChargeVendors.length > 0 && (
                  <div className="premium-divider" />
                )}
                <CoverChargeSection vendors={coverChargeVendors} />
              </div>
            )}
          </section>
        )}

        {/* ── FOOD DISCOUNTS + DRINK DISCOUNTS (vendor_offers) — separate,
            colour-coded sections using the Cover Charges card design. ───────── */}
        {(foodDeals.length > 0 || drinkDeals.length > 0) && (
          <section className="mb-12 space-y-10">
            <DiscountPanel
              deals={foodDeals}
              accent="darkyellow"
              title="Food Discounts"
              subtitle="Tap on any deal to view venue & book"
              Icon={Utensils}
            />
            {foodDeals.length > 0 && drinkDeals.length > 0 && (
              <div className="premium-divider" />
            )}
            <DiscountPanel
              deals={drinkDeals}
              accent="primary"
              title="Drink Discounts"
              subtitle="Tap on any deal to view venue & book"
              Icon={GlassWater}
            />
          </section>
        )}

        {/* â"€â"€ NOTIFY ME BANNER â€" Task 3 â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        <div className="mt-14 relative overflow-hidden rounded-2xl border border-primary/20">
          <img
            src="https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=1200&q=70"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/50" />
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 via-transparent to-primary/5 mix-blend-screen" />
          <div className="relative flex flex-col md:flex-row items-center justify-between gap-6 p-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-primary">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-primary">Discover exclusive offers &amp; deals every day.</p>
                <p className="text-sm text-muted-foreground">Subscribe to never miss a happy hour!</p>
              </div>
            </div>
            <button
              onClick={handleNotifyMe}
              className="inline-flex items-center gap-2 shrink-0 rounded-xl border border-primary text-primary font-semibold text-sm px-6 py-2.5 hover:bg-primary hover:text-primary-foreground transition-all"
            >
              <Bell className="h-4 w-4" /> Notify Me
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

