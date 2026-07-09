import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { openRazorpayCheckout } from "@/lib/razorpayCheckout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, useGetMe, useSetGender } from "@workspace/api-client-react";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { MobileFooter } from "@/components/MobileFooter";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  formatPartyDate,
  getParty,
  joinTypeLabel,
  resolveImageUrl,
  type PartyBookingResult,
  type PublicParty,
} from "@/lib/party";

const WEB_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? "royvento.com"}`;

export default function PartyDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id: string; invite?: string }>();
  const id = parseInt(String(params.id), 10);
  const inviteToken = typeof params.invite === "string" ? params.invite : "";
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const qc = useQueryClient();

  const meQ = useGetMe({ query: { retry: false } as never });
  const gender = meQ.data?.user?.gender;
  const setGender = useSetGender();

  const [genderOpen, setGenderOpen] = useState(false);
  const [booked, setBooked] = useState<{ code: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data: party, isLoading } = useQuery<PublicParty>({
    queryKey: ["party", id],
    queryFn: () => getParty(id),
    enabled: Number.isFinite(id),
  });

  const bookMutation = useMutation({
    mutationFn: () =>
      customFetch<PartyBookingResult>(`/api/create-your-party/${id}/book`, {
        method: "POST",
        body: JSON.stringify({ quantity: 1, inviteToken: inviteToken || undefined }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: async (res) => {
      setErr(null);
      // Paid party → the book endpoint created a Razorpay order; run checkout.
      if (res.paymentPending && res.razorpayOrderId) {
        const pay = await openRazorpayCheckout({
          orderId: res.razorpayOrderId,
          amountPaise: res.amountPaise ?? 0,
          name: party?.name ?? "Royvento",
          description: "Party ticket",
          prefillName: user?.name,
          prefillEmail: user?.email,
          prefillContact: user?.phone,
          rid: res.bookingId,
        });
        qc.invalidateQueries({ queryKey: ["party", id] });
        if (pay === "success") {
          router.replace(`/payment-result?payment=success${res.bookingId ? `&bookingId=${res.bookingId}` : ""}` as never);
        } else if (pay === "cancelled") {
          setErr("Payment cancelled — you can try again.");
        } else {
          setErr("Payment failed. Please try again.");
        }
        return;
      }
      // Free party → confirmed instantly.
      if (res.bookingCode) setBooked({ code: res.bookingCode });
      qc.invalidateQueries({ queryKey: ["party", id] });
    },
    onError: (e: any) => {
      const msg = e?.data?.error ?? e?.message ?? "Could not book this party.";
      setErr(String(msg));
    },
  });

  if (isLoading || !party) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const cover = resolveImageUrl(party.coverImageUrl);
  const isPrivate = party.visibility === "private";
  const soldOut = party.seatsLeft === 0;
  const needsInvite = isPrivate && !party.isOrganizer && !party.canChat && !inviteToken;
  const isPaid = party.ticketType === "paid";

  async function handleBook() {
    setErr(null);
    if (!user) {
      router.push("/(auth)/login" as never);
      return;
    }
    if (needsInvite) {
      setErr("This is a private party — open the host's invite link to book a spot.");
      return;
    }
    // Every party (free or paid) needs a binary gender on file first (server-
    // enforced). Paid parties then run Razorpay checkout from the mutation's
    // success handler; free parties confirm instantly.
    if (gender !== "male" && gender !== "female") {
      setGenderOpen(true);
      return;
    }
    bookMutation.mutate();
  }

  function pickGender(g: "male" | "female") {
    setGender.mutate(
      { data: { gender: g } },
      {
        onSuccess: (result) => {
          qc.setQueryData(["/api/auth/me"], result);
          meQ.refetch();
          setGenderOpen(false);
          bookMutation.mutate();
        },
      },
    );
  }

  async function shareParty() {
    const url = `${WEB_BASE}/party/${id}${party!.isOrganizer && isPrivate && party!.inviteToken ? `?invite=${party!.inviteToken}` : ""}`;
    await Share.share({ message: `Join "${party!.name}" on Royvento!\n\n${url}`, url });
  }

  const bookDisabled = soldOut || party.status !== "published" || bookMutation.isPending;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 120 }}>
        {/* Hero */}
        <View>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.hero} contentFit="cover" />
          ) : (
            <View style={[styles.hero, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="balloon-outline" size={54} color={colors.mutedForeground} />
            </View>
          )}
          <LinearGradient colors={["rgba(0,0,0,0.5)", "transparent", "rgba(0,0,0,0.35)"]} style={StyleSheet.absoluteFill} />
          <View style={[styles.heroBar, { paddingTop: topPadding + 8 }]}>
            <Pressable onPress={() => router.back()} style={styles.circleBtn}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </Pressable>
            <Pressable onPress={shareParty} style={styles.circleBtn}>
              <Ionicons name="share-outline" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        <View style={{ padding: 16, gap: 14 }}>
          {/* Title + badges */}
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <Badge colors={colors} text={isPaid ? `₹${Number(party.ticketPrice).toLocaleString("en-IN")}` : "Free entry"} tone={isPaid ? "primary" : "green"} />
              {isPrivate && <Badge colors={colors} text="Private" tone="muted" icon="lock-closed" />}
              <Badge colors={colors} text={joinTypeLabel(party.joinType)} tone="muted" icon="people" />
              {soldOut && <Badge colors={colors} text="Sold out" tone="red" />}
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>{party.name}</Text>
            {!!party.organizerName && (
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Hosted by {party.organizerName}</Text>
            )}
          </View>

          {/* Date / time / location cards */}
          <InfoRow colors={colors} icon="calendar-outline" label="When"
            value={`${formatPartyDate(party.partyDate)}${party.startTime ? ` · ${party.startTime}` : ""}${party.endTime ? ` – ${party.endTime}` : ""}`} />
          {!!(party.venueName || party.address || party.city) && (
            <Pressable
              onPress={() => {
                const q = encodeURIComponent([party.venueName, party.address, party.city].filter(Boolean).join(", "));
                Linking.openURL(party.mapLocation || `https://www.google.com/maps/search/?api=1&query=${q}`);
              }}
            >
              <InfoRow colors={colors} icon="location-outline" label="Where"
                value={[party.venueName, party.address, party.city, party.state].filter(Boolean).join(", ")} chevron />
            </Pressable>
          )}

          {/* Description */}
          {!!party.description && (
            <Card colors={colors}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>About this party</Text>
              <Text style={[styles.body, { color: colors.mutedForeground }]}>{party.description}</Text>
            </Card>
          )}

          {/* Vibe */}
          {(() => {
            const vibes: { label: string; value: string }[] = [
              { label: "Age group", value: party.ageGroup },
              { label: "Dress code", value: party.dressCode.replace(/_/g, " ") },
              { label: "Drinks", value: party.drinking },
              { label: "Smoking", value: party.smoking },
              { label: "Couple friendly", value: party.coupleFriendly },
              { label: "LGBTQ+ friendly", value: party.lgbtqFriendly },
            ].filter((v) => v.value && v.value !== "");
            if (vibes.length === 0) return null;
            return (
              <Card colors={colors}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>The vibe</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  {vibes.map((v) => (
                    <View key={v.label} style={[styles.vibe, { borderColor: colors.border, backgroundColor: colors.background }]}>
                      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{v.label}</Text>
                      <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{v.value}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            );
          })()}

          {/* Rules */}
          {!!party.rules && (
            <Card colors={colors}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>House rules</Text>
              <Text style={[styles.body, { color: colors.mutedForeground }]}>{party.rules}</Text>
            </Card>
          )}

          {/* Gallery */}
          {party.galleryImages.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {party.galleryImages.map((g, i) => (
                <Image key={i} source={{ uri: resolveImageUrl(g) }} style={styles.galleryImg} contentFit="cover" />
              ))}
            </ScrollView>
          )}

          {party.isOrganizer && (
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/party/dashboard", params: { id: String(id) } } as never)}
              style={[styles.manageBtn, { borderColor: colors.border }]}
            >
              <Ionicons name="settings-outline" size={16} color={colors.foreground} />
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>Manage this party</Text>
            </TouchableOpacity>
          )}

          {needsInvite && (
            <View style={[styles.notice, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontSize: 13, flex: 1 }}>
                This is a private party. Open the host's invite link to book a spot.
              </Text>
            </View>
          )}

          {err && (
            <View style={[styles.notice, { borderColor: colors.destructive, backgroundColor: colors.destructive + "12" }]}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.destructive} />
              <Text style={{ color: colors.destructive, fontSize: 13, flex: 1 }}>{err}</Text>
            </View>
          )}
        </View>

        <MobileFooter />
      </ScrollView>

      {/* Sticky book bar */}
      {!party.isOrganizer && (
        <View style={[styles.bookBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{isPaid ? "Ticket" : "Entry"}</Text>
            <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>
              {isPaid ? `₹${Number(party.ticketPrice).toLocaleString("en-IN")}` : "Free"}
            </Text>
          </View>
          <TouchableOpacity
            disabled={bookDisabled}
            onPress={handleBook}
            style={[styles.bookBtn, { backgroundColor: colors.primary, opacity: bookDisabled ? 0.5 : 1 }]}
          >
            {bookMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <>
                <Ionicons name={isPaid ? "card-outline" : "checkmark-circle-outline"} size={18} color={colors.primaryForeground} />
                <Text style={{ color: colors.primaryForeground, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                  {soldOut ? "Sold out" : isPaid ? "Buy ticket" : "Book free spot"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Gender modal */}
      <Modal visible={genderOpen} transparent animationType="fade" onRequestClose={() => setGenderOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setGenderOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select your gender</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 6 }}>We only ask once — it's used for gender-based entry.</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              {(["male", "female"] as const).map((g) => (
                <TouchableOpacity
                  key={g}
                  disabled={setGender.isPending}
                  onPress={() => pickGender(g)}
                  style={[styles.genderBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
                >
                  <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Booking success modal */}
      <Modal visible={!!booked} transparent animationType="fade" onRequestClose={() => setBooked(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setBooked(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center" }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.successIcon, { backgroundColor: "#22c55e22" }]}>
              <Ionicons name="checkmark-circle" size={40} color="#22c55e" />
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground, marginTop: 12 }]}>You're on the list! 🎉</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 6, textAlign: "center" }}>
              Show this code at the door.
            </Text>
            <View style={[styles.codeBox, { borderColor: colors.primary, backgroundColor: colors.primary + "12" }]}>
              <Text style={{ color: colors.primary, fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: 4 }}>{booked?.code}</Text>
            </View>
            <TouchableOpacity onPress={() => setBooked(null)} style={[styles.bookBtn, { backgroundColor: colors.primary, marginTop: 16, alignSelf: "stretch" }]}>
              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Badge({ colors, text, tone, icon }: { colors: any; text: string; tone: "primary" | "green" | "muted" | "red"; icon?: keyof typeof Ionicons.glyphMap }) {
  const bg = tone === "primary" ? colors.primary : tone === "green" ? "#22c55e" : tone === "red" ? "#ef4444" : colors.muted;
  const fg = tone === "muted" ? colors.foreground : "#fff";
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={11} color={fg} />}
      <Text style={{ color: fg, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{text}</Text>
    </View>
  );
}

function InfoRow({ colors, icon, label, value, chevron }: { colors: any; icon: keyof typeof Ionicons.glyphMap; label: string; value: string; chevron?: boolean }) {
  return (
    <View style={[styles.infoRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={[styles.infoIcon, { backgroundColor: colors.primary + "1A" }]}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{label}</Text>
        <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 1 }}>{value}</Text>
      </View>
      {chevron && <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />}
    </View>
  );
}

function Card({ colors, children }: { colors: any; children: React.ReactNode }) {
  return <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>{children}</View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { width: "100%", height: 280 },
  heroBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12 },
  circleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 12 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 8 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  body: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  vibe: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  galleryImg: { width: 150, height: 110, borderRadius: 12 },
  manageBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 13 },
  notice: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  bookBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  bookBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 14 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 18, borderWidth: 1, padding: 22 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  genderBtn: { flex: 1, alignItems: "center", borderRadius: 12, borderWidth: 1, paddingVertical: 14 },
  successIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  codeBox: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 24, paddingVertical: 14, marginTop: 16 },
});
