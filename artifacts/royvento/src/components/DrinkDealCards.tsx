import { Link } from "wouter";
import { ArrowRight, Clock, Wine, Ticket } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { VendorDrinkOffer, DrinkPlanSummary } from "@workspace/api-client-react";

export type VendorWithPlans = { offer: VendorDrinkOffer; plans: DrinkPlanSummary[] };

function getPlanLabel(plan: DrinkPlanSummary): string {
  if (plan.type === "welcome") return "Free welcome drink";
  if (plan.type === "unlimited") return "Unlimited drinks";
  if (plan.type === "ticket") {
    const count = (plan.lineItems ?? []).filter((i) => i.name).length;
    return count > 0 ? `${count} item${count !== 1 ? "s" : ""} with ticket` : "Drinks with ticket";
  }
  return plan.productName || "Drinks discount";
}

export function FreeDrinkCard({ offer, plans }: VendorWithPlans) {
  const { t } = useTranslation();
  return (
    <Link
      href={offer.pubEventId ? `/events/${offer.pubEventId}?book=1` : `/vendors/${offer.vendorId}`}
      className="snap-start flex-shrink-0 md:flex-shrink block group"
    >
      <div className="relative w-[300px] md:w-auto rounded-2xl overflow-hidden flex flex-col h-full
        bg-gradient-to-b from-zinc-900 to-[#0c0c0e]
        border border-white/[0.07]
        transition-all duration-300
        hover:border-primary/25
        hover:shadow-[0_8px_40px_rgba(220,38,38,0.10)]">

        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" />

        <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mt-0.5">
              <Wine className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-serif text-base leading-snug text-white line-clamp-2">
                {offer.vendorName}
              </h3>
              <p className="text-[10px] text-white/40 uppercase tracking-[0.18em] mt-0.5">Free Drink Offers</p>
            </div>
          </div>
          <span className="flex-shrink-0 text-[10px] font-black uppercase tracking-[0.1em] px-3 py-1 rounded-full bg-primary/15 text-primary border border-primary/25">
            FREE
          </span>
        </div>

        <div className="mx-5 h-px bg-white/[0.07]" />

        <div className="px-5 pt-4 pb-4 flex flex-col gap-5 flex-1">
          {plans.slice(0, 3).map((plan, i) => {
            const showDays = plan.days && plan.days.length > 0 && plan.days.length < 7;
            const showTime = !!(plan.timeFrom && plan.timeTo);
            return (
              <div key={i} className={`flex flex-col gap-2.5 ${i > 0 ? "pt-4 border-t border-white/[0.07]" : ""}`}>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg border ${
                    plan.type === "welcome"
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                      : "bg-primary/15 text-primary border-primary/30"
                  }`}>
                    {plan.type === "welcome" ? "Welcome" : "Unlimited"}
                  </span>
                </div>
                <p className="text-sm font-semibold text-white leading-snug">
                  {plan.productName || getPlanLabel(plan)}
                </p>

                <span className={`self-start inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-lg border ${
                  plan.gender === "female"
                    ? "bg-rose-500/15 text-rose-300 border-rose-500/25"
                    : "bg-white/[0.08] text-white/75 border-white/[0.15]"
                }`}>
                  {plan.gender === "female" ? "👩 Ladies Only" : "👥 " + t("pub_offers.gender_all")}
                </span>

                {(showDays || showTime) && (
                  <div className="flex flex-wrap gap-1.5">
                    {showDays && plan.days!.map((d) => (
                      <span key={d} className="px-3 py-1 rounded-lg text-xs font-bold bg-white/[0.09] border border-white/[0.16] text-white/85">
                        {d.slice(0, 3)}
                      </span>
                    ))}
                    {showTime && (
                      <span className="px-3 py-1 rounded-lg text-xs font-bold bg-white/[0.09] border border-white/[0.16] text-white/85 flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-white/60 flex-shrink-0" />
                        {plan.timeFrom} – {plan.timeTo}
                      </span>
                    )}
                  </div>
                )}

                {plan.description && (
                  <p className="text-xs text-white/50 italic leading-snug line-clamp-2">{plan.description}</p>
                )}
              </div>
            );
          })}
          {plans.length > 3 && (
            <p className="text-xs text-white/45 pt-1">
              +{plans.length - 3} more offer{plans.length - 3 !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        <div className="px-5 pb-5">
          <div className="flex items-center justify-between rounded-xl px-4 py-3
            bg-primary/[0.09] border border-primary/[0.20]
            group-hover:bg-primary/[0.16] group-hover:border-primary/35
            transition-all duration-300">
            <span className="text-sm font-semibold text-primary">
              {offer.pubEventId ? "Claim Deal" : "View Venue"}
            </span>
            <ArrowRight className="h-4 w-4 text-primary group-hover:translate-x-0.5 transition-transform duration-200" />
          </div>
        </div>
      </div>
    </Link>
  );
}

export function TicketCard({ offer, plans }: VendorWithPlans) {
  const { t } = useTranslation();
  return (
    <Link
      href={offer.pubEventId ? `/events/${offer.pubEventId}?book=1` : `/vendors/${offer.vendorId}`}
      className="snap-start flex-shrink-0 md:flex-shrink block group"
    >
      <div className="relative w-[300px] md:w-auto rounded-2xl overflow-hidden flex flex-col h-full
        bg-gradient-to-b from-zinc-900 to-[#0c0c0e]
        border border-white/[0.07]
        transition-all duration-300
        hover:border-amber-500/25
        hover:shadow-[0_8px_40px_rgba(245,158,11,0.09)]">

        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

        <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mt-0.5">
              <Ticket className="h-5 w-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-serif text-base leading-snug text-white line-clamp-2">
                {offer.vendorName}
              </h3>
              <p className="text-[10px] text-white/40 uppercase tracking-[0.18em] mt-0.5">Ticket Package</p>
            </div>
          </div>
          <span className="flex-shrink-0 text-[10px] font-black uppercase tracking-[0.1em] px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
            TICKET
          </span>
        </div>

        <div className="mx-5 h-px bg-white/[0.07]" />

        <div className="px-5 pt-4 pb-4 flex flex-col gap-5 flex-1">
          {plans.slice(0, 2).map((plan, i) => {
            const showDays = plan.days && plan.days.length > 0 && plan.days.length < 7;
            const showTime = !!(plan.timeFrom && plan.timeTo);
            const lineItems = (plan.lineItems ?? []).filter((li) => li.name);
            return (
              <div key={i} className={`flex flex-col gap-3 ${i > 0 ? "pt-4 border-t border-white/[0.07]" : ""}`}>

                <p className="text-sm font-semibold text-white leading-snug">
                  {plan.productName || "Ticket Package"}
                </p>

                <span className={`self-start inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-lg border ${
                  plan.gender === "female"
                    ? "bg-rose-500/15 text-rose-300 border-rose-500/25"
                    : "bg-white/[0.08] text-white/75 border-white/[0.15]"
                }`}>
                  {plan.gender === "female" ? "👩 Ladies Only" : "👥 " + t("pub_offers.gender_all")}
                </span>

                {lineItems.length > 0 && (
                  <div className="rounded-xl bg-white/[0.05] border border-white/[0.09] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-amber-400/80 font-bold mb-2.5">What's Included</p>
                    <div className="flex flex-col gap-2">
                      {lineItems.slice(0, 4).map((item, j) => (
                        <div key={j} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400/60 flex-shrink-0" />
                            <span className="text-sm text-white/80 truncate">{item.name}</span>
                          </div>
                          <span className="text-sm font-bold text-amber-400 flex-shrink-0 tabular-nums">×{item.qty}</span>
                        </div>
                      ))}
                      {lineItems.length > 4 && (
                        <p className="text-xs text-white/45 mt-0.5">+{lineItems.length - 4} more included</p>
                      )}
                    </div>
                  </div>
                )}

                {(showDays || showTime) && (
                  <div className="flex flex-wrap gap-1.5">
                    {showDays && plan.days!.map((d) => (
                      <span key={d} className="px-3 py-1 rounded-lg text-xs font-bold bg-white/[0.09] border border-white/[0.16] text-white/85">
                        {d.slice(0, 3)}
                      </span>
                    ))}
                    {showTime && (
                      <span className="px-3 py-1 rounded-lg text-xs font-bold bg-white/[0.09] border border-white/[0.16] text-white/85 flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-white/60 flex-shrink-0" />
                        {plan.timeFrom} – {plan.timeTo}
                      </span>
                    )}
                  </div>
                )}

                {plan.description && (
                  <p className="text-xs text-white/50 italic leading-snug line-clamp-2">{plan.description}</p>
                )}
              </div>
            );
          })}
          {plans.length > 2 && (
            <p className="text-xs text-white/45 pt-1">
              +{plans.length - 2} more package{plans.length - 2 !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        <div className="px-5 pb-5">
          <div className="flex items-center justify-between rounded-xl px-4 py-3
            bg-amber-500/[0.09] border border-amber-500/[0.20]
            group-hover:bg-amber-500/[0.16] group-hover:border-amber-500/35
            transition-all duration-300">
            <span className="text-sm font-semibold text-amber-400">
              {offer.pubEventId ? "Book Now" : "View Venue"}
            </span>
            <ArrowRight className="h-4 w-4 text-amber-400 group-hover:translate-x-0.5 transition-transform duration-200" />
          </div>
        </div>
      </div>
    </Link>
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
