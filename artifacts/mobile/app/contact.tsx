import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import { getEmailError, getIndianPhoneError, normalizeIndianPhone } from "@workspace/validators";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
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
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const SUPPORT_EMAIL = "support@royvento.com";
const SUPPORT_PHONE = "+91 9875554165";

export default function ContactScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; phone?: string; subject?: string; message?: string }>({});
  const fieldRefs = useRef<Record<string, TextInput | null>>({});

  async function handleSubmit() {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Name is required.";
    const emailErr = getEmailError(email);
    if (emailErr) next.email = emailErr;
    const phoneErr = getIndianPhoneError(phone, { required: false });
    if (phoneErr) next.phone = phoneErr;
    if (!subject.trim()) next.subject = "Subject is required.";
    if (!message.trim()) next.message = "Message is required.";
    setErrors(next);
    const order: Array<keyof typeof next> = ["name", "email", "phone", "subject", "message"];
    for (const key of order) {
      if (next[key]) { fieldRefs.current[key]?.focus(); return; }
    }
    setLoading(true);
    try {
      await customFetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() ? normalizeIndianPhone(phone) : "",
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      Alert.alert("Message sent", "Thanks for reaching out! We'll get back to you within 24 hours.");
      setSubject("");
      setMessage("");
      setPhone("");
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert("Error", err?.message ?? "Unable to send message. Please try again or email us directly.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[colors.card, colors.background]}
          style={[styles.header, { paddingTop: topPadding + 16 }]}
        >
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>Contact & Help</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>We're here to help, reach us anytime</Text>
        </LinearGradient>

        <View style={styles.content}>
          {/* Contact Info */}
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Get in Touch</Text>
            <TouchableOpacity
              style={styles.infoRow}
              onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
            >
              <View style={[styles.infoIcon, { backgroundColor: colors.primary + "20" }]}>
                <Ionicons name="mail-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Email Support</Text>
                <Text style={[styles.infoValue, { color: colors.primary }]}>{SUPPORT_EMAIL}</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={styles.infoRow}
              onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`)}
            >
              <View style={[styles.infoIcon, { backgroundColor: colors.primary + "20" }]}>
                <Ionicons name="call-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Phone Support</Text>
                <Text style={[styles.infoValue, { color: colors.primary }]}>{SUPPORT_PHONE}</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: colors.primary + "20" }]}>
                <Ionicons name="time-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Support Hours</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>Mon–Sat, 10am–7pm IST</Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: colors.primary + "20" }]}>
                <Ionicons name="location-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Find Us</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>Kolkata, West Bengal</Text>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground, marginTop: 1 }]}>India</Text>
              </View>
            </View>
          </View>

          {/* What we can help with */}
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>We'd love to hear from you</Text>
            {[
              { title: "Support", desc: "Issues with bookings, payments or your account" },
              { title: "Partnerships", desc: "List your venue or explore business opportunities" },
              { title: "Feedback", desc: "Tell us how we can improve Royvento for you" },
            ].map((c) => (
              <View key={c.title} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                <View style={[styles.blurbDot, { backgroundColor: colors.primary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{c.title}</Text>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 }}>{c.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Contact Form */}
          <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Send a Message</Text>

            {([
              { key: "name" as const, label: "Your Name", value: name, set: setName, placeholder: "John Doe", keyboard: "default" as const },
              { key: "email" as const, label: "Email Address", value: email, set: setEmail, placeholder: "you@example.com", keyboard: "email-address" as const },
              { key: "phone" as const, label: "Phone (optional)", value: phone, set: setPhone, placeholder: "10-digit Indian mobile", keyboard: "phone-pad" as const },
              { key: "subject" as const, label: "Subject", value: subject, set: setSubject, placeholder: "How can we help?", keyboard: "default" as const },
            ]).map((f) => (
              <View key={f.key} style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                <TextInput
                  ref={(el) => { fieldRefs.current[f.key] = el; }}
                  style={[styles.fieldInput, { backgroundColor: colors.muted, borderColor: errors[f.key] ? colors.destructive : colors.border, color: colors.foreground }]}
                  value={f.value}
                  onChangeText={(v) => { f.set(v); if (errors[f.key]) setErrors((p) => ({ ...p, [f.key]: undefined })); }}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType={f.keyboard}
                  autoCapitalize={f.keyboard === "email-address" || f.keyboard === "phone-pad" ? "none" : "sentences"}
                  autoCorrect={f.keyboard !== "email-address" && f.keyboard !== "phone-pad"}
                />
                {errors[f.key] ? <Text style={{ fontSize: 12, color: colors.destructive, fontFamily: "Inter_400Regular", marginTop: 4 }}>{errors[f.key]}</Text> : null}
              </View>
            ))}

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Message</Text>
              <TextInput
                ref={(el) => { fieldRefs.current["message"] = el; }}
                style={[styles.fieldInput, styles.textArea, { backgroundColor: colors.muted, borderColor: errors.message ? colors.destructive : colors.border, color: colors.foreground }]}
                value={message}
                onChangeText={(v) => { setMessage(v); if (errors.message) setErrors((p) => ({ ...p, message: undefined })); }}
                placeholder="Describe your issue or question in detail..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
              {errors.message ? <Text style={{ fontSize: 12, color: colors.destructive, fontFamily: "Inter_400Regular", marginTop: 4 }}>{errors.message}</Text> : null}
            </View>

            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: colors.primary }, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Ionicons name="send-outline" size={16} color={colors.primaryForeground} />
                  <Text style={[styles.sendBtnText, { color: colors.primaryForeground }]}>Send Message</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 20, gap: 8 },
  backBtn: { padding: 4, alignSelf: "flex-start" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  content: { padding: 20, gap: 16 },
  infoCard: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 0 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 14 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  infoIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 2 },
  divider: { height: 1, marginVertical: 10 },
  blurbDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  formCard: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 14 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4 },
  fieldInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular" },
  textArea: { height: 120, paddingTop: 12 },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 4 },
  sendBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
