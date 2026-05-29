import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Crown, Check, Sparkles, Star, Building2, TrendingUp,
  CheckCircle, XCircle, Gift, Trophy, Users, BarChart3,
  MessageSquare, Ticket, Heart, Gem,
} from "lucide-react";
import { apiGet, apiPost, formatINR } from "@/lib/api";

interface Sub {
  id: number;
  planType: string;
  planPeriod: "monthly" | "yearly";
  price: string;
  status: string;
  expiresAt: string;
}

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  free: "Free",
  user: "Member (Legacy)",
  user_plus: "RoyVento Plus",
  user_vip: "RoyVento VIP",
  partner: "Partner Premium (Legacy)",
  partner_growth: "Growth Plan",
  partner_premium: "Premium Partner Plan",
  partner_royal: "Royal Partner Plan",
};

const USER_PLANS = [
  {
    id: "free",
    name: "Free",
    tagline: "Get started for free",
    monthly: 0,
    yearly: 0,
    icon: Star,
    features: [
      "Browse pubs and events",
      "Standard ticket & table booking",
      "Access to public offers",
    ],
    planType: null as string | null,
  },
  {
    id: "user_plus",
    name: "RoyVento Plus",
    tagline: "For regular nightlifers",
    monthly: 149,
    yearly: 1490,
    icon: Sparkles,
    popular: true,
    features: [
      "Reduced or zero convenience fees",
      "Exclusive member-only offers",
      "Early access to tickets & events",
      "Priority table reservations",
      "Birthday rewards",
      "Loyalty points on every booking",
    ],
    planType: "user_plus" as string | null,
  },
  {
    id: "user_vip",
    name: "RoyVento VIP",
    tagline: "The ultimate nightlife pass",
    monthly: 499,
    yearly: 4990,
    icon: Crown,
    accent: true,
    features: [
      "All Plus benefits included",
      "VIP event access",
      "Complimentary venue offers",
      "Priority support",
      "Exclusive nightlife experiences",
      "Higher loyalty rewards multiplier",
    ],
    planType: "user_vip" as string | null,
  },
];

const PARTNER_PLANS = [
  {
    id: "basic",
    name: "Basic Partner",
    tagline: "Get your venue listed",
    monthly: 0,
    yearly: 0,
    icon: Building2,
    features: [
      "Pub listing",
      "Event management",
      "Booking management",
      "Basic reports",
    ],
    planType: null as string | null,
  },
  {
    id: "partner_growth",
    name: "Growth Plan",
    tagline: "Grow your venue business",
    monthly: 2999,
    yearly: 32989,
    icon: TrendingUp,
    popular: true,
    features: [
      "Profile visits boost",
      "Pro event analytics",
      "Priority search ranking",
      "Premium member badge",
      "Advanced booking & revenue reports",
      "Full customer database access",
      "5 days free Facebook & Instagram marketing",
    ],
    planType: "partner_growth" as string | null,
  },
  {
    id: "partner_premium",
    name: "Premium Partner Plan",
    tagline: "Dominate your market",
    monthly: 5999,
    yearly: 65989,
    icon: Crown,
    accent: true,
    features: [
      "Event promotion",
      "Email marketing",
      "WhatsApp marketing",
      "Dedicated account manager",
      "AI features (coming soon)",
      "12 days free Facebook & Instagram marketing",
      "Offline campaigns",
    ],
    planType: "partner_premium" as string | null,
  },
  {
    id: "partner_royal",
    name: "Royal Partner Plan",
    tagline: "The ultimate venue experience",
    monthly: 9999,
    yearly: 109989,
    icon: Gem,
    features: [
      "Homepage promotion",
      "Drinks deal promotion",
      "Event promotion",
      "16 days Facebook & Instagram marketing",
    ],
    planType: "partner_royal" as string | null,
  },
];

const LOYALTY_EARN = [
  { icon: Ticket,  label: "Ticket bookings",    pts: "+50 pts / booking" },
  { icon: Users,   label: "Table bookings",     pts: "+60 pts / booking" },
  { icon: Heart,   label: "Event participation", pts: "+50 pts / event"  },
  { icon: Trophy,  label: "Membership renewal", pts: "+200 pts / renewal" },
];

const LOYALTY_REDEEM = [
  { icon: Gift,         label: "Discount vouchers",  desc: "Redeem points for % off coupons" },
  { icon: Ticket,       label: "Free tickets",        desc: "Convert points to event tickets" },
  { icon: Crown,        label: "VIP upgrades",        desc: "Unlock VIP access with points"   },
  { icon: Sparkles,     label: "Exclusive rewards",   desc: "Special partner rewards & perks" },
];

export function Subscription() {
  const { data: me, refetch } = useGetMe({ query: { retry: false } as any });
  const user = me?.user as any;
  const [active, setActive] = useState<Sub | null>(null);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(false);
  const [planConfig, setPlanConfig] = useState({ showGrowthPlan: true, showPremiumPartner: true, showRoyalPlan: true });
  const { toast } = useToast();

  const paymentParam = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("payment")
    : null;

  useEffect(() => {
    apiGet<{ showGrowthPlan: boolean; showPremiumPartner: boolean; showRoyalPlan: boolean }>("/api/plan-config")
      .then(setPlanConfig)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      apiGet<Sub | null>("/api/subscriptions/me").then(setActive).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (paymentParam === "success") {
      refetch();
      apiGet<Sub | null>("/api/subscriptions/me").then(setActive).catch(() => {});
    }
  }, [paymentParam]);

  const subscribe = async (planType: string) => {
    if (!user) {
      toast({ title: "Please log in first", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const result = await apiPost<Sub>("/api/subscriptions", { planType, planPeriod: billing });
      setActive(result);
      refetch();
      toast({ title: "Subscription activated!", description: "Enjoy your RoyVento membership." });
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const isActiveUserPlan = (planType: string | null) => {
    const userPlanTypes = ["user", "user_plus", "user_vip"];
    if (planType === null) {
      return !active || !userPlanTypes.includes(active.planType);
    }
    return active?.planType === planType;
  };

  const isActivePartnerPlan = (planType: string | null) => {
    const partnerPlanTypes = ["partner", "partner_growth", "partner_premium", "partner_royal"];
    if (planType === null) {
      return !active || !partnerPlanTypes.includes(active.planType);
    }
    return active?.planType === planType;
  };

  const isVendor = user?.role === "vendor" || user?.role === "admin";

  const visiblePartnerPlans = PARTNER_PLANS.filter((p) => {
    if (p.id === "partner_growth" && !planConfig.showGrowthPlan) return false;
    if (p.id === "partner_premium" && !planConfig.showPremiumPartner) return false;
    if (p.id === "partner_royal" && !planConfig.showRoyalPlan) return false;
    return true;
  });

  return (
    <div className="min-h-screen pb-24">
      <SEO
        title="Membership & Partner Plans — Royvento"
        description="Unlock exclusive nightlife perks with RoyVento Plus or VIP. Grow your pub or club with our Growth and Premium partner plans."
        canonical="/subscription"
      />

      {paymentParam === "success" && (
        <div className="container mx-auto px-4 md:px-6 pt-8 max-w-5xl">
          <div className="rounded-2xl border border-green-500/40 bg-green-900/20 p-5 flex items-center gap-4">
            <CheckCircle className="h-6 w-6 text-green-400 shrink-0" />
            <div>
              <p className="font-medium text-green-200">Payment successful!</p>
              <p className="text-sm text-green-300/80">Your subscription is now active. Enjoy RoyVento.</p>
            </div>
          </div>
        </div>
      )}
      {paymentParam === "failed" && (
        <div className="container mx-auto px-4 md:px-6 pt-8 max-w-5xl">
          <div className="rounded-2xl border border-red-500/40 bg-red-900/20 p-5 flex items-center gap-4">
            <XCircle className="h-6 w-6 text-red-400 shrink-0" />
            <div>
              <p className="font-medium text-red-200">Payment failed</p>
              <p className="text-sm text-red-300/80">No amount was charged. Please try again.</p>
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="container mx-auto px-4 md:px-6 pt-16 pb-10 text-center max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/20 border border-primary/40 px-3 py-1 text-xs uppercase tracking-wider text-primary mb-5">
          <Crown className="h-3.5 w-3.5" /> RoyVento Memberships
        </div>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight">
          Plans for nightlifers<br className="hidden sm:block" /> &amp; venue partners
        </h1>
        <p className="mt-4 text-white/60 leading-relaxed max-w-xl mx-auto">
          Join the RoyVento ecosystem — unlock exclusive perks, priority access, and premium tools for your venue.
        </p>
      </div>

      {/* Billing toggle */}
      <div className="flex justify-center mb-10">
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
          <button
            onClick={() => setBilling("monthly")}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${billing === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling("yearly")}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${billing === "yearly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Yearly <span className="text-xs text-emerald-400 ml-1">Save up to 2 months</span>
          </button>
        </div>
      </div>

      {/* Active plan banner */}
      {active && (
        <div className="container mx-auto px-4 md:px-6 max-w-5xl mb-10">
          <div className="rounded-2xl glass-card-strong red-ring p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wider text-primary">Active plan</p>
              <p className="font-serif text-xl mt-1">
                {PLAN_DISPLAY_NAMES[active.planType] ?? active.planType}
                <span className="text-sm text-muted-foreground ml-2">· {active.planPeriod}</span>
              </p>
              <p className="text-sm text-white/60 mt-1">
                Renews on {new Date(active.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <Badge className="bg-primary border-0 text-primary-foreground shrink-0">
              {formatINR(Number(active.price))}/{active.planPeriod === "monthly" ? "mo" : "yr"}
            </Badge>
          </div>
        </div>
      )}

      {/* ── Member Plans ── */}
      <section className="container mx-auto px-4 md:px-6 pb-16 max-w-5xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="h-px flex-1 bg-white/8" />
          <h2 className="font-serif text-2xl tracking-tight flex items-center gap-2 shrink-0">
            <Sparkles className="h-5 w-5 text-primary" /> For Members
          </h2>
          <div className="h-px flex-1 bg-white/8" />
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {USER_PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              billing={billing}
              isActive={isActiveUserPlan(plan.planType)}
              onSubscribe={plan.planType ? () => subscribe(plan.planType!) : undefined}
              loading={loading}
              notLoggedIn={!user}
            />
          ))}
        </div>
      </section>

      {/* ── Partner Plans — only for vendors ── */}
      {isVendor ? (
        <section className="container mx-auto px-4 md:px-6 pb-16 max-w-5xl">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-px flex-1 bg-white/8" />
            <h2 className="font-serif text-2xl tracking-tight flex items-center gap-2 shrink-0">
              <Building2 className="h-5 w-5 text-primary" /> For Partners
            </h2>
            <div className="h-px flex-1 bg-white/8" />
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {visiblePartnerPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                billing={billing}
                isActive={isActivePartnerPlan(plan.planType)}
                onSubscribe={plan.planType ? () => subscribe(plan.planType!) : undefined}
                loading={loading}
                notLoggedIn={!user}
              />
            ))}
          </div>
        </section>
      ) : (
        <section className="container mx-auto px-4 md:px-6 pb-16 max-w-5xl">
          <div className="rounded-3xl glass-card border border-white/8 p-10 text-center">
            <Building2 className="h-12 w-12 text-primary/60 mx-auto mb-4" />
            <h3 className="font-serif text-2xl tracking-tight mb-2">Want partner features?</h3>
            <p className="text-white/60 mb-6 max-w-md mx-auto">
              Apply to list your pub or club on RoyVento and unlock Growth or Premium partner plans with advanced marketing and analytics tools.
            </p>
            <Link href="/dashboard/become-vendor">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground border-0 rounded-full px-7">
                Apply to become a partner →
              </Button>
            </Link>
          </div>
        </section>
      )}

      {/* ── Loyalty & Rewards ── */}
      <section className="container mx-auto px-4 md:px-6 pb-16 max-w-5xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="h-px flex-1 bg-white/8" />
          <h2 className="font-serif text-2xl tracking-tight flex items-center gap-2 shrink-0">
            <Trophy className="h-5 w-5 text-primary" /> Loyalty &amp; Rewards
          </h2>
          <div className="h-px flex-1 bg-white/8" />
        </div>

        {user && (
          <div className="rounded-2xl glass-card-strong red-ring p-6 mb-8 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wider text-primary">Your points balance</p>
              <p className="font-serif text-4xl tracking-tight mt-1">{user.points ?? 0} <span className="text-lg text-muted-foreground font-sans">pts</span></p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">RoyVento Plus/VIP members earn bonus points</p>
              <p className="text-sm text-primary mt-1">on every booking &amp; event</p>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl glass-card p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <span className="h-6 w-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
              </span>
              How to earn points
            </h3>
            <ul className="space-y-3">
              {LOYALTY_EARN.map((item) => (
                <li key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <item.icon className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm text-white/80">{item.label}</span>
                  </div>
                  <span className="text-xs font-semibold text-emerald-400">{item.pts}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl glass-card p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <span className="h-6 w-6 rounded-lg bg-primary/20 flex items-center justify-center">
                <Gift className="h-3.5 w-3.5 text-primary" />
              </span>
              Redeem your points
            </h3>
            <ul className="space-y-3">
              {LOYALTY_REDEEM.map((item) => (
                <li key={item.label} className="flex items-start gap-2.5">
                  <item.icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-white/90">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Additional Revenue Features (partner-focused) ── */}
      <section className="container mx-auto px-4 md:px-6 pb-16 max-w-5xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="h-px flex-1 bg-white/8" />
          <h2 className="font-serif text-2xl tracking-tight shrink-0">Additional Features</h2>
          <div className="h-px flex-1 bg-white/8" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { icon: Star,          label: "Featured Pub Listings", desc: "Get top placement in search results and category pages." },
            { icon: Sparkles,      label: "Sponsored Events",      desc: "Promote your events to a wider targeted audience." },
            { icon: BarChart3,     label: "Premium Analytics",     desc: "Deep customer insights, heatmaps and revenue reports." },
            { icon: MessageSquare, label: "Priority Support",      desc: "Dedicated account manager for Premium partners." },
          ].map((f) => (
            <div key={f.label} className="rounded-2xl glass-card p-5 flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">{f.label}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Trust strips ── */}
      <div className="container mx-auto px-4 md:px-6 max-w-5xl">
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { icon: CheckCircle, t: "Cancel anytime",  d: "No lock-in. Downgrade or cancel from your profile at any time." },
            { icon: Gift,        t: "Billing history", d: "View all invoices and payment history in your profile dashboard." },
          ].map((x) => (
            <div key={x.t} className="rounded-2xl glass-card p-5 flex items-start gap-3">
              <x.icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">{x.t}</p>
                <p className="text-xs text-white/60 mt-1 leading-relaxed">{x.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface PlanDef {
  id: string;
  name: string;
  tagline: string;
  monthly: number;
  yearly: number;
  icon: React.ComponentType<{ className?: string }>;
  popular?: boolean;
  accent?: boolean;
  features: readonly string[];
  planType: string | null;
}

function PlanCard({
  plan, billing, isActive, onSubscribe, loading, notLoggedIn,
}: {
  plan: PlanDef;
  billing: "monthly" | "yearly";
  isActive: boolean;
  onSubscribe?: () => void;
  loading: boolean;
  notLoggedIn: boolean;
}) {
  const price = billing === "monthly" ? plan.monthly : plan.yearly;
  const isFree = price === 0;

  return (
    <div className={`relative rounded-3xl ${plan.accent ? "glass-card-strong red-glow" : "glass-card"} p-7 lift-3d ${isActive ? "ring-2 ring-primary/60" : ""}`}>
      {isActive && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <Badge className="bg-green-600 border-0 text-white text-xs">✓ Current plan</Badge>
        </div>
      )}
      {!isActive && plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <Badge className="bg-primary border-0 text-primary-foreground text-xs">Most popular</Badge>
        </div>
      )}

      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center red-ring shrink-0">
          <plan.icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-serif text-lg tracking-tight leading-snug">{plan.name}</p>
          <p className="text-xs text-muted-foreground">{plan.tagline}</p>
        </div>
      </div>

      <div className="mb-6">
        {isFree ? (
          <p className="font-serif text-4xl tracking-tight">Free</p>
        ) : (
          <>
            <p className="font-serif text-4xl tracking-tight">
              {formatINR(price)}
              <span className="text-sm text-muted-foreground font-sans ml-1">/{billing === "monthly" ? "mo" : "yr"}</span>
            </p>
            {billing === "yearly" && plan.monthly > 0 && (() => {
              const savedMonths = Math.round(12 - Math.round(plan.yearly / plan.monthly));
              return (
                <p className="text-xs text-emerald-400 mt-1">
                  ≈ {formatINR(Math.round(price / 12))}/mo
                  {savedMonths > 0 && ` · ${savedMonths} month${savedMonths > 1 ? "s" : ""} free`}
                </p>
              );
            })()}
          </>
        )}
      </div>

      <ul className="space-y-2 text-sm mb-7">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span className="text-white/80 leading-snug">{f}</span>
          </li>
        ))}
      </ul>

      {isActive ? (
        <Button disabled className="w-full h-11 bg-green-600/20 border border-green-500/40 text-green-400 cursor-default">
          <CheckCircle className="h-4 w-4 mr-2" /> Active
        </Button>
      ) : isFree ? (
        <Button disabled variant="outline" className="w-full h-11 opacity-60">
          Included
        </Button>
      ) : notLoggedIn ? (
        <Link href="/login" className="block">
          <Button className={`w-full h-11 ${plan.accent ? "bg-primary hover:bg-primary/90 text-primary-foreground border-0" : ""}`}>
            Log in to subscribe
          </Button>
        </Link>
      ) : (
        <Button
          onClick={onSubscribe}
          disabled={loading}
          className={`w-full h-11 ${plan.accent ? "bg-primary hover:bg-primary/90 text-primary-foreground border-0" : ""}`}
        >
          {loading ? "Activating…" : `Get ${plan.name}`}
        </Button>
      )}
    </div>
  );
}
