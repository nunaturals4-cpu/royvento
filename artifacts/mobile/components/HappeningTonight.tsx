import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSelectedCity } from "@/context/CityContext";
import { useColors } from "@/hooks/useColors";

// ── Happening Tonight (mobile) ───────────────────────────────────────────────
// Mirror of the web `HappeningTonight` component. Real-time discovery feed from
// /api/happening-tonight with one-tap quick filters and a "What Should I Do
// Tonight?" instant recommendation.

interface TonightItem {
  key: string;
  id: number;
  kind: "pub" | "dj" | "event" | "game" | "happyhour";
  title: string;
  subtitle: string;
  city: string;
  state: string;
  imageUrl: string;
  href: string;
  startTime: string;
  endTime: string;
  bucket: "now" | "soon" | null;
  dealLabel: string;
  rating: number;
  todayBookings: number;
  filters: string[];
  score: number;
}

interface TonightResponse {
  happeningNow: TonightItem[];
  startingSoon: TonightItem[];
  lastMinuteDeals: TonightItem[];
  tonightNearYou: TonightItem[];
  counts: { now: number; soon: number; deals: number; total: number };
}

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All Tonight" },
  { key: "date", label: "💕 Date Night" },
  { key: "now", label: "🔥 Happening Now" },
  { key: "soon", label: "⚡ Starting Soon" },
  { key: "happy", label: "🍻 Happy Hours" },
  { key: "dj", label: "🎧 DJ Nights" },
  { key: "games", label: "🎮 Games Tonight" },
  { key: "live", label: "🎤 Live Events" },
];

/** Convert a web href (e.g. "/pubs/kolkata/foo" or "/events/12") into an
 *  expo-router navigation. We only need the leading id/segment for detail. */
function navigateFromHref(href: string) {
  if (!href) return;
  // Event detail: /events/:id or slugged /events/:city/:slug — push by id when numeric.
  const eventMatch = href.match(/\/events\/(\d+)/);
  if (eventMatch) {
    router.push(`/event/${eventMatch[1]}` as never);
    return;
  }
  const gameMatch = href.match(/\/game-organizers\/([^/]+)/);
  if (gameMatch) {
    router.push(`/game-organizers/${gameMatch[1]}` as never);
    return;
  }
  const orgMatch = href.match(/\/organizer-events\/([^/]+)/);
  if (orgMatch) {
    router.push(`/organizer-events/${orgMatch[1]}` as never);
    return;
  }
  // Default: pubs land on explore.
  router.push("/(tabs)/explore" as never);
}

function TonightCard({ item }: { item: TonightItem }) {
  const colors = useColors();
  const live = item.bucket === "now";
  const loc = item.city ? `${item.city}${item.state ? ", " + item.state : ""}` : "";
  return (
    <Pressable
      onPress={() => navigateFromHref(item.href)}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.imageWrap}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: colors.muted }]}>
            <Ionicons name="flame" size={28} color={colors.primary + "55"} />
          </View>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={styles.gradient} />
        {live ? (
          <View style={[styles.statusBadge, { backgroundColor: colors.primary }]}>
            <View style={styles.liveDot} />
            <Text style={[styles.statusText, { color: colors.primaryForeground }]}>Live Now</Text>
          </View>
        ) : item.bucket === "soon" ? (
          <View style={[styles.statusBadge, { backgroundColor: "rgba(245,194,64,0.95)" }]}>
            <Ionicons name="flash" size={10} color="#000" />
            <Text style={[styles.statusText, { color: "#000" }]}>{item.startTime || "Soon"}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
        {!!item.subtitle && (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>{item.subtitle}</Text>
        )}
        {!!item.dealLabel && (
          <View style={styles.dealPill}>
            <Ionicons name="ticket-outline" size={11} color="#fcd34d" />
            <Text style={styles.dealText} numberOfLines={2}>{item.dealLabel}</Text>
          </View>
        )}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <View style={styles.footerLeft}>
            <Ionicons name="location-outline" size={12} color={colors.primary} />
            <Text style={[styles.footerText, { color: colors.mutedForeground }]} numberOfLines={1}>{loc || "Tonight"}</Text>
          </View>
          {item.rating > 0 && (
            <View style={styles.footerLeft}>
              <Ionicons name="star" size={11} color="#f59e0b" />
              <Text style={[styles.footerText, { color: "#f59e0b" }]}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export function HappeningTonight() {
  const colors = useColors();
  const { selectedCity } = useSelectedCity();
  const [activeFilter, setActiveFilter] = useState("all");
  const [pick, setPick] = useState<TonightItem | null>(null);

  const { data } = useQuery({
    queryKey: ["happening-tonight", selectedCity],
    queryFn: () => {
      const qs = selectedCity ? `?city=${encodeURIComponent(selectedCity)}` : "";
      return customFetch<TonightResponse>(`/api/happening-tonight${qs}`);
    },
    staleTime: 60_000,
  });

  const allItems = useMemo(() => {
    if (!data) return [] as TonightItem[];
    const seen = new Set<string>();
    const out: TonightItem[] = [];
    for (const it of [...data.tonightNearYou, ...data.happeningNow, ...data.startingSoon, ...data.lastMinuteDeals]) {
      if (seen.has(it.key)) continue;
      seen.add(it.key);
      out.push(it);
    }
    return out.sort((a, b) => b.score - a.score);
  }, [data]);

  const filtered = useMemo(() => {
    if (activeFilter === "all") return allItems;
    if (activeFilter === "date") {
      return allItems.filter((i) => ["pub", "happyhour", "dj", "event"].includes(i.kind));
    }
    return allItems.filter((i) => i.filters.includes(activeFilter));
  }, [allItems, activeFilter]);

  const recommend = () => {
    if (allItems.length === 0) return;
    const top = allItems.slice(0, Math.min(5, allItems.length));
    setPick(top[Math.floor(Math.random() * top.length)] ?? top[0]!);
  };

  if (!data || allItems.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>REAL-TIME DISCOVERY</Text>
          <Text style={[styles.heading, { color: colors.foreground }]}>🔥 Happening Tonight</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {data.counts.now > 0
              ? `${data.counts.now} live now · ${data.counts.soon} starting soon${selectedCity ? ` near ${selectedCity}` : ""}`
              : `${allItems.length} experiences tonight${selectedCity ? ` near ${selectedCity}` : ""}`}
          </Text>
        </View>
      </View>

      <Pressable onPress={recommend} style={[styles.recommendBtn, { backgroundColor: colors.primary }]}>
        <Ionicons name="sparkles" size={15} color={colors.primaryForeground} />
        <Text style={[styles.recommendText, { color: colors.primaryForeground }]}>What Should I Do Tonight?</Text>
      </Pressable>

      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        renderItem={({ item: f }) => {
          const active = activeFilter === f.key;
          return (
            <Pressable
              onPress={() => setActiveFilter(f.key)}
              style={[
                styles.chip,
                { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.muted },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{f.label}</Text>
            </Pressable>
          );
        }}
      />

      {filtered.length > 0 ? (
        <FlatList
          horizontal
          data={filtered}
          keyExtractor={(it) => it.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardRow}
          renderItem={({ item }) => <TonightCard item={item} />}
        />
      ) : (
        <View style={[styles.empty, { borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Nothing in this category right now — try another filter.</Text>
        </View>
      )}

      {/* Recommendation modal */}
      <Modal visible={!!pick} animationType="fade" transparent onRequestClose={() => setPick(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPick(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.primary + "55" }]} onPress={() => {}}>
            <View style={styles.modalImage}>
              {pick?.imageUrl ? (
                <Image source={{ uri: pick.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: colors.muted }]}>
                  <Ionicons name="sparkles" size={36} color={colors.primary + "66"} />
                </View>
              )}
              <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={StyleSheet.absoluteFill} />
              <Pressable onPress={() => setPick(null)} style={styles.modalClose}>
                <Ionicons name="close" size={18} color="#fff" />
              </Pressable>
              <View style={styles.modalImageFooter}>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>TONIGHT'S PICK FOR YOU</Text>
                <Text style={styles.modalTitle} numberOfLines={2}>{pick?.title}</Text>
              </View>
            </View>
            <View style={styles.modalBody}>
              <View style={styles.modalMeta}>
                {pick?.startTime ? (
                  <View style={styles.footerLeft}>
                    <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
                    <Text style={[styles.footerText, { color: colors.mutedForeground }]}>{pick.startTime}</Text>
                  </View>
                ) : null}
                {pick?.city ? (
                  <View style={styles.footerLeft}>
                    <Ionicons name="location-outline" size={14} color={colors.primary} />
                    <Text style={[styles.footerText, { color: colors.mutedForeground }]}>{pick.city}</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => { if (pick) { navigateFromHref(pick.href); setPick(null); } }}
                  style={[styles.modalCta, { backgroundColor: colors.primary, flex: 1 }]}
                >
                  <Text style={[styles.recommendText, { color: colors.primaryForeground }]}>Book this</Text>
                  <Ionicons name="arrow-forward" size={15} color={colors.primaryForeground} />
                </Pressable>
                <Pressable onPress={recommend} style={[styles.modalCta, { borderWidth: 1, borderColor: colors.border }]}>
                  <Text style={[styles.recommendText, { color: colors.foreground }]}>Surprise me</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 12, paddingTop: 8 },
  header: { paddingHorizontal: 20, flexDirection: "row", alignItems: "flex-end" },
  eyebrow: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.6, marginBottom: 4 },
  heading: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  recommendBtn: { marginHorizontal: 20, marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 12 },
  recommendText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  chipRow: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cardRow: { paddingLeft: 20, paddingRight: 8, gap: 12 },
  card: { width: 240, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  imageWrap: { height: 130, position: "relative" },
  gradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: 60 },
  statusBadge: { position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  statusText: { fontSize: 9, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  body: { padding: 12, gap: 5 },
  title: { fontSize: 15, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular" },
  dealPill: { flexDirection: "row", alignItems: "flex-start", gap: 5, borderRadius: 8, borderWidth: 1, borderColor: "rgba(245,158,11,0.25)", backgroundColor: "rgba(245,158,11,0.1)", paddingHorizontal: 8, paddingVertical: 5 },
  dealText: { flex: 1, fontSize: 10, fontFamily: "Inter_500Medium", color: "#fcd34d", lineHeight: 14 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, paddingTop: 8, marginTop: 2 },
  footerLeft: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  footerText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  empty: { marginHorizontal: 20, marginTop: 8, borderRadius: 16, borderWidth: 1, padding: 24, alignItems: "center" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 24, borderWidth: 1, overflow: "hidden" },
  modalImage: { height: 190, position: "relative" },
  modalClose: { position: "absolute", top: 12, right: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  modalImageFooter: { position: "absolute", left: 16, right: 16, bottom: 12 },
  modalTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 27 },
  modalBody: { padding: 18, gap: 14 },
  modalMeta: { flexDirection: "row", gap: 16 },
  modalCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16 },
});
