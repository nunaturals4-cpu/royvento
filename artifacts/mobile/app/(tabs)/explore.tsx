import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import type { ListEventsPaginatedResponse } from "@workspace/api-zod";
import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { EventCard } from "@/components/EventCard";
import { useColors } from "@/hooks/useColors";

const PAGE_SIZE = 20;
const CATEGORIES = ["All", "Wedding", "Corporate", "Birthday", "Concert", "Pubs", "Festival"];
const CITIES = ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Pune", "Kolkata"];

interface FilterState {
  city: string;
  minPrice: string;
  maxPrice: string;
}

const EMPTY_FILTER: FilterState = { city: "", minPrice: "", maxPrice: "" };

function countActiveFilters(f: FilterState) {
  return (f.city ? 1 : 0) + (f.minPrice ? 1 : 0) + (f.maxPrice ? 1 : 0);
}

export default function ExploreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTER);
  const [draftFilter, setDraftFilter] = useState<FilterState>(EMPTY_FILTER);
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const activeFilterCount = countActiveFilters(filters);

  const baseParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (debouncedSearch) p["search"] = debouncedSearch;
    if (activeCategory !== "All") p["category"] = activeCategory;
    if (filters.city) p["city"] = filters.city;
    if (filters.minPrice) p["minPrice"] = filters.minPrice;
    if (filters.maxPrice) p["maxPrice"] = filters.maxPrice;
    p["limit"] = String(PAGE_SIZE);
    return p;
  }, [debouncedSearch, activeCategory, filters]);

  const {
    data: paginatedData,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = useInfiniteQuery<ListEventsPaginatedResponse>({
    queryKey: ["events-explore-infinite", baseParams],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const qs = Object.entries({ ...baseParams, page: String(pageParam) })
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
      return customFetch<ListEventsPaginatedResponse>(`/api/events?${qs}`);
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.hasMore) return lastPage.page + 1;
      return undefined;
    },
  });

  const events = paginatedData?.pages.flatMap((p) => p.data) ?? [];

  function handleSearchChange(text: string) {
    setSearch(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setDebouncedSearch(text), 400);
  }

  function openFilter() {
    setDraftFilter(filters);
    setShowFilter(true);
  }

  function applyFilter() {
    setFilters(draftFilter);
    setShowFilter(false);
  }

  function clearFilter() {
    setDraftFilter(EMPTY_FILTER);
    setFilters(EMPTY_FILTER);
    setShowFilter(false);
  }

  function handleEndReached() {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}
      >
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Explore</Text>
          <TouchableOpacity
            onPress={openFilter}
            style={[styles.filterBtn, { backgroundColor: activeFilterCount > 0 ? colors.primary : colors.muted, borderColor: colors.border }]}
          >
            <Ionicons name="options-outline" size={16} color={activeFilterCount > 0 ? colors.primaryForeground : colors.foreground} />
            {activeFilterCount > 0 ? (
              <View style={[styles.badge, { backgroundColor: colors.primaryForeground }]}>
                <Text style={[styles.badgeText, { color: colors.primary }]}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={search}
            onChangeText={handleSearchChange}
            placeholder="Search events, venues, cities…"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && Platform.OS !== "ios" ? (
            <TouchableOpacity onPress={() => { setSearch(""); setDebouncedSearch(""); }}>
              <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>

        <FlatList
          horizontal
          data={CATEGORIES}
          keyExtractor={(f) => f}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          scrollEnabled
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setActiveCategory(item)}
              style={[
                styles.chip,
                {
                  backgroundColor: activeCategory === item ? colors.primary : colors.muted,
                  borderColor: activeCategory === item ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: activeCategory === item ? colors.primaryForeground : colors.mutedForeground }]}>
                {item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Active filter pills */}
      {activeFilterCount > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ maxHeight: 44 }}
          contentContainerStyle={styles.activePills}
        >
          {filters.city ? (
            <View style={[styles.pill, { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}>
              <Ionicons name="location-outline" size={12} color={colors.primary} />
              <Text style={[styles.pillText, { color: colors.primary }]}>{filters.city}</Text>
            </View>
          ) : null}
          {filters.minPrice || filters.maxPrice ? (
            <View style={[styles.pill, { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}>
              <Ionicons name="pricetag-outline" size={12} color={colors.primary} />
              <Text style={[styles.pillText, { color: colors.primary }]}>
                ₹{filters.minPrice || "0"} – {filters.maxPrice ? `₹${filters.maxPrice}` : "any"}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.pill, { backgroundColor: colors.destructive + "20", borderColor: colors.destructive }]}
            onPress={clearFilter}
          >
            <Ionicons name="close" size={12} color={colors.destructive} />
            <Text style={[styles.pillText, { color: colors.destructive }]}>Clear</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : events.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title="No events found"
          subtitle="Try different filters or search terms"
          action={{
            label: "Clear all filters",
            onPress: () => { setSearch(""); setDebouncedSearch(""); setActiveCategory("All"); clearFilter(); },
          }}
        />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item, idx) => `${item.id}-${idx}`}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 34 : 100 }]}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isLoading}
          scrollEnabled
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
            ) : hasNextPage ? null : events.length > PAGE_SIZE ? (
              <Text style={[styles.endText, { color: colors.mutedForeground }]}>All events loaded</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <EventCard
              id={item.id}
              title={item.title}
              imageUrl={item.imageUrl}
              location={item.location}
              price={item.price}
              category={item.category}
              type={item.type}
              compact
              style={{ width: "100%" }}
            />
          )}
        />
      )}

      {/* Filter bottom sheet */}
      <Modal visible={showFilter} animationType="slide" transparent presentationStyle="overFullScreen">
        <Pressable style={styles.modalOverlay} onPress={() => setShowFilter(false)}>
          <Pressable
            style={[styles.filterSheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Filter Events</Text>
              <Pressable onPress={() => setShowFilter(false)}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* City */}
            <View style={styles.sheetSection}>
              <Text style={[styles.sheetLabel, { color: colors.mutedForeground }]}>City</Text>
              <TextInput
                style={[styles.sheetInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                value={draftFilter.city}
                onChangeText={(v) => setDraftFilter((p) => ({ ...p, city: v }))}
                placeholder="e.g. Mumbai"
                placeholderTextColor={colors.mutedForeground}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 8 }}>
                {CITIES.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setDraftFilter((p) => ({ ...p, city: p.city === c ? "" : c }))}
                    style={[styles.chip, {
                      backgroundColor: draftFilter.city === c ? colors.primary : colors.muted,
                      borderColor: draftFilter.city === c ? colors.primary : colors.border,
                    }]}
                  >
                    <Text style={[styles.chipText, { color: draftFilter.city === c ? colors.primaryForeground : colors.mutedForeground }]}>{c}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Price Range */}
            <View style={styles.sheetSection}>
              <Text style={[styles.sheetLabel, { color: colors.mutedForeground }]}>Price Range (₹)</Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetSubLabel, { color: colors.mutedForeground }]}>Min</Text>
                  <TextInput
                    style={[styles.sheetInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                    value={draftFilter.minPrice}
                    onChangeText={(v) => setDraftFilter((p) => ({ ...p, minPrice: v.replace(/[^0-9]/g, "") }))}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetSubLabel, { color: colors.mutedForeground }]}>Max</Text>
                  <TextInput
                    style={[styles.sheetInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                    value={draftFilter.maxPrice}
                    onChangeText={(v) => setDraftFilter((p) => ({ ...p, maxPrice: v.replace(/[^0-9]/g, "") }))}
                    placeholder="10000"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 8 }}>
                {([ ["Budget", "0", "1000"], ["Mid-range", "1000", "5000"], ["Premium", "5000", "20000"] ] as const).map(([label, min, max]) => (
                  <Pressable
                    key={label}
                    onPress={() => setDraftFilter((p) => ({ ...p, minPrice: min, maxPrice: max }))}
                    style={[styles.chip, {
                      backgroundColor: draftFilter.minPrice === min && draftFilter.maxPrice === max ? colors.primary : colors.muted,
                      borderColor: draftFilter.minPrice === min && draftFilter.maxPrice === max ? colors.primary : colors.border,
                    }]}
                  >
                    <Text style={[styles.chipText, {
                      color: draftFilter.minPrice === min && draftFilter.maxPrice === max ? colors.primaryForeground : colors.mutedForeground,
                    }]}>{label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.sheetActions}>
              <TouchableOpacity style={[styles.clearBtn, { borderColor: colors.border }]} onPress={clearFilter}>
                <Text style={[styles.clearBtnText, { color: colors.mutedForeground }]}>Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.applyBtn, { backgroundColor: colors.primary }]} onPress={applyFilter}>
                <Text style={[styles.applyBtnText, { color: colors.primaryForeground }]}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 12, paddingHorizontal: 20, borderBottomWidth: 1, gap: 12 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  filterBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  badge: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  filterRow: { gap: 8, paddingRight: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  list: { padding: 20, gap: 10 },
  activePills: { gap: 8, paddingHorizontal: 20, paddingVertical: 8 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  endText: { textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular", paddingVertical: 12 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  filterSheet: { borderRadius: 24, borderWidth: 1, padding: 24, margin: 0, gap: 20, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: -8 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sheetSection: { gap: 8 },
  sheetLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  sheetSubLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 4 },
  sheetInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular" },
  sheetActions: { flexDirection: "row", gap: 12, marginTop: 4, paddingBottom: Platform.OS === "ios" ? 20 : 0 },
  clearBtn: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  clearBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  applyBtn: { flex: 2, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  applyBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
