import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useColors } from "@/hooks/useColors";

// ── Home hero (mobile) ───────────────────────────────────────────────────────
// Multi-pillar auto-playing carousel mirroring the web `HeroSlider` — one slide
// per Royvento pillar (nightlife / live / play / rewards) — with an integrated
// search bar (city · keyword · when) that drives discovery.

interface Slide {
  eyebrow: string;
  title: string;
  sub: string;
  cta: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  img: string;
  go: () => void;
}

const SLIDES: Slide[] = [
  {
    eyebrow: "Nightlife",
    title: "Premium Pubs & Clubs",
    sub: "Rooftop bars, craft breweries and the hottest dance floors — book in seconds.",
    cta: "Explore Pubs & Clubs",
    icon: "wine-outline",
    img: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1200&q=75",
    go: () => router.push({ pathname: "/(tabs)/explore", params: { type: "pub" } } as never),
  },
  {
    eyebrow: "Live",
    title: "Events & Concerts",
    sub: "DJ nights, live gigs and standup shows — secure your spot before they sell out.",
    cta: "Discover Events",
    icon: "mic-outline",
    img: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1200&q=75",
    go: () => router.push("/events" as never),
  },
  {
    eyebrow: "Play",
    title: "Games & Entertainment",
    sub: "Arcades, VR arenas, bowling and gaming lounges — level up your night out.",
    cta: "Browse Games",
    icon: "game-controller-outline",
    img: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&q=75",
    go: () => router.push("/games-and-sports" as never),
  },
  {
    eyebrow: "Rewards",
    title: "Rewards & Exclusive Offers",
    sub: "Earn points on every booking and unlock members-only happy-hour deals.",
    cta: "View Offers",
    icon: "gift-outline",
    img: "https://images.unsplash.com/photo-1545128485-c400e7702796?w=1200&q=75",
    go: () => router.push("/(tabs)/deals" as never),
  },
];

const AUTOPLAY_MS = 5000;

const WHEN_CHIPS = [
  { label: "Tonight", value: "tonight" },
  { label: "This Weekend", value: "weekend" },
];

export function HomeHero({
  selectedCity,
  onOpenCityPicker,
  topPadding,
}: {
  selectedCity: string;
  onOpenCityPicker: () => void;
  topPadding: number;
}) {
  const colors = useColors();
  const width = Dimensions.get("window").width;
  const HERO_H = 320;
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const [term, setTerm] = useState("");
  const pausedRef = useRef(false);

  // Autoplay
  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setIndex((prev) => {
        const next = (prev + 1) % SLIDES.length;
        listRef.current?.scrollToOffset({ offset: next * width, animated: true });
        return next;
      });
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [width]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const submitSearch = () => {
    const t = term.trim();
    router.push({
      pathname: "/(tabs)/explore",
      params: { ...(t ? { search: t } : {}), ...(selectedCity ? { city: selectedCity } : {}) },
    } as never);
  };

  return (
    <View style={{ backgroundColor: colors.background }}>
      <View style={{ height: HERO_H }}>
        <FlatList
          ref={listRef}
          data={SLIDES}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(s) => s.title}
          onScrollBeginDrag={() => { pausedRef.current = true; }}
          onMomentumScrollEnd={onScroll}
          renderItem={({ item }) => (
            <View style={{ width, height: HERO_H }}>
              <Image source={{ uri: item.img }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient
                colors={["rgba(0,0,0,0.25)", "rgba(0,0,0,0.65)", "rgba(0,0,0,0.95)"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={[styles.slideContent, { paddingTop: topPadding + 16 }]}>
                <View style={styles.eyebrowRow}>
                  <View style={[styles.eyebrowIcon, { borderColor: colors.primary + "66" }]}>
                    <Ionicons name={item.icon} size={15} color={colors.primary} />
                  </View>
                  <Text style={[styles.eyebrow, { color: colors.primary }]}>{item.eyebrow.toUpperCase()}</Text>
                </View>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.sub} numberOfLines={2}>{item.sub}</Text>
                <Pressable onPress={item.go} style={[styles.cta, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>{item.cta}</Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.primaryForeground} />
                </Pressable>
              </View>
            </View>
          )}
        />
        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View
              key={s.title}
              style={[
                styles.dot,
                i === index
                  ? { width: 22, backgroundColor: colors.primary }
                  : { width: 6, backgroundColor: "rgba(255,255,255,0.4)" },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Search bar */}
      <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable onPress={onOpenCityPicker} style={[styles.cityRow, { borderBottomColor: colors.border }]}>
          <Ionicons name="location" size={16} color={colors.primary} />
          <Text style={[styles.cityText, { color: colors.foreground }]} numberOfLines={1}>
            {selectedCity || "Select your city"}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
        </Pressable>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder="Search pubs, events, venues…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            returnKeyType="search"
            onSubmitEditing={submitSearch}
          />
          <Pressable onPress={submitSearch} style={[styles.searchBtn, { backgroundColor: colors.primary }]}>
            <Ionicons name="arrow-forward" size={16} color={colors.primaryForeground} />
          </Pressable>
        </View>
        <View style={styles.whenRow}>
          <Text style={[styles.whenLabel, { color: colors.mutedForeground }]}>When:</Text>
          {WHEN_CHIPS.map((c) => (
            <Pressable
              key={c.value}
              onPress={() => router.push("/tonight-plans" as never)}
              style={[styles.whenChip, { borderColor: colors.border, backgroundColor: colors.muted }]}
            >
              <Ionicons name="calendar-outline" size={12} color={colors.primary} />
              <Text style={[styles.whenChipText, { color: colors.foreground }]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slideContent: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 20, paddingBottom: 28, gap: 8 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 },
  eyebrowIcon: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 2 },
  title: { fontSize: 30, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.6, lineHeight: 35 },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", lineHeight: 19, maxWidth: 320 },
  cta: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11, marginTop: 6 },
  ctaText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  dots: { position: "absolute", bottom: 10, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { height: 6, borderRadius: 3 },
  searchWrap: { marginHorizontal: 16, marginTop: -16, borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  cityRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  cityText: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 4 },
  searchBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  whenRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  whenLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  whenChip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  whenChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
