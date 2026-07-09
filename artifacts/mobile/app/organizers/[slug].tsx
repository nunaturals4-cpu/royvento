import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileFooter } from "@/components/MobileFooter";
import { FollowButton } from "@/components/FollowButton";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useColors } from "@/hooks/useColors";

// ── Event Organizer profile (mobile) ─────────────────────────────────────────
// Mirror of the web /organizers/:slug page. Shows the organizer plus their
// upcoming & past events; each event opens /organizer-events/:slug.

interface Organizer {
  id: number; name: string; slug: string; description: string;
  logoUrl: string; coverImageUrl: string; website: string;
  instagram: string; facebook: string; youtube: string;
  supportEmail: string; supportPhone: string; city: string; state: string; verified: boolean;
}
interface PublicEvent {
  id: number; title: string; slug: string; category: string; shortDescription: string;
  coverImageUrl: string; city: string; startDate: string | null; startTime: string;
}
interface Stats { totalEvents: number; ticketsSold: number; avgRating: number; reviewCount: number; }
interface ProfilePayload { organizer: Organizer; upcoming: PublicEvent[]; past: PublicEvent[]; stats: Stats; }

function eventDate(d: string | null) {
  if (!d) return "Date TBA";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function OrganizerProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const { data, isLoading } = useQuery<ProfilePayload | null>({
    queryKey: ["organizer", slug],
    queryFn: async () => {
      const res = await customFetch<ProfilePayload>(`/api/organizers/${slug}`);
      customFetch(`/api/organizers/${slug}/view`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }).catch(() => {});
      return res;
    },
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="calendar-outline" size={40} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, marginTop: 12, fontFamily: "Inter_400Regular" }}>Organizer not found.</Text>
        <Pressable onPress={() => router.back()} style={[styles.backInline, { borderColor: colors.border }]}>
          <Text style={{ color: colors.foreground }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const { organizer, upcoming, past, stats } = data;

  const renderEvent = (e: PublicEvent) => (
    <Pressable
      key={e.id}
      onPress={() => router.push(`/organizer-events/${e.slug}` as never)}
      style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      {e.coverImageUrl ? (
        <Image source={{ uri: e.coverImageUrl }} style={styles.eventImage} contentFit="cover" />
      ) : (
        <View style={[styles.eventImage, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="musical-notes-outline" size={24} color={colors.mutedForeground} />
        </View>
      )}
      <View style={styles.eventBody}>
        {!!e.category && <Text style={[styles.eventCat, { color: colors.primary }]}>{e.category.toUpperCase()}</Text>}
        <Text style={[styles.eventTitle, { color: colors.foreground }]} numberOfLines={2}>{e.title}</Text>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={12} color={colors.mutedForeground} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{eventDate(e.startDate)}{e.startTime ? ` · ${e.startTime}` : ""}</Text>
        </View>
        {!!e.city && (
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{e.city}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.cover}>
          {organizer.coverImageUrl ? (
            <Image source={{ uri: organizer.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.muted }]} />
          )}
          <LinearGradient colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0.55)", colors.background]} style={StyleSheet.absoluteFill} />
          <Pressable style={[styles.backBtn, { top: topPadding + 8 }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.identity}>
          {organizer.logoUrl ? (
            <Image source={{ uri: organizer.logoUrl }} style={[styles.logo, { borderColor: colors.border }]} contentFit="cover" />
          ) : (
            <View style={[styles.logo, { borderColor: colors.border, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="business" size={28} color={colors.primary} />
            </View>
          )}
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={2}>{organizer.name}</Text>
            {organizer.verified && <Ionicons name="checkmark-circle" size={18} color="#f59e0b" />}
          </View>
          {!!(organizer.city || organizer.state) && (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{[organizer.city, organizer.state].filter(Boolean).join(", ")}</Text>
            </View>
          )}
        </View>

        <View style={styles.statsRow}>
          <StatBox label="Events" value={String(stats.totalEvents)} />
          <StatBox label="Tickets" value={String(stats.ticketsSold)} />
          <StatBox label="Rating" value={stats.avgRating > 0 ? stats.avgRating.toFixed(1) : "—"} />
          <StatBox label="Reviews" value={String(stats.reviewCount)} />
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 16, alignItems: "flex-start" }}>
          <FollowButton targetType="organizer" targetId={organizer.id} name={organizer.name} />
        </View>

        {!!organizer.description && (
          <Text style={[styles.description, { color: colors.mutedForeground }]}>{organizer.description}</Text>
        )}

        {upcoming.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Upcoming Events</Text>
            {upcoming.map(renderEvent)}
          </View>
        )}
        {past.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Past Events</Text>
            {past.map(renderEvent)}
          </View>
        )}
        {upcoming.length === 0 && past.length === 0 && (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>No events listed yet.</Text>
          </View>
        )}

        <MobileFooter />
        <View style={{ height: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }} />
      </ScrollView>
    </View>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={[styles.statBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  backInline: { marginTop: 16, borderWidth: 1, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  cover: { height: 200, position: "relative" },
  backBtn: { position: "absolute", left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  identity: { paddingHorizontal: 20, marginTop: -34, gap: 6 },
  logo: { width: 72, height: 72, borderRadius: 18, borderWidth: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  name: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5, flexShrink: 1 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular", flexShrink: 1 },
  statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: 16 },
  statBox: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", gap: 2 },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.6 },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, paddingHorizontal: 20, marginTop: 16 },
  section: { paddingHorizontal: 20, marginTop: 24, gap: 12 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  eventCard: { flexDirection: "row", borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  eventImage: { width: 110, minHeight: 120 },
  eventBody: { flex: 1, padding: 12, gap: 4 },
  eventCat: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  eventTitle: { fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 20 },
});
