import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

const DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface EventCardProps {
  id: number;
  title: string;
  imageUrl?: string;
  location?: string;
  price?: number | string;
  category?: string;
  type?: string;
  style?: object;
  compact?: boolean;
  freeEntryRules?: { enabled: boolean; genders: string[]; days: string[]; beforeTime?: string } | null;
}

export function EventCard({
  id,
  title,
  imageUrl,
  location,
  price,
  category,
  type,
  style,
  compact,
  freeEntryRules,
}: EventCardProps) {
  const colors = useColors();
  const { t } = useLanguage();

  const priceNum = typeof price === "string" ? parseFloat(price) : price ?? 0;

  function formatPrice(v: number) {
    if (v <= 0) return "Free";
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
    if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
    if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
    return `₹${Math.round(v)}`;
  }

  const isPub = type === "pub";

  const fer = freeEntryRules;
  const freeDays = fer?.enabled === true ? (fer.days ?? []) : [];
  const hasFreeEntry = freeDays.length > 0;
  const todayAbbr = DAY_ABBRS[new Date().getDay()];
  const isFreeToday = hasFreeEntry && freeDays.includes(todayAbbr);
  const freeLabel = isFreeToday ? t("events.free_entry_today") : t("events.free_some_days");

  return (
    <Pressable
      onPress={() => router.push(`/event/${id}`)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        compact && styles.compact,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={[styles.imageWrap, compact && styles.imageWrapCompact]}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
            ]}
          >
            <Ionicons name="musical-notes" size={32} color={colors.mutedForeground} />
          </View>
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.72)"]}
          style={styles.gradient}
        />
        {category ? (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>
              {category}
            </Text>
          </View>
        ) : null}
        {isPub ? (
          <View style={[styles.pubBadge, { backgroundColor: "rgba(0,0,0,0.6)", borderColor: colors.primary }]}>
            <Ionicons name="wine" size={10} color={colors.primary} />
          </View>
        ) : null}
      </View>
      <View style={[styles.info, compact && styles.infoCompact]}>
        <Text
          style={[styles.title, { color: colors.foreground }, compact && styles.titleCompact]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {location ? (
          <View style={styles.row}>
            <Ionicons name="location-outline" size={11} color={colors.mutedForeground} />
            <Text style={[styles.sub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {location}
            </Text>
          </View>
        ) : null}
        {priceNum > 0 ? (
          <Text style={[styles.price, { color: colors.primary }]}>
            {formatPrice(priceNum)}
          </Text>
        ) : null}
        {hasFreeEntry ? (
          <View style={[styles.freeEntryBadge, isFreeToday && styles.freeEntryBadgeToday]}>
            <View style={[styles.freeEntryDot, isFreeToday && styles.freeEntryDotToday]} />
            <Text style={[styles.freeEntryText, isFreeToday && styles.freeEntryTextToday]}>
              {freeLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    width: 200,
  },
  compact: {
    width: "100%",
    flexDirection: "row",
    height: 90,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  imageWrap: {
    height: 130,
    position: "relative",
  },
  imageWrapCompact: {
    height: 90,
    width: 90,
  },
  gradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pubBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
  },
  info: {
    padding: 10,
    gap: 4,
  },
  infoCompact: {
    flex: 1,
    padding: 12,
    justifyContent: "center",
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  titleCompact: {
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  sub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  price: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  freeEntryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(34,197,94,0.10)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.20)",
    alignSelf: "flex-start",
    marginTop: 2,
  },
  freeEntryBadgeToday: {
    backgroundColor: "rgba(34,197,94,0.20)",
    borderColor: "rgba(34,197,94,0.40)",
  },
  freeEntryDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#4ade80",
  },
  freeEntryDotToday: {
    backgroundColor: "#22c55e",
  },
  freeEntryText: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "#4ade80",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  freeEntryTextToday: {
    color: "#22c55e",
  },
});
