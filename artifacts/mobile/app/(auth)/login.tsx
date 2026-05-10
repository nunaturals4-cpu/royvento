import { Ionicons } from "@expo/vector-icons";
import { customFetch, useLogin } from "@workspace/api-client-react";
import * as Google from "expo-auth-session/providers/google";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useRef, useState } from "react";
import { isValidEmail } from "@workspace/validators";
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

// ─── GIS helpers (web only) ────────────────────────────────────────────────

function loadGISScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.id) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Sign-In"));
    document.head.appendChild(s);
  });
}

function getGoogleIdTokenWeb(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const g = (window as any).google;
    if (!g?.accounts?.id) { reject(new Error("Google Sign-In not loaded")); return; }
    g.accounts.id.initialize({
      client_id: clientId,
      callback: (resp: { credential?: string }) => {
        if (resp.credential) resolve(resp.credential);
        else reject(new Error("No credential returned"));
      },
      cancel_on_tap_outside: false,
    });
    g.accounts.id.prompt((n: any) => {
      if (n.isNotDisplayed()) {
        reject(new Error("Google Sign-In was blocked by your browser. Please allow popups and try again."));
      }
    });
  });
}

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { t } = useLanguage();
  const { returnTo: rawReturnTo, email: rawPrefillEmail } = useLocalSearchParams<{ returnTo?: string; email?: string }>();
  const returnTo = typeof rawReturnTo === "string" && rawReturnTo.startsWith("/") ? rawReturnTo : undefined;
  const prefillEmail = typeof rawPrefillEmail === "string" ? rawPrefillEmail : "";
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(
    googleClientId
      ? { clientId: googleClientId, webClientId: googleClientId }
      : ({} as Parameters<typeof Google.useIdTokenAuthRequest>[0])
  );

  // Preload GIS script on web so it's ready when the button is pressed
  useEffect(() => {
    if (Platform.OS !== "web" || !googleClientId) return;
    loadGISScript().catch(() => {});
  }, [googleClientId]);

  // Handle native Google auth response
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (response?.type === "success") {
      const idToken = (response.params as Record<string, string>)["id_token"];
      if (!idToken) return;
      handleGoogleIdToken(idToken);
    } else if (response?.type === "error") {
      Alert.alert(t("auth.google_signin_failed"), t("auth.google_signin_failed_desc"));
    }
  }, [response]);

  const handleGoogleIdToken = (idToken: string) => {
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
      .catch((err: any) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        if (err?.data?.code === "USE_PASSWORD_SIGNIN") {
          Alert.alert(t("auth.use_password_signin_title"), t("auth.use_password_signin"));
          return;
        }
        Alert.alert(t("auth.google_signin_failed"), err?.message ?? "");
      })
      .finally(() => setGoogleLoading(false));
  };

  const handleGooglePress = async () => {
    if (Platform.OS !== "web") {
      promptAsync();
      return;
    }
    if (!googleClientId) return;
    try {
      await loadGISScript();
      const idToken = await getGoogleIdTokenWeb(googleClientId);
      handleGoogleIdToken(idToken);
    } catch (err: any) {
      Alert.alert(t("auth.google_signin_failed"), err?.message ?? "");
    }
  };

  const loginMutation = useLogin({
    mutation: {
      onSuccess: async (data) => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await login(data.token, data.user as AuthUser);
        router.replace(returnTo ? (returnTo as never) : "/(tabs)");
      },
      onError: (err: any) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const code = err?.data?.code ?? err?.code;
        const status = err?.status;
        const serverMsg = err?.data?.error ?? err?.message ?? "";
        const fe: Record<string, string> = err?.data?.fieldErrors ?? err?.fieldErrors ?? {};
        if (Object.keys(fe).length > 0) {
          setErrors((p) => ({ ...p, ...(fe.email ? { email: fe.email } : {}), ...(fe.password ? { password: fe.password } : {}) }));
          if (fe.email) emailRef.current?.focus();
          else if (fe.password) passwordRef.current?.focus();
          return;
        }
        if (code === "EMAIL_NOT_VERIFIED" || /EMAIL_NOT_VERIFIED|verify your email/i.test(serverMsg)) {
          Alert.alert(
            t("auth.email_not_verified"),
            t("auth.email_not_verified_desc"),
          );
        } else if (code === "USE_GOOGLE_SIGNIN") {
          Alert.alert(
            t("auth.use_google_signin_title"),
            t("auth.use_google_signin"),
          );
        } else if (code === "NO_ACCOUNT" || status === 404) {
          setErrors((p) => ({
            ...p,
            email: "No account found for that email. Tap “Sign Up” below to create one.",
          }));
          emailRef.current?.focus();
        } else {
          setErrors((p) => ({ ...p, password: serverMsg || "Incorrect password. Please try again." }));
          passwordRef.current?.focus();
        }
      },
    },
  });

  const handleLogin = () => {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = "Please enter your email address.";
    else if (!isValidEmail(email)) next.email = "Please enter a valid email address.";
    if (!password) next.password = "Please enter your password.";
    setErrors(next);
    if (next.email) { emailRef.current?.focus(); return; }
    if (next.password) { passwordRef.current?.focus(); return; }
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
              onPress={handleGooglePress}
              disabled={(Platform.OS !== "web" && !request) || googleLoading || loginMutation.isPending}
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
                  autoComplete="email"
                  returnKeyType="next"
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
              {errors.password ? <Text style={[styles.errorText, { color: colors.destructive }]}>{errors.password}</Text> : null}
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
          <Pressable
            onPress={() => {
              const params: Record<string, string> = {};
              if (returnTo) params.returnTo = returnTo;
              if (email.trim()) params.email = email.trim();
              router.push(
                Object.keys(params).length > 0
                  ? { pathname: "/(auth)/register", params }
                  : "/(auth)/register",
              );
            }}
          >
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
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
