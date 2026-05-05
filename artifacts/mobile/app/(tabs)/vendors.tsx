import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { customFetch, type Vendor } from "@workspace/api-client-react";
import { type ListVendorsParams } from "@workspace/api-zod";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useState } from "react";
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

const VENDOR_CATEGORIES = [
  "All",
  "Wedding",
  "Corporate",
  "Birthday",
  "Cultural",
  "Private",
  "Festival",
  "Concert",
  "Brand Activation",
  "Pubs",
];

type DanceFloorFilter = NonNullable<ListVendorsParams["danceFloor"]> | "";

const DANCE_FLOOR_OPTIONS: { label: string; value: DanceFloorFilter }[] = [
  { label: "Any", value: "" },
  { label: "Dedicated", value: "dedicated" },
  { label: "Dancing in main area", value: "general" },
  { label: "Seated only", value: "none" },
];

function VendorCard({ vendor }: { vendor: Vendor }) {
  const colors = useColors();
  const image = vendor.bannerImage || vendor.coverImageUrl;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}
      onPress={() => router.push(`/partner/${vendor.id}` as never)}
      accessibilityLabel={vendor.businessName}
    >
      <View style={styles.imageWrap}>
        {image ? (
          <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="business-outline" size={32} color={colors.mutedForeground} />
          </View>
        )}
        <View style={[styles.categoryBadge, { backgroundColor: colors.primary }]}>
          <Text style={[styles.categoryBadgeText, { color: colors.primaryForeground }]}>{vendor.category}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Text style={[styles.vendorName, { color: colors.foreground }]} numberOfLines={1}>{vendor.businessName}</Text>
          {vendor.status === "approved" ? (
            <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
          ) : null}
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
          <Text style={[styles.locationText, { color: colors.mutedForeground }]} numberOfLines={1}>
            {[vendor.city, vendor.state].filter(Boolean).join(", ") || vendor.location || "India"}
          </Text>
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="star" size={12} color={colors.primary} />
          <Text style={[styles.ratingText, { color: colors.foreground }]}>
            {vendor.rating > 0 ? vendor.rating.toFixed(1) : "New"}
          </Text>
          {vendor.reviewCount > 0 ? (
            <Text style={[styles.reviewCount, { color: colors.mutedForeground }]}>({vendor.reviewCount})</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function VendorsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeDanceFloor, setActiveDanceFloor] = useState<DanceFloorFilter>("");
  const [freeEntry, setFreeEntry] = useState(false);

  const params: Record<string, string> = {};
  if (activeCategory !== "All") params["category"] = activeCategory;
  if (activeDanceFloor !== "") params["danceFloor"] = activeDanceFloor;

  const { data: vendors, isLoading, refetch, isRefetching } = useQuery<Vendor[]>({
    queryKey: ["vendors", params],
    queryFn: () => {
      const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
      return customFetch<Vendor[]>(`/api/vendors${qs ? `?${qs}` : ""}`);
    },
  });

  const approvedVendors = (vendors ?? [])
    .filter((v) => v.status === "approved")
    .filter((v) => !freeEntry || (v.freeEntryRules as any)?.enabled === true);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Partners</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Verified venues & event partners</Text>
      </View>

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 52, backgroundColor: colors.card }}
        contentContainerStyle={styles.chipRow}
      >
        {VENDOR_CATEGORIES.map((cat) => {
          const active = activeCategory === cat;
          return (
            <Pressable
              key={cat}
              style={[styles.chip, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{cat}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Dance floor + Free Entry filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 46, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border }}
        contentContainerStyle={styles.chipRowSecondary}
      >
        {DANCE_FLOOR_OPTIONS.map((opt) => {
          const active = activeDanceFloor === opt.value;
          return (
            <Pressable
              key={opt.value || "any"}
              style={[styles.chipSmall, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
              onPress={() => setActiveDanceFloor(opt.value)}
            >
              <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{opt.label}</Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[
            styles.chipSmall,
            {
              backgroundColor: freeEntry ? "#22c55e20" : colors.muted,
              borderColor: freeEntry ? "#22c55e" : colors.border,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            },
          ]}
          onPress={() => setFreeEntry((v) => !v)}
        >
          <Ionicons
            name={freeEntry ? "checkmark-circle" : "ticket-outline"}
            size={12}
            color={freeEntry ? "#22c55e" : colors.mutedForeground}
          />
          <Text style={[styles.chipText, { color: freeEntry ? "#22c55e" : colors.mutedForeground }]}>
            Free Entry
          </Text>
        </Pressable>
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={approvedVendors}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, { paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon="business-outline"
              title="No partners found"
              subtitle={activeCategory !== "All" || activeDanceFloor !== "" ? "Try adjusting your filters" : "Check back soon"}
              action={activeCategory !== "All" || activeDanceFloor !== "" ? { label: "Clear filters", onPress: () => { setActiveCategory("All"); setActiveDanceFloor(""); } } : undefined}
            />
          }
          ListFooterComponent={approvedVendors.length > 0 ? <MobileFooter /> : null}
          renderItem={({ item }) => <VendorCard vendor={item} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 12, paddingHorizontal: 20, borderBottomWidth: 1, gap: 2 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  chipRow: { gap: 8, paddingHorizontal: 20, paddingVertical: 10 },
  chipRowSecondary: { gap: 8, paddingHorizontal: 20, paddingVertical: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipSmall: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  list: { padding: 16, gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  imageWrap: { height: 160, position: "relative" },
  categoryBadge: { position: "absolute", top: 10, left: 10, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  categoryBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  cardBody: { padding: 14, gap: 6 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  vendorName: { fontSize: 16, fontFamily: "Inter_700Bold", flex: 1 },
  locationText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  ratingText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  reviewCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
