import { Ionicons } from "@expo/vector-icons";
import { customFetch, useListMyBookings, getListMyBookingsQueryKey } from "@workspace/api-client-react";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

type BookingStatus = "pending" | "payment_pending" | "confirmed" | "cancelled" | "completed";

const STATUS_STYLE: Record<BookingStatus, { bg: string; text: string }> = {
  pending:         { bg: "#f59e0b20", text: "#f59e0b" },
  payment_pending: { bg: "#f97316" + "20", text: "#f97316" },
  confirmed:       { bg: "#22c55e20", text: "#22c55e" },
  cancelled:       { bg: "#ef444420", text: "#ef4444" },
  completed:       { bg: "#6366f120", text: "#6366f1" },
};

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

interface ManagerInvitation {
  id: number;
  vendorName: string;
  createdAt: string;
}

interface ExtendedBooking {
  personName?: string;
  userName?: string;
  ticketWomen?: number;
  ticketMen?: number;
  ticketCouple?: number;
  approvedBy?: string;
  finalPrice?: number;
  cancellationAllowed?: boolean;
  checkedIn?: boolean;
  eventType_?: string;
  pubMode?: string;
  couponCode?: string;
  pointsUsed?: number;
  eventCity?: string;
  selectedPubEvent?: string;
  freeEntryRules?: {
    enabled?: boolean;
    genders?: string[];
    days?: string[];
    beforeTime?: string | null;
  } | null;
}

export default function BookingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();

  const statusLabels: Record<BookingStatus, string> = {
    pending: t("bookings.status_pending"),
    payment_pending: t("bookings.status_payment_pending"),
    confirmed: t("bookings.status_confirmed"),
    cancelled: t("bookings.status_cancelled"),
    completed: t("bookings.status_completed"),
  };
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [invitations, setInvitations] = useState<ManagerInvitation[]>([]);
  const [actingInvId, setActingInvId] = useState<number | null>(null);
  const [managedVendors, setManagedVendors] = useState<{ id: number; businessName: string }[]>([]);
  const [cancelModalBooking, setCancelModalBooking] = useState<null | { id: number; eventTitle: string; bookingDate: string }>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [sharingId, setSharingId] = useState<number | null>(null);
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const appState = useRef(AppState.currentState);

  const handleCancelBooking = async () => {
    if (!cancelModalBooking) return;
    if (!cancelReason.trim()) {
      Alert.alert(t("bookings.reason_required_title"), t("bookings.reason_required_body"));
      return;
    }
    setCancelLoading(true);
    try {
      await customFetch(`/api/bookings/${cancelModalBooking.id}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancellationReason: cancelReason.trim() }),
      });
      setCancelModalBooking(null);
      setCancelReason("");
      refetch();
      Alert.alert(t("bookings.cancelled_success"), t("bookings.cancelled_success_msg"));
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert(t("bookings.cancel_failed_title"), err?.message ?? t("bookings.cancel_failed_desc"));
    } finally {
      setCancelLoading(false);
    }
  };

  const handleShareTicket = async (b: NonNullable<typeof data>[number]) => {
    const bx = b as typeof b & ExtendedBooking;
    const ticketCode = b.ticketCode ?? `RV-${String(b.id).padStart(6, "0")}`;
    const esc = (v: unknown) =>
      String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    setSharingId(b.id);
    try {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(ticketCode)}&color=1a1008&bgcolor=ffffff`;
      const ticketBreakdown = [
        bx.ticketWomen ? `${bx.ticketWomen}× ${t("bookings.women")}` : "",
        bx.ticketMen ? `${bx.ticketMen}× ${t("bookings.men")}` : "",
        bx.ticketCouple ? `${bx.ticketCouple}× ${t("bookings.couple")}` : "",
      ].filter(Boolean).join(" · ") || `${b.guests} ${t("bookings.guests_label")}`;

      const priceNumber = bx.finalPrice != null
        ? Number(bx.finalPrice)
        : b.totalPrice != null
        ? Number(b.totalPrice)
        : null;
      const isFreeBooking = Number(bx.finalPrice ?? b.totalPrice ?? 0) === 0;
      const price = priceNumber != null ? `₹${priceNumber.toLocaleString("en-IN")}` : "—";

      const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#0c0810;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}
.ticket{background:linear-gradient(145deg,#14090f 0%,#1e0e1a 45%,#100c18 100%);border:1px solid rgba(212,168,83,.35);border-radius:20px;max-width:600px;width:100%;overflow:hidden;}
.top{padding:28px 28px 20px;}
.brand-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}
.brand{font-size:9px;letter-spacing:5px;text-transform:uppercase;color:rgba(212,168,83,.55);}
.code-badge{font-size:10px;font-family:monospace;color:rgba(212,168,83,.7);background:rgba(212,168,83,.08);border:1px solid rgba(212,168,83,.2);padding:3px 10px;border-radius:6px;letter-spacing:.1em;}
.hero{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;}
.venue{font-size:26px;color:#d4a853;font-weight:700;line-height:1.15;margin-bottom:6px;}
.event-name{font-size:14px;color:rgba(255,255,255,.7);margin-bottom:3px;}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:14px 20px;margin-top:18px;}
.lbl{font-size:8px;text-transform:uppercase;letter-spacing:2.5px;color:rgba(212,168,83,.45);margin-bottom:3px;}
.val{font-size:13px;color:rgba(255,255,255,.85);font-weight:500;}
.qr-block{display:flex;flex-direction:column;align-items:center;gap:6px;flex-shrink:0;}
.qr-frame{background:#fff;border:2px solid rgba(212,168,83,.45);border-radius:12px;padding:8px;}
.qr-frame img{display:block;width:130px;height:130px;}
.qr-venue{font-size:8px;color:rgba(212,168,83,.5);letter-spacing:1px;text-align:center;max-width:130px;word-break:break-word;text-transform:uppercase;}
.perf{display:flex;align-items:center;margin:0 -1px;}
.notch{width:16px;height:32px;background:#0c0810;border-radius:0 16px 16px 0;}
.notch-r{border-radius:16px 0 0 16px;}
.dash{flex:1;border-top:2px dashed rgba(212,168,83,.22);}
.tear{font-family:monospace;font-size:15px;letter-spacing:3px;color:#d4a853;text-align:center;padding:10px 0;}
.footer{display:flex;justify-content:space-between;align-items:center;padding:16px 28px 24px;}
.price-lbl{font-size:8px;text-transform:uppercase;letter-spacing:2px;color:rgba(212,168,83,.45);margin-bottom:3px;}
.price{font-size:26px;color:#d4a853;font-weight:700;}
.disclaimer{font-size:9px;color:rgba(255,255,255,.22);text-align:right;line-height:1.7;max-width:180px;}
</style></head><body>
<div class="ticket">
  <div class="top">
    <div class="brand-row">
      <span class="brand">ROYVENTO</span>
      <span class="code-badge">${esc(ticketCode)}</span>
    </div>
    <div class="hero">
      <div style="flex:1;min-width:0;">
        <div class="venue">${esc(bx.vendorName ?? b.eventTitle)}</div>
        <div class="event-name">${esc(b.eventTitle)}</div>
        <div class="fields">
          <div><div class="lbl">${esc(t("bookings.guest"))}</div><div class="val">${esc(bx.personName || bx.userName || "—")}</div></div>
          <div><div class="lbl">${esc(t("bookings.date"))}</div><div class="val">${esc(b.bookingDate)}</div></div>
          <div><div class="lbl">${esc(t("bookings.tickets"))}</div><div class="val">${esc(ticketBreakdown)}</div></div>
          <div><div class="lbl">${esc(t("bookings.approved_by"))}</div><div class="val">${esc(bx.approvedBy || t("bookings.partner"))}</div></div>
        </div>
      </div>
      <div class="qr-block">
        <div class="qr-frame"><img src="${qrUrl}" alt="QR Code"/></div>
        <div class="qr-venue">${esc(bx.vendorName)}</div>
      </div>
    </div>
  </div>
  <div class="perf"><div class="notch"></div><div class="dash"></div><div class="notch notch-r"></div></div>
  <div class="tear">${esc(ticketCode)}</div>
  <div class="footer">
    ${isFreeBooking ? "<div></div>" : `<div><div class="price-lbl">${esc(t("bookings.amount_paid"))}</div><div class="price">${esc(price)}</div></div>`}
    <div class="disclaimer">${esc(t("bookings.present_at_entrance"))}<br/>Royvento</div>
  </div>
</div>
</body></html>`;

      const result = await Print.printToFileAsync({ html, base64: false });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(result.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: t("bookings.share_ticket") });
      } else {
        Alert.alert(t("bookings.sharing_unavailable"), t("bookings.sharing_unavailable_msg"));
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert(t("common.error"), err?.message ?? t("bookings.pdf_error"));
    } finally {
      setSharingId(null);
    }
  };

  const { data, isLoading, refetch } = useListMyBookings({ query: { queryKey: getListMyBookingsQueryKey(), enabled: !!user } });

  useEffect(() => {
    if (!user) return;
    customFetch<ManagerInvitation[]>("/api/manager/invitations").then(setInvitations).catch(() => {});
    customFetch<{ id: number; businessName: string }[]>("/api/manager/my-vendors").then(setManagedVendors).catch(() => {});
  }, [user?.id]);

  const respondToInvitation = async (id: number, action: "accept" | "reject") => {
    setActingInvId(id);
    try {
      await customFetch(`/api/manager/invitations/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
      if (action === "accept") {
        customFetch<{ id: number; businessName: string }[]>("/api/manager/my-vendors").then(setManagedVendors).catch(() => {});
      }
    } catch {
      Alert.alert(t("common.error"), t("bookings.invitation_error"));
    } finally {
      setActingInvId(null);
    }
  };

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        refetch();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [refetch]);

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.header, { paddingTop: topPadding + 12, borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("bookings.title")}</Text>
        </View>
        <EmptyState
          icon="ticket-outline"
          title={t("bookings.sign_in_title")}
          subtitle={t("bookings.sign_in_sub_screen")}
          action={{ label: t("auth.sign_in"), onPress: () => router.push("/(auth)/login") }}
        />
      </View>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (data ?? []).filter(
    (b) => b.bookingDate >= today && b.status !== "cancelled"
  );
  const past = (data ?? []).filter(
    (b) => b.bookingDate < today || b.status === "cancelled" || b.status === "completed"
  );
  const shown = tab === "upcoming" ? upcoming : past;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={[
          styles.header,
          { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("bookings.title")}</Text>
          {(managedVendors.length > 0 || user.role === "vendor") && (
            <TouchableOpacity
              style={[styles.scanBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push("/scanner" as never)}
            >
              <Ionicons name="scan-outline" size={16} color={colors.primaryForeground} />
              <Text style={[styles.scanBtnText, { color: colors.primaryForeground }]}>Scan</Text>
            </TouchableOpacity>
          )}
        </View>
        {invitations.map((inv) => (
          <View key={inv.id} style={[styles.invitationBanner, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "50" }]}>
            <Ionicons name="notifications-outline" size={16} color={colors.primary} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.invTitle, { color: colors.foreground }]}>
                {inv.vendorName} invited you as scanner manager
              </Text>
              <View style={styles.invBtns}>
                <TouchableOpacity
                  style={[styles.invBtn, { backgroundColor: colors.primary }, actingInvId === inv.id && { opacity: 0.7 }]}
                  disabled={actingInvId === inv.id}
                  onPress={() => respondToInvitation(inv.id, "accept")}
                >
                  <Text style={[styles.invBtnText, { color: colors.primaryForeground }]}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.invBtn, { borderWidth: 1, borderColor: colors.border }, actingInvId === inv.id && { opacity: 0.7 }]}
                  disabled={actingInvId === inv.id}
                  onPress={() => respondToInvitation(inv.id, "reject")}
                >
                  <Text style={[styles.invBtnText, { color: colors.mutedForeground }]}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
        {managedVendors.map((v) => (
          <TouchableOpacity
            key={v.id}
            style={[styles.managedVenueRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push("/scanner" as never)}
            activeOpacity={0.75}
          >
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.primary} />
            <Text style={[styles.managedVenueText, { color: colors.foreground }]} numberOfLines={1}>
              {t("bookings.managing")}: {v.businessName}
            </Text>
            <Ionicons name="scan-outline" size={14} color={colors.primary} style={{ marginLeft: "auto" }} />
            <Text style={{ fontSize: 11, color: colors.primary, marginLeft: 3 }}>{t("profile.scan_ticket")}</Text>
          </TouchableOpacity>
        ))}
        <View style={[styles.tabs, { backgroundColor: colors.muted }]}>
          {(["upcoming", "past"] as const).map((tabKey) => (
            <Pressable
              key={tabKey}
              onPress={() => setTab(tabKey)}
              style={[styles.tabBtn, tab === tabKey && { backgroundColor: colors.primary }]}
            >
              <Text
                style={[styles.tabText, { color: tab === tabKey ? colors.primaryForeground : colors.mutedForeground }]}
              >
                {tabKey === "upcoming"
                  ? `${t("bookings.upcoming")} (${upcoming.length})`
                  : `${t("bookings.past")} (${past.length})`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {shown.length === 0 ? (
        <>
          <EmptyState
            icon="ticket-outline"
            title={tab === "upcoming" ? t("bookings.no_upcoming") : t("bookings.no_past")}
            subtitle={tab === "upcoming" ? t("bookings.no_upcoming_sub") : t("bookings.no_past_sub")}
            action={
              tab === "upcoming"
                ? { label: t("profile.explore_events"), onPress: () => router.push("/(tabs)/explore") }
                : undefined
            }
          />
          <MobileFooter />
        </>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(b) => String(b.id)}
          contentContainerStyle={[styles.list, { paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }]}
          onRefresh={refetch}
          refreshing={isLoading}
          scrollEnabled={!!(shown?.length)}
          ListFooterComponent={<MobileFooter />}
          renderItem={({ item: b }) => {
            const status = (b.status ?? "pending") as BookingStatus;
            const meta = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
            const statusLabel = statusLabels[status] ?? statusLabels.pending;
            const isExpanded = expandedId === b.id;
            const qrValue = b.ticketCode ?? `RV-${String(b.id).padStart(6, "0")}`;
            const bx = b as typeof b & ExtendedBooking;

            return (
              <Pressable
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setExpandedId(isExpanded ? null : b.id)}
              >
                {/* Event Image Banner */}
                {b.eventImage ? (
                  <Image
                    source={{ uri: b.eventImage }}
                    style={styles.eventBanner}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.eventBanner, styles.eventBannerPlaceholder, { backgroundColor: colors.muted }]}>
                    <Ionicons name="musical-notes" size={28} color={colors.mutedForeground} />
                  </View>
                )}

                <TouchableOpacity
                  style={styles.viewEventBtn}
                  onPress={() => router.push(`/event/${b.eventId}` as never)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="arrow-forward-outline" size={12} color={colors.primary} />
                  <Text style={[styles.viewEventText, { color: colors.primary }]}>View Event</Text>
                </TouchableOpacity>

                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                      {b.eventTitle ?? `Booking #${b.id}`}
                    </Text>
                    <Text style={[styles.bookingRef, { color: colors.mutedForeground }]}>
                      {b.ticketCode ?? `RV-${String(b.id).padStart(6, "0")}`}
                    </Text>
                    <View style={styles.metaRow}>
                      <Ionicons name="calendar-outline" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                        {formatDate(b.bookingDate)}
                      </Text>
                    </View>
                    <View style={styles.metaRow}>
                      <Ionicons name="people-outline" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                        {b.guests} guest{b.guests !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 8 }}>
                    <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.statusText, { color: meta.text }]}>{statusLabel}</Text>
                    </View>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={14}
                      color={colors.mutedForeground}
                    />
                  </View>
                </View>

                {/* Confirmed ticket — premium design */}
                {isExpanded && status === "confirmed" && (
                  <LinearGradient
                    colors={["#14090f", "#1e0e1a", "#100c18"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.premiumTicket}
                  >
                    {/* Top bar: brand + status */}
                    <View style={styles.ptTopBar}>
                      <Text style={styles.ptBrand}>ROYVENTO</Text>
                      <View style={styles.ptConfirmedBadge}>
                        <Ionicons name="checkmark-circle" size={11} color="#22c55e" />
                        <Text style={styles.ptConfirmedText}>{t("bookings.status_confirmed")}</Text>
                      </View>
                    </View>

                    {/* Venue name hero */}
                    <Text style={styles.ptVenueName} numberOfLines={2}>{bx.vendorName ?? b.eventTitle}</Text>
                    <Text style={styles.ptEventTitle} numberOfLines={2}>{b.eventTitle}</Text>

                    {/* Details grid */}
                    <View style={styles.ptFieldsRow}>
                      <View style={styles.ptField}>
                        <Text style={styles.ptFieldLabel}>{t("bookings.guest")}</Text>
                        <Text style={styles.ptFieldValue}>{bx.personName || bx.userName || "—"}</Text>
                      </View>
                      <View style={styles.ptField}>
                        <Text style={styles.ptFieldLabel}>{t("bookings.date")}</Text>
                        <Text style={styles.ptFieldValue}>{formatDate(b.bookingDate)}</Text>
                      </View>
                    </View>
                    <View style={styles.ptFieldsRow}>
                      <View style={styles.ptField}>
                        <Text style={styles.ptFieldLabel}>{t("bookings.tickets")}</Text>
                        <Text style={styles.ptFieldValue}>
                          {(() => {
                            const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
                            const fer = bx.freeEntryRules ?? null;
                            const dayName = b.bookingDate ? days[new Date(`${b.bookingDate}T12:00:00`).getDay()] : undefined;
                            const active = !!(fer?.enabled && dayName && Array.isArray(fer.days) && fer.days.includes(dayName));
                            const ferGenders = active ? (fer?.genders ?? []).map((g) => String(g).toLowerCase()) : [];
                            const isFree = (g: "women" | "men" | "couple") => active && ferGenders.includes(g);
                            const tag = (n: number, lbl: string, g: "women" | "men" | "couple") =>
                              isFree(g) ? `${n}× ${lbl} (${t("bookings.free_entry") ?? "free"})` : `${n}× ${lbl}`;
                            const parts = [
                              bx.ticketWomen ? tag(bx.ticketWomen, t("bookings.women"), "women") : "",
                              bx.ticketMen ? tag(bx.ticketMen, t("bookings.men"), "men") : "",
                              bx.ticketCouple ? tag(bx.ticketCouple, t("bookings.couple"), "couple") : "",
                            ].filter(Boolean);
                            return parts.join("  ") || `${b.guests} ${t("bookings.guests_label")}`;
                          })()}
                        </Text>
                      </View>
                      <View style={styles.ptField}>
                        <Text style={styles.ptFieldLabel}>{t("bookings.approved_by")}</Text>
                        <Text style={[styles.ptFieldValue, { textTransform: "capitalize" }]}>{bx.approvedBy || t("bookings.partner")}</Text>
                      </View>
                    </View>

                    {/* QR code block */}
                    <View style={styles.ptQrBlock}>
                      <View style={styles.ptQrFrame}>
                        <QRCode value={qrValue} size={160} backgroundColor="#ffffff" color="#1a1008" />
                      </View>
                      <Text style={styles.ptQrVenue} numberOfLines={1}>{bx.vendorName ?? ""}</Text>
                    </View>

                    {/* Perforated divider */}
                    <View style={styles.ptPerfRow}>
                      <View style={styles.ptNotch} />
                      <View style={styles.ptPerf} />
                      <View style={[styles.ptNotch, styles.ptNotchR]} />
                    </View>

                    {/* Ticket code */}
                    <Text style={styles.ptCode}>{qrValue}</Text>

                    {/* Footer: price + disclaimer */}
                    <View style={styles.ptFooter}>
                      {Number(bx.finalPrice ?? b.totalPrice ?? 0) > 0 && (
                        <View style={styles.ptPriceRow}>
                          <Text style={styles.ptPriceLabel}>{t("bookings.total_label")}</Text>
                          <Text style={styles.ptPriceValue}>
                            {bx.finalPrice != null
                              ? `₹${Number(bx.finalPrice).toLocaleString("en-IN")}`
                              : b.totalPrice != null
                              ? `₹${Number(b.totalPrice).toLocaleString("en-IN")}`
                              : "—"}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.ptFooterHint}>{t("bookings.present_at_entrance")}</Text>
                    </View>
                  </LinearGradient>
                )}

                {/* Action bar for confirmed bookings */}
                {isExpanded && status === "confirmed" && (
                  <View style={[styles.actionBar, { borderTopColor: colors.border }]}>
                    {/* Share Ticket — only for pub ticket mode */}
                    {bx.pubMode === "ticket" && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: "#d4a85318", borderColor: "rgba(212,168,83,0.35)" }]}
                        disabled={sharingId === b.id}
                        onPress={() => handleShareTicket(b)}
                        activeOpacity={0.75}
                      >
                        {sharingId === b.id ? (
                          <ActivityIndicator size="small" color="#d4a853" />
                        ) : (
                          <Ionicons name="share-outline" size={15} color="#d4a853" />
                        )}
                        <Text style={[styles.actionBtnText, { color: "#d4a853" }]}>
                          {sharingId === b.id ? t("common.loading") : t("bookings.download_ticket")}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Cancel Booking */}
                    {bx.checkedIn ? (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.muted, borderColor: colors.border, opacity: 0.6 }]}
                        onPress={() => Alert.alert(t("bookings.cannot_cancel_title"), t("bookings.cannot_cancel_scanned"))}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="checkmark-circle-outline" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.actionBtnText, { color: colors.mutedForeground }]}>{t("bookings.checked_in")}</Text>
                      </TouchableOpacity>
                    ) : bx.cancellationAllowed === false ? (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.muted, borderColor: colors.border, opacity: 0.6 }]}
                        onPress={() => Alert.alert(t("bookings.cancellation_closed"), t("bookings.cancellation_closed_msg_full"))}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="close-circle-outline" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.actionBtnText, { color: colors.mutedForeground }]}>{t("bookings.cancellation_closed")}</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: "#ef444418", borderColor: "rgba(239,68,68,0.35)" }]}
                        onPress={() => setCancelModalBooking({ id: b.id, eventTitle: b.eventTitle ?? `Booking #${b.id}`, bookingDate: b.bookingDate })}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="trash-outline" size={15} color="#ef4444" />
                        <Text style={[styles.actionBtnText, { color: "#ef4444" }]}>{t("bookings.cancel")}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Payment pending — retry button */}
                {isExpanded && status === "payment_pending" && (
                  <View style={[styles.expandedInfo, { borderTopColor: colors.border }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <Ionicons name="alert-circle-outline" size={16} color="#f97316" />
                      <Text style={[styles.expandedText, { color: "#f97316", fontFamily: "Inter_600SemiBold" }]}>
                        {t("bookings.payment_pending_msg")}
                      </Text>
                    </View>
                    <Text style={[styles.expandedText, { color: colors.mutedForeground }]}>
                      {t("bookings.status_payment_pending")}
                    </Text>
                    <TouchableOpacity
                      style={[styles.retryBtn, { backgroundColor: "#f97316" }, retryingId === b.id && { opacity: 0.7 }]}
                      disabled={retryingId === b.id}
                      onPress={async () => {
                        setRetryingId(b.id);
                        try {
                          const result = await customFetch<{ redirectUrl?: string; error?: string }>(
                            `/api/bookings/${b.id}/retry-payment`,
                            {
                              method: "POST",
                              body: JSON.stringify({ callbackScheme: "royvento" }),
                              headers: { "Content-Type": "application/json" },
                            },
                          );
                          if (result?.redirectUrl) {
                            const browserResult = await WebBrowser.openAuthSessionAsync(result.redirectUrl, "royvento://");
                            if (browserResult.type === "success") {
                              const parsed = new URL(browserResult.url);
                              const payment = parsed.searchParams.get("payment") ?? "failed";
                              const id = parsed.searchParams.get("id") ?? undefined;
                              router.replace(`/payment-result?payment=${encodeURIComponent(payment)}${id ? `&bookingId=${encodeURIComponent(id)}` : ""}`);
                            } else {
                              router.replace("/payment-result?payment=failed");
                            }
                          } else {
                            throw new Error(result?.error ?? "Could not initiate payment");
                          }
                        } catch (e: unknown) {
                          const err = e as { message?: string };
                          router.push(`/event/${b.eventId}` as never);
                          console.warn("[retry-payment] fallback to event page:", err?.message);
                        } finally {
                          setRetryingId(null);
                        }
                      }}
                    >
                      {retryingId === b.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="card-outline" size={15} color="#fff" />
                          <Text style={styles.retryBtnText}>Complete Payment</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {/* Expanded details for other non-confirmed bookings */}
                {isExpanded && status !== "confirmed" && status !== "payment_pending" && (
                  <View style={[styles.expandedInfo, { borderTopColor: colors.border }]}>
                    <Text style={[styles.expandedText, { color: colors.mutedForeground }]}>
                      {statusLabel}
                      {status === "pending" ? ` — ${t("bookings.awaiting_approval")}` : ""}
                    </Text>
                    {b.notes ? (
                      <Text style={[styles.expandedText, { color: colors.mutedForeground }]}>
                        {t("bookings.notes")}: {b.notes}
                      </Text>
                    ) : null}
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}

      {/* Cancel Booking Modal */}
      <Modal
        visible={!!cancelModalBooking}
        transparent
        animationType="slide"
        onRequestClose={() => { setCancelModalBooking(null); setCancelReason(""); }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <Pressable style={styles.modalOverlay} onPress={() => { setCancelModalBooking(null); setCancelReason(""); }}>
            <Pressable style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("bookings.cancel_dialog_title")}</Text>
              <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                {t("bookings.cancel_dialog_desc")}
                {cancelModalBooking ? ` "${cancelModalBooking.eventTitle}" — ${cancelModalBooking.bookingDate}` : ""}
              </Text>
              <Text style={[styles.modalLabel, { color: colors.foreground }]}>{t("bookings.reason_for_cancellation")}</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                placeholder={t("bookings.reason_placeholder")}
                placeholderTextColor={colors.mutedForeground}
                value={cancelReason}
                onChangeText={setCancelReason}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!cancelLoading}
              />
              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={[styles.modalBtn, { borderWidth: 1, borderColor: colors.border }]}
                  onPress={() => { setCancelModalBooking(null); setCancelReason(""); }}
                  disabled={cancelLoading}
                >
                  <Text style={[styles.modalBtnText, { color: colors.foreground }]}>{t("bookings.keep_booking")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: "#ef4444" }, (cancelLoading || !cancelReason.trim()) && { opacity: 0.5 }]}
                  onPress={handleCancelBooking}
                  disabled={cancelLoading || !cancelReason.trim()}
                >
                  {cancelLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={[styles.modalBtnText, { color: "#fff" }]}>{t("bookings.confirm_cancellation")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, gap: 12 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  scanBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  scanBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  invitationBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  invTitle: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  invBtns: { flexDirection: "row", gap: 8, marginTop: 8 },
  invBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  invBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  managedVenueRow: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, marginTop: 6 },
  managedVenueText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  tabs: { flexDirection: "row", borderRadius: 10, padding: 3 },
  tabBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: "center" },
  tabText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  list: { padding: 20, gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  eventBanner: { width: "100%", height: 120 },
  eventBannerPlaceholder: { alignItems: "center", justifyContent: "center" },
  viewEventBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingVertical: 6 },
  viewEventText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cardTop: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  bookingRef: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 6, opacity: 0.7 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 },
  meta: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  ticket: { borderTopWidth: 1, padding: 16, alignItems: "center", gap: 10 },
  ticketHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  ticketTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  ticketRef: { fontSize: 12, fontFamily: "Inter_400Regular", letterSpacing: 0.5 },
  qrWrap: { padding: 12, borderRadius: 12 },
  qrHint: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  expandedInfo: { borderTopWidth: 1, padding: 14, gap: 6 },
  expandedText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  retryBtn: { marginTop: 10, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  retryBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },

  premiumTicket: { marginTop: 0, borderRadius: 0, overflow: "hidden", padding: 0 },
  ptTopBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  ptBrand: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 5, textTransform: "uppercase", color: "rgba(212,168,83,0.55)" },
  ptConfirmedBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(34,197,94,0.12)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  ptConfirmedText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#22c55e" },
  ptVenueName: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#d4a853", paddingHorizontal: 20, lineHeight: 28, letterSpacing: -0.3 },
  ptEventTitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.65)", paddingHorizontal: 20, marginTop: 3, lineHeight: 19 },
  ptFieldsRow: { flexDirection: "row", paddingHorizontal: 20, marginTop: 14, gap: 0 },
  ptField: { flex: 1 },
  ptFieldLabel: { fontSize: 8, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 2, color: "rgba(212,168,83,0.45)", marginBottom: 3 },
  ptFieldValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.85)" },
  ptQrBlock: { alignItems: "center", paddingHorizontal: 20, paddingTop: 20, gap: 8 },
  ptQrFrame: { padding: 10, backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 2, borderColor: "rgba(212,168,83,0.45)" },
  ptQrVenue: { fontSize: 9, fontFamily: "Inter_400Regular", color: "rgba(212,168,83,0.5)", letterSpacing: 1, textTransform: "uppercase" },
  ptPerfRow: { flexDirection: "row", alignItems: "center", marginTop: 18, marginHorizontal: 0 },
  ptNotch: { width: 18, height: 36, backgroundColor: "rgba(12,8,16,0.7)", borderTopRightRadius: 18, borderBottomRightRadius: 18 },
  ptNotchR: { borderTopRightRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: 18, borderBottomLeftRadius: 18 },
  ptPerf: { flex: 1, borderTopWidth: 2, borderStyle: "dashed", borderColor: "rgba(212,168,83,0.22)" },
  ptCode: { fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace", fontSize: 17, fontWeight: "700", letterSpacing: 4, color: "#d4a853", textAlign: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  ptFooter: { alignItems: "center", paddingHorizontal: 20, paddingBottom: 20, paddingTop: 4, gap: 6 },
  ptPriceRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  ptPriceLabel: { fontSize: 9, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 2, color: "rgba(212,168,83,0.45)" },
  ptPriceValue: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#d4a853" },
  ptFooterHint: { fontSize: 9, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.2)", letterSpacing: 0.5, textAlign: "center" },

  actionBar: { flexDirection: "row", gap: 10, padding: 14, borderTopWidth: 1, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, flex: 1 },
  actionBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, gap: 12 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  modalSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  modalLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  modalInput: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 80 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modalBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
