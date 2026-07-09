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
import { useColors } from "@/hooks/useColors";
import { formatPartyDate, myParties, resolveImageUrl, type PublicParty } from "@/lib/party";

export default function MyPartiesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const { data, isLoading, isRefetching, refetch } = useQuery<PublicParty[]>({
    queryKey: ["parties", "mine"],
    queryFn: () => myParties(),
  });

  const parties = data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: topPadding + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>My Parties</Text>
        <TouchableOpacity onPress={() => router.push("/party/create" as never)} style={{ marginLeft: "auto" }}>
          <Ionicons name="add-circle" size={26} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 12 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        >
          {parties.length === 0 ? (
            <View style={[styles.empty, { borderColor: colors.border }]}>
              <Ionicons name="balloon-outline" size={32} color={colors.primary} />
              <Text style={{ color: colors.foreground, fontSize: 17, fontFamily: "Inter_700Bold", marginTop: 8 }}>No parties yet</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 13.5, textAlign: "center", marginTop: 4 }}>
                Host your first party and manage guests from here.
              </Text>
              <TouchableOpacity onPress={() => router.push("/party/create" as never)} style={[styles.createBtn, { backgroundColor: colors.primary }]}>
                <Ionicons name="add" size={16} color={colors.primaryForeground} />
                <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>Create a Party</Text>
              </TouchableOpacity>
            </View>
          ) : (
            parties.map((p) => {
              const cover = resolveImageUrl(p.coverImageUrl);
              return (
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={0.9}
                  onPress={() => router.push({ pathname: "/party/dashboard", params: { id: String(p.id) } } as never)}
                  style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  {cover ? (
                    <Image source={{ uri: cover }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="balloon-outline" size={22} color={colors.mutedForeground} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>{p.name}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12.5, marginTop: 2 }} numberOfLines={1}>
                      {formatPartyDate(p.partyDate)} · {p.city}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                      <Tag colors={colors} text={p.status === "published" ? "Live" : p.status === "sales_stopped" ? "Paused" : "Cancelled"}
                        tone={p.status === "published" ? "green" : p.status === "cancelled" ? "red" : "muted"} />
                      <Tag colors={colors} text={p.ticketType === "paid" ? `₹${Number(p.ticketPrice).toLocaleString("en-IN")}` : "Free"} tone="muted" />
                      {p.visibility === "private" && <Tag colors={colors} text="Private" tone="muted" />}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Tag({ colors, text, tone }: { colors: ReturnType<typeof useColors>; text: string; tone: "green" | "red" | "muted" }) {
  const c = tone === "green" ? "#22c55e" : tone === "red" ? "#ef4444" : colors.mutedForeground;
  return (
    <View style={[styles.tag, { borderColor: c + "55", backgroundColor: c + "18" }]}>
      <Text style={{ color: c, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, padding: 10 },
  thumb: { width: 64, height: 64, borderRadius: 12 },
  tag: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  empty: { borderRadius: 20, borderWidth: 1, borderStyle: "dashed", padding: 32, alignItems: "center" },
  createBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11, marginTop: 16 },
});
