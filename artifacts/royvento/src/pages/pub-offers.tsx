import { Link, useLocation } from "wouter";
import { useState, useCallback, useEffect } from "react";
import { SEO } from "@/components/SEO";
import {
  ArrowRight, Bell, ChevronLeft,
  Clock, GlassWater, Tag, Percent, RotateCcw, Gift,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { useListVendorDrinkOffers, useGetMe } from "@workspace/api-client-react";
import type { VendorDrinkOffer } from "@workspace/api-client-react";
import { FreeDrinkSection, TicketSection, CoverChargeSection, splitVendorsByPlanType } from "@/components/DrinkDealCards";
import { useToast } from "@/hooks/use-toast";

interface AllDrinkDeal {
  id: number;
  vendorId: number;
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

        {/* ── HAPPY HOUR & DRINK DEALS (vendor_offers) ─────────── */}
        {filteredDeals.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-amber-400" />
                <span className="text-xs uppercase tracking-[0.22em] text-amber-400 font-semibold">Happy Hour &amp; Drink Deals</span>
                {dayFilter && (
                  <span className="text-xs text-white/50 ml-1">— {DAYS_OF_WEEK.find(d => d.key === dayFilter)?.label}</span>
                )}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDeals.map((deal) => {
                const badgeText =
                  deal.discountType === "percent" ? `${deal.discountValue}% OFF` :
                  deal.discountType === "fixed" ? `₹${deal.discountValue} FLAT` :
                  deal.discountType === "bogo" ? "BUY 1 GET 1" :
                  deal.freeItemName ? `FREE ${deal.freeItemName.toUpperCase()}` : "FREE ITEM";
                const BadgeIcon =
                  deal.discountType === "percent" ? Percent :
                  deal.discountType === "bogo" ? RotateCcw :
                  deal.discountType === "free_item" ? Gift : Tag;
                const daysLabel = deal.days.length === 0 ? "Every Day" :
                  deal.days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(", ");
                const timeLabel = deal.timeFrom && deal.timeTo
                  ? `${deal.timeFrom} – ${deal.timeTo}`
                  : deal.timeFrom || "";
                // Prefer the offer's own deal image; fall back to the venue cover.
                const dealImg = deal.imageUrl || deal.vendorCoverImage;
                return (
                  <Link key={deal.id} href={`/vendors/${deal.vendorId}`}>
                    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111] hover:border-amber-400/30 transition-all cursor-pointer">
                      {dealImg && (
                        <div className="relative h-36 overflow-hidden">
                          <img
                            src={dealImg}
                            alt={deal.vendorName}
                            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 border border-amber-400/40 px-3 py-1 text-[11px] font-bold text-amber-300">
                            <BadgeIcon className="h-3 w-3" />{badgeText}
                          </span>
                        </div>
                      )}
                      <div className="p-4">
                        <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1">{deal.vendorName}</p>
                        <h3 className="font-semibold text-white leading-snug mb-2">{deal.title}</h3>
                        {deal.description && (
                          <p className="text-xs text-white/55 line-clamp-2 mb-3">{deal.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1 text-[10px] text-white/40 bg-white/5 rounded-full px-2.5 py-1">
                            <Clock className="h-3 w-3" />{daysLabel}
                            {timeLabel && ` · ${timeLabel}`}
                          </span>
                          {deal.vendorCity && (
                            <span className="text-[10px] text-white/40 bg-white/5 rounded-full px-2.5 py-1">{deal.vendorCity}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
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

