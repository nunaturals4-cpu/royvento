import { Ionicons } from "@expo/vector-icons";
import {
  useListEvents,
  useListFeaturedEvents,
} from "@workspace/api-client-react";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EventCard } from "@/components/EventCard";
import { useColors } from "@/hooks/useColors";

const CATEGORIES = ["All", "Wedding", "Corporate", "Birthday", "Festival", "Concert", "Pubs"];

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = React.useState("All");

  const featured = useListFeaturedEvents();
  const popular = useListEvents({ category: "Pubs" });
  const allEvents = useListEvents({
    category: category === "All" ? undefined : category,
  });

  const isLoading = featured.isLoading && popular.isLoading;
  const onRefresh = () => {
    featured.refetch();
    popular.refetch();
    allEvents.refetch();
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
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
          <View>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
              Good evening
            </Text>
            <Text style={[styles.heroTitle, { color: colors.foreground }]}>
              Discover{" "}
              <Text style={{ color: colors.primary }}>Events</Text>
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/(tabs)/explore")}
            style={[styles.searchBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
          >
            <Ionicons name="search" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </LinearGradient>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            onPress={() => setCategory(cat)}
            style={[
              styles.chip,
              {
                backgroundColor: category === cat ? colors.primary : colors.muted,
                borderColor: category === cat ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: category === cat ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {cat}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Featured */}
      {(featured.data?.length ?? 0) > 0 && (
        <Section title="Featured Events" onSeeAll={() => router.push("/(tabs)/explore")}>
          <FlatList
            horizontal
            data={featured.data}
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
              />
            )}
          />
        </Section>
      )}

      {/* Popular Pubs */}
      {(popular.data?.length ?? 0) > 0 && (
        <Section title="Popular Pubs" onSeeAll={() => router.push({ pathname: "/(tabs)/explore", params: { type: "pub" } })}>
          <FlatList
            horizontal
            data={popular.data}
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
              />
            )}
          />
        </Section>
      )}

      {/* All / Filtered events */}
      <Section title={category === "All" ? "All Events" : category} icon="grid-outline">
        {allEvents.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ margin: 24 }} />
        ) : (allEvents.data?.length ?? 0) === 0 ? (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>
            No events found
          </Text>
        ) : (
          <View style={styles.grid}>
            {allEvents.data!.map((item) => (
              <EventCard
                key={item.id}
                id={item.id}
                title={item.title}
                imageUrl={item.imageUrl}
                location={item.location}
                price={item.price}
                category={item.category}
                type={item.type}
                compact
                style={{ width: "100%" }}
              />
            ))}
          </View>
        )}
      </Section>

      <View style={{ height: Platform.OS === "web" ? 34 : 100 }} />
    </ScrollView>
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
            <Text style={[styles.seeAll, { color: colors.primary }]}>See all</Text>
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
  },
  heroInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  greeting: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 2,
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
  chips: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
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
  grid: {
    paddingHorizontal: 20,
    gap: 10,
  },
  empty: {
    textAlign: "center",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 20,
  },
});
