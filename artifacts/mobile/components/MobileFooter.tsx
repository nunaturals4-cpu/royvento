import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export function MobileFooter() {
  const colors = useColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
      {/* Brand */}
      <View style={styles.brand}>
        <View style={[styles.logo, { backgroundColor: colors.primary }]}>
          <Text style={[styles.logoText, { color: colors.primaryForeground }]}>R</Text>
        </View>
        <Text style={[styles.brandName, { color: colors.primary }]}>Royvento</Text>
      </View>
      <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
        Heirloom-quality events. From estate weddings to founder summits and harvest festivals — Royvento is where remarkable hosts find remarkable craft.
      </Text>

      {/* Links */}
      <View style={styles.linksRow}>
        <View style={styles.linkCol}>
          <Text style={[styles.colHeader, { color: colors.foreground }]}>DISCOVER</Text>
          <Pressable onPress={() => router.push("/(tabs)/explore")}>
            <Text style={[styles.link, { color: colors.mutedForeground }]}>Explore Events</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/pubs" as never)}>
            <Text style={[styles.link, { color: colors.mutedForeground }]}>Browse Partners</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/contact" as never)}>
            <Text style={[styles.link, { color: colors.mutedForeground }]}>Contact</Text>
          </Pressable>
        </View>
        <View style={styles.linkCol}>
          <Text style={[styles.colHeader, { color: colors.foreground }]}>FOR PARTNERS</Text>
          <Pressable onPress={() => router.push("/become-vendor" as never)}>
            <Text style={[styles.link, { color: colors.mutedForeground }]}>Become a Partner</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/vendor/dashboard" as never)}>
            <Text style={[styles.link, { color: colors.mutedForeground }]}>Partner Dashboard</Text>
          </Pressable>
        </View>
      </View>

      {/* Legal */}
      <View style={styles.legalRow}>
        <Pressable onPress={() => router.push("/terms" as never)}>
          <Text style={[styles.legalLink, { color: colors.mutedForeground }]}>Terms &amp; Conditions</Text>
        </Pressable>
        <Text style={[styles.legalSep, { color: colors.mutedForeground }]}>·</Text>
        <Pressable onPress={() => router.push("/privacy" as never)}>
          <Text style={[styles.legalLink, { color: colors.mutedForeground }]}>Privacy Policy</Text>
        </Pressable>
      </View>

      {/* Divider + copyright */}
      <View style={[styles.divider, { borderTopColor: colors.border }]} />
      <View style={styles.bottom}>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>
          © {new Date().getFullYear()} Royvento. Crafted with care.
        </Text>
        <Text style={[styles.italic, { color: colors.mutedForeground }]}>
          Designed for hosts who notice the details.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 32,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    borderTopWidth: 1,
    gap: 12,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  brandName: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  tagline: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    maxWidth: 360,
  },
  linksRow: {
    flexDirection: "row",
    gap: 24,
    marginTop: 4,
  },
  linkCol: {
    flex: 1,
    gap: 8,
  },
  colHeader: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  link: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  divider: {
    borderTopWidth: 1,
    marginTop: 8,
  },
  bottom: {
    gap: 4,
    marginTop: 4,
  },
  copy: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  italic: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  legalLink: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textDecorationLine: "underline",
  },
  legalSep: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
