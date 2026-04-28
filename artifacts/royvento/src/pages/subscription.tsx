import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Crown, Check, Sparkles, Calendar, Users, Sparkle, CheckCircle, XCircle } from "lucide-react";
import { apiGet, apiPost, formatINR } from "@/lib/api";

interface Sub {
  id: number;
  planType: "user" | "partner";
  planPeriod: "monthly" | "yearly";
  price: string;
  status: string;
  expiresAt: string;
}

interface PriceData {
  user: { monthly: number; yearly: number; newUserDiscountPercent: number };
  partner: { monthly: number; yearly: number; newUserDiscountPercent: number };
  isNewUser: boolean;
}

export function Subscription() {
  const { data: me, refetch } = useGetMe({ query: { retry: false } as any });
  const user = me?.user as any;
  const [active, setActive] = useState<Sub | null>(null);
  const [prices, setPrices] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const paymentParam = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("payment")
    : null;

  useEffect(() => {
    apiGet<PriceData>("/api/subscriptions/prices").then(setPrices).catch(() => {});
    if (user) apiGet<Sub | null>("/api/subscriptions/me").then(setActive).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (paymentParam === "success") {
      refetch();
      apiGet<Sub | null>("/api/subscriptions/me").then(setActive).catch(() => {});
    }
  }, [paymentParam]);

  const subscribe = async (planType: "user" | "partner", planPeriod: "monthly" | "yearly") => {
    if (!user) {
      toast({ title: "Please log in first", variant: "destructive" });
      return;
    }
    if (planType === "partner" && user.role !== "vendor") {
      toast({
        title: "Partner plan requires partner account",
        description: "Apply to become a partner first.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const result = await apiPost<{ id?: number; status?: string; requiresPayment?: boolean; redirectUrl?: string } & Partial<Sub>>("/api/subscriptions", { planType, planPeriod });
      if (result?.requiresPayment && result?.redirectUrl) {
        toast({ title: "Redirecting to payment…", description: "You will be taken to PhonePe to complete your payment." });
        window.location.href = result.redirectUrl;
        return;
      }
      setActive(result as Sub);
      refetch();
      toast({
        title: "Subscription activated",
        description: "Welcome to Royvento Premium!",
      });
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const userMonthly = prices?.user.monthly ?? 199;
  const partnerMonthly = prices?.partner.monthly ?? 999;
  const newUserDiscount = prices?.isNewUser ? prices.user.newUserDiscountPercent : 0;
  const userPriceFinal = newUserDiscount > 0 ? Math.round(userMonthly * (1 - newUserDiscount / 100)) : userMonthly;
  const partnerPriceFinal = newUserDiscount > 0 ? Math.round(partnerMonthly * (1 - newUserDiscount / 100)) : partnerMonthly;

  return (
    <div className="container mx-auto px-4 md:px-6 py-16">
      {paymentParam === "success" && (
        <div className="max-w-3xl mx-auto mb-8 rounded-2xl border border-green-500/40 bg-green-900/20 p-5 flex items-center gap-4">
          <CheckCircle className="h-6 w-6 text-green-400 shrink-0" />
          <div>
            <p className="font-medium text-green-200">Payment successful!</p>
            <p className="text-sm text-green-300/80">Your subscription is now active. Enjoy Royvento Premium.</p>
          </div>
        </div>
      )}
      {paymentParam === "failed" && (
        <div className="max-w-3xl mx-auto mb-8 rounded-2xl border border-red-500/40 bg-red-900/20 p-5 flex items-center gap-4">
          <XCircle className="h-6 w-6 text-red-400 shrink-0" />
          <div>
            <p className="font-medium text-red-200">Payment failed</p>
            <p className="text-sm text-red-300/80">Your payment could not be processed. No amount was charged. Please try again.</p>
          </div>
        </div>
      )}

      <header className="max-w-3xl mx-auto text-center mb-14">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/20 border border-primary/40 px-3 py-1 text-xs uppercase tracking-wider text-primary mb-5">
          <Crown className="h-3.5 w-3.5" /> Royvento Premium
        </div>
        <h1 className="font-serif text-4xl md:text-6xl tracking-tight">A members club for hosts &amp; partners</h1>
        <p className="mt-5 text-white/60 leading-relaxed">
          Unlock premium features and exclusive benefits for events and venues.
        </p>
        {prices?.isNewUser && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary/15 border border-primary/40 px-4 py-2 text-sm text-primary">
            <Sparkle className="h-4 w-4" /> New-member offer: <strong>50% off</strong> any plan.
          </div>
        )}
      </header>

      {active && (
        <div className="max-w-3xl mx-auto mb-10 rounded-2xl glass-card-strong red-ring p-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-primary">Active plan</p>
            <p className="font-serif text-2xl mt-1">
              {active.planType === "user" ? "Royvento Member" : "Royvento Partner Premium"}
              <span className="text-sm text-muted-foreground ml-2">· {active.planPeriod}</span>
            </p>
            <p className="text-sm text-white/60 mt-1">
              Renews on {new Date(active.expiresAt).toLocaleDateString()}
            </p>
          </div>
          <Badge className="bg-primary border-0 text-primary-foreground">{formatINR(Number(active.price))}</Badge>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
        <PlanCard
          title="Royvento Member"
          tagline="For hosts who plan ahead"
          basePrice={userMonthly}
          finalPrice={userPriceFinal}
          discountPercent={newUserDiscount}
          period="monthly"
          icon={Sparkles}
          features={[
            "10% off coupon on every renewal",
            "Early access to popular partners",
            "Priority booking support",
            "Members-only pubs &amp; lounges",
            "Concierge add-ons (demo)",
          ]}
          cta={loading ? "Activating…" : `Subscribe — ${formatINR(userPriceFinal)}/mo`}
          onSubscribe={() => subscribe("user", "monthly")}
          disabled={loading}
        />
        <PlanCard
          title="Partner Premium"
          tagline="For studios &amp; venues"
          basePrice={partnerMonthly}
          finalPrice={partnerPriceFinal}
          discountPercent={newUserDiscount}
          period="monthly"
          icon={Crown}
          accent
          features={[
            "Unlock leads / CRM dashboard",
            "Profile-view analytics",
            "Run promoted ads (admin-approved)",
            "Unlimited media uploads",
            "Premium badge on your listings",
          ]}
          cta={loading ? "Activating…" : `Subscribe — ${formatINR(partnerPriceFinal)}/mo`}
          onSubscribe={() => subscribe("partner", "monthly")}
          disabled={loading || (user && user.role !== "vendor")}
          footer={
            user && user.role !== "vendor" ? (
              <Link href="/dashboard/become-vendor" className="text-xs text-primary hover:underline">
                Apply to become a partner →
              </Link>
            ) : null
          }
        />
      </div>

      <div className="max-w-5xl mx-auto mt-12 grid md:grid-cols-3 gap-4">
        {[
          { icon: Calendar, t: "Cancel anytime", d: "Demo subscriptions can be cancelled from your profile." },
          { icon: Users, t: "Upgrades welcome", d: "Move between member and partner plans without losing benefits." },
          { icon: Sparkles, t: "Real reward", d: "Each plan automatically grants you a usable coupon code." },
        ].map((x) => (
          <div key={x.t} className="rounded-2xl glass-card p-5">
            <x.icon className="h-5 w-5 text-primary mb-3" />
            <p className="font-medium">{x.t}</p>
            <p className="text-sm text-white/60 mt-1">{x.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanCard({
  title, tagline, basePrice, finalPrice, discountPercent, period, icon: Icon, features, cta, onSubscribe, disabled, accent, footer,
}: {
  title: string;
  tagline: string;
  basePrice: number;
  finalPrice: number;
  discountPercent: number;
  period: string;
  icon: any;
  features: string[];
  cta: string;
  onSubscribe: () => void;
  disabled?: boolean;
  accent?: boolean;
  footer?: React.ReactNode;
}) {
  const hasDiscount = discountPercent > 0 && finalPrice < basePrice;
  return (
    <div className={`relative rounded-3xl ${accent ? "glass-card-strong red-glow" : "glass-card"} p-8 lift-3d`}>
      {accent && (
        <div className="absolute -top-3 left-8">
          <Badge className="bg-primary border-0 text-primary-foreground">Most popular</Badge>
        </div>
      )}
      {hasDiscount && (
        <div className="absolute -top-3 right-8">
          <Badge className="bg-primary/90 border-0">New-member {discountPercent}% off</Badge>
        </div>
      )}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-primary/20 text-primary flex items-center justify-center red-ring">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="font-serif text-2xl tracking-tight">{title}</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{tagline}</p>
        </div>
      </div>
      <div className="mt-6">
        {hasDiscount && (
          <p className="text-base text-muted-foreground line-through">{formatINR(basePrice)}</p>
        )}
        <p className="font-serif text-5xl tracking-tight">
          {formatINR(finalPrice)}
          <span className="text-sm text-muted-foreground font-sans"> /{period === "monthly" ? "mo" : "yr"}</span>
        </p>
      </div>
      <ul className="mt-6 space-y-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span dangerouslySetInnerHTML={{ __html: f }} />
          </li>
        ))}
      </ul>
      <Button
        onClick={onSubscribe}
        disabled={disabled}
        className={`w-full mt-7 h-12 ${accent ? "bg-primary hover:bg-primary/90 text-primary-foreground border-0" : ""}`}
      >
        {cta}
      </Button>
      {footer && <div className="mt-3 text-center">{footer}</div>}
    </div>
  );
}
