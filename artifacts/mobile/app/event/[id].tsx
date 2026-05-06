import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  getGetWishlistQueryKey,
  getListMyBookingsQueryKey,
  getListVendorDrinkPlansQueryKey,
  useAddToWishlist,
  useCreateBooking,
  useGetEvent,
  useGetWishlist,
  useListEventReviews,
  useListMyBookings,
  useListVendorDrinkPlans,
  useRemoveFromWishlist,
} from "@workspace/api-client-react";
import { ReviewForm } from "@/components/ReviewForm";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";

interface EventVendor {
  id: number;
  businessName: string;
  category: string;
  description?: string;
  location?: string;
  rating?: number;
  reviewCount?: number;
  openDays?: string[];
  address?: string | null;
  dayHours?: Record<string, { open: string; close: string } | null> | null;
}

function fmtTime(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (h === undefined || isNaN(h)) return "";
  const d = new Date(); d.setHours(h, m ?? 0);
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).replace(":00", "");
}

interface EventWithVendor {
  id: number;
  vendor?: EventVendor;
  vendorId?: number;
  vendorName?: string;
  freeEntryRules?: { enabled: boolean; genders: string[]; days: string[]; beforeTime?: string } | null;
  [key: string]: unknown;
}

interface DiscountInfo {
  isNewUser: boolean;
  daysLeft: number;
  bookingDiscountPercent: number;
  points: number;
}

function formatINR(v: number) {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${Math.round(v)}`;
}

function TickerCounter({
  label, value, price, onChange, color, mutedColor,
}: {
  label: string; value: number; price?: number; onChange: (v: number) => void;
  color: string; mutedColor: string;
}) {
  return (
    <View style={styles.tickerRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.tickerLabel, { color }]}>{label}</Text>
        {price != null && price > 0 && (
          <Text style={[styles.tickerPrice, { color: mutedColor }]}>{formatINR(price)} each</Text>
        )}
      </View>
      <View style={styles.tickerControls}>
        <TouchableOpacity
          style={[styles.tickerBtn, { borderColor: mutedColor }]}
          onPress={() => onChange(Math.max(0, value - 1))}
        >
          <Ionicons name="remove" size={16} color={color} />
        </TouchableOpacity>
        <Text style={[styles.tickerValue, { color }]}>{value}</Text>
        <TouchableOpacity
          style={[styles.tickerBtn, { borderColor: mutedColor }]}
          onPress={() => onChange(value + 1)}
        >
          <Ionicons name="add" size={16} color={color} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function EventDetailScreen() {
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();

  const eventId = Number(id);
  const { data: event, isLoading } = useGetEvent(eventId);
  const { data: reviews } = useListEventReviews(eventId);

  const [bookingDateObj, setBookingDateObj] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [guests, setGuests] = useState("1");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [showBooking, setShowBooking] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<"cod" | "online">("cod");
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [confirmedAge, setConfirmedAge] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponState, setCouponState] = useState<{ code: string; discountPercent: number } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [pointsInput, setPointsInput] = useState("0");
  const [discountInfo, setDiscountInfo] = useState<DiscountInfo | null>(null);

  const [ticketWomen, setTicketWomen] = useState(0);
  const [ticketMen, setTicketMen] = useState(0);
  const [ticketCouple, setTicketCouple] = useState(0);
  const [pubMode, setPubMode] = useState<"ticket" | "event">("ticket");
  const [occasion, setOccasion] = useState("farewell");
  const [expandedDrinkPlans, setExpandedDrinkPlans] = useState<Set<number>>(new Set());
  const [personName, setPersonName] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");

  const bookingDate = bookingDateObj.toISOString().slice(0, 10);

  const wishlistQuery = useGetWishlist({ query: { queryKey: getGetWishlistQueryKey(), enabled: !!user } });
  const isWishlisted = wishlistQuery.data?.some((w) => w.id === eventId) ?? false;

  const { data: myBookings } = useListMyBookings({ query: { queryKey: getListMyBookingsQueryKey(), enabled: !!user } });
  const hasEventBooking = (myBookings ?? []).some((b) => b.eventId === eventId);

  const addMutation = useAddToWishlist({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetWishlistQueryKey() }),
      onError: () => Alert.alert("Error", "Failed to add to wishlist. Please try again."),
    },
  });
  const removeMutation = useRemoveFromWishlist({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetWishlistQueryKey() }),
      onError: () => Alert.alert("Error", "Failed to remove from wishlist. Please try again."),
    },
  });

  useEffect(() => {
    if (!user || !showBooking) return;
    customFetch<DiscountInfo>("/api/users/me/discounts")
      .then(setDiscountInfo)
      .catch(() => {});
  }, [user, showBooking]);

  const toggleWishlist = async () => {
    if (!user) { router.push("/(auth)/login"); return; }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isWishlisted) {
      removeMutation.mutate({ eventId });
    } else {
      addMutation.mutate({ data: { eventId } });
    }
  };

  const handleShare = async () => {
    if (!event) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        title: event.title,
        message: `Check out "${event.title}"${event.location ? ` at ${event.location}` : ""} on Royvento!\n\nhttps://royvento.app/events/${eventId}`,
      });
    } catch {
      // share dismissed or failed — no-op
    }
  };

  const handleOpenMaps = () => {
    const query = encodeURIComponent(
      [vendor?.address, (event as unknown as { address?: string })?.address, event?.location, (event as unknown as { city?: string })?.city]
        .filter(Boolean)
        .join(", ") || "India",
    );
    const url = Platform.OS === "ios"
      ? `maps://maps.apple.com/maps?q=${query}`
      : `https://maps.google.com/?q=${query}`;
    Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/?q=${query}`));
  };

  const handleValidateCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    setCouponError("");
    setCouponState(null);
    try {
      const result = await customFetch<{ valid: boolean; discountPercent: number }>("/api/coupons/validate", {
        method: "POST",
        body: JSON.stringify({ code: couponInput.trim().toUpperCase() }),
      });
      if (result.valid) {
        setCouponState({ code: couponInput.trim().toUpperCase(), discountPercent: result.discountPercent });
      } else {
        setCouponError(t("events.coupon_invalid"));
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setCouponError(err?.message ?? t("events.coupon_invalid"));
    } finally {
      setCouponLoading(false);
    }
  };

  const isPub = (event as unknown as { type?: string })?.type === "pub";
  const eventCity = (event as unknown as { city?: string })?.city;

  const { data: similarPubs = [] } = useQuery<any[]>({
    queryKey: ["similar-pubs-mobile", eventId, eventCity],
    queryFn: () => customFetch<any[]>(`/api/events?type=pub&city=${encodeURIComponent(eventCity ?? "")}&limit=5`),
    enabled: isPub && !!eventCity,
    select: (data) => data.filter((e: any) => e.id !== eventId).slice(0, 4),
  });
  const { data: eventAnnouncements = [] } = useQuery<{ id: number; title: string; body: string; announceDate: string; announceTime: string; imageUrl: string }[]>({
    queryKey: ["event-announcements", eventId],
    queryFn: () => customFetch(`/api/events/${eventId}/announcements`),
    enabled: !!eventId,
  });

  const vendorId = (event as unknown as EventWithVendor).vendorId ?? (event as unknown as EventWithVendor).vendor?.id;
  const { data: drinkPlans = [] } = useListVendorDrinkPlans(vendorId ?? 0, {
    query: { queryKey: getListVendorDrinkPlansQueryKey(vendorId ?? 0), enabled: isPub && !!vendorId },
  });

  const basePriceWomen = isPub ? parseFloat(String((event as unknown as { priceWomen?: unknown })?.priceWomen ?? 0)) : 0;
  const basePriceMen = isPub ? parseFloat(String((event as unknown as { priceMen?: unknown })?.priceMen ?? 0)) : 0;
  const basePriceCouple = isPub ? parseFloat(String((event as unknown as { priceCouple?: unknown })?.priceCouple ?? 0)) : 0;
  const eventDayPricing = (event as unknown as { dayPricing?: Record<string, { women: number; men: number; couple: number } | null> })?.dayPricing ?? null;
  const bookingDayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${bookingDate}T12:00:00`).getDay()];
  const dayOverrideMobile = isPub && eventDayPricing?.[bookingDayName] ? eventDayPricing[bookingDayName] : null;
  const priceWomen = dayOverrideMobile ? Number(dayOverrideMobile.women) : basePriceWomen;
  const priceMen = dayOverrideMobile ? Number(dayOverrideMobile.men) : basePriceMen;
  const priceCouple = dayOverrideMobile ? Number(dayOverrideMobile.couple) : basePriceCouple;
  const basePrice = parseFloat(String(event?.price ?? 0));

  const freeEntryRules = (event as unknown as { freeEntryRules?: { enabled?: boolean; days?: string[] } })?.freeEntryRules;
  const isFreeEntryDay = isPub && (
    (freeEntryRules?.enabled === true && (freeEntryRules.days ?? []).includes(bookingDayName)) ||
    (priceWomen === 0 && priceMen === 0 && priceCouple === 0)
  );

  const subtotal = isPub
    ? ticketWomen * priceWomen + ticketMen * priceMen + ticketCouple * priceCouple
    : basePrice * (parseInt(guests) || 1);

  const newUserPercent = discountInfo?.isNewUser && !couponState ? (discountInfo.bookingDiscountPercent || 0) : 0;
  const couponPercent = couponState?.discountPercent ?? 0;
  const discount = couponState
    ? Math.round(subtotal * (couponPercent / 100))
    : Math.round(subtotal * (newUserPercent / 100));
  const POINTS_RUPEE_RATE = 0.10; // 100 pts = ₹10
  const pointsCap = Math.max(0, subtotal - discount);
  const pointsAvail = Math.min(discountInfo?.points ?? 0, Math.floor(pointsCap / POINTS_RUPEE_RATE));
  const pointsApplied = Math.min(parseInt(pointsInput) || 0, pointsAvail);
  const finalTotal = Math.max(0, subtotal - discount - pointsApplied * POINTS_RUPEE_RATE);

  const bookingMutation = useCreateBooking({
    mutation: {
      onSuccess: async (data: unknown) => {
        const d = data as { requiresPayment?: boolean; redirectUrl?: string } | undefined;
        if (d?.requiresPayment && d?.redirectUrl) {
          setShowBooking(false);
          const browserResult = await WebBrowser.openAuthSessionAsync(d.redirectUrl, "royvento://");
          if (browserResult.type === "success") {
            const parsed = new URL(browserResult.url);
            const payment = parsed.searchParams.get("payment") ?? "failed";
            const id = parsed.searchParams.get("id") ?? undefined;
            router.replace(`/payment-result?payment=${encodeURIComponent(payment)}${id ? `&bookingId=${encodeURIComponent(id)}` : ""}`);
          } else {
            router.replace("/payment-result?payment=failed");
          }
          return;
        }
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowBooking(false);
        qc.invalidateQueries({ queryKey: getListMyBookingsQueryKey() });
        Alert.alert(
          t("events.booking_confirmed"),
          t("events.booking_confirmed_desc"),
          [{ text: t("events.view_bookings_btn"), onPress: () => router.push("/(tabs)/bookings") }, { text: "OK" }],
        );
      },
      onError: (err: Error) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const msg = err?.message ?? "Something went wrong";
        const isUnconfigured = msg.toLowerCase().includes("online payments are not set up") || msg.includes("PHONEPE_UNCONFIGURED");
        Alert.alert(
          isUnconfigured ? t("events.online_pay_unavailable") : t("events.booking_failed"),
          isUnconfigured ? t("events.online_pay_unavailable_desc") : msg,
        );
      },
    },
  });

  const handleBook = () => {
    if (!user) { router.push("/(auth)/login"); return; }
    const today = new Date().toISOString().slice(0, 10);
    if (bookingDate < today) { Alert.alert(t("events.invalid_date"), t("events.date_future")); return; }
    if (isPub && pubMode === "ticket" && ticketWomen + ticketMen + ticketCouple === 0) {
      Alert.alert(t("events.add_tickets"), t("events.add_tickets_desc"));
      return;
    }
    if (isPub && pubMode === "event" && (!parseInt(guests) || parseInt(guests) < 10)) {
      Alert.alert(t("events.min_guests"), t("events.min_guests_desc"));
      return;
    }
    if (isPub && pubMode === "event" && !arrivalTime.trim()) {
      Alert.alert(t("events.arrival_time"), "Please enter the expected arrival time (HH:MM).");
      return;
    }

    if (!agreedTerms) {
      Alert.alert("Consent required", "Please agree to the Terms & Conditions and Privacy Policy to continue.");
      return;
    }
    if (isPub && !confirmedAge) {
      Alert.alert("Age confirmation required", "Please confirm you are 18 or older to continue.");
      return;
    }

    const payload: Record<string, unknown> = {
      eventId,
      bookingDate,
      phone: phone.replace(/\D/g, "").slice(-10) || undefined,
      notes: notes.trim() || undefined,
      couponCode: couponState?.code || undefined,
      pointsToUse: pointsApplied || undefined,
      paymentMethod,
      callbackScheme: "royvento",
    };

    if (isPub) {
      payload.pubMode = pubMode;
      payload.personName = personName.trim() || undefined;
      if (pubMode === "ticket") {
        payload.ticketWomen = ticketWomen;
        payload.ticketMen = ticketMen;
        payload.ticketCouple = ticketCouple;
        payload.guests = ticketWomen + ticketMen + ticketCouple * 2;
      } else {
        payload.guests = parseInt(guests) || 10;
        payload.notes = occasion;
        payload.selectedPubEvent = "";
        payload.arrivalTime = arrivalTime.trim();
      }
    } else {
      payload.guests = parseInt(guests) || 1;
    }

    bookingMutation.mutate({ data: payload as unknown as Parameters<typeof bookingMutation.mutate>[0]["data"] });
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: colors.mutedForeground }}>{t("events.not_found")}</Text>
      </View>
    );
  }

  const avgRating = reviews?.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  const vendor = (event as unknown as EventWithVendor).vendor;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero image */}
        <View style={styles.imageContainer}>
          {event.imageUrl ? (
            <Image source={{ uri: event.imageUrl }} style={styles.heroImage} contentFit="cover" />
          ) : (
            <View style={[styles.heroImage, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="musical-notes" size={48} color={colors.mutedForeground} />
            </View>
          )}
          <View style={[styles.overlay, { paddingTop: topPadding + 8 }]}>
            <Pressable onPress={() => router.back()} style={[styles.circleBtn, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </Pressable>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={handleShare} style={[styles.circleBtn, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
                <Ionicons name="share-outline" size={20} color="#fff" />
              </Pressable>
              <Pressable onPress={toggleWishlist} style={[styles.circleBtn, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
                <Ionicons name={isWishlisted ? "heart" : "heart-outline"} size={20} color={isWishlisted ? "#ef4444" : "#fff"} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Gallery strip — shown right below the hero, matching the web layout */}
        {(event.galleryImages ?? []).length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.galleryStrip}
            contentContainerStyle={styles.galleryStripContent}
          >
            {(event.galleryImages ?? []).map((img, i) => (
              <Image
                key={i}
                source={{ uri: img }}
                style={[styles.galleryStripImg, { borderColor: colors.border }]}
                contentFit="cover"
              />
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.content}>
          {/* Category + type + rating */}
          <View style={styles.row}>
            <View style={[styles.catBadge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.catText, { color: colors.primaryForeground }]}>{event.category}</Text>
            </View>
            {isPub && (
              <View style={[styles.catBadge, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border }]}>
                <Text style={[styles.catText, { color: colors.mutedForeground }]}>{t("events.pub_label")}</Text>
              </View>
            )}
            {(() => {
              const cl = (event as unknown as { vendorCrowdLevel?: string | null }).vendorCrowdLevel;
              if (!cl) return null;
              const cfg = cl === "party"
                ? { color: "#ef4444", label: "🔥 Party Mode" }
                : cl === "moderate"
                  ? { color: "#f59e0b", label: "Moderate Crowd" }
                  : { color: "#22c55e", label: "Low Crowd" };
              return (
                <View style={[styles.catBadge, { backgroundColor: cfg.color + "22", borderWidth: 1, borderColor: cfg.color + "55", flexDirection: "row", alignItems: "center", gap: 4 }]}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cfg.color }} />
                  <Text style={[styles.catText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              );
            })()}
            {avgRating ? (
              <View style={styles.row}>
                <Ionicons name="star" size={13} color={colors.primary} />
                <Text style={[styles.rating, { color: colors.foreground }]}>{avgRating}</Text>
                <Text style={[styles.ratingCount, { color: colors.mutedForeground }]}>({reviews!.length})</Text>
              </View>
            ) : null}
          </View>

          <Text style={[styles.eventTitle, { color: colors.foreground }]}>{event.title}</Text>

          <Pressable
            onPress={handleOpenMaps}
            style={[styles.locationCard, { backgroundColor: colors.muted, borderColor: colors.border }]}
          >
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={[styles.locationIconBox, { backgroundColor: colors.primary + "20" }]}>
                <Ionicons name="location" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.locationLabel, { color: colors.mutedForeground }]}>{t("events.location_label")}</Text>
                <Text style={[styles.locationText, { color: colors.foreground }]} numberOfLines={2}>
                  {vendor?.address ||
                    [
                      event.location,
                      (event as unknown as { city?: string })?.city,
                      (event as unknown as { state?: string })?.state,
                    ].filter(Boolean).join(", ") ||
                    "India"}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 11, color: colors.primary, fontFamily: "Inter_500Medium" }}>{t("events.open_in_maps")}</Text>
              <Ionicons name="open-outline" size={13} color={colors.primary} />
            </View>
          </Pressable>

          {/* Price */}
          {basePrice > 0 && !isPub ? (
            <View style={[styles.priceRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>{t("events.starting_from")}</Text>
              <Text style={[styles.priceValue, { color: colors.primary }]}>{formatINR(basePrice)}</Text>
            </View>
          ) : null}

          {/* Pub pricing */}
          {isPub && !isFreeEntryDay && (priceWomen > 0 || priceMen > 0) ? (
            <View style={[styles.pubPricing, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              {[
                { label: t("events.women"), p: priceWomen },
                { label: t("events.men"), p: priceMen },
                { label: t("events.couple"), p: priceCouple },
              ].filter((x) => x.p > 0).map((x) => (
                <View key={x.label} style={styles.pubPriceItem}>
                  <Text style={[styles.pubPriceLabel, { color: colors.mutedForeground }]}>{x.label}</Text>
                  <Text style={[styles.pubPriceVal, { color: colors.foreground }]}>{formatINR(x.p)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Free entry block (pub) */}
          {isPub && (() => {
            const fer = event?.freeEntryRules;
            if (!fer?.enabled) return null;
            return (
              <View style={[styles.freeEntryBox, { backgroundColor: "#052e16", borderColor: "#16a34a44" }]}>
                <View style={styles.freeEntryHeader}>
                  <View style={[styles.freeEntryDot, { backgroundColor: "#22c55e" }]} />
                  <Text style={[styles.freeEntryTitle, { color: "#4ade80" }]}>{t("events.free_entry")}</Text>
                </View>
                {fer.genders.length > 0 && (
                  <Text style={[styles.freeEntryLine, { color: "#86efac" }]}>
                    {t("events.free_for", { genders: fer.genders.join(", ") })}
                  </Text>
                )}
                {fer.days.length > 0 && (
                  <Text style={[styles.freeEntryLine, { color: "#86efac" }]}>
                    {t("events.free_days", { days: fer.days.join(", ") })}
                  </Text>
                )}
                {fer.beforeTime && (
                  <Text style={[styles.freeEntryLine, { color: "#86efac" }]}>
                    {t("events.free_before", { time: fer.beforeTime })}
                  </Text>
                )}
              </View>
            );
          })()}

          {/* Drink deals (pub) */}
          {isPub && drinkPlans.length > 0 ? (
            <View style={[styles.drinkDealsBox, { borderColor: colors.primary + "40", backgroundColor: colors.primary + "0D" }]}>
              <View style={styles.drinkDealsHeader}>
                <Ionicons name="wine-outline" size={15} color={colors.primary} />
                <Text style={[styles.drinkDealsTitle, { color: colors.primary }]}>{t("events.drink_deals")}</Text>
              </View>
              <View style={{ gap: 12 }}>
                {drinkPlans.map((plan) => {
                  const hasItems = plan.lineItems && plan.lineItems.length > 0;
                  const isExpanded = expandedDrinkPlans.has(plan.id);
                  const isDrinkPlanAvailableToday = (() => {
                    const DAY_ABBRS_LOCAL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                    if (!plan.days || plan.days.length === 0) return false;
                    const todayAbbr = DAY_ABBRS_LOCAL[new Date().getDay()];
                    if (!plan.days.includes(todayAbbr)) return false;
                    if (plan.timeFrom || plan.timeTo) {
                      const now = new Date();
                      const currentMins = now.getHours() * 60 + now.getMinutes();
                      if (plan.timeFrom) {
                        const [fh, fm] = plan.timeFrom.split(":").map(Number);
                        if (currentMins < fh * 60 + (fm || 0)) return false;
                      }
                      if (plan.timeTo) {
                        const [th, tm] = plan.timeTo.split(":").map(Number);
                        if (currentMins > th * 60 + (tm || 0)) return false;
                      }
                    }
                    return true;
                  })();
                  const c = plan.type === "ticket" ? (plan.lineItems ?? []).filter((i: { name: string }) => i.name).length : 0;
                  const summary = plan.type === "welcome"
                    ? plan.gender === "female" ? t("events.drink_welcome_ladies") : t("events.drink_welcome_all")
                    : plan.type === "unlimited"
                    ? plan.gender === "female" ? t("events.drink_unlimited_ladies") : t("events.drink_unlimited_all")
                    : plan.type === "ticket"
                    ? (c === 1 ? t("events.drink_ticket_items_one") : c > 1 ? t("events.drink_ticket_items_other", { count: c }) : t("events.drink_ticket_generic"))
                    : plan.productName || t("events.drink_offer_generic");
                  return (
                    <View key={plan.id} style={{ gap: 4 }}>
                      <Pressable
                        style={styles.drinkPlanRow}
                        onPress={hasItems ? () => setExpandedDrinkPlans((prev) => {
                          const next = new Set(prev);
                          if (next.has(plan.id)) next.delete(plan.id); else next.add(plan.id);
                          return next;
                        }) : undefined}
                      >
                        <Text style={[styles.drinkPlanSummary, { color: colors.foreground, flex: 1 }]}>{summary}</Text>
                        {isDrinkPlanAvailableToday && (
                          <View style={{ backgroundColor: "#10b98122", borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: "#10b98144", marginRight: 4 }}>
                            <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#34d399" }}>Today</Text>
                          </View>
                        )}
                        <View style={[styles.genderPill, { backgroundColor: colors.primary + "22" }]}>
                          <Text style={[styles.genderPillText, { color: colors.primary }]}>
                            {plan.gender === "female" ? "Ladies" : "All guests"}
                          </Text>
                        </View>
                        {hasItems ? (
                          <Ionicons
                            name={isExpanded ? "chevron-up" : "chevron-down"}
                            size={13}
                            color={colors.mutedForeground}
                          />
                        ) : null}
                      </Pressable>
                      {/* Days / time / description detail */}
                      {((plan.days && plan.days.length > 0) || plan.timeFrom || plan.timeTo || plan.description) ? (
                        <View style={{ gap: 4, paddingLeft: 4 }}>
                          {((plan.days && plan.days.length > 0) || plan.timeFrom || plan.timeTo) ? (
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                              {plan.days && plan.days.map((d: string) => (
                                <View
                                  key={d}
                                  style={{
                                    backgroundColor: "rgba(0,0,0,0.45)",
                                    borderRadius: 6,
                                    paddingHorizontal: 7,
                                    paddingVertical: 2,
                                    borderWidth: 1,
                                    borderColor: "rgba(255,255,255,0.15)",
                                  }}
                                >
                                  <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff" }}>{d}</Text>
                                </View>
                              ))}
                              {(plan.timeFrom || plan.timeTo) ? (
                                <View
                                  style={{
                                    backgroundColor: "rgba(0,0,0,0.45)",
                                    borderRadius: 6,
                                    paddingHorizontal: 7,
                                    paddingVertical: 2,
                                    borderWidth: 1,
                                    borderColor: "rgba(255,255,255,0.15)",
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 3,
                                  }}
                                >
                                  <Ionicons name="time-outline" size={9} color="#fff" />
                                  <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                                    {plan.timeFrom || ""}{plan.timeTo ? ` – ${plan.timeTo}` : ""}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          ) : null}
                          {plan.description ? (
                            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 16 }}>
                              {plan.description}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                      {hasItems && isExpanded ? (
                        <View style={{ paddingLeft: 12, gap: 2 }}>
                          {plan.lineItems!.map((item: { name: string; qty: number }, i: number) => (
                            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <View style={[styles.drinkDot, { backgroundColor: colors.primary + "66" }]} />
                              <Text style={[styles.drinkLineItem, { color: colors.mutedForeground }]}>
                                {item.qty}× {item.name}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Description */}
          {event.description ? (
            <View style={{ gap: 6 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("events.about_section")}</Text>
              <Text style={[styles.description, { color: colors.mutedForeground }]}>{event.description}</Text>
            </View>
          ) : null}

          {/* Day hours (pub) */}
          {vendor?.dayHours && Object.keys(vendor.dayHours).length > 0 ? (
            <View style={{ gap: 8 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("events.opening_hours")}</Text>
              <View style={[{ borderRadius: 12, borderWidth: 1, overflow: "hidden", borderColor: colors.border }]}>
                {Object.entries(vendor.dayHours).map(([day, times], i) => (
                  <View
                    key={day}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      backgroundColor: i % 2 === 0 ? colors.card : colors.muted,
                      borderBottomWidth: i < Object.keys(vendor!.dayHours!).length - 1 ? 1 : 0,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <Text style={{ width: 40, fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{day}</Text>
                    {times ? (
                      <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                        {fmtTime(times.open)} – {fmtTime(times.close)}
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontStyle: "italic" }}>{t("events.closed_label")}</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ) : vendor?.openDays && vendor.openDays.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("events.open_days")}</Text>
              <Text style={[styles.description, { color: colors.mutedForeground }]}>{vendor.openDays.join(", ")}</Text>
            </View>
          ) : null}

          {eventAnnouncements.length > 0 ? (
            <View style={{ gap: 10 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("events.announcements")}</Text>
              {eventAnnouncements.map((ann) => (
                <View
                  key={ann.id}
                  style={[styles.announcementItem, { backgroundColor: colors.card, borderColor: colors.primary + "40" }]}
                >
                  <View style={styles.announcementItemHeader}>
                    <View style={[styles.announcementItemIcon, { backgroundColor: colors.primary + "20" }]}>
                      <Ionicons name="megaphone-outline" size={16} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.announcementItemTitle, { color: colors.foreground }]}>{ann.title}</Text>
                      {ann.announceDate ? (
                        <View style={styles.announcementItemDateRow}>
                          <Ionicons name="calendar-outline" size={11} color={colors.mutedForeground} />
                          <Text style={[styles.announcementItemDate, { color: colors.mutedForeground }]}>
                            {new Date(ann.announceDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                            {ann.announceTime ? `  ·  ${ann.announceTime}` : ""}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  {ann.body ? (
                    <Text style={[styles.announcementItemBody, { color: colors.mutedForeground }]}>{ann.body}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {isPub && similarPubs.length > 0 ? (
            <View style={{ gap: 10 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("events.similar_pubs")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}>
                <View style={{ flexDirection: "row", paddingHorizontal: 20, gap: 12 }}>
                  {similarPubs.map((pub: any) => (
                    <Pressable
                      key={pub.id}
                      onPress={() => router.push(`/event/${pub.id}` as never)}
                      style={[styles.similarPubCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      {pub.imageUrl ? (
                        <Image source={{ uri: pub.imageUrl }} style={styles.similarPubImage} contentFit="cover" />
                      ) : (
                        <View style={[styles.similarPubImage, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
                          <Ionicons name="wine-outline" size={24} color={colors.mutedForeground} />
                        </View>
                      )}
                      <View style={styles.similarPubInfo}>
                        <Text style={[styles.similarPubName, { color: colors.foreground }]} numberOfLines={2}>{pub.title}</Text>
                        {pub.city ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
                            <Ionicons name="location-outline" size={10} color={colors.mutedForeground} />
                            <Text style={[styles.similarPubCity, { color: colors.mutedForeground }]}>{pub.city}</Text>
                          </View>
                        ) : null}
                        {pub.price != null && Number(pub.price) > 0 ? (
                          <Text style={[styles.similarPubPrice, { color: colors.primary }]}>{formatINR(Number(pub.price))}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              {eventCity ? (
                <Pressable
                  onPress={() => router.push(`/(tabs)/explore?city=${encodeURIComponent(eventCity)}&type=pub` as never)}
                  style={{ alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 }}
                >
                  <Text style={{ fontSize: 13, color: colors.primary }}>{t("events.see_all_in_city", { city: eventCity })}</Text>
                  <Ionicons name="arrow-forward" size={13} color={colors.primary} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* Reviews */}
          {(reviews ?? []).length > 0 ? (
            <View style={{ gap: 10 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Reviews</Text>
              {(reviews ?? []).slice(0, 5).map((r) => (
                <View key={r.id} style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.reviewHeader}>
                    <View style={[styles.reviewAvatar, { backgroundColor: colors.muted }]}>
                      <Ionicons name="person" size={14} color={colors.mutedForeground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reviewerName, { color: colors.foreground }]}>{r.userName || "Customer"}</Text>
                      <View style={{ flexDirection: "row", gap: 2 }}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Ionicons key={i} name={i < r.rating ? "star" : "star-outline"} size={11} color={colors.primary} />
                        ))}
                      </View>
                    </View>
                  </View>
                  {r.comment ? (
                    <Text style={[styles.reviewComment, { color: colors.mutedForeground }]}>{r.comment}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {/* Review submission form — shown only to logged-in users with a booking */}
          {vendor?.id ? (
            <ReviewForm
              user={user}
              reviews={reviews}
              eventId={eventId}
              vendorId={vendor.id}
              isEligible={hasEventBooking}
            />
          ) : null}
        </View>

        {/* ─── Booking form ─── */}
        {showBooking ? (
          <View style={[styles.bookingForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("events.book_this")}</Text>

            {/* Open-days note */}
            {vendor?.openDays && vendor.openDays.length > 0 ? (
              <View style={[styles.openDaysRow, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}>
                <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                <Text style={[styles.openDaysText, { color: colors.primary }]}>{t("events.open_days_note", { days: vendor.openDays.join(", ") })}</Text>
              </View>
            ) : null}

            {/* Date picker */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("events.booking_date")}</Text>
              <TouchableOpacity
                style={[styles.fieldInput, styles.datePickerBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-clear-outline" size={16} color={colors.primary} />
                <Text style={[styles.datePickerText, { color: colors.foreground }]}>{bookingDate}</Text>
              </TouchableOpacity>
              {(showDatePicker || Platform.OS === "ios") && (
                <DateTimePicker
                  value={bookingDateObj}
                  mode="date"
                  display={Platform.OS === "android" ? "calendar" : "spinner"}
                  minimumDate={new Date()}
                  themeVariant="dark"
                  onChange={(_e, selected) => {
                    setShowDatePicker(false);
                    if (selected) setBookingDateObj(selected);
                  }}
                />
              )}
            </View>

            {/* Free-entry day notice */}
            {isFreeEntryDay ? (
              <View style={[styles.freeEntryNotice, { backgroundColor: "#052e16", borderColor: "#16a34a44" }]}>
                <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                <Text style={[styles.freeEntryNoticeText, { color: "#4ade80" }]}>
                  {t("events.free_entry_form_notice")}
                </Text>
              </View>
            ) : null}

            {/* Pub booking type + conditional fields OR guest count */}
            {isPub ? (
              <>
                {/* Booking type toggle */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("events.booking_type")}</Text>
                  <View style={styles.modeRow}>
                    {(["ticket", "event"] as const).map((m) => (
                      <Pressable
                        key={m}
                        onPress={() => setPubMode(m)}
                        style={[
                          styles.modeBtn,
                          { borderColor: pubMode === m ? colors.primary : colors.border, backgroundColor: pubMode === m ? colors.primary + "18" : colors.muted },
                        ]}
                      >
                        <Ionicons
                          name={m === "ticket" ? "ticket-outline" : "people-outline"}
                          size={14}
                          color={pubMode === m ? colors.primary : colors.mutedForeground}
                        />
                        <Text style={[styles.modeBtnText, { color: pubMode === m ? colors.primary : colors.mutedForeground }]}>
                          {m === "ticket" ? t("events.buy_tickets") : t("events.table_booking")}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Ticket counters — ticket mode */}
                {pubMode === "ticket" && (
                  <View style={[styles.pubTickets, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>{t("events.ticket_counts")}</Text>
                    {(isFreeEntryDay || priceWomen > 0) && (
                      <TickerCounter label={t("events.women")} value={ticketWomen} price={isFreeEntryDay ? undefined : priceWomen} onChange={setTicketWomen}
                        color={colors.foreground} mutedColor={colors.mutedForeground} />
                    )}
                    {(isFreeEntryDay || priceMen > 0) && (
                      <TickerCounter label={t("events.men")} value={ticketMen} price={isFreeEntryDay ? undefined : priceMen} onChange={setTicketMen}
                        color={colors.foreground} mutedColor={colors.mutedForeground} />
                    )}
                    {(isFreeEntryDay || priceCouple > 0) && (
                      <TickerCounter label={t("events.couple")} value={ticketCouple} price={isFreeEntryDay ? undefined : priceCouple} onChange={setTicketCouple}
                        color={colors.foreground} mutedColor={colors.mutedForeground} />
                    )}
                  </View>
                )}

                {/* Occasion + guests — event mode */}
                {pubMode === "event" && (
                  <>
                    <View style={styles.field}>
                      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("events.occasion_label")}</Text>
                      <View style={styles.occasionGrid}>
                        {(["farewell", "office-party", "casual-party", "birthday", "others"] as const).map((occ) => (
                          <Pressable
                            key={occ}
                            onPress={() => setOccasion(occ)}
                            style={[
                              styles.occasionChip,
                              { borderColor: occasion === occ ? colors.primary : colors.border, backgroundColor: occasion === occ ? colors.primary + "18" : colors.muted },
                            ]}
                          >
                            <Text style={[styles.occasionChipText, { color: occasion === occ ? colors.primary : colors.mutedForeground }]}>
                              {occ === "farewell" ? t("events.occ_farewell") : occ === "office-party" ? t("events.occ_office_party") : occ === "casual-party" ? t("events.occ_casual_party") : occ === "birthday" ? t("events.occ_birthday") : t("events.occ_others")}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                    <View style={styles.field}>
                      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("events.guests_field")} <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular" }}>{t("events.guests_min_10")}</Text></Text>
                      <TextInput
                        style={[styles.fieldInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                        value={guests}
                        onChangeText={setGuests}
                        placeholder="10"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="number-pad"
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("events.arrival_time")} <Text style={{ color: "#f87171", fontSize: 11 }}>*</Text></Text>
                      <TextInput
                        style={[styles.fieldInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                        value={arrivalTime}
                        onChangeText={setArrivalTime}
                        placeholder="HH:MM"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                      />
                    </View>
                  </>
                )}

                {/* Booking under name */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("events.booking_name")}</Text>
                  <TextInput
                    style={[styles.fieldInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                    value={personName}
                    onChangeText={setPersonName}
                    placeholder={t("events.name_on_booking")}
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              </>
            ) : (
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("events.guests_field")}</Text>
                <TextInput
                  style={[styles.fieldInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                  value={guests}
                  onChangeText={setGuests}
                  placeholder="1"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                />
              </View>
            )}

            {/* Phone */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("events.contact_phone")}</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                value={phone}
                onChangeText={setPhone}
                placeholder="+91 98765 43210"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
              />
            </View>

            {/* Coupon code */}
            {!isFreeEntryDay && <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("events.coupon_code_field")}</Text>
              <View style={styles.couponRow}>
                <TextInput
                  style={[styles.fieldInput, styles.couponInput, { backgroundColor: colors.muted, borderColor: couponState ? "#22c55e" : colors.border, color: colors.foreground }]}
                  value={couponInput}
                  onChangeText={(inp) => { setCouponInput(inp); setCouponState(null); setCouponError(""); }}
                  placeholder="Enter code"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[styles.couponBtn, { backgroundColor: colors.primary }, couponLoading && { opacity: 0.6 }]}
                  onPress={handleValidateCoupon}
                  disabled={couponLoading || !couponInput.trim()}
                >
                  {couponLoading ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Text style={[styles.couponBtnText, { color: colors.primaryForeground }]}>{t("events.apply_coupon")}</Text>
                  )}
                </TouchableOpacity>
              </View>
              {couponState && (
                <View style={styles.couponSuccess}>
                  <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                  <Text style={[styles.couponSuccessText, { color: "#22c55e" }]}>{t("events.coupon_pct_off", { pct: couponState.discountPercent })}</Text>
                </View>
              )}
              {couponError ? <Text style={[styles.couponErrorText, { color: "#ef4444" }]}>{couponError}</Text> : null}
            </View>}

            {/* Points redemption */}
            {!isFreeEntryDay && (discountInfo?.points ?? 0) > 0 ? (
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("events.loyalty_points")}</Text>
                <View style={[styles.pointsBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Ionicons name="diamond-outline" size={14} color={colors.primary} />
                    <Text style={[styles.pointsAvail, { color: colors.foreground }]}>
                      {t("events.pts_available", { n: discountInfo!.points })} (≈{formatINR(discountInfo!.points * 0.10)})
                    </Text>
                  </View>
                  <View style={styles.couponRow}>
                    <TextInput
                      style={[styles.fieldInput, styles.couponInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      value={pointsInput}
                      onChangeText={(inp) => setPointsInput(inp.replace(/\D/g, ""))}
                      placeholder="0"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="number-pad"
                    />
                    <TouchableOpacity
                      style={[styles.couponBtn, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border }]}
                      onPress={() => setPointsInput(String(pointsAvail))}
                    >
                      <Text style={[styles.couponBtnText, { color: colors.foreground }]}>{t("events.max_btn")}</Text>
                    </TouchableOpacity>
                  </View>
                  {pointsApplied > 0 && (
                    <Text style={[styles.couponSuccessText, { color: colors.primary, marginTop: 4 }]}>
                      {t("events.pts_deducted", { amount: formatINR(pointsApplied * POINTS_RUPEE_RATE) })}
                    </Text>
                  )}
                </View>
              </View>
            ) : null}

            {/* Notes */}
            {!isFreeEntryDay && <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("events.notes_optional")}</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldTextArea, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                value={notes}
                onChangeText={setNotes}
                placeholder={t("events.notes_placeholder")}
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={3}
              />
            </View>}

            {/* Payment method toggle */}
            {!isFreeEntryDay && <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("events.payment_method")}</Text>
              <View style={[styles.payToggle, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                {(["cod", "online"] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.payOption, paymentMethod === m && { backgroundColor: colors.primary }]}
                    onPress={() => setPaymentMethod(m)}
                  >
                    <Ionicons
                      name={m === "cod" ? "cash-outline" : "card-outline"}
                      size={14}
                      color={paymentMethod === m ? colors.primaryForeground : colors.mutedForeground}
                    />
                    <Text style={[styles.payOptionText, { color: paymentMethod === m ? colors.primaryForeground : colors.mutedForeground }]}>
                      {m === "cod" ? t("events.pay_venue") : t("events.pay_online_label")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>}

            {/* Price summary */}
            {!isFreeEntryDay && subtotal > 0 ? (
              <View style={[styles.summary, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{t("events.subtotal_label")}</Text>
                  <Text style={[styles.summaryVal, { color: colors.foreground }]}>{formatINR(subtotal)}</Text>
                </View>
                {discount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: "#22c55e" }]}>
                      {couponState ? t("events.discount_coupon_pct", { pct: couponState.discountPercent }) : t("events.new_user_pct", { pct: newUserPercent })}
                    </Text>
                    <Text style={[styles.summaryVal, { color: "#22c55e" }]}>−{formatINR(discount)}</Text>
                  </View>
                )}
                {pointsApplied > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: colors.primary }]}>{t("events.points_label")}</Text>
                    <Text style={[styles.summaryVal, { color: colors.primary }]}>−{formatINR(pointsApplied * POINTS_RUPEE_RATE)}</Text>
                  </View>
                )}
                <View style={[styles.summaryRow, styles.summaryTotal]}>
                  <Text style={[styles.summaryLabel, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{t("events.total_label")}</Text>
                  <Text style={[styles.summaryVal, { color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 18 }]}>{formatINR(finalTotal)}</Text>
                </View>
              </View>
            ) : null}

            {/* Consent checkboxes */}
            <View style={[styles.consentBox, { borderTopColor: colors.border }]}>
              <Pressable
                style={styles.consentRow}
                onPress={() => setAgreedTerms((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreedTerms }}
              >
                <View style={[styles.checkBox, { borderColor: agreedTerms ? colors.primary : colors.mutedForeground, backgroundColor: agreedTerms ? colors.primary : "transparent" }]}>
                  {agreedTerms && <Ionicons name="checkmark" size={12} color={colors.primaryForeground} />}
                </View>
                <Text style={[styles.consentText, { color: colors.mutedForeground }]}>
                  {"I agree to the "}
                  <Text
                    style={{ color: colors.primary, textDecorationLine: "underline" }}
                    onPress={() => Linking.openURL(`https://${process.env.EXPO_PUBLIC_DOMAIN ?? "royvento.com"}/terms`)}
                  >Terms & Conditions</Text>
                  {" and "}
                  <Text
                    style={{ color: colors.primary, textDecorationLine: "underline" }}
                    onPress={() => Linking.openURL(`https://${process.env.EXPO_PUBLIC_DOMAIN ?? "royvento.com"}/privacy`)}
                  >Privacy Policy</Text>
                </Text>
              </Pressable>

              {isPub && (
                <Pressable
                  style={styles.consentRow}
                  onPress={() => setConfirmedAge((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: confirmedAge }}
                >
                  <View style={[styles.checkBox, { borderColor: confirmedAge ? colors.primary : colors.mutedForeground, backgroundColor: confirmedAge ? colors.primary : "transparent" }]}>
                    {confirmedAge && <Ionicons name="checkmark" size={12} color={colors.primaryForeground} />}
                  </View>
                  <Text style={[styles.consentText, { color: colors.mutedForeground }]}>
                    I confirm I am 18 or older and understand that alcohol will be served at this venue
                  </Text>
                </Pressable>
              )}

              {(!agreedTerms || (isPub && !confirmedAge)) && (
                <Text style={[styles.consentHint, { color: colors.mutedForeground }]}>
                  Please tick {!agreedTerms && isPub && !confirmedAge ? "both boxes" : "the box above"} to proceed with your booking.
                </Text>
              )}
            </View>

            <View style={styles.bookingButtons}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowBooking(false)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>{t("events.cancel_btn")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary }, (bookingMutation.isPending || !agreedTerms || (isPub && !confirmedAge)) && { opacity: 0.5 }]}
                onPress={handleBook}
                disabled={bookingMutation.isPending || !agreedTerms || (isPub && !confirmedAge)}
              >
                {bookingMutation.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={[styles.submitBtnText, { color: colors.primaryForeground }]}>
                    {paymentMethod === "online" ? t("events.pay_confirm_btn") : t("events.confirm_btn")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <MobileFooter />
        <View style={{ height: BOTTOM_NAV_HEIGHT + insets.bottom + 120 }} />
      </ScrollView>

      {/* Sticky book button */}
      {!showBooking ? (
        <View style={[styles.stickyBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + (Platform.OS === "web" ? 34 : 12) }]}>
          <TouchableOpacity
            style={[styles.bookBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              if (!user) { setShowSignInModal(true); return; }
              setShowBooking(true);
            }}
          >
            <Ionicons name="calendar" size={18} color={colors.primaryForeground} />
            <Text style={[styles.bookBtnText, { color: colors.primaryForeground }]}>{t("events.book_now_btn")}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Sign-in prompt modal */}
      <Modal
        visible={showSignInModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignInModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowSignInModal(false)}
        >
          <Pressable
            style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {}}
          >
            <View style={[styles.modalIconWrap, { backgroundColor: colors.primary + "18" }]}>
              <Ionicons name="ticket-outline" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("events.sign_in_book_title")}</Text>
            <Text style={[styles.modalBody, { color: colors.mutedForeground }]}>
              {t("events.sign_in_book_body")}
            </Text>
            <TouchableOpacity
              style={[styles.modalPrimaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                setShowSignInModal(false);
                router.push({ pathname: "/(auth)/login", params: { returnTo: `/event/${eventId}` } });
              }}
            >
              <Ionicons name="log-in-outline" size={18} color={colors.primaryForeground} />
              <Text style={[styles.modalPrimaryBtnText, { color: colors.primaryForeground }]}>{t("events.sign_in_btn")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSecondaryBtn, { borderColor: colors.border }]}
              onPress={() => {
                setShowSignInModal(false);
                router.push({ pathname: "/(auth)/register", params: { returnTo: `/event/${eventId}` } });
              }}
            >
              <Text style={[styles.modalSecondaryBtnText, { color: colors.foreground }]}>{t("events.create_account_btn")}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSignInModal(false)} style={{ marginTop: 4 }}>
              <Text style={[styles.modalDismiss, { color: colors.mutedForeground }]}>{t("events.maybe_later")}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: { position: "relative", height: 340 },
  heroImage: { width: "100%", height: 340 },
  heroGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 140, backgroundColor: "transparent" },
  galleryStrip: { marginTop: 4 },
  galleryStripContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 10, flexDirection: "row" },
  galleryStripImg: { width: 148, height: 100, borderRadius: 14, borderWidth: 1 },
  locationCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: 12, borderRadius: 14, borderWidth: 1, padding: 14,
  },
  locationIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  locationLabel: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  locationText: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 19 },
  overlay: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 16,
  },
  circleBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  catBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  catText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  rating: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  ratingCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  eventTitle: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5, lineHeight: 32 },
  location: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  priceRow: { borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  priceLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  priceValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  pubPricing: { borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", gap: 20 },
  pubPriceItem: { alignItems: "center", gap: 3 },
  pubPriceLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  pubPriceVal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  freeEntryBox: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 6 },
  freeEntryHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  freeEntryDot: { width: 8, height: 8, borderRadius: 4 },
  freeEntryTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  freeEntryLine: { fontSize: 13, fontFamily: "Inter_400Regular" },
  freeEntryNotice: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  freeEntryNoticeText: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  gallery: { flexDirection: "row", paddingHorizontal: 20, gap: 10 },
  galleryImg: { width: 120, height: 90, borderRadius: 12, borderWidth: 1 },
  vendorRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  vendorAvatar: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  vendorName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  vendorCat: { fontSize: 12, fontFamily: "Inter_400Regular" },
  reviewCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  reviewHeader: { flexDirection: "row", gap: 12, alignItems: "center" },
  reviewAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  reviewerName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  stars: { flexDirection: "row", gap: 2, marginTop: 3 },
  reviewComment: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  bookingForm: { margin: 20, borderRadius: 16, borderWidth: 1, padding: 20, gap: 14 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4 },
  fieldInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular" },
  fieldTextArea: { height: 80, textAlignVertical: "top" },
  datePickerBtn: { flexDirection: "row", alignItems: "center", gap: 10 },
  datePickerText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  openDaysRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  openDaysText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  pubTickets: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 12 },
  modeRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 8 },
  modeBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  occasionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  occasionChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  occasionChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  tickerRow: { flexDirection: "row", alignItems: "center" },
  tickerLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tickerPrice: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  tickerControls: { flexDirection: "row", alignItems: "center", gap: 12 },
  tickerBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  tickerValue: { fontSize: 16, fontFamily: "Inter_700Bold", minWidth: 24, textAlign: "center" },
  couponRow: { flexDirection: "row", gap: 8 },
  couponInput: { flex: 1 },
  couponBtn: { borderRadius: 10, paddingHorizontal: 16, justifyContent: "center", alignItems: "center", minWidth: 60 },
  couponBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  couponSuccess: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  couponSuccessText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  couponErrorText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  pointsBox: { borderRadius: 12, borderWidth: 1, padding: 12 },
  pointsAvail: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  payToggle: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 4, gap: 4 },
  payOption: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 9, paddingVertical: 10 },
  payOptionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  summary: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  summaryVal: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  summaryTotal: { borderTopWidth: 1, paddingTop: 10, marginTop: 2 },
  bookingButtons: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  submitBtn: { flex: 2, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  submitBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  stickyBar: { borderTopWidth: 1, padding: 16 },
  bookBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 16 },
  bookBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  similarPubCard: { width: 160, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  similarPubImage: { width: "100%", height: 100 },
  similarPubInfo: { padding: 10, gap: 2 },
  similarPubName: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  similarPubCity: { fontSize: 11, fontFamily: "Inter_400Regular" },
  similarPubPrice: { fontSize: 13, fontFamily: "Inter_700Bold", marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 28, gap: 14, alignItems: "center" },
  modalIconWrap: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center", letterSpacing: -0.3 },
  modalBody: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  modalPrimaryBtn: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 16, marginTop: 4 },
  modalPrimaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  modalSecondaryBtn: { width: "100%", alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 14, paddingVertical: 14 },
  modalSecondaryBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  modalDismiss: { fontSize: 13, fontFamily: "Inter_400Regular", paddingVertical: 8 },
  drinkDealsBox: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  drinkDealsHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  drinkDealsTitle: { fontSize: 14, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.6 },
  drinkPlanRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  drinkPlanSummary: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 20 },
  genderPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  genderPillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  drinkDot: { width: 5, height: 5, borderRadius: 3, flexShrink: 0 },
  drinkLineItem: { fontSize: 12, fontFamily: "Inter_400Regular" },
  announcementItem: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  announcementItemHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  announcementItemIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  announcementItemTitle: { fontSize: 14, fontFamily: "Inter_700Bold", lineHeight: 19, flexShrink: 1 },
  announcementItemDateRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  announcementItemDate: { fontSize: 11, fontFamily: "Inter_500Medium" },
  announcementItemBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  consentBox: { gap: 12, borderTopWidth: 1, paddingTop: 12 },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkBox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 },
  consentText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, flex: 1 },
  consentHint: { fontSize: 11, fontFamily: "Inter_400Regular", opacity: 0.6, paddingLeft: 28 },
});
