import { Ionicons } from "@expo/vector-icons";
import { useListMyBookings, getListMyBookingsQueryKey } from "@workspace/api-client-react";
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
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type BookingStatus = "pending" | "approved" | "rejected" | "cancelled";

const STATUS_META: Record<BookingStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: "#f59e0b20", text: "#f59e0b", label: "Pending" },
  approved: { bg: "#22c55e20", text: "#22c55e", label: "Confirmed" },
  rejected: { bg: "#ef444420", text: "#ef4444", label: "Rejected" },
  cancelled: { bg: "#6b728020", text: "#9ca3af", label: "Cancelled" },
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
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const { data, isLoading, refetch } = useListMyBookings({ query: { queryKey: getListMyBookingsQueryKey(), enabled: !!user } });

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
                style={[styles.tabText, { color: tab === t ? colors.primaryForeground : colors.mutedForeground }]}
              >
                {t === "upcoming" ? `Upcoming (${upcoming.length})` : `Past (${past.length})`}
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
          action={
            tab === "upcoming"
              ? { label: "Explore Events", onPress: () => router.push("/(tabs)/explore") }
              : undefined
          }
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
            const status = (b.status ?? "pending") as BookingStatus;
            const meta = STATUS_META[status] ?? STATUS_META.pending;
            const isExpanded = expandedId === b.id;
            const qrValue = `royvento:booking:${b.id}:${b.bookingDate}`;

            return (
              <Pressable
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setExpandedId(isExpanded ? null : b.id)}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>
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
                  <View style={{ alignItems: "flex-end", gap: 8 }}>
                    <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.statusText, { color: meta.text }]}>{meta.label}</Text>
                    </View>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={14}
                      color={colors.mutedForeground}
                    />
                  </View>
                </View>

                {/* Confirmed ticket with QR code */}
                {isExpanded && status === "approved" && (
                  <View style={[styles.ticket, { borderTopColor: colors.border, backgroundColor: colors.muted }]}>
                    <View style={styles.ticketHeader}>
                      <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                      <Text style={[styles.ticketTitle, { color: "#22c55e" }]}>Booking Confirmed</Text>
                    </View>
                    <Text style={[styles.ticketRef, { color: colors.mutedForeground }]}>
                      Ref: RVT-{String(b.id).padStart(6, "0")}
                    </Text>
                    <View style={[styles.qrWrap, { backgroundColor: "#ffffff" }]}>
                      <QRCode value={qrValue} size={140} />
                    </View>
                    <Text style={[styles.qrHint, { color: colors.mutedForeground }]}>
                      Show this at the venue
                    </Text>
                  </View>
                )}

                {/* Expanded details for non-confirmed bookings */}
                {isExpanded && status !== "approved" && (
                  <View style={[styles.expandedInfo, { borderTopColor: colors.border }]}>
                    <Text style={[styles.expandedText, { color: colors.mutedForeground }]}>
                      Status: {meta.label}
                      {status === "pending" ? " — awaiting partner confirmation." : ""}
                    </Text>
                    {b.notes ? (
                      <Text style={[styles.expandedText, { color: colors.mutedForeground }]}>
                        Notes: {b.notes}
                      </Text>
                    ) : null}
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, gap: 12 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  tabs: { flexDirection: "row", borderRadius: 10, padding: 3 },
  tabBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: "center" },
  tabText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  list: { padding: 20, gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  cardTop: { padding: 16, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 },
  meta: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  ticket: { borderTopWidth: 1, padding: 16, alignItems: "center", gap: 10 },
  ticketHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  ticketTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  ticketRef: { fontSize: 12, fontFamily: "Inter_400Regular", letterSpacing: 0.5 },
  qrWrap: { padding: 12, borderRadius: 12 },
  qrHint: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  expandedInfo: { borderTopWidth: 1, padding: 14, gap: 6 },
  expandedText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
});
