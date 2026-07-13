import { resolveImageUrl } from "@/lib/resolveImageUrl";
import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSelectedCity } from "@/context/CityContext";
import { useColors } from "@/hooks/useColors";
import { GuestTypeBadge } from "@/components/GuestTypeBadge";
import { NightlifeOfferCard } from "@/components/NightlifeOfferCard";
import { OFFER_THEMES } from "@/components/offerThemes";

// ── Happening Tonight (mobile) ───────────────────────────────────────────────
// Mirror of the web `HappeningTonight` component. Real-time discovery feed from
// /api/happening-tonight with one-tap quick filters and a "What Should I Do
// Tonight?" instant recommendation.

interface TonightItem {
  key: string;
  id: number;
  kind: "pub" | "dj" | "event" | "game" | "happyhour" | "offer";
  title: string;
  subtitle: string;
  city: string;
  state: string;
  imageUrl: string;
  href: string;
  startTime: string;
  endTime: string;
  bucket: "now" | "soon" | null;
  /** For "offer" items: the vendor_offers category (food/drink/exclusive). */
  category?: string;
  /** Guest type ("all"/"female"/"male") — drives the Everyone/Ladies/Men badge. */
  gender?: string;
  dealLabel: string;
  rating: number;
  todayBookings: number;
  filters: string[];
  score: number;
}

interface TonightResponse {
  happeningNow: TonightItem[];
  startingSoon: TonightItem[];
  lastMinuteDeals: TonightItem[];
  tonightNearYou: TonightItem[];
  day: string;
  isToday: boolean;
  counts: { now: number; soon: number; deals: number; total: number };
}

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All Tonight" },
  { key: "now", label: "🔥 Happening Now" },
  { key: "soon", label: "⚡ Starting Soon" },
  { key: "event", label: "🎤 Events" },
];

// "Happy Hours" / "Food & Drink Offers" / "Exclusive Offer" share one dropdown
// instead of three always-visible chips — selecting an option here just sets
// the same `activeFilter` state a chip tap would.
const OFFER_TYPE_OPTIONS: { key: string; label: string }[] = [
  { key: "happy", label: "🍻 Happy Hours" },
  { key: "offers", label: "🍽️ Food & Drink Offers" },
  { key: "exclusive", label: "✨ Exclusive Offer" },
];
const DAY_OPTIONS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];
const DAY_KEYS_SUN_FIRST = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
function todayDayKey(): string {
  return DAY_KEYS_SUN_FIRST[new Date().getDay()] ?? "sun";
}

/** Convert a web href (e.g. "/pubs/kolkata/foo" or "/events/12") into an
 *  expo-router navigation. We only need the leading id/segment for detail. */
function navigateFromHref(href: string, opts?: { book?: boolean }) {
  if (!href) return;
  const bookQs = opts?.book ? "?book=1" : "";
  // Event detail: /events/:id or slugged /events/:city/:slug — push by id when numeric.
  const eventMatch = href.match(/\/events\/(\d+)/);
  if (eventMatch) {
    router.push(`/event/${eventMatch[1]}${bookQs}` as never);
    return;
  }
  const gameMatch = href.match(/\/game-organizers\/([^/]+)/);
  if (gameMatch) {
    router.push(`/game-organizers/${gameMatch[1]}` as never);
    return;
  }
  const orgMatch = href.match(/\/organizer-events\/([^/]+)/);
  if (orgMatch) {
    router.push(`/organizer-events/${orgMatch[1]}` as never);
    return;
  }
  if (href === "/pub-offers") {
    router.push("/pub-offers" as never);
    return;
  }
  // Default: pubs land on explore.
  router.push("/(tabs)/explore" as never);
}

function TonightStatusBadge({ item, contextLabel }: { item: TonightItem; contextLabel: string }) {
  const live = item.bucket === "now";
  if (live) {
    return (
      <View style={[styles.statusBadge, { backgroundColor: "#dc2626" }]}>
        <View style={styles.liveDot} />
        <Text style={[styles.statusText, { color: "#fff" }]}>Live Now</Text>
      </View>
    );
  }
  if (item.bucket === "soon") {
    return (
      <View style={[styles.statusBadge, { backgroundColor: "rgba(245,194,64,0.95)" }]}>
        <Ionicons name="flash" size={10} color="#000" />
        <Text style={[styles.statusText, { color: "#000" }]}>{item.startTime || "Soon"}</Text>
      </View>
    );
  }
  // Neutral fallback so every card reserves the same badge-row height. Shows
  // "Tonight" when browsing today, or the selected day's name otherwise — a
  // non-today query never carries a "now"/"soon" bucket (see push()), so this
  // is the only badge every non-today card gets.
  return (
    <View style={[styles.statusBadge, { backgroundColor: "rgba(255,255,255,0.1)" }]}>
      <Ionicons name="sparkles" size={10} color="rgba(255,255,255,0.7)" />
      <Text style={[styles.statusText, { color: "rgba(255,255,255,0.7)" }]}>{contextLabel}</Text>
    </View>
  );
}

function TonightCard({ item, contextLabel }: { item: TonightItem; contextLabel: string }) {
  const colors = useColors();
  const loc = item.city ? `${item.city}${item.state ? ", " + item.state : ""}` : "";
  const bookOnPress = item.kind === "game" ? undefined : () => navigateFromHref(item.href, { book: true });

  // Offer & happy-hour items use the premium VIP offer card (matching the
  // Happy Hour page cards); every other kind keeps its photo card.
  if (item.kind === "happyhour" || item.kind === "offer") {
    const isExclusive = item.category === "exclusive";
    const theme = item.kind === "happyhour" ? OFFER_THEMES.free : isExclusive ? OFFER_THEMES.exclusive : OFFER_THEMES.food;
    const timeLabel = item.startTime ? `${item.startTime}${item.endTime ? ` – ${item.endTime}` : ""}` : contextLabel;
    return (
      <View style={styles.tonightTile}>
        <NightlifeOfferCard
          hideImage
          theme={theme}
          onPress={() => navigateFromHref(item.href)}
          onBook={bookOnPress}
          title={item.subtitle}
          venueName={item.title}
          offerLabel={item.dealLabel?.trim() || (item.kind === "happyhour" ? "Happy Hour" : isExclusive ? "Exclusive Offer" : "Special Offer")}
          offerEyebrow={item.kind === "happyhour" ? "Enjoy" : isExclusive ? "Exclusive" : "Deal"}
          offerIcon={isExclusive ? "sparkles" : "wine-outline"}
          location={loc || contextLabel}
          statusBadge={
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <TonightStatusBadge item={item} contextLabel={contextLabel} />
              <GuestTypeBadge gender={item.gender} />
            </View>
          }
        >
          <View style={styles.row}>
            <Ionicons name="time-outline" size={12} color={theme.accent} />
            <Text style={styles.timeText} numberOfLines={1}>{timeLabel}</Text>
          </View>
        </NightlifeOfferCard>
      </View>
    );
  }

  return (
    <View style={styles.tonightTile}>
      <NightlifeOfferCard
        onPress={() => navigateFromHref(item.href)}
        onBook={bookOnPress}
        imageUrl={item.imageUrl}
        imageHeight={120}
        title={item.title}
        venueName={item.subtitle}
        offerLabel={item.dealLabel && item.dealLabel !== item.title ? item.dealLabel : undefined}
        offerIcon="wine-outline"
        location={loc || contextLabel}
        statusBadge={<TonightStatusBadge item={item} contextLabel={contextLabel} />}
      >
        {item.rating > 0 && (
          <View style={styles.row}>
            <Ionicons name="star" size={12} color="#f59e0b" />
            <Text style={[styles.timeText, { color: "#f59e0b" }]}>{item.rating.toFixed(1)}</Text>
          </View>
        )}
      </NightlifeOfferCard>
    </View>
  );
}

export function HappeningTonight() {
  const colors = useColors();
  const { selectedCity } = useSelectedCity();
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedDay, setSelectedDay] = useState(todayDayKey());
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [offerPickerOpen, setOfferPickerOpen] = useState(false);
  const [pick, setPick] = useState<TonightItem | null>(null);

  const { data } = useQuery({
    queryKey: ["happening-tonight", selectedCity, selectedDay],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedCity) params.set("city", selectedCity);
      params.set("day", selectedDay);
      return customFetch<TonightResponse>(`/api/happening-tonight?${params.toString()}`);
    },
    staleTime: 60_000,
  });

  const isToday = selectedDay === todayDayKey();
  const selectedDayLabel = DAY_OPTIONS.find((d) => d.key === selectedDay)?.label ?? "Today";
  const selectedOfferLabel = OFFER_TYPE_OPTIONS.find((o) => o.key === activeFilter)?.label;
  // Card badges/fallbacks say "Tonight" when browsing today, or the picked
  // day's name otherwise (a non-today query never carries a live now/soon
  // bucket, so cards must not still claim to be "Tonight").
  const contextLabel = isToday ? "Tonight" : selectedDayLabel;

  const allItems = useMemo(() => {
    if (!data) return [] as TonightItem[];
    const seen = new Set<string>();
    const out: TonightItem[] = [];
    for (const it of [...data.tonightNearYou, ...data.happeningNow, ...data.startingSoon, ...data.lastMinuteDeals]) {
      if (seen.has(it.key)) continue;
      seen.add(it.key);
      out.push(it);
    }
    return out.sort((a, b) => b.score - a.score);
  }, [data]);

  const filtered = useMemo(() => {
    // "All Tonight": a pub/club/bar venue card only qualifies when an offer is
    // actually shown on the card (a deal label). The venue's own offer and
    // happy-hour cards always carry a label, so they still surface; bare venue
    // cards with nothing on them are hidden. Other experiences are unaffected.
    if (activeFilter === "all") return allItems.filter((i) => i.kind !== "pub" || !!i.dealLabel);
    // Events: organiser live events (tagged "live") + any event-kind item.
    if (activeFilter === "event") return allItems.filter((i) => i.kind === "event" || i.filters.includes("live"));
    // Starting Soon: offers/events that begin within the next few hours and
    // have not started yet — the backend "soon" bucket drops items once live.
    if (activeFilter === "soon") return allItems.filter((i) => i.bucket === "soon");
    return allItems.filter((i) => i.filters.includes(activeFilter));
  }, [allItems, activeFilter]);

  const recommend = () => {
    if (allItems.length === 0) return;
    const top = allItems.slice(0, Math.min(5, allItems.length));
    setPick(top[Math.floor(Math.random() * top.length)] ?? top[0]!);
  };

  if (!data || allItems.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>REAL-TIME DISCOVERY</Text>
          <Text style={[styles.heading, { color: colors.foreground }]}>🔥 Happening Tonight</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {isToday
              ? data.counts.now > 0
                ? `${data.counts.now} live now · ${data.counts.soon} starting soon${selectedCity ? ` near ${selectedCity}` : ""}`
                : `${allItems.length} experiences tonight${selectedCity ? ` near ${selectedCity}` : ""}`
              : `${allItems.length} deals on ${selectedDayLabel}${selectedCity ? ` near ${selectedCity}` : ""}`}
          </Text>
        </View>
      </View>

      <Pressable onPress={recommend} style={[styles.recommendBtn, { backgroundColor: colors.primary }]}>
        <Ionicons name="sparkles" size={15} color={colors.primaryForeground} />
        <Text style={[styles.recommendText, { color: colors.primaryForeground }]}>What Should I Do Tonight?</Text>
      </Pressable>

      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        renderItem={({ item: f }) => {
          const active = activeFilter === f.key;
          return (
            <Pressable
              onPress={() => setActiveFilter(f.key)}
              style={[
                styles.chip,
                { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.muted },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{f.label}</Text>
            </Pressable>
          );
        }}
      />

      {/* Day filter + Offers dropdowns */}
      <View style={styles.dropdownRow}>
        <Pressable
          onPress={() => setDayPickerOpen(true)}
          style={[styles.dropdownTrigger, { borderColor: isToday ? colors.border : colors.primary, backgroundColor: isToday ? colors.muted : colors.primary + "18" }]}
        >
          <Ionicons name="calendar-outline" size={13} color={isToday ? colors.mutedForeground : colors.primary} />
          <Text style={[styles.dropdownText, { color: isToday ? colors.mutedForeground : colors.primary }]} numberOfLines={1}>
            {isToday ? "Day: Today" : selectedDayLabel}
          </Text>
          <Ionicons name="chevron-down" size={13} color={isToday ? colors.mutedForeground : colors.primary} />
        </Pressable>

        <Pressable
          onPress={() => setOfferPickerOpen(true)}
          style={[styles.dropdownTrigger, { borderColor: selectedOfferLabel ? colors.primary : colors.border, backgroundColor: selectedOfferLabel ? colors.primary + "18" : colors.muted }]}
        >
          <Ionicons name="wine-outline" size={13} color={selectedOfferLabel ? colors.primary : colors.mutedForeground} />
          <Text style={[styles.dropdownText, { color: selectedOfferLabel ? colors.primary : colors.mutedForeground }]} numberOfLines={1}>
            {selectedOfferLabel ?? "Offers"}
          </Text>
          <Ionicons name="chevron-down" size={13} color={selectedOfferLabel ? colors.primary : colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Day picker modal */}
      <Modal visible={dayPickerOpen} animationType="fade" transparent onRequestClose={() => setDayPickerOpen(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setDayPickerOpen(false)}>
          <Pressable style={[styles.pickerCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Browse by day</Text>
            {DAY_OPTIONS.map((d) => {
              const active = selectedDay === d.key;
              return (
                <Pressable
                  key={d.key}
                  onPress={() => { setSelectedDay(d.key); setDayPickerOpen(false); }}
                  style={[styles.pickerOption, { borderColor: colors.border }]}
                >
                  <Text style={[styles.pickerOptionText, { color: active ? colors.primary : colors.foreground, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular" }]}>
                    {d.label}{d.key === todayDayKey() ? " (Today)" : ""}
                  </Text>
                  {active && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Offers picker modal */}
      <Modal visible={offerPickerOpen} animationType="fade" transparent onRequestClose={() => setOfferPickerOpen(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setOfferPickerOpen(false)}>
          <Pressable style={[styles.pickerCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Offer type</Text>
            <Pressable
              onPress={() => { setActiveFilter("all"); setOfferPickerOpen(false); }}
              style={[styles.pickerOption, { borderColor: colors.border }]}
            >
              <Text style={[styles.pickerOptionText, { color: !selectedOfferLabel ? colors.primary : colors.foreground, fontFamily: !selectedOfferLabel ? "Inter_700Bold" : "Inter_400Regular" }]}>
                All Offers
              </Text>
              {!selectedOfferLabel && <Ionicons name="checkmark" size={16} color={colors.primary} />}
            </Pressable>
            {OFFER_TYPE_OPTIONS.map((o) => {
              const active = activeFilter === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => { setActiveFilter(o.key); setOfferPickerOpen(false); }}
                  style={[styles.pickerOption, { borderColor: colors.border }]}
                >
                  <Text style={[styles.pickerOptionText, { color: active ? colors.primary : colors.foreground, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular" }]}>
                    {o.label}
                  </Text>
                  {active && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {filtered.length > 0 ? (
        <FlatList
          horizontal
          data={filtered}
          keyExtractor={(it) => it.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardRow}
          renderItem={({ item }) => <TonightCard item={item} contextLabel={contextLabel} />}
        />
      ) : (
        <View style={[styles.empty, { borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Nothing in this category right now — try another filter.</Text>
        </View>
      )}

      {/* Recommendation modal */}
      <Modal visible={!!pick} animationType="fade" transparent onRequestClose={() => setPick(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPick(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.primary + "55" }]} onPress={() => {}}>
            <View style={styles.modalImage}>
              {pick?.imageUrl ? (
                <Image source={{ uri: resolveImageUrl(pick.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: colors.muted }]}>
                  <Ionicons name="sparkles" size={36} color={colors.primary + "66"} />
                </View>
              )}
              <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={StyleSheet.absoluteFill} />
              <Pressable onPress={() => setPick(null)} style={styles.modalClose}>
                <Ionicons name="close" size={18} color="#fff" />
              </Pressable>
              <View style={styles.modalImageFooter}>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>TONIGHT'S PICK FOR YOU</Text>
                <Text style={styles.modalTitle} numberOfLines={2}>{pick?.title}</Text>
              </View>
            </View>
            <View style={styles.modalBody}>
              <View style={styles.modalMeta}>
                {pick?.startTime ? (
                  <View style={styles.footerLeft}>
                    <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
                    <Text style={[styles.footerText, { color: colors.mutedForeground }]}>{pick.startTime}</Text>
                  </View>
                ) : null}
                {pick?.city ? (
                  <View style={styles.footerLeft}>
                    <Ionicons name="location-outline" size={14} color={colors.primary} />
                    <Text style={[styles.footerText, { color: colors.mutedForeground }]}>{pick.city}</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => { if (pick) { navigateFromHref(pick.href); setPick(null); } }}
                  style={[styles.modalCta, { backgroundColor: colors.primary, flex: 1 }]}
                >
                  <Text style={[styles.recommendText, { color: colors.primaryForeground }]}>Book this</Text>
                  <Ionicons name="arrow-forward" size={15} color={colors.primaryForeground} />
                </Pressable>
                <Pressable onPress={recommend} style={[styles.modalCta, { borderWidth: 1, borderColor: colors.border }]}>
                  <Text style={[styles.recommendText, { color: colors.foreground }]}>Surprise me</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 12, paddingTop: 8 },
  header: { paddingHorizontal: 20, flexDirection: "row", alignItems: "flex-end" },
  eyebrow: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.6, marginBottom: 4 },
  heading: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  recommendBtn: { marginHorizontal: 20, marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 12 },
  recommendText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  chipRow: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  dropdownRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, marginBottom: 4 },
  dropdownTrigger: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  dropdownText: { flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  pickerCard: { width: "100%", maxWidth: 360, borderRadius: 20, borderWidth: 1, padding: 8 },
  pickerTitle: { fontSize: 13, fontFamily: "Inter_700Bold", padding: 12, paddingBottom: 6 },
  pickerOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth },
  pickerOptionText: { fontSize: 14 },
  cardRow: { paddingLeft: 20, paddingRight: 8, gap: 12 },
  tonightTile: { width: 300 },
  row: { flexDirection: "row", alignItems: "center", gap: 5 },
  timeText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)" },
  statusBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  statusText: { fontSize: 9, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  footerLeft: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  footerText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  empty: { marginHorizontal: 20, marginTop: 8, borderRadius: 16, borderWidth: 1, padding: 24, alignItems: "center" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 24, borderWidth: 1, overflow: "hidden" },
  modalImage: { height: 190, position: "relative" },
  modalClose: { position: "absolute", top: 12, right: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  modalImageFooter: { position: "absolute", left: 16, right: 16, bottom: 12 },
  modalTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 27 },
  modalBody: { padding: 18, gap: 14 },
  modalMeta: { flexDirection: "row", gap: 16 },
  modalCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16 },
});
