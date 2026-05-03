import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
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
import { useColors } from "@/hooks/useColors";

export default function ResetPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => router.replace("/(auth)/login"), 3000);
    return () => clearTimeout(timer);
  }, [done]);

  const resolvedToken = typeof token === "string" ? token : "";

  async function handleSubmit() {
    if (!resolvedToken) {
      Alert.alert("Invalid link", "No reset token found. Please use the link sent to your email.");
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert("Password too short", "Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Passwords don't match", "Please make sure both passwords are the same.");
      return;
    }
    setLoading(true);
    try {
      await customFetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resolvedToken, newPassword: password }),
      });
      setDone(true);
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert("Reset failed", err?.message ?? "Invalid or expired reset token. Please request a new link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 40), paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.backBtn} onPress={() => router.replace("/(auth)/login")}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>

        <View style={styles.header}>
          <LinearGradient
            colors={[colors.primary, colors.goldLight ?? "#e8c050"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconWrap}
          >
            <Ionicons name="lock-closed-outline" size={28} color={colors.primaryForeground} />
          </LinearGradient>
          <Text style={[styles.title, { color: colors.foreground }]}>Set New Password</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            Enter a new password for your account
          </Text>
        </View>

        {!resolvedToken ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.errorBox, { backgroundColor: colors.destructive + "18", borderColor: colors.destructive + "40" }]}>
              <Ionicons name="alert-circle-outline" size={20} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.destructive }]}>
                No reset token found. Please use the link from your reset email.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary }]}
              onPress={() => router.replace("/(auth)/forgot-password")}
            >
              <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Request New Link</Text>
            </TouchableOpacity>
          </View>
        ) : done ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.successIcon, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="checkmark-circle-outline" size={40} color={colors.primary} />
            </View>
            <Text style={[styles.successTitle, { color: colors.foreground }]}>Password updated!</Text>
            <Text style={[styles.successSub, { color: colors.mutedForeground }]}>
              Your password has been reset successfully. Redirecting you to sign in…
            </Text>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary }]}
              onPress={() => router.replace("/(auth)/login")}
            >
              <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>New Password</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  returnKeyType="next"
                />
                <Pressable onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={16}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Confirm Password</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Repeat your new password"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
                <Pressable onPress={() => setShowConfirm(!showConfirm)}>
                  <Ionicons
                    name={showConfirm ? "eye-off-outline" : "eye-outline"}
                    size={16}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              </View>
            </View>

            {confirm.length > 0 && password !== confirm ? (
              <View style={styles.mismatchRow}>
                <Ionicons name="close-circle" size={14} color={colors.destructive} />
                <Text style={[styles.mismatchText, { color: colors.destructive }]}>Passwords don't match</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary }, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Reset Password</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, gap: 24 },
  backBtn: { padding: 4, alignSelf: "flex-start" },
  header: { alignItems: "center", gap: 10 },
  iconWrap: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  card: { borderRadius: 20, borderWidth: 1, padding: 24, gap: 16 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  field: { gap: 6 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  inputWrap: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  mismatchRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  mismatchText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  btn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  btnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  successIcon: { alignItems: "center", justifyContent: "center", width: 72, height: 72, borderRadius: 36, alignSelf: "center" },
  successTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  successSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
});
