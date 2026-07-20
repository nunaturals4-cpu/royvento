import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useColors } from "@/hooks/useColors";

const LAST_UPDATED = "1 July 2026";

const SECTIONS = [
  {
    title: "1. Who We Are",
    body: 'Royvento ("we", "us", or "our") operates the Royvento platform \u2014 a marketplace connecting customers ("Users") with pubs, clubs, event organisers, and game/entertainment organisers ("Partners") across India, including ticketed events, table and game bookings, food & drink offers, a loyalty points programme, and our premium Solo Connect feature. This Privacy Policy explains how we collect, use, and protect personal and business information when you use our Service, whether as a User or a Partner.',
  },
  {
    title: "2. Consent & Legal Basis",
    body: "By using the Service and providing your information, you consent to the collection, use, storage, processing, and disclosure of your information as described in this Policy, in accordance with the Digital Personal Data Protection Act, 2023, the Information Technology Act, 2000, and other applicable laws. We process personal data where you have given consent, where it is necessary to provide the Service or perform a contract with you, to comply with a legal obligation, or for our legitimate interests in operating, securing, and improving the Service.\n\nProviding certain information is necessary to use the Service; if you do not provide it, we may be unable to offer some features. You may withdraw your consent at any time by contacting us, although this will not affect any processing already carried out and may limit your ability to use the Service.",
  },
  {
    title: "3. Information We Collect from Users",
    body: "Account information: Name, email address, phone number, gender (collected once during onboarding), and password when you register.\n\nBooking data: Event, table, and game bookings, ticket types, number of guests, and payment method preferences.\n\nLocation data: City selected by you or, with your permission, your approximate location for personalisation.\n\nUsage data: Pages visited, search queries, filters used, and interactions with listings.\n\nDevice data: Device type, operating system, browser type, and IP address.\n\nCommunications: Messages you send to us via contact forms or support channels.",
  },
  {
    title: "4. Information We Collect from Pub Partners",
    body: "When you register as a Pub Partner, we additionally collect business and verification information needed to list your venue and pay you:\n\nBusiness details: Business or venue name, address, contact person, business phone and email, and operating hours.\n\nVerification & compliance: Licence and registration details (such as liquor licence, FSSAI, and GST number) where required to verify your venue.\n\nPayout details: Bank account or UPI details used to settle the amounts we collect on your behalf, net of commission.\n\nListing content: Venue and event descriptions, pricing, images, offers, and cancellation policies you publish.\n\nPerformance data: Bookings, ticket sales, ratings, and other metrics shown in your partner dashboard.",
  },
  {
    title: "5. Solo Connector & Verification",
    body: "If you use our premium Solo Connector feature, we collect additional information specifically to verify you are a real person and to keep members safe:\n\nMobile verification: Your mobile number, verified via Firebase Phone Authentication (an OTP sent by SMS). We store the verified number and a Firebase account identifier; we do not store the SMS code.\n\nLive selfie: A selfie captured live with your camera (gallery uploads are not accepted), used solely to confirm you are a real, unique person.\n\nGender & location: The gender you select and your current city. Gender is shown only as an aggregate member count on group cards; city is used so you only see groups in your city.\n\nGroup activity: Groups you create or join and your membership status.\n\nGroup chat: Messages you post in a group's temporary chat. These are visible to that group's members and are automatically and permanently deleted every day at 3:00 AM.\n\nReports: Any reports (and optional evidence photos) you submit, or that are submitted about you, for safety and moderation.\n\nYour selfie is reviewed only by Royvento's moderation team for verification and is never shown to other members \u2014 it is served only through an access-controlled, admin-authenticated channel. Within a group, other members see only your name, the group's aggregate gender counts, and your approved status \u2014 not your selfie, phone number, or exact location.\n\nRoyvento only provides a platform for users to discover and join social groups. Royvento does not organize, supervise, verify, monitor, or take responsibility for meetings, outings, interactions, conversations, or activities that occur after users join a group. Users participate entirely at their own risk and are responsible for exercising personal judgment and ensuring their own safety. Royvento is not responsible for any disputes, misconduct, financial transactions, injuries, losses, damages, or incidents that occur during or after meeting group members.\n\nIf you ever feel unsafe, leave immediately and contact local emergency services directly \u2014 in India dial 112, 100, or 1091. See our Community Guidelines and Terms & Conditions.",
  },
  {
    title: "6. How We Use Your Information",
    body: "To create and manage accounts, process bookings, and settle Partner payouts.\n\nTo send booking confirmations, reminders, payout notices, and service updates via email or SMS.\n\nTo personalise the experience \u2014 for example, surfacing events in your city.\n\nTo verify Partner eligibility and the accuracy of listings.\n\nTo verify members for Solo Connector, enforce same-city group rules, review reports, and act against misuse.\n\nTo run the loyalty points programme \u2014 awarding, expiring, and reconciling points.\n\nTo improve the platform through analytics and user research.\n\nTo detect and prevent fraud, abuse, or security incidents.\n\nTo comply with applicable laws and legal obligations, including tax and record-keeping requirements.",
  },
  {
    title: "7. Sharing Your Information",
    body: "We do not sell your personal data. We may share information in the following limited circumstances:\n\nWith Pub Partners: When you make a booking, your name and contact details are shared with the relevant Pub Partner so they can manage attendance and provide the service.\n\nWith Users: A Partner's public venue and event information is displayed to Users; payout and private business details are never shown publicly.\n\nWithin Solo Connector groups: Other members of a group you join see only your name and approved status. Your selfie, phone number, and exact location are never shared with other members.\n\nPayment processors: Payment and payout data is handled by third-party processors (e.g. PhonePe) and is governed by their own privacy policies.\n\nService providers: We use third-party services for hosting, analytics, and communications, all operating under data processing agreements.\n\nLegal requirements: We may disclose data if required by law, court order, or to protect the rights and safety of Royvento, our Users, or our Partners.",
  },
  {
    title: "8. Cookies & Tracking",
    body: "We use cookies and similar technologies to keep you logged in, remember your preferences, and understand how the platform is used. You can disable cookies in your browser settings, but some features may not work correctly as a result.",
  },
  {
    title: "9. Third-Party Services & Links",
    body: "The Service integrates with and links to third-party services \u2014 including payment processors (e.g. PhonePe), authentication (e.g. Firebase), mapping, hosting, analytics, and communications providers. When you use these, your information may be processed by them under their own privacy policies, which we do not control. The Service may also contain links to third-party websites; we are not responsible for the content, security, or privacy practices of those sites, and we encourage you to review their policies before providing any information.",
  },
  {
    title: "10. International Data Transfers",
    body: "We are based in India and primarily process data within India. Some of our service providers may store or process data on servers located outside India. Where data is transferred across borders, we take reasonable steps to ensure it continues to be protected consistently with this Policy and applicable law.",
  },
  {
    title: "11. Data Retention",
    body: "We retain account, booking, and payout data for as long as your account is active or as required to fulfil the purposes described in this Policy. Transaction, invoice, and payout records may be retained for longer where tax or accounting law requires. Solo Connector group chat messages are deleted automatically every day at 3:00 AM, and inactive groups (with their chat and data) are removed automatically after 15 days. Verification records (including your selfie) are retained only while needed to keep your verification valid and to maintain platform safety, and are deleted when you close your account or your verification is removed, except where short-term retention is required to handle a safety report or to comply with law. You may request deletion of your account at any time; we will delete your personal data within 30 days, except where retention is required by law.",
  },
  {
    title: "12. Your Rights",
    body: "Subject to applicable law, including the Digital Personal Data Protection Act, 2023, you have the right to:\n\n\u2022 Access the personal data we hold about you.\n\u2022 Correct inaccurate or incomplete information.\n\u2022 Request deletion of your personal data.\n\u2022 Opt out of marketing communications at any time.\n\u2022 Withdraw consent for optional data processing.\n\u2022 Nominate another individual to exercise your rights in the event of your death or incapacity.\n\nTo exercise any of these rights, contact us using the details below. We may need to verify your identity before acting on a request, and some rights may be subject to legal exceptions.",
  },
  {
    title: "13. Security",
    body: "We implement industry-standard security measures to protect your information, including encrypted connections (HTTPS), hashed passwords, and access controls. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.\n\nRoyvento will never ask for your password, OTP, card CVV, PIN, or full card number by phone, email, or SMS. If you receive such a request, do not respond and report it to support@royvento.com.",
  },
  {
    title: "14. Limitation of Liability",
    body: "While we take reasonable measures to protect your information, you provide it at your own risk. To the fullest extent permitted by law, Royvento is not liable for any unauthorised access to, or loss, misuse, or alteration of, your information arising from events beyond our reasonable control \u2014 including hacking, third-party breaches, or your own failure to safeguard your credentials. Your use of the Service is also governed by our Terms & Conditions, including their limitation of liability.",
  },
  {
    title: "15. Children's Privacy",
    body: "The Service is intended for users aged 18 and over. We do not knowingly collect personal data from anyone under 18. If we become aware that a minor has provided us with personal data, we will delete it promptly.",
  },
  {
    title: "16. Grievance Officer & Data Protection Contact",
    body: "In accordance with the Information Technology Act, 2000, the rules made thereunder, and the Digital Personal Data Protection Act, 2023, you may contact our Grievance Officer regarding this Policy, your personal data, or any concern about how your information is handled:\n\nSandip Dey \u2014 Grievance Officer, Royvento\nNear New Town Water Tank No. 3, Kolkata - 700156\nEmail: support@royvento.com\n\nWe will acknowledge your complaint within 48 hours and endeavour to resolve it within the timelines prescribed by applicable law. If you are not satisfied with our response, you may have the right to escalate your complaint to the Data Protection Board of India or other competent authority.",
  },
  {
    title: "17. Changes to This Policy",
    body: 'We may update this Privacy Policy from time to time. We will notify you of material changes by updating the "Last updated" date at the top of this page. Your continued use of the Service after any changes constitutes acceptance of the updated Policy.',
  },
  {
    title: "18. Contact Us",
    body: "If you have questions or concerns about this Privacy Policy, please contact us via our Contact page or email support@royvento.com.",
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
