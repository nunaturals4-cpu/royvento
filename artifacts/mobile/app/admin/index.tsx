import { Ionicons } from "@expo/vector-icons";
import {
  customFetch,
  useGetAdminAnalytics,
  useGetAdminBookingsReport,
  useGetAdminLeadsSummary,
} from "@workspace/api-client-react";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

type AdminTab = "analytics" | "bookings" | "events" | "vendors" | "users";

interface AdminVendor {
  id: number;
  businessName: string;
  category: string;
  status: string;
  location: string;
  isPremium: boolean;
  createdAt: string;
}

interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

interface AdminEvent {
  id: number;
  title: string;
  city: string;
  status: string;
  approvalStatus: string;
  vendorId: number;
  partnerName?: string;
  createdAt: string;
}

interface AdminBooking {
  id: number;
  guestName: string;
  eventTitle: string;
  status: string;
  finalPrice: number;
  createdAt: string;
  ticketCode: string;
}

export default function AdminPanelScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const [activeTab, setActiveTab] = useState<AdminTab>("analytics");

  // ─── ANALYTICS ─────────────────────────────────────────────────────────────
  const analyticsQ = useGetAdminAnalytics({}, { query: { enabled: activeTab === "analytics" } });
  const leadsQ = useGetAdminLeadsSummary({}, { query: { enabled: activeTab === "analytics" } });
  const bookingsReportQ = useGetAdminBookingsReport({}, { query: { enabled: activeTab === "analytics" } });

  // ─── VENDORS ────────────────────────────────────────────────────────────────
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [vendorLoading, setVendorLoading] = useState(false);

  const fetchVendors = useCallback(() => {
    setVendorLoading(true);
    customFetch<AdminVendor[]>("/api/admin/vendors")
      .then(setVendors)
      .catch(() => {})
      .finally(() => setVendorLoading(false));
  }, []);

  // ─── USERS ──────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userLoading, setUserLoading] = useState(false);

  const fetchUsers = useCallback(() => {
    setUserLoading(true);
    customFetch<AdminUser[]>("/api/admin/users")
      .then(setUsers)
      .catch(() => {})
      .finally(() => setUserLoading(false));
  }, []);

  // ─── EVENTS ─────────────────────────────────────────────────────────────────
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventFilter, setEventFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const fetchEvents = useCallback(() => {
    setEventLoading(true);
    customFetch<AdminEvent[]>("/api/admin/events")
      .then(setEvents)
      .catch(() => {})
      .finally(() => setEventLoading(false));
  }, []);

  // ─── BOOKINGS ───────────────────────────────────────────────────────────────
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const fetchBookings = useCallback(() => {
    setBookingLoading(true);
    customFetch<AdminBooking[]>("/api/admin/bookings")
      .then(setBookings)
      .catch(() => {})
      .finally(() => setBookingLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === "vendors") fetchVendors();
    if (activeTab === "users") fetchUsers();
    if (activeTab === "events") fetchEvents();
    if (activeTab === "bookings") fetchBookings();
  }, [activeTab]);

  // ─── VENDOR ACTIONS ─────────────────────────────────────────────────────────
  async function approveVendor(id: number) {
    try {
      await customFetch(`/api/vendors/${id}/approve`, { method: "POST" });
      Alert.alert("Approved", "Partner has been approved.");
      fetchVendors();
    } catch {
      Alert.alert("Error", "Failed to approve partner.");
    }
  }

  async function rejectVendor(id: number) {
    try {
      await customFetch(`/api/vendors/${id}/reject`, { method: "POST" });
      Alert.alert("Rejected", "Partner application rejected.");
      fetchVendors();
    } catch {
      Alert.alert("Error", "Failed to reject partner.");
    }
  }

  // ─── EVENT ACTIONS ──────────────────────────────────────────────────────────
  async function moderateEvent(id: number, approvalStatus: "approved" | "rejected", rejectionReason?: string) {
    try {
      await customFetch(`/api/admin/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalStatus, ...(rejectionReason ? { rejectionReason } : {}) }),
      });
      fetchEvents();
    } catch {
      Alert.alert("Error", "Failed to update event.");
    }
  }

  async function deleteEvent(id: number) {
    try {
      await customFetch(`/api/admin/events/${id}`, { method: "DELETE" });
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch {
      Alert.alert("Error", "Failed to delete event.");
    }
  }

  // ─── BOOKING ACTIONS ────────────────────────────────────────────────────────
  async function approveBooking(id: number) {
    try {
      await customFetch(`/api/admin/bookings/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmed" }),
      });
      fetchBookings();
    } catch {
      Alert.alert("Error", "Failed to approve booking.");
    }
  }

  async function rejectBooking(id: number, reason: string) {
    if (!reason.trim()) {
      Alert.alert("Reason required", "Please enter a rejection reason.");
      return;
    }
    try {
      await customFetch(`/api/admin/bookings/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled", rejectionReason: reason.trim() }),
      });
      setRejectingId(null);
      setRejectReason("");
      fetchBookings();
    } catch {
      Alert.alert("Error", "Failed to reject booking.");
    }
  }

  // ─── RENDER ANALYTICS ───────────────────────────────────────────────────────
  function renderAnalytics() {
    const a = analyticsQ.data as Record<string, unknown> | undefined;
    const ls = leadsQ.data as Record<string, unknown> | undefined;
    const br = bookingsReportQ.data as Record<string, unknown> | undefined;
    if (analyticsQ.isLoading) {
      return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;
    }
    const kpis = [
      { label: "Total Users", value: a?.["totalUsers"] ?? "—", icon: "people-outline" as const, color: "#3b82f6" },
      { label: "Partners", value: a?.["totalVendors"] ?? "—", icon: "business-outline" as const, color: colors.primary },
      { label: "Pending Partners", value: a?.["pendingVendors"] ?? "—", icon: "hourglass-outline" as const, color: "#f59e0b" },
      { label: "Events", value: a?.["totalEvents"] ?? "—", icon: "calendar-outline" as const, color: "#22c55e" },
      { label: "Total Bookings", value: a?.["totalBookings"] ?? "—", icon: "ticket-outline" as const, color: "#8b5cf6" },
      { label: "Revenue", value: a?.["totalRevenue"] ? `₹${Number(a["totalRevenue"]).toLocaleString("en-IN")}` : "—", icon: "cash-outline" as const, color: colors.primary },
    ];

    const bsByStatus = (br?.["bookingsByStatus"] as Array<{ status: string; count: number }> | undefined) ?? [];
    const leadKpis = ls
      ? [
          { label: "Total Leads", value: (ls as Record<string, unknown>)["totalLeads"] ?? 0, icon: "person-add-outline" as const },
          { label: "Converted", value: (ls as Record<string, unknown>)["convertedLeads"] ?? 0, icon: "checkmark-circle-outline" as const },
        ]
      : [];

    const monthlyRevenue = (a?.["monthlyRevenue"] as Array<{ month: string; revenue: number }> | undefined) ?? [];

    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]}>
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>PLATFORM OVERVIEW</Text>
        <View style={styles.kpiGrid}>
          {kpis.map((k) => (
            <View key={k.label} style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.kpiIcon, { backgroundColor: (k.color ?? colors.primary) + "20" }]}>
                <Ionicons name={k.icon} size={18} color={k.color ?? colors.primary} />
              </View>
              <Text style={[styles.kpiValue, { color: colors.foreground }]}>{String(k.value)}</Text>
              <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{k.label}</Text>
            </View>
          ))}
        </View>

        {bsByStatus.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 20 }]}>BOOKINGS BY STATUS</Text>
            <View style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "column", gap: 8 }]}>
              {bsByStatus.map((b) => {
                const pct = bsByStatus.reduce((s, x) => s + x.count, 0) > 0
                  ? (b.count / bsByStatus.reduce((s, x) => s + x.count, 0)) * 100
                  : 0;
                const statusColor = b.status === "confirmed" ? "#22c55e" : b.status === "pending" ? "#f59e0b" : b.status === "cancelled" ? "#ef4444" : colors.mutedForeground;
                return (
                  <View key={b.status} style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: statusColor, fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "capitalize" }}>{b.status}</Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>{b.count}</Text>
                    </View>
                    <View style={{ height: 4, backgroundColor: colors.muted, borderRadius: 2 }}>
                      <View style={{ height: 4, width: `${pct}%`, backgroundColor: statusColor, borderRadius: 2 }} />
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {monthlyRevenue.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 20 }]}>MONTHLY REVENUE TREND</Text>
            <View style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "column", gap: 0 }]}>
              {(() => {
                const max = Math.max(...monthlyRevenue.map((m) => m.revenue), 1);
                return monthlyRevenue.slice(-6).map((m) => (
                  <View key={m.month} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", width: 50 }}>{m.month.slice(0, 7)}</Text>
                    <View style={{ flex: 1, height: 14, backgroundColor: colors.muted, borderRadius: 4 }}>
                      <View style={{ height: 14, width: `${(m.revenue / max) * 100}%`, backgroundColor: colors.primary, borderRadius: 4 }} />
                    </View>
                    <Text style={{ color: colors.foreground, fontSize: 11, fontFamily: "Inter_600SemiBold", width: 70, textAlign: "right" }}>
                      ₹{Number(m.revenue).toLocaleString("en-IN")}
                    </Text>
                  </View>
                ));
              })()}
            </View>
          </>
        )}

        {leadKpis.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 20 }]}>CRM LEADS</Text>
            <View style={styles.kpiGrid}>
              {leadKpis.map((k) => (
                <View key={k.label} style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.kpiIcon, { backgroundColor: colors.primary + "20" }]}>
                    <Ionicons name={k.icon} size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.kpiValue, { color: colors.foreground }]}>{String(k.value)}</Text>
                  <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{k.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    );
  }

  // ─── RENDER BOOKINGS ─────────────────────────────────────────────────────────
  function renderBookings() {
    const pending = bookings.filter((b) => b.status === "pending" || b.status === "payment_pending");
    const others = bookings.filter((b) => b.status !== "pending" && b.status !== "payment_pending");

    function statusColor(s: string) {
      if (s === "confirmed" || s === "completed") return "#22c55e";
      if (s === "pending" || s === "payment_pending") return "#f59e0b";
      if (s === "cancelled") return "#ef4444";
      return colors.mutedForeground;
    }

    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]} refreshControl={<RefreshControl refreshing={bookingLoading} onRefresh={fetchBookings} tintColor={colors.primary} />}>
        {bookingLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

        {rejectingId !== null && (
          <View style={[styles.rejectBox, { backgroundColor: colors.card, borderColor: "#ef444440" }]}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13, marginBottom: 8 }}>
              Rejection Reason (required)
            </Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Enter reason for cancellation..."
              placeholderTextColor={colors.mutedForeground}
              style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <TouchableOpacity style={[styles.actionBtnWide, { backgroundColor: "#ef444420", borderColor: "#ef4444" }]} onPress={() => rejectBooking(rejectingId, rejectReason)}>
                <Text style={{ color: "#ef4444", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Confirm Rejection</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtnWide, { backgroundColor: colors.muted, borderColor: colors.border }]} onPress={() => { setRejectingId(null); setRejectReason(""); }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {pending.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: "#f59e0b" }]}>PENDING APPROVAL ({pending.length})</Text>
            {pending.map((b) => (
              <View key={b.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: "#f59e0b40", flexDirection: "column", gap: 8 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: colors.foreground }]}>{b.guestName}</Text>
                    <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{b.eventTitle}</Text>
                    <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{b.ticketCode} · ₹{Number(b.finalPrice).toLocaleString("en-IN")}</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#22c55e20", borderColor: "#22c55e" }]}
                      onPress={() => Alert.alert("Approve?", `Approve booking for ${b.guestName}?`, [{ text: "Cancel", style: "cancel" }, { text: "Approve", onPress: () => approveBooking(b.id) }])}
                    >
                      <Ionicons name="checkmark" size={14} color="#22c55e" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#ef444420", borderColor: "#ef4444" }]}
                      onPress={() => { setRejectingId(b.id); setRejectReason(""); }}
                    >
                      <Ionicons name="close" size={14} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: pending.length > 0 ? 20 : 0 }]}>ALL BOOKINGS ({others.length})</Text>
        {others.map((b) => (
          <View key={b.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>{b.guestName}</Text>
              <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{b.eventTitle} · {b.ticketCode}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text style={{ color: statusColor(b.status), fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{b.status}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" }}>₹{Number(b.finalPrice).toLocaleString("en-IN")}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  // ─── RENDER VENDORS ─────────────────────────────────────────────────────────
  function renderVendors() {
    const pending = vendors.filter((v) => v.status === "pending");
    const approved = vendors.filter((v) => v.status === "approved");

    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]} refreshControl={<RefreshControl refreshing={vendorLoading} onRefresh={fetchVendors} tintColor={colors.primary} />}>
        {vendorLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
        {pending.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: "#f59e0b" }]}>PENDING APPROVAL ({pending.length})</Text>
            {pending.map((v) => (
              <View key={v.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: "#f59e0b40" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.foreground }]}>{v.businessName}</Text>
                  <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{v.category} · {v.location}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#22c55e20", borderColor: "#22c55e" }]}
                    onPress={() => Alert.alert("Approve?", `Approve ${v.businessName}?`, [{ text: "Cancel", style: "cancel" }, { text: "Approve", onPress: () => approveVendor(v.id) }])}
                  >
                    <Ionicons name="checkmark" size={14} color="#22c55e" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#ef444420", borderColor: "#ef4444" }]}
                    onPress={() => Alert.alert("Reject?", `Reject ${v.businessName}?`, [{ text: "Cancel", style: "cancel" }, { text: "Reject", style: "destructive", onPress: () => rejectVendor(v.id) }])}
                  >
                    <Ionicons name="close" size={14} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: pending.length > 0 ? 20 : 0 }]}>ALL PARTNERS ({approved.length})</Text>
        {approved.map((v) => (
          <View key={v.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>{v.businessName}</Text>
              <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{v.category} · {v.location}</Text>
            </View>
            {v.isPremium && (
              <View style={[styles.premiumBadge, { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}>
                <Ionicons name="star" size={10} color={colors.primary} />
                <Text style={[{ color: colors.primary, fontSize: 10, fontFamily: "Inter_600SemiBold" }]}>Premium</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    );
  }

  // ─── RENDER USERS ───────────────────────────────────────────────────────────
  function renderUsers() {
    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]} refreshControl={<RefreshControl refreshing={userLoading} onRefresh={fetchUsers} tintColor={colors.primary} />}>
        {userLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ALL USERS ({users.length})</Text>
        {users.map((u) => (
          <View key={u.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.userAvatar, { backgroundColor: colors.muted }]}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 14 }}>
                {u.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>{u.name}</Text>
              <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{u.email}</Text>
            </View>
            <View style={[styles.roleBadge, { backgroundColor: u.role === "admin" ? colors.primary + "20" : u.role === "vendor" ? "#8b5cf620" : colors.muted, borderColor: u.role === "admin" ? colors.primary : u.role === "vendor" ? "#8b5cf6" : colors.border }]}>
              <Text style={{ color: u.role === "admin" ? colors.primary : u.role === "vendor" ? "#8b5cf6" : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{u.role}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  // ─── RENDER EVENTS ──────────────────────────────────────────────────────────
  function renderEvents() {
    const filtered = eventFilter === "all" ? events : events.filter((e) => e.approvalStatus === eventFilter);

    function approvalColor(s: string) {
      if (s === "approved") return "#22c55e";
      if (s === "pending") return "#f59e0b";
      if (s === "rejected") return "#ef4444";
      return colors.mutedForeground;
    }

    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]} refreshControl={<RefreshControl refreshing={eventLoading} onRefresh={fetchEvents} tintColor={colors.primary} />}>
        {eventLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
          {(["all", "pending", "approved", "rejected"] as const).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setEventFilter(f)}
              style={[styles.filterChip, { backgroundColor: eventFilter === f ? colors.primary : colors.muted, borderColor: eventFilter === f ? colors.primary : colors.border }]}
            >
              <Text style={{ color: eventFilter === f ? colors.primaryForeground : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "capitalize" }}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>EVENTS ({filtered.length})</Text>
        {filtered.map((e) => (
          <View key={e.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "column", gap: 8 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>{e.title}</Text>
                <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{e.city}{e.partnerName ? ` · ${e.partnerName}` : ""}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <View style={[styles.roleBadge, { backgroundColor: approvalColor(e.approvalStatus) + "20", borderColor: approvalColor(e.approvalStatus) }]}>
                  <Text style={{ color: approvalColor(e.approvalStatus), fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{e.approvalStatus}</Text>
                </View>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {e.approvalStatus === "pending" && (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtnWide, { backgroundColor: "#22c55e20", borderColor: "#22c55e", flex: 1 }]}
                    onPress={() => Alert.alert("Approve Event?", `Approve "${e.title}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Approve", onPress: () => moderateEvent(e.id, "approved") }])}
                  >
                    <Ionicons name="checkmark-circle-outline" size={14} color="#22c55e" />
                    <Text style={{ color: "#22c55e", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtnWide, { backgroundColor: "#ef444420", borderColor: "#ef4444", flex: 1 }]}
                    onPress={() => Alert.prompt(
                      "Reject Event",
                      `Reason for rejecting "${e.title}":`,
                      (reason) => { if (reason) moderateEvent(e.id, "rejected", reason); }
                    )}
                  >
                    <Ionicons name="close-circle-outline" size={14} color="#ef4444" />
                    <Text style={{ color: "#ef4444", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Reject</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#ef444410", borderColor: "#ef444440" }]}
                onPress={() => Alert.alert("Delete Event?", `Delete "${e.title}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => deleteEvent(e.id) }])}
              >
                <Ionicons name="trash-outline" size={14} color={colors.destructive} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  const TABS = [
    { key: "analytics" as AdminTab, icon: "bar-chart-outline" as const, label: "Analytics" },
    { key: "bookings" as AdminTab, icon: "ticket-outline" as const, label: "Bookings" },
    { key: "vendors" as AdminTab, icon: "business-outline" as const, label: "Partners" },
    { key: "users" as AdminTab, icon: "people-outline" as const, label: "Users" },
    { key: "events" as AdminTab, icon: "calendar-outline" as const, label: "Events" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={[styles.header, { paddingTop: topPadding + 12 }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Admin Panel</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>Platform management</Text>
          </View>
          <View style={[styles.shieldIcon, { backgroundColor: colors.primary + "20" }]}>
            <Ionicons name="shield-outline" size={20} color={colors.primary} />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setActiveTab(t.key)}
              style={[styles.tab, { backgroundColor: activeTab === t.key ? colors.primary : colors.muted, borderColor: activeTab === t.key ? colors.primary : colors.border }]}
            >
              <Ionicons name={t.icon} size={13} color={activeTab === t.key ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[styles.tabText, { color: activeTab === t.key ? colors.primaryForeground : colors.mutedForeground }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>

      {activeTab === "analytics" && renderAnalytics()}
      {activeTab === "bookings" && renderBookings()}
      {activeTab === "vendors" && renderVendors()}
      {activeTab === "users" && renderUsers()}
      {activeTab === "events" && renderEvents()}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 16, gap: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  shieldIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tabBar: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  tabText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  list: { padding: 20, gap: 10 },
  sectionHeader: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5, marginBottom: 8 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpiCard: { width: "47%", borderRadius: 14, borderWidth: 1, padding: 14, gap: 6, alignItems: "center" },
  kpiIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  kpiValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  kpiLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  itemCard: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  itemTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  itemSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  actionBtn: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  actionBtnWide: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  premiumBadge: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  userAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  roleBadge: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  filterChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  rejectBox: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 10 },
  reasonInput: { borderWidth: 1, borderRadius: 10, padding: 10, minHeight: 60, textAlignVertical: "top", fontSize: 13, fontFamily: "Inter_400Regular" },
});
