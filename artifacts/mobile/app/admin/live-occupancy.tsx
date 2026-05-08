import { Ionicons } from "@expo/vector-icons";
import { getAdminLiveOccupancyBookings } from "@workspace/api-client-react";
import type { ScannerBookingRow as ApiScannerBookingRow } from "@workspace/api-client-react";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

type StatusF = "all" | "notArrived" | "inside" | "checkedOut";

export default function LiveOccupancyDrill() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ vendorId?: string; businessName?: string }>();
  const vendorId = params.vendorId ? Number(params.vendorId) : null;
  const [rows, setRows] = useState<ApiScannerBookingRow[]>([]);
  const [statusF, setStatusF] = useState<StatusF>("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    setLoading(true);
    // Generated client function — typed params object stays aligned with the
    // OpenAPI contract. Date range is optional; blank means "today (IST)".
    getAdminLiveOccupancyBookings(vendorId, {
      ...(statusF !== "all" ? { status: statusF } : {}),
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(from && to ? { from, to } : {}),
    })
      .then((r) => { if (!cancelled) setRows(r.rows); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [vendorId, statusF, q, from, to]);

  if (!vendorId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.mutedForeground }}>Missing vendor.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: topPadding + 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, color: colors.mutedForeground, textTransform: "uppercase", fontFamily: "Inter_600SemiBold" }}>Today's bookings</Text>
          <Text style={{ fontSize: 17, color: colors.foreground, fontFamily: "Inter_700Bold" }} numberOfLines={1}>{params.businessName ?? `Vendor #${vendorId}`}</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 12, paddingTop: 10, gap: 8 }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search name / phone / ticket #"
          placeholderTextColor={colors.mutedForeground}
          style={{ backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: colors.foreground, fontSize: 13, fontFamily: "Inter_400Regular" }}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            value={from}
            onChangeText={setFrom}
            placeholder="From YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
            style={{ flex: 1, backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, color: colors.foreground, fontSize: 12, fontFamily: "Inter_400Regular" }}
          />
          <TextInput
            value={to}
            onChangeText={setTo}
            placeholder="To YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
            style={{ flex: 1, backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, color: colors.foreground, fontSize: 12, fontFamily: "Inter_400Regular" }}
          />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }} style={{ flexGrow: 0 }}>
        {(["all", "notArrived", "inside", "checkedOut"] as const).map((s) => (
          <Pressable key={s} onPress={() => setStatusF(s)}
            style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, backgroundColor: statusF === s ? colors.primary : colors.muted, borderColor: statusF === s ? colors.primary : colors.border }}>
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: statusF === s ? colors.primaryForeground : colors.mutedForeground }}>
              {s === "all" ? "All" : s === "notArrived" ? "Not arrived" : s === "inside" ? "Inside" : "Checked out"}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : rows.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, textAlign: "center", padding: 20 }}>No bookings.</Text>
        ) : rows.map((r) => {
          const pax = r.pubMode === "ticket" ? r.ticketWomen + r.ticketMen + r.ticketCouple * 2 : r.guests;
          const statusColor = r.liveStatus === "inside" ? "#22c55e" : r.liveStatus === "checkedOut" ? "#f59e0b" : colors.mutedForeground;
          return (
            <View key={r.id} style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{r.personName || r.userName}</Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: statusColor + "20" }}>
                  <Text style={{ fontSize: 10, color: statusColor, fontFamily: "Inter_600SemiBold" }}>
                    {r.liveStatus === "inside" ? "INSIDE" : r.liveStatus === "checkedOut" ? "CHECKED OUT" : "NOT ARRIVED"}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                {r.ticketCode} · {pax} pax{r.phone ? ` · ${r.phone}` : ""}
              </Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>
                In: {r.checkedInAt ? new Date(r.checkedInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                {"   ·   "}
                Out: {r.checkedOutAt ? new Date(r.checkedOutAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
