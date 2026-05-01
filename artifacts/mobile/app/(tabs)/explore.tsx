import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { customFetch, type ListEventsPaginatedResponse } from "@workspace/api-client-react";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { LocationPicker } from "@/components/LocationPicker";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

const PAGE_SIZE = 20;

const DRINK_DEAL_OPTIONS = [
  { value: "welcome", label: "Welcome Drink" },
  { value: "unlimited", label: "Unlimited" },
  { value: "ticket", label: "Incl. with Ticket" },
  { value: "custom", label: "Custom Deal" },
] as const;

type DrinkPlanType = typeof DRINK_DEAL_OPTIONS[number]["value"] | "";

interface FilterState {
  country: string;
  state: string;
  city: string;
  minPrice: string;
  maxPrice: string;
  minRating: string;
  freeEntry: boolean;
  drinkPlanType: DrinkPlanType;
}

const EMPTY_FILTER: FilterState = { country: "", state: "", city: "", minPrice: "", maxPrice: "", minRating: "", freeEntry: false, drinkPlanType: "" };

function countActiveFilters(f: FilterState) {
  return ((f.country || f.state || f.city) ? 1 : 0) + (f.minPrice ? 1 : 0) + (f.maxPrice ? 1 : 0) + (f.minRating ? 1 : 0) + (f.freeEntry ? 1 : 0) + (f.drinkPlanType ? 1 : 0);
}

export default function ExploreScreen() {
  const { t } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ city?: string; type?: string }>();
  const [search, setSearch] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<FilterState>(() =>
    params.city ? { ...EMPTY_FILTER, city: params.city } : EMPTY_FILTER
  );
  const [draftFilter, setDraftFilter] = useState<FilterState>(() =>
    params.city ? { ...EMPTY_FILTER, city: params.city } : EMPTY_FILTER
  );
  const [draftLocation, setDraftLocation] = useState<{ country: string; state: string; city: string }>(() =>
    params.city ? { country: "", state: "", city: params.city } : { country: "", state: "", city: "" }
  );
  const [typeFilter, setTypeFilter] = useState<string>(() => params.type ?? "");

  useEffect(() => {
    const next = params.city ? { ...EMPTY_FILTER, city: params.city } : EMPTY_FILTER;
    setFilters(next);
    setDraftFilter(next);
    setDraftLocation(params.city ? { country: "", state: "", city: params.city } : { country: "", state: "", city: "" });
    setTypeFilter(params.type ?? "");
  }, [params.city, params.type]);
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const activeFilterCount = countActiveFilters(filters) + (typeFilter ? 1 : 0);

  const baseParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (debouncedSearch) p["search"] = debouncedSearch;
    if (filters.city) p["city"] = filters.city;
    if (filters.state) p["state"] = filters.state;
    if (filters.country) p["country"] = filters.country;
    if (filters.minPrice) p["minPrice"] = filters.minPrice;
    if (filters.maxPrice) p["maxPrice"] = filters.maxPrice;
    if (filters.minRating) p["minRating"] = filters.minRating;
    if (filters.drinkPlanType) p["drinkPlanType"] = filters.drinkPlanType;
    if (typeFilter) p["type"] = typeFilter;
    p["limit"] = String(PAGE_SIZE);
    return p;
  }, [debouncedSearch, filters, typeFilter]);

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

  const minRatingNum = filters.minRating ? parseFloat(filters.minRating) : 0;
  const events = (paginatedData?.pages.flatMap((p) => p.data) ?? []).filter(
    (item) =>
      (!minRatingNum || (item.rating ?? 0) >= minRatingNum) &&
      (!filters.freeEntry || item.freeEntryRules?.enabled === true)
  );

  function handleSearchChange(text: string) {
    setSearch(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setDebouncedSearch(text), 400);
  }

  function openFilter() {
    setDraftFilter(filters);
    setDraftLocation({ country: filters.country, state: filters.state, city: filters.city });
    setShowFilter(true);
  }

  function applyFilter() {
    setFilters({ ...draftFilter, country: draftLocation.country, state: draftLocation.state, city: draftLocation.city });
    setShowFilter(false);
  }

  function clearFilter() {
    setDraftFilter(EMPTY_FILTER);
    setDraftLocation({ country: "", state: "", city: "" });
    setFilters(EMPTY_FILTER);
    setTypeFilter("");
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
          <Text style={[styles.title, { color: colors.foreground }]}>{t("explore.pub_nightlife")}</Text>
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
            placeholder={t("explore.search_placeholder")}
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

      </View>

      {/* Active filter pills */}
      {activeFilterCount > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ maxHeight: 44 }}
          contentContainerStyle={styles.activePills}
        >
          {typeFilter ? (
            <View style={[styles.pill, { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}>
              <Ionicons name="wine-outline" size={12} color={colors.primary} />
              <Text style={[styles.pillText, { color: colors.primary }]}>
                {t("explore.type_only", { type: typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1) })}
              </Text>
            </View>
          ) : null}
          {(filters.city || filters.state || filters.country) ? (
            <View style={[styles.pill, { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}>
              <Ionicons name="location-outline" size={12} color={colors.primary} />
              <Text style={[styles.pillText, { color: colors.primary }]}>
                {filters.city || filters.state || filters.country}
              </Text>
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
          {filters.minRating ? (
            <View style={[styles.pill, { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}>
              <Ionicons name="star" size={12} color={colors.primary} />
              <Text style={[styles.pillText, { color: colors.primary }]}>
                {t("explore.min_stars", { rating: filters.minRating })}
              </Text>
            </View>
          ) : null}
          {filters.freeEntry ? (
            <View style={[styles.pill, { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}>
              <Ionicons name="ticket-outline" size={12} color={colors.primary} />
              <Text style={[styles.pillText, { color: colors.primary }]}>
                {t("explore.free_entry_pill")}
              </Text>
            </View>
          ) : null}
          {filters.drinkPlanType ? (
            <View style={[styles.pill, { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}>
              <Ionicons name="wine-outline" size={12} color={colors.primary} />
              <Text style={[styles.pillText, { color: colors.primary }]}>
                {DRINK_DEAL_OPTIONS.find((o) => o.value === filters.drinkPlanType)?.label ?? filters.drinkPlanType}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.pill, { backgroundColor: colors.destructive + "20", borderColor: colors.destructive }]}
            onPress={clearFilter}
          >
            <Ionicons name="close" size={12} color={colors.destructive} />
            <Text style={[styles.pillText, { color: colors.destructive }]}>{t("explore.clear")}</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : events.length === 0 ? (
        <>
          <EmptyState
            icon="search-outline"
            title={t("explore.no_match")}
            subtitle={t("explore.no_match_sub")}
            action={{
              label: t("explore.clear_all"),
              onPress: () => { setSearch(""); setDebouncedSearch(""); clearFilter(); },
            }}
          />
          <MobileFooter />
        </>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item, idx) => `${item.id}-${idx}`}
          contentContainerStyle={[styles.list, { paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }]}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isLoading}
          scrollEnabled
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            <>
              {isFetchingNextPage ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
              ) : hasNextPage ? null : events.length > PAGE_SIZE ? (
                <Text style={[styles.endText, { color: colors.mutedForeground }]}>{t("explore.all_loaded")}</Text>
              ) : null}
              <MobileFooter />
            </>
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
              popular={(item as { popular?: boolean }).popular}
              rating={item.rating}
              reviewCount={item.reviewCount}
              freeEntryRules={item.freeEntryRules}
              hasDrinkPlans={item.hasDrinkPlans}
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
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{t("explore.filter_events")}</Text>
              <Pressable onPress={() => setShowFilter(false)}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Location */}
            <View style={styles.sheetSection}>
              <Text style={[styles.sheetLabel, { color: colors.mutedForeground }]}>{t("explore.location")}</Text>
              <LocationPicker value={draftLocation} onChange={setDraftLocation} />
            </View>

            {/* Price Range */}
            <View style={styles.sheetSection}>
              <Text style={[styles.sheetLabel, { color: colors.mutedForeground }]}>{t("explore.price_range")}</Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetSubLabel, { color: colors.mutedForeground }]}>{t("explore.min")}</Text>
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
                  <Text style={[styles.sheetSubLabel, { color: colors.mutedForeground }]}>{t("explore.max")}</Text>
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
                {([
                  [t("explore.budget"), "0", "1000"],
                  [t("explore.mid_range"), "1000", "5000"],
                  [t("explore.premium"), "5000", "20000"],
                ] as const).map(([label, min, max]) => (
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

            {/* Minimum Rating */}
            <View style={styles.sheetSection}>
              <Text style={[styles.sheetLabel, { color: colors.mutedForeground }]}>{t("explore.minimum_rating")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {(["Any", "3", "3.5", "4", "4.5"] as const).map((val) => {
                  const active = val === "Any" ? !draftFilter.minRating : draftFilter.minRating === val;
                  return (
                    <Pressable
                      key={val}
                      onPress={() => setDraftFilter((p) => ({ ...p, minRating: val === "Any" ? "" : val }))}
                      style={[styles.chip, {
                        backgroundColor: active ? colors.primary : colors.muted,
                        borderColor: active ? colors.primary : colors.border,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }]}
                    >
                      {val !== "Any" && <Ionicons name="star" size={11} color={active ? colors.primaryForeground : colors.mutedForeground} />}
                      <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                        {val === "Any" ? t("explore.any") : `${val}+`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Free Entry */}
            <View style={styles.sheetSection}>
              <Pressable
                onPress={() => setDraftFilter((p) => ({ ...p, freeEntry: !p.freeEntry }))}
                style={[styles.freeEntryRow, {
                  backgroundColor: draftFilter.freeEntry ? colors.primary + "15" : colors.muted,
                  borderColor: draftFilter.freeEntry ? colors.primary : colors.border,
                }]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                  <Ionicons name="ticket-outline" size={18} color={draftFilter.freeEntry ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.freeEntryLabel, { color: draftFilter.freeEntry ? colors.primary : colors.foreground }]}>
                    {t("explore.free_entry")}
                  </Text>
                </View>
                <View style={[styles.toggleTrack, {
                  backgroundColor: draftFilter.freeEntry ? colors.primary : colors.border,
                }]}>
                  <View style={[styles.toggleThumb, {
                    backgroundColor: colors.card,
                    transform: [{ translateX: draftFilter.freeEntry ? 18 : 2 }],
                  }]} />
                </View>
              </Pressable>
            </View>

            {/* Drink Deal */}
            <View style={styles.sheetSection}>
              <Text style={[styles.sheetLabel, { color: colors.mutedForeground }]}>Drink Deal</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {([{ value: "" as DrinkPlanType, label: "Any" }, ...DRINK_DEAL_OPTIONS] as const).map((opt) => {
                  const active = draftFilter.drinkPlanType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setDraftFilter((p) => ({ ...p, drinkPlanType: opt.value }))}
                      style={[styles.chip, {
                        backgroundColor: active ? colors.primary : colors.muted,
                        borderColor: active ? colors.primary : colors.border,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }]}
                    >
                      {opt.value !== "" && <Ionicons name="wine-outline" size={11} color={active ? colors.primaryForeground : colors.mutedForeground} />}
                      <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.sheetActions}>
              <TouchableOpacity style={[styles.clearBtn, { borderColor: colors.border }]} onPress={clearFilter}>
                <Text style={[styles.clearBtnText, { color: colors.mutedForeground }]}>{t("explore.clear_all")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.applyBtn, { backgroundColor: colors.primary }]} onPress={applyFilter}>
                <Text style={[styles.applyBtnText, { color: colors.primaryForeground }]}>{t("explore.apply_filters")}</Text>
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
  freeEntryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  freeEntryLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  toggleTrack: { width: 40, height: 22, borderRadius: 11, justifyContent: "center" },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, position: "absolute" },
});
