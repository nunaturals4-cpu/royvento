import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import React, { useState, useRef, useEffect } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  KeyboardAvoidingView,
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
  const [manualCode, setManualCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const scanLock = useRef(false);
  const manualInputRef = useRef<TextInput>(null);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const handleScan = async (code: string) => {
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

  useEffect(() => {
    if (result && result.code !== "OK" && result.code !== "ALREADY_CHECKED_IN") {
      const t = setTimeout(() => manualInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [result]);

  const resultColor = result?.code === "OK" ? "#22c55e"
    : result?.code === "ALREADY_CHECKED_IN" ? "#f97316"
    : "#ef4444";

  const hasCameraPermission = permission?.granted;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Ticket Scanner</Text>
        {hasCameraPermission && Platform.OS !== "web" && (
          <TouchableOpacity
            onPress={() => setTorchOn((prev) => !prev)}
            style={[styles.torchBtn, { backgroundColor: torchOn ? colors.primary : colors.muted }]}
            accessibilityLabel={torchOn ? "Turn off torch" : "Turn on torch"}
          >
            <Ionicons
              name={torchOn ? "flash" : "flash-off"}
              size={18}
              color={torchOn ? colors.primaryForeground : colors.mutedForeground}
            />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {/* Camera section — always shown at top */}
        <View style={styles.cameraSection}>
          {!permission ? (
            <View style={styles.permCenter}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : !hasCameraPermission ? (
            <View style={styles.permCenter}>
              <Ionicons name="camera-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.permText, { color: colors.foreground }]}>Camera access needed</Text>
              <Text style={[styles.permSub, { color: colors.mutedForeground }]}>Allow camera to scan QR codes from guest tickets.</Text>
              <TouchableOpacity style={[styles.permBtn, { backgroundColor: colors.primary }]} onPress={requestPermission}>
                <Text style={[styles.permBtnText, { color: colors.primaryForeground }]}>Allow camera</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <CameraView
              style={styles.camera}
              facing="back"
              enableTorch={torchOn}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => {
                const legacy = data.match(/royvento:booking:(\d+):/);
                if (legacy?.[1]) {
                  handleScan(`RV-${String(legacy[1]).padStart(6, "0")}`);
                } else {
                  handleScan(data);
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
          )}
        </View>

        {/* Divider with label */}
        <View style={[styles.dividerRow, { borderColor: colors.border }]}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerLabel, { color: colors.mutedForeground, backgroundColor: colors.background }]}>or enter code manually</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Manual code entry — always shown below camera */}
        <View style={styles.manualSection}>
          <Text style={[styles.manualLabel, { color: colors.mutedForeground }]}>Ticket code</Text>
          <View style={styles.manualInputRow}>
            <TextInput
              ref={manualInputRef}
              style={[styles.manualInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="BLCK-000042-F9"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => handleScan(manualCode)}
            />
            <TouchableOpacity
              style={[styles.manualBtn, { backgroundColor: colors.primary }, (loading || !manualCode.trim()) && { opacity: 0.5 }]}
              disabled={loading || !manualCode.trim()}
              onPress={() => handleScan(manualCode)}
            >
              {loading
                ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                : <Ionicons name="checkmark" size={22} color={colors.primaryForeground} />
              }
            </TouchableOpacity>
          </View>
          <Text style={[styles.manualHint, { color: colors.mutedForeground }]}>
            Format: PREFIX-NNNNNN-XX  ·  Legacy: RV-NNNNNN
          </Text>
        </View>

        {/* Loading indicator */}
        {loading && (
          <View style={styles.loadingBanner}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Validating ticket…</Text>
          </View>
        )}

        {/* Scan result card */}
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
                  <Text style={[styles.bookingMeta, { color: colors.mutedForeground, marginTop: 4 }]}>
                    {result.booking.guests} guest{result.booking.guests !== 1 ? "s" : ""}
                  </Text>
                )}
              </View>
            )}

            <TouchableOpacity style={[styles.resetBtn, { borderColor: colors.border }]} onPress={reset}>
              <Text style={[styles.resetBtnText, { color: colors.mutedForeground }]}>Scan another ticket</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const CORNER_SIZE = 24;

const styles = StyleSheet.create({
  header: { paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { flexDirection: "row", alignItems: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.3, flex: 1 },
  torchBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cameraSection: { height: 280, backgroundColor: "#000", position: "relative" },
  camera: { flex: 1 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  scanFrame: { width: 200, height: 200, position: "relative" },
  corner: { position: "absolute", width: CORNER_SIZE, height: CORNER_SIZE, borderWidth: 3 },
  topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  scanHint: { position: "absolute", bottom: -34, color: "#fff", fontSize: 13, fontFamily: "Inter_400Regular", backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  permCenter: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  permText: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  permSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  permBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  permBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  dividerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, gap: 10 },
  dividerLine: { flex: 1, height: 1 },
  dividerLabel: { fontSize: 11, fontFamily: "Inter_400Regular", paddingHorizontal: 6 },
  manualSection: { paddingHorizontal: 20, paddingBottom: 4, gap: 8 },
  manualLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4 },
  manualInputRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  manualInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 17, fontFamily: "Inter_400Regular", letterSpacing: 2 },
  manualBtn: { width: 52, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  manualHint: { fontSize: 11, fontFamily: "Inter_400Regular" },
  loadingBanner: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
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
