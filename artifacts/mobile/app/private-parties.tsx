import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { MobileFooter } from "@/components/MobileFooter";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  formatPartyDate,
  joinTypeLabel,
  listParties,
  resolveImageUrl,
  type PublicParty,
} from "@/lib/party";

export default function PrivatePartiesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const { data, isLoading, isRefetching, refetch } = useQuery<PublicParty[]>({
    queryKey: ["parties", "all"],
    queryFn: () => listParties(),
  });

  const parties = (data ?? []).filter((p) => p.status !== "cancelled");

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 8, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Private Parties</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]} numberOfLines={2}>
              Host your own ticketed party or join one nearby.
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <TouchableOpacity
            onPress={() => router.push("/party/create" as never)}
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="add" size={16} color={colors.primaryForeground} />
            <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Create a Party</Text>
          </TouchableOpacity>
          {user && (
            <TouchableOpacity
              onPress={() => router.push("/party/mine" as never)}
              style={[styles.outlineBtn, { borderColor: colors.border }]}
            >
              <Ionicons name="briefcase-outline" size={16} color={colors.foreground} />
              <Text style={[styles.outlineBtnText, { color: colors.foreground }]}>My Parties</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        >
          {parties.length === 0 ? (
            <View style={[styles.empty, { borderColor: colors.border }]}>
              <Ionicons name="balloon-outline" size={34} color={colors.primary} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No parties yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Be the first to throw one — create a party and invite your circle.
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/party/create" as never)}
                style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
              >
                <Ionicons name="add" size={16} color={colors.primaryForeground} />
                <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Create a Party</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              {parties.map((p) => (
                <PartyCard key={p.id} party={p} colors={colors} />
              ))}
            </View>
          )}
          <MobileFooter />
        </ScrollView>
      )}
    </View>
  );
}

function PartyCard({ party, colors }: { party: PublicParty; colors: ReturnType<typeof useColors> }) {
  const cover = resolveImageUrl(party.coverImageUrl);
  const isPrivate = party.visibility === "private";
  const soldOut = party.seatsLeft === 0;
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => router.push({ pathname: "/party/[id]", params: { id: String(party.id) } } as never)}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.coverWrap}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="balloon-outline" size={34} color={colors.mutedForeground} />
          </View>
        )}
        <View style={styles.badgeRow}>
          {isPrivate && (
            <View style={[styles.badge, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
              <Ionicons name="lock-closed" size={11} color="#fff" />
              <Text style={styles.badgeText}>Private</Text>
            </View>
          )}
          <View style={[styles.badge, { backgroundColor: party.ticketType === "paid" ? colors.primary : "#22c55e" }]}>
            <Text style={styles.badgeText}>
              {party.ticketType === "paid" ? `₹${Number(party.ticketPrice).toLocaleString("en-IN")}` : "Free"}
            </Text>
          </View>
        </View>
      </View>
      <View style={{ padding: 14, gap: 6 }}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{party.name}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={13} color={colors.mutedForeground} />
          <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {formatPartyDate(party.partyDate)}
            {party.startTime ? ` · ${party.startTime}` : ""}
          </Text>
        </View>
        {!!(party.venueName || party.city) && (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
            <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
              {[party.venueName, party.city].filter(Boolean).join(", ")}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
          <View style={[styles.pill, { borderColor: colors.border }]}>
            <Ionicons name="people-outline" size={12} color={colors.mutedForeground} />
            <Text style={[styles.pillText, { color: colors.mutedForeground }]}>{joinTypeLabel(party.joinType)}</Text>
          </View>
          {soldOut && (
            <View style={[styles.pill, { borderColor: "#ef4444", backgroundColor: "#ef444415" }]}>
              <Text style={[styles.pillText, { color: "#ef4444" }]}>Sold out</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  backBtn: { padding: 4, marginTop: 2 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 12.5, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 17 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  primaryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  outlineBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 11 },
  outlineBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  coverWrap: { position: "relative" },
  cover: { width: "100%", height: 168 },
  badgeRow: { position: "absolute", top: 10, left: 10, flexDirection: "row", gap: 6 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  cardTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 11.5, fontFamily: "Inter_500Medium" },
  empty: { borderRadius: 20, borderWidth: 1, borderStyle: "dashed", padding: 32, alignItems: "center", gap: 6 },
  emptyTitle: { fontSize: 19, fontFamily: "Inter_700Bold", marginTop: 8 },
  emptySub: { fontSize: 13.5, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
