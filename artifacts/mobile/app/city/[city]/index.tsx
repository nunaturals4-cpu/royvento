import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, Redirect } from "expo-router";
import {
  getGetCitySummaryQueryKey,
  useGetCitySummary,
  type VendorSummary,
} from "@workspace/api-client-react";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CrossLinkRail } from "@/components/CrossLinkRail";
import { EventCard } from "@/components/EventCard";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useColors } from "@/hooks/useColors";
import {
  PUB_CATEGORY_SLUGS,
  buildCityFAQs,
  canonicalCitySlug,
  isAliasedCity,
  titleCase,
} from "@/lib/seoSlug";

const THIN_THRESHOLD = 4;

export default function CityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { city: rawCity } = useLocalSearchParams<{ city: string }>();
  const citySlug = canonicalCitySlug(rawCity ?? "");
  const cityName = titleCase(citySlug);
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const { data: summary, isLoading, isError } = useGetCitySummary(citySlug, {
    query: {
      queryKey: getGetCitySummaryQueryKey(citySlug),
      enabled: !!citySlug,
      staleTime: 5 * 60 * 1000,
    },
  });

  if (rawCity && isAliasedCity(rawCity) && rawCity !== citySlug) {
    return <Redirect href={`/city/${citySlug}`} />;
  }

  if (!citySlug) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.mutedForeground }}>Unknown city</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isError || !summary) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 20 }}>
        <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>
          Couldn't load {cityName}. Please try again.
        </Text>
      </View>
    );
  }

  const topPubs = summary.topVendors.slice(0, 10);
  const localities = summary.localityCounts.slice(0, 12).map((l) => ({
    slug: l.slug,
    label: titleCase(l.slug),
  }));
  const isThin = summary.vendorCount < THIN_THRESHOLD;
  const faqs = buildCityFAQs(cityName);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={[styles.header, { paddingTop: topPadding + 12, borderBottomColor: colors.border }]}
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.crumb}>
          <Pressable onPress={() => router.push("/(tabs)")}>
            <Text style={[styles.crumbHome, { color: colors.mutedForeground }]}>Home</Text>
          </Pressable>
          <Ionicons name="chevron-forward" size={11} color={colors.mutedForeground} />
          <Text style={[styles.crumbCurrent, { color: colors.foreground }]}>{cityName}</Text>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 }]}
      >
        <View style={styles.hero}>
          <View style={[styles.heroBadge, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "1A" }]}>
            <Ionicons name="location" size={12} color={colors.primary} />
            <Text style={[styles.heroBadgeText, { color: colors.primary }]}>{cityName} nightlife</Text>
          </View>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>
            Best Pubs in {cityName} — Book a Table Tonight
          </Text>
          <Text style={[styles.heroDesc, { color: colors.mutedForeground }]}>
            Discover {summary.vendorCount || "the best"} verified pubs and party venues in {cityName} on Royvento.
            Filter by rooftop bars, microbreweries, live music or couple-friendly lounges.
            Book a table instantly with today's offers, ladies nights and weekend deals.
          </Text>
        </View>

        {isThin ? (
          <View style={[styles.thinCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.thinTitle, { color: colors.foreground }]}>We're still curating {cityName}</Text>
            <Text style={[styles.thinDesc, { color: colors.mutedForeground }]}>
              Royvento is rolling out across India city by city. Check back soon — or explore all pubs in the meantime.
            </Text>
            <Pressable
              onPress={() => router.push("/(tabs)/pubs")}
              style={[styles.thinCta, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.thinCtaText, { color: colors.primaryForeground }]}>Explore all pubs</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.primaryForeground} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Top {Math.min(10, topPubs.length)} pubs in {cityName}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }}>
              <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 12 }}>
                {topPubs.map((v: VendorSummary) => (
                  <EventCard
                    key={v.id}
                    id={v.id}
                    vendorId={v.id}
                    title={v.businessName}
                    type="pub"
                    location={[v.city, v.state].filter(Boolean).join(", ")}
                    imageUrl={v.bannerImage ?? undefined}
                    rating={v.rating}
                    reviewCount={v.reviewCount}
                    directBooking
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {localities.length > 0 ? (
          <View style={styles.section}>
            <CrossLinkRail
              title={`Localities in ${cityName}`}
              links={localities.map((l) => ({
                href: `/city/${citySlug}/${l.slug}`,
                label: l.label,
              }))}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <CrossLinkRail
            title="Browse by category"
            links={PUB_CATEGORY_SLUGS.map((c) => ({
              href: `/city/${citySlug}/${c.slug}`,
              label: `${c.label} in ${cityName}`,
            }))}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Frequently asked questions</Text>
          <View style={{ gap: 8 }}>
            {faqs.map((f, i) => {
              const open = openFaq === i;
              return (
                <Pressable
                  key={f.question}
                  onPress={() => setOpenFaq(open ? null : i)}
                  style={[styles.faqCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.faqHeader}>
                    <Text style={[styles.faqQuestion, { color: colors.foreground }]}>{f.question}</Text>
                    <Ionicons
                      name={open ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={colors.mutedForeground}
                    />
                  </View>
                  {open ? (
                    <Text style={[styles.faqAnswer, { color: colors.mutedForeground }]}>{f.answer}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <MobileFooter />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  backBtn: { padding: 4, alignSelf: "flex-start" },
  crumb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  crumbHome: { fontSize: 12, fontFamily: "Inter_500Medium" },
  crumbCurrent: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  scroll: { paddingTop: 4 },
  hero: { paddingHorizontal: 20, paddingVertical: 20, gap: 10 },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  heroTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  heroDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  section: { paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  thinCard: {
    marginHorizontal: 20,
    marginVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  thinTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  thinDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 6,
  },
  thinCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  thinCtaText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  faqCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  faqHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 19,
  },
  faqAnswer: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
});
