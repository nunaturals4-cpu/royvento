import { Ionicons } from "@expo/vector-icons";
import {
  customFetch,
  useGetVendor,
  useListEvents,
  useListVendorReviews,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EventCard } from "@/components/EventCard";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
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
}

function DrinkPlansSection({ vendorId }: { vendorId: number }) {
  const colors = useColors();
  const { data: plans } = useQuery<DrinkPlan[]>({
    queryKey: ["vendorDrinkPlans", vendorId],
    queryFn: () => customFetch<DrinkPlan[]>(`/api/vendors/${vendorId}/drink-plans`),
    enabled: !!vendorId,
  });

  if (!plans || plans.length === 0) return null;

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

          {plan.days && plan.days.length > 0 && (
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {plan.days.map((d) => (
                <View key={d} style={{ backgroundColor: colors.muted, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>{d}</Text>
                </View>
              ))}
              {(plan.timeFrom || plan.timeTo) && (
                <View style={{ backgroundColor: colors.muted, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
                    {plan.timeFrom}{plan.timeTo ? ` – ${plan.timeTo}` : ""}
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
        </View>
      ))}
    </View>
  );
}

export default function PartnerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const vendorId = Number(id);
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const { data: vendor, isLoading } = useGetVendor(vendorId);
  const { data: reviews } = useListVendorReviews(vendorId);
  const { data: events } = useListEvents();

  const vendorEvents = (events ?? []).filter((e) => e.vendorId === vendorId);
  const avgRating = reviews?.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
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
      style={{ flex: 1, backgroundColor: colors.background }}
      showsVerticalScrollIndicator={false}
    >
      {/* Banner */}
      <View style={{ height: 220, position: "relative" }}>
        {vendor.bannerImage || vendor.coverImageUrl ? (
          <Image
            source={{ uri: vendor.bannerImage || vendor.coverImageUrl }}
            style={{ width: "100%", height: 220 }}
            contentFit="cover"
          />
        ) : (
          <View style={{ width: "100%", height: 220, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="business-outline" size={48} color={colors.mutedForeground} />
          </View>
        )}
        <View style={[styles.backOverlay, { paddingTop: topPadding + 8 }]}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: "rgba(0,0,0,0.5)" }]}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        {/* Vendor info */}
        <View style={{ gap: 8 }}>
          <View style={styles.row}>
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>{vendor.category}</Text>
            </View>
            {vendor.status === "approved" ? (
              <View style={[styles.badge, { backgroundColor: "#22c55e20" }]}>
                <Ionicons name="checkmark-circle" size={11} color="#22c55e" />
                <Text style={[styles.badgeText, { color: "#22c55e" }]}>Verified</Text>
              </View>
            ) : null}
            {avgRating ? (
              <View style={styles.row}>
                <Ionicons name="star" size={13} color={colors.primary} />
                <Text style={[styles.rating, { color: colors.foreground }]}>{avgRating}</Text>
                <Text style={[styles.ratingCount, { color: colors.mutedForeground }]}>({reviews!.length})</Text>
              </View>
            ) : null}
          </View>

          <Text style={[styles.vendorName, { color: colors.foreground }]}>{vendor.businessName}</Text>

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

        {/* Portfolio */}
        {(vendor.portfolioImages ?? []).length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Portfolio</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}>
              <View style={{ flexDirection: "row", paddingHorizontal: 20, gap: 10 }}>
                {vendor.portfolioImages!.map((img, i) => (
                  <Image
                    key={i}
                    source={{ uri: img }}
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
          <View style={{ gap: 10 }}>
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
                  title={item.title}
                  imageUrl={item.imageUrl}
                  location={item.location}
                  price={item.price}
                  category={item.category}
                  type={item.type}
                />
              )}
            />
          </View>
        ) : null}

        {/* Drink Plans */}
        <DrinkPlansSection vendorId={vendorId} />

        {/* Reviews */}
        {(reviews ?? []).length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Reviews</Text>
            {reviews!.slice(0, 3).map((r) => (
              <View key={r.id} style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.row}>
                  <View style={[styles.reviewAvatar, { backgroundColor: colors.muted }]}>
                    <Ionicons name="person" size={14} color={colors.mutedForeground} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reviewerName, { color: colors.foreground }]}>Customer</Text>
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
      </View>

      <MobileFooter />
      <View style={{ height: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }} />
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
});
