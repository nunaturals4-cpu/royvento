import { Ionicons } from "@expo/vector-icons";
import { customFetch, type Event as ApiEvent, type ListEventsPaginatedResponse } from "@workspace/api-client-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
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
import { MobileFooter } from "@/components/MobileFooter";
import { PubCard } from "@/components/PubCard";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

/**
 * Mirrors artifacts/royvento/src/pages/pubs.tsx (the "narrow viewport" render
 * of the web page — search/filter header, category sections with counts,
 * PubCard grid collapsed to a single column). Keep filter semantics and
 * visual language in sync with that file.
 */

// The generated `Event` type only covers openapi-documented fields — several
// real response fields (vendorCategory, vendorCrowdLevel, dateNight,
// vendorOpenDays, drinkPlanDaysByType, popular, city/state/country) aren't in
// openapi.yaml yet, mirroring the same gap the web page works around.
type PubEvent = ApiEvent & {
  vendorCategory?: string;
  vendorCrowdLevel?: string | null;
  dateNight?: boolean;
  vendorOpenDays?: string[];
  drinkPlanDaysByType?: Record<string, string[]>;
  popular?: boolean;
  city?: string;
  state?: string;
  country?: string;
};

const CITIES = ["All Cities", "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Pune", "Chennai", "Kolkata", "Goa"];

const PRICE_PRESETS = [
  { label: "Under ₹500", min: 0, max: 500 },
  { label: "₹500 – ₹1.5K", min: 500, max: 1500 },
  { label: "₹1.5K+", min: 1500, max: 99999999 },
];

const DRINK_DEAL_OPTIONS = [
  { value: "welcome", label: "Welcome Drink" },
  { value: "unlimited", label: "Unlimited" },
  { value: "ticket", label: "Incl. with Ticket" },
  { value: "custom", label: "Custom Deal" },
] as const;
type DrinkPlanType = (typeof DRINK_DEAL_OPTIONS)[number]["value"] | "";

const CROWD_OPTIONS = [
  { value: "low", label: "Low", icon: "leaf-outline" as const, color: "#16a34a" },
  { value: "moderate", label: "Moderate", icon: "flame-outline" as const, color: "#d97706" },
  { value: "party", label: "High Crowd", icon: "flame" as const, color: "#dc2626" },
] as const;
type CrowdFilter = "" | (typeof CROWD_OPTIONS)[number]["value"];

const DAY_OPTIONS = [
  { value: "Sun", label: "Sun" },
  { value: "Mon", label: "Mon" },
  { value: "Tue", label: "Tue" },
  { value: "Wed", label: "Wed" },
  { value: "Thu", label: "Thu" },
  { value: "Fri", label: "Fri" },
  { value: "Sat", label: "Sat" },
] as const;
type DayFilter = "" | (typeof DAY_OPTIONS)[number]["value"];
const DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Keep in sync with PUB_CATEGORY_SECTIONS in artifacts/royvento/src/pages/pubs.tsx.
const PUB_CATEGORY_SECTIONS = [
  { value: "Pub", label: "Pubs", icon: "wine-outline" as const },
  { value: "Club", label: "Nightclubs", icon: "musical-notes-outline" as const },
  { value: "Pub & Club", label: "Pub & Club", icon: "partly-sunny-outline" as const },
  { value: "Pub & Bar", label: "Pub & Bar", icon: "cafe-outline" as const },
  { value: "Other", label: "Other", icon: "storefront-outline" as const },
] as const;
type PubCategory = (typeof PUB_CATEGORY_SECTIONS)[number]["value"];
type VenueTab = "All" | PubCategory;
const KNOWN_PUB_CATEGORIES = new Set<string>(["Pub", "Club", "Pub & Club", "Pub & Bar"]);
const sectionOf = (p: PubEvent): PubCategory =>
  KNOWN_PUB_CATEGORIES.has(p.vendorCategory ?? "") ? (p.vendorCategory as PubCategory) : "Other";

const MOBILE_TABS: VenueTab[] = ["All", ...PUB_CATEGORY_SECTIONS.map((s) => s.value)];

type Row =
  | { kind: "header"; key: string; label: string; icon: (typeof PUB_CATEGORY_SECTIONS)[number]["icon"]; count: number }
  | { kind: "item"; key: string; pub: PubEvent };

export default function PubsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const params = useLocalSearchParams<{ category?: string }>();

  const [search, setSearch] = useState("");
  const [city, setCity] = useState("All Cities");
  const [pricePreset, setPricePreset] = useState<number | null>(null);
  const [drinkPlanType, setDrinkPlanType] = useState<DrinkPlanType>("");
  const [hasDrinkDeal, setHasDrinkDeal] = useState(false);
  const [vipTable, setVipTable] = useState(false);
  const [danceFloor, setDanceFloor] = useState(false);
  const [dayFilter, setDayFilter] = useState<DayFilter>("");
  const [freeEntry, setFreeEntry] = useState(false);
  const [crowdLevel, setCrowdLevel] = useState<CrowdFilter>("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [venueTab, setVenueTab] = useState<VenueTab>(() =>
    (PUB_CATEGORY_SECTIONS.some((s) => s.value === params.category) ? (params.category as VenueTab) : "All"),
  );

  function toggleHasDrinkDeal(val: boolean) {
    setHasDrinkDeal(val);
    if (!val) setDrinkPlanType("");
    if (val) setVipTable(false);
  }
  function toggleVipTable(val: boolean) {
    setVipTable(val);
    if (val) {
      setHasDrinkDeal(false);
      setDrinkPlanType("");
    }
  }

  const PAGE_SIZE = 20;
  const baseParams = useMemo(() => {
    const p: Record<string, string> = { type: "pub", limit: String(PAGE_SIZE) };
    if (search.trim()) p["search"] = search.trim();
    if (city !== "All Cities") p["city"] = city;
    if (pricePreset !== null) {
      const preset = PRICE_PRESETS[pricePreset];
      if (preset) {
        p["minPrice"] = String(preset.min);
        p["maxPrice"] = String(preset.max);
      }
    }
    const effectiveDrinkPlanType = vipTable ? "vip_table" : drinkPlanType;
    if (effectiveDrinkPlanType) p["drinkPlanType"] = effectiveDrinkPlanType;
    if (danceFloor) p["danceFloor"] = "true";
    return p;
  }, [search, city, pricePreset, drinkPlanType, vipTable, danceFloor]);

  const eventsQuery = useInfiniteQuery<ListEventsPaginatedResponse>({
    queryKey: ["pubs-infinite", baseParams],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const qs = Object.entries({ ...baseParams, page: String(pageParam) })
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
      return customFetch<ListEventsPaginatedResponse>(`/api/events?${qs}`);
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  });

  const pubs = (eventsQuery.data?.pages.flatMap((p) => p.data) ?? []) as PubEvent[];

  const displayedPubs = useMemo(() => {
    let list = pubs;
    if (venueTab !== "All") list = list.filter((p) => sectionOf(p) === venueTab);
    if (hasDrinkDeal && !drinkPlanType) list = list.filter((p) => p.hasDrinkPlans);
    if (dayFilter) list = list.filter((p) => !p.vendorOpenDays?.length || p.vendorOpenDays.includes(dayFilter));
    if (dayFilter && hasDrinkDeal) {
      const type = drinkPlanType || null;
      list = list.filter((p) => {
        const byType = p.drinkPlanDaysByType ?? {};
        const days = type ? byType[type] ?? [] : Object.values(byType).flat();
        return days.includes(dayFilter);
      });
    }
    if (dayFilter && vipTable) {
      list = list.filter((p) => (p.drinkPlanDaysByType?.["vip_table"] ?? []).includes(dayFilter));
    }
    if (freeEntry) {
      list = list.filter((p) => p.freeEntryRules?.enabled === true && (p.freeEntryRules?.days?.length ?? 0) > 0);
      if (dayFilter) list = list.filter((p) => p.freeEntryRules?.days?.includes(dayFilter));
    }
    if (crowdLevel) list = list.filter((p) => p.vendorCrowdLevel === crowdLevel);
    return list;
  }, [pubs, venueTab, hasDrinkDeal, drinkPlanType, dayFilter, vipTable, freeEntry, crowdLevel]);

  const groupedSections = useMemo(
    () =>
      PUB_CATEGORY_SECTIONS.map((sec) => ({ ...sec, items: displayedPubs.filter((p) => sectionOf(p) === sec.value) })).filter(
        (sec) => sec.items.length > 0,
      ),
    [displayedPubs],
  );

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const sec of groupedSections) {
      out.push({ kind: "header", key: `h-${sec.value}`, label: sec.label, icon: sec.icon, count: sec.items.length });
      for (const p of sec.items) out.push({ kind: "item", key: `i-${p.id}`, pub: p });
    }
    return out;
  }, [groupedSections]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: pubs.length };
    for (const sec of PUB_CATEGORY_SECTIONS) counts[sec.value] = 0;
    for (const p of pubs) counts[sectionOf(p)] = (counts[sectionOf(p)] ?? 0) + 1;
    return counts;
  }, [pubs]);

  const hasFilters =
    !!search ||
    city !== "All Cities" ||
    pricePreset !== null ||
    !!drinkPlanType ||
    hasDrinkDeal ||
    vipTable ||
    danceFloor ||
    !!dayFilter ||
    freeEntry ||
    !!crowdLevel ||
    venueTab !== "All";

  function clearAll() {
    setSearch("");
    setCity("All Cities");
    setPricePreset(null);
    setDrinkPlanType("");
    setHasDrinkDeal(false);
    setVipTable(false);
    setDanceFloor(false);
    setDayFilter("");
    setFreeEntry(false);
    setCrowdLevel("");
    setVenueTab("All");
  }

  function handleEndReached() {
    if (eventsQuery.hasNextPage && !eventsQuery.isFetchingNextPage) {
      eventsQuery.fetchNextPage();
    }
  }

  const header = (
    <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <Text style={[styles.h1, { color: colors.foreground }]}>All Pubs &amp; Bars</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t("pubs.subtitle")}</Text>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          value={search}
          onChangeText={setSearch}
          placeholder={t("pubs.search_placeholder")}
          placeholderTextColor={colors.mutedForeground}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {/* City */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={CITIES}
        keyExtractor={(c) => c}
        contentContainerStyle={styles.chipRow}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setCity(item)}
            style={[styles.pill, { backgroundColor: city === item ? colors.primary : colors.muted, borderColor: city === item ? colors.primary : colors.border }]}
          >
            <Text style={[styles.pillText, { color: city === item ? colors.primaryForeground : colors.mutedForeground }]}>{item}</Text>
          </Pressable>
        )}
      />

      {/* Crowd */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[{ value: "" as const, label: "Any crowd", icon: "people-outline" as const, color: colors.mutedForeground }, ...CROWD_OPTIONS]}
        keyExtractor={(o) => o.value || "any"}
        contentContainerStyle={styles.chipRow}
        renderItem={({ item }) => {
          const active = crowdLevel === item.value;
          return (
            <Pressable
              onPress={() => setCrowdLevel(item.value)}
              style={[styles.pill, { backgroundColor: active ? item.color : colors.muted, borderColor: active ? item.color : colors.border }]}
            >
              <Ionicons name={item.icon} size={12} color={active ? "#fff" : colors.mutedForeground} />
              <Text style={[styles.pillText, { color: active ? "#fff" : colors.mutedForeground }]}>{item.label}</Text>
            </Pressable>
          );
        }}
      />

      {/* Filters toggle + clear all */}
      <View style={styles.controlsRow}>
        <Pressable
          onPress={() => setFiltersOpen((v) => !v)}
          style={[
            styles.filtersBtn,
            filtersOpen
              ? { backgroundColor: colors.primary, borderColor: colors.primary }
              : { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Ionicons name="options-outline" size={15} color={filtersOpen ? colors.primaryForeground : colors.mutedForeground} />
          <Text style={[styles.filtersBtnText, { color: filtersOpen ? colors.primaryForeground : colors.mutedForeground }]}>
            {t("pubs.filters")}
          </Text>
          {hasFilters && <View style={[styles.filtersDot, { backgroundColor: filtersOpen ? colors.primaryForeground : colors.primary }]} />}
        </Pressable>

        {hasFilters && (
          <Pressable onPress={clearAll} style={styles.clearAllBtn}>
            <Ionicons name="close" size={13} color={colors.mutedForeground} />
            <Text style={[styles.clearAllText, { color: colors.mutedForeground }]}>{t("pubs.clear_all")}</Text>
          </Pressable>
        )}
      </View>

      {/* Expanded filters panel */}
      {filtersOpen && (
        <View style={[styles.filterPanel, { borderColor: colors.border, backgroundColor: colors.muted }]}>
          {/* Day of week */}
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[{ value: "" as const, label: "Any day" }, ...DAY_OPTIONS]}
            keyExtractor={(o) => o.value || "any"}
            contentContainerStyle={styles.chipRow}
            renderItem={({ item }) => {
              const active = dayFilter === item.value;
              return (
                <Pressable
                  onPress={() => setDayFilter(item.value)}
                  style={[styles.pill, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}
                >
                  <Text style={[styles.pillText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{item.label}</Text>
                </Pressable>
              );
            }}
          />

          {/* Toggle pills: Free Entry / Drink Deal / VIP Table / Dance Floor */}
          <View style={styles.toggleWrap}>
            <Pressable
              onPress={() => setFreeEntry((v) => !v)}
              style={[styles.togglePill, { backgroundColor: freeEntry ? "#22c55e20" : colors.card, borderColor: freeEntry ? "#22c55e" : colors.border }]}
            >
              <View style={[styles.toggleDot, { backgroundColor: "#22c55e" }]} />
              <Text style={[styles.toggleText, { color: freeEntry ? "#22c55e" : colors.mutedForeground }]}>Free Entry</Text>
            </Pressable>
            <Pressable
              onPress={() => toggleHasDrinkDeal(!hasDrinkDeal)}
              style={[styles.togglePill, { backgroundColor: hasDrinkDeal ? "#f59e0b20" : colors.card, borderColor: hasDrinkDeal ? "#f59e0b" : colors.border }]}
            >
              <View style={[styles.toggleDot, { backgroundColor: "#f59e0b" }]} />
              <Text style={[styles.toggleText, { color: hasDrinkDeal ? "#f59e0b" : colors.mutedForeground }]}>Drink Deals</Text>
            </Pressable>
            <Pressable
              onPress={() => toggleVipTable(!vipTable)}
              style={[styles.togglePill, { backgroundColor: vipTable ? "#a78bfa20" : colors.card, borderColor: vipTable ? "#a78bfa" : colors.border }]}
            >
              <View style={[styles.toggleDot, { backgroundColor: "#a78bfa" }]} />
              <Text style={[styles.toggleText, { color: vipTable ? "#a78bfa" : colors.mutedForeground }]}>VIP Table</Text>
            </Pressable>
            <Pressable
              onPress={() => setDanceFloor((v) => !v)}
              style={[styles.togglePill, { backgroundColor: danceFloor ? "#f472b620" : colors.card, borderColor: danceFloor ? "#f472b6" : colors.border }]}
            >
              <Ionicons name="musical-notes-outline" size={12} color={danceFloor ? "#f472b6" : colors.mutedForeground} />
              <Text style={[styles.toggleText, { color: danceFloor ? "#f472b6" : colors.mutedForeground }]}>Dance Floor</Text>
            </Pressable>
          </View>

          {/* Drink deal type chips */}
          {hasDrinkDeal && (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={DRINK_DEAL_OPTIONS}
              keyExtractor={(o) => o.value}
              contentContainerStyle={styles.chipRow}
              renderItem={({ item }) => {
                const active = drinkPlanType === item.value;
                return (
                  <Pressable
                    onPress={() => setDrinkPlanType(active ? "" : item.value)}
                    style={[styles.pill, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}
                  >
                    <Text style={[styles.pillText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{item.label}</Text>
                  </Pressable>
                );
              }}
            />
          )}

          {/* Price presets */}
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[{ label: "Any Price", idx: null as number | null }, ...PRICE_PRESETS.map((p, idx) => ({ label: p.label, idx }))]}
            keyExtractor={(o) => String(o.idx)}
            contentContainerStyle={styles.chipRow}
            renderItem={({ item }) => {
              const active = pricePreset === item.idx;
              return (
                <Pressable
                  onPress={() => setPricePreset(item.idx)}
                  style={[styles.pill, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}
                >
                  <Text style={[styles.pillText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{item.label}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      )}

      {/* Results count + category tabs */}
      <View style={styles.resultsRow}>
        <Text style={[styles.resultsText, { color: colors.mutedForeground }]}>
          {eventsQuery.isLoading ? "Loading…" : (
            <>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold" }}>{displayedPubs.length}</Text> venues found
            </>
          )}
        </Text>
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={MOBILE_TABS}
        keyExtractor={(tab) => tab}
        contentContainerStyle={styles.chipRow}
        renderItem={({ item: tab }) => {
          const active = venueTab === tab;
          const label = tab === "All" ? "All" : PUB_CATEGORY_SECTIONS.find((s) => s.value === tab)?.label ?? tab;
          const count = categoryCounts[tab] ?? 0;
          return (
            <Pressable
              onPress={() => setVenueTab(tab)}
              style={[styles.tabPill, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
            >
              <Text style={[styles.tabPillText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                {label} ({count})
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );

  const isEmpty = !eventsQuery.isLoading && rows.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {eventsQuery.isLoading ? (
        <>
          {header}
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        </>
      ) : isEmpty ? (
        <>
          {header}
          <View style={styles.center}>
            <Ionicons name="wine-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("pubs.no_results")}</Text>
            {hasFilters && (
              <Pressable onPress={clearAll}>
                <Text style={[styles.emptyClear, { color: colors.primary }]}>{t("pubs.clear_all")}</Text>
              </Pressable>
            )}
          </View>
          <MobileFooter />
        </>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 80 : 120 }}
          removeClippedSubviews
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            <>
              {eventsQuery.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null}
              <MobileFooter />
            </>
          }
          refreshControl={<RefreshControl refreshing={eventsQuery.isRefetching} onRefresh={() => eventsQuery.refetch()} tintColor={colors.primary} />}
          renderItem={({ item: row }) =>
            row.kind === "header" ? (
              <View style={styles.sectionHeader}>
                <Ionicons name={row.icon} size={17} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{row.label}</Text>
                <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>({row.count})</Text>
              </View>
            ) : (
              <View style={styles.cardWrap}>
                <PubCard pub={row.pub} />
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 4, gap: 10, borderBottomWidth: 1 },
  h1: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -6 },
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
  chipRow: { gap: 8, paddingVertical: 2 },
  pill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  pillText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  controlsRow: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 2 },
  filtersBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filtersBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  filtersDot: { width: 6, height: 6, borderRadius: 3 },
  clearAllBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  clearAllText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  filterPanel: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  toggleWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  togglePill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toggleDot: { width: 7, height: 7, borderRadius: 3.5 },
  toggleText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  resultsRow: { marginTop: 4 },
  resultsText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  tabPill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 10 },
  tabPillText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  sectionCount: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cardWrap: { paddingHorizontal: 20, marginBottom: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyClear: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 4 },
});
