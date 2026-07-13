import React from "react";
import { StyleSheet, Text, View } from "react-native";

// Highlighted 7-day strip (M T W T F S S) — mirrors web's OfferDayPills.tsx.
// Active days glow in the category accent colour; inactive days are dimmed.
const DAYS = [
  { key: "mon", label: "M" },
  { key: "tue", label: "T" },
  { key: "wed", label: "W" },
  { key: "thu", label: "T" },
  { key: "fri", label: "F" },
  { key: "sat", label: "S" },
  { key: "sun", label: "S" },
] as const;

export function OfferDayPills({
  days,
  accent = "#8A919C",
  activeTextColor = "#0B0B0D",
}: {
  days?: string[] | null;
  /** Category accent colour for active pills. */
  accent?: string;
  /** Text colour on active pills. */
  activeTextColor?: string;
}) {
  const set = new Set((days ?? []).map((d) => d.slice(0, 3).toLowerCase()));
  const isAll = set.size === 0 || set.size >= 7;
  return (
    <View style={styles.row}>
      {DAYS.map((d, i) => {
        const active = isAll || set.has(d.key);
        return (
          <View
            key={i}
            style={[
              styles.pill,
              active ? { backgroundColor: accent } : { backgroundColor: "rgba(255,255,255,0.05)" },
            ]}
          >
            <Text style={[styles.text, { color: active ? activeTextColor : "rgba(255,255,255,0.25)" }]}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 3 },
  pill: { width: 17, height: 17, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  text: { fontSize: 8, fontFamily: "Inter_700Bold" },
});
