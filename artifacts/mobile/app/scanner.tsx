import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import React, { useState, useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface BookingData {
  id: number;
  eventTitle: string;
  vendorName: string;
  bookingDate: string;
  personName: string | null;
  userName: string;
  pubMode: string;
  ticketWomen: number;
  ticketMen: number;
  ticketCouple: number;
  guests: number;
}

interface ScanResult {
  code: string;
  message?: string;
  checkedInAt?: string;
  booking?: BookingData;
}

export default function ScannerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualCode, setManualCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const scanLock = useRef(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const scanCode = async (code: string) => {
    if (scanLock.current || loading) return;
    const trimmed = code.trim();
    if (!trimmed) return;
    scanLock.current = true;
    setLoading(true);
    setResult(null);
    try {
      const res = await customFetch<ScanResult>("/api/partner/scan-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      setResult(res);
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string };
      setResult({ code: err.code ?? "ERROR", message: err.message ?? "Network error. Try again." });
    } finally {
      setLoading(false);
      setTimeout(() => { scanLock.current = false; }, 2500);
    }
  };

  const reset = () => {
    setResult(null);
    setManualCode("");
    scanLock.current = false;
  };

  const resultColor = result?.code === "OK" ? "#22c55e"
    : result?.code === "ALREADY_CHECKED_IN" ? "#f97316"
    : "#ef4444";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Ticket Scanner</Text>
        <View style={styles.modeTabs}>
          <Pressable
            onPress={() => setMode("camera")}
            style={[styles.modeTab, mode === "camera" && { backgroundColor: colors.primary }]}
          >
            <Ionicons name="camera-outline" size={16} color={mode === "camera" ? colors.primaryForeground : colors.mutedForeground} />
            <Text style={[styles.modeTabText, { color: mode === "camera" ? colors.primaryForeground : colors.mutedForeground }]}>Camera</Text>
          </Pressable>
          <Pressable
            onPress={() => setMode("manual")}
            style={[styles.modeTab, mode === "manual" && { backgroundColor: colors.primary }]}
          >
            <Ionicons name="keypad-outline" size={16} color={mode === "manual" ? colors.primaryForeground : colors.mutedForeground} />
            <Text style={[styles.modeTabText, { color: mode === "manual" ? colors.primaryForeground : colors.mutedForeground }]}>Manual</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        {mode === "camera" ? (
          <View style={styles.cameraSection}>
            {!permission ? (
              <View style={styles.permCenter}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : !permission.granted ? (
              <View style={styles.permCenter}>
                <Ionicons name="camera-off-outline" size={48} color={colors.mutedForeground} />
                <Text style={[styles.permText, { color: colors.foreground }]}>Camera access needed</Text>
                <Text style={[styles.permSub, { color: colors.mutedForeground }]}>Allow camera to scan QR codes from guest tickets.</Text>
                <TouchableOpacity style={[styles.permBtn, { backgroundColor: colors.primary }]} onPress={requestPermission}>
                  <Text style={[styles.permBtnText, { color: colors.primaryForeground }]}>Allow camera</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.cameraWrap}>
                <CameraView
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={({ data }) => {
                    // Support legacy QR format: royvento:booking:<id>:<date>
                    const legacy = data.match(/royvento:booking:(\d+):/);
                    if (legacy?.[1]) {
                      scanCode(`RV-${String(legacy[1]).padStart(6, "0")}`);
                    } else {
                      scanCode(data);
                    }
                  }}
                >
                  <View style={styles.scanOverlay}>
                    <View style={styles.scanFrame}>
                      <View style={[styles.corner, styles.topLeft, { borderColor: colors.primary }]} />
                      <View style={[styles.corner, styles.topRight, { borderColor: colors.primary }]} />
                      <View style={[styles.corner, styles.bottomLeft, { borderColor: colors.primary }]} />
                      <View style={[styles.corner, styles.bottomRight, { borderColor: colors.primary }]} />
                    </View>
                    <Text style={styles.scanHint}>Point camera at QR code</Text>
                  </View>
                </CameraView>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.manualSection}>
            <Text style={[styles.manualLabel, { color: colors.mutedForeground }]}>Enter ticket code</Text>
            <View style={[styles.manualInputRow]}>
              <TextInput
                style={[styles.manualInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={manualCode}
                onChangeText={setManualCode}
                placeholder="BLCK-000042-F9"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => scanCode(manualCode)}
              />
              <TouchableOpacity
                style={[styles.manualBtn, { backgroundColor: colors.primary }, (loading || !manualCode.trim()) && { opacity: 0.5 }]}
                disabled={loading || !manualCode.trim()}
                onPress={() => scanCode(manualCode)}
              >
                {loading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Ionicons name="checkmark" size={22} color={colors.primaryForeground} />}
              </TouchableOpacity>
            </View>
            <Text style={[styles.manualHint, { color: colors.mutedForeground }]}>
              Format: PREFIX-NNNNNN-XX or legacy RV-NNNNNN
            </Text>
          </View>
        )}

        {loading && !result && (
          <View style={styles.loadingBanner}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Validating ticket…</Text>
          </View>
        )}

        {result && (
          <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: resultColor + "60" }]}>
            <View style={styles.resultHeader}>
              <View style={[styles.resultIcon, { backgroundColor: resultColor + "20" }]}>
                <Ionicons
                  name={result.code === "OK" ? "checkmark-circle" : result.code === "ALREADY_CHECKED_IN" ? "time-outline" : "close-circle"}
                  size={28}
                  color={resultColor}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultTitle, { color: resultColor }]}>
                  {result.code === "OK" ? "Entry granted"
                    : result.code === "ALREADY_CHECKED_IN" ? "Already used"
                    : "Invalid ticket"}
                </Text>
                {result.checkedInAt && (
                  <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>
                    {result.code === "OK" ? "Checked in" : "Was checked in"} at {new Date(result.checkedInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                )}
                {result.message && result.code !== "OK" && (
                  <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>{result.message}</Text>
                )}
              </View>
            </View>

            {result.booking && (
              <View style={[styles.bookingInfo, { borderTopColor: colors.border }]}>
                <Text style={[styles.bookingTitle, { color: colors.foreground }]}>{result.booking.eventTitle}</Text>
                <Text style={[styles.bookingMeta, { color: colors.mutedForeground }]}>{result.booking.vendorName}</Text>
                <View style={styles.bookingRow}>
                  <Text style={[styles.bookingLabel, { color: colors.mutedForeground }]}>Guest</Text>
                  <Text style={[styles.bookingValue, { color: colors.foreground }]}>{result.booking.personName ?? result.booking.userName}</Text>
                </View>
                <View style={styles.bookingRow}>
                  <Text style={[styles.bookingLabel, { color: colors.mutedForeground }]}>Date</Text>
                  <Text style={[styles.bookingValue, { color: colors.foreground }]}>{result.booking.bookingDate}</Text>
                </View>
                {result.booking.pubMode === "ticket" ? (
                  <View style={styles.ticketCounts}>
                    {result.booking.ticketWomen > 0 && (
                      <View style={[styles.ticketBadge, { backgroundColor: "#ec489920" }]}>
                        <Text style={[styles.ticketBadgeText, { color: "#ec4899" }]}>{result.booking.ticketWomen}W</Text>
                      </View>
                    )}
                    {result.booking.ticketMen > 0 && (
                      <View style={[styles.ticketBadge, { backgroundColor: "#3b82f620" }]}>
                        <Text style={[styles.ticketBadgeText, { color: "#3b82f6" }]}>{result.booking.ticketMen}M</Text>
                      </View>
                    )}
                    {result.booking.ticketCouple > 0 && (
                      <View style={[styles.ticketBadge, { backgroundColor: "#a855f720" }]}>
                        <Text style={[styles.ticketBadgeText, { color: "#a855f7" }]}>{result.booking.ticketCouple}C</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <Text style={[styles.bookingMeta, { color: colors.mutedForeground, marginTop: 4 }]}>{result.booking.guests} guest{result.booking.guests !== 1 ? "s" : ""}</Text>
                )}
              </View>
            )}

            <TouchableOpacity style={[styles.resetBtn, { borderColor: colors.border }]} onPress={reset}>
              <Text style={[styles.resetBtnText, { color: colors.mutedForeground }]}>Scan another ticket</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const CORNER_SIZE = 24;

const styles = StyleSheet.create({
  header: { paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, gap: 12 },
  backBtn: { flexDirection: "row", alignItems: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  modeTabs: { flexDirection: "row", borderRadius: 10, backgroundColor: "#1a1a1a", padding: 3, gap: 2 },
  modeTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 7, borderRadius: 8 },
  modeTabText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cameraSection: { flex: 1, minHeight: 320 },
  cameraWrap: { flex: 1, position: "relative" },
  camera: { flex: 1, minHeight: 320 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  scanFrame: { width: 220, height: 220, position: "relative" },
  corner: { position: "absolute", width: CORNER_SIZE, height: CORNER_SIZE, borderWidth: 3 },
  topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  scanHint: { position: "absolute", bottom: -36, color: "#fff", fontSize: 13, fontFamily: "Inter_400Regular", backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  permCenter: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12, minHeight: 300 },
  permText: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  permSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  permBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  permBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  manualSection: { padding: 24, gap: 8 },
  manualLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 4 },
  manualInputRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  manualInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 18, fontFamily: "Inter_400Regular", letterSpacing: 2 },
  manualBtn: { width: 50, height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  manualHint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  loadingBanner: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 24, paddingVertical: 12 },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  resultCard: { margin: 16, borderRadius: 20, borderWidth: 1.5, overflow: "hidden" },
  resultHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16 },
  resultIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  resultTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  resultSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  bookingInfo: { borderTopWidth: 1, padding: 16, gap: 6 },
  bookingTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  bookingMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  bookingRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  bookingLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  bookingValue: { fontSize: 12, fontFamily: "Inter_500Medium" },
  ticketCounts: { flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" },
  ticketBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  ticketBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  resetBtn: { margin: 12, marginTop: 0, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: "center" },
  resetBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
