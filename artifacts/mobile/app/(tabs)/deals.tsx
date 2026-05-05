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
const DEAL_TYPES = ["welcome", "unlimited", "ticket", "discount"] as const;
const DEAL_TYPE_LABELS: Record<string, string> = {
  welcome: "Welcome Drink",
  unlimited: "Unlimited",
  ticket: "With Ticket",
  discount: "Discount",
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
            style={[styles.announcementSlide, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => item.eventId ? router.push(`/event/${item.eventId}` as never) : undefined}
          >
            {item.imageUrl ? (
              <View style={styles.slideImageWrap}>
                <Image
                  source={{ uri: item.imageUrl }}
                  style={StyleSheet.absoluteFillObject}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.75)"]}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.slideOverlay}>
                  <View style={[styles.venueBadge, { backgroundColor: colors.primary + "CC" }]}>
                    <Ionicons name="megaphone-outline" size={11} color="#fff" />
                    <Text style={styles.venueText} numberOfLines={1}>{item.vendorName}</Text>
                  </View>
                  <Text style={styles.slideTitleOverlay} numberOfLines={2}>{item.title}</Text>
                  {item.announceDate ? (
                    <View style={styles.slideDateRow}>
                      <Ionicons name="calendar-outline" size={11} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.slideDateText}>
                        {new Date(item.announceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        {item.announceTime ? `  ·  ${item.announceTime}` : ""}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={[styles.slideNoImage, { backgroundColor: colors.muted }]}>
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
  const colors = useColors();
  const { t } = useLanguage();
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
      <View style={styles.dealImageWrap}>
        {item.coverImageUrl ? (
          <Image
            source={{ uri: item.coverImageUrl }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="wine-outline" size={32} color={colors.mutedForeground} />
          </View>
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.78)"]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.dealImageBottom}>
          <Text style={styles.dealVenueName} numberOfLines={1}>{item.vendorName}</Text>
          <View style={[styles.dealTypeBadge, { backgroundColor: colors.primary }]}>
            <Ionicons name="wine-outline" size={10} color="#fff" />
            <Text style={styles.dealTypeBadgeText}>{t("nav.deals")}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.dealBody, { borderTopColor: colors.border }]}>
        {item.plans.slice(0, 3).map((plan: DrinkPlanSummary, i: number) => (
          <View key={i} style={styles.planRow}>
            <View style={[styles.planIcon, { backgroundColor: colors.primary + "22" }]}>
              <Ionicons
                name={
                  plan.type === "unlimited"
                    ? "wine-outline"
                    : plan.type === "ticket"
                    ? "ticket-outline"
                    : plan.type === "welcome"
                    ? "star-outline"
                    : "pricetag-outline"
                }
                size={12}
                color={colors.primary}
              />
            </View>
            <Text style={[styles.planLabel, { color: colors.foreground }]} numberOfLines={1}>
              {getPlanLabel(plan)}
            </Text>
            <View
              style={[
                styles.genderPill,
                {
                  backgroundColor:
                    plan.gender === "female"
                      ? "rgba(244,63,94,0.15)"
                      : colors.primary + "1A",
                },
              ]}
            >
              <Text
                style={[
                  styles.genderText,
                  { color: plan.gender === "female" ? "#fb7185" : colors.primary },
                ]}
              >
                {plan.gender === "female" ? "Ladies" : "All"}
              </Text>
            </View>
          </View>
        ))}
        {item.plans.length > 3 && (
          <Text style={[styles.morePlans, { color: colors.mutedForeground }]}>
            +{item.plans.length - 3} more deal{item.plans.length - 3 !== 1 ? "s" : ""}
          </Text>
        )}
        <View style={[styles.ctaRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.ctaText, { color: colors.primary }]}>
            {item.pubEventId ? "Book now" : "View venue"}
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

  const { data: drinkOffers = [], isLoading: dealsLoading, refetch: refetchDeals, isRefetching: isRefetchingDeals } = useListVendorDrinkOffers();
  const { data: announcements = [], isLoading: annLoading, refetch: refetchAnn } = useQuery<RecentAnnouncement[]>({
    queryKey: ["announcements", "recent"],
    queryFn: () => customFetch<RecentAnnouncement[]>("/api/announcements/recent"),
    staleTime: 1000 * 60 * 5,
  });
  const { data: sliderAnnouncements = [], isLoading: sliderLoading, refetch: refetchSlider } = useQuery<RecentAnnouncement[]>({
    queryKey: ["announcements", "slider"],
    queryFn: () => customFetch<RecentAnnouncement[]>("/api/announcements/slider"),
    staleTime: 1000 * 60 * 5,
  });

  const isLoading = dealsLoading || annLoading || sliderLoading;
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
      const genderMatch = !dealGenderFilter || (dealGenderFilter === "female" ? p.gender === "female" : p.gender !== "female");
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
          {/* Hero Announcement Slider — from /api/announcements/slider */}
          {sliderAnnouncements.length > 0 && (
            <AnnouncementSlider announcements={sliderAnnouncements} />
          )}

          {/* What's On — filter chips + recent announcements */}
          {announcements.length > 0 && (
            <View>
              <View style={{ paddingHorizontal: 20, paddingTop: 4, gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <Ionicons name="musical-notes-outline" size={13} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>Genre</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 2 }}>
                  {["", ...ANN_GENRES].map((g) => (
                    <Pressable
                      key={g || "all"}
                      onPress={() => setAnnGenreFilter(g === annGenreFilter ? "" : g)}
                      style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: annGenreFilter === g ? colors.primary : colors.border, backgroundColor: annGenreFilter === g ? colors.primary + "18" : colors.card }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: annGenreFilter === g ? colors.primary : colors.mutedForeground }}>{g || "All"}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <Ionicons name="calendar-outline" size={13} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>Event Type</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
                  {["", ...ANN_EVENT_TYPES].map((et) => (
                    <Pressable
                      key={et || "all"}
                      onPress={() => setAnnEventTypeFilter(et === annEventTypeFilter ? "" : et)}
                      style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: annEventTypeFilter === et ? colors.primary : colors.border, backgroundColor: annEventTypeFilter === et ? colors.primary + "18" : colors.card }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: annEventTypeFilter === et ? colors.primary : colors.mutedForeground }}>{et || "All"}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <AnnouncementSlider announcements={filteredAnnouncements} />
            </View>
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
                <Text style={[styles.viewAllText, { color: colors.primary }]}>{t("deals.view_all_offers")}</Text>
                <Ionicons name="arrow-forward" size={12} color={colors.primary} />
              </Pressable>
            </View>

            {/* Deal Type filter chips */}
            <View style={{ gap: 8, marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="pricetag-outline" size={13} color={colors.mutedForeground} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>Deal Type</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 2 }}>
                {(["", ...DEAL_TYPES] as string[]).map((dt) => (
                  <Pressable
                    key={dt || "all"}
                    onPress={() => setDealTypeFilter(dt === dealTypeFilter ? "" : dt)}
                    style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: dealTypeFilter === dt ? colors.primary : colors.border, backgroundColor: dealTypeFilter === dt ? colors.primary + "18" : colors.card }}
                  >
                    <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: dealTypeFilter === dt ? colors.primary : colors.mutedForeground }}>{dt ? DEAL_TYPE_LABELS[dt] : "All"}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="people-outline" size={13} color={colors.mutedForeground} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>For</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 2 }}>
                {[{ key: "", label: "Everyone" }, { key: "female", label: "Ladies" }, { key: "other", label: "Mixed / All" }].map((opt) => (
                  <Pressable
                    key={opt.key || "all"}
                    onPress={() => setDealGenderFilter(opt.key === dealGenderFilter ? "" : opt.key)}
                    style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: dealGenderFilter === opt.key ? colors.primary : colors.border, backgroundColor: dealGenderFilter === opt.key ? colors.primary + "18" : colors.card }}
                  >
                    <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: dealGenderFilter === opt.key ? colors.primary : colors.mutedForeground }}>{opt.label}</Text>
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
  slideOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    gap: 6,
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
    color: "#fff",
    maxWidth: 200,
  },
  slideTitleOverlay: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    lineHeight: 22,
  },
  slideDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  slideDateText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
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
  dealImageWrap: {
    height: 160,
    position: "relative",
  },
  dealImageBottom: {
    position: "absolute",
    bottom: 12,
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dealVenueName: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginRight: 8,
  },
  dealTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dealTypeBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    letterSpacing: 0.3,
  },
  dealBody: {
    padding: 14,
    gap: 8,
    borderTopWidth: 1,
  },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  planIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  planLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  genderPill: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  genderText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  morePlans: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    paddingLeft: 34,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  ctaText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
