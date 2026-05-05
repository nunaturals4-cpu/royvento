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
  Ticket,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useListFeaturedEvents, useListVendorDrinkOffers, useGetMe } from "@workspace/api-client-react";
import type { VendorDrinkOffer, DrinkPlanSummary } from "@workspace/api-client-react";
import { EventCard } from "@/components/EventCard";
import { apiGet, formatINR } from "@/lib/api";
import { useTranslation } from "react-i18next";

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

function getPlanLabel(plan: DrinkPlanSummary): string {
  if (plan.type === "welcome") return "Free welcome drink";
  if (plan.type === "unlimited") return "Unlimited drinks";
  if (plan.type === "ticket") {
    const count = (plan.lineItems ?? []).filter((i) => i.name).length;
    return count > 0 ? `${count} item${count !== 1 ? "s" : ""} with ticket` : "Drinks with ticket";
  }
  return plan.productName || "Drinks discount";
}

function PlanIcon({ type }: { type: string }) {
  if (type === "unlimited") return <GlassWater className="h-3.5 w-3.5 text-primary" />;
  if (type === "ticket") return <Ticket className="h-3.5 w-3.5 text-primary" />;
  return <Star className="h-3.5 w-3.5 text-primary" />;
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
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <img
            src="https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=2400&q=80"
            alt=""
            className="h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-background" />
          <div className="absolute inset-0 hero-grid opacity-40" />
        </div>
        <div className="container mx-auto px-4 md:px-6 py-32 md:py-44 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full glass-card px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-white/80 mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {t("home.hero_eyebrow")}
            </div>
            <h1 className="font-serif text-5xl md:text-7xl leading-[1.05] tracking-tight">
              {t("home.hero_title_1")}<br />
              <span className="italic text-gradient-red">{t("home.hero_title_2")}</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-white/70 max-w-2xl leading-relaxed">
              {t("home.hero_subtitle")}
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/pubs">
                <Button size="lg" className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground red-glow border-0 h-12 px-7">
                  {t("home.browse_pubs")} <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              {!isLoggedIn && (
                <Link href="/register">
                  <Button size="lg" variant="outline" className="h-12 px-7 border-white/20 hover:bg-white/5">
                    {t("home.join_free")}
                  </Button>
                </Link>
              )}
            </div>

            {/* Stats */}
            <div className="mt-14 grid grid-cols-3 gap-6 max-w-xl">
              <div>
                <p className="stat-number text-3xl">200+</p>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{t("home.verified_pubs")}</p>
              </div>
              <div>
                <p className="stat-number text-3xl">15K</p>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{t("home.tickets_booked")}</p>
              </div>
              <div>
                <p className="stat-number text-3xl">4.9★</p>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{t("home.avg_rating")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Drink Deals */}
      {drinkOffers.length > 0 && (
        <section className="relative py-16 md:py-20 overflow-hidden">
          {/* Dark background band */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/50 pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_50%,rgba(220,38,38,0.07),transparent)] pointer-events-none" />

          <div className="container mx-auto px-4 md:px-6 relative">
            {/* Section header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-primary mb-3 flex items-center gap-2">
                  <GlassWater className="h-3.5 w-3.5" /> Exclusive Offers
                </p>
                <h2 className="font-serif text-4xl md:text-6xl tracking-tight leading-none">
                  Drink Deals
                  <span className="block italic text-gradient-red">at Our Partners</span>
                </h2>
                <div className="mt-3 h-px w-24 bg-gradient-to-r from-primary to-transparent" />
                <p className="mt-4 text-white/55 text-sm md:text-base max-w-sm leading-relaxed">
                  Exclusive drink deals — book before they're gone
                </p>
              </div>
              <Link href="/pubs">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-primary/40 text-primary hover:bg-primary/10 rounded-full px-5"
                >
                  Browse pubs <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>

            {/* Cards track — peek of next card invites scrolling */}
            <div className="flex gap-5 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scrollbar-none">
              {drinkOffers.map((offer: VendorDrinkOffer) => (
                <Link
                  key={offer.vendorId}
                  href={offer.pubEventId ? `/events/${offer.pubEventId}` : `/vendors/${offer.vendorId}`}
                  className="snap-start flex-shrink-0"
                >
                  <div className="glass-card rounded-2xl overflow-hidden w-72 sm:w-80 hover:bg-white/[0.06] transition-all cursor-pointer lift-3d h-full flex flex-col group">
                    {/* Image — taller with zoom on hover */}
                    <div className="h-44 bg-white/5 relative overflow-hidden">
                      {offer.coverImageUrl ? (
                        <img
                          src={offer.coverImageUrl}
                          alt={offer.vendorName}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-transparent">
                          <GlassWater className="h-12 w-12 text-white/20" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                      <div className="absolute bottom-3 left-4 right-4">
                        <h3 className="font-serif text-xl font-semibold tracking-tight text-white drop-shadow leading-tight">
                          {offer.vendorName}
                        </h3>
                      </div>
                    </div>

                    {/* Plan rows */}
                    <div className="p-4 flex flex-col gap-3 flex-1">
                      <div className="flex flex-col gap-2.5 flex-1">
                        {offer.plans.slice(0, 2).map((plan: DrinkPlanSummary, i: number) => (
                          <div key={i} className="flex items-center gap-2.5">
                            <span className="flex-shrink-0 h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center">
                              <PlanIcon type={plan.type} />
                            </span>
                            <span className="text-sm text-white/90 flex-1 leading-snug">
                              {getPlanLabel(plan)}
                            </span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${plan.gender === "female" ? "bg-rose-500/20 text-rose-300" : "bg-primary/20 text-primary"}`}>
                              {plan.gender === "female" ? "Ladies" : "All"}
                            </span>
                          </div>
                        ))}
                        {offer.plans.length > 2 && (
                          <span className="text-xs text-white/45 pl-9">
                            +{offer.plans.length - 2} more offer{offer.plans.length - 2 !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>

                      {/* Full-width CTA strip */}
                      <div className="mt-1 rounded-xl bg-primary/10 border border-primary/25 px-4 py-2.5 flex items-center justify-between group-hover:bg-primary/20 transition-colors">
                        <span className="text-sm font-semibold text-primary">
                          {offer.pubEventId ? "Book now" : "View venue"}
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

      {/* What's On — Announcements */}
      {announcements.length > 0 && (
        <section className="relative py-16 md:py-20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/40 pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_50%,rgba(212,175,55,0.05),transparent)] pointer-events-none" />

          <div className="container mx-auto px-4 md:px-6 relative">
            <div className="mb-10">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-400 mb-3 flex items-center gap-2">
                <Megaphone className="h-3.5 w-3.5" /> {t("home.announcements_label")}
              </p>
              <h2 className="font-serif text-4xl md:text-6xl tracking-tight leading-none">
                {t("home.announcements_title")}
              </h2>
              <div className="mt-3 h-px w-24 bg-gradient-to-r from-amber-400/60 to-transparent" />
            </div>

            <div className="flex gap-5 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scrollbar-none">
              {announcements.map((a) => {
                const cardInner = (
                  <div className="rounded-2xl border border-white/10 bg-zinc-900/90 p-5 hover:bg-zinc-800/90 transition-colors w-72 sm:w-80 flex flex-col gap-3 h-full">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-400/20 flex items-center justify-center flex-shrink-0">
                        <Megaphone className="h-3.5 w-3.5 text-amber-400" />
                      </div>
                      <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider truncate">{a.vendorName}</span>
                    </div>
                    <h3 className="font-serif text-lg leading-snug tracking-tight">{a.title}</h3>
                    <p className="text-sm text-white/55 leading-relaxed line-clamp-2 flex-1">{a.body}</p>
                    <div className="flex items-center gap-4 text-xs text-white/40 pt-1 border-t border-white/8">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(a.announceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      {a.announceTime && (
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {a.announceTime}
                        </span>
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

      {/* Value props */}
      <section className="container mx-auto px-4 md:px-6 py-24">
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="rounded-3xl glass-card p-7 lift-3d">
              <div className="w-12 h-12 rounded-xl bg-primary/20 text-primary flex items-center justify-center mb-5 red-ring">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-2xl tracking-tight mb-2">{f.title}</h3>
              <p className="text-sm text-white/60 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Popular section */}
      {popular.length > 0 && (
        <section className="container mx-auto px-4 md:px-6 py-12">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2 flex items-center gap-2">
                <Flame className="h-3.5 w-3.5" /> {t("home.trending_label")}
              </p>
              <h2 className="font-serif text-3xl md:text-5xl tracking-tight">{t("home.trending_title")}</h2>
            </div>
            <Link href="/explore" className="text-sm text-white/60 hover:text-white hidden md:flex items-center gap-1">
              {t("home.view_all_events")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sortedPopular.slice(0, 8).map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        </section>
      )}


      {/* Featured events */}
      <section className="container mx-auto px-4 md:px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" /> {t("home.featured_label")}
            </p>
            <h2 className="font-serif text-3xl md:text-5xl tracking-tight">{t("home.featured_title")}</h2>
          </div>
          <Link href="/explore" className="text-sm text-white/60 hover:text-white hidden md:flex items-center gap-1">
            {t("home.view_all")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.map((e) => <EventCard key={e.id} event={e as any} />)}
        </div>
      </section>

      {/* Pubs */}
      {sortedPubs.length > 0 && (
        <section className="container mx-auto px-4 md:px-6 py-16">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2 flex items-center gap-2">
                <PartyPopper className="h-3.5 w-3.5" /> {t("home.pubs_label")}
              </p>
              <h2 className="font-serif text-3xl md:text-5xl tracking-tight">{t("home.pubs_title")}</h2>
            </div>
            <Link href="/pubs" className="text-sm text-white/60 hover:text-white hidden md:flex items-center gap-1">
              {t("home.view_all_pubs")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedPubs.map((e) => <EventCard key={e.id} event={e} hidePubBadge />)}
          </div>
        </section>
      )}

      {/* CTA — Premium */}
      <section className="container mx-auto px-4 md:px-6 py-24">
        <div className="relative rounded-[2rem] overflow-hidden glass-card-strong red-glow p-10 md:p-16 grid md:grid-cols-[1.4fr_1fr] gap-10 items-center">
          <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-primary/30 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/20 border border-primary/40 px-3 py-1 text-xs uppercase tracking-wider text-primary mb-5">
              <Crown className="h-3.5 w-3.5" /> {t("home.premium_badge")}
            </div>
            <h2 className="font-serif text-3xl md:text-5xl tracking-tight italic leading-tight">
              {t("home.premium_heading")}
            </h2>
            <p className="mt-5 text-white/70 max-w-xl leading-relaxed">
              {t("home.premium_sub")}
            </p>
          </div>
          <div className="relative flex flex-col gap-3">
            <Link href="/subscription">
              <Button size="lg" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground border-0 h-12">
                {t("profile.subscription_premium")}
              </Button>
            </Link>
            <Link href="/dashboard/become-vendor">
              <Button size="lg" variant="outline" className="w-full border-white/20 hover:bg-white/5 h-12">
                {t("profile.become_partner")}
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
