import { Ionicons } from "@expo/vector-icons";
import { useListMyBookings } from "@workspace/api-client-react";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type Status = "pending" | "approved" | "rejected" | "cancelled";

const STATUS_COLORS: Record<Status, { bg: string; text: string }> = {
  pending: { bg: "#f59e0b20", text: "#f59e0b" },
  approved: { bg: "#22c55e20", text: "#22c55e" },
  rejected: { bg: "#ef444420", text: "#ef4444" },
  cancelled: { bg: "#6b728020", text: "#9ca3af" },
};

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

export default function BookingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const { data, isLoading, refetch } = useListMyBookings({ query: { enabled: !!user } });

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.header, { paddingTop: topPadding + 12, borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>My Bookings</Text>
        </View>
        <EmptyState
          icon="ticket-outline"
          title="Sign in to view bookings"
          subtitle="Track your event bookings and tickets"
          action={{ label: "Sign In", onPress: () => router.push("/(auth)/login") }}
        />
      </View>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (data ?? []).filter(
    (b) => b.bookingDate >= today && b.status !== "cancelled" && b.status !== "rejected"
  );
  const past = (data ?? []).filter(
    (b) => b.bookingDate < today || b.status === "cancelled" || b.status === "rejected"
  );
  const shown = tab === "upcoming" ? upcoming : past;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={[
          styles.header,
          { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>My Bookings</Text>
        <View style={[styles.tabs, { backgroundColor: colors.muted }]}>
          {(["upcoming", "past"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tabBtn, tab === t && { backgroundColor: colors.primary }]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: tab === t ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {t === "upcoming" ? "Upcoming" : "Past"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {shown.length === 0 ? (
        <EmptyState
          icon="ticket-outline"
          title={tab === "upcoming" ? "No upcoming bookings" : "No past bookings"}
          subtitle={tab === "upcoming" ? "Book an event to get started" : "Your past bookings will appear here"}
          action={tab === "upcoming" ? { label: "Explore Events", onPress: () => router.push("/(tabs)/explore") } : undefined}
        />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(b) => String(b.id)}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 34 : 100 }]}
          onRefresh={refetch}
          refreshing={isLoading}
          scrollEnabled={!!(shown?.length)}
          renderItem={({ item: b }) => {
            const statusStyle = STATUS_COLORS[(b.status as Status) ?? "pending"] ?? STATUS_COLORS.pending;
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                      Booking #{b.id}
                    </Text>
                    <View style={styles.metaRow}>
                      <Ionicons name="calendar-outline" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                        {formatDate(b.bookingDate)}
                      </Text>
                    </View>
                    <View style={styles.metaRow}>
                      <Ionicons name="people-outline" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                        {b.guests} guest{b.guests !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusText, { color: statusStyle.text }]}>
                      {b.status}
                    </Text>
                  </View>
                </View>
                {b.status === "approved" ? (
                  <View style={[styles.ticketRow, { borderTopColor: colors.border }]}>
                    <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                    <Text style={[styles.ticketText, { color: "#22c55e" }]}>
                      Booking confirmed — ref #{b.id}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  tabs: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: "center",
  },
  tabText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  list: {
    padding: 20,
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardTop: {
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 2,
  },
  meta: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  statusText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "capitalize",
  },
  ticketRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  ticketText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
});
