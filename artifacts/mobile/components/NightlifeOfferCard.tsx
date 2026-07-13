import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useColors } from "@/hooks/useColors";
import { resolveImageUrl } from "@/lib/resolveImageUrl";
import type { OfferTheme } from "@/components/offerThemes";

/**
 * Premium nightlife offer card — mirrors web's src/components/NightlifeOfferCard.tsx.
 * Reused for Happy Hours / Drink Deals / Happening Tonight offer cards.
 *
 *  • Default (image mode) — cover image on top, content below.
 *  • hideImage (VIP ticket mode) — a horizontal two-part card: a metallic
 *    left plate (per-category gradient) carrying the offer, a dashed seam,
 *    then a dark details panel with venue / day pills / time / location /
 *    Book Now.
 */
export function NightlifeOfferCard({
  onPress,
  onBook,
  imageUrl,
  title,
  venueName,
  offerLabel,
  offerIcon = "wine-outline",
  offerEyebrow,
  priceLabel,
  location,
  statusBadge,
  children,
  style,
  imageHeight = 160,
  hideImage = false,
  theme,
  bookLabel = "Book Now",
}: {
  onPress?: () => void;
  /** Renders a "Book now" pill wired independently of the card's own onPress. */
  onBook?: () => void;
  imageUrl?: string | null;
  title: string;
  venueName?: string;
  offerLabel?: string;
  offerIcon?: React.ComponentProps<typeof Ionicons>["name"];
  /** Small eyebrow above the highlighted offer value (VIP mode only). */
  offerEyebrow?: string;
  priceLabel?: string;
  location?: string;
  statusBadge?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Cover image height (image mode only). */
  imageHeight?: number;
  /** VIP ticket mode — see component doc. */
  hideImage?: boolean;
  /** Per-category colour theme for VIP ticket mode (offerThemes.ts). */
  theme?: OfferTheme;
  bookLabel?: string;
}) {
  const colors = useColors();

  if (hideImage) {
    const th = theme ?? { from: "#222", to: "#0a0a0a", plateIcon: "#EBCB79", accent: "#D4A84B", glow: "rgba(212,168,75,0.3)", border: "rgba(212,168,75,0.5)" };
    const heroValue = priceLabel ?? offerLabel;
    const heroEyebrow = offerEyebrow ?? (priceLabel ? offerLabel : undefined);
    return (
      <Pressable onPress={onPress} style={[styles.vipCard, { backgroundColor: "#171717" }, style]}>
        {/* Left VIP plate */}
        <LinearGradient colors={[th.from, th.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.vipPlate}>
          <View pointerEvents="none" style={[styles.vipHairline, { borderColor: "rgba(255,255,255,0.12)" }]} />
          {offerIcon ? (
            <Ionicons name={offerIcon} size={44} color={th.plateIcon} style={styles.vipWatermark} />
          ) : null}
          {offerIcon ? <Ionicons name={offerIcon} size={16} color={th.plateIcon} /> : null}
          {heroEyebrow ? <Text style={[styles.vipEyebrow, { color: th.plateIcon }]}>{heroEyebrow}</Text> : null}
          {heroValue ? (
            <Text style={[styles.vipValue, { color: th.plateIcon }]} numberOfLines={2}>{heroValue}</Text>
          ) : null}
        </LinearGradient>

        {/* Ticket seam notches */}
        <View pointerEvents="none" style={[styles.notch, styles.notchTop, { backgroundColor: colors.background }]} />
        <View pointerEvents="none" style={[styles.notch, styles.notchBottom, { backgroundColor: colors.background }]} />

        {/* Right details panel */}
        <View style={[styles.vipDetails, { borderLeftColor: "rgba(255,255,255,0.14)" }]}>
          {statusBadge}
          {venueName ? <Text style={styles.vipVenue} numberOfLines={1}>{venueName}</Text> : null}
          <Text style={styles.vipTitle} numberOfLines={2}>{title}</Text>
          {children}
          {location ? (
            <View style={styles.row}>
              <Ionicons name="location-outline" size={13} color={th.accent} />
              <Text style={styles.vipLocation} numberOfLines={1}>{location}</Text>
            </View>
          ) : null}
          {onBook ? (
            <Pressable
              onPress={onBook}
              style={({ pressed }) => [
                styles.vipBookBtn,
                { borderColor: th.accent + "73", backgroundColor: pressed ? th.accent + "22" : "transparent" },
              ]}
            >
              <Ionicons name="calendar-outline" size={13} color={th.accent} />
              <Text style={[styles.vipBookText, { color: th.accent }]}>{bookLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    );
  }

  /* ─────────────────────────── Default image mode ───────────────────────── */
  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      <View style={[styles.imageWrap, { height: imageHeight, backgroundColor: colors.muted }]}>
        {imageUrl ? (
          <Image source={{ uri: resolveImageUrl(imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.imageFallback]} />
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.75)"]} style={styles.imageGradient} />
        {statusBadge ? <View style={styles.imageStatusBadge}>{statusBadge}</View> : null}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>{title}</Text>
            {venueName ? <Text style={[styles.venue, { color: colors.mutedForeground }]} numberOfLines={1}>{venueName}</Text> : null}
          </View>
          {priceLabel ? <Text style={[styles.price, { color: colors.primary }]}>{priceLabel}</Text> : null}
        </View>

        {offerLabel ? (
          <View style={[styles.offerPill, { borderColor: colors.primary + "40", backgroundColor: colors.primary + "1a" }]}>
            {offerIcon ? <Ionicons name={offerIcon} size={13} color={colors.primary} /> : null}
            <Text style={[styles.offerPillText, { color: colors.primary }]} numberOfLines={1}>{offerLabel}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary + "b0"} />
          </View>
        ) : null}

        {children}

        {location ? (
          <View style={styles.row}>
            <Ionicons name="location-outline" size={13} color={colors.primary} />
            <Text style={[styles.location, { color: colors.mutedForeground }]} numberOfLines={1}>{location}</Text>
          </View>
        ) : null}

        {onBook ? (
          <Pressable onPress={onBook} style={[styles.bookBtn, { backgroundColor: colors.primary }]}>
            <Ionicons name="calendar-outline" size={13} color={colors.primaryForeground} />
            <Text style={[styles.bookBtnText, { color: colors.primaryForeground }]}>Book now</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* VIP ticket mode */
  vipCard: { flexDirection: "row", borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  vipPlate: { width: "36%", padding: 12, justifyContent: "center", gap: 3, overflow: "hidden" },
  vipHairline: { position: "absolute", top: 6, left: 6, right: 6, bottom: 6, borderRadius: 14, borderWidth: 1 },
  vipWatermark: { position: "absolute", bottom: -8, right: -6, opacity: 0.16 },
  vipEyebrow: { fontSize: 9, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 1, opacity: 0.75, marginTop: 2 },
  vipValue: { fontSize: 16, fontFamily: "Inter_700Bold", textTransform: "uppercase", lineHeight: 19 },
  notch: { position: "absolute", left: "36%", marginLeft: -7, width: 14, height: 14, borderRadius: 7, zIndex: 10 },
  notchTop: { top: -7 },
  notchBottom: { bottom: -7 },
  vipDetails: { flex: 1, minWidth: 0, borderLeftWidth: 1, borderStyle: "dashed", padding: 12, gap: 6 },
  vipVenue: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  vipTitle: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", lineHeight: 15 },
  vipLocation: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", flex: 1 },
  vipBookBtn: { marginTop: "auto", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 999, borderWidth: 1, paddingVertical: 8 },
  vipBookText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  /* Default image mode */
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  imageWrap: { position: "relative" },
  imageFallback: { backgroundColor: "rgba(212,175,55,0.08)" },
  imageGradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: "45%" },
  imageStatusBadge: { position: "absolute", left: 10, top: 10 },
  body: { padding: 12, gap: 6 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  title: { fontSize: 14, fontFamily: "Inter_700Bold", lineHeight: 18 },
  venue: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  price: { fontSize: 14, fontFamily: "Inter_700Bold" },
  offerPill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  offerPillText: { flex: 1, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  row: { flexDirection: "row", alignItems: "center", gap: 5 },
  location: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  bookBtn: { marginTop: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 999, paddingVertical: 8 },
  bookBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
