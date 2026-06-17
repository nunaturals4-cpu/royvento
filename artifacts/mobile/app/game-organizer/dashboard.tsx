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

// ── Game Organizer dashboard (mobile) ────────────────────────────────────────
// Mirror of the web /dashboard/game-organizer page. Tabs: Overview · Games
// (create/edit, fixed or hourly pricing) · Packages · Bookings · Coupons ·
// Managers · Earnings · Scanner · Profile. Hits /api/game-organizer/* endpoints.

type Pal = ReturnType<typeof useColors>;

interface GameOrganizer {
  id: number; name: string; slug: string; description: string;
  logoUrl: string; coverImageUrl: string; website: string;
  instagram: string; facebook: string; youtube: string;
  supportEmail: string; supportPhone: string; address: string; city: string; state: string;
  verified: boolean; status: string;
}
interface Game {
  id: number; name: string; slug: string; category: string; description: string; rules: string;
  coverImageUrl: string; capacity: number; ageRestriction: string;
  pricingModel: "fixed" | "hourly"; price: string; hourlyRate: string; minHours: number; maxHours: number;
  active: boolean; approvalStatus: string; rejectionReason: string; soldCount: number;
}
interface GamePackage {
  id: number; name: string; slug: string; description: string; coverImageUrl: string;
  price: string; groupSize: number; capacity: number; ageRestriction: string;
  approvalStatus: string; rejectionReason: string; soldCount: number;
}
interface Analytics {
  totals: { bookings: number; tickets: number; revenue: string; attended: number; attendanceRate: number };
  perEvent?: { id: number; title: string; tickets: number; revenue: string; attended: number }[];
}
interface BookingRow {
  id: number; quantity: number; amount: string; checkedIn: boolean; attendee: string; phone: string; eventTitle: string; ticketType: string;
}
interface Coupon {
  id: number; code: string; discountType: string; discountValue: string; gameId: number | null;
  active: boolean; maxUses: number | null; usedCount: number; expiresAt: string | null;
}
interface ManagerRow { id: number; invitedEmail: string; status: string; manager: { id: number; name: string; email: string } | null; }
interface RevenuePayload { totals: { revenue: string; commission: string; gatewayFee: string; net: string }; commissionOwed: string; }
interface BankingPayload { banking: { accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string } | null; }

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
  { key: "coupons", label: "Coupons", icon: "pricetag-outline" },
  { key: "managers", label: "Managers", icon: "people-outline" },
  { key: "earnings", label: "Earnings", icon: "cash-outline" },
  { key: "scanner", label: "Scanner", icon: "qr-code-outline" },
  { key: "profile", label: "Profile", icon: "settings-outline" },
];

export default function GameOrganizerDashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const [tab, setTab] = useState("overview");

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
        {tab === "coupons" && <CouponsTab colors={colors} insets={insets} />}
        {tab === "managers" && <ManagersTab colors={colors} insets={insets} />}
        {tab === "earnings" && <EarningsTab colors={colors} insets={insets} />}
        {tab === "scanner" && <ScannerTab colors={colors} insets={insets} />}
        {tab === "profile" && <ProfileTab colors={colors} insets={insets} />}
      </View>
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
    { label: "Players", value: String(t?.tickets ?? 0), icon: "people-outline" as const },
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
            {g.coverImageUrl ? <Image source={{ uri: g.coverImageUrl }} style={styles.thumb} contentFit="cover" /> : <View style={[styles.thumb, { backgroundColor: colors.muted }]} />}
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
    coverImageUrl: game?.coverImageUrl ?? "", capacity: String(game?.capacity ?? ""), ageRestriction: game?.ageRestriction ?? "",
    pricingModel: game?.pricingModel ?? "fixed", price: String(game?.price ?? "0"), hourlyRate: String(game?.hourlyRate ?? "0"),
    minHours: String(game?.minHours ?? 1), maxHours: String(game?.maxHours ?? 0),
  });
  const [saving, setSaving] = useState(false);
  const upd = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  async function pickCover() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    try { const url = await uploadImageToStorage(res.assets[0].uri, res.assets[0].mimeType ?? undefined); upd("coverImageUrl", url); } catch { Alert.alert("Upload failed"); }
  }
  async function save() {
    if (!f.name.trim()) { Alert.alert("Game name is required"); return; }
    setSaving(true);
    const body = {
      name: f.name, category: f.category, description: f.description, rules: f.rules, coverImageUrl: f.coverImageUrl,
      images: [], videos: [], capacity: Number(f.capacity) || 0, ageRestriction: f.ageRestriction,
      pricingModel: f.pricingModel, price: Number(f.price) || 0, hourlyRate: Number(f.hourlyRate) || 0,
      minHours: Number(f.minHours) || 1, maxHours: Number(f.maxHours) || 0,
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
        {f.coverImageUrl ? <Image source={{ uri: f.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : (<><Ionicons name="image-outline" size={26} color={colors.mutedForeground} /><Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>Add cover image</Text></>)}
      </Pressable>
      <Field colors={colors} label="Game name *"><Inp colors={colors} value={f.name} onChangeText={(v) => upd("name", v)} placeholder="e.g. VR Arena" /></Field>
      <Field colors={colors} label="Category"><Chips colors={colors} options={GAME_CATEGORIES} value={f.category} onChange={(v) => upd("category", v)} /></Field>
      <Field colors={colors} label="Description"><Inp colors={colors} value={f.description} onChangeText={(v) => upd("description", v)} placeholder="Details" multiline /></Field>
      <Field colors={colors} label="Rules"><Inp colors={colors} value={f.rules} onChangeText={(v) => upd("rules", v)} placeholder="House rules" multiline /></Field>
      <Field colors={colors} label="Pricing model"><Chips colors={colors} options={["fixed", "hourly"]} value={f.pricingModel} onChange={(v) => upd("pricingModel", v)} /></Field>
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
      <PrimaryBtn colors={colors} label={saving ? "Saving…" : isEdit ? "Save changes" : "Create game"} onPress={save} disabled={saving} />
    </ScrollView>
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
  const [f, setF] = useState({ name: pkg?.name ?? "", description: pkg?.description ?? "", coverImageUrl: pkg?.coverImageUrl ?? "", price: String(pkg?.price ?? "0"), groupSize: String(pkg?.groupSize ?? "2"), capacity: String(pkg?.capacity ?? ""), ageRestriction: pkg?.ageRestriction ?? "" });
  const [saving, setSaving] = useState(false);
  const upd = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    if (!f.name.trim()) { Alert.alert("Package name is required"); return; }
    setSaving(true);
    const body = { name: f.name, description: f.description, coverImageUrl: f.coverImageUrl, images: [], price: Number(f.price) || 0, items: [], addons: [], groupSize: Number(f.groupSize) || 1, capacity: Number(f.capacity) || 0, ageRestriction: f.ageRestriction };
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
      <Field colors={colors} label="Package name *"><Inp colors={colors} value={f.name} onChangeText={(v) => upd("name", v)} placeholder="e.g. Party Pack" /></Field>
      <Field colors={colors} label="Description"><Inp colors={colors} value={f.description} onChangeText={(v) => upd("description", v)} placeholder="What's included" multiline /></Field>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field colors={colors} label="Price (₹)" flex><Inp colors={colors} value={f.price} onChangeText={(v) => upd("price", v)} placeholder="0" keyboardType="number-pad" /></Field>
        <Field colors={colors} label="Group size" flex><Inp colors={colors} value={f.groupSize} onChangeText={(v) => upd("groupSize", v)} placeholder="2" keyboardType="number-pad" /></Field>
      </View>
      <Field colors={colors} label="Capacity"><Inp colors={colors} value={f.capacity} onChangeText={(v) => upd("capacity", v)} placeholder="0" keyboardType="number-pad" /></Field>
      <PrimaryBtn colors={colors} label={saving ? "Saving…" : isEdit ? "Save changes" : "Create package"} onPress={save} disabled={saving} />
    </ScrollView>
  );
}

function BookingsTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { customFetch<BookingRow[]>("/api/game-organizer/bookings").then(setRows).catch(() => setRows([])).finally(() => setLoading(false)); }, []);
  if (loading) return <Centered colors={colors} />;
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      {rows.length === 0 ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>No bookings yet.</Text> : rows.map((b) => (
        <View key={b.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{b.attendee || "Guest"}</Text>
            <View style={[styles.checkPill, { backgroundColor: b.checkedIn ? "#16a34a22" : colors.muted }]}><Text style={{ color: b.checkedIn ? "#4ade80" : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{b.checkedIn ? "Checked in" : "Not arrived"}</Text></View>
          </View>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{b.eventTitle} · {b.ticketType} ×{b.quantity} · {inr(b.amount)}</Text>
          {!!b.phone && <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{b.phone}</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

function CouponsTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [rows, setRows] = useState<Coupon[]>([]);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const load = useCallback(() => { customFetch<Coupon[]>("/api/game-organizer/coupons").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  async function create() {
    if (!code.trim()) { Alert.alert("Enter a code"); return; }
    try { await customFetch("/api/game-organizer/coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code.trim(), discountType, discountValue: Number(discountValue), gameId: null, maxUses: null, expiresAt: null }) }); setCode(""); setDiscountValue("10"); load(); }
    catch (e) { Alert.alert("Create failed", (e as Error).message); }
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

function ManagersTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [rows, setRows] = useState<ManagerRow[]>([]);
  const [email, setEmail] = useState("");
  const load = useCallback(() => { customFetch<ManagerRow[]>("/api/game-organizer/managers").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  async function invite() {
    if (!email.trim()) { Alert.alert("Enter an email"); return; }
    try { await customFetch("/api/game-organizer/managers/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), permissions: { scan: true, attendance: true, reports: false } }) }); setEmail(""); load(); }
    catch (e) { Alert.alert("Invite failed", (e as Error).message); }
  }
  async function remove(id: number) { try { await customFetch(`/api/game-organizer/managers/${id}`, { method: "DELETE" }); load(); } catch {} }
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

function EarningsTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [rev, setRev] = useState<RevenuePayload | null>(null);
  const [form, setForm] = useState({ accountHolderName: "", bankName: "", accountNumber: "", ifscCode: "" });
  const load = useCallback(() => {
    customFetch<RevenuePayload>("/api/game-organizer/revenue").then(setRev).catch(() => {});
    customFetch<BankingPayload>("/api/game-organizer/banking").then((b) => { if (b.banking) setForm(b.banking); }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  async function saveBanking() { try { await customFetch("/api/game-organizer/banking", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); Alert.alert("Banking details saved"); } catch (e) { Alert.alert("Save failed", (e as Error).message); } }
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

interface ScannedTicket { bookingId: number; eventTitle: string; ticketType: string; attendee: string; quantity: number; venue: string; checkedIn: boolean; }
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
      {result && (
        <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: result.status === "ALREADY_CHECKED_IN" ? colors.red : "#16a34a", marginTop: 14 }]}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]}>{result.ticket.attendee}</Text>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{result.ticket.eventTitle} · {result.ticket.ticketType} ×{result.ticket.quantity}</Text>
          <Text style={{ color: result.status === "ALREADY_CHECKED_IN" ? colors.redLight : "#4ade80", marginTop: 6, fontFamily: "Inter_600SemiBold" }}>{result.status === "ALREADY_CHECKED_IN" ? "Already checked in" : result.status === "CHECKED_IN" ? "Checked in ✓" : "Valid ticket"}</Text>
          {result.status === "VALID" && <PrimaryBtn colors={colors} label="Confirm check-in" onPress={() => lookup(code || String(result.ticket.bookingId), true)} />}
        </View>
      )}
    </ScrollView>
  );
}

function ProfileTab({ colors, insets }: { colors: Pal; insets: { bottom: number } }) {
  const [o, setO] = useState<GameOrganizer | null>(null);
  const [form, setForm] = useState({ name: "", description: "", supportEmail: "", supportPhone: "", website: "", instagram: "", facebook: "", youtube: "", address: "", logoUrl: "", coverImageUrl: "" });
  useEffect(() => { customFetch<GameOrganizer>("/api/game-organizer/profile").then((d) => { setO(d); setForm({ name: d.name, description: d.description, supportEmail: d.supportEmail, supportPhone: d.supportPhone, website: d.website, instagram: d.instagram, facebook: d.facebook, youtube: d.youtube, address: d.address, logoUrl: d.logoUrl, coverImageUrl: d.coverImageUrl }); }).catch(() => {}); }, []);
  async function save() { try { await customFetch("/api/game-organizer/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); Alert.alert("Profile saved"); } catch (e) { Alert.alert("Save failed", (e as Error).message); } }
  return (
    <ScrollView contentContainerStyle={[{ padding: 16 }, useBottomPad(insets)]}>
      {o && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <StatusPill colors={colors} status={o.status === "approved" ? "approved" : o.status} />
          {o.verified && <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Ionicons name="checkmark-circle" size={14} color="#f59e0b" /><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Verified</Text></View>}
        </View>
      )}
      <Field colors={colors} label="Venue name"><Inp colors={colors} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Name" /></Field>
      <Field colors={colors} label="About"><Inp colors={colors} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Describe your venue" multiline /></Field>
      <Field colors={colors} label="Address"><Inp colors={colors} value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} placeholder="Address" /></Field>
      <Field colors={colors} label="Support email"><Inp colors={colors} value={form.supportEmail} onChangeText={(v) => setForm({ ...form, supportEmail: v })} placeholder="email" keyboardType="email-address" autoCapitalize="none" /></Field>
      <Field colors={colors} label="Support phone"><Inp colors={colors} value={form.supportPhone} onChangeText={(v) => setForm({ ...form, supportPhone: v })} placeholder="phone" keyboardType="phone-pad" /></Field>
      <Field colors={colors} label="Website"><Inp colors={colors} value={form.website} onChangeText={(v) => setForm({ ...form, website: v })} placeholder="https://" autoCapitalize="none" /></Field>
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
});
