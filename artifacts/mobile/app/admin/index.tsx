import { Ionicons } from "@expo/vector-icons";
import {
  customFetch,
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

type AdminTab = "analytics" | "bookings" | "events" | "vendors" | "users" | "subscriptions" | "coupons" | "content" | "messages" | "booking-report" | "crm-leads" | "import-pub";

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
  createdAt: string;
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
  const analyticsQ = useGetAdminAnalytics({}, { query: { enabled: activeTab === "analytics" } });
  const leadsQ = useGetAdminLeadsSummary({}, { query: { enabled: activeTab === "analytics" } });
  const bookingsReportQ = useGetAdminBookingsReport({}, { query: { enabled: activeTab === "analytics" } });

  // ─── VENDORS & VENDOR REQUESTS ──────────────────────────────────────────────
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [vendorRequests, setVendorRequests] = useState<VendorRequest[]>([]);
  const [vendorLoading, setVendorLoading] = useState(false);

  const fetchVendors = useCallback(() => {
    setVendorLoading(true);
    Promise.all([
      customFetch<AdminVendor[]>("/api/admin/vendors"),
      customFetch<VendorRequest[]>("/api/admin/vendor-requests"),
    ])
      .then(([v, vr]) => { setVendors(v); setVendorRequests(vr); })
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

  useEffect(() => {
    if (activeTab === "vendors") fetchVendors();
    if (activeTab === "users") fetchUsers();
    if (activeTab === "events") fetchEvents();
    if (activeTab === "bookings") fetchBookings();
    if (activeTab === "subscriptions") fetchSubscriptions();
    if (activeTab === "coupons") fetchCoupons();
    if (activeTab === "content") { fetchAds(); fetchBlogs(); }
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

        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: pendingRequests.length > 0 ? 20 : 0 }]}>APPROVED PARTNERS ({approvedVendors.length})</Text>
        {approvedVendors.map((v) => (
          <View key={v.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>{v.businessName}</Text>
              <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{v.category} · {v.location}</Text>
            </View>
            {v.isPremium && (
              <View style={[styles.premiumBadge, { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}>
                <Ionicons name="star" size={10} color={colors.primary} />
                <Text style={[{ color: colors.primary, fontSize: 10, fontFamily: "Inter_600SemiBold" }]}>Premium</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    );
  }

  // ─── RENDER USERS ───────────────────────────────────────────────────────────
  function renderUsers() {
    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]} refreshControl={<RefreshControl refreshing={userLoading} onRefresh={fetchUsers} tintColor={colors.primary} />}>
        {userLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ALL USERS ({users.length})</Text>
        {users.map((u) => (
          <View key={u.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.userAvatar, { backgroundColor: colors.muted }]}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 14 }}>
                {u.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>{u.name}</Text>
              <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{u.email}</Text>
            </View>
            <View style={[styles.roleBadge, { backgroundColor: u.role === "admin" ? colors.primary + "20" : u.role === "vendor" ? "#8b5cf620" : colors.muted, borderColor: u.role === "admin" ? colors.primary : u.role === "vendor" ? "#8b5cf6" : colors.border }]}>
              <Text style={{ color: u.role === "admin" ? colors.primary : u.role === "vendor" ? "#8b5cf6" : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{u.role}</Text>
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
    return (
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 120 }]} refreshControl={<RefreshControl refreshing={couponLoading} onRefresh={fetchCoupons} tintColor={colors.primary} />}>
        {couponLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ALL COUPONS ({coupons.length})</Text>
        {coupons.length === 0 && !couponLoading && (
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", marginTop: 20 }}>No coupons found</Text>
        )}
        {coupons.map((c) => (
          <View key={c.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: c.used ? colors.border : colors.primary + "30" }]}>
            <View style={[styles.kpiIcon, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>{c.code}</Text>
              <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{c.discountPercent}% off{c.userEmail ? ` · ${c.userEmail}` : ""}</Text>
            </View>
            <View style={[styles.roleBadge, { backgroundColor: c.used ? colors.muted : "#22c55e20", borderColor: c.used ? colors.border : "#22c55e" }]}>
              <Text style={{ color: c.used ? colors.mutedForeground : "#22c55e", fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{c.used ? "Used" : "Active"}</Text>
            </View>
          </View>
        ))}
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
    { key: "content" as AdminTab, icon: "newspaper-outline" as const, label: "Content" },
    { key: "messages" as AdminTab, icon: "mail-outline" as const, label: "Messages" },
    { key: "booking-report" as AdminTab, icon: "stats-chart-outline" as const, label: "Report" },
    { key: "crm-leads" as AdminTab, icon: "person-add-outline" as const, label: "CRM" },
    { key: "import-pub" as AdminTab, icon: "cloud-download-outline" as const, label: "Import" },
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
      {activeTab === "content" && renderContent()}
      {activeTab === "messages" && renderMessages()}
      {activeTab === "booking-report" && renderBookingReport()}
      {activeTab === "crm-leads" && renderCrmLeads()}
      {activeTab === "import-pub" && renderImportPub()}
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
