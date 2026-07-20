import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { openRazorpayCheckout } from "@/lib/razorpayCheckout";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type Billing = "monthly" | "yearly";

interface Sub {
  id: number;
  planType: string;
  planPeriod: Billing;
  price: string;
  status: string;
  expiresAt: string;
}

interface PlanConfig {
  showGrowthPlan: boolean;
  showPremiumPartner: boolean;
  showRoyalPlan: boolean;
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

interface UserPlanDef {
  id: string; name: string; tagline: string;
  monthly: number; yearly: number;
  icon: keyof typeof Ionicons.glyphMap;
  popular?: boolean;
  features: readonly string[];
  planType: string | null;
}

const USER_PLANS: UserPlanDef[] = [
  {
    id: "free", name: "Free", tagline: "Get started for free",
    monthly: 0, yearly: 0, icon: "star-outline",
    features: ["Browse pubs and events", "Standard ticket & table booking", "Access to public offers"],
    planType: null,
  },
  {
    id: "user_plus", name: "RoyVento Plus", tagline: "For regular nightlifers",
    monthly: 149, yearly: 1490, icon: "sparkles-outline", popular: true,
    features: ["Reduced or zero convenience fees", "Exclusive member-only offers", "Early access to tickets & events", "Priority table reservations", "Birthday rewards", "Loyalty points on every booking"],
    planType: "user_plus",
  },
  {
    id: "user_vip", name: "RoyVento VIP", tagline: "The ultimate nightlife pass",
    monthly: 499, yearly: 4990, icon: "diamond-outline",
    features: ["All Plus benefits included", "VIP event access", "Complimentary venue offers", "Priority support", "Exclusive nightlife experiences", "Higher loyalty rewards multiplier", "Create & Join Solo Connect activity groups"],
    planType: "user_vip",
  },
];

interface PartnerPlanDef {
  id: string; name: string; tagline: string;
  monthly: number; yearly: number;
  icon: keyof typeof Ionicons.glyphMap;
  popular?: boolean;
  features: readonly string[];
  planType: string | null;
}

const PARTNER_PLANS: PartnerPlanDef[] = [
  {
    id: "basic", name: "Basic Partner", tagline: "Get your venue listed",
    monthly: 0, yearly: 0, icon: "business-outline",
    features: ["Pub listing", "Event management", "Booking management", "Basic reports"],
    planType: null,
  },
  {
    id: "partner_growth", name: "Growth Plan", tagline: "Grow your venue business",
    monthly: 2999, yearly: 32989, icon: "trending-up-outline", popular: true,
    features: ["Profile visits boost", "Pro event analytics", "Priority search ranking", "Premium member badge", "Advanced booking & revenue reports", "Full customer database access", "5 days free Facebook & Instagram marketing"],
    planType: "partner_growth",
  },
  {
    id: "partner_premium", name: "Premium Partner Plan", tagline: "Dominate your market",
    monthly: 5999, yearly: 65989, icon: "ribbon-outline",
    features: ["Growth Plan included", "Event promotion", "Email marketing", "WhatsApp marketing", "Dedicated account manager", "AI features (coming soon)", "12 days free Facebook & Instagram marketing", "Offline campaigns"],
    planType: "partner_premium",
  },
  {
    id: "partner_royal", name: "Royal Partner Plan", tagline: "The ultimate venue experience",
    monthly: 9999, yearly: 109989, icon: "diamond-outline",
    features: ["Growth Plan & Partner Plan included", "Homepage promotion", "Drinks deal promotion", "Event promotion", "16 days Facebook & Instagram marketing", "Offline marketing"],
    planType: "partner_royal",
  },
];

const PARTNER_BENEFITS = [
  { icon: "eye-outline" as const, label: "More Visibility", desc: "Get your venue discovered by thousands of party-goers" },
  { icon: "calendar-outline" as const, label: "More Bookings", desc: "Receive more table bookings and guest lists" },
  { icon: "trending-up-outline" as const, label: "More Revenue", desc: "Increase footfall and maximize your business growth" },
  { icon: "bar-chart-outline" as const, label: "Analytics & Insights", desc: "Track performance and make data-driven decisions" },
  { icon: "megaphone-outline" as const, label: "Marketing Support", desc: "Promote your events and offers effectively" },
];

const SUCCESS_STORIES = [
  { name: "Skyline Club", result: "+300%", desc: "Increased footfall by 300% in 2 months" },
  { name: "Lounge 24", result: "+250%", desc: "Boosted bookings by 250% with Royvento" },
  { name: "The Pump House", result: "+95%", desc: "Achieved 95% occupancy on weekends" },
];

const LOYALTY_EARN = [
  { icon: "ticket-outline" as const, label: "Ticket bookings", pts: "+50 pts / booking" },
  { icon: "people-outline" as const, label: "Table bookings", pts: "+60 pts / booking" },
  { icon: "heart-outline" as const, label: "Event participation", pts: "+50 pts / event" },
  { icon: "trophy-outline" as const, label: "Membership renewal", pts: "+200 pts / renewal" },
];

const LOYALTY_REDEEM = [
  { icon: "gift-outline" as const, label: "Discount vouchers", desc: "Redeem points for % off coupons" },
  { icon: "ticket-outline" as const, label: "Free tickets", desc: "Convert points to event tickets" },
  { icon: "diamond-outline" as const, label: "VIP upgrades", desc: "Unlock VIP access with points" },
  { icon: "sparkles-outline" as const, label: "Exclusive rewards", desc: "Special partner rewards & perks" },
];

const TRUST_STRIP = [
  { icon: "star-outline" as const, label: "Featured Pub Listings", desc: "Get top placement in search results and category pages." },
  { icon: "sparkles-outline" as const, label: "Sponsored Events", desc: "Promote your events to a wider targeted audience." },
  { icon: "bar-chart-outline" as const, label: "Premium Analytics", desc: "Deep customer insights, heatmaps and revenue reports." },
  { icon: "chatbubble-outline" as const, label: "Priority Support", desc: "Dedicated account manager for Premium partners." },
];

function formatINR(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

export default function SubscriptionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const [loading, setLoading] = useState(false);
  const [billing, setBilling] = useState<Billing>("monthly");

  const planConfigQuery = useQuery<PlanConfig>({
    queryKey: ["plan-config"],
    queryFn: () => customFetch<PlanConfig>("/api/plan-config"),
  });
  const planConfig = planConfigQuery.data ?? { showGrowthPlan: true, showPremiumPartner: true, showRoyalPlan: true };

  const activeQuery = useQuery<Sub | null>({
    queryKey: ["subscription-me"],
    queryFn: () => customFetch<Sub | null>("/api/subscriptions/me"),
    enabled: !!user,
  });
  const active = activeQuery.data ?? null;

  const isVendor = user?.role === "vendor" || user?.role === "admin";

  const visiblePartnerPlans = PARTNER_PLANS.filter((p) => {
    if (p.id === "partner_growth" && !planConfig.showGrowthPlan) return false;
    if (p.id === "partner_premium" && !planConfig.showPremiumPartner) return false;
    if (p.id === "partner_royal" && !planConfig.showRoyalPlan) return false;
    return true;
  });

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

  async function subscribe(planType: string) {
    if (!user) {
      Alert.alert("Sign in required", "Please sign in to subscribe.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => router.push("/(auth)/login") },
      ]);
      return;
    }
    setLoading(true);
    try {
      const result = await customFetch<{ paymentPending?: boolean; razorpayOrderId?: string; amountPaise?: number; subscriptionId?: number } | Record<string, unknown>>(
        "/api/subscriptions",
        {
          method: "POST",
          body: JSON.stringify({ planType, planPeriod: billing }),
          headers: { "Content-Type": "application/json" },
        }
      );

      const r = result as { paymentPending?: boolean; razorpayOrderId?: string; amountPaise?: number; subscriptionId?: number };
      if (r && r.paymentPending && r.razorpayOrderId) {
        const planLabel = PLAN_DISPLAY_NAMES[planType] ?? planType;
        const pay = await openRazorpayCheckout({
          orderId: r.razorpayOrderId,
          amountPaise: r.amountPaise ?? 0,
          name: "Royvento",
          description: `${planLabel} — ${billing}`,
          prefillName: user.name,
          prefillEmail: user.email,
          prefillContact: user.phone,
          rid: r.subscriptionId,
        });

        const { data: refreshedSub } = await activeQuery.refetch();

        if (pay === "success") {
          Alert.alert("Subscription activated!", "Enjoy your RoyVento membership.");
        } else if (pay === "cancelled") {
          if (!refreshedSub) {
            Alert.alert("Payment cancelled", "You closed the payment screen before completing.");
          }
        } else {
          Alert.alert("Payment failed", "No amount was charged. Please try again.");
        }
      } else {
        await activeQuery.refetch();
        Alert.alert("Subscription activated!", "Enjoy your RoyVento membership.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to activate subscription";
      Alert.alert("Failed", message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: topPadding + 16, paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color={colors.foreground} />
      </Pressable>

      <View style={styles.heroSection}>
        <LinearGradient colors={[colors.primary + "30", "transparent"]} style={styles.heroBadge}>
          <Ionicons name="star" size={14} color={colors.primary} />
          <Text style={[styles.heroBadgeText, { color: colors.primary }]}>For Pub & Club Owners</Text>
        </LinearGradient>
        <Text style={[styles.heroTitle, { color: colors.foreground }]}>Choose the perfect plan to{"\n"}grow your business</Text>
        <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
          Get more visibility, more customers and more revenue with Royvento.
        </Text>

        {/* Billing toggle */}
        <View style={[styles.billingToggle, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.billingOption, billing === "monthly" && { backgroundColor: colors.card }]}
            onPress={() => setBilling("monthly")}
          >
            <Text style={[styles.billingText, { color: billing === "monthly" ? colors.foreground : colors.mutedForeground }]}>Monthly</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.billingOption, billing === "yearly" && { backgroundColor: colors.card }, { flexDirection: "row", gap: 6, alignItems: "center" }]}
            onPress={() => setBilling("yearly")}
          >
            <Text style={[styles.billingText, { color: billing === "yearly" ? colors.foreground : colors.mutedForeground }]}>Yearly</Text>
            <Text style={[styles.billingSaveText, { color: colors.primary }]}>Save up to 20%</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Active Subscription */}
      {active && (
        <View style={[styles.activeCard, { backgroundColor: colors.card, borderColor: colors.primary + "60" }]}>
          <View style={[styles.activeIcon, { backgroundColor: colors.primary + "20" }]}>
            <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.activeLabel, { color: colors.mutedForeground }]}>Active Plan</Text>
            <Text style={[styles.activePlan, { color: colors.foreground }]}>
              {PLAN_DISPLAY_NAMES[active.planType] ?? active.planType}
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}> · {active.planPeriod}</Text>
            </Text>
            <Text style={[styles.activeExpiry, { color: colors.mutedForeground }]}>
              Renews {new Date(active.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </Text>
          </View>
          <Text style={[styles.activePrice, { color: colors.primary }]}>
            {formatINR(Number(active.price))}/{active.planPeriod === "monthly" ? "mo" : "yr"}
          </Text>
        </View>
      )}

      {/* Partner Plans */}
      {isVendor ? (
        <View style={styles.plans}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Partner Plans</Text>
          {visiblePartnerPlans.map((plan) => {
            const price = billing === "monthly" ? plan.monthly : plan.yearly;
            const isFree = price === 0;
            const isActive = isActivePartnerPlan(plan.planType);
            return (
              <View
                key={plan.id}
                style={[
                  styles.planCard,
                  plan.popular && styles.accentCard,
                  { backgroundColor: colors.card, borderColor: plan.popular ? colors.primary : colors.border },
                  isActive && { borderColor: colors.primary, borderWidth: 2 },
                ]}
              >
                {plan.popular && !isActive && (
                  <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.popularBadgeText, { color: colors.primaryForeground }]}>Most Popular</Text>
                  </View>
                )}
                {isActive && (
                  <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.popularBadgeText, { color: colors.primaryForeground }]}>✓ Current Plan</Text>
                  </View>
                )}
                <View style={styles.planHeader}>
                  <View style={[styles.planIcon, { backgroundColor: colors.primary + "20" }]}>
                    <Ionicons name={plan.icon} size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planTitle, { color: colors.foreground }]}>{plan.name}</Text>
                    <Text style={[styles.planTagline, { color: colors.mutedForeground }]}>{plan.tagline}</Text>
                  </View>
                </View>
                <View style={styles.priceRow}>
                  {isFree ? (
                    <Text style={[styles.price, { color: colors.foreground }]}>Free</Text>
                  ) : (
                    <Text style={[styles.price, { color: colors.foreground }]}>
                      {formatINR(price)}<Text style={[styles.pricePer, { color: colors.mutedForeground }]}>/{billing === "monthly" ? "mo" : "yr"}</Text>
                    </Text>
                  )}
                </View>
                <View style={styles.features}>
                  {plan.features.map((f) => (
                    <View key={f} style={styles.featureRow}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                      <Text style={[styles.featureText, { color: colors.foreground }]}>{f}</Text>
                    </View>
                  ))}
                </View>
                {isActive ? (
                  <View style={[styles.subscribeBtn, { backgroundColor: colors.muted, borderColor: colors.primary }]}>
                    <Text style={[styles.subscribeBtnText, { color: colors.primary }]}>Active</Text>
                  </View>
                ) : isFree ? (
                  <View style={[styles.subscribeBtn, { borderColor: colors.border, opacity: 0.6 }]}>
                    <Text style={[styles.subscribeBtnText, { color: colors.mutedForeground }]}>Included</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.subscribeBtn, styles.subscribeBtnAccent, { backgroundColor: colors.primary }, loading && { opacity: 0.7 }]}
                    onPress={() => subscribe(plan.planType!)}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color={colors.primaryForeground} size="small" />
                    ) : (
                      <Text style={[styles.subscribeBtnText, { color: colors.primaryForeground }]}>Choose Plan</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* Why Royvento */}
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.infoCardTitle, { color: colors.mutedForeground }]}>Why Royvento</Text>
            {PARTNER_BENEFITS.map((b) => (
              <View key={b.label} style={styles.benefitRow}>
                <View style={[styles.benefitIcon, { backgroundColor: colors.primary + "15" }]}>
                  <Ionicons name={b.icon} size={14} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.benefitLabel, { color: colors.foreground }]}>{b.label}</Text>
                  <Text style={[styles.benefitDesc2, { color: colors.mutedForeground }]}>{b.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Success stories */}
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.infoCardTitle, { color: colors.mutedForeground }]}>Success Stories</Text>
            {SUCCESS_STORIES.map((s) => (
              <View key={s.name} style={styles.storyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.storyName, { color: colors.primary }]}>{s.name}</Text>
                  <Text style={[styles.storyDesc, { color: colors.mutedForeground }]}>{s.desc}</Text>
                </View>
                <Text style={[styles.storyResult, { color: colors.primary }]}>{s.result}</Text>
              </View>
            ))}
            <Text style={[styles.storyFooter, { color: colors.mutedForeground }]}>
              Join 1,200+ venues already growing with Royvento.
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.teaserCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="business-outline" size={40} color={colors.primary} style={{ opacity: 0.6 }} />
          <Text style={[styles.teaserTitle, { color: colors.foreground }]}>Want partner features?</Text>
          <Text style={[styles.teaserSub, { color: colors.mutedForeground }]}>
            Apply to list your pub or club on Royvento and unlock Growth or Premium partner plans with advanced marketing and analytics tools.
          </Text>
          <TouchableOpacity style={[styles.teaserBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/become-vendor")}>
            <Text style={[styles.teaserBtnText, { color: colors.primaryForeground }]}>Apply to become a partner →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Member Plans */}
      <View style={styles.plans}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Member Plans</Text>
        {USER_PLANS.map((plan) => {
          const price = billing === "monthly" ? plan.monthly : plan.yearly;
          const isFree = price === 0;
          const isActive = isActiveUserPlan(plan.planType);
          return (
            <View
              key={plan.id}
              style={[
                styles.planCard,
                plan.popular && styles.accentCard,
                { backgroundColor: colors.card, borderColor: plan.popular ? colors.primary : colors.border },
                isActive && { borderColor: colors.primary, borderWidth: 2 },
              ]}
            >
              {plan.popular && !isActive && (
                <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.popularBadgeText, { color: colors.primaryForeground }]}>Most Popular</Text>
                </View>
              )}
              {isActive && (
                <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.popularBadgeText, { color: colors.primaryForeground }]}>✓ Current Plan</Text>
                </View>
              )}
              <View style={styles.planHeader}>
                <View style={[styles.planIcon, { backgroundColor: colors.primary + "20" }]}>
                  <Ionicons name={plan.icon} size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.planTitle, { color: colors.foreground }]}>{plan.name}</Text>
                  <Text style={[styles.planTagline, { color: colors.mutedForeground }]}>{plan.tagline}</Text>
                </View>
              </View>
              <View style={styles.priceRow}>
                {isFree ? (
                  <Text style={[styles.price, { color: colors.foreground }]}>Free</Text>
                ) : (
                  <Text style={[styles.price, { color: colors.foreground }]}>
                    {formatINR(price)}<Text style={[styles.pricePer, { color: colors.mutedForeground }]}>/{billing === "monthly" ? "mo" : "yr"}</Text>
                  </Text>
                )}
              </View>
              <View style={styles.features}>
                {plan.features.map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                    <Text style={[styles.featureText, { color: colors.foreground }]}>{f}</Text>
                  </View>
                ))}
              </View>
              {isActive ? (
                <View style={[styles.subscribeBtn, { backgroundColor: colors.muted, borderColor: colors.primary }]}>
                  <Text style={[styles.subscribeBtnText, { color: colors.primary }]}>Active</Text>
                </View>
              ) : isFree ? (
                <View style={[styles.subscribeBtn, { borderColor: colors.border, opacity: 0.6 }]}>
                  <Text style={[styles.subscribeBtnText, { color: colors.mutedForeground }]}>Included</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.subscribeBtn, styles.subscribeBtnAccent, { backgroundColor: colors.primary }, loading && { opacity: 0.7 }]}
                  onPress={() => subscribe(plan.planType!)}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                  ) : (
                    <Text style={[styles.subscribeBtnText, { color: colors.primaryForeground }]}>Get {plan.name}</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>

      {/* Loyalty & Rewards */}
      <View style={styles.plans}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Loyalty & Rewards</Text>
        {user && (
          <View style={[styles.pointsCard, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "40" }]}>
            <Text style={[styles.pointsLabel, { color: colors.primary }]}>Your points balance</Text>
            <Text style={[styles.pointsValue, { color: colors.foreground }]}>
              {(user as unknown as { points?: number }).points ?? 0} <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>pts</Text>
            </Text>
            <Text style={[styles.pointsNote, { color: colors.mutedForeground }]}>RoyVento Plus/VIP members earn bonus points on every booking & event</Text>
          </View>
        )}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.infoCardTitle, { color: colors.mutedForeground }]}>How to earn points</Text>
          {LOYALTY_EARN.map((item) => (
            <View key={item.label} style={styles.earnRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Ionicons name={item.icon} size={16} color={colors.primary} />
                <Text style={[styles.earnLabel, { color: colors.foreground }]}>{item.label}</Text>
              </View>
              <Text style={[styles.earnPts, { color: colors.primary }]}>{item.pts}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.infoCardTitle, { color: colors.mutedForeground }]}>Redeem your points</Text>
          {LOYALTY_REDEEM.map((item) => (
            <View key={item.label} style={styles.benefitRow}>
              <View style={[styles.benefitIcon, { backgroundColor: colors.primary + "15" }]}>
                <Ionicons name={item.icon} size={14} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.benefitLabel, { color: colors.foreground }]}>{item.label}</Text>
                <Text style={[styles.benefitDesc2, { color: colors.mutedForeground }]}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Trust strip */}
      <View style={styles.benefitsGrid}>
        {TRUST_STRIP.map((f) => (
          <View key={f.label} style={[styles.benefitCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name={f.icon} size={20} color={colors.primary} />
            <Text style={[styles.benefitTitle, { color: colors.foreground }]}>{f.label}</Text>
            <Text style={[styles.benefitDesc, { color: colors.mutedForeground }]}>{f.desc}</Text>
          </View>
        ))}
      </View>

      {/* Bottom CTA */}
      <View style={[styles.ctaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.ctaTitle, { color: colors.foreground }]}>Not sure which plan is right for you?</Text>
        <Text style={[styles.ctaSub, { color: colors.mutedForeground }]}>Talk to our team and get a custom solution for your business.</Text>
        <TouchableOpacity style={[styles.ctaBtn, { borderColor: colors.border, backgroundColor: colors.muted }]} onPress={() => router.push("/contact")}>
          <Ionicons name="headset-outline" size={16} color={colors.primary} />
          <Text style={[styles.ctaBtnText, { color: colors.foreground }]}>Talk to Sales</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 20 },
  backBtn: { padding: 4, alignSelf: "flex-start" },
  heroSection: { alignItems: "center", gap: 10, paddingVertical: 8 },
  heroBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  heroBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  heroTitle: { fontSize: 26, fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: 33 },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  billingToggle: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 3, marginTop: 6 },
  billingOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9 },
  billingText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  billingSaveText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  activeCard: { flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1.5, padding: 16, gap: 12 },
  activeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  activeLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  activePlan: { fontSize: 16, fontFamily: "Inter_700Bold" },
  activeExpiry: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  activePrice: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 2 },
  plans: { gap: 16 },
  planCard: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 14 },
  accentCard: { borderWidth: 1.5 },
  popularBadge: { alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginBottom: -4 },
  popularBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  planHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  planIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  planTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  planTagline: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  price: { fontSize: 32, fontFamily: "Inter_700Bold" },
  pricePer: { fontSize: 14, fontFamily: "Inter_400Regular" },
  features: { gap: 10 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  featureText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  subscribeBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", borderWidth: 1.5 },
  subscribeBtnAccent: { borderWidth: 0 },
  subscribeBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  infoCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  infoCardTitle: { fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.8 },
  benefitRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  benefitIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 1 },
  benefitLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  benefitDesc2: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 15 },
  storyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  storyName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  storyDesc: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  storyResult: { fontSize: 15, fontFamily: "Inter_700Bold" },
  storyFooter: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4, lineHeight: 16 },
  teaserCard: { borderRadius: 20, borderWidth: 1, padding: 28, alignItems: "center", gap: 10 },
  teaserTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  teaserSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  teaserBtn: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 6 },
  teaserBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  pointsCard: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 4 },
  pointsLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  pointsValue: { fontSize: 30, fontFamily: "Inter_700Bold" },
  pointsNote: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  earnRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  earnLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  earnPts: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  benefitsGrid: { gap: 10 },
  benefitCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  benefitTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  benefitDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  ctaCard: { borderRadius: 18, borderWidth: 1, padding: 20, gap: 10 },
  ctaTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  ctaSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  ctaBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 12, marginTop: 4 },
  ctaBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
