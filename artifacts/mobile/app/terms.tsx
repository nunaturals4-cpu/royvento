import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useColors } from "@/hooks/useColors";

const LAST_UPDATED = "26 May 2026";

const SECTIONS = [
  {
    title: "1. Introduction",
    body: 'Welcome to Royvento ("we", "us", or "our"). By accessing or using the Royvento platform \u2014 including our website, mobile application, and related services (collectively, the "Service") \u2014 you agree to be bound by these Terms & Conditions. If you do not agree, please do not use the Service.\n\nThese Terms apply to two types of account holders: Users (also "Customers"), who browse, book, and attend events or reserve tables; and Pub Partners (also "Partners" or "Vendors"), being pubs, clubs, restaurants, and event organisers who list their venues, events, offers, and tickets on Royvento.',
  },
  {
    title: "2. Our Role as a Platform",
    body: "Royvento is an intermediary marketplace that connects Users with Pub Partners. Pub Partners are independent third parties; Royvento does not own, operate, or control the venues, events, food, or beverages offered. Any contract for the supply of services or goods is formed directly between the User and the Pub Partner. Royvento is not a party to that contract and is not liable for its performance.",
  },
  {
    title: "3. Eligibility & Accounts",
    body: "You must be at least 18 years old to use the Service or to make or accept bookings at venues that serve alcohol. By creating an account you represent and warrant that you meet this requirement and that the information you provide is accurate and kept up to date. You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account.",
  },
  {
    title: "4. Acceptable Use",
    body: "All account holders agree not to misuse the Service, including but not limited to: submitting false, fraudulent, or duplicate bookings or listings; scraping or crawling content without permission; uploading unlawful, misleading, or infringing content; or attempting to interfere with the security or availability of the platform. You agree to treat venue staff, guests, Partners, and Royvento personnel with respect. Abusive, threatening, or illegal behaviour may result in immediate suspension of your account.",
  },
  {
    title: "5. Terms for Users",
    body: "Bookings made through Royvento are subject to availability and confirmation by the Pub Partner, and are only confirmed once you receive a confirmation notification from us.\n\nPayment methods vary by event: some venues accept payment at the door (Cash on Delivery), while others require online payment at the time of booking. All stated prices are inclusive of applicable taxes unless noted otherwise.\n\nCancellation and refund policies are set by individual Pub Partners and shown on the event detail page before you book. Where a refund is due, it is processed to your original payment method, less any non-refundable fees disclosed at checkout.\n\nYou are responsible for carrying valid ID and any required ticket or booking reference, complying with local laws and venue rules, and drinking responsibly. Entry may be refused for intoxication, underage attendance, or breach of venue policy without a refund.",
  },
  {
    title: "6. Terms for Pub Partners",
    body: "Listings & accuracy: You are solely responsible for your listings \u2014 venue details, event descriptions, pricing, capacity, ticket types, offers, images, and cancellation policies \u2014 and warrant they are accurate, lawful, and current. You must honour every confirmed booking at the price and terms displayed at the time of booking.\n\nLicences & compliance: You warrant that you hold all licences, permits, and registrations required to operate your venue and serve food and alcohol (including any liquor licence and FSSAI registration), and comply with all applicable laws including fire-safety, occupancy, taxation (GST), and local excise regulations. Royvento may request proof and may suspend or remove non-compliant listings.\n\nCommissions & payouts: Royvento charges a commission on bookings and ticket sales at the rate agreed in your partner dashboard or partner agreement. Commission is deducted from amounts collected on your behalf, and the net balance is paid out to your nominated bank account per the payout schedule then in effect. You are responsible for any tax invoices required by law and for your own tax obligations.\n\nCancellations & service quality: You set your own cancellation and refund policy but must apply it fairly and honour valid refund requests promptly. Repeated cancellations, no-shows, misleading listings, or poor service quality may result in reduced visibility, suspension, or removal.\n\nSuspension & delisting: Royvento may suspend, restrict, or delist a Partner account where there is suspected fraud, a breach of these Terms, a regulatory issue, or a risk to Users. Outstanding confirmed bookings must still be honoured, and verified payouts due for completed bookings will be settled in the ordinary course.",
  },
  {
    title: "7. Intellectual Property",
    body: "All content on the Royvento platform \u2014 including logos, design, text, and software \u2014 is owned by or licensed to Royvento and may not be copied, reproduced, or distributed without prior written consent. Pub Partners grant Royvento a non-exclusive, royalty-free licence to display their venue name, logo, images, and listing content for the purpose of operating and promoting the Service.",
  },
  {
    title: "8. Limitation of Liability",
    body: "To the fullest extent permitted by law, Royvento and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, or consequential damages arising out of your use of the Service, including loss of profits, data, goodwill, or other intangible losses, or for the acts or omissions of any Pub Partner or User.\n\nOur total liability to you for any claim arising from or related to the Service shall not exceed the amount of commission or fees you paid to Royvento in the twelve months preceding the claim.",
  },
  {
    title: "9. Changes to These Terms",
    body: 'We may update these Terms from time to time. We will notify you of significant changes by updating the "Last updated" date at the top of this page. Your continued use of the Service after any changes constitutes acceptance of the new Terms.',
  },
  {
    title: "10. Governing Law",
    body: "These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of Kolkata, West Bengal.",
  },
  {
    title: "11. Contact Us",
    body: "If you have questions about these Terms, please reach out via our Contact page or email us at info@royvento.com.",
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
