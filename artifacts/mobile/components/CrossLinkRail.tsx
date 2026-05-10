import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export interface CrossLink {
  href: string;
  label: string;
}

interface CrossLinkRailProps {
  title: string;
  links: CrossLink[];
}

export function CrossLinkRail({ title, links }: CrossLinkRailProps) {
  const colors = useColors();
  if (links.length === 0) return null;
  return (
    <View style={styles.wrapper}>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {links.map((link) => (
          <Pressable
            key={link.href}
            onPress={() => router.push(link.href as never)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.chipText, { color: colors.foreground }]}>{link.label}</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 12 },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 16,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
