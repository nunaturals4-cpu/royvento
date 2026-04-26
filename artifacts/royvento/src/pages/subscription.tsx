import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Crown, Check, Sparkles, Calendar, Users } from "lucide-react";
import { apiGet, apiPost, formatINR } from "@/lib/api";

interface Sub {
  id: number;
  planType: "user" | "partner";
  planPeriod: "monthly" | "yearly";
  price: string;
  status: string;
  expiresAt: string;
}

export function Subscription() {
  const { data: me, refetch } = useGetMe({ query: { retry: false } as any });
  const user = me?.user as any;
  const [active, setActive] = useState<Sub | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;
    apiGet<Sub | null>("/api/subscriptions/me").then(setActive).catch(() => {});
  }, [user]);

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
      const sub = await apiPost<Sub>("/api/subscriptions", { planType, planPeriod });
      setActive(sub);
      refetch();
      toast({
        title: "Subscription activated",
        description: "Welcome to Royvento Premium! A coupon may have been added to your profile.",
      });
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-16">
      <header className="max-w-3xl mx-auto text-center mb-14">
        <div className="inline-flex items-center gap-2 rounded-full bg-red-600/20 border border-red-500/40 px-3 py-1 text-xs uppercase tracking-wider text-red-300 mb-5">
          <Crown className="h-3.5 w-3.5" /> Royvento Premium
        </div>
        <h1 className="font-serif text-4xl md:text-6xl tracking-tight">A members club for hosts &amp; partners</h1>
        <p className="mt-5 text-white/60 leading-relaxed">
          Demo pricing only — no real payment is processed. Once subscribed your account is upgraded instantly.
        </p>
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
          <Badge className="bg-gradient-to-br from-red-500 to-red-700 border-0">{formatINR(Number(active.price))}</Badge>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
        <PlanCard
          title="Royvento Member"
          tagline="For hosts who plan ahead"
          price={200}
          period="monthly"
          icon={Sparkles}
          features={[
            "10% off coupon on every renewal",
            "Early access to popular partners",
            "Priority booking support",
            "Members-only pubs &amp; lounges",
            "Concierge add-ons (demo)",
          ]}
          cta={loading ? "Activating…" : "Subscribe — ₹200/mo"}
          onSubscribe={() => subscribe("user", "monthly")}
          disabled={loading}
        />
        <PlanCard
          title="Partner Premium"
          tagline="For studios &amp; venues"
          price={999}
          period="monthly"
          icon={Crown}
          accent
          features={[
            "Unlock leads / CRM dashboard",
            "Profile-view analytics",
            "Run promoted ads (admin-approved)",
            "Unlimited media uploads",
            "Premium badge on your listings",
            "Google Calendar block-out (stub)",
          ]}
          cta={loading ? "Activating…" : "Subscribe — ₹999/mo"}
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
  title, tagline, price, period, icon: Icon, features, cta, onSubscribe, disabled, accent, footer,
}: {
  title: string;
  tagline: string;
  price: number;
  period: string;
  icon: any;
  features: string[];
  cta: string;
  onSubscribe: () => void;
  disabled?: boolean;
  accent?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <div className={`relative rounded-3xl ${accent ? "glass-card-strong red-glow" : "glass-card"} p-8 lift-3d`}>
      {accent && (
        <div className="absolute -top-3 left-8">
          <Badge className="bg-gradient-to-br from-red-500 to-red-700 border-0">Most popular</Badge>
        </div>
      )}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-red-600/20 text-primary flex items-center justify-center red-ring">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="font-serif text-2xl tracking-tight">{title}</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{tagline}</p>
        </div>
      </div>
      <p className="font-serif text-5xl tracking-tight mt-6">
        {formatINR(price)}
        <span className="text-sm text-muted-foreground font-sans"> /{period === "monthly" ? "mo" : "yr"}</span>
      </p>
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
        className={`w-full mt-7 h-12 ${accent ? "bg-gradient-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 border-0" : ""}`}
      >
        {cta}
      </Button>
      {footer && <div className="mt-3 text-center">{footer}</div>}
    </div>
  );
}
