import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import React, { useState, useRef, useEffect } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
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
  finalPrice?: number;
  priceWomen?: number;
  priceMen?: number;
  priceCouple?: number;
  commissionRate?: number;
  commissionAmount?: number;
  netAmount?: number;
  paymentMethod?: string;
  actualWomen?: number | null;
  actualMen?: number | null;
  actualCouple?: number | null;
  actualGuests?: number | null;
  actualAmountDue?: number | null;
  freeEntryRules?: {
    enabled?: boolean;
    days?: string[];
    genders?: string[];
  } | null;
}

// Day abbreviations matching server's free-entry-rules day list (e.g. "Wed", "Thu").
const SCANNER_FREE_ENTRY_DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Mirrors the rule used in artifacts/mobile/app/(tabs)/bookings.tsx and
// artifacts/api-server/src/routes/bookings.ts: when the booking date's weekday
// is in the active free-entry-rules day list, the customer owes ₹0 at the door.
function bookingIsFreeEntryDay(b: Pick<BookingData, "bookingDate" | "freeEntryRules">): boolean {
  const fer = b.freeEntryRules;
  if (!fer?.enabled) return false;
  if (!b.bookingDate) return false;
  const days = Array.isArray(fer.days) ? fer.days : [];
  const dayName = SCANNER_FREE_ENTRY_DAY_ABBRS[new Date(`${b.bookingDate}T12:00:00`).getDay()];
  if (!dayName || !days.includes(dayName)) return false;
  return true;
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
  const [sheetOpen, setSheetOpen] = useState(false);
  // Auto-open the bottom sheet whenever a successful (or already-checked-in) scan
  // surfaces a booking the operator can record actuals against.
  useEffect(() => {
    if (result?.booking && (result.code === "OK" || result.code === "ALREADY_CHECKED_IN")) {
      setSheetOpen(true);
    } else {
      setSheetOpen(false);
    }
  }, [result?.code, result?.booking?.id]);
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

            {result.booking && (result.code === "OK" || result.code === "ALREADY_CHECKED_IN") && (
              <TouchableOpacity
                onPress={() => setSheetOpen(true)}
                style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <View>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.foreground }}>Record actual entry</Text>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
                    {result.booking.actualAmountDue != null
                      ? bookingIsFreeEntryDay(result.booking)
                        ? "Recorded · Free Entry"
                        : `Recorded · ₹${result.booking.actualAmountDue.toLocaleString("en-IN")} due`
                      : "Tap to log who actually showed up"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}

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

                {/* Commission breakdown — shown when finalPrice > 0 and commission rates exist */}
                {result.booking.finalPrice != null && result.booking.finalPrice > 0 && result.booking.commissionRate != null && (
                  <View style={{ marginTop: 12, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ backgroundColor: colors.muted, paddingHorizontal: 12, paddingVertical: 6 }}>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 }}>Payment Breakdown</Text>
                    </View>
                    <View style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}>
                      <View style={styles.bookingRow}>
                        <Text style={[styles.bookingLabel, { color: colors.mutedForeground }]}>Gross Amount</Text>
                        <Text style={[styles.bookingValue, { color: colors.foreground }]}>₹{(result.booking.finalPrice ?? 0).toLocaleString("en-IN")}</Text>
                      </View>
                      <View style={styles.bookingRow}>
                        <Text style={[styles.bookingLabel, { color: "#f59e0b" }]}>
                          {`Platform Fee (₹${result.booking.commissionRate % 1 === 0 ? result.booking.commissionRate.toFixed(0) : result.booking.commissionRate.toFixed(2)}/unit)`}
                        </Text>
                        <Text style={[styles.bookingValue, { color: "#f59e0b" }]}>− ₹{(result.booking.commissionAmount ?? 0).toLocaleString("en-IN")}</Text>
                      </View>
                      <View style={[styles.bookingRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 2 }]}>
                        <Text style={[styles.bookingLabel, { color: "#22c55e", fontFamily: "Inter_600SemiBold" }]}>Net to Collect</Text>
                        <Text style={[styles.bookingValue, { color: "#22c55e", fontSize: 15, fontFamily: "Inter_700Bold" }]}>₹{(result.booking.netAmount ?? 0).toLocaleString("en-IN")}</Text>
                      </View>
                    </View>
                  </View>
                )}
                {result.booking.finalPrice === 0 && (
                  <View style={{ marginTop: 12, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ backgroundColor: colors.muted, paddingHorizontal: 12, paddingVertical: 6 }}>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 }}>Payment Breakdown</Text>
                    </View>
                    <View style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}>
                      <View style={styles.bookingRow}>
                        <Text style={[styles.bookingLabel, { color: colors.mutedForeground }]}>Gross Amount</Text>
                        <Text style={[styles.bookingValue, { color: colors.foreground }]}>₹0</Text>
                      </View>
                      <View style={styles.bookingRow}>
                        <Text style={[styles.bookingLabel, { color: "#f59e0b" }]}>Platform Fee (₹0)</Text>
                        <Text style={[styles.bookingValue, { color: "#f59e0b" }]}>− ₹0</Text>
                      </View>
                      <View style={[styles.bookingRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 2 }]}>
                        <Text style={[styles.bookingLabel, { color: "#22c55e", fontFamily: "Inter_600SemiBold" }]}>Net to Collect</Text>
                        <Text style={[styles.bookingValue, { color: "#22c55e", fontSize: 15, fontFamily: "Inter_700Bold" }]}>Free Entry</Text>
                      </View>
                    </View>
                  </View>
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
      {result?.booking && (result.code === "OK" || result.code === "ALREADY_CHECKED_IN") && (
        <ActualEntrySheet
          booking={result.booking}
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onSaved={(updated) => setResult({ ...result, booking: updated })}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function StepperRow({ label, value, max, color, onChange }: { label: string; value: number; max: number; color: string; onChange: (n: number) => void }) {
  if (max <= 0) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
        <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" }}>booked: {max}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <TouchableOpacity
          accessibilityLabel={`Decrease ${label}`}
          onPress={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
          style={{ width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: color + "20", opacity: value <= 0 ? 0.3 : 1 }}
        >
          <Ionicons name="remove" size={18} color={color} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff", minWidth: 28, textAlign: "center" }}>{value}</Text>
        <TouchableOpacity
          accessibilityLabel={`Increase ${label}`}
          onPress={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          style={{ width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: color + "20", opacity: value >= max ? 0.3 : 1 }}
        >
          <Ionicons name="add" size={18} color={color} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ActualEntrySheet({
  booking: b,
  visible,
  onClose,
  onSaved,
}: {
  booking: BookingData;
  visible: boolean;
  onClose: () => void;
  onSaved: (b: BookingData) => void;
}) {
  const colors = useColors();
  const isTicket = b.pubMode === "ticket";
  const [w, setW] = useState<number>(b.actualWomen ?? b.ticketWomen);
  const [m, setM] = useState<number>(b.actualMen ?? b.ticketMen);
  const [c, setC] = useState<number>(b.actualCouple ?? b.ticketCouple);
  const [g, setG] = useState<number>(b.actualGuests ?? b.guests);
  const [saving, setSaving] = useState(false);
  // Reset stepper state whenever a different booking is shown.
  useEffect(() => {
    setW(b.actualWomen ?? b.ticketWomen);
    setM(b.actualMen ?? b.ticketMen);
    setC(b.actualCouple ?? b.ticketCouple);
    setG(b.actualGuests ?? b.guests);
  }, [b.id, b.actualWomen, b.actualMen, b.actualCouple, b.actualGuests, b.ticketWomen, b.ticketMen, b.ticketCouple, b.guests]);

  const isCod = b.paymentMethod === "cod";
  const isFreeEntryDayBooking = bookingIsFreeEntryDay(b);
  const alreadyRecorded = b.actualWomen != null || b.actualMen != null || b.actualCouple != null || b.actualGuests != null;
  const hasAnyBookedTicket = b.ticketWomen > 0 || b.ticketMen > 0 || b.ticketCouple > 0;
  const shouldRender = (isTicket && hasAnyBookedTicket) || (!isTicket && b.guests > 0);

  // LIVE running total from current stepper state (server response is null until save).
  const priceWomen = b.priceWomen ?? 0;
  const priceMen = b.priceMen ?? 0;
  const priceCouple = b.priceCouple ?? 0;
  const liveTotal = isTicket
    ? w * priceWomen + m * priceMen + c * priceCouple
    : (g / Math.max(1, b.guests)) * (b.finalPrice ?? 0);
  const liveTotalRounded = Math.round(liveTotal * 100) / 100;
  const subRows = isTicket
    ? [
        { label: "Women", qty: w, price: priceWomen, subtotal: w * priceWomen },
        { label: "Men", qty: m, price: priceMen, subtotal: m * priceMen },
        { label: "Couples", qty: c, price: priceCouple, subtotal: c * priceCouple },
      ].filter((r) => r.qty > 0)
    : [];

  const submit = async () => {
    setSaving(true);
    try {
      const code = `RV-${String(b.id).padStart(6, "0")}`;
      const actualEntry = isTicket ? { women: w, men: m, couple: c } : { guests: g };
      const res = await customFetch<{ booking?: BookingData }>("/api/partner/scan-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, actualEntry }),
      });
      if (res.booking) {
        onSaved(res.booking);
        onClose();
      }
    } catch {
      // Network errors are surfaced via the broader scanner state; nothing more to do here.
    } finally {
      setSaving(false);
    }
  };

  if (!shouldRender) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <Pressable onPress={() => { /* swallow taps inside sheet */ }} style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 28, gap: 10, maxHeight: "85%" }}>
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 4 }} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>Actual entry</Text>
            {alreadyRecorded && <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#22c55e", textTransform: "uppercase", letterSpacing: 0.5 }}>Recorded</Text>}
          </View>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>Adjust if fewer guests showed up than booked.</Text>
          <ScrollView style={{ marginTop: 4 }} showsVerticalScrollIndicator={false}>
            {isTicket ? (
              <>
                <StepperRow label="Women" value={w} max={b.ticketWomen} color="#ec4899" onChange={setW} />
                <StepperRow label="Men" value={m} max={b.ticketMen} color="#3b82f6" onChange={setM} />
                <StepperRow label="Couples" value={c} max={b.ticketCouple} color="#a855f7" onChange={setC} />
              </>
            ) : (
              <StepperRow label="Guests" value={g} max={Math.max(b.guests, 1)} color={colors.primary} onChange={setG} />
            )}
          </ScrollView>
          {isFreeEntryDayBooking ? (
            <View style={{ marginTop: 4, borderRadius: 10, padding: 10, backgroundColor: "#16a34a18", borderWidth: 1, borderColor: "#16a34a55", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#22c55e", textTransform: "uppercase", letterSpacing: 0.5 }}>Free entry — no payment to collect</Text>
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#22c55e" }}>₹0</Text>
            </View>
          ) : isCod && (
            <View style={{ marginTop: 4, borderRadius: 10, padding: 10, backgroundColor: "#f59e0b18", borderWidth: 1, borderColor: "#f59e0b40", gap: 6 }}>
              {isTicket && subRows.length > 0 && (
                <>
                  {subRows.map((r) => (
                    <View key={r.label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "#fcd34d" }}>{r.label} · {r.qty} × ₹{r.price.toLocaleString("en-IN")}</Text>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#fcd34d" }}>₹{r.subtotal.toLocaleString("en-IN")}</Text>
                    </View>
                  ))}
                  <View style={{ height: 1, backgroundColor: "#f59e0b30" }} />
                </>
              )}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#f59e0b", textTransform: "uppercase", letterSpacing: 0.5 }}>Total to collect (COD)</Text>
                <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#f59e0b" }}>₹{liveTotalRounded.toLocaleString("en-IN")}</Text>
              </View>
            </View>
          )}
          <TouchableOpacity
            onPress={submit}
            disabled={saving}
            style={{ marginTop: 8, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: saving ? 0.5 : 1 }}
          >
            {saving
              ? <ActivityIndicator size="small" color={colors.primaryForeground} />
              : <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.primaryForeground }}>{alreadyRecorded ? "Update actual entry" : "Save actual entry"}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ alignItems: "center", paddingVertical: 8 }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>Skip for now</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
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
