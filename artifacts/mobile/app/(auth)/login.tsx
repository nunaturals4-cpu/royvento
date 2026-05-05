import { Ionicons } from "@expo/vector-icons";
import { customFetch, useLogin } from "@workspace/api-client-react";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
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
import { WebFormWrapper } from "@/components/WebFormWrapper";
import { useLanguage } from "@/context/LanguageContext";
import type { AuthUser } from "@/context/AuthContext";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { t } = useLanguage();
  const { returnTo: rawReturnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = typeof rawReturnTo === "string" && rawReturnTo.startsWith("/") ? rawReturnTo : undefined;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(
    googleClientId
      ? {
          webClientId: googleClientId,
          redirectUri: AuthSession.makeRedirectUri(),
        }
      : ({} as Parameters<typeof Google.useIdTokenAuthRequest>[0])
  );

  useEffect(() => {
    if (response?.type === "success") {
      const idToken = (response.params as Record<string, string>)["id_token"];
      if (!idToken) return;
      setGoogleLoading(true);
      customFetch<{ token: string; user: AuthUser }>("/api/auth/google/mobile", {
        method: "POST",
        body: JSON.stringify({ idToken }),
        headers: { "Content-Type": "application/json" },
      })
        .then(async (data) => {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await login(data.token, data.user);
          router.replace(returnTo ? (returnTo as never) : "/(tabs)");
        })
        .catch((err: Error) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert(t("auth.google_signin_failed"), err.message);
        })
        .finally(() => setGoogleLoading(false));
    } else if (response?.type === "error") {
      Alert.alert(t("auth.google_signin_failed"), t("auth.google_signin_failed_desc"));
    }
  }, [response]);

  const loginMutation = useLogin({
    mutation: {
      onSuccess: async (data) => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await login(data.token, data.user as AuthUser);
        router.replace(returnTo ? (returnTo as never) : "/(tabs)");
      },
      onError: (err: Error) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const msg = err?.message ?? "";
        if (msg.includes("EMAIL_NOT_VERIFIED") || msg.includes("verify your email")) {
          Alert.alert(
            t("auth.email_not_verified"),
            t("auth.email_not_verified_desc"),
          );
        } else {
          Alert.alert(t("auth.login_failed"), msg || t("auth.invalid_credentials"));
        }
      },
    },
  });

  const handleLogin = () => {
    if (!email.trim()) {
      Alert.alert(t("common.error"), "Please enter your email address.");
      return;
    }
    if (!email.includes("@") || !email.includes(".")) {
      Alert.alert(t("common.error"), "Please enter a valid email address.");
      return;
    }
    if (!password) {
      Alert.alert(t("common.error"), "Please enter your password.");
      return;
    }
    loginMutation.mutate({ data: { email: email.trim(), password } });
  };

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
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 40),
            paddingBottom: insets.bottom + 40,
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
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            {t("auth.premium_event_exp")}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{t("auth.sign_in")}</Text>

          {!!googleClientId && (
            <TouchableOpacity
              style={[styles.googleBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}
              onPress={() => promptAsync()}
              disabled={!request || googleLoading || loginMutation.isPending}
            >
              {googleLoading ? (
                <ActivityIndicator color={colors.foreground} size="small" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={18} color="#4285F4" />
                  <Text style={[styles.googleBtnText, { color: colors.foreground }]}>
                    {t("auth.continue_google")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {!!googleClientId && (
            <View style={styles.dividerRow}>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>{t("common.or")}</Text>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
            </View>
          )}

          <WebFormWrapper onSubmit={handleLogin}>
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
                  autoComplete="email"
                  returnKeyType="next"
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
                  placeholder="••••••••"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPassword}
                  autoComplete="current-password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
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

            <TouchableOpacity
              style={[
                styles.btn,
                { backgroundColor: colors.primary },
                loginMutation.isPending && { opacity: 0.7 },
              ]}
              onPress={handleLogin}
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.btnText, { color: colors.primaryForeground }]}>{t("auth.sign_in")}</Text>
              )}
            </TouchableOpacity>

            <Pressable style={styles.forgotWrap} onPress={() => router.push("/(auth)/forgot-password")}>
              <Text style={[styles.forgotText, { color: colors.primary }]}>{t("auth.forgot_password")}</Text>
            </Pressable>
          </WebFormWrapper>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            {t("auth.dont_have_account")}{" "}
          </Text>
          <Pressable onPress={() => router.push(returnTo ? { pathname: "/(auth)/register", params: { returnTo } } : "/(auth)/register")}>
            <Text style={[styles.link, { color: colors.primary }]}>{t("auth.sign_up")}</Text>
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
  tagline: { fontSize: 14, fontFamily: "Inter_400Regular" },
  card: { borderRadius: 20, borderWidth: 1, padding: 24, gap: 16 },
  cardTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  googleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1, borderRadius: 14, paddingVertical: 14 },
  googleBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  divider: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  field: { gap: 6 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  inputWrap: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  btn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  btnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  forgotWrap: { alignItems: "center", paddingVertical: 4 },
  forgotText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  link: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
