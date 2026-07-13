import { resolveImageUrl } from "@/lib/resolveImageUrl";
import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileFooter } from "@/components/MobileFooter";
import { FollowButton } from "@/components/FollowButton";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

// ── Game Organizer profile (mobile) ──────────────────────────────────────────
// Mirror of the web /game-organizers/:slug page. Shows the organizer, their
// bookable games & packages, reviews, and an in-screen booking flow that POSTs
// to /api/game-organizers/:slug/book and returns a QR ticket code.

interface GameOrganizer {
  id: number; name: string; slug: string; description: string;
  logoUrl: string; coverImageUrl: string; galleryImages: string[] | null; website: string;
  instagram: string; facebook: string; youtube: string;
  supportEmail: string; supportPhone: string; address: string; mapsUrl: string;
  city: string; state: string; verified: boolean;
}
interface PublicGame {
  id: number; name: string; slug: string; category: string; description: string; rules: string;
  coverImageUrl: string; images: string[]; videos: string[]; capacity: number; ageRestriction: string;
  pricingModel: "fixed" | "hourly"; price: string; hourlyRate: string; minHours: number; maxHours: number;
}
interface PackageItem { gameId: number | null; label: string; quantity: number; }
interface PublicPackage {
  id: number; name: string; slug: string; description: string; coverImageUrl: string; images: string[];
  price: string; items: PackageItem[] | null; groupSize: number; capacity: number; ageRestriction: string;
}
interface Review { id: number; userId: number; rating: number; comment: string; createdAt: string; }
interface Stats { totalGames: number; totalPackages: number; avgRating: number; reviewCount: number; }
interface ProfilePayload { organizer: GameOrganizer; games: PublicGame[]; packages: PublicPackage[]; reviews: Review[]; stats: Stats; }

type Bookable = { kind: "game"; game: PublicGame } | { kind: "package"; pkg: PublicPackage };

function formatINR(v: number) {
  return v > 0 ? `₹${Math.round(v).toLocaleString("en-IN")}` : "Free";
}
function gamePriceLabel(g: PublicGame): string {
  if (g.pricingModel === "hourly") return `${formatINR(Number(g.hourlyRate))}/hr`;
  return Number(g.price) > 0 ? `${formatINR(Number(g.price))}/person` : "Free";
}

export default function GameOrganizerProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [booking, setBooking] = useState<Bookable | null>(null);

  const { data, isLoading } = useQuery<ProfilePayload | null>({
    queryKey: ["game-organizer", slug],
    queryFn: async () => {
      const res = await customFetch<ProfilePayload>(`/api/game-organizers/${slug}`);
      customFetch(`/api/game-organizers/${slug}/view`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }).catch(() => {});
      return res;
    },
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="game-controller-outline" size={40} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, marginTop: 12, fontFamily: "Inter_400Regular" }}>Game organizer not found.</Text>
        <Pressable onPress={() => router.back()} style={[styles.backInline, { borderColor: colors.border }]}>
          <Text style={{ color: colors.foreground }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const { organizer, games, packages, stats } = data;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Cover */}
        <View style={styles.cover}>
          {organizer.coverImageUrl ? (
            <Image source={{ uri: resolveImageUrl(organizer.coverImageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.muted }]} />
          )}
          <LinearGradient colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0.55)", colors.background]} style={StyleSheet.absoluteFill} />
          <Pressable style={[styles.backBtn, { top: topPadding + 8 }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
        </View>

        {/* Identity */}
        <View style={styles.identity}>
          {organizer.logoUrl ? (
            <Image source={{ uri: resolveImageUrl(organizer.logoUrl) }} style={[styles.logo, { borderColor: colors.border }]} contentFit="cover" />
          ) : (
            <View style={[styles.logo, { borderColor: colors.border, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="game-controller" size={28} color={colors.primary} />
            </View>
          )}
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={2}>{organizer.name}</Text>
            {organizer.verified && <Ionicons name="checkmark-circle" size={18} color="#f59e0b" />}
          </View>
          {!!(organizer.city || organizer.state) && (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {[organizer.city, organizer.state].filter(Boolean).join(", ")}
              </Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatBox label="Games" value={String(stats.totalGames)} />
          <StatBox label="Packages" value={String(stats.totalPackages)} />
          <StatBox label="Rating" value={stats.avgRating > 0 ? stats.avgRating.toFixed(1) : "—"} />
          <StatBox label="Reviews" value={String(stats.reviewCount)} />
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 16, alignItems: "flex-start" }}>
          <FollowButton targetType="game_organizer" targetId={organizer.id} name={organizer.name} />
        </View>

        {!!organizer.description && (
          <Text style={[styles.description, { color: colors.mutedForeground }]}>{organizer.description}</Text>
        )}

        {/* Games */}
        {games.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Available Games</Text>
            {games.map((g) => (
              <View key={g.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {g.coverImageUrl ? (
                  <Image source={{ uri: resolveImageUrl(g.coverImageUrl) }} style={styles.itemImage} contentFit="cover" />
                ) : (
                  <View style={[styles.itemImage, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="game-controller-outline" size={24} color={colors.mutedForeground} />
                  </View>
                )}
                <View style={styles.itemBody}>
                  <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>{g.name}</Text>
                  {!!g.category && <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{g.category}</Text>}
                  <Text style={[styles.itemPrice, { color: colors.primary }]}>{gamePriceLabel(g)}</Text>
                  <Pressable onPress={() => setBooking({ kind: "game", game: g })} style={[styles.bookBtn, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.bookBtnText, { color: colors.primaryForeground }]}>Book</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Packages */}
        {packages.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Packages</Text>
            {packages.map((p) => (
              <View key={p.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {p.coverImageUrl ? (
                  <Image source={{ uri: resolveImageUrl(p.coverImageUrl) }} style={styles.itemImage} contentFit="cover" />
                ) : (
                  <View style={[styles.itemImage, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="cube-outline" size={24} color={colors.mutedForeground} />
                  </View>
                )}
                <View style={styles.itemBody}>
                  <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>{p.name}</Text>
                  {(p.items ?? []).slice(0, 3).map((it, i) => (
                    <View key={i} style={styles.metaItem}>
                      <Ionicons name="checkmark-circle" size={11} color={colors.primary} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>{it.label}{it.quantity > 1 ? ` ×${it.quantity}` : ""}</Text>
                    </View>
                  ))}
                  <Text style={[styles.itemPrice, { color: colors.primary }]}>{formatINR(Number(p.price))}</Text>
                  <Pressable onPress={() => setBooking({ kind: "package", pkg: p })} style={[styles.bookBtn, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.bookBtnText, { color: colors.primaryForeground }]}>Book package</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        <MobileFooter />
        <View style={{ height: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }} />
      </ScrollView>

      <BookingModal slug={slug!} bookable={booking} onClose={() => setBooking(null)} />
    </View>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={[styles.statBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const colors = useColors();
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} style={[styles.stepBtn, { borderColor: colors.border }]}>
        <Ionicons name="remove" size={16} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.stepValue, { color: colors.foreground }]}>{value}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} style={[styles.stepBtn, { borderColor: colors.border }]}>
        <Ionicons name="add" size={16} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

function BookingModal({ slug, bookable, onClose }: { slug: string; bookable: Bookable | null; onClose: () => void }) {
  const colors = useColors();
  const { user } = useAuth();
  const [persons, setPersons] = useState(1);
  const [hours, setHours] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [coupon, setCoupon] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ ticketCode: string; total: number } | null>(null);

  const game = bookable?.kind === "game" ? bookable.game : null;
  const pkg = bookable?.kind === "package" ? bookable.pkg : null;
  const isGame = !!game;
  const isHourly = game?.pricingModel === "hourly";

  const subtotal = useMemo(() => {
    if (game) return game.pricingModel === "hourly" ? (Number(game.hourlyRate) || 0) * hours : (Number(game.price) || 0) * persons;
    if (pkg) return (Number(pkg.price) || 0) * quantity;
    return 0;
  }, [game, pkg, persons, hours, quantity]);

  const maxPersons = game?.capacity && game.capacity > 0 ? game.capacity : 50;

  async function submit() {
    if (!bookable) return;
    if (!name.trim()) { Alert.alert("Please enter your name"); return; }
    setSubmitting(true);
    try {
      const res = await customFetch<{ ticketCode: string; total: number; bookingId: number }>(`/api/game-organizers/${slug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: isGame ? game!.id : null,
          packageId: isGame ? null : pkg!.id,
          persons, hours: isHourly ? hours : 0, quantity,
          date: date || undefined, time: time || undefined,
          name: name.trim(), phone: phone.trim(), couponCode: coupon.trim(), pointsToUse: 0,
        }),
      });
      setConfirmation({ ticketCode: res.ticketCode, total: res.total });
    } catch (e: any) {
      Alert.alert("Booking failed", e?.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    setConfirmation(null);
    setPersons(1); setHours(1); setQuantity(1); setDate(""); setTime(""); setCoupon("");
    onClose();
  }

  const itemName = game?.name ?? pkg?.name ?? "";

  return (
    <Modal visible={!!bookable} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={close}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {confirmation ? (
            <View style={{ alignItems: "center", gap: 8, paddingVertical: 8 }}>
              <Ionicons name="ticket" size={42} color="#10b981" />
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>You're booked!</Text>
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{itemName}</Text>
              <View style={[styles.codeBox, { borderColor: colors.primary + "40" }]}>
                <Text style={[styles.codeLabel, { color: colors.mutedForeground }]}>BOOKING CODE</Text>
                <Text style={[styles.codeValue, { color: colors.primary }]}>{confirmation.ticketCode}</Text>
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{formatINR(confirmation.total)}</Text>
              </View>
              <Pressable onPress={() => { close(); router.push("/(tabs)/bookings" as never); }} style={[styles.submitBtn, { backgroundColor: colors.primary }]}>
                <Text style={[styles.submitBtnText, { color: colors.primaryForeground }]}>View QR ticket in My Bookings</Text>
              </Pressable>
              <Pressable onPress={close}><Text style={{ color: colors.mutedForeground, paddingVertical: 8 }}>Done</Text></Pressable>
            </View>
          ) : (
            <>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>Book {itemName}</Text>
                <Pressable onPress={close}><Ionicons name="close" size={22} color={colors.mutedForeground} /></Pressable>
              </View>
              <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
                {isGame && !isHourly && (
                  <Field label={`Persons (max ${maxPersons})`}><Stepper value={persons} min={1} max={maxPersons} onChange={setPersons} /></Field>
                )}
                {isGame && isHourly && (
                  <Field label="Hours"><Stepper value={hours} min={game?.minHours || 1} max={game?.maxHours || 8} onChange={setHours} /></Field>
                )}
                {!isGame && (
                  <Field label="Quantity"><Stepper value={quantity} min={1} max={20} onChange={setQuantity} /></Field>
                )}
                <Field label="Date (optional)"><Input value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" /></Field>
                <Field label="Time (optional)"><Input value={time} onChangeText={setTime} placeholder="e.g. 19:00" /></Field>
                <Field label="Your name"><Input value={name} onChangeText={setName} placeholder="Full name" /></Field>
                <Field label="Phone"><Input value={phone} onChangeText={setPhone} placeholder="Phone number" keyboardType="phone-pad" /></Field>
                <Field label="Coupon (optional)"><Input value={coupon} onChangeText={setCoupon} placeholder="Coupon code" autoCapitalize="characters" /></Field>

                <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Estimated total</Text>
                  <Text style={[styles.itemPrice, { color: colors.foreground }]}>{formatINR(subtotal)}</Text>
                </View>
              </ScrollView>
              <Pressable disabled={submitting} onPress={submit} style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }]}>
                {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.submitBtnText, { color: colors.primaryForeground }]}>Confirm booking</Text>}
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      {children}
    </View>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  const colors = useColors();
  return (
    <TextInput
      {...props}
      placeholderTextColor={colors.mutedForeground}
      style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  backInline: { marginTop: 16, borderWidth: 1, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  cover: { height: 200, position: "relative" },
  backBtn: { position: "absolute", left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  identity: { paddingHorizontal: 20, marginTop: -34, gap: 6 },
  logo: { width: 72, height: 72, borderRadius: 18, borderWidth: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  name: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5, flexShrink: 1 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular", flexShrink: 1 },
  statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: 16 },
  statBox: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", gap: 2 },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.6 },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, paddingHorizontal: 20, marginTop: 16 },
  section: { paddingHorizontal: 20, marginTop: 24, gap: 12 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  itemCard: { flexDirection: "row", borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  itemImage: { width: 110, height: "100%", minHeight: 120 },
  itemBody: { flex: 1, padding: 12, gap: 4 },
  itemName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  itemPrice: { fontSize: 14, fontFamily: "Inter_700Bold", marginTop: 2 },
  bookBtn: { alignSelf: "flex-start", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginTop: 6 },
  bookBtnText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, paddingBottom: 32, gap: 14 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", flexShrink: 1 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 16 },
  stepBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stepValue: { fontSize: 16, fontFamily: "Inter_700Bold", minWidth: 24, textAlign: "center" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, paddingTop: 12, marginTop: 4 },
  submitBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  submitBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  codeBox: { borderWidth: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 24, alignItems: "center", gap: 4, marginVertical: 8 },
  codeLabel: { fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 2 },
  codeValue: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 3 },
});
