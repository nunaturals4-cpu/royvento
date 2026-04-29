import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface Blog {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  imageUrl: string | null;
  category: string | null;
  author: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export default function BlogsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery<Blog[]>({
    queryKey: ["blogs"],
    queryFn: () => customFetch<Blog[]>("/api/blogs"),
  });

  const blogs = (data ?? []).filter((b) =>
    !search.trim() ||
    b.title.toLowerCase().includes(search.toLowerCase()) ||
    (b.excerpt ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (b.category ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={[styles.header, { paddingTop: topPadding + 16 }]}
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Blog & Stories</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>Nightlife tips, guides, and stories</Text>

        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search articles..."
            placeholderTextColor={colors.mutedForeground}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : blogs.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="newspaper-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {search ? "No articles found" : "No Blogs Yet"}
          </Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            {search ? "Try a different search" : "Check back soon for nightlife guides"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={blogs}
          keyExtractor={(b) => String(b.id)}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: Platform.OS === "web" ? 60 : 100 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.8 }]}
              onPress={() => router.push({ pathname: "/blog/[slug]", params: { slug: item.slug } })}
            >
              {item.imageUrl ? (
                <View style={[styles.imagePlaceholder, { backgroundColor: colors.muted }]}>
                  <Ionicons name="image-outline" size={28} color={colors.mutedForeground} />
                </View>
              ) : (
                <LinearGradient
                  colors={[colors.primary + "40", colors.card]}
                  style={styles.imagePlaceholder}
                >
                  <Ionicons name="newspaper-outline" size={28} color={colors.primary} />
                </LinearGradient>
              )}
              <View style={styles.cardBody}>
                {item.category && (
                  <Text style={[styles.category, { color: colors.primary }]}>{item.category.toUpperCase()}</Text>
                )}
                <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
                {item.excerpt && (
                  <Text style={[styles.excerpt, { color: colors.mutedForeground }]} numberOfLines={2}>{item.excerpt}</Text>
                )}
                <View style={styles.meta}>
                  {item.author && (
                    <View style={styles.metaItem}>
                      <Ionicons name="person-outline" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{item.author}</Text>
                    </View>
                  )}
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                      {formatDate(item.publishedAt ?? item.createdAt)}
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 18, gap: 8 },
  backBtn: { padding: 4, alignSelf: "flex-start" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  searchBar: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  imagePlaceholder: { height: 140, alignItems: "center", justifyContent: "center" },
  cardBody: { padding: 14, gap: 6 },
  category: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_700Bold", lineHeight: 22 },
  excerpt: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  meta: { flexDirection: "row", gap: 12, marginTop: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
