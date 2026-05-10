import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
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
  useWindowDimensions,
  View,
} from "react-native";
import RenderHtml, { MixedStyleDeclaration } from "react-native-render-html";
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
  tags?: string[] | null;
  author: string | null;
  publishedAt: string | null;
  createdAt: string;
}

const SYSTEM_FONTS = [
  "Inter_400Regular",
  "Inter_500Medium",
  "Inter_600SemiBold",
  "Inter_700Bold",
];

export default function BlogDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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

  const heroHeight = Math.round((width / 16) * 7);
  const contentWidth = width - 48;

  const tagsStyles: Record<string, MixedStyleDeclaration> = {
    body: {
      backgroundColor: "transparent",
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      fontSize: 15,
    } as MixedStyleDeclaration,
    p: {
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      lineHeight: 26,
      marginTop: 0,
      marginBottom: 14,
    } as MixedStyleDeclaration,
    h1: {
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      fontSize: 24,
      lineHeight: 32,
      marginTop: 16,
      marginBottom: 8,
    } as MixedStyleDeclaration,
    h2: {
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      fontSize: 20,
      lineHeight: 28,
      marginTop: 14,
      marginBottom: 6,
    } as MixedStyleDeclaration,
    h3: {
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      fontSize: 17,
      lineHeight: 24,
      marginTop: 12,
      marginBottom: 4,
    } as MixedStyleDeclaration,
    strong: {
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
    } as MixedStyleDeclaration,
    em: {
      fontStyle: "italic",
    } as MixedStyleDeclaration,
    a: {
      color: colors.primary,
      textDecorationLine: "underline",
    } as MixedStyleDeclaration,
    li: {
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      lineHeight: 26,
    } as MixedStyleDeclaration,
    ul: { marginBottom: 14 } as MixedStyleDeclaration,
    ol: { marginBottom: 14 } as MixedStyleDeclaration,
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      paddingLeft: 14,
      marginLeft: 0,
      marginBottom: 14,
      backgroundColor: colors.muted,
      paddingVertical: 8,
      paddingRight: 10,
    } as MixedStyleDeclaration,
    img: { borderRadius: 10 } as MixedStyleDeclaration,
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }}
    >
      {/* Hero image */}
      {blog.imageUrl ? (
        <View style={{ width, height: heroHeight }}>
          <Image
            source={{ uri: blog.imageUrl }}
            style={{ width, height: heroHeight }}
            contentFit="cover"
          />
          <LinearGradient
            colors={["transparent", colors.background]}
            style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: heroHeight * 0.55 }}
          />
          <Pressable
            style={[styles.backBtn, { position: "absolute", top: topPadding + 10, left: 16 }]}
            onPress={() => router.back()}
          >
            <View style={[styles.backCircle, { backgroundColor: colors.muted + "dd" }]}>
              <Ionicons name="arrow-back" size={20} color={colors.foreground} />
            </View>
          </Pressable>
        </View>
      ) : null}

      {/* Header */}
      <View style={[styles.cover, blog.imageUrl ? { paddingTop: 12 } : { paddingTop: topPadding + 16 }]}>
        {!blog.imageUrl && (
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <View style={[styles.backCircle, { backgroundColor: colors.muted }]}>
              <Ionicons name="arrow-back" size={20} color={colors.foreground} />
            </View>
          </Pressable>
        )}

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

        {(blog.tags ?? []).length > 0 ? (
          <View style={styles.tagRow}>
            {(blog.tags ?? []).map((tag) => (
              <View
                key={tag}
                style={[styles.tagChip, { backgroundColor: colors.muted, borderColor: colors.border }]}
              >
                <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {blog.excerpt && (
          <Text style={[styles.excerpt, { color: colors.mutedForeground }]}>{blog.excerpt}</Text>
        )}
      </View>

      {/* Separator */}
      <View style={[styles.headerDivider, { borderBottomColor: colors.border }]} />

      {/* HTML content */}
      <View style={styles.content}>
        <RenderHtml
          contentWidth={contentWidth}
          source={{ html: blog.content }}
          tagsStyles={tagsStyles}
          baseStyle={{
            color: colors.mutedForeground,
            fontFamily: "Inter_400Regular",
            fontSize: 15,
          }}
          systemFonts={SYSTEM_FONTS}
          enableExperimentalMarginCollapsing
        />
      </View>

      {/* Footer */}
      <View style={[styles.divider, { borderTopColor: colors.border }]} />
      <Pressable style={{ alignItems: "center", padding: 20 }} onPress={() => router.back()}>
        <Text style={[styles.backLink, { color: colors.primary }]}>← Back to Blog</Text>
      </Pressable>

      <MobileFooter />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cover: { paddingHorizontal: 24, paddingBottom: 20, gap: 10 },
  backBtn: { alignSelf: "flex-start" },
  backCircle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  category: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.2, marginTop: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", lineHeight: 34 },
  metaRow: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  tagChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 0.3 },
  excerpt: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 23, fontStyle: "italic" },
  headerDivider: { borderBottomWidth: 1, marginHorizontal: 24, marginBottom: 20 },
  content: { paddingHorizontal: 24 },
  divider: { borderTopWidth: 1, marginHorizontal: 24, marginTop: 24 },
  backLink: { fontSize: 14, fontFamily: "Inter_500Medium" },
  backBtnFull: { marginTop: 20, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12 },
});
