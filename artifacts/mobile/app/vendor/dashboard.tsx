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
  useUpdateEvent,
  useUpdateMyVendor,
  type FreeEntryRulesGendersItem,
  type FreeEntryRulesDaysItem,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
import { LocationPicker } from "@/components/LocationPicker";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type DashTab = "bookings" | "events" | "profile" | "calendar" | "managers" | "analytics" | "announcements" | "leads";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:   { bg: "#f59e0b20", text: "#f59e0b" },
  confirmed: { bg: "#22c55e20", text: "#22c55e" },
  cancelled: { bg: "#ef444420", text: "#ef4444" },
  completed: { bg: "#6366f120", text: "#6366f1" },
};

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const VALID_API_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WEEKEND_DAYS = ["Sat", "Sun"];

const DAY_FULL_NAMES: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
  Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

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

interface FreeEntryRules {
  enabled: boolean;
  genders: FreeEntryRulesGendersItem[];
  days: FreeEntryRulesDaysItem[];
  beforeTime?: string;
}

interface VendorEvent {
  id: number;
  title: string;
  description: string;
  category: string;
  location: string;
  price: number;
  capacity: number;
  imageUrl: string;
  freeEntryRules?: FreeEntryRules | null;
}

// ─── Image upload helper ──────────────────────────────────────────────────────

async function requestPresignedUrl(name: string, size: number, contentType: string) {
  return customFetch<{ uploadURL: string; objectPath: string }>(
    "/api/storage/uploads/request-url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, size, contentType }),
    },
  );
}

async function uploadImageToStorage(localUri: string): Promise<string> {
  const filename = localUri.split("/").pop() ?? "image.jpg";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  };
  const contentType = mimeMap[ext] ?? "image/jpeg";

  // Fetch the file as a blob
  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
  const size = blob.size || 1;

  // Get presigned URL from our API
  const { uploadURL, objectPath } = await requestPresignedUrl(filename, size, contentType);

  // PUT the file directly to storage
  await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  // Construct the serving URL
  const pathAfterObjects = objectPath.replace(/^\/objects\//, "");
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return `https://${domain}/api/storage/objects/${pathAfterObjects}`;
}

// ─── Event form state shape ───────────────────────────────────────────────────

interface EventFormState {
  title: string;
  description: string;
  category: string;
  location: string;
  price: string;
  capacity: string;
  imageUrl: string;
  imageUri: string;  // local URI for preview before upload
  freeEntryEnabled: boolean;
  freeEntryGenders: FreeEntryRulesGendersItem[];
  freeEntryDays: FreeEntryRulesDaysItem[];
  freeEntryBeforeTime: string;
}

const DEFAULT_EVENT_FORM: EventFormState = {
  title: "", description: "", category: EVENT_CATEGORIES[0]!,
  location: "", price: "", capacity: "", imageUrl: "", imageUri: "",
  freeEntryEnabled: false, freeEntryGenders: [], freeEntryDays: [], freeEntryBeforeTime: "",
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function VendorDashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<DashTab>("bookings");
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const isVendorOrAdmin = user?.role === "vendor" || user?.role === "admin";

  // ─── Data hooks ─────────────────────────────────────────────────────────────
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

  // ─── Create event ────────────────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<EventFormState>({ ...DEFAULT_EVENT_FORM });
  const [showCreateCatPicker, setShowCreateCatPicker] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  const createEventMut = useCreateEvent({
    mutation: {
      onSuccess: () => {
        eventsQ.refetch();
        setShowCreateModal(false);
        setCreateForm({ ...DEFAULT_EVENT_FORM });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onError: () => Alert.alert("Error", "Failed to create listing. Please try again."),
    },
  });

  async function pickEventImage(
    setter: React.Dispatch<React.SetStateAction<EventFormState>>,
  ) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow photo access to add an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setter((prev) => ({ ...prev, imageUri: asset.uri, imageUrl: "" }));

    setImageUploading(true);
    try {
      const url = await uploadImageToStorage(asset.uri);
      setter((prev) => ({ ...prev, imageUrl: url }));
    } catch (e) {
      Alert.alert("Upload failed", "Could not upload image. You can still create the listing without one.");
      setter((prev) => ({ ...prev, imageUri: "", imageUrl: "" }));
    } finally {
      setImageUploading(false);
    }
  }

  function submitCreateEvent() {
    const price = parseFloat(createForm.price);
    const capacity = parseInt(createForm.capacity, 10);
    if (!createForm.title.trim() || !createForm.description.trim() || !createForm.location.trim()) {
      Alert.alert("Missing fields", "Title, description and location are required.");
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
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        category: createForm.category,
        location: createForm.location.trim(),
        price,
        capacity,
        ...(createForm.imageUrl ? { imageUrl: createForm.imageUrl } : {}),
        ...(createForm.category === "Pubs" ? {
          freeEntryRules: {
            enabled: createForm.freeEntryEnabled,
            genders: createForm.freeEntryGenders,
            days: createForm.freeEntryDays,
            ...(createForm.freeEntryBeforeTime ? { beforeTime: createForm.freeEntryBeforeTime } : {}),
          },
        } : {}),
      },
    });
  }

  // ─── Edit event ──────────────────────────────────────────────────────────────
  const [editingEvent, setEditingEvent] = useState<null | { id: number }>(null);
  const [editForm, setEditForm] = useState<EventFormState>({ ...DEFAULT_EVENT_FORM });
  const [showEditCatPicker, setShowEditCatPicker] = useState(false);
  const [editImageUploading, setEditImageUploading] = useState(false);

  const updateEventMut = useUpdateEvent({
    mutation: {
      onSuccess: () => {
        eventsQ.refetch();
        setEditingEvent(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onError: () => Alert.alert("Error", "Failed to save changes. Please try again."),
    },
  });

  function openEditModal(event: VendorEvent) {
    const fer = event.freeEntryRules;
    setEditForm({
      title: event.title,
      description: event.description,
      category: event.category,
      location: event.location,
      price: String(event.price),
      capacity: String(event.capacity),
      imageUrl: event.imageUrl,
      imageUri: event.imageUrl,
      freeEntryEnabled: !!(fer?.enabled),
      freeEntryGenders: fer?.genders ?? [],
      freeEntryDays: fer?.days ?? [],
      freeEntryBeforeTime: fer?.beforeTime ?? "",
    });
    setShowEditCatPicker(false);
    setEditingEvent({ id: event.id });
  }

  function submitEditEvent() {
    if (!editingEvent) return;
    const price = parseFloat(editForm.price);
    const capacity = parseInt(editForm.capacity, 10);
    if (!editForm.title.trim() || !editForm.description.trim() || !editForm.location.trim()) {
      Alert.alert("Missing fields", "Title, description and location are required.");
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
    updateEventMut.mutate({
      eventId: editingEvent.id,
      data: {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        category: editForm.category,
        location: editForm.location.trim(),
        price,
        capacity,
        imageUrl: editForm.imageUrl || undefined,
        freeEntryRules: editForm.category === "Pubs" ? {
          enabled: editForm.freeEntryEnabled,
          genders: editForm.freeEntryGenders,
          days: editForm.freeEntryDays,
          ...(editForm.freeEntryBeforeTime ? { beforeTime: editForm.freeEntryBeforeTime } : {}),
        } : null,
      },
    });
  }

  // ─── Delete event ────────────────────────────────────────────────────────────
  const deleteEventMut = useDeleteEvent({
    mutation: {
      onSuccess: () => eventsQ.refetch(),
      onError: () => Alert.alert("Error", "Failed to delete listing. Please try again."),
    },
  });

  // ─── Profile tab ─────────────────────────────────────────────────────────────
  const [profName, setProfName] = useState("");
  const [profDesc, setProfDesc] = useState("");
  const [profCategory, setProfCategory] = useState("");
  const [profPhone, setProfPhone] = useState("");
  const [profLocation, setProfLocation] = useState({ country: "India", state: "", city: "" });
  const [profOpenDays, setProfOpenDays] = useState<string[]>([...ALL_DAYS]);
  const [profDayTimes, setProfDayTimes] = useState<Record<string, { open: string; close: string }>>({});
  const [profAddress, setProfAddress] = useState("");
  const [profAddressQuery, setProfAddressQuery] = useState("");
  const [addrSuggestions, setAddrSuggestions] = useState<{ place_id: string; description: string; types: string[] }[]>([]);
  const [showAddrSugg, setShowAddrSugg] = useState(false);
  const addrDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeDayPicker, setActiveDayPicker] = useState<{ day: string; field: "open" | "close" } | null>(null);
  const [pickerTimeDate, setPickerTimeDate] = useState<Date>(() => { const d = new Date(); d.setHours(18, 0, 0, 0); return d; });
  const [dayHoursErrors, setDayHoursErrors] = useState<Record<string, string>>({});
  const [profCatPickerOpen, setProfCatPickerOpen] = useState(false);
  const [profSaving, setProfSaving] = useState(false);

  const updateVendorMut = useUpdateMyVendor({
    mutation: { onSuccess: () => vendorQuery.refetch() },
  });

  useEffect(() => {
    if (vendor) {
      setProfName(vendor.businessName ?? "");
      setProfDesc(vendor.description ?? "");
      setProfCategory(vendor.category ?? "");
      setProfLocation({
        country: vendor.country || "India",
        state: vendor.state ?? "",
        city: vendor.city ?? "",
      });
      setProfOpenDays(
        Array.isArray(vendor.openDays) && vendor.openDays.length > 0
          ? vendor.openDays
          : [...ALL_DAYS],
      );
      const dh = vendor.dayHours;
      if (dh && typeof dh === "object") {
        const times: Record<string, { open: string; close: string }> = {};
        for (const [day, val] of Object.entries(dh as Record<string, unknown>)) {
          if (val && typeof val === "object" && "open" in val && "close" in val) {
            const entry = val as { open: unknown; close: unknown };
            times[day] = { open: String(entry.open), close: String(entry.close) };
          }
        }
        setProfDayTimes(times);
        const initialErrors: Record<string, string> = {};
        for (const [day, t] of Object.entries(times)) {
          if (t.open && t.close && t.open === t.close) {
            initialErrors[day] = "Opening and closing time cannot be the same";
          }
        }
        setDayHoursErrors(initialErrors);
      }
      setProfAddress(vendor.address ?? "");
      setProfAddressQuery(vendor.address ?? "");
    }
  }, [vendor?.id]);

  useEffect(() => {
    if (user) setProfPhone(user.phone ?? "");
  }, [user?.id]);

  async function saveProfile() {
    const firstHoursError = profOpenDays
      .filter((d) => VALID_API_DAYS.includes(d))
      .map((d) => dayHoursErrors[d])
      .find(Boolean);
    if (firstHoursError) {
      Alert.alert("Fix opening hours", firstHoursError);
      return;
    }
    setProfSaving(true);
    try {
      await updateVendorMut.mutateAsync({
        data: {
          businessName: profName.trim(),
          description: profDesc.trim(),
          category: profCategory || vendor?.category || "Cultural",
          location: `${profLocation.city}${profLocation.state ? ", " + profLocation.state : ""}`,
          country: profLocation.country.trim() || "India",
          state: profLocation.state.trim(),
          city: profLocation.city.trim(),
          bannerImage: vendor?.bannerImage ?? "",
          portfolioImages: vendor?.portfolioImages ?? [],
        },
      });
      const dayHoursPayload: Record<string, { open: string; close: string }> = {};
      for (const day of profOpenDays.filter((d) => VALID_API_DAYS.includes(d))) {
        dayHoursPayload[day] = { open: profDayTimes[day]?.open ?? "", close: profDayTimes[day]?.close ?? "" };
      }
      await customFetch("/api/partner/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: profLocation.city.trim(),
          state: profLocation.state.trim(),
          country: profLocation.country.trim() || "India",
          address: profAddress.trim() || null,
          openDays: profOpenDays.filter((d) => VALID_API_DAYS.includes(d)),
          dayHours: dayHoursPayload,
        }),
      });
      if (profPhone.trim()) {
        await customFetch("/api/users/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: profPhone.trim() }),
        });
        await updateUser({ phone: profPhone.trim() });
      }
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

  function copyHours(sourceDay: string, targets: string[]) {
    const src = profDayTimes[sourceDay];
    if (!src?.open && !src?.close) return;
    setProfDayTimes((prev) => {
      const next = { ...prev };
      for (const d of targets) {
        if (d !== sourceDay && profOpenDays.includes(d)) {
          next[d] = { open: src.open ?? "", close: src.close ?? "" };
        }
      }
      return next;
    });
    setDayHoursErrors((prev) => {
      const next = { ...prev };
      const err = checkDayError(src.open ?? "", src.close ?? "");
      for (const d of targets) {
        if (d !== sourceDay && profOpenDays.includes(d)) next[d] = err;
      }
      return next;
    });
  }

  function formatHHMM(date: Date): string {
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  }

  function displayTime(timeStr: string): string {
    if (!timeStr) return "Set time";
    const [h, m] = timeStr.split(":").map(Number);
    if (h === undefined || m === undefined || isNaN(h) || isNaN(m)) return "Set time";
    const d = new Date(); d.setHours(h, m);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  }

  function searchAddress(q: string) {
    if (addrDebounceRef.current) clearTimeout(addrDebounceRef.current);
    if (q.trim().length < 3) { setAddrSuggestions([]); setShowAddrSugg(false); return; }
    addrDebounceRef.current = setTimeout(async () => {
      try {
        const data: { place_id: string; description: string; types: string[] }[] = await customFetch(
          `/api/places/autocomplete?q=${encodeURIComponent(q)}`
        );
        setAddrSuggestions(data);
        setShowAddrSugg(data.length > 0);
      } catch { setAddrSuggestions([]); }
    }, 400);
  }

  function openDayTimePicker(day: string, field: "open" | "close") {
    const timeStr = profDayTimes[day]?.[field] ?? "";
    if (timeStr) {
      const [h, m] = timeStr.split(":").map(Number);
      const d = new Date(); d.setHours(h ?? 18, m ?? 0, 0, 0);
      setPickerTimeDate(d);
    } else {
      const d = new Date(); d.setHours(field === "open" ? 18 : 2, 0, 0, 0);
      setPickerTimeDate(d);
    }
    setActiveDayPicker({ day, field });
  }

  function checkDayError(open: string, close: string): string {
    if (!open || !close) return "";
    if (open === close) return "Opening and closing time cannot be the same";
    return "";
  }

  function confirmDayTimePicker(d: Date) {
    if (!activeDayPicker) return;
    const timeStr = formatHHMM(d);
    const { day, field } = activeDayPicker;
    setProfDayTimes((prev) => {
      const updated = {
        ...prev,
        [day]: {
          open: prev[day]?.open ?? "",
          close: prev[day]?.close ?? "",
          [field]: timeStr,
        },
      };
      const { open, close } = updated[day]!;
      const err = checkDayError(open, close);
      setDayHoursErrors((e) => ({ ...e, [day]: err }));
      return updated;
    });
    setActiveDayPicker(null);
  }

  // ─── Calendar tab ─────────────────────────────────────────────────────────────
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

  // ─── Guard ───────────────────────────────────────────────────────────────────
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

  // ─── Reusable event form ─────────────────────────────────────────────────────
  function EventFormFields({
    form,
    setForm,
    showCatPicker,
    setShowCatPicker,
    uploadingImage,
    onPickImage,
  }: {
    form: EventFormState;
    setForm: React.Dispatch<React.SetStateAction<EventFormState>>;
    showCatPicker: boolean;
    setShowCatPicker: (v: boolean) => void;
    uploadingImage: boolean;
    onPickImage: () => void;
  }) {
    return (
      <>
        {/* Image picker */}
        <TouchableOpacity
          style={[styles.imagePicker, { borderColor: colors.border, backgroundColor: colors.card }]}
          onPress={onPickImage}
          disabled={uploadingImage}
        >
          {form.imageUri || form.imageUrl ? (
            <View style={styles.imagePreviewWrapper}>
              <Image
                source={{ uri: form.imageUri || form.imageUrl }}
                style={styles.imagePreview}
                resizeMode="cover"
              />
              {uploadingImage && (
                <View style={styles.imageOverlay}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.imageOverlayText}>Uploading…</Text>
                </View>
              )}
              {!uploadingImage && (
                <View style={[styles.imageChangeChip, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
                  <Ionicons name="camera-outline" size={14} color="#fff" />
                  <Text style={styles.imageChangeText}>Change</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.imagePickerEmpty}>
              {uploadingImage ? (
                <>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.imagePickerHint, { color: colors.mutedForeground }]}>Uploading image…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="image-outline" size={32} color={colors.mutedForeground} />
                  <Text style={[styles.imagePickerHint, { color: colors.mutedForeground }]}>
                    Tap to add a cover image
                  </Text>
                </>
              )}
            </View>
          )}
        </TouchableOpacity>

        <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Title *</Text>
          <TextInput
            style={[styles.fieldInput, { color: colors.foreground }]}
            value={form.title}
            onChangeText={(v) => setForm((p) => ({ ...p, title: v }))}
            placeholder="Event or venue name"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Category</Text>
          <TouchableOpacity
            onPress={() => setShowCatPicker(!showCatPicker)}
            style={styles.pickerRow}
          >
            <Text style={[styles.fieldInput, { color: colors.foreground }]}>{form.category}</Text>
            <Ionicons name={showCatPicker ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {showCatPicker ? (
          <View style={[styles.catList, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {EVENT_CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.catItem, { borderBottomColor: colors.border }]}
                onPress={() => { setForm((p) => ({ ...p, category: c })); setShowCatPicker(false); }}
              >
                <Text style={{ color: c === form.category ? colors.primary : colors.foreground, fontFamily: "Inter_500Medium", fontSize: 14 }}>{c}</Text>
                {c === form.category ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description *</Text>
          <TextInput
            style={[styles.fieldInput, styles.textArea, { color: colors.foreground }]}
            value={form.description}
            onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
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
            value={form.location}
            onChangeText={(v) => setForm((p) => ({ ...p, location: v }))}
            placeholder="e.g. Bandra, Mumbai"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={[styles.field, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Price (₹)</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground }]}
              value={form.price}
              onChangeText={(v) => setForm((p) => ({ ...p, price: v }))}
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
            />
          </View>
          <View style={[styles.field, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Capacity</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground }]}
              value={form.capacity}
              onChangeText={(v) => setForm((p) => ({ ...p, capacity: v }))}
              placeholder="50"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
            />
          </View>
        </View>

        {form.category === "Pubs" && (
          <View style={[styles.freeEntrySection, { borderColor: "#22c55e30", backgroundColor: "#22c55e08" }]}>
            <TouchableOpacity
              style={styles.freeEntryToggleRow}
              onPress={() => setForm((p) => ({ ...p, freeEntryEnabled: !p.freeEntryEnabled }))}
              activeOpacity={0.75}
            >
              <View style={[styles.freeEntryCheckbox, { borderColor: form.freeEntryEnabled ? "#22c55e" : colors.border, backgroundColor: form.freeEntryEnabled ? "#22c55e" : "transparent" }]}>
                {form.freeEntryEnabled ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
              </View>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#22c55e" }}>Free Entry Available</Text>
            </TouchableOpacity>

            {form.freeEntryEnabled && (
              <>
                <Text style={[styles.freeEntrySubLabel, { color: colors.mutedForeground }]}>Free for which genders?</Text>
                <View style={styles.chipRow}>
                  {(["Everyone", "Ladies", "Men", "Couples"] as const).map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[styles.chip, {
                        borderColor: form.freeEntryGenders.includes(g) ? "#22c55e" : colors.border,
                        backgroundColor: form.freeEntryGenders.includes(g) ? "#22c55e20" : colors.card,
                      }]}
                      onPress={() => setForm((p) => ({
                        ...p,
                        freeEntryGenders: p.freeEntryGenders.includes(g)
                          ? p.freeEntryGenders.filter((x) => x !== g)
                          : [...p.freeEntryGenders, g],
                      }))}
                    >
                      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: form.freeEntryGenders.includes(g) ? "#22c55e" : colors.mutedForeground }}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.freeEntrySubLabel, { color: colors.mutedForeground }]}>Valid on which days?</Text>
                <View style={styles.chipRow}>
                  {(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const).map((d) => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.chip, {
                        borderColor: form.freeEntryDays.includes(d) ? "#22c55e" : colors.border,
                        backgroundColor: form.freeEntryDays.includes(d) ? "#22c55e20" : colors.card,
                      }]}
                      onPress={() => setForm((p) => ({
                        ...p,
                        freeEntryDays: p.freeEntryDays.includes(d)
                          ? p.freeEntryDays.filter((x) => x !== d)
                          : [...p.freeEntryDays, d],
                      }))}
                    >
                      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: form.freeEntryDays.includes(d) ? "#22c55e" : colors.mutedForeground }}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.freeEntrySubLabel, { color: colors.mutedForeground }]}>Before time (optional, 24-hour format)</Text>
                <TextInput
                  style={[styles.fieldInput, { color: colors.foreground, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }]}
                  value={form.freeEntryBeforeTime}
                  onChangeText={(v) => setForm((p) => ({ ...p, freeEntryBeforeTime: v }))}
                  placeholder="e.g. 22:00"
                  placeholderTextColor={colors.mutedForeground}
                />
              </>
            )}
          </View>
        )}
      </>
    );
  }

  // ─── TAB RENDERERS ────────────────────────────────────────────────────────────

  function renderBookings() {
    if (bookingsQ.isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />;
    if (allBookings.length === 0) return (
      <EmptyState icon="ticket-outline" title="No bookings yet" subtitle="Customer booking requests will appear here" />
    );
    return (
      <FlatList
        data={allBookings}
        keyExtractor={(b) => String(b.id)}
        contentContainerStyle={[styles.list, { paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }]}
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
    const hasPub = evList.some((e: any) => e.type === "pub");
    return (
      <FlatList
        data={evList}
        keyExtractor={(e) => String(e.id)}
        ListEmptyComponent={
          <EmptyState icon="calendar-outline" title="No listings yet" subtitle="Create your first event or pub listing" />
        }
        contentContainerStyle={[styles.list, { paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }]}
        onRefresh={eventsQ.refetch}
        refreshing={eventsQ.isLoading}
        ListHeaderComponent={
          !hasPub ? (
            <TouchableOpacity
              style={[styles.createBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setCreateForm({ ...DEFAULT_EVENT_FORM }); setShowCreateCatPicker(false); setShowCreateModal(true); }}
            >
              <Ionicons name="add" size={18} color={colors.primaryForeground} />
              <Text style={[styles.createBtnText, { color: colors.primaryForeground }]}>New Listing</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.createBtn, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border, flexDirection: "column", alignItems: "flex-start", gap: 2 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={[styles.createBtnText, { color: colors.foreground }]}>Pub already registered</Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", paddingLeft: 26 }}>Delete your existing pub to create a new listing.</Text>
            </View>
          )
        }
        renderItem={({ item: e }) => (
          <View style={[styles.eventRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Thumbnail */}
            {e.imageUrl ? (
              <Image source={{ uri: e.imageUrl }} style={styles.eventThumb} resizeMode="cover" />
            ) : (
              <View style={[styles.eventThumb, styles.eventThumbEmpty, { backgroundColor: colors.muted }]}>
                <Ionicons name="calendar" size={18} color={colors.primary} />
              </View>
            )}
            <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push(`/event/${e.id}`)}>
              <Text style={[styles.eventTitle, { color: colors.foreground }]} numberOfLines={1}>{e.title}</Text>
              <Text style={[styles.eventCat, { color: colors.mutedForeground }]}>{e.category}</Text>
            </TouchableOpacity>
            <View style={[styles.badge, { backgroundColor: e.approvalStatus === "approved" ? "#22c55e20" : "#f59e0b20" }]}>
              <Text style={[styles.badgeText, { color: e.approvalStatus === "approved" ? "#22c55e" : "#f59e0b" }]}>
                {e.approvalStatus}
              </Text>
            </View>
            {/* Edit button */}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.muted }]}
              onPress={() => openEditModal(e)}
            >
              <Ionicons name="pencil-outline" size={15} color={colors.foreground} />
            </TouchableOpacity>
            {/* Delete button */}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.destructive + "20" }]}
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
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Category *</Text>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              onPress={() => setProfCatPickerOpen((v) => !v)}
            >
              <Text style={[styles.fieldInput, { color: profCategory ? colors.foreground : colors.mutedForeground }]}>
                {profCategory || "Select category"}
              </Text>
              <Ionicons name={profCatPickerOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
            {profCatPickerOpen && (
              <View style={{ marginTop: 8, gap: 4 }}>
                {EVENT_CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => { setProfCategory(c); setProfCatPickerOpen(false); }}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}
                  >
                    <Text style={{ color: c === profCategory ? colors.primary : colors.foreground, fontFamily: "Inter_500Medium", fontSize: 14 }}>{c}</Text>
                    {c === profCategory ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}
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

          <View style={{ paddingHorizontal: 4, gap: 8 }}>
            <LocationPicker value={profLocation} onChange={setProfLocation} />
          </View>

          <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 8 }]}>VENUE ADDRESS</Text>
          <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Address (optional)</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground }]}
              value={profAddressQuery}
              onChangeText={(v) => { setProfAddressQuery(v); setProfAddress(v); searchAddress(v); }}
              placeholder="Start typing venue address…"
              placeholderTextColor={colors.mutedForeground}
            />
            {showAddrSugg && addrSuggestions.length > 0 && (
              <View style={{ marginTop: 4, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
                {addrSuggestions.map((s) => {
                  const isEstablishment = s.types.some((t) =>
                    ["establishment", "point_of_interest", "premise", "lodging", "food", "bar", "restaurant", "night_club", "event_venue"].includes(t)
                  );
                  return (
                    <TouchableOpacity
                      key={s.place_id}
                      style={{ paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.muted, flexDirection: "row", alignItems: "flex-start", gap: 8 }}
                      onPress={() => { setProfAddress(s.description); setProfAddressQuery(s.description); setAddrSuggestions([]); setShowAddrSugg(false); }}
                    >
                      <Ionicons
                        name={isEstablishment ? "business-outline" : "location-outline"}
                        size={14}
                        color={colors.mutedForeground}
                        style={{ marginTop: 1 }}
                      />
                      <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 }} numberOfLines={2}>{s.description}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 8, marginBottom: 4 }]}>OPERATING HOURS</Text>
          {ALL_DAYS.map((day) => {
            const active = profOpenDays.includes(day);
            const dayErr = active ? (dayHoursErrors[day] ?? "") : "";
            const open = profDayTimes[day]?.open ?? "";
            const close = profDayTimes[day]?.close ?? "";
            const crossesMidnight = active && open && close && !dayErr && close < open;
            return (
              <View
                key={day}
                style={{
                  marginBottom: 10,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: dayErr ? "#ef444450" : active ? colors.primary + "40" : colors.border,
                  backgroundColor: active ? colors.card : colors.muted + "60",
                  overflow: "hidden",
                }}
              >
                {/* Day header row — tap anywhere to toggle */}
                <TouchableOpacity
                  onPress={() => toggleDay(day)}
                  activeOpacity={0.7}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 }}
                >
                  <View>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: active ? colors.foreground : colors.mutedForeground }}>
                      {DAY_FULL_NAMES[day]}
                    </Text>
                    {!active && (
                      <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>Closed</Text>
                    )}
                  </View>
                  {/* Toggle switch */}
                  <View style={{ width: 46, height: 26, borderRadius: 13, backgroundColor: active ? colors.primary : colors.border, justifyContent: "center", paddingHorizontal: 3 }}>
                    <View style={{
                      width: 20, height: 20, borderRadius: 10,
                      backgroundColor: "#fff",
                      alignSelf: active ? "flex-end" : "flex-start",
                      shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 3, elevation: 3,
                    }} />
                  </View>
                </TouchableOpacity>

                {/* Time pickers — shown only when active */}
                {active && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.border + "40" }}>
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                      {/* Opens at */}
                      <TouchableOpacity
                        style={{
                          flex: 1, borderRadius: 10, borderWidth: 1,
                          borderColor: dayErr ? "#ef4444" : colors.border,
                          backgroundColor: colors.background,
                          padding: 12,
                        }}
                        onPress={() => openDayTimePicker(day, "open")}
                      >
                        <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Opens at</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Ionicons name="time-outline" size={15} color={dayErr ? "#ef4444" : colors.primary} />
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: open ? colors.foreground : colors.mutedForeground }}>
                            {displayTime(open)}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* Closes at */}
                      <TouchableOpacity
                        style={{
                          flex: 1, borderRadius: 10, borderWidth: 1,
                          borderColor: dayErr ? "#ef4444" : colors.border,
                          backgroundColor: colors.background,
                          padding: 12,
                        }}
                        onPress={() => openDayTimePicker(day, "close")}
                      >
                        <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Closes at</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Ionicons name="time-outline" size={15} color={dayErr ? "#ef4444" : colors.primary} />
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: close ? colors.foreground : colors.mutedForeground }}>
                            {displayTime(close)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>

                    {dayErr ? (
                      <Text style={{ fontSize: 12, color: "#ef4444", fontFamily: "Inter_400Regular", marginTop: 8 }}>{dayErr}</Text>
                    ) : crossesMidnight ? (
                      <Text style={{ fontSize: 12, color: "#f59e0b", fontFamily: "Inter_400Regular", marginTop: 8 }}>↻ Overnight schedule — closes next day</Text>
                    ) : null}
                    {(open || close) && (() => {
                      const otherOpen = profOpenDays.filter((d) => d !== day);
                      const wdTargets = WEEKDAYS.filter((d) => d !== day && profOpenDays.includes(d));
                      const weTargets = WEEKEND_DAYS.filter((d) => d !== day && profOpenDays.includes(d));
                      if (otherOpen.length === 0) return null;
                      return (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
                          <TouchableOpacity onPress={() => copyHours(day, ALL_DAYS)}>
                            <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_400Regular", textDecorationLine: "underline" }}>Copy to all days</Text>
                          </TouchableOpacity>
                          {wdTargets.length > 0 && (
                            <TouchableOpacity onPress={() => copyHours(day, WEEKDAYS)}>
                              <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_400Regular", textDecorationLine: "underline" }}>Copy to weekdays</Text>
                            </TouchableOpacity>
                          )}
                          {weTargets.length > 0 && (
                            <TouchableOpacity onPress={() => copyHours(day, WEEKEND_DAYS)}>
                              <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_400Regular", textDecorationLine: "underline" }}>Copy to weekends</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })()}
                  </View>
                )}
              </View>
            );
          })}

          {/* Per-day time picker modal */}
          {activeDayPicker && (
            Platform.OS === "ios" ? (
              <Modal transparent animationType="slide">
                <View style={styles.datePickerModal}>
                  <View style={[styles.datePickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.datePickerTitle, { color: colors.foreground }]}>
                      {activeDayPicker.day} — {activeDayPicker.field === "open" ? "Opening" : "Closing"} Time
                    </Text>
                    <DateTimePicker
                      value={pickerTimeDate}
                      mode="time"
                      display="spinner"
                      onChange={(_, d) => { if (d) setPickerTimeDate(d); }}
                      themeVariant="dark"
                    />
                    <View style={styles.datePickerActions}>
                      <TouchableOpacity
                        style={[styles.datePickerCancel, { borderColor: colors.border }]}
                        onPress={() => setActiveDayPicker(null)}
                      >
                        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.datePickerConfirm, { backgroundColor: colors.primary }]}
                        onPress={() => confirmDayTimePicker(pickerTimeDate)}
                      >
                        <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>Set Time</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>
            ) : (
              <DateTimePicker
                value={pickerTimeDate}
                mode="time"
                display="default"
                onChange={(_, d) => {
                  if (d) { confirmDayTimePicker(d); }
                  else { setActiveDayPicker(null); }
                }}
              />
            )
          )}

          <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 8 }]}>CONTACT INFO</Text>

          <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Contact Phone</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground }]}
              value={profPhone}
              onChangeText={setProfPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
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
                style={[styles.actionBtn, { backgroundColor: colors.destructive + "20" }]}
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

  // ─── MANAGERS TAB ────────────────────────────────────────────────────────────
  const [mgEmail, setMgEmail] = useState("");
  const [mgInviting, setMgInviting] = useState(false);
  const [mgList, setMgList] = useState<{ id: number; invitedEmail: string; status: string; manager: { name: string } | null }[]>([]);
  const [mgLoading, setMgLoading] = useState(false);

  const fetchMgList = useCallback(() => {
    setMgLoading(true);
    customFetch<{ id: number; invitedEmail: string; status: string; manager: { name: string } | null }[]>("/api/partner/managers")
      .then(setMgList)
      .catch(() => {})
      .finally(() => setMgLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === "managers") fetchMgList();
  }, [activeTab]);

  async function inviteManager() {
    if (!mgEmail.trim()) return;
    setMgInviting(true);
    try {
      await customFetch("/api/partner/managers/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: mgEmail.trim() }),
      });
      Alert.alert("Invitation sent!", `${mgEmail} has been invited as a scanner manager.`);
      setMgEmail("");
      fetchMgList();
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert("Error", err?.message ?? "Failed to send invitation.");
    } finally {
      setMgInviting(false);
    }
  }

  async function removeManager(id: number) {
    try {
      await customFetch(`/api/partner/managers/${id}`, { method: "DELETE" });
      setMgList((prev) => prev.filter((m) => m.id !== id));
    } catch {
      Alert.alert("Error", "Failed to remove manager.");
    }
  }

  function renderManagers() {
    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]}>
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>INVITE A MANAGER</Text>
        <Text style={[{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 12 }]}>
          Managers can scan tickets at your venue. They cannot access bookings or settings.
        </Text>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
          <TextInput
            style={[styles.fieldInput, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground }]}
            value={mgEmail}
            onChangeText={setMgEmail}
            placeholder="manager@example.com"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[{ backgroundColor: colors.primary, paddingHorizontal: 16, borderRadius: 10, alignItems: "center", justifyContent: "center" }, (mgInviting || !mgEmail.trim()) && { opacity: 0.5 }]}
            disabled={mgInviting || !mgEmail.trim()}
            onPress={inviteManager}
          >
            {mgInviting ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Invite</Text>}
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>YOUR MANAGERS</Text>
        {mgLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : mgList.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>No managers yet.</Text>
        ) : (
          mgList.map((m) => (
            <View key={m.id} style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>{m.invitedEmail}</Text>
                {m.manager && <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>{m.manager.name}</Text>}
                <Text style={{ color: m.status === "accepted" ? "#22c55e" : m.status === "rejected" ? "#ef4444" : "#f59e0b", fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 2, textTransform: "capitalize" }}>{m.status}</Text>
              </View>
              <TouchableOpacity onPress={() => Alert.alert("Remove manager?", `Remove ${m.invitedEmail}?`, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => removeManager(m.id) }])}>
                <Ionicons name="trash-outline" size={16} color={colors.destructive} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    );
  }

  // ─── ANALYTICS TAB ───────────────────────────────────────────────────────────
  type AnalyticsResult = {
    totalEarnings: number; monthEarnings: number;
    totalWomen: number; totalMen: number; totalCouple: number;
    perEvent: { eventId: number; eventTitle: string; bookingCount: number; revenue: number }[];
    dailyRevenue: { date: string; revenue: number }[];
  };
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResult | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const fetchAnalytics = useCallback(() => {
    setAnalyticsLoading(true);
    customFetch<AnalyticsResult>("/api/partner/analytics")
      .then((d) => setAnalyticsData(d))
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === "analytics") fetchAnalytics();
  }, [activeTab]);

  function renderAnalytics() {
    if (analyticsLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;
    const a = analyticsData;
    const kpis = [
      { label: "Total Revenue", value: `₹${(a?.totalEarnings ?? 0).toLocaleString("en-IN")}`, icon: "cash-outline" as const, color: colors.primary },
      { label: "This Month", value: `₹${(a?.monthEarnings ?? 0).toLocaleString("en-IN")}`, icon: "trending-up-outline" as const, color: "#22c55e" },
      { label: "Women Tickets", value: String(a?.totalWomen ?? 0), icon: "person-outline" as const, color: "#ec4899" },
      { label: "Men Tickets", value: String(a?.totalMen ?? 0), icon: "person-outline" as const, color: "#3b82f6" },
      { label: "Couple Tickets", value: String(a?.totalCouple ?? 0), icon: "people-outline" as const, color: "#8b5cf6" },
    ];
    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]}>
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>REVENUE OVERVIEW</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {kpis.map((k) => (
            <View key={k.label} style={[{ width: "47%", borderRadius: 14, borderWidth: 1, padding: 14, gap: 6, alignItems: "center" }, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" }, { backgroundColor: k.color + "20" }]}>
                <Ionicons name={k.icon} size={18} color={k.color} />
              </View>
              <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground }}>{k.value}</Text>
              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>{k.label}</Text>
            </View>
          ))}
        </View>
        {(a?.dailyRevenue ?? []).length > 0 && (() => {
          const daily = (a?.dailyRevenue ?? []).slice(-14);
          const max = Math.max(...daily.map((d) => d.revenue), 1);
          return (
            <>
              <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 8 }]}>DAILY REVENUE (LAST 14 DAYS)</Text>
              <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "column", gap: 0, paddingVertical: 12 }]}>
                <View style={{ flexDirection: "row", alignItems: "flex-end", height: 60, gap: 3 }}>
                  {daily.map((d) => (
                    <View key={d.date} style={{ flex: 1, alignItems: "center" }}>
                      <View style={{ width: "80%", height: Math.max(4, Math.round((d.revenue / max) * 56)), backgroundColor: d.revenue > 0 ? colors.primary : colors.muted, borderRadius: 3 }} />
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_400Regular" }}>{daily[0]?.date?.slice(5) ?? ""}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_400Regular" }}>{daily[daily.length - 1]?.date?.slice(5) ?? ""}</Text>
                </View>
              </View>
            </>
          );
        })()}
        {(a?.perEvent ?? []).length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 8 }]}>TOP EVENTS BY REVENUE</Text>
            {(a?.perEvent ?? []).slice(0, 5).map((e, idx) => {
              const maxRev = Math.max(...(a?.perEvent ?? []).map((x) => x.revenue), 1);
              return (
                <View key={e.eventId} style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "column", gap: 4 }]}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={[{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 8 }, { backgroundColor: colors.primary + "20" }]}>
                      <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_700Bold" }}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }} numberOfLines={1}>{e.eventTitle}</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>{e.bookingCount} booking{e.bookingCount !== 1 ? "s" : ""}</Text>
                    </View>
                    <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 15 }}>₹{e.revenue.toLocaleString("en-IN")}</Text>
                  </View>
                  <View style={{ height: 4, backgroundColor: colors.muted, borderRadius: 2 }}>
                    <View style={{ height: 4, width: `${(e.revenue / maxRev) * 100}%`, backgroundColor: colors.primary, borderRadius: 2 }} />
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    );
  }

  // ─── ANNOUNCEMENTS TAB ───────────────────────────────────────────────────────
  interface Announcement {
    id: number;
    title: string;
    body: string;
    announceDate: string;
    announceTime: string;
    imageUrl: string;
    createdAt: string;
  }
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annLoading, setAnnLoading] = useState(false);
  const [showAnnModal, setShowAnnModal] = useState(false);
  const [annForm, setAnnForm] = useState({ title: "", body: "", announceDate: "", announceTime: "" });
  const [annSubmitting, setAnnSubmitting] = useState(false);
  const [editingAnn, setEditingAnn] = useState<Announcement | null>(null);

  const fetchAnnouncements = useCallback(() => {
    setAnnLoading(true);
    customFetch<Announcement[]>("/api/partner/announcements")
      .then(setAnnouncements)
      .catch(() => {})
      .finally(() => setAnnLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === "announcements") fetchAnnouncements();
  }, [activeTab]);

  async function submitAnnouncement() {
    if (!annForm.title.trim()) { Alert.alert("Title required"); return; }
    setAnnSubmitting(true);
    try {
      if (editingAnn) {
        await customFetch(`/api/partner/announcements/${editingAnn.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(annForm),
        });
      } else {
        await customFetch("/api/partner/announcements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(annForm),
        });
      }
      setShowAnnModal(false);
      setEditingAnn(null);
      setAnnForm({ title: "", body: "", announceDate: "", announceTime: "" });
      fetchAnnouncements();
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert("Error", err?.message ?? "Failed to save announcement.");
    } finally {
      setAnnSubmitting(false);
    }
  }

  async function deleteAnnouncement(id: number) {
    try {
      await customFetch(`/api/partner/announcements/${id}`, { method: "DELETE" });
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch {
      Alert.alert("Error", "Failed to delete announcement.");
    }
  }

  function renderAnnouncements() {
    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]}>
        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: colors.primary }]}
          onPress={() => { setEditingAnn(null); setAnnForm({ title: "", body: "", announceDate: "", announceTime: "" }); setShowAnnModal(true); }}
        >
          <Ionicons name="add" size={18} color={colors.primaryForeground} />
          <Text style={[styles.createBtnText, { color: colors.primaryForeground }]}>New Announcement</Text>
        </TouchableOpacity>
        {annLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : announcements.length === 0 ? (
          <View style={{ alignItems: "center", padding: 32, gap: 10 }}>
            <Ionicons name="megaphone-outline" size={40} color={colors.mutedForeground} />
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" }}>
              No announcements yet. Create one to notify your customers.
            </Text>
          </View>
        ) : (
          announcements.map((a) => (
            <View key={a.id} style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 14, flex: 1 }}>{a.title}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity onPress={() => { setEditingAnn(a); setAnnForm({ title: a.title, body: a.body, announceDate: a.announceDate, announceTime: a.announceTime }); setShowAnnModal(true); }}>
                    <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => Alert.alert("Delete?", `Delete "${a.title}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => deleteAnnouncement(a.id) }])}>
                    <Ionicons name="trash-outline" size={16} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              </View>
              {a.body ? <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2 }} numberOfLines={2}>{a.body}</Text> : null}
              {a.announceDate ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                  <Ionicons name="calendar-outline" size={12} color={colors.mutedForeground} />
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>{a.announceDate}{a.announceTime ? ` at ${a.announceTime}` : ""}</Text>
                </View>
              ) : null}
            </View>
          ))
        )}

        {/* Announcement Modal */}
        <Modal visible={showAnnModal} animationType="slide" presentationStyle="pageSheet">
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
              <TouchableOpacity onPress={() => { setShowAnnModal(false); setEditingAnn(null); }}>
                <Ionicons name="close" size={22} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{editingAnn ? "Edit Announcement" : "New Announcement"}</Text>
              <TouchableOpacity onPress={submitAnnouncement} disabled={annSubmitting}>
                {annSubmitting ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Save</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 80 }]}>
              {[
                { label: "Title *", key: "title" as const, placeholder: "Announcement title", multi: false },
                { label: "Message", key: "body" as const, placeholder: "Tell your customers about this...", multi: true },
                { label: "Date (YYYY-MM-DD)", key: "announceDate" as const, placeholder: "e.g. 2025-12-31", multi: false },
                { label: "Time", key: "announceTime" as const, placeholder: "e.g. 20:00", multi: false },
              ].map((f) => (
                <View key={f.key} style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                  <TextInput
                    style={[styles.fieldInput, f.multi && styles.textArea, { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground }]}
                    value={annForm[f.key]}
                    onChangeText={(v) => setAnnForm((p) => ({ ...p, [f.key]: v }))}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    multiline={f.multi}
                    numberOfLines={f.multi ? 4 : 1}
                    textAlignVertical={f.multi ? "top" : "center"}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  // ─── LEADS TAB ────────────────────────────────────────────────────────────────
  interface LeadEntry {
    viewerUserId?: number;
    viewerName?: string;
    viewerEmail?: string;
    viewedAt?: string;
    converted?: boolean;
  }
  type LeadsResult = {
    premium: boolean; crmAccessGranted: boolean; crmTrialActive: boolean; crmTrialDaysRemaining: number; views: LeadEntry[];
  };
  const [leadsData, setLeadsData] = useState<LeadsResult | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(false);

  const fetchLeads = useCallback(() => {
    setLeadsLoading(true);
    customFetch<LeadsResult>("/api/partner/leads/me")
      .then((d) => setLeadsData(d))
      .catch(() => {})
      .finally(() => setLeadsLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === "leads") fetchLeads();
  }, [activeTab]);

  function renderLeads() {
    if (leadsLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;
    if (!leadsData?.crmAccessGranted) {
      return (
        <ScrollView contentContainerStyle={[styles.list, { alignItems: "center", paddingTop: 40 }]}>
          <View style={{ alignItems: "center", gap: 16, padding: 24, maxWidth: 320 }}>
            <View style={[{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" }, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="lock-closed-outline" size={32} color={colors.primary} />
            </View>
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center" }}>CRM Leads</Text>
            <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 21 }}>
              Unlock customer leads & visitor analytics with Partner Premium. See who viewed your venue and convert them into bookings.
            </Text>
            <View style={[{ borderRadius: 14, padding: 16, gap: 8, width: "100%", borderWidth: 1 }, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                "View contact details of people who visited your page",
                "Track repeat visitors vs new leads",
                "See which events drive the most interest",
                "Export leads to CSV",
              ].map((f) => (
                <View key={f} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.primary} style={{ marginTop: 1 }} />
                  <Text style={{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 13, flex: 1 }}>{f}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={[{ borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, flexDirection: "row", gap: 8, alignItems: "center" }, { backgroundColor: colors.primary }]}
              onPress={() => Alert.alert("Upgrade to Premium", "Contact our team at partners@royvento.com to upgrade your account.")}
            >
              <Ionicons name="star-outline" size={16} color={colors.primaryForeground} />
              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Upgrade to Premium</Text>
            </TouchableOpacity>
            {leadsData?.crmTrialActive && (
              <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" }}>
                Trial active · {leadsData.crmTrialDaysRemaining} days remaining
              </Text>
            )}
          </View>
        </ScrollView>
      );
    }

    const views = leadsData?.views ?? [];
    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]}>
        {leadsData?.crmTrialActive && (
          <View style={[{ borderRadius: 12, padding: 12, flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 4, borderWidth: 1 }, { backgroundColor: "#f59e0b18", borderColor: "#f59e0b40" }]}>
            <Ionicons name="time-outline" size={16} color="#f59e0b" />
            <Text style={{ color: "#f59e0b", fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 }}>
              Free trial active · {leadsData.crmTrialDaysRemaining} days remaining
            </Text>
          </View>
        )}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>RECENT LEADS ({views.length})</Text>
        {views.length === 0 ? (
          <View style={{ alignItems: "center", padding: 32, gap: 10 }}>
            <Ionicons name="person-add-outline" size={40} color={colors.mutedForeground} />
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" }}>
              No leads yet. Leads appear when users view your venue page.
            </Text>
          </View>
        ) : (
          views.map((lead, i) => {
            const name = lead.viewerName ?? "Anonymous";
            const email = lead.viewerEmail ?? "";
            const initial = name.length > 0 ? name.charAt(0).toUpperCase() : "?";
            const converted = lead.converted ?? false;
            return (
              <View key={i} style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 10 }]}>
                <View style={[{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }, { backgroundColor: colors.primary + "20" }]}>
                  <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 13 }}>{initial}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{name}</Text>
                  {email ? <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>{email}</Text> : null}
                  {lead.viewedAt ? <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 1 }}>{new Date(lead.viewedAt).toLocaleDateString("en-IN")}</Text> : null}
                </View>
                <View style={[{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 }, converted ? { backgroundColor: "#22c55e18", borderColor: "#22c55e40" } : { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Text style={{ color: converted ? "#22c55e" : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{converted ? "Converted" : "View"}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    );
  }

  // ─── MAIN RENDER ─────────────────────────────────────────────────────────────
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

        {/* Tab bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {([
            { key: "bookings",      icon: "ticket-outline",          label: `Bookings${pending.length > 0 ? ` (${pending.length})` : ""}` },
            { key: "events",        icon: "calendar-outline",         label: "My Listings" },
            { key: "analytics",     icon: "bar-chart-outline",        label: "Analytics" },
            { key: "announcements", icon: "megaphone-outline",        label: "Announcements" },
            { key: "leads",         icon: "people-outline",           label: "Leads" },
            { key: "profile",       icon: "person-outline",           label: "Profile" },
            { key: "calendar",      icon: "calendar-clear-outline",   label: "Calendar" },
            { key: "managers",      icon: "person-add-outline",       label: "Managers" },
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
      {activeTab === "bookings"       && renderBookings()}
      {activeTab === "events"         && renderEvents()}
      {activeTab === "analytics"      && renderAnalytics()}
      {activeTab === "announcements"  && renderAnnouncements()}
      {activeTab === "leads"          && renderLeads()}
      {activeTab === "profile"        && renderProfile()}
      {activeTab === "calendar"       && renderCalendar()}
      {activeTab === "managers"       && renderManagers()}

      {/* ── Create Event Modal ── */}
      <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <TouchableOpacity onPress={() => { setShowCreateModal(false); setCreateForm({ ...DEFAULT_EVENT_FORM }); }}>
              <Ionicons name="close" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Listing</Text>
            <TouchableOpacity onPress={submitCreateEvent} disabled={createEventMut.isPending || imageUploading}>
              {createEventMut.isPending
                ? <ActivityIndicator color={colors.primary} size="small" />
                : <Text style={{ color: imageUploading ? colors.mutedForeground : colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
                    {imageUploading ? "Uploading…" : "Create"}
                  </Text>
              }
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 80 }]}>
              <EventFormFields
                form={createForm}
                setForm={setCreateForm}
                showCatPicker={showCreateCatPicker}
                setShowCatPicker={setShowCreateCatPicker}
                uploadingImage={imageUploading}
                onPickImage={() => pickEventImage(setCreateForm)}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Edit Event Modal ── */}
      <Modal visible={!!editingEvent} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <TouchableOpacity onPress={() => setEditingEvent(null)}>
              <Ionicons name="close" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Listing</Text>
            <TouchableOpacity onPress={submitEditEvent} disabled={updateEventMut.isPending || editImageUploading}>
              {updateEventMut.isPending
                ? <ActivityIndicator color={colors.primary} size="small" />
                : <Text style={{ color: editImageUploading ? colors.mutedForeground : colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
                    {editImageUploading ? "Uploading…" : "Save"}
                  </Text>
              }
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 80 }]}>
              <EventFormFields
                form={editForm}
                setForm={setEditForm}
                showCatPicker={showEditCatPicker}
                setShowCatPicker={setShowEditCatPicker}
                uploadingImage={editImageUploading}
                onPickImage={async () => {
                  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                  if (status !== "granted") {
                    Alert.alert("Permission needed", "Please allow photo access to add an image.");
                    return;
                  }
                  const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ["images"],
                    allowsEditing: true,
                    aspect: [16, 9],
                    quality: 0.8,
                  });
                  if (result.canceled || !result.assets[0]) return;
                  const asset = result.assets[0]!;
                  setEditForm((p) => ({ ...p, imageUri: asset.uri, imageUrl: "" }));
                  setEditImageUploading(true);
                  try {
                    const url = await uploadImageToStorage(asset.uri);
                    setEditForm((p) => ({ ...p, imageUrl: url }));
                  } catch {
                    Alert.alert("Upload failed", "Could not upload image.");
                    setEditForm((p) => ({ ...p, imageUri: "", imageUrl: "" }));
                  } finally {
                    setEditImageUploading(false);
                  }
                }}
              />
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
  hoursRow: { flexDirection: "row", gap: 12 },
  timeBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, marginTop: 4 },
  timeBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
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
  eventRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, padding: 12 },
  eventThumb: { width: 48, height: 48, borderRadius: 10 },
  eventThumbEmpty: { alignItems: "center", justifyContent: "center" },
  eventTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  eventCat: { fontSize: 12, fontFamily: "Inter_400Regular" },
  actionBtn: { borderRadius: 8, padding: 8, alignItems: "center", justifyContent: "center" },
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
  imagePicker: { borderRadius: 14, borderWidth: 1, borderStyle: "dashed", overflow: "hidden", minHeight: 140 },
  imagePickerEmpty: { alignItems: "center", justifyContent: "center", gap: 8, padding: 24, minHeight: 140 },
  imagePickerHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  imagePreviewWrapper: { position: "relative" },
  imagePreview: { width: "100%", height: 180 },
  imageOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", gap: 8 },
  imageOverlayText: { color: "#fff", fontFamily: "Inter_500Medium", fontSize: 13 },
  imageChangeChip: { position: "absolute", bottom: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  imageChangeText: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
  freeEntrySection: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  freeEntryToggleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  freeEntryCheckbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  freeEntrySubLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
});
