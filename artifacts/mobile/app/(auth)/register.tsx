import { Ionicons } from "@expo/vector-icons";
import { useRegister } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import { getEmailError, getPasswordError } from "@workspace/validators";
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
  const { returnTo: rawReturnTo, email: rawPrefillEmail } = useLocalSearchParams<{ returnTo?: string; email?: string }>();
  const returnTo = typeof rawReturnTo === "string" && rawReturnTo.startsWith("/") ? rawReturnTo : undefined;
  const prefillEmail = typeof rawPrefillEmail === "string" ? rawPrefillEmail : "";
  const [name, setName] = useState("");
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const registerMutation = useRegister({
    mutation: {
      onSuccess: async (_data, variables) => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPendingEmail((variables as any)?.data?.email ?? email);
      },
      onError: (err: any) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const status = err?.status;
        const serverMsg = err?.data?.error ?? err?.message ?? "";
        const fe: Record<string, string> = err?.data?.fieldErrors ?? err?.fieldErrors ?? {};
        if (Object.keys(fe).length > 0) {
          setErrors((p) => ({ ...p, ...(fe.name ? { name: fe.name } : {}), ...(fe.email ? { email: fe.email } : {}), ...(fe.password ? { password: fe.password } : {}) }));
          if (fe.name) nameRef.current?.focus();
          else if (fe.email) emailRef.current?.focus();
          else if (fe.password) passwordRef.current?.focus();
          return;
        }
        const isDuplicate = status === 409 || /already in use|already exists/i.test(serverMsg);
        if (isDuplicate) {
          setErrors((p) => ({
            ...p,
            email: "An account with this email already exists. Tap “Sign In” below to log in.",
          }));
          emailRef.current?.focus();
        } else {
          Alert.alert(t("auth.registration_failed"), serverMsg || t("common.error"));
        }
      },
    },
  });

  const handleRegister = () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Name is required.";
    const emailErr = getEmailError(email);
    if (emailErr) next.email = emailErr;
    const pwErr = getPasswordError(password);
    if (pwErr) next.password = pwErr;
    setErrors(next);
    if (next.name) { nameRef.current?.focus(); return; }
    if (next.email) { emailRef.current?.focus(); return; }
    if (next.password) { passwordRef.current?.focus(); return; }
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
            <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: errors.name ? colors.destructive : colors.border }]}>
              <Ionicons name="person-outline" size={16} color={colors.mutedForeground} />
              <TextInput
                ref={nameRef}
                style={[styles.input, { color: colors.foreground }]}
                value={name}
                onChangeText={(v) => { setName(v); if (errors.name) setErrors((p) => ({ ...p, name: undefined })); }}
                placeholder={t("auth.name_placeholder")}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="default"
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
            {errors.name ? <Text style={[styles.errorText, { color: colors.destructive }]}>{errors.name}</Text> : null}
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>{t("auth.email")}</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: errors.email ? colors.destructive : colors.border }]}>
              <Ionicons name="mail-outline" size={16} color={colors.mutedForeground} />
              <TextInput
                ref={emailRef}
                style={[styles.input, { color: colors.foreground }]}
                value={email}
                onChangeText={(v) => { setEmail(v); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); }}
                placeholder={t("auth.email_placeholder")}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {errors.email ? <Text style={[styles.errorText, { color: colors.destructive }]}>{errors.email}</Text> : null}
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>{t("auth.password")}</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: errors.password ? colors.destructive : colors.border }]}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.mutedForeground} />
              <TextInput
                ref={passwordRef}
                style={[styles.input, { color: colors.foreground }]}
                value={password}
                onChangeText={(v) => { setPassword(v); if (errors.password) setErrors((p) => ({ ...p, password: undefined })); }}
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
            {errors.password ? <Text style={[styles.errorText, { color: colors.destructive }]}>{errors.password}</Text> : null}
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
          <Pressable
            onPress={() => {
              const params: Record<string, string> = {};
              if (returnTo) params.returnTo = returnTo;
              if (email.trim()) params.email = email.trim();
              router.push(
                Object.keys(params).length > 0
                  ? { pathname: "/(auth)/login", params }
                  : "/(auth)/login",
              );
            }}
          >
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
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
