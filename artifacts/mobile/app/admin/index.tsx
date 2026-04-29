import { Ionicons } from "@expo/vector-icons";
import {
  customFetch,
  useGetAdminAnalytics,
  useGetAdminBookingsReport,
  useGetAdminLeadsSummary,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

type AdminTab = "analytics" | "events" | "vendors" | "users";

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
  vendorId: number;
  createdAt: string;
  isApproved?: boolean;
}

export default function AdminPanelScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const [activeTab, setActiveTab] = useState<AdminTab>("analytics");

  // ─── ANALYTICS ─────────────────────────────────────────────────────────────
  const analyticsQ = useGetAdminAnalytics({}, { query: { enabled: activeTab === "analytics" } });
  const leadsQ = useGetAdminLeadsSummary({}, { query: { enabled: activeTab === "analytics" } });
  const bookingsQ = useGetAdminBookingsReport({}, { query: { enabled: activeTab === "analytics" } });

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

  const fetchEvents = useCallback(() => {
    setEventLoading(true);
    customFetch<AdminEvent[]>("/api/admin/events")
      .then(setEvents)
      .catch(() => {})
      .finally(() => setEventLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === "vendors") fetchVendors();
    if (activeTab === "users") fetchUsers();
    if (activeTab === "events") fetchEvents();
  }, [activeTab]);

  async function approveVendor(id: number) {
    try {
      await customFetch(`/api/vendors/${id}/approve`, { method: "POST" });
      Alert.alert("Approved", "Vendor has been approved.");
      fetchVendors();
    } catch {
      Alert.alert("Error", "Failed to approve vendor.");
    }
  }

  async function rejectVendor(id: number) {
    try {
      await customFetch(`/api/vendors/${id}/reject`, { method: "POST" });
      Alert.alert("Rejected", "Vendor application rejected.");
      fetchVendors();
    } catch {
      Alert.alert("Error", "Failed to reject vendor.");
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

  // ─── RENDER ANALYTICS ───────────────────────────────────────────────────────
  function renderAnalytics() {
    const a = analyticsQ.data as Record<string, unknown> | undefined;
    const ls = leadsQ.data as Record<string, unknown> | undefined;
    if (analyticsQ.isLoading) {
      return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;
    }
    const kpis = [
      { label: "Total Users", value: a?.["usersCount"] ?? "—", icon: "people-outline" as const, color: "#3b82f6" },
      { label: "Partners", value: a?.["vendorsCount"] ?? "—", icon: "business-outline" as const, color: colors.primary },
      { label: "Pending Vendors", value: a?.["pendingVendorsCount"] ?? "—", icon: "hourglass-outline" as const, color: "#f59e0b" },
      { label: "Events", value: a?.["eventsCount"] ?? "—", icon: "calendar-outline" as const, color: "#22c55e" },
      { label: "Total Bookings", value: a?.["bookingsCount"] ?? "—", icon: "ticket-outline" as const, color: "#8b5cf6" },
      { label: "Revenue (₹)", value: a?.["totalRevenue"] ? `₹${Number(a["totalRevenue"]).toLocaleString("en-IN")}` : "—", icon: "cash-outline" as const, color: colors.primary },
    ];

    const leadKpis = ls
      ? [
          { label: "Total Leads", value: (ls as Record<string, unknown>)["totalLeads"] ?? 0, icon: "person-add-outline" as const },
          { label: "Converted", value: (ls as Record<string, unknown>)["convertedLeads"] ?? 0, icon: "checkmark-circle-outline" as const },
        ]
      : [];

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
                    style={[styles.actionBtn, { backgroundColor: colors.destructive + "20", borderColor: colors.destructive }]}
                    onPress={() => Alert.alert("Reject?", `Reject ${v.businessName}?`, [{ text: "Cancel", style: "cancel" }, { text: "Reject", style: "destructive", onPress: () => rejectVendor(v.id) }])}
                  >
                    <Ionicons name="close" size={14} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 20 }]}>ALL PARTNERS ({approved.length})</Text>
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
    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]} refreshControl={<RefreshControl refreshing={eventLoading} onRefresh={fetchEvents} tintColor={colors.primary} />}>
        {eventLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ALL EVENTS ({events.length})</Text>
        {events.map((e) => (
          <View key={e.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>{e.title}</Text>
              <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{e.city} · #{e.vendorId}</Text>
            </View>
            <TouchableOpacity
              onPress={() => Alert.alert("Delete Event?", `Delete "${e.title}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => deleteEvent(e.id) }])}
            >
              <Ionicons name="trash-outline" size={16} color={colors.destructive} />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    );
  }

  const TABS = [
    { key: "analytics" as AdminTab, icon: "bar-chart-outline" as const, label: "Analytics" },
    { key: "vendors" as AdminTab, icon: "business-outline" as const, label: "Partners" },
    { key: "users" as AdminTab, icon: "people-outline" as const, label: "Users" },
    { key: "events" as AdminTab, icon: "calendar-outline" as const, label: "Events" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
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

      {/* Content */}
      {activeTab === "analytics" && renderAnalytics()}
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
  premiumBadge: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  userAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  roleBadge: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
});
