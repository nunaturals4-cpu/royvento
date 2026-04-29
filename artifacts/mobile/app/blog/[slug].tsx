import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
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
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
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

export default function BlogDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const { data: blog, isLoading, error } = useQuery<Blog>({
    queryKey: ["blog", slug],
    queryFn: () => customFetch<Blog>(`/api/blogs/${slug}`),
    enabled: !!slug,
  });

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (error || !blog) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.destructive} />
        <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 12 }}>Article Not Found</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 8 }}>
          This article may have been removed or doesn't exist.
        </Text>
        <Pressable
          style={[styles.backBtnFull, { backgroundColor: colors.primary }]}
          onPress={() => router.back()}
        >
          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const paragraphs = blog.content.split(/\n+/).filter((p) => p.trim().length > 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }}
    >
      {/* Cover */}
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={[styles.cover, { paddingTop: topPadding + 16 }]}
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <View style={[styles.backCircle, { backgroundColor: colors.muted }]}>
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </View>
        </Pressable>

        {blog.category && (
          <Text style={[styles.category, { color: colors.primary }]}>{blog.category.toUpperCase()}</Text>
        )}
        <Text style={[styles.title, { color: colors.foreground }]}>{blog.title}</Text>

        <View style={styles.metaRow}>
          {blog.author && (
            <View style={styles.metaItem}>
              <Ionicons name="person-outline" size={13} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{blog.author}</Text>
            </View>
          )}
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={13} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {formatDate(blog.publishedAt ?? blog.createdAt)}
            </Text>
          </View>
        </View>

        {blog.excerpt && (
          <Text style={[styles.excerpt, { color: colors.mutedForeground }]}>{blog.excerpt}</Text>
        )}
      </LinearGradient>

      {/* Content */}
      <View style={styles.content}>
        {paragraphs.map((para, idx) => {
          const isHeading = para.startsWith("## ") || para.startsWith("# ");
          const text = para.replace(/^#{1,2}\s/, "");
          return (
            <Text
              key={idx}
              style={[
                isHeading ? styles.paraHeading : styles.para,
                { color: isHeading ? colors.foreground : colors.mutedForeground },
              ]}
            >
              {text}
            </Text>
          );
        })}
      </View>

      {/* Footer divider */}
      <View style={[styles.divider, { borderTopColor: colors.border }]} />
      <Pressable
        style={{ alignItems: "center", padding: 20 }}
        onPress={() => router.back()}
      >
        <Text style={[styles.backLink, { color: colors.primary }]}>← Back to Blog</Text>
      </Pressable>

      <MobileFooter />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cover: { paddingHorizontal: 24, paddingBottom: 28, gap: 10 },
  backBtn: { alignSelf: "flex-start" },
  backCircle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  category: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.2, marginTop: 8 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", lineHeight: 34 },
  metaRow: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  excerpt: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 23, fontStyle: "italic" },
  content: { paddingHorizontal: 24, gap: 16, marginTop: 8 },
  para: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 26 },
  paraHeading: { fontSize: 19, fontFamily: "Inter_700Bold", lineHeight: 28, marginTop: 8 },
  divider: { borderTopWidth: 1, marginHorizontal: 24, marginTop: 32 },
  backLink: { fontSize: 14, fontFamily: "Inter_500Medium" },
  backBtnFull: { marginTop: 20, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12 },
});
