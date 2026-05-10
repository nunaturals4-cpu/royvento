import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { customFetch, useListVendorDrinkOffers } from "@workspace/api-client-react";
import type { VendorDrinkOffer, DrinkPlanSummary } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
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

interface Announcement {
  id: number;
  title: string;
  body: string;
  announceDate: string;
  announceTime: string;
  vendorName: string;
  eventId: number | null;
  vendorId: number;
  imageUrl?: string;
  coverImageUrl?: string;
  genre?: string;
  eventType?: string;
}

const ANN_GENRES = ["EDM", "Hip Hop", "Bollywood", "Rock", "Pop", "Jazz", "Retro", "House", "Techno", "R&B"];
const ANN_EVENT_TYPES = ["Ladies Night", "DJ Night", "Live Music", "Karaoke", "Open Bar", "Theme Party", "Open Mic", "Brunch", "Pool Party", "Sufi Night"];

const DEAL_TYPE_LABELS: Record<string, string> = {
  welcome: "Free Drink",
  unlimited: "Unlimited",
  ticket: "With Ticket",
  custom: "Discount",
};

const AUTOPLAY_MS = 5000;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

function getPlanLabel(plan: DrinkPlanSummary): string {
  if (plan.type === "welcome") return "Free welcome drink";
  if (plan.type === "unlimited") return "Unlimited drinks";
  if (plan.type === "ticket") {
    const count = (plan.lineItems ?? []).filter((i: { name?: string }) => i.name).length;
    return count > 0 ? `${count} item${count !== 1 ? "s" : ""} with ticket` : "Drinks with ticket";
  }
  return plan.productName || "Drinks discount";
}

function AnnouncementSlider({ announcements }: { announcements: Announcement[] }) {
  const colors = useColors();
  const [current, setCurrent] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const startTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (announcements.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setCurrent((i) => {
        const next = (i + 1) % announcements.length;
        scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
        return next;
      });
    }, AUTOPLAY_MS);
  }, [announcements.length]);

  useEffect(() => {
    startTimer();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startTimer]);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      setCurrent(idx);
      startTimer();
    },
    [startTimer],
  );

  const goTo = useCallback(
    (idx: number) => {
      scrollRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
      setCurrent(idx);
      startTimer();
    },
    [startTimer],
  );

  if (announcements.length === 0) return null;

  return (
    <View style={sliderStyles.wrapper}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
      >
        {announcements.map((a) => {
          const heroImage = a.imageUrl || a.coverImageUrl;
          return (
            <Pressable
              key={a.id}
              style={[sliderStyles.slide, { backgroundColor: colors.card }]}
              onPress={() => {
                if (a.eventId) {
                  router.push(`/event/${a.eventId}` as never);
                } else {
                  router.push(`/partner/${a.vendorId}` as never);
                }
              }}
            >
              {heroImage ? (
                <Image source={{ uri: heroImage }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : null}
              <LinearGradient
                colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.85)"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={sliderStyles.slideContent}>
                <View style={[sliderStyles.vendorBadge, { backgroundColor: colors.primary + "33", borderColor: colors.primary }]}>
                  <Ionicons name="megaphone-outline" size={11} color="#fff" />
                  <Text style={sliderStyles.vendorBadgeText} numberOfLines={1}>{a.vendorName}</Text>
                </View>
                <Text style={sliderStyles.slideTitle} numberOfLines={3}>{a.title}</Text>
                {a.body ? (
                  <Text style={sliderStyles.slideBody} numberOfLines={2}>{a.body}</Text>
                ) : null}
                {(a.announceDate || a.announceTime) ? (
                  <View style={sliderStyles.slideMeta}>
                    {a.announceDate ? (
                      <View style={sliderStyles.slideMetaItem}>
                        <Ionicons name="calendar-outline" size={11} color="rgba(255,255,255,0.85)" />
                        <Text style={sliderStyles.slideMetaText}>
                          {new Date(a.announceDate).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </Text>
                      </View>
                    ) : null}
                    {a.announceTime ? (
                      <View style={sliderStyles.slideMetaItem}>
                        <Ionicons name="time-outline" size={11} color="rgba(255,255,255,0.85)" />
                        <Text style={sliderStyles.slideMetaText}>{a.announceTime}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <View style={[sliderStyles.cta, { backgroundColor: colors.primary }]}>
                  <Text style={[sliderStyles.ctaText, { color: colors.primaryForeground }]}>Book now</Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.primaryForeground} />
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {announcements.length > 1 ? (
        <View style={sliderStyles.dots}>
          {announcements.map((_, i) => (
            <Pressable
              key={i}
              onPress={() => goTo(i)}
              hitSlop={8}
              style={[
                sliderStyles.dot,
                i === current ? { width: 22, backgroundColor: colors.primary } : { backgroundColor: "rgba(255,255,255,0.4)" },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  accent,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accent: "primary" | "amber";
}) {
  const colors = useColors();
  const accentColor = accent === "primary" ? colors.primary : "#f59e0b";
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active
          ? { backgroundColor: accentColor + "26", borderColor: accentColor }
          : { backgroundColor: "transparent", borderColor: colors.border },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: active ? accentColor : colors.mutedForeground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function DrinkDealCard({ item }: { item: VendorDrinkOffer }) {
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
      <View style={[styles.dealBody, { borderTopColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <View style={[styles.planIcon, { backgroundColor: colors.primary + "22" }]}>
            <Ionicons name="wine-outline" size={14} color={colors.primary} />
          </View>
          <Text style={[styles.dealVenueName, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{item.vendorName}</Text>
          <View style={[styles.dealTypeBadge, { backgroundColor: colors.primary + "22" }]}>
            <Ionicons name="wine-outline" size={10} color={colors.primary} />
            <Text style={[styles.dealTypeBadgeText, { color: colors.primary }]}>Deals</Text>
          </View>
        </View>

        {(item.plans ?? []).slice(0, 3).map((plan: DrinkPlanSummary, i: number) => (
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
        {(item.plans?.length ?? 0) > 3 && (
          <Text style={[styles.morePlans, { color: colors.mutedForeground }]}>
            +{(item.plans?.length ?? 0) - 3} more deal{(item.plans?.length ?? 0) - 3 !== 1 ? "s" : ""}
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

function AnnouncementCard({ item }: { item: Announcement }) {
  const colors = useColors();
  const heroImage = item.imageUrl || item.coverImageUrl;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.annCard,
        { backgroundColor: colors.card, borderColor: "rgba(245,158,11,0.18)" },
        pressed && styles.pressed,
      ]}
      onPress={() => {
        if (item.eventId) {
          router.push(`/event/${item.eventId}` as never);
        } else {
          router.push(`/partner/${item.vendorId}` as never);
        }
      }}
    >
      <View style={styles.annImageWrap}>
        {heroImage ? (
          <Image source={{ uri: heroImage }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="megaphone-outline" size={32} color="rgba(245,158,11,0.4)" />
          </View>
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.6)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.annVendorBadge}>
          <Ionicons name="megaphone-outline" size={10} color="#f59e0b" />
          <Text style={styles.annVendorText} numberOfLines={1}>{item.vendorName}</Text>
        </View>
      </View>

      <View style={styles.annBody}>
        <Text style={[styles.annTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
        {item.body ? (
          <Text style={[styles.annDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{item.body}</Text>
        ) : null}
        {(item.announceDate || item.announceTime) ? (
          <View style={[styles.annMetaRow, { borderTopColor: colors.border }]}>
            {item.announceDate ? (
              <View style={styles.annMetaItem}>
                <Ionicons name="calendar-outline" size={11} color="#f59e0b" />
                <Text style={styles.annMetaText}>
                  {new Date(item.announceDate).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Text>
              </View>
            ) : null}
            {item.announceTime ? (
              <View style={styles.annMetaItem}>
                <Ionicons name="time-outline" size={11} color="#f59e0b" />
                <Text style={styles.annMetaText}>{item.announceTime}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {item.eventId ? (
          <View style={[styles.annCta, { backgroundColor: colors.primary + "1A", borderColor: colors.primary + "40" }]}>
            <Text style={[styles.annCtaText, { color: colors.primary }]}>Book now</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.primary} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function PubOffersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const {
    data: drinkOffers = [],
    isLoading: loadingDeals,
    refetch: refetchDeals,
    isRefetching: refetchingDeals,
  } = useListVendorDrinkOffers();

  const {
    data: sliderAnnouncements = [],
    refetch: refetchSlider,
  } = useQuery<Announcement[]>({
    queryKey: ["announcements", "slider"],
    queryFn: () => customFetch<Announcement[]>("/api/announcements/slider"),
  });

  const {
    data: announcements = [],
    refetch: refetchRecent,
  } = useQuery<Announcement[]>({
    queryKey: ["announcements", "recent"],
    queryFn: () => customFetch<Announcement[]>("/api/announcements/recent"),
  });

  const [dealTypeFilter, setDealTypeFilter] = useState("");
  const [dealGenderFilter, setDealGenderFilter] = useState("");
  const [annGenreFilter, setAnnGenreFilter] = useState("");
  const [annEventTypeFilter, setAnnEventTypeFilter] = useState("");

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

  const filteredAnnouncements = announcements.filter((a) => {
    if (annGenreFilter && a.genre !== annGenreFilter) return false;
    if (annEventTypeFilter && a.eventType !== annEventTypeFilter) return false;
    return true;
  });

  const onRefresh = useCallback(() => {
    refetchDeals();
    refetchSlider();
    refetchRecent();
  }, [refetchDeals, refetchSlider, refetchRecent]);

  const hasSlider = sliderAnnouncements.length > 0;
  const hasDeals = (drinkOffers as VendorDrinkOffer[]).length > 0;
  const hasAnnouncements = announcements.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={[styles.header, { paddingTop: topPadding + 16, borderBottomColor: colors.border }]}
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerContent}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Pub Drink Offers</Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              Exclusive drink deals from partner pubs
            </Text>
          </View>
          <View style={[styles.headerIcon, { backgroundColor: colors.primary + "18" }]}>
            <Ionicons name="wine-outline" size={22} color={colors.primary} />
          </View>
        </View>
      </LinearGradient>

      {loadingDeals ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refetchingDeals}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 },
          ]}
        >
          {/* Hero slider */}
          {hasSlider ? <AnnouncementSlider announcements={sliderAnnouncements} /> : null}

          {/* Drink Deals */}
          {hasDeals ? (
            <View style={styles.dealsSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="pricetags-outline" size={14} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.primary }]}>Drink deals</Text>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <Pressable onPress={() => router.push("/(tabs)/pubs" as never)} style={styles.sectionLink}>
                  <Text style={[styles.sectionLinkText, { color: colors.mutedForeground }]}>Browse pubs</Text>
                  <Ionicons name="arrow-forward" size={11} color={colors.mutedForeground} />
                </Pressable>
              </View>

              {/* Filters: deal type */}
              <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Deal type</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                <FilterChip
                  label="All"
                  active={dealTypeFilter === ""}
                  onPress={() => setDealTypeFilter("")}
                  accent="primary"
                />
                {(["welcome", "unlimited", "ticket", "custom"] as const).map((dt) => (
                  <FilterChip
                    key={dt}
                    label={DEAL_TYPE_LABELS[dt]!}
                    active={dealTypeFilter === dt}
                    onPress={() => setDealTypeFilter(dealTypeFilter === dt ? "" : dt)}
                    accent="primary"
                  />
                ))}
              </ScrollView>

              {/* Filters: for whom */}
              <Text style={[styles.filterLabel, { color: colors.mutedForeground, marginTop: 4 }]}>For</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                <FilterChip
                  label="Everyone"
                  active={dealGenderFilter === ""}
                  onPress={() => setDealGenderFilter("")}
                  accent="primary"
                />
                <FilterChip
                  label="Ladies"
                  active={dealGenderFilter === "female"}
                  onPress={() => setDealGenderFilter(dealGenderFilter === "female" ? "" : "female")}
                  accent="primary"
                />
                <FilterChip
                  label="Mixed / All"
                  active={dealGenderFilter === "other"}
                  onPress={() => setDealGenderFilter(dealGenderFilter === "other" ? "" : "other")}
                  accent="primary"
                />
              </ScrollView>

              {filteredDeals.length === 0 ? (
                <Text style={[styles.noMatchText, { color: colors.mutedForeground }]}>No deals match these filters.</Text>
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
          ) : null}

          {/* What's On — announcements */}
          {hasAnnouncements ? (
            <View style={styles.dealsSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="megaphone-outline" size={14} color="#f59e0b" />
                <Text style={[styles.sectionTitle, { color: "#f59e0b" }]}>What's on</Text>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              </View>

              <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Genre</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                <FilterChip
                  label="All"
                  active={annGenreFilter === ""}
                  onPress={() => setAnnGenreFilter("")}
                  accent="amber"
                />
                {ANN_GENRES.map((g) => (
                  <FilterChip
                    key={g}
                    label={g}
                    active={annGenreFilter === g}
                    onPress={() => setAnnGenreFilter(annGenreFilter === g ? "" : g)}
                    accent="amber"
                  />
                ))}
              </ScrollView>

              <Text style={[styles.filterLabel, { color: colors.mutedForeground, marginTop: 4 }]}>Event type</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                <FilterChip
                  label="All"
                  active={annEventTypeFilter === ""}
                  onPress={() => setAnnEventTypeFilter("")}
                  accent="amber"
                />
                {ANN_EVENT_TYPES.map((et) => (
                  <FilterChip
                    key={et}
                    label={et}
                    active={annEventTypeFilter === et}
                    onPress={() => setAnnEventTypeFilter(annEventTypeFilter === et ? "" : et)}
                    accent="amber"
                  />
                ))}
              </ScrollView>

              {filteredAnnouncements.length === 0 ? (
                <Text style={[styles.noMatchText, { color: colors.mutedForeground }]}>No announcements match these filters.</Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.annRow}
                >
                  {filteredAnnouncements.map((a) => (
                    <View key={a.id} style={{ marginRight: 14 }}>
                      <AnnouncementCard item={a} />
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : null}

          {!hasDeals && !hasSlider && !hasAnnouncements ? (
            <View style={{ padding: 20 }}>
              <EmptyState
                icon="wine-outline"
                title="No drink offers yet"
                subtitle="Check back soon — pub partners are adding deals all the time."
              />
            </View>
          ) : null}

          <MobileFooter />
        </ScrollView>
      )}
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  wrapper: {
    height: 320,
    marginBottom: 20,
  },
  slide: {
    width: SCREEN_WIDTH,
    height: 320,
    overflow: "hidden",
  },
  slideContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 20,
    gap: 8,
  },
  vendorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    maxWidth: "80%",
  },
  vendorBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    flexShrink: 1,
  },
  slideTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.4,
    lineHeight: 30,
  },
  slideBody: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.85)",
    lineHeight: 18,
  },
  slideMeta: {
    flexDirection: "row",
    gap: 14,
    marginTop: 4,
  },
  slideMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  slideMetaText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.85)",
  },
  cta: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 6,
  },
  ctaText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  dots: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    height: 6,
    width: 6,
    borderRadius: 3,
  },
});

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { padding: 4, alignSelf: "flex-start" },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: { paddingTop: 0 },
  dealsSection: { paddingHorizontal: 20, marginTop: 12 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  divider: { flex: 1, height: 1 },
  sectionLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  sectionLinkText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  filterLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  noMatchText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    paddingVertical: 16,
  },
  dealsList: { paddingBottom: 4 },
  dealCard: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  dealVenueName: { flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff", marginRight: 8 },
  dealTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dealTypeBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff", letterSpacing: 0.3 },
  dealBody: { padding: 14, gap: 8, borderTopWidth: 1 },
  planRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  planIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  planLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  genderPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  genderText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  morePlans: { fontSize: 12, fontFamily: "Inter_400Regular", paddingLeft: 34 },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  ctaText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  annRow: {
    paddingBottom: 4,
  },
  annCard: {
    width: 280,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  annImageWrap: {
    height: 150,
    position: "relative",
    overflow: "hidden",
  },
  annVendorBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderColor: "rgba(245,158,11,0.5)",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    maxWidth: "75%",
  },
  annVendorText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#f59e0b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  annBody: { padding: 14, gap: 8 },
  annTitle: { fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: -0.2, lineHeight: 22 },
  annDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  annMetaRow: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  annMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  annMetaText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "rgba(245,158,11,0.85)",
  },
  annCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
  },
  annCtaText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
