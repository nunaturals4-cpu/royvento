import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useColors } from "@/hooks/useColors";

const LAST_UPDATED = "27 May 2026";

const SECTIONS = [
  {
    title: "1. Who We Are",
    body: 'Royvento ("we", "us", or "our") operates the Royvento platform \u2014 a marketplace connecting customers ("Users") with event venues and pub partners ("Pub Partners") across India. This Privacy Policy explains how we collect, use, and protect personal and business information when you use our Service, whether as a User or a Pub Partner.',
  },
  {
    title: "2. Information We Collect from Users",
    body: "Account information: Name, email address, phone number, and password when you register.\n\nBooking data: Event bookings, ticket types, number of guests, and payment method preferences.\n\nLocation data: City selected by you or, with your permission, your approximate location for personalisation.\n\nUsage data: Pages visited, search queries, filters used, and interactions with listings.\n\nDevice data: Device type, operating system, browser type, and IP address.\n\nCommunications: Messages you send to us via contact forms or support channels.",
  },
  {
    title: "3. Information We Collect from Pub Partners",
    body: "When you register as a Pub Partner, we additionally collect business and verification information needed to list your venue and pay you:\n\nBusiness details: Business or venue name, address, contact person, business phone and email, and operating hours.\n\nVerification & compliance: Licence and registration details (such as liquor licence, FSSAI, and GST number) where required to verify your venue.\n\nPayout details: Bank account or UPI details used to settle the amounts we collect on your behalf, net of commission.\n\nListing content: Venue and event descriptions, pricing, images, offers, and cancellation policies you publish.\n\nPerformance data: Bookings, ticket sales, ratings, and other metrics shown in your partner dashboard.",
  },
  {
    title: "4. How We Use Your Information",
    body: "To create and manage accounts, process bookings, and settle Partner payouts.\n\nTo send booking confirmations, reminders, payout notices, and service updates via email or SMS.\n\nTo personalise the experience \u2014 for example, surfacing events in your city.\n\nTo verify Pub Partner eligibility and the accuracy of listings.\n\nTo improve the platform through analytics and user research.\n\nTo detect and prevent fraud, abuse, or security incidents.\n\nTo comply with applicable laws and legal obligations, including tax and record-keeping requirements.",
  },
  {
    title: "5. Sharing Your Information",
    body: "We do not sell your personal data. We may share information in the following limited circumstances:\n\nWith Pub Partners: When you make a booking, your name and contact details are shared with the relevant Pub Partner so they can manage attendance and provide the service.\n\nWith Users: A Pub Partner's public venue and event information is displayed to Users; payout and private business details are never shown publicly.\n\nPayment processors: Payment and payout data is handled by third-party processors (e.g. PhonePe) and is governed by their own privacy policies.\n\nService providers: We use third-party services for hosting, analytics, and communications, all operating under data processing agreements.\n\nLegal requirements: We may disclose data if required by law, court order, or to protect the rights and safety of Royvento, our Users, or our Partners.",
  },
  {
    title: "6. Cookies & Tracking",
    body: "We use cookies and similar technologies to keep you logged in, remember your preferences, and understand how the platform is used. You can disable cookies in your browser settings, but some features may not work correctly as a result.",
  },
  {
    title: "7. Data Retention",
    body: "We retain account, booking, and payout data for as long as your account is active or as required to fulfil the purposes described in this Policy. Transaction, invoice, and payout records may be retained for longer where tax or accounting law requires. You may request deletion of your account at any time; we will delete your personal data within 30 days, except where retention is required by law.",
  },
  {
    title: "8. Your Rights",
    body: "You have the right to:\n\n\u2022 Access the personal data we hold about you.\n\u2022 Correct inaccurate or incomplete information.\n\u2022 Request deletion of your personal data.\n\u2022 Opt out of marketing communications at any time.\n\u2022 Withdraw consent for optional data processing.\n\nTo exercise any of these rights, contact us using the details below.",
  },
  {
    title: "9. Security",
    body: "We implement industry-standard security measures to protect your information, including encrypted connections (HTTPS), hashed passwords, and access controls. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.\n\nRoyvento will never ask for your password, OTP, card CVV, PIN, or full card number by phone, email, or SMS. If you receive such a request, do not respond and report it to info@royvento.com.",
  },
  {
    title: "10. Children's Privacy",
    body: "The Service is intended for users aged 18 and over. We do not knowingly collect personal data from anyone under 18. If we become aware that a minor has provided us with personal data, we will delete it promptly.",
  },
  {
    title: "11. Changes to This Policy",
    body: 'We may update this Privacy Policy from time to time. We will notify you of material changes by updating the "Last updated" date at the top of this page. Your continued use of the Service after any changes constitutes acceptance of the updated Policy.',
  },
  {
    title: "12. Contact Us",
    body: "If you have questions or concerns about this Privacy Policy, please contact us via our Contact page or email info@royvento.com.",
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
          Royvento is committed to protecting your privacy and handling your data transparently.
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
