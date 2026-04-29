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

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "");
}

function stripInlineTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).trim();
}

type BlockType = "h1" | "h2" | "h3" | "p" | "li" | "blockquote" | "text";

interface HtmlBlock {
  type: BlockType;
  text: string;
}

function parseHtmlBlocks(html: string): HtmlBlock[] {
  const blocks: HtmlBlock[] = [];

  const br = html.replace(/<br\s*\/?>/gi, "\n");

  const blockRegex =
    /<(h1|h2|h3|p|li|blockquote)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  let hasBlocks = false;

  while ((match = blockRegex.exec(br)) !== null) {
    hasBlocks = true;
    const tag = match[1].toLowerCase() as BlockType;
    const text = stripInlineTags(match[2]);
    if (text) blocks.push({ type: tag, text });
  }

  if (!hasBlocks) {
    const plain = stripInlineTags(br);
    if (plain) {
      plain
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((line) => {
          const isH = line.startsWith("# ") || line.startsWith("## ");
          blocks.push({
            type: isH ? (line.startsWith("# ") ? "h1" : "h2") : "p",
            text: line.replace(/^#{1,2}\s/, ""),
          });
        });
    }
  }

  return blocks;
}

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

  const blocks = parseHtmlBlocks(blog.content);
  const heroHeight = Math.round((width / 16) * 7);

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
          {/* Back button overlaid on image */}
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

      {/* Header / cover */}
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

        {blog.excerpt && (
          <Text style={[styles.excerpt, { color: colors.mutedForeground }]}>{blog.excerpt}</Text>
        )}
      </View>

      {/* Divider */}
      <View style={[styles.headerDivider, { borderBottomColor: colors.border }]} />

      {/* Content rendered from HTML */}
      <View style={styles.content}>
        {blocks.map((block, idx) => {
          if (block.type === "h1") {
            return (
              <Text key={idx} style={[styles.h1, { color: colors.foreground }]}>{block.text}</Text>
            );
          }
          if (block.type === "h2") {
            return (
              <Text key={idx} style={[styles.h2, { color: colors.foreground }]}>{block.text}</Text>
            );
          }
          if (block.type === "h3") {
            return (
              <Text key={idx} style={[styles.h3, { color: colors.foreground }]}>{block.text}</Text>
            );
          }
          if (block.type === "li") {
            return (
              <View key={idx} style={styles.liRow}>
                <Text style={[styles.liBullet, { color: colors.primary }]}>•</Text>
                <Text style={[styles.li, { color: colors.mutedForeground }]}>{block.text}</Text>
              </View>
            );
          }
          if (block.type === "blockquote") {
            return (
              <View key={idx} style={[styles.blockquote, { borderLeftColor: colors.primary, backgroundColor: colors.muted }]}>
                <Text style={[styles.blockquoteText, { color: colors.mutedForeground }]}>{block.text}</Text>
              </View>
            );
          }
          return (
            <Text key={idx} style={[styles.para, { color: colors.mutedForeground }]}>{block.text}</Text>
          );
        })}
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
  excerpt: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 23, fontStyle: "italic" },
  headerDivider: { borderBottomWidth: 1, marginHorizontal: 24, marginBottom: 20 },
  content: { paddingHorizontal: 24, gap: 14 },
  h1: { fontSize: 24, fontFamily: "Inter_700Bold", lineHeight: 32, marginTop: 12 },
  h2: { fontSize: 20, fontFamily: "Inter_700Bold", lineHeight: 28, marginTop: 10 },
  h3: { fontSize: 17, fontFamily: "Inter_600SemiBold", lineHeight: 24, marginTop: 8 },
  para: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 26 },
  liRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  liBullet: { fontSize: 16, lineHeight: 26, fontFamily: "Inter_700Bold" },
  li: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 26 },
  blockquote: { borderLeftWidth: 3, paddingLeft: 14, paddingVertical: 8, paddingRight: 10, borderRadius: 4 },
  blockquoteText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22, fontStyle: "italic" },
  divider: { borderTopWidth: 1, marginHorizontal: 24, marginTop: 32 },
  backLink: { fontSize: 14, fontFamily: "Inter_500Medium" },
  backBtnFull: { marginTop: 20, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12 },
});
