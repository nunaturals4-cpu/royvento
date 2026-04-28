import { Ionicons } from "@expo/vector-icons";
import {
  useListMyVendorEvents,
  useListVendorBookings,
  useUpdateBookingStatus,
  getListVendorBookingsQueryKey,
  getListMyVendorEventsQueryKey,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type DashTab = "bookings" | "events";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:   { bg: "#f59e0b20", text: "#f59e0b" },
  confirmed: { bg: "#22c55e20", text: "#22c55e" },
  cancelled: { bg: "#ef444420", text: "#ef4444" },
  completed: { bg: "#6366f120", text: "#6366f1" },
};

export default function VendorDashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<DashTab>("bookings");
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const isVendorOrAdmin = user?.role === "vendor" || user?.role === "admin";
  const bookings = useListVendorBookings({ query: { queryKey: getListVendorBookingsQueryKey(), enabled: isVendorOrAdmin } });
  const events = useListMyVendorEvents({ query: { queryKey: getListMyVendorEventsQueryKey(), enabled: isVendorOrAdmin } });

  const updateStatus = useUpdateBookingStatus({
    mutation: {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        bookings.refetch();
      },
    },
  });

  if (!user || user.role !== "vendor") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <EmptyState
          icon="business-outline"
          title="Not a vendor"
          subtitle="This area is only for approved partners"
          action={{ label: "Go Back", onPress: () => router.back() }}
        />
      </View>
    );
  }

  const pending = (bookings.data ?? []).filter((b) => b.status === "pending");
  const all = bookings.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>Partner Dashboard</Text>
          <View style={{ width: 22 }} />
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { icon: "hourglass-outline" as const, value: pending.length, label: "Pending" },
            { icon: "checkmark-circle-outline" as const, value: all.filter((b) => b.status === "confirmed").length, label: "Confirmed" },
            { icon: "calendar-outline" as const, value: (events.data ?? []).length, label: "Events" },
          ].map((s) => (
            <View key={s.label} style={[styles.stat, { backgroundColor: colors.muted }]}>
              <Ionicons name={s.icon} size={18} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Tabs */}
        <View style={[styles.tabs, { backgroundColor: colors.muted }]}>
          {(["bookings", "events"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setActiveTab(t)}
              style={[styles.tabBtn, activeTab === t && { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.tabText, { color: activeTab === t ? colors.primaryForeground : colors.mutedForeground }]}>
                {t === "bookings" ? `Bookings${pending.length > 0 ? ` (${pending.length})` : ""}` : "My Events"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Content */}
      {activeTab === "bookings" ? (
        bookings.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
        ) : all.length === 0 ? (
          <EmptyState
            icon="ticket-outline"
            title="No bookings yet"
            subtitle="Customer booking requests will appear here"
          />
        ) : (
          <FlatList
            data={all}
            keyExtractor={(b) => String(b.id)}
            contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 34 : 80 }]}
            onRefresh={bookings.refetch}
            refreshing={bookings.isLoading}
            scrollEnabled={!!(all?.length)}
            renderItem={({ item: b }) => {
              const statusStyle = STATUS_COLORS[b.status ?? "pending"] ?? STATUS_COLORS.pending;
              return (
                <View style={[styles.bookingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardId, { color: colors.foreground }]}>Booking #{b.id}</Text>
                      <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
                        {b.bookingDate} · {b.guests} guest{b.guests !== 1 ? "s" : ""}
                      </Text>
                      {b.phone ? (
                        <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>{b.phone}</Text>
                      ) : null}
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                      <Text style={[styles.statusText, { color: statusStyle.text }]}>{b.status}</Text>
                    </View>
                  </View>
                  {b.notes ? (
                    <Text style={[styles.notes, { color: colors.mutedForeground }]}>{b.notes}</Text>
                  ) : null}
                  {b.status === "pending" ? (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.rejectBtn, { borderColor: colors.destructive }]}
                        onPress={() =>
                          Alert.alert("Reject Booking?", undefined, [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Reject",
                              style: "destructive",
                              onPress: () => updateStatus.mutate({ bookingId: b.id, data: { status: "cancelled", rejectionReason: "Declined by venue" } }),
                            },
                          ])
                        }
                      >
                        <Ionicons name="close" size={14} color={colors.destructive} />
                        <Text style={[styles.rejectBtnText, { color: colors.destructive }]}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.approveBtn, { backgroundColor: "#22c55e" }]}
                        onPress={() => updateStatus.mutate({ bookingId: b.id, data: { status: "confirmed" } })}
                      >
                        <Ionicons name="checkmark" size={14} color="#fff" />
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            }}
          />
        )
      ) : (
        events.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
        ) : (events.data ?? []).length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="No events yet"
            subtitle="Your event listings will appear here"
          />
        ) : (
          <FlatList
            data={events.data}
            keyExtractor={(e) => String(e.id)}
            contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 34 : 80 }]}
            onRefresh={events.refetch}
            refreshing={events.isLoading}
            scrollEnabled={!!(events.data?.length)}
            renderItem={({ item: e }) => (
              <Pressable
                onPress={() => router.push(`/event/${e.id}`)}
                style={[styles.eventRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={[styles.eventIcon, { backgroundColor: colors.muted }]}>
                  <Ionicons name="calendar" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {e.title}
                  </Text>
                  <Text style={[styles.eventCat, { color: colors.mutedForeground }]}>{e.category}</Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: e.approvalStatus === "approved" ? "#22c55e20" : "#f59e0b20" },
                ]}>
                  <Text style={[styles.statusText, { color: e.approvalStatus === "approved" ? "#22c55e" : "#f59e0b" }]}>
                    {e.approvalStatus}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, gap: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statsRow: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, borderRadius: 12, padding: 12, alignItems: "center", gap: 4 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  tabs: { flexDirection: "row", borderRadius: 10, padding: 3 },
  tabBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: "center" },
  tabText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  list: { padding: 20, gap: 12 },
  bookingCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden", padding: 16, gap: 10 },
  cardHeader: { flexDirection: "row", gap: 10 },
  cardId: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  notes: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  rejectBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderRadius: 10, paddingVertical: 9 },
  rejectBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  approveBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, paddingVertical: 9 },
  approveBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  eventIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  eventTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  eventCat: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
