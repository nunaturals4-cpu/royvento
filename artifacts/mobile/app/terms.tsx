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
    title: "1. Introduction",
    body: 'Welcome to Royvento ("we", "us", or "our"). By accessing or using the Royvento platform \u2014 including our website, mobile application, and related services (collectively, the "Service") \u2014 you agree to be bound by these Terms & Conditions. If you do not agree, please do not use the Service.\n\nThese Terms apply to two types of account holders: Users (also "Customers") \u2014 individuals who browse, book, and attend events, reserve tables, book games, or join Solo Connect groups; and Partners (also "Pub Partners" or "Vendors") \u2014 pubs, clubs, restaurants, event organisers, and game/entertainment organisers who list their venues, events, games, offers, and tickets on Royvento.\n\nRoyvento brings these together across nightlife (pubs & clubs), ticketed events, games & entertainment venues, food & drink offers, a loyalty points programme, and Solo Connect \u2014 a premium, verified group-discovery feature for going out alone.\n\nSections 3\u20134 apply to all account holders. Section 5 applies specifically to Users; Section 6 applies specifically to Partners; Section 7 applies specifically to Solo Connect.',
  },
  {
    title: "2. Our Role as a Platform",
    body: 'Royvento is an intermediary marketplace that connects Users with Pub Partners. Pub Partners are independent third parties; Royvento does not own, operate, or control the venues, events, food, or beverages offered through the Service. Any contract for the supply of services or goods is formed directly between the User and the Pub Partner. Royvento is not a party to that contract and is not liable for its performance.\n\nRoyvento acts solely as an "intermediary" within the meaning of the Information Technology Act, 2000 and the rules made thereunder. Listings, offers, reviews, images, group content, and other materials made available through the Service are provided by Users and Partners, not by Royvento. Except where we expressly state that we have verified something, Royvento does not create, endorse, verify, or guarantee any third-party content, and is entitled to the protections and safe harbour available to intermediaries under applicable law.',
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
    body: "Bookings. Bookings made through Royvento are subject to availability and confirmation by the Pub Partner, and are only confirmed once you receive a confirmation notification from us.\n\nPayments. Payment methods vary by event: some venues accept payment at the door (Cash on Delivery), while others require online payment at the time of booking via our payment processor. All stated prices are inclusive of applicable taxes unless noted otherwise.\n\nFees & charges. Royvento may charge a convenience or booking fee on certain bookings or ticket purchases. Where applicable, this fee is shown to you clearly at checkout before you confirm and pay, and is collected by Royvento for the booking service it provides, separately from any amount payable to the Pub Partner. Unless stated otherwise at checkout or required by law, convenience and booking fees are non-refundable, including where a booking is later cancelled.\n\nCancellations & refunds. Cancellation and refund policies are set by individual Pub Partners and shown on the event detail page before you book. Where a refund is due, it is processed to your original payment method, less any non-refundable fees disclosed at checkout. Royvento facilitates but is not responsible for refund decisions made by Pub Partners.\n\nAt the venue. You are responsible for carrying valid ID and any required ticket or booking reference, for complying with all local laws and venue rules, and for drinking responsibly. Entry may be refused for intoxication, underage attendance, or breach of venue policy without a refund.\n\nLoyalty points. Royvento may award promotional loyalty points for activity such as bookings, check-ins, referrals, or subscriptions. Points have no cash value, are non-transferable, may expire (typically after a set period from the date earned), and may be adjusted or revoked where they were earned through error, fraud, or abuse. We may change or end the points programme at any time.",
  },
  {
    title: "6. Terms for Pub Partners",
    body: "Listings & accuracy. You are solely responsible for the content of your listings \u2014 venue details, event descriptions, pricing, capacity, ticket types, offers, images, and cancellation policies \u2014 and warrant they are accurate, lawful, and kept current. You must honour every confirmed booking at the price and terms displayed at the time of booking.\n\nLicences & compliance. You represent and warrant that you hold all licences, permits, and registrations required to operate your venue and serve food and alcohol (including any liquor licence and FSSAI registration), and that you comply with all applicable laws, including fire-safety, occupancy, taxation (GST), and local excise regulations. Royvento may request proof of such licences and may suspend or remove listings that do not comply.\n\nCommissions & payouts. Royvento charges a commission on bookings and ticket sales made through the Service, at the rate agreed in your partner dashboard or partner agreement. Commission is deducted from amounts collected on your behalf, and the net balance is paid out to your nominated bank account according to the payout schedule then in effect. You are responsible for issuing any tax invoices required by law to your customers and for your own tax obligations.\n\nCancellations & service quality. You set your own cancellation and refund policy but must apply it fairly and honour valid refund requests promptly. Repeated cancellations, no-shows, misleading listings, or poor service quality may result in reduced visibility, suspension, or removal from the platform.\n\nPartner indemnity. You are solely responsible for the goods, services, events, and experiences you provide, and for compliance with all laws applicable to them. You agree to indemnify and hold Royvento harmless from any claim, penalty, or liability arising from your listings, your service to customers, your breach of these Terms, or your non-compliance with any law, licence, or tax obligation.\n\nSuspension & delisting. Royvento may suspend, restrict, or delist a Partner account at its discretion where there is suspected fraud, a breach of these Terms, a regulatory issue, or a risk to Users. Outstanding confirmed bookings must still be honoured, and verified payouts due to you for completed bookings will be settled in the ordinary course.",
  },
  {
    title: "7. Solo Connector",
    body: "Royvento only provides a platform for users to discover and join social groups. Royvento does not organize, supervise, verify, monitor, or take responsibility for meetings, outings, interactions, conversations, or activities that occur after users join a group. Users participate entirely at their own risk and are responsible for exercising personal judgment and ensuring their own safety. Royvento is not responsible for any disputes, misconduct, financial transactions, injuries, losses, damages, or incidents that occur during or after meeting group members.\n\nWhat it is. Solo Connector is a premium, moderated feature that lets verified members discover and join small, activity-based groups (for nightlife, events, games, and activities) so they can go out when going alone. It is not a dating service \u2014 members join experiences, not individuals. See our Community Guidelines.\n\nEligibility. Solo Connector is available only to Royvento Premium subscribers and verified Partners, and only to members aged 18 or over. Access may be withdrawn at any time for breach of these Terms.\n\nVerification & consent. Before creating or joining any group you must verify your mobile number (via Firebase Phone Authentication), capture a live selfie, select your gender, and acknowledge these Terms, the Privacy Policy, and the Community Guidelines. You represent that the selfie is a genuine, current image of yourself. Royvento reviews submissions and may approve, reject, suspend, ban, or later revoke access at its discretion.\n\nSingle-gender, same-city groups. For member safety, groups are single-gender and you may only view or join groups that match the gender recorded on your profile and your current verified city. Mixed-gender groups are not permitted, and you may not attempt to access groups outside your gender category or city.\n\nConduct & zero-tolerance policy. You must treat every member with respect. Harassment, abuse, threats, impersonation, fake identity, spam, solicitation, sharing of others' private information, or any unsafe behaviour is strictly prohibited. Violations result in immediate and permanent removal from Solo Connect, forfeiture of your reputation points, and may lead to suspension of your Royvento account and referral to law-enforcement where appropriate.\n\nTemporary group chat. Each group includes a temporary chat whose messages are automatically and permanently deleted every day at 3:00 AM. The chat is not a record-keeping service; do not rely on it to retain information and never share sensitive, personal, or financial details in it.\n\nVoluntary participation. Joining Solo Connect and attending any meetup is entirely your own choice. Royvento does not require you to meet anyone, and you may leave a group or stop participating at any time. By choosing to use Solo Connect and to meet other members offline, you accept full personal responsibility for that decision.\n\nOffline meetings & your safety. Members may choose to meet in person. Royvento does not arrange, host, supervise, accompany, vet beyond the verification described above, or guarantee any meetup, member, venue, or outcome, and is not responsible or liable for anything that happens offline, including the conduct of other members. You meet and attend entirely at your own risk. Always meet in public places, tell someone where you are going, and never share financial information. If at any point you feel unsafe, suspicious, or uncomfortable, leave the location immediately and, where needed, contact local emergency services directly \u2014 in India dial 112 (emergency), 100 (police), or 1091 (women's helpline). Royvento's role is limited to providing the platform and the in-app Safety Center emergency contacts for your convenience; it cannot intervene in or take responsibility for offline interactions. Your decision to use Solo Connect, to meet anyone, and to act on any safety concern remains your own.\n\nReputation & ratings. After activities, members may rate the group, organiser, and overall experience. These feed a reputation score. Members with repeated violations or consistently poor ratings may lose visibility or access to Solo Connect.",
  },
  {
    title: "8. Fraud Prevention & Payment Safety",
    body: "Royvento communicates with you only through its official website, mobile application, and the contact channels published on this site. Royvento and its staff will never ask for your one-time password (OTP), card CVV, PIN, full card number, UPI PIN, or account password by phone, email, SMS, or chat. All payments must be made only through the official payment options presented within the Service; never transfer money to a personal account or pay outside the platform at the request of any person claiming to represent Royvento or a Pub Partner. If you receive a suspicious request or believe you have been targeted by a fraudulent or phishing attempt, do not share any details and report it to us at support@royvento.com. Royvento is not responsible for losses arising from payments made, or information shared, outside its official channels.",
  },
  {
    title: "9. Assumption of Risk & Personal Responsibility",
    body: "Attending venues, events, games, parties, and any activity discovered through Royvento is voluntary and undertaken at your own risk. You are responsible for your own health, safety, conduct, belongings, and lawful behaviour, including responsible consumption of alcohol and compliance with all venue rules and local laws. Royvento does not supervise, control, or guarantee the condition or safety of any venue or event, the conduct of any Partner, staff member, performer, or other guest, or any outcome of your attendance.\n\nTo the fullest extent permitted by law, Royvento is not liable for any personal injury, illness, death, loss, theft, damage, altercation, harassment, or other harm arising before, during, or after any booking, event, meetup, or activity, whether caused by a Partner, another User, a third party, or your own acts or omissions. You are solely responsible for assessing whether any venue, event, or activity is appropriate and safe for you.",
  },
  {
    title: "10. User-Generated Content & Reviews",
    body: 'The Service may allow you to submit reviews, ratings, photos, comments, group messages, and other materials ("User Content"). You are solely responsible for your User Content and represent that you own or have the rights to it and that it is lawful, accurate, and not defamatory, obscene, infringing, harassing, or misleading. By submitting User Content you grant Royvento a worldwide, perpetual, irrevocable, royalty-free, transferable, and sub-licensable licence to use, host, store, reproduce, adapt, publish, translate, and display it in connection with operating, improving, and promoting the Service.\n\nRoyvento does not endorse any User Content and may, without obligation and without notice, review, moderate, refuse, edit, disable, or remove any User Content at its discretion \u2014 including on receipt of a valid complaint or legal notice \u2014 without liability to you.',
  },
  {
    title: "11. Third-Party Links & Services",
    body: "The Service may contain links to, or integrations with, third-party websites, applications, and services (including payment processors, mapping, authentication, and analytics providers). These are provided for convenience only. Royvento does not control and is not responsible for the content, policies, availability, security, or practices of any third party, and your use of them is governed by their own terms and undertaken at your own risk.",
  },
  {
    title: "12. Intellectual Property",
    body: "All content on the Royvento platform \u2014 including logos, design, text, and software \u2014 is owned by or licensed to Royvento and may not be copied, reproduced, or distributed without prior written consent. Pub Partners grant Royvento a non-exclusive, royalty-free licence to display their venue name, logo, images, and listing content for the purpose of operating and promoting the Service.",
  },
  {
    title: "13. Disclaimer of Warranties",
    body: 'The Service is provided on an "as is" and "as available" basis, without warranties of any kind, whether express or implied, including implied warranties of merchantability, fitness for a particular purpose, accuracy, or non-infringement. Royvento does not warrant that the Service will be uninterrupted, timely, secure, or error-free, or that listings, pricing, availability, or other information provided by Pub Partners are accurate, complete, or current. The quality, safety, and legality of venues, events, food, and beverages are the sole responsibility of the relevant Pub Partner, and any reliance you place on the Service or on Pub Partner content is at your own risk.',
  },
  {
    title: "14. Limitation of Liability",
    body: "To the fullest extent permitted by law, Royvento and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, punitive, or consequential damages arising out of or related to your use of, or inability to use, the Service, including but not limited to damages for loss of profits, revenue, data, goodwill, or other intangible losses, for any service interruption or data loss, or for the acts or omissions of any Pub Partner, User, or third party.\n\nTo the maximum extent permitted by law, Royvento's total aggregate liability to you for any and all claims arising from or related to the Service shall not exceed the greater of (a) the total fees or commission you actually paid to Royvento in connection with the transaction giving rise to the claim, or (b) INR 1,000 (Indian Rupees one thousand).\n\nNothing in these Terms excludes or limits any liability that cannot be excluded or limited under applicable law. Where such liability cannot be wholly excluded, it is limited to the minimum extent permitted by law.",
  },
  {
    title: "15. Indemnification",
    body: "You agree to indemnify, defend, and hold harmless Royvento and its officers, directors, employees, and agents from and against any claims, demands, liabilities, damages, losses, costs, and expenses (including reasonable legal fees) arising out of or related to: (a) your use or misuse of the Service; (b) your breach of these Terms or of any applicable law; (c) any content you submit or listing you publish; or (d) your violation of the rights of any third party, including any Pub Partner or User. Royvento may, at your expense, assume the exclusive defence and control of any matter subject to indemnification, and you agree to cooperate with that defence.",
  },
  {
    title: "16. Force Majeure",
    body: "Royvento shall not be liable for any failure or delay in performing its obligations, or for any unavailability of the Service, caused by circumstances beyond its reasonable control, including acts of God, natural disasters, epidemics or pandemics, fire, flood, power or internet failure, strikes, civil unrest, war, terrorism, government or regulatory action, or the failure of any third-party service provider.",
  },
  {
    title: "17. Termination & Suspension",
    body: "You may stop using the Service and close your account at any time. Royvento may suspend, restrict, or terminate your access to the Service, in whole or in part, with or without prior notice, where we reasonably believe you have breached these Terms or any applicable law, engaged in fraudulent, abusive, or harmful conduct, or where action is needed to protect the Service, other Users, or Pub Partners. On termination your right to use the Service ends immediately; confirmed bookings and any payment, payout, refund, or tax obligations accrued beforehand survive, as do the provisions that by their nature should continue (including Assumption of Risk & Personal Responsibility, Intellectual Property, Disclaimer of Warranties, Limitation of Liability, Indemnification, Force Majeure, Grievance Redressal & Dispute Resolution, General Provisions, and Governing Law).",
  },
  {
    title: "18. Grievance Redressal & Dispute Resolution",
    body: "Grievance Officer. In accordance with the Information Technology Act, 2000 and the rules made thereunder, any complaint regarding the Service or any content available on it may be addressed to our Grievance Officer:\n\nSandip Dey \u2014 Grievance Officer, Royvento\nNear New Town Water Tank No. 3, Kolkata - 700156\nEmail: support@royvento.com\n\nWe will acknowledge your complaint within 48 hours and endeavour to resolve it within the timelines prescribed by applicable law.\n\nAmicable resolution. Before initiating any formal proceedings, you agree to first contact us and attempt in good faith to resolve any dispute informally.\n\nArbitration. Any dispute, claim, or difference arising out of or relating to these Terms or the Service that is not resolved informally shall be referred to and finally settled by arbitration by a sole arbitrator appointed by mutual agreement of the parties in accordance with the Arbitration and Conciliation Act, 1996. The seat and venue of arbitration shall be Kolkata, West Bengal, and the proceedings shall be conducted in English. The arbitrator's award shall be final and binding on the parties. Nothing in this clause prevents Royvento from seeking urgent injunctive or equitable relief before any court of competent jurisdiction.",
  },
  {
    title: "19. General Provisions",
    body: "Entire agreement. These Terms, together with the Privacy Policy and any policies referenced here, constitute the entire agreement between you and Royvento regarding the Service and supersede all prior agreements or understandings.\n\nSeverability. If any provision of these Terms is held invalid or unenforceable, it will be limited or removed to the minimum extent necessary, and the remaining provisions will remain in full force and effect.\n\nNo waiver. Royvento's failure to enforce any right or provision of these Terms will not be a waiver of that right or provision.\n\nAssignment. You may not assign or transfer these Terms without our prior written consent. Royvento may assign these Terms, in whole or in part, to any affiliate or successor without restriction.\n\nNo partnership or agency. Nothing in these Terms creates any partnership, joint venture, employment, franchise, or agency relationship between you and Royvento.",
  },
  {
    title: "20. Changes to These Terms",
    body: 'We may update these Terms from time to time. We will notify you of significant changes by updating the "Last updated" date at the top of this page. Your continued use of the Service after any changes constitutes acceptance of the new Terms.',
  },
  {
    title: "21. Governing Law & Jurisdiction",
    body: "These Terms shall be governed by and construed in accordance with the laws of India. Subject to the Grievance Redressal & Dispute Resolution section above, the courts of Kolkata, West Bengal shall have exclusive jurisdiction over any dispute arising under or in connection with these Terms.",
  },
  {
    title: "22. Contact Us",
    body: "If you have questions about these Terms, please reach out via our Contact page or email us at support@royvento.com.",
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
