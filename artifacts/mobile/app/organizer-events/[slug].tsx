import { resolveImageUrl } from "@/lib/resolveImageUrl";
import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
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
  useWindowDimensions,
  View,
} from "react-native";
import RenderHtml, { MixedStyleDeclaration } from "react-native-render-html";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileFooter } from "@/components/MobileFooter";
import { openRazorpayCheckout } from "@/lib/razorpayCheckout";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { openRichTextLink, richHtmlDomVisitors, RICH_HTML_IGNORED_TAGS } from "@/lib/sanitizeRichHtml";

const RICH_HTML_SYSTEM_FONTS = ["Inter_400Regular", "Inter_500Medium", "Inter_600SemiBold", "Inter_700Bold"];
const WEB_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? "royvento.com"}`;
const POINTS_RUPEE_RATE = 0.05;

// ── Organizer Event detail (mobile) ──────────────────────────────────────────
// Mirror of the web /organizer-events/:slug page. Shows the full event and its
// ticket tiers, and books via /api/organizer-events/:slug/book → QR ticket.

interface Organizer { id: number; name: string; slug: string; verified: boolean; logoUrl: string; }
interface Artist { name: string; role: string; imageUrl: string; bio: string; socials: string; }
interface ScheduleItem { time: string; title: string; desc: string; }
interface Policies { dressCode: string; entryRules: string; agePolicy: string; refundPolicy: string; cancellationPolicy: string; }
interface Faq { q: string; a: string; }
interface FullEvent {
  id: number; title: string; slug: string; category: string; subcategory: string; shortDescription: string; description: string;
  tags: string[]; coverImageUrl: string; bannerUrl: string; galleryImages: string[] | null; promoVideos: string[] | null;
  venueName: string; address: string; mapsUrl: string; capacity: number;
  city: string; state: string; startDate: string | null; endDate: string | null; startTime: string; endTime: string;
  isMultiDay: boolean; artists: Artist[] | null; highlights: string[] | null; schedule: ScheduleItem[] | null;
  policies: Policies | null; faqs: Faq[] | null; ageRestriction: string; language: string;
}
interface TicketTier { id: number; type: string; name: string; description: string; price: string; quantity: number; soldCount: number; bookingLimit: number; }
interface EventPayload { event: FullEvent; organizer: Organizer | null; tickets: TicketTier[]; }
interface EventCoupon { code: string; discountType: string; discountValue: string; }

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
  const { width } = useWindowDimensions();
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

  async function handleShare() {
    try {
      await Share.share({
        title: event.title,
        message: `Check out "${event.title}"${event.venueName ? ` at ${event.venueName}` : ""} on Royvento!\n\n${WEB_BASE}/organizer-events/${event.slug}`,
      });
    } catch { /* share dismissed or failed — no-op */ }
  }

  function openMaps() {
    if (event.mapsUrl) { Linking.openURL(event.mapsUrl); return; }
    const q = encodeURIComponent([event.venueName, event.address, event.city, event.state].filter(Boolean).join(", "));
    if (q) Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  }

  const richTagsStyles: Record<string, MixedStyleDeclaration> = {
    body: { backgroundColor: "transparent", color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14 } as MixedStyleDeclaration,
    p: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, marginTop: 0, marginBottom: 10 } as MixedStyleDeclaration,
    strong: { color: colors.foreground, fontFamily: "Inter_700Bold" } as MixedStyleDeclaration,
    em: { fontStyle: "italic" } as MixedStyleDeclaration,
    a: { color: colors.primary, textDecorationLine: "underline" } as MixedStyleDeclaration,
    li: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21 } as MixedStyleDeclaration,
    ul: { marginBottom: 10 } as MixedStyleDeclaration,
    ol: { marginBottom: 10 } as MixedStyleDeclaration,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.cover}>
          {event.coverImageUrl ? (
            <Image source={{ uri: resolveImageUrl(event.coverImageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.muted }]} />
          )}
          <LinearGradient colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.6)", colors.background]} style={StyleSheet.absoluteFill} />
          <Pressable style={[styles.backBtn, { top: topPadding + 8 }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Pressable style={[styles.shareBtn, { top: topPadding + 8 }]} onPress={handleShare}>
            <Ionicons name="share-social-outline" size={20} color="#fff" />
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
          <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
            <RenderHtml
              contentWidth={width - 40}
              source={{ html: event.description }}
              tagsStyles={richTagsStyles}
              baseStyle={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14 }}
              systemFonts={RICH_HTML_SYSTEM_FONTS}
              enableExperimentalMarginCollapsing
              ignoredDomTags={RICH_HTML_IGNORED_TAGS}
              domVisitors={richHtmlDomVisitors}
              renderersProps={{ a: { onPress: (_e, href) => openRichTextLink(href) } }}
            />
          </View>
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

        {(event.artists ?? []).length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Lineup</Text>
            {(event.artists ?? []).map((a, i) => (
              <View key={i} style={[styles.artistCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.artistThumb, { backgroundColor: colors.muted }]}>
                  {a.imageUrl ? <Image source={{ uri: resolveImageUrl(a.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="person-outline" size={20} color={colors.mutedForeground} />}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.ticketName, { color: colors.foreground }]} numberOfLines={1}>{a.name}</Text>
                  {!!a.role && <Text style={[styles.eventCat, { color: colors.primary, fontSize: 10 }]}>{a.role.toUpperCase()}</Text>}
                  {!!a.bio && <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={2}>{a.bio}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        {(event.schedule ?? []).length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Schedule</Text>
            {(event.schedule ?? []).map((s, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ width: 8, alignItems: "center", paddingTop: 4 }}>
                  <View style={[styles.scheduleDot, { backgroundColor: colors.primary }]} />
                </View>
                <View style={{ flex: 1, paddingBottom: 12 }}>
                  {!!s.time && <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{s.time}</Text>}
                  <Text style={[styles.ticketName, { color: colors.foreground, fontSize: 14 }]}>{s.title}</Text>
                  {!!s.desc && <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{s.desc}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        {(event.galleryImages ?? []).length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Gallery</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {(event.galleryImages ?? []).map((src, i) => (
                <View key={i} style={styles.galleryThumb}>
                  <Image source={{ uri: resolveImageUrl(src) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Tickets */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tickets</Text>
          {tickets.length === 0 ? (
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>No tickets available right now.</Text>
          ) : (
            tickets.map((tk) => {
              const left = tk.quantity > 0 ? tk.quantity - tk.soldCount : null;
              const soldOut = left !== null && left <= 0;
              return (
                <View key={tk.id} style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.ticketName, { color: colors.foreground }]}>{tk.name}</Text>
                    {!!tk.description && <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={2}>{tk.description}</Text>}
                    <Text style={[styles.ticketPrice, { color: colors.primary }]}>{formatINR(Number(tk.price))}</Text>
                    {left !== null && <Text style={{ color: soldOut ? colors.redLight : "#f59e0b", fontSize: 11, fontFamily: "Inter_500Medium" }}>{soldOut ? "Sold out" : `${left} left`}</Text>}
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

        {organizer && (
          <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
            <Pressable onPress={() => router.push(`/organizers/${organizer.slug}` as never)} style={[styles.organizedByCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.artistThumb, { backgroundColor: colors.muted }]}>
                {organizer.logoUrl ? <Image source={{ uri: resolveImageUrl(organizer.logoUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="business-outline" size={18} color={colors.mutedForeground} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 }}>Organized by</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={[styles.ticketName, { color: colors.foreground }]} numberOfLines={1}>{organizer.name}</Text>
                  {organizer.verified && <Ionicons name="checkmark-circle" size={13} color="#f59e0b" />}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        )}

        {(event.venueName || event.address || event.city) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Location</Text>
            <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {!!event.venueName && <Text style={[styles.ticketName, { color: colors.foreground, fontSize: 14 }]}>{event.venueName}</Text>}
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{[event.address, event.city, event.state].filter(Boolean).join(", ")}</Text>
              <Pressable onPress={openMaps} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}>
                <Text style={{ color: colors.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Open in Maps</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        )}

        {(!!event.ageRestriction || !!event.language || event.capacity > 0 || !!event.policies?.dressCode) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Good to know</Text>
            <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, gap: 6 }]}>
              {!!event.ageRestriction && <InfoRow k="Age" v={event.ageRestriction} colors={colors} />}
              {!!event.language && <InfoRow k="Language" v={event.language} colors={colors} />}
              {event.capacity > 0 && <InfoRow k="Capacity" v={`${event.capacity.toLocaleString("en-IN")} guests`} colors={colors} />}
              {!!event.policies?.dressCode && <InfoRow k="Dress code" v={event.policies.dressCode} colors={colors} />}
            </View>
          </View>
        )}

        <PoliciesAndFaq colors={colors} policies={event.policies} faqs={event.faqs} />

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
  const [useCoins, setUseCoins] = useState(false);
  const [coupons, setCoupons] = useState<EventCoupon[]>([]);
  const [points, setPoints] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ ticketCode: string; total: number } | null>(null);

  useEffect(() => {
    if (!ticket) return;
    setQty(1); setCoupon(""); setUseCoins(false); setConfirmation(null);
    customFetch<EventCoupon[]>(`/api/organizer-events/${slug}/coupons`).then(setCoupons).catch(() => setCoupons([]));
    customFetch<{ points: number }>("/api/users/me/discounts").then((d) => setPoints(d.points ?? 0)).catch(() => setPoints(0));
  }, [ticket, slug]);

  const maxQty = ticket?.bookingLimit && ticket.bookingLimit > 0 ? ticket.bookingLimit : 10;
  const price = ticket ? Number(ticket.price) || 0 : 0;
  const subtotal = price * qty;
  const matchedCoupon = coupons.find((c) => c.code === coupon.trim().toUpperCase());
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
  const baseFee = price > 0 && total > 0 ? Math.round((total * 3.5) / 100) : 0;
  const grandTotal = total + baseFee;

  async function submit() {
    if (!ticket) return;
    if (!name.trim()) { Alert.alert("Please enter your name"); return; }
    setSubmitting(true);
    try {
      const res = await customFetch<{ ticketCode?: string; total: number; bookingId: number; paymentPending?: boolean; razorpayOrderId?: string; amountPaise?: number; eventTitle?: string }>(`/api/organizer-events/${slug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.id, name: name.trim(), phone: phone.trim(), quantity: qty, couponCode: coupon.trim(), pointsToUse: pointsApplied }),
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
    setConfirmation(null); setQty(1); setCoupon(""); setUseCoins(false);
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
              <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
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

              {price > 0 && (
                <Field label="Coupon (optional)">
                  <Input value={coupon} onChangeText={(v) => setCoupon(v.toUpperCase())} placeholder="Enter or tap below" autoCapitalize="characters" />
                  {coupons.length > 0 && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {coupons.map((c) => {
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

              {price > 0 && points > 0 && (
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
                {price > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{ticket?.name} × {qty}</Text>
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{formatINR(subtotal)}</Text>
                  </View>
                )}
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
                {baseFee > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Platform fee (3.5%)</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>+{formatINR(baseFee)}</Text>
                  </View>
                )}
                <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Total payable</Text>
                  <Text style={[styles.ticketPrice, { color: colors.foreground }]}>{formatINR(grandTotal)}</Text>
                </View>
                {(couponDiscount + pointsValue) > 0 && (
                  <Text style={{ color: "#10b981cc", fontSize: 11, textAlign: "right" }}>You save {formatINR(couponDiscount + pointsValue)}</Text>
                )}
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

function InfoRow({ k, v, colors }: { k: string; v: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{k}</Text>
      <Text style={[styles.metaText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{v}</Text>
    </View>
  );
}

function PoliciesAndFaq({ colors, policies, faqs }: { colors: ReturnType<typeof useColors>; policies: Policies | null; faqs: Faq[] | null }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const polRows = policies ? ([
    ["Dress code", policies.dressCode], ["Entry rules", policies.entryRules], ["Age policy", policies.agePolicy],
    ["Refund policy", policies.refundPolicy], ["Cancellation policy", policies.cancellationPolicy],
  ] as const).filter(([, v]) => v) : [];
  return (
    <>
      {polRows.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Policies</Text>
          {polRows.map(([k, v]) => (
            <View key={k} style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={{ color: colors.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{k}</Text>
              <Text style={[styles.metaText, { color: colors.mutedForeground, marginTop: 3 }]}>{v}</Text>
            </View>
          ))}
        </View>
      )}
      {(faqs?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>FAQ</Text>
          {faqs!.map((q, i) => {
            const open = openFaq === i;
            return (
              <Pressable key={i} onPress={() => setOpenFaq(open ? null : i)} style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={[styles.ticketName, { color: colors.foreground, fontSize: 14, flex: 1 }]}>{q.q}</Text>
                  <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                </View>
                {open && <Text style={[styles.metaText, { color: colors.mutedForeground, marginTop: 8 }]}>{q.a}</Text>}
              </Pressable>
            );
          })}
        </View>
      )}
    </>
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
  shareBtn: { position: "absolute", right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  coverFooter: { paddingHorizontal: 20, paddingBottom: 16, gap: 4 },
  eventCat: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.5, lineHeight: 31 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 13, fontFamily: "Inter_400Regular", flexShrink: 1 },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, paddingHorizontal: 20, marginTop: 16 },
  section: { paddingHorizontal: 20, marginTop: 24, gap: 10 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  ticketCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  artistCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 12 },
  artistThumb: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  scheduleDot: { width: 8, height: 8, borderRadius: 4 },
  galleryThumb: { width: "31.5%", aspectRatio: 1, borderRadius: 10, overflow: "hidden" },
  organizedByCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  infoCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 8 },
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
  coinsRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 12 },
  breakdownBox: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 6, marginBottom: 4 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  submitBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  submitBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  codeBox: { borderWidth: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 24, alignItems: "center", gap: 4, marginVertical: 8 },
  codeLabel: { fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 2 },
  codeValue: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 3 },
});
