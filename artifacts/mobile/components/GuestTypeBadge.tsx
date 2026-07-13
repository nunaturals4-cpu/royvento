import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

/** Who a deal is for — mirrors web's GuestTypeBadge.tsx. Always rendered so
 *  guest type is visible on every offer card (Happening Tonight, Happy Hours, Drink Deals). */
export function GuestTypeBadge({ gender, style }: { gender?: string | null; style?: StyleProp<ViewStyle> }) {
  const isLadies = gender === "female";
  const isMen = gender === "male";
  const label = isLadies ? "Ladies" : isMen ? "Men" : "Everyone";
  const bg = isLadies ? "rgba(236,72,153,0.9)" : isMen ? "rgba(59,130,246,0.9)" : "rgba(255,255,255,0.15)";
  const fg = isLadies || isMen ? "#fff" : "rgba(255,255,255,0.85)";
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  text: { fontSize: 9, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.6 },
});
