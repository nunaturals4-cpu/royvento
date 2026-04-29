import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const CATEGORIES = [
  "Pubs & Bars",
  "Nightclub",
  "Restaurant",
  "Lounge",
  "Rooftop Bar",
  "Live Music Venue",
  "Comedy Club",
  "Other",
];

export default function BecomeVendorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("Pubs & Bars");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!businessName.trim()) {
      Alert.alert("Required", "Please enter your business name.");
      return;
    }
    setSubmitting(true);
    try {
      const message = [
        description.trim(),
        city.trim() ? `City: ${city.trim()}` : "",
        state.trim() ? `State: ${state.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      await customFetch("/api/vendor-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          category,
          message: message || "Partner application",
        }),
      });
      Alert.alert(
        "Application Submitted",
        "Your partner application is under review. You'll be notified once an admin approves it. Your account will be upgraded then.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e: unknown) {
      const err = e as { message?: string };
      const msg = err?.message ?? "";
      if (msg.includes("pending")) {
        Alert.alert("Already Submitted", "You already have a pending partner application. Our team will review it shortly.");
        router.back();
      } else {
        Alert.alert("Error", msg || "Failed to submit application. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* Header */}
        <LinearGradient
          colors={[colors.card, colors.background]}
          style={[styles.header, { paddingTop: topPadding + 20 }]}
        >
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
          <View style={[styles.iconWrap, { backgroundColor: colors.primary + "20" }]}>
            <Ionicons name="business-outline" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>Become a Partner</Text>
          <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
            List your venue on Royvento and reach thousands of nightlife enthusiasts across India.
          </Text>
          <View style={styles.perksRow}>
            {[
              { icon: "trending-up-outline", text: "Grow bookings" },
              { icon: "people-outline", text: "Manage team" },
              { icon: "bar-chart-outline", text: "Analytics" },
            ].map((p) => (
              <View key={p.text} style={[styles.perkChip, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Ionicons name={p.icon as never} size={14} color={colors.primary} />
                <Text style={[styles.perkText, { color: colors.foreground }]}>{p.text}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* Form */}
        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Business Details</Text>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Business Name *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="e.g. The Social Pub, Mumbai"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Category *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: "row", gap: 8, paddingBottom: 4 }}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.categoryChip,
                      { borderColor: category === c ? colors.primary : colors.border, backgroundColor: category === c ? colors.primary : colors.muted },
                    ]}
                    onPress={() => setCategory(c)}
                  >
                    <Text style={[styles.categoryText, { color: category === c ? colors.primaryForeground : colors.mutedForeground }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>City *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
              value={city}
              onChangeText={setCity}
              placeholder="e.g. Mumbai"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>State *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
              value={state}
              onChangeText={setState}
              placeholder="e.g. Maharashtra"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>About Your Venue</Text>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your venue, vibe, what makes it special..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Info Note */}
        <View style={[styles.noteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
            Applications are reviewed within 2–3 business days. You'll receive a notification once approved.
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.primary }, submitting && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Ionicons name="send-outline" size={18} color={colors.primaryForeground} />
              <Text style={[styles.submitText, { color: colors.primaryForeground }]}>Submit Application</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingBottom: 28, alignItems: "center", gap: 10 },
  backBtn: { alignSelf: "flex-start", padding: 4 },
  iconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  heroTitle: { fontSize: 26, fontFamily: "Inter_700Bold", textAlign: "center" },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21, marginBottom: 4 },
  perksRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  perkChip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  perkText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  formCard: { margin: 20, borderRadius: 18, borderWidth: 1, padding: 20, gap: 20 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  field: { gap: 6 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  textarea: { minHeight: 100, paddingTop: 12 },
  categoryChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  categoryText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  noteCard: { marginHorizontal: 20, marginBottom: 20, borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  noteText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  submitBtn: { marginHorizontal: 20, borderRadius: 16, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  submitText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
