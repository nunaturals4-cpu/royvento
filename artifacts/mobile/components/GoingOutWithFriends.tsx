import { resolveImageUrl } from "@/lib/resolveImageUrl";
import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSelectedCity } from "@/context/CityContext";
import { useColors } from "@/hooks/useColors";

// ── Going Out With Friends (mobile) ──────────────────────────────────────────
// Group-first discovery. The user picks group size + when + type and we surface
// only the venues that can seat the whole group (real-time /api/going-out),
// ranked by Group Fit, plus auto-built group package suggestions.

type Kind = "pub" | "club" | "event" | "game";

interface GroupItem {
  key: string;
  id: number;
  kind: Kind;
  title: string;
  subtitle: string;
  city: string;
  state: string;
  imageUrl: string;
  href: string;
  rating: number;
  capacity: number;
  availableCapacity: number | null;
  maxGroupSize: number;
  groupOffer: string;
  fromPrice: number;
  groupFitScore: number;
}

interface GroupPackage {
  key: string;
  venueId: number;
  kind: Kind;
  title: string;
  venueName: string;
  city: string;
  imageUrl: string;
  href: string;
  includes: string[];
  estPrice: number;
  groupSize: number;
}

interface GoingOutResponse {
  size: number;
  when: string;
  type: string;
  results: GroupItem[];
  packages: GroupPackage[];
  counts: { total: number; pubs: number; events: number; games: number };
}

const SIZE_CHIPS: { label: string; value: number }[] = [
  { label: "2", value: 2 },
  { label: "4", value: 4 },
  { label: "6", value: 6 },
  { label: "8", value: 8 },
  { label: "10+", value: 10 },
  { label: "Large", value: 15 },
];

const WHEN_CHIPS: { label: string; value: string }[] = [
  { label: "Right Now", value: "now" },
  { label: "Tonight", value: "tonight" },
  { label: "Tomorrow", value: "tomorrow" },
  { label: "This Weekend", value: "weekend" },
];

const TYPE_CHIPS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "💕 Date Night", value: "date-night" },
  { label: "Pub", value: "pub" },
  { label: "Club", value: "club" },
  { label: "Happy Hours", value: "happy-hours" },
  { label: "Event", value: "event" },
  { label: "DJ Night", value: "dj-night" },
  { label: "Live Music", value: "live-music" },
  { label: "Bowling", value: "bowling" },
  { label: "VR Gaming", value: "vr-gaming" },
  { label: "Sports", value: "sports" },
  { label: "Arcade", value: "arcade" },
];

const KIND_LABEL: Record<Kind, string> = {
  pub: "Pub & Club",
  club: "Club",
  event: "Live Event",
  game: "Gaming",
};

function navigateFromHref(href: string) {
  if (!href) return;
  const eventMatch = href.match(/\/events\/(\d+)/);
  if (eventMatch) { router.push(`/event/${eventMatch[1]}` as never); return; }
  const gameMatch = href.match(/\/game-organizers\/([^/]+)/);
  if (gameMatch) { router.push(`/game-organizers/${gameMatch[1]}` as never); return; }
  const orgMatch = href.match(/\/organizer-events\/([^/]+)/);
  if (orgMatch) { router.push(`/organizer-events/${orgMatch[1]}` as never); return; }
  router.push("/(tabs)/explore" as never);
}

function GroupCard({ item, size }: { item: GroupItem; size: number }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => navigateFromHref(item.href)}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.imageWrap}>
        {item.imageUrl ? (
          <Image source={{ uri: resolveImageUrl(item.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: colors.muted }]}>
            <Ionicons name="people" size={28} color={colors.primary + "55"} />
          </View>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={styles.gradient} />
        <View style={styles.kindBadge}>
          <Text style={styles.kindBadgeText}>{KIND_LABEL[item.kind]}</Text>
        </View>
        <View style={styles.fitsBadge}>
          <Ionicons name="checkmark-circle" size={11} color="#000" />
          <Text style={styles.fitsBadgeText}>Fits {size}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
          {item.subtitle}{item.city ? ` · ${item.city}` : ""}
        </Text>
        <View style={styles.metaRow}>
          {item.rating > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="star" size={11} color="#f59e0b" />
              <Text style={[styles.metaText, { color: "#f59e0b" }]}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
          {item.availableCapacity != null ? (
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={11} color={colors.primary} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{item.availableCapacity} spots</Text>
            </View>
          ) : item.capacity > 0 ? (
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={11} color={colors.primary} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Seats {item.capacity}</Text>
            </View>
          ) : (
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={11} color={colors.primary} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Group-friendly</Text>
            </View>
          )}
        </View>
        {!!item.groupOffer && (
          <View style={[styles.offerPill, { borderColor: colors.primary + "40", backgroundColor: colors.primary + "18" }]}>
            <Text style={[styles.offerText, { color: colors.primary }]} numberOfLines={1}>🎉 {item.groupOffer}</Text>
          </View>
        )}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {item.fromPrice > 0 ? `from ₹${item.fromPrice}` : "Tap to book"}
          </Text>
          <View style={styles.metaItem}>
            <Text style={[styles.bookText, { color: colors.primary }]}>Book group</Text>
            <Ionicons name="arrow-forward" size={13} color={colors.primary} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function ChipRow<T extends string | number>({
  data,
  value,
  onChange,
  getLabel,
  getValue,
}: {
  data: readonly { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  getLabel: (i: { label: string; value: T }) => string;
  getValue: (i: { label: string; value: T }) => T;
}) {
  const colors = useColors();
  return (
    <FlatList
      horizontal
      data={data as { label: string; value: T }[]}
      keyExtractor={(i) => String(getValue(i))}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
      renderItem={({ item }) => {
        const active = value === getValue(item);
        return (
          <Pressable
            onPress={() => onChange(getValue(item))}
            style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.muted }]}
          >
            <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{getLabel(item)}</Text>
          </Pressable>
        );
      }}
    />
  );
}

export function GoingOutWithFriends() {
  const colors = useColors();
  const { selectedCity: userCity } = useSelectedCity();
  const [size, setSize] = useState(4);
  const [when, setWhen] = useState("tonight");
  const [type, setType] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["going-out", size, when, type, userCity],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("size", String(size));
      params.set("when", when);
      if (type) params.set("type", type);
      if (userCity) params.set("city", userCity);
      return customFetch<GoingOutResponse>(`/api/going-out?${params.toString()}`);
    },
    staleTime: 30_000,
  });

  const results = data?.results ?? [];
  const packages = data?.packages ?? [];
  const sizeLabel = useMemo(() => SIZE_CHIPS.find((c) => c.value === size)?.label ?? `${size}`, [size]);

  return (
    <View style={styles.section}>
      <View style={{ paddingHorizontal: 20, alignItems: "center" }}>
        <Text style={[styles.eyebrow, { color: colors.primary, textAlign: "center" }]}>PLAN TOGETHER, BOOK TOGETHER</Text>
        <Text style={[styles.heading, { color: colors.foreground, textAlign: "center" }]}>👥 Going Out With Friends?</Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground, textAlign: "center" }]}>
          Pick your group size and when — we'll show only places that fit all of you.
        </Text>
      </View>

      <Text style={[styles.stepLabel, { color: colors.foreground }]}>1 · How many people?</Text>
      <ChipRow data={SIZE_CHIPS} value={size} onChange={setSize} getLabel={(i) => i.label} getValue={(i) => i.value} />

      <Text style={[styles.stepLabel, { color: colors.foreground }]}>2 · When?</Text>
      <ChipRow data={WHEN_CHIPS} value={when} onChange={setWhen} getLabel={(i) => i.label} getValue={(i) => i.value} />

      <Text style={[styles.stepLabel, { color: colors.foreground }]}>3 · What type?</Text>
      <ChipRow data={TYPE_CHIPS} value={type} onChange={setType} getLabel={(i) => i.label} getValue={(i) => i.value} />

      {isLoading ? (
        <View style={[styles.empty, { borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Finding places for your group…</Text>
        </View>
      ) : isError ? (
        <View style={[styles.empty, { borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Couldn't load group availability. Please try again.</Text>
        </View>
      ) : results.length > 0 ? (
        <>
          <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>
            {results.length} places can host {sizeLabel} {Number(sizeLabel) ? "people" : ""}
          </Text>
          <FlatList
            horizontal
            data={results}
            keyExtractor={(i) => i.key}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardRow}
            renderItem={({ item }) => <GroupCard item={item} size={size} />}
          />
        </>
      ) : (
        <View style={[styles.empty, { borderColor: colors.border }]}>
          <Ionicons name="people-outline" size={28} color={colors.mutedForeground} style={{ marginBottom: 8 }} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No venues with availability for {sizeLabel} {when === "now" ? "right now" : when}. Try a different time or size.
          </Text>
        </View>
      )}

      {packages.length > 0 && (
        <>
          <Text style={[styles.packagesTitle, { color: colors.foreground }]}>✨ Group packages</Text>
          <FlatList
            horizontal
            data={packages}
            keyExtractor={(p) => p.key}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardRow}
            renderItem={({ item: p }) => (
              <Pressable
                onPress={() => navigateFromHref(p.href)}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary + "33" }]}
              >
                <View style={[styles.imageWrap, { height: 110 }]}>
                  {p.imageUrl ? (
                    <Image source={{ uri: resolveImageUrl(p.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : null}
                  <LinearGradient colors={["transparent", "rgba(0,0,0,0.8)"]} style={StyleSheet.absoluteFill} />
                  <Text style={styles.pkgVenue} numberOfLines={1}>{p.venueName}</Text>
                </View>
                <View style={styles.body}>
                  <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{p.title}</Text>
                  {p.includes.slice(0, 4).map((inc, i) => (
                    <View key={i} style={styles.metaItem}>
                      <Ionicons name="checkmark-circle" size={11} color={colors.primary} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>{inc}</Text>
                    </View>
                  ))}
                  <View style={[styles.footer, { borderTopColor: colors.border }]}>
                    {p.estPrice > 0 && (
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>~₹{p.estPrice}/group</Text>
                    )}
                    <View style={styles.metaItem}>
                      <Text style={[styles.bookText, { color: colors.primary }]}>Book</Text>
                      <Ionicons name="arrow-forward" size={13} color={colors.primary} />
                    </View>
                  </View>
                </View>
              </Pressable>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginVertical: 8, paddingTop: 12 },
  eyebrow: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.6, marginBottom: 4 },
  heading: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6, lineHeight: 17 },
  stepLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingHorizontal: 20, marginTop: 14, marginBottom: 2 },
  chipRow: { paddingHorizontal: 20, paddingVertical: 8, gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  resultCount: { fontSize: 13, fontFamily: "Inter_500Medium", paddingHorizontal: 20, marginTop: 10 },
  cardRow: { paddingLeft: 20, paddingRight: 8, gap: 12, paddingTop: 10 },
  card: { width: 250, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  imageWrap: { height: 130, position: "relative" },
  gradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: 60 },
  kindBadge: { position: "absolute", top: 8, left: 8, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", paddingHorizontal: 8, paddingVertical: 4 },
  kindBadgeText: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 },
  fitsBadge: { position: "absolute", top: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999, backgroundColor: "rgba(16,185,129,0.92)", paddingHorizontal: 8, paddingVertical: 4 },
  fitsBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#000" },
  body: { padding: 12, gap: 5 },
  title: { fontSize: 15, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 2 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  metaText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  offerPill: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  offerText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, paddingTop: 8, marginTop: 2 },
  bookText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  empty: { marginHorizontal: 20, marginTop: 12, borderRadius: 16, borderWidth: 1, padding: 24, alignItems: "center" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  packagesTitle: { fontSize: 18, fontFamily: "Inter_700Bold", paddingHorizontal: 20, marginTop: 20 },
  pkgVenue: { position: "absolute", left: 12, bottom: 8, fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 },
});
