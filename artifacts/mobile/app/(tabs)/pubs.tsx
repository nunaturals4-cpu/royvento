import { Ionicons } from "@expo/vector-icons";
import { useListEvents } from "@workspace/api-client-react";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EventCard } from "@/components/EventCard";
import { MobileFooter } from "@/components/MobileFooter";
import { useColors } from "@/hooks/useColors";

const CITIES = ["All Cities", "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Pune", "Chennai", "Kolkata", "Goa"];
const PRICE_RANGES = [
  { label: "Any Price", min: undefined, max: undefined },
  { label: "Free", min: 0, max: 0 },
  { label: "Under ₹500", min: undefined, max: 500 },
  { label: "₹500–₹1500", min: 500, max: 1500 },
  { label: "₹1500+", min: 1500, max: undefined },
];
const DRINK_DEAL_OPTIONS = [
  { value: "welcome", label: "Welcome Drink" },
  { value: "unlimited", label: "Unlimited" },
  { value: "ticket", label: "Incl. with Ticket" },
  { value: "custom", label: "Custom Deal" },
] as const;
type DrinkPlanType = typeof DRINK_DEAL_OPTIONS[number]["value"] | "";

export default function PubsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const [search, setSearch] = useState("");
  const [city, setCity] = useState("All Cities");
  const [priceRangeIdx, setPriceRangeIdx] = useState(0);
  const [freeEntry, setFreeEntry] = useState(false);
  const [drinkDeal, setDrinkDeal] = useState(false);
  const [drinkPlanType, setDrinkPlanType] = useState<DrinkPlanType>("");
  const [crowdLevel, setCrowdLevel] = useState<"" | "low" | "moderate" | "party">("");

  const priceRange = PRICE_RANGES[priceRangeIdx];

  function toggleDrinkDeal(val: boolean) {
    setDrinkDeal(val);
    if (!val) setDrinkPlanType("");
  }

  const eventsQuery = useListEvents({
    type: "pub",
    city: city !== "All Cities" ? city : undefined,
    minPrice: priceRange.min !== undefined ? String(priceRange.min) : undefined,
    maxPrice: priceRange.max !== undefined ? String(priceRange.max) : undefined,
    drinkPlanType: drinkPlanType || undefined,
  });

  const events = (eventsQuery.data ?? []).filter((e) => {
    const matchSearch =
      !search.trim() ||
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      (e.location ?? "").toLowerCase().includes(search.toLowerCase());
    const matchFreeEntry =
      !freeEntry ||
      (e.freeEntryRules?.enabled === true && (e.freeEntryRules?.days?.length ?? 0) > 0);
    const matchDrinkDeal = !drinkDeal || !!drinkPlanType || e.hasDrinkPlans === true;
    const matchCrowd =
      !crowdLevel ||
      (e as { vendorCrowdLevel?: string | null }).vendorCrowdLevel === crowdLevel;
    return matchSearch && matchFreeEntry && matchDrinkDeal && matchCrowd;
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={[
          styles.header,
          { paddingTop: topPadding + 16, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
            <Ionicons name="beer-outline" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Pubs & Nightlife</Text>
        </View>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
          Discover the best venues near you
        </Text>

        {/* Search */}
        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search pubs, bars, venues..."
            placeholderTextColor={colors.mutedForeground}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {/* Free Entry + Drink Deal toggles */}
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setFreeEntry((v) => !v)}
            style={[
              styles.togglePill,
              {
                backgroundColor: freeEntry ? "#22c55e20" : colors.muted,
                borderColor: freeEntry ? "#22c55e" : colors.border,
              },
            ]}
          >
            <Ionicons
              name={freeEntry ? "checkmark-circle" : "ticket-outline"}
              size={13}
              color={freeEntry ? "#22c55e" : colors.mutedForeground}
            />
            <Text style={[styles.toggleText, { color: freeEntry ? "#22c55e" : colors.mutedForeground }]}>
              Free Entry
            </Text>
          </Pressable>

          <Pressable
            onPress={() => toggleDrinkDeal(!drinkDeal)}
            style={[
              styles.togglePill,
              {
                backgroundColor: drinkDeal ? "#f59e0b20" : colors.muted,
                borderColor: drinkDeal ? "#f59e0b" : colors.border,
              },
            ]}
          >
            <Ionicons
              name={drinkDeal ? "checkmark-circle" : "wine-outline"}
              size={13}
              color={drinkDeal ? "#f59e0b" : colors.mutedForeground}
            />
            <Text style={[styles.toggleText, { color: drinkDeal ? "#f59e0b" : colors.mutedForeground }]}>
              Drink Deal
            </Text>
          </Pressable>
        </View>

        {/* Drink deal type chips — visible when drink deal toggle is on */}
        {drinkDeal && (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={DRINK_DEAL_OPTIONS}
            keyExtractor={(o) => o.value}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setDrinkPlanType(drinkPlanType === item.value ? "" : item.value)}
                style={[
                  styles.pill,
                  {
                    backgroundColor: drinkPlanType === item.value ? "#f59e0b" : colors.muted,
                    borderColor: drinkPlanType === item.value ? "#f59e0b" : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: drinkPlanType === item.value ? "#fff" : colors.mutedForeground },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            )}
          />
        )}

        {/* Crowd level chips */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[
            { value: "" as const, label: "Any crowd", icon: "people-outline" as const, color: colors.mutedForeground },
            { value: "low" as const, label: "Low", icon: "leaf-outline" as const, color: "#16a34a" },
            { value: "moderate" as const, label: "Moderate", icon: "flame-outline" as const, color: "#d97706" },
            { value: "party" as const, label: "🔥 High", icon: "flame" as const, color: "#dc2626" },
          ]}
          keyExtractor={(o) => o.value || "any"}
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
          renderItem={({ item }) => {
            const active = crowdLevel === item.value;
            return (
              <Pressable
                onPress={() => setCrowdLevel(item.value)}
                style={[
                  styles.pill,
                  {
                    backgroundColor: active ? item.color : colors.muted,
                    borderColor: active ? item.color : colors.border,
                  },
                ]}
              >
                <Ionicons
                  name={item.icon}
                  size={12}
                  color={active ? "#fff" : colors.mutedForeground}
                />
                <Text style={[styles.pillText, { color: active ? "#fff" : colors.mutedForeground }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />

        {/* Price Range Filter */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={PRICE_RANGES}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => setPriceRangeIdx(index)}
              style={[
                styles.pill,
                {
                  backgroundColor: priceRangeIdx === index ? "#22c55e" : colors.muted,
                  borderColor: priceRangeIdx === index ? "#22c55e" : colors.border,
                },
              ]}
            >
              <Ionicons
                name="cash-outline"
                size={12}
                color={priceRangeIdx === index ? "#fff" : colors.mutedForeground}
              />
              <Text
                style={[styles.pillText, { color: priceRangeIdx === index ? "#fff" : colors.mutedForeground }]}
              >
                {item.label}
              </Text>
            </Pressable>
          )}
        />

        {/* City scroll */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CITIES}
          keyExtractor={(c) => c}
          contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setCity(item)}
              style={[
                styles.cityChip,
                {
                  backgroundColor: city === item ? colors.primary : colors.muted,
                  borderColor: city === item ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.cityText,
                  { color: city === item ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {item}
              </Text>
            </Pressable>
          )}
        />
      </View>

      {eventsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : events.length === 0 ? (
        <>
          <View style={styles.center}>
            <Ionicons name="beer-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Pubs Found</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              {search || city !== "All Cities" || freeEntry || drinkDeal || crowdLevel
                ? "Try different filters"
                : "Check back soon for new venues"}
            </Text>
          </View>
          <MobileFooter />
        </>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={{
            padding: 16,
            gap: 14,
            paddingBottom: Platform.OS === "web" ? 80 : 120,
          }}
          ListFooterComponent={<MobileFooter />}
          refreshControl={
            <RefreshControl
              refreshing={eventsQuery.isRefetching}
              onRefresh={() => eventsQuery.refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <EventCard
              id={item.id}
              vendorId={item.vendorId}
              title={item.title}
              imageUrl={item.imageUrl}
              location={item.location}
              price={item.price}
              category={item.category}
              type={item.type}
              rating={item.rating}
              reviewCount={item.reviewCount}
              freeEntryRules={item.freeEntryRules}
              hasDrinkPlans={item.hasDrinkPlans}
              vendorCrowdLevel={(item as unknown as { vendorCrowdLevel?: string | null }).vendorCrowdLevel}
              directBooking
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 14, gap: 10, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -6 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  toggleRow: { flexDirection: "row", gap: 8 },
  togglePill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  toggleText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  pill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  pillText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cityChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  cityText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
});
