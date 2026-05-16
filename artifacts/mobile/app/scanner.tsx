import { Ionicons } from "@expo/vector-icons";
import {
  customFetch,
  getPartnerScannerBookings,
  getPartnerScannerOccupancy,
  partnerCheckoutTicket,
} from "@workspace/api-client-react";
import type {
  ScannerBookingRow as ApiScannerBookingRow,
  OccupancyResponse as ApiOccupancyResponse,
} from "@workspace/api-client-react";
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
  ticketCode?: string;
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

function bookingFerState(b: Pick<BookingData, "bookingDate" | "freeEntryRules">): {
  active: boolean;
  allGendersFree: boolean;
  isTierFree: (g: "women" | "men" | "couple") => boolean;
} {
  const fer = b.freeEntryRules;
  const days = Array.isArray(fer?.days) ? fer!.days! : [];
  const dayName = b.bookingDate ? SCANNER_FREE_ENTRY_DAY_ABBRS[new Date(`${b.bookingDate}T12:00:00`).getDay()] : undefined;
  const active = !!(fer?.enabled && dayName && days.includes(dayName));
  const ferGenders = active ? (fer?.genders ?? []).map((g) => String(g).toLowerCase()) : [];
  const allGendersFree = active && ["women", "men", "couple"].every((g) => ferGenders.includes(g));
  return {
    active,
    allGendersFree,
    isTierFree: (g) => active && ferGenders.includes(g),
  };
}

interface ScanResult {
  // READY            : lookup hit a valid, not-yet-finalized booking. The
  //                    actuals sheet is auto-opened so the manager can adjust
  //                    counts and tap Save Actual Entry to finalize.
  // OK               : Save Actual Entry succeeded. Booking is now locked;
  //                    commission/ledger/loyalty/coupon side-effects fired.
  // ALREADY_FINALIZED: re-scan of a ticket already saved at the door.
  //                    Read-only summary; no further edits.
  // ALREADY_CHECKED_OUT: guest already left for the night.
  code: string;
  status?:
    | "ready_to_finalize"
    | "finalized"
    | "already_finalized"
    | "ready_to_check_out"
    | "checked_out"
    | "already_checked_out";
  checkedOutAt?: string | null;
  justCheckedOut?: boolean;
  // True only when this exact Save Actual Entry request burned the ticket.
  // False for grace-window duplicates (manager double-taps Save).
  justFinalized?: boolean;
  recentlyFinalized?: boolean;
  finalized?: boolean;
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
  // Bump this to force the occupancy + bookings panels to refetch immediately
  // after a successful auto check-in, instead of waiting for the next poll.
  const [panelsTick, setPanelsTick] = useState(0);
  // Auto-open the actuals sheet on a READY lookup so the manager can
  // immediately edit counts and tap Save Actual Entry — the only path
  // that finalizes the booking and updates analytics/commission.
  // ALREADY_FINALIZED is shown as a read-only summary (sheet stays closed).
  useEffect(() => {
    if (result?.booking && result.code === "READY") {
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
      // Lookup only — the scan no longer auto-finalizes. Server returns
      // READY (open the actuals sheet) or ALREADY_FINALIZED (locked,
      // show read-only summary). ZERO writes happen here; the manager
      // taps Save Actual Entry inside the sheet to finalize.
      const res = await customFetch<ScanResult>("/api/partner/scan-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      setResult(res);
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string; checkedInAt?: string; booking?: BookingData };
      setResult({
        code: err.code ?? "ERROR",
        message: err.message ?? "Network error. Try again.",
        checkedInAt: err.checkedInAt,
        booking: err.booking,
      });
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

  // Check-out flow (Task #581): re-POST to /partner/checkout-ticket with
  // confirm:true to flip checkedOut → true and decrement live occupancy.
  const [checkingOut, setCheckingOut] = useState(false);
  const checkout = async () => {
    const bookingId = result?.booking?.id ?? null;
    if (!bookingId || checkingOut) return;
    setCheckingOut(true);
    try {
      // Use the generated client (no hand-rolled fetch). Pass bookingId since
      // we already have the booking from a successful scan — skips ticket-code
      // parsing on the server.
      const res = (await partnerCheckoutTicket({ bookingId, confirm: true })) as ScanResult;
      setResult(res);
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string; checkedOutAt?: string; booking?: BookingData };
      setResult({
        code: err.code ?? "ERROR",
        message: err.message ?? "Check-out failed.",
        checkedOutAt: err.checkedOutAt ?? null,
        booking: err.booking,
      });
    } finally {
      setCheckingOut(false);
    }
  };

  useEffect(() => {
    if (
      result &&
      result.code !== "READY" &&
      result.code !== "OK" &&
      result.code !== "ALREADY_FINALIZED"
    ) {
      const t = setTimeout(() => manualInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [result]);

  // Color the result banner by the new lookup/finalize status:
  //   READY (lookup OK, not yet finalized)        → primary
  //   OK / finalized / grace-window dup           → green
  //   ALREADY_FINALIZED (locked re-scan)          → orange
  //   ready_to_check_out / checked_out            → purple/green
  //   anything else (not found, network, etc.)    → red
  const resultColor = result == null ? "#ef4444"
    : result.status === "ready_to_check_out" ? "#a855f7"
    : result.status === "checked_out" || result.justCheckedOut ? "#22c55e"
    : result.status === "already_checked_out" ? "#f97316"
    : result.code === "OK" ? "#22c55e"
    : result.code === "READY" ? colors.primary
    : result.code === "ALREADY_FINALIZED" ? "#f97316"
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
                  name={
                    result.code === "OK" ? "checkmark-circle"
                      : result.code === "READY" ? "scan-outline"
                      : result.code === "ALREADY_FINALIZED" ? "lock-closed"
                      : "close-circle"
                  }
                  size={28}
                  color={resultColor}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultTitle, { color: resultColor }]}>
                  {result.code === "OK" ? "Entry finalized"
                    : result.code === "READY" ? "Ticket valid · confirm headcount"
                    : result.code === "ALREADY_FINALIZED" ? "Already finalized"
                    : "Invalid ticket"}
                </Text>
                {result.checkedInAt && (
                  <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>
                    {result.code === "OK" ? "Saved" : "Was saved"} at {new Date(result.checkedInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                )}
                {result.message && result.code !== "OK" && (
                  <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>{result.message}</Text>
                )}
              </View>
            </View>

            {/* Check-out button — appears for a finalized booking that still
                shows the guest as inside. Re-POSTs to /partner/checkout-ticket. */}
            {result.code === "ALREADY_FINALIZED" && result.booking && result.status !== "checked_out" && result.status !== "already_checked_out" && (
              <TouchableOpacity
                onPress={checkout}
                disabled={checkingOut}
                style={{ marginHorizontal: 14, marginBottom: 14, backgroundColor: "#a855f7", borderRadius: 12, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, opacity: checkingOut ? 0.6 : 1 }}
              >
                {checkingOut
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="log-out-outline" size={20} color="#fff" />}
                <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" }}>
                  {checkingOut ? "Checking out…" : "Check out guest"}
                </Text>
              </TouchableOpacity>
            )}

            {result.status === "checked_out" && (
              <View style={{ marginHorizontal: 14, marginBottom: 14, backgroundColor: "#22c55e20", borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#22c55e" }}>
                  Guest checked out{result.checkedOutAt ? ` at ${new Date(result.checkedOutAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}
                </Text>
              </View>
            )}

            {/* "Record actual entry" sheet — opens automatically after a
                successful auto check-in so the manager can log per-tier
                counts and (for COD) collect cash without an extra tap. */}
            {result.booking && (result.code === "OK" || result.code === "ALREADY_CHECKED_IN") && (
              <TouchableOpacity
                onPress={() => setSheetOpen(true)}
                style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <View>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.foreground }}>Record actual entry</Text>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
                    {result.booking.actualAmountDue != null
                      ? result.booking.actualAmountDue === 0
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

        <ScannerPanels externalRefetchKey={panelsTick} />

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
      {result?.booking && result.code === "READY" && (
        <ActualEntrySheet
          booking={result.booking}
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onSaved={(updated, checkedInAt) => {
            // Save Actual Entry succeeded — flip the banner to the green
            // finalized state, refresh the live occupancy + bookings
            // panels, and let the manager move to the next ticket.
            setResult({
              code: "OK",
              status: "finalized",
              finalized: true,
              justFinalized: true,
              checkedInAt,
              booking: updated,
            });
            setPanelsTick((t) => t + 1);
          }}
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
  onSaved: (b: BookingData, checkedInAt: string) => void;
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
  const ferState = bookingFerState(b);
  const wholeBookingFree = ferState.allGendersFree;
  const alreadyRecorded = b.actualWomen != null || b.actualMen != null || b.actualCouple != null || b.actualGuests != null;
  const hasAnyBookedTicket = b.ticketWomen > 0 || b.ticketMen > 0 || b.ticketCouple > 0;
  const shouldRender = (isTicket && hasAnyBookedTicket) || (!isTicket && b.guests > 0);

  // Live total from current stepper state; per-gender zeroing matches server.
  const priceWomen = ferState.isTierFree("women") ? 0 : (b.priceWomen ?? 0);
  const priceMen = ferState.isTierFree("men") ? 0 : (b.priceMen ?? 0);
  const priceCouple = ferState.isTierFree("couple") ? 0 : (b.priceCouple ?? 0);
  const liveTotal = isTicket
    ? w * priceWomen + m * priceMen + c * priceCouple
    : ferState.allGendersFree
      ? 0
      : (g / Math.max(1, b.guests)) * (b.finalPrice ?? 0);
  const liveTotalRounded = Math.round(liveTotal * 100) / 100;
  const subRows = isTicket
    ? [
        { label: "Women", qty: w, price: priceWomen, subtotal: w * priceWomen, free: ferState.isTierFree("women") },
        { label: "Men", qty: m, price: priceMen, subtotal: m * priceMen, free: ferState.isTierFree("men") },
        { label: "Couples", qty: c, price: priceCouple, subtotal: c * priceCouple, free: ferState.isTierFree("couple") },
      ].filter((r) => r.qty > 0)
    : [];

  const submit = async () => {
    setSaving(true);
    try {
      // Save Actual Entry — the sole transaction that finalizes the booking
      // server-side: check-in, commission ledger, vendor commissionOwed,
      // loyalty points, coupon lock, audit log. The lookup-only scan above
      // performed ZERO writes.
      const code = b.ticketCode ?? `RV-${String(b.id).padStart(6, "0")}`;
      const actualEntry = isTicket ? { women: w, men: m, couple: c } : { guests: g };
      const res = await customFetch<{ booking?: BookingData; checkedInAt?: string }>("/api/partner/scan-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, actualEntry }),
      });
      if (res.booking) {
        onSaved(res.booking, res.checkedInAt ?? new Date().toISOString());
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
          {wholeBookingFree ? (
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
                      <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: r.free ? "#22c55e" : "#fcd34d" }}>
                        {r.label} · {r.qty}{r.free ? " · FREE ENTRY" : ` × ₹${r.price.toLocaleString("en-IN")}`}
                      </Text>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: r.free ? "#22c55e" : "#fcd34d" }}>
                        {r.free ? "₹0" : `₹${r.subtotal.toLocaleString("en-IN")}`}
                      </Text>
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

// ─── Occupancy + bookings panels (Task #581) ───────────────────────────────
type ScannerLiveStatus = "notArrived" | "inside" | "checkedOut";

function ScannerPanels({ externalRefetchKey = 0 }: { externalRefetchKey?: number }) {
  // Lift a "mutation tick" so a successful checkout in the bookings panel
  // forces an immediate refresh in the occupancy panel above instead of
  // waiting for the next 15s poll. `externalRefetchKey` is bumped by the
  // parent after a successful auto check-in so both panels refresh too.
  const [tick, setTick] = useState(0);
  const combinedKey = tick + externalRefetchKey;
  return (
    <>
      <ScannerOccupancyPanel refetchKey={combinedKey} />
      <ScannerBookingsPanel onCheckedOut={() => setTick((t) => t + 1)} externalRefetchKey={externalRefetchKey} />
    </>
  );
}

function ScannerOccupancyPanel({ refetchKey = 0 }: { refetchKey?: number }) {
  const colors = useColors();
  const [data, setData] = useState<ApiOccupancyResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      // Generated client function — keeps the URL + response shape in sync
      // with the OpenAPI contract instead of hand-rolled customFetch calls.
      getPartnerScannerOccupancy()
        .then((r) => { if (!cancelled) setData(r); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [refetchKey]);

  if (!data || data.rows.length === 0) return null;

  return (
    <View style={{ marginHorizontal: 16, marginTop: 24, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground }}>Live occupancy</Text>
        <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{data.today}</Text>
      </View>
      {data.rows.map((r) => {
        const pct = r.capacity > 0 ? r.occupancyPercent : 0;
        const barColor = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#22c55e";
        return (
          <View key={r.vendorId} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{r.businessName}</Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.foreground }}>{r.currentlyInside}{r.capacity > 0 ? ` / ${r.capacity}` : ""}</Text>
            </View>
            {r.capacity > 0 && (
              <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" }}>
                <View style={{ width: `${Math.min(100, pct)}%`, height: "100%", backgroundColor: barColor }} />
              </View>
            )}
            <Text style={{ fontSize: 10, color: colors.mutedForeground }}>
              {r.checkedInCount} in · {r.checkedOutCount} out · {r.notArrivedCount} pending
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ScannerBookingsPanel({ onCheckedOut, externalRefetchKey = 0 }: { onCheckedOut: () => void; externalRefetchKey?: number }) {
  const colors = useColors();
  const [rows, setRows] = useState<ApiScannerBookingRow[]>([]);
  const [statuses, setStatuses] = useState<Set<ScannerLiveStatus>>(() => new Set());
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [vendorFilter, setVendorFilter] = useState<number | "all">("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);

  const statusKey = Array.from(statuses).sort().join(",");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Generated client function — typed params object stays aligned with the
    // OpenAPI contract (status csv, q, from/to range, optional vendorId).
    getPartnerScannerBookings({
      ...(statuses.size > 0 ? { status: Array.from(statuses).join(",") } : {}),
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(from && to ? { from, to } : {}),
      ...(typeof vendorFilter === "number" ? { vendorId: vendorFilter } : {}),
    })
      .then((r) => { if (!cancelled) setRows(r.rows); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [statusKey, statuses, q, from, to, vendorFilter, tick, externalRefetchKey]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 20000);
    return () => clearInterval(id);
  }, []);

  // Authoritative vendor scope — fetched from the server, never derived from
  // the current booking rows. A manager assigned to a pub with zero bookings
  // today still appears in the dropdown.
  const [vendorOptions, setVendorOptions] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    customFetch<{ vendors: { id: number; businessName: string }[] }>("/api/partner/scanner/allowed-vendors")
      .then((r) => {
        if (cancelled) return;
        const opts = r.vendors.map((v) => ({ id: v.id, name: v.businessName }));
        setVendorOptions(opts);
        // When the user has exactly one allowed pub, lock the filter to that
        // vendorId so the table can never show another partner's pub. The
        // venue chip strip is hidden in this case.
        if (opts.length === 1) setVendorFilter(opts[0]!.id);
      })
      .catch(() => { if (!cancelled) setVendorOptions([]); });
    return () => { cancelled = true; };
  }, []);

  const toggleStatus = (s: ScannerLiveStatus) => {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const checkout = async (row: ApiScannerBookingRow) => {
    setBusyId(row.id);
    try {
      // Prefer bookingId path now that the server accepts it — avoids any
      // ticket-code parsing edge cases for an already-known row.
      await partnerCheckoutTicket({ bookingId: row.id, confirm: true });
      setTick((t) => t + 1);
      onCheckedOut();
    } catch {
      // Surface via row UI on next refresh; keep panel resilient
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={{ marginHorizontal: 16, marginTop: 16, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 10 }}>
      <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground }}>Today's bookings</Text>
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
      {vendorOptions.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ flexGrow: 0 }}>
          <TouchableOpacity onPress={() => setVendorFilter("all")}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, backgroundColor: vendorFilter === "all" ? colors.primary : colors.muted, borderColor: vendorFilter === "all" ? colors.primary : colors.border }}>
            <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: vendorFilter === "all" ? colors.primaryForeground : colors.mutedForeground }}>All venues</Text>
          </TouchableOpacity>
          {vendorOptions.map((v) => (
            <TouchableOpacity key={v.id} onPress={() => setVendorFilter(v.id)}
              style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, backgroundColor: vendorFilter === v.id ? colors.primary : colors.muted, borderColor: vendorFilter === v.id ? colors.primary : colors.border }}>
              <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: vendorFilter === v.id ? colors.primaryForeground : colors.mutedForeground }} numberOfLines={1}>{v.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
        <TouchableOpacity onPress={() => setStatuses(new Set())}
          style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, backgroundColor: statuses.size === 0 ? colors.primary : colors.muted, borderColor: statuses.size === 0 ? colors.primary : colors.border }}>
          <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: statuses.size === 0 ? colors.primaryForeground : colors.mutedForeground }}>All</Text>
        </TouchableOpacity>
        {(["notArrived", "inside", "checkedOut"] as const).map((s) => (
          <TouchableOpacity key={s} onPress={() => toggleStatus(s)}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, backgroundColor: statuses.has(s) ? colors.primary : colors.muted, borderColor: statuses.has(s) ? colors.primary : colors.border }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: statuses.has(s) ? colors.primaryForeground : colors.mutedForeground }}>
              {s === "notArrived" ? "Not arrived" : s === "inside" ? "Inside" : "Checked out"}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {loading && rows.length === 0 ? (
        <ActivityIndicator color={colors.primary} />
      ) : rows.length === 0 ? (
        <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center", paddingVertical: 12 }}>No bookings.</Text>
      ) : (
        rows.map((r) => {
          const pax = r.pubMode === "ticket" ? r.ticketWomen + r.ticketMen + r.ticketCouple * 2 : r.guests;
          const statusColor = r.liveStatus === "inside" ? "#22c55e" : r.liveStatus === "checkedOut" ? "#f59e0b" : colors.mutedForeground;
          return (
            <View key={r.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{r.personName || r.userName}</Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: statusColor + "20" }}>
                  <Text style={{ fontSize: 10, color: statusColor, fontFamily: "Inter_600SemiBold" }}>
                    {r.liveStatus === "inside" ? "INSIDE" : r.liveStatus === "checkedOut" ? "OUT" : "PENDING"}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                {r.ticketCode} · {pax} pax{r.phone ? ` · ${r.phone}` : ""}
              </Text>
              {r.liveStatus === "inside" && (
                <TouchableOpacity
                  onPress={() => checkout(r)}
                  disabled={busyId === r.id}
                  style={{ marginTop: 4, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "#a855f720", borderWidth: 1, borderColor: "#a855f7", flexDirection: "row", alignItems: "center", gap: 6, opacity: busyId === r.id ? 0.6 : 1 }}
                >
                  {busyId === r.id
                    ? <ActivityIndicator size="small" color="#a855f7" />
                    : <Ionicons name="log-out-outline" size={14} color="#a855f7" />}
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#a855f7" }}>Check out</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}
    </View>
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
