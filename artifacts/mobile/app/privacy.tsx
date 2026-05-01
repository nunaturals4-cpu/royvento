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
    title: "1. Information We Collect",
    body: "We collect information you provide directly (name, email, phone), usage data (pages visited, bookings made), and device information (device type, OS version) to provide and improve our services.",
  },
  {
    title: "2. How We Use Your Information",
    body: "We use your information to: process bookings, personalise your experience, send booking confirmations and notifications, improve the platform, and comply with legal obligations.",
  },
  {
    title: "3. Sharing Your Information",
    body: "We share your information with vendors only as necessary to fulfil your bookings. We do not sell your personal data to third parties. We may share data with service providers who assist our operations under strict confidentiality agreements.",
  },
  {
    title: "4. Cookies & Tracking",
    body: "We use cookies and similar technologies to remember your preferences, analyse platform usage, and enhance your experience. You can control cookies through your device settings.",
  },
  {
    title: "5. Data Security",
    body: "We implement industry-standard security measures to protect your personal data. However, no transmission over the internet is 100% secure, and we cannot guarantee absolute security.",
  },
  {
    title: "6. Data Retention",
    body: "We retain your data for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data at any time.",
  },
  {
    title: "7. Your Rights",
    body: "You have the right to access, correct, or delete your personal data. You may also object to certain processing or request data portability. Contact us to exercise these rights.",
  },
  {
    title: "8. Third-Party Links",
    body: "Our platform may contain links to third-party websites or services. We are not responsible for their privacy practices and encourage you to review their privacy policies.",
  },
  {
    title: "9. Children's Privacy",
    body: "Royvento is not directed to children under 18. We do not knowingly collect personal information from minors. If you believe we have, please contact us immediately.",
  },
  {
    title: "10. Changes to This Policy",
    body: "We may update this Privacy Policy periodically. We will notify you of significant changes via the app or email. Continued use after changes constitutes acceptance.",
  },
  {
    title: "11. Contact Us",
    body: "For privacy-related questions or requests, contact our Data Protection team at privacy@royvento.com.",
  },
];

export default function PrivacyScreen() {
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
        <Text style={[styles.title, { color: colors.foreground }]}>Privacy Policy</Text>
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
          At Royvento, we are committed to protecting your privacy and handling your data transparently.
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
