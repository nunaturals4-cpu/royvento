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
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

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

function getPlanSummary(plan: DrinkPlanSummary): string {
  if (plan.type === "welcome") return plan.gender === "female" ? "Free welcome drink · Ladies" : "Free welcome drink · All guests";
  if (plan.type === "unlimited") return plan.gender === "female" ? "Unlimited drinks · Ladies" : "Unlimited drinks · All guests";
  if (plan.type === "ticket") {
    const count = (plan.lineItems ?? []).filter((i: { name?: string }) => i.name).length;
    return count > 0 ? `${count} item${count !== 1 ? "s" : ""} included with ticket` : "Drinks included with ticket";
  }
  return plan.productName || "Drink offer";
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
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

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

  async function sendChatMessage() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput("");
    const history = [...chatMessages];
    setChatMessages([...history, { role: "user", content: text }]);
    setChatLoading(true);
    try {
      const res = await customFetch<{ reply: string }>("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      setChatMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", content: t("home.roy_error") }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

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
                category="Pub"
                type="pub"
                rating={item.rating}
                reviewCount={item.reviewCount}
                hasDrinkPlans={item.hasDrinkPlans}
                freeEntryRules={item.freeEntryRules}
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
                style={[styles.announcementCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => item.eventId ? router.push(`/event/${item.eventId}` as never) : undefined}
              >
                <View style={[styles.announcementBadge, { backgroundColor: colors.primary + "22" }]}>
                  <Ionicons name="megaphone-outline" size={13} color={colors.primary} />
                  <Text style={[styles.announcementVenue, { color: colors.primary }]} numberOfLines={1}>
                    {item.vendorName}
                  </Text>
                </View>
                <Text style={[styles.announcementTitle, { color: colors.foreground }]} numberOfLines={2}>
                  {item.title}
                </Text>
                {item.body ? (
                  <Text style={[styles.announcementBody, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {item.body}
                  </Text>
                ) : null}
                {item.announceDate ? (
                  <View style={styles.announcementDateRow}>
                    <Ionicons name="calendar-outline" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.announcementDate, { color: colors.mutedForeground }]}>
                      {new Date(item.announceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {item.announceTime ? `  ·  ${item.announceTime}` : ""}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            )}
          />
        </Section>
      )}

      {/* Drink Deals */}
      {drinkOffers.length > 0 && (
        <Section title="Drink Deals" icon="wine-outline" onSeeAll={() => router.push({ pathname: "/(tabs)/explore", params: { type: "pub" } })}>
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
                <View style={styles.drinkCardImage}>
                  {item.coverImageUrl ? (
                    <Image
                      source={{ uri: item.coverImageUrl }}
                      style={StyleSheet.absoluteFillObject}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.drinkCardImagePlaceholder, { backgroundColor: colors.muted }]}>
                      <Ionicons name="wine-outline" size={22} color={colors.mutedForeground} />
                    </View>
                  )}
                  <LinearGradient
                    colors={["transparent", "rgba(0,0,0,0.75)"]}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <Text style={styles.drinkCardName} numberOfLines={1}>{item.vendorName}</Text>
                </View>
                <View style={styles.drinkCardBody}>
                  {item.plans.slice(0, 2).map((plan: DrinkPlanSummary, i: number) => (
                    <View key={i} style={styles.drinkPlanRow}>
                      <View style={[styles.drinkDot, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.drinkPlanText, { color: colors.foreground }]} numberOfLines={1}>
                        {getPlanSummary(plan)}
                      </Text>
                    </View>
                  ))}
                  {item.plans.length > 2 && (
                    <Text style={[styles.drinkMoreText, { color: colors.mutedForeground }]}>
                      +{item.plans.length - 2} more offer{item.plans.length - 2 !== 1 ? "s" : ""}
                    </Text>
                  )}
                  <View style={[styles.drinkCta, { borderTopColor: colors.border }]}>
                    <Text style={[styles.drinkCtaText, { color: colors.primary }]}>
                      {item.pubEventId ? "Book now" : "View venue"}
                    </Text>
                    <Ionicons name="arrow-forward" size={13} color={colors.primary} />
                  </View>
                </View>
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

    {/* AI Chat FAB */}
    <TouchableOpacity
      style={[styles.fab, { backgroundColor: colors.primary, bottom: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }]}
      onPress={() => setChatOpen(true)}
    >
      <Ionicons name="chatbubble-ellipses" size={22} color={colors.primaryForeground} />
    </TouchableOpacity>

    {/* AI Chat Modal */}
    <Modal visible={chatOpen} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Chat Header */}
        <View style={[styles.chatHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={styles.chatHeaderLeft}>
            <View style={[styles.chatAvatarSmall, { backgroundColor: colors.primary }]}>
              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 12 }}>R</Text>
            </View>
            <View>
              <Text style={[styles.chatTitle, { color: colors.foreground }]}>{t("home.roy_chat_title")}</Text>
              <Text style={[styles.chatSub, { color: "#22c55e" }]}>{t("home.roy_online")}</Text>
            </View>
          </View>
          <Pressable onPress={() => setChatOpen(false)}>
            <Ionicons name="close" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Messages */}
        <ScrollView
          ref={chatScrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
        >
          {chatMessages.length === 0 && (
            <View style={{ alignItems: "center", padding: 24, gap: 12 }}>
              <View style={[styles.chatAvatarLarge, { backgroundColor: colors.primary }]}>
                <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 24 }}>R</Text>
              </View>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 18 }}>{t("home.roy_title")}</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 21 }}>
                {t("home.roy_intro")}
              </Text>
              {[t("home.roy_suggestion_1"), t("home.roy_suggestion_2"), t("home.roy_suggestion_3")].map((q) => (
                <Pressable
                  key={q}
                  style={[styles.suggestionChip, { backgroundColor: colors.muted, borderColor: colors.border }]}
                  onPress={() => { setChatInput(q); }}
                >
                  <Text style={[styles.suggestionText, { color: colors.foreground }]}>{q}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {chatMessages.map((msg, idx) => (
            <View key={idx} style={[styles.messageBubble, msg.role === "user" ? styles.userBubble : styles.aiBubble, { backgroundColor: msg.role === "user" ? colors.primary : colors.card, borderColor: colors.border }]}>
              <Text style={[styles.messageText, { color: msg.role === "user" ? colors.primaryForeground : colors.foreground }]}>{msg.content}</Text>
            </View>
          ))}
          {chatLoading && (
            <View style={[styles.messageBubble, styles.aiBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.chatInput, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <TextInput
              style={[styles.chatInputField, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder={t("home.roy_placeholder")}
              placeholderTextColor={colors.mutedForeground}
              onSubmitEditing={sendChatMessage}
              returnKeyType="send"
              multiline
            />
            <TouchableOpacity
              style={[styles.chatSendBtn, { backgroundColor: chatInput.trim() ? colors.primary : colors.muted }]}
              onPress={sendChatMessage}
              disabled={!chatInput.trim() || chatLoading}
            >
              <Ionicons name="send" size={16} color={chatInput.trim() ? colors.primaryForeground : colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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
  fab: {
    position: "absolute",
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  chatHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  chatAvatarSmall: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  chatAvatarLarge: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  chatTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  chatSub: { fontSize: 11, fontFamily: "Inter_500Medium" },
  messageBubble: { borderRadius: 16, padding: 12, maxWidth: "82%", borderWidth: 1 },
  userBubble: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  messageText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  suggestionChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9, alignSelf: "center" },
  suggestionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  chatInput: { flexDirection: "row", alignItems: "flex-end", padding: 12, gap: 10, borderTopWidth: 1 },
  chatInputField: { flex: 1, borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", maxHeight: 100 },
  chatSendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  announcementCard: {
    width: 220,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
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
    width: 200,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  drinkCardImage: {
    height: 110,
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
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  drinkCardBody: {
    padding: 10,
    gap: 5,
  },
  drinkPlanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  drinkDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    flexShrink: 0,
  },
  drinkPlanText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  drinkMoreText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  drinkCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    marginTop: 6,
    paddingTop: 8,
  },
  drinkCtaText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
