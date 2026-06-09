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
  MessageSquare, Ticket, Heart, Gem, Eye, Calendar, Megaphone,
  X, Headphones,
} from "lucide-react";
import { apiGet, apiPost, formatINR } from "@/lib/api";

/* ─── types & data (all unchanged) ─────────────────────────────────────── */
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
    id: "free", name: "Free", tagline: "Get started for free",
    monthly: 0, yearly: 0, icon: Star,
    features: ["Browse pubs and events", "Standard ticket & table booking", "Access to public offers"],
    planType: null as string | null,
  },
  {
    id: "user_plus", name: "RoyVento Plus", tagline: "For regular nightlifers",
    monthly: 149, yearly: 1490, icon: Sparkles, popular: true,
    features: ["Reduced or zero convenience fees", "Exclusive member-only offers", "Early access to tickets & events", "Priority table reservations", "Birthday rewards", "Loyalty points on every booking"],
    planType: "user_plus" as string | null,
  },
  {
    id: "user_vip", name: "RoyVento VIP", tagline: "The ultimate nightlife pass",
    monthly: 499, yearly: 4990, icon: Crown, accent: true,
    features: ["All Plus benefits included", "VIP event access", "Complimentary venue offers", "Priority support", "Exclusive nightlife experiences", "Higher loyalty rewards multiplier", "Create & Join Verified Solo Activity Groups"],
    planType: "user_vip" as string | null,
  },
];

const PARTNER_PLANS = [
  {
    id: "basic", name: "Basic Partner", tagline: "Get your venue listed",
    monthly: 0, yearly: 0, icon: Building2,
    features: [
      { text: "Pub listing",         included: true },
      { text: "Event management",    included: true },
      { text: "Booking management",  included: true },
      { text: "Basic reports",       included: true },
    ],
    planType: null as string | null,
  },
  {
    id: "partner_growth", name: "Growth Plan", tagline: "Grow your venue business",
    monthly: 2999, yearly: 32989, icon: TrendingUp, popular: true,
    features: [
      { text: "Profile visits boost",                       included: true },
      { text: "Pro event analytics",                        included: true },
      { text: "Priority search ranking",                    included: true },
      { text: "Premium member badge",                       included: true },
      { text: "Advanced booking & revenue reports",         included: true },
      { text: "Full customer database access",              included: true },
      { text: "5 days free Facebook & Instagram marketing", included: true },
    ],
    planType: "partner_growth" as string | null,
  },
  {
    id: "partner_premium", name: "Premium Partner Plan", tagline: "Dominate your market",
    monthly: 5999, yearly: 65989, icon: Crown, accent: true,
    features: [
      { text: "Growth Plan included",                        included: true },
      { text: "Event promotion",                             included: true },
      { text: "Email marketing",                             included: true },
      { text: "WhatsApp marketing",                          included: true },
      { text: "Dedicated account manager",                   included: true },
      { text: "AI features (coming soon)",                   included: true },
      { text: "12 days free Facebook & Instagram marketing", included: true },
      { text: "Offline campaigns",                           included: true },
    ],
    planType: "partner_premium" as string | null,
  },
  {
    id: "partner_royal", name: "Royal Partner Plan", tagline: "The ultimate venue experience",
    monthly: 9999, yearly: 109989, icon: Gem,
    features: [
      { text: "Growth Plan & Partner Plan included",    included: true },
      { text: "Homepage promotion",                     included: true },
      { text: "Drinks deal promotion",                  included: true },
      { text: "Event promotion",                        included: true },
      { text: "16 days Facebook & Instagram marketing", included: true },
      { text: "Offline marketing",                      included: true },
    ],
    planType: "partner_royal" as string | null,
  },
];

const PARTNER_BENEFITS = [
  { icon: Eye,          label: "More Visibility",      desc: "Get your venue discovered by thousands of party-goers" },
  { icon: Calendar,     label: "More Bookings",        desc: "Receive more table bookings and guest lists" },
  { icon: TrendingUp,   label: "More Revenue",         desc: "Increase footfall and maximize your business growth" },
  { icon: BarChart3,    label: "Analytics & Insights", desc: "Track performance and make data-driven decisions" },
  { icon: Megaphone,    label: "Marketing Support",    desc: "Promote your events and offers effectively" },
];

const SUCCESS_STORIES = [
  { name: "Skyline Club",   result: "+300%", desc: "Increased footfall by 300% in 2 months",   img: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=80&q=70" },
  { name: "Lounge 24",      result: "+250%", desc: "Boosted bookings by 250% with Royvento",   img: "https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?w=80&q=70" },
  { name: "The Pump House", result: "+95%",  desc: "Achieved 95% occupancy on weekends",       img: "https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?w=80&q=70" },
];

const LOYALTY_EARN = [
  { icon: Ticket,  label: "Ticket bookings",     pts: "+50 pts / booking"  },
  { icon: Users,   label: "Table bookings",      pts: "+60 pts / booking"  },
  { icon: Heart,   label: "Event participation", pts: "+50 pts / event"    },
  { icon: Trophy,  label: "Membership renewal",  pts: "+200 pts / renewal" },
];

const LOYALTY_REDEEM = [
  { icon: Gift,     label: "Discount vouchers", desc: "Redeem points for % off coupons" },
  { icon: Ticket,   label: "Free tickets",       desc: "Convert points to event tickets" },
  { icon: Crown,    label: "VIP upgrades",        desc: "Unlock VIP access with points"   },
  { icon: Sparkles, label: "Exclusive rewards",   desc: "Special partner rewards & perks" },
];

/* ─── Main component ────────────────────────────────────────────────────── */
export function Subscription() {
  const { data: me, refetch } = useGetMe({ query: { retry: false } as any });
  const user = me?.user as any;
  const [active, setActive]       = useState<Sub | null>(null);
  const [billing, setBilling]     = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading]     = useState(false);
  const [planConfig, setPlanConfig] = useState({ showGrowthPlan: true, showPremiumPartner: true, showRoyalPlan: true });
  const { toast } = useToast();

  const paymentParam = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("payment")
    : null;

  // All data fetching unchanged
  useEffect(() => {
    apiGet<{ showGrowthPlan: boolean; showPremiumPartner: boolean; showRoyalPlan: boolean }>("/api/plan-config")
      .then(setPlanConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) apiGet<Sub | null>("/api/subscriptions/me").then(setActive).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (paymentParam === "success") {
      refetch();
      apiGet<Sub | null>("/api/subscriptions/me").then(setActive).catch(() => {});
    }
  }, [paymentParam]);

  // Subscribe logic unchanged
  const subscribe = async (planType: string) => {
    if (!user) { toast({ title: "Please log in first", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const result = await apiPost<Sub>("/api/subscriptions", { planType, planPeriod: billing });
      setActive(result);
      refetch();
      toast({ title: "Subscription activated!", description: "Enjoy your RoyVento membership." });
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const isActiveUserPlan = (planType: string | null) => {
    const userPlanTypes = ["user", "user_plus", "user_vip"];
    if (planType === null) return !active || !userPlanTypes.includes(active.planType);
    return active?.planType === planType;
  };

  const isActivePartnerPlan = (planType: string | null) => {
    const partnerPlanTypes = ["partner", "partner_growth", "partner_premium", "partner_royal"];
    if (planType === null) return !active || !partnerPlanTypes.includes(active.planType);
    return active?.planType === planType;
  };

  const isVendor = user?.role === "vendor" || user?.role === "admin";

  const visiblePartnerPlans = PARTNER_PLANS.filter((p) => {
    if (p.id === "partner_growth"  && !planConfig.showGrowthPlan)     return false;
    if (p.id === "partner_premium" && !planConfig.showPremiumPartner) return false;
    if (p.id === "partner_royal"   && !planConfig.showRoyalPlan)      return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      <SEO
        title="Membership & Partner Plans — Royvento"
        description="Unlock exclusive nightlife perks with RoyVento Plus or VIP. Grow your pub or club with our Growth and Premium partner plans."
        canonical="/subscription"
      />

      {/* ── Payment banners (unchanged) ── */}
      {paymentParam === "success" && (
        <div className="container mx-auto px-4 md:px-6 pt-8 max-w-6xl">
          <div className="rounded-2xl border border-primary/40 bg-primary/10 p-5 flex items-center gap-4">
            <CheckCircle className="h-6 w-6 text-primary shrink-0" />
            <div>
              <p className="font-medium text-primary">Payment successful!</p>
              <p className="text-sm text-white/70">Your subscription is now active. Enjoy RoyVento.</p>
            </div>
          </div>
        </div>
      )}
      {paymentParam === "failed" && (
        <div className="container mx-auto px-4 md:px-6 pt-8 max-w-6xl">
          <div className="rounded-2xl border border-red-500/40 bg-red-900/20 p-5 flex items-center gap-4">
            <XCircle className="h-6 w-6 text-red-400 shrink-0" />
            <div>
              <p className="font-medium text-red-200">Payment failed</p>
              <p className="text-sm text-red-300/80">No amount was charged. Please try again.</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          PAGE HEADER
      ═══════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -top-20 right-1/4 h-72 w-72 rounded-full bg-primary/8 blur-3xl" />
        </div>
        <div className="container mx-auto px-4 md:px-6 pt-14 pb-10 text-center relative max-w-3xl">
          <p className="text-xs uppercase tracking-[0.28em] text-primary font-semibold mb-4">
            For Pub &amp; Club Owners
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight text-white leading-tight">
            Choose the perfect plan to<br className="hidden sm:block" /> grow your business
          </h1>
          <p className="mt-4 text-white/60 leading-relaxed max-w-xl mx-auto">
            Get more visibility, more customers and more revenue with Royvento.
          </p>

          {/* Billing toggle */}
          <div className="mt-8 inline-flex items-center rounded-xl border border-white/[0.08] bg-white/[0.04] p-1 gap-1">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                billing === "monthly" ? "bg-white text-black" : "text-muted-foreground hover:text-white"
              }`}
            >Monthly</button>
            <button
              onClick={() => setBilling("yearly")}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                billing === "yearly" ? "bg-white text-black" : "text-muted-foreground hover:text-white"
              }`}
            >
              Yearly
              <span className="text-xs text-primary font-semibold">Save up to 20%</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Active plan banner ── */}
      {active && (
        <div className="container mx-auto px-4 md:px-6 max-w-6xl mb-8">
          <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wider text-primary">Active plan</p>
              <p className="font-bold text-xl text-white mt-1">
                {PLAN_DISPLAY_NAMES[active.planType] ?? active.planType}
                <span className="text-sm text-muted-foreground font-normal ml-2">· {active.planPeriod}</span>
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

      {/* ═══════════════════════════════════════════════════════
          PARTNER PLANS — 4-column reference layout
          [Benefits] [Plan] [Plan (Popular)] [Plan] [Success Stories]
      ═══════════════════════════════════════════════════════ */}
      {isVendor ? (
        <section className="container mx-auto px-4 md:px-6 pb-16 max-w-[1400px]">
          <div className="flex gap-6 items-start">

            {/* ════ FAR LEFT — Why Royvento ════ */}
            <div className="hidden xl:block w-[220px] shrink-0 sticky top-24">
              <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-5 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
                  Why Royvento
                </h3>
                {PARTNER_BENEFITS.map(({ icon: Icon, label, desc }) => (
                  <div key={label}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/15 shrink-0">
                        <Icon className="h-3.5 w-3.5 text-primary" />
                      </span>
                      <span className="text-sm font-semibold text-white">{label}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed pl-8">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ════ CENTER — Plan cards ════ */}
            <div className="flex-1 min-w-0">
              <div className={`grid gap-4 grid-cols-1 sm:grid-cols-2 ${visiblePartnerPlans.length >= 3 ? "lg:grid-cols-3" : ""}`}>
                {visiblePartnerPlans.map((plan) => (
                  <PartnerPlanCard
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
            </div>

            {/* ════ FAR RIGHT — Success Stories + Join 1,200+ ════ */}
            <div className="hidden xl:block w-[220px] shrink-0 sticky top-24 space-y-4">

              {/* Success Stories */}
              <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-5">
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground mb-4">
                  Success Stories
                </h3>
                <div className="space-y-4">
                  {SUCCESS_STORIES.map(({ name, result, desc, img }) => (
                    <div key={name} className="flex items-start gap-3">
                      <img
                        src={img}
                        alt={name}
                        loading="lazy"
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-lg object-cover shrink-0 border border-white/[0.08]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-primary leading-tight">{name}</p>
                        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{desc}</p>
                      </div>
                      <span className="text-sm font-bold text-primary shrink-0">{result}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Join 1,200+ venues */}
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                <p className="text-sm font-bold text-white leading-snug">
                  Join 1,200+ venues already growing with Royvento
                </p>
                <div className="flex -space-x-2 mt-3">
                  {[12, 32, 45, 5].map((n) => (
                    <img
                      key={n}
                      src={`https://i.pravatar.cc/48?img=${n}`}
                      alt=""
                      loading="lazy"
                      className="h-8 w-8 rounded-full border-2 border-[#111] object-cover"
                    />
                  ))}
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#111] bg-primary/20 text-[10px] font-bold text-primary">
                    1K+
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  Trusted by pubs &amp; clubs across India to grow their business.
                </p>
              </div>
            </div>

          </div>
        </section>
      ) : (
        /* ── Non-vendor: teaser to become partner ── */
        <section className="container mx-auto px-4 md:px-6 pb-16 max-w-6xl">
          <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-10 text-center">
            <Building2 className="h-12 w-12 text-primary/60 mx-auto mb-4" />
            <h3 className="text-2xl font-bold tracking-tight mb-2">Want partner features?</h3>
            <p className="text-white/60 mb-6 max-w-md mx-auto">
              Apply to list your pub or club on Royvento and unlock Growth or Premium partner plans with advanced marketing and analytics tools.
            </p>
            <Link href="/dashboard/become-vendor">
              <Button className="bg-primary hover:bg-primary-hover text-primary-foreground border-0 rounded-xl px-7">
                Apply to become a partner →
              </Button>
            </Link>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          USER / MEMBER PLANS
      ═══════════════════════════════════════════════════════ */}
      <section className="container mx-auto px-4 md:px-6 pb-16 max-w-6xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="h-px flex-1 bg-white/[0.06]" />
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 shrink-0 whitespace-nowrap">
            <Sparkles className="h-5 w-5 text-primary" /> Member Plans
          </h2>
          <div className="h-px flex-1 bg-white/[0.06]" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {USER_PLANS.map((plan) => (
            <UserPlanCard
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

      {/* ═══════════════════════════════════════════════════════
          LOYALTY & REWARDS
      ═══════════════════════════════════════════════════════ */}
      <section className="container mx-auto px-4 md:px-6 pb-16 max-w-6xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="h-px flex-1 bg-white/[0.06]" />
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 shrink-0">
            <Trophy className="h-5 w-5 text-primary" /> Loyalty &amp; Rewards
          </h2>
          <div className="h-px flex-1 bg-white/[0.06]" />
        </div>

        {user && (
          <div className="rounded-2xl border border-primary/25 bg-primary/10 p-6 mb-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wider text-primary">Your points balance</p>
              <p className="text-4xl font-bold text-white mt-1">{user.points ?? 0} <span className="text-lg text-muted-foreground font-normal">pts</span></p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">RoyVento Plus/VIP members earn bonus points</p>
              <p className="text-sm text-primary mt-1">on every booking &amp; event</p>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <span className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
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
                  <span className="text-xs font-semibold text-primary">{item.pts}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <span className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
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

      {/* ═══════════════════════════════════════════════════════
          TRUST STRIP + ADDITIONAL FEATURES
      ═══════════════════════════════════════════════════════ */}
      <section className="container mx-auto px-4 md:px-6 pb-16 max-w-6xl">
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { icon: Star,          label: "Featured Pub Listings", desc: "Get top placement in search results and category pages." },
            { icon: Sparkles,      label: "Sponsored Events",      desc: "Promote your events to a wider targeted audience." },
            { icon: BarChart3,     label: "Premium Analytics",     desc: "Deep customer insights, heatmaps and revenue reports." },
            { icon: MessageSquare, label: "Priority Support",      desc: "Dedicated account manager for Premium partners." },
          ].map((f) => (
            <div key={f.label} className="rounded-2xl border border-white/[0.06] bg-[#111] p-5 flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
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

      {/* ═══════════════════════════════════════════════════════
          BOTTOM CTA — "Not sure which plan?"
      ═══════════════════════════════════════════════════════ */}
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111]">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-10 top-1/2 -translate-y-1/2 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute -right-10 top-1/2 -translate-y-1/2 h-48 w-48 rounded-full bg-primary/8 blur-3xl" />
          </div>
          <div className="relative flex flex-col md:flex-row items-center justify-between gap-6 p-8">
            <div>
              <h3 className="text-xl font-bold text-white">Not sure which plan is right for you?</h3>
              <p className="text-sm text-muted-foreground mt-1">Talk to our team and get a custom solution for your business.</p>
            </div>
            <Link href="/contact">
              <button className="inline-flex items-center gap-2.5 shrink-0 rounded-xl border border-white/[0.12] bg-white/[0.04] text-white font-semibold text-sm px-6 py-3 hover:border-primary/40 hover:bg-primary/10 transition-all">
                <Headphones className="h-4 w-4 text-primary" /> Talk to Sales
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Partner Plan Card ──────────────────────────────────────────────────── */
interface PartnerPlanDef {
  id: string; name: string; tagline: string;
  monthly: number; yearly: number;
  icon: React.ComponentType<{ className?: string }>;
  popular?: boolean; accent?: boolean;
  features: { text: string; included: boolean }[];
  planType: string | null;
}

function PartnerPlanCard({
  plan, billing, isActive, onSubscribe, loading, notLoggedIn,
}: {
  plan: PartnerPlanDef; billing: "monthly" | "yearly";
  isActive: boolean; onSubscribe?: () => void;
  loading: boolean; notLoggedIn: boolean;
}) {
  const price = billing === "monthly" ? plan.monthly : plan.yearly;
  const isFree = price === 0;

  return (
    <div className={`relative flex flex-col rounded-2xl border p-5 transition-all ${
      plan.popular
        ? "border-primary bg-[#111] shadow-[0_0_0_2px_rgba(232,41,28,0.45),0_0_40px_rgba(232,41,28,0.12)]"
        : "border-white/[0.06] bg-[#111]"
    } ${isActive ? "ring-2 ring-primary/60" : ""}`}>

      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="inline-flex items-center rounded-full bg-primary px-3 py-0.5 text-[11px] font-bold text-primary-foreground">
            Most Popular
          </span>
        </div>
      )}
      {isActive && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="inline-flex items-center rounded-full bg-primary px-3 py-0.5 text-[11px] font-bold text-primary-foreground">
            ✓ Current plan
          </span>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-xl font-bold text-white">{plan.name}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{plan.tagline}</p>
      </div>

      {isFree ? (
        <div className="mb-4">
          <p className="text-3xl font-bold text-white">Free</p>
        </div>
      ) : (
        <div className="mb-4">
          <p className="text-3xl font-bold text-white">
            {formatINR(price)}
            <span className="text-sm text-muted-foreground font-normal ml-1">/{billing === "monthly" ? "month" : "year"}</span>
          </p>
          {billing === "monthly" && plan.yearly > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">or {formatINR(plan.yearly)}/year</p>
          )}
        </div>
      )}

      {isActive ? (
        <Button disabled className="w-full h-10 bg-primary/20 border border-primary/40 text-primary cursor-default rounded-xl mb-5 text-sm font-semibold">
          <CheckCircle className="h-4 w-4 mr-2" /> Active
        </Button>
      ) : isFree ? (
        <Button disabled variant="outline" className="w-full h-10 rounded-xl mb-5 text-sm opacity-60">
          Included
        </Button>
      ) : notLoggedIn ? (
        <Link href="/login" className="block mb-5">
          <Button className="w-full h-10 bg-primary text-primary-foreground border-0 rounded-xl text-sm font-semibold hover:bg-primary-hover">
            Log in to subscribe
          </Button>
        </Link>
      ) : (
        <Button
          onClick={onSubscribe}
          disabled={loading}
          className="w-full h-10 bg-primary text-primary-foreground border-0 rounded-xl mb-5 text-sm font-semibold hover:bg-primary-hover"
        >
          {loading ? "Activating…" : "Choose Plan"}
        </Button>
      )}

      <ul className="space-y-2.5 text-sm flex-1">
        {plan.features.map((f) => (
          <li key={f.text} className="flex items-center gap-2">
            {f.included
              ? <Check className="h-4 w-4 text-primary shrink-0" />
              : <X className="h-4 w-4 text-red-400 shrink-0" />
            }
            <span className={f.included ? "text-white/85" : "text-white/45"}>{f.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── User Plan Card ─────────────────────────────────────────────────────── */
interface UserPlanDef {
  id: string; name: string; tagline: string;
  monthly: number; yearly: number;
  icon: React.ComponentType<{ className?: string }>;
  popular?: boolean; accent?: boolean;
  features: readonly string[];
  planType: string | null;
}

function UserPlanCard({
  plan, billing, isActive, onSubscribe, loading, notLoggedIn,
}: {
  plan: UserPlanDef; billing: "monthly" | "yearly";
  isActive: boolean; onSubscribe?: () => void;
  loading: boolean; notLoggedIn: boolean;
}) {
  const price = billing === "monthly" ? plan.monthly : plan.yearly;
  const isFree = price === 0;

  return (
    <div className={`relative flex flex-col rounded-2xl border p-6 ${
      plan.popular
        ? "border-primary shadow-[0_0_0_2px_rgba(232,41,28,0.40),0_0_40px_rgba(232,41,28,0.10)] bg-[#111]"
        : "border-white/[0.06] bg-[#111]"
    } ${isActive ? "ring-2 ring-primary/60" : ""}`}>

      {isActive && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex rounded-full bg-primary px-3 py-0.5 text-[11px] font-bold text-primary-foreground">✓ Current plan</span>
        </div>
      )}
      {!isActive && plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex rounded-full bg-primary px-3 py-0.5 text-[11px] font-bold text-primary-foreground">Most popular</span>
        </div>
      )}

      <div className="flex items-center gap-3 mb-5">
        <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <plan.icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-bold text-white">{plan.name}</p>
          <p className="text-xs text-muted-foreground">{plan.tagline}</p>
        </div>
      </div>

      <div className="mb-5">
        {isFree
          ? <p className="text-3xl font-bold text-white">Free</p>
          : <p className="text-3xl font-bold text-white">
              {formatINR(price)}
              <span className="text-sm text-muted-foreground font-normal ml-1">/{billing === "monthly" ? "mo" : "yr"}</span>
            </p>
        }
      </div>

      <ul className="space-y-2 text-sm mb-6 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span className="text-white/80 leading-snug">{f}</span>
          </li>
        ))}
      </ul>

      {isActive ? (
        <Button disabled className="w-full h-10 bg-primary/20 border border-primary/40 text-primary cursor-default rounded-xl text-sm font-semibold">
          <CheckCircle className="h-4 w-4 mr-2" /> Active
        </Button>
      ) : isFree ? (
        <Button disabled variant="outline" className="w-full h-10 rounded-xl opacity-60 text-sm">Included</Button>
      ) : notLoggedIn ? (
        <Link href="/login" className="block">
          <Button className="w-full h-10 bg-primary text-primary-foreground border-0 rounded-xl text-sm font-semibold hover:bg-primary-hover">Log in to subscribe</Button>
        </Link>
      ) : (
        <Button onClick={onSubscribe} disabled={loading}
          className="w-full h-10 bg-primary text-primary-foreground border-0 rounded-xl text-sm font-semibold hover:bg-primary-hover">
          {loading ? "Activating…" : `Get ${plan.name}`}
        </Button>
      )}
    </div>
  );
}
