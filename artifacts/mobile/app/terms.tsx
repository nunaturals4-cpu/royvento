import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useColors } from "@/hooks/useColors";

const SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    body: "By accessing or using the Royvento platform, you agree to be bound by these Terms of Service. If you do not agree, please discontinue use immediately.",
  },
  {
    title: "2. Use of the Platform",
    body: "Royvento provides an event management and nightlife discovery platform. You agree to use the platform only for lawful purposes and in accordance with these Terms.",
  },
  {
    title: "3. Account Registration",
    body: "You must create an account to access certain features. You are responsible for maintaining the confidentiality of your credentials and for all activities under your account.",
  },
  {
    title: "4. Bookings & Payments",
    body: "All bookings made through Royvento are subject to vendor availability and approval. Payments are processed securely. Cancellation policies vary by vendor and event.",
  },
  {
    title: "5. Vendor Responsibilities",
    body: "Vendors are solely responsible for the accuracy of event listings, pricing, and fulfilment of bookings. Royvento acts as an intermediary platform only.",
  },
  {
    title: "6. Prohibited Conduct",
    body: "You may not use the platform to: post false or misleading information, engage in fraudulent transactions, harass other users, or violate any applicable law or regulation.",
  },
  {
    title: "7. Intellectual Property",
    body: "All content on Royvento, including logos, text, and designs, is the property of Royvento or its licensors and is protected by applicable intellectual property laws.",
  },
  {
    title: "8. Limitation of Liability",
    body: "To the maximum extent permitted by law, Royvento shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform.",
  },
  {
    title: "9. Changes to Terms",
    body: "We reserve the right to update these Terms at any time. Continued use of the platform after changes constitutes acceptance of the revised Terms.",
  },
  {
    title: "10. Contact Us",
    body: "If you have any questions about these Terms, please contact us at support@royvento.com.",
  },
];

export default function TermsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={[styles.header, { paddingTop: topPadding + 16 }]}
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Terms of Service</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>Last updated: January 2025</Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          Please read these Terms of Service carefully before using the Royvento platform.
        </Text>

        {SECTIONS.map((s) => (
          <View key={s.title} style={[styles.section, { borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{s.title}</Text>
            <Text style={[styles.sectionBody, { color: colors.mutedForeground }]}>{s.body}</Text>
          </View>
        ))}

        <MobileFooter />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 18, gap: 6 },
  backBtn: { padding: 4, alignSelf: "flex-start" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  content: { padding: 20, gap: 0 },
  intro: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 16 },
  section: { borderTopWidth: 1, paddingVertical: 16, gap: 8 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  sectionBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
});
