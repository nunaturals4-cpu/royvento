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

// ── Game Organizer dashboard (mobile) ────────────────────────────────────────
// Mirror of the web /dashboard/game-organizer page. Tabs: Overview · Games
// (create/edit, fixed or hourly pricing) · Packages · Bookings · Coupons ·
// Managers · Earnings · Scanner · Profile. Hits /api/game-organizer/* endpoints.

type Pal = ReturnType<typeof useColors>;

interface GameOrganizer {
  id: number; name: string; slug: string; description: string;
  logoUrl: string; coverImageUrl: string; galleryImages: string[]; website: string;
  instagram: string; facebook: string; youtube: string;
  supportEmail: string; supportPhone: string; address: string; mapsUrl: string; city: string; state: string;
  verified: boolean; status: string;
}
interface Game {
  id: number; name: string; slug: string; category: string; description: string; rules: string;
  coverImageUrl: string; images: string[]; videos: string[]; capacity: number; ageRestriction: string;
  pricingModel: "fixed" | "hourly"; price: string; hourlyRate: string; minHours: number; maxHours: number;
  startTime?: string; endTime?: string;
  happeningTonight?: boolean; startingSoon?: boolean; lastMinuteDeal?: boolean; dealLabel?: string;
  active: boolean; approvalStatus: string; rejectionReason: string; soldCount: number;
}
interface PackageItem { gameId: number | null; label: string; quantity: number; }
interface PackageAddon { label: string; price: number; }
interface GamePackage {
  id: number; name: string; slug: string; description: string; coverImageUrl: string; images: string[];
  price: string; items: PackageItem[] | null; addons: PackageAddon[] | null; groupSize: number; capacity: number; ageRestriction: string;
  approvalStatus: string; rejectionReason: string; soldCount: number;
}
interface Analytics {
  totals: { bookings: number; players: number; revenue: string; attended: number; attendanceRate: number; conversionRate: number; totalCustomers: number; repeatCustomers: number };
  popularGames: { id: number; name: string; bookings: number; players: number; revenue: string }[];
  popularPackages: { id: number; name: string; bookings: number; revenue: string }[];
  peakHours: { hour: string; bookings: number }[];
}
interface BookingRow {
  id: number; createdAt: string; bookingDate: string; time: string | null; durationHours: string | null;
  persons: number; amount: string; checkedIn: boolean; attendee: string; phone: string; email: string;
  itemName: string; gameName: string | null; packageName: string | null; bookingLocation?: string;
  status?: string; paymentMethod?: string;
}
interface LeadView {
  viewerUserId: number | null; viewerName: string; viewerEmail: string; phone: string;
  visitCount: number; lastViewedAt: string | null; hasBooked: boolean;
}
interface LeadsPayload { totalViews: number; bookedCount: number; views: LeadView[]; }
interface AdRequest { id: number; status: string; note: string; adminNote: string; createdAt: string; gameName: string; featured: boolean; }
interface Coupon {
  id: number; code: string; discountType: string; discountValue: string; gameId: number | null;
  active: boolean; maxUses: number | null; usedCount: number; expiresAt: string | null;
}
interface ManagerPerms { scan: boolean; attendance: boolean; reports: boolean; }
interface ManagerRow { id: number; invitedEmail: string; status: string; permissions: ManagerPerms; manager: { id: number; name: string; email: string } | null; }
interface RevenueRow { id: number; name: string; type: string; commissionPct: string; gatewayFeePercent: string; revenue: string; commission: string; gatewayFee: string; net: string; attended: number; }
interface RevenuePayload { games: RevenueRow[]; packages: RevenueRow[]; totals: { revenue: string; commission: string; gatewayFee: string; net: string }; commissionOwed: string; }
interface BankingPayload { banking: { accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string } | null; settlements: { id: number; amount: string; status: string; adminNote: string; createdAt: string }[]; }

const GAME_CATEGORIES = ["Gaming Zone", "Arcade Center", "VR Gaming Arena", "Bowling Alley", "Paintball Arena", "Laser Tag", "Go-Kart Racing", "Pool & Snooker Club", "PlayStation/Xbox Lounge", "Indoor Sports & Entertainment", "Other"];

function inr(v: string | number) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
}

const TABS: { key: string; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "overview", label: "Overview", icon: "stats-chart-outline" },
  { key: "games", label: "Games", icon: "game-controller-outline" },
  { key: "packages", label: "Packages", icon: "cube-outline" },
  { key: "bookings", label: "Bookings", icon: "ticket-outline" },
  { key: "leads", label: "Leads", icon: "eye-outline" },
  { key: "coupons", label: "Coupons", icon: "pricetag-outline" },
  { key: "promote", label: "Promote", icon: "megaphone-outline" },
  { key: "managers", label: "Managers", icon: "people-outline" },
  { key: "earnings", label: "Earnings", icon: "cash-outline" },
  { key: "scanner", label: "Scanner", icon: "qr-code-outline" },
  { key: "profile", label: "Profile", icon: "settings-outline" },
];

export default function GameOrganizerDashboardScreen() {
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
        <Pressable onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={22} color={colors.foreground} /></Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Game Management</Text>
      </View>
      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <FlatList horizontal data={TABS} keyExtractor={(t) => t.key} showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingVertical: 10 }}
          renderItem={({ item }) => {
            const active = tab === item.key;
            return (
              <Pressable onPress={() => setTab(item.key)} style={[styles.tab, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}>
                <Ionicons name={item.icon} size={14} color={active ? colors.primaryForeground : colors.mutedForeground} />
                <Text style={[styles.tabText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>
      <View style={{ flex: 1 }}>
        {tab === "overview" && <OverviewTab colors={colors} insets={insets} />}
        {tab === "games" && <GamesTab colors={colors} insets={insets} />}
        {tab === "packages" && <PackagesTab colors={colors} insets={insets} />}
        {tab === "bookings" && <BookingsTab colors={colors} insets={insets} />}
        {tab === "leads" && <LeadsTab colors={colors} insets={insets} />}
        {tab === "coupons" && <CouponsTab colors={colors} insets={insets} />}
        {tab === "promote" && <PromoteTab colors={colors} insets={insets} />}
        {tab === "managers" && <ManagersTab colors={colors} insets={insets} />}
        {tab === "earnings" && <EarningsTab colors={colors} insets={insets} />}
        {tab === "scanner" && <ScannerTab colors={colors} insets={insets} />}
        {tab === "profile" && <ProfileTab colors={colors} insets={insets} />}
      </View>

      <BookingDetailModal bookingId={detailBookingId} role="game" onClose={() => setDetailBookingId(null)} />
    </View>
  );
}

function useBottomPad(insets: { bottom: number }) { return { paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 }; }

function OverviewTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [an, setAn] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { customFetch<Analytics>("/api/game-organizer/analytics").then(setAn).catch(() => setAn(null)).finally(() => setLoading(false)); }, []);
  if (loading) return <Centered colors={colors} />;
  const t = an?.totals;
  const cards = [
    { label: "Bookings", value: String(t?.bookings ?? 0), icon: "ticket-outline" as const },
    { label: "Players", value: String(t?.players ?? 0), icon: "people-outline" as const },
    { label: "Revenue", value: inr(t?.revenue ?? 0), icon: "cash-outline" as const },
    { label: "Attendance", value: `${t?.attendanceRate ?? 0}%`, icon: "checkmark-done-outline" as const },
    { label: "Conversion", value: `${t?.conversionRate ?? 0}%`, icon: "trending-up-outline" as const },
    { label: "Customers", value: String(t?.totalCustomers ?? 0), icon: "person-outline" as const },
    { label: "Repeat customers", value: String(t?.repeatCustomers ?? 0), icon: "repeat-outline" as const },
  ];
  const popularGames = (an?.popularGames ?? []).filter((g) => g.bookings > 0).slice(0, 8);
  const popularPackages = (an?.popularPackages ?? []).filter((p) => p.bookings > 0).slice(0, 8);
  const peakHours = an?.peakHours ?? [];
  const peakMax = Math.max(1, ...peakHours.map((h) => h.bookings));
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

      {popularGames.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Most popular games</Text>
          <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border, gap: 8 }]}>
            {popularGames.map((g) => (
              <View key={g.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_500Medium" }} numberOfLines={1}>{g.name}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{g.bookings} bookings · {inr(g.revenue)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {popularPackages.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Most popular packages</Text>
          <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border, gap: 8 }]}>
            {popularPackages.map((p) => (
              <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_500Medium" }} numberOfLines={1}>{p.name}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{p.bookings} bookings · {inr(p.revenue)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {peakHours.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Peak booking hours</Text>
          <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "row", alignItems: "flex-end", gap: 4, height: 110 }]}>
            {peakHours.map((h) => (
              <View key={h.hour} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                <View style={{ width: "100%", borderRadius: 3, backgroundColor: colors.primary + "50", height: Math.max(2, (h.bookings / peakMax) * 70) }} />
                <Text style={{ fontSize: 8, color: colors.mutedForeground }}>{h.hour}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function GamesTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Game | "new" | null>(null);
  const load = useCallback(() => { setLoading(true); customFetch<Game[]>("/api/game-organizer/games").then(setGames).catch(() => setGames([])).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);
  async function remove(id: number) {
    Alert.alert("Delete game?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await customFetch(`/api/game-organizer/games/${id}`, { method: "DELETE" }); load(); } catch (e) { Alert.alert("Delete failed", (e as Error).message); } } },
    ]);
  }
  if (editing) return <GameEditor colors={colors} insets={insets} game={editing === "new" ? null : editing} onDone={() => { setEditing(null); load(); }} />;
  if (loading) return <Centered colors={colors} />;
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <PrimaryBtn colors={colors} label="+ Add game" onPress={() => setEditing("new")} />
      {games.length === 0 ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>No games yet.</Text> : games.map((g) => (
        <View key={g.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            {g.coverImageUrl ? <Image source={{ uri: resolveImageUrl(g.coverImageUrl) }} style={styles.thumb} contentFit="cover" /> : <View style={[styles.thumb, { backgroundColor: colors.muted }]} />}
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{g.name}</Text>
              <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{g.pricingModel === "hourly" ? `${inr(g.hourlyRate)}/hr` : `${inr(g.price)}/person`} · {g.category}</Text>
              <StatusPill colors={colors} status={g.approvalStatus} />
            </View>
          </View>
          <View style={styles.rowActions}>
            <SmallBtn colors={colors} icon="pencil-outline" label="Edit" onPress={() => setEditing(g)} />
            <SmallBtn colors={colors} icon="trash-outline" label="Delete" danger onPress={() => remove(g.id)} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function GameEditor({ colors, insets, game, onDone }: { colors: Pal; insets: { bottom: number }; game: Game | null; onDone: () => void }) {
  const isEdit = !!game;
  const [f, setF] = useState({
    name: game?.name ?? "", category: game?.category ?? "Gaming Zone", description: game?.description ?? "", rules: game?.rules ?? "",
    coverImageUrl: game?.coverImageUrl ?? "", images: game?.images ?? ([] as string[]), videos: game?.videos ?? ([] as string[]),
    capacity: String(game?.capacity ?? ""), ageRestriction: game?.ageRestriction ?? "",
    pricingModel: game?.pricingModel ?? "fixed", price: String(game?.price ?? "0"), hourlyRate: String(game?.hourlyRate ?? "0"),
    minHours: String(game?.minHours ?? 1), maxHours: String(game?.maxHours ?? 0),
    startTime: game?.startTime ?? "", endTime: game?.endTime ?? "",
    happeningTonight: game?.happeningTonight ?? true, startingSoon: game?.startingSoon ?? true,
    lastMinuteDeal: game?.lastMinuteDeal ?? false, dealLabel: game?.dealLabel ?? "",
  });
  const [saving, setSaving] = useState(false);
  const upd = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  async function pickCover() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    try { const url = await uploadImageToStorage(res.assets[0].uri, res.assets[0].mimeType ?? undefined); upd("coverImageUrl", url); } catch { Alert.alert("Upload failed"); }
  }
  async function addGalleryImages() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsMultipleSelection: true });
    if (res.canceled || !res.assets.length) return;
    for (const a of res.assets) {
      try { const url = await uploadImageToStorage(a.uri, a.mimeType ?? undefined); setF((p) => ({ ...p, images: [...p.images, url] })); }
      catch { Alert.alert("Upload failed"); }
    }
  }
  async function save() {
    if (!f.name.trim()) { Alert.alert("Game name is required"); return; }
    setSaving(true);
    const body = {
      name: f.name, category: f.category, description: f.description, rules: f.rules, coverImageUrl: f.coverImageUrl,
      images: f.images, videos: f.videos, capacity: Number(f.capacity) || 0, ageRestriction: f.ageRestriction,
      pricingModel: f.pricingModel, price: Number(f.price) || 0, hourlyRate: Number(f.hourlyRate) || 0,
      minHours: Number(f.minHours) || 1, maxHours: Number(f.maxHours) || 0,
      startTime: f.startTime, endTime: f.endTime,
      happeningTonight: f.happeningTonight, startingSoon: f.startingSoon,
      lastMinuteDeal: f.lastMinuteDeal, dealLabel: f.dealLabel,
    };
    try {
      if (isEdit) await customFetch(`/api/game-organizer/games/${game!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      else await customFetch("/api/game-organizer/games", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      Alert.alert(isEdit ? "Game updated" : "Game created", "Sent for admin review.");
      onDone();
    } catch (e) { Alert.alert("Save failed", (e as Error).message); }
    finally { setSaving(false); }
  }
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <BackRow colors={colors} label={isEdit ? "Edit game" : "Add a game"} onBack={onDone} />
      <Pressable onPress={pickCover} style={[styles.coverPick, { borderColor: colors.border, backgroundColor: colors.muted }]}>
        {f.coverImageUrl ? <Image source={{ uri: resolveImageUrl(f.coverImageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : (<><Ionicons name="image-outline" size={26} color={colors.mutedForeground} /><Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>Add cover image</Text></>)}
      </Pressable>
      <Field colors={colors} label="Game name *"><Inp colors={colors} value={f.name} onChangeText={(v) => upd("name", v)} placeholder="e.g. VR Arena" /></Field>
      <Field colors={colors} label="Category"><Chips colors={colors} options={GAME_CATEGORIES} value={f.category} onChange={(v) => upd("category", v)} /></Field>
      <Field colors={colors} label="Description"><Inp colors={colors} value={f.description} onChangeText={(v) => upd("description", v)} placeholder="Details" multiline /></Field>
      <Field colors={colors} label="Rules"><Inp colors={colors} value={f.rules} onChangeText={(v) => upd("rules", v)} placeholder="House rules" multiline /></Field>
      <Field colors={colors} label="Pricing model"><Chips colors={colors} options={["fixed", "hourly"]} value={f.pricingModel} onChange={(v) => upd("pricingModel", v as "fixed" | "hourly")} /></Field>
      {f.pricingModel === "fixed" ? (
        <Field colors={colors} label="Price per person (₹)"><Inp colors={colors} value={f.price} onChangeText={(v) => upd("price", v)} placeholder="0" keyboardType="number-pad" /></Field>
      ) : (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field colors={colors} label="Hourly rate (₹)" flex><Inp colors={colors} value={f.hourlyRate} onChangeText={(v) => upd("hourlyRate", v)} placeholder="0" keyboardType="number-pad" /></Field>
          <Field colors={colors} label="Min hours" flex><Inp colors={colors} value={f.minHours} onChangeText={(v) => upd("minHours", v)} placeholder="1" keyboardType="number-pad" /></Field>
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field colors={colors} label="Capacity" flex><Inp colors={colors} value={f.capacity} onChangeText={(v) => upd("capacity", v)} placeholder="0" keyboardType="number-pad" /></Field>
        <Field colors={colors} label="Age limit" flex><Inp colors={colors} value={f.ageRestriction} onChangeText={(v) => upd("ageRestriction", v)} placeholder="e.g. 12+" /></Field>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Media</Text>
      <GalleryEditor colors={colors} images={f.images} onAdd={addGalleryImages} onRemove={(i) => setF((p) => ({ ...p, images: p.images.filter((_, j) => j !== i) }))} />
      <Field colors={colors} label="Video links (comma separated)"><Inp colors={colors} value={f.videos.join(", ")} onChangeText={(v) => upd("videos", v.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="https://youtube.com/..." /></Field>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Happening Tonight visibility</Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field colors={colors} label="Tonight starts" flex><Inp colors={colors} value={f.startTime} onChangeText={(v) => upd("startTime", v)} placeholder="HH:MM" /></Field>
        <Field colors={colors} label="Tonight ends" flex><Inp colors={colors} value={f.endTime} onChangeText={(v) => upd("endTime", v)} placeholder="HH:MM" /></Field>
      </View>
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
        <Field colors={colors} label="Deal label"><Inp colors={colors} value={f.dealLabel} onChangeText={(v) => upd("dealLabel", v)} placeholder="e.g. 20% off before 7 PM" /></Field>
      )}

      <PrimaryBtn colors={colors} label={saving ? "Saving…" : isEdit ? "Save changes" : "Create game"} onPress={save} disabled={saving} />
    </ScrollView>
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

function PackagesTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [pkgs, setPkgs] = useState<GamePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<GamePackage | "new" | null>(null);
  const load = useCallback(() => { setLoading(true); customFetch<GamePackage[]>("/api/game-organizer/packages").then(setPkgs).catch(() => setPkgs([])).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);
  async function remove(id: number) {
    Alert.alert("Delete package?", "", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await customFetch(`/api/game-organizer/packages/${id}`, { method: "DELETE" }); load(); } catch (e) { Alert.alert("Delete failed", (e as Error).message); } } },
    ]);
  }
  if (editing) return <PackageEditor colors={colors} insets={insets} pkg={editing === "new" ? null : editing} onDone={() => { setEditing(null); load(); }} />;
  if (loading) return <Centered colors={colors} />;
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <PrimaryBtn colors={colors} label="+ Add package" onPress={() => setEditing("new")} />
      {pkgs.length === 0 ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>No packages yet.</Text> : pkgs.map((p) => (
        <View key={p.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{p.name}</Text>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{inr(p.price)} · group of {p.groupSize}</Text>
          <StatusPill colors={colors} status={p.approvalStatus} />
          <View style={styles.rowActions}>
            <SmallBtn colors={colors} icon="pencil-outline" label="Edit" onPress={() => setEditing(p)} />
            <SmallBtn colors={colors} icon="trash-outline" label="Delete" danger onPress={() => remove(p.id)} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function PackageEditor({ colors, insets, pkg, onDone }: { colors: Pal; insets: { bottom: number }; pkg: GamePackage | null; onDone: () => void }) {
  const isEdit = !!pkg;
  const [games, setGames] = useState<Game[]>([]);
  const [f, setF] = useState({
    name: pkg?.name ?? "", description: pkg?.description ?? "", coverImageUrl: pkg?.coverImageUrl ?? "",
    price: String(pkg?.price ?? "0"), groupSize: String(pkg?.groupSize ?? "2"), capacity: String(pkg?.capacity ?? ""), ageRestriction: pkg?.ageRestriction ?? "",
    items: pkg?.items ?? ([] as PackageItem[]), addons: pkg?.addons ?? ([] as PackageAddon[]),
  });
  const [saving, setSaving] = useState(false);
  useEffect(() => { customFetch<Game[]>("/api/game-organizer/games").then(setGames).catch(() => setGames([])); }, []);
  const upd = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  async function pickCover() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    try { const url = await uploadImageToStorage(res.assets[0].uri, res.assets[0].mimeType ?? undefined); upd("coverImageUrl", url); } catch { Alert.alert("Upload failed"); }
  }
  async function save() {
    if (!f.name.trim()) { Alert.alert("Package name is required"); return; }
    setSaving(true);
    const body = {
      name: f.name, description: f.description, coverImageUrl: f.coverImageUrl, images: [],
      price: Number(f.price) || 0, items: f.items, addons: f.addons.map((a) => ({ label: a.label, price: Number(a.price) || 0 })),
      groupSize: Number(f.groupSize) || 1, capacity: Number(f.capacity) || 0, ageRestriction: f.ageRestriction,
    };
    try {
      if (isEdit) await customFetch(`/api/game-organizer/packages/${pkg!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      else await customFetch("/api/game-organizer/packages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      Alert.alert(isEdit ? "Package updated" : "Package created", "Sent for admin review.");
      onDone();
    } catch (e) { Alert.alert("Save failed", (e as Error).message); }
    finally { setSaving(false); }
  }
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <BackRow colors={colors} label={isEdit ? "Edit package" : "Add a package"} onBack={onDone} />
      <Pressable onPress={pickCover} style={[styles.coverPick, { borderColor: colors.border, backgroundColor: colors.muted }]}>
        {f.coverImageUrl ? <Image source={{ uri: resolveImageUrl(f.coverImageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : (<><Ionicons name="image-outline" size={26} color={colors.mutedForeground} /><Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>Add cover image</Text></>)}
      </Pressable>
      <Field colors={colors} label="Package name *"><Inp colors={colors} value={f.name} onChangeText={(v) => upd("name", v)} placeholder="e.g. Party Pack" /></Field>
      <Field colors={colors} label="Description"><Inp colors={colors} value={f.description} onChangeText={(v) => upd("description", v)} placeholder="What's included" multiline /></Field>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field colors={colors} label="Price (₹)" flex><Inp colors={colors} value={f.price} onChangeText={(v) => upd("price", v)} placeholder="0" keyboardType="number-pad" /></Field>
        <Field colors={colors} label="Group size" flex><Inp colors={colors} value={f.groupSize} onChangeText={(v) => upd("groupSize", v)} placeholder="2" keyboardType="number-pad" /></Field>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field colors={colors} label="Capacity" flex><Inp colors={colors} value={f.capacity} onChangeText={(v) => upd("capacity", v)} placeholder="0" keyboardType="number-pad" /></Field>
        <Field colors={colors} label="Age limit" flex><Inp colors={colors} value={f.ageRestriction} onChangeText={(v) => upd("ageRestriction", v)} placeholder="e.g. 10+" /></Field>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Games included</Text>
      {f.items.map((it, i) => (
        <View key={i} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Field colors={colors} label="Game">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Pressable onPress={() => upd("items", f.items.map((x, j) => (j === i ? { ...x, gameId: null } : x)))} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: it.gameId === null ? colors.primary : colors.border, backgroundColor: it.gameId === null ? colors.primary + "22" : "transparent" }}>
                  <Text style={{ color: it.gameId === null ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>Custom item</Text>
                </Pressable>
                {games.map((g) => (
                  <Pressable key={g.id} onPress={() => upd("items", f.items.map((x, j) => (j === i ? { ...x, gameId: g.id, label: x.label || g.name } : x)))} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: it.gameId === g.id ? colors.primary : colors.border, backgroundColor: it.gameId === g.id ? colors.primary + "22" : "transparent" }}>
                    <Text style={{ color: it.gameId === g.id ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }} numberOfLines={1}>{g.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </Field>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Field colors={colors} label="Label" flex><Inp colors={colors} value={it.label} onChangeText={(v) => upd("items", f.items.map((x, j) => (j === i ? { ...x, label: v } : x)))} placeholder="e.g. Arcade credits" /></Field>
            <Field colors={colors} label="Qty" flex><Inp colors={colors} value={String(it.quantity)} onChangeText={(v) => upd("items", f.items.map((x, j) => (j === i ? { ...x, quantity: parseInt(v) || 1 } : x)))} placeholder="1" keyboardType="number-pad" /></Field>
          </View>
          <SmallBtn colors={colors} icon="trash-outline" label="Remove" danger onPress={() => upd("items", f.items.filter((_, j) => j !== i))} />
        </View>
      ))}
      <SecondaryBtn colors={colors} label="+ Add game" onPress={() => upd("items", [...f.items, { gameId: null, label: "", quantity: 1 }])} />

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Add-ons (optional)</Text>
      {f.addons.map((a, i) => (
        <View key={i} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Field colors={colors} label="Add-on" flex><Inp colors={colors} value={a.label} onChangeText={(v) => upd("addons", f.addons.map((x, j) => (j === i ? { ...x, label: v } : x)))} placeholder="e.g. Food combo" /></Field>
            <Field colors={colors} label="Price (₹)" flex><Inp colors={colors} value={String(a.price)} onChangeText={(v) => upd("addons", f.addons.map((x, j) => (j === i ? { ...x, price: Number(v) || 0 } : x)))} placeholder="0" keyboardType="number-pad" /></Field>
          </View>
          <SmallBtn colors={colors} icon="trash-outline" label="Remove" danger onPress={() => upd("addons", f.addons.filter((_, j) => j !== i))} />
        </View>
      ))}
      <SecondaryBtn colors={colors} label="+ Add add-on" onPress={() => upd("addons", [...f.addons, { label: "", price: 0 }])} />

      <PrimaryBtn colors={colors} label={saving ? "Saving…" : isEdit ? "Save changes" : "Create package"} onPress={save} disabled={saving} />
    </ScrollView>
  );
}

function BookingsTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<BookingFilters>({ date: "", mode: "all", status: "all" });

  // Row tap → open that booking's detail modal. (The notification deep-link
  // case is handled by a dedicated modal instance at the
  // GameOrganizerDashboardScreen level, since this tab unmounts whenever the
  // organizer switches to another tab.)
  const [detailBookingId, setDetailBookingId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    if (filters.date) q.set("date", filters.date);
    if (filters.status !== "all") q.set("status", filters.status);
    const qs = q.toString();
    customFetch<BookingRow[]>(`/api/game-organizer/bookings${qs ? `?${qs}` : ""}`).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [filters]);

  async function exportCsv() {
    if (rows.length === 0) return;
    setExporting(true);
    try {
      const header = ["Booking", "Item", "Attendee", "Phone", "Email", "Persons", "Amount", "Date", "Time", "Location", "CheckedIn"];
      const lines = rows.map((r) => [r.id, r.itemName || r.gameName || r.packageName || "", r.attendee, r.phone, r.email, r.persons, r.amount, r.bookingDate, r.time ?? "", r.bookingLocation ?? "", r.checkedIn ? "yes" : "no"]
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

  if (loading) return <Centered colors={colors} />;
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 0 }]}>Booking report</Text>
        <SmallBtn colors={colors} icon="download-outline" label={exporting ? "Exporting…" : "CSV"} onPress={exportCsv} />
      </View>
      <View style={{ marginBottom: 12 }}>
        <BookingFiltersBar filters={filters} onChange={setFilters} />
      </View>
      {rows.length === 0 ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>No bookings yet.</Text> : rows.map((b) => (
        <TouchableOpacity key={b.id} activeOpacity={0.8} onPress={() => setDetailBookingId(b.id)} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{b.attendee || "Guest"}</Text>
            <View style={[styles.checkPill, { backgroundColor: b.checkedIn ? "#16a34a22" : colors.muted }]}><Text style={{ color: b.checkedIn ? "#4ade80" : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{b.checkedIn ? "Checked in" : "Not arrived"}</Text></View>
          </View>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
            {b.itemName || b.gameName || b.packageName || "—"}{b.durationHours ? ` · ${Number(b.durationHours)}h` : ""} · {b.persons} {b.persons === 1 ? "person" : "persons"} · {inr(b.amount)}
          </Text>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{b.bookingDate}{b.time ? ` · ${b.time}` : ""}</Text>
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
      <BookingDetailModal bookingId={detailBookingId} role="game" onClose={() => setDetailBookingId(null)} />
    </ScrollView>
  );
}

function CouponsTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [rows, setRows] = useState<Coupon[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [gameId, setGameId] = useState<string | null>(null);
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const load = useCallback(() => { customFetch<Coupon[]>("/api/game-organizer/coupons").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); customFetch<Game[]>("/api/game-organizer/games").then(setGames).catch(() => {}); }, [load]);
  async function create() {
    if (!code.trim()) { Alert.alert("Enter a code"); return; }
    try {
      await customFetch("/api/game-organizer/coupons", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(), discountType, discountValue: Number(discountValue),
          gameId: gameId ? Number(gameId) : null,
          maxUses: maxUses.trim() ? Math.max(1, parseInt(maxUses) || 1) : null,
          expiresAt: expiresAt.trim() ? new Date(`${expiresAt.trim()}T23:59:59`).toISOString() : null,
        }) });
      setCode(""); setDiscountValue("10"); setGameId(null); setMaxUses(""); setExpiresAt(""); load();
    } catch (e) { Alert.alert("Create failed", (e as Error).message); }
  }
  async function toggle(c: Coupon) { try { await customFetch(`/api/game-organizer/coupons/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !c.active }) }); load(); } catch {} }
  async function remove(c: Coupon) { try { await customFetch(`/api/game-organizer/coupons/${c.id}`, { method: "DELETE" }); load(); } catch {} }
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Field colors={colors} label="New coupon code"><Inp colors={colors} value={code} onChangeText={setCode} placeholder="PLAY10" autoCapitalize="characters" /></Field>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field colors={colors} label="Type" flex><Chips colors={colors} options={["percent", "fixed"]} value={discountType} onChange={setDiscountType} /></Field>
          <Field colors={colors} label="Value" flex><Inp colors={colors} value={discountValue} onChangeText={setDiscountValue} placeholder="10" keyboardType="number-pad" /></Field>
        </View>
        <Field colors={colors} label="Applies to">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Pressable onPress={() => setGameId(null)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: gameId === null ? colors.primary : colors.border, backgroundColor: gameId === null ? colors.primary + "22" : "transparent" }}>
                <Text style={{ color: gameId === null ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>All games & packages</Text>
              </Pressable>
              {games.map((g) => (
                <Pressable key={g.id} onPress={() => setGameId(String(g.id))} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: gameId === String(g.id) ? colors.primary : colors.border, backgroundColor: gameId === String(g.id) ? colors.primary + "22" : "transparent" }}>
                  <Text style={{ color: gameId === String(g.id) ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }} numberOfLines={1}>{g.name}</Text>
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
            {c.gameId ? (games.find((g) => g.id === c.gameId)?.name ?? "One game") : "All games"}
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
    customFetch<LeadsPayload>("/api/game-organizer/leads").then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);
  if (loading) return <Centered colors={colors} />;
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 12 }}>People who viewed your page, and who's already booked.</Text>
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

// ─── Promote / Ads (request to feature a game in the featured slider) ────────
function PromoteTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [games, setGames] = useState<Game[]>([]);
  const [rows, setRows] = useState<AdRequest[]>([]);
  const [gameId, setGameId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => { customFetch<AdRequest[]>("/api/game-organizer/ads").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => {
    customFetch<Game[]>("/api/game-organizer/games").then((all) => setGames(all.filter((g) => g.approvalStatus === "approved"))).catch(() => setGames([]));
    load();
  }, [load]);

  async function submit() {
    if (!gameId) { Alert.alert("Pick a game"); return; }
    setSaving(true);
    try {
      await customFetch("/api/game-organizer/ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId: Number(gameId), note }) });
      setGameId(null); setNote(""); load();
    } catch (e) {
      Alert.alert("Request failed", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 12 }}>Request to feature a game in the Royvento featured slider. Admin reviews each request.</Text>
      <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Field colors={colors} label="Game">
          {games.length === 0 ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No approved games yet.</Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {games.map((g) => {
                const active = gameId === String(g.id);
                return (
                  <Pressable key={g.id} onPress={() => setGameId(String(g.id))} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "22" : "transparent" }}>
                    <Text style={{ color: active ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }} numberOfLines={1}>{g.name}</Text>
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
            <Text style={[styles.rowTitle, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{r.gameName}</Text>
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

function PermToggleRow({ colors, label, checked, onChange }: { colors: Pal; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Switch value={checked} onValueChange={onChange} trackColor={{ true: colors.primary }} />
      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function ManagersTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [rows, setRows] = useState<ManagerRow[]>([]);
  const [email, setEmail] = useState("");
  const [invitePerms, setInvitePerms] = useState<ManagerPerms>({ scan: true, attendance: true, reports: false });
  const load = useCallback(() => { customFetch<ManagerRow[]>("/api/game-organizer/managers").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  async function invite() {
    if (!email.trim()) { Alert.alert("Enter an email"); return; }
    try { await customFetch("/api/game-organizer/managers/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), permissions: invitePerms }) }); setEmail(""); load(); }
    catch (e) { Alert.alert("Invite failed", (e as Error).message); }
  }
  async function togglePerm(row: ManagerRow, key: keyof ManagerPerms, val: boolean) {
    const next = { ...row.permissions, [key]: val };
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, permissions: next } : r)));
    try { await customFetch(`/api/game-organizer/managers/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions: next }) }); }
    catch (e) { Alert.alert("Update failed", (e as Error).message); load(); }
  }
  async function remove(id: number) { try { await customFetch(`/api/game-organizer/managers/${id}`, { method: "DELETE" }); load(); } catch {} }
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Field colors={colors} label="Invite manager by email"><Inp colors={colors} value={email} onChangeText={setEmail} placeholder="name@email.com" keyboardType="email-address" autoCapitalize="none" /></Field>
        <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
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
          <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
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

function EarningsTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [rev, setRev] = useState<RevenuePayload | null>(null);
  const [bank, setBank] = useState<BankingPayload | null>(null);
  const [form, setForm] = useState({ accountHolderName: "", bankName: "", accountNumber: "", ifscCode: "" });
  const load = useCallback(() => {
    customFetch<RevenuePayload>("/api/game-organizer/revenue").then(setRev).catch(() => {});
    customFetch<BankingPayload>("/api/game-organizer/banking").then((b) => { setBank(b); if (b.banking) setForm(b.banking); }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  async function saveBanking() { try { await customFetch("/api/game-organizer/banking", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); Alert.alert("Banking details saved"); load(); } catch (e) { Alert.alert("Save failed", (e as Error).message); } }
  const rows = [...(rev?.games ?? []), ...(rev?.packages ?? [])];
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      <View style={styles.statGrid}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.foreground }]}>{inr(rev?.totals.revenue ?? 0)}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Gross revenue</Text></View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.foreground }]}>{inr(rev?.totals.net ?? 0)}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Net payout</Text></View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.foreground }]}>{inr(rev?.totals.commission ?? 0)}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Commission</Text></View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.foreground }]}>{inr(rev?.commissionOwed ?? 0)}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Owed</Text></View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>By game & package</Text>
      {rows.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>No revenue yet.</Text>
      ) : rows.map((r) => (
        <View key={`${r.type}-${r.id}`} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{r.name}</Text>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground, textTransform: "capitalize" }]}>{r.type} · {Number(r.commissionPct).toFixed(1)}% commission · {r.attended} attended</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
            <Text style={{ color: colors.foreground, fontSize: 12 }}>Revenue {inr(r.revenue)}</Text>
            <Text style={{ color: "#f59e0b", fontSize: 12 }}>Comm. {inr(r.commission)}</Text>
            <Text style={{ color: "#4ade80", fontSize: 12 }}>Net {inr(r.net)}</Text>
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

interface ScannedTicket {
  bookingId: number; itemName: string; organizerName: string; attendee: string;
  persons: number; durationHours: number | null; date: string; time: string; venue: string;
  checkedIn: boolean; checkedInAt: string | null;
}
function ScannerTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ status: string; ticket: ScannedTicket } | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function lookup(raw: string, confirm: boolean) {
    const c = raw.trim(); if (!c) return; setError(null);
    try { const res = await customFetch<{ status: string; ticket: ScannedTicket; message?: string }>("/api/game-organizer/scan-ticket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: c, confirm }) }); setResult({ status: res.status, ticket: res.ticket }); }
    catch (e) { setError((e as Error).message || "Scan failed"); setResult(null); }
  }
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      {scanning && permission?.granted ? (
        <View style={{ height: 300, borderRadius: 16, overflow: "hidden", marginBottom: 12 }}>
          <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={({ data }) => { setScanning(false); setCode(data); lookup(data, false); }} />
        </View>
      ) : (
        <PrimaryBtn colors={colors} label="Scan QR code" onPress={async () => { if (!permission?.granted) { const r = await requestPermission(); if (!r.granted) { Alert.alert("Camera permission needed"); return; } } setScanning(true); }} />
      )}
      <Field colors={colors} label="Or enter code manually"><Inp colors={colors} value={code} onChangeText={setCode} placeholder="Ticket code" autoCapitalize="characters" /></Field>
      <PrimaryBtn colors={colors} label="Verify ticket" onPress={() => lookup(code, false)} />
      {error && <Text style={{ color: colors.redLight, marginTop: 12 }}>{error}</Text>}
      {result && (() => {
        const already = result.status === "ALREADY_CHECKED_IN";
        const checkedIn = result.status === "CHECKED_IN";
        return (
          <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: already ? colors.red : checkedIn ? "#16a34a" : "#f59e0b", marginTop: 14 }]}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>{result.ticket.attendee}</Text>
            <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
              {result.ticket.itemName}{result.ticket.durationHours ? ` · ${result.ticket.durationHours}h` : ""} · {result.ticket.persons} {result.ticket.persons === 1 ? "person" : "persons"}
            </Text>
            <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{result.ticket.date}{result.ticket.time ? ` · ${result.ticket.time}` : ""}{result.ticket.venue ? ` · ${result.ticket.venue}` : ""}</Text>
            <Text style={{ color: already ? colors.redLight : "#4ade80", marginTop: 6, fontFamily: "Inter_600SemiBold" }}>{already ? "Already checked in" : checkedIn ? "Checked in ✓" : "Valid ticket"}</Text>
            {result.status === "VALID" && <PrimaryBtn colors={colors} label="Confirm check-in" onPress={() => lookup(code || String(result.ticket.bookingId), true)} />}
          </View>
        );
      })()}
    </ScrollView>
  );
}

function ProfileTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [o, setO] = useState<GameOrganizer | null>(null);
  const [form, setForm] = useState({ name: "", description: "", supportEmail: "", supportPhone: "", website: "", instagram: "", facebook: "", youtube: "", address: "", mapsUrl: "", city: "", state: "", logoUrl: "", coverImageUrl: "", galleryImages: [] as string[] });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  useEffect(() => { customFetch<GameOrganizer>("/api/game-organizer/profile").then((d) => { setO(d); setForm({ name: d.name, description: d.description, supportEmail: d.supportEmail, supportPhone: d.supportPhone, website: d.website, instagram: d.instagram, facebook: d.facebook, youtube: d.youtube, address: d.address, mapsUrl: d.mapsUrl, city: d.city, state: d.state, logoUrl: d.logoUrl, coverImageUrl: d.coverImageUrl, galleryImages: d.galleryImages ?? [] }); }).catch(() => {}); }, []);
  async function save() { try { await customFetch("/api/game-organizer/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); Alert.alert("Profile saved"); } catch (e) { Alert.alert("Save failed", (e as Error).message); } }
  async function pickAndUpload(kind: "logo" | "cover") {
    const setBusy = kind === "logo" ? setUploadingLogo : setUploadingCover;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", allowsEditing: true, aspect: kind === "logo" ? [1, 1] : [16, 9], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    setBusy(true);
    try {
      const url = await uploadImageToStorage(result.assets[0].uri, result.assets[0].mimeType ?? undefined);
      setForm((p) => (kind === "logo" ? { ...p, logoUrl: url } : { ...p, coverImageUrl: url }));
    } catch { Alert.alert("Upload failed"); }
    finally { setBusy(false); }
  }
  async function addGalleryImages() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsMultipleSelection: true });
    if (res.canceled || !res.assets.length) return;
    for (const a of res.assets) {
      try { const url = await uploadImageToStorage(a.uri, a.mimeType ?? undefined); setForm((p) => ({ ...p, galleryImages: [...p.galleryImages, url] })); }
      catch { Alert.alert("Upload failed"); }
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
        <Pressable onPress={() => pickAndUpload("logo")} style={[styles.coverPick, { height: 90, width: 90, marginBottom: 0, borderColor: colors.border, backgroundColor: colors.muted }]}>
          {uploadingLogo ? <ActivityIndicator color={colors.primary} /> : form.logoUrl ? <Image source={{ uri: resolveImageUrl(form.logoUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="image-outline" size={22} color={colors.mutedForeground} />}
        </Pressable>
      </Field>
      <Field colors={colors} label="Cover image">
        <Pressable onPress={() => pickAndUpload("cover")} style={[styles.coverPick, { height: 100, marginBottom: 0, borderColor: colors.border, backgroundColor: colors.muted }]}>
          {uploadingCover ? <ActivityIndicator color={colors.primary} /> : form.coverImageUrl ? <Image source={{ uri: resolveImageUrl(form.coverImageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="image-outline" size={22} color={colors.mutedForeground} />}
        </Pressable>
      </Field>
      <GalleryEditor colors={colors} images={form.galleryImages} onAdd={addGalleryImages} onRemove={(i) => setForm((p) => ({ ...p, galleryImages: p.galleryImages.filter((_, j) => j !== i) }))} />

      <Field colors={colors} label="Venue name"><Inp colors={colors} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Name" /></Field>
      <Field colors={colors} label="About"><Inp colors={colors} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Describe your venue" multiline /></Field>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field colors={colors} label="City" flex><Inp colors={colors} value={form.city} onChangeText={(v) => setForm({ ...form, city: v })} placeholder="City" /></Field>
        <Field colors={colors} label="State" flex><Inp colors={colors} value={form.state} onChangeText={(v) => setForm({ ...form, state: v })} placeholder="State" /></Field>
      </View>
      <Field colors={colors} label="Address"><Inp colors={colors} value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} placeholder="Address" /></Field>
      <Field colors={colors} label="Google Maps URL"><Inp colors={colors} value={form.mapsUrl} onChangeText={(v) => setForm({ ...form, mapsUrl: v })} placeholder="https://maps.google.com/..." /></Field>
      <Field colors={colors} label="Support email"><Inp colors={colors} value={form.supportEmail} onChangeText={(v) => setForm({ ...form, supportEmail: v })} placeholder="email" keyboardType="email-address" autoCapitalize="none" /></Field>
      <Field colors={colors} label="Support phone"><Inp colors={colors} value={form.supportPhone} onChangeText={(v) => setForm({ ...form, supportPhone: v })} placeholder="phone" keyboardType="phone-pad" /></Field>
      <Field colors={colors} label="Website"><Inp colors={colors} value={form.website} onChangeText={(v) => setForm({ ...form, website: v })} placeholder="https://" autoCapitalize="none" /></Field>
      <Field colors={colors} label="Instagram"><Inp colors={colors} value={form.instagram} onChangeText={(v) => setForm({ ...form, instagram: v })} placeholder="https://instagram.com/..." autoCapitalize="none" /></Field>
      <Field colors={colors} label="Facebook"><Inp colors={colors} value={form.facebook} onChangeText={(v) => setForm({ ...form, facebook: v })} placeholder="https://facebook.com/..." autoCapitalize="none" /></Field>
      <Field colors={colors} label="YouTube"><Inp colors={colors} value={form.youtube} onChangeText={(v) => setForm({ ...form, youtube: v })} placeholder="https://youtube.com/..." autoCapitalize="none" /></Field>
      <PrimaryBtn colors={colors} label="Save profile" onPress={save} />
    </ScrollView>
  );
}

// ─── shared bits ──────────────────────────────────────────────────────────────
function Centered({ colors }: { colors: Pal }) { return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 }}><ActivityIndicator color={colors.primary} /></View>; }
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
        return <Pressable key={o} onPress={() => onChange(o)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "22" : "transparent" }}><Text style={{ color: active ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>{o.replace(/_/g, " ")}</Text></Pressable>;
      })}
    </View>
  );
}
function PrimaryBtn({ colors, label, onPress, disabled, flex }: { colors: Pal; label: string; onPress: () => void; disabled?: boolean; flex?: boolean }) {
  return <TouchableOpacity onPress={onPress} disabled={disabled} style={{ flex: flex ? 1 : undefined, backgroundColor: disabled ? colors.muted : colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 }}><Text style={{ color: disabled ? colors.mutedForeground : colors.primaryForeground, fontFamily: "Inter_700Bold" }}>{label}</Text></TouchableOpacity>;
}
function SecondaryBtn({ colors, label, onPress, flex }: { colors: Pal; label: string; onPress: () => void; flex?: boolean }) {
  return <TouchableOpacity onPress={onPress} style={{ flex: flex ? 1 : undefined, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 8 }}><Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{label}</Text></TouchableOpacity>;
}
function SmallBtn({ colors, icon, label, onPress, danger }: { colors: Pal; icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void; danger?: boolean }) {
  return <TouchableOpacity onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: danger ? colors.red + "1a" : colors.muted }}><Ionicons name={icon} size={13} color={danger ? colors.redLight : colors.foreground} /><Text style={{ color: danger ? colors.redLight : colors.foreground, fontSize: 12 }}>{label}</Text></TouchableOpacity>;
}
function BackRow({ colors, label, onBack }: { colors: Pal; label: string; onBack: () => void }) {
  return <Pressable onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}><Ionicons name="arrow-back" size={20} color={colors.foreground} /><Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>{label}</Text></Pressable>;
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
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, marginBottom: 8 },
});
