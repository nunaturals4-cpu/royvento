import { resolveImageUrl } from "@/lib/resolveImageUrl";
import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { BookingFiltersBar, type BookingFilters } from "@/components/BookingFiltersBar";
import { BookingDetailModal } from "@/components/BookingDetailModal";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useColors } from "@/hooks/useColors";
import { uploadImageToStorage } from "@/lib/uploadImage";

// ── Event Organizer dashboard (mobile) ───────────────────────────────────────
// Mirror of the web /dashboard/organizer page. Tabs: Overview · Events (create/
// edit + ticket tiers) · Bookings · Coupons · Managers · Earnings · Scanner ·
// Profile. All calls hit the same /api/organizer/* endpoints the web uses.

type Pal = ReturnType<typeof useColors>;

interface Organizer {
  id: number; name: string; slug: string; description: string;
  logoUrl: string; coverImageUrl: string; website: string;
  instagram: string; facebook: string; youtube: string;
  supportEmail: string; supportPhone: string; city: string; state: string;
  verified: boolean; status: string;
}
interface Artist { name: string; role: string; imageUrl: string; bio: string; socials: string; }
interface ScheduleItem { time: string; title: string; desc: string; }
interface Policies { dressCode: string; entryRules: string; agePolicy: string; refundPolicy: string; cancellationPolicy: string; }
interface Faq { q: string; a: string; }
interface OrganizerEvent {
  id: number; title: string; slug: string; category: string; subcategory: string; shortDescription: string; description: string;
  tags: string[]; coverImageUrl: string; bannerUrl: string; mobileBannerUrl: string; galleryImages: string[]; promoVideos: string[];
  venueName: string; address: string; mapsUrl: string; country: string; city: string; state: string;
  startDate: string | null; endDate: string | null; startTime: string; endTime: string; isMultiDay: boolean;
  happeningTonight?: boolean; startingSoon?: boolean; lastMinuteDeal?: boolean; dealLabel?: string;
  artists: Artist[] | null; highlights: string[] | null; schedule: ScheduleItem[] | null;
  policies: Policies | null; faqs: Faq[] | null;
  capacity: number; ageRestriction: string; language: string; approvalStatus: string; rejectionReason: string;
  venueId?: number | null; venueApprovalStatus?: string; venueRejectionReason?: string;
}
interface TicketTier {
  id: number; type: string; name: string; description: string; price: string;
  quantity: number; soldCount: number; bookingLimit: number; active: boolean;
}
interface Analytics {
  totals: { bookings: number; tickets: number; revenue: string; attended: number; attendanceRate: number };
  perEvent: { id: number; title: string; bookings: number; tickets: number; revenue: string; attended: number }[];
  byTicketType: { ticketType: string; tickets: number; revenue: string }[];
}
interface BookingRow {
  id: number; createdAt: string; bookingDate: string; quantity: number; amount: string;
  checkedIn: boolean; attendee: string; phone: string; email: string; eventTitle: string; ticketType: string;
  bookingLocation?: string; status?: string; paymentMethod?: string; arrivalTime?: string | null;
}
interface LeadView {
  viewerUserId: number | null; viewerName: string; viewerEmail: string; phone: string;
  visitCount: number; lastViewedAt: string; hasBooked: boolean;
}
interface LeadsPayload { totalViews: number; bookedCount: number; views: LeadView[]; }
interface AdRequest { id: number; status: string; note: string; adminNote: string; createdAt: string; eventTitle: string; featured: boolean; }
interface Coupon {
  id: number; code: string; discountType: string; discountValue: string; eventId: number | null;
  active: boolean; maxUses: number | null; usedCount: number; expiresAt: string | null;
}
interface ManagerRow {
  id: number; invitedEmail: string; status: string;
  permissions: { scan: boolean; attendance: boolean; reports: boolean };
  manager: { id: number; name: string; email: string } | null;
}
interface RevenuePayload {
  events: { id: number; title: string; commissionPct: string; ticketsSold: number; attended: number; revenue: string; commission: string; net: string }[];
  totals: { revenue: string; commission: string; gatewayFee: string; net: string };
  commissionOwed: string;
}
interface BankingPayload {
  banking: { accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string } | null;
  settlements: { id: number; amount: string; status: string; adminNote: string; createdAt: string }[];
  commissionOwed: string;
}

const EVENT_CATEGORIES = ["Ladies Night", "DJ Night", "Live Music", "Karaoke", "Theme Party", "Pool Party", "Open Mics", "Standup Shows", "Concert", "Festival", "Sports", "Other"];
const HIGHLIGHT_OPTIONS = ["Free Drinks", "VIP Access", "Complimentary Entry", "Food Included", "Meet & Greet", "Special Benefits"];
const TICKET_TYPES = ["free", "paid", "early_bird", "vip", "couple", "group", "student"];
const EMPTY_POLICIES: Policies = { dressCode: "", entryRules: "", agePolicy: "", refundPolicy: "", cancellationPolicy: "" };

function inr(v: string | number) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
}

const TABS: { key: string; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "overview", label: "Overview", icon: "stats-chart-outline" },
  { key: "events", label: "Events", icon: "calendar-outline" },
  { key: "bookings", label: "Bookings", icon: "ticket-outline" },
  { key: "leads", label: "Leads", icon: "eye-outline" },
  { key: "coupons", label: "Coupons", icon: "pricetag-outline" },
  { key: "promote", label: "Promote", icon: "megaphone-outline" },
  { key: "managers", label: "Managers", icon: "people-outline" },
  { key: "earnings", label: "Earnings", icon: "cash-outline" },
  { key: "scanner", label: "Scanner", icon: "qr-code-outline" },
  { key: "profile", label: "Profile", icon: "settings-outline" },
];

export default function OrganizerDashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  // Notification deep-link (?tab=bookings&bookingId=123) — land on Bookings
  // and auto-open that booking's detail modal exactly once per notification.
  // This lives at the top level (not inside BookingsTab) and reacts to param
  // changes rather than only reading them at mount, because BookingsTab
  // unmounts whenever the organizer switches to another tab — a one-time
  // guard inside it would re-fire (reopening the popup) every time they
  // switch back to Bookings.
  const params = useLocalSearchParams<{ tab?: string; bookingId?: string }>();
  const [tab, setTab] = useState("overview");
  const [detailBookingId, setDetailBookingId] = useState<number | null>(null);
  // Tracks the *value* already consumed (not just a one-time boolean) so
  // that if this screen stays mounted and a second, genuinely new
  // notification arrives later, its popup still opens.
  const consumedBookingIdRef = useRef<string | null>(null);
  useEffect(() => {
    const raw = params.bookingId;
    if (!raw || consumedBookingIdRef.current === raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) return;
    consumedBookingIdRef.current = raw;
    setTab("bookings");
    setDetailBookingId(id);
    // Clear bookingId from this screen's params so a later re-render, back
    // navigation, or the same notification tapped again doesn't re-open the
    // popup — it only reappears for a genuinely new notification.
    router.setParams({ bookingId: "" });
  }, [params.bookingId]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: topPadding + 10, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Event Management</Text>
      </View>

      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <FlatList
          horizontal
          data={TABS}
          keyExtractor={(t) => t.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingVertical: 10 }}
          renderItem={({ item }) => {
            const active = tab === item.key;
            return (
              <Pressable onPress={() => setTab(item.key)}
                style={[styles.tab, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}>
                <Ionicons name={item.icon} size={14} color={active ? colors.primaryForeground : colors.mutedForeground} />
                <Text style={[styles.tabText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      <View style={{ flex: 1 }}>
        {tab === "overview" && <OverviewTab colors={colors} insets={insets} />}
        {tab === "events" && <EventsTab colors={colors} insets={insets} />}
        {tab === "bookings" && <BookingsTab colors={colors} insets={insets} />}
        {tab === "leads" && <LeadsTab colors={colors} insets={insets} />}
        {tab === "coupons" && <CouponsTab colors={colors} insets={insets} />}
        {tab === "promote" && <PromoteTab colors={colors} insets={insets} />}
        {tab === "managers" && <ManagersTab colors={colors} insets={insets} />}
        {tab === "earnings" && <EarningsTab colors={colors} insets={insets} />}
        {tab === "scanner" && <ScannerTab colors={colors} insets={insets} />}
        {tab === "profile" && <ProfileTab colors={colors} insets={insets} />}
      </View>

      <BookingDetailModal bookingId={detailBookingId} role="organizer" onClose={() => setDetailBookingId(null)} />
    </View>
  );
}

function useBottomPad(insets: { bottom: number }) {
  return { paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 };
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function OverviewTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [an, setAn] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    customFetch<Analytics>("/api/organizer/analytics").then(setAn).catch(() => setAn(null)).finally(() => setLoading(false));
  }, []);
  if (loading) return <Centered colors={colors} />;
  const t = an?.totals;
  const cards = [
    { label: "Bookings", value: String(t?.bookings ?? 0), icon: "ticket-outline" as const },
    { label: "Tickets sold", value: String(t?.tickets ?? 0), icon: "people-outline" as const },
    { label: "Revenue", value: inr(t?.revenue ?? 0), icon: "cash-outline" as const },
    { label: "Attended", value: String(t?.attended ?? 0), icon: "checkmark-done-outline" as const },
    { label: "Attendance", value: `${t?.attendanceRate ?? 0}%`, icon: "stats-chart-outline" as const },
  ];
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <View style={styles.statGrid}>
        {cards.map((c) => (
          <View key={c.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name={c.icon} size={20} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.foreground }]}>{c.value}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{c.label}</Text>
          </View>
        ))}
      </View>
      {(an?.byTicketType ?? []).length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Popular ticket types</Text>
          <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border, gap: 8 }]}>
            {an!.byTicketType.map((tt) => (
              <View key={tt.ticketType} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_500Medium" }}>{tt.ticketType}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{tt.tickets} sold · {inr(tt.revenue)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
      {(an?.perEvent ?? []).length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Per event</Text>
          {an!.perEvent.map((e) => (
            <View key={e.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{e.title}</Text>
              <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{e.tickets} tickets · {inr(e.revenue)} · {e.attended} attended</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

// ─── Events ───────────────────────────────────────────────────────────────────
function EventsTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<OrganizerEvent | "new" | null>(null);
  const [ticketsFor, setTicketsFor] = useState<OrganizerEvent | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    customFetch<OrganizerEvent[]>("/api/organizer/events").then(setEvents).catch(() => setEvents([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(id: number) {
    Alert.alert("Delete event?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await customFetch(`/api/organizer/events/${id}`, { method: "DELETE" }); load(); }
        catch (e) { Alert.alert("Delete failed", (e as Error).message); }
      } },
    ]);
  }

  if (editing) return <EventEditor colors={colors} insets={insets} event={editing === "new" ? null : editing} onDone={() => { setEditing(null); load(); }} />;
  if (ticketsFor) return <TicketsEditor colors={colors} insets={insets} event={ticketsFor} onBack={() => setTicketsFor(null)} />;
  if (loading) return <Centered colors={colors} />;

  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <PrimaryBtn colors={colors} label="+ Create event" onPress={() => setEditing("new")} />
      {events.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>No events yet. Create your first event.</Text>
      ) : events.map((e) => (
        <View key={e.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {e.coverImageUrl ? <Image source={{ uri: resolveImageUrl(e.coverImageUrl) }} style={styles.thumb} contentFit="cover" /> : <View style={[styles.thumb, { backgroundColor: colors.muted }]} />}
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{e.title}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <StatusPill colors={colors} status={e.approvalStatus} />
                {!!e.venueId && (
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                    <Ionicons name="location-outline" size={11} color={colors.mutedForeground} />{" "}
                    {e.venueApprovalStatus === "approved" ? "Venue approved" : e.venueApprovalStatus === "rejected" ? "Venue declined" : "Awaiting venue approval"}
                  </Text>
                )}
              </View>
              {e.approvalStatus === "rejected" && !!e.rejectionReason && (
                <Text style={{ color: colors.redLight, fontSize: 11, marginTop: 4 }}>{e.rejectionReason}</Text>
              )}
            </View>
          </View>
          <View style={styles.rowActions}>
            <SmallBtn colors={colors} icon="pricetags-outline" label="Tickets" onPress={() => setTicketsFor(e)} />
            <SmallBtn colors={colors} icon="pencil-outline" label="Edit" onPress={() => setEditing(e)} />
            <SmallBtn colors={colors} icon="trash-outline" label="Delete" danger onPress={() => remove(e.id)} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

interface VenueOption { id: number; businessName: string; category: string; country: string; city: string; state: string; address: string | null; }

function EventEditor({ colors, insets, event, onDone }: { colors: Pal; insets: { bottom: number }; event: OrganizerEvent | null; onDone: () => void }) {
  const isEdit = !!event;
  const [f, setF] = useState({
    title: event?.title ?? "", category: event?.category ?? "Concert", subcategory: event?.subcategory ?? "",
    shortDescription: event?.shortDescription ?? "", description: event?.description ?? "",
    tags: event?.tags ?? ([] as string[]), language: event?.language ?? "", ageRestriction: event?.ageRestriction ?? "",
    coverImageUrl: event?.coverImageUrl ?? "", bannerUrl: event?.bannerUrl ?? "",
    galleryImages: event?.galleryImages ?? ([] as string[]), promoVideos: event?.promoVideos ?? ([] as string[]),
    venueName: event?.venueName ?? "", address: event?.address ?? "", mapsUrl: event?.mapsUrl ?? "",
    country: event?.country ?? "India", city: event?.city ?? "", state: event?.state ?? "",
    capacity: String(event?.capacity ?? ""),
    startDate: event?.startDate ?? "", endDate: event?.endDate ?? "",
    startTime: event?.startTime ?? "", endTime: event?.endTime ?? "", isMultiDay: event?.isMultiDay ?? false,
    happeningTonight: event?.happeningTonight ?? true, startingSoon: event?.startingSoon ?? true,
    lastMinuteDeal: event?.lastMinuteDeal ?? false, dealLabel: event?.dealLabel ?? "",
    artists: event?.artists ?? ([] as Artist[]), highlights: event?.highlights ?? ([] as string[]),
    schedule: event?.schedule ?? ([] as ScheduleItem[]), policies: event?.policies ?? { ...EMPTY_POLICIES },
    faqs: event?.faqs ?? ([] as Faq[]),
    venueId: event?.venueId ?? (null as number | null),
  });
  const [saving, setSaving] = useState(false);
  const upd = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function pickImage(key: "coverImageUrl" | "bannerUrl") {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    try { const url = await uploadImageToStorage(res.assets[0].uri, res.assets[0].mimeType ?? undefined); upd(key, url); }
    catch { Alert.alert("Upload failed"); }
  }
  async function addGalleryImages() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsMultipleSelection: true });
    if (res.canceled || !res.assets.length) return;
    for (const a of res.assets) {
      try { const url = await uploadImageToStorage(a.uri, a.mimeType ?? undefined); setF((p) => ({ ...p, galleryImages: [...p.galleryImages, url] })); }
      catch { Alert.alert("Upload failed"); }
    }
  }

  async function save() {
    if (!f.title.trim()) { Alert.alert("Event name is required"); return; }
    setSaving(true);
    const body = { ...f, capacity: Number(f.capacity) || 0, startDate: f.startDate || null, endDate: f.endDate || null };
    try {
      if (isEdit) await customFetch(`/api/organizer/events/${event!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      else await customFetch("/api/organizer/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      Alert.alert(isEdit ? "Event updated — sent for re-approval" : "Event created", isEdit ? undefined : "Add ticket tiers, then it goes for admin approval.");
      onDone();
    } catch (e) { Alert.alert("Save failed", (e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <BackRow colors={colors} label={isEdit ? "Edit event" : "Create event"} onBack={onDone} />

      <Pressable onPress={() => pickImage("coverImageUrl")} style={[styles.coverPick, { borderColor: colors.border, backgroundColor: colors.muted }]}>
        {f.coverImageUrl ? <Image source={{ uri: resolveImageUrl(f.coverImageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : (
          <><Ionicons name="image-outline" size={26} color={colors.mutedForeground} /><Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>Add cover image</Text></>
        )}
      </Pressable>
      <Field colors={colors} label="Event name *"><Inp colors={colors} value={f.title} onChangeText={(v) => upd("title", v)} placeholder="Event title" /></Field>
      <Field colors={colors} label="Host venue (pub / club / bar / lounge)">
        <VenuePicker colors={colors} value={f.venueId} onSelect={(v) => {
          if (!v) { upd("venueId", null); return; }
          setF((p) => ({ ...p, venueId: v.id, venueName: v.businessName, address: v.address || p.address, country: v.country || p.country, city: v.city || p.city, state: v.state || p.state }));
        }} />
        <Text style={{ color: f.venueId ? colors.primary : colors.mutedForeground, fontSize: 11, marginTop: 6 }}>
          {f.venueId ? "Sent to this venue for approval before going public. Once approved, it also shows on the venue's page." : "Optional. Pick a venue to host the event there — the venue partner approves it."}
        </Text>
      </Field>
      <Field colors={colors} label="Category"><Chips colors={colors} options={EVENT_CATEGORIES} value={f.category} onChange={(v) => upd("category", v)} /></Field>
      <Field colors={colors} label="Subcategory"><Inp colors={colors} value={f.subcategory} onChangeText={(v) => upd("subcategory", v)} placeholder="Optional" /></Field>
      <Field colors={colors} label="Short description"><Inp colors={colors} value={f.shortDescription} onChangeText={(v) => upd("shortDescription", v)} placeholder="One-liner" /></Field>
      <Field colors={colors} label="Description"><Inp colors={colors} value={f.description} onChangeText={(v) => upd("description", v)} placeholder="Full details" multiline /></Field>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field colors={colors} label="Language" flex><Inp colors={colors} value={f.language} onChangeText={(v) => upd("language", v)} placeholder="Hindi, English" /></Field>
        <Field colors={colors} label="Age limit" flex><Inp colors={colors} value={f.ageRestriction} onChangeText={(v) => upd("ageRestriction", v)} placeholder="e.g. 18+" /></Field>
      </View>
      <TagEditor colors={colors} tags={f.tags} onChange={(t) => upd("tags", t)} />

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Media</Text>
      <Field colors={colors} label="Event banner">
        <Pressable onPress={() => pickImage("bannerUrl")} style={[styles.coverPick, { height: 90, marginBottom: 0, borderColor: colors.border, backgroundColor: colors.muted }]}>
          {f.bannerUrl ? <Image source={{ uri: resolveImageUrl(f.bannerUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="image-outline" size={22} color={colors.mutedForeground} />}
        </Pressable>
      </Field>
      <GalleryEditor colors={colors} images={f.galleryImages} onAdd={addGalleryImages} onRemove={(i) => setF((p) => ({ ...p, galleryImages: p.galleryImages.filter((_, j) => j !== i) }))} />
      <Field colors={colors} label="Promo video URLs (comma separated)"><Inp colors={colors} value={f.promoVideos.join(", ")} onChangeText={(v) => upd("promoVideos", v.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="https://youtube.com/..." /></Field>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Venue</Text>
      <Field colors={colors} label="Venue name"><Inp colors={colors} value={f.venueName} onChangeText={(v) => upd("venueName", v)} placeholder="Venue name" /></Field>
      <Field colors={colors} label="Address"><Inp colors={colors} value={f.address} onChangeText={(v) => upd("address", v)} placeholder="Address" /></Field>
      <Field colors={colors} label="Google Maps URL"><Inp colors={colors} value={f.mapsUrl} onChangeText={(v) => upd("mapsUrl", v)} placeholder="https://maps.google.com/..." /></Field>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field colors={colors} label="Country" flex><Inp colors={colors} value={f.country} onChangeText={(v) => upd("country", v)} placeholder="India" /></Field>
        <Field colors={colors} label="Capacity" flex><Inp colors={colors} value={f.capacity} onChangeText={(v) => upd("capacity", v)} placeholder="0" keyboardType="number-pad" /></Field>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field colors={colors} label="City" flex><Inp colors={colors} value={f.city} onChangeText={(v) => upd("city", v)} placeholder="City" /></Field>
        <Field colors={colors} label="State" flex><Inp colors={colors} value={f.state} onChangeText={(v) => upd("state", v)} placeholder="State" /></Field>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Date & time</Text>
      <View style={styles.switchRow}>
        <Text style={{ color: colors.foreground }}>Multi-day event</Text>
        <Switch value={f.isMultiDay} onValueChange={(v) => upd("isMultiDay", v)} trackColor={{ true: colors.primary }} />
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field colors={colors} label="Start date" flex><Inp colors={colors} value={f.startDate} onChangeText={(v) => upd("startDate", v)} placeholder="YYYY-MM-DD" /></Field>
        {f.isMultiDay && <Field colors={colors} label="End date" flex><Inp colors={colors} value={f.endDate} onChangeText={(v) => upd("endDate", v)} placeholder="YYYY-MM-DD" /></Field>}
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field colors={colors} label="Start time" flex><Inp colors={colors} value={f.startTime} onChangeText={(v) => upd("startTime", v)} placeholder="HH:MM" /></Field>
        <Field colors={colors} label="End time" flex><Inp colors={colors} value={f.endTime} onChangeText={(v) => upd("endTime", v)} placeholder="HH:MM" /></Field>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Happening Tonight visibility</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 8 }}>Controls how this listing appears in Royvento's real-time discovery feed.</Text>
      <View style={styles.switchRow}>
        <Text style={{ color: colors.foreground }}>Show in Happening Tonight</Text>
        <Switch value={f.happeningTonight} onValueChange={(v) => upd("happeningTonight", v)} trackColor={{ true: colors.primary }} />
      </View>
      <View style={styles.switchRow}>
        <Text style={{ color: colors.foreground }}>Show in Starting Soon</Text>
        <Switch value={f.startingSoon} onValueChange={(v) => upd("startingSoon", v)} trackColor={{ true: colors.primary }} />
      </View>
      <View style={styles.switchRow}>
        <Text style={{ color: colors.foreground }}>Last-Minute Deal</Text>
        <Switch value={f.lastMinuteDeal} onValueChange={(v) => upd("lastMinuteDeal", v)} trackColor={{ true: colors.primary }} />
      </View>
      {f.lastMinuteDeal && (
        <Field colors={colors} label="Deal label"><Inp colors={colors} value={f.dealLabel} onChangeText={(v) => upd("dealLabel", v)} placeholder="e.g. Free entry before 9 PM" /></Field>
      )}

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Artists & performers</Text>
      <RepeatableArtists colors={colors} artists={f.artists} onChange={(a) => upd("artists", a)} />

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Event highlights</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {HIGHLIGHT_OPTIONS.map((h) => {
          const on = f.highlights.includes(h);
          return (
            <Pressable key={h} onPress={() => upd("highlights", on ? f.highlights.filter((x) => x !== h) : [...f.highlights, h])}
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + "22" : "transparent" }}>
              <Text style={{ color: on ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>{h}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Schedule / timeline</Text>
      <RepeatableSchedule colors={colors} items={f.schedule} onChange={(s) => upd("schedule", s)} />

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Policies</Text>
      {([
        ["dressCode", "Dress code"], ["entryRules", "Entry rules"], ["agePolicy", "Age policy"],
        ["refundPolicy", "Refund policy"], ["cancellationPolicy", "Cancellation policy"],
      ] as const).map(([k, label]) => (
        <Field key={k} colors={colors} label={label}>
          <Inp colors={colors} value={f.policies[k]} onChangeText={(v) => upd("policies", { ...f.policies, [k]: v })} multiline />
        </Field>
      ))}

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>FAQ</Text>
      <RepeatableFaqs colors={colors} faqs={f.faqs} onChange={(q) => upd("faqs", q)} />

      <PrimaryBtn colors={colors} label={saving ? "Saving…" : isEdit ? "Save changes" : "Create event"} onPress={save} disabled={saving} />
    </ScrollView>
  );
}

function VenuePicker({ colors, value, onSelect }: { colors: Pal; value: number | null; onSelect: (v: VenueOption | null) => void }) {
  const [venues, setVenues] = useState<VenueOption[]>([]);
  useEffect(() => { customFetch<VenueOption[]>("/api/organizer/host-venues").then(setVenues).catch(() => setVenues([])); }, []);
  const selected = venues.find((v) => v.id === value) ?? null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Pressable onPress={() => onSelect(null)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: !selected ? colors.primary : colors.border, backgroundColor: !selected ? colors.primary + "22" : "transparent" }}>
          <Text style={{ color: !selected ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>No venue — standalone</Text>
        </Pressable>
        {venues.map((v) => (
          <Pressable key={v.id} onPress={() => onSelect(v)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: selected?.id === v.id ? colors.primary : colors.border, backgroundColor: selected?.id === v.id ? colors.primary + "22" : "transparent" }}>
            <Text style={{ color: selected?.id === v.id ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }} numberOfLines={1}>{v.businessName}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function TagEditor({ colors, tags, onChange }: { colors: Pal; tags: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function add() {
    const t = draft.trim();
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...tags, t]);
    setDraft("");
  }
  return (
    <Field colors={colors} label="Tags">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: tags.length ? 8 : 0 }}>
        {tags.map((t, i) => (
          <Pressable key={i} onPress={() => onChange(tags.filter((_, j) => j !== i))} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.muted }}>
            <Text style={{ color: colors.foreground, fontSize: 12 }}>{t}</Text>
            <Ionicons name="close" size={12} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Inp colors={colors} value={draft} onChangeText={setDraft} placeholder="Add a tag" onSubmitEditing={add} />
        <TouchableOpacity onPress={add} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" }}>
          <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_500Medium" }}>Add</Text>
        </TouchableOpacity>
      </View>
    </Field>
  );
}

function GalleryEditor({ colors, images, onAdd, onRemove }: { colors: Pal; images: string[]; onAdd: () => void; onRemove: (i: number) => void }) {
  return (
    <Field colors={colors} label="Gallery images">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {images.map((src, i) => (
          <Pressable key={i} onPress={() => onRemove(i)} style={{ width: 72, height: 72, borderRadius: 10, overflow: "hidden" }}>
            <Image source={{ uri: resolveImageUrl(src) }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={{ position: "absolute", top: 2, right: 2, backgroundColor: "#000000aa", borderRadius: 999, padding: 2 }}>
              <Ionicons name="close" size={11} color="#fff" />
            </View>
          </Pressable>
        ))}
        <Pressable onPress={onAdd} style={{ width: 72, height: 72, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="add" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </Field>
  );
}

function RepeatableArtists({ colors, artists, onChange }: { colors: Pal; artists: Artist[]; onChange: (a: Artist[]) => void }) {
  const blank: Artist = { name: "", role: "", imageUrl: "", bio: "", socials: "" };
  return (
    <View style={{ gap: 10 }}>
      {artists.map((a, i) => (
        <View key={i} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Field colors={colors} label="Name"><Inp colors={colors} value={a.name} onChangeText={(v) => onChange(artists.map((x, j) => (j === i ? { ...x, name: v } : x)))} placeholder="Artist / DJ name" /></Field>
          <Field colors={colors} label="Role"><Inp colors={colors} value={a.role} onChangeText={(v) => onChange(artists.map((x, j) => (j === i ? { ...x, role: v } : x)))} placeholder="DJ, Performer…" /></Field>
          <Field colors={colors} label="Bio"><Inp colors={colors} value={a.bio} onChangeText={(v) => onChange(artists.map((x, j) => (j === i ? { ...x, bio: v } : x)))} placeholder="Short bio" multiline /></Field>
          <SmallBtn colors={colors} icon="trash-outline" label="Remove" danger onPress={() => onChange(artists.filter((_, j) => j !== i))} />
        </View>
      ))}
      <SecondaryBtn colors={colors} label="+ Add artist" onPress={() => onChange([...artists, blank])} />
    </View>
  );
}

function RepeatableSchedule({ colors, items, onChange }: { colors: Pal; items: ScheduleItem[]; onChange: (s: ScheduleItem[]) => void }) {
  const blank: ScheduleItem = { time: "", title: "", desc: "" };
  return (
    <View style={{ gap: 10 }}>
      {items.map((s, i) => (
        <View key={i} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Field colors={colors} label="Time"><Inp colors={colors} value={s.time} onChangeText={(v) => onChange(items.map((x, j) => (j === i ? { ...x, time: v } : x)))} placeholder="e.g. 9:00 PM" /></Field>
          <Field colors={colors} label="Title"><Inp colors={colors} value={s.title} onChangeText={(v) => onChange(items.map((x, j) => (j === i ? { ...x, title: v } : x)))} placeholder="Slot title" /></Field>
          <Field colors={colors} label="Description"><Inp colors={colors} value={s.desc} onChangeText={(v) => onChange(items.map((x, j) => (j === i ? { ...x, desc: v } : x)))} placeholder="Description" /></Field>
          <SmallBtn colors={colors} icon="trash-outline" label="Remove" danger onPress={() => onChange(items.filter((_, j) => j !== i))} />
        </View>
      ))}
      <SecondaryBtn colors={colors} label="+ Add slot" onPress={() => onChange([...items, blank])} />
    </View>
  );
}

function RepeatableFaqs({ colors, faqs, onChange }: { colors: Pal; faqs: Faq[]; onChange: (q: Faq[]) => void }) {
  const blank: Faq = { q: "", a: "" };
  return (
    <View style={{ gap: 10 }}>
      {faqs.map((q, i) => (
        <View key={i} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Field colors={colors} label="Question"><Inp colors={colors} value={q.q} onChangeText={(v) => onChange(faqs.map((x, j) => (j === i ? { ...x, q: v } : x)))} placeholder="Question" /></Field>
          <Field colors={colors} label="Answer"><Inp colors={colors} value={q.a} onChangeText={(v) => onChange(faqs.map((x, j) => (j === i ? { ...x, a: v } : x)))} placeholder="Answer" multiline /></Field>
          <SmallBtn colors={colors} icon="trash-outline" label="Remove" danger onPress={() => onChange(faqs.filter((_, j) => j !== i))} />
        </View>
      ))}
      <SecondaryBtn colors={colors} label="+ Add FAQ" onPress={() => onChange([...faqs, blank])} />
    </View>
  );
}

function TicketsEditor({ colors, insets, event, onBack }: { colors: Pal; insets: { bottom: number }; event: OrganizerEvent; onBack: () => void }) {
  const [tickets, setTickets] = useState<TicketTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{ id?: number; type: string; name: string; price: string; quantity: string; bookingLimit: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    customFetch<TicketTier[]>(`/api/organizer/events/${event.id}/tickets`).then(setTickets).catch(() => setTickets([])).finally(() => setLoading(false));
  }, [event.id]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) { Alert.alert("Ticket name required"); return; }
    const body = { type: draft.type, name: draft.name.trim(), price: Number(draft.price) || 0, quantity: Number(draft.quantity) || 0, bookingLimit: Number(draft.bookingLimit) || 0 };
    try {
      if (draft.id) await customFetch(`/api/organizer/tickets/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      else await customFetch(`/api/organizer/events/${event.id}/tickets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setDraft(null); load();
    } catch (e) { Alert.alert("Save failed", (e as Error).message); }
  }
  async function remove(id: number) {
    try { await customFetch(`/api/organizer/tickets/${id}`, { method: "DELETE" }); load(); } catch (e) { Alert.alert("Delete failed", (e as Error).message); }
  }

  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <BackRow colors={colors} label={`Tickets · ${event.title}`} onBack={onBack} />
      {loading ? <Centered colors={colors} /> : tickets.length === 0 && !draft ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>No ticket tiers yet.</Text>
      ) : tickets.map((tk) => (
        <View key={tk.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]}>{tk.name} · {inr(tk.price)}</Text>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{tk.soldCount}/{tk.quantity || "∞"} sold · {tk.type}</Text>
          <View style={styles.rowActions}>
            <SmallBtn colors={colors} icon="pencil-outline" label="Edit" onPress={() => setDraft({ id: tk.id, type: tk.type, name: tk.name, price: tk.price, quantity: String(tk.quantity), bookingLimit: String(tk.bookingLimit) })} />
            <SmallBtn colors={colors} icon="trash-outline" label="Delete" danger onPress={() => remove(tk.id)} />
          </View>
        </View>
      ))}

      {draft ? (
        <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.primary + "55" }]}>
          <Field colors={colors} label="Type"><Chips colors={colors} options={TICKET_TYPES} value={draft.type} onChange={(v) => setDraft({ ...draft, type: v })} /></Field>
          <Field colors={colors} label="Name"><Inp colors={colors} value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="e.g. General / VIP" /></Field>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Field colors={colors} label="Price" flex><Inp colors={colors} value={draft.price} onChangeText={(v) => setDraft({ ...draft, price: v })} placeholder="0" keyboardType="number-pad" /></Field>
            <Field colors={colors} label="Quantity" flex><Inp colors={colors} value={draft.quantity} onChangeText={(v) => setDraft({ ...draft, quantity: v })} placeholder="0" keyboardType="number-pad" /></Field>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <SecondaryBtn colors={colors} label="Cancel" onPress={() => setDraft(null)} flex />
            <PrimaryBtn colors={colors} label="Save tier" onPress={save} flex />
          </View>
        </View>
      ) : (
        <PrimaryBtn colors={colors} label="+ Add ticket tier" onPress={() => setDraft({ type: "paid", name: "", price: "", quantity: "", bookingLimit: "" })} />
      )}
    </ScrollView>
  );
}

// ─── Bookings ─────────────────────────────────────────────────────────────────
function BookingsTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [eventFilter, setEventFilter] = useState("all");
  const [filters, setFilters] = useState<BookingFilters>({ date: "", mode: "all", status: "all" });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Row tap → open that booking's detail modal. (The notification deep-link
  // case is handled by a dedicated modal instance at the
  // OrganizerDashboardScreen level, since this tab unmounts whenever the
  // organizer switches to another tab.)
  const [detailBookingId, setDetailBookingId] = useState<number | null>(null);

  useEffect(() => {
    customFetch<OrganizerEvent[]>("/api/organizer/events").then(setEvents).catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    if (eventFilter !== "all") q.set("eventId", eventFilter);
    if (filters.date) q.set("date", filters.date);
    if (filters.status !== "all") q.set("status", filters.status);
    const qs = q.toString();
    customFetch<BookingRow[]>(`/api/organizer/bookings${qs ? `?${qs}` : ""}`).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [eventFilter, filters]);

  async function exportCsv() {
    if (rows.length === 0) return;
    setExporting(true);
    try {
      const header = ["Booking", "Event", "Ticket", "Attendee", "Phone", "Email", "Qty", "Amount", "Date", "Location", "CheckedIn"];
      const lines = rows.map((r) => [r.id, r.eventTitle, r.ticketType, r.attendee, r.phone, r.email, r.quantity, r.amount, r.bookingDate, r.bookingLocation ?? "", r.checkedIn ? "yes" : "no"]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
      const csv = [header.join(","), ...lines].join("\n");
      const path = `${FileSystem.documentDirectory}royvento-leads.csv`;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: "utf8" });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: "Export bookings & leads" });
      }
    } catch {
      Alert.alert("Export failed", "Could not export bookings to CSV.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 0 }]}>Bookings & leads</Text>
        <SmallBtn colors={colors} icon="download-outline" label={exporting ? "Exporting…" : "CSV"} onPress={exportCsv} />
      </View>
      {events.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
          {[{ id: "all", title: "All events" }, ...events.map((e) => ({ id: String(e.id), title: e.title }))].map((opt) => {
            const active = eventFilter === opt.id;
            return (
              <Pressable key={opt.id} onPress={() => setEventFilter(opt.id)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "22" : "transparent" }}>
                <Text style={{ color: active ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }} numberOfLines={1}>{opt.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <View style={{ marginBottom: 12 }}>
        <BookingFiltersBar filters={filters} onChange={setFilters} />
      </View>
      {loading ? <Centered colors={colors} /> : rows.length === 0 ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>No bookings yet.</Text> : rows.map((b) => (
        <TouchableOpacity key={b.id} activeOpacity={0.8} onPress={() => setDetailBookingId(b.id)} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{b.attendee || "Guest"}</Text>
            <View style={[styles.checkPill, { backgroundColor: b.checkedIn ? "#16a34a22" : colors.muted }]}>
              <Text style={{ color: b.checkedIn ? "#4ade80" : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{b.checkedIn ? "Checked in" : "Not arrived"}</Text>
            </View>
          </View>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{b.eventTitle} · {b.ticketType} ×{b.quantity} · {inr(b.amount)}</Text>
          {(!!b.phone || !!b.email) && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{[b.phone, b.email].filter(Boolean).join(" · ")}</Text>
              {!!b.phone && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`tel:${b.phone}`)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.primary + "20" }}
                >
                  <Ionicons name="call-outline" size={12} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Call</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {!!b.bookingLocation && <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{b.bookingLocation}</Text>}
        </TouchableOpacity>
      ))}
      <BookingDetailModal bookingId={detailBookingId} role="organizer" onClose={() => setDetailBookingId(null)} />
    </ScrollView>
  );
}

// ─── Coupons ──────────────────────────────────────────────────────────────────
function CouponsTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [rows, setRows] = useState<Coupon[]>([]);
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [eventId, setEventId] = useState<string | null>(null);
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const load = useCallback(() => { customFetch<Coupon[]>("/api/organizer/coupons").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); customFetch<OrganizerEvent[]>("/api/organizer/events").then(setEvents).catch(() => {}); }, [load]);

  async function create() {
    if (!code.trim()) { Alert.alert("Enter a code"); return; }
    try {
      await customFetch("/api/organizer/coupons", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(), discountType, discountValue: Number(discountValue),
          eventId: eventId ? Number(eventId) : null,
          maxUses: maxUses.trim() ? Math.max(1, parseInt(maxUses) || 1) : null,
          expiresAt: expiresAt.trim() ? new Date(`${expiresAt.trim()}T23:59:59`).toISOString() : null,
        }) });
      setCode(""); setDiscountValue("10"); setEventId(null); setMaxUses(""); setExpiresAt(""); load();
    } catch (e) { Alert.alert("Create failed", (e as Error).message); }
  }
  async function toggle(c: Coupon) { try { await customFetch(`/api/organizer/coupons/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !c.active }) }); load(); } catch {} }
  async function remove(c: Coupon) { try { await customFetch(`/api/organizer/coupons/${c.id}`, { method: "DELETE" }); load(); } catch {} }

  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Field colors={colors} label="New coupon code"><Inp colors={colors} value={code} onChangeText={setCode} placeholder="SAVE10" autoCapitalize="characters" /></Field>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field colors={colors} label="Type" flex><Chips colors={colors} options={["percent", "fixed"]} value={discountType} onChange={setDiscountType} /></Field>
          <Field colors={colors} label="Value" flex><Inp colors={colors} value={discountValue} onChangeText={setDiscountValue} placeholder="10" keyboardType="number-pad" /></Field>
        </View>
        <Field colors={colors} label="Applies to">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Pressable onPress={() => setEventId(null)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: eventId === null ? colors.primary : colors.border, backgroundColor: eventId === null ? colors.primary + "22" : "transparent" }}>
                <Text style={{ color: eventId === null ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>All events</Text>
              </Pressable>
              {events.map((e) => (
                <Pressable key={e.id} onPress={() => setEventId(String(e.id))} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: eventId === String(e.id) ? colors.primary : colors.border, backgroundColor: eventId === String(e.id) ? colors.primary + "22" : "transparent" }}>
                  <Text style={{ color: eventId === String(e.id) ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }} numberOfLines={1}>{e.title}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </Field>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field colors={colors} label="Max uses (optional)" flex><Inp colors={colors} value={maxUses} onChangeText={(v) => setMaxUses(v.replace(/[^0-9]/g, ""))} placeholder="Unlimited" keyboardType="number-pad" /></Field>
          <Field colors={colors} label="Expires (YYYY-MM-DD)" flex><Inp colors={colors} value={expiresAt} onChangeText={setExpiresAt} placeholder="Never" /></Field>
        </View>
        <PrimaryBtn colors={colors} label="Create coupon" onPress={create} />
      </View>
      {rows.map((c) => (
        <View key={c.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>{c.code}</Text>
            <Switch value={c.active} onValueChange={() => toggle(c)} trackColor={{ true: colors.primary }} />
          </View>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{c.discountType === "fixed" ? inr(c.discountValue) : `${c.discountValue}%`} off · used {c.usedCount}{c.maxUses ? `/${c.maxUses}` : ""}</Text>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
            {c.eventId ? (events.find((e) => e.id === c.eventId)?.title ?? "One event") : "All events"}
            {c.expiresAt ? ` · expires ${new Date(c.expiresAt).toLocaleDateString()}` : " · no expiry"}
          </Text>
          <View style={styles.rowActions}><SmallBtn colors={colors} icon="trash-outline" label="Delete" danger onPress={() => remove(c)} /></View>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Leads (profile views + already-booked) ──────────────────────────────────
function LeadsTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [data, setData] = useState<LeadsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    customFetch<LeadsPayload>("/api/organizer/leads").then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);
  if (loading) return <Centered colors={colors} />;
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 12 }}>People who viewed your organizer page, and who's already booked.</Text>
      <View style={styles.statGrid}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, flex: 1 }]}>
          <Ionicons name="eye-outline" size={20} color={colors.primary} />
          <Text style={[styles.statValue, { color: colors.foreground }]}>{data?.totalViews ?? 0}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Profile views</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, flex: 1 }]}>
          <Ionicons name="trending-up-outline" size={20} color="#4ade80" />
          <Text style={[styles.statValue, { color: "#4ade80" }]}>{data?.bookedCount ?? 0}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Already booked</Text>
        </View>
      </View>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent visitors</Text>
      {!data || data.views.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>No one has viewed your page yet.</Text>
      ) : data.views.map((v, i) => (
        <View key={i} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[styles.rowTitle, { color: colors.foreground, fontStyle: v.viewerUserId ? "normal" : "italic" }]} numberOfLines={1}>{v.viewerName}</Text>
            {v.hasBooked && <View style={[styles.checkPill, { backgroundColor: "#16a34a22" }]}><Text style={{ color: "#4ade80", fontSize: 10, fontFamily: "Inter_600SemiBold" }}>Booked</Text></View>}
          </View>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
            {[v.viewerEmail, v.phone].filter(Boolean).join(" · ") || "—"} · {v.visitCount} visit{v.visitCount === 1 ? "" : "s"}
            {v.lastViewedAt ? ` · last ${new Date(v.lastViewedAt).toLocaleDateString()}` : ""}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Promote (request to feature an event in the Events-page hero slider) ────
function PromoteTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [rows, setRows] = useState<AdRequest[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => { customFetch<AdRequest[]>("/api/organizer/ads").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => {
    customFetch<OrganizerEvent[]>("/api/organizer/events").then((all) => setEvents(all.filter((e) => e.approvalStatus === "approved"))).catch(() => setEvents([]));
    load();
  }, [load]);

  async function submit() {
    if (!eventId) { Alert.alert("Pick an event"); return; }
    setSaving(true);
    try {
      await customFetch("/api/organizer/ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizerEventId: Number(eventId), note }) });
      setEventId(null); setNote(""); load();
    } catch (e) {
      Alert.alert("Request failed", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 12 }}>Request to feature an event in the Royvento Events hero slider. Admin reviews each request.</Text>
      <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Field colors={colors} label="Event">
          {events.length === 0 ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No approved events yet.</Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {events.map((e) => {
                const active = eventId === String(e.id);
                return (
                  <Pressable key={e.id} onPress={() => setEventId(String(e.id))} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "22" : "transparent" }}>
                    <Text style={{ color: active ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }} numberOfLines={1}>{e.title}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Field>
        <Field colors={colors} label="Note (optional)">
          <Inp colors={colors} value={note} onChangeText={setNote} placeholder="Why should this be featured?" multiline />
        </Field>
        <PrimaryBtn colors={colors} label={saving ? "Requesting…" : "Request promotion"} onPress={submit} disabled={saving} />
      </View>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your requests</Text>
      {rows.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>No promotion requests yet.</Text>
      ) : rows.map((r) => (
        <View key={r.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[styles.rowTitle, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{r.eventTitle}</Text>
            {r.featured && <View style={[styles.checkPill, { backgroundColor: "#f59e0b22", marginLeft: 6 }]}><Text style={{ color: "#fbbf24", fontSize: 10, fontFamily: "Inter_600SemiBold" }}>Featured</Text></View>}
          </View>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
            {new Date(r.createdAt).toLocaleDateString()} · <Text style={{ textTransform: "capitalize" }}>{r.status}</Text>{r.adminNote ? ` · ${r.adminNote}` : ""}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Managers ─────────────────────────────────────────────────────────────────
function PermToggleRow({ colors, label, checked, onChange }: { colors: Pal; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Switch value={checked} onValueChange={onChange} trackColor={{ true: colors.primary }} />
      <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium" }}>{label}</Text>
    </View>
  );
}

function ManagersTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [rows, setRows] = useState<ManagerRow[]>([]);
  const [email, setEmail] = useState("");
  const [invitePerms, setInvitePerms] = useState({ scan: true, attendance: true, reports: false });
  const load = useCallback(() => { customFetch<ManagerRow[]>("/api/organizer/managers").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);

  async function invite() {
    if (!email.trim()) { Alert.alert("Enter an email"); return; }
    try {
      await customFetch("/api/organizer/managers/invite", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), permissions: invitePerms }) });
      setEmail(""); load();
    } catch (e) { Alert.alert("Invite failed", (e as Error).message); }
  }
  async function remove(id: number) { try { await customFetch(`/api/organizer/managers/${id}`, { method: "DELETE" }); load(); } catch {} }
  async function togglePerm(row: ManagerRow, key: keyof ManagerRow["permissions"], val: boolean) {
    const next = { ...row.permissions, [key]: val };
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, permissions: next } : r)));
    try {
      await customFetch(`/api/organizer/managers/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions: next }) });
    } catch (e) {
      Alert.alert("Update failed", (e as Error).message);
      load();
    }
  }

  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Field colors={colors} label="Invite manager by email"><Inp colors={colors} value={email} onChangeText={setEmail} placeholder="name@email.com" keyboardType="email-address" autoCapitalize="none" /></Field>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: 8 }}>
          <PermToggleRow colors={colors} label="Scan tickets" checked={invitePerms.scan} onChange={(v) => setInvitePerms((p) => ({ ...p, scan: v }))} />
          <PermToggleRow colors={colors} label="Mark attendance" checked={invitePerms.attendance} onChange={(v) => setInvitePerms((p) => ({ ...p, attendance: v }))} />
          <PermToggleRow colors={colors} label="View reports" checked={invitePerms.reports} onChange={(v) => setInvitePerms((p) => ({ ...p, reports: v }))} />
        </View>
        <PrimaryBtn colors={colors} label="Send invite" onPress={invite} />
      </View>
      {rows.length === 0 ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>No managers yet.</Text> : rows.map((m) => (
        <View key={m.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]}>{m.manager?.name ?? m.invitedEmail}</Text>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{m.invitedEmail} · {m.status}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
            <PermToggleRow colors={colors} label="Scan" checked={m.permissions.scan} onChange={(v) => togglePerm(m, "scan", v)} />
            <PermToggleRow colors={colors} label="Attendance" checked={m.permissions.attendance} onChange={(v) => togglePerm(m, "attendance", v)} />
            <PermToggleRow colors={colors} label="Reports" checked={m.permissions.reports} onChange={(v) => togglePerm(m, "reports", v)} />
          </View>
          <View style={styles.rowActions}><SmallBtn colors={colors} icon="trash-outline" label="Remove" danger onPress={() => remove(m.id)} /></View>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Earnings + Banking ───────────────────────────────────────────────────────
function EarningsTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [rev, setRev] = useState<RevenuePayload | null>(null);
  const [bank, setBank] = useState<BankingPayload | null>(null);
  const [form, setForm] = useState({ accountHolderName: "", bankName: "", accountNumber: "", ifscCode: "" });
  const load = useCallback(() => {
    customFetch<RevenuePayload>("/api/organizer/revenue").then(setRev).catch(() => {});
    customFetch<BankingPayload>("/api/organizer/banking").then((b) => { setBank(b); if (b.banking) setForm(b.banking); }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveBanking() {
    try { await customFetch("/api/organizer/banking", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); Alert.alert("Banking details saved"); load(); }
    catch (e) { Alert.alert("Save failed", (e as Error).message); }
  }

  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <View style={styles.statGrid}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.foreground }]}>{inr(rev?.totals.revenue ?? 0)}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Gross revenue</Text></View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.foreground }]}>{inr(rev?.totals.net ?? 0)}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Net payout</Text></View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.foreground }]}>{inr(rev?.totals.commission ?? 0)}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Commission</Text></View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.foreground }]}>{inr(rev?.commissionOwed ?? 0)}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Owed</Text></View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>By event</Text>
      {!rev || rev.events.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>No events yet.</Text>
      ) : rev.events.map((e) => (
        <View key={e.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{e.title}</Text>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{Number(e.commissionPct).toFixed(1)}% commission · {e.ticketsSold} sold · {e.attended} attended</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
            <Text style={{ color: colors.foreground, fontSize: 12 }}>Revenue {inr(e.revenue)}</Text>
            <Text style={{ color: "#f59e0b", fontSize: 12 }}>Comm. {inr(e.commission)}</Text>
            <Text style={{ color: "#4ade80", fontSize: 12 }}>Net {inr(e.net)}</Text>
          </View>
        </View>
      ))}

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Banking details</Text>
      <Field colors={colors} label="Account holder"><Inp colors={colors} value={form.accountHolderName} onChangeText={(v) => setForm({ ...form, accountHolderName: v })} placeholder="Full name" /></Field>
      <Field colors={colors} label="Bank name"><Inp colors={colors} value={form.bankName} onChangeText={(v) => setForm({ ...form, bankName: v })} placeholder="Bank" /></Field>
      <Field colors={colors} label="Account number"><Inp colors={colors} value={form.accountNumber} onChangeText={(v) => setForm({ ...form, accountNumber: v })} placeholder="Account no." keyboardType="number-pad" /></Field>
      <Field colors={colors} label="IFSC code"><Inp colors={colors} value={form.ifscCode} onChangeText={(v) => setForm({ ...form, ifscCode: v })} placeholder="IFSC" autoCapitalize="characters" /></Field>
      <PrimaryBtn colors={colors} label="Save banking details" onPress={saveBanking} />

      {!!bank?.settlements.length && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Settlement history</Text>
          {bank.settlements.map((s) => (
            <View key={s.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{new Date(s.createdAt).toLocaleDateString()}{s.adminNote ? ` · ${s.adminNote}` : ""}</Text>
                <Text style={{ color: "#4ade80", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{inr(s.amount)} settled</Text>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

// ─── Scanner ──────────────────────────────────────────────────────────────────
interface ScannedTicket { bookingId: number; eventTitle: string; ticketType: string; attendee: string; quantity: number; venue: string; checkedIn: boolean; }
function ScannerTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ status: string; ticket: ScannedTicket } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup(raw: string, confirm: boolean) {
    const c = raw.trim();
    if (!c) return;
    setError(null);
    try {
      const res = await customFetch<{ status: string; ticket: ScannedTicket; message?: string }>("/api/organizer/scan-ticket", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: c, confirm }),
      });
      setResult({ status: res.status, ticket: res.ticket });
    } catch (e) { setError((e as Error).message || "Scan failed"); setResult(null); }
  }

  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      {scanning && permission?.granted ? (
        <View style={{ height: 300, borderRadius: 16, overflow: "hidden", marginBottom: 12 }}>
          <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => { setScanning(false); setCode(data); lookup(data, false); }} />
        </View>
      ) : (
        <PrimaryBtn colors={colors} label="Scan QR code" onPress={async () => { if (!permission?.granted) { const r = await requestPermission(); if (!r.granted) { Alert.alert("Camera permission needed"); return; } } setScanning(true); }} />
      )}
      <Field colors={colors} label="Or enter code manually"><Inp colors={colors} value={code} onChangeText={setCode} placeholder="Ticket code" autoCapitalize="characters" /></Field>
      <PrimaryBtn colors={colors} label="Verify ticket" onPress={() => lookup(code, false)} />

      {error && <Text style={{ color: colors.redLight, marginTop: 12 }}>{error}</Text>}
      {result && (() => {
        const ended = result.status === "EVENT_ENDED";
        const already = result.status === "ALREADY_CHECKED_IN";
        return (
          <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: ended || already ? colors.red : "#16a34a", marginTop: 14 }]}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>{ended ? "Event has ended" : result.ticket.attendee}</Text>
            <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{result.ticket.eventTitle}{ended ? "" : ` · ${result.ticket.ticketType} ×${result.ticket.quantity}`}</Text>
            <Text style={{ color: ended || already ? colors.redLight : "#4ade80", marginTop: 6, fontFamily: "Inter_600SemiBold" }}>
              {ended ? "Tickets can no longer be scanned." : already ? "Already checked in" : result.status === "CHECKED_IN" ? "Checked in ✓" : "Valid ticket"}
            </Text>
            {result.status === "VALID" && <PrimaryBtn colors={colors} label="Confirm check-in" onPress={() => lookup(code || String(result.ticket.bookingId), true)} />}
          </View>
        );
      })()}
    </ScrollView>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────
function ProfileTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [o, setO] = useState<Organizer | null>(null);
  const [form, setForm] = useState({ name: "", description: "", supportEmail: "", supportPhone: "", website: "", instagram: "", facebook: "", youtube: "", logoUrl: "", coverImageUrl: "", city: "", state: "" });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  useEffect(() => {
    customFetch<Organizer>("/api/organizer/profile").then((d) => { setO(d); setForm({ name: d.name, description: d.description, supportEmail: d.supportEmail, supportPhone: d.supportPhone, website: d.website, instagram: d.instagram, facebook: d.facebook, youtube: d.youtube, logoUrl: d.logoUrl, coverImageUrl: d.coverImageUrl, city: d.city ?? "", state: d.state ?? "" }); }).catch(() => {});
  }, []);
  async function save() {
    try { await customFetch("/api/organizer/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); Alert.alert("Profile saved"); }
    catch (e) { Alert.alert("Save failed", (e as Error).message); }
  }
  async function pickAndUpload(kind: "logo" | "cover") {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", allowsEditing: true, aspect: kind === "logo" ? [1, 1] : [16, 9], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const setUploading = kind === "logo" ? setUploadingLogo : setUploadingCover;
    setUploading(true);
    try {
      const url = await uploadImageToStorage(result.assets[0].uri);
      setForm((p) => ({ ...p, [kind === "logo" ? "logoUrl" : "coverImageUrl"]: url }));
    } catch (e) {
      Alert.alert("Upload failed", (e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      {o && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <StatusPill colors={colors} status={o.status === "approved" ? "approved" : o.status} />
          {o.verified && <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Ionicons name="checkmark-circle" size={14} color="#f59e0b" /><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Verified</Text></View>}
        </View>
      )}

      <Field colors={colors} label="Logo">
        <TouchableOpacity onPress={() => pickAndUpload("logo")} disabled={uploadingLogo} style={{ width: 72, height: 72, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {uploadingLogo ? <ActivityIndicator color={colors.primary} /> : form.logoUrl ? (
            <Image source={{ uri: resolveImageUrl(form.logoUrl) }} style={{ width: "100%", height: "100%" }} />
          ) : (
            <Ionicons name="image-outline" size={22} color={colors.mutedForeground} />
          )}
        </TouchableOpacity>
      </Field>
      <Field colors={colors} label="Cover image">
        <TouchableOpacity onPress={() => pickAndUpload("cover")} disabled={uploadingCover} style={{ width: "100%", height: 110, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {uploadingCover ? <ActivityIndicator color={colors.primary} /> : form.coverImageUrl ? (
            <Image source={{ uri: resolveImageUrl(form.coverImageUrl) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          ) : (
            <View style={{ alignItems: "center", gap: 4 }}>
              <Ionicons name="image-outline" size={22} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Tap to upload</Text>
            </View>
          )}
        </TouchableOpacity>
      </Field>

      <Field colors={colors} label="Organizer name"><Inp colors={colors} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Name" /></Field>
      <Field colors={colors} label="About"><Inp colors={colors} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Describe your brand" multiline /></Field>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field colors={colors} label="City" flex><Inp colors={colors} value={form.city} onChangeText={(v) => setForm({ ...form, city: v })} placeholder="City" /></Field>
        <Field colors={colors} label="State" flex><Inp colors={colors} value={form.state} onChangeText={(v) => setForm({ ...form, state: v })} placeholder="State" /></Field>
      </View>
      <Field colors={colors} label="Support email"><Inp colors={colors} value={form.supportEmail} onChangeText={(v) => setForm({ ...form, supportEmail: v })} placeholder="email" keyboardType="email-address" autoCapitalize="none" /></Field>
      <Field colors={colors} label="Support phone"><Inp colors={colors} value={form.supportPhone} onChangeText={(v) => setForm({ ...form, supportPhone: v })} placeholder="phone" keyboardType="phone-pad" /></Field>
      <Field colors={colors} label="Website"><Inp colors={colors} value={form.website} onChangeText={(v) => setForm({ ...form, website: v })} placeholder="https://" autoCapitalize="none" /></Field>
      <Field colors={colors} label="Instagram"><Inp colors={colors} value={form.instagram} onChangeText={(v) => setForm({ ...form, instagram: v })} placeholder="@handle" autoCapitalize="none" /></Field>
      <Field colors={colors} label="Facebook"><Inp colors={colors} value={form.facebook} onChangeText={(v) => setForm({ ...form, facebook: v })} placeholder="facebook.com/yourpage" autoCapitalize="none" /></Field>
      <Field colors={colors} label="YouTube"><Inp colors={colors} value={form.youtube} onChangeText={(v) => setForm({ ...form, youtube: v })} placeholder="youtube.com/@yourchannel" autoCapitalize="none" /></Field>
      <PrimaryBtn colors={colors} label="Save profile" onPress={save} />
    </ScrollView>
  );
}

// ─── shared bits ──────────────────────────────────────────────────────────────
function Centered({ colors }: { colors: Pal }) {
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 }}><ActivityIndicator color={colors.primary} /></View>;
}
function StatusPill({ colors, status }: { colors: Pal; status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    approved: { bg: "#16a34a22", fg: "#4ade80", label: "Approved" },
    pending: { bg: "#f59e0b22", fg: "#fbbf24", label: "Pending review" },
    rejected: { bg: colors.red + "22", fg: colors.redLight, label: "Rejected" },
  };
  const s = map[status] ?? map.pending!;
  return <View style={{ alignSelf: "flex-start", backgroundColor: s.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 }}><Text style={{ color: s.fg, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{s.label}</Text></View>;
}
function Field({ colors, label, children, flex }: { colors: Pal; label: string; children: React.ReactNode; flex?: boolean }) {
  return <View style={{ marginBottom: 12, flex: flex ? 1 : undefined }}><Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Text>{children}</View>;
}
function Inp({ colors, ...props }: { colors: Pal } & React.ComponentProps<typeof TextInput>) {
  return <TextInput {...props} placeholderTextColor={colors.mutedForeground} style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }, props.multiline ? { minHeight: 80, textAlignVertical: "top" } : null]} />;
}
function Chips({ colors, options, value, onChange }: { colors: Pal; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {options.map((o) => {
        const active = value === o;
        return (
          <Pressable key={o} onPress={() => onChange(o)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "22" : "transparent" }}>
            <Text style={{ color: active ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>{o.replace(/_/g, " ")}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
function PrimaryBtn({ colors, label, onPress, disabled, flex }: { colors: Pal; label: string; onPress: () => void; disabled?: boolean; flex?: boolean }) {
  return <TouchableOpacity onPress={onPress} disabled={disabled} style={{ flex: flex ? 1 : undefined, backgroundColor: disabled ? colors.muted : colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 }}><Text style={{ color: disabled ? colors.mutedForeground : colors.primaryForeground, fontFamily: "Inter_700Bold" }}>{label}</Text></TouchableOpacity>;
}
function SecondaryBtn({ colors, label, onPress, flex }: { colors: Pal; label: string; onPress: () => void; flex?: boolean }) {
  return <TouchableOpacity onPress={onPress} style={{ flex: flex ? 1 : undefined, backgroundColor: colors.muted, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 8, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.foreground }}>{label}</Text></TouchableOpacity>;
}
function SmallBtn({ colors, icon, label, onPress, danger }: { colors: Pal; icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void; danger?: boolean }) {
  return <TouchableOpacity onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: danger ? colors.red + "1a" : colors.muted }}><Ionicons name={icon} size={13} color={danger ? colors.redLight : colors.foreground} /><Text style={{ color: danger ? colors.redLight : colors.foreground, fontSize: 12 }}>{label}</Text></TouchableOpacity>;
}
function BackRow({ colors, label, onBack }: { colors: Pal; label: string; onBack: () => void }) {
  return (
    <Pressable onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <Ionicons name="arrow-back" size={20} color={colors.foreground} />
      <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  tab: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  tabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 },
  statCard: { width: "47%", flexGrow: 1, borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 16, marginBottom: 10 },
  rowCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 10, gap: 4 },
  rowTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  rowMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowActions: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  thumb: { width: 50, height: 50, borderRadius: 10 },
  empty: { textAlign: "center", marginTop: 40, fontFamily: "Inter_400Regular" },
  checkPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  coverPick: { height: 140, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 14 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular" },
});
