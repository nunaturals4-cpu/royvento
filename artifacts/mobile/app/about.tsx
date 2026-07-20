import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { MobileFooter } from "@/components/MobileFooter";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type Icon = keyof typeof Ionicons.glyphMap;

const SERVICES: { icon: Icon; title: string; desc: string; href: string }[] = [
  { icon: "wine-outline", title: "Pubs & Clubs", desc: "Discover rooftop bars, microbreweries and nightclubs. Book tables and unlock exclusive food & drink offers.", href: "/(tabs)/pubs" },
  { icon: "ticket-outline", title: "Events", desc: "From live music and comedy to curated nights out — browse and book tickets to the experiences everyone's talking about.", href: "/events" },
  { icon: "game-controller-outline", title: "Games & Sports", desc: "Book gaming lounges, arcades, turfs and sports venues by the hour, the table or the package — instantly.", href: "/games-and-sports" },
  { icon: "balloon-outline", title: "Private Parties", desc: "Host your own ticketed party or join one nearby. Set the vibe, sell entry and manage guests, all in one place.", href: "/private-parties" },
  { icon: "heart-outline", title: "Solo Connect", desc: "Premium, verified, same-city activity groups for meeting like-minded people around real-world plans — safely.", href: "/solo-connect" },
  { icon: "sparkles-outline", title: "Offers & Rewards", desc: "Hand-picked deals, membership perks and loyalty points that turn every night out into more value.", href: "/pub-offers" },
];

const EARN: { icon: Icon; title: string; desc: string }[] = [
  { icon: "megaphone-outline", title: "Event Organizers", desc: "Publish events, sell tickets in minutes and reach a ready audience. Track sales live and get paid on time." },
  { icon: "game-controller-outline", title: "Game Organizers", desc: "List your gaming or sports venue with flexible pricing and packages. Fill idle slots and grow repeat play." },
  { icon: "wine-outline", title: "Pubs & Clubs", desc: "Turn quiet nights into full houses. Drive table bookings and build loyalty — while we handle payments and discovery." },
  { icon: "storefront-outline", title: "Creators & Hosts", desc: "Build a following, host your own parties and experiences, and monetize your community with ticketed events." },
  { icon: "cash-outline", title: "Everyday Users", desc: "Earn loyalty points and referral rewards as you book, and host your own ticketed parties to earn from your circle." },
];

const TRUST: { icon: Icon; title: string; desc: string }[] = [
  { icon: "shield-checkmark-outline", title: "Verified Partners", desc: "Every venue and organizer is reviewed before going live, so you can book with confidence." },
  { icon: "wallet-outline", title: "Secure Payments & Payouts", desc: "Encrypted checkout for users and transparent, on-time settlements for partners." },
  { icon: "bar-chart-outline", title: "Real-Time Dashboards", desc: "Partners see bookings, ticket sales, ratings and payouts update the moment they happen." },
  { icon: "trending-up-outline", title: "Built to Grow You", desc: "Smart discovery puts your listings in front of the right audience in the right city." },
];

const FAQS: { question: string; answer: string }[] = [
  { question: "What is Royvento?", answer: "Royvento is India's premium discovery and booking platform for going out — pubs and clubs, ticketed events, games and sports venues, private parties and verified social groups." },
  { question: "Is Royvento free to use?", answer: "Yes. Browsing, discovering and booking on Royvento is free for users. You only pay for the tickets, tables or experiences you choose to book, plus any charges shown transparently at checkout." },
  { question: "How do I earn money on Royvento?", answer: "If you run a pub, club, event, gaming venue, or you're a creator or host, you can list on Royvento and earn from ticket sales, table and game bookings, packages and offers. Everyday users earn loyalty rewards and can host their own ticketed parties." },
  { question: "How do partner payouts work?", answer: "Royvento collects payments securely on your behalf and settles them to your registered bank account or UPI, net of our commission. You track every booking and payout in real time from your partner dashboard." },
  { question: "How do I become a partner?", answer: "Tap 'Become a Partner', pick your category — pub/club, event organizer or game organizer — and complete a short onboarding. Once verified, your listing goes live and starts accepting bookings." },
  { question: "Is Royvento safe and verified?", answer: "Yes. Partners are verified before going live, payments run over encrypted channels, and our Solo Connect groups add live selfie and phone verification." },
];

export default function AboutScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const isPartner = !!user && ["vendor", "organizer", "game_organizer", "admin"].includes(user.role);
  const partnerHref = isPartner ? "/vendor/dashboard" : "/become-vendor";
  const partnerLabel = isPartner ? "Go to Dashboard" : "Become a Partner";
  const primaryCta = user
    ? { href: "/(tabs)/pubs", label: "Explore Royvento" }
    : { href: "/(auth)/register", label: "Get Started" };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 }}>
        {/* Hero */}
        <LinearGradient
          colors={[colors.primary + "22", colors.background]}
          style={{ paddingTop: topPadding + 8, paddingHorizontal: 20, paddingBottom: 28 }}
        >
          <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 4, marginBottom: 16, alignSelf: "flex-start" }}>
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.kicker, { color: colors.primary }]}>ABOUT ROYVENTO</Text>
          <Text style={[styles.h1, { color: colors.foreground }]}>Where great nights out begin.</Text>
          <Text style={[styles.lead, { color: colors.mutedForeground }]}>
            Royvento is the premium platform that connects people to unforgettable experiences — and connects venues,
            organizers and creators to the audiences who love them. Discover, book and host pubs, events, games,
            parties and verified social groups, all in one beautifully simple place.
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/pubs" as never)}
              style={[styles.cta, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>Explore Royvento</Text>
              <Ionicons name="arrow-forward" size={15} color={colors.primaryForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push(partnerHref as never)}
              style={[styles.cta, { borderWidth: 1, borderColor: colors.border, backgroundColor: "transparent" }]}
            >
              <Text style={[styles.ctaText, { color: colors.foreground }]}>{partnerLabel}</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Who we are */}
        <Section colors={colors} kicker="WHO WE ARE" title="One platform for everything worth going out for.">
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Royvento was built on a simple belief: finding and booking a great experience should feel as good as the
            experience itself. We bring together the best pubs, clubs, events, gaming venues, parties and communities
            across India — and make them discoverable, bookable and rewarding in a few taps.
          </Text>
          <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 12 }]}>
            For the businesses and creators behind those experiences, Royvento is a growth engine — a place to reach
            new customers, fill seats and slots, sell tickets, and get paid without the operational headaches.
          </Text>
        </Section>

        {/* Mission */}
        <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
          <View style={[styles.missionCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Ionicons name="sparkles" size={22} color={colors.primary} />
            <Text style={[styles.kicker, { color: colors.mutedForeground, marginTop: 10 }]}>OUR MISSION</Text>
            <Text style={[styles.mission, { color: colors.foreground }]}>
              To make every night out effortless to discover, delightful to book, and profitable to host — while
              raising the standard for trust in going out.
            </Text>
          </View>
        </View>

        {/* Services */}
        <Section colors={colors} kicker="WHAT WE DO" title="The Royvento ecosystem">
          {SERVICES.map((s) => (
            <TouchableOpacity
              key={s.title}
              onPress={() => router.push(s.href as never)}
              style={[styles.tile, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              <View style={[styles.tileIcon, { borderColor: colors.border }]}>
                <Ionicons name={s.icon} size={20} color={colors.primary} />
              </View>
              <Text style={[styles.tileTitle, { color: colors.foreground }]}>{s.title}</Text>
              <Text style={[styles.tileDesc, { color: colors.mutedForeground }]}>{s.desc}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10 }}>
                <Text style={{ color: colors.primary, fontSize: 13, fontFamily: "Inter_500Medium" }}>Explore</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.primary} />
              </View>
            </TouchableOpacity>
          ))}
        </Section>

        {/* Earn */}
        <Section colors={colors} kicker="EARN WITH ROYVENTO" title="Turn your venue, events or community into income.">
          {EARN.map((s) => (
            <View key={s.title} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.primary + "1A" }]}>
                <Ionicons name={s.icon} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.tileTitle, { color: colors.foreground, marginBottom: 3 }]}>{s.title}</Text>
                <Text style={[styles.tileDesc, { color: colors.mutedForeground }]}>{s.desc}</Text>
              </View>
            </View>
          ))}
        </Section>

        {/* Trust */}
        <Section colors={colors} kicker="TRUST & SAFETY" title="Built on trust, end to end.">
          {TRUST.map((s) => (
            <View key={s.title} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.primary + "1A" }]}>
                <Ionicons name={s.icon} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.tileTitle, { color: colors.foreground, marginBottom: 3 }]}>{s.title}</Text>
                <Text style={[styles.tileDesc, { color: colors.mutedForeground }]}>{s.desc}</Text>
              </View>
            </View>
          ))}
        </Section>

        {/* How it works */}
        <View style={{ paddingHorizontal: 20, marginTop: 28, gap: 16 }}>
          {[
            {
              kicker: "For Users",
              steps: [
                "Discover pubs, events, games and parties in your city.",
                "Book tickets or tables in a few taps with secure checkout.",
                "Show up, enjoy, and earn loyalty rewards along the way.",
              ],
              ctaLabel: "Start Exploring",
              ctaHref: "/(tabs)/pubs",
            },
            {
              kicker: "For Partners",
              steps: [
                "Sign up and list your venue, events or experiences.",
                "Get verified and go live to a ready-to-book audience.",
                "Accept bookings, track performance and get paid on time.",
              ],
              ctaLabel: partnerLabel,
              ctaHref: partnerHref,
            },
          ].map((block) => (
            <View key={block.kicker} style={[styles.howCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.kicker, { color: colors.mutedForeground, marginBottom: 12 }]}>{block.kicker}</Text>
              <View style={{ gap: 10 }}>
                {block.steps.map((step, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                    <Text style={[styles.howStep, { color: colors.mutedForeground }]}>{step}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.howCta, { borderColor: colors.border }]}
                onPress={() => router.push(block.ctaHref as never)}
              >
                <Text style={[styles.howCtaText, { color: colors.foreground }]}>{block.ctaLabel}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* FAQ */}
        <Section colors={colors} kicker="FAQ" title="Questions, answered.">
          {FAQS.map((f, i) => {
            const open = openFaq === i;
            return (
              <TouchableOpacity
                key={i}
                activeOpacity={0.8}
                onPress={() => setOpenFaq(open ? null : i)}
                style={[styles.faq, { borderColor: colors.border, backgroundColor: colors.card }]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={[styles.faqQ, { color: colors.foreground, flex: 1 }]}>{f.question}</Text>
                  <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
                </View>
                {open && <Text style={[styles.faqA, { color: colors.mutedForeground }]}>{f.answer}</Text>}
              </TouchableOpacity>
            );
          })}
        </Section>

        {/* Final CTA */}
        <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
          <View style={[styles.finalCta, { borderColor: colors.primary + "40", backgroundColor: colors.card }]}>
            <Text style={[styles.finalCtaTitle, { color: colors.foreground }]}>
              Your next great night out — or your next big listing — starts here.
            </Text>
            <Text style={[styles.finalCtaSub, { color: colors.mutedForeground }]}>
              Join thousands of people discovering, booking and hosting on Royvento. It's free to get started.
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <TouchableOpacity
                style={[styles.finalCtaBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push(primaryCta.href as never)}
              >
                <Text style={[styles.finalCtaBtnText, { color: colors.primaryForeground }]}>{primaryCta.label}</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.primaryForeground} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.finalCtaBtnOutline, { borderColor: colors.border }]}
                onPress={() => router.push("/contact")}
              >
                <Text style={[styles.finalCtaBtnOutlineText, { color: colors.foreground }]}>Contact Us</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <MobileFooter />
      </ScrollView>
    </View>
  );
}

function Section({
  colors,
  kicker,
  title,
  children,
}: {
  colors: ReturnType<typeof useColors>;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
      <Text style={[styles.kicker, { color: colors.mutedForeground }]}>{kicker}</Text>
      <Text style={[styles.h2, { color: colors.foreground }]}>{title}</Text>
      <View style={{ gap: 12, marginTop: 14 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.4 },
  h1: { fontSize: 32, fontFamily: "Inter_700Bold", lineHeight: 38, marginTop: 10, letterSpacing: -0.5 },
  lead: { fontSize: 14.5, fontFamily: "Inter_400Regular", lineHeight: 23, marginTop: 14 },
  h2: { fontSize: 23, fontFamily: "Inter_700Bold", marginTop: 6, letterSpacing: -0.3 },
  body: { fontSize: 14.5, fontFamily: "Inter_400Regular", lineHeight: 23 },
  cta: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  ctaText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  missionCard: { borderRadius: 18, borderWidth: 1, padding: 24, alignItems: "center" },
  mission: { fontSize: 19, fontFamily: "Inter_600SemiBold", textAlign: "center", lineHeight: 27, marginTop: 8 },
  tile: { borderRadius: 16, borderWidth: 1, padding: 18 },
  tileIcon: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  tileTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  tileDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, marginTop: 4 },
  row: { flexDirection: "row", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  rowIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  faq: { borderRadius: 14, borderWidth: 1, padding: 16 },
  faqQ: { fontSize: 14.5, fontFamily: "Inter_600SemiBold" },
  faqA: { fontSize: 13.5, fontFamily: "Inter_400Regular", lineHeight: 21, marginTop: 10 },
  howCard: { borderRadius: 16, borderWidth: 1, padding: 18 },
  howStep: { flex: 1, fontSize: 13.5, fontFamily: "Inter_400Regular", lineHeight: 20 },
  howCta: { borderRadius: 12, borderWidth: 1, paddingVertical: 11, alignItems: "center", marginTop: 16 },
  howCtaText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  finalCta: { borderRadius: 18, borderWidth: 1, padding: 22, alignItems: "center" },
  finalCtaTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: 27 },
  finalCtaSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19, marginTop: 8 },
  finalCtaBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  finalCtaBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  finalCtaBtnOutline: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 12 },
  finalCtaBtnOutlineText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
