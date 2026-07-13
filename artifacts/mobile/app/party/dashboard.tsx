import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { customFetch } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { formatPartyDate, type PublicParty } from "@/lib/party";

const WEB_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? "royvento.com"}`;

interface BookingRow {
  id: number;
  bookingCode: string;
  name: string;
  email: string;
  phone: string;
  quantity: number;
  totalPrice: string;
  netAmount: string;
  status: string;
  paymentStatus: string;
  checkedIn: boolean;
  checkedInAt: string | null;
  createdAt: string;
}

interface DashboardPayload {
  party: PublicParty;
  stats: {
    totalBookings: number;
    cancelledBookings: number;
    guestsGoing: number;
    checkedInCount: number;
    revenue: string;
    commission: string;
    netEarnings: string;
    seatsLeft: number | null;
    capacity: number;
    commissionType: string;
    commissionValue: number;
  };
  bookings: BookingRow[];
  cancelled: BookingRow[];
}

export default function PartyDashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const id = parseInt(String(params.id), 10);
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const qc = useQueryClient();

  const [code, setCode] = useState("");
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const lastScanRef = useRef<{ code: string; t: number }>({ code: "", t: 0 });

  const { data, isLoading, isRefetching, refetch } = useQuery<DashboardPayload>({
    queryKey: ["party-dashboard", id],
    queryFn: () => customFetch<DashboardPayload>(`/api/create-your-party/${id}/dashboard`),
    enabled: Number.isFinite(id),
  });

  const scan = useMutation({
    mutationFn: (c: string) =>
      customFetch<{ ok?: boolean; name?: string }>(`/api/create-your-party/${id}/scan`, {
        method: "POST",
        body: JSON.stringify({ code: c }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (res, variables) => {
      setScanMsg({ ok: true, text: `Checked in: ${res.name ?? variables}` });
      setCode("");
      qc.invalidateQueries({ queryKey: ["party-dashboard", id] });
    },
    onError: (e: any, variables) => {
      setScanMsg({ ok: false, text: e?.data?.error ?? e?.message ?? `Invalid ticket: ${variables}` });
    },
  });

  async function startCameraScan() {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) { Alert.alert("Camera permission needed", "Enable camera access to scan QR tickets."); return; }
    }
    setScanMsg(null);
    setCameraOn(true);
  }

  function handleCameraScan(raw: string) {
    const scannedCode = raw.trim().toUpperCase();
    if (!scannedCode) return;
    const now = Date.now();
    // Debounce repeat reads of the same code for 3s (the camera keeps scanning every frame).
    if (lastScanRef.current.code === scannedCode && now - lastScanRef.current.t < 3000) return;
    lastScanRef.current = { code: scannedCode, t: now };
    if (scan.isPending) return;
    scan.mutate(scannedCode);
  }

  const setStatus = useMutation({
    mutationFn: (status: "published" | "sales_stopped" | "cancelled") =>
      customFetch(`/api/create-your-party/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["party-dashboard", id] });
      qc.invalidateQueries({ queryKey: ["parties"] });
    },
  });

  if (isLoading || !data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const { party, stats, bookings } = data;
  const isPrivate = party.visibility === "private";
  const inviteUrl = `${WEB_BASE}/party/${id}${isPrivate && party.inviteToken ? `?invite=${party.inviteToken}` : ""}`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: topPadding + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{party.name}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{formatPartyDate(party.partyDate)} · {party.city}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 16 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
      >
        {/* KPIs */}
        <View style={styles.kpiGrid}>
          <Kpi colors={colors} label="Guests going" value={String(stats.guestsGoing)} icon="people-outline" />
          <Kpi colors={colors} label="Checked in" value={String(stats.checkedInCount)} icon="checkmark-done-outline" />
          <Kpi colors={colors} label="Bookings" value={String(stats.totalBookings)} icon="ticket-outline" />
          <Kpi colors={colors} label="Seats left" value={stats.seatsLeft == null ? "∞" : String(stats.seatsLeft)} icon="grid-outline" />
          {party.ticketType === "paid" && (
            <>
              <Kpi colors={colors} label="Revenue" value={`₹${Number(stats.revenue).toLocaleString("en-IN")}`} icon="cash-outline" />
              <Kpi colors={colors} label="Net earnings" value={`₹${Number(stats.netEarnings).toLocaleString("en-IN")}`} icon="wallet-outline" />
            </>
          )}
        </View>

        {/* Invite share */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {isPrivate ? "Private invite link" : "Share link"}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12.5, marginTop: 4 }} numberOfLines={2}>{inviteUrl}</Text>
          <TouchableOpacity
            onPress={() => Share.share({ message: `Join "${party.name}" on Royvento!\n\n${inviteUrl}`, url: inviteUrl })}
            style={[styles.linkBtn, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="share-social-outline" size={16} color={colors.primaryForeground} />
            <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Share invite</Text>
          </TouchableOpacity>
        </View>

        {/* Check in by code */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Check in at the door</Text>

          {cameraOn ? (
            <View style={{ height: 260, borderRadius: 16, overflow: "hidden", marginTop: 10 }}>
              <CameraView
                style={StyleSheet.absoluteFill}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={({ data }) => handleCameraScan(data)}
              />
              <TouchableOpacity
                onPress={() => setCameraOn(false)}
                style={{ position: "absolute", top: 10, right: 10, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 20, padding: 8 }}
              >
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={startCameraScan}
              style={[styles.linkBtn, { backgroundColor: colors.primary, marginTop: 10 }]}
            >
              <Ionicons name="qr-code-outline" size={16} color={colors.primaryForeground} />
              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Scan QR ticket</Text>
            </TouchableOpacity>
          )}

          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              autoCapitalize="characters"
              placeholder="Enter ticket code"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            <TouchableOpacity
              disabled={!code.trim() || scan.isPending}
              onPress={() => scan.mutate(code.trim())}
              style={[styles.checkBtn, { backgroundColor: colors.primary, opacity: !code.trim() || scan.isPending ? 0.5 : 1 }]}
            >
              {scan.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>Check in</Text>}
            </TouchableOpacity>
          </View>
          {scanMsg && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
              <Ionicons name={scanMsg.ok ? "checkmark-circle" : "close-circle"} size={16} color={scanMsg.ok ? "#22c55e" : colors.destructive} />
              <Text style={{ color: scanMsg.ok ? "#22c55e" : colors.destructive, fontSize: 13, flex: 1 }}>{scanMsg.text}</Text>
            </View>
          )}
        </View>

        {/* Attendees */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Attendees ({bookings.length})</Text>
          {bookings.length === 0 ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 8 }}>No confirmed bookings yet.</Text>
          ) : (
            <View style={{ marginTop: 6 }}>
              {bookings.map((b) => (
                <View key={b.id} style={[styles.attendee, { borderTopColor: colors.border }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: "Inter_500Medium" }} numberOfLines={1}>{b.name}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 1 }}>
                      {b.bookingCode} · {b.quantity} {b.quantity === 1 ? "guest" : "guests"}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: b.checkedIn ? "#22c55e22" : colors.muted }]}>
                    <Text style={{ color: b.checkedIn ? "#22c55e" : colors.mutedForeground, fontSize: 11.5, fontFamily: "Inter_600SemiBold" }}>
                      {b.checkedIn ? "Checked in" : "Going"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Controls */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {party.status === "published" ? (
            <TouchableOpacity onPress={() => setStatus.mutate("sales_stopped")} style={[styles.ctrlBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>Stop bookings</Text>
            </TouchableOpacity>
          ) : party.status === "sales_stopped" ? (
            <TouchableOpacity onPress={() => setStatus.mutate("published")} style={[styles.ctrlBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>Resume bookings</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => setStatus.mutate("cancelled")} style={[styles.ctrlBtn, { borderColor: colors.destructive }]}>
            <Text style={{ color: colors.destructive, fontFamily: "Inter_500Medium", fontSize: 13 }}>Cancel party</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function Kpi({ colors, label, value, icon }: { colors: ReturnType<typeof useColors>; label: string; value: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={{ color: colors.foreground, fontSize: 19, fontFamily: "Inter_700Bold", marginTop: 6 }}>{value}</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 11.5 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpi: { width: "31%", flexGrow: 1, borderRadius: 14, borderWidth: 1, padding: 12 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  linkBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 11, marginTop: 12 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_500Medium" },
  checkBtn: { borderRadius: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  attendee: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  ctrlBtn: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: "center" },
});
