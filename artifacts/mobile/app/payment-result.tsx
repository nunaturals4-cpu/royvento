import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useListMyBookings, getListMyBookingsQueryKey } from "@workspace/api-client-react";

export default function PaymentResultScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const { payment, status, eventTitle, bookingId, id, code } = useLocalSearchParams<{
    payment?: string;
    status?: string;
    eventTitle?: string;
    bookingId?: string;
    id?: string;
    code?: string;
  }>();

  const isSuccess = payment === "success" || status === "success";
  const isFailed = payment === "failed" || payment === "cancelled" || status === "failed" || status === "cancelled";
  const success = isSuccess && !isFailed;
  const unknown = !isSuccess && !isFailed;

  const bookingIdNum = (() => {
    const raw = bookingId ?? id;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  })();
  const { data: bookings } = useListMyBookings({
    query: { queryKey: getListMyBookingsQueryKey(), enabled: success && !!bookingIdNum },
  });
  const matched = bookingIdNum && Array.isArray(bookings)
    ? (bookings as Array<{ id: number; finalPrice?: number | null; totalPrice?: number | null }>).find((b) => b.id === bookingIdNum)
    : null;
  const paidAmount = matched ? Number(matched.finalPrice ?? matched.totalPrice ?? 0) : null;

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
            { backgroundColor: success ? "#22c55e20" : unknown ? "#6b728020" : "#ef444420" },
          ]}
        >
          <Ionicons
            name={success ? "checkmark-circle" : unknown ? "help-circle" : "close-circle"}
            size={72}
            color={success ? "#22c55e" : unknown ? colors.mutedForeground : "#ef4444"}
          />
        </View>

        <Text style={[styles.status, { color: colors.foreground }]}>
          {success ? "Payment Successful!" : unknown ? "Payment Status Unknown" : "Payment Failed"}
        </Text>

        {eventTitle ? (
          <Text style={[styles.eventTitle, { color: colors.mutedForeground }]}>
            {eventTitle}
          </Text>
        ) : null}

        {success ? (
          <>
            <Text style={[styles.message, { color: colors.mutedForeground }]}>
              Your booking has been confirmed. You can view your ticket in My Bookings.
            </Text>
            {paidAmount != null && (
              <View style={styles.amountBox}>
                <Text style={styles.amountLabel}>{paidAmount === 0 ? "FREE ENTRY" : "AMOUNT PAID"}</Text>
                <Text style={styles.amountValue}>₹{paidAmount.toLocaleString("en-IN")}</Text>
              </View>
            )}
          </>
        ) : unknown ? (
          <Text style={[styles.message, { color: colors.mutedForeground }]}>
            We could not determine your payment result. Please check My Bookings or contact support.
          </Text>
        ) : (
          <>
            <Text style={[styles.message, { color: colors.mutedForeground }]}>
              {code
                ? `The payment could not be completed (${code}). No amount has been charged.`
                : "The payment could not be completed. No amount has been charged."}
            </Text>
            <Text style={[styles.refundNote, { color: colors.mutedForeground }]}>
              If your account was debited, it will be automatically refunded within 5-7 business days.
            </Text>
          </>
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
  refundNote: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18, maxWidth: 280, marginTop: -4 },
  actions: { width: "100%", gap: 12, marginTop: 8 },
  primaryBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  primaryBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  secondaryBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center", borderWidth: 1 },
  secondaryBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  amountBox: { borderWidth: 1, borderColor: "rgba(212,168,83,0.35)", backgroundColor: "rgba(212,168,83,0.08)", borderRadius: 16, paddingHorizontal: 22, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  amountLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 2, color: "rgba(212,168,83,0.7)", marginBottom: 4 },
  amountValue: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#d4a853" },
});
