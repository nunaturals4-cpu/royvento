import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoingOutWithFriends } from "@/components/GoingOutWithFriends";
import { HappeningTonight } from "@/components/HappeningTonight";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useColors } from "@/hooks/useColors";

// ── Tonight Plans (mobile) ───────────────────────────────────────────────────
// One destination that answers "what are we doing tonight?" — pairs the
// real-time "Happening Tonight" feed with the group-first "Going Out With
// Friends" discovery engine. Mirrors the web /tonight-plans page.

export default function TonightPlansScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Image
            source={{ uri: "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=1200&q=80" }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0.75)", colors.background]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroContent, { paddingTop: topPadding + 8 }]}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </Pressable>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>REAL-TIME NIGHT PLANNER</Text>
            <Text style={styles.title}>Tonight Plans</Text>
            <Text style={styles.sub}>
              What's happening right now, and where your whole crew can actually go — ranked by live availability.
            </Text>
          </View>
        </View>

        <HappeningTonight />
        <GoingOutWithFriends />

        {/* Footer CTA */}
        <Pressable
          onPress={() => router.push({ pathname: "/(tabs)/explore", params: { type: "pub" } } as never)}
          style={[styles.ctaCard, { borderColor: colors.primary + "33", backgroundColor: colors.primary + "12" }]}
        >
          <Ionicons name="sparkles" size={26} color={colors.primary} />
          <Text style={[styles.ctaTitle, { color: colors.foreground }]}>Still deciding? Browse every pub & club</Text>
          <View style={[styles.ctaBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.ctaBtnText, { color: colors.primaryForeground }]}>Explore all venues</Text>
            <Ionicons name="arrow-forward" size={15} color={colors.primaryForeground} />
          </View>
        </Pressable>

        <MobileFooter />
        <View style={{ height: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 300, position: "relative", justifyContent: "flex-end" },
  heroContent: { paddingHorizontal: 20, paddingBottom: 24, gap: 8 } as object,
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  eyebrow: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 2 },
  title: { fontSize: 36, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.8 },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", lineHeight: 20, maxWidth: 340 },
  ctaCard: { margin: 20, borderRadius: 22, borderWidth: 1, padding: 24, alignItems: "center", gap: 12 },
  ctaTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: 24 },
  ctaBtn: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 4 },
  ctaBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
});
