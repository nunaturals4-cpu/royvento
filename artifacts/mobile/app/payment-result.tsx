import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function PaymentResultScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const { status, eventTitle, bookingId } = useLocalSearchParams<{
    status?: string;
    eventTitle?: string;
    bookingId?: string;
  }>();

  const success = status !== "failed" && status !== "cancelled";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={[styles.header, { paddingTop: topPadding + 16 }]}
      >
        <Pressable style={styles.backBtn} onPress={() => router.replace("/(tabs)/bookings")}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Payment Result</Text>
      </LinearGradient>

      <View style={styles.body}>
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: success ? "#22c55e20" : "#ef444420" },
          ]}
        >
          <Ionicons
            name={success ? "checkmark-circle" : "close-circle"}
            size={72}
            color={success ? "#22c55e" : "#ef4444"}
          />
        </View>

        <Text style={[styles.status, { color: colors.foreground }]}>
          {success ? "Payment Successful!" : "Payment Failed"}
        </Text>

        {eventTitle ? (
          <Text style={[styles.eventTitle, { color: colors.mutedForeground }]}>
            {eventTitle}
          </Text>
        ) : null}

        {success ? (
          <Text style={[styles.message, { color: colors.mutedForeground }]}>
            Your booking has been confirmed. You can view your ticket in My Bookings.
          </Text>
        ) : (
          <Text style={[styles.message, { color: colors.mutedForeground }]}>
            Something went wrong with your payment. Please try again or contact support.
          </Text>
        )}

        <View style={styles.actions}>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.replace("/(tabs)/bookings")}
          >
            <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
              View My Bookings
            </Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => router.replace("/(tabs)/explore")}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
              Explore More Events
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  backBtn: { padding: 4, alignSelf: "flex-start" },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  iconCircle: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  status: { fontSize: 26, fontFamily: "Inter_700Bold", textAlign: "center" },
  eventTitle: { fontSize: 16, fontFamily: "Inter_500Medium", textAlign: "center" },
  message: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, maxWidth: 300 },
  actions: { width: "100%", gap: 12, marginTop: 8 },
  primaryBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  primaryBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  secondaryBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center", borderWidth: 1 },
  secondaryBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
