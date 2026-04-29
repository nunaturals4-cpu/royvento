import { Ionicons } from "@expo/vector-icons";
import { useListEvents } from "@workspace/api-client-react";
import { router } from "expo-router";
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
import { useColors } from "@/hooks/useColors";

const CITIES = ["All Cities", "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Pune", "Chennai", "Kolkata", "Goa"];
const PUB_MODES = [
  { label: "All", value: undefined },
  { label: "Tickets", value: "ticket" },
  { label: "Table", value: "table" },
];
const PRICE_RANGES = [
  { label: "Any Price", min: undefined, max: undefined },
  { label: "Free", min: 0, max: 0 },
  { label: "Under ₹500", min: undefined, max: 500 },
  { label: "₹500–₹1500", min: 500, max: 1500 },
  { label: "₹1500+", min: 1500, max: undefined },
];

export default function PubsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const [search, setSearch] = useState("");
  const [city, setCity] = useState("All Cities");
  const [pubMode, setPubMode] = useState<string | undefined>(undefined);
  const [priceRangeIdx, setPriceRangeIdx] = useState(0);

  const priceRange = PRICE_RANGES[priceRangeIdx];

  const eventsQuery = useListEvents({
    type: "pub",
    city: city !== "All Cities" ? city : undefined,
    minPrice: priceRange.min !== undefined ? String(priceRange.min) : undefined,
    maxPrice: priceRange.max !== undefined ? String(priceRange.max) : undefined,
  });

  const events = (eventsQuery.data ?? []).filter((e) => {
    const matchSearch = !search.trim() || e.title.toLowerCase().includes(search.toLowerCase()) || (e.location ?? "").toLowerCase().includes(search.toLowerCase());
    const matchMode = !pubMode || (e as Record<string, unknown>)["pubMode"] === pubMode;
    return matchSearch && matchMode;
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
            <Ionicons name="beer-outline" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Pubs & Nightlife</Text>
        </View>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Discover the best venues near you</Text>

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

        {/* Pub Mode Filter */}
        <View style={styles.pillRow}>
          {PUB_MODES.map((m) => (
            <Pressable
              key={m.label}
              onPress={() => setPubMode(m.value)}
              style={[styles.pill, { backgroundColor: pubMode === m.value ? colors.primary : colors.muted, borderColor: pubMode === m.value ? colors.primary : colors.border }]}
            >
              <Text style={[styles.pillText, { color: pubMode === m.value ? colors.primaryForeground : colors.mutedForeground }]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

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
              style={[styles.pill, { backgroundColor: priceRangeIdx === index ? "#22c55e" : colors.muted, borderColor: priceRangeIdx === index ? "#22c55e" : colors.border }]}
            >
              <Ionicons name="cash-outline" size={12} color={priceRangeIdx === index ? "#fff" : colors.mutedForeground} />
              <Text style={[styles.pillText, { color: priceRangeIdx === index ? "#fff" : colors.mutedForeground }]}>{item.label}</Text>
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
              style={[styles.cityChip, { backgroundColor: city === item ? colors.primary : colors.muted, borderColor: city === item ? colors.primary : colors.border }]}
            >
              <Text style={[styles.cityText, { color: city === item ? colors.primaryForeground : colors.mutedForeground }]}>{item}</Text>
            </Pressable>
          )}
        />
      </View>

      {/* Events list */}
      {eventsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="beer-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Pubs Found</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            {search || city !== "All Cities" ? "Try different filters" : "Check back soon for new venues"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: Platform.OS === "web" ? 80 : 120 }}
          refreshControl={<RefreshControl refreshing={eventsQuery.isRefetching} onRefresh={() => eventsQuery.refetch()} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <EventCard
              event={item}
              onPress={() => router.push({ pathname: "/event/[id]", params: { id: item.id } })}
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
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -6 },
  searchBar: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  pillRow: { flexDirection: "row", gap: 8 },
  pill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 5 },
  pillText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cityChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  cityText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
});
