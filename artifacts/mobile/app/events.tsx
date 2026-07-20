import { resolveImageUrl } from "@/lib/resolveImageUrl";
import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useColors } from "@/hooks/useColors";

// ── Events (mobile) ──────────────────────────────────────────────────────────
// Mirror of the web /events page: event-category tiles, ticketed Live Events
// from event organizers (/api/organizer-events), and a "What's On" feed of
// recent announcements filterable by category.

interface EventAnnouncement {
  id: number; title: string; body: string; announceDate: string; announceTime: string;
  vendorName: string; eventId: number; vendorId: number; imageUrl?: string; genre: string; eventType: string;
}
interface OrganizerEventCard {
  id: number; title: string; slug: string; category: string; shortDescription: string;
  coverImageUrl: string; bannerUrl: string; city: string; startDate: string | null; startTime: string; organizerName: string;
}

const EVENT_CATEGORIES: { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; img: string }[] = [
  { label: "Ladies Night", icon: "sparkles-outline", img: "https://images.unsplash.com/photo-1545128485-c400e7702796?w=600&q=70" },
  { label: "DJ Night", icon: "disc-outline", img: "https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?w=600&q=70" },
  { label: "Live Music", icon: "musical-notes-outline", img: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&q=70" },
  { label: "Karaoke", icon: "mic-outline", img: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=600&q=70" },
  { label: "Theme Party", icon: "balloon-outline", img: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&q=70" },
  { label: "Pool Party", icon: "water-outline", img: "https://images.unsplash.com/photo-1533928298208-27ff66555d8d?w=600&q=70" },
  { label: "Open Mics", icon: "mic-circle-outline", img: "https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=600&q=70" },
  { label: "Standup Shows", icon: "happy-outline", img: "https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=600&q=70" },
];

const ANN_GENRES = ["EDM", "Hip Hop", "Bollywood", "Rock", "Pop", "Jazz", "Retro", "House", "Techno", "R&B"];

export default function EventsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");

  const { data: organizerEvents = [] } = useQuery<OrganizerEventCard[]>({
    queryKey: ["organizer-events"],
    queryFn: () => customFetch<OrganizerEventCard[]>("/api/organizer-events"),
    staleTime: 1000 * 60 * 2,
  });
  const { data: announcements = [] } = useQuery<EventAnnouncement[]>({
    queryKey: ["announcements", "recent"],
    queryFn: () => customFetch<EventAnnouncement[]>("/api/announcements/recent"),
    staleTime: 1000 * 60 * 5,
  });

  const countByCat = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of announcements) if (a.eventType) m[a.eventType] = (m[a.eventType] ?? 0) + 1;
    return m;
  }, [announcements]);

  const filteredAnnouncements = useMemo(
    () => announcements.filter((a) => (!eventTypeFilter || a.eventType === eventTypeFilter) && (!genreFilter || a.genre === genreFilter)),
    [announcements, eventTypeFilter, genreFilter]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient colors={[colors.card, colors.background]} style={[styles.header, { paddingTop: topPadding + 14 }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>BROWSE BY VIBE</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Events</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            Ladies' nights, DJ nights, live music, karaoke, theme & pool parties, open mics and standup shows.
          </Text>
        </LinearGradient>

        {/* Category tiles */}
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Event Categories</Text>
          {!!eventTypeFilter && (
            <Pressable onPress={() => setEventTypeFilter("")}>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 13 }}>Clear filter</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.grid}>
          {EVENT_CATEGORIES.map((c) => {
            const active = eventTypeFilter === c.label;
            const count = countByCat[c.label] ?? 0;
            return (
              <Pressable
                key={c.label}
                onPress={() => setEventTypeFilter((prev) => (prev === c.label ? "" : c.label))}
                style={[styles.tile, { borderColor: active ? colors.primary : colors.border }]}
              >
                <Image source={{ uri: resolveImageUrl(c.img) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <LinearGradient colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.85)"]} style={StyleSheet.absoluteFill} />
                {count > 0 && (
                  <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.countText, { color: colors.primaryForeground }]}>{count}</Text>
                  </View>
                )}
                <View style={[styles.tileIcon, { borderColor: colors.primary + "66" }]}>
                  <Ionicons name={c.icon} size={16} color={colors.primary} />
                </View>
                <Text style={styles.tileLabel} numberOfLines={1}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Live Events (organizer events) */}
        {organizerEvents.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="sparkles" size={15} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Live Events</Text>
              </View>
            </View>
            <FlatList
              horizontal
              data={organizerEvents}
              keyExtractor={(e) => String(e.id)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.row}
              renderItem={({ item: e }) => (
                <Pressable
                  onPress={() => router.push(`/organizer-events/${e.slug}` as never)}
                  style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.eventImage}>
                    {(e.coverImageUrl || e.bannerUrl) ? (
                      <Image source={{ uri: resolveImageUrl(e.coverImageUrl || e.bannerUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: colors.muted }]}>
                        <Ionicons name="sparkles" size={26} color={colors.primary + "55"} />
                      </View>
                    )}
                    <LinearGradient colors={["transparent", "rgba(0,0,0,0.6)"]} style={StyleSheet.absoluteFill} />
                    <View style={[styles.orgBadge, { borderColor: colors.primary + "55" }]}>
                      <Ionicons name="sparkles" size={9} color={colors.primary} />
                      <Text style={[styles.orgBadgeText, { color: colors.primary }]} numberOfLines={1}>{e.organizerName}</Text>
                    </View>
                  </View>
                  <View style={styles.eventBody}>
                    {!!e.category && <Text style={[styles.eventCat, { color: "#f59e0b" }]}>{e.category.toUpperCase()}</Text>}
                    <Text style={[styles.eventTitle, { color: colors.foreground }]} numberOfLines={2}>{e.title}</Text>
                    <View style={[styles.eventMeta, { borderTopColor: colors.border }]}>
                      {!!e.startDate && (
                        <View style={styles.metaItem}>
                          <Ionicons name="calendar-outline" size={11} color={colors.primary} />
                          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{new Date(e.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Text>
                        </View>
                      )}
                      {!!e.city && <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>{e.city}</Text>}
                    </View>
                  </View>
                </Pressable>
              )}
            />
          </>
        )}

        {/* What's On */}
        <View style={styles.sectionHead}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="megaphone-outline" size={15} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>What's On{eventTypeFilter ? ` · ${eventTypeFilter}` : ""}</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genreRow}>
          {["", ...ANN_GENRES].map((g) => {
            const active = genreFilter === g;
            return (
              <Pressable
                key={g || "all"}
                onPress={() => setGenreFilter((prev) => (prev === g ? "" : g))}
                style={[styles.genreChip, { borderColor: active ? "#f59e0b" : colors.border, backgroundColor: active ? "#f59e0b20" : colors.muted }]}
              >
                <Text style={[styles.genreChipText, { color: active ? "#f59e0b" : colors.mutedForeground }]}>{g || "All"}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {filteredAnnouncements.length === 0 ? (
          <View style={{ paddingHorizontal: 20, paddingVertical: 24 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
              No announcements{eventTypeFilter ? ` for ${eventTypeFilter}` : ""} right now. Check back soon!
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            {filteredAnnouncements.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => a.eventId ? router.push(`/event/${a.eventId}` as never) : undefined}
                style={[styles.annCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                {a.imageUrl ? (
                  <Image source={{ uri: resolveImageUrl(a.imageUrl) }} style={styles.annImage} contentFit="cover" />
                ) : null}
                <View style={{ flex: 1, padding: 12, gap: 3 }}>
                  <View style={styles.metaItem}>
                    <Ionicons name="megaphone-outline" size={11} color={colors.primary} />
                    <Text style={[styles.metaText, { color: colors.primary }]} numberOfLines={1}>{a.vendorName}</Text>
                  </View>
                  <Text style={[styles.eventTitle, { color: colors.foreground }]} numberOfLines={2}>{a.title}</Text>
                  {!!a.announceDate && (
                    <View style={styles.metaItem}>
                      <Ionicons name="calendar-outline" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                        {new Date(a.announceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}{a.announceTime ? ` · ${a.announceTime}` : ""}
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <MobileFooter />
        <View style={{ height: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 18, gap: 4 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  eyebrow: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.6 },
  title: { fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.6 },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, marginTop: 4 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  genreRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingBottom: 14 },
  genreChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  genreChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12 },
  tile: { width: "47%", flexGrow: 1, height: 120, borderRadius: 16, borderWidth: 1, overflow: "hidden", justifyContent: "flex-end", padding: 12 },
  tileIcon: { position: "absolute", top: 12, left: 12, width: 32, height: 32, borderRadius: 10, borderWidth: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  tileLabel: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  countBadge: { position: "absolute", top: 10, right: 10, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, minWidth: 20, alignItems: "center" },
  countText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  row: { paddingLeft: 16, paddingRight: 4, gap: 12 },
  eventCard: { width: 250, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  eventImage: { height: 130, position: "relative" },
  orgBadge: { position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, borderWidth: 1, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 8, paddingVertical: 3, maxWidth: 150 },
  orgBadgeText: { fontSize: 9, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  eventBody: { padding: 12, gap: 4 },
  eventCat: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  eventTitle: { fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 20 },
  eventMeta: { flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, paddingTop: 8, marginTop: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  metaText: { fontSize: 11, fontFamily: "Inter_500Medium", flexShrink: 1 },
  annCard: { flexDirection: "row", borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  annImage: { width: 96, minHeight: 96 },
});
