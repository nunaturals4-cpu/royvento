import { Ionicons } from "@expo/vector-icons";
import {
  customFetch,
  useListEvents,
  useListFeaturedEvents,
  useListVendorDrinkOffers,
} from "@workspace/api-client-react";
import type { VendorDrinkOffer, DrinkPlanSummary } from "@workspace/api-client-react";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CityPickerSheet } from "@/components/CityPickerSheet";
import { EventCard } from "@/components/EventCard";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useSelectedCity } from "@/context/CityContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";

interface RecentAnnouncement {
  id: number;
  title: string;
  body: string;
  announceDate: string;
  announceTime: string;
  imageUrl: string;
  vendorId: number;
  vendorName: string;
  eventId: number;
  eventTitle: string;
}

function getPlanLabel(plan: DrinkPlanSummary): string {
  if (plan.type === "welcome") return "Free welcome drink";
  if (plan.type === "unlimited") return "Unlimited drinks";
  if (plan.type === "ticket") {
    const count = (plan.lineItems ?? []).filter((i: { name?: string }) => i.name).length;
    return count > 0 ? `${count} item${count !== 1 ? "s" : ""} with ticket` : "Drinks with ticket";
  }
  return plan.productName || "Drinks discount";
}

function sortCityFirst<T extends { location?: string | null }>(
  items: T[],
  city: string
): T[] {
  if (!city) return items;
  const lower = city.toLowerCase();
  return [...items].sort((a, b) => {
    const aMatch = (a.location ?? "").toLowerCase().includes(lower) ? 0 : 1;
    const bMatch = (b.location ?? "").toLowerCase().includes(lower) ? 0 : 1;
    return aMatch - bMatch;
  });
}

export default function HomeScreen() {
  const { t } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { selectedCity, setSelectedCity } = useSelectedCity();
  const [cityPickerOpen, setCityPickerOpen] = useState(false);

  const featured = useListFeaturedEvents();
  const popular = useListEvents({ category: "Pubs" });
  const { data: drinkOffers = [] } = useListVendorDrinkOffers();
  const { data: announcements } = useQuery<RecentAnnouncement[]>({
    queryKey: ["announcements", "recent"],
    queryFn: () => customFetch<RecentAnnouncement[]>("/api/announcements/recent"),
    staleTime: 1000 * 60 * 5,
  });

  const sortedPopular = sortCityFirst(popular.data ?? [], selectedCity);
  const sortedFeatured = sortCityFirst(featured.data ?? [], selectedCity);

  const isLoading = featured.isLoading && popular.isLoading;
  const onRefresh = () => {
    featured.refetch();
    popular.refetch();
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {/* Header */}
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={[styles.hero, { paddingTop: topPadding + 20 }]}
      >
        <View style={styles.heroInner}>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>
            {t("home.discover")}{" "}
            <Text style={{ color: colors.primary }}>{t("home.events")}</Text>
          </Text>
          <Pressable
            onPress={() => router.push("/(tabs)/explore")}
            style={[styles.searchBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
          >
            <Ionicons name="search" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <TouchableOpacity
          style={[
            styles.cityChip,
            {
              backgroundColor: selectedCity ? colors.primary + "18" : colors.muted,
              borderColor: selectedCity ? colors.primary : colors.border,
            },
          ]}
          onPress={() => setCityPickerOpen(true)}
          activeOpacity={0.75}
        >
          <Ionicons
            name="location-outline"
            size={13}
            color={selectedCity ? colors.primary : colors.mutedForeground}
          />
          <Text
            style={[
              styles.cityChipText,
              { color: selectedCity ? colors.primary : colors.mutedForeground },
            ]}
            numberOfLines={1}
          >
            {selectedCity || t("home.all_cities")}
          </Text>
          <Ionicons
            name="chevron-down"
            size={11}
            color={selectedCity ? colors.primary : colors.mutedForeground}
          />
        </TouchableOpacity>
      </LinearGradient>

      <CityPickerSheet
        visible={cityPickerOpen}
        onClose={() => setCityPickerOpen(false)}
        selectedCity={selectedCity}
        onSelect={setSelectedCity}
      />

      {/* Popular Pubs — first */}
      {(popular.data?.length ?? 0) > 0 && (
        <Section title={t("home.popular_pubs")} onSeeAll={() => router.push({ pathname: "/(tabs)/explore", params: { type: "pub" } })}>
          <FlatList
            horizontal
            data={sortedPopular}
            keyExtractor={(item) => String(item.id)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            scrollEnabled={!!(popular.data?.length)}
            renderItem={({ item }) => (
              <EventCard
                id={item.id}
                title={item.title}
                imageUrl={item.imageUrl}
                location={item.location}
                price={item.priceWomen}
                type="pub"
                popular={(item as { popular?: boolean }).popular}
                rating={item.rating}
                reviewCount={item.reviewCount}
                hasDrinkPlans={item.hasDrinkPlans}
                freeEntryRules={item.freeEntryRules}
              />
            )}
          />
        </Section>
      )}

      {/* Drink Deals */}
      {drinkOffers.length > 0 && (
        <Section title={t("events.drink_deals")} icon="wine-outline" onSeeAll={() => router.push({ pathname: "/(tabs)/explore", params: { type: "pub" } })}>
          <FlatList
            horizontal
            data={drinkOffers as VendorDrinkOffer[]}
            keyExtractor={(item) => String(item.vendorId)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.drinkCard, { backgroundColor: "#fff", borderColor: "#e5e7eb" }]}
                onPress={() => {
                  if (item.pubEventId) {
                    router.push(`/event/${item.pubEventId}` as never);
                  } else {
                    router.push(`/partner/${item.vendorId}` as never);
                  }
                }}
              >
                <View style={styles.drinkCardImage}>
                  {item.coverImageUrl ? (
                    <Image
                      source={{ uri: item.coverImageUrl }}
                      style={StyleSheet.absoluteFillObject}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.drinkCardImagePlaceholder, { backgroundColor: "#f3f4f6" }]}>
                      <Ionicons name="wine-outline" size={28} color="#9ca3af" />
                    </View>
                  )}
                </View>
                <View style={styles.drinkCardBody}>
                  <Text style={styles.drinkCardName} numberOfLines={1}>{item.vendorName}</Text>
                  {item.plans.slice(0, 2).map((plan: DrinkPlanSummary, i: number) => (
                    <View key={i} style={styles.drinkPlanRow}>
                      <View style={[styles.drinkIconBox, { backgroundColor: colors.primary + "22" }]}>
                        <Ionicons
                          name={plan.type === "unlimited" ? "wine-outline" : plan.type === "ticket" ? "ticket-outline" : "star-outline"}
                          size={11}
                          color={colors.primary}
                        />
                      </View>
                      <Text style={[styles.drinkPlanText, { color: "#374151", flex: 1 }]} numberOfLines={1}>
                        {getPlanLabel(plan)}
                      </Text>
                      <View style={[
                        styles.drinkGenderPill,
                        { backgroundColor: plan.gender === "female" ? "rgba(244,63,94,0.12)" : "rgba(220,38,38,0.10)" },
                      ]}>
                        <Text style={[styles.drinkGenderText, { color: plan.gender === "female" ? "#e11d48" : "#dc2626" }]}>
                          {plan.gender === "female" ? "Ladies" : "All"}
                        </Text>
                      </View>
                    </View>
                  ))}
                  {item.plans.length > 2 && (
                    <Text style={[styles.drinkMoreText, { color: "#9ca3af" }]}>
                      +{item.plans.length - 2} more
                    </Text>
                  )}
                  <View style={[styles.drinkCta, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "33" }]}>
                    <Text style={[styles.drinkCtaText, { color: colors.primary }]}>
                      {item.pubEventId ? t("events.book_now_btn") : "View venue"}
                    </Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                  </View>
                </View>
              </Pressable>
            )}
          />
        </Section>
      )}

      {/* Announcements */}
      {(announcements?.length ?? 0) > 0 && (
        <Section title={t("home.whats_on")} icon="megaphone-outline">
          <FlatList
            horizontal
            data={announcements}
            keyExtractor={(item) => String(item.id)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.announcementCard, { backgroundColor: "#18181c", borderColor: "rgba(212,175,55,0.18)" }]}
                onPress={() => item.eventId ? router.push(`/event/${item.eventId}` as never) : undefined}
              >
                <View style={[styles.announcementBadge, { backgroundColor: "rgba(212,175,55,0.15)" }]}>
                  <Ionicons name="megaphone-outline" size={13} color="#D4AF37" />
                  <Text style={[styles.announcementVenue, { color: "#D4AF37" }]} numberOfLines={1}>
                    {item.vendorName}
                  </Text>
                </View>
                <Text style={[styles.announcementTitle, { color: "#fff" }]} numberOfLines={2}>
                  {item.title}
                </Text>
                {item.body ? (
                  <Text style={[styles.announcementBody, { color: "rgba(255,255,255,0.55)" }]} numberOfLines={2}>
                    {item.body}
                  </Text>
                ) : null}
                {item.announceDate ? (
                  <View style={[styles.announcementDateRow, { borderTopColor: "rgba(255,255,255,0.08)", borderTopWidth: 1, marginTop: 4, paddingTop: 8 }]}>
                    <Ionicons name="calendar-outline" size={11} color="rgba(255,255,255,0.4)" />
                    <Text style={[styles.announcementDate, { color: "rgba(255,255,255,0.4)" }]}>
                      {new Date(item.announceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </Text>
                    {item.announceTime ? (
                      <>
                        <Ionicons name="time-outline" size={11} color="rgba(255,255,255,0.4)" style={{ marginLeft: 8 }} />
                        <Text style={[styles.announcementDate, { color: "rgba(255,255,255,0.4)" }]}>
                          {item.announceTime}
                        </Text>
                      </>
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            )}
          />
        </Section>
      )}

      {/* Featured Events — second */}
      {(featured.data?.length ?? 0) > 0 && (
        <Section title={t("home.featured_events")} onSeeAll={() => router.push("/(tabs)/explore")}>
          <FlatList
            horizontal
            data={sortedFeatured}
            keyExtractor={(item) => String(item.id)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            scrollEnabled={!!(featured.data?.length)}
            renderItem={({ item }) => (
              <EventCard
                id={item.id}
                title={item.title}
                imageUrl={item.imageUrl}
                location={item.location}
                price={item.price}
                category={item.category}
                type={item.type}
                popular={(item as { popular?: boolean }).popular}
                rating={item.rating}
                reviewCount={item.reviewCount}
                hasDrinkPlans={item.hasDrinkPlans}
                freeEntryRules={item.freeEntryRules}
              />
            )}
          />
        </Section>
      )}

      <MobileFooter />
      <View style={{ height: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }} />
    </ScrollView>
    </View>
  );
}

function Section({
  title,
  children,
  onSeeAll,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  onSeeAll?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  const { t } = useLanguage();
  const colors = useColors();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {icon ? <Ionicons name={icon} size={16} color={colors.primary} /> : null}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
        </View>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>{t("home.see_all")}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingBottom: 16,
    paddingHorizontal: 20,
    gap: 10,
  },
  cityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cityChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    maxWidth: 140,
  },
  heroInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  seeAll: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  row: {
    paddingLeft: 20,
    paddingRight: 8,
    gap: 12,
  },
  announcementCard: {
    width: 248,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  announcementBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  announcementVenue: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  announcementTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    lineHeight: 19,
  },
  announcementBody: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  announcementDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  announcementDate: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  drinkCard: {
    width: 280,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  drinkCardImage: {
    height: 160,
    position: "relative",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  drinkCardImagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  drinkCardName: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    marginBottom: 4,
  },
  drinkCardBody: {
    padding: 12,
    gap: 8,
  },
  drinkPlanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  drinkIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  drinkPlanText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  drinkGenderPill: {
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
  },
  drinkGenderText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  drinkMoreText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    paddingLeft: 34,
  },
  drinkCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  drinkCtaText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
