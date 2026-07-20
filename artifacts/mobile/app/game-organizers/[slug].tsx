import { resolveImageUrl } from "@/lib/resolveImageUrl";
import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
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

interface EventCoupon { code: string; discountType: string; discountValue: string; gameId: number | null; }

type Bookable = { kind: "game"; game: PublicGame } | { kind: "package"; pkg: PublicPackage };

const WEB_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? "royvento.com"}`;
const POINTS_RUPEE_RATE = 0.05;

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

  const { organizer, games, packages, reviews, stats } = data;
  const gallery = [...(organizer.galleryImages ?? []), ...games.flatMap((g) => g.images || [])].slice(0, 12);

  async function handleShare() {
    try { await Share.share({ title: organizer.name, message: `Check out ${organizer.name} on Royvento!\n\n${WEB_BASE}/game-organizers/${organizer.slug}` }); }
    catch { /* share dismissed or failed — no-op */ }
  }
  function openSocial(href: string) {
    Linking.openURL(/^https?:\/\//.test(href) ? href : `https://${href}`);
  }
  function openMaps() {
    if (organizer.mapsUrl) { Linking.openURL(organizer.mapsUrl); return; }
    const q = encodeURIComponent([organizer.address, organizer.city, organizer.state].filter(Boolean).join(", "));
    if (q) Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  }

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
          <Pressable style={[styles.shareBtn, { top: topPadding + 8 }]} onPress={handleShare}>
            <Ionicons name="share-social-outline" size={20} color="#fff" />
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

        {(!!organizer.website || !!organizer.instagram || !!organizer.facebook || !!organizer.youtube || !!organizer.supportEmail) && (
          <View style={[styles.section, { marginTop: 20 }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Connect</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {!!organizer.website && <SocialChip icon="globe-outline" label="Website" onPress={() => openSocial(organizer.website)} colors={colors} />}
              {!!organizer.instagram && <SocialChip icon="logo-instagram" label="Instagram" onPress={() => openSocial(organizer.instagram)} colors={colors} />}
              {!!organizer.facebook && <SocialChip icon="logo-facebook" label="Facebook" onPress={() => openSocial(organizer.facebook)} colors={colors} />}
              {!!organizer.youtube && <SocialChip icon="logo-youtube" label="YouTube" onPress={() => openSocial(organizer.youtube)} colors={colors} />}
            </View>
            {!!organizer.supportEmail && (
              <Pressable onPress={() => Linking.openURL(`mailto:${organizer.supportEmail}`)}>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 10 }}>{organizer.supportEmail}</Text>
              </Pressable>
            )}
          </View>
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

        {gallery.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Gallery</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {gallery.map((src, i) => (
                <View key={i} style={styles.galleryThumb}>
                  <Image source={{ uri: resolveImageUrl(src) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                </View>
              ))}
            </View>
          </View>
        )}

        {(!!organizer.address || !!organizer.mapsUrl) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Location</Text>
            <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.metaText, { color: colors.foreground }]}>{[organizer.address, organizer.city, organizer.state].filter(Boolean).join(", ") || "India"}</Text>
              <Pressable onPress={openMaps} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}>
                <Text style={{ color: colors.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Open in Maps</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        )}

        {reviews.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Reviews & ratings</Text>
            {reviews.map((r) => (
              <View key={r.id} style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flexDirection: "row", gap: 2, marginBottom: 4 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Ionicons key={i} name={i < r.rating ? "star" : "star-outline"} size={13} color="#f59e0b" />
                  ))}
                </View>
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{r.comment || "—"}</Text>
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

function SocialChip({ icon, label, onPress, colors }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
      <Ionicons name={icon} size={14} color={colors.mutedForeground} />
      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>{label}</Text>
    </Pressable>
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
  const [useCoins, setUseCoins] = useState(false);
  const [coupons, setCoupons] = useState<EventCoupon[]>([]);
  const [points, setPoints] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ ticketCode: string; total: number } | null>(null);

  const game = bookable?.kind === "game" ? bookable.game : null;
  const pkg = bookable?.kind === "package" ? bookable.pkg : null;
  const isGame = !!game;
  const isHourly = game?.pricingModel === "hourly";
  const itemId = game?.id ?? pkg?.id ?? 0;

  useEffect(() => {
    if (!bookable) return;
    setPersons(1); setHours(game?.minHours || 1); setQuantity(1); setDate(""); setTime(""); setCoupon(""); setUseCoins(false); setConfirmation(null);
    customFetch<EventCoupon[]>(`/api/game-organizers/${slug}/coupons`).then(setCoupons).catch(() => setCoupons([]));
    customFetch<{ points: number }>("/api/users/me/discounts").then((d) => setPoints(d.points ?? 0)).catch(() => setPoints(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookable, slug]);

  const subtotal = useMemo(() => {
    if (game) return game.pricingModel === "hourly" ? (Number(game.hourlyRate) || 0) * hours : (Number(game.price) || 0) * persons;
    if (pkg) return (Number(pkg.price) || 0) * quantity;
    return 0;
  }, [game, pkg, persons, hours, quantity]);

  const maxPersons = game?.capacity && game.capacity > 0 ? game.capacity : 50;

  const applicableCoupons = coupons.filter((c) => c.gameId == null || (isGame && c.gameId === itemId));
  const matchedCoupon = applicableCoupons.find((c) => c.code === coupon.trim().toUpperCase());
  const couponDiscount = matchedCoupon
    ? (matchedCoupon.discountType === "fixed"
        ? Math.min(Math.round(Number(matchedCoupon.discountValue)), subtotal)
        : Math.round(subtotal * (Number(matchedCoupon.discountValue) / 100)))
    : 0;
  const maxPointsDiscount = Math.floor(subtotal * 0.02);
  const pointsCap = Math.min(Math.max(0, subtotal - couponDiscount), maxPointsDiscount);
  const maxPoints = Math.floor(pointsCap / POINTS_RUPEE_RATE);
  const redeemable = Math.min(points, maxPoints);
  const pointsApplied = useCoins ? redeemable : 0;
  const pointsValue = pointsApplied * POINTS_RUPEE_RATE;
  const total = Math.max(0, subtotal - couponDiscount - pointsValue);
  const savings = couponDiscount + pointsValue;

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
          name: name.trim(), phone: phone.trim(), couponCode: coupon.trim(), pointsToUse: pointsApplied,
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
    setPersons(1); setHours(1); setQuantity(1); setDate(""); setTime(""); setCoupon(""); setUseCoins(false);
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

                {subtotal > 0 && (
                  <Field label="Coupon (optional)">
                    <Input value={coupon} onChangeText={(v) => setCoupon(v.toUpperCase())} placeholder="Enter or tap below" autoCapitalize="characters" />
                    {applicableCoupons.length > 0 && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {applicableCoupons.map((c) => {
                          const on = coupon === c.code;
                          return (
                            <Pressable key={c.code} onPress={() => setCoupon(on ? "" : c.code)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: on ? "#10b981" : colors.border, backgroundColor: on ? "#10b98122" : "transparent" }}>
                              <Text style={{ color: on ? "#10b981" : colors.mutedForeground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                                {c.code} · {c.discountType === "fixed" ? formatINR(Number(c.discountValue)) : `${Number(c.discountValue)}%`} off
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </Field>
                )}

                {subtotal > 0 && points > 0 && (
                  <Pressable
                    disabled={redeemable <= 0}
                    onPress={() => setUseCoins((v) => !v)}
                    style={[styles.coinsRow, { borderColor: useCoins ? colors.primary : colors.border, backgroundColor: useCoins ? colors.primary + "18" : "transparent", opacity: redeemable <= 0 ? 0.6 : 1 }]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                      <Text style={{ fontSize: 16 }}>⬢</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Royvento Coins</Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                          {points} available{redeemable > 0 ? ` · redeem ${redeemable} for −${formatINR(redeemable * POINTS_RUPEE_RATE)}` : " · spend more to unlock"}
                        </Text>
                      </View>
                    </View>
                    <Switch value={useCoins} onValueChange={setUseCoins} disabled={redeemable <= 0} trackColor={{ true: colors.primary }} />
                  </Pressable>
                )}

                <View style={[styles.breakdownBox, { borderColor: colors.border }]}>
                  {savings > 0 && (
                    <>
                      <View style={styles.breakdownRow}>
                        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Subtotal</Text>
                        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{formatINR(subtotal)}</Text>
                      </View>
                      {couponDiscount > 0 && (
                        <View style={styles.breakdownRow}>
                          <Text style={{ color: "#10b981", fontSize: 13 }}>{matchedCoupon?.code}</Text>
                          <Text style={{ color: "#10b981", fontSize: 13 }}>−{formatINR(couponDiscount)}</Text>
                        </View>
                      )}
                      {pointsValue > 0 && (
                        <View style={styles.breakdownRow}>
                          <Text style={{ color: "#f59e0b", fontSize: 13 }}>⬢ Coins ×{pointsApplied}</Text>
                          <Text style={{ color: "#f59e0b", fontSize: 13 }}>−{formatINR(pointsValue)}</Text>
                        </View>
                      )}
                    </>
                  )}
                  <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Total payable</Text>
                    <Text style={[styles.itemPrice, { color: colors.foreground }]}>{formatINR(total)}</Text>
                  </View>
                  {savings > 0 && <Text style={{ color: "#10b981cc", fontSize: 11, textAlign: "right" }}>You save {formatINR(savings)}</Text>}
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
  shareBtn: { position: "absolute", right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
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
  galleryThumb: { width: "31.5%", aspectRatio: 1, borderRadius: 10, overflow: "hidden" },
  infoCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 8 },
  coinsRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 12 },
  breakdownBox: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 6, marginBottom: 4 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  submitBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  submitBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  codeBox: { borderWidth: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 24, alignItems: "center", gap: 4, marginVertical: 8 },
  codeLabel: { fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 2 },
  codeValue: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 3 },
});
