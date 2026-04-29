import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
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

const USER_FEATURES = [
  "10% off coupon on every renewal",
  "Early access to popular partners",
  "Priority booking support",
  "Members-only pubs & lounges",
  "Concierge add-ons",
];

const PARTNER_FEATURES = [
  "Unlock leads / CRM dashboard",
  "Profile-view analytics",
  "Run promoted ads (admin-approved)",
  "Unlimited media uploads",
  "Premium badge on your listings",
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

  const pricesQuery = useQuery<PriceData>({
    queryKey: ["subscription-prices"],
    queryFn: () => customFetch<PriceData>("/api/subscriptions/prices"),
  });

  const activeQuery = useQuery<Sub | null>({
    queryKey: ["subscription-me"],
    queryFn: () => customFetch<Sub | null>("/api/subscriptions/me"),
    enabled: !!user,
  });

  const prices = pricesQuery.data;
  const active = activeQuery.data;

  const userMonthly = prices?.user.monthly ?? 199;
  const partnerMonthly = prices?.partner.monthly ?? 999;
  const newUserDiscount = prices?.isNewUser ? prices.user.newUserDiscountPercent : 0;
  const userFinal = newUserDiscount > 0 ? Math.round(userMonthly * (1 - newUserDiscount / 100)) : userMonthly;
  const partnerFinal = newUserDiscount > 0 ? Math.round(partnerMonthly * (1 - newUserDiscount / 100)) : partnerMonthly;

  async function subscribe(planType: "user" | "partner") {
    if (!user) {
      Alert.alert("Sign in required", "Please sign in to subscribe.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => router.push("/(auth)/login") },
      ]);
      return;
    }
    if (planType === "partner" && user.role !== "vendor") {
      Alert.alert(
        "Partner account required",
        "The Partner Premium plan is only available to registered partners.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Apply as Partner", onPress: () => router.push("/become-vendor") },
        ]
      );
      return;
    }
    setLoading(true);
    try {
      await customFetch("/api/subscriptions", {
        method: "POST",
        body: JSON.stringify({ planType, planPeriod: "monthly" }),
        headers: { "Content-Type": "application/json" },
      });
      activeQuery.refetch();
      Alert.alert("Subscription activated", "Welcome to Royvento Premium!");
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
        <LinearGradient
          colors={[colors.primary + "30", "transparent"]}
          style={styles.heroBadge}
        >
          <Ionicons name="star" size={14} color={colors.primary} />
          <Text style={[styles.heroBadgeText, { color: colors.primary }]}>Royvento Premium</Text>
        </LinearGradient>
        <Text style={[styles.heroTitle, { color: colors.foreground }]}>A members club for{"\n"}hosts & partners</Text>
        <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
          Unlock premium features and exclusive benefits.
        </Text>
        {prices?.isNewUser && (
          <View style={[styles.discountBadge, { backgroundColor: colors.primary + "20", borderColor: colors.primary + "40" }]}>
            <Ionicons name="sparkles" size={14} color={colors.primary} />
            <Text style={[styles.discountText, { color: colors.primary }]}>
              New-member offer: <Text style={{ fontFamily: "Inter_700Bold" }}>{newUserDiscount}% off</Text> any plan
            </Text>
          </View>
        )}
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
              {active.planType === "user" ? "Royvento Member" : "Partner Premium"}
            </Text>
            <Text style={[styles.activeExpiry, { color: colors.mutedForeground }]}>
              Renews {new Date(active.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </Text>
          </View>
          <Text style={[styles.activePrice, { color: colors.primary }]}>{formatINR(Number(active.price))}/mo</Text>
        </View>
      )}

      {/* Plan Cards */}
      <View style={styles.plans}>
        {/* Member Plan */}
        <View style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.planHeader}>
            <View style={[styles.planIcon, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="sparkles" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.planTitle, { color: colors.foreground }]}>Royvento Member</Text>
              <Text style={[styles.planTagline, { color: colors.mutedForeground }]}>For hosts who plan ahead</Text>
            </View>
          </View>
          <View style={styles.priceRow}>
            {newUserDiscount > 0 && (
              <Text style={[styles.strikePrice, { color: colors.mutedForeground }]}>{formatINR(userMonthly)}</Text>
            )}
            <Text style={[styles.price, { color: colors.foreground }]}>
              {formatINR(userFinal)}<Text style={[styles.pricePer, { color: colors.mutedForeground }]}>/mo</Text>
            </Text>
          </View>
          <View style={styles.features}>
            {USER_FEATURES.map((f) => (
              <View key={f} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                <Text style={[styles.featureText, { color: colors.foreground }]}>{f}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={[
              styles.subscribeBtn,
              { borderColor: colors.primary, backgroundColor: active?.planType === "user" ? colors.muted : "transparent" },
              loading && { opacity: 0.7 },
            ]}
            onPress={() => subscribe("user")}
            disabled={loading || active?.planType === "user"}
          >
            {loading ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={[styles.subscribeBtnText, { color: active?.planType === "user" ? colors.mutedForeground : colors.primary }]}>
                {active?.planType === "user" ? "Current Plan" : `Subscribe — ${formatINR(userFinal)}/mo`}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Partner Plan */}
        <View style={[styles.planCard, styles.accentCard, { backgroundColor: colors.card, borderColor: colors.primary + "60" }]}>
          <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.popularBadgeText, { color: colors.primaryForeground }]}>Most Popular</Text>
          </View>
          <View style={styles.planHeader}>
            <View style={[styles.planIcon, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="ribbon" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.planTitle, { color: colors.foreground }]}>Partner Premium</Text>
              <Text style={[styles.planTagline, { color: colors.mutedForeground }]}>For studios & venues</Text>
            </View>
          </View>
          <View style={styles.priceRow}>
            {newUserDiscount > 0 && (
              <Text style={[styles.strikePrice, { color: colors.mutedForeground }]}>{formatINR(partnerMonthly)}</Text>
            )}
            <Text style={[styles.price, { color: colors.foreground }]}>
              {formatINR(partnerFinal)}<Text style={[styles.pricePer, { color: colors.mutedForeground }]}>/mo</Text>
            </Text>
          </View>
          <View style={styles.features}>
            {PARTNER_FEATURES.map((f) => (
              <View key={f} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                <Text style={[styles.featureText, { color: colors.foreground }]}>{f}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={[
              styles.subscribeBtn,
              styles.subscribeBtnAccent,
              { backgroundColor: active?.planType === "partner" ? colors.muted : colors.primary, borderColor: colors.primary },
              loading && { opacity: 0.7 },
            ]}
            onPress={() => subscribe("partner")}
            disabled={loading || active?.planType === "partner"}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Text style={[styles.subscribeBtnText, { color: active?.planType === "partner" ? colors.mutedForeground : colors.primaryForeground }]}>
                {active?.planType === "partner" ? "Current Plan" : `Subscribe — ${formatINR(partnerFinal)}/mo`}
              </Text>
            )}
          </TouchableOpacity>
          {user && user.role !== "vendor" && (
            <Pressable style={styles.applyLink} onPress={() => router.push("/become-vendor")}>
              <Text style={[styles.applyLinkText, { color: colors.primary }]}>Apply to become a partner →</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Benefits grid */}
      <View style={styles.benefitsGrid}>
        {[
          { icon: "calendar-outline" as const, title: "Cancel anytime", desc: "Subscriptions can be cancelled from your profile." },
          { icon: "arrow-up-circle-outline" as const, title: "Upgrades welcome", desc: "Move between plans without losing benefits." },
          { icon: "gift-outline" as const, title: "Real reward", desc: "Each plan grants you a usable coupon code." },
        ].map((b) => (
          <View key={b.title} style={[styles.benefitCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name={b.icon} size={20} color={colors.primary} />
            <Text style={[styles.benefitTitle, { color: colors.foreground }]}>{b.title}</Text>
            <Text style={[styles.benefitDesc, { color: colors.mutedForeground }]}>{b.desc}</Text>
          </View>
        ))}
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
  heroTitle: { fontSize: 28, fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: 36 },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  discountBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  discountText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  activeCard: { flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1.5, padding: 16, gap: 12 },
  activeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  activeLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  activePlan: { fontSize: 16, fontFamily: "Inter_700Bold" },
  activeExpiry: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  activePrice: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
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
  strikePrice: { fontSize: 16, textDecorationLine: "line-through" },
  price: { fontSize: 36, fontFamily: "Inter_700Bold" },
  pricePer: { fontSize: 14, fontFamily: "Inter_400Regular" },
  features: { gap: 10 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  featureText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  subscribeBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", borderWidth: 1.5 },
  subscribeBtnAccent: { borderWidth: 0 },
  subscribeBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  applyLink: { alignItems: "center" },
  applyLinkText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  benefitsGrid: { gap: 10 },
  benefitCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  benefitTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  benefitDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
