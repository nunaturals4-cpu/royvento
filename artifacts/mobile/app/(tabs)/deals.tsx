import { Ionicons } from "@expo/vector-icons";
import {
  customFetch,
  useListVendorDrinkOffers,
} from "@workspace/api-client-react";
import type { VendorDrinkOffer, DrinkPlanSummary } from "@workspace/api-client-react";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

const SCREEN_WIDTH = Dimensions.get("window").width;
const ANNOUNCEMENT_CARD_WIDTH = SCREEN_WIDTH - 40;

const ANN_GENRES = ["EDM", "Hip Hop", "Bollywood", "Rock", "Pop", "Jazz", "Retro", "House", "Techno", "R&B"];
const ANN_EVENT_TYPES = ["Ladies Night", "DJ Night", "Live Music", "Karaoke", "Open Bar", "Theme Party", "Open Mic", "Brunch", "Pool Party", "Sufi Night"];
const DEAL_TYPES = ["welcome", "unlimited", "ticket", "custom"] as const;
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
  genre: string;
  eventType: string;
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

function AnnouncementSlider({ announcements }: { announcements: RecentAnnouncement[] }) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(e.nativeEvent.contentOffset.x / ANNOUNCEMENT_CARD_WIDTH);
    setActiveIndex(index);
  }

  if (announcements.length === 0) return null;

  return (
    <View style={[styles.sliderSection, { backgroundColor: colors.muted }]}>
      <View style={styles.sliderHeaderRow}>
        <Ionicons name="megaphone-outline" size={16} color={colors.primary} />
        <Text style={[styles.sliderTitle, { color: colors.foreground }]}>What's On</Text>
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={ANNOUNCEMENT_CARD_WIDTH + 12}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {announcements.map((item) => (
          <Pressable
            key={item.id}
            style={[styles.announcementSlide, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => item.eventId ? router.push(`/event/${item.eventId}` as never) : undefined}
          >
            {item.imageUrl ? (
              <View style={styles.slideImageWrap}>
                <Image
                  source={{ uri: item.imageUrl }}
                  style={[StyleSheet.absoluteFillObject, { opacity: 0.18 }]}
                  resizeMode="cover"
                />
                <View style={[styles.slideNoImage, { backgroundColor: "transparent" }]}>
                  <View style={[styles.venueBadge, { backgroundColor: colors.primary + "22" }]}>
                    <Ionicons name="megaphone-outline" size={11} color={colors.primary} />
                    <Text style={[styles.venueText, { color: colors.primary }]} numberOfLines={1}>{item.vendorName}</Text>
                  </View>
                  <Text style={[styles.slideTitle, { color: colors.foreground }]} numberOfLines={3}>{item.title}</Text>
                  {item.body ? (
                    <Text style={[styles.slideBody, { color: colors.mutedForeground }]} numberOfLines={2}>{item.body}</Text>
                  ) : null}
                  {item.announceDate ? (
                    <View style={styles.slideDateRow}>
                      <Ionicons name="calendar-outline" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.slideDateText, { color: colors.mutedForeground }]}>
                        {new Date(item.announceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        {item.announceTime ? `  ·  ${item.announceTime}` : ""}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={[styles.slideNoImage, { backgroundColor: "transparent" }]}>
                <View style={[styles.venueBadge, { backgroundColor: colors.primary + "22" }]}>
                  <Ionicons name="megaphone-outline" size={11} color={colors.primary} />
                  <Text style={[styles.venueText, { color: colors.primary }]} numberOfLines={1}>{item.vendorName}</Text>
                </View>
                <Text style={[styles.slideTitle, { color: colors.foreground }]} numberOfLines={3}>{item.title}</Text>
                {item.body ? (
                  <Text style={[styles.slideBody, { color: colors.mutedForeground }]} numberOfLines={2}>{item.body}</Text>
                ) : null}
                {item.announceDate ? (
                  <View style={styles.slideDateRow}>
                    <Ionicons name="calendar-outline" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.slideDateText, { color: colors.mutedForeground }]}>
                      {new Date(item.announceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {item.announceTime ? `  ·  ${item.announceTime}` : ""}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>
      {announcements.length > 1 && (
        <View style={styles.dots}>
          {announcements.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === activeIndex ? colors.primary : colors.border },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function DrinkDealCard({ item }: { item: VendorDrinkOffer }) {
  const { t } = useLanguage();
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.dealCard,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
      onPress={() => {
        if (item.pubEventId) {
          router.push(`/event/${item.pubEventId}` as never);
        } else {
          router.push(`/partner/${item.vendorId}` as never);
        }
      }}
    >
      {/* Venue header */}
      <View style={[styles.dealHeader, { borderBottomColor: colors.border }]}>
        <View style={[styles.dealHeaderIcon, { backgroundColor: colors.primary + "22" }]}>
          <Ionicons name="wine-outline" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.dealVenueName, { color: colors.foreground }]} numberOfLines={2}>
            {item.vendorName}
          </Text>
          <Text
            style={{
              fontSize: 9,
              fontFamily: "Inter_500Medium",
              color: colors.mutedForeground,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginTop: 1,
            }}
          >
            Drink Deals
          </Text>
        </View>
      </View>
      {/* Plan rows */}
      <View style={styles.dealBody}>
        {item.plans.slice(0, 3).map((plan: DrinkPlanSummary, i: number) => {
          const showDays = plan.days && plan.days.length > 0 && plan.days.length < 7;
          const showTime = plan.timeFrom && plan.timeTo;
          return (
            <View key={i} style={styles.planRow}>
              <View
                style={[
                  styles.typeBadge,
                  {
                    backgroundColor: DEAL_TYPE_BG[plan.type] ?? "rgba(255,255,255,0.08)",
                    borderColor: DEAL_TYPE_BORDER[plan.type] ?? "rgba(255,255,255,0.12)",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.typeBadgeText,
                    { color: DEAL_TYPE_COLOR[plan.type] ?? "rgba(255,255,255,0.5)" },
                  ]}
                >
                  {DEAL_TYPE_LABELS[plan.type] ?? plan.type}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[styles.planLabelText, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {getPlanLabel(plan)}
                </Text>
                {(showDays || showTime) && (
                  <Text style={[styles.planDetailText, { color: "rgba(255,255,255,0.3)" }]} numberOfLines={1}>
                    {[
                      showDays ? plan.days!.map((d) => d.slice(0, 3)).join(" · ") : "",
                      showTime ? `${plan.timeFrom}–${plan.timeTo}` : "",
                    ].filter(Boolean).join("  ·  ")}
                  </Text>
                )}
                {!!plan.description && (
                  <Text style={[styles.planDetailText, { color: "rgba(255,255,255,0.25)", fontStyle: "italic" }]} numberOfLines={1}>
                    {plan.description}
                  </Text>
                )}
              </View>
              <View
                style={[
                  styles.genderPill,
                  {
                    backgroundColor:
                      plan.gender === "female"
                        ? "rgba(244,63,94,0.15)"
                        : colors.primary + "22",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.genderText,
                    { color: plan.gender === "female" ? "#e11d48" : colors.primary },
                  ]}
                >
                  {plan.gender === "female" ? "Ladies" : "All"}
                </Text>
              </View>
            </View>
          );
        })}
        {item.plans.length > 3 && (
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
            +{item.plans.length - 3} more
          </Text>
        )}
        <View
          style={[
            styles.ctaRow,
            {
              backgroundColor: colors.primary + "18",
              borderColor: colors.primary + "33",
              borderTopColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.ctaText, { color: colors.primary }]}>
            {item.pubEventId ? t("events.book_now_btn") : "View venue"}
          </Text>
          <Ionicons name="arrow-forward-circle" size={18} color={colors.primary} />
        </View>
      </View>
    </Pressable>
  );
}

export default function DealsScreen() {
  const { t } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const [annGenreFilter, setAnnGenreFilter] = useState("");
  const [annEventTypeFilter, setAnnEventTypeFilter] = useState("");
  const [dealTypeFilter, setDealTypeFilter] = useState("");
  const [dealGenderFilter, setDealGenderFilter] = useState("");

  const {
    data: drinkOffers = [],
    isLoading: dealsLoading,
    refetch: refetchDeals,
    isRefetching: isRefetchingDeals,
  } = useListVendorDrinkOffers();
  const {
    data: announcements = [],
    isLoading: annLoading,
    refetch: refetchAnn,
  } = useQuery<RecentAnnouncement[]>({
    queryKey: ["announcements", "recent"],
    queryFn: () => customFetch<RecentAnnouncement[]>("/api/announcements/recent"),
    staleTime: 1000 * 60 * 5,
  });
  const {
    data: sliderAnnouncements = [],
    refetch: refetchSlider,
  } = useQuery<RecentAnnouncement[]>({
    queryKey: ["announcements", "slider"],
    queryFn: () => customFetch<RecentAnnouncement[]>("/api/announcements/slider"),
    staleTime: 1000 * 60 * 5,
  });

  const isLoading = dealsLoading || annLoading;
  const isRefreshing = isRefetchingDeals;

  function onRefresh() {
    refetchDeals();
    refetchAnn();
    refetchSlider();
  }

  const filteredAnnouncements = announcements.filter((a) => {
    if (annGenreFilter && a.genre !== annGenreFilter) return false;
    if (annEventTypeFilter && a.eventType !== annEventTypeFilter) return false;
    return true;
  });

  const filteredDeals = (drinkOffers as VendorDrinkOffer[]).filter((offer) => {
    if (!dealTypeFilter && !dealGenderFilter) return true;
    return offer.plans.some((p) => {
      const typeMatch = !dealTypeFilter || p.type === dealTypeFilter;
      const genderMatch =
        !dealGenderFilter ||
        (dealGenderFilter === "female" ? p.gender === "female" : p.gender !== "female");
      return typeMatch && genderMatch;
    });
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={[styles.header, { paddingTop: topPadding + 16, borderBottomColor: colors.border }]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              {t("deals.title")}
            </Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              {t("deals.subtitle")}
            </Text>
          </View>
          <View style={[styles.headerIcon, { backgroundColor: colors.primary + "18" }]}>
            <Ionicons name="pricetags-outline" size={22} color={colors.primary} />
          </View>
        </View>
      </LinearGradient>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 },
          ]}
        >
          {/* Announcement Slider */}
          {sliderAnnouncements.length > 0 && (
            <AnnouncementSlider announcements={sliderAnnouncements} />
          )}

          {/* Drink Deals */}
          <View style={styles.dealsSection}>
            <View style={styles.dealsSectionHeader}>
              <Ionicons name="wine-outline" size={16} color={colors.primary} />
              <Text style={[styles.dealsSectionTitle, { color: colors.foreground }]}>
                {t("events.drink_deals")}
              </Text>
              {filteredDeals.length > 0 && (
                <View style={[styles.countBadge, { backgroundColor: colors.primary + "18" }]}>
                  <Text style={[styles.countText, { color: colors.primary }]}>
                    {filteredDeals.length}
                  </Text>
                </View>
              )}
              <Pressable
                style={styles.viewAllBtn}
                onPress={() => router.push("/pub-offers" as never)}
              >
                <Text style={[styles.viewAllText, { color: colors.primary }]}>
                  {t("deals.view_all_offers")}
                </Text>
                <Ionicons name="arrow-forward" size={12} color={colors.primary} />
              </Pressable>
            </View>

            {/* Deal Type filter chips */}
            <View style={{ gap: 8, marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="pricetag-outline" size={13} color={colors.mutedForeground} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>
                  Deal Type
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, paddingBottom: 2 }}
              >
                {(["", ...DEAL_TYPES] as string[]).map((dt) => (
                  <Pressable
                    key={dt || "all"}
                    onPress={() => setDealTypeFilter(dt === dealTypeFilter ? "" : dt)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: dealTypeFilter === dt ? colors.primary : colors.border,
                      backgroundColor: dealTypeFilter === dt ? colors.primary + "18" : colors.card,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Inter_500Medium",
                        color: dealTypeFilter === dt ? colors.primary : colors.mutedForeground,
                      }}
                    >
                      {dt ? (DEAL_TYPE_LABELS[dt] ?? dt) : "All"}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="people-outline" size={13} color={colors.mutedForeground} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>
                  For
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, paddingBottom: 2 }}
              >
                {[
                  { key: "", label: "Everyone" },
                  { key: "female", label: "Ladies" },
                  { key: "other", label: "Mixed / All" },
                ].map((opt) => (
                  <Pressable
                    key={opt.key || "all"}
                    onPress={() => setDealGenderFilter(opt.key === dealGenderFilter ? "" : opt.key)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: dealGenderFilter === opt.key ? colors.primary : colors.border,
                      backgroundColor:
                        dealGenderFilter === opt.key ? colors.primary + "18" : colors.card,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Inter_500Medium",
                        color:
                          dealGenderFilter === opt.key ? colors.primary : colors.mutedForeground,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {filteredDeals.length === 0 ? (
              <EmptyState
                icon="wine-outline"
                title={t("deals.no_deals")}
                subtitle={t("deals.no_deals_sub")}
              />
            ) : (
              <FlatList
                data={filteredDeals}
                keyExtractor={(item) => String(item.vendorId)}
                scrollEnabled={false}
                contentContainerStyle={styles.dealsList}
                renderItem={({ item }) => <DrinkDealCard item={item} />}
                ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
              />
            )}
          </View>

          {/* What's On — horizontal amber cards matching home tab */}
          {announcements.length > 0 && (
            <View style={{ marginTop: 8 }}>
              {/* Section header */}
              <View style={styles.whatsOnHeader}>
                <Ionicons name="megaphone-outline" size={16} color="#D4AF37" />
                <Text style={[styles.whatsOnTitle, { color: colors.foreground }]}>What's On</Text>
              </View>

              {/* Filters */}
              <View style={{ paddingHorizontal: 20, gap: 8, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="musical-notes-outline" size={13} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>
                    Genre
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6, paddingBottom: 2 }}
                >
                  {["", ...ANN_GENRES].map((g) => (
                    <Pressable
                      key={g || "all"}
                      onPress={() => setAnnGenreFilter(g === annGenreFilter ? "" : g)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: annGenreFilter === g ? "#D4AF37" : colors.border,
                        backgroundColor: annGenreFilter === g ? "rgba(212,175,55,0.15)" : colors.card,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: "Inter_500Medium",
                          color: annGenreFilter === g ? "#D4AF37" : colors.mutedForeground,
                        }}
                      >
                        {g || "All"}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="calendar-outline" size={13} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>
                    Event Type
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6, paddingBottom: 4 }}
                >
                  {["", ...ANN_EVENT_TYPES].map((et) => (
                    <Pressable
                      key={et || "all"}
                      onPress={() => setAnnEventTypeFilter(et === annEventTypeFilter ? "" : et)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: annEventTypeFilter === et ? "#D4AF37" : colors.border,
                        backgroundColor:
                          annEventTypeFilter === et ? "rgba(212,175,55,0.15)" : colors.card,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: "Inter_500Medium",
                          color: annEventTypeFilter === et ? "#D4AF37" : colors.mutedForeground,
                        }}
                      >
                        {et || "All"}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {filteredAnnouncements.length === 0 ? (
                <EmptyState
                  icon="megaphone-outline"
                  title="No announcements"
                  subtitle="Try different filters"
                />
              ) : (
                <FlatList
                  horizontal
                  data={filteredAnnouncements}
                  keyExtractor={(item) => String(item.id)}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingLeft: 20, paddingRight: 8, gap: 12 }}
                  renderItem={({ item }) => (
                    <Pressable
                      style={[
                        styles.announcementCard,
                        { backgroundColor: "#18181c", borderColor: "rgba(212,175,55,0.18)" },
                      ]}
                      onPress={() =>
                        item.eventId
                          ? router.push(`/event/${item.eventId}` as never)
                          : undefined
                      }
                    >
                      {item.imageUrl ? (
                        <View style={styles.announcementImageWrapper}>
                          <Image
                            source={{ uri: item.imageUrl }}
                            style={StyleSheet.absoluteFillObject}
                            resizeMode="cover"
                          />
                          <LinearGradient
                            colors={["transparent", "rgba(0,0,0,0.78)"]}
                            style={StyleSheet.absoluteFillObject}
                          />
                          <View style={styles.announcementImageFooter}>
                            <View
                              style={[
                                styles.announcementBadge,
                                { backgroundColor: "rgba(212,175,55,0.25)" },
                              ]}
                            >
                              <Ionicons name="megaphone-outline" size={11} color="#D4AF37" />
                              <Text
                                style={[styles.announcementVenue, { color: "#D4AF37" }]}
                                numberOfLines={1}
                              >
                                {item.vendorName}
                              </Text>
                            </View>
                            <Text style={styles.announcementImageTitle} numberOfLines={2}>
                              {item.title}
                            </Text>
                          </View>
                        </View>
                      ) : (
                        <>
                          <View
                            style={[
                              styles.announcementBadge,
                              { backgroundColor: "rgba(212,175,55,0.15)" },
                            ]}
                          >
                            <Ionicons name="megaphone-outline" size={13} color="#D4AF37" />
                            <Text
                              style={[styles.announcementVenue, { color: "#D4AF37" }]}
                              numberOfLines={1}
                            >
                              {item.vendorName}
                            </Text>
                          </View>
                          <Text
                            style={[styles.announcementTitle, { color: "#fff" }]}
                            numberOfLines={2}
                          >
                            {item.title}
                          </Text>
                        </>
                      )}
                      {!item.imageUrl && item.body ? (
                        <Text
                          style={[styles.announcementBody, { color: "rgba(255,255,255,0.55)" }]}
                          numberOfLines={2}
                        >
                          {item.body}
                        </Text>
                      ) : null}
                      {item.announceDate ? (
                        <View
                          style={[
                            styles.announcementDateRow,
                            {
                              borderTopColor: "rgba(255,255,255,0.08)",
                              borderTopWidth: 1,
                              marginTop: 4,
                              paddingTop: 8,
                            },
                          ]}
                        >
                          <Ionicons name="calendar-outline" size={11} color="#D4AF37" />
                          <Text style={[styles.announcementDate, { color: "#D4AF37" }]}>
                            {new Date(item.announceDate).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })}
                          </Text>
                          {item.announceTime ? (
                            <>
                              <Ionicons
                                name="time-outline"
                                size={11}
                                color="#D4AF37"
                                style={{ marginLeft: 8 }}
                              />
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
              )}
            </View>
          )}

          <MobileFooter />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  headerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingTop: 8,
  },

  dealsSection: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  dealsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  dealsSectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  countBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: "auto",
  },
  viewAllText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  dealsList: {
    paddingBottom: 4,
  },

  dealCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  dealHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  dealHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  dealVenueName: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    lineHeight: 22,
  },
  dealBody: {
    padding: 14,
    gap: 9,
  },
  planRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  typeBadge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    flexShrink: 0,
  },
  typeBadgeText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  planLabelText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  planDetailText: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    lineHeight: 14,
    marginTop: 1,
  },
  genderPill: {
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
  },
  genderText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ctaText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },

  whatsOnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  whatsOnTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },

  sliderSection: {
    marginBottom: 20,
    paddingTop: 12,
  },
  sliderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sliderTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  announcementSlide: {
    width: ANNOUNCEMENT_CARD_WIDTH,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  slideImageWrap: {
    height: 200,
    position: "relative",
  },
  venueBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  venueText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    maxWidth: 200,
  },
  slideDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  slideDateText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  slideNoImage: {
    padding: 16,
    gap: 8,
    minHeight: 120,
  },
  slideTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    lineHeight: 22,
  },
  slideBody: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
});
