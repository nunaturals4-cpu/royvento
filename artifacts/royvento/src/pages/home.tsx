import { Link } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { useSelectedCity } from "@/components/LocationContext";
import {
  ArrowRight,
  Calendar,
  Sparkles,
  ShieldCheck,
  Crown,
  Flame,
  PartyPopper,
  Megaphone,
  Clock,
  GlassWater,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useListFeaturedEvents, useListVendorDrinkOffers, useGetMe } from "@workspace/api-client-react";
import type { VendorDrinkOffer, DrinkPlanSummary } from "@workspace/api-client-react";
import { EventCard } from "@/components/EventCard";
import { apiGet, formatINR } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { SEO } from "@/components/SEO";

interface PublicEvent {
  id: number;
  title: string;
  category: string;
  type: string;
  location: string;
  city: string;
  state: string;
  price: number;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  partnerName: string;
  popular: boolean;
}

interface Announcement {
  id: number;
  title: string;
  body: string;
  announceDate: string;
  announceTime: string;
  imageUrl?: string;
  vendorName: string;
  eventId: number;
  eventTitle: string;
}

function cityMatch(eventCity: string, userCity: string): boolean {
  return eventCity.toLowerCase().includes(userCity.toLowerCase());
}

function sortCityFirst<T extends { city: string }>(items: T[], userCity: string): T[] {
  if (!userCity) return items;
  return [
    ...items.filter((e) => cityMatch(e.city, userCity)),
    ...items.filter((e) => !cityMatch(e.city, userCity)),
  ];
}

const DEAL_TYPE_LABELS: Record<string, string> = {
  welcome: "Free Drink",
  unlimited: "Unlimited",
  ticket: "With Ticket",
  custom: "Discount",
};

const DEAL_TYPE_COLORS: Record<string, string> = {
  welcome: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  unlimited: "bg-primary/15 text-primary border-primary/25",
  ticket: "bg-violet-500/15 text-violet-400 border-violet-500/25",
  custom: "bg-amber-500/15 text-amber-400 border-amber-500/25",
};

function getPlanLabel(plan: DrinkPlanSummary): string {
  if (plan.type === "welcome") return "Free welcome drink";
  if (plan.type === "unlimited") return "Unlimited drinks";
  if (plan.type === "ticket") {
    const count = (plan.lineItems ?? []).filter((i) => i.name).length;
    return count > 0 ? `${count} item${count !== 1 ? "s" : ""} with ticket` : "Drinks with ticket";
  }
  return plan.productName || "Drinks discount";
}

function SectionHeader({
  icon,
  eyebrow,
  title,
  seeAllHref,
  seeAllLabel,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  seeAllHref?: string;
  seeAllLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between mb-8">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-primary mb-2.5 flex items-center gap-2">
          {icon}
          {eyebrow}
        </p>
        <h2 className="font-serif text-3xl md:text-5xl tracking-tight">{title}</h2>
      </div>
      {seeAllHref && (
        <Link
          href={seeAllHref}
          className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          {seeAllLabel ?? "See all"}
          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}
    </div>
  );
}

export function Home() {
  const { t } = useTranslation();
  const { data: me } = useGetMe();
  const isLoggedIn = !!(me?.user);
  const { data: featured = [] } = useListFeaturedEvents();
  const { data: drinkOffers = [] } = useListVendorDrinkOffers();
  const [popular, setPopular] = useState<PublicEvent[]>([]);
  const [pubs, setPubs] = useState<PublicEvent[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const { selectedCity: userCity } = useSelectedCity();

  useEffect(() => {
    apiGet<PublicEvent[]>("/api/events/popular").then(setPopular).catch(() => {});
    apiGet<PublicEvent[]>("/api/events?type=pub").then((r) => setPubs(r.slice(0, 6))).catch(() => {});
    apiGet<Announcement[]>("/api/announcements/recent").then(setAnnouncements).catch(() => {});
  }, []);

  const sortedPopular = useMemo(() => sortCityFirst(popular, userCity), [popular, userCity]);
  const sortedPubs = useMemo(() => sortCityFirst(pubs, userCity), [pubs, userCity]);

  const features = [
    { icon: ShieldCheck, title: t("home.feature1_title"), body: t("home.feature1_body") },
    { icon: PartyPopper, title: t("home.feature2_title"), body: t("home.feature2_body") },
    { icon: Sparkles, title: t("home.feature3_title"), body: t("home.feature3_body") },
  ];

  return (
    <div>
      <SEO
        title="Royvento — Book Pubs, Parties & Events Across India"
        description="Discover and book pubs, parties and events across India — rooftop bars in Bandra, microbreweries in Indiranagar, ladies' nights and verified offers. Instant table booking on Royvento."
        canonical="/"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Royvento",
            url: "https://royvento.com",
            logo: "https://royvento.com/favicon.svg",
            sameAs: [
              "https://www.instagram.com/royvento",
              "https://www.facebook.com/royvento",
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Royvento",
            url: "https://royvento.com",
            potentialAction: {
              "@type": "SearchAction",
              target: "https://royvento.com/explore?search={search_term_string}",
              "query-input": "required name=search_term_string",
            },
          },
        ]}
      />
      {/* Hero — full viewport */}
      <section className="relative overflow-hidden min-h-[100svh] flex items-center">
        <div className="absolute inset-0 -z-10">
          <img
            src="https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=2400&q=80"
            alt=""
            className="h-full w-full object-cover opacity-45"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/65 to-background" />
          <div className="absolute inset-0 hero-grid opacity-30" />
        </div>
        <div className="container mx-auto px-4 md:px-6 py-32 md:py-0 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full glass-card px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-white/80 mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {t("home.hero_eyebrow")}
            </div>
            <h1 className="font-serif text-6xl md:text-8xl leading-[1.02] tracking-tight">
              {t("home.hero_title_1")}<br />
              <span className="italic text-gradient-red">{t("home.hero_title_2")}</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-white/65 max-w-2xl leading-relaxed">
              {t("home.hero_subtitle")}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/pubs">
                <Button
                  size="lg"
                  className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground red-glow border-0 h-12 px-8 rounded-full text-base font-semibold transition-all hover:scale-[1.02]"
                >
                  {t("home.browse_pubs")} <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              {!isLoggedIn && (
                <Link href="/register">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 px-8 border-white/25 hover:bg-white/8 rounded-full text-base font-semibold transition-all"
                  >
                    {t("home.join_free")}
                  </Button>
                </Link>
              )}
            </div>

            {/* Stats */}
            <div className="mt-16 flex gap-10 flex-wrap">
              <div>
                <p className="stat-number text-4xl">200+</p>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mt-1.5">{t("home.verified_pubs")}</p>
              </div>
              <div className="w-px bg-white/10 self-stretch" />
              <div>
                <p className="stat-number text-4xl">15K</p>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mt-1.5">{t("home.tickets_booked")}</p>
              </div>
              <div className="w-px bg-white/10 self-stretch" />
              <div>
                <p className="stat-number text-4xl">4.9★</p>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mt-1.5">{t("home.avg_rating")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-40">
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/60">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-white/40 to-transparent" />
        </div>
      </section>

      {/* Trending / Popular section */}
      {popular.length > 0 && (
        <section className="container mx-auto px-4 md:px-6 py-12">
          <SectionHeader
            icon={<Flame className="h-3.5 w-3.5" />}
            eyebrow={t("home.trending_label")}
            title={t("home.trending_title")}
            seeAllHref="/explore"
            seeAllLabel={t("home.view_all_events")}
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {sortedPopular.slice(0, 8).map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        </section>
      )}

      {/* Drink Deals */}
      {drinkOffers.length > 0 && (
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4 md:px-6">
            <SectionHeader
              icon={<GlassWater className="h-3.5 w-3.5" />}
              eyebrow={t("pub_offers.deal_eyebrow")}
              title={t("events.drink_deals")}
              seeAllHref="/pubs"
              seeAllLabel={t("pub_offers.browse_pubs")}
            />

            <div className="flex gap-5 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scrollbar-none">
              {drinkOffers.map((offer: VendorDrinkOffer) => (
                <Link
                  key={offer.vendorId}
                  href={offer.pubEventId ? `/events/${offer.pubEventId}` : `/vendors/${offer.vendorId}`}
                  className="snap-start flex-shrink-0"
                >
                  <div className="rounded-2xl w-[300px] sm:w-[320px] flex flex-col group cursor-pointer border border-white/10 hover:border-primary/30 bg-zinc-900/90 transition-all duration-300 hover:shadow-[0_0_28px_rgba(220,38,38,0.15)] overflow-hidden">
                    {/* Venue header */}
                    <div className="px-5 pt-5 pb-4 flex items-start gap-3 border-b border-white/[0.07]">
                      <span className="flex-shrink-0 h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center mt-0.5">
                        <GlassWater className="h-4 w-4 text-primary" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-serif text-[1.15rem] leading-snug tracking-tight text-white line-clamp-2">
                          {offer.vendorName}
                        </h3>
                        <p className="text-[10px] text-white/35 uppercase tracking-wider mt-0.5">Drink Deals</p>
                      </div>
                    </div>
                    {/* Plan rows */}
                    <div className="p-4 flex flex-col gap-2.5 flex-1">
                      {offer.plans.slice(0, 3).map((plan: DrinkPlanSummary, i: number) => {
                        const showDays = plan.days && plan.days.length > 0 && plan.days.length < 7;
                        const showTime = plan.timeFrom && plan.timeTo;
                        return (
                          <div key={i} className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`flex-shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap ${
                                  DEAL_TYPE_COLORS[plan.type as keyof typeof DEAL_TYPE_COLORS] ??
                                  "bg-white/10 text-white/60 border-white/15"
                                }`}
                              >
                                {DEAL_TYPE_LABELS[plan.type] ?? plan.type}
                              </span>
                              <span className="text-xs text-white/65 flex-1 leading-snug truncate">
                                {getPlanLabel(plan)}
                              </span>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                  plan.gender === "female"
                                    ? "bg-rose-500/20 text-rose-300"
                                    : "bg-primary/20 text-primary"
                                }`}
                              >
                                {plan.gender === "female" ? t("pub_offers.gender_ladies") : t("pub_offers.gender_all")}
                              </span>
                            </div>
                            {(showDays || showTime) && (
                              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                {showDays && plan.days!.map((d) => (
                                  <span key={d} className="rounded-md bg-black/40 border border-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
                                    {d.slice(0, 3)}
                                  </span>
                                ))}
                                {showTime && (
                                  <span className="rounded-md bg-black/40 border border-white/15 px-2 py-0.5 text-[10px] font-semibold text-white flex items-center gap-1">
                                    <Clock className="h-2.5 w-2.5 shrink-0" />
                                    {plan.timeFrom}–{plan.timeTo}
                                  </span>
                                )}
                              </div>
                            )}
                            {plan.description && (
                              <p className="text-[9px] text-white/30 italic truncate">{plan.description}</p>
                            )}
                          </div>
                        );
                      })}
                      {offer.plans.length > 3 && (
                        <span className="text-xs text-white/30">
                          +{offer.plans.length - 3} more offer{offer.plans.length - 3 !== 1 ? "s" : ""}
                        </span>
                      )}
                      <div className="mt-auto pt-3 rounded-xl bg-primary/10 border border-primary/25 px-4 py-2.5 flex items-center justify-between group-hover:bg-primary/20 transition-colors">
                        <span className="text-sm font-semibold text-primary">
                          {offer.pubEventId ? t("pub_offers.book_now") : t("pub_offers.view_venue")}
                        </span>
                        <ArrowRight className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured events */}
      <section className="container mx-auto px-4 md:px-6 py-12">
        <SectionHeader
          icon={<Sparkles className="h-3.5 w-3.5" />}
          eyebrow={t("home.featured_label")}
          title={t("home.featured_title")}
          seeAllHref="/explore"
          seeAllLabel={t("home.view_all")}
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {featured.map((e) => <EventCard key={e.id} event={e as any} />)}
        </div>
      </section>

      {/* What's On — Announcements */}
      {announcements.length > 0 && (
        <section className="relative py-16 md:py-20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/15 to-black/30 pointer-events-none" />

          <div className="container mx-auto px-4 md:px-6 relative">
            <SectionHeader
              icon={<Megaphone className="h-3.5 w-3.5 text-amber-400" />}
              eyebrow={t("home.announcements_label")}
              title={t("home.announcements_title")}
            />

            <div className="flex gap-5 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scrollbar-none">
              {announcements.map((a) => {
                const cardInner = (
                  <div className="rounded-2xl border border-amber-400/15 bg-zinc-900/90 hover:bg-zinc-800/80 transition-colors w-[300px] sm:w-[320px] flex flex-col overflow-hidden h-full group">
                    {/* Image area */}
                    <div className="relative h-40 flex-shrink-0 bg-zinc-800 overflow-hidden">
                      {a.imageUrl ? (
                        <img
                          src={a.imageUrl}
                          alt={a.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-400/8 to-zinc-900">
                          <Megaphone className="h-10 w-10 text-amber-400/25" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      {/* Vendor badge pinned to top-left of image */}
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/55 backdrop-blur-sm border border-amber-400/30 rounded-full px-2.5 py-1">
                        <Megaphone className="h-3 w-3 text-amber-400 flex-shrink-0" />
                        <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider truncate max-w-[110px]">{a.vendorName}</span>
                      </div>
                    </div>

                    {/* Text body */}
                    <div className="p-5 flex flex-col gap-2.5 flex-1">
                      <h3 className="font-serif text-xl leading-snug tracking-tight text-white">{a.title}</h3>
                      {a.body && <p className="text-sm text-white/50 leading-relaxed line-clamp-2 flex-1">{a.body}</p>}
                      <div className="flex items-center gap-4 text-xs text-amber-400/80 pt-2 border-t border-white/8">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-amber-400" />
                          {new Date(a.announceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        {a.announceTime && (
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-amber-400" />
                            {a.announceTime}
                          </span>
                        )}
                      </div>
                      {a.eventId && (
                        <div className="mt-auto rounded-lg bg-primary/10 border border-primary/25 px-4 py-2 flex items-center justify-between group-hover:bg-primary/20 transition-colors">
                          <span className="text-sm font-semibold text-primary">{t("pub_offers.book_now")}</span>
                          <ArrowRight className="h-4 w-4 text-primary" />
                        </div>
                      )}
                    </div>
                  </div>
                );
                return a.eventId ? (
                  <Link key={a.id} href={`/events/${a.eventId}`} className="snap-start flex-shrink-0 cursor-pointer">{cardInner}</Link>
                ) : (
                  <div key={a.id} className="snap-start flex-shrink-0">{cardInner}</div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Pubs — Top Pubs & Clubs */}
      {sortedPubs.length > 0 && (
        <section className="container mx-auto px-4 md:px-6 py-12">
          <SectionHeader
            icon={<PartyPopper className="h-3.5 w-3.5" />}
            eyebrow={t("home.pubs_label")}
            title={t("home.pubs_title")}
            seeAllHref="/pubs"
            seeAllLabel={t("home.view_all_pubs")}
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {sortedPubs.map((e) => <EventCard key={e.id} event={e} hidePubBadge />)}
          </div>
        </section>
      )}

      {/* Value props */}
      <section className="container mx-auto px-4 md:px-6 py-20">
        <div className="grid md:grid-cols-3 gap-5">
          {features.map((f) => (
            <div key={f.title} className="rounded-3xl glass-card p-7 lift-3d border border-white/6">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center mb-5 red-ring">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-2xl tracking-tight mb-2">{f.title}</h3>
              <p className="text-sm text-white/60 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA — Premium */}
      <section className="container mx-auto px-4 md:px-6 py-24">
        <div className="relative rounded-[2rem] overflow-hidden glass-card-strong red-glow p-10 md:p-16 border border-primary/20 text-center">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-80 w-[32rem] max-w-full rounded-full bg-primary/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 h-72 w-[28rem] max-w-full rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="relative mx-auto max-w-3xl flex flex-col items-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/20 border border-primary/40 px-3 py-1 text-xs uppercase tracking-wider text-primary mb-6">
              <Crown className="h-3.5 w-3.5" /> {t("home.premium_badge")}
            </div>
            <h2 className="font-serif text-3xl md:text-5xl tracking-tight italic leading-tight">
              {t("home.premium_heading")}
            </h2>
            <p className="mt-5 text-white/70 leading-relaxed md:text-lg">
              {t("home.premium_sub")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
