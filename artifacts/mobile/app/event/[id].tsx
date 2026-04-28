import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetWishlistQueryKey,
  useAddToWishlist,
  useCreateBooking,
  useGetEvent,
  useGetWishlist,
  useListEventReviews,
  useRemoveFromWishlist,
} from "@workspace/api-client-react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface EventVendor {
  id: number;
  businessName: string;
  category: string;
  description?: string;
  location?: string;
  rating?: number;
  reviewCount?: number;
}

interface EventWithVendor {
  id: number;
  vendor?: EventVendor;
  vendorId?: number;
  vendorName?: string;
  [key: string]: unknown;
}

function formatINR(v: number) {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${Math.round(v)}`;
}

export default function EventDetailScreen() {
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

  const bookingDate = bookingDateObj.toISOString().slice(0, 10);

  const wishlistQuery = useGetWishlist({ query: { enabled: !!user } });
  const isWishlisted = wishlistQuery.data?.some((w) => w.id === eventId) ?? false;

  const addMutation = useAddToWishlist({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getGetWishlistQueryKey() }) },
  });
  const removeMutation = useRemoveFromWishlist({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getGetWishlistQueryKey() }) },
  });

  const toggleWishlist = async () => {
    if (!user) { router.push("/(auth)/login"); return; }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isWishlisted) {
      removeMutation.mutate({ eventId });
    } else {
      addMutation.mutate({ eventId });
    }
  };

  const bookingMutation = useCreateBooking({
    mutation: {
      onSuccess: async () => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowBooking(false);
        Alert.alert("Booking Requested!", "Your booking request has been sent. The partner will confirm soon.");
      },
      onError: (err: Error) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Booking Failed", err?.message ?? "Something went wrong");
      },
    },
  });

  const handleBook = () => {
    if (!user) { router.push("/(auth)/login"); return; }
    const today = new Date().toISOString().slice(0, 10);
    if (bookingDate < today) { Alert.alert("Invalid Date", "Booking date must be today or in the future."); return; }

    bookingMutation.mutate({
      data: {
        eventId,
        bookingDate,
        guests: parseInt(guests) || 1,
        phone: phone.replace(/\D/g, "").slice(-10) || undefined,
        notes: notes.trim() || undefined,
      },
    });
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
        <Text style={{ color: colors.mutedForeground }}>Event not found</Text>
      </View>
    );
  }

  const price = parseFloat(String(event.price) || "0");
  const avgRating = reviews?.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero image */}
        <View style={styles.imageContainer}>
          {event.imageUrl ? (
            <Image
              source={{ uri: event.imageUrl }}
              style={styles.heroImage}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.heroImage, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="musical-notes" size={48} color={colors.mutedForeground} />
            </View>
          )}
          {/* Back + Wishlist overlay */}
          <View style={[styles.overlay, { paddingTop: topPadding + 8 }]}>
            <Pressable
              onPress={() => router.back()}
              style={[styles.circleBtn, { backgroundColor: "rgba(0,0,0,0.5)" }]}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </Pressable>
            <Pressable
              onPress={toggleWishlist}
              style={[styles.circleBtn, { backgroundColor: "rgba(0,0,0,0.5)" }]}
            >
              <Ionicons
                name={isWishlisted ? "heart" : "heart-outline"}
                size={20}
                color={isWishlisted ? "#ef4444" : "#fff"}
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.content}>
          {/* Category + type */}
          <View style={styles.row}>
            <View style={[styles.catBadge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.catText, { color: colors.primaryForeground }]}>{event.category}</Text>
            </View>
            {event.type === "pub" && (
              <View style={[styles.catBadge, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border }]}>
                <Text style={[styles.catText, { color: colors.mutedForeground }]}>Pub</Text>
              </View>
            )}
            {avgRating ? (
              <View style={styles.row}>
                <Ionicons name="star" size={13} color={colors.primary} />
                <Text style={[styles.rating, { color: colors.foreground }]}>{avgRating}</Text>
                <Text style={[styles.ratingCount, { color: colors.mutedForeground }]}>({reviews!.length})</Text>
              </View>
            ) : null}
          </View>

          <Text style={[styles.eventTitle, { color: colors.foreground }]}>{event.title}</Text>

          <View style={styles.row}>
            <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
            <Text style={[styles.location, { color: colors.mutedForeground }]}>{event.location || "India"}</Text>
          </View>

          {/* Price */}
          {price > 0 ? (
            <View style={[styles.priceRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Starting from</Text>
              <Text style={[styles.priceValue, { color: colors.primary }]}>{formatINR(price)}</Text>
            </View>
          ) : null}

          {/* Pub pricing */}
          {event.type === "pub" && (parseFloat(String(event.priceWomen)) > 0 || parseFloat(String(event.priceMen)) > 0) ? (
            <View style={[styles.pubPricing, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              {[
                { label: "Women", price: event.priceWomen },
                { label: "Men", price: event.priceMen },
                { label: "Couple", price: event.priceCouple },
              ].filter((p) => parseFloat(String(p.price)) > 0).map((p) => (
                <View key={p.label} style={styles.pubPriceItem}>
                  <Text style={[styles.pubPriceLabel, { color: colors.mutedForeground }]}>{p.label}</Text>
                  <Text style={[styles.pubPriceVal, { color: colors.foreground }]}>
                    {formatINR(parseFloat(String(p.price)))}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Description */}
          {event.description ? (
            <View style={{ gap: 6 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>About</Text>
              <Text style={[styles.description, { color: colors.mutedForeground }]}>{event.description}</Text>
            </View>
          ) : null}

          {/* Gallery */}
          {(event.galleryImages ?? []).length > 0 ? (
            <View style={{ gap: 10 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Gallery</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}>
                <View style={styles.gallery}>
                  {(event.galleryImages ?? []).map((img, i) => (
                    <Image
                      key={i}
                      source={{ uri: img }}
                      style={[styles.galleryImg, { borderColor: colors.border }]}
                      contentFit="cover"
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}

          {/* Partner */}
          {(event as unknown as EventWithVendor).vendor ? (
            <Pressable
              style={[styles.vendorRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push(`/partner/${(event as unknown as EventWithVendor).vendor!.id}`)}
            >
              <View style={[styles.vendorAvatar, { backgroundColor: colors.muted }]}>
                <Ionicons name="business-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.vendorName, { color: colors.foreground }]}>
                  {(event as unknown as EventWithVendor).vendor!.businessName}
                </Text>
                <Text style={[styles.vendorCat, { color: colors.mutedForeground }]}>
                  {(event as unknown as EventWithVendor).vendor!.category}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}

          {/* Reviews */}
          {(reviews ?? []).length > 0 ? (
            <View style={{ gap: 10 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Reviews</Text>
              {reviews!.slice(0, 3).map((r) => (
                <View key={r.id} style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.reviewHeader}>
                    <View style={[styles.reviewAvatar, { backgroundColor: colors.muted }]}>
                      <Ionicons name="person" size={14} color={colors.mutedForeground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reviewerName, { color: colors.foreground }]}>
                        User #{r.userId}
                      </Text>
                      <View style={styles.stars}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Ionicons
                            key={i}
                            name={i < r.rating ? "star" : "star-outline"}
                            size={11}
                            color={colors.primary}
                          />
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
        </View>

        {/* Booking form */}
        {showBooking ? (
          <View style={[styles.bookingForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Book This Event</Text>

            {/* Open-days note from vendor */}
            {event.vendor?.openDays && event.vendor.openDays.length > 0 ? (
              <View style={[styles.openDaysRow, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}>
                <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                <Text style={[styles.openDaysText, { color: colors.primary }]}>
                  Open: {event.vendor.openDays.join(", ")}
                </Text>
              </View>
            ) : null}

            {/* Date picker */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Booking Date</Text>
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
                  onChange={(_event, selected) => {
                    setShowDatePicker(false);
                    if (selected) setBookingDateObj(selected);
                  }}
                />
              )}
            </View>

            {/* Guests */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Guests</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                value={guests}
                onChangeText={setGuests}
                placeholder="1"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
              />
            </View>

            {/* Phone */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Contact Phone</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                value={phone}
                onChangeText={setPhone}
                placeholder="+91 98765 43210"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
              />
            </View>

            {/* Notes */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Notes (optional)</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldTextArea, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Any special requests…"
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.bookingButtons}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowBooking(false)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary }, bookingMutation.isPending && { opacity: 0.7 }]}
                onPress={handleBook}
                disabled={bookingMutation.isPending}
              >
                {bookingMutation.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={[styles.submitBtnText, { color: colors.primaryForeground }]}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky book button */}
      {!showBooking ? (
        <View
          style={[
            styles.stickyBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 12),
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.bookBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              if (!user) { router.push("/(auth)/login"); return; }
              setShowBooking(true);
            }}
          >
            <Ionicons name="calendar" size={18} color={colors.primaryForeground} />
            <Text style={[styles.bookBtnText, { color: colors.primaryForeground }]}>Book Now</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: { position: "relative", height: 300 },
  heroImage: { width: "100%", height: 300 },
  overlay: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  circleBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  content: { padding: 20, gap: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  catBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  catText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  rating: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  ratingCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  eventTitle: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.4, lineHeight: 30 },
  location: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  priceRow: {
    borderRadius: 12, borderWidth: 1, padding: 14,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  priceLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  priceValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  pubPricing: { borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", gap: 20 },
  pubPriceItem: { alignItems: "center", gap: 3 },
  pubPriceLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  pubPriceVal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  gallery: { flexDirection: "row", paddingHorizontal: 20, gap: 10 },
  galleryImg: { width: 120, height: 90, borderRadius: 12, borderWidth: 1 },
  vendorRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  vendorAvatar: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  vendorName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  vendorCat: { fontSize: 12, fontFamily: "Inter_400Regular" },
  reviewCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  reviewHeader: { flexDirection: "row", gap: 10 },
  reviewAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  reviewerName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  stars: { flexDirection: "row", gap: 2, marginTop: 2 },
  reviewComment: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  bookingForm: { margin: 20, borderRadius: 16, borderWidth: 1, padding: 20, gap: 14 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4 },
  fieldInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular" },
  fieldTextArea: { height: 80, textAlignVertical: "top" },
  datePickerBtn: { flexDirection: "row", alignItems: "center", gap: 10 },
  datePickerText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  openDaysRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  openDaysText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  bookingButtons: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  submitBtn: { flex: 2, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  submitBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  stickyBar: { borderTopWidth: 1, padding: 16 },
  bookBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 16 },
  bookBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
