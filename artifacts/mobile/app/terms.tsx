import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useColors } from "@/hooks/useColors";

const LAST_UPDATED = "1 May 2026";

const SECTIONS = [
  {
    title: "1. Introduction",
    body: 'Welcome to Royvento ("we", "us", or "our"). By accessing or using the Royvento platform \u2014 including our website, mobile application, and related services (collectively, the "Service") \u2014 you agree to be bound by these Terms & Conditions. If you do not agree, please do not use the Service.',
  },
  {
    title: "2. Use of the Service",
    body: "You must be at least 18 years old to use the Service or to make bookings at venues that serve alcohol. By creating an account or placing a booking you represent and warrant that you meet this requirement. You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account.\n\nYou agree not to misuse the Service, including but not limited to: submitting false or fraudulent bookings, scraping or crawling content without permission, or attempting to interfere with the security or availability of the platform.",
  },
  {
    title: "3. Bookings & Payments",
    body: "Bookings made through Royvento are subject to availability and confirmation by the venue partner. A booking is only confirmed once you receive a confirmation notification from us.\n\nPayment methods vary by event: some venues accept payment at the door (Cash on Delivery), while others require online payment at the time of booking. All stated prices are inclusive of applicable taxes unless noted otherwise.\n\nCancellation and refund policies are set by individual venue partners. Please check the event detail page before booking. Royvento is not responsible for any refund disputes between customers and venue partners.",
  },
  {
    title: "4. User Conduct",
    body: "You agree to treat venue staff, other guests, and Royvento personnel with respect. Any abusive, threatening, or illegal behaviour may result in immediate suspension of your account. You are responsible for complying with all local laws and venue rules when attending an event.",
  },
  {
    title: "5. Partner Listings",
    body: "Venue partners are independent third parties. Royvento acts as a platform connecting customers with partners and does not own or operate the venues listed. We make reasonable efforts to ensure listing accuracy but do not guarantee the completeness or currency of information provided by partners, including pricing, capacity, or amenities.",
  },
  {
    title: "6. Intellectual Property",
    body: "All content on the Royvento platform \u2014 including logos, design, text, and software \u2014 is owned by or licensed to Royvento and may not be copied, reproduced, or distributed without prior written consent.",
  },
  {
    title: "7. Limitation of Liability",
    body: "To the fullest extent permitted by law, Royvento and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, or consequential damages arising out of your use of the Service, including but not limited to damages for loss of profits, data, goodwill, or other intangible losses.\n\nOur total liability to you for any claim arising from or related to the Service shall not exceed the amount you paid to Royvento in the twelve months preceding the claim.",
  },
  {
    title: "8. Changes to These Terms",
    body: 'We may update these Terms from time to time. We will notify you of significant changes by updating the "Last updated" date at the top of this page. Your continued use of the Service after any changes constitutes acceptance of the new Terms.',
  },
  {
    title: "9. Governing Law",
    body: "These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of Mumbai, Maharashtra.",
  },
  {
    title: "10. Contact Us",
    body: "If you have questions about these Terms, please reach out via our Contact page or email us at legal@royvento.com.",
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
        <Text style={[styles.title, { color: colors.foreground }]}>Terms &amp; Conditions</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>Last updated: {LAST_UPDATED}</Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          Please read these Terms &amp; Conditions carefully before using the Royvento platform.
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
