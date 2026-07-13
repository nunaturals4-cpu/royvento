import { resolveImageUrl } from "@/lib/resolveImageUrl";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

// ── Popular Categories (mobile) ──────────────────────────────────────────────
// Presentational category tiles mirroring the web home "Popular Categories".
// Each tile routes to an existing screen — no new backend.

interface Category {
  label: string;
  sub: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  img: string;
  go: () => void;
}

const CATEGORIES: Category[] = [
  { label: "Pubs & Bars", sub: "Find nearby pubs", icon: "wine-outline", img: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600&q=70", go: () => router.push({ pathname: "/(tabs)/explore", params: { type: "pub" } } as never) },
  { label: "Nightclubs", sub: "Dance the night away", icon: "musical-notes-outline", img: "https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?w=600&q=70", go: () => router.push({ pathname: "/(tabs)/explore", params: { type: "pub" } } as never) },
  { label: "Date Night", sub: "Romantic spots for two", icon: "heart-outline", img: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=70", go: () => router.push("/tonight-plans" as never) },
  { label: "Games & Sports", sub: "Play & compete", icon: "game-controller-outline", img: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&q=70", go: () => router.push("/games-and-sports" as never) },
  { label: "Live Events", sub: "Concerts & gigs", icon: "mic-outline", img: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&q=70", go: () => router.push("/(tabs)/explore" as never) },
  { label: "Ladies Nights", sub: "Special offers", icon: "sparkles-outline", img: "https://images.unsplash.com/photo-1545128485-c400e7702796?w=600&q=70", go: () => router.push("/(tabs)/deals" as never) },
];

export function PopularCategories() {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>EXPLORE BY CATEGORY</Text>
        <Text style={[styles.heading, { color: colors.foreground }]}>Popular Categories</Text>
      </View>
      <View style={styles.grid}>
        {CATEGORIES.map((c) => (
          <Pressable key={c.label} onPress={c.go} style={[styles.tile, { borderColor: colors.border }]}>
            <Image source={{ uri: resolveImageUrl(c.img) }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.85)"]} style={StyleSheet.absoluteFill} />
            <View style={[styles.tileIcon, { backgroundColor: colors.primary + "33", borderColor: colors.primary + "66" }]}>
              <Ionicons name={c.icon} size={16} color={colors.primary} />
            </View>
            <View style={styles.tileText}>
              <Text style={styles.tileLabel} numberOfLines={1}>{c.label}</Text>
              <Text style={styles.tileSub} numberOfLines={1}>{c.sub}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 12, paddingTop: 8 },
  header: { paddingHorizontal: 20, marginBottom: 14 },
  eyebrow: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.6, marginBottom: 4 },
  heading: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12 },
  tile: { width: "47%", flexGrow: 1, height: 110, borderRadius: 16, borderWidth: 1, overflow: "hidden", justifyContent: "space-between", padding: 12 },
  tileIcon: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  tileText: { gap: 1 },
  tileLabel: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  tileSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" },
});
