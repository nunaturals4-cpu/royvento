import { resolveImageUrl } from "@/lib/resolveImageUrl";
import { Ionicons } from "@expo/vector-icons";
import {
  customFetch,
  getAdminLiveOccupancy,
  getGetAdminAnalyticsQueryKey,
  getGetAdminBookingsReportQueryKey,
  getGetAdminLeadsSummaryQueryKey,
  useDeleteReview,
  useGetAdminAnalytics,
  useGetAdminBookingsReport,
  useGetAdminLeadsSummary,
  useListReviewsAdmin,
  useUpdateReview,
} from "@workspace/api-client-react";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uploadImageToStorage } from "@/lib/uploadImage";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type AdminTab = "analytics" | "bookings" | "events" | "vendors" | "users" | "subscriptions" | "coupons" | "content" | "messages" | "booking-report" | "crm-leads" | "announcements" | "reports" | "commissions" | "settlements" | "live-occupancy" | "reviews" | "plans" | "create-pub" | "venues" | "event-organizers" | "game-organizers" | "solo-connect" | "private-parties";

const ANALYTICS_DATE_PRESETS: { key: string; label: string; days: number | null }[] = [
  { key: "all", label: "All time", days: null },
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "3m", label: "3 months", days: 90 },
  { key: "6m", label: "6 months", days: 180 },
];

interface ContactMessage {
  id: number;
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  createdAt: string;
}

interface TopUser {
  userId: number;
  name: string;
  email: string;
  phone: string;
  totalTickets: number;
  bookingCount: number;
}

interface TopPub {
  vendorId: number;
  businessName: string;
  city: string;
  totalTickets: number;
  bookingCount: number;
}

interface CrmLead {
  id: number;
  vendorId: number;
  vendorName: string;
  vendorCity: string;
  viewerUserId: number | null;
  viewerName: string;
  viewerEmail: string;
  viewedAt: string;
  converted: boolean;
}
interface CrmSummary {
  totalViews: number; allTimeTotalViews: number; knownLeads: number; anonymousVisitors: number;
  conversions: number; conversionRate: number;
  vendors: { vendorId: number; vendorName: string; vendorCity: string; totalViews: number; knownLeads: number; anonymousVisitors: number; conversions: number; conversionRate: number }[];
}

interface AdminVendor {
  id: number;
  businessName: string;
  category: string;
  status: string;
  location: string;
  isPremium: boolean;
  createdAt: string;
  baseFeeEnabled?: boolean;
  baseFeePercent?: string;
  crowdLevel?: string | null;
}

interface VendorManagerRow {
  id: number;
  invitedEmail: string;
  status: string;
  manager?: { name?: string; email?: string } | null;
}

interface VendorRequest {
  id: number;
  userId: number;
  businessName: string;
  category: string;
  message: string;
  status: string;
  createdAt: string;
  user?: { name: string; email: string; phone: string };
}

interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  phone?: string;
  createdAt: string;
}

interface AdminAnnouncement {
  id: number;
  title: string;
  body: string;
  announceDate: string;
  announceTime: string;
  imageUrl: string | null;
  isFeaturedSlider: boolean;
  vendorId: number;
  vendorName: string;
  createdAt: string;
}

interface PendingAnnouncement {
  id: number;
  title: string;
  body: string;
  announceDate: string;
  announceTime: string;
  imageUrl: string | null;
  price: string;
  genre: string;
  eventType: string;
  vendorId: number;
  vendorName: string;
  createdAt: string;
}

// Mirrors artifacts/royvento/src/lib/navItems.ts — key is the stable identifier
// persisted in site_settings → hidden_nav_links; never rename once shipped.
const MOBILE_NAV_ITEMS: { key: string; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "tonight-plans", label: "Tonight Plans" },
  { key: "pubs", label: "Pubs & Clubs" },
  { key: "events", label: "Events" },
  { key: "games", label: "Games & Sports" },
  { key: "pub-offers", label: "Happy Hours" },
  { key: "solo-connect", label: "Solo Connect" },
  { key: "private-parties", label: "Create & Join Private Parties" },
];

interface SliderOrganizerEvent {
  id: number;
  title: string;
  slug: string;
  category: string;
  imageUrl: string | null;
  approvalStatus: string;
  isFeaturedSlider: boolean;
  startDate: string | null;
  organizerName: string;
}

interface AdminVendorFull {
  id: number;
  businessName: string;
  category: string;
  status: string;
  city: string;
  state: string;
  country: string;
  userEmail: string;
  eventCount: number;
  createdAt: string;
}

interface AdminCheckinRow {
  id: number;
  vendorId: number;
  vendorName: string;
  eventId: number;
  eventTitle: string;
  userId: number;
  userName: string;
  userEmail: string;
  phone: string;
  bookingDate: string;
  guests: number;
  status: string;
  checkedIn: boolean;
  checkedInAt: string | null;
}

interface AdminCheckinStats {
  total: number;
  checkedIn: number;
  notArrived: number;
}

interface AdminCheckinResponse {
  rows: AdminCheckinRow[];
  stats: AdminCheckinStats;
  total: number;
  page: number;
  totalPages: number;
}

interface AdminEvent {
  id: number;
  title: string;
  city: string;
  status: string;
  approvalStatus: string;
  vendorId: number;
  partnerName?: string;
  createdAt: string;
  popular?: boolean;
  featured?: boolean;
  dateNight?: boolean;
  hidden?: boolean;
}

interface AdminBooking {
  id: number;
  guestName: string;
  eventTitle: string;
  status: string;
  finalPrice: number;
  createdAt: string;
  ticketCode: string;
}

interface AdminSubscription {
  id: number;
  userName: string;
  userEmail: string;
  planType: string;
  planPeriod: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

interface AdminCoupon {
  id: number;
  code: string;
  discountPercent: number;
  used: boolean;
  userName?: string;
  userEmail?: string;
  createdAt: string;
  expiresAt?: string;
}

interface AdminAd {
  id: number;
  vendorId: number;
  vendorName: string;
  message: string;
  status: string;
  createdAt: string;
}

interface AdminBlog {
  id: number;
  title: string;
  slug: string;
  // Full fields are needed so the edit modal can prefill from the list payload
  // without an extra GET. Optional only because legacy responses may omit them.
  excerpt?: string;
  content?: string;
  imageUrl?: string;
  authorName?: string;
  tags?: string[];
  published: boolean;
  createdAt: string;
}

// Shape held by the mobile blog editor while the user is typing. `tags` is a
// CSV string here (matching the web form's UX); we split + trim on save.
interface BlogEditorForm {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  imageUrl: string;
  authorName: string;
  tags: string;
  published: boolean;
}
const EMPTY_BLOG_FORM: BlogEditorForm = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  imageUrl: "",
  authorName: "Royvento Editorial",
  tags: "",
  published: true,
};

// ─── AdminSettlementsTab ──────────────────────────────────────────────────────

interface AdminSettlementRow {
  id: number;
  vendorId: number;
  businessName: string | null;
  city: string | null;
  amount: string;
  status: string;
  adminNote: string;
  requestedAt: string;
  processedAt: string | null;
  bankingDetails: { accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string; } | null;
}

function AdminSettlementsTab({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [requests, setRequests] = useState<AdminSettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [processing, setProcessing] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const rows = await customFetch<AdminSettlementRow[]>(`/api/admin/settlement-requests${qs}`);
      setRequests(rows ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [statusFilter]);

  async function approve(id: number) {
    setProcessing(id);
    try {
      await customFetch(`/api/admin/settlement-requests/${id}/approve`, { method: "POST" });
      await loadData();
    } catch { /* ignore */ } finally { setProcessing(null); }
  }

  async function reject(id: number) {
    setProcessing(id);
    try {
      await customFetch(`/api/admin/settlement-requests/${id}/reject`, { method: "POST", body: JSON.stringify({ note: rejectNote }) });
      setRejectingId(null); setRejectNote("");
      await loadData();
    } catch { /* ignore */ } finally { setProcessing(null); }
  }

  const FILTERS: Array<typeof statusFilter> = ["all", "pending", "approved", "rejected"];

  function statusColor(status: string) {
    if (status === "approved") return { bg: "#22c55e20", text: "#22c55e" };
    if (status === "rejected") return { bg: "#ef444420", text: "#ef4444" };
    return { bg: "#f59e0b20", text: "#f59e0b" };
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
      {/* Filter row */}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setStatusFilter(f)}
            style={{ borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: statusFilter === f ? colors.primary : colors.muted, borderWidth: 1, borderColor: statusFilter === f ? colors.primary : colors.border }}
          >
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: statusFilter === f ? colors.primaryForeground : colors.foreground, textTransform: "capitalize" }}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>Loading…</Text>
      ) : requests.length === 0 ? (
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>No settlement requests found.</Text>
      ) : (
        requests.map((r) => {
          const sc = statusColor(r.status);
          return (
            <View key={r.id} style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.foreground }}>{r.businessName ?? `Vendor #${r.vendorId}`}</Text>
                  {r.city ? <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>{r.city}</Text> : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <View style={{ backgroundColor: sc.bg, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: sc.text, fontFamily: "Inter_600SemiBold", fontSize: 11, textTransform: "capitalize" }}>{r.status}</Text>
                  </View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: colors.primary }}>₹{Number(r.amount).toLocaleString("en-IN")}</Text>
                </View>
              </View>

              {r.bankingDetails ? (
                <View style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.primary + "40", backgroundColor: colors.primary + "0D", padding: 12, gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="card-outline" size={13} color={colors.primary} />
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: colors.primary, textTransform: "uppercase", letterSpacing: 0.8 }}>Banking Details</Text>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {[
                      { label: "Account Holder", value: r.bankingDetails.accountHolderName },
                      { label: "Bank", value: r.bankingDetails.bankName },
                      { label: "Account No.", value: r.bankingDetails.accountNumber },
                      { label: "IFSC Code", value: r.bankingDetails.ifscCode },
                    ].map((f) => (
                      <View key={f.label} style={{ minWidth: "45%", flex: 1 }}>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>{f.label}</Text>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.foreground, marginTop: 1 }}>{f.value}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={{ borderRadius: 10, borderWidth: 1, borderColor: "#f59e0b40", backgroundColor: "#f59e0b10", padding: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="warning-outline" size={13} color="#f59e0b" />
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#f59e0b", flex: 1 }}>No banking details on record</Text>
                </View>
              )}

              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>
                Requested: {new Date(r.requestedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                {r.adminNote ? `  ·  ${r.adminNote}` : ""}
              </Text>

              {r.status === "pending" && (
                rejectingId === r.id ? (
                  <View style={{ gap: 8 }}>
                    <TextInput
                      value={rejectNote}
                      onChangeText={setRejectNote}
                      placeholder="Rejection reason (optional)"
                      placeholderTextColor={colors.mutedForeground}
                      multiline
                      style={{ backgroundColor: colors.muted, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 10, fontFamily: "Inter_400Regular", fontSize: 13, color: colors.foreground, minHeight: 60 }}
                    />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity onPress={() => { setRejectingId(null); setRejectNote(""); }} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
                        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.foreground }}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => reject(r.id)} disabled={processing === r.id} style={{ flex: 2, backgroundColor: "#ef4444", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
                        <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{processing === r.id ? "Rejecting…" : "Confirm Reject"}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity onPress={() => setRejectingId(r.id)} style={{ flex: 1, borderWidth: 1, borderColor: "#ef444440", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
                      <Text style={{ color: "#ef4444", fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => approve(r.id)} disabled={processing === r.id} style={{ flex: 2, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
                      <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{processing === r.id ? "Approving…" : "Approve"}</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

// ─── AdminCommissionsTab ──────────────────────────────────────────────────────

interface CommissionVendor {
  id: number;
  businessName: string;
  city: string;
}

interface CommissionRates {
  freeEntryRate: string;
  ticketRate: string;
  tableBookingRate: string;
  vipTableBookingRate: string;
  eventRate: string;
  coverChargeRate: string;
  eventCommissionEnabled: boolean;
}

const DEFAULT_COMMISSION_RATES: CommissionRates = {
  freeEntryRate: "0",
  ticketRate: "0",
  tableBookingRate: "0",
  vipTableBookingRate: "0",
  eventRate: "0",
  coverChargeRate: "0",
  eventCommissionEnabled: true,
};

interface CommissionReportBookingLine {
  id: number;
  finalPrice: number;
  bookingType: "free_entry" | "ticket" | "table" | "event_booking" | "cover_charge" | "vip_table";
  commissionRate: number;
  unitCount: number;
  commissionAmount: number;
  createdAt: string;
}

interface CommissionReportVendorRow {
  vendorId: number;
  businessName: string;
  city: string;
  appliedRates: CommissionRates;
  totalBookings: number;
  totalRevenue: number;
  totalCommission: number;
  freeEntryCount: number;
  freeEntryRevenue: number;
  freeEntryCommission: number;
  ticketCount: number;
  ticketRevenue: number;
  ticketCommission: number;
  tableCount: number;
  tableRevenue: number;
  tableCommission: number;
  eventBookingCount: number;
  eventBookingRevenue: number;
  eventBookingCommission: number;
  coverChargeCount: number;
  coverChargeRevenue: number;
  coverChargeCommission: number;
  vipTableCount: number;
  vipTableRevenue: number;
  vipTableCommission: number;
  vipTablePeople: number;
  bookings: CommissionReportBookingLine[];
}

interface CommissionReport {
  rows: CommissionReportVendorRow[];
  totals: { totalBookings: number; totalRevenue: number; totalCommission: number; collectedCommission: number; pendingCommission: number };
}

interface GameCommissionRow { id: number; name: string; organizerName: string; commissionPct: string; }
function AdminOtherCommissionsPanel({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [partyType, setPartyType] = useState<"fixed" | "percentage">("percentage");
  const [partyValue, setPartyValue] = useState("10");
  const [savingParty, setSavingParty] = useState(false);
  const [games, setGames] = useState<GameCommissionRow[]>([]);
  const [packages, setPackages] = useState<GameCommissionRow[]>([]);
  const [gameDrafts, setGameDrafts] = useState<Record<string, string>>({});
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    customFetch<{ commissionType: "fixed" | "percentage"; value: number }>("/api/admin/create-your-party/commission")
      .then((c) => { setPartyType(c.commissionType); setPartyValue(String(c.value)); }).catch(() => {});
    customFetch<GameCommissionRow[]>("/api/admin/games").then(setGames).catch(() => {});
    customFetch<GameCommissionRow[]>("/api/admin/game-packages").then(setPackages).catch(() => {});
  }, []);

  async function saveParty() {
    setSavingParty(true);
    try {
      await customFetch("/api/admin/create-your-party/commission", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commissionType: partyType, value: Number(partyValue) || 0 }) });
      Alert.alert("Saved", "Party commission updated.");
    } catch (e) { Alert.alert("Save failed", (e as Error).message); }
    finally { setSavingParty(false); }
  }

  async function saveItemCommission(kind: "game" | "package", id: number) {
    const key = `${kind}-${id}`;
    const val = gameDrafts[key];
    if (val === undefined) return;
    setSavingItem(key);
    try {
      const path = kind === "game" ? `/api/admin/games/${id}/commission` : `/api/admin/game-packages/${id}/commission`;
      await customFetch(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commissionPct: Number(val) || 0 }) });
      const setter = kind === "game" ? setGames : setPackages;
      setter((prev) => prev.map((r) => (r.id === id ? { ...r, commissionPct: val } : r)));
    } catch (e) { Alert.alert("Save failed", (e as Error).message); }
    finally { setSavingItem(null); }
  }

  return (
    <View style={{ gap: 16 }}>
      <View>
        <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, color: colors.mutedForeground, marginBottom: 8 }}>CREATE-YOUR-PARTY COMMISSION</Text>
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["percentage", "fixed"] as const).map((t) => (
              <TouchableOpacity key={t} onPress={() => setPartyType(t)} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: "center", borderColor: partyType === t ? colors.primary : colors.border, backgroundColor: partyType === t ? colors.primary + "22" : "transparent" }}>
                <Text style={{ color: partyType === t ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>{t === "percentage" ? "% of price" : "Fixed ₹"}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            value={partyValue} onChangeText={setPartyValue} keyboardType="number-pad" placeholder="Value"
            placeholderTextColor={colors.mutedForeground}
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: colors.foreground, fontSize: 13, backgroundColor: colors.muted }}
          />
          <TouchableOpacity onPress={saveParty} disabled={savingParty} style={{ borderRadius: 10, paddingVertical: 11, alignItems: "center", backgroundColor: colors.primary, opacity: savingParty ? 0.7 : 1 }}>
            <Text style={{ color: colors.primaryForeground, fontSize: 13, fontFamily: "Inter_700Bold" }}>{savingParty ? "Saving…" : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View>
        <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, color: colors.mutedForeground }}>GAME ORGANIZER COMMISSION ({games.length + packages.length})</Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
        {expanded && (
          <View style={{ gap: 8 }}>
            {[...games.map((g) => ({ ...g, kind: "game" as const })), ...packages.map((p) => ({ ...p, kind: "package" as const }))].map((row) => {
              const key = `${row.kind}-${row.id}`;
              const draft = gameDrafts[key] ?? row.commissionPct;
              return (
                <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>{row.name}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{row.organizerName} · {row.kind}</Text>
                  </View>
                  <TextInput
                    value={draft} onChangeText={(v) => setGameDrafts((p) => ({ ...p, [key]: v }))} keyboardType="number-pad"
                    style={{ width: 56, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, color: colors.foreground, fontSize: 12, backgroundColor: colors.muted, textAlign: "center" }}
                  />
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>%</Text>
                  <TouchableOpacity onPress={() => saveItemCommission(row.kind, row.id)} disabled={savingItem === key} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.primary, opacity: savingItem === key ? 0.6 : 1 }}>
                    <Text style={{ color: colors.primaryForeground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Save</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

function AdminCommissionsTab({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [vendors, setVendors] = useState<CommissionVendor[]>([]);
  const [rates, setRates] = useState<Record<number, CommissionRates>>({});
  const [drafts, setDrafts] = useState<Record<number, CommissionRates>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [rateErrors, setRateErrors] = useState<Record<number, boolean>>({});
  const [report, setReport] = useState<CommissionReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedVendor, setExpandedVendor] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  function loadVendors() {
    setLoading(true);
    customFetch<{ data: AdminVendorFull[]; total: number; page: number; totalPages: number }>("/api/admin/vendors?limit=500")
      .then((res) => {
        const approved = (res?.data ?? []).filter((v) => v.status === "approved");
        setVendors(approved.map((v) => ({ id: v.id, businessName: v.businessName, city: v.city })));
        return approved;
      })
      .then(async (approved) => {
        const rateMap: Record<number, CommissionRates> = {};
        const errorMap: Record<number, boolean> = {};
        await Promise.all(
          approved.map(async (v) => {
            try {
              const r = await customFetch<CommissionRates>(`/api/admin/vendors/${v.id}/commission`);
              rateMap[v.id] = r;
              errorMap[v.id] = false;
            } catch {
              rateMap[v.id] = { ...DEFAULT_COMMISSION_RATES };
              errorMap[v.id] = true;
            }
          }),
        );
        setRates(rateMap);
        setRateErrors(errorMap);
        setDrafts(
          Object.fromEntries(Object.entries(rateMap).map(([k, v]) => [k, { ...v }])),
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function loadReport() {
    setReportLoading(true);
    const params = new URLSearchParams();
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const qs = params.toString();
    customFetch<CommissionReport>(`/api/admin/commission-report${qs ? `?${qs}` : ""}`)
      .then((r) => setReport(r))
      .catch(() => setReport(null))
      .finally(() => setReportLoading(false));
  }

  useEffect(() => {
    loadVendors();
    loadReport();
  }, []);

  async function saveRates(vendorId: number) {
    const draft = drafts[vendorId];
    if (!draft) return;
    setSaving((prev) => ({ ...prev, [vendorId]: true }));
    try {
      const updated = await customFetch<CommissionRates>(`/api/admin/vendors/${vendorId}/commission`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freeEntryRate: Number(draft.freeEntryRate),
          ticketRate: Number(draft.ticketRate),
          tableBookingRate: Number(draft.tableBookingRate),
          vipTableBookingRate: Number(draft.vipTableBookingRate),
          eventRate: Number(draft.eventRate),
          coverChargeRate: Number(draft.coverChargeRate),
          eventCommissionEnabled: draft.eventCommissionEnabled !== false,
        }),
      });
      setRates((prev) => ({ ...prev, [vendorId]: updated }));
      setDrafts((prev) => ({ ...prev, [vendorId]: { ...updated } }));
      setRateErrors((prev) => ({ ...prev, [vendorId]: false }));
      Alert.alert("Saved", "Commission fees updated.");
      loadReport();
    } catch {
      Alert.alert("Error", "Failed to save fees.");
    } finally {
      setSaving((prev) => ({ ...prev, [vendorId]: false }));
    }
  }

  function setDraft(vendorId: number, field: keyof CommissionRates, value: string | boolean) {
    setDrafts((prev) => ({ ...prev, [vendorId]: { ...(prev[vendorId] ?? { ...DEFAULT_COMMISSION_RATES }), [field]: value } }));
  }

  const isDirty = (vendorId: number) => {
    const d = drafts[vendorId];
    const r = rates[vendorId];
    if (!d || !r) return false;
    return (
      d.freeEntryRate !== r.freeEntryRate ||
      d.ticketRate !== r.ticketRate ||
      d.tableBookingRate !== r.tableBookingRate ||
      d.vipTableBookingRate !== (r.vipTableBookingRate ?? "0") ||
      d.eventRate !== (r.eventRate ?? "0") ||
      d.coverChargeRate !== (r.coverChargeRate ?? "0") ||
      (d.eventCommissionEnabled !== false) !== (r.eventCommissionEnabled !== false)
    );
  };

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const bookingTypeLabel = (t: "free_entry" | "ticket" | "table" | "event_booking" | "cover_charge" | "vip_table") =>
    t === "free_entry" ? "Free Entry" : t === "ticket" ? "Ticket" : t === "table" ? "Table" : t === "event_booking" ? "Event" : t === "cover_charge" ? "Cover Charge" : "VIP Table";
  const bookingTypeColor = (t: "free_entry" | "ticket" | "table" | "event_booking" | "cover_charge" | "vip_table") =>
    t === "free_entry" ? "#22c55e" : t === "ticket" ? colors.primary : t === "table" ? "#f59e0b" : t === "event_booking" ? "#8b5cf6" : t === "cover_charge" ? "#0ea5e9" : "#e11d48";

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 100 }}>
      <AdminOtherCommissionsPanel colors={colors} />

      {/* ── Commission Fees Section ── */}
      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, color: colors.mutedForeground }}>
        COMMISSION FEES PER PUB
      </Text>
      {vendors.length === 0 && (
        <View style={{ alignItems: "center", padding: 32, gap: 12 }}>
          <Ionicons name="business-outline" size={40} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14 }}>No approved pubs found.</Text>
        </View>
      )}
      {vendors.map((v) => {
        const draft = drafts[v.id] ?? { ...DEFAULT_COMMISSION_RATES };
        const dirty = isDirty(v.id);
        const isSaving = saving[v.id] ?? false;
        const hasRateError = rateErrors[v.id] ?? false;
        return (
          <View key={v.id} style={{ borderRadius: 14, borderWidth: 1, borderColor: hasRateError ? "#ef4444" : dirty ? colors.primary : colors.border, backgroundColor: colors.card, padding: 14, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{v.businessName}</Text>
                  {hasRateError && (
                    <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: "#ef444420" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_600SemiBold", color: "#ef4444" }}>FEE LOAD FAILED</Text>
                    </View>
                  )}
                </View>
                {v.city ? <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{v.city}</Text> : null}
              </View>
              {dirty && (
                <TouchableOpacity
                  onPress={() => saveRates(v.id)}
                  disabled={isSaving}
                  style={{ borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.primary, opacity: isSaving ? 0.6 : 1 }}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Save</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {(["freeEntryRate", "ticketRate", "tableBookingRate", "vipTableBookingRate", "eventRate", "coverChargeRate"] as const).map((field) => {
                const fieldLabel = field === "ticketRate" || field === "eventRate" || field === "coverChargeRate" ? "% of revenue" : "₹/person";
                const fieldTitle =
                  field === "freeEntryRate" ? "Free Entry" :
                  field === "ticketRate" ? "Ticket" :
                  field === "tableBookingRate" ? "Table" :
                  field === "vipTableBookingRate" ? "VIP Table" :
                  field === "eventRate" ? "Event" : "Cover Charge";
                const disabled = field === "eventRate" && draft.eventCommissionEnabled === false;
                return (
                  <View key={field} style={{ width: "31%", gap: 4, opacity: disabled ? 0.4 : 1 }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>{fieldTitle}</Text>
                    <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{fieldLabel}</Text>
                    <View style={{ borderWidth: 1, borderRadius: 8, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.background }}>
                      <TextInput
                        value={draft[field] as string}
                        onChangeText={(t) => setDraft(v.id, field, t.replace(/[^0-9.]/g, ""))}
                        keyboardType="decimal-pad"
                        editable={!disabled}
                        style={{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 14 }}
                        placeholder="0"
                        placeholderTextColor={colors.mutedForeground}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>Event commission enabled</Text>
              <Switch
                value={draft.eventCommissionEnabled !== false}
                onValueChange={(val) => setDraft(v.id, "eventCommissionEnabled", val)}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
          </View>
        );
      })}

      {/* ── Commission Report Section ── */}
      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, color: colors.mutedForeground, marginTop: 8 }}>
        COMMISSION REPORT
      </Text>

      {/* Date range filter */}
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>FROM (YYYY-MM-DD)</Text>
          <View style={{ borderWidth: 1, borderRadius: 8, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.card }}>
            <TextInput
              value={fromDate}
              onChangeText={setFromDate}
              placeholder="2025-01-01"
              placeholderTextColor={colors.mutedForeground}
              style={{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 13 }}
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>TO (YYYY-MM-DD)</Text>
          <View style={{ borderWidth: 1, borderRadius: 8, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.card }}>
            <TextInput
              value={toDate}
              onChangeText={setToDate}
              placeholder="2025-12-31"
              placeholderTextColor={colors.mutedForeground}
              style={{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 13 }}
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </View>
        <TouchableOpacity
          onPress={loadReport}
          disabled={reportLoading}
          style={{ borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.primary, marginTop: 14, opacity: reportLoading ? 0.6 : 1 }}
        >
          {reportLoading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Filter</Text>}
        </TouchableOpacity>
      </View>

      {/* Totals summary */}
      {report && (
        <View style={{ flexDirection: "row", gap: 10 }}>
          {[
            { label: "Total Bookings", value: String(report.totals.totalBookings), icon: "ticket-outline" as const },
            { label: "Booking Revenue", value: fmt(report.totals.totalRevenue), icon: "cash-outline" as const },
            { label: "Commission Collected", value: fmt(report.totals.totalCommission), icon: "trending-up-outline" as const },
          ].map((kpi) => (
            <View key={kpi.label} style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 6, alignItems: "center" }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + "20", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={kpi.icon} size={16} color={colors.primary} />
              </View>
              <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center" }}>{kpi.value}</Text>
              <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>{kpi.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Per-venue rows */}
      {reportLoading && !report && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
      {report && report.rows.length === 0 && (
        <View style={{ alignItems: "center", padding: 32, gap: 12 }}>
          <Ionicons name="analytics-outline" size={40} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" }}>No confirmed bookings in this date range.</Text>
        </View>
      )}
      {report && report.rows.map((row) => {
        const isExpanded = expandedVendor === row.vendorId;
        return (
          <View key={row.vendorId} style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: "hidden" }}>
            <TouchableOpacity
              onPress={() => setExpandedVendor(isExpanded ? null : row.vendorId)}
              style={{ padding: 14, gap: 8 }}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{row.businessName}</Text>
                  {row.city ? <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{row.city}</Text> : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.primary }}>{fmt(row.totalCommission)}</Text>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>earned</Text>
                </View>
                <Ionicons
                  name={isExpanded ? "chevron-up-outline" : "chevron-down-outline"}
                  size={16}
                  color={colors.mutedForeground}
                  style={{ marginLeft: 10 }}
                />
              </View>
              {/* Breakdown chips */}
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.muted, flexDirection: "row", gap: 4, alignItems: "center" }}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>{row.totalBookings} bookings</Text>
                </View>
                <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.muted, flexDirection: "row", gap: 4, alignItems: "center" }}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>Rev: {fmt(row.totalRevenue)}</Text>
                </View>
                {row.freeEntryCount > 0 && (
                  <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#22c55e20" }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: "#22c55e" }}>Free: {row.freeEntryCount} · {fmt(row.freeEntryCommission)}</Text>
                  </View>
                )}
                {row.ticketCount > 0 && (
                  <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.primary + "20" }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.primary }}>Ticket: {row.ticketCount} · {fmt(row.ticketCommission)}</Text>
                  </View>
                )}
                {row.tableCount > 0 && (
                  <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#f59e0b20" }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: "#f59e0b" }}>Table: {row.tableCount} · {fmt(row.tableCommission)}</Text>
                  </View>
                )}
                {(row.vipTableCount ?? 0) > 0 && (
                  <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#e11d4820" }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: "#e11d48" }}>VIP Table: {row.vipTableCount} · {fmt(row.vipTableCommission)}</Text>
                  </View>
                )}
                {(row.eventBookingCount ?? 0) > 0 && (
                  <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#8b5cf620" }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: "#8b5cf6" }}>Event: {row.eventBookingCount} · {fmt(row.eventBookingCommission)}</Text>
                  </View>
                )}
                {(row.coverChargeCount ?? 0) > 0 && (
                  <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#0ea5e920" }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: "#0ea5e9" }}>Cover Charge: {row.coverChargeCount} · {fmt(row.coverChargeCommission)}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            {/* Expanded: applied fees + individual bookings */}
            {isExpanded && (
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                {/* Applied fees row */}
                <View style={{ flexDirection: "row", gap: 8, padding: 12, backgroundColor: colors.muted + "60" }}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginRight: 4 }}>Fees:</Text>
                  {(["freeEntryRate", "ticketRate", "tableBookingRate", "vipTableBookingRate", "eventRate", "coverChargeRate"] as const).map((field) => {
                    if (field === "eventRate" && row.appliedRates.eventCommissionEnabled === false) return null;
                    const label =
                      field === "freeEntryRate" ? "Free Entry" :
                      field === "ticketRate" ? "Ticket" :
                      field === "tableBookingRate" ? "Table" :
                      field === "vipTableBookingRate" ? "VIP Table" :
                      field === "eventRate" ? "Event" : "Cover Charge";
                    const isPercent = field === "ticketRate" || field === "eventRate" || field === "coverChargeRate";
                    const val = row.appliedRates[field] ?? "0";
                    return (
                      <View key={field} style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.foreground }}>
                          {isPercent ? `${label}: ${val}%` : `${label}: ₹${val}/person`}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                {row.bookings.length === 0 ? (
                  <Text style={{ padding: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>No bookings.</Text>
                ) : row.bookings.map((b) => (
                  <View key={b.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border + "60" }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: bookingTypeColor(b.bookingType) + "20" }}>
                          <Text style={{ fontSize: 9, fontFamily: "Inter_600SemiBold", color: bookingTypeColor(b.bookingType) }}>{bookingTypeLabel(b.bookingType)}</Text>
                        </View>
                        <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>#{b.id}</Text>
                      </View>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                        {new Date(b.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 2 }}>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary }}>{fmt(b.commissionAmount)}</Text>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                        {b.commissionRate > 0
                          ? `₹${b.commissionRate % 1 === 0 ? b.commissionRate.toFixed(0) : b.commissionRate.toFixed(2)} × ${b.unitCount ?? 1} ${b.bookingType === "free_entry" ? ((b.unitCount ?? 1) === 1 ? "person" : "persons") : b.bookingType === "ticket" ? ((b.unitCount ?? 1) === 1 ? "ticket" : "tickets") : "booking"}`
                          : "No fee"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── AdminMessagesTab ─────────────────────────────────────────────────────────
function AdminMessagesTab({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    customFetch<ContactMessage[]>("/api/admin/messages")
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function resolve(id: number) {
    try {
      await customFetch(`/api/admin/messages/${id}`, { method: "DELETE" });
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch {
      Alert.alert("Error", "Failed to resolve message.");
    }
  }

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;
  if (messages.length === 0) return (
    <View style={{ alignItems: "center", justifyContent: "center", padding: 40, gap: 12 }}>
      <Ionicons name="mail-outline" size={40} color={colors.mutedForeground} />
      <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" }}>No contact messages.</Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 100 }}>
      {messages.map((m) => (
        <View key={m.id} style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground, flex: 1 }} numberOfLines={1}>{m.subject || "(no subject)"}</Text>
            <TouchableOpacity onPress={() => Alert.alert("Resolve", "Mark this message as resolved?", [
              { text: "Cancel", style: "cancel" },
              { text: "Resolve", style: "destructive", onPress: () => resolve(m.id) },
            ])}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#22c55e" />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.primary }}>{m.name} · {m.email}{m.phone ? ` · ${m.phone}` : ""}</Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 18 }}>{m.message}</Text>
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
            {new Date(m.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── AdminBookingReportTab ────────────────────────────────────────────────────
function AdminBookingReportTab({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [topPubs, setTopPubs] = useState<TopPub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      customFetch<TopUser[]>("/api/admin/booking-report/top-users"),
      customFetch<TopPub[]>("/api/admin/booking-report/top-pubs"),
    ]).then(([u, p]) => { setTopUsers(u ?? []); setTopPubs(p ?? []); })
      .catch(() => { setTopUsers([]); setTopPubs([]); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 100 }}>
      {/* Top Users */}
      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, color: colors.mutedForeground }}>TOP USERS BY BOOKINGS</Text>
      {topUsers.length === 0 ? (
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>No data available.</Text>
      ) : topUsers.slice(0, 10).map((u, i) => (
        <View key={u.userId} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + "20", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.primary }}>#{i + 1}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{u.name}</Text>
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{u.email}</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.foreground }}>{u.totalTickets} tickets</Text>
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{u.bookingCount} bookings</Text>
          </View>
        </View>
      ))}

      {/* Top Pubs */}
      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, color: colors.mutedForeground, marginTop: 8 }}>TOP VENUES BY REVENUE</Text>
      {topPubs.length === 0 ? (
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>No data available.</Text>
      ) : topPubs.slice(0, 10).map((p, i) => (
        <View key={p.vendorId} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + "20", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.primary }}>#{i + 1}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{p.businessName}</Text>
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{p.city}</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.foreground }}>{p.totalTickets} tickets</Text>
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{p.bookingCount} bookings</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── AdminCrmLeadsTab ─────────────────────────────────────────────────────────
const CRM_DATE_PRESETS = [
  { key: "all", label: "All time", days: null as number | null },
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
];
function crmPresetRange(days: number | null): { startDate?: string; endDate?: string } {
  if (days === null) return {};
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}
function AdminCrmLeadsTab({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [summary, setSummary] = useState<CrmSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [preset, setPreset] = useState("all");
  const [leadType, setLeadType] = useState<"all" | "known" | "anonymous">("all");

  function loadLeads(p: number, append = false) {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    const { startDate, endDate } = crmPresetRange(CRM_DATE_PRESETS.find((x) => x.key === preset)?.days ?? null);
    const q = new URLSearchParams({ page: String(p) });
    if (startDate) q.set("startDate", startDate);
    if (endDate) q.set("endDate", endDate);
    if (leadType === "known") q.set("knownOnly", "true");
    if (leadType === "anonymous") q.set("anonymousOnly", "true");
    customFetch<{ leads: CrmLead[]; total: number; totalPages: number }>(`/api/admin/leads?${q.toString()}`)
      .then((r) => {
        setLeads(append ? (prev) => [...prev, ...(r.leads ?? [])] : (r.leads ?? []));
        setHasMore(p < r.totalPages);
      })
      .catch(() => {})
      .finally(() => { setLoading(false); setLoadingMore(false); });
  }
  function loadSummary() {
    const { startDate, endDate } = crmPresetRange(CRM_DATE_PRESETS.find((x) => x.key === preset)?.days ?? null);
    const q = new URLSearchParams();
    if (startDate) q.set("startDate", startDate);
    if (endDate) q.set("endDate", endDate);
    customFetch<CrmSummary>(`/api/admin/leads/summary?${q.toString()}`).then(setSummary).catch(() => setSummary(null));
  }

  useEffect(() => { setPage(1); loadLeads(1); loadSummary(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [preset, leadType]);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 100 }}>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        {CRM_DATE_PRESETS.map((p) => (
          <TouchableOpacity key={p.key} onPress={() => setPreset(p.key)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: preset === p.key ? colors.primary : colors.border, backgroundColor: preset === p.key ? colors.primary + "22" : "transparent" }}>
            <Text style={{ color: preset === p.key ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        {([["all", "All leads"], ["known", "Known"], ["anonymous", "Anonymous"]] as const).map(([k, label]) => (
          <TouchableOpacity key={k} onPress={() => setLeadType(k)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: leadType === k ? colors.primary : colors.border, backgroundColor: leadType === k ? colors.primary + "22" : "transparent" }}>
            <Text style={{ color: leadType === k ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {summary && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
          {[
            { label: "Total views", value: String(summary.totalViews) },
            { label: "Known leads", value: String(summary.knownLeads) },
            { label: "Anonymous", value: String(summary.anonymousVisitors) },
            { label: "Conversions", value: `${summary.conversions} (${summary.conversionRate}%)` },
          ].map((s) => (
            <View key={s.label} style={{ flexGrow: 1, minWidth: "45%", borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 10 }}>
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>{s.value}</Text>
              <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground, textTransform: "uppercase" }}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, color: colors.mutedForeground, marginTop: 8 }}>{leads.length} LEADS</Text>
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : leads.length === 0 ? (
        <View style={{ alignItems: "center", padding: 32, gap: 12 }}>
          <Ionicons name="person-add-outline" size={40} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" }}>No leads found.</Text>
        </View>
      ) : leads.map((lead) => (
        <View key={lead.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{lead.viewerName || "Anonymous"}</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {lead.converted && (
                <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "#16a34a22" }}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#4ade80" }}>Converted</Text>
                </View>
              )}
              <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.muted }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>{lead.viewerUserId ? "Known" : "Anonymous"}</Text>
              </View>
            </View>
          </View>
          {!!lead.viewerEmail && <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{lead.viewerEmail}</Text>}
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.primary }}>{lead.vendorName}{lead.vendorCity ? ` · ${lead.vendorCity}` : ""}</Text>
          <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
            {new Date(lead.viewedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </Text>
        </View>
      ))}
      {hasMore && (
        <TouchableOpacity
          onPress={() => { const next = page + 1; setPage(next); loadLeads(next, true); }}
          disabled={loadingMore}
          style={{ borderRadius: 12, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: colors.border }}
        >
          {loadingMore ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Load more</Text>}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// ─── AdminVendorCouponsTab: moderate vendor_coupons (pub-level discount codes) ─
interface VendorCouponRow {
  id: number; vendorId: number; vendorName: string; code: string; discountType: string; discountValue: string;
  applicableTo: string; audience: string; active: boolean; maxUses: number | null; usedCount: number; expiresAt: string | null;
}
const VENDOR_COUPON_APPLICABLE = ["both", "ticket", "event", "event_booking", "cover_charge", "vip_table"];
const VENDOR_COUPON_AUDIENCE = ["all", "followers", "non_followers"];
function AdminVendorCouponsTab({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [rows, setRows] = useState<VendorCouponRow[]>([]);
  const [vendors, setVendors] = useState<{ id: number; businessName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [applicableTo, setApplicableTo] = useState("both");
  const [audience, setAudience] = useState("all");
  const [maxUses, setMaxUses] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      customFetch<VendorCouponRow[]>("/api/admin/vendor-coupons"),
      customFetch<{ data: { id: number; businessName: string }[] }>("/api/admin/vendors?limit=200"),
    ]).then(([c, v]) => { setRows(c); setVendors(v.data); }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!vendorId) { Alert.alert("Pick a venue first"); return; }
    setSaving(true);
    try {
      await customFetch("/api/admin/vendor-coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        vendorId, code: code.trim() || undefined, discountType, discountValue: Number(discountValue), applicableTo, audience,
        maxUses: maxUses.trim() ? Math.max(1, parseInt(maxUses) || 1) : null,
      }) });
      setCode(""); setDiscountValue("10"); setMaxUses(""); load();
    } catch (e) { Alert.alert("Create failed", (e as Error).message); }
    finally { setSaving(false); }
  }
  async function toggle(c: VendorCouponRow) {
    try { await customFetch(`/api/admin/vendor-coupons/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !c.active }) }); load(); } catch {}
  }
  function remove(c: VendorCouponRow) {
    Alert.alert("Delete coupon?", c.code, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await customFetch(`/api/admin/vendor-coupons/${c.id}`, { method: "DELETE" }); load(); } catch (e) { Alert.alert("Delete failed", (e as Error).message); } } },
    ]);
  }

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 100 }}>
      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, color: colors.mutedForeground }}>CREATE VENDOR COUPON</Text>
      <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.primary + "30", backgroundColor: colors.card, padding: 12, gap: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {vendors.map((v) => (
              <TouchableOpacity key={v.id} onPress={() => setVendorId(v.id)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: vendorId === v.id ? colors.primary : colors.border, backgroundColor: vendorId === v.id ? colors.primary + "22" : "transparent" }}>
                <Text style={{ color: vendorId === v.id ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }} numberOfLines={1}>{v.businessName}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <TextInput
          value={code} onChangeText={setCode} placeholder="Code (optional, auto-generated)" placeholderTextColor={colors.mutedForeground} autoCapitalize="characters"
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: colors.foreground, fontSize: 13, backgroundColor: colors.muted }}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          {["percent", "fixed"].map((t) => (
            <TouchableOpacity key={t} onPress={() => setDiscountType(t)} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: "center", borderColor: discountType === t ? colors.primary : colors.border, backgroundColor: discountType === t ? colors.primary + "22" : "transparent" }}>
              <Text style={{ color: discountType === t ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>{t === "percent" ? "% off" : "₹ off"}</Text>
            </TouchableOpacity>
          ))}
          <TextInput
            value={discountValue} onChangeText={setDiscountValue} keyboardType="number-pad" placeholder="Value" placeholderTextColor={colors.mutedForeground}
            style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: colors.foreground, fontSize: 13, backgroundColor: colors.muted }}
          />
        </View>
        <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase" }}>Applies to</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {VENDOR_COUPON_APPLICABLE.map((a) => (
              <TouchableOpacity key={a} onPress={() => setApplicableTo(a)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: applicableTo === a ? colors.primary : colors.border, backgroundColor: applicableTo === a ? colors.primary + "22" : "transparent" }}>
                <Text style={{ color: applicableTo === a ? colors.primary : colors.mutedForeground, fontSize: 11, fontFamily: "Inter_500Medium" }}>{a.replace(/_/g, " ")}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase" }}>Audience</Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {VENDOR_COUPON_AUDIENCE.map((a) => (
            <TouchableOpacity key={a} onPress={() => setAudience(a)} style={{ flex: 1, paddingVertical: 7, borderRadius: 999, borderWidth: 1, alignItems: "center", borderColor: audience === a ? colors.primary : colors.border, backgroundColor: audience === a ? colors.primary + "22" : "transparent" }}>
              <Text style={{ color: audience === a ? colors.primary : colors.mutedForeground, fontSize: 11, fontFamily: "Inter_500Medium" }}>{a.replace(/_/g, " ")}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          value={maxUses} onChangeText={(v) => setMaxUses(v.replace(/[^0-9]/g, ""))} placeholder="Max uses (optional)" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad"
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: colors.foreground, fontSize: 13, backgroundColor: colors.muted }}
        />
        <TouchableOpacity onPress={create} disabled={saving} style={{ borderRadius: 10, paddingVertical: 12, alignItems: "center", backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }}>
          <Text style={{ color: colors.primaryForeground, fontSize: 13, fontFamily: "Inter_700Bold" }}>{saving ? "Creating…" : "Create coupon"}</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, color: colors.mutedForeground, marginTop: 8 }}>{rows.length} VENDOR COUPONS</Text>
      {rows.map((c) => (
        <View key={c.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{c.code}</Text>
            <Switch value={c.active} onValueChange={() => toggle(c)} trackColor={{ true: colors.primary }} />
          </View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.primary }}>{c.vendorName}</Text>
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
            {c.discountType === "fixed" ? `₹${c.discountValue}` : `${c.discountValue}%`} off · {c.applicableTo.replace(/_/g, " ")} · {c.audience.replace(/_/g, " ")}
          </Text>
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
            used {c.usedCount}{c.maxUses ? `/${c.maxUses}` : ""}{c.expiresAt ? ` · expires ${new Date(c.expiresAt).toLocaleDateString()}` : ""}
          </Text>
          <TouchableOpacity onPress={() => remove(c)} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
            <Ionicons name="trash-outline" size={13} color="#ef4444" />
            <Text style={{ color: "#ef4444", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Delete</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Admin Plans Tab: plan visibility + featured drink-plan priority ─────────
interface PlanConfig { showGrowthPlan: boolean; showPremiumPartner: boolean; showRoyalPlan: boolean }
interface DrinkPlanRow { id: number; vendorId: number; vendorName: string | null; type: string; productName: string | null; price: number | null; gender: string | null; globalPriority: number | null }

function AdminPlansTab({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [planConfig, setPlanConfig] = useState<PlanConfig>({ showGrowthPlan: true, showPremiumPartner: true, showRoyalPlan: true });
  const [plans, setPlans] = useState<DrinkPlanRow[]>([]);
  const [featured, setFeatured] = useState<DrinkPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPriority, setSavingPriority] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    customFetch<PlanConfig>("/api/plan-config").then(setPlanConfig).catch(() => {});
    customFetch<DrinkPlanRow[]>("/api/admin/drink-plans")
      .then((data) => {
        setPlans(data);
        setFeatured([...data].filter((p) => p.globalPriority !== null).sort((a, b) => (a.globalPriority ?? 999) - (b.globalPriority ?? 999)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function togglePlan(key: keyof PlanConfig) {
    const next = { ...planConfig, [key]: !planConfig[key] };
    setPlanConfig(next);
    try {
      await customFetch("/api/admin/plan-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    } catch { setPlanConfig(planConfig); Alert.alert("Error", "Failed to update plan visibility."); }
  }

  const featuredIds = new Set(featured.map((p) => p.id));
  const available = plans.filter((p) => !featuredIds.has(p.id));
  const planLabel = (p: DrinkPlanRow) => [p.productName || p.type, p.vendorName || "Unknown pub", p.gender && p.gender !== "all" ? `(${p.gender})` : null, p.price ? `₹${p.price}` : null].filter(Boolean).join(" — ");

  function move(idx: number, dir: -1 | 1) {
    setFeatured((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    setDirty(true);
  }
  function addPlan(p: DrinkPlanRow) {
    if (featured.length >= 10) { Alert.alert("Limit reached", "Maximum 10 plans can be featured."); return; }
    setFeatured((prev) => [...prev, p]); setDirty(true);
  }
  function removePlan(id: number) { setFeatured((prev) => prev.filter((p) => p.id !== id)); setDirty(true); }

  async function savePriorities() {
    setSavingPriority(true);
    try {
      await customFetch("/api/admin/drink-plans/priorities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderedIds: featured.map((p) => p.id) }) });
      setDirty(false);
      Alert.alert("Saved", "Featured priority order saved.");
    } catch { Alert.alert("Error", "Failed to save priorities."); }
    finally { setSavingPriority(false); }
  }

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
      {/* Subscription plan visibility */}
      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, color: colors.mutedForeground }}>SUBSCRIPTION PLAN VISIBILITY</Text>
      {([["showGrowthPlan", "Growth Plan"], ["showPremiumPartner", "Premium Partner"], ["showRoyalPlan", "Royal Plan"]] as const).map(([key, label]) => (
        <View key={key} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 12 }}>
          <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>{label}</Text>
          <Switch value={planConfig[key]} onValueChange={() => togglePlan(key)} trackColor={{ true: colors.primary, false: colors.border }} />
        </View>
      ))}

      {/* Featured drink plans */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, color: colors.mutedForeground }}>FEATURED DRINK PLANS ({featured.length}/10)</Text>
        {dirty && (
          <TouchableOpacity onPress={savePriorities} disabled={savingPriority} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 }}>
            {savingPriority ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Save order</Text>}
          </TouchableOpacity>
        )}
      </View>
      {featured.length === 0 && <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>No featured plans. Add from the list below.</Text>}
      {featured.map((p, idx) => (
        <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.primary + "40", backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 10 }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.primary, width: 20 }}>{idx + 1}</Text>
          <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground }} numberOfLines={2}>{planLabel(p)}</Text>
          <TouchableOpacity onPress={() => move(idx, -1)} disabled={idx === 0}><Ionicons name="chevron-up" size={18} color={idx === 0 ? colors.border : colors.foreground} /></TouchableOpacity>
          <TouchableOpacity onPress={() => move(idx, 1)} disabled={idx === featured.length - 1}><Ionicons name="chevron-down" size={18} color={idx === featured.length - 1 ? colors.border : colors.foreground} /></TouchableOpacity>
          <TouchableOpacity onPress={() => removePlan(p.id)}><Ionicons name="close-circle" size={18} color="#ef4444" /></TouchableOpacity>
        </View>
      ))}

      {available.length > 0 && (
        <>
          <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, color: colors.mutedForeground, marginTop: 8 }}>AVAILABLE PLANS</Text>
          {available.map((p) => (
            <TouchableOpacity key={p.id} onPress={() => addPlan(p)} style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 10 }}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground }} numberOfLines={2}>{planLabel(p)}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}

export default function AdminPanelScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("analytics");

  // ─── ANALYTICS ─────────────────────────────────────────────────────────────
  const [analyticsPreset, setAnalyticsPreset] = useState<string>("all");
  const analyticsRange = useMemo(() => {
    const preset = ANALYTICS_DATE_PRESETS.find((p) => p.key === analyticsPreset);
    if (!preset || preset.days === null) return {};
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - preset.days);
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  }, [analyticsPreset]);
  const analyticsQ = useGetAdminAnalytics(analyticsRange, { query: { queryKey: getGetAdminAnalyticsQueryKey(analyticsRange), enabled: activeTab === "analytics" } });
  const leadsQ = useGetAdminLeadsSummary(analyticsRange, { query: { queryKey: getGetAdminLeadsSummaryQueryKey(analyticsRange), enabled: activeTab === "analytics" } });
  const bookingsReportQ = useGetAdminBookingsReport(analyticsRange, { query: { queryKey: getGetAdminBookingsReportQueryKey(analyticsRange), enabled: activeTab === "analytics" } });

  // ─── VENDORS & VENDOR REQUESTS ──────────────────────────────────────────────
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [vendorRequests, setVendorRequests] = useState<VendorRequest[]>([]);
  const [vendorLoading, setVendorLoading] = useState(false);

  const fetchVendors = useCallback(() => {
    setVendorLoading(true);
    Promise.all([
      customFetch<{ data: AdminVendor[]; total: number; page: number; totalPages: number }>("/api/admin/vendors?limit=200"),
      customFetch<VendorRequest[]>("/api/admin/vendor-requests"),
    ])
      .then(([v, vr]) => { setVendors(v.data); setVendorRequests(vr); })
      .catch(() => {})
      .finally(() => setVendorLoading(false));
  }, []);

  async function approveVendorRequest(id: number) {
    try {
      await customFetch(`/api/admin/vendor-requests/${id}/approve`, { method: "POST" });
      fetchVendors();
    } catch {
      Alert.alert("Error", "Failed to approve application.");
    }
  }

  async function rejectVendorRequest(id: number) {
    try {
      await customFetch(`/api/admin/vendor-requests/${id}/reject`, { method: "POST" });
      fetchVendors();
    } catch {
      Alert.alert("Error", "Failed to reject application.");
    }
  }

  // Per-vendor admin controls: base-fee, crowd-level, managers
  async function toggleBaseFee(v: AdminVendor) {
    const next = v.baseFeeEnabled === false;
    try {
      await customFetch(`/api/admin/vendors/${v.id}/base-fee`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseFeeEnabled: next }),
      });
      setVendors((prev) => prev.map((x) => x.id === v.id ? { ...x, baseFeeEnabled: next } : x));
    } catch { Alert.alert("Error", "Failed to update base fee."); }
  }

  async function setVendorCrowdLevel(vendorId: number, level: string | null) {
    try {
      await customFetch(`/api/admin/vendors/${vendorId}/crowd-level`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crowdLevel: level }),
      });
      setVendors((prev) => prev.map((x) => x.id === vendorId ? { ...x, crowdLevel: level } : x));
    } catch { Alert.alert("Error", "Failed to update crowd level."); }
  }

  const [expandedMgrVendor, setExpandedMgrVendor] = useState<number | null>(null);
  const [managersByVendor, setManagersByVendor] = useState<Record<number, VendorManagerRow[]>>({});
  const [mgrLoading, setMgrLoading] = useState(false);

  async function toggleManagers(vendorId: number) {
    if (expandedMgrVendor === vendorId) { setExpandedMgrVendor(null); return; }
    setExpandedMgrVendor(vendorId);
    if (!managersByVendor[vendorId]) {
      setMgrLoading(true);
      try {
        const rows = await customFetch<VendorManagerRow[]>(`/api/admin/vendors/${vendorId}/managers`);
        setManagersByVendor((prev) => ({ ...prev, [vendorId]: rows }));
      } catch { Alert.alert("Error", "Failed to load managers."); }
      finally { setMgrLoading(false); }
    }
  }

  async function removeManager(vendorId: number, mgr: VendorManagerRow) {
    const label = mgr.manager?.name || mgr.invitedEmail;
    Alert.alert("Remove manager?", `Remove "${label}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        try {
          await customFetch(`/api/admin/vendors/${vendorId}/managers/${mgr.id}`, { method: "DELETE" });
          setManagersByVendor((prev) => ({ ...prev, [vendorId]: (prev[vendorId] ?? []).filter((m) => m.id !== mgr.id) }));
        } catch { Alert.alert("Error", "Failed to remove manager."); }
      }},
    ]);
  }

  // ─── USERS ──────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userLoading, setUserLoading] = useState(false);

  const fetchUsers = useCallback(() => {
    setUserLoading(true);
    customFetch<AdminUser[]>("/api/admin/users")
      .then(setUsers)
      .catch(() => {})
      .finally(() => setUserLoading(false));
  }, []);

  // ─── EVENTS ─────────────────────────────────────────────────────────────────
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventFilter, setEventFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [eventRejectingId, setEventRejectingId] = useState<number | null>(null);
  const [eventRejectReason, setEventRejectReason] = useState("");

  const fetchEvents = useCallback(() => {
    setEventLoading(true);
    customFetch<AdminEvent[]>("/api/admin/events")
      .then(setEvents)
      .catch(() => {})
      .finally(() => setEventLoading(false));
  }, []);

  // ─── BOOKINGS ───────────────────────────────────────────────────────────────
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const fetchBookings = useCallback(() => {
    setBookingLoading(true);
    customFetch<AdminBooking[]>("/api/admin/bookings")
      .then(setBookings)
      .catch(() => {})
      .finally(() => setBookingLoading(false));
  }, []);

  // ─── SUBSCRIPTIONS ──────────────────────────────────────────────────────────
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([]);
  const [subLoading, setSubLoading] = useState(false);

  const fetchSubscriptions = useCallback(() => {
    setSubLoading(true);
    customFetch<AdminSubscription[]>("/api/admin/subscriptions")
      .then(setSubscriptions)
      .catch(() => {})
      .finally(() => setSubLoading(false));
  }, []);

  function deleteSubscription(id: number) {
    Alert.alert("Delete subscription?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await customFetch(`/api/admin/subscriptions/${id}`, { method: "DELETE" }); fetchSubscriptions(); }
        catch (e) { Alert.alert("Delete failed", (e as Error).message); }
      } },
    ]);
  }

  // ─── COUPONS ────────────────────────────────────────────────────────────────
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [couponLoading, setCouponLoading] = useState(false);

  const fetchCoupons = useCallback(() => {
    setCouponLoading(true);
    customFetch<AdminCoupon[]>("/api/admin/coupons")
      .then(setCoupons)
      .catch(() => {})
      .finally(() => setCouponLoading(false));
  }, []);

  // ─── ADS ────────────────────────────────────────────────────────────────────
  const [ads, setAds] = useState<AdminAd[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);

  const fetchAds = useCallback(() => {
    setAdsLoading(true);
    customFetch<AdminAd[]>("/api/admin/ads")
      .then(setAds)
      .catch(() => {})
      .finally(() => setAdsLoading(false));
  }, []);

  // ─── BLOGS ──────────────────────────────────────────────────────────────────
  const [blogs, setBlogs] = useState<AdminBlog[]>([]);
  const [blogLoading, setBlogLoading] = useState(false);

  // Editor state mirrors the web blog form (admin.tsx ~L2095). Opening the
  // editor with a non-null id puts it in EDIT mode (PATCH); null id = CREATE
  // mode (POST). Mobile uses a Modal sheet instead of an inline form for
  // ergonomics on a small screen.
  const [blogEditorOpen, setBlogEditorOpen] = useState(false);
  const [editingBlogId, setEditingBlogId] = useState<number | null>(null);
  const [blogForm, setBlogForm] = useState<BlogEditorForm>(EMPTY_BLOG_FORM);
  const [savingBlog, setSavingBlog] = useState(false);
  const [uploadingBlogImage, setUploadingBlogImage] = useState(false);

  async function pickBlogImage() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    setUploadingBlogImage(true);
    try {
      const url = await uploadImageToStorage(res.assets[0].uri, res.assets[0].mimeType ?? undefined);
      setBlogForm((p) => ({ ...p, imageUrl: url }));
    } catch { Alert.alert("Upload failed"); }
    finally { setUploadingBlogImage(false); }
  }

  const openBlogEditor = useCallback((b: AdminBlog | null) => {
    if (b) {
      setEditingBlogId(b.id);
      setBlogForm({
        title: b.title ?? "",
        slug: b.slug ?? "",
        excerpt: b.excerpt ?? "",
        content: b.content ?? "",
        imageUrl: b.imageUrl ?? "",
        authorName: b.authorName ?? "Royvento Editorial",
        tags: (b.tags ?? []).join(", "),
        published: b.published,
      });
    } else {
      setEditingBlogId(null);
      setBlogForm(EMPTY_BLOG_FORM);
    }
    setBlogEditorOpen(true);
  }, []);

  const saveBlog = useCallback(async () => {
    if (!blogForm.title.trim()) {
      Alert.alert("Title required", "Please enter a blog title before saving.");
      return;
    }
    if (!blogForm.slug.trim()) {
      Alert.alert("Slug required", "Please enter a URL slug before saving.");
      return;
    }
    setSavingBlog(true);
    try {
      const body = {
        ...blogForm,
        tags: blogForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
      };
      if (editingBlogId != null) {
        await customFetch(`/api/admin/blogs/${editingBlogId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        Alert.alert("Saved", "Blog post updated.");
      } else {
        await customFetch("/api/admin/blogs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        Alert.alert("Saved", "Blog post created.");
      }
      setBlogEditorOpen(false);
      setEditingBlogId(null);
      setBlogForm(EMPTY_BLOG_FORM);
      fetchBlogs();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not save the blog post.");
    } finally {
      setSavingBlog(false);
    }
  }, [blogForm, editingBlogId]);

  const fetchBlogs = useCallback(() => {
    setBlogLoading(true);
    customFetch<AdminBlog[]>("/api/admin/blogs")
      .then(setBlogs)
      .catch(() => {})
      .finally(() => setBlogLoading(false));
  }, []);

  // ─── ANNOUNCEMENTS ──────────────────────────────────────────────────────────
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [announcementLoading, setAnnouncementLoading] = useState(false);

  const fetchAnnouncements = useCallback(() => {
    setAnnouncementLoading(true);
    customFetch<AdminAnnouncement[]>("/api/admin/announcements")
      .then(setAnnouncements)
      .catch(() => {})
      .finally(() => setAnnouncementLoading(false));
  }, []);

  const [pendingAnnouncements, setPendingAnnouncements] = useState<PendingAnnouncement[]>([]);
  const [pendingAnnouncementLoading, setPendingAnnouncementLoading] = useState(false);
  const [rejectingAnnouncementId, setRejectingAnnouncementId] = useState<number | null>(null);
  const [announcementRejectReason, setAnnouncementRejectReason] = useState("");

  const fetchPendingAnnouncements = useCallback(() => {
    setPendingAnnouncementLoading(true);
    customFetch<PendingAnnouncement[]>("/api/admin/announcements/pending")
      .then(setPendingAnnouncements)
      .catch(() => {})
      .finally(() => setPendingAnnouncementLoading(false));
  }, []);

  async function approveAnnouncement(id: number) {
    try {
      await customFetch(`/api/admin/announcements/${id}/approve`, { method: "PATCH" });
      fetchPendingAnnouncements();
      fetchAnnouncements();
    } catch {
      Alert.alert("Error", "Failed to approve announcement.");
    }
  }

  async function rejectAnnouncement(id: number, reason: string) {
    try {
      await customFetch(`/api/admin/announcements/${id}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: reason.trim() }),
      });
      setRejectingAnnouncementId(null);
      setAnnouncementRejectReason("");
      fetchPendingAnnouncements();
    } catch {
      Alert.alert("Error", "Failed to reject announcement.");
    }
  }

  // ─── SITE NAV VISIBILITY ────────────────────────────────────────────────────
  const [hiddenNavLinks, setHiddenNavLinks] = useState<string[] | null>(null);
  const [savingNavKey, setSavingNavKey] = useState<string | null>(null);

  const fetchNavVisibility = useCallback(() => {
    customFetch<{ hiddenNavLinks: string[] }>("/api/site-settings")
      .then((s) => setHiddenNavLinks(s.hiddenNavLinks ?? []))
      .catch(() => setHiddenNavLinks([]));
  }, []);

  async function toggleNavItem(item: { key: string; label: string }) {
    if (hiddenNavLinks === null) return;
    const isHidden = hiddenNavLinks.includes(item.key);
    const next = isHidden ? hiddenNavLinks.filter((k) => k !== item.key) : [...hiddenNavLinks, item.key];
    setSavingNavKey(item.key);
    setHiddenNavLinks(next);
    try {
      const updated = await customFetch<{ hiddenNavLinks: string[] }>("/api/admin/site-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenNavLinks: next }),
      });
      setHiddenNavLinks(updated.hiddenNavLinks ?? next);
    } catch {
      setHiddenNavLinks(hiddenNavLinks);
      Alert.alert("Error", "Failed to update navigation visibility.");
    } finally {
      setSavingNavKey(null);
    }
  }

  const [organizerEventSlider, setOrganizerEventSlider] = useState<SliderOrganizerEvent[]>([]);
  const [organizerEventSliderLoading, setOrganizerEventSliderLoading] = useState(false);
  const [togglingOrganizerEventSlider, setTogglingOrganizerEventSlider] = useState<number | null>(null);

  const fetchOrganizerEventSlider = useCallback(() => {
    setOrganizerEventSliderLoading(true);
    customFetch<SliderOrganizerEvent[]>("/api/admin/organizer-events")
      .then(setOrganizerEventSlider)
      .catch(() => {})
      .finally(() => setOrganizerEventSliderLoading(false));
  }, []);

  async function toggleOrganizerEventSlider(item: SliderOrganizerEvent) {
    setTogglingOrganizerEventSlider(item.id);
    try {
      const updated = await customFetch<SliderOrganizerEvent>(`/api/admin/organizer-events/${item.id}/slider`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFeaturedSlider: !item.isFeaturedSlider }),
      });
      setOrganizerEventSlider((prev) => prev.map((a) => (a.id === item.id ? { ...a, isFeaturedSlider: updated.isFeaturedSlider } : a)));
    } catch {
      Alert.alert("Error", "Failed to update organizer event.");
    } finally {
      setTogglingOrganizerEventSlider(null);
    }
  }

  // ─── REPORTS ────────────────────────────────────────────────────────────────
  const [checkinData, setCheckinData] = useState<AdminCheckinResponse | null>(null);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [vendorsFull, setVendorsFull] = useState<AdminVendorFull[]>([]);
  const [vendorsFullLoading, setVendorsFullLoading] = useState(false);

  const [reportVendorId, setReportVendorId] = useState<string>("all");
  const [reportDateInput, setReportDateInput] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [reportStatusFilter, setReportStatusFilter] = useState<"all" | "checkedIn" | "notArrived">("all");
  const [reportPage, setReportPage] = useState(1);
  const [reportSortKey, setReportSortKey] = useState<keyof AdminCheckinRow>("bookingDate");
  const [reportSortDir, setReportSortDir] = useState<"asc" | "desc">("desc");
  const reportRequestSeq = useRef(0);

  // Debounce free-text date typing so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setReportDate(reportDateInput); setReportPage(1); }, 400);
    return () => clearTimeout(t);
  }, [reportDateInput]);

  const fetchCheckinReport = useCallback(() => {
    setCheckinLoading(true);
    const seq = ++reportRequestSeq.current;
    const params = new URLSearchParams();
    if (reportVendorId !== "all") params.set("vendorId", reportVendorId);
    if (reportDate) params.set("date", reportDate);
    if (reportStatusFilter !== "all") params.set("status", reportStatusFilter);
    params.set("page", String(reportPage));
    customFetch<AdminCheckinResponse>(`/api/admin/checkin-report?${params.toString()}`)
      .then((data) => { if (seq === reportRequestSeq.current) setCheckinData(data); })
      .catch(() => {})
      .finally(() => { if (seq === reportRequestSeq.current) setCheckinLoading(false); });
  }, [reportVendorId, reportDate, reportStatusFilter, reportPage]);

  useEffect(() => {
    if (activeTab === "reports") fetchCheckinReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, reportVendorId, reportDate, reportStatusFilter, reportPage]);

  function handleReportSort(key: keyof AdminCheckinRow) {
    if (reportSortKey === key) setReportSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setReportSortKey(key); setReportSortDir("asc"); }
  }

  function resetReportFilters() {
    setReportVendorId("all");
    setReportDateInput("");
    setReportDate("");
    setReportStatusFilter("all");
    setReportPage(1);
  }

  const fetchVendorsFull = useCallback(() => {
    setVendorsFullLoading(true);
    customFetch<{ data: AdminVendorFull[] }>("/api/admin/vendors?limit=100")
      .then((r) => setVendorsFull(r.data ?? []))
      .catch(() => {})
      .finally(() => setVendorsFullLoading(false));
  }, []);

  // ─── COUPON GRANT FORM STATE ─────────────────────────────────────────────────
  const [couponSubTab, setCouponSubTab] = useState<"user" | "vendor">("user");
  const [grantEmail, setGrantEmail] = useState("");
  const [grantDiscount, setGrantDiscount] = useState("10");
  const [grantLoading, setGrantLoading] = useState(false);

  // ─── CREATE ANNOUNCEMENT FORM STATE ─────────────────────────────────────────
  const [newAnnouncementVendorId, setNewAnnouncementVendorId] = useState("");
  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState("");
  const [newAnnouncementBody, setNewAnnouncementBody] = useState("");
  const [newAnnouncementDate, setNewAnnouncementDate] = useState("");
  const [newAnnouncementLoading, setNewAnnouncementLoading] = useState(false);
  const [showCreateAnnouncement, setShowCreateAnnouncement] = useState(false);

  // ─── SEND COUPON TO USER (from users tab) ────────────────────────────────────
  const [sendCouponUserId, setSendCouponUserId] = useState<number | null>(null);
  const [sendCouponCode, setSendCouponCode] = useState("");
  const [sendCouponDiscount, setSendCouponDiscount] = useState("10");
  const [sendCouponLoading, setSendCouponLoading] = useState(false);

  // ─── USER SEARCH & ROLE EDIT ─────────────────────────────────────────────────
  const [userSearch, setUserSearch] = useState("");
  const [changeRoleUserId, setChangeRoleUserId] = useState<number | null>(null);

  // ─── VENDOR STATUS EDIT ──────────────────────────────────────────────────────
  const [editVendorId, setEditVendorId] = useState<number | null>(null);

  // ─── VENDOR FULL PROFILE EDIT ────────────────────────────────────────────────
  const [editVendorProfileId, setEditVendorProfileId] = useState<number | null>(null);
  const [vendorProfileForm, setVendorProfileForm] = useState({ businessName: "", category: "", description: "", country: "", state: "", city: "", address: "", mapLocation: "" });
  const [savingVendorProfile, setSavingVendorProfile] = useState(false);

  function openVendorProfileEdit(v: AdminVendor) {
    setVendorProfileForm({ businessName: v.businessName, category: v.category, description: "", country: "", state: "", city: v.location ?? "", address: "", mapLocation: "" });
    setEditVendorProfileId(v.id);
  }
  async function saveVendorProfile() {
    if (editVendorProfileId === null) return;
    setSavingVendorProfile(true);
    try {
      await customFetch(`/api/admin/vendors/${editVendorProfileId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: vendorProfileForm.businessName, category: vendorProfileForm.category, description: vendorProfileForm.description }),
      });
      if (vendorProfileForm.country || vendorProfileForm.state || vendorProfileForm.city || vendorProfileForm.address || vendorProfileForm.mapLocation) {
        await customFetch(`/api/admin/vendors/${editVendorProfileId}/location`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ country: vendorProfileForm.country, state: vendorProfileForm.state, city: vendorProfileForm.city, address: vendorProfileForm.address, mapLocation: vendorProfileForm.mapLocation }),
        });
      }
      setEditVendorProfileId(null);
      fetchVendors();
    } catch (e) { Alert.alert("Save failed", (e as Error).message); }
    finally { setSavingVendorProfile(false); }
  }

  useEffect(() => {
    if (activeTab === "vendors") fetchVendors();
    if (activeTab === "users") fetchUsers();
    if (activeTab === "events") fetchEvents();
    if (activeTab === "bookings") fetchBookings();
    if (activeTab === "subscriptions") fetchSubscriptions();
    if (activeTab === "coupons") fetchCoupons();
    if (activeTab === "content") { fetchAds(); fetchBlogs(); }
    if (activeTab === "announcements") { fetchAnnouncements(); fetchPendingAnnouncements(); fetchOrganizerEventSlider(); fetchNavVisibility(); }
    if (activeTab === "reports") fetchVendorsFull();
  }, [activeTab]);

  // ─── VENDOR ACTIONS ─────────────────────────────────────────────────────────
  async function approveVendor(id: number) {
    try {
      await customFetch(`/api/vendors/${id}/approve`, { method: "POST" });
      Alert.alert("Approved", "Partner has been approved.");
      fetchVendors();
    } catch {
      Alert.alert("Error", "Failed to approve partner.");
    }
  }

  async function rejectVendor(id: number) {
    try {
      await customFetch(`/api/vendors/${id}/reject`, { method: "POST" });
      Alert.alert("Rejected", "Partner application rejected.");
      fetchVendors();
    } catch {
      Alert.alert("Error", "Failed to reject partner.");
    }
  }

  async function deleteVendorAdmin(id: number, name: string) {
    Alert.alert("Delete Partner?", `Delete "${name}" and all their listings? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await customFetch(`/api/admin/vendors/${id}`, { method: "DELETE" });
            fetchVendors();
          } catch {
            Alert.alert("Error", "Failed to delete partner.");
          }
        }
      }
    ]);
  }

  async function changeVendorStatus(id: number, status: "approved" | "pending" | "rejected") {
    try {
      await customFetch(`/api/admin/vendors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setEditVendorId(null);
      fetchVendors();
    } catch {
      Alert.alert("Error", "Failed to update partner status.");
    }
  }

  // ─── USER ACTIONS ────────────────────────────────────────────────────────────
  async function changeUserRole(userId: number, role: "user" | "vendor" | "admin") {
    try {
      await customFetch(`/api/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      setChangeRoleUserId(null);
      fetchUsers();
    } catch {
      Alert.alert("Error", "Failed to change user role.");
    }
  }

  async function deleteUser(userId: number, name: string) {
    Alert.alert("Delete User?", `Permanently delete "${name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await customFetch(`/api/users/${userId}`, { method: "DELETE" });
            setUsers((prev) => prev.filter((u) => u.id !== userId));
          } catch {
            Alert.alert("Error", "Failed to delete user.");
          }
        }
      }
    ]);
  }

  async function sendCouponToUser() {
    if (!sendCouponUserId) return;
    const discount = Number(sendCouponDiscount);
    if (!sendCouponCode.trim() || !Number.isFinite(discount) || discount < 1 || discount > 100) {
      Alert.alert("Invalid Input", "Enter a valid coupon code and discount (1–100).");
      return;
    }
    setSendCouponLoading(true);
    try {
      await customFetch(`/api/admin/users/${sendCouponUserId}/send-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: sendCouponCode.trim().toUpperCase(), discount, type: "general" }),
      });
      Alert.alert("Sent", "Coupon sent to user successfully.");
      setSendCouponUserId(null);
      setSendCouponCode("");
      setSendCouponDiscount("10");
    } catch {
      Alert.alert("Error", "Failed to send coupon. Code may already exist.");
    } finally {
      setSendCouponLoading(false);
    }
  }

  // ─── COUPON GRANT ────────────────────────────────────────────────────────────
  async function grantCoupon() {
    const pct = Number(grantDiscount);
    if (!grantEmail.trim() || !grantEmail.includes("@")) {
      Alert.alert("Invalid Input", "Enter a valid email address.");
      return;
    }
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
      Alert.alert("Invalid Input", "Discount must be between 1 and 100.");
      return;
    }
    setGrantLoading(true);
    try {
      await customFetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: grantEmail.trim().toLowerCase(), discountPercent: pct }),
      });
      Alert.alert("Granted", "Coupon granted successfully.");
      setGrantEmail("");
      setGrantDiscount("10");
      fetchCoupons();
    } catch {
      Alert.alert("Error", "Failed to grant coupon. Check that the email is registered.");
    } finally {
      setGrantLoading(false);
    }
  }

  async function deactivateCoupon(id: number, code: string) {
    Alert.alert("Deactivate Coupon?", `Mark "${code}" as used/inactive?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Deactivate", style: "destructive", onPress: async () => {
          try {
            await customFetch(`/api/admin/coupons/${id}/deactivate`, { method: "PATCH" });
            fetchCoupons();
          } catch {
            Alert.alert("Error", "Failed to deactivate coupon.");
          }
        }
      }
    ]);
  }

  // ─── ANNOUNCEMENT ACTIONS ────────────────────────────────────────────────────
  async function toggleAnnouncementSlider(id: number, current: boolean) {
    try {
      await customFetch(`/api/admin/announcements/${id}/slider`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFeaturedSlider: !current }),
      });
      fetchAnnouncements();
    } catch {
      Alert.alert("Error", "Failed to update announcement.");
    }
  }

  async function createAnnouncement() {
    const vendorId = Number(newAnnouncementVendorId);
    if (!Number.isFinite(vendorId) || vendorId < 1) {
      Alert.alert("Invalid Input", "Enter a valid Partner ID.");
      return;
    }
    if (!newAnnouncementTitle.trim()) {
      Alert.alert("Invalid Input", "Title is required.");
      return;
    }
    setNewAnnouncementLoading(true);
    try {
      await customFetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          title: newAnnouncementTitle.trim(),
          body: newAnnouncementBody.trim(),
          announceDate: newAnnouncementDate.trim(),
        }),
      });
      Alert.alert("Created", "Announcement created successfully.");
      setNewAnnouncementVendorId("");
      setNewAnnouncementTitle("");
      setNewAnnouncementBody("");
      setNewAnnouncementDate("");
      setShowCreateAnnouncement(false);
      fetchAnnouncements();
    } catch {
      Alert.alert("Error", "Failed to create announcement. Check the Partner ID.");
    } finally {
      setNewAnnouncementLoading(false);
    }
  }

  async function deleteAnnouncement(id: number, title: string) {
    Alert.alert("Delete Announcement?", `Delete "${title}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await customFetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
            fetchAnnouncements();
          } catch {
            Alert.alert("Error", "Failed to delete announcement.");
          }
        }
      }
    ]);
  }

  // ─── EVENT ACTIONS ──────────────────────────────────────────────────────────
  async function moderateEvent(id: number, approvalStatus: "approved" | "rejected", rejectionReason?: string) {
    try {
      await customFetch(`/api/admin/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalStatus, ...(rejectionReason ? { rejectionReason } : {}) }),
      });
      fetchEvents();
    } catch {
      Alert.alert("Error", "Failed to update event.");
    }
  }

  async function deleteEvent(id: number) {
    try {
      await customFetch(`/api/admin/events/${id}`, { method: "DELETE" });
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch {
      Alert.alert("Error", "Failed to delete event.");
    }
  }

  async function toggleEventFlag(e: AdminEvent, key: "popular" | "featured" | "dateNight" | "hidden") {
    const next = !e[key];
    setEvents((prev) => prev.map((row) => (row.id === e.id ? { ...row, [key]: next } : row)));
    try {
      await customFetch(`/api/admin/events/${e.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: next }) });
    } catch {
      Alert.alert("Error", "Failed to update event.");
      fetchEvents();
    }
  }

  // ─── BOOKING ACTIONS ────────────────────────────────────────────────────────
  async function approveBooking(id: number) {
    try {
      await customFetch(`/api/admin/bookings/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmed" }),
      });
      fetchBookings();
    } catch {
      Alert.alert("Error", "Failed to approve booking.");
    }
  }

  async function rejectBooking(id: number, reason: string) {
    if (!reason.trim()) {
      Alert.alert("Reason required", "Please enter a rejection reason.");
      return;
    }
    try {
      await customFetch(`/api/admin/bookings/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled", rejectionReason: reason.trim() }),
      });
      setRejectingId(null);
      setRejectReason("");
      fetchBookings();
    } catch {
      Alert.alert("Error", "Failed to reject booking.");
    }
  }

  // ─── RENDER ANALYTICS ───────────────────────────────────────────────────────
  function renderAnalytics() {
    const a = analyticsQ.data as Record<string, unknown> | undefined;
    const ls = leadsQ.data as Record<string, unknown> | undefined;
    const br = bookingsReportQ.data as Record<string, unknown> | undefined;
    if (analyticsQ.isLoading) {
      return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;
    }
    const kpis = [
      { label: "Total Users", value: a?.["totalUsers"] ?? "—", icon: "people-outline" as const, color: "#3b82f6" },
      { label: "Partners", value: a?.["totalVendors"] ?? "—", icon: "business-outline" as const, color: colors.primary },
      { label: "Pending Partners", value: a?.["pendingVendors"] ?? "—", icon: "hourglass-outline" as const, color: "#f59e0b" },
      { label: "Events", value: a?.["totalEvents"] ?? "—", icon: "calendar-outline" as const, color: "#22c55e" },
      { label: "Total Bookings", value: a?.["totalBookings"] ?? "—", icon: "ticket-outline" as const, color: "#8b5cf6" },
      { label: "Revenue", value: a?.["totalRevenue"] ? `₹${Number(a["totalRevenue"]).toLocaleString("en-IN")}` : "—", icon: "cash-outline" as const, color: colors.primary },
      { label: "Commission", value: a?.["totalCommission"] != null ? `₹${Number(a["totalCommission"]).toLocaleString("en-IN")}` : "—", icon: "trending-up-outline" as const, color: "#22c55e" },
    ];
    const pendingActuals = Number(a?.["pendingActualsCount"] ?? 0);

    const bsByStatus = (br?.["bookingsByStatus"] as Array<{ status: string; count: number }> | undefined) ?? [];
    const leadKpis = ls
      ? [
          { label: "Total Leads", value: (ls as Record<string, unknown>)["totalLeads"] ?? 0, icon: "person-add-outline" as const },
          { label: "Converted", value: (ls as Record<string, unknown>)["convertedLeads"] ?? 0, icon: "checkmark-circle-outline" as const },
        ]
      : [];

    const monthlyRevenue = (a?.["monthlyRevenue"] as Array<{ month: string; revenue: number }> | undefined) ?? [];

    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {ANALYTICS_DATE_PRESETS.map((p) => (
            <TouchableOpacity key={p.key} onPress={() => setAnalyticsPreset(p.key)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: analyticsPreset === p.key ? colors.primary : colors.border, backgroundColor: analyticsPreset === p.key ? colors.primary + "22" : "transparent" }}>
              <Text style={{ color: analyticsPreset === p.key ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>PLATFORM OVERVIEW</Text>
        <View style={styles.kpiGrid}>
          {kpis.map((k) => (
            <View key={k.label} style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.kpiIcon, { backgroundColor: (k.color ?? colors.primary) + "20" }]}>
                <Ionicons name={k.icon} size={18} color={k.color ?? colors.primary} />
              </View>
              <Text style={[styles.kpiValue, { color: colors.foreground }]}>{String(k.value)}</Text>
              <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{k.label}</Text>
            </View>
          ))}
        </View>
        {pendingActuals > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#f59e0b15", borderRadius: 8, padding: 10, marginTop: 4 }}>
            <Ionicons name="warning-outline" size={14} color="#f59e0b" />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#f59e0b", flex: 1 }}>
              {pendingActuals} COD booking{pendingActuals === 1 ? "" : "s"} pending actuals (contributing ₹0)
            </Text>
          </View>
        )}

        {bsByStatus.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 20 }]}>BOOKINGS BY STATUS</Text>
            <View style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "column", gap: 8 }]}>
              {bsByStatus.map((b) => {
                const pct = bsByStatus.reduce((s, x) => s + x.count, 0) > 0
                  ? (b.count / bsByStatus.reduce((s, x) => s + x.count, 0)) * 100
                  : 0;
                const statusColor = b.status === "confirmed" ? "#22c55e" : b.status === "pending" ? "#f59e0b" : b.status === "cancelled" ? "#ef4444" : colors.mutedForeground;
                return (
                  <View key={b.status} style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: statusColor, fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "capitalize" }}>{b.status}</Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>{b.count}</Text>
                    </View>
                    <View style={{ height: 4, backgroundColor: colors.muted, borderRadius: 2 }}>
                      <View style={{ height: 4, width: `${pct}%`, backgroundColor: statusColor, borderRadius: 2 }} />
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {monthlyRevenue.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 20 }]}>MONTHLY REVENUE TREND</Text>
            <View style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "column", gap: 0 }]}>
              {(() => {
                const max = Math.max(...monthlyRevenue.map((m) => m.revenue), 1);
                return monthlyRevenue.slice(-6).map((m) => (
                  <View key={m.month} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", width: 50 }}>{m.month.slice(0, 7)}</Text>
                    <View style={{ flex: 1, height: 14, backgroundColor: colors.muted, borderRadius: 4 }}>
                      <View style={{ height: 14, width: `${(m.revenue / max) * 100}%`, backgroundColor: colors.primary, borderRadius: 4 }} />
                    </View>
                    <Text style={{ color: colors.foreground, fontSize: 11, fontFamily: "Inter_600SemiBold", width: 70, textAlign: "right" }}>
                      ₹{Number(m.revenue).toLocaleString("en-IN")}
                    </Text>
                  </View>
                ));
              })()}
            </View>
          </>
        )}

        {leadKpis.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 20 }]}>CRM LEADS</Text>
            <View style={styles.kpiGrid}>
              {leadKpis.map((k) => (
                <View key={k.label} style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.kpiIcon, { backgroundColor: colors.primary + "20" }]}>
                    <Ionicons name={k.icon} size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.kpiValue, { color: colors.foreground }]}>{String(k.value)}</Text>
                  <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{k.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    );
  }

  // ─── RENDER BOOKINGS ─────────────────────────────────────────────────────────
  function renderBookings() {
    const pending = bookings.filter((b) => b.status === "pending" || b.status === "payment_pending");
    const others = bookings.filter((b) => b.status !== "pending" && b.status !== "payment_pending");

    function statusColor(s: string) {
      if (s === "confirmed" || s === "completed") return "#22c55e";
      if (s === "pending" || s === "payment_pending") return "#f59e0b";
      if (s === "cancelled") return "#ef4444";
      return colors.mutedForeground;
    }

    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]} refreshControl={<RefreshControl refreshing={bookingLoading} onRefresh={fetchBookings} tintColor={colors.primary} />}>
        {bookingLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

        {rejectingId !== null && (
          <View style={[styles.rejectBox, { backgroundColor: colors.card, borderColor: "#ef444440" }]}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13, marginBottom: 8 }}>
              Rejection Reason (required)
            </Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Enter reason for cancellation..."
              placeholderTextColor={colors.mutedForeground}
              style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <TouchableOpacity style={[styles.actionBtnWide, { backgroundColor: "#ef444420", borderColor: "#ef4444" }]} onPress={() => rejectBooking(rejectingId, rejectReason)}>
                <Text style={{ color: "#ef4444", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Confirm Rejection</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtnWide, { backgroundColor: colors.muted, borderColor: colors.border }]} onPress={() => { setRejectingId(null); setRejectReason(""); }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {pending.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: "#f59e0b" }]}>PENDING APPROVAL ({pending.length})</Text>
            {pending.map((b) => (
              <View key={b.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: "#f59e0b40", flexDirection: "column", gap: 8 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: colors.foreground }]}>{b.guestName}</Text>
                    <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{b.eventTitle}</Text>
                    <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{b.ticketCode} · ₹{Number(b.finalPrice).toLocaleString("en-IN")}</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#22c55e20", borderColor: "#22c55e" }]}
                      onPress={() => Alert.alert("Approve?", `Approve booking for ${b.guestName}?`, [{ text: "Cancel", style: "cancel" }, { text: "Approve", onPress: () => approveBooking(b.id) }])}
                    >
                      <Ionicons name="checkmark" size={14} color="#22c55e" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#ef444420", borderColor: "#ef4444" }]}
                      onPress={() => { setRejectingId(b.id); setRejectReason(""); }}
                    >
                      <Ionicons name="close" size={14} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: pending.length > 0 ? 20 : 0 }]}>ALL BOOKINGS ({others.length})</Text>
        {others.map((b) => (
          <View key={b.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>{b.guestName}</Text>
              <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{b.eventTitle} · {b.ticketCode}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text style={{ color: statusColor(b.status), fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{b.status}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" }}>₹{Number(b.finalPrice).toLocaleString("en-IN")}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  // ─── RENDER VENDORS ─────────────────────────────────────────────────────────
  function renderVendors() {
    const pendingRequests = vendorRequests.filter((r) => r.status === "pending");
    const approvedVendors = vendors.filter((v) => v.status === "approved");

    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]} refreshControl={<RefreshControl refreshing={vendorLoading} onRefresh={fetchVendors} tintColor={colors.primary} />}>
        {vendorLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

        {pendingRequests.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: "#f59e0b" }]}>PENDING APPLICATIONS ({pendingRequests.length})</Text>
            {pendingRequests.map((r) => (
              <View key={r.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: "#f59e0b40", flexDirection: "column", gap: 8 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: colors.foreground }]}>{r.businessName}</Text>
                    <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{r.category}{r.user?.name ? ` · ${r.user.name}` : ""}</Text>
                    {r.user?.email ? <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{r.user.email}</Text> : null}
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#22c55e20", borderColor: "#22c55e" }]}
                      onPress={() => Alert.alert("Approve?", `Approve "${r.businessName}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Approve", onPress: () => approveVendorRequest(r.id) }])}
                    >
                      <Ionicons name="checkmark" size={14} color="#22c55e" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#ef444420", borderColor: "#ef4444" }]}
                      onPress={() => Alert.alert("Reject?", `Reject "${r.businessName}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Reject", style: "destructive", onPress: () => rejectVendorRequest(r.id) }])}
                    >
                      <Ionicons name="close" size={14} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
                {r.message ? (
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }} numberOfLines={2}>{r.message}</Text>
                ) : null}
              </View>
            ))}
          </>
        )}

        {editVendorId !== null && (
          <View style={[styles.rejectBox, { backgroundColor: colors.card, borderColor: colors.primary + "40", marginBottom: 8 }]}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13, marginBottom: 8 }}>Change Status</Text>
            {(["approved", "pending", "rejected"] as const).map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.actionBtnWide, { backgroundColor: s === "approved" ? "#22c55e20" : s === "rejected" ? "#ef444420" : colors.muted, borderColor: s === "approved" ? "#22c55e" : s === "rejected" ? "#ef4444" : colors.border, marginBottom: 6 }]}
                onPress={() => changeVendorStatus(editVendorId, s)}
              >
                <Text style={{ color: s === "approved" ? "#22c55e" : s === "rejected" ? "#ef4444" : colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{s}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setEditVendorId(null)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {editVendorProfileId !== null && (
          <View style={[styles.rejectBox, { backgroundColor: colors.card, borderColor: colors.primary + "40", marginBottom: 8, gap: 8 }]}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Edit Profile</Text>
            {([["businessName", "Business name"], ["category", "Category"], ["description", "Description"]] as const).map(([k, label]) => (
              <TextInput
                key={k}
                value={vendorProfileForm[k]}
                onChangeText={(v) => setVendorProfileForm((p) => ({ ...p, [k]: v }))}
                placeholder={label}
                placeholderTextColor={colors.mutedForeground}
                multiline={k === "description"}
                style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted, minHeight: k === "description" ? 60 : 0, paddingVertical: 10 }]}
              />
            ))}
            <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", marginTop: 4 }}>Location (optional)</Text>
            {([["country", "Country"], ["state", "State"], ["city", "City"], ["address", "Address"], ["mapLocation", "Google Maps link"]] as const).map(([k, label]) => (
              <TextInput
                key={k}
                value={vendorProfileForm[k]}
                onChangeText={(v) => setVendorProfileForm((p) => ({ ...p, [k]: v }))}
                placeholder={label}
                placeholderTextColor={colors.mutedForeground}
                style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted, minHeight: 0, paddingVertical: 10 }]}
              />
            ))}
            <TouchableOpacity
              style={[styles.actionBtnWide, { backgroundColor: colors.primary, borderColor: colors.primary, justifyContent: "center" }]}
              onPress={saveVendorProfile}
              disabled={savingVendorProfile}
            >
              <Text style={{ color: colors.primaryForeground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{savingVendorProfile ? "Saving…" : "Save profile"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditVendorProfileId(null)}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: pendingRequests.length > 0 ? 20 : 0 }]}>ALL PARTNERS ({vendors.length})</Text>
        {vendors.map((v) => {
          function statusColor(s: string) {
            if (s === "approved") return "#22c55e";
            if (s === "pending") return "#f59e0b";
            if (s === "rejected") return "#ef4444";
            return colors.mutedForeground;
          }
          return (
            <View key={v.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "column", gap: 8 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.foreground }]}>{v.businessName}</Text>
                  <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{v.category} · {v.location}</Text>
                </View>
                <View style={[styles.roleBadge, { backgroundColor: statusColor(v.status) + "20", borderColor: statusColor(v.status) }]}>
                  <Text style={{ color: statusColor(v.status), fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{v.status}</Text>
                </View>
              </View>
              {v.isPremium && (
                <View style={[styles.premiumBadge, { backgroundColor: colors.primary + "20", borderColor: colors.primary, alignSelf: "flex-start" }]}>
                  <Ionicons name="star" size={10} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>Premium</Text>
                </View>
              )}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={[styles.actionBtnWide, { backgroundColor: colors.muted, borderColor: colors.border, flex: 1 }]}
                  onPress={() => setEditVendorId(editVendorId === v.id ? null : v.id)}
                >
                  <Ionicons name="create-outline" size={14} color={colors.foreground} />
                  <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_500Medium" }}>Status</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtnWide, { backgroundColor: colors.muted, borderColor: colors.border, flex: 1 }]}
                  onPress={() => (editVendorProfileId === v.id ? setEditVendorProfileId(null) : openVendorProfileEdit(v))}
                >
                  <Ionicons name="business-outline" size={14} color={colors.foreground} />
                  <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_500Medium" }}>Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: "#ef444410", borderColor: "#ef444440" }]}
                  onPress={() => deleteVendorAdmin(v.id, v.businessName)}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.destructive} />
                </TouchableOpacity>
              </View>

              {v.status === "approved" && (
                <>
                  {/* Base fee toggle */}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
                      Base Fee ({v.baseFeePercent ?? "3.50"}%) — {v.baseFeeEnabled !== false ? "Enabled" : "Disabled"}
                    </Text>
                    <Switch
                      value={v.baseFeeEnabled !== false}
                      onValueChange={() => toggleBaseFee(v)}
                      trackColor={{ true: colors.primary, false: colors.border }}
                    />
                  </View>

                  {/* Crowd level */}
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>LIVE CROWD LEVEL</Text>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {([["low", "Low", "#22c55e"], ["moderate", "Moderate", "#f59e0b"], ["party", "High", "#ef4444"]] as const).map(([val, label, c]) => {
                        const active = v.crowdLevel === val;
                        return (
                          <TouchableOpacity key={val} onPress={() => setVendorCrowdLevel(v.id, active ? null : val)}
                            style={{ flex: 1, paddingVertical: 7, borderRadius: 10, borderWidth: 1, alignItems: "center", backgroundColor: active ? c + "22" : colors.muted, borderColor: active ? c : colors.border }}>
                            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: active ? c : colors.mutedForeground }}>{label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Managers expand */}
                  <TouchableOpacity onPress={() => toggleManagers(v.id)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.primary }}>
                      {expandedMgrVendor === v.id ? "Hide" : "View"} Managers{managersByVendor[v.id] ? ` (${managersByVendor[v.id].length})` : ""}
                    </Text>
                    <Ionicons name={expandedMgrVendor === v.id ? "chevron-up" : "chevron-down"} size={14} color={colors.primary} />
                  </TouchableOpacity>
                  {expandedMgrVendor === v.id && (
                    <View style={{ gap: 6 }}>
                      {mgrLoading && !managersByVendor[v.id] ? (
                        <ActivityIndicator color={colors.primary} size="small" />
                      ) : (managersByVendor[v.id] ?? []).length === 0 ? (
                        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>No managers assigned.</Text>
                      ) : (managersByVendor[v.id] ?? []).map((mgr) => (
                        <View key={mgr.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted, paddingHorizontal: 10, paddingVertical: 8 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground }}>{mgr.manager?.name || mgr.invitedEmail}</Text>
                            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{mgr.invitedEmail} · {mgr.status}</Text>
                          </View>
                          <TouchableOpacity onPress={() => removeManager(v.id, mgr)}>
                            <Ionicons name="trash-outline" size={16} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>
          );
        })}
      </ScrollView>
    );
  }

  // ─── RENDER USERS ───────────────────────────────────────────────────────────
  function renderUsers() {
    function roleColor(r: string) {
      if (r === "admin") return colors.primary;
      if (r === "vendor") return "#8b5cf6";
      return colors.mutedForeground;
    }
    function roleBg(r: string) {
      if (r === "admin") return colors.primary + "20";
      if (r === "vendor") return "#8b5cf620";
      return colors.muted;
    }
    function roleBorder(r: string) {
      if (r === "admin") return colors.primary;
      if (r === "vendor") return "#8b5cf6";
      return colors.border;
    }

    const q = userSearch.trim().toLowerCase();
    const filteredUsers = q
      ? users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone ?? "").includes(q))
      : users;

    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]} refreshControl={<RefreshControl refreshing={userLoading} onRefresh={fetchUsers} tintColor={colors.primary} />}>
        {userLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

        {/* SEARCH BAR */}
        <TextInput
          value={userSearch}
          onChangeText={setUserSearch}
          placeholder="Search by name, email or phone…"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, minHeight: 0, paddingVertical: 10, marginBottom: 4 }]}
          clearButtonMode="while-editing"
        />

        {/* SEND COUPON INLINE FORM */}
        {sendCouponUserId !== null && (
          <View style={[styles.rejectBox, { backgroundColor: colors.card, borderColor: colors.primary + "40" }]}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13, marginBottom: 8 }}>
              Send Coupon to User #{sendCouponUserId}
            </Text>
            <TextInput
              value={sendCouponCode}
              onChangeText={(t) => setSendCouponCode(t.toUpperCase())}
              placeholder="Coupon code (e.g. RV-GIFT10)"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted, minHeight: 0, paddingVertical: 10 }]}
              autoCapitalize="characters"
            />
            <TextInput
              value={sendCouponDiscount}
              onChangeText={setSendCouponDiscount}
              placeholder="Discount % (1–100)"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted, minHeight: 0, paddingVertical: 10, marginTop: 8 }]}
              keyboardType="numeric"
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.actionBtnWide, { backgroundColor: colors.primary + "20", borderColor: colors.primary, flex: 1 }]}
                onPress={sendCouponToUser}
                disabled={sendCouponLoading}
              >
                <Ionicons name="pricetag-outline" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{sendCouponLoading ? "Sending…" : "Send"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnWide, { backgroundColor: colors.muted, borderColor: colors.border }]}
                onPress={() => { setSendCouponUserId(null); setSendCouponCode(""); setSendCouponDiscount("10"); }}
              >
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ROLE CHANGE INLINE FORM */}
        {changeRoleUserId !== null && (
          <View style={[styles.rejectBox, { backgroundColor: colors.card, borderColor: colors.primary + "40" }]}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13, marginBottom: 8 }}>
              Change Role for User #{changeRoleUserId}
            </Text>
            {(["user", "vendor", "admin"] as const).map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.actionBtnWide, {
                  backgroundColor: r === "admin" ? colors.primary + "20" : r === "vendor" ? "#8b5cf620" : colors.muted,
                  borderColor: r === "admin" ? colors.primary : r === "vendor" ? "#8b5cf6" : colors.border,
                  marginBottom: 6,
                }]}
                onPress={() => changeUserRole(changeRoleUserId, r)}
              >
                <Text style={{ color: roleColor(r), fontSize: 13, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{r}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setChangeRoleUserId(null)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>USERS ({filteredUsers.length}{q ? ` of ${users.length}` : ""})</Text>
        {filteredUsers.length === 0 && !userLoading && (
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", marginTop: 20 }}>
            {q ? "No users match your search" : "No users found"}
          </Text>
        )}
        {filteredUsers.map((u) => (
          <View key={u.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "column", gap: 10 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={[styles.userAvatar, { backgroundColor: colors.muted }]}>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 14 }}>
                  {u.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: colors.foreground }]}>{u.name}</Text>
                <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{u.email}</Text>
                {u.phone ? <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{u.phone}</Text> : null}
                <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 }}>ID: {u.id}</Text>
              </View>
              <View style={[styles.roleBadge, { backgroundColor: roleBg(u.role), borderColor: roleBorder(u.role) }]}>
                <Text style={{ color: roleColor(u.role), fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{u.role}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <TouchableOpacity
                style={[styles.actionBtnWide, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "40" }]}
                onPress={() => { setSendCouponUserId(u.id); setSendCouponCode(""); setSendCouponDiscount("10"); setChangeRoleUserId(null); }}
              >
                <Ionicons name="pricetag-outline" size={13} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_500Medium" }}>Send Coupon</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnWide, { backgroundColor: "#8b5cf610", borderColor: "#8b5cf640" }]}
                onPress={() => { setChangeRoleUserId(changeRoleUserId === u.id ? null : u.id); setSendCouponUserId(null); }}
              >
                <Ionicons name="key-outline" size={13} color="#8b5cf6" />
                <Text style={{ color: "#8b5cf6", fontSize: 12, fontFamily: "Inter_500Medium" }}>Change Role</Text>
              </TouchableOpacity>
              {u.role !== "admin" && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: "#ef444410", borderColor: "#ef444440" }]}
                  onPress={() => deleteUser(u.id, u.name)}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.destructive} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  // ─── RENDER EVENTS ──────────────────────────────────────────────────────────
  function renderEvents() {
    const filtered = eventFilter === "all" ? events : events.filter((e) => e.approvalStatus === eventFilter);

    function approvalColor(s: string) {
      if (s === "approved") return "#22c55e";
      if (s === "pending") return "#f59e0b";
      if (s === "rejected") return "#ef4444";
      return colors.mutedForeground;
    }

    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]} refreshControl={<RefreshControl refreshing={eventLoading} onRefresh={fetchEvents} tintColor={colors.primary} />}>
        {eventLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

        {eventRejectingId !== null && (
          <View style={[styles.rejectBox, { backgroundColor: colors.card, borderColor: "#ef444440" }]}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13, marginBottom: 8 }}>
              Rejection Reason (required)
            </Text>
            <TextInput
              value={eventRejectReason}
              onChangeText={setEventRejectReason}
              placeholder="Enter reason for rejecting this event..."
              placeholderTextColor={colors.mutedForeground}
              style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.actionBtnWide, { backgroundColor: "#ef444420", borderColor: "#ef4444" }]}
                onPress={() => {
                  if (!eventRejectReason.trim()) { Alert.alert("Required", "Please enter a rejection reason."); return; }
                  moderateEvent(eventRejectingId, "rejected", eventRejectReason.trim());
                  setEventRejectingId(null);
                  setEventRejectReason("");
                }}
              >
                <Text style={{ color: "#ef4444", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Confirm Rejection</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnWide, { backgroundColor: colors.muted, borderColor: colors.border }]}
                onPress={() => { setEventRejectingId(null); setEventRejectReason(""); }}
              >
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
          {(["all", "pending", "approved", "rejected"] as const).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setEventFilter(f)}
              style={[styles.filterChip, { backgroundColor: eventFilter === f ? colors.primary : colors.muted, borderColor: eventFilter === f ? colors.primary : colors.border }]}
            >
              <Text style={{ color: eventFilter === f ? colors.primaryForeground : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "capitalize" }}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>EVENTS ({filtered.length})</Text>
        {filtered.map((e) => (
          <View key={e.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "column", gap: 8 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>{e.title}</Text>
                <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{e.city}{e.partnerName ? ` · ${e.partnerName}` : ""}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <View style={[styles.roleBadge, { backgroundColor: approvalColor(e.approvalStatus) + "20", borderColor: approvalColor(e.approvalStatus) }]}>
                  <Text style={{ color: approvalColor(e.approvalStatus), fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{e.approvalStatus}</Text>
                </View>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {e.approvalStatus === "pending" && (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtnWide, { backgroundColor: "#22c55e20", borderColor: "#22c55e", flex: 1 }]}
                    onPress={() => Alert.alert("Approve Event?", `Approve "${e.title}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Approve", onPress: () => moderateEvent(e.id, "approved") }])}
                  >
                    <Ionicons name="checkmark-circle-outline" size={14} color="#22c55e" />
                    <Text style={{ color: "#22c55e", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtnWide, { backgroundColor: "#ef444420", borderColor: "#ef4444", flex: 1 }]}
                    onPress={() => { setEventRejectingId(e.id); setEventRejectReason(""); }}
                  >
                    <Ionicons name="close-circle-outline" size={14} color="#ef4444" />
                    <Text style={{ color: "#ef4444", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Reject</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#ef444410", borderColor: "#ef444440" }]}
                onPress={() => Alert.alert("Delete Event?", `Delete "${e.title}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => deleteEvent(e.id) }])}
              >
                <Ionicons name="trash-outline" size={14} color={colors.destructive} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
              {([["popular", "Popular"], ["featured", "Featured"], ["dateNight", "Date Night"], ["hidden", "Hidden"]] as const).map(([key, label]) => {
                const on = !!e[key];
                return (
                  <TouchableOpacity key={key} onPress={() => toggleEventFlag(e, key)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + "22" : "transparent" }}>
                    <Text style={{ color: on ? colors.primary : colors.mutedForeground, fontSize: 11, fontFamily: "Inter_500Medium" }}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  // ─── RENDER SUBSCRIPTIONS ────────────────────────────────────────────────────
  function renderSubscriptions() {
    function subStatusColor(s: string) {
      if (s === "active") return "#22c55e";
      if (s === "expired" || s === "cancelled") return "#ef4444";
      return colors.mutedForeground;
    }
    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]} refreshControl={<RefreshControl refreshing={subLoading} onRefresh={fetchSubscriptions} tintColor={colors.primary} />}>
        {subLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ALL SUBSCRIPTIONS ({subscriptions.length})</Text>
        {subscriptions.length === 0 && !subLoading && (
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", marginTop: 20 }}>No subscriptions found</Text>
        )}
        {subscriptions.map((s) => (
          <View key={s.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>{s.userName}</Text>
              <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{s.userEmail}</Text>
              <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{s.planType} · {s.planPeriod}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <View style={[styles.roleBadge, { backgroundColor: subStatusColor(s.status) + "20", borderColor: subStatusColor(s.status) }]}>
                <Text style={{ color: subStatusColor(s.status), fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{s.status}</Text>
              </View>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_400Regular" }}>Exp: {new Date(s.expiresAt).toLocaleDateString("en-IN")}</Text>
              <TouchableOpacity onPress={() => deleteSubscription(s.id)} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                <Ionicons name="trash-outline" size={13} color="#ef4444" />
                <Text style={{ color: "#ef4444", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  // ─── RENDER COUPONS ──────────────────────────────────────────────────────────
  function renderCoupons() {
    const activeCoupons = coupons.filter((c) => !c.used);
    const usedCoupons = coupons.filter((c) => c.used);

    if (couponSubTab === "vendor") {
      return (
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", gap: 8, padding: 16, paddingBottom: 0 }}>
            {(["user", "vendor"] as const).map((t) => (
              <TouchableOpacity key={t} onPress={() => setCouponSubTab(t)} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: "center", borderColor: couponSubTab === t ? colors.primary : colors.border, backgroundColor: couponSubTab === t ? colors.primary + "22" : "transparent" }}>
                <Text style={{ color: couponSubTab === t ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{t === "user" ? "User coupons" : "Vendor coupons"}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <AdminVendorCouponsTab colors={colors} />
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]} refreshControl={<RefreshControl refreshing={couponLoading} onRefresh={fetchCoupons} tintColor={colors.primary} />}>
        {couponLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
          {(["user", "vendor"] as const).map((t) => (
            <TouchableOpacity key={t} onPress={() => setCouponSubTab(t)} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: "center", borderColor: couponSubTab === t ? colors.primary : colors.border, backgroundColor: couponSubTab === t ? colors.primary + "22" : "transparent" }}>
              <Text style={{ color: couponSubTab === t ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{t === "user" ? "User coupons" : "Vendor coupons"}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* GRANT COUPON FORM */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>GRANT NEW COUPON</Text>
        <View style={[styles.rejectBox, { backgroundColor: colors.card, borderColor: colors.primary + "30" }]}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 10 }}>
            Auto-generates a coupon code and assigns it to a registered user by email.
          </Text>
          <TextInput
            value={grantEmail}
            onChangeText={setGrantEmail}
            placeholder="User email address"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted, minHeight: 0, paddingVertical: 10 }]}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            value={grantDiscount}
            onChangeText={setGrantDiscount}
            placeholder="Discount % (1–100)"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted, minHeight: 0, paddingVertical: 10, marginTop: 8 }]}
            keyboardType="numeric"
          />
          <TouchableOpacity
            style={[styles.actionBtnWide, { backgroundColor: colors.primary, borderColor: colors.primary, marginTop: 10, justifyContent: "center" }]}
            onPress={grantCoupon}
            disabled={grantLoading}
          >
            <Ionicons name="add-circle-outline" size={15} color={colors.primaryForeground} />
            <Text style={{ color: colors.primaryForeground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{grantLoading ? "Granting…" : "Grant Coupon"}</Text>
          </TouchableOpacity>
        </View>

        {/* ACTIVE COUPONS */}
        <Text style={[styles.sectionHeader, { color: "#22c55e", marginTop: 16 }]}>ACTIVE ({activeCoupons.length})</Text>
        {activeCoupons.length === 0 && !couponLoading && (
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center" }}>No active coupons</Text>
        )}
        {activeCoupons.map((c) => (
          <View key={c.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.primary + "30", flexDirection: "column", gap: 8 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[styles.kpiIcon, { backgroundColor: colors.primary + "20" }]}>
                <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: colors.foreground }]}>{c.code}</Text>
                <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{c.discountPercent}% off{c.userEmail ? ` · ${c.userEmail}` : ""}</Text>
              </View>
              <View style={[styles.roleBadge, { backgroundColor: "#22c55e20", borderColor: "#22c55e" }]}>
                <Text style={{ color: "#22c55e", fontSize: 10, fontFamily: "Inter_600SemiBold" }}>Active</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.actionBtnWide, { backgroundColor: "#ef444410", borderColor: "#ef444440", alignSelf: "flex-start" }]}
              onPress={() => deactivateCoupon(c.id, c.code)}
            >
              <Ionicons name="close-circle-outline" size={13} color="#ef4444" />
              <Text style={{ color: "#ef4444", fontSize: 12, fontFamily: "Inter_500Medium" }}>Deactivate</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* USED COUPONS */}
        {usedCoupons.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 16 }]}>USED ({usedCoupons.length})</Text>
            {usedCoupons.map((c) => (
              <View key={c.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.kpiIcon, { backgroundColor: colors.muted }]}>
                  <Ionicons name="pricetag-outline" size={16} color={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.mutedForeground }]}>{c.code}</Text>
                  <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{c.discountPercent}% off{c.userEmail ? ` · ${c.userEmail}` : ""}</Text>
                </View>
                <View style={[styles.roleBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>Used</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    );
  }

  // ─── RENDER ANNOUNCEMENTS ────────────────────────────────────────────────────
  function renderAnnouncements() {
    const sliderAnnouncements = announcements.filter((a) => a.isFeaturedSlider);
    const others = announcements.filter((a) => !a.isFeaturedSlider);

    return (
      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: 120 }]}
        refreshControl={<RefreshControl refreshing={announcementLoading || pendingAnnouncementLoading} onRefresh={() => { fetchAnnouncements(); fetchPendingAnnouncements(); }} tintColor={colors.primary} />}
      >
        {(announcementLoading || pendingAnnouncementLoading) && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

        {/* SITE NAVIGATION VISIBILITY */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>SITE NAVIGATION VISIBILITY</Text>
        {hiddenNavLinks === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginBottom: 8 }} />
        ) : (
          <View style={{ gap: 8, marginBottom: 16 }}>
            {MOBILE_NAV_ITEMS.map((item) => {
              const isHidden = hiddenNavLinks.includes(item.key);
              return (
                <View
                  key={item.key}
                  style={[styles.itemCard, { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderColor: isHidden ? colors.border : "#f59e0b40", marginBottom: 0 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: colors.foreground }]}>{item.label}</Text>
                    {isHidden ? <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: "#f59e0b" }}>Hidden from public site</Text> : null}
                  </View>
                  {savingNavKey === item.key ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Switch
                      value={!isHidden}
                      onValueChange={() => toggleNavItem(item)}
                      trackColor={{ true: "#f59e0b", false: colors.border }}
                    />
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* PENDING APPROVAL QUEUE */}
        {pendingAnnouncements.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: "#f59e0b" }]}>PENDING APPROVAL ({pendingAnnouncements.length})</Text>
            {pendingAnnouncements.map((a) => (
              <View key={a.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: "#f59e0b40", flexDirection: "column", gap: 8 }]}>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  {a.imageUrl ? (
                    <Image source={{ uri: resolveImageUrl(a.imageUrl) }} style={{ width: 56, height: 56, borderRadius: 10 }} />
                  ) : (
                    <View style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="megaphone-outline" size={20} color={colors.mutedForeground} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>{a.title}</Text>
                    <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{a.vendorName}</Text>
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
                      {a.announceDate ? <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{a.announceDate}{a.announceTime ? ` · ${a.announceTime}` : ""}</Text> : null}
                      {a.price && Number(a.price) > 0 ? <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>₹{Number(a.price).toLocaleString("en-IN")}</Text> : null}
                    </View>
                  </View>
                </View>
                {a.body ? <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }} numberOfLines={2}>{a.body}</Text> : null}

                {rejectingAnnouncementId === a.id ? (
                  <View style={[styles.rejectBox, { backgroundColor: colors.background, borderColor: "#ef444440", marginTop: 0 }]}>
                    <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13, marginBottom: 8 }}>Rejection Reason (optional)</Text>
                    <TextInput
                      value={announcementRejectReason}
                      onChangeText={setAnnouncementRejectReason}
                      placeholder="E.g. Inappropriate content, missing details..."
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                      multiline
                    />
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                      <TouchableOpacity style={[styles.actionBtnWide, { backgroundColor: "#ef444420", borderColor: "#ef4444" }]} onPress={() => rejectAnnouncement(a.id, announcementRejectReason)}>
                        <Text style={{ color: "#ef4444", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Confirm Rejection</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtnWide, { backgroundColor: colors.muted, borderColor: colors.border }]} onPress={() => { setRejectingAnnouncementId(null); setAnnouncementRejectReason(""); }}>
                        <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium" }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.actionBtnWide, { backgroundColor: "#22c55e20", borderColor: "#22c55e", flex: 1, justifyContent: "center" }]}
                      onPress={() => approveAnnouncement(a.id)}
                    >
                      <Ionicons name="checkmark" size={14} color="#22c55e" />
                      <Text style={{ color: "#22c55e", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtnWide, { backgroundColor: "#ef444420", borderColor: "#ef4444", flex: 1, justifyContent: "center" }]}
                      onPress={() => { setRejectingAnnouncementId(a.id); setAnnouncementRejectReason(""); }}
                    >
                      <Ionicons name="close" size={14} color="#ef4444" />
                      <Text style={{ color: "#ef4444", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </>
        )}

        {/* CREATE ANNOUNCEMENT FORM */}
        <TouchableOpacity
          style={[styles.actionBtnWide, { backgroundColor: colors.primary + "20", borderColor: colors.primary, alignSelf: "stretch", marginBottom: 12, justifyContent: "center" }]}
          onPress={() => setShowCreateAnnouncement((v) => !v)}
        >
          <Ionicons name={showCreateAnnouncement ? "chevron-up" : "add-circle-outline"} size={15} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
            {showCreateAnnouncement ? "Cancel" : "Create Announcement"}
          </Text>
        </TouchableOpacity>
        {showCreateAnnouncement && (
          <View style={[styles.rejectBox, { backgroundColor: colors.card, borderColor: colors.primary + "30", marginBottom: 12 }]}>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 10 }}>
              Create an announcement linked to an existing partner. Enter the partner's numeric ID (visible in the Partners tab).
            </Text>
            <TextInput
              value={newAnnouncementVendorId}
              onChangeText={setNewAnnouncementVendorId}
              placeholder="Partner ID (numeric)"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted, minHeight: 0, paddingVertical: 10, marginBottom: 8 }]}
              keyboardType="numeric"
            />
            <TextInput
              value={newAnnouncementTitle}
              onChangeText={setNewAnnouncementTitle}
              placeholder="Title *"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted, minHeight: 0, paddingVertical: 10, marginBottom: 8 }]}
            />
            <TextInput
              value={newAnnouncementBody}
              onChangeText={setNewAnnouncementBody}
              placeholder="Body / description (optional)"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted, paddingVertical: 10, marginBottom: 8 }]}
              multiline
            />
            <TextInput
              value={newAnnouncementDate}
              onChangeText={setNewAnnouncementDate}
              placeholder="Announce date e.g. 2025-12-25 (optional)"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted, minHeight: 0, paddingVertical: 10, marginBottom: 12 }]}
            />
            <TouchableOpacity
              style={[styles.actionBtnWide, { backgroundColor: colors.primary, borderColor: colors.primary, alignSelf: "flex-end" }]}
              onPress={createAnnouncement}
              disabled={newAnnouncementLoading}
            >
              {newAnnouncementLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Ionicons name="checkmark" size={14} color="#fff" /><Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Create</Text></>
              }
            </TouchableOpacity>
          </View>
        )}

        {sliderAnnouncements.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.primary }]}>FEATURED SLIDER ({sliderAnnouncements.length})</Text>
            {sliderAnnouncements.map((a) => (
              <View key={a.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.primary + "40", flexDirection: "column", gap: 8 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>{a.title}</Text>
                    <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{a.vendorName}</Text>
                    {a.announceDate ? <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{a.announceDate}{a.announceTime ? ` · ${a.announceTime}` : ""}</Text> : null}
                  </View>
                  <View style={[styles.roleBadge, { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}>
                    <Text style={{ color: colors.primary, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>Slider</Text>
                  </View>
                </View>
                {a.body ? <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }} numberOfLines={2}>{a.body}</Text> : null}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.actionBtnWide, { backgroundColor: "#ef444420", borderColor: "#ef4444", alignSelf: "flex-start" }]}
                    onPress={() => Alert.alert("Remove from Slider?", `Remove "${a.title}" from the featured slider?`, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Remove", style: "destructive", onPress: () => toggleAnnouncementSlider(a.id, true) }
                    ])}
                  >
                    <Ionicons name="remove-circle-outline" size={13} color="#ef4444" />
                    <Text style={{ color: "#ef4444", fontSize: 12, fontFamily: "Inter_500Medium" }}>Remove from Slider</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtnWide, { backgroundColor: "#ef444415", borderColor: "#ef444430", alignSelf: "flex-start" }]}
                    onPress={() => deleteAnnouncement(a.id, a.title)}
                  >
                    <Ionicons name="trash-outline" size={13} color="#ef4444" />
                    <Text style={{ color: "#ef4444", fontSize: 12, fontFamily: "Inter_500Medium" }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: sliderAnnouncements.length > 0 ? 16 : 0 }]}>
          ALL ANNOUNCEMENTS ({announcements.length})
        </Text>
        {announcements.length === 0 && !announcementLoading && (
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", marginTop: 20 }}>No announcements found</Text>
        )}
        {others.map((a) => (
          <View key={a.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "column", gap: 8 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>{a.title}</Text>
                <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{a.vendorName}</Text>
                {a.announceDate ? <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{a.announceDate}{a.announceTime ? ` · ${a.announceTime}` : ""}</Text> : null}
              </View>
            </View>
            {a.body ? <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }} numberOfLines={2}>{a.body}</Text> : null}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                style={[styles.actionBtnWide, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "40", alignSelf: "flex-start" }]}
                onPress={() => Alert.alert("Add to Slider?", `Feature "${a.title}" in the homepage slider?`, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Add", onPress: () => toggleAnnouncementSlider(a.id, false) }
                ])}
              >
                <Ionicons name="star-outline" size={13} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_500Medium" }}>Add to Slider</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnWide, { backgroundColor: "#ef444415", borderColor: "#ef444430", alignSelf: "flex-start" }]}
                onPress={() => deleteAnnouncement(a.id, a.title)}
              >
                <Ionicons name="trash-outline" size={13} color="#ef4444" />
                <Text style={{ color: "#ef4444", fontSize: 12, fontFamily: "Inter_500Medium" }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* ORGANIZER EVENTS IN SLIDER */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 20 }]}>
          ORGANIZER EVENTS IN SLIDER {organizerEventSlider.length > 0 ? `(${organizerEventSlider.length})` : ""}
        </Text>
        {organizerEventSliderLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />}
        {!organizerEventSliderLoading && organizerEventSlider.length === 0 && (
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", marginTop: 8 }}>No approved organizer events yet</Text>
        )}
        {organizerEventSlider.map((a) => (
          <View key={a.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: a.isFeaturedSlider ? "#f59e0b40" : colors.border, flexDirection: "row", alignItems: "center", gap: 10 }]}>
            {a.imageUrl ? (
              <Image source={{ uri: resolveImageUrl(a.imageUrl) }} style={{ width: 48, height: 48, borderRadius: 10 }} />
            ) : (
              <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="calendar-outline" size={18} color={colors.mutedForeground} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>{a.title}</Text>
              <Text style={[styles.itemSub, { color: colors.mutedForeground }]} numberOfLines={1}>{a.organizerName}{a.category ? ` · ${a.category}` : ""}{a.startDate ? ` · ${a.startDate}` : ""}</Text>
            </View>
            <TouchableOpacity
              style={[styles.actionBtnWide, { backgroundColor: a.isFeaturedSlider ? "#f59e0b" : colors.muted, borderColor: a.isFeaturedSlider ? "#f59e0b" : colors.border }]}
              disabled={togglingOrganizerEventSlider === a.id}
              onPress={() => toggleOrganizerEventSlider(a)}
            >
              {togglingOrganizerEventSlider === a.id ? (
                <ActivityIndicator size="small" color={a.isFeaturedSlider ? "#000" : colors.foreground} />
              ) : (
                <Text style={{ color: a.isFeaturedSlider ? "#000" : colors.foreground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                  {a.isFeaturedSlider ? "In Slider" : "Add to Slider"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    );
  }

  // ─── RENDER REPORTS ──────────────────────────────────────────────────────────
  function renderReports() {
    const stats = checkinData?.stats ?? { total: 0, checkedIn: 0, notArrived: 0 };
    const rawRows = checkinData?.rows ?? [];
    const totalPages = checkinData?.totalPages ?? 0;
    const hasReportFilters = reportVendorId !== "all" || !!reportDateInput || reportStatusFilter !== "all";
    const rows = [...rawRows].sort((a, b) => {
      let av: string | number = (a[reportSortKey] as unknown as string | number) ?? "";
      let bv: string | number = (b[reportSortKey] as unknown as string | number) ?? "";
      if (typeof av === "boolean") av = av ? 1 : 0;
      if (typeof bv === "boolean") bv = bv ? 1 : 0;
      if (av < bv) return reportSortDir === "asc" ? -1 : 1;
      if (av > bv) return reportSortDir === "asc" ? 1 : -1;
      return 0;
    });
    const overallRate = stats.total > 0 ? ((stats.checkedIn / stats.total) * 100).toFixed(1) : "0";

    // Group attendance rows by event for per-event breakdown
    const byEvent = new Map<number, { title: string; vendor: string; total: number; checkedIn: number }>();
    for (const r of rows) {
      const existing = byEvent.get(r.eventId);
      if (existing) {
        existing.total += 1;
        if (r.checkedIn) existing.checkedIn += 1;
      } else {
        byEvent.set(r.eventId, { title: r.eventTitle || `Event #${r.eventId}`, vendor: r.vendorName, total: 1, checkedIn: r.checkedIn ? 1 : 0 });
      }
    }
    const eventBreakdown = Array.from(byEvent.entries()).map(([id, v]) => ({ eventId: id, ...v }));

    function rateColor(rate: number) {
      if (rate >= 75) return "#22c55e";
      if (rate >= 40) return "#f59e0b";
      return "#ef4444";
    }

    function vendorStatusColor(s: string) {
      if (s === "approved") return "#22c55e";
      if (s === "pending") return "#f59e0b";
      if (s === "rejected") return "#ef4444";
      return colors.mutedForeground;
    }

    return (
      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: 120 }]}
        refreshControl={<RefreshControl refreshing={checkinLoading || vendorsFullLoading} onRefresh={() => { fetchCheckinReport(); fetchVendorsFull(); }} tintColor={colors.primary} />}
      >
        {checkinLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

        {/* ATTENDANCE FILTERS */}
        <View style={{ gap: 10 }}>
          <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>FILTERS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {[{ id: "all", label: "All partners" }, ...vendorsFull.map((v) => ({ id: String(v.id), label: v.businessName }))].map((opt) => {
              const active = reportVendorId === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => { setReportVendorId(opt.id); setReportPage(1); }}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "22" : colors.card }}
                >
                  <Text style={{ color: active ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }} numberOfLines={1}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <View style={{ flex: 1, borderWidth: 1, borderRadius: 10, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.card }}>
              <TextInput
                value={reportDateInput}
                onChangeText={setReportDateInput}
                placeholder="Booking date YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                style={{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 13 }}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            {hasReportFilters && (
              <TouchableOpacity onPress={resetReportFilters} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {(["all", "checkedIn", "notArrived"] as const).map((s) => {
              const active = reportStatusFilter === s;
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => { setReportStatusFilter(s); setReportPage(1); }}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: "center", borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.card }}
                >
                  <Text style={{ color: active ? colors.primaryForeground : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                    {s === "all" ? "All" : s === "checkedIn" ? "Checked In" : "Not Arrived"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* CHECK-IN SUMMARY KPIS */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 4 }]}>CHECK-IN OVERVIEW</Text>
        <View style={styles.kpiGrid}>
          {[
            { label: "Total Tickets", value: stats.total, icon: "ticket-outline" as const, color: "#3b82f6" },
            { label: "Checked In", value: stats.checkedIn, icon: "checkmark-done-outline" as const, color: "#22c55e" },
            { label: "Not Arrived", value: stats.notArrived, icon: "time-outline" as const, color: "#f59e0b" },
            { label: "Check-in Rate", value: `${overallRate}%`, icon: "stats-chart-outline" as const, color: colors.primary },
          ].map((k) => (
            <View key={k.label} style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.kpiIcon, { backgroundColor: k.color + "20" }]}>
                <Ionicons name={k.icon} size={18} color={k.color} />
              </View>
              <Text style={[styles.kpiValue, { color: colors.foreground }]}>{String(k.value)}</Text>
              <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* PER-EVENT CHECK-IN BREAKDOWN */}
        {eventBreakdown.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 20 }]}>CHECK-IN BY EVENT</Text>
            {eventBreakdown.slice(0, 20).map((ev) => {
              const rate = ev.total > 0 ? (ev.checkedIn / ev.total) * 100 : 0;
              return (
                <View key={ev.eventId} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "column", gap: 8 }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>{ev.title}</Text>
                      <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{ev.vendor}</Text>
                    </View>
                    <Text style={{ color: rateColor(rate), fontSize: 14, fontFamily: "Inter_700Bold" }}>{rate.toFixed(0)}%</Text>
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" }}>
                    {ev.checkedIn} / {ev.total} checked in
                  </Text>
                  <View style={{ height: 6, backgroundColor: colors.muted, borderRadius: 3 }}>
                    <View style={{ height: 6, width: `${Math.min(rate, 100)}%`, backgroundColor: rateColor(rate), borderRadius: 3 }} />
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* RECENT ATTENDANCE LIST */}
        {rows.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 20 }]}>ALL CONFIRMED GUESTS ({checkinData?.total ?? rows.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 4 }}>
              {([["bookingDate", "Date"], ["userName", "Guest"], ["vendorName", "Partner"], ["guests", "Party"], ["checkedIn", "Status"]] as const).map(([key, label]) => {
                const active = reportSortKey === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => handleReportSort(key)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "22" : colors.card }}
                  >
                    <Text style={{ color: active ? colors.primary : colors.mutedForeground, fontSize: 11, fontFamily: "Inter_500Medium" }}>{label}</Text>
                    {active && <Ionicons name={reportSortDir === "asc" ? "arrow-up" : "arrow-down"} size={11} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {rows.map((r) => (
              <View key={r.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: r.checkedIn ? "#22c55e30" : colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>{r.userName || r.userEmail}</Text>
                  <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{r.vendorName} · {r.eventTitle}</Text>
                  <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{r.bookingDate}{r.checkedInAt ? ` · in ${new Date(r.checkedInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</Text>
                </View>
                <View style={[styles.roleBadge, { backgroundColor: r.checkedIn ? "#22c55e20" : colors.muted, borderColor: r.checkedIn ? "#22c55e" : colors.border }]}>
                  <Text style={{ color: r.checkedIn ? "#22c55e" : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>
                    {r.checkedIn ? "In" : "Pending"}
                  </Text>
                </View>
              </View>
            ))}
            {totalPages > 1 && (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                <TouchableOpacity
                  disabled={reportPage <= 1}
                  onPress={() => setReportPage((p) => p - 1)}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, opacity: reportPage <= 1 ? 0.4 : 1 }}
                >
                  <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>← Prev</Text>
                </TouchableOpacity>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>Page {reportPage} of {totalPages}</Text>
                <TouchableOpacity
                  disabled={reportPage >= totalPages}
                  onPress={() => setReportPage((p) => p + 1)}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, opacity: reportPage >= totalPages ? 0.4 : 1 }}
                >
                  <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Next →</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {rows.length === 0 && !checkinLoading && (
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", marginTop: 8 }}>No check-in data available</Text>
        )}

        {/* VENDOR STATUS BREAKDOWN */}
        {vendorsFull.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 20 }]}>PARTNER STATUS BREAKDOWN</Text>
            {(["approved", "pending", "rejected"] as const).map((s) => {
              const count = vendorsFull.filter((v) => v.status === s).length;
              const pct = vendorsFull.length > 0 ? (count / vendorsFull.length) * 100 : 0;
              return (
                <View key={s} style={{ gap: 4, marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: vendorStatusColor(s), fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "capitalize" }}>{s}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>{count}</Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: colors.muted, borderRadius: 3 }}>
                    <View style={{ height: 6, width: `${pct}%`, backgroundColor: vendorStatusColor(s), borderRadius: 3 }} />
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    );
  }

  // ─── AD ACTIONS ─────────────────────────────────────────────────────────────
  async function approveAd(id: number) {
    try {
      await customFetch(`/api/admin/ads/${id}/approve`, { method: "POST" });
      fetchAds();
    } catch {
      Alert.alert("Error", "Failed to approve ad.");
    }
  }

  async function rejectAd(id: number) {
    try {
      await customFetch(`/api/admin/ads/${id}/reject`, { method: "POST" });
      fetchAds();
    } catch {
      Alert.alert("Error", "Failed to reject ad.");
    }
  }

  async function toggleBlogPublished(id: number, published: boolean) {
    try {
      await customFetch(`/api/admin/blogs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !published }),
      });
      fetchBlogs();
    } catch {
      Alert.alert("Error", "Failed to update blog.");
    }
  }

  async function deleteBlog(id: number) {
    try {
      await customFetch(`/api/admin/blogs/${id}`, { method: "DELETE" });
      setBlogs((prev) => prev.filter((b) => b.id !== id));
    } catch {
      Alert.alert("Error", "Failed to delete blog.");
    }
  }

  // ─── RENDER CONTENT (ADS + BLOGS) ───────────────────────────────────────────
  function renderContent() {
    const pendingAds = ads.filter((a) => a.status === "pending");
    const otherAds = ads.filter((a) => a.status !== "pending");

    function adStatusColor(s: string) {
      if (s === "approved" || s === "active") return "#22c55e";
      if (s === "rejected") return "#ef4444";
      if (s === "pending") return "#f59e0b";
      return colors.mutedForeground;
    }

    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]} refreshControl={<RefreshControl refreshing={adsLoading || blogLoading} onRefresh={() => { fetchAds(); fetchBlogs(); }} tintColor={colors.primary} />}>
        {/* ADS SECTION */}
        {pendingAds.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: "#f59e0b" }]}>ADS PENDING REVIEW ({pendingAds.length})</Text>
            {pendingAds.map((a) => (
              <View key={a.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: "#f59e0b40", flexDirection: "column", gap: 8 }]}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: colors.foreground }]}>{a.vendorName || `Ad #${a.id}`}</Text>
                    {a.message ? <Text style={[styles.itemSub, { color: colors.mutedForeground }]} numberOfLines={2}>{a.message}</Text> : null}
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={[styles.actionBtnWide, { backgroundColor: "#22c55e20", borderColor: "#22c55e", flex: 1 }]} onPress={() => approveAd(a.id)}>
                    <Ionicons name="checkmark-circle-outline" size={14} color="#22c55e" />
                    <Text style={{ color: "#22c55e", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtnWide, { backgroundColor: "#ef444420", borderColor: "#ef4444", flex: 1 }]} onPress={() => rejectAd(a.id)}>
                    <Ionicons name="close-circle-outline" size={14} color="#ef4444" />
                    <Text style={{ color: "#ef4444", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: pendingAds.length > 0 ? 16 : 0 }]}>ALL ADS ({otherAds.length})</Text>
        {otherAds.map((a) => (
          <View key={a.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>{a.vendorName || `Ad #${a.id}`}</Text>
              {a.message ? <Text style={[styles.itemSub, { color: colors.mutedForeground }]} numberOfLines={1}>{a.message}</Text> : null}
            </View>
            <View style={[styles.roleBadge, { backgroundColor: adStatusColor(a.status) + "20", borderColor: adStatusColor(a.status) }]}>
              <Text style={{ color: adStatusColor(a.status), fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{a.status}</Text>
            </View>
          </View>
        ))}

        {/* BLOGS SECTION */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 8 }}>
          <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 0 }]}>BLOGS ({blogs.length})</Text>
          <TouchableOpacity
            onPress={() => openBlogEditor(null)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.primary + "20", borderWidth: 1, borderColor: colors.primary + "40" }}
          >
            <Ionicons name="add" size={14} color={colors.primary} />
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>New Post</Text>
          </TouchableOpacity>
        </View>
        {blogs.length === 0 && !blogLoading && (
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center" }}>No blogs found</Text>
        )}
        {blogs.map((b) => (
          <View key={b.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: b.published ? colors.primary + "30" : colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>{b.title}</Text>
              <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{b.slug}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <TouchableOpacity
                onPress={() => openBlogEditor(b)}
                accessibilityLabel="Edit blog post"
              >
                <Ionicons name="create-outline" size={18} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Alert.alert(b.published ? "Unpublish?" : "Publish?", `${b.published ? "Hide" : "Publish"} "${b.title}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Confirm", onPress: () => toggleBlogPublished(b.id, b.published) }])}
                accessibilityLabel={b.published ? "Unpublish blog post" : "Publish blog post"}
              >
                <Ionicons name={b.published ? "eye-outline" : "eye-off-outline"} size={18} color={b.published ? "#22c55e" : colors.mutedForeground} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Alert.alert("Delete Blog?", `Delete "${b.title}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => deleteBlog(b.id) }])}
                accessibilityLabel="Delete blog post"
              >
                <Ionicons name="trash-outline" size={16} color={colors.destructive} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  // ─── Messages tab ─────────────────────────────────────────────────────────────
  function renderMessages() {
    return <AdminMessagesTab colors={colors} />;
  }

  // ─── Booking Report tab ───────────────────────────────────────────────────────
  function renderBookingReport() {
    return <AdminBookingReportTab colors={colors} />;
  }

  // ─── CRM Leads tab ────────────────────────────────────────────────────────────
  function renderCrmLeads() {
    return <AdminCrmLeadsTab colors={colors} />;
  }

  const TABS = [
    { key: "analytics" as AdminTab, icon: "bar-chart-outline" as const, label: "Analytics" },
    { key: "commissions" as AdminTab, icon: "cash-outline" as const, label: "Commissions" },
    { key: "bookings" as AdminTab, icon: "ticket-outline" as const, label: "Bookings" },
    { key: "vendors" as AdminTab, icon: "business-outline" as const, label: "Partners" },
    { key: "users" as AdminTab, icon: "people-outline" as const, label: "Users" },
    { key: "events" as AdminTab, icon: "calendar-outline" as const, label: "Events" },
    { key: "subscriptions" as AdminTab, icon: "card-outline" as const, label: "Subs" },
    { key: "coupons" as AdminTab, icon: "pricetag-outline" as const, label: "Coupons" },
    { key: "announcements" as AdminTab, icon: "megaphone-outline" as const, label: "Announce" },
    { key: "reports" as AdminTab, icon: "analytics-outline" as const, label: "Reports" },
    { key: "content" as AdminTab, icon: "newspaper-outline" as const, label: "Content" },
    { key: "messages" as AdminTab, icon: "mail-outline" as const, label: "Messages" },
    { key: "booking-report" as AdminTab, icon: "stats-chart-outline" as const, label: "Report" },
    { key: "crm-leads" as AdminTab, icon: "person-add-outline" as const, label: "CRM" },
    { key: "settlements" as AdminTab, icon: "card-outline" as const, label: "Settlements" },
    { key: "live-occupancy" as AdminTab, icon: "pulse-outline" as const, label: "Live Occ" },
    { key: "plans" as AdminTab, icon: "options-outline" as const, label: "Plans" },
    { key: "reviews" as AdminTab, icon: "star-outline" as const, label: "Reviews" },
    { key: "event-organizers" as AdminTab, icon: "easel-outline" as const, label: "Event Orgs" },
    { key: "game-organizers" as AdminTab, icon: "game-controller-outline" as const, label: "Game Orgs" },
    { key: "solo-connect" as AdminTab, icon: "shield-checkmark-outline" as const, label: "Solo Mod" },
    { key: "private-parties" as AdminTab, icon: "balloon-outline" as const, label: "Parties" },
    { key: "create-pub" as AdminTab, icon: "add-circle-outline" as const, label: "Create Pub" },
    { key: "venues" as AdminTab, icon: "storefront-outline" as const, label: "Venues" },
  ];

  if (!user || user.role !== "admin") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.mutedForeground} />
        <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 18, textAlign: "center" }}>Admin Access Only</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" }}>This area is restricted to administrators.</Text>
        <TouchableOpacity
          style={{ borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, backgroundColor: colors.primary, marginTop: 8 }}
          onPress={() => router.replace("/(tabs)/profile")}
        >
          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={[styles.header, { paddingTop: topPadding + 12 }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Admin Panel</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>Platform management</Text>
          </View>
          <View style={[styles.shieldIcon, { backgroundColor: colors.primary + "20" }]}>
            <Ionicons name="shield-outline" size={20} color={colors.primary} />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setActiveTab(t.key)}
              style={[styles.tab, { backgroundColor: activeTab === t.key ? colors.primary : colors.muted, borderColor: activeTab === t.key ? colors.primary : colors.border }]}
            >
              <Ionicons name={t.icon} size={13} color={activeTab === t.key ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[styles.tabText, { color: activeTab === t.key ? colors.primaryForeground : colors.mutedForeground }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>

      {activeTab === "analytics" && renderAnalytics()}
      {activeTab === "bookings" && renderBookings()}
      {activeTab === "vendors" && renderVendors()}
      {activeTab === "users" && renderUsers()}
      {activeTab === "events" && renderEvents()}
      {activeTab === "subscriptions" && renderSubscriptions()}
      {activeTab === "coupons" && renderCoupons()}
      {activeTab === "announcements" && renderAnnouncements()}
      {activeTab === "reports" && renderReports()}
      {activeTab === "content" && renderContent()}
      {activeTab === "messages" && renderMessages()}
      {activeTab === "booking-report" && renderBookingReport()}
      {activeTab === "crm-leads" && renderCrmLeads()}
      {activeTab === "commissions" && <AdminCommissionsTab colors={colors} />}
      {activeTab === "settlements" && <AdminSettlementsTab colors={colors} />}
      {activeTab === "live-occupancy" && <AdminLiveOccupancyTab colors={colors} />}
      {activeTab === "reviews" && <AdminReviewsTab colors={colors} />}
      {activeTab === "plans" && <AdminPlansTab colors={colors} />}
      {activeTab === "event-organizers" && <AdminEventOrganizersTab colors={colors} />}
      {activeTab === "game-organizers" && <AdminGameOrganizersTab colors={colors} />}
      {activeTab === "solo-connect" && <AdminSoloModerationTab colors={colors} />}
      {activeTab === "private-parties" && <AdminPrivatePartiesTab colors={colors} />}
      {activeTab === "create-pub" && <AdminCreatePubTab colors={colors} />}
      {activeTab === "venues" && <AdminVenuesTab colors={colors} />}

      {/* Blog editor sheet — full-screen modal so the long content textarea
          has room. Renders at the page root so it overlays the active tab. */}
      <Modal
        visible={blogEditorOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { if (!savingBlog) setBlogEditorOpen(false); }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, backgroundColor: colors.background }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }}>
            <TouchableOpacity
              onPress={() => { if (!savingBlog) setBlogEditorOpen(false); }}
              disabled={savingBlog}
              hitSlop={8}
            >
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 15 }}>
              {editingBlogId != null ? "Edit blog post" : "New blog post"}
            </Text>
            <TouchableOpacity
              onPress={saveBlog}
              disabled={savingBlog}
              hitSlop={8}
            >
              {savingBlog ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 14 }}>
                  {editingBlogId != null ? "Update" : "Create"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 14 }}
            keyboardShouldPersistTaps="handled"
          >
            <BlogEditorField
              label="Title"
              required
              value={blogForm.title}
              onChangeText={(v) => setBlogForm((p) => ({ ...p, title: v }))}
              colors={colors}
              placeholder="A great night out in Mumbai"
            />
            <BlogEditorField
              label="Slug (URL)"
              required
              value={blogForm.slug}
              onChangeText={(v) => setBlogForm((p) => ({ ...p, slug: v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") }))}
              colors={colors}
              placeholder="great-night-out-mumbai"
              autoCapitalize="none"
            />
            <BlogEditorField
              label="Excerpt"
              value={blogForm.excerpt}
              onChangeText={(v) => setBlogForm((p) => ({ ...p, excerpt: v }))}
              colors={colors}
              multiline
              numberOfLines={2}
              placeholder="Short summary that shows in listing cards"
            />
            <BlogEditorField
              label="Content (HTML)"
              value={blogForm.content}
              onChangeText={(v) => setBlogForm((p) => ({ ...p, content: v }))}
              colors={colors}
              multiline
              numberOfLines={10}
              placeholder="<p>Article body…</p>"
              monospace
            />
            <BlogEditorField
              label="Image URL"
              value={blogForm.imageUrl}
              onChangeText={(v) => setBlogForm((p) => ({ ...p, imageUrl: v }))}
              colors={colors}
              placeholder="https://…"
              autoCapitalize="none"
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
              {!!blogForm.imageUrl && (
                <Image source={{ uri: resolveImageUrl(blogForm.imageUrl) }} style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: colors.muted }} />
              )}
              <TouchableOpacity onPress={pickBlogImage} disabled={uploadingBlogImage} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
                {uploadingBlogImage ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="image-outline" size={15} color={colors.foreground} />}
                <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_500Medium" }}>{uploadingBlogImage ? "Uploading…" : "Upload image"}</Text>
              </TouchableOpacity>
            </View>
            <BlogEditorField
              label="Author"
              value={blogForm.authorName}
              onChangeText={(v) => setBlogForm((p) => ({ ...p, authorName: v }))}
              colors={colors}
              placeholder="Royvento Editorial"
            />
            <BlogEditorField
              label="Tags (comma-separated)"
              value={blogForm.tags}
              onChangeText={(v) => setBlogForm((p) => ({ ...p, tags: v }))}
              colors={colors}
              placeholder="Mumbai, Nightlife, Guide"
            />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Published</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 }}>
                  Visible on the public blog list when on
                </Text>
              </View>
              <Switch
                value={blogForm.published}
                onValueChange={(v) => setBlogForm((p) => ({ ...p, published: v }))}
                trackColor={{ false: colors.border, true: colors.primary + "80" }}
                thumbColor={blogForm.published ? colors.primary : colors.mutedForeground}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// Small labelled text input used by the blog editor. Centralised so all
// fields get consistent label/placeholder styling and multiline support.
function BlogEditorField({
  label, value, onChangeText, colors, required, placeholder, multiline, numberOfLines, monospace, autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  colors: ReturnType<typeof useColors>;
  required?: boolean;
  placeholder?: string;
  multiline?: boolean;
  numberOfLines?: number;
  monospace?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View>
      <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        {label}{required ? " *" : ""}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        multiline={multiline}
        numberOfLines={numberOfLines}
        autoCapitalize={autoCapitalize}
        autoCorrect={!monospace}
        spellCheck={!monospace}
        style={{
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 12,
          color: colors.foreground,
          fontSize: monospace ? 12 : 14,
          fontFamily: monospace ? (Platform.OS === "ios" ? "Menlo" : "monospace") : "Inter_400Regular",
          minHeight: multiline && numberOfLines ? numberOfLines * 18 + 20 : undefined,
          textAlignVertical: multiline ? "top" : "auto",
        }}
      />
    </View>
  );
}

function AdminReviewsTab({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [page, setPage] = useState(1);
  const [vendorIdInput, setVendorIdInput] = useState("");
  const [rating, setRating] = useState<number | "">("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editComment, setEditComment] = useState("");
  const [editRating, setEditRating] = useState(5);

  const params: { page: number; pageSize: number; vendorId?: number; rating?: number; verified?: boolean } = { page, pageSize: 20 };
  const vidNum = Number(vendorIdInput);
  if (Number.isFinite(vidNum) && vidNum > 0) params.vendorId = vidNum;
  if (rating !== "") params.rating = rating;
  if (verifiedOnly) params.verified = true;

  const { data, refetch, isLoading } = useListReviewsAdmin(params);
  const deleteReview = useDeleteReview();
  const updateReview = useUpdateReview();
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 20));

  const onDelete = (id: number) => {
    Alert.alert("Remove review?", "This will be recorded for audit.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => deleteReview.mutate({ reviewId: id }, { onSuccess: () => refetch() }) },
    ]);
  };

  const onSaveEdit = () => {
    if (editingId == null) return;
    updateReview.mutate(
      { reviewId: editingId, data: { rating: editRating, comment: editComment } },
      { onSuccess: () => { setEditingId(null); refetch(); } },
    );
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground }}>All Reviews ({total})</Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <TextInput
          value={vendorIdInput}
          onChangeText={(v) => { setVendorIdInput(v); setPage(1); }}
          placeholder="Vendor ID"
          keyboardType="number-pad"
          placeholderTextColor={colors.mutedForeground}
          style={{ width: 110, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: colors.foreground, fontSize: 13 }}
        />
        {([1,2,3,4,5] as const).map((n) => (
          <TouchableOpacity key={n} onPress={() => { setRating(rating === n ? "" : n); setPage(1); }}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, backgroundColor: rating === n ? colors.primary : colors.muted, borderColor: rating === n ? colors.primary : colors.border }}>
            <Text style={{ color: rating === n ? colors.primaryForeground : colors.mutedForeground, fontSize: 12 }}>{n}★</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => { setVerifiedOnly((v) => !v); setPage(1); }}
          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, backgroundColor: verifiedOnly ? colors.primary : colors.muted, borderColor: verifiedOnly ? colors.primary : colors.border }}>
          <Text style={{ color: verifiedOnly ? colors.primaryForeground : colors.mutedForeground, fontSize: 12 }}>Verified only</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : items.length === 0 ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No reviews match.</Text>
      ) : items.map((r) => (
        <View key={r.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{r.userName}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                on {r.vendorName} (#{r.vendorId}) · {new Date(r.createdAt).toLocaleString()}
                {r.verifiedBooking ? " · ✓ verified" : ""}
              </Text>
            </View>
            <Text style={{ color: "#f59e0b", fontSize: 12 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</Text>
          </View>
          {editingId === r.id ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {[1,2,3,4,5].map((n) => (
                  <TouchableOpacity key={n} onPress={() => setEditRating(n)}>
                    <Ionicons name={n <= editRating ? "star" : "star-outline"} size={22} color={n <= editRating ? "#f59e0b" : colors.mutedForeground} />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                value={editComment}
                onChangeText={setEditComment}
                multiline
                placeholderTextColor={colors.mutedForeground}
                style={{ minHeight: 60, backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: colors.foreground, fontSize: 13 }}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity onPress={onSaveEdit} disabled={updateReview.isPending} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.primary }}>
                  <Text style={{ color: colors.primaryForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingId(null)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.foreground, fontSize: 12 }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {r.comment ? <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 18 }}>{r.comment}</Text> : null}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity onPress={() => { setEditingId(r.id); setEditComment(r.comment ?? ""); setEditRating(r.rating); }}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.foreground, fontSize: 12 }}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onDelete(r.id)} disabled={deleteReview.isPending}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: "#ef444455" }}>
                  <Text style={{ color: "#ef4444", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Remove</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      ))}
      {pages > 1 ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <TouchableOpacity disabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))} style={{ opacity: page <= 1 ? 0.4 : 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.foreground }}>Prev</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Page {page} of {pages}</Text>
          <TouchableOpacity disabled={page >= pages} onPress={() => setPage((p) => Math.min(pages, p + 1))} style={{ opacity: page >= pages ? 0.4 : 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.foreground }}>Next</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
}

function AdminLiveOccupancyTab({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [data, setData] = useState<import("@workspace/api-client-react").OccupancyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      // Generated client function — typed params object aligned with OpenAPI.
      getAdminLiveOccupancy({
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(city.trim() ? { city: city.trim() } : {}),
      })
        .then((r) => { if (!cancelled) { setData(r); setLoading(false); } })
        .catch(() => { if (!cancelled) setLoading(false); });
    };
    load();
    const id = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [q, city]);

  if (loading && !data) {
    return <View style={{ padding: 20 }}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (!data) return null;

  const overallPct = data.totals.totalCapacity > 0
    ? Math.round((data.totals.totalCurrentlyInside / data.totals.totalCapacity) * 1000) / 10
    : 0;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search pub or city"
          placeholderTextColor={colors.mutedForeground}
          style={{ flex: 1, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: colors.foreground, fontSize: 13, fontFamily: "Inter_400Regular" }}
        />
        <TextInput
          value={city}
          onChangeText={setCity}
          placeholder="City"
          placeholderTextColor={colors.mutedForeground}
          style={{ width: 110, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: colors.foreground, fontSize: 13, fontFamily: "Inter_400Regular" }}
        />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 140, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 12 }}>
          <Text style={{ fontSize: 10, color: colors.mutedForeground, textTransform: "uppercase", fontFamily: "Inter_600SemiBold" }}>Inside / Capacity</Text>
          <Text style={{ fontSize: 22, color: colors.foreground, fontFamily: "Inter_700Bold", marginTop: 4 }}>
            {data.totals.totalCurrentlyInside} / {data.totals.totalCapacity}
          </Text>
          <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>{overallPct}% full · {data.today}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 140, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 12 }}>
          <Text style={{ fontSize: 10, color: colors.mutedForeground, textTransform: "uppercase", fontFamily: "Inter_600SemiBold" }}>Today</Text>
          <Text style={{ fontSize: 13, color: colors.foreground, fontFamily: "Inter_600SemiBold", marginTop: 4 }}>
            {data.totals.totalCheckedInToday} in · {data.totals.totalCheckedOutToday} out
          </Text>
        </View>
      </View>

      {data.rows.length === 0 ? (
        <Text style={{ color: colors.mutedForeground, padding: 20, textAlign: "center" }}>No approved partners.</Text>
      ) : (
        data.rows.map((r) => {
          const pct = r.capacity > 0 ? r.occupancyPercent : 0;
          const barColor = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#22c55e";
          return (
            <Pressable
              key={r.vendorId}
              onPress={() => router.push({ pathname: "/admin/live-occupancy", params: { vendorId: String(r.vendorId), businessName: r.businessName } } as never)}
              style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14 }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ fontSize: 14, color: colors.foreground, fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>{r.businessName}</Text>
                  {r.city && <Text style={{ fontSize: 11, color: colors.mutedForeground }} numberOfLines={1}>{r.city}</Text>}
                </View>
                <Text style={{ fontSize: 16, color: colors.foreground, fontFamily: "Inter_700Bold" }}>
                  {r.currentlyInside}{r.capacity > 0 ? ` / ${r.capacity}` : ""}
                </Text>
              </View>
              {r.capacity > 0 && (
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden", marginBottom: 6 }}>
                  <View style={{ width: `${Math.min(100, pct)}%`, height: "100%", backgroundColor: barColor }} />
                </View>
              )}
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                {r.checkedInCount} in · {r.checkedOutCount} out · {r.notArrivedCount} pending · tap for details
              </Text>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ADMIN MODERATION TABS (mobile parity with web admin)
// ════════════════════════════════════════════════════════════════════════════
type AdminPal = ReturnType<typeof useColors>;

interface AdminOrganizer { id: number; name: string; slug: string; city: string; state: string; verified: boolean; status: string; ownerEmail: string | null; eventCount: number; }
interface PendingOrganizerEvent { id: number; title: string; category: string; shortDescription: string; city: string; }
interface AdminGameOrganizer { id: number; name: string; slug: string; city: string; state: string; verified: boolean; status: string; ownerEmail: string | null; gameCount: number; packageCount: number; }
interface PendingGame { id: number; name: string; category: string; pricingModel: string; price: string; hourlyRate: string; organizerName: string; kind: "game" | "package"; }
interface AdminSoloVerification { id: number; userName: string; userEmail: string; gender: string | null; selfieUrl: string; phone: string; phoneVerified: boolean; status: string; rejectionReason: string; banned: boolean; }
interface AdminSoloReport { id: number; reporterName: string; reportedName: string; reportCountAgainstReported: number; groupName: string; reason: string; description: string; status: string; }

function asArray<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const r = res as Record<string, unknown>;
  if (r && Array.isArray(r.data)) return r.data as T[];
  if (r && Array.isArray(r.verifications)) return r.verifications as T[];
  if (r && Array.isArray(r.reports)) return r.reports as T[];
  return [];
}

function ModBtn({ colors, label, onPress, tone }: { colors: AdminPal; label: string; onPress: () => void; tone?: "primary" | "danger" | "muted" }) {
  const bg = tone === "primary" ? colors.primary : tone === "danger" ? colors.red + "1a" : colors.muted;
  const fg = tone === "primary" ? colors.primaryForeground : tone === "danger" ? colors.redLight : colors.foreground;
  return (
    <TouchableOpacity onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: bg, borderWidth: tone === "primary" ? 0 : 1, borderColor: colors.border }}>
      <Text style={{ color: fg, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{label}</Text>
    </TouchableOpacity>
  );
}
function ModCard({ colors, children }: { colors: AdminPal; children: React.ReactNode }) {
  return <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginBottom: 10, gap: 6 }}>{children}</View>;
}
function ModEmpty({ colors, label }: { colors: AdminPal; label: string }) {
  return <Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 30, fontFamily: "Inter_400Regular" }}>{label}</Text>;
}

// ─── Create Pub / Club (admin-owned venue) ──────────────────────────────────
function AdminCreatePubTab({ colors }: { colors: AdminPal }) {
  const [f, setF] = useState({ businessName: "", category: "Pub" as "Pub" | "Club", description: "", city: "", state: "", country: "India", capacity: "" });
  const [busy, setBusy] = useState(false);
  const upd = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  async function create() {
    if (!f.businessName.trim()) { Alert.alert("Business name is required"); return; }
    setBusy(true);
    try {
      const r = await customFetch<{ ok: boolean; businessName: string }>("/api/admin/create-venue", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: f.businessName.trim(), category: f.category, description: f.description.trim(),
          country: f.country, state: f.state, city: f.city, capacity: Number(f.capacity) || 0,
          pubMode: "both", priceWomen: 0, priceMen: 0, priceCouple: 0,
          freeEntryEnabled: false, freeEntryGenders: [], freeEntryDays: [],
        }),
      });
      Alert.alert("Created & live", `"${r.businessName}" is live — assign it to a partner later.`);
      setF({ businessName: "", category: "Pub", description: "", city: "", state: "", country: "India", capacity: "" });
    } catch (e) { Alert.alert("Create failed", (e as Error).message); }
    finally { setBusy(false); }
  }
  const input = { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, color: colors.foreground, marginBottom: 12 } as const;
  const lbl = { color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" as const, marginBottom: 6 };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 12 }}>Create a venue (admin-owned)</Text>
      <Text style={lbl}>Category</Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {(["Pub", "Club"] as const).map((c) => (
          <TouchableOpacity key={c} onPress={() => upd("category", c)} style={{ flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: f.category === c ? colors.primary : colors.border, backgroundColor: f.category === c ? colors.primary + "1f" : colors.muted, alignItems: "center" }}>
            <Text style={{ color: f.category === c ? colors.primary : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={lbl}>Business name *</Text><TextInput value={f.businessName} onChangeText={(v) => upd("businessName", v)} placeholder="Venue name" placeholderTextColor={colors.mutedForeground} style={input} />
      <Text style={lbl}>Description</Text><TextInput value={f.description} onChangeText={(v) => upd("description", v)} placeholder="About the venue" placeholderTextColor={colors.mutedForeground} multiline style={[input, { minHeight: 70, textAlignVertical: "top" }]} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}><Text style={lbl}>City</Text><TextInput value={f.city} onChangeText={(v) => upd("city", v)} placeholder="City" placeholderTextColor={colors.mutedForeground} style={input} /></View>
        <View style={{ flex: 1 }}><Text style={lbl}>State</Text><TextInput value={f.state} onChangeText={(v) => upd("state", v)} placeholder="State" placeholderTextColor={colors.mutedForeground} style={input} /></View>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}><Text style={lbl}>Country</Text><TextInput value={f.country} onChangeText={(v) => upd("country", v)} placeholder="Country" placeholderTextColor={colors.mutedForeground} style={input} /></View>
        <View style={{ flex: 1 }}><Text style={lbl}>Capacity</Text><TextInput value={f.capacity} onChangeText={(v) => upd("capacity", v)} placeholder="0" keyboardType="number-pad" placeholderTextColor={colors.mutedForeground} style={input} /></View>
      </View>
      <TouchableOpacity onPress={create} disabled={busy} style={{ backgroundColor: busy ? colors.muted : colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 }}>
        <Text style={{ color: busy ? colors.mutedForeground : colors.primaryForeground, fontFamily: "Inter_700Bold" }}>{busy ? "Creating…" : "Create venue"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Venues (assign admin-owned venues to partners + audit trail) ───────────
interface AdminVenue {
  id: number; businessName: string; category: string; city: string; state: string; country: string;
  bannerImage: string; status: string; assignmentStatus: string; assignedAt: string | null;
  pubId: number | null; eventCount: number; bookingCount: number;
  ownerUserId: number | null; ownerEmail: string; ownerName: string; createdAt: string;
}
interface VenueAuditEntry {
  id: number; action: string; actorAdminEmail: string;
  partnerEmail: string; previousOwnerEmail: string; note: string; createdAt: string;
}
type LookupResult = {
  user: { id: number; name: string; email: string; role: string; signInMethod: string };
  vendor: { id: number; businessName: string; status: string; category: string; city: string; state: string } | null;
  existingPub: { id: number; title: string } | null;
  canCreate: boolean;
  blockReason: string | null;
};

function AdminVenuesTab({ colors }: { colors: AdminPal }) {
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unassigned" | "assigned">("all");
  const [assignTarget, setAssignTarget] = useState<AdminVenue | null>(null);
  const [historyTarget, setHistoryTarget] = useState<AdminVenue | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    customFetch<{ data: AdminVenue[] }>("/api/admin/venues")
      .then((r) => setVenues(asArray<AdminVenue>(r.data)))
      .catch(() => Alert.alert("Failed to load venues"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const unassign = (v: AdminVenue) => {
    Alert.alert(
      "Unassign venue?",
      `Unassign "${v.businessName}" from ${v.ownerEmail}? They will lose partner access to it (the venue and its history are kept).`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unassign", style: "destructive", onPress: async () => {
            try {
              await customFetch(`/api/admin/venues/${v.id}/unassign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
              load();
            } catch (e) { Alert.alert("Failed to unassign", (e as Error).message); }
          },
        },
      ],
    );
  };

  const unassignedCount = venues.filter((v) => v.assignmentStatus !== "assigned").length;
  const shown = venues.filter((v) =>
    filter === "all" ? true : filter === "unassigned" ? v.assignmentStatus !== "assigned" : v.assignmentStatus === "assigned");

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {([
          { id: "all" as const, label: `All (${venues.length})` },
          { id: "unassigned" as const, label: `Unassigned (${unassignedCount})` },
          { id: "assigned" as const, label: `Assigned (${venues.length - unassignedCount})` },
        ]).map((f) => (
          <TouchableOpacity
            key={f.id}
            onPress={() => setFilter(f.id)}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: filter === f.id ? colors.primary : colors.muted }}
          >
            <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: filter === f.id ? colors.primaryForeground : colors.mutedForeground }}>{f.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={load} style={{ marginLeft: "auto", padding: 6 }}>
          <Ionicons name="refresh-outline" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : shown.length === 0 ? (
        <ModEmpty colors={colors} label="No venues in this view." />
      ) : shown.map((v) => {
        const assigned = v.assignmentStatus === "assigned";
        return (
          <ModCard key={v.id} colors={colors}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", flex: 1 }} numberOfLines={1}>{v.businessName}</Text>
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: assigned ? "#22c55e20" : "#f59e0b20" }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: assigned ? "#22c55e" : "#f59e0b" }}>{assigned ? "Assigned" : "Unassigned"}</Text>
              </View>
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              {[v.city, v.state].filter(Boolean).join(", ") || "—"} · {v.category} · {v.eventCount} event{v.eventCount === 1 ? "" : "s"} · {v.bookingCount} booking{v.bookingCount === 1 ? "" : "s"}
            </Text>
            {assigned && !!v.ownerEmail && <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{v.ownerEmail}</Text>}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <ModBtn colors={colors} label={assigned ? "Reassign" : "Assign Partner"} tone="primary" onPress={() => setAssignTarget(v)} />
              {assigned && <ModBtn colors={colors} label="Unassign" tone="danger" onPress={() => unassign(v)} />}
              <ModBtn colors={colors} label="History" onPress={() => setHistoryTarget(v)} />
            </View>
          </ModCard>
        );
      })}

      {assignTarget && (
        <AssignVenueModal
          colors={colors}
          venue={assignTarget}
          onClose={() => setAssignTarget(null)}
          onDone={() => { setAssignTarget(null); load(); }}
        />
      )}
      {historyTarget && (
        <VenueHistoryModal colors={colors} venue={historyTarget} onClose={() => setHistoryTarget(null)} />
      )}
    </ScrollView>
  );
}

function AssignVenueModal({ colors, venue, onClose, onDone }: { colors: AdminPal; venue: AdminVenue; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [lookupErr, setLookupErr] = useState("");
  const reassign = venue.assignmentStatus === "assigned";

  useEffect(() => {
    const e = email.trim();
    setLookup(null); setLookupErr("");
    if (!e || !e.includes("@")) { setLooking(false); return; }
    let cancelled = false;
    setLooking(true);
    const t = setTimeout(() => {
      customFetch<LookupResult>(`/api/admin/lookup-partner?email=${encodeURIComponent(e)}`)
        .then((d) => { if (!cancelled) setLookup(d); })
        .catch((err: unknown) => { if (!cancelled) setLookupErr((err as Error)?.message ?? "No account found for that email."); })
        .finally(() => { if (!cancelled) setLooking(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [email]);

  const ownedVenue = lookup?.vendor ?? null;
  const ownsSameVenue = !!ownedVenue && ownedVenue.id === venue.id;
  const blockedByOwnership = !!ownedVenue;

  const submit = async () => {
    const e = email.trim();
    if (!e) { setError("Partner email is required."); return; }
    if (blockedByOwnership) {
      setError(ownsSameVenue
        ? "This venue is already assigned to that partner."
        : `${e} already manages "${ownedVenue?.businessName}". Each partner can own only one pub/club.`);
      return;
    }
    setError(""); setSubmitting(true);
    try {
      await customFetch(`/api/admin/venues/${venue.id}/assign`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, note: note.trim() || undefined }),
      });
      onDone();
    } catch (err) {
      setError((err as Error)?.message ?? "Assignment failed.");
    } finally { setSubmitting(false); }
  };

  const input = { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, color: colors.foreground } as const;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000000a0", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12, maxHeight: "85%" }}>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 17 }}>
            {reassign ? "Reassign" : "Assign"} "{venue.businessName}"
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
            {reassign
              ? `Currently owned by ${venue.ownerEmail}. Reassigning transfers the venue and all its history to a new partner; the previous owner loses access.`
              : "Assign this venue to an existing partner account by email. All bookings, commission and reviews are preserved, and Managers / Attendance / Ads / Banking unlock for them."}
          </Text>
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>Partner email</Text>
            <TextInput
              value={email}
              onChangeText={(v) => { setEmail(v); setError(""); }}
              placeholder="partner@example.com"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              keyboardType="email-address"
              style={input}
            />
            {looking && <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Checking account…</Text>}
            {!looking && blockedByOwnership && (
              <View style={{ borderRadius: 10, borderWidth: 1, borderColor: "#f59e0b60", backgroundColor: "#f59e0b15", padding: 10 }}>
                <Text style={{ color: "#f59e0b", fontSize: 11, lineHeight: 16 }}>
                  {ownsSameVenue
                    ? "This venue is already assigned to that partner."
                    : `${email.trim()} already manages "${ownedVenue?.businessName}". Each partner can own only one pub/club — unassign that venue first.`}
                </Text>
              </View>
            )}
            {!looking && lookup && !blockedByOwnership && (
              <View style={{ borderRadius: 10, borderWidth: 1, borderColor: "#22c55e50", backgroundColor: "#22c55e15", padding: 10 }}>
                <Text style={{ color: "#22c55e", fontSize: 11 }}>{lookup.user.name} ({lookup.user.role}) — ready to {reassign ? "reassign" : "assign"}.</Text>
              </View>
            )}
            {!looking && lookupErr && <Text style={{ color: "#f59e0bcc", fontSize: 11 }}>{lookupErr}</Text>}
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>Note (optional)</Text>
            <TextInput value={note} onChangeText={setNote} placeholder="Reason / reference" placeholderTextColor={colors.mutedForeground} style={input} />
          </View>
          {!!error && (
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: "#ef444460", backgroundColor: "#ef444415", padding: 10 }}>
              <Text style={{ color: "#ef4444", fontSize: 12 }}>{error}</Text>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
            <TouchableOpacity onPress={onClose} disabled={submitting} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submit}
              disabled={submitting || !email.trim() || looking || blockedByOwnership}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", opacity: (submitting || !email.trim() || looking || blockedByOwnership) ? 0.6 : 1 }}
            >
              {submitting ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : (
                <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold" }}>{reassign ? "Reassign Venue" : "Assign Venue"}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function VenueHistoryModal({ colors, venue, onClose }: { colors: AdminPal; venue: AdminVenue; onClose: () => void }) {
  const [entries, setEntries] = useState<VenueAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    customFetch<{ data: VenueAuditEntry[] }>(`/api/admin/venues/${venue.id}/audit`)
      .then((r) => setEntries(asArray<VenueAuditEntry>(r.data)))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [venue.id]);

  const labelFor = (a: string) =>
    a === "created" ? "Created" : a === "assigned" ? "Assigned" : a === "reassigned" ? "Reassigned" : a === "unassigned" ? "Unassigned" : a;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000000a0", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12, maxHeight: "80%" }}>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 17 }}>History — {venue.businessName}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Audit trail of creation and partner assignments.</Text>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : entries.length === 0 ? (
            <ModEmpty colors={colors} label="No history recorded." />
          ) : (
            <ScrollView style={{ maxHeight: 380 }}>
              {entries.map((e) => (
                <View key={e.id} style={{ borderLeftWidth: 2, borderLeftColor: colors.primary, paddingLeft: 12, marginBottom: 14 }}>
                  <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                    {labelFor(e.action)}{e.partnerEmail ? ` → ${e.partnerEmail}` : ""}
                  </Text>
                  {!!e.previousOwnerEmail && <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Previous owner: {e.previousOwnerEmail}</Text>}
                  {!!e.note && <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{e.note}</Text>}
                  <Text style={{ color: colors.mutedForeground, fontSize: 10, marginTop: 2 }}>
                    {new Date(e.createdAt).toLocaleString("en-IN")}{e.actorAdminEmail ? ` · by ${e.actorAdminEmail}` : ""}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
          <TouchableOpacity onPress={onClose} style={{ paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Event Organizers (verify/status + pending events) ──────────────────────
function AdminEventOrganizersTab({ colors }: { colors: AdminPal }) {
  const [orgs, setOrgs] = useState<AdminOrganizer[]>([]);
  const [pending, setPending] = useState<PendingOrganizerEvent[]>([]);
  const load = useCallback(() => {
    customFetch<AdminOrganizer[]>("/api/admin/organizers").then((r) => setOrgs(asArray(r))).catch(() => {});
    customFetch<PendingOrganizerEvent[]>("/api/admin/organizer-events/pending").then((r) => setPending(asArray(r))).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  async function patch(path: string, body: unknown) { try { await customFetch(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); load(); } catch (e) { Alert.alert("Failed", (e as Error).message); } }
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      {pending.length > 0 && (
        <>
          <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10 }}>Pending events ({pending.length})</Text>
          {pending.map((e) => (
            <ModCard key={e.id} colors={colors}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold" }}>{e.title}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{e.category} · {e.city}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                <ModBtn colors={colors} label="Approve" tone="primary" onPress={() => patch(`/api/admin/organizer-events/${e.id}/approve`, {})} />
                <ModBtn colors={colors} label="Reject" tone="danger" onPress={() => Alert.prompt ? Alert.prompt("Reject event", "Reason", (reason) => patch(`/api/admin/organizer-events/${e.id}/reject`, { rejectionReason: reason || "" })) : patch(`/api/admin/organizer-events/${e.id}/reject`, { rejectionReason: "" })} />
              </View>
            </ModCard>
          ))}
        </>
      )}
      <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold", marginVertical: 10 }}>Event organizers ({orgs.length})</Text>
      {orgs.length === 0 ? <ModEmpty colors={colors} label="No event organizers." /> : orgs.map((o) => (
        <ModCard key={o.id} colors={colors}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", flex: 1 }} numberOfLines={1}>{o.name}</Text>
            {o.verified && <Ionicons name="checkmark-circle" size={15} color="#f59e0b" />}
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{[o.city, o.state].filter(Boolean).join(", ")} · {o.eventCount} events · {o.status}</Text>
          {!!o.ownerEmail && <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{o.ownerEmail}</Text>}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <ModBtn colors={colors} label={o.verified ? "Unverify" : "Verify"} onPress={() => patch(`/api/admin/organizers/${o.id}/verify`, { verified: !o.verified })} />
            <ModBtn colors={colors} label={o.status === "suspended" ? "Activate" : "Suspend"} tone={o.status === "suspended" ? "primary" : "danger"} onPress={() => patch(`/api/admin/organizers/${o.id}/status`, { status: o.status === "suspended" ? "active" : "suspended" })} />
          </View>
        </ModCard>
      ))}
    </ScrollView>
  );
}

// ─── Game Organizers (verify/status + pending games/packages) ───────────────
function AdminGameOrganizersTab({ colors }: { colors: AdminPal }) {
  const [orgs, setOrgs] = useState<AdminGameOrganizer[]>([]);
  const [pending, setPending] = useState<PendingGame[]>([]);
  const load = useCallback(() => {
    customFetch<AdminGameOrganizer[]>("/api/admin/game-organizers").then((r) => setOrgs(asArray(r))).catch(() => {});
    customFetch<PendingGame[]>("/api/admin/games/pending").then((r) => setPending(asArray(r))).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  async function patch(path: string, body: unknown) { try { await customFetch(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); load(); } catch (e) { Alert.alert("Failed", (e as Error).message); } }
  const base = (k: PendingGame["kind"]) => k === "package" ? "/api/admin/game-packages" : "/api/admin/games";
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      {pending.length > 0 && (
        <>
          <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10 }}>Pending games & packages ({pending.length})</Text>
          {pending.map((g) => (
            <ModCard key={`${g.kind}-${g.id}`} colors={colors}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold" }}>{g.name} <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>· {g.kind}</Text></Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{g.category} · {g.organizerName}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                <ModBtn colors={colors} label="Approve" tone="primary" onPress={() => patch(`${base(g.kind)}/${g.id}/approve`, {})} />
                <ModBtn colors={colors} label="Reject" tone="danger" onPress={() => Alert.prompt ? Alert.prompt("Reject", "Reason", (reason) => patch(`${base(g.kind)}/${g.id}/reject`, { rejectionReason: reason || "" })) : patch(`${base(g.kind)}/${g.id}/reject`, { rejectionReason: "" })} />
              </View>
            </ModCard>
          ))}
        </>
      )}
      <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold", marginVertical: 10 }}>Game organizers ({orgs.length})</Text>
      {orgs.length === 0 ? <ModEmpty colors={colors} label="No game organizers." /> : orgs.map((o) => (
        <ModCard key={o.id} colors={colors}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", flex: 1 }} numberOfLines={1}>{o.name}</Text>
            {o.verified && <Ionicons name="checkmark-circle" size={15} color="#f59e0b" />}
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{[o.city, o.state].filter(Boolean).join(", ")} · {o.gameCount} games · {o.packageCount} pkgs · {o.status}</Text>
          {!!o.ownerEmail && <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{o.ownerEmail}</Text>}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <ModBtn colors={colors} label={o.verified ? "Unverify" : "Verify"} onPress={() => patch(`/api/admin/game-organizers/${o.id}/verify`, { verified: !o.verified })} />
            <ModBtn colors={colors} label={o.status === "suspended" ? "Activate" : "Suspend"} tone={o.status === "suspended" ? "primary" : "danger"} onPress={() => patch(`/api/admin/game-organizers/${o.id}/status`, { status: o.status === "suspended" ? "active" : "suspended" })} />
          </View>
        </ModCard>
      ))}
    </ScrollView>
  );
}

// ─── Solo Connect moderation (verifications + reports) ──────────────────────
interface AdminSoloGroup {
  id: number; name: string; city: string; status: string; creatorName: string; creatorEmail: string;
  pendingCount: number; totalMemberCount: number; daysSinceActivity: number | null; deletedAt: string | null;
}
interface AdminSoloDeletedGroup {
  id: number; groupId: number; name: string; memberCount: number; reason: string; deletedAt: string; restorable: boolean;
}
interface AdminSoloModLogRow {
  id: number; adminName: string; targetName: string; groupId: number | null; reportId: number | null; action: string; note: string; createdAt: string;
}
function AdminSoloModerationTab({ colors }: { colors: AdminPal }) {
  const [view, setView] = useState<"verifications" | "reports" | "groups" | "deleted" | "log">("verifications");
  const [verifs, setVerifs] = useState<AdminSoloVerification[]>([]);
  const [reports, setReports] = useState<AdminSoloReport[]>([]);
  const [groups, setGroups] = useState<AdminSoloGroup[]>([]);
  const [deletedGroups, setDeletedGroups] = useState<AdminSoloDeletedGroup[]>([]);
  const [modLog, setModLog] = useState<AdminSoloModLogRow[]>([]);
  const load = useCallback(() => {
    customFetch("/api/admin/solo-connect/verifications?status=pending").then((r) => setVerifs(asArray<AdminSoloVerification>(r))).catch(() => {});
    customFetch("/api/admin/solo-connect/reports?status=pending").then((r) => setReports(asArray<AdminSoloReport>(r))).catch(() => {});
    customFetch("/api/admin/solo-connect/groups").then((r) => setGroups(asArray<AdminSoloGroup>(r))).catch(() => {});
    customFetch("/api/admin/solo-connect/deleted-groups").then((r) => setDeletedGroups(asArray<AdminSoloDeletedGroup>(r))).catch(() => {});
    customFetch("/api/admin/solo-connect/moderation-actions").then((r) => setModLog(asArray<AdminSoloModLogRow>(r))).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  async function review(id: number, decision: "approved" | "rejected") {
    try { await customFetch(`/api/admin/solo-connect/verifications/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, rejectionReason: "" }) }); load(); }
    catch (e) { Alert.alert("Failed", (e as Error).message); }
  }
  async function reportAction(id: number, action: string) {
    try { await customFetch(`/api/admin/solo-connect/reports/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); load(); }
    catch (e) { Alert.alert("Failed", (e as Error).message); }
  }
  async function closeGroup(id: number) {
    try { await customFetch(`/api/admin/solo-connect/groups/${id}/close`, { method: "POST" }); load(); }
    catch (e) { Alert.alert("Failed", (e as Error).message); }
  }
  function deleteGroup(id: number, name: string) {
    Alert.alert("Delete group?", `"${name}" and its members/messages/reports will be permanently removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await customFetch(`/api/admin/solo-connect/groups/${id}`, { method: "DELETE" }); load(); }
        catch (e) { Alert.alert("Failed", (e as Error).message); }
      } },
    ]);
  }
  async function restoreGroup(id: number) {
    try { await customFetch(`/api/admin/solo-connect/groups/${id}/restore`, { method: "POST" }); load(); }
    catch (e) { Alert.alert("Failed", (e as Error).message); }
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["verifications", "reports", "groups", "deleted", "log"] as const).map((v) => (
            <TouchableOpacity key={v} onPress={() => setView(v)} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: view === v ? colors.primary : colors.border, backgroundColor: view === v ? colors.primary + "1f" : colors.muted, alignItems: "center" }}>
              <Text style={{ color: view === v ? colors.primary : colors.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "capitalize", fontSize: 12 }}>
                {v === "log" ? "Mod log" : v}{v === "verifications" ? ` (${verifs.length})` : v === "reports" ? ` (${reports.length})` : v === "groups" ? ` (${groups.length})` : v === "deleted" ? ` (${deletedGroups.length})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      {view === "verifications" && (
        verifs.length === 0 ? <ModEmpty colors={colors} label="No pending verifications." /> : verifs.map((v) => (
          <ModCard key={v.id} colors={colors}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold" }}>{v.userName}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{v.userEmail} · {v.gender ?? "—"} · {v.phoneVerified ? "phone ✓" : "phone ✗"}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <ModBtn colors={colors} label="Approve" tone="primary" onPress={() => review(v.id, "approved")} />
              <ModBtn colors={colors} label="Reject" tone="danger" onPress={() => review(v.id, "rejected")} />
            </View>
          </ModCard>
        ))
      )}
      {view === "reports" && (
        reports.length === 0 ? <ModEmpty colors={colors} label="No pending reports." /> : reports.map((r) => (
          <ModCard key={r.id} colors={colors}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold" }}>{r.reportedName} <Text style={{ color: colors.redLight, fontSize: 11 }}>· {r.reportCountAgainstReported} reports</Text></Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>by {r.reporterName} · {r.reason} · {r.groupName}</Text>
            {!!r.description && <Text style={{ color: colors.mutedForeground, fontSize: 12 }} numberOfLines={3}>{r.description}</Text>}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <ModBtn colors={colors} label="Dismiss" onPress={() => reportAction(r.id, "dismiss")} />
              <ModBtn colors={colors} label="Warn" onPress={() => reportAction(r.id, "warn")} />
              <ModBtn colors={colors} label="Suspend" tone="danger" onPress={() => reportAction(r.id, "suspend")} />
              <ModBtn colors={colors} label="Ban" tone="danger" onPress={() => reportAction(r.id, "ban")} />
            </View>
          </ModCard>
        ))
      )}
      {view === "groups" && (
        groups.length === 0 ? <ModEmpty colors={colors} label="No active groups." /> : groups.map((g) => (
          <ModCard key={g.id} colors={colors}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", flex: 1 }} numberOfLines={1}>{g.name}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, textTransform: "capitalize" }}>{g.status}</Text>
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{g.city} · {g.totalMemberCount} members{g.pendingCount ? ` · ${g.pendingCount} pending` : ""}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>By {g.creatorName} ({g.creatorEmail}){g.daysSinceActivity !== null ? ` · ${g.daysSinceActivity}d inactive` : ""}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              {g.status !== "closed" && <ModBtn colors={colors} label="Close" onPress={() => closeGroup(g.id)} />}
              <ModBtn colors={colors} label="Delete" tone="danger" onPress={() => deleteGroup(g.id, g.name)} />
            </View>
          </ModCard>
        ))
      )}
      {view === "deleted" && (
        deletedGroups.length === 0 ? <ModEmpty colors={colors} label="No deleted groups." /> : deletedGroups.map((g) => (
          <ModCard key={g.id} colors={colors}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold" }}>{g.name}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{g.memberCount} members · {g.reason}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Deleted {new Date(g.deletedAt).toLocaleDateString()}</Text>
            {g.restorable && (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                <ModBtn colors={colors} label="Restore" tone="primary" onPress={() => restoreGroup(g.groupId)} />
              </View>
            )}
          </ModCard>
        ))
      )}
      {view === "log" && (
        modLog.length === 0 ? <ModEmpty colors={colors} label="No moderation actions yet." /> : modLog.map((l) => (
          <ModCard key={l.id} colors={colors}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", textTransform: "capitalize" }}>{l.action}{l.targetName ? ` · ${l.targetName}` : ""}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>by {l.adminName || "system"} · {new Date(l.createdAt).toLocaleString()}</Text>
            {!!l.note && <Text style={{ color: colors.mutedForeground, fontSize: 12 }} numberOfLines={2}>{l.note}</Text>}
          </ModCard>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 16, gap: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  shieldIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tabBar: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  tabText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  list: { padding: 20, gap: 10 },
  sectionHeader: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5, marginBottom: 8 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpiCard: { width: "47%", borderRadius: 14, borderWidth: 1, padding: 14, gap: 6, alignItems: "center" },
  kpiIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  kpiValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  kpiLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  itemCard: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  itemTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  itemSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  actionBtn: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  actionBtnWide: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  premiumBadge: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  userAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  roleBadge: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  filterChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  rejectBox: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 10 },
  reasonInput: { borderWidth: 1, borderRadius: 10, padding: 10, minHeight: 60, textAlignVertical: "top", fontSize: 13, fontFamily: "Inter_400Regular" },
});

// ─── Private Parties (Create Your Own Party) moderation ─────────────────────
interface AdminPartyRow {
  id: number;
  name: string;
  city: string;
  venueName: string;
  visibility: string;
  joinType: string;
  status: string;
  partyDate: string | null;
  organizerName: string;
  organizerEmail: string;
  ticketType: string;
  ticketPrice: string;
  guestsGoing: number;
  confirmedBookings: number;
  revenue: string;
  netEarnings: string;
}

interface PartyDetailPayload {
  party: Record<string, unknown> & { id: number; name: string; description?: string; address?: string; organizerName: string; organizerEmail: string };
  stats: { totalBookings: number; cancelledBookings: number; guestsGoing: number; checkedInCount: number; revenue: string; commission: string; netEarnings: string; capacity: number; seatsLeft: number | null };
  bookings: { id: number; bookingCode: string; name: string; email: string; phone: string; quantity: number; totalPrice: string; status: string; checkedIn: boolean; createdAt: string }[];
  attendees: { id: number; name: string; gender: string; quantity: number; status: string }[];
  messages: { id: number; userName: string; isHost: boolean; body: string; createdAt: string }[];
}
function PartyDetailModal({ colors, partyId, onClose }: { colors: AdminPal; partyId: number | null; onClose: () => void }) {
  const [data, setData] = useState<PartyDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (partyId === null) { setData(null); return; }
    setLoading(true);
    customFetch<PartyDetailPayload>(`/api/admin/create-your-party/${partyId}/detail`)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [partyId]);

  return (
    <Modal visible={partyId !== null} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
        <View style={{ maxHeight: "88%", borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold", flex: 1 }} numberOfLines={1}>{data?.party.name ?? "Party detail"}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={colors.mutedForeground} /></TouchableOpacity>
          </View>
          {loading || !data ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 30 }} /> : (
            <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 10 }}>
                Host: {data.party.organizerName}{data.party.organizerEmail ? ` (${data.party.organizerEmail})` : ""}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {[
                  { label: "Bookings", value: String(data.stats.totalBookings) },
                  { label: "Cancelled", value: String(data.stats.cancelledBookings) },
                  { label: "Going", value: String(data.stats.guestsGoing) },
                  { label: "Checked in", value: String(data.stats.checkedInCount) },
                  { label: "Revenue", value: `₹${Number(data.stats.revenue).toLocaleString("en-IN")}` },
                  { label: "Net earnings", value: `₹${Number(data.stats.netEarnings).toLocaleString("en-IN")}` },
                  { label: "Seats left", value: data.stats.seatsLeft === null ? "∞" : String(data.stats.seatsLeft) },
                ].map((s) => (
                  <View key={s.label} style={{ minWidth: "30%", borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 8 }}>
                    <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: "Inter_700Bold" }}>{s.value}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 9, fontFamily: "Inter_500Medium", textTransform: "uppercase" }}>{s.label}</Text>
                  </View>
                ))}
              </View>

              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 6 }}>Bookings ({data.bookings.length})</Text>
              {data.bookings.length === 0 ? <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 12 }}>No bookings yet.</Text> : data.bookings.map((b) => (
                <View key={b.id} style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 10, marginBottom: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{b.name || "Guest"}</Text>
                    <Text style={{ color: b.checkedIn ? "#4ade80" : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{b.checkedIn ? "Checked in" : b.status}</Text>
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{[b.phone, b.email].filter(Boolean).join(" · ")} · ×{b.quantity} · ₹{Number(b.totalPrice).toLocaleString("en-IN")}</Text>
                </View>
              ))}

              {data.attendees.length > 0 && (
                <>
                  <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_700Bold", marginTop: 10, marginBottom: 6 }}>Attendees ({data.attendees.length})</Text>
                  {data.attendees.map((a) => (
                    <View key={a.id} style={{ flexDirection: "row", justifyContent: "space-between", borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 8, marginBottom: 6 }}>
                      <Text style={{ color: colors.foreground, fontSize: 12 }}>{a.name}</Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{a.gender} · ×{a.quantity} · {a.status}</Text>
                    </View>
                  ))}
                </>
              )}

              {data.messages.length > 0 && (
                <>
                  <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_700Bold", marginTop: 10, marginBottom: 6 }}>Chat ({data.messages.length})</Text>
                  {data.messages.map((m) => (
                    <View key={m.id} style={{ marginBottom: 6 }}>
                      <Text style={{ color: m.isHost ? colors.primary : colors.foreground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{m.userName}{m.isHost ? " (host)" : ""}</Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{m.body}</Text>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function AdminPrivatePartiesTab({ colors }: { colors: AdminPal }) {
  const [rows, setRows] = useState<AdminPartyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "published" | "cancelled">("all");
  const [detailId, setDetailId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    customFetch<AdminPartyRow[]>("/api/admin/create-your-party")
      .then((r) => setRows(asArray(r)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function cancelParty(id: number, reason: string) {
    try {
      await customFetch(`/api/admin/create-your-party/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      load();
    } catch (e) {
      Alert.alert("Failed", (e as Error).message);
    }
  }

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const statusColor = (s: string) => (s === "published" ? "#22c55e" : s === "cancelled" ? colors.red : "#f59e0b");

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10 }}>
        Private Parties ({rows.length})
      </Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {(["all", "published", "cancelled"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, backgroundColor: filter === f ? colors.primary : colors.muted, borderColor: filter === f ? colors.primary : colors.border }}
          >
            <Text style={{ color: filter === f ? colors.primaryForeground : colors.mutedForeground, fontSize: 12, textTransform: "capitalize" }}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : filtered.length === 0 ? (
        <ModEmpty colors={colors} label="No parties match." />
      ) : filtered.map((p) => (
        <Pressable key={p.id} onPress={() => setDetailId(p.id)}>
        <ModCard colors={colors}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", flex: 1 }} numberOfLines={1}>{p.name}</Text>
            <View style={{ backgroundColor: statusColor(p.status) + "22", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: statusColor(p.status), fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{p.status}</Text>
            </View>
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            {[p.venueName, p.city].filter(Boolean).join(", ")} · {p.visibility === "private" ? "Private" : "Public"} · {p.ticketType === "paid" ? `₹${Number(p.ticketPrice).toLocaleString("en-IN")}` : "Free"}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
            Host: {p.organizerName}{p.organizerEmail ? ` (${p.organizerEmail})` : ""}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
            {p.guestsGoing} going · {p.confirmedBookings} bookings{p.ticketType === "paid" ? ` · ₹${Number(p.revenue).toLocaleString("en-IN")} revenue` : ""}
          </Text>
          {p.status !== "cancelled" && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <ModBtn
                colors={colors}
                label="Remove party"
                tone="danger"
                onPress={() =>
                  Alert.prompt
                    ? Alert.prompt("Remove party", "Reason (shown to the host)", (reason) => cancelParty(p.id, reason || ""))
                    : Alert.alert("Remove this party?", "It will be cancelled and the host notified.", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Remove", style: "destructive", onPress: () => cancelParty(p.id, "") },
                      ])
                }
              />
            </View>
          )}
        </ModCard>
        </Pressable>
      ))}
      <PartyDetailModal colors={colors} partyId={detailId} onClose={() => setDetailId(null)} />
    </ScrollView>
  );
}
