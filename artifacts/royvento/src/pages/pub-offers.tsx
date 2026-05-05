import { Link } from "wouter";
import { useEffect, useState } from "react";
import {
  ArrowRight, Calendar, Clock, GlassWater, Megaphone,
} from "lucide-react";
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
  imageUrl?: string;
  genre: string;
  eventType: string;
}

const ANN_GENRES = ["EDM", "Hip Hop", "Bollywood", "Rock", "Pop", "Jazz", "Retro", "House", "Techno", "R&B"];
const ANN_EVENT_TYPES = ["Ladies Night", "DJ Night", "Live Music", "Karaoke", "Open Bar", "Theme Party", "Open Mic", "Brunch", "Pool Party", "Sufi Night"];
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

export function PubOffers() {
  const { t } = useTranslation();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const { data: drinkOffers = [] } = useListVendorDrinkOffers();

  const [annGenreFilter, setAnnGenreFilter] = useState("");
  const [annEventTypeFilter, setAnnEventTypeFilter] = useState("");
  const [dealTypeFilter, setDealTypeFilter] = useState("");
  const [dealGenderFilter, setDealGenderFilter] = useState("");

  useEffect(() => {
    apiGet<Announcement[]>("/api/announcements/recent").then(setAnnouncements).catch(() => {});
  }, []);

  const filteredAnnouncements = announcements.filter((a) => {
    if (annGenreFilter && a.genre !== annGenreFilter) return false;
    if (annEventTypeFilter && a.eventType !== annEventTypeFilter) return false;
    return true;
  });

  const filteredDeals = (drinkOffers as VendorDrinkOffer[]).filter((offer) => {
    if (!dealTypeFilter && !dealGenderFilter) return true;
    return offer.plans.some((p) => {
      const typeMatch = !dealTypeFilter || p.type === dealTypeFilter;
      const genderMatch =
        !dealGenderFilter ||
        (dealGenderFilter === "female" ? p.gender === "female" : p.gender !== "female");
      return typeMatch && genderMatch;
    });
  });

  const hasDeals = (drinkOffers as VendorDrinkOffer[]).length > 0;
  const hasAnnouncements = announcements.length > 0;

  return (
    <div className="pb-14">
      {/* Page header */}
      <header className="container mx-auto px-4 md:px-6 py-14 max-w-3xl">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-3 accent-underline inline-flex items-center gap-2">
          <GlassWater className="h-3.5 w-3.5" /> Hot Deals
        </p>
        <h1 className="font-serif text-4xl md:text-6xl tracking-tight mt-3">{t("pub_offers.title")}</h1>
        <p className="mt-4 text-white/60 leading-relaxed max-w-xl">{t("pub_offers.subtitle")}</p>
      </header>

      {!hasDeals && !hasAnnouncements && (
        <div className="container mx-auto px-4 md:px-6">
          <div className="rounded-3xl glass-card p-16 text-center">
            <p className="font-serif text-2xl mb-2 text-muted-foreground">{t("common.loading")}</p>
          </div>
        </div>
      )}

      {/* Drink Deals */}
      {hasDeals && (
        <div className="container mx-auto px-4 md:px-6">
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <GlassWater className="h-4 w-4 text-primary" />
                <span className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">
                  {t("pub_offers.drink_deals")}
                </span>
              </div>
              <div className="flex-1 h-px bg-white/10" />
              <Link href="/pubs">
                <span className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  {t("pub_offers.browse_pubs")} <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            </div>

            {/* Filters */}
            <div className="mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("pub_offers.filter_deal_type")}</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {(["", "welcome", "unlimited", "ticket", "custom"] as string[]).map((dt) => (
                  <button
                    key={dt || "all"}
                    type="button"
                    onClick={() => setDealTypeFilter(dt === dealTypeFilter ? "" : dt)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      dealTypeFilter === dt
                        ? "bg-primary/20 border-primary text-primary"
                        : "border-white/10 text-white/40 hover:border-white/25 hover:text-white/60"
                    }`}
                  >
                    {dt ? (DEAL_TYPE_LABELS[dt] ?? dt) : t("pub_offers.filter_all")}
                  </button>
                ))}
              </div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("pub_offers.filter_for")}</p>
              <div className="flex flex-wrap gap-2 mb-6">
                {[
                  { key: "", label: t("pub_offers.filter_everyone") },
                  { key: "female", label: t("pub_offers.filter_ladies") },
                  { key: "other", label: t("pub_offers.filter_mixed_all") },
                ].map((opt) => (
                  <button
                    key={opt.key || "all"}
                    type="button"
                    onClick={() => setDealGenderFilter(opt.key === dealGenderFilter ? "" : opt.key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      dealGenderFilter === opt.key
                        ? "bg-primary/20 border-primary text-primary"
                        : "border-white/10 text-white/40 hover:border-white/25 hover:text-white/60"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No deals match these filters.</p>
            ) : (
              <div className="flex gap-5 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scrollbar-none md:grid md:grid-cols-3 lg:grid-cols-4 md:overflow-visible">
                {filteredDeals.map((offer: VendorDrinkOffer) => (
                  <Link
                    key={offer.vendorId}
                    href={offer.pubEventId ? `/events/${offer.pubEventId}` : `/vendors/${offer.vendorId}`}
                    className="snap-start flex-shrink-0 md:flex-shrink"
                  >
                    <div className="rounded-2xl w-64 md:w-auto flex flex-col group cursor-pointer border border-white/10 hover:border-primary/30 bg-zinc-900/90 transition-all duration-300 hover:shadow-[0_0_20px_rgba(220,38,38,0.12)] overflow-hidden h-full">
                      {/* Venue header */}
                      <div className="px-4 pt-4 pb-3 flex items-start gap-2.5 border-b border-white/[0.07]">
                        <span className="flex-shrink-0 h-8 w-8 rounded-xl bg-primary/15 flex items-center justify-center mt-0.5">
                          <GlassWater className="h-3.5 w-3.5 text-primary" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-serif text-base leading-snug tracking-tight text-white line-clamp-2">
                            {offer.vendorName}
                          </h3>
                          <p className="text-[9px] text-white/35 uppercase tracking-wider mt-0.5">{t("pub_offers.drink_deals")}</p>
                        </div>
                      </div>
                      {/* Plan rows */}
                      <div className="px-3.5 pb-3.5 pt-3 flex flex-col gap-2 flex-1">
                        {offer.plans.slice(0, 3).map((plan: DrinkPlanSummary, i: number) => {
                          const showDays = plan.days && plan.days.length > 0 && plan.days.length < 7;
                          const showTime = plan.timeFrom && plan.timeTo;
                          return (
                            <div key={i} className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`flex-shrink-0 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border whitespace-nowrap ${
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
                                  className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                    plan.gender === "female"
                                      ? "bg-rose-500/20 text-rose-300"
                                      : "bg-primary/20 text-primary"
                                  }`}
                                >
                                  {plan.gender === "female" ? t("pub_offers.gender_ladies") : t("pub_offers.gender_all")}
                                </span>
                              </div>
                              {(showDays || showTime) && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {showDays && (
                                    <span className="text-[8px] text-white/35 flex items-center gap-1">
                                      <Clock className="h-2.5 w-2.5 opacity-50" />
                                      {plan.days!.map((d) => d.slice(0, 3)).join(" · ")}
                                    </span>
                                  )}
                                  {showTime && (
                                    <span className="text-[8px] text-white/35">
                                      {showDays ? "· " : ""}{plan.timeFrom}–{plan.timeTo}
                                    </span>
                                  )}
                                </div>
                              )}
                              {plan.description && (
                                <p className="text-[8px] text-white/30 italic truncate">{plan.description}</p>
                              )}
                            </div>
                          );
                        })}
                        {offer.plans.length > 3 && (
                          <span className="text-[10px] text-white/40">
                            +{offer.plans.length - 3} more
                          </span>
                        )}
                        <div className="rounded-lg bg-primary/10 border border-primary/25 px-3 py-1.5 flex items-center justify-between group-hover:bg-primary/20 transition-colors mt-auto">
                          <span className="text-xs font-semibold text-primary">
                            {offer.pubEventId ? t("pub_offers.book_now") : t("pub_offers.view_venue")}
                          </span>
                          <ArrowRight className="h-3 w-3 text-primary" />
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* What's On */}
      {hasAnnouncements && (
        <div className="container mx-auto px-4 md:px-6 mt-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-amber-400" />
              <span className="text-xs uppercase tracking-[0.2em] text-amber-400 font-semibold">
                {t("pub_offers.whats_on")}
              </span>
            </div>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Filters */}
          <div className="mb-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Genre</p>
              <div className="flex flex-wrap gap-2">
                {["", ...ANN_GENRES].map((g) => (
                  <button
                    key={g || "all"}
                    type="button"
                    onClick={() => setAnnGenreFilter(g === annGenreFilter ? "" : g)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      annGenreFilter === g
                        ? "bg-amber-400/20 border-amber-400 text-amber-400"
                        : "border-white/10 text-white/40 hover:border-white/25 hover:text-white/60"
                    }`}
                  >
                    {g || t("pub_offers.filter_all")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Event Type
              </p>
              <div className="flex flex-wrap gap-2">
                {["", ...ANN_EVENT_TYPES].map((et) => (
                  <button
                    key={et || "all"}
                    type="button"
                    onClick={() => setAnnEventTypeFilter(et === annEventTypeFilter ? "" : et)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      annEventTypeFilter === et
                        ? "bg-amber-400/20 border-amber-400 text-amber-400"
                        : "border-white/10 text-white/40 hover:border-white/25 hover:text-white/60"
                    }`}
                  >
                    {et || t("pub_offers.filter_all")}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredAnnouncements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No announcements match these filters.</p>
          ) : (
            <div className="flex gap-5 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scrollbar-none">
              {filteredAnnouncements.map((a) => {
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
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/55 backdrop-blur-sm border border-amber-400/30 rounded-full px-2.5 py-1">
                        <Megaphone className="h-3 w-3 text-amber-400 flex-shrink-0" />
                        <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider truncate max-w-[110px]">
                          {a.vendorName}
                        </span>
                      </div>
                    </div>
                    {/* Text body */}
                    <div className="p-5 flex flex-col gap-2.5 flex-1">
                      <h3 className="font-serif text-xl leading-snug tracking-tight text-white">{a.title}</h3>
                      {a.body && (
                        <p className="text-sm text-white/50 leading-relaxed line-clamp-2 flex-1">{a.body}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-amber-400/80 pt-2 border-t border-white/8">
                        {a.announceDate && (
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-amber-400" />
                            {new Date(a.announceDate).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        )}
                        {a.announceTime && (
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-amber-400" />
                            {a.announceTime}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
                return a.eventId ? (
                  <Link
                    key={a.id}
                    href={`/events/${a.eventId}`}
                    className="snap-start flex-shrink-0 cursor-pointer"
                  >
                    {cardInner}
                  </Link>
                ) : (
                  <div key={a.id} className="snap-start flex-shrink-0">
                    {cardInner}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
