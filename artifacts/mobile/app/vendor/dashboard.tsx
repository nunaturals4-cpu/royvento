import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  getGetMyVendorQueryKey,
  getListMyVendorEventsQueryKey,
  getListVendorBookingsQueryKey,
  useCreateEvent,
  useDeleteEvent,
  useGetMyVendor,
  useListMyVendorEvents,
  useListVendorBookings,
  useUpdateBookingStatus,
  useUpdateMyVendor,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type DashTab = "bookings" | "events" | "profile" | "calendar";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:   { bg: "#f59e0b20", text: "#f59e0b" },
  confirmed: { bg: "#22c55e20", text: "#22c55e" },
  cancelled: { bg: "#ef444420", text: "#ef4444" },
  completed: { bg: "#6366f120", text: "#6366f1" },
};

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const VALID_API_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const EVENT_CATEGORIES = [
  "Wedding", "Corporate", "Birthday", "Cultural", "Private",
  "Festival", "Concert", "Brand Activation", "Pubs",
];

interface BlockedDate {
  id: number;
  date: string;
  reason: string;
  source: string;
}

export default function VendorDashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<DashTab>("bookings");
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const isVendorOrAdmin = user?.role === "vendor" || user?.role === "admin";

  // ─── Data hooks ───────────────────────────────────────────
  const vendorQuery = useGetMyVendor();
  const vendor = (vendorQuery.data as any)?.vendor ?? null;

  const bookingsQ = useListVendorBookings({
    query: { queryKey: getListVendorBookingsQueryKey(), enabled: isVendorOrAdmin },
  });
  const eventsQ = useListMyVendorEvents({
    query: { queryKey: getListMyVendorEventsQueryKey(), enabled: isVendorOrAdmin },
  });
  const updateStatus = useUpdateBookingStatus({
    mutation: {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        bookingsQ.refetch();
      },
    },
  });

  // ─── Events tab ───────────────────────────────────────────
  const createEventMut = useCreateEvent({
    mutation: {
      onSuccess: () => {
        eventsQ.refetch();
        setShowCreateModal(false);
        resetEventForm();
      },
    },
  });
  const deleteEventMut = useDeleteEvent({
    mutation: {
      onSuccess: () => eventsQ.refetch(),
    },
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [evTitle, setEvTitle] = useState("");
  const [evDesc, setEvDesc] = useState("");
  const [evCategory, setEvCategory] = useState(EVENT_CATEGORIES[0]!);
  const [evLocation, setEvLocation] = useState("");
  const [evPrice, setEvPrice] = useState("");
  const [evCapacity, setEvCapacity] = useState("");
  const [showCatPicker, setShowCatPicker] = useState(false);

  function resetEventForm() {
    setEvTitle(""); setEvDesc(""); setEvCategory(EVENT_CATEGORIES[0]!);
    setEvLocation(""); setEvPrice(""); setEvCapacity("");
  }

  function submitCreateEvent() {
    const price = parseFloat(evPrice);
    const capacity = parseInt(evCapacity, 10);
    if (!evTitle.trim() || !evDesc.trim() || !evLocation.trim()) {
      Alert.alert("Missing fields", "Please fill in all required fields.");
      return;
    }
    if (isNaN(price) || price < 0) {
      Alert.alert("Invalid price", "Please enter a valid price.");
      return;
    }
    if (isNaN(capacity) || capacity < 1) {
      Alert.alert("Invalid capacity", "Please enter a valid capacity.");
      return;
    }
    createEventMut.mutate({
      data: {
        title: evTitle.trim(),
        description: evDesc.trim(),
        category: evCategory,
        location: evLocation.trim(),
        price,
        capacity,
      },
    });
  }

  // ─── Profile tab ─────────────────────────────────────────
  const [profName, setProfName] = useState("");
  const [profDesc, setProfDesc] = useState("");
  const [profCity, setProfCity] = useState("");
  const [profState, setProfState] = useState("");
  const [profCountry, setProfCountry] = useState("India");
  const [profOpenDays, setProfOpenDays] = useState<string[]>([...ALL_DAYS]);
  const [profSaving, setProfSaving] = useState(false);

  const updateVendorMut = useUpdateMyVendor({
    mutation: { onSuccess: () => vendorQuery.refetch() },
  });

  useEffect(() => {
    if (vendor) {
      setProfName(vendor.businessName ?? "");
      setProfDesc(vendor.description ?? "");
      setProfCity(vendor.city ?? "");
      setProfState(vendor.state ?? "");
      setProfCountry(vendor.country || "India");
      setProfOpenDays(
        Array.isArray(vendor.openDays) && vendor.openDays.length > 0
          ? vendor.openDays
          : [...ALL_DAYS],
      );
    }
  }, [vendor?.id]);

  async function saveProfile() {
    setProfSaving(true);
    try {
      await updateVendorMut.mutateAsync({
        data: {
          businessName: profName.trim(),
          description: profDesc.trim(),
          category: vendor?.category ?? "Cultural",
          location: `${profCity}${profState ? ", " + profState : ""}`,
          bannerImage: vendor?.bannerImage ?? "",
          portfolioImages: vendor?.portfolioImages ?? [],
        },
      });
      await customFetch("/api/partner/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: profCity.trim(),
          state: profState.trim(),
          country: profCountry.trim() || "India",
          openDays: profOpenDays.filter((d) => VALID_API_DAYS.includes(d)),
        }),
      });
      qc.invalidateQueries({ queryKey: getGetMyVendorQueryKey() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Your profile has been updated.");
    } catch {
      Alert.alert("Error", "Failed to save profile. Please try again.");
    } finally {
      setProfSaving(false);
    }
  }

  function toggleDay(day: string) {
    setProfOpenDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  // ─── Calendar tab ─────────────────────────────────────────
  const blockedDatesQ = useQuery<BlockedDate[]>({
    queryKey: ["blocked-dates-me"],
    queryFn: () => customFetch("/api/partner/blocked-dates/me"),
    enabled: isVendorOrAdmin,
  });

  const addBlockedMut = useMutation({
    mutationFn: (date: string) =>
      customFetch("/api/partner/blocked-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, reason: "", source: "manual" }),
      }),
    onSuccess: () => blockedDatesQ.refetch(),
  });

  const deleteBlockedMut = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/partner/blocked-dates/${id}`, { method: "DELETE" }),
    onSuccess: () => blockedDatesQ.refetch(),
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());

  function onDateChange(_: unknown, selected?: Date) {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (selected) setPickerDate(selected);
  }

  function confirmAddDate() {
    const iso = pickerDate.toISOString().split("T")[0]!;
    addBlockedMut.mutate(iso);
    setShowDatePicker(false);
  }

  // ─── Guard ────────────────────────────────────────────────
  if (!user || (user.role !== "vendor" && user.role !== "admin")) {
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

  const pending = (bookingsQ.data ?? []).filter((b) => b.status === "pending");
  const allBookings = bookingsQ.data ?? [];

  // ─── TAB RENDERERS ────────────────────────────────────────

  function renderBookings() {
    if (bookingsQ.isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />;
    if (allBookings.length === 0) return (
      <EmptyState icon="ticket-outline" title="No bookings yet" subtitle="Customer booking requests will appear here" />
    );
    return (
      <FlatList
        data={allBookings}
        keyExtractor={(b) => String(b.id)}
        contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 34 : 100 }]}
        onRefresh={bookingsQ.refetch}
        refreshing={bookingsQ.isLoading}
        renderItem={({ item: b }) => {
          const statusStyle = STATUS_COLORS[b.status ?? "pending"] ?? STATUS_COLORS.pending!;
          return (
            <View style={[styles.bookingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardId, { color: colors.foreground }]}>Booking #{b.id}</Text>
                  <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                    {b.bookingDate} · {b.guests} guest{b.guests !== 1 ? "s" : ""}
                  </Text>
                  {b.eventTitle ? (
                    <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>{b.eventTitle}</Text>
                  ) : null}
                  {b.phone ? (
                    <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{b.phone}</Text>
                  ) : null}
                </View>
                <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
                  <Text style={[styles.badgeText, { color: statusStyle.text }]}>{b.status}</Text>
                </View>
              </View>
              {b.notes ? <Text style={[styles.notes, { color: colors.mutedForeground }]}>{b.notes}</Text> : null}
              {b.status === "pending" ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.rejectBtn, { borderColor: colors.destructive }]}
                    onPress={() =>
                      Alert.alert("Reject Booking?", "The customer will be notified.", [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Reject", style: "destructive",
                          onPress: () => updateStatus.mutate({
                            bookingId: b.id,
                            data: { status: "cancelled", rejectionReason: "Declined by venue" },
                          }),
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
    );
  }

  function renderEvents() {
    if (eventsQ.isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />;
    const evList = eventsQ.data ?? [];
    return (
      <FlatList
        data={evList}
        keyExtractor={(e) => String(e.id)}
        ListEmptyComponent={
          <EmptyState icon="calendar-outline" title="No listings yet" subtitle="Create your first event or pub listing" />
        }
        contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 34 : 100 }]}
        onRefresh={eventsQ.refetch}
        refreshing={eventsQ.isLoading}
        ListHeaderComponent={
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowCreateModal(true)}
          >
            <Ionicons name="add" size={18} color={colors.primaryForeground} />
            <Text style={[styles.createBtnText, { color: colors.primaryForeground }]}>New Listing</Text>
          </TouchableOpacity>
        }
        renderItem={({ item: e }) => (
          <View style={[styles.eventRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity style={styles.eventIcon} onPress={() => router.push(`/event/${e.id}`)}>
              <View style={[styles.eventIconInner, { backgroundColor: colors.muted }]}>
                <Ionicons name="calendar" size={18} color={colors.primary} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push(`/event/${e.id}`)}>
              <Text style={[styles.eventTitle, { color: colors.foreground }]} numberOfLines={1}>{e.title}</Text>
              <Text style={[styles.eventCat, { color: colors.mutedForeground }]}>{e.category}</Text>
            </TouchableOpacity>
            <View style={[styles.badge, { backgroundColor: e.approvalStatus === "approved" ? "#22c55e20" : "#f59e0b20" }]}>
              <Text style={[styles.badgeText, { color: e.approvalStatus === "approved" ? "#22c55e" : "#f59e0b" }]}>
                {e.approvalStatus}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.deleteBtn, { backgroundColor: colors.destructive + "20" }]}
              onPress={() =>
                Alert.alert("Delete Listing?", `"${e.title}" will be permanently removed.`, [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete", style: "destructive",
                    onPress: () => deleteEventMut.mutate({ eventId: e.id }),
                  },
                ])
              }
            >
              <Ionicons name="trash-outline" size={15} color={colors.destructive} />
            </TouchableOpacity>
          </View>
        )}
      />
    );
  }

  function renderProfile() {
    if (vendorQuery.isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />;
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]}>
          <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>BUSINESS INFO</Text>

          <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Business Name *</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground }]}
              value={profName}
              onChangeText={setProfName}
              placeholder="Your venue / studio name"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description</Text>
            <TextInput
              style={[styles.fieldInput, styles.textArea, { color: colors.foreground }]}
              value={profDesc}
              onChangeText={setProfDesc}
              placeholder="Describe your venue, services, and specialties…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={4}
            />
          </View>

          <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 8 }]}>LOCATION</Text>

          <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>City</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground }]}
              value={profCity}
              onChangeText={setProfCity}
              placeholder="e.g. Mumbai"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>State</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground }]}
              value={profState}
              onChangeText={setProfState}
              placeholder="e.g. Maharashtra"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Country</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground }]}
              value={profCountry}
              onChangeText={setProfCountry}
              placeholder="India"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 8 }]}>OPERATING DAYS</Text>
          <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.daysRow}>
              {ALL_DAYS.map((day) => {
                const active = profOpenDays.includes(day);
                return (
                  <TouchableOpacity
                    key={day}
                    onPress={() => toggleDay(day)}
                    style={[
                      styles.dayChip,
                      {
                        backgroundColor: active ? colors.primary : colors.muted,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.dayText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: profSaving ? 0.6 : 1 }]}
            onPress={saveProfile}
            disabled={profSaving}
          >
            {profSaving ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : null}
            <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>
              {profSaving ? "Saving…" : "Save Profile"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderCalendar() {
    const blocked = blockedDatesQ.data ?? [];
    return (
      <View style={{ flex: 1 }}>
        <FlatList
          data={blocked}
          keyExtractor={(d) => String(d.id)}
          ListEmptyComponent={
            <EmptyState
              icon="calendar-clear-outline"
              title="No blocked dates"
              subtitle="Add dates you're unavailable so customers can't book you"
            />
          }
          contentContainerStyle={[styles.list, { paddingBottom: 120 }]}
          onRefresh={blockedDatesQ.refetch}
          refreshing={blockedDatesQ.isLoading}
          ListHeaderComponent={
            <TouchableOpacity
              style={[styles.createBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.primaryForeground} />
              <Text style={[styles.createBtnText, { color: colors.primaryForeground }]}>Block a Date</Text>
            </TouchableOpacity>
          }
          renderItem={({ item: d }) => (
            <View style={[styles.blockedRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="ban-outline" size={18} color={colors.destructive} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.blockedDate, { color: colors.foreground }]}>{d.date}</Text>
                {d.reason ? <Text style={[styles.blockedReason, { color: colors.mutedForeground }]}>{d.reason}</Text> : null}
              </View>
              <TouchableOpacity
                onPress={() =>
                  Alert.alert("Remove date?", `Unblock ${d.date}?`, [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Remove", style: "destructive",
                      onPress: () => deleteBlockedMut.mutate(d.id),
                    },
                  ])
                }
                style={[styles.deleteBtn, { backgroundColor: colors.destructive + "20" }]}
              >
                <Ionicons name="trash-outline" size={15} color={colors.destructive} />
              </TouchableOpacity>
            </View>
          )}
        />

        {showDatePicker && (
          Platform.OS === "ios" ? (
            <Modal transparent animationType="slide">
              <View style={styles.datePickerModal}>
                <View style={[styles.datePickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.datePickerTitle, { color: colors.foreground }]}>Select Date to Block</Text>
                  <DateTimePicker
                    value={pickerDate}
                    mode="date"
                    display="spinner"
                    minimumDate={new Date()}
                    onChange={onDateChange}
                    themeVariant="dark"
                  />
                  <View style={styles.datePickerActions}>
                    <TouchableOpacity
                      style={[styles.datePickerCancel, { borderColor: colors.border }]}
                      onPress={() => setShowDatePicker(false)}
                    >
                      <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.datePickerConfirm, { backgroundColor: colors.primary }]}
                      onPress={confirmAddDate}
                    >
                      <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>Block Date</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          ) : (
            <>
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="default"
                minimumDate={new Date()}
                onChange={onDateChange}
              />
              {Platform.OS === "android" ? (
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.primary, margin: 20 }]}
                  onPress={confirmAddDate}
                >
                  <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>Confirm Block Date</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )
        )}
      </View>
    );
  }

  // ─── MAIN RENDER ──────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>Partner Dashboard</Text>
          <View style={{ width: 22 }} />
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { icon: "hourglass-outline" as const, value: pending.length, label: "Pending" },
            { icon: "checkmark-circle-outline" as const, value: allBookings.filter((b) => b.status === "confirmed").length, label: "Confirmed" },
            { icon: "calendar-outline" as const, value: (eventsQ.data ?? []).length, label: "Listings" },
          ].map((s) => (
            <View key={s.label} style={[styles.stat, { backgroundColor: colors.muted }]}>
              <Ionicons name={s.icon} size={18} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {([
            { key: "bookings", icon: "ticket-outline", label: `Bookings${pending.length > 0 ? ` (${pending.length})` : ""}` },
            { key: "events",   icon: "calendar-outline", label: "My Listings" },
            { key: "profile",  icon: "person-outline", label: "Profile" },
            { key: "calendar", icon: "calendar-clear-outline", label: "Calendar" },
          ] as const).map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setActiveTab(t.key)}
              style={[styles.tab, { backgroundColor: activeTab === t.key ? colors.primary : colors.muted, borderColor: activeTab === t.key ? colors.primary : colors.border }]}
            >
              <Ionicons name={t.icon} size={13} color={activeTab === t.key ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[styles.tabText, { color: activeTab === t.key ? colors.primaryForeground : colors.mutedForeground }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      {activeTab === "bookings" && renderBookings()}
      {activeTab === "events"   && renderEvents()}
      {activeTab === "profile"  && renderProfile()}
      {activeTab === "calendar" && renderCalendar()}

      {/* Create Event Modal */}
      <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <TouchableOpacity onPress={() => { setShowCreateModal(false); resetEventForm(); }}>
              <Ionicons name="close" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Listing</Text>
            <TouchableOpacity onPress={submitCreateEvent} disabled={createEventMut.isPending}>
              {createEventMut.isPending
                ? <ActivityIndicator color={colors.primary} size="small" />
                : <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Create</Text>
              }
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 80 }]}>

              <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Title *</Text>
                <TextInput
                  style={[styles.fieldInput, { color: colors.foreground }]}
                  value={evTitle}
                  onChangeText={setEvTitle}
                  placeholder="Event or venue name"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>

              <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Category</Text>
                <TouchableOpacity onPress={() => setShowCatPicker(true)} style={styles.pickerRow}>
                  <Text style={[styles.fieldInput, { color: colors.foreground }]}>{evCategory}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {showCatPicker ? (
                <View style={[styles.catList, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {EVENT_CATEGORIES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.catItem, { borderBottomColor: colors.border }]}
                      onPress={() => { setEvCategory(c); setShowCatPicker(false); }}
                    >
                      <Text style={[{ color: c === evCategory ? colors.primary : colors.foreground, fontFamily: "Inter_500Medium", fontSize: 14 }]}>{c}</Text>
                      {c === evCategory ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description *</Text>
                <TextInput
                  style={[styles.fieldInput, styles.textArea, { color: colors.foreground }]}
                  value={evDesc}
                  onChangeText={setEvDesc}
                  placeholder="Describe your event or venue…"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Location / Venue Address *</Text>
                <TextInput
                  style={[styles.fieldInput, { color: colors.foreground }]}
                  value={evLocation}
                  onChangeText={setEvLocation}
                  placeholder="e.g. Bandra, Mumbai"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={[styles.field, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Price (₹)</Text>
                  <TextInput
                    style={[styles.fieldInput, { color: colors.foreground }]}
                    value={evPrice}
                    onChangeText={setEvPrice}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[styles.field, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Capacity</Text>
                  <TextInput
                    style={[styles.fieldInput, { color: colors.foreground }]}
                    value={evCapacity}
                    onChangeText={setEvCapacity}
                    placeholder="50"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                  />
                </View>
              </View>

            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statsRow: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, borderRadius: 12, padding: 12, alignItems: "center", gap: 4 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  tabBar: { gap: 8, paddingRight: 4 },
  tab: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  tabText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  list: { padding: 20, gap: 12 },
  sectionHeader: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: -4 },
  field: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  fieldInput: { fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 24 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  daysRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dayChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  dayText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  saveBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  createBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 13, marginBottom: 4 },
  createBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  bookingCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  cardHeader: { flexDirection: "row", gap: 10 },
  cardId: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  notes: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  rejectBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderRadius: 10, paddingVertical: 9 },
  rejectBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  approveBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, paddingVertical: 9 },
  approveBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  eventIcon: { justifyContent: "center" },
  eventIconInner: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  eventTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  eventCat: { fontSize: 12, fontFamily: "Inter_400Regular" },
  deleteBtn: { borderRadius: 8, padding: 8, alignItems: "center", justifyContent: "center" },
  blockedRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  blockedDate: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  blockedReason: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  datePickerModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  datePickerCard: { borderRadius: 24, borderWidth: 1, padding: 24, gap: 16, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  datePickerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },
  datePickerActions: { flexDirection: "row", gap: 12 },
  datePickerCancel: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  datePickerConfirm: { flex: 2, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  pickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  catList: { borderRadius: 14, borderWidth: 1, overflow: "hidden", marginTop: -8 },
  catItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1 },
});
