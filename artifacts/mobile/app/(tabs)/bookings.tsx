import { Ionicons } from "@expo/vector-icons";
import { customFetch, useListMyBookings, getListMyBookingsQueryKey } from "@workspace/api-client-react";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type BookingStatus = "pending" | "payment_pending" | "confirmed" | "cancelled" | "completed";

const STATUS_META: Record<BookingStatus, { bg: string; text: string; label: string }> = {
  pending:         { bg: "#f59e0b20", text: "#f59e0b", label: "Pending" },
  payment_pending: { bg: "#f97316" + "20", text: "#f97316", label: "Payment Pending" },
  confirmed:       { bg: "#22c55e20", text: "#22c55e", label: "Confirmed" },
  cancelled:       { bg: "#ef444420", text: "#ef4444", label: "Cancelled" },
  completed:       { bg: "#6366f120", text: "#6366f1", label: "Completed" },
};

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

interface ManagerInvitation {
  id: number;
  token: string;
  vendorName: string;
  createdAt: string;
}

export default function BookingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [invitations, setInvitations] = useState<ManagerInvitation[]>([]);
  const [actingInvId, setActingInvId] = useState<number | null>(null);
  const [managedVendors, setManagedVendors] = useState<{ id: number; businessName: string }[]>([]);
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const appState = useRef(AppState.currentState);

  const { data, isLoading, refetch } = useListMyBookings({ query: { queryKey: getListMyBookingsQueryKey(), enabled: !!user } });

  useEffect(() => {
    if (!user) return;
    customFetch<ManagerInvitation[]>("/api/manager/invitations").then(setInvitations).catch(() => {});
    customFetch<{ id: number; businessName: string }[]>("/api/manager/my-vendors").then(setManagedVendors).catch(() => {});
  }, [user?.id]);

  const respondToInvitation = async (id: number, token: string, action: "accept" | "reject") => {
    setActingInvId(id);
    try {
      await customFetch(`/api/manager/invitations/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
      if (action === "accept") {
        // Refresh managed vendors list after accepting
        customFetch<{ id: number; businessName: string }[]>("/api/manager/my-vendors").then(setManagedVendors).catch(() => {});
        Alert.alert("Invitation accepted!", "You can now scan tickets for this venue.");
      }
    } catch {
      Alert.alert("Error", "Failed to respond to invitation.");
    } finally {
      setActingInvId(null);
    }
  };

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        refetch();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [refetch]);

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
    (b) => b.bookingDate >= today && b.status !== "cancelled"
  );
  const past = (data ?? []).filter(
    (b) => b.bookingDate < today || b.status === "cancelled" || b.status === "completed"
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
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[styles.title, { color: colors.foreground }]}>My Bookings</Text>
          {managedVendors.length > 0 && (
            <TouchableOpacity
              style={[styles.scanBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push("/scanner" as never)}
            >
              <Ionicons name="scan-outline" size={16} color={colors.primaryForeground} />
              <Text style={[styles.scanBtnText, { color: colors.primaryForeground }]}>Scan</Text>
            </TouchableOpacity>
          )}
        </View>
        {invitations.map((inv) => (
          <View key={inv.id} style={[styles.invitationBanner, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "50" }]}>
            <Ionicons name="notifications-outline" size={16} color={colors.primary} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.invTitle, { color: colors.foreground }]}>
                {inv.vendorName} invited you as scanner manager
              </Text>
              <View style={styles.invBtns}>
                <TouchableOpacity
                  style={[styles.invBtn, { backgroundColor: colors.primary }, actingInvId === inv.id && { opacity: 0.7 }]}
                  disabled={actingInvId === inv.id}
                  onPress={() => respondToInvitation(inv.id, inv.token, "accept")}
                >
                  <Text style={[styles.invBtnText, { color: colors.primaryForeground }]}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.invBtn, { borderWidth: 1, borderColor: colors.border }, actingInvId === inv.id && { opacity: 0.7 }]}
                  disabled={actingInvId === inv.id}
                  onPress={() => respondToInvitation(inv.id, inv.token, "reject")}
                >
                  <Text style={[styles.invBtnText, { color: colors.mutedForeground }]}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
        {managedVendors.map((v) => (
          <TouchableOpacity
            key={v.id}
            style={[styles.managedVenueRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push("/scanner" as never)}
            activeOpacity={0.75}
          >
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.primary} />
            <Text style={[styles.managedVenueText, { color: colors.foreground }]} numberOfLines={1}>
              Managing: {v.businessName}
            </Text>
            <Ionicons name="scan-outline" size={14} color={colors.primary} style={{ marginLeft: "auto" }} />
            <Text style={{ fontSize: 11, color: colors.primary, marginLeft: 3 }}>Scan tickets</Text>
          </TouchableOpacity>
        ))}
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
                {/* Event Image Banner */}
                {b.eventImage ? (
                  <Image
                    source={{ uri: b.eventImage }}
                    style={styles.eventBanner}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.eventBanner, styles.eventBannerPlaceholder, { backgroundColor: colors.muted }]}>
                    <Ionicons name="musical-notes" size={28} color={colors.mutedForeground} />
                  </View>
                )}

                <TouchableOpacity
                  style={styles.viewEventBtn}
                  onPress={() => router.push(`/event/${b.eventId}` as never)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="arrow-forward-outline" size={12} color={colors.primary} />
                  <Text style={[styles.viewEventText, { color: colors.primary }]}>View Event</Text>
                </TouchableOpacity>

                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                      {b.eventTitle ?? `Booking #${b.id}`}
                    </Text>
                    <Text style={[styles.bookingRef, { color: colors.mutedForeground }]}>
                      Ref: RVT-{String(b.id).padStart(6, "0")}
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
                {isExpanded && status === "confirmed" && (
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

                {/* Payment pending — retry button */}
                {isExpanded && status === "payment_pending" && (
                  <View style={[styles.expandedInfo, { borderTopColor: colors.border }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <Ionicons name="alert-circle-outline" size={16} color="#f97316" />
                      <Text style={[styles.expandedText, { color: "#f97316", fontFamily: "Inter_600SemiBold" }]}>
                        Payment not completed
                      </Text>
                    </View>
                    <Text style={[styles.expandedText, { color: colors.mutedForeground }]}>
                      Tap below to re-open the payment page and complete your booking.
                    </Text>
                    <TouchableOpacity
                      style={[styles.retryBtn, { backgroundColor: "#f97316" }, retryingId === b.id && { opacity: 0.7 }]}
                      disabled={retryingId === b.id}
                      onPress={async () => {
                        setRetryingId(b.id);
                        try {
                          const result = await customFetch<{ redirectUrl?: string; error?: string }>(
                            `/api/bookings/${b.id}/retry-payment`,
                            { method: "POST" },
                          );
                          if (result?.redirectUrl) {
                            await Linking.openURL(result.redirectUrl);
                          } else {
                            throw new Error(result?.error ?? "Could not initiate payment");
                          }
                        } catch (e: unknown) {
                          const err = e as { message?: string };
                          router.push(`/event/${b.eventId}` as never);
                          console.warn("[retry-payment] fallback to event page:", err?.message);
                        } finally {
                          setRetryingId(null);
                        }
                      }}
                    >
                      {retryingId === b.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="card-outline" size={15} color="#fff" />
                          <Text style={styles.retryBtnText}>Complete Payment</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {/* Expanded details for other non-confirmed bookings */}
                {isExpanded && status !== "confirmed" && status !== "payment_pending" && (
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
  scanBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  scanBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  invitationBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  invTitle: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  invBtns: { flexDirection: "row", gap: 8, marginTop: 8 },
  invBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  invBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  managedVenueRow: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, marginTop: 6 },
  managedVenueText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  tabs: { flexDirection: "row", borderRadius: 10, padding: 3 },
  tabBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: "center" },
  tabText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  list: { padding: 20, gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  eventBanner: { width: "100%", height: 120 },
  eventBannerPlaceholder: { alignItems: "center", justifyContent: "center" },
  viewEventBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingVertical: 6 },
  viewEventText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cardTop: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  bookingRef: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 6, opacity: 0.7 },
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
  retryBtn: { marginTop: 10, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  retryBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
