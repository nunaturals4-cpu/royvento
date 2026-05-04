import { Ionicons } from "@expo/vector-icons";
import {
  customFetch,
  getGetAdminAnalyticsQueryKey,
  getGetAdminBookingsReportQueryKey,
  getGetAdminLeadsSummaryQueryKey,
  useGetAdminAnalytics,
  useGetAdminBookingsReport,
  useGetAdminLeadsSummary,
} from "@workspace/api-client-react";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type AdminTab = "analytics" | "bookings" | "events" | "vendors" | "users" | "subscriptions" | "coupons" | "content" | "messages" | "booking-report" | "crm-leads" | "import-pub" | "announcements" | "reports" | "commissions" | "settlements";

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
  name?: string;
  email?: string;
  phone?: string;
  vendorId?: number;
  vendorName?: string;
  eventTitle?: string;
  source: string;
  createdAt: string;
}

interface AdminVendor {
  id: number;
  businessName: string;
  category: string;
  status: string;
  location: string;
  isPremium: boolean;
  createdAt: string;
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
  published: boolean;
  createdAt: string;
}

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
}

interface CommissionReportBookingLine {
  id: number;
  finalPrice: number;
  bookingType: "free_entry" | "ticket" | "table";
  commissionRate: number;
  unitCount: number;
  commissionAmount: number;
  createdAt: string;
}

interface CommissionReportVendorRow {
  vendorId: number;
  businessName: string;
  city: string;
  appliedRates: { freeEntryRate: string; ticketRate: string; tableBookingRate: string };
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
  bookings: CommissionReportBookingLine[];
}

interface CommissionReport {
  rows: CommissionReportVendorRow[];
  totals: { totalBookings: number; totalRevenue: number; totalCommission: number };
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
              rateMap[v.id] = { freeEntryRate: "0", ticketRate: "0", tableBookingRate: "0" };
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

  function setDraft(vendorId: number, field: keyof CommissionRates, value: string) {
    setDrafts((prev) => ({ ...prev, [vendorId]: { ...(prev[vendorId] ?? { freeEntryRate: "0", ticketRate: "0", tableBookingRate: "0" }), [field]: value } }));
  }

  const isDirty = (vendorId: number) => {
    const d = drafts[vendorId];
    const r = rates[vendorId];
    if (!d || !r) return false;
    return d.freeEntryRate !== r.freeEntryRate || d.ticketRate !== r.ticketRate || d.tableBookingRate !== r.tableBookingRate;
  };

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const bookingTypeLabel = (t: "free_entry" | "ticket" | "table") =>
    t === "free_entry" ? "Free Entry" : t === "ticket" ? "Ticket" : "Table";
  const bookingTypeColor = (t: "free_entry" | "ticket" | "table") =>
    t === "free_entry" ? "#22c55e" : t === "ticket" ? colors.primary : "#f59e0b";

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 100 }}>
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
        const draft = drafts[v.id] ?? { freeEntryRate: "0", ticketRate: "0", tableBookingRate: "0" };
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
            <View style={{ flexDirection: "row", gap: 10 }}>
              {(["freeEntryRate", "ticketRate", "tableBookingRate"] as const).map((field) => {
                const fieldLabel = field === "freeEntryRate" ? "₹/person" : field === "ticketRate" ? "₹/ticket" : "₹/booking";
                const fieldTitle = field === "freeEntryRate" ? "Free Entry" : field === "ticketRate" ? "Ticket" : "Table";
                return (
                  <View key={field} style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>{fieldTitle}</Text>
                    <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{fieldLabel}</Text>
                    <View style={{ borderWidth: 1, borderRadius: 8, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.background }}>
                      <TextInput
                        value={draft[field]}
                        onChangeText={(t) => setDraft(v.id, field, t.replace(/[^0-9.]/g, ""))}
                        keyboardType="decimal-pad"
                        style={{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 14 }}
                        placeholder="0"
                        placeholderTextColor={colors.mutedForeground}
                      />
                    </View>
                  </View>
                );
              })}
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
            { label: "Platform Earned", value: fmt(report.totals.totalCommission), icon: "trending-up-outline" as const },
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
              </View>
            </TouchableOpacity>

            {/* Expanded: applied fees + individual bookings */}
            {isExpanded && (
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                {/* Applied fees row */}
                <View style={{ flexDirection: "row", gap: 8, padding: 12, backgroundColor: colors.muted + "60" }}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginRight: 4 }}>Fees:</Text>
                  {(["freeEntryRate", "ticketRate", "tableBookingRate"] as const).map((field) => {
                    const label = field === "freeEntryRate" ? "Free Entry" : field === "ticketRate" ? "Ticket" : "Table";
                    const unit = field === "freeEntryRate" ? "/person" : field === "ticketRate" ? "/ticket" : "/booking";
                    const val = row.appliedRates[field];
                    return (
                      <View key={field} style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.foreground }}>{label}: ₹{val}{unit}</Text>
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
function AdminCrmLeadsTab({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  function loadLeads(p: number, append = false) {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    customFetch<{ leads: CrmLead[]; total: number; totalPages: number }>(`/api/admin/leads?page=${p}&limit=20`)
      .then((r) => {
        setLeads(append ? (prev) => [...prev, ...(r.leads ?? [])] : (r.leads ?? []));
        setHasMore(p < r.totalPages);
      })
      .catch(() => {})
      .finally(() => { setLoading(false); setLoadingMore(false); });
  }

  useEffect(() => { loadLeads(1); }, []);

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 100 }}>
      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, color: colors.mutedForeground }}>{leads.length} LEADS</Text>
      {leads.length === 0 ? (
        <View style={{ alignItems: "center", padding: 32, gap: 12 }}>
          <Ionicons name="person-add-outline" size={40} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" }}>No leads found.</Text>
        </View>
      ) : leads.map((lead) => (
        <View key={lead.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{lead.name || "Anonymous"}</Text>
            <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.muted }}>
              <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>{lead.source}</Text>
            </View>
          </View>
          {lead.email && <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{lead.email}{lead.phone ? ` · ${lead.phone}` : ""}</Text>}
          {lead.vendorName && <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.primary }}>{lead.vendorName}</Text>}
          {lead.eventTitle && <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }} numberOfLines={1}>{lead.eventTitle}</Text>}
          <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
            {new Date(lead.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
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

// ─── AdminImportPubTab ────────────────────────────────────────────────────────
type ImportStep = "form" | "previewing" | "preview" | "importing" | "success";

interface GooglePubPreview {
  place: { placeId: string; name: string; address: string; phone?: string; website?: string; rating?: number; photos?: string[] };
  suggestedTitle: string;
  suggestedDescription: string;
}

function AdminImportPubTab({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [step, setStep] = useState<ImportStep>("form");
  const [googleUrl, setGoogleUrl] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [preview, setPreview] = useState<GooglePubPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview() {
    setError(null);
    setStep("previewing");
    try {
      const data = await customFetch<GooglePubPreview>("/api/admin/pubs/preview-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleUrl: googleUrl.trim(), partnerEmail: partnerEmail.trim() }),
      });
      setPreview(data);
      setStep("preview");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Preview failed. Check the URL and partner email.");
      setStep("form");
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setError(null);
    setStep("importing");
    try {
      await customFetch("/api/admin/pubs/import-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleUrl: googleUrl.trim(), partnerEmail: partnerEmail.trim(), placeId: preview.place.placeId }),
      });
      setStep("success");
      Alert.alert("Pub Imported", `"${preview.suggestedTitle}" has been created and approved.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed. Please try again.");
      setStep("preview");
    }
  }

  function reset() { setStep("form"); setPreview(null); setError(null); setGoogleUrl(""); setPartnerEmail(""); }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 100 }}>
      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, color: colors.mutedForeground }}>IMPORT PUB FROM GOOGLE MAPS</Text>

      {step === "success" ? (
        <View style={{ alignItems: "center", padding: 32, gap: 16 }}>
          <Ionicons name="checkmark-circle" size={56} color="#22c55e" />
          <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center" }}>Pub Imported!</Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>"{preview?.suggestedTitle}" has been created and approved.</Text>
          <TouchableOpacity onPress={reset} style={{ borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, backgroundColor: colors.primary }}>
            <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Import Another</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, gap: 10 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>GOOGLE MAPS URL</Text>
              <TextInput
                value={googleUrl}
                onChangeText={setGoogleUrl}
                placeholder="https://maps.google.com/..."
                placeholderTextColor={colors.mutedForeground}
                style={{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 14 }}
                autoCapitalize="none"
                editable={step === "form" || step === "preview"}
              />
            </View>
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>PARTNER EMAIL</Text>
              <TextInput
                value={partnerEmail}
                onChangeText={setPartnerEmail}
                placeholder="partner@example.com"
                placeholderTextColor={colors.mutedForeground}
                style={{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 14 }}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={step === "form" || step === "preview"}
              />
            </View>
          </View>

          {error && (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "#ef4444", backgroundColor: "#ef444410", padding: 12 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "#ef4444" }}>{error}</Text>
            </View>
          )}

          {preview && step === "preview" && (
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.card, padding: 14, gap: 8 }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground }}>{preview.place.name}</Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{preview.place.address}</Text>
              {preview.place.phone && <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{preview.place.phone}</Text>}
              <View style={{ borderRadius: 8, backgroundColor: colors.muted, padding: 10 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{preview.suggestedTitle}</Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 }} numberOfLines={3}>{preview.suggestedDescription}</Text>
              </View>
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 10 }}>
            {(step === "form" || step === "preview") && (
              <TouchableOpacity
                onPress={step === "preview" ? handleConfirm : handlePreview}
                disabled={!googleUrl.trim() || !partnerEmail.trim()}
                style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", backgroundColor: colors.primary, opacity: (!googleUrl.trim() || !partnerEmail.trim()) ? 0.5 : 1 }}
              >
                <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                  {step === "preview" ? "Confirm & Import" : "Preview"}
                </Text>
              </TouchableOpacity>
            )}
            {(step === "previewing" || step === "importing") && (
              <View style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", backgroundColor: colors.primary, opacity: 0.6 }}>
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              </View>
            )}
            {step === "preview" && (
              <TouchableOpacity onPress={reset} style={{ borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 14 }}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>
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
  const analyticsQ = useGetAdminAnalytics({}, { query: { queryKey: getGetAdminAnalyticsQueryKey({}), enabled: activeTab === "analytics" } });
  const leadsQ = useGetAdminLeadsSummary({}, { query: { queryKey: getGetAdminLeadsSummaryQueryKey({}), enabled: activeTab === "analytics" } });
  const bookingsReportQ = useGetAdminBookingsReport({}, { query: { queryKey: getGetAdminBookingsReportQueryKey({}), enabled: activeTab === "analytics" } });

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

  // ─── REPORTS ────────────────────────────────────────────────────────────────
  const [checkinData, setCheckinData] = useState<AdminCheckinResponse | null>(null);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [vendorsFull, setVendorsFull] = useState<AdminVendorFull[]>([]);
  const [vendorsFullLoading, setVendorsFullLoading] = useState(false);

  const fetchCheckinReport = useCallback(() => {
    setCheckinLoading(true);
    customFetch<AdminCheckinResponse>("/api/admin/checkin-report")
      .then(setCheckinData)
      .catch(() => {})
      .finally(() => setCheckinLoading(false));
  }, []);

  const fetchVendorsFull = useCallback(() => {
    setVendorsFullLoading(true);
    customFetch<{ data: AdminVendorFull[] }>("/api/admin/vendors?limit=100")
      .then((r) => setVendorsFull(r.data ?? []))
      .catch(() => {})
      .finally(() => setVendorsFullLoading(false));
  }, []);

  // ─── COUPON GRANT FORM STATE ─────────────────────────────────────────────────
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

  useEffect(() => {
    if (activeTab === "vendors") fetchVendors();
    if (activeTab === "users") fetchUsers();
    if (activeTab === "events") fetchEvents();
    if (activeTab === "bookings") fetchBookings();
    if (activeTab === "subscriptions") fetchSubscriptions();
    if (activeTab === "coupons") fetchCoupons();
    if (activeTab === "content") { fetchAds(); fetchBlogs(); }
    if (activeTab === "announcements") fetchAnnouncements();
    if (activeTab === "reports") { fetchCheckinReport(); fetchVendorsFull(); }
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
    ];

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
                  style={[styles.actionBtn, { backgroundColor: "#ef444410", borderColor: "#ef444440" }]}
                  onPress={() => deleteVendorAdmin(v.id, v.businessName)}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.destructive} />
                </TouchableOpacity>
              </View>
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

    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]} refreshControl={<RefreshControl refreshing={couponLoading} onRefresh={fetchCoupons} tintColor={colors.primary} />}>
        {couponLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

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
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]} refreshControl={<RefreshControl refreshing={announcementLoading} onRefresh={fetchAnnouncements} tintColor={colors.primary} />}>
        {announcementLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

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
      </ScrollView>
    );
  }

  // ─── RENDER REPORTS ──────────────────────────────────────────────────────────
  function renderReports() {
    const stats = checkinData?.stats ?? { total: 0, checkedIn: 0, notArrived: 0 };
    const rows = checkinData?.rows ?? [];
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

        {/* CHECK-IN SUMMARY KPIS */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>CHECK-IN OVERVIEW</Text>
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
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 20 }]}>RECENT ATTENDANCE ({rows.length})</Text>
            {rows.slice(0, 15).map((r) => (
              <View key={r.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: r.checkedIn ? "#22c55e30" : colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>{r.userName || r.userEmail}</Text>
                  <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{r.eventTitle}</Text>
                  <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{r.bookingDate}</Text>
                </View>
                <View style={[styles.roleBadge, { backgroundColor: r.checkedIn ? "#22c55e20" : colors.muted, borderColor: r.checkedIn ? "#22c55e" : colors.border }]}>
                  <Text style={{ color: r.checkedIn ? "#22c55e" : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>
                    {r.checkedIn ? "In" : "Pending"}
                  </Text>
                </View>
              </View>
            ))}
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
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 20 }]}>BLOGS ({blogs.length})</Text>
        {blogs.length === 0 && !blogLoading && (
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center" }}>No blogs found</Text>
        )}
        {blogs.map((b) => (
          <View key={b.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: b.published ? colors.primary + "30" : colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>{b.title}</Text>
              <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{b.slug}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TouchableOpacity
                onPress={() => Alert.alert(b.published ? "Unpublish?" : "Publish?", `${b.published ? "Hide" : "Publish"} "${b.title}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Confirm", onPress: () => toggleBlogPublished(b.id, b.published) }])}
              >
                <Ionicons name={b.published ? "eye-outline" : "eye-off-outline"} size={18} color={b.published ? "#22c55e" : colors.mutedForeground} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Alert.alert("Delete Blog?", `Delete "${b.title}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => deleteBlog(b.id) }])}
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

  // ─── Import Pub tab ───────────────────────────────────────────────────────────
  function renderImportPub() {
    return <AdminImportPubTab colors={colors} />;
  }

  const TABS = [
    { key: "analytics" as AdminTab, icon: "bar-chart-outline" as const, label: "Analytics" },
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
    { key: "import-pub" as AdminTab, icon: "cloud-download-outline" as const, label: "Import" },
    { key: "commissions" as AdminTab, icon: "cash-outline" as const, label: "Commissions" },
    { key: "settlements" as AdminTab, icon: "card-outline" as const, label: "Settlements" },
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
      {activeTab === "import-pub" && renderImportPub()}
      {activeTab === "commissions" && <AdminCommissionsTab colors={colors} />}
      {activeTab === "settlements" && <AdminSettlementsTab colors={colors} />}
    </View>
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
