import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, Stack } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
interface OrganizerEvent {
  id: number; title: string; slug: string; category: string; shortDescription: string; description: string;
  coverImageUrl: string; venueName: string; address: string; city: string; state: string;
  startDate: string | null; endDate: string | null; startTime: string; endTime: string; isMultiDay: boolean;
  capacity: number; ageRestriction: string; language: string; approvalStatus: string; rejectionReason: string;
}
interface TicketTier {
  id: number; type: string; name: string; description: string; price: string;
  quantity: number; soldCount: number; bookingLimit: number; active: boolean;
}
interface Analytics {
  totals: { bookings: number; tickets: number; revenue: string; attended: number; attendanceRate: number };
  perEvent: { id: number; title: string; bookings: number; tickets: number; revenue: string; attended: number }[];
}
interface BookingRow {
  id: number; createdAt: string; bookingDate: string; quantity: number; amount: string;
  checkedIn: boolean; attendee: string; phone: string; eventTitle: string; ticketType: string;
}
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
  events: { id: number; title: string; ticketsSold: number; revenue: string; net: string }[];
  totals: { revenue: string; commission: string; gatewayFee: string; net: string };
  commissionOwed: string;
}
interface BankingPayload {
  banking: { accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string } | null;
  commissionOwed: string;
}

const EVENT_CATEGORIES = ["Concert", "Festival", "Comedy", "Conference", "Workshop", "Sports", "Theatre", "Exhibition", "Party", "Other"];
const TICKET_TYPES = ["free", "paid", "early_bird", "vip", "couple", "group", "student"];

function inr(v: string | number) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
}

const TABS: { key: string; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "overview", label: "Overview", icon: "stats-chart-outline" },
  { key: "events", label: "Events", icon: "calendar-outline" },
  { key: "bookings", label: "Bookings", icon: "ticket-outline" },
  { key: "coupons", label: "Coupons", icon: "pricetag-outline" },
  { key: "managers", label: "Managers", icon: "people-outline" },
  { key: "earnings", label: "Earnings", icon: "cash-outline" },
  { key: "scanner", label: "Scanner", icon: "qr-code-outline" },
  { key: "profile", label: "Profile", icon: "settings-outline" },
];

export default function OrganizerDashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const [tab, setTab] = useState("overview");

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
        {tab === "coupons" && <CouponsTab colors={colors} insets={insets} />}
        {tab === "managers" && <ManagersTab colors={colors} insets={insets} />}
        {tab === "earnings" && <EarningsTab colors={colors} insets={insets} />}
        {tab === "scanner" && <ScannerTab colors={colors} insets={insets} />}
        {tab === "profile" && <ProfileTab colors={colors} insets={insets} />}
      </View>
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
            {e.coverImageUrl ? <Image source={{ uri: e.coverImageUrl }} style={styles.thumb} contentFit="cover" /> : <View style={[styles.thumb, { backgroundColor: colors.muted }]} />}
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{e.title}</Text>
              <StatusPill colors={colors} status={e.approvalStatus} />
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

function EventEditor({ colors, insets, event, onDone }: { colors: Pal; insets: { bottom: number }; event: OrganizerEvent | null; onDone: () => void }) {
  const isEdit = !!event;
  const [f, setF] = useState({
    title: event?.title ?? "", category: event?.category ?? "Concert", shortDescription: event?.shortDescription ?? "",
    description: event?.description ?? "", venueName: event?.venueName ?? "", address: event?.address ?? "",
    city: event?.city ?? "", state: event?.state ?? "", startDate: event?.startDate ?? "", endDate: event?.endDate ?? "",
    startTime: event?.startTime ?? "", endTime: event?.endTime ?? "", isMultiDay: event?.isMultiDay ?? false,
    capacity: String(event?.capacity ?? ""), ageRestriction: event?.ageRestriction ?? "", language: event?.language ?? "",
    coverImageUrl: event?.coverImageUrl ?? "",
  });
  const [saving, setSaving] = useState(false);
  const upd = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  async function pickCover() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    try { const url = await uploadImageToStorage(res.assets[0].uri, res.assets[0].mimeType ?? undefined); upd("coverImageUrl", url); }
    catch { Alert.alert("Upload failed"); }
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
      <Pressable onPress={pickCover} style={[styles.coverPick, { borderColor: colors.border, backgroundColor: colors.muted }]}>
        {f.coverImageUrl ? <Image source={{ uri: f.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : (
          <><Ionicons name="image-outline" size={26} color={colors.mutedForeground} /><Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>Add cover image</Text></>
        )}
      </Pressable>
      <Field colors={colors} label="Event name *"><Inp colors={colors} value={f.title} onChangeText={(v) => upd("title", v)} placeholder="Event title" /></Field>
      <Field colors={colors} label="Category"><Chips colors={colors} options={EVENT_CATEGORIES} value={f.category} onChange={(v) => upd("category", v)} /></Field>
      <Field colors={colors} label="Short description"><Inp colors={colors} value={f.shortDescription} onChangeText={(v) => upd("shortDescription", v)} placeholder="One-liner" /></Field>
      <Field colors={colors} label="Description"><Inp colors={colors} value={f.description} onChangeText={(v) => upd("description", v)} placeholder="Full details" multiline /></Field>
      <Field colors={colors} label="Venue"><Inp colors={colors} value={f.venueName} onChangeText={(v) => upd("venueName", v)} placeholder="Venue name" /></Field>
      <Field colors={colors} label="Address"><Inp colors={colors} value={f.address} onChangeText={(v) => upd("address", v)} placeholder="Address" /></Field>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field colors={colors} label="City" flex><Inp colors={colors} value={f.city} onChangeText={(v) => upd("city", v)} placeholder="City" /></Field>
        <Field colors={colors} label="State" flex><Inp colors={colors} value={f.state} onChangeText={(v) => upd("state", v)} placeholder="State" /></Field>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field colors={colors} label="Start date" flex><Inp colors={colors} value={f.startDate} onChangeText={(v) => upd("startDate", v)} placeholder="YYYY-MM-DD" /></Field>
        <Field colors={colors} label="End date" flex><Inp colors={colors} value={f.endDate} onChangeText={(v) => upd("endDate", v)} placeholder="YYYY-MM-DD" /></Field>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field colors={colors} label="Start time" flex><Inp colors={colors} value={f.startTime} onChangeText={(v) => upd("startTime", v)} placeholder="HH:MM" /></Field>
        <Field colors={colors} label="End time" flex><Inp colors={colors} value={f.endTime} onChangeText={(v) => upd("endTime", v)} placeholder="HH:MM" /></Field>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field colors={colors} label="Capacity" flex><Inp colors={colors} value={f.capacity} onChangeText={(v) => upd("capacity", v)} placeholder="0" keyboardType="number-pad" /></Field>
        <Field colors={colors} label="Age limit" flex><Inp colors={colors} value={f.ageRestriction} onChangeText={(v) => upd("ageRestriction", v)} placeholder="e.g. 18+" /></Field>
      </View>
      <View style={styles.switchRow}>
        <Text style={{ color: colors.foreground }}>Multi-day event</Text>
        <Switch value={f.isMultiDay} onValueChange={(v) => upd("isMultiDay", v)} trackColor={{ true: colors.primary }} />
      </View>
      <PrimaryBtn colors={colors} label={saving ? "Saving…" : isEdit ? "Save changes" : "Create event"} onPress={save} disabled={saving} />
    </ScrollView>
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
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    customFetch<BookingRow[]>("/api/organizer/bookings").then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  if (loading) return <Centered colors={colors} />;
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      {rows.length === 0 ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>No bookings yet.</Text> : rows.map((b) => (
        <View key={b.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{b.attendee || "Guest"}</Text>
            <View style={[styles.checkPill, { backgroundColor: b.checkedIn ? "#16a34a22" : colors.muted }]}>
              <Text style={{ color: b.checkedIn ? "#4ade80" : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{b.checkedIn ? "Checked in" : "Not arrived"}</Text>
            </View>
          </View>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{b.eventTitle} · {b.ticketType} ×{b.quantity} · {inr(b.amount)}</Text>
          {!!b.phone && <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{b.phone}</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Coupons ──────────────────────────────────────────────────────────────────
function CouponsTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [rows, setRows] = useState<Coupon[]>([]);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const load = useCallback(() => { customFetch<Coupon[]>("/api/organizer/coupons").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!code.trim()) { Alert.alert("Enter a code"); return; }
    try {
      await customFetch("/api/organizer/coupons", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), discountType, discountValue: Number(discountValue), eventId: null, maxUses: null, expiresAt: null }) });
      setCode(""); setDiscountValue("10"); load();
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
        <PrimaryBtn colors={colors} label="Create coupon" onPress={create} />
      </View>
      {rows.map((c) => (
        <View key={c.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>{c.code}</Text>
            <Switch value={c.active} onValueChange={() => toggle(c)} trackColor={{ true: colors.primary }} />
          </View>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{c.discountType === "fixed" ? inr(c.discountValue) : `${c.discountValue}%`} off · used {c.usedCount}{c.maxUses ? `/${c.maxUses}` : ""}</Text>
          <View style={styles.rowActions}><SmallBtn colors={colors} icon="trash-outline" label="Delete" danger onPress={() => remove(c)} /></View>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Managers ─────────────────────────────────────────────────────────────────
function ManagersTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [rows, setRows] = useState<ManagerRow[]>([]);
  const [email, setEmail] = useState("");
  const load = useCallback(() => { customFetch<ManagerRow[]>("/api/organizer/managers").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);

  async function invite() {
    if (!email.trim()) { Alert.alert("Enter an email"); return; }
    try {
      await customFetch("/api/organizer/managers/invite", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), permissions: { scan: true, attendance: true, reports: false } }) });
      setEmail(""); load();
    } catch (e) { Alert.alert("Invite failed", (e as Error).message); }
  }
  async function remove(id: number) { try { await customFetch(`/api/organizer/managers/${id}`, { method: "DELETE" }); load(); } catch {} }

  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Field colors={colors} label="Invite manager by email"><Inp colors={colors} value={email} onChangeText={setEmail} placeholder="name@email.com" keyboardType="email-address" autoCapitalize="none" /></Field>
        <PrimaryBtn colors={colors} label="Send invite" onPress={invite} />
      </View>
      {rows.length === 0 ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>No managers yet.</Text> : rows.map((m) => (
        <View key={m.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]}>{m.manager?.name ?? m.invitedEmail}</Text>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{m.invitedEmail} · {m.status}</Text>
          <View style={styles.rowActions}><SmallBtn colors={colors} icon="trash-outline" label="Remove" danger onPress={() => remove(m.id)} /></View>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Earnings + Banking ───────────────────────────────────────────────────────
function EarningsTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [rev, setRev] = useState<RevenuePayload | null>(null);
  const [form, setForm] = useState({ accountHolderName: "", bankName: "", accountNumber: "", ifscCode: "" });
  const load = useCallback(() => {
    customFetch<RevenuePayload>("/api/organizer/revenue").then(setRev).catch(() => {});
    customFetch<BankingPayload>("/api/organizer/banking").then((b) => { if (b.banking) setForm(b.banking); }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveBanking() {
    try { await customFetch("/api/organizer/banking", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); Alert.alert("Banking details saved"); }
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
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Banking details</Text>
      <Field colors={colors} label="Account holder"><Inp colors={colors} value={form.accountHolderName} onChangeText={(v) => setForm({ ...form, accountHolderName: v })} placeholder="Full name" /></Field>
      <Field colors={colors} label="Bank name"><Inp colors={colors} value={form.bankName} onChangeText={(v) => setForm({ ...form, bankName: v })} placeholder="Bank" /></Field>
      <Field colors={colors} label="Account number"><Inp colors={colors} value={form.accountNumber} onChangeText={(v) => setForm({ ...form, accountNumber: v })} placeholder="Account no." keyboardType="number-pad" /></Field>
      <Field colors={colors} label="IFSC code"><Inp colors={colors} value={form.ifscCode} onChangeText={(v) => setForm({ ...form, ifscCode: v })} placeholder="IFSC" autoCapitalize="characters" /></Field>
      <PrimaryBtn colors={colors} label="Save banking details" onPress={saveBanking} />
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
      {result && (
        <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: result.status === "ALREADY_CHECKED_IN" ? colors.red : "#16a34a", marginTop: 14 }]}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]}>{result.ticket.attendee}</Text>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{result.ticket.eventTitle} · {result.ticket.ticketType} ×{result.ticket.quantity}</Text>
          <Text style={{ color: result.status === "ALREADY_CHECKED_IN" ? colors.redLight : "#4ade80", marginTop: 6, fontFamily: "Inter_600SemiBold" }}>
            {result.status === "ALREADY_CHECKED_IN" ? "Already checked in" : result.status === "CHECKED_IN" ? "Checked in ✓" : "Valid ticket"}
          </Text>
          {result.status === "VALID" && <PrimaryBtn colors={colors} label="Confirm check-in" onPress={() => lookup(code || String(result.ticket.bookingId), true)} />}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────
function ProfileTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [o, setO] = useState<Organizer | null>(null);
  const [form, setForm] = useState({ name: "", description: "", supportEmail: "", supportPhone: "", website: "", instagram: "", facebook: "", youtube: "", logoUrl: "", coverImageUrl: "" });
  useEffect(() => {
    customFetch<Organizer>("/api/organizer/profile").then((d) => { setO(d); setForm({ name: d.name, description: d.description, supportEmail: d.supportEmail, supportPhone: d.supportPhone, website: d.website, instagram: d.instagram, facebook: d.facebook, youtube: d.youtube, logoUrl: d.logoUrl, coverImageUrl: d.coverImageUrl }); }).catch(() => {});
  }, []);
  async function save() {
    try { await customFetch("/api/organizer/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); Alert.alert("Profile saved"); }
    catch (e) { Alert.alert("Save failed", (e as Error).message); }
  }
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      {o && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <StatusPill colors={colors} status={o.status === "approved" ? "approved" : o.status} />
          {o.verified && <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Ionicons name="checkmark-circle" size={14} color="#f59e0b" /><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Verified</Text></View>}
        </View>
      )}
      <Field colors={colors} label="Organizer name"><Inp colors={colors} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Name" /></Field>
      <Field colors={colors} label="About"><Inp colors={colors} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Describe your brand" multiline /></Field>
      <Field colors={colors} label="Support email"><Inp colors={colors} value={form.supportEmail} onChangeText={(v) => setForm({ ...form, supportEmail: v })} placeholder="email" keyboardType="email-address" autoCapitalize="none" /></Field>
      <Field colors={colors} label="Support phone"><Inp colors={colors} value={form.supportPhone} onChangeText={(v) => setForm({ ...form, supportPhone: v })} placeholder="phone" keyboardType="phone-pad" /></Field>
      <Field colors={colors} label="Website"><Inp colors={colors} value={form.website} onChangeText={(v) => setForm({ ...form, website: v })} placeholder="https://" autoCapitalize="none" /></Field>
      <Field colors={colors} label="Instagram"><Inp colors={colors} value={form.instagram} onChangeText={(v) => setForm({ ...form, instagram: v })} placeholder="@handle" autoCapitalize="none" /></Field>
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
