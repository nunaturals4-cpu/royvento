import { resolveImageUrl } from "@/lib/resolveImageUrl";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  customFetch,
  getGetReviewEligibilityQueryKey,
  getGetWishlistQueryKey,
  getListVendorReviewsQueryKey,
  useAddToWishlist,
  useGetVendor,
  useGetWishlist,
  useListEvents,
  useListVendorReviews,
  useRemoveFromWishlist,
} from "@workspace/api-client-react";
import type { Vendor } from "@workspace/api-client-react";
import { useQueryClient as useQC } from "@tanstack/react-query";
import { ReviewForm } from "@/components/ReviewForm";
import { ReviewItem } from "@/components/ReviewItem";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EventCard } from "@/components/EventCard";
import { FollowButton } from "@/components/FollowButton";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";

interface DrinkPlan {
  id: number;
  type: string;
  productName: string;
  gender: string;
  price: number;
  days: string[];
  timeFrom: string;
  timeTo: string;
  description: string;
  lineItems: { name: string; qty: number; discountedPrice: number }[] | null;
  drinksOfferLabel?: string;
  foodDiscountLabel?: string;
  validUntil?: string | null;
}

/* Standard Terms & Conditions shown on every pub profile by default — mirrors web event-detail.tsx. */
const DEFAULT_PUB_TERMS: string[] = [
  "Please carry a valid ID proof along with you.",
  "No refunds on purchased ticket are possible, even in case of any rescheduling.",
  "Security procedures, including frisking remain the right of the management.",
  "No dangerous or potentially hazardous objects including but not limited to weapons, knives, guns, fireworks, helmets, lazer devices, bottles, musical instruments will be allowed in the venue and may be ejected with or without the owner from the venue.",
  "The sponsors/performers/organizers are not responsible for any injury or damage occurring due to the event. Any claims regarding the same would be settled in courts in Mumbai.",
  "People in an inebriated state may not be allowed entry.",
  "Organizers hold the right to deny late entry to the event.",
  "Venue rules apply.",
];

interface VendorAnnouncement {
  id: number;
  title: string;
  body: string;
  announceDate: string;
}

function OffersStrip({ vendorId }: { vendorId: number }) {
  const colors = useColors();
  const { data: plans } = useQuery<DrinkPlan[]>({
    queryKey: ["vendorDrinkPlans", vendorId],
    queryFn: () => customFetch<DrinkPlan[]>(`/api/vendors/${vendorId}/drink-plans`),
    enabled: !!vendorId,
  });
  const { data: announcements } = useQuery<VendorAnnouncement[]>({
    queryKey: ["vendorAnnouncements", vendorId],
    queryFn: () => customFetch<VendorAnnouncement[]>(`/api/vendors/${vendorId}/announcements`),
    enabled: !!vendorId,
  });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const planCards = (plans ?? []).filter((p) => (p.drinksOfferLabel || p.foodDiscountLabel) && (!p.validUntil || p.validUntil >= today));
  const annoCards = announcements ?? [];
  if (planCards.length === 0 && annoCards.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="pricetag-outline" size={14} color={colors.primary} />
        <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.foreground, textTransform: "uppercase", letterSpacing: 0.6 }}>Today's Deals</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}>
        <View style={{ flexDirection: "row", paddingHorizontal: 20, gap: 10 }}>
          {planCards.map((plan) => {
            const TYPE_LABEL: Record<string, string> = { welcome: "Welcome Drink", unlimited: "Unlimited", ticket: "Ticket", custom: "Custom" };
            return (
              <View key={plan.id} style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.primary + "40", backgroundColor: colors.primary + "10", padding: 12, minWidth: 160, gap: 5 }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>{TYPE_LABEL[plan.type] ?? plan.type}</Text>
                {plan.drinksOfferLabel ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Ionicons name="wine-outline" size={12} color={colors.primary} />
                    <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground, flexShrink: 1 }}>{plan.drinksOfferLabel}</Text>
                  </View>
                ) : null}
                {plan.foodDiscountLabel ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Ionicons name="restaurant-outline" size={12} color="#f59e0b" />
                    <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground, flexShrink: 1 }}>{plan.foodDiscountLabel}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
          {annoCards.map((a) => (
            <View key={a.id} style={{ borderRadius: 14, borderWidth: 1, borderColor: "#f59e0b40", backgroundColor: "#f59e0b10", padding: 12, minWidth: 160, maxWidth: 220, gap: 5 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Ionicons name="megaphone-outline" size={12} color="#f59e0b" />
                <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#f59e0b", textTransform: "uppercase", letterSpacing: 0.5 }}>Announcement</Text>
              </View>
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground }} numberOfLines={2}>{a.title}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function DrinkPlansSection({ vendorId }: { vendorId: number }) {
  const colors = useColors();
  const { data: plans } = useQuery<DrinkPlan[]>({
    queryKey: ["vendorDrinkPlans", vendorId],
    queryFn: () => customFetch<DrinkPlan[]>(`/api/vendors/${vendorId}/drink-plans`),
    enabled: !!vendorId,
  });

  if (!plans || plans.length === 0) return null;

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  const TYPE_LABEL: Record<string, string> = {
    welcome: "Welcome Drink",
    unlimited: "Unlimited",
    ticket: "Ticket Plan",
    custom: "Custom",
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="wine-outline" size={16} color={colors.primary} />
        <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>Drink Plans</Text>
      </View>
      {plans.map((plan) => (
        <View
          key={plan.id}
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            padding: 14,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ backgroundColor: colors.primary + "20", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.primary }}>
                  {TYPE_LABEL[plan.type] ?? plan.type}
                </Text>
              </View>
              {plan.gender === "female" && (
                <View style={{ backgroundColor: "#ec489920", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#ec4899" }}>Ladies</Text>
                </View>
              )}
            </View>
            {plan.price > 0 && (
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                ₹{plan.price.toLocaleString("en-IN")}
              </Text>
            )}
          </View>

          {plan.productName ? (
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{plan.productName}</Text>
          ) : null}

          {plan.description ? (
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 19 }}>
              {plan.description}
            </Text>
          ) : null}

          {(plan.days && plan.days.length > 0 || plan.timeFrom || plan.timeTo) && (
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {plan.days && plan.days.map((d) => (
                <View key={d} style={{ backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" }}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff" }}>{d}</Text>
                </View>
              ))}
              {(plan.timeFrom || plan.timeTo) && (
                <View style={{ backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="time-outline" size={10} color="#fff" />
                  <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                    {[plan.timeFrom, plan.timeTo].filter(Boolean).join(" – ")}
                  </Text>
                </View>
              )}
            </View>
          )}

          {plan.lineItems && plan.lineItems.length > 0 && (
            <View style={{ gap: 4, marginTop: 4 }}>
              {plan.lineItems.map((item, i) => (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                    {item.qty}× {item.name}
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                    ₹{item.discountedPrice.toLocaleString("en-IN")}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {(plan.drinksOfferLabel || plan.foodDiscountLabel) && (!plan.validUntil || plan.validUntil >= today) && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {plan.drinksOfferLabel ? (
                <View style={{ backgroundColor: colors.primary + "20", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="wine-outline" size={11} color={colors.primary} />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.primary }}>{plan.drinksOfferLabel}</Text>
                </View>
              ) : null}
              {plan.foodDiscountLabel ? (
                <View style={{ backgroundColor: "#f59e0b20", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="restaurant-outline" size={11} color="#f59e0b" />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#f59e0b" }}>{plan.foodDiscountLabel}</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

export default function PartnerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();
  const vendorId = Number(id);
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const { data: vendor, isLoading } = useGetVendor(vendorId);
  const REVIEWS_PAGE_SIZE = 5;
  const [reviewsPage, setReviewsPage] = useState(1);
  const [venueFaqExpanded, setVenueFaqExpanded] = useState(false);
  const [venueTermsExpanded, setVenueTermsExpanded] = useState(false);
  useEffect(() => { setReviewsPage(1); }, [vendorId]);

  // Track profile view; skip self-views and StrictMode double-invokes.
  const lastTrackedVendorIdRef = React.useRef<number | null>(null);
  useEffect(() => {
    if (!vendorId || !vendor) return;
    if (user && vendor.userId === user.id) return;
    if (lastTrackedVendorIdRef.current === vendorId) return;
    lastTrackedVendorIdRef.current = vendorId;
    customFetch(`/api/partners/${vendorId}/view`, { method: "POST", body: JSON.stringify({}) }).catch(() => {});
  }, [vendorId, vendor, user?.id]);
  const reviewsQc = useQC();
  const { data: reviewsData, refetch: refetchReviews } = useListVendorReviews(vendorId, { page: reviewsPage, pageSize: REVIEWS_PAGE_SIZE });
  const reviews = reviewsData?.items;
  const reviewsTotal = reviewsData?.total ?? 0;
  const reviewsTotalPages = Math.max(1, Math.ceil(reviewsTotal / REVIEWS_PAGE_SIZE));
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const { data: events } = useListEvents();
  const onReviewsChanged = () => {
    refetchReviews();
    reviewsQc.invalidateQueries({ queryKey: getGetReviewEligibilityQueryKey(vendorId) });
    reviewsQc.invalidateQueries({ queryKey: getListVendorReviewsQueryKey(vendorId) });
  };

  const vendorEvents = (events ?? []).filter((e) => e.vendorId === vendorId);
  // Pick the primary "Book a table" target: prefer pub-type events, else
  // fall back to the first event (matches the web Book a Table CTA).
  const primaryBookEvent =
    vendorEvents.find((e) => e.type === "pub") ?? vendorEvents[0] ?? null;
  const pubEvent = vendorEvents.find((e) => e.type === "pub") ?? null;
  const pubEventTypes: string[] = (pubEvent as { pubEventTypes?: string[] } | null)?.pubEventTypes ?? [];
  const upcomingEventCount = vendorEvents.filter((e) => e.type !== "pub").length;

  // Wishlist (operates on the pub event id, matching web behaviour)
  const { data: wishlistItems } = useGetWishlist({
    query: { queryKey: getGetWishlistQueryKey(), enabled: !!user },
  });
  const inWishlist = pubEvent ? (wishlistItems ?? []).some((w) => w.id === pubEvent.id) : false;
  const addToWishlist = useAddToWishlist({
    mutation: {
      onSuccess: () => reviewsQc.invalidateQueries({ queryKey: getGetWishlistQueryKey() }),
    },
  });
  const removeFromWishlist = useRemoveFromWishlist({
    mutation: {
      onSuccess: () => reviewsQc.invalidateQueries({ queryKey: getGetWishlistQueryKey() }),
    },
  });
  const onToggleWishlist = () => {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    if (!pubEvent) return;
    if (inWishlist) {
      removeFromWishlist.mutate({ eventId: pubEvent.id });
    } else {
      addToWishlist.mutate({ data: { eventId: pubEvent.id } });
    }
  };

  // Crowd level (matches web hero crowd badge)
  const crowdLevel = (vendor as (Vendor & { crowdLevel?: string | null }) | undefined)?.crowdLevel ?? null;

  // Refs for scroll-to-events when "See upcoming events" pressed
  const scrollRef = React.useRef<ScrollView | null>(null);
  const eventsAnchorY = React.useRef(0);
  const avgRating = vendor && vendor.reviewCount > 0
    ? vendor.rating.toFixed(1)
    : null;

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!vendor) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: colors.mutedForeground }}>Partner not found</Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      showsVerticalScrollIndicator={false}
    >
      {/* Cinematic hero banner */}
      <View style={{ height: 380, position: "relative", overflow: "hidden" }}>
        {(vendor.coverImageUrl || vendor.bannerImage) ? (
          <Image
            source={{ uri: resolveImageUrl(vendor.coverImageUrl || vendor.bannerImage) }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="business-outline" size={56} color={colors.mutedForeground} />
          </View>
        )}
        {/* Top scrim */}
        <LinearGradient
          colors={["rgba(0,0,0,0.55)", "transparent"]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 100 }}
          pointerEvents="none"
        />
        {/* Bottom scrim — deep cinematic fade */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.88)", "rgba(0,0,0,0.98)"]}
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 240 }}
          pointerEvents="none"
        />
        <View style={[styles.backOverlay, { paddingTop: topPadding + 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" }]}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>
          {pubEvent ? (
            <Pressable
              onPress={onToggleWishlist}
              accessibilityRole="button"
              accessibilityLabel={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
              style={[styles.backBtn, { backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" }]}
            >
              <Ionicons
                name={inWishlist ? "heart" : "heart-outline"}
                size={20}
                color={inWishlist ? colors.primary : "#fff"}
              />
            </Pressable>
          ) : null}
        </View>
        {/* Badges + title overlaid on hero bottom */}
        <View style={{ position: "absolute", bottom: 18, left: 20, right: 20, gap: 8 }}>
          {/* Badge row: Pub type + Verified + Rating */}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {/* Pub type badge — always shown, no "Pubs" category badge */}
            <View style={{ backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 0.3 }}>Pub</Text>
            </View>
            {vendor.status === "approved" ? (
              <View style={[styles.badge, { backgroundColor: "rgba(34,197,94,0.25)", borderWidth: 1, borderColor: "rgba(34,197,94,0.4)" }]}>
                <Ionicons name="checkmark-circle" size={11} color="#22c55e" />
                <Text style={[styles.badgeText, { color: "#22c55e" }]}>Verified</Text>
              </View>
            ) : null}
            {avgRating ? (
              <View style={[styles.row, { backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, gap: 4 }]}>
                <Ionicons name="star" size={12} color="#fbbf24" />
                <Text style={[styles.rating, { color: "#fff", fontSize: 12 }]}>{avgRating}</Text>
                <Text style={[styles.ratingCount, { color: "rgba(255,255,255,0.6)", fontSize: 11 }]}>({vendor!.reviewCount})</Text>
              </View>
            ) : null}
            {(() => {
              if (!crowdLevel) return null;
              const cfg: Record<string, { label: string; bg: string }> = {
                low: { label: "Low Crowd", bg: "rgba(22,163,74,0.85)" },
                moderate: { label: "Moderate Crowd", bg: "rgba(217,119,6,0.85)" },
                party: { label: "🔥 High Crowd", bg: "rgba(220,38,38,0.85)" },
              };
              const c = cfg[crowdLevel];
              if (!c) return null;
              return (
                <View style={[styles.badge, { backgroundColor: c.bg, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" }]}>
                  <Text style={[styles.badgeText, { color: "#fff" }]}>{c.label}</Text>
                </View>
              );
            })()}
          </View>
          <Text style={[styles.vendorName, { color: "#fff", textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 }]}>{vendor.businessName}</Text>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "Inter_400Regular" }}>
            by {(vendor as Vendor & { partnerName?: string }).partnerName || vendor.businessName}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* Follow the venue to get its new food & drink discounts and exclusive
            deals as instant push notifications. */}
        <View style={{ alignItems: "flex-start", marginBottom: 4 }}>
          <FollowButton targetType="vendor" targetId={vendor.id} name={vendor.businessName} />
        </View>
        {/* Primary Book a Table CTA — opens the booking form directly. */}
        {primaryBookEvent ? (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/event/[id]",
                  params: { id: String(primaryBookEvent.id), book: "1" },
                })
              }
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: colors.primary,
                borderRadius: 14,
                paddingVertical: 14,
                paddingHorizontal: 18,
                minWidth: 160,
              }}
              accessibilityRole="button"
              accessibilityLabel={t("events.book_table")}
            >
              <Ionicons name="calendar" size={18} color={colors.primaryForeground} />
              <Text
                style={{
                  color: colors.primaryForeground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 15,
                  letterSpacing: 0.2,
                }}
              >
                {t("events.book_table")}
              </Text>
            </TouchableOpacity>
            {upcomingEventCount > 0 ? (
              <TouchableOpacity
                onPress={() => scrollRef.current?.scrollTo({ y: eventsAnchorY.current - 16, animated: true })}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  backgroundColor: colors.muted,
                  borderRadius: 14,
                  paddingVertical: 14,
                  paddingHorizontal: 18,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                accessibilityRole="button"
                accessibilityLabel="See upcoming events"
              >
                <Ionicons name="calendar-outline" size={16} color={colors.foreground} />
                <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                  See upcoming events
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Location row */}
        <View style={{ gap: 4 }}>
          <View style={styles.row}>
            <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
            <Text style={[styles.location, { color: colors.mutedForeground }]}>
              {[vendor.city, vendor.state].filter(Boolean).join(", ") || vendor.location || "India"}
            </Text>
          </View>

          {vendor.address ? (
            <Pressable
              style={styles.row}
              onPress={() => {
                const encoded = encodeURIComponent(vendor.address!);
                Linking.openURL(`https://maps.google.com/?q=${encoded}`);
              }}
            >
              <Ionicons name="navigate-outline" size={14} color={colors.primary} />
              <Text style={[styles.location, { color: colors.primary, textDecorationLine: "underline" }]}>
                {vendor.address}
              </Text>
            </Pressable>
          ) : null}
          {(() => {
            const rawUrls = (vendor as unknown as Record<string, unknown>)["menuUrls"];
            const menuUrlsArr: string[] = Array.isArray(rawUrls) ? (rawUrls as string[]) : [];
            const legacyUrl = vendor.menuUrl && !menuUrlsArr.includes(vendor.menuUrl) ? vendor.menuUrl : null;
            const allMenus = [...menuUrlsArr, ...(legacyUrl ? [legacyUrl] : [])];
            if (allMenus.length === 0) return null;
            return (
              <View style={{ gap: 6, marginTop: 4 }}>
                {allMenus.map((url, idx) => (
                  <Pressable
                    key={idx}
                    style={styles.row}
                    onPress={() => Linking.openURL(url)}
                  >
                    <Ionicons name="document-text-outline" size={14} color={colors.primary} />
                    <Text style={[styles.location, { color: colors.primary, textDecorationLine: "underline" }]}>
                      {allMenus.length === 1 ? "View Menu" : `View Menu ${idx + 1}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            );
          })()}
        </View>

        {/* About */}
        {vendor.description ? (
          <View style={{ gap: 6 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>About</Text>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>{vendor.description}</Text>
          </View>
        ) : null}

        {/* Hours */}
        {vendor.dayHours ? (() => {
          const DAY_FULL: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
          const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
          const hours = vendor.dayHours as Record<string, { open: string; close: string } | null>;
          if (!DAY_ORDER.some((d) => d in hours)) return null;

          const fmt = (hhmm: string) => {
            const [h, m] = hhmm.split(":").map(Number);
            const suffix = h < 12 ? "AM" : "PM";
            const hr = h % 12 || 12;
            return `${hr}:${String(m).padStart(2, "0")} ${suffix}`;
          };
          const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

          const todayKey = (["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const)[new Date().getDay()];
          const todayTimes = hours[todayKey];
          const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
          let isOpenNow = false;
          if (todayTimes) {
            const openMin = toMin(todayTimes.open);
            const closeMin = toMin(todayTimes.close);
            isOpenNow = closeMin < openMin
              ? nowMin >= openMin || nowMin < closeMin
              : nowMin >= openMin && nowMin < closeMin;
          }

          return (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Hours</Text>
                <View style={[styles.openBadge, isOpenNow ? styles.openBadgeOpen : styles.openBadgeClosed]}>
                  {isOpenNow && <View style={styles.openDot} />}
                  <Text style={[styles.openBadgeText, { color: isOpenNow ? "#22c55e" : "#ef4444" }]}>
                    {isOpenNow ? "Open now" : "Closed now"}
                  </Text>
                </View>
              </View>
              {todayTimes ? (
                <View style={[styles.todayCard, { borderColor: colors.primary + "40", backgroundColor: colors.primary + "10" }]}>
                  <Ionicons name="time-outline" size={14} color={colors.primary} />
                  <Text style={[styles.todayCardLabel, { color: colors.mutedForeground }]}>
                    Today ({DAY_FULL[todayKey]}):
                  </Text>
                  <Text style={[styles.todayCardTime, { color: colors.primary }]}>
                    {fmt(todayTimes.open)} – {fmt(todayTimes.close)}
                    {toMin(todayTimes.close) < toMin(todayTimes.open) ? " (next day)" : ""}
                  </Text>
                </View>
              ) : null}
              <View style={[styles.hoursCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {DAY_ORDER.map((day, i) => {
                  const times = hours[day] ?? null;
                  const isToday = day === todayKey;
                  const isOvernight = times ? toMin(times.close) < toMin(times.open) : false;
                  return (
                    <View
                      key={day}
                      style={[
                        styles.hoursRow,
                        i < DAY_ORDER.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                        isToday && { backgroundColor: colors.primary + "12" },
                      ]}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.hoursDay, { color: isToday ? colors.primary : colors.foreground }]}>
                          {DAY_FULL[day]}
                        </Text>
                        {isToday && (
                          <View style={[styles.todayPill, { backgroundColor: colors.primary + "25" }]}>
                            <Text style={[styles.todayPillText, { color: colors.primary }]}>today</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[
                        styles.hoursTime,
                        { color: times ? (isToday ? colors.foreground : colors.mutedForeground) : colors.mutedForeground + "60" },
                        !times && { fontStyle: "italic" as const },
                      ]}>
                        {times
                          ? `${fmt(times.open)} – ${fmt(times.close)}${isOvernight ? " (next day)" : ""}`
                          : "Closed"}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })() : (vendor.openDays ?? []).length > 0 ? (
          <View style={{ gap: 6 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Open Days</Text>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>{vendor.openDays!.join(", ")}</Text>
          </View>
        ) : null}

        {/* Cuisines, Languages & Available facilities */}
        {(() => {
          const vAny = vendor as unknown as { cuisines?: string[] | null; facilities?: string[] | null; languages?: string[] | null };
          const cuisines = (vAny.cuisines ?? []).filter(Boolean);
          const facilities = (vAny.facilities ?? []).filter(Boolean);
          const langs = (vAny.languages ?? []).filter(Boolean);
          if (cuisines.length === 0 && facilities.length === 0 && langs.length === 0) return null;
          return (
            <View style={{ gap: 20 }}>
              {cuisines.length > 0 ? (
                <View style={{ gap: 6 }}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Cuisines</Text>
                  <Text style={[styles.description, { color: colors.mutedForeground }]}>{cuisines.join(", ")}</Text>
                </View>
              ) : null}
              {langs.length > 0 ? (
                <View style={{ gap: 6 }}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Languages</Text>
                  <Text style={[styles.description, { color: colors.mutedForeground }]}>{langs.join(", ")}</Text>
                </View>
              ) : null}
              {facilities.length > 0 ? (
                <View style={{ gap: 10 }}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Available facilities</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                    {facilities.map((f) => (
                      <View key={f} style={{ flexDirection: "row", alignItems: "center", gap: 6, width: "47%" }}>
                        <Text style={{ color: colors.primary, fontSize: 12 }}>✦</Text>
                        <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, flex: 1 }} numberOfLines={1}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          );
        })()}

        {/* More — FAQ + Terms (collapsible rows), mirrors web's default 8-item pub terms */}
        {(() => {
          const vAny = vendor as unknown as { faqs?: { question: string; answer?: string }[] | null };
          const faqs = (vAny.faqs ?? []).filter((f) => f?.question);
          return (
            <View style={{ gap: 10 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>More</Text>
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: "hidden" }}>
                {faqs.length > 0 ? (
                  <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 16 }} onPress={() => setVenueFaqExpanded((v) => !v)}>
                      <Ionicons name="help-circle-outline" size={16} color={colors.primary} />
                      <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Frequently asked questions</Text>
                      <Ionicons name={venueFaqExpanded ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
                    </Pressable>
                    {venueFaqExpanded ? (
                      <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                        {faqs.map((f, i) => (
                          <View key={i} style={{ marginBottom: 12 }}>
                            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{f.question}</Text>
                            {f.answer ? <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 18, marginTop: 2 }}>{f.answer}</Text> : null}
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <View>
                  <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 16 }} onPress={() => setVenueTermsExpanded((v) => !v)}>
                    <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                    <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Terms and Conditions</Text>
                    <Ionicons name={venueTermsExpanded ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
                  </Pressable>
                  {venueTermsExpanded ? (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                      {DEFAULT_PUB_TERMS.map((term, i) => (
                        <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                          <Text style={{ color: colors.primary }}>•</Text>
                          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 18, flex: 1 }}>{term}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          );
        })()}

        {/* Find us — Google Maps deep link */}
        {vendor.address ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="navigate-outline" size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Find us</Text>
            </View>
            <Pressable
              onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(vendor.address!)}`)}
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 14,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="location-sharp" size={16} color={colors.primary} />
                <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground, lineHeight: 20 }}>
                  {vendor.address}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="open-outline" size={13} color={colors.primary} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary }}>
                  Open in Google Maps
                </Text>
              </View>
            </Pressable>
          </View>
        ) : null}

        {/* What we host — pub event types */}
        {pubEventTypes.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>What we host</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {pubEventTypes.map((eventType) => (
                <View
                  key={eventType}
                  style={{
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.primary + "55",
                    backgroundColor: colors.primary + "1A",
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary }}>{eventType}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Dance Floor — all three states (dedicated / general / none), with photos when dedicated */}
        {vendor.danceFloor ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="musical-notes-outline" size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Dance floor</Text>
            </View>
            <View style={{ flexDirection: "row" }}>
              {vendor.danceFloor === "dedicated" ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.primary + "55", backgroundColor: colors.primary + "1A", paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Ionicons name="musical-notes" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary }}>Dedicated dance floor</Text>
                </View>
              ) : vendor.danceFloor === "general" ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Ionicons name="musical-notes-outline" size={14} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Dancing in main area</Text>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(0,0,0,0.18)", paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Ionicons name="remove-circle-outline" size={14} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>No dancing / seated only</Text>
                </View>
              )}
            </View>
            {vendor.danceFloor === "dedicated" && (vendor.danceFloorPhotos ?? []).length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}>
                <View style={{ flexDirection: "row", paddingHorizontal: 20, gap: 10 }}>
                  {(vendor.danceFloorPhotos ?? []).map((img, i) => (
                    <Image
                      key={i}
                      source={{ uri: resolveImageUrl(img) }}
                      style={{ width: 140, height: 100, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}
                      contentFit="cover"
                    />
                  ))}
                </View>
              </ScrollView>
            ) : null}
          </View>
        ) : null}

        {/* Portfolio */}
        {(vendor.portfolioImages ?? []).length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Portfolio</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}>
              <View style={{ flexDirection: "row", paddingHorizontal: 20, gap: 10 }}>
                {vendor.portfolioImages!.map((img, i) => (
                  <Image
                    key={i}
                    source={{ uri: resolveImageUrl(img) }}
                    style={[styles.portfolioImg, { borderColor: colors.border }]}
                    contentFit="cover"
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}

        {/* Events */}
        {vendorEvents.length > 0 ? (
          <View
            style={{ gap: 10 }}
            onLayout={(e) => { eventsAnchorY.current = e.nativeEvent.layout.y; }}
          >
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Events & Listings</Text>
            <FlatList
              horizontal
              data={vendorEvents}
              keyExtractor={(e) => String(e.id)}
              scrollEnabled={!!(vendorEvents?.length)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 4, gap: 12 }}
              renderItem={({ item }) => (
                <EventCard
                  id={item.id}
                  vendorId={item.vendorId}
                  title={item.title}
                  imageUrl={item.imageUrl}
                  location={item.location}
                  price={item.price}
                  category={item.category}
                  type={item.type}
                  rating={item.rating}
                  reviewCount={item.reviewCount}
                />
              )}
            />
          </View>
        ) : null}

        {/* Offers Strip */}
        <OffersStrip vendorId={vendorId} />

        {/* Drink Plans */}
        <DrinkPlansSection vendorId={vendorId} />

        {/* Reviews */}
        {reviewsTotal > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Reviews</Text>
            {(reviews ?? []).map((r) => (
              <ReviewItem
                key={r.id}
                review={r}
                isOwner={!!user && r.userId === user.id}
                onChanged={onReviewsChanged}
                onImagePress={(url) => setLightboxImage(url)}
              />
            ))}
            {reviewsTotalPages > 1 ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                <Pressable
                  onPress={() => setReviewsPage((p) => Math.max(1, p - 1))}
                  disabled={reviewsPage <= 1}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 4,
                    paddingVertical: 8, paddingHorizontal: 12,
                    borderRadius: 8, borderWidth: 1, borderColor: colors.border,
                    opacity: reviewsPage <= 1 ? 0.4 : 1,
                  }}
                >
                  <Ionicons name="chevron-back" size={14} color={colors.foreground} />
                  <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_500Medium" }}>Prev</Text>
                </Pressable>
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                  Page {reviewsPage} of {reviewsTotalPages}
                </Text>
                <Pressable
                  onPress={() => setReviewsPage((p) => Math.min(reviewsTotalPages, p + 1))}
                  disabled={reviewsPage >= reviewsTotalPages}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 4,
                    paddingVertical: 8, paddingHorizontal: 12,
                    borderRadius: 8, borderWidth: 1, borderColor: colors.border,
                    opacity: reviewsPage >= reviewsTotalPages ? 0.4 : 1,
                  }}
                >
                  <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_500Medium" }}>Next</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.foreground} />
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Review submission form — shown only to logged-in eligible users */}
        <ReviewForm
          user={user}
          vendorId={vendorId}
          onPosted={onReviewsChanged}
        />
      </View>

      <MobileFooter />
      <View style={{ height: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }} />

      <Modal visible={!!lightboxImage} transparent animationType="fade" onRequestClose={() => setLightboxImage(null)}>
        <Pressable
          onPress={() => setLightboxImage(null)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <TouchableOpacity
            onPress={() => setLightboxImage(null)}
            style={{ position: "absolute", top: topPadding + 12, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", zIndex: 2 }}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          {lightboxImage ? (
            <Image source={{ uri: resolveImageUrl(lightboxImage) }} style={{ width: "100%", height: "85%" }} contentFit="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backOverlay: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  content: { padding: 20, gap: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  rating: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  ratingCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  vendorName: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  location: { fontSize: 14, fontFamily: "Inter_400Regular" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  portfolioImg: { width: 140, height: 100, borderRadius: 12, borderWidth: 1 },
  reviewCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  reviewAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  reviewerName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  reviewComment: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  hoursCard: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  hoursRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11 },
  hoursDay: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  hoursTime: { fontSize: 13, fontFamily: "Inter_400Regular" },
  openBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  openBadgeOpen: { backgroundColor: "#22c55e18" },
  openBadgeClosed: { backgroundColor: "#ef444415" },
  openBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  openDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  todayPill: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  todayPillText: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.3 },
  todayCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexWrap: "wrap",
  },
  todayCardLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  todayCardTime: { fontSize: 13, fontFamily: "Inter_700Bold" },
});
