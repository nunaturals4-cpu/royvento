import { Link } from "wouter";
import { useEffect, useState } from "react";
import { ArrowRight, Calendar, Clock, GlassWater, Megaphone, Star, Ticket, Wine } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { useListVendorDrinkOffers } from "@workspace/api-client-react";
import type { VendorDrinkOffer, DrinkPlanSummary } from "@workspace/api-client-react";

interface Announcement {
  id: number;
  title: string;
  body: string;
  announceDate: string;
  announceTime: string;
  vendorName: string;
  eventId: number;
  vendorId: number;
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
  if (type === "unlimited") return <GlassWater className="h-3 w-3 text-primary" />;
  if (type === "ticket") return <Ticket className="h-3 w-3 text-primary" />;
  return <Star className="h-3 w-3 text-primary" />;
}

export function PubOffers() {
  const { t } = useTranslation();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const { data: drinkOffers = [] } = useListVendorDrinkOffers();

  useEffect(() => {
    apiGet<Announcement[]>("/api/announcements/recent").then(setAnnouncements).catch(() => {});
  }, []);

  const hasDeals = (drinkOffers as VendorDrinkOffer[]).length > 0;
  const hasAnnouncements = announcements.length > 0;

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <header className="max-w-3xl mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-3 accent-underline inline-flex items-center gap-2">
          <Wine className="h-3.5 w-3.5" /> {t("nav.pub_offers")}
        </p>
        <h1 className="font-serif text-4xl md:text-6xl tracking-tight mt-3">Deals & Announcements</h1>
        <p className="mt-4 text-white/60 leading-relaxed">
          Exclusive drink deals and the latest news straight from our partner venues.
        </p>
      </header>

      {!hasDeals && !hasAnnouncements && (
        <div className="rounded-3xl glass-card p-16 text-center">
          <p className="font-serif text-2xl mb-2 text-muted-foreground">{t("common.loading")}</p>
        </div>
      )}

      {/* Drink Deals */}
      {hasDeals && (
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center gap-2">
              <GlassWater className="h-4 w-4 text-primary" />
              <span className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">Drink Deals</span>
            </div>
            <div className="flex-1 h-px bg-white/10" />
            <Link href="/pubs">
              <span className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                Browse pubs <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          </div>
          <div className="flex gap-5 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scrollbar-none md:grid md:grid-cols-3 lg:grid-cols-4 md:overflow-visible">
            {(drinkOffers as VendorDrinkOffer[]).map((offer: VendorDrinkOffer) => (
              <Link
                key={offer.vendorId}
                href={offer.pubEventId ? `/events/${offer.pubEventId}` : `/vendors/${offer.vendorId}`}
                className="snap-start flex-shrink-0 md:flex-shrink"
              >
                <div className="glass-card rounded-2xl overflow-hidden w-64 md:w-auto hover:bg-white/[0.06] transition-all cursor-pointer group h-full flex flex-col">
                  <div className="h-36 bg-white/5 relative overflow-hidden">
                    {offer.coverImageUrl ? (
                      <img
                        src={offer.coverImageUrl}
                        alt={offer.vendorName}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-transparent">
                        <GlassWater className="h-10 w-10 text-white/20" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                    <div className="absolute bottom-2.5 left-3.5 right-3.5">
                      <h3 className="font-serif text-base font-semibold text-white drop-shadow leading-tight truncate">
                        {offer.vendorName}
                      </h3>
                    </div>
                  </div>
                  <div className="p-3.5 flex flex-col gap-2.5 flex-1">
                    <div className="flex flex-col gap-2 flex-1">
                      {offer.plans.slice(0, 2).map((plan: DrinkPlanSummary, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="flex-shrink-0 h-5 w-5 rounded-md bg-primary/15 flex items-center justify-center">
                            <PlanIcon type={plan.type} />
                          </span>
                          <span className="text-xs text-white/85 flex-1 leading-snug truncate">
                            {getPlanLabel(plan)}
                          </span>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${plan.gender === "female" ? "bg-rose-500/20 text-rose-300" : "bg-primary/20 text-primary"}`}>
                            {plan.gender === "female" ? "Ladies" : "All"}
                          </span>
                        </div>
                      ))}
                      {offer.plans.length > 2 && (
                        <span className="text-[10px] text-white/40 pl-7">
                          +{offer.plans.length - 2} more
                        </span>
                      )}
                    </div>
                    <div className="rounded-lg bg-primary/10 border border-primary/25 px-3 py-1.5 flex items-center justify-between group-hover:bg-primary/20 transition-colors mt-auto">
                      <span className="text-xs font-semibold text-primary">
                        {offer.pubEventId ? "Book now" : "View venue"}
                      </span>
                      <ArrowRight className="h-3 w-3 text-primary" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* What's On — Announcements */}
      {hasAnnouncements && (
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              <span className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">What's On</span>
            </div>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <div className="flex gap-5 overflow-x-auto pb-3 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scrollbar-none md:grid md:grid-cols-2 lg:grid-cols-3 md:overflow-visible">
            {announcements.map((a) => (
              <Link key={a.id} href={a.eventId ? `/events/${a.eventId}` : `/vendors/${a.vendorId}`} className="snap-start flex-shrink-0 md:flex-shrink">
                <div className="glass-card rounded-2xl p-5 cursor-pointer hover:bg-white/5 transition-colors w-64 md:w-auto">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-lg bg-primary/20 text-primary flex items-center justify-center flex-shrink-0">
                      <Megaphone className="h-3 w-3" />
                    </div>
                    <span className="text-[10px] font-medium text-primary/90 uppercase tracking-wider truncate">{a.vendorName}</span>
                  </div>
                  <h3 className="font-serif text-base leading-snug tracking-tight mb-1.5 line-clamp-1">{a.title}</h3>
                  <p className="text-xs text-white/55 leading-relaxed line-clamp-2 mb-3">{a.body}</p>
                  <div className="flex items-center gap-3 text-[10px] text-white/40">
                    {a.announceDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(a.announceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    )}
                    {a.announceTime && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {a.announceTime}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
