import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useColors } from "@/hooks/useColors";

const LAST_UPDATED = "16 June 2026";

const SECTIONS = [
  {
    title: "1. What Solo Connector Is",
    body: "Solo Connector helps verified members discover and join social groups around real-world activities. Royvento only provides a platform for users to discover and join these groups.",
  },
  {
    title: "2. Royvento's Role & Your Responsibility",
    body: "Royvento does not organize, supervise, verify, monitor, or take responsibility for meetings, outings, interactions, conversations, or activities that occur after users join a group.\n\nUsers participate entirely at their own risk and are responsible for exercising personal judgment and ensuring their own safety.\n\nRoyvento is not responsible for any disputes, misconduct, financial transactions, injuries, losses, damages, or incidents that occur during or after meeting group members.",
  },
  {
    title: "3. How to Behave",
    body: "Be respectful — harassment, abuse, hate speech, threats, and discrimination are not tolerated. Be genuine — impersonation and fake profiles are prohibited. No spam, solicitation, scams, or requests for money. No sexual harassment or inappropriate behaviour; Solo Connector is not a dating service. Respect privacy — never share another member's personal information.",
  },
  {
    title: "4. Staying Safe",
    body: "Meet in public places and tell someone you trust where you're going. Never share financial information or send money to other members. Use the in-app emergency contacts and reporting tools if you feel unsafe.",
  },
  {
    title: "5. Reporting & Enforcement",
    body: "You can report any member of a group you've joined directly from the group screen. Our team reviews every report and may warn, suspend, ban, or remove members. Reports are confidential. Repeat or serious violations result in permanent removal from Solo Connector.",
  },
];

export default function CommunityGuidelinesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient colors={[colors.card, colors.background]} style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Community Guidelines</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>Last updated: {LAST_UPDATED}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          The rules and safety expectations for Royvento Solo Connector.
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
