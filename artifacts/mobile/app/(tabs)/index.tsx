import { Ionicons } from "@expo/vector-icons";
import {
  customFetch,
  useListEvents,
  useListFeaturedEvents,
} from "@workspace/api-client-react";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { EventCard } from "@/components/EventCard";
import { useColors } from "@/hooks/useColors";

const CATEGORIES = ["All", "Wedding", "Corporate", "Birthday", "Festival", "Concert", "Pubs"];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = React.useState("All");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

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
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't get a response. Please try again." }]);
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

    {/* AI Chat FAB */}
    <TouchableOpacity
      style={[styles.fab, { backgroundColor: colors.primary, bottom: Platform.OS === "web" ? 90 : 110 }]}
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
              <Text style={[styles.chatTitle, { color: colors.foreground }]}>Roy — Nightlife AI</Text>
              <Text style={[styles.chatSub, { color: "#22c55e" }]}>● Online</Text>
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
              <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 18 }}>Hey! I'm Roy 👋</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 21 }}>
                Your personal nightlife assistant. Ask me about pubs, events, prices, or anything about the Indian nightlife scene!
              </Text>
              {["Best pubs in Bandra?", "Events this weekend?", "Couple-friendly venues?"].map((q) => (
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
              placeholder="Ask Roy anything..."
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
});
