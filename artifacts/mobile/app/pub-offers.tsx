import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useListVendorDrinkOffers } from "@workspace/api-client-react";
import type { VendorDrinkOffer, DrinkPlanSummary } from "@workspace/api-client-react";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useColors } from "@/hooks/useColors";

function getPlanLabel(plan: DrinkPlanSummary): string {
  if (plan.type === "welcome") return "Free welcome drink";
  if (plan.type === "unlimited") return "Unlimited drinks";
  if (plan.type === "ticket") {
    const count = (plan.lineItems ?? []).filter((i: { name?: string }) => i.name).length;
    return count > 0 ? `${count} item${count !== 1 ? "s" : ""} with ticket` : "Drinks with ticket";
  }
  return plan.productName || "Drinks discount";
}

function DrinkDealCard({ item }: { item: VendorDrinkOffer }) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.dealCard,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
      onPress={() => {
        if (item.pubEventId) {
          router.push(`/event/${item.pubEventId}` as never);
        } else {
          router.push(`/partner/${item.vendorId}` as never);
        }
      }}
    >
      <View style={[styles.dealBody, { borderTopColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <View style={[styles.planIcon, { backgroundColor: colors.primary + "22" }]}>
            <Ionicons name="wine-outline" size={14} color={colors.primary} />
          </View>
          <Text style={[styles.dealVenueName, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{item.vendorName}</Text>
          <View style={[styles.dealTypeBadge, { backgroundColor: colors.primary + "22" }]}>
            <Ionicons name="wine-outline" size={10} color={colors.primary} />
            <Text style={[styles.dealTypeBadgeText, { color: colors.primary }]}>Deals</Text>
          </View>
        </View>
      
        {item.plans.slice(0, 3).map((plan: DrinkPlanSummary, i: number) => (
          <View key={i} style={styles.planRow}>
            <View style={[styles.planIcon, { backgroundColor: colors.primary + "22" }]}>
              <Ionicons
                name={
                  plan.type === "unlimited"
                    ? "wine-outline"
                    : plan.type === "ticket"
                    ? "ticket-outline"
                    : plan.type === "welcome"
                    ? "star-outline"
                    : "pricetag-outline"
                }
                size={12}
                color={colors.primary}
              />
            </View>
            <Text style={[styles.planLabel, { color: colors.foreground }]} numberOfLines={1}>
              {getPlanLabel(plan)}
            </Text>
            <View
              style={[
                styles.genderPill,
                {
                  backgroundColor:
                    plan.gender === "female"
                      ? "rgba(244,63,94,0.15)"
                      : colors.primary + "1A",
                },
              ]}
            >
              <Text
                style={[
                  styles.genderText,
                  { color: plan.gender === "female" ? "#fb7185" : colors.primary },
                ]}
              >
                {plan.gender === "female" ? "Ladies" : "All"}
              </Text>
            </View>
          </View>
        ))}
        {item.plans.length > 3 && (
          <Text style={[styles.morePlans, { color: colors.mutedForeground }]}>
            +{item.plans.length - 3} more deal{item.plans.length - 3 !== 1 ? "s" : ""}
          </Text>
        )}
        <View style={[styles.ctaRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.ctaText, { color: colors.primary }]}>
            {item.pubEventId ? "Book now" : "View venue"}
          </Text>
          <Ionicons name="arrow-forward-circle" size={18} color={colors.primary} />
        </View>
      </View>
    </Pressable>
  );
}

export default function PubOffersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const {
    data: drinkOffers = [],
    isLoading,
    refetch,
    isRefetching,
  } = useListVendorDrinkOffers();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={[styles.header, { paddingTop: topPadding + 16, borderBottomColor: colors.border }]}
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerContent}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Pub Drink Offers</Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              Exclusive drink deals from partner pubs
            </Text>
          </View>
          <View style={[styles.headerIcon, { backgroundColor: colors.primary + "18" }]}>
            <Ionicons name="wine-outline" size={22} color={colors.primary} />
          </View>
        </View>
      </LinearGradient>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetch()}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 },
          ]}
        >
          {drinkOffers.length === 0 ? (
            <View style={{ padding: 20 }}>
              <EmptyState
                icon="wine-outline"
                title="No drink offers yet"
                subtitle="Check back soon — pub partners are adding deals all the time."
              />
            </View>
          ) : (
            <View style={styles.dealsSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="pricetags-outline" size={14} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                  {drinkOffers.length} pub{drinkOffers.length !== 1 ? "s" : ""} with active deals
                </Text>
              </View>
              <FlatList
                data={drinkOffers as VendorDrinkOffer[]}
                keyExtractor={(item) => String(item.vendorId)}
                scrollEnabled={false}
                contentContainerStyle={styles.dealsList}
                renderItem={({ item }) => <DrinkDealCard item={item} />}
                ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
              />
            </View>
          )}
          <MobileFooter />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { padding: 4, alignSelf: "flex-start" },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: { paddingTop: 16 },
  dealsSection: { paddingHorizontal: 20 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  dealsList: { paddingBottom: 4 },
  dealCard: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  dealImageWrap: { height: 160, position: "relative" },
  dealImageBottom: {
    position: "absolute",
    bottom: 12,
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dealVenueName: { flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff", marginRight: 8 },
  dealTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dealTypeBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff", letterSpacing: 0.3 },
  dealBody: { padding: 14, gap: 8, borderTopWidth: 1 },
  planRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  planIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  planLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  genderPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  genderText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  morePlans: { fontSize: 12, fontFamily: "Inter_400Regular", paddingLeft: 34 },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  ctaText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
