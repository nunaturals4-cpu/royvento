import { Ionicons } from "@expo/vector-icons";
import {
  useGetVendor,
  useListEvents,
  useListVendorReviews,
} from "@workspace/api-client-react";
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
          const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
          const hours = vendor.dayHours as Record<string, { open: string; close: string } | null>;
          const entries = dayOrder.filter((d) => d in hours);
          if (entries.length === 0) return null;
          return (
            <View style={{ gap: 10 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Hours</Text>
              <View style={[styles.hoursCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {entries.map((day, i) => {
                  const times = hours[day];
                  return (
                    <View
                      key={day}
                      style={[
                        styles.hoursRow,
                        i < entries.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.hoursDay, { color: colors.foreground }]}>{day}</Text>
                      <Text style={[styles.hoursTime, { color: colors.mutedForeground }]}>
                        {times ? `${times.open} – ${times.close}` : "Closed"}
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
  hoursRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10 },
  hoursDay: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  hoursTime: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
