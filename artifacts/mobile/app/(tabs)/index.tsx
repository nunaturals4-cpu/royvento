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

const DEAL_TYPE_LABELS: Record<string, string> = {
  welcome: "Free Drink",
  unlimited: "Unlimited",
  ticket: "With Ticket",
  custom: "Discount",
};
const DEAL_TYPE_BG: Record<string, string> = {
  welcome: "rgba(16,185,129,0.15)",
  unlimited: "rgba(220,38,38,0.15)",
  ticket: "rgba(139,92,246,0.15)",
  custom: "rgba(245,158,11,0.15)",
};
const DEAL_TYPE_BORDER: Record<string, string> = {
  welcome: "rgba(16,185,129,0.25)",
  unlimited: "rgba(220,38,38,0.25)",
  ticket: "rgba(139,92,246,0.25)",
  custom: "rgba(245,158,11,0.25)",
};
const DEAL_TYPE_COLOR: Record<string, string> = {
  welcome: "#10b981",
  unlimited: "#dc2626",
  ticket: "#8b5cf6",
  custom: "#f59e0b",
};

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

      {/* Popular Pubs */}
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
                vendorId={item.vendorId}
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
                directBooking
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
                style={[styles.drinkCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  if (item.pubEventId) {
                    router.push(`/event/${item.pubEventId}` as never);
                  } else {
                    router.push(`/partner/${item.vendorId}` as never);
                  }
                }}
              >
                <View style={[styles.drinkCardHeader, { borderBottomColor: colors.border }]}>
                  <View style={[styles.drinkIconBox, { backgroundColor: colors.primary + "22" }]}>
                    <Ionicons name="wine-outline" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.drinkCardVenueName, { color: colors.foreground }]} numberOfLines={2}>
                      {item.vendorName}
                    </Text>
                    <Text style={{ fontSize: 9, fontFamily: "Inter_500Medium", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 1 }}>
                      Drink Deals
                    </Text>
                  </View>
                </View>
                <View style={styles.drinkCardBody}>
                  {(item.plans ?? []).slice(0, 3).map((plan: DrinkPlanSummary, i: number) => {
                    const showDays = plan.days && plan.days.length > 0 && plan.days.length < 7;
                    const showTime = plan.timeFrom && plan.timeTo;
                    return (
                      <View key={i} style={styles.drinkPlanRow}>
                        <View
                          style={[
                            styles.drinkTypeBadge,
                            {
                              backgroundColor: DEAL_TYPE_BG[plan.type] ?? "rgba(255,255,255,0.08)",
                              borderColor: DEAL_TYPE_BORDER[plan.type] ?? "rgba(255,255,255,0.12)",
                            },
                          ]}
                        >
                          <Text style={[styles.drinkTypeBadgeText, { color: DEAL_TYPE_COLOR[plan.type] ?? "rgba(255,255,255,0.5)" }]}>
                            {DEAL_TYPE_LABELS[plan.type] ?? plan.type}
                          </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.drinkPlanText, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {getPlanLabel(plan)}
                          </Text>
                          {(showDays || showTime) && (
                            <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                              {showDays && plan.days!.map((d) => (
                                <View key={d} style={{ backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" }}>
                                  <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff" }}>{d.slice(0, 3)}</Text>
                                </View>
                              ))}
                              {showTime && (
                                <View style={{ backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", flexDirection: "row", alignItems: "center", gap: 4 }}>
                                  <Ionicons name="time-outline" size={10} color="#fff" />
                                  <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                                    {plan.timeFrom}–{plan.timeTo}
                                  </Text>
                                </View>
                              )}
                            </View>
                          )}
                          {!!plan.description && (
                            <Text style={[styles.drinkPlanDetail, { color: "rgba(255,255,255,0.25)", fontStyle: "italic" }]} numberOfLines={1}>
                              {plan.description}
                            </Text>
                          )}
                        </View>
                        <View
                          style={[
                            styles.drinkGenderPill,
                            { backgroundColor: plan.gender === "female" ? "rgba(244,63,94,0.15)" : "rgba(220,38,38,0.12)" },
                          ]}
                        >
                          <Text style={[styles.drinkGenderText, { color: plan.gender === "female" ? "#e11d48" : "#dc2626" }]}>
                            {plan.gender === "female" ? "Ladies" : "All"}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                  {(item.plans?.length ?? 0) > 3 && (
                    <Text style={[styles.drinkMoreText, { color: colors.mutedForeground }]}>
                      +{(item.plans?.length ?? 0) - 3} more
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

      {/* Featured Events */}
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
                vendorId={item.vendorId}
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
                directBooking={item.type === "pub"}
              />
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
                {item.imageUrl ? (
                  <View style={styles.announcementImageWrapper}>
                    <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.78)"]}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <View style={styles.announcementImageFooter}>
                      <View style={[styles.announcementBadge, { backgroundColor: "rgba(212,175,55,0.25)" }]}>
                        <Ionicons name="megaphone-outline" size={11} color="#D4AF37" />
                        <Text style={[styles.announcementVenue, { color: "#D4AF37" }]} numberOfLines={1}>{item.vendorName}</Text>
                      </View>
                      <Text style={styles.announcementImageTitle} numberOfLines={2}>{item.title}</Text>
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={[styles.announcementBadge, { backgroundColor: "rgba(212,175,55,0.15)" }]}>
                      <Ionicons name="megaphone-outline" size={13} color="#D4AF37" />
                      <Text style={[styles.announcementVenue, { color: "#D4AF37" }]} numberOfLines={1}>
                        {item.vendorName}
                      </Text>
                    </View>
                    <Text style={[styles.announcementTitle, { color: "#fff" }]} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </>
                )}
                {!item.imageUrl && item.body ? (
                  <Text style={[styles.announcementBody, { color: "rgba(255,255,255,0.55)" }]} numberOfLines={2}>
                    {item.body}
                  </Text>
                ) : null}
                {item.announceDate ? (
                  <View style={[styles.announcementDateRow, { borderTopColor: "rgba(255,255,255,0.08)", borderTopWidth: 1, marginTop: 4, paddingTop: 8 }]}>
                    <Ionicons name="calendar-outline" size={11} color="#D4AF37" />
                    <Text style={[styles.announcementDate, { color: "#D4AF37" }]}>
                      {new Date(item.announceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </Text>
                    {item.announceTime ? (
                      <>
                        <Ionicons name="time-outline" size={11} color="#D4AF37" style={{ marginLeft: 8 }} />
                        <Text style={[styles.announcementDate, { color: "#D4AF37" }]}>
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
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  section: {
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
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
    width: 268,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 8,
    overflow: "hidden",
  },
  announcementImageWrapper: {
    height: 140,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    overflow: "hidden",
    marginHorizontal: -12,
    marginTop: -12,
    marginBottom: 6,
    position: "relative",
  },
  announcementImageFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    gap: 4,
  },
  announcementImageTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    lineHeight: 19,
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
    width: 268,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  drinkCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  drinkCardVenueName: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    lineHeight: 20,
  },
  drinkCardBody: {
    padding: 12,
    gap: 8,
  },
  drinkPlanRow: {
    flexDirection: "row",
    alignItems: "flex-start",
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
  drinkTypeBadge: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  drinkTypeBadgeText: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  drinkPlanText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  drinkPlanDetail: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    lineHeight: 14,
    marginTop: 1,
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
