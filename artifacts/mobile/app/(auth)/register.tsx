import { Ionicons } from "@expo/vector-icons";
import { useRegister } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
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
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { customFetch } from "@workspace/api-client-react";

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { returnTo: rawReturnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = typeof rawReturnTo === "string" && rawReturnTo.startsWith("/") ? rawReturnTo : undefined;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendBusy, setResendBusy] = useState(false);

  const registerMutation = useRegister({
    mutation: {
      onSuccess: async (_data, variables) => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPendingEmail((variables as any)?.data?.email ?? email);
      },
      onError: (err: Error) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(t("auth.registration_failed"), err?.message ?? t("common.error"));
      },
    },
  });

  const handleRegister = () => {
    if (!name.trim() || !email.trim() || password.length < 6) {
      Alert.alert(t("common.error"), t("auth.fill_all_fields"));
      return;
    }
    registerMutation.mutate({
      data: {
        name: name.trim(),
        email: email.trim(),
        password,
        ...(referralCode.trim() ? { referralCode: referralCode.trim().toUpperCase() } : {}),
      },
    });
  };

  const handleResend = async () => {
    setResendBusy(true);
    try {
      await customFetch("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: pendingEmail }),
        headers: { "Content-Type": "application/json" },
      });
      Alert.alert(t("auth.resend_success"), "");
    } catch {
      Alert.alert(t("auth.resend_error"), "");
    } finally {
      setResendBusy(false);
    }
  };

  // ── Pending verification screen ──
  if (pendingEmail) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.background }}
          contentContainerStyle={[
            styles.container,
            {
              paddingTop: insets.top + (Platform.OS === "web" ? 67 : 24),
              paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 40),
              alignItems: "center",
            },
          ]}
        >
          <View style={styles.header}>
            <LinearGradient
              colors={[colors.primary, colors.goldLight ?? "#e8c050"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoWrap}
            >
              <Ionicons name="mail" size={28} color={colors.primaryForeground} />
            </LinearGradient>
            <Text style={[styles.brand, { color: colors.primary }]}>Royvento</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center" }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground, textAlign: "center" }]}>
              {t("auth.verify_email_title")}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 8 }}>
              {t("auth.verify_email_sub", { email: pendingEmail })}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 20 }}>
              {t("auth.verify_email_hint")}
            </Text>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border }, resendBusy && { opacity: 0.7 }]}
              onPress={handleResend}
              disabled={resendBusy}
            >
              {resendBusy ? (
                <ActivityIndicator color={colors.foreground} />
              ) : (
                <Text style={[styles.btnText, { color: colors.foreground }]}>{t("auth.resend_verification")}</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
              {t("auth.already_have_account")}{" "}
            </Text>
            <Pressable onPress={() => router.push(returnTo ? { pathname: "/(auth)/login", params: { returnTo } } : "/(auth)/login")}>
              <Text style={[styles.link, { color: colors.primary }]}>{t("auth.sign_in_link")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 24),
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 40),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <LinearGradient
            colors={[colors.primary, colors.goldLight ?? "#e8c050"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoWrap}
          >
            <Ionicons name="wine" size={28} color={colors.primaryForeground} />
          </LinearGradient>
          <Text style={[styles.brand, { color: colors.primary }]}>Royvento</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{t("auth.create_account")}</Text>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>{t("auth.full_name")}</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Ionicons name="person-outline" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={name}
                onChangeText={setName}
                placeholder={t("auth.name_placeholder")}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="default"
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>{t("auth.email")}</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Ionicons name="mail-outline" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={email}
                onChangeText={setEmail}
                placeholder={t("auth.email_placeholder")}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>{t("auth.password")}</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={password}
                onChangeText={setPassword}
                placeholder={t("auth.password_min")}
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showPassword}
              />
              <Pressable
                onPress={() => setShowPassword(!showPassword)}
                accessibilityLabel={showPassword ? t("auth.hide_password") : t("auth.show_password")}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={16}
                  color={colors.mutedForeground}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.field}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>{t("auth.referral_code")}</Text>
              <Text style={[styles.label, { color: colors.mutedForeground, opacity: 0.6, textTransform: "none" }]}>{t("auth.optional")}</Text>
            </View>
            <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Ionicons name="gift-outline" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={referralCode}
                onChangeText={(v) => setReferralCode(v.toUpperCase())}
                placeholder="e.g. ROYVENTO50"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
            <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2, fontFamily: "Inter_400Regular" }}>
              {t("auth.referral_earn_note")}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }, registerMutation.isPending && { opacity: 0.7 }]}
            onPress={handleRegister}
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.btnText, { color: colors.primaryForeground }]}>{t("auth.create_account")}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            {t("auth.already_have_account")}{" "}
          </Text>
          <Pressable onPress={() => router.push(returnTo ? { pathname: "/(auth)/login", params: { returnTo } } : "/(auth)/login")}>
            <Text style={[styles.link, { color: colors.primary }]}>{t("auth.sign_in_link")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, gap: 24 },
  header: { alignItems: "center", gap: 8 },
  logoWrap: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  brand: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  card: { borderRadius: 20, borderWidth: 1, padding: 24, gap: 16 },
  cardTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  field: { gap: 6 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  inputWrap: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  btn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  btnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  link: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
