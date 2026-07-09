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
import { openRazorpayCheckout } from "@/lib/razorpayCheckout";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

// ── Organizer Event detail (mobile) ──────────────────────────────────────────
// Mirror of the web /organizer-events/:slug page. Shows the full event and its
// ticket tiers, and books via /api/organizer-events/:slug/book → QR ticket.

interface Organizer { id: number; name: string; slug: string; verified: boolean; logoUrl: string; }
interface FullEvent {
  id: number; title: string; slug: string; category: string; shortDescription: string; description: string;
  coverImageUrl: string; bannerUrl: string; venueName: string; address: string; mapsUrl: string;
  city: string; state: string; startDate: string | null; endDate: string | null; startTime: string; endTime: string;
  isMultiDay: boolean; highlights: string[] | null; ageRestriction: string; language: string;
}
interface TicketTier { id: number; type: string; name: string; description: string; price: string; quantity: number; soldCount: number; bookingLimit: number; }
interface EventPayload { event: FullEvent; organizer: Organizer | null; tickets: TicketTier[]; }

function eventDate(startDate: string | null, endDate: string | null, multi: boolean) {
  if (!startDate) return "Date to be announced";
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  if (multi && endDate && endDate !== startDate) return `${fmt(startDate)} — ${fmt(endDate)}`;
  return fmt(startDate);
}
function formatINR(v: number) {
  return v > 0 ? `₹${Math.round(v).toLocaleString("en-IN")}` : "Free";
}

export default function OrganizerEventDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [ticket, setTicket] = useState<TicketTier | null>(null);

  const { data, isLoading } = useQuery<EventPayload | null>({
    queryKey: ["organizer-event", slug],
    queryFn: () => customFetch<EventPayload>(`/api/organizer-events/${slug}`),
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
        <Ionicons name="ticket-outline" size={40} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, marginTop: 12, fontFamily: "Inter_400Regular" }}>Event not found.</Text>
        <Pressable onPress={() => router.back()} style={[styles.backInline, { borderColor: colors.border }]}>
          <Text style={{ color: colors.foreground }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const { event, organizer, tickets } = data;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.cover}>
          {event.coverImageUrl ? (
            <Image source={{ uri: event.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.muted }]} />
          )}
          <LinearGradient colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.6)", colors.background]} style={StyleSheet.absoluteFill} />
          <Pressable style={[styles.backBtn, { top: topPadding + 8 }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <View style={styles.coverFooter}>
            {!!event.category && <Text style={[styles.eventCat, { color: colors.primary }]}>{event.category.toUpperCase()}</Text>}
            <Text style={styles.title} numberOfLines={3}>{event.title}</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 10 }}>
          {organizer && (
            <Pressable onPress={() => router.push(`/organizers/${organizer.slug}` as never)} style={styles.metaItem}>
              <Ionicons name="business-outline" size={14} color={colors.primary} />
              <Text style={[styles.metaText, { color: colors.foreground }]}>{organizer.name}</Text>
              {organizer.verified && <Ionicons name="checkmark-circle" size={14} color="#f59e0b" />}
            </Pressable>
          )}
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={14} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {eventDate(event.startDate, event.endDate, event.isMultiDay)}{event.startTime ? ` · ${event.startTime}` : ""}
            </Text>
          </View>
          {!!(event.venueName || event.city) && (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {[event.venueName, event.city].filter(Boolean).join(", ")}
              </Text>
            </View>
          )}
        </View>

        {!!event.description && (
          <Text style={[styles.description, { color: colors.mutedForeground }]}>{event.description}</Text>
        )}

        {(event.highlights ?? []).length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Highlights</Text>
            {(event.highlights ?? []).map((h, i) => (
              <View key={i} style={styles.metaItem}>
                <Ionicons name="checkmark-circle" size={13} color={colors.primary} />
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{h}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Tickets */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tickets</Text>
          {tickets.length === 0 ? (
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>No tickets available right now.</Text>
          ) : (
            tickets.map((tk) => {
              const soldOut = tk.quantity > 0 && tk.soldCount >= tk.quantity;
              return (
                <View key={tk.id} style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.ticketName, { color: colors.foreground }]}>{tk.name}</Text>
                    {!!tk.description && <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={2}>{tk.description}</Text>}
                    <Text style={[styles.ticketPrice, { color: colors.primary }]}>{formatINR(Number(tk.price))}</Text>
                  </View>
                  <Pressable
                    disabled={soldOut}
                    onPress={() => setTicket(tk)}
                    style={[styles.bookBtn, { backgroundColor: soldOut ? colors.muted : colors.primary }]}
                  >
                    <Text style={[styles.bookBtnText, { color: soldOut ? colors.mutedForeground : colors.primaryForeground }]}>
                      {soldOut ? "Sold out" : "Book"}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        <MobileFooter />
        <View style={{ height: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }} />
      </ScrollView>

      <BookingModal slug={slug!} ticket={ticket} onClose={() => setTicket(null)} />
    </View>
  );
}

function BookingModal({ slug, ticket, onClose }: { slug: string; ticket: TicketTier | null; onClose: () => void }) {
  const colors = useColors();
  const { user } = useAuth();
  const [qty, setQty] = useState(1);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [coupon, setCoupon] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ ticketCode: string; total: number } | null>(null);

  const maxQty = ticket?.bookingLimit && ticket.bookingLimit > 0 ? ticket.bookingLimit : 10;
  const subtotal = useMemo(() => (ticket ? (Number(ticket.price) || 0) * qty : 0), [ticket, qty]);

  async function submit() {
    if (!ticket) return;
    if (!name.trim()) { Alert.alert("Please enter your name"); return; }
    setSubmitting(true);
    try {
      const res = await customFetch<{ ticketCode?: string; total: number; bookingId: number; paymentPending?: boolean; razorpayOrderId?: string; amountPaise?: number; eventTitle?: string }>(`/api/organizer-events/${slug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.id, name: name.trim(), phone: phone.trim(), quantity: qty, couponCode: coupon.trim(), pointsToUse: 0 }),
      });
      // Paid ticket → run Razorpay checkout; the webhook confirms the booking.
      if (res.paymentPending && res.razorpayOrderId) {
        const pay = await openRazorpayCheckout({
          orderId: res.razorpayOrderId,
          amountPaise: res.amountPaise ?? Math.round((res.total || 0) * 100),
          name: res.eventTitle ?? "Royvento",
          description: "Event ticket",
          prefillName: name.trim(),
          prefillContact: phone.trim(),
          rid: res.bookingId,
        });
        if (pay === "success") {
          close();
          router.replace(`/payment-result?payment=success&bookingId=${res.bookingId}` as never);
        } else if (pay === "cancelled") {
          Alert.alert("Payment cancelled", "You can try again anytime.");
        } else {
          Alert.alert("Payment failed", "Please try again.");
        }
        return;
      }
      setConfirmation({ ticketCode: res.ticketCode ?? "", total: res.total });
    } catch (e: any) {
      Alert.alert("Booking failed", e?.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    setConfirmation(null); setQty(1); setCoupon("");
    onClose();
  }

  return (
    <Modal visible={!!ticket} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={close}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {confirmation ? (
            <View style={{ alignItems: "center", gap: 8, paddingVertical: 8 }}>
              <Ionicons name="ticket" size={42} color="#10b981" />
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>You're booked!</Text>
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{ticket?.name}</Text>
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
                <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>Book {ticket?.name}</Text>
                <Pressable onPress={close}><Ionicons name="close" size={22} color={colors.mutedForeground} /></Pressable>
              </View>
              <View style={{ marginBottom: 12 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{`Quantity (max ${maxQty})`}</Text>
                <View style={styles.stepper}>
                  <Pressable onPress={() => setQty(Math.max(1, qty - 1))} style={[styles.stepBtn, { borderColor: colors.border }]}>
                    <Ionicons name="remove" size={16} color={colors.foreground} />
                  </Pressable>
                  <Text style={[styles.stepValue, { color: colors.foreground }]}>{qty}</Text>
                  <Pressable onPress={() => setQty(Math.min(maxQty, qty + 1))} style={[styles.stepBtn, { borderColor: colors.border }]}>
                    <Ionicons name="add" size={16} color={colors.foreground} />
                  </Pressable>
                </View>
              </View>
              <Field label="Your name"><Input value={name} onChangeText={setName} placeholder="Full name" /></Field>
              <Field label="Phone"><Input value={phone} onChangeText={setPhone} placeholder="Phone number" keyboardType="phone-pad" /></Field>
              <Field label="Coupon (optional)"><Input value={coupon} onChangeText={setCoupon} placeholder="Coupon code" autoCapitalize="characters" /></Field>
              <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Estimated total</Text>
                <Text style={[styles.ticketPrice, { color: colors.foreground }]}>{formatINR(subtotal)}</Text>
              </View>
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
    <TextInput {...props} placeholderTextColor={colors.mutedForeground} style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]} />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  backInline: { marginTop: 16, borderWidth: 1, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  cover: { height: 260, position: "relative", justifyContent: "flex-end" },
  backBtn: { position: "absolute", left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  coverFooter: { paddingHorizontal: 20, paddingBottom: 16, gap: 4 },
  eventCat: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.5, lineHeight: 31 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 13, fontFamily: "Inter_400Regular", flexShrink: 1 },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, paddingHorizontal: 20, marginTop: 16 },
  section: { paddingHorizontal: 20, marginTop: 24, gap: 10 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  ticketCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  ticketName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  ticketPrice: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 2 },
  bookBtn: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  bookBtnText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, paddingBottom: 32, gap: 6 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", flexShrink: 1 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 16 },
  stepBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stepValue: { fontSize: 16, fontFamily: "Inter_700Bold", minWidth: 24, textAlign: "center" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, paddingTop: 12, marginTop: 4 },
  submitBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  submitBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  codeBox: { borderWidth: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 24, alignItems: "center", gap: 4, marginVertical: 8 },
  codeLabel: { fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 2 },
  codeValue: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 3 },
});
