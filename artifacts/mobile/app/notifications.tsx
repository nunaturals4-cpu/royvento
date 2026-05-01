import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useColors } from "@/hooks/useColors";

interface Notification {
  id: number;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const qc = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: () => customFetch<Notification[]>("/api/notifications"),
  });

  const markRead = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = async () => {
    const unread = (data ?? []).filter((n) => !n.read);
    for (const n of unread) {
      await customFetch(`/api/notifications/${n.id}/read`, { method: "PATCH" });
    }
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const notifications = data ?? [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={[styles.header, { paddingTop: topPadding + 16 }]}
      >
        <View style={styles.headerRow}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
            {unreadCount > 0 && (
              <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                {unreadCount} unread
              </Text>
            )}
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllRead} style={[styles.markAllBtn, { backgroundColor: colors.muted }]}>
              <Text style={[styles.markAllText, { color: colors.primary }]}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-off-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Notifications</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            You're all caught up! Check back later.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={{
            paddingVertical: 8,
            paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 16,
          }}
          ListFooterComponent={<MobileFooter />}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          renderItem={({ item }) => (
            <Pressable
              style={[
                styles.item,
                {
                  backgroundColor: item.read ? colors.background : colors.card,
                  borderBottomColor: colors.border,
                },
              ]}
              onPress={() => {
                if (!item.read) markRead.mutate(item.id);
              }}
            >
              <View style={[styles.dot, { backgroundColor: item.read ? "transparent" : colors.primary }]} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text
                  style={[
                    styles.itemTitle,
                    { color: colors.foreground, fontFamily: item.read ? "Inter_400Regular" : "Inter_600SemiBold" },
                  ]}
                >
                  {item.title}
                </Text>
                {item.body ? (
                  <Text style={[styles.itemBody, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {item.body}
                  </Text>
                ) : null}
                <Text style={[styles.itemTime, { color: colors.mutedForeground }]}>
                  {formatTime(item.createdAt)}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  markAllBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  markAllText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  item: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, gap: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  itemTitle: { fontSize: 14, lineHeight: 20 },
  itemBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  itemTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
});
