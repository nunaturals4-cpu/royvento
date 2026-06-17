import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useColors } from "@/hooks/useColors";

// ── Games & Sports (mobile) ──────────────────────────────────────────────────
// Mirror of the web /games page. Lists bookable gaming zones & sports arenas
// from /api/games with search + category chips. Cards open the game organizer.

interface GameCard {
  id: number;
  name: string;
  slug: string;
  category: string;
  coverImageUrl: string;
  pricingModel: "fixed" | "hourly";
  price: string;
  hourlyRate: string;
  organizerName: string;
  organizerSlug: string;
  city: string;
  organizerVerified: boolean;
}

function formatINR(v: number) {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function priceLabel(g: GameCard): string {
  if (g.pricingModel === "hourly") return `${formatINR(Number(g.hourlyRate))}/hr`;
  return Number(g.price) > 0 ? `${formatINR(Number(g.price))}/person` : "Free";
}

export default function GamesAndSportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");

  const { data: games = [], isLoading } = useQuery<GameCard[]>({
    queryKey: ["games"],
    queryFn: () => customFetch<GameCard[]>("/api/games"),
    staleTime: 1000 * 60 * 2,
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    games.forEach((g) => g.category && set.add(g.category));
    return ["All", ...Array.from(set)];
  }, [games]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return games.filter(
      (g) =>
        (cat === "All" || g.category === cat) &&
        (!term ||
          g.name.toLowerCase().includes(term) ||
          g.organizerName.toLowerCase().includes(term) ||
          (g.city || "").toLowerCase().includes(term))
    );
  }, [games, cat, q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Image
            source={{ uri: "https://images.unsplash.com/photo-1551958219-acbc608c6377?w=1200&q=80" }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <LinearGradient colors={["rgba(0,0,0,0.4)", "rgba(0,0,0,0.85)", colors.background]} style={StyleSheet.absoluteFill} />
          <View style={[styles.heroContent, { paddingTop: topPadding + 8 }]}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </Pressable>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { borderColor: colors.primary + "66", backgroundColor: colors.primary + "26" }]}>
                <Ionicons name="game-controller-outline" size={13} color={colors.primary} />
                <Text style={[styles.badgeText, { color: colors.primary }]}>Play & compete</Text>
              </View>
              <View style={[styles.badge, { borderColor: colors.primary + "66", backgroundColor: colors.primary + "26" }]}>
                <Ionicons name="trophy-outline" size={13} color={colors.primary} />
                <Text style={[styles.badgeText, { color: colors.primary }]}>Sports arenas</Text>
              </View>
            </View>
            <Text style={styles.title}>Gaming zones & sports arenas</Text>
            <Text style={styles.sub}>
              VR arenas, bowling, go-kart, PS5 lounges, turf football, cricket nets & more — reserve your slot, walk in with a QR ticket.
            </Text>
            <View style={[styles.searchBar, { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.18)" }]}>
              <Ionicons name="search" size={16} color="rgba(255,255,255,0.6)" />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search games, sports, venues or city…"
                placeholderTextColor="rgba(255,255,255,0.5)"
                style={styles.searchInput}
              />
            </View>
          </View>
        </View>

        {/* Category chips */}
        {categories.length > 1 && (
          <FlatList
            horizontal
            data={categories}
            keyExtractor={(c) => c}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            renderItem={({ item: c }) => {
              const active = cat === c;
              return (
                <Pressable
                  onPress={() => setCat(c)}
                  style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "26" : "transparent" }]}
                >
                  <Text style={[styles.chipText, { color: active ? colors.primary : colors.mutedForeground }]}>{c}</Text>
                </Pressable>
              );
            }}
          />
        )}

        {/* Grid */}
        {isLoading ? (
          <View style={{ paddingVertical: 60 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="game-controller-outline" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No games or sports venues found{cat !== "All" ? ` in ${cat}` : ""}. Check back soon!
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {filtered.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => router.push(`/game-organizers/${g.organizerSlug}` as never)}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.cardImage}>
                  {g.coverImageUrl ? (
                    <Image source={{ uri: g.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: colors.muted }]}>
                      <Ionicons name="game-controller-outline" size={30} color={colors.mutedForeground} />
                    </View>
                  )}
                  {!!g.category && (
                    <View style={styles.catBadge}>
                      <Text style={styles.catBadgeText}>{g.category}</Text>
                    </View>
                  )}
                  <View style={[styles.priceBadge, { backgroundColor: colors.primary }]}>
                    <Ionicons name={g.pricingModel === "hourly" ? "time-outline" : "cash-outline"} size={12} color={colors.primaryForeground} />
                    <Text style={[styles.priceBadgeText, { color: colors.primaryForeground }]}>{priceLabel(g)}</Text>
                  </View>
                </View>
                <View style={styles.cardBody}>
                  <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>{g.name}</Text>
                  <View style={styles.orgRow}>
                    <Text style={[styles.orgName, { color: colors.mutedForeground }]} numberOfLines={1}>{g.organizerName}</Text>
                    {g.organizerVerified && <Ionicons name="checkmark-circle" size={13} color="#f59e0b" />}
                  </View>
                  <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                    <View style={styles.metaItem}>
                      <Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>{g.city || "India"}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Text style={[styles.bookText, { color: colors.primary }]}>Book now</Text>
                      <Ionicons name="arrow-forward" size={13} color={colors.primary} />
                    </View>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <MobileFooter />
        <View style={{ height: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 280, position: "relative", justifyContent: "flex-end" },
  heroContent: { paddingHorizontal: 20, paddingBottom: 22, gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  title: { fontSize: 30, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.6, lineHeight: 35, marginTop: 4 },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.72)", lineHeight: 19 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, marginTop: 6 },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  chipRow: { paddingHorizontal: 16, paddingVertical: 16, gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  empty: { paddingVertical: 60, alignItems: "center", gap: 10, paddingHorizontal: 40 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12, paddingTop: 4 },
  card: { width: "47%", flexGrow: 1, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  cardImage: { aspectRatio: 16 / 10, position: "relative" },
  catBadge: { position: "absolute", top: 8, left: 8, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", paddingHorizontal: 8, paddingVertical: 3 },
  catBadgeText: { fontSize: 10, fontFamily: "Inter_500Medium", color: "#fff" },
  priceBadge: { position: "absolute", bottom: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  priceBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  cardBody: { padding: 12, gap: 4 },
  cardName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  orgRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  orgName: { fontSize: 12, fontFamily: "Inter_400Regular", flexShrink: 1 },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, paddingTop: 8, marginTop: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  metaText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  bookText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
