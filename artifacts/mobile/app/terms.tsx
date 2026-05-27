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
    body: "Bookings made through Royvento are subject to availability and confirmation by the Pub Partner, and are only confirmed once you receive a confirmation notification from us.\n\nPayment methods vary by event: some venues accept payment at the door (Cash on Delivery), while others require online payment at the time of booking. All stated prices are inclusive of applicable taxes unless noted otherwise.\n\nRoyvento may charge a convenience or booking fee on certain bookings or ticket purchases. Where applicable, this fee is shown to you clearly at checkout before you confirm and pay, and is collected by Royvento for the booking service it provides, separately from any amount payable to the Pub Partner. Unless stated otherwise at checkout or required by law, convenience and booking fees are non-refundable, including where a booking is later cancelled.\n\nCancellation and refund policies are set by individual Pub Partners and shown on the event detail page before you book. Where a refund is due, it is processed to your original payment method, less any non-refundable fees disclosed at checkout.\n\nYou are responsible for carrying valid ID and any required ticket or booking reference, complying with local laws and venue rules, and drinking responsibly. Entry may be refused for intoxication, underage attendance, or breach of venue policy without a refund.",
  },
  {
    title: "6. Terms for Pub Partners",
    body: "Listings & accuracy: You are solely responsible for your listings \u2014 venue details, event descriptions, pricing, capacity, ticket types, offers, images, and cancellation policies \u2014 and warrant they are accurate, lawful, and current. You must honour every confirmed booking at the price and terms displayed at the time of booking.\n\nLicences & compliance: You warrant that you hold all licences, permits, and registrations required to operate your venue and serve food and alcohol (including any liquor licence and FSSAI registration), and comply with all applicable laws including fire-safety, occupancy, taxation (GST), and local excise regulations. Royvento may request proof and may suspend or remove non-compliant listings.\n\nCommissions & payouts: Royvento charges a commission on bookings and ticket sales at the rate agreed in your partner dashboard or partner agreement. Commission is deducted from amounts collected on your behalf, and the net balance is paid out to your nominated bank account per the payout schedule then in effect. You are responsible for any tax invoices required by law and for your own tax obligations.\n\nCancellations & service quality: You set your own cancellation and refund policy but must apply it fairly and honour valid refund requests promptly. Repeated cancellations, no-shows, misleading listings, or poor service quality may result in reduced visibility, suspension, or removal.\n\nSuspension & delisting: Royvento may suspend, restrict, or delist a Partner account where there is suspected fraud, a breach of these Terms, a regulatory issue, or a risk to Users. Outstanding confirmed bookings must still be honoured, and verified payouts due for completed bookings will be settled in the ordinary course.",
  },
  {
    title: "7. Fraud Prevention & Payment Safety",
    body: "Royvento communicates with you only through its official website, mobile application, and the contact channels published on this site. Royvento and its staff will never ask for your one-time password (OTP), card CVV, PIN, full card number, UPI PIN, or account password by phone, email, SMS, or chat. All payments must be made only through the official payment options presented within the Service; never transfer money to a personal account or pay outside the platform at the request of any person claiming to represent Royvento or a Pub Partner. If you receive a suspicious request or believe you have been targeted by a fraudulent or phishing attempt, do not share any details and report it to us at info@royvento.com. Royvento is not responsible for losses arising from payments made, or information shared, outside its official channels.",
  },
  {
    title: "8. Intellectual Property",
    body: "All content on the Royvento platform \u2014 including logos, design, text, and software \u2014 is owned by or licensed to Royvento and may not be copied, reproduced, or distributed without prior written consent. Pub Partners grant Royvento a non-exclusive, royalty-free licence to display their venue name, logo, images, and listing content for the purpose of operating and promoting the Service.",
  },
  {
    title: "9. Disclaimer of Warranties",
    body: 'The Service is provided on an "as is" and "as available" basis, without warranties of any kind, whether express or implied, including implied warranties of merchantability, fitness for a particular purpose, accuracy, or non-infringement. Royvento does not warrant that the Service will be uninterrupted, timely, secure, or error-free, or that listings, pricing, availability, or other information provided by Pub Partners are accurate, complete, or current. The quality, safety, and legality of venues, events, food, and beverages are the sole responsibility of the relevant Pub Partner, and any reliance you place on the Service or on Pub Partner content is at your own risk.',
  },
  {
    title: "10. Limitation of Liability",
    body: "To the fullest extent permitted by law, Royvento and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, or consequential damages arising out of your use of the Service, including loss of profits, data, goodwill, or other intangible losses, or for the acts or omissions of any Pub Partner or User.\n\nOur total liability to you for any claim arising from or related to the Service shall not exceed the amount of commission or fees you paid to Royvento in the twelve months preceding the claim.",
  },
  {
    title: "11. Indemnification",
    body: "You agree to indemnify, defend, and hold harmless Royvento and its officers, directors, employees, and agents from and against any claims, demands, liabilities, damages, losses, costs, and expenses (including reasonable legal fees) arising out of or related to: (a) your use or misuse of the Service; (b) your breach of these Terms or of any applicable law; (c) any content you submit or listing you publish; or (d) your violation of the rights of any third party, including any Pub Partner or User. Royvento may, at your expense, assume the exclusive defence and control of any matter subject to indemnification, and you agree to cooperate with that defence.",
  },
  {
    title: "12. Termination & Suspension",
    body: "You may stop using the Service and close your account at any time. Royvento may suspend, restrict, or terminate your access to the Service, in whole or in part, with or without prior notice, where we reasonably believe you have breached these Terms or any applicable law, engaged in fraudulent, abusive, or harmful conduct, or where action is needed to protect the Service, other Users, or Pub Partners. On termination your right to use the Service ends immediately; confirmed bookings and any payment, payout, refund, or tax obligations accrued beforehand survive, as do the provisions that by their nature should continue (including Intellectual Property, Disclaimer of Warranties, Limitation of Liability, Indemnification, and Governing Law).",
  },
  {
    title: "13. Changes to These Terms",
    body: 'We may update these Terms from time to time. We will notify you of significant changes by updating the "Last updated" date at the top of this page. Your continued use of the Service after any changes constitutes acceptance of the new Terms.',
  },
  {
    title: "14. Governing Law",
    body: "These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of Kolkata, West Bengal.",
  },
  {
    title: "15. Contact Us",
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
