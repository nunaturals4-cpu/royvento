import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { resolveImageUrl } from "@/lib/resolveImageUrl";

const DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NEW_BADGE_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;

export interface PubCardEvent {
  id: number;
  vendorId?: number;
  title: string;
  type?: string;
  location?: string;
  city?: string;
  state?: string;
  price?: number;
  imageUrl?: string;
  rating?: number;
  reviewCount?: number;
  approvedAt?: string | null;
  popular?: boolean;
  hasDrinkPlans?: boolean;
  freeEntryRules?: { enabled: boolean; genders: string[]; days: string[]; beforeTime?: string } | null;
  vendorCategory?: string;
  category?: string;
}

/**
 * Mirrors the web app's `PubCard` (artifacts/royvento/src/pages/pubs.tsx) —
 * same badge hierarchy (Popular/New → Free Entry → Drink Deal), same body
 * layout (title → location → rating → tag chips → price row → Book now).
 */
export function PubCard({ pub }: { pub: PubCardEvent }) {
  const colors = useColors();

  const loc = pub.city ? `${pub.city}${pub.state ? ", " + pub.state : ""}` : pub.location;

  const fer = pub.freeEntryRules;
  const freeDays = fer?.enabled === true ? fer.days ?? [] : [];
  const hasFreeEntry = freeDays.length > 0;
  const todayAbbr = DAY_ABBRS[new Date().getDay()];
  const isFreeToday = hasFreeEntry && freeDays.includes(todayAbbr!);

  const isNew = (() => {
    if (pub.popular || !pub.approvedAt) return false;
    const ms = new Date(pub.approvedAt).getTime();
    if (Number.isNaN(ms)) return false;
    return Date.now() - ms <= NEW_BADGE_WINDOW_MS;
  })();

  const ratingLabel = pub.rating && pub.rating > 0 ? pub.rating.toFixed(1) : null;
  const reviewLabel =
    pub.reviewCount && pub.reviewCount > 0
      ? pub.reviewCount >= 1000
        ? `${(pub.reviewCount / 1000).toFixed(1)}K`
        : String(pub.reviewCount)
      : null;

  const bodyTags: string[] = [];
  if (pub.vendorCategory) bodyTags.push(pub.vendorCategory);
  if (pub.category && pub.category !== pub.vendorCategory) bodyTags.push(pub.category);

  const priceLabel = pub.price && pub.price > 0 ? `₹${Math.round(pub.price).toLocaleString("en-IN")}` : "Free";

  const targetId = pub.vendorId ?? pub.id;
  const openDetail = () => {
    if (pub.type === "pub") {
      router.push(`/partner/${targetId}` as never);
    } else {
      router.push(`/event/${pub.id}` as never);
    }
  };
  const bookNow = () => {
    router.push({ pathname: "/event/[id]", params: { id: String(pub.id), book: "1" } } as never);
  };

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isFreeToday) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isFreeToday, pulse]);

  return (
    <Pressable
      onPress={openDetail}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.imageWrap}>
        {pub.imageUrl ? (
          <Image source={{ uri: resolveImageUrl(pub.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="wine-outline" size={32} color={colors.mutedForeground} />
          </View>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.35)"]} style={StyleSheet.absoluteFillObject} />
      </View>

      <View style={styles.body}>
        {(pub.popular || isNew || hasFreeEntry || pub.hasDrinkPlans) && (
          <View style={styles.badgeRow}>
            {(pub.popular || isNew) && (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>
                  {pub.popular ? "★ Popular" : "New"}
                </Text>
              </View>
            )}
            {hasFreeEntry && (
              <View style={[styles.badge, { backgroundColor: "#10b981" }]}>
                <Animated.View style={[styles.badgeDot, { opacity: isFreeToday ? pulse : 1 }]} />
                <Text style={[styles.badgeText, { color: "#fff" }]}>{isFreeToday ? "Free Today" : "Free Entry"}</Text>
              </View>
            )}
            {pub.hasDrinkPlans && (
              <View style={[styles.badge, { backgroundColor: "#f59e0b" }]}>
                <Text style={[styles.badgeText, { color: "#000" }]}>Drink Deal</Text>
              </View>
            )}
          </View>
        )}

        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
          {pub.title}
        </Text>

        {loc ? (
          <Text style={[styles.loc, { color: colors.mutedForeground }]} numberOfLines={1}>
            {loc}
          </Text>
        ) : null}

        {ratingLabel ? (
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={11} color={colors.primary} />
            <Text style={[styles.ratingValue, { color: colors.foreground }]}>{ratingLabel}</Text>
            {reviewLabel ? (
              <Text style={[styles.ratingCount, { color: colors.mutedForeground }]}>({reviewLabel})</Text>
            ) : null}
          </View>
        ) : null}

        {bodyTags.length > 0 && (
          <View style={styles.tagRow}>
            {bodyTags.slice(0, 3).map((tag) => (
              <View key={tag} style={[styles.tagChip, { borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.08)" }]}>
                <Text style={[styles.tagChipText, { color: "rgba(255,255,255,0.85)" }]}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.priceRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Entry</Text>
          <Text style={[styles.priceValue, { color: colors.foreground }]}>{priceLabel}</Text>
        </View>

        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            bookNow();
          }}
          style={({ pressed }) => [styles.bookBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="calendar-outline" size={13} color={colors.primaryForeground} />
          <Text style={[styles.bookBtnText, { color: colors.primaryForeground }]}>Book now</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
  },
  pressed: { opacity: 0.92 },
  imageWrap: {
    aspectRatio: 16 / 9,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  body: { padding: 14, gap: 4 },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#fff" },
  badgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  title: { fontSize: 15, fontFamily: "Inter_700Bold" },
  loc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  ratingValue: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  ratingCount: { fontSize: 11, fontFamily: "Inter_400Regular" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  tagChip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagChipText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 10,
  },
  priceLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  priceValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  bookBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 24,
    paddingVertical: 10,
    marginTop: 10,
  },
  bookBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
