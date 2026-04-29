import {
  useGetAdminAnalytics,
  useListPendingVendors,
  useApproveVendor,
  useRejectVendor,
  useListUsers,
  useUpdateUserRole,
  useDeleteUser,
  useGetAdminBookingsReport,
  useGetAdminBookingsPartnerSummary,
  useGetAdminLeads,
  useGetAdminLeadsSummary,
} from "@workspace/api-client-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Briefcase, CalendarCheck, Clock, Mail, UserPlus,
  Tag, Megaphone, Trash2, Crown, IndianRupee, CheckCircle, XCircle, Pencil,
  ChevronDown, ChevronUp, FileText, Search, SortDesc, SortAsc,
  Eye, UserCheck, UserX, TrendingUp, Filter,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line,
} from "recharts";
import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Link, useLocation, useSearch } from "wouter";
import { apiGet, apiPost, apiDelete, apiPatch, formatINR } from "@/lib/api";

export function AdminPanel() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const urlTab = new URLSearchParams(search).get("tab") ?? "analytics";
  const [activeTab, setActiveTab] = useState(urlTab);

  useEffect(() => {
    const t = new URLSearchParams(search).get("tab");
    if (t && t !== activeTab) setActiveTab(t);
  }, [search]);

  const handleTabChange = (t: string) => {
    setActiveTab(t);
    navigate(`/admin?tab=${t}`, { replace: true });
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-2 accent-underline inline-block">Admin</p>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-3">Royvento control room</h1>
      </header>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-card flex-wrap h-auto p-1 gap-1">
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="vendors">Partners</TabsTrigger>
          <TabsTrigger value="requests">Partner requests</TabsTrigger>
          <TabsTrigger value="booking-requests">Booking Requests</TabsTrigger>
          <TabsTrigger value="event-approvals">Event Approvals</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="coupons">Coupons</TabsTrigger>
          <TabsTrigger value="ads">Ads</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="blogs">Blogs</TabsTrigger>
          <TabsTrigger value="booking-report">Booking Report</TabsTrigger>
          <TabsTrigger value="crm-leads">CRM &amp; Leads</TabsTrigger>
        </TabsList>
        <TabsContent value="analytics"><Analytics /></TabsContent>
        <TabsContent value="vendors"><AllVendorsAdmin /></TabsContent>
        <TabsContent value="requests"><VendorRequests /></TabsContent>
        <TabsContent value="booking-requests"><BookingRequestsAdmin /></TabsContent>
        <TabsContent value="event-approvals"><EventApprovalsAdmin /></TabsContent>
        <TabsContent value="events"><EventsAdmin /></TabsContent>
        <TabsContent value="subscriptions"><SubscriptionsAdmin /></TabsContent>
        <TabsContent value="coupons"><CouponsAdmin /></TabsContent>
        <TabsContent value="ads"><AdsAdmin /></TabsContent>
        <TabsContent value="messages"><Messages /></TabsContent>
        <TabsContent value="users"><UsersPanel /></TabsContent>
        <TabsContent value="blogs"><BlogsAdmin /></TabsContent>
        <TabsContent value="booking-report"><BookingReport /></TabsContent>
        <TabsContent value="crm-leads"><CrmLeads /></TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl glass-card p-5 lift-3d">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className="w-9 h-9 rounded-lg bg-red-600/15 text-primary flex items-center justify-center red-ring">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="stat-number text-3xl">{value}</p>
    </div>
  );
}

type AnalyticsPreset = "30d" | "90d" | "12m" | "custom";

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function Analytics() {
  const [preset, setPreset] = useState<AnalyticsPreset>("12m");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const now = new Date();
  const computedRange = (() => {
    if (preset === "30d") return { startDate: toDateStr(new Date(now.getTime() - 30 * 86400000)), endDate: toDateStr(now) };
    if (preset === "90d") return { startDate: toDateStr(new Date(now.getTime() - 90 * 86400000)), endDate: toDateStr(now) };
    if (preset === "12m") {
      const s = new Date(now); s.setFullYear(s.getFullYear() - 1); s.setDate(1);
      return { startDate: toDateStr(s), endDate: toDateStr(now) };
    }
    return {
      startDate: customStart || undefined,
      endDate: customEnd || undefined,
    };
  })();

  const { data, isLoading } = useGetAdminAnalytics(computedRange);

  const adminData = (data ?? {}) as typeof data & {
    totalWomen?: number;
    totalMen?: number;
    totalCouple?: number;
    dailyRevenue?: { date: string; revenue: number }[];
    monthlyRevenue?: { month: string; revenue: number }[];
    perVendor?: { vendorId: number; vendorName: string; bookingCount: number; ticketWomen: number; ticketMen: number; ticketCouple: number; revenue: number }[];
  };

  const hasTickets = ((adminData.totalWomen ?? 0) + (adminData.totalMen ?? 0) + (adminData.totalCouple ?? 0)) > 0;
  const hasDailyRevenue = (adminData.dailyRevenue ?? []).some((d) => d.revenue > 0);
  const dailyChartMax = Math.max(...(adminData.dailyRevenue ?? []).map((d) => d.revenue), 1);
  const hasMonthlyRevenue = (adminData.monthlyRevenue ?? []).some((m) => m.revenue > 0);
  const monthlyChartMax = Math.max(...(adminData.monthlyRevenue ?? []).map((m) => m.revenue), 1);

  const presetLabel: Record<AnalyticsPreset, string> = {
    "30d": "Last 30 days",
    "90d": "Last 90 days",
    "12m": "Last 12 months",
    "custom": "Custom range",
  };

  return (
    <div className="space-y-6">
      {/* Date range filter */}
      <div className="rounded-2xl glass-card p-4 flex flex-wrap items-end gap-4">
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Time range</Label>
          <Select value={preset} onValueChange={(v) => setPreset(v as AnalyticsPreset)}>
            <SelectTrigger className="w-44">
              <SelectValue>{presetLabel[preset]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="12m">Last 12 months</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {preset === "custom" && (
          <>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">From</Label>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-40" max={customEnd || toDateStr(now)} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">To</Label>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-40" min={customStart} max={toDateStr(now)} />
            </div>
          </>
        )}
        {(preset !== "12m" || customStart || customEnd) && (
          <Button variant="outline" size="sm" onClick={() => { setPreset("12m"); setCustomStart(""); setCustomEnd(""); }}>
            Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !data ? null : (
      <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Stat icon={Users} label="New users" value={String(data.totalUsers)} />
        <Stat icon={Briefcase} label="New partners" value={String(data.totalVendors)} />
        <Stat icon={Clock} label="Pending approval" value={String(data.pendingVendors)} />
        <Stat icon={CalendarCheck} label="Bookings" value={String(data.totalBookings)} />
        <Stat icon={IndianRupee} label="Revenue" value={formatINR(data.totalRevenue)} />
      </div>

      {/* Platform ticket breakdown */}
      {hasTickets && (
        <div className="space-y-3">
          <h3 className="font-serif text-xl">Platform ticket breakdown</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-2xl glass-card p-5 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-pink-500/15 flex items-center justify-center shrink-0">
                <span className="text-pink-400 text-base">♀</span>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Women</p>
                <p className="stat-number text-2xl text-pink-300">{adminData.totalWomen ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">tickets sold</p>
              </div>
            </div>
            <div className="rounded-2xl glass-card p-5 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                <span className="text-blue-400 text-base">♂</span>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Men</p>
                <p className="stat-number text-2xl text-blue-300">{adminData.totalMen ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">tickets sold</p>
              </div>
            </div>
            <div className="rounded-2xl glass-card p-5 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
                <span className="text-purple-400 text-base">⚭</span>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Couples</p>
                <p className="stat-number text-2xl text-purple-300">{adminData.totalCouple ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">tickets sold</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Monthly revenue bar chart — always shown when data is loaded */}
      {(adminData.monthlyRevenue ?? []).length > 0 && (
        <div className="rounded-2xl glass-card p-6">
          <h3 className="font-serif text-xl mb-5">Monthly revenue — {presetLabel[preset]}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={adminData.monthlyRevenue} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(m: string) => {
                  const [y, mo] = m.split("-");
                  const d = new Date(Number(y), Number(mo) - 1, 1);
                  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
                }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v: number) => v === 0 ? "₹0" : `₹${(v / 1000).toFixed(0)}k`}
                width={48}
                domain={[0, Math.ceil(monthlyChartMax * 1.15)]}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  fontSize: "12px",
                }}
                formatter={(v: number) => [formatINR(v), "Revenue"]}
                labelFormatter={(label: string) => {
                  const [y, mo] = label.split("-");
                  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
                }}
              />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Platform daily revenue — always last 30 days ending at range end */}
      {hasDailyRevenue && (
        <div className="rounded-2xl glass-card p-6">
          <h3 className="font-serif text-xl mb-5">Daily revenue — last 30 days</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={adminData.dailyRevenue} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(d: string) => {
                  const dt = new Date(d);
                  return `${dt.getDate()}/${dt.getMonth() + 1}`;
                }}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v: number) => v === 0 ? "₹0" : `₹${(v / 1000).toFixed(0)}k`}
                width={48}
                domain={[0, Math.ceil(dailyChartMax * 1.15)]}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  fontSize: "12px",
                }}
                formatter={(v: number) => [formatINR(v), "Revenue"]}
                labelFormatter={(label: string) => new Date(label).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-2xl glass-card p-6">
          <h3 className="font-serif text-xl mb-4">Bookings by status</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={data.bookingsByStatus}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl glass-card p-6">
          <h3 className="font-serif text-xl mb-4">Top partners</h3>
          <div className="space-y-3">
            {data.topVendors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : data.topVendors.map((v) => (
              <div key={v.vendorId} className="flex items-center justify-between text-sm border-b border-white/5 pb-2 last:border-0">
                <span className="font-medium">{v.businessName}</span>
                <span className="text-muted-foreground">{v.bookingCount} bookings · {formatINR(v.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ticket sales by venue */}
      {(adminData.perVendor ?? []).length > 0 && (
        <div className="rounded-2xl glass-card p-6">
          <h3 className="font-serif text-xl mb-4">Ticket sales by venue</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-white/10">
                <tr>
                  <th className="text-left py-2 pr-4">Venue</th>
                  <th className="text-right py-2 px-2">Bookings</th>
                  <th className="text-right py-2 px-2 text-pink-300">Women</th>
                  <th className="text-right py-2 px-2 text-blue-300">Men</th>
                  <th className="text-right py-2 px-2 text-purple-300">Couples</th>
                  <th className="text-right py-2 pl-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {(adminData.perVendor ?? []).map((row) => (
                  <tr key={row.vendorId} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-3 pr-4 font-medium">{row.vendorName}</td>
                    <td className="text-right px-2 tabular-nums">{row.bookingCount}</td>
                    <td className="text-right px-2 tabular-nums text-pink-300">{row.ticketWomen || "—"}</td>
                    <td className="text-right px-2 tabular-nums text-blue-300">{row.ticketMen || "—"}</td>
                    <td className="text-right px-2 tabular-nums text-purple-300">{row.ticketCouple || "—"}</td>
                    <td className="text-right pl-2 tabular-nums text-primary font-medium">{formatINR(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-2xl glass-card p-6">
        <h3 className="font-serif text-xl mb-4">Recent bookings</h3>
        <div className="space-y-2">
          {data.recentBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          ) : data.recentBookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between text-sm border-b border-white/5 pb-2 last:border-0">
              <div>
                <span className="font-medium">{b.eventTitle}</span>
                <span className="text-muted-foreground"> · {b.userName}</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="secondary">{b.status}</Badge>
                <span className="text-muted-foreground">{formatINR(b.totalPrice)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

interface AdminBooking {
  id: number; eventId: number; userId: number; vendorId: number;
  bookingDate: string; guests: number; totalPrice: number; finalPrice: number;
  notes: string; status: string; eventTitle: string; eventImage: string;
  vendorName: string; userName: string; userEmail: string;
  pubMode: string; ticketWomen: number; ticketMen: number; ticketCouple: number;
  rejectionReason: string | null;
}

function BookingRequestsAdmin() {
  const [items, setItems] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    apiGet<AdminBooking[]>("/api/admin/bookings")
      .then((rows) => setItems(rows.filter((b) => b.status === "pending")))
      .catch((e) => toast({ title: "Failed to load", description: e?.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const approve = async (id: number) => {
    try {
      await apiPatch(`/api/admin/bookings/${id}/status`, { status: "confirmed" });
      toast({ title: "Booking approved" });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  const reject = async (id: number) => {
    if (!reason.trim()) {
      toast({ title: "Please enter a rejection reason", variant: "destructive" });
      return;
    }
    try {
      await apiPatch(`/api/admin/bookings/${id}/status`, { status: "cancelled", rejectionReason: reason.trim() });
      toast({ title: "Booking rejected" });
      setRejectingId(null);
      setReason("");
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (items.length === 0)
    return (
      <div className="rounded-2xl glass-card p-10 text-center">
        <CalendarCheck className="h-8 w-8 text-primary mx-auto mb-3" />
        <p className="text-muted-foreground">No pending booking requests.</p>
      </div>
    );

  return (
    <div className="space-y-4">
      {items.map((b) => (
        <div key={b.id} className="rounded-2xl glass-card overflow-hidden">
          <div className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex gap-4">
              {b.eventImage && (
                <img src={b.eventImage} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />
              )}
              <div>
                <p className="font-serif text-lg">{b.eventTitle}</p>
                <p className="text-sm text-muted-foreground">{b.vendorName}</p>
                <p className="text-sm mt-1">{b.userName} · {b.userEmail}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {b.bookingDate} · {b.guests} guests · {formatINR(b.finalPrice ?? b.totalPrice)}
                </p>
                {b.pubMode === "ticket" && (b.ticketWomen || b.ticketMen || b.ticketCouple) ? (
                  <p className="text-xs text-muted-foreground">
                    Tickets:{b.ticketWomen ? ` ${b.ticketWomen}W` : ""}{b.ticketMen ? ` ${b.ticketMen}M` : ""}{b.ticketCouple ? ` ${b.ticketCouple}C` : ""}
                  </p>
                ) : null}
                {b.notes && <p className="text-sm italic text-muted-foreground mt-1">"{b.notes}"</p>}
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <div className="flex gap-2">
                <Button onClick={() => approve(b.id)} className="bg-gradient-to-br from-red-600 to-red-800 border-0 gap-1.5">
                  <CheckCircle className="h-4 w-4" />Approve
                </Button>
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => { setRejectingId(b.id); setReason(""); }}
                >
                  <XCircle className="h-4 w-4" />Reject
                </Button>
              </div>
              <Link href={`/events/${b.eventId}`}>
                <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground hover:text-foreground">
                  View event details →
                </Button>
              </Link>
            </div>
          </div>
          {rejectingId === b.id && (
            <div className="border-t border-white/10 px-5 pb-5 pt-4 bg-black/20 space-y-3">
              <p className="text-sm font-medium">Rejection reason (required)</p>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason for rejection…"
                className="bg-black/40 border-white/10"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => reject(b.id)} className="bg-gradient-to-br from-red-600 to-red-800 border-0">
                  Confirm rejection
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setRejectingId(null); setReason(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface AdminVendor {
  id: number;
  userId: number;
  businessName: string;
  category: string;
  description: string;
  location: string;
  city: string;
  state: string;
  bannerImage: string;
  status: string;
  eventCount: number;
  userEmail: string;
  createdAt: string;
}

function statusColor(s: string) {
  if (s === "approved") return "bg-green-500/20 text-green-300 border-green-500/30";
  if (s === "rejected") return "bg-red-500/20 text-red-300 border-red-500/30";
  return "bg-amber-500/20 text-amber-300 border-amber-500/30";
}

function AllVendorsAdmin() {
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<AdminVendor>>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const approve = useApproveVendor();
  const reject = useRejectVendor();

  const load = () => {
    setLoading(true);
    apiGet<AdminVendor[]>("/api/admin/vendors")
      .then(setVendors)
      .catch((e) => toast({ title: "Failed to load", description: e?.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const startEdit = (v: AdminVendor) => {
    setEditingId(v.id);
    setEditForm({ businessName: v.businessName, description: v.description, category: v.category, status: v.status, city: v.city, state: v.state });
  };

  const saveEdit = async (id: number) => {
    setSaving(true);
    try {
      await apiPatch(`/api/admin/vendors/${id}`, editForm);
      toast({ title: "Partner updated" });
      setEditingId(null);
      load();
    } catch (e: any) {
      toast({ title: "Failed to save", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (v: AdminVendor) => {
    if (!confirm(`Delete "${v.businessName}" and all ${v.eventCount} of their listings? This cannot be undone.`)) return;
    try {
      await apiDelete(`/api/admin/vendors/${v.id}`);
      toast({ title: "Partner deleted" });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (vendors.length === 0) return <p className="text-muted-foreground">No partners found.</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{vendors.length} partner{vendors.length !== 1 ? "s" : ""} total</p>
      {vendors.map((v) => (
        <div key={v.id} className="rounded-2xl glass-card overflow-hidden">
          <div className="flex flex-col md:flex-row">
            {v.bannerImage && (
              <div className="md:w-40 aspect-video md:aspect-auto shrink-0 bg-muted">
                <img src={v.bannerImage} alt="" className="h-full w-full object-cover" />
              </div>
            )}
            <div className="flex-1 p-5 flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor(v.status)}`}>{v.status}</span>
                  <Badge variant="outline" className="text-xs">{v.category}</Badge>
                </div>
                <p className="font-serif text-lg leading-tight">{v.businessName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{v.userEmail}{v.city ? ` · ${v.city}` : ""}{v.state ? `, ${v.state}` : ""}</p>
                <p className="text-xs text-muted-foreground mt-1">{v.eventCount} listing{v.eventCount !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                {v.status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      className="bg-gradient-to-br from-red-600 to-red-800 border-0 text-xs"
                      onClick={() => approve.mutate({ vendorId: v.id }, {
                        onSuccess: () => { toast({ title: "Approved" }); load(); },
                        onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
                      })}
                    ><CheckCircle className="h-3.5 w-3.5 mr-1" />Approve</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-red-500/30 text-red-300"
                      onClick={() => reject.mutate({ vendorId: v.id }, {
                        onSuccess: () => { toast({ title: "Rejected" }); load(); },
                      })}
                    ><XCircle className="h-3.5 w-3.5 mr-1" />Reject</Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => editingId === v.id ? setEditingId(null) : startEdit(v)}
                ><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-red-500/30 text-red-300 hover:bg-red-900/20"
                  onClick={() => remove(v)}
                ><Trash2 className="h-3.5 w-3.5 mr-1" />Delete</Button>
              </div>
            </div>
          </div>

          {editingId === v.id && (
            <div className="border-t border-white/10 p-5 bg-black/20 space-y-4">
              <p className="text-sm font-medium">Edit partner profile</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Business name</Label>
                  <Input
                    value={editForm.businessName ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, businessName: e.target.value }))}
                    className="bg-black/40 border-white/10 h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Input
                    value={editForm.category ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                    className="bg-black/40 border-white/10 h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">City</Label>
                  <Input
                    value={editForm.city ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                    className="bg-black/40 border-white/10 h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">State</Label>
                  <Input
                    value={editForm.state ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, state: e.target.value }))}
                    className="bg-black/40 border-white/10 h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={editForm.status ?? "pending"}
                    onValueChange={(val) => setEditForm((f) => ({ ...f, status: val }))}
                  >
                    <SelectTrigger className="bg-black/40 border-white/10 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Textarea
                  rows={3}
                  value={editForm.description ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className="bg-black/40 border-white/10 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => saveEdit(v.id)}
                  className="bg-gradient-to-br from-red-600 to-red-800 border-0 text-xs"
                >
                  {saving ? "Saving…" : "Save changes"}
                </Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface AdminEvent {
  id: number;
  title: string;
  category: string;
  type: string;
  price: number;
  vendorName: string;
  partnerName: string;
  city: string;
  state: string;
  isPublished: boolean;
  popular: boolean;
  approvalStatus: string;
  imageUrl: string;
}

interface PendingEvent {
  id: number;
  title: string;
  category: string;
  type: string;
  price: number;
  partnerName: string;
  city: string;
  state: string;
  imageUrl: string;
  description: string;
  galleryImages: string[];
  approvalStatus: string;
  createdAt: string;
}

function EventApprovalsAdmin() {
  const [items, setItems] = useState<PendingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    apiGet<PendingEvent[]>("/api/admin/events/pending")
      .then(setItems)
      .catch((e) => toast({ title: "Failed to load", description: e?.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const approve = async (id: number) => {
    try {
      await apiPatch(`/api/admin/events/${id}`, { approvalStatus: "approved" });
      toast({ title: "Event approved — it is now live." });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  const reject = async (id: number) => {
    if (!reason.trim()) {
      toast({ title: "Please provide a reason for rejection", variant: "destructive" });
      return;
    }
    try {
      await apiPatch(`/api/admin/events/${id}`, { approvalStatus: "rejected", rejectionReason: reason.trim() });
      toast({ title: "Event rejected" });
      setRejecting(null);
      setReason("");
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (items.length === 0) return (
    <div className="rounded-2xl glass-card p-8 text-center">
      <CheckCircle className="h-10 w-10 text-green-400 mx-auto mb-3" />
      <p className="font-serif text-xl">No pending event submissions</p>
      <p className="text-muted-foreground mt-1 text-sm">All events have been reviewed.</p>
    </div>
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{items.length} event{items.length !== 1 ? "s" : ""} awaiting review</p>
      {items.map((e) => (
        <div key={e.id} className="rounded-2xl glass-card overflow-hidden">
          <div className="flex gap-4 p-4">
            {e.imageUrl ? (
              <img src={e.imageUrl} alt="" className="w-24 h-24 rounded-xl object-cover shrink-0" />
            ) : (
              <div className="w-24 h-24 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                <CalendarCheck className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p className="font-serif text-lg">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{e.partnerName} · {e.city}{e.state ? `, ${e.state}` : ""}</p>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <Badge variant="outline">{e.type}</Badge>
                  <Badge variant="secondary" className="bg-white/10">{e.category}</Badge>
                </div>
              </div>
              {e.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{e.description}</p>}
              {e.galleryImages.length > 0 && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {e.galleryImages.slice(0, 4).map((src, i) => (
                    <img key={i} src={src} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  ))}
                  {e.galleryImages.length > 4 && (
                    <div className="h-12 w-12 rounded-lg bg-white/5 flex items-center justify-center text-xs text-muted-foreground">
                      +{e.galleryImages.length - 4}
                    </div>
                  )}
                </div>
              )}
              <p className="text-sm font-medium mt-2">{formatINR(e.price)}</p>
            </div>
          </div>

          {rejecting === e.id ? (
            <div className="border-t border-white/10 p-4 space-y-3 bg-red-900/10">
              <p className="text-sm font-medium text-red-300">Reason for rejection (required)</p>
              <Textarea
                value={reason}
                onChange={(ev) => setReason(ev.target.value)}
                rows={2}
                placeholder="E.g. Incomplete information, inappropriate content…"
                className="bg-black/40 border-white/10"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => reject(e.id)} className="bg-red-700 hover:bg-red-600 border-0">
                  <XCircle className="h-4 w-4 mr-1" /> Confirm rejection
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setRejecting(null); setReason(""); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="border-t border-white/10 p-4 flex gap-2 justify-end">
              <Button size="sm" onClick={() => approve(e.id)} className="bg-green-700 hover:bg-green-600 border-0">
                <CheckCircle className="h-4 w-4 mr-1" /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setRejecting(e.id); setReason(""); }}
                className="border-red-500/40 text-red-300 hover:bg-red-900/20">
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EventsAdmin() {
  const [items, setItems] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    apiGet<AdminEvent[]>("/api/admin/events")
      .then(setItems)
      .catch((e) => toast({ title: "Failed to load", description: e?.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const remove = async (id: number, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    try {
      await apiDelete(`/api/admin/events/${id}`);
      toast({ title: "Deleted" });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };
  const togglePopular = async (e: AdminEvent) => {
    try {
      await apiPatch(`/api/admin/events/${e.id}`, { popular: !e.popular });
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    }
  };

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (items.length === 0) return <p className="text-muted-foreground">No events yet.</p>;
  return (
    <div className="rounded-2xl glass-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left p-3">Title</th>
            <th className="text-left p-3">Partner</th>
            <th className="text-left p-3">Type</th>
            <th className="text-left p-3">Location</th>
            <th className="text-right p-3">Price</th>
            <th className="text-center p-3">Status</th>
            <th className="text-center p-3">Popular</th>
            <th className="text-right p-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id} className="border-t border-white/5">
              <td className="p-3 font-medium">{e.title}</td>
              <td className="p-3 text-muted-foreground">{e.partnerName}</td>
              <td className="p-3"><Badge variant="outline">{e.type}</Badge></td>
              <td className="p-3 text-muted-foreground">{e.city}{e.state ? `, ${e.state}` : ""}</td>
              <td className="p-3 text-right">{formatINR(e.price)}</td>
              <td className="p-3 text-center">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  e.approvalStatus === "approved" ? "bg-green-500/20 text-green-300" :
                  e.approvalStatus === "rejected" ? "bg-red-500/20 text-red-300" :
                  "bg-amber-500/20 text-amber-300"
                }`}>{e.approvalStatus}</span>
              </td>
              <td className="p-3 text-center">
                <button onClick={() => togglePopular(e)} className={`text-xs px-2 py-1 rounded ${e.popular ? "bg-red-600/30 text-red-200" : "bg-white/5 text-white/40"}`}>
                  ★ {e.popular ? "Yes" : "No"}
                </button>
              </td>
              <td className="p-3 text-right">
                <Button size="sm" variant="ghost" onClick={() => remove(e.id, e.title)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface AdminSub {
  id: number; userId: number; planType: string; planPeriod: string;
  price: string; status: string; expiresAt: string; userName: string; userEmail: string;
}
function SubscriptionsAdmin() {
  const [items, setItems] = useState<AdminSub[]>([]);
  const { toast } = useToast();
  const load = () => apiGet<AdminSub[]>("/api/admin/subscriptions").then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);
  return (
    <div className="rounded-2xl glass-card overflow-hidden">
      {items.length === 0 ? (
        <p className="p-6 text-muted-foreground">No subscriptions yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3">User</th>
              <th className="text-left p-3">Plan</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Price</th>
              <th className="text-right p-3">Expires</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-t border-white/5">
                <td className="p-3">
                  <p className="font-medium">{s.userName}</p>
                  <p className="text-xs text-muted-foreground">{s.userEmail}</p>
                </td>
                <td className="p-3">
                  <Badge variant={s.planType === "partner" ? "default" : "secondary"}>{s.planType}</Badge>
                  <span className="text-xs text-muted-foreground ml-1">{s.planPeriod}</span>
                </td>
                <td className="p-3"><Badge variant={s.status === "active" ? "default" : "outline"}>{s.status}</Badge></td>
                <td className="p-3 text-right">{formatINR(Number(s.price))}</td>
                <td className="p-3 text-right text-muted-foreground">{new Date(s.expiresAt).toLocaleDateString()}</td>
                <td className="p-3 text-right">
                  <Button size="sm" variant="ghost" onClick={async () => {
                    if (!confirm("Cancel this subscription?")) return;
                    await apiDelete(`/api/admin/subscriptions/${s.id}`).catch(() => {});
                    toast({ title: "Cancelled" });
                    load();
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface AdminCoupon {
  id: number; code: string; userId: number | null; discountPercent: number;
  isUsed: boolean; expiresAt: string | null; createdAt: string;
  userName: string | null; userEmail: string | null;
}
function CouponsAdmin() {
  const [items, setItems] = useState<AdminCoupon[]>([]);
  const [email, setEmail] = useState("");
  const [discount, setDiscount] = useState(10);
  const { toast } = useToast();
  const load = () => apiGet<AdminCoupon[]>("/api/admin/coupons").then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);

  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiPost("/api/admin/coupons", { email, discountPercent: discount });
      toast({ title: "Coupon granted" });
      setEmail("");
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={grant} className="rounded-2xl glass-card-strong p-5 grid md:grid-cols-[2fr_1fr_auto] gap-3 items-end">
        <div>
          <Label className="flex items-center gap-1"><Tag className="h-3.5 w-3.5 text-primary" /> Grant coupon to user (email)</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" required className="bg-black/40 border-white/10 mt-1" />
        </div>
        <div>
          <Label>Discount %</Label>
          <Input type="number" min={1} max={50} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="bg-black/40 border-white/10 mt-1" />
        </div>
        <Button className="bg-gradient-to-br from-red-600 to-red-800 border-0">Grant</Button>
      </form>

      <div className="rounded-2xl glass-card overflow-hidden">
        {items.length === 0 ? (
          <p className="p-6 text-muted-foreground">No coupons issued.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Code</th>
                <th className="text-left p-3">Owner</th>
                <th className="text-right p-3">Discount</th>
                <th className="text-center p-3">Used</th>
                <th className="text-right p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t border-white/5">
                  <td className="p-3 font-mono text-xs">{c.code}</td>
                  <td className="p-3">
                    {c.userName ? (<><span>{c.userName}</span><span className="text-xs text-muted-foreground ml-2">{c.userEmail}</span></>) : <span className="text-muted-foreground">— public —</span>}
                  </td>
                  <td className="p-3 text-right">{c.discountPercent}%</td>
                  <td className="p-3 text-center">{c.isUsed ? "Yes" : "No"}</td>
                  <td className="p-3 text-right text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface AdminAd {
  id: number; vendorId: number; status: string; message: string;
  createdAt: string; reviewedAt: string | null; vendorName: string;
}
function AdsAdmin() {
  const [items, setItems] = useState<AdminAd[]>([]);
  const { toast } = useToast();
  const load = () => apiGet<AdminAd[]>("/api/admin/ads").then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);

  const act = async (id: number, action: "approve" | "reject") => {
    try {
      await apiPost(`/api/admin/ads/${id}/${action}`);
      toast({ title: action === "approve" ? "Ad approved" : "Ad rejected" });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  if (items.length === 0)
    return <div className="rounded-2xl glass-card p-10 text-center">
      <Megaphone className="h-8 w-8 text-primary mx-auto mb-3" />
      <p className="text-muted-foreground">No ad requests.</p>
    </div>;
  return (
    <div className="space-y-4">
      {items.map((a) => (
        <div key={a.id} className="rounded-2xl glass-card p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Megaphone className="h-4 w-4 text-primary" />
                <Badge variant={a.status === "approved" ? "default" : a.status === "rejected" ? "outline" : "secondary"}>
                  {a.status}
                </Badge>
              </div>
              <p className="font-serif text-lg">{a.vendorName}</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-xl">{a.message}</p>
              <p className="mt-2 text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</p>
            </div>
            {a.status === "pending" && (
              <div className="flex gap-2">
                <Button onClick={() => act(a.id, "approve")} className="bg-gradient-to-br from-red-600 to-red-800 border-0">Approve</Button>
                <Button variant="outline" onClick={() => act(a.id, "reject")}>Reject</Button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const ROLES = ["user", "vendor", "admin"] as const;

function UsersPanel() {
  const { data: users = [], refetch } = useListUsers();
  const updateRole = useUpdateUserRole();
  const del = useDeleteUser();
  const { toast } = useToast();

  return (
    <div className="rounded-2xl glass-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left p-4">Name</th>
            <th className="text-left p-4">Email</th>
            <th className="text-left p-4">Phone</th>
            <th className="text-left p-4">Role</th>
            <th className="text-right p-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u: any) => (
            <tr key={u.id} className="border-t border-white/5">
              <td className="p-4 font-medium">{u.name}</td>
              <td className="p-4 text-muted-foreground">{u.email}</td>
              <td className="p-4 text-muted-foreground">{u.phone ?? "—"}</td>
              <td className="p-4">
                <Select
                  value={u.role}
                  onValueChange={(role) =>
                    updateRole.mutate(
                      { userId: u.id, data: { role: role as any } },
                      {
                        onSuccess: () => { toast({ title: "Role updated" }); refetch(); },
                        onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
                      },
                    )
                  }
                >
                  <SelectTrigger className="w-32 bg-black/40 border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="p-4 text-right">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!confirm(`Delete ${u.name}?`)) return;
                    del.mutate({ userId: u.id }, {
                      onSuccess: () => { toast({ title: "User deleted" }); refetch(); },
                      onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
                    });
                  }}
                >Delete</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface VendorReqRow {
  id: number;
  userId: number;
  status: "pending" | "approved" | "rejected";
  businessName: string;
  category: string;
  message: string;
  createdAt: string;
  user: { name: string; email: string; phone: string };
}

function VendorRequests() {
  const [items, setItems] = useState<VendorReqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    apiGet<VendorReqRow[]>("/api/admin/vendor-requests")
      .then((r) => setItems(r))
      .catch((e) => toast({ title: "Failed to load", description: e?.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (items.length === 0) return <p className="text-muted-foreground">No partner requests yet.</p>;

  const act = async (id: number, action: "approve" | "reject") => {
    try {
      await apiPost(`/api/admin/vendor-requests/${id}/${action}`);
      toast({
        title: action === "approve" ? "Request approved" : "Request rejected",
        description: action === "approve" ? "User has been promoted to partner." : undefined,
      });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {items.map((r) => (
        <div key={r.id} className="rounded-2xl glass-card p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <UserPlus className="h-4 w-4 text-primary" />
                <Badge variant="outline">{r.category}</Badge>
                <Badge variant={r.status === "pending" ? "secondary" : r.status === "approved" ? "default" : "outline"}>
                  {r.status}
                </Badge>
              </div>
              <p className="font-serif text-xl">{r.businessName}</p>
              <p className="text-sm text-muted-foreground">
                From {r.user.name} · {r.user.email}
                {r.user.phone ? <> · {r.user.phone}</> : null}
              </p>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{r.message}</p>
              <p className="mt-2 text-xs text-muted-foreground">Submitted {new Date(r.createdAt).toLocaleString()}</p>
            </div>
            {r.status === "pending" && (
              <div className="flex gap-2">
                <Button onClick={() => act(r.id, "approve")} className="bg-gradient-to-br from-red-600 to-red-800 border-0">
                  <Crown className="h-4 w-4 mr-1" /> Approve &amp; promote
                </Button>
                <Button variant="outline" onClick={() => act(r.id, "reject")}>Reject</Button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ContactMessage {
  id: number;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  createdAt: string;
}

function Messages() {
  const [items, setItems] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    apiGet<ContactMessage[]>("/api/admin/messages")
      .then((r) => setItems(r))
      .catch((e) => toast({ title: "Failed to load", description: e?.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const remove = async (id: number, label: string) => {
    try {
      await apiDelete(`/api/admin/messages/${id}`);
      toast({ title: label });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (items.length === 0) {
    return (
      <div className="rounded-2xl glass-card p-10 text-center">
        <Mail className="h-8 w-8 text-primary mx-auto mb-3" />
        <p className="text-muted-foreground">No contact messages right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((m) => (
        <div key={m.id} className="rounded-2xl glass-card p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Mail className="h-4 w-4 text-primary" />
                <p className="font-serif text-lg">{m.subject || "(no subject)"}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                From <span className="font-medium text-foreground">{m.name}</span> · {m.email}
                {m.phone ? <> · {m.phone}</> : null}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm">{m.message}</p>
              <p className="mt-3 text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => remove(m.id, "Marked resolved")} className="bg-gradient-to-br from-red-600 to-red-800 border-0">Resolved</Button>
              <Button variant="outline" onClick={() => remove(m.id, "Cancelled")}>Cancel</Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface BlogRow {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  imageUrl: string;
  authorName: string;
  tags: string[];
  published: boolean;
  createdAt: string;
}

function BlogsAdmin() {
  const { toast } = useToast();
  const [blogs, setBlogs] = useState<BlogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    title: "", slug: "", excerpt: "", content: "",
    imageUrl: "", authorName: "Royvento Editorial", tags: "", published: true,
  });
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await apiGet<BlogRow[]>("/api/admin/blogs");
      setBlogs(rows);
    } catch {
      toast({ title: "Could not load blogs", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...form,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      };
      if (editing != null) {
        await apiPatch(`/api/admin/blogs/${editing}`, body);
        toast({ title: "Blog updated" });
      } else {
        await apiPost("/api/admin/blogs", body);
        toast({ title: "Blog created" });
      }
      setForm({ title: "", slug: "", excerpt: "", content: "", imageUrl: "", authorName: "Royvento Editorial", tags: "", published: true });
      setEditing(null);
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: number) => {
    if (!confirm("Delete this blog post?")) return;
    await apiDelete(`/api/admin/blogs/${id}`);
    toast({ title: "Deleted" });
    load();
  };

  const startEdit = (b: BlogRow) => {
    setEditing(b.id);
    setForm({ title: b.title, slug: b.slug, excerpt: b.excerpt, content: b.content, imageUrl: b.imageUrl, authorName: b.authorName, tags: b.tags.join(", "), published: b.published });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-8">
      <form onSubmit={save} className="rounded-2xl glass-card p-6 space-y-4">
        <h3 className="font-serif text-xl">{editing != null ? "Edit blog post" : "New blog post"}</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Title</Label>
            <Input required value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          </div>
          <div>
            <Label>Slug (URL)</Label>
            <Input required value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))} />
          </div>
        </div>
        <div>
          <Label>Excerpt</Label>
          <Textarea rows={2} value={form.excerpt} onChange={(e) => setForm((p) => ({ ...p, excerpt: e.target.value }))} />
        </div>
        <div>
          <Label>Content (HTML)</Label>
          <Textarea rows={8} value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} placeholder="<p>Article body…</p>" className="font-mono text-xs" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Image URL</Label>
            <Input value={form.imageUrl} onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))} placeholder="https://..." />
          </div>
          <div>
            <Label>Author</Label>
            <Input value={form.authorName} onChange={(e) => setForm((p) => ({ ...p, authorName: e.target.value }))} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Tags (comma-separated)</Label>
            <Input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} placeholder="Mumbai, Nightlife, Guide" />
          </div>
          <div className="flex items-center gap-3 mt-6">
            <input type="checkbox" id="published" checked={form.published} onChange={(e) => setForm((p) => ({ ...p, published: e.target.checked }))} />
            <Label htmlFor="published">Published</Label>
          </div>
        </div>
        <div className="flex gap-3">
          <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground border-0">
            {saving ? "Saving…" : editing != null ? "Update post" : "Create post"}
          </Button>
          {editing != null && (
            <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm({ title: "", slug: "", excerpt: "", content: "", imageUrl: "", authorName: "Royvento Editorial", tags: "", published: true }); }}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">
          {blogs.map((b) => (
            <div key={b.id} className="rounded-2xl glass-card p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                {b.imageUrl && <img src={b.imageUrl} alt={b.title} className="w-16 h-12 rounded-lg object-cover shrink-0" />}
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{b.title}</p>
                  <p className="text-xs text-muted-foreground">{b.slug} · {b.authorName}</p>
                  <div className="flex gap-1 mt-1">
                    {b.tags.slice(0, 3).map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{t}</span>)}
                    {!b.published && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Draft</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => startEdit(b)}>Edit</Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => del(b.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Booking Report ────────────────────────────────────────────────────────────

const BOOKING_STATUSES = ["all", "confirmed", "pending", "payment_pending", "cancelled", "completed"];
const BOOKING_TYPES = [
  { value: "all", label: "All types" },
  { value: "pub", label: "Pub tickets (W / M / Couple)" },
  { value: "group", label: "Event / group bookings (guests)" },
];
const SORT_OPTIONS = [
  { value: "date", label: "Booking date" },
  { value: "price", label: "Final price" },
];

function bookingStatusColor(status: string) {
  switch (status) {
    case "confirmed": return "bg-green-600/20 text-green-400";
    case "completed": return "bg-blue-600/20 text-blue-400";
    case "cancelled": return "bg-red-600/20 text-red-400";
    case "payment_pending": return "bg-yellow-600/20 text-yellow-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function BookingReport() {
  const urlSearch = useSearch();
  const initVendorId = new URLSearchParams(urlSearch).get("vendorId") ?? "all";
  const initUserId = new URLSearchParams(urlSearch).get("userId") ?? "";
  const [vendorId, setVendorId] = useState<string>(initVendorId);
  const [userId, setUserId] = useState<string>(initUserId);
  const [status, setStatus] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [bookingType, setBookingType] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [sortBy, setSortBy] = useState<string>("date");
  const [summaryOpen, setSummaryOpen] = useState(true);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const params = {
    ...(vendorId !== "all" ? { vendorId: Number(vendorId) } : {}),
    ...(userId ? { userId: Number(userId) } : {}),
    ...(status !== "all" ? { status } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(bookingType !== "all" ? { bookingType } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    page,
    sortBy,
  };

  const { data: report, isLoading } = useGetAdminBookingsReport(params);
  const { data: partnerSummary } = useGetAdminBookingsPartnerSummary();

  const vendors = partnerSummary ?? [];
  const bookings = report?.bookings ?? [];
  const total = report?.total ?? 0;
  const totalPages = report?.totalPages ?? 0;

  // Filtered summary cards: show selected vendor or all
  const displayedSummary = vendorId !== "all"
    ? vendors.filter((v) => v.vendorId === Number(vendorId))
    : vendors;

  const resetFilters = () => {
    setVendorId("all"); setUserId(""); setStatus("all"); setStartDate(""); setEndDate("");
    setBookingType("all"); setSearch(""); setPage(1); setSortBy("date");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Ticket Sales Report</h2>
          </div>
          <p className="text-sm text-muted-foreground">Per-partner breakdown with filters and pagination</p>
        </div>
        <Button variant="ghost" size="sm" onClick={resetFilters} className="text-muted-foreground hover:text-foreground">
          Reset filters
        </Button>
      </div>

      {/* Lead drilldown banner */}
      {userId && (
        <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 px-4 py-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-blue-300">
            <UserCheck className="h-4 w-4" />
            <span>Showing bookings for lead user #{userId}{vendorId !== "all" && ` at partner #${vendorId}`}</span>
          </div>
          <button onClick={() => { setUserId(""); setPage(1); }} className="text-blue-400 hover:text-blue-200 underline text-xs">
            Clear lead filter
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="rounded-2xl glass-card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* Search */}
          <div className="relative xl:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search customer name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>

          {/* Partner */}
          <Select value={vendorId} onValueChange={(v) => { setVendorId(v); setPage(1); }}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="All partners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All partners</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.vendorId} value={String(v.vendorId)}>{v.vendorName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status */}
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {BOOKING_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Booking type */}
          <Select value={bookingType} onValueChange={(v) => { setBookingType(v); setPage(1); }}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              {BOOKING_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(1); }}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>Sort: {o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date range */}
        <div className="flex flex-wrap gap-3 items-center">
          <Label className="text-xs text-muted-foreground w-8">From</Label>
          <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="h-8 text-sm w-40" />
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className="h-8 text-sm w-40" />
          {(startDate || endDate) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setStartDate(""); setEndDate(""); }}>
              Clear dates
            </Button>
          )}
        </div>
      </div>

      {/* Partner summary cards */}
      {displayedSummary.length > 0 && (
        <div className="rounded-2xl glass-card overflow-hidden">
          <button
            onClick={() => setSummaryOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium hover:bg-white/5 transition-colors"
          >
            <span className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-primary" />
              Partner Summary
              <span className="text-xs text-muted-foreground ml-1">({displayedSummary.length} partner{displayedSummary.length !== 1 ? "s" : ""})</span>
            </span>
            {summaryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {summaryOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4 border-t border-white/5">
              {displayedSummary.map((v) => {
                return (
                  <div
                    key={v.vendorId}
                    className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 cursor-pointer hover:border-primary/30 transition-colors"
                    onClick={() => { setVendorId(String(v.vendorId)); setPage(1); }}
                  >
                    <p className="font-medium text-sm truncate mb-3">{v.vendorName}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Bookings</p>
                        <p className="font-semibold text-foreground">{v.bookingCount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Revenue</p>
                        <p className="font-semibold text-primary">{formatINR(v.revenue)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Tickets</p>
                        <p className="font-semibold">
                          <span className="text-pink-400">{v.ticketWomen}W</span>
                          {" · "}
                          <span className="text-blue-400">{v.ticketMen}M</span>
                          {" · "}
                          <span className="text-purple-400">{v.ticketCouple}C</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Check-in rate</p>
                        <p className="font-semibold">
                          {v.checkedInCount}
                          {v.bookingCount > 0 && (
                            <span className="text-muted-foreground font-normal ml-1">
                              / {v.bookingCount} ({Math.round(v.checkedInCount / v.bookingCount * 100)}%)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total > 0 ? `${total} booking${total !== 1 ? "s" : ""} found` : "No bookings found"}</span>
        {totalPages > 1 && <span>Page {page} of {totalPages}</span>}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-2xl glass-card p-10 text-center text-muted-foreground text-sm">Loading…</div>
      ) : bookings.length === 0 ? (
        <div className="rounded-2xl glass-card p-10 text-center text-muted-foreground text-sm">
          No bookings match the selected filters.
        </div>
      ) : (
        <div className="rounded-2xl glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Partner · Event</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Mode</th>
                  <th className="px-4 py-3 text-right">Tickets</th>
                  <th className="px-4 py-3 text-right">
                    <button
                      className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors"
                      onClick={() => { setSortBy(sortBy === "price" ? "date" : "price"); setPage(1); }}
                    >
                      Price
                      {sortBy === "price" ? <SortDesc className="h-3 w-3" /> : <SortAsc className="h-3 w-3" />}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">Payment</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Ticket code</th>
                  <th className="px-4 py-3 text-left">Check-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{b.id}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium truncate max-w-[180px]">{b.vendorName}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">{b.eventTitle}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="truncate max-w-[140px]">{b.userName}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[140px]">{b.userEmail}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {b.bookingDate
                        ? new Date(b.bookingDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                        : "—"}
                      <p className="text-xs">{new Date(b.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs capitalize">{b.pubMode?.replace("_", " ")}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-xs">
                      {b.ticketWomen > 0 && <span className="text-pink-400 mr-1">{b.ticketWomen}W</span>}
                      {b.ticketMen > 0 && <span className="text-blue-400 mr-1">{b.ticketMen}M</span>}
                      {b.ticketCouple > 0 && <span className="text-purple-400">{b.ticketCouple}C</span>}
                      {b.ticketWomen === 0 && b.ticketMen === 0 && b.ticketCouple === 0 && (
                        <span className="text-muted-foreground">{b.guests}g</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="font-medium text-primary">{formatINR(b.finalPrice)}</span>
                      {b.discountAmount > 0 && (
                        <p className="text-xs text-muted-foreground line-through">{formatINR(b.totalPrice)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-muted-foreground">{b.paymentMethod}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${bookingStatusColor(b.status)}`}>
                        {b.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground">{b.ticketCode}</span>
                    </td>
                    <td className="px-4 py-3">
                      {b.checkedIn ? (
                        <span className="flex items-center gap-1 text-green-400 text-xs">
                          <CheckCircle className="h-3.5 w-3.5" />
                          {b.checkedInAt
                            ? new Date(b.checkedInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                            : "Yes"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="text-xs"
              >
                ← Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-7 h-7 text-xs rounded ${p === page ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-white/10 text-muted-foreground"}`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="text-xs"
              >
                Next →
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── CRM & Leads ──────────────────────────────────────────────────────────────

type CrmPreset = "7d" | "30d" | "90d" | "custom";
type LeadType = "all" | "known" | "anonymous";

function CrmLeads() {
  const [preset, setPreset] = useState<CrmPreset>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [vendorFilter, setVendorFilter] = useState<string>("");
  const [leadType, setLeadType] = useState<LeadType>("all");
  const [page, setPage] = useState(1);

  const now = new Date();
  const computedRange = (() => {
    if (preset === "7d") return { startDate: toDateStr(new Date(now.getTime() - 7 * 86400000)), endDate: toDateStr(now) };
    if (preset === "30d") return { startDate: toDateStr(new Date(now.getTime() - 30 * 86400000)), endDate: toDateStr(now) };
    if (preset === "90d") return { startDate: toDateStr(new Date(now.getTime() - 90 * 86400000)), endDate: toDateStr(now) };
    return { startDate: customStart || undefined, endDate: customEnd || undefined };
  })();

  const leadsParams = {
    page,
    ...(vendorFilter ? { vendorId: Number(vendorFilter) } : {}),
    ...(leadType === "known" ? { knownOnly: "true" } : {}),
    ...(leadType === "anonymous" ? { anonymousOnly: "true" } : {}),
    ...computedRange,
  };

  const summaryParams = { ...computedRange };

  const { data: leadsData, isLoading: leadsLoading } = useGetAdminLeads(leadsParams);
  const { data: summary, isLoading: summaryLoading } = useGetAdminLeadsSummary(summaryParams);

  const leads = leadsData?.leads ?? [];
  const totalPages = leadsData?.totalPages ?? 1;
  const total = leadsData?.total ?? 0;
  const vendors = summary?.vendors ?? [];

  const presetLabel: Record<CrmPreset, string> = {
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
    "custom": "Custom range",
  };

  function handleVendorLeaderClick(vid: number) {
    setVendorFilter(vid === Number(vendorFilter) ? "" : String(vid));
    setPage(1);
  }

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="rounded-2xl glass-card p-4 flex flex-wrap items-end gap-4">
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Time range</Label>
          <Select value={preset} onValueChange={(v) => { setPreset(v as CrmPreset); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue>{presetLabel[preset]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {preset === "custom" && (
          <>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">From</Label>
              <Input type="date" value={customStart} onChange={(e) => { setCustomStart(e.target.value); setPage(1); }} className="w-40" max={customEnd || toDateStr(now)} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">To</Label>
              <Input type="date" value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); setPage(1); }} className="w-40" min={customStart} max={toDateStr(now)} />
            </div>
          </>
        )}
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Partner</Label>
          <Select value={vendorFilter || "_all"} onValueChange={(v) => { setVendorFilter(v === "_all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All partners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All partners</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.vendorId} value={String(v.vendorId)}>{v.vendorName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Lead type</Label>
          <Select value={leadType} onValueChange={(v) => { setLeadType(v as LeadType); setPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All leads</SelectItem>
              <SelectItem value="known">Known leads</SelectItem>
              <SelectItem value="anonymous">Anonymous visitors</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(vendorFilter || leadType !== "all") && (
          <Button variant="outline" size="sm" onClick={() => { setVendorFilter(""); setLeadType("all"); setPage(1); }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* KPI cards */}
      {summaryLoading ? (
        <p className="text-muted-foreground">Loading summary…</p>
      ) : summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="rounded-2xl glass-card p-5 lift-3d">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">All-time views</span>
              <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                <Eye className="h-4 w-4" />
              </div>
            </div>
            <p className="stat-number text-3xl">{summary.allTimeTotalViews.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl glass-card p-5 lift-3d">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Period views</span>
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Eye className="h-4 w-4" />
              </div>
            </div>
            <p className="stat-number text-3xl">{summary.totalViews.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{presetLabel[preset]}</p>
          </div>
          <div className="rounded-2xl glass-card p-5 lift-3d">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Known leads</span>
              <div className="w-9 h-9 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
                <UserCheck className="h-4 w-4" />
              </div>
            </div>
            <p className="stat-number text-3xl text-blue-300">{summary.knownLeads.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl glass-card p-5 lift-3d">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Anonymous</span>
              <div className="w-9 h-9 rounded-lg bg-white/5 text-muted-foreground flex items-center justify-center">
                <UserX className="h-4 w-4" />
              </div>
            </div>
            <p className="stat-number text-3xl">{summary.anonymousVisitors.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl glass-card p-5 lift-3d">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Conversion rate</span>
              <div className="w-9 h-9 rounded-lg bg-green-500/15 text-green-400 flex items-center justify-center">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <p className="stat-number text-3xl text-green-300">{summary.conversionRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">{summary.conversions} views → bookings</p>
          </div>
        </div>
      )}

      {/* Partner leaderboard */}
      {!summaryLoading && vendors.length > 0 && (
        <div className="rounded-2xl glass-card p-6">
          <h3 className="font-serif text-xl mb-1">Per-partner breakdown</h3>
          <p className="text-xs text-muted-foreground mb-4">Click a row to filter the leads table to that partner.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-white/10">
                <tr>
                  <th className="text-left py-2 pr-4">Venue</th>
                  <th className="text-left py-2 pr-4">City</th>
                  <th className="text-right py-2 px-2">Total Views</th>
                  <th className="text-right py-2 px-2 text-blue-300">Known Leads</th>
                  <th className="text-right py-2 px-2">Anonymous</th>
                  <th className="text-right py-2 px-2 text-green-300">Bookings from leads</th>
                  <th className="text-right py-2 pl-2 text-green-300">Conv. Rate</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr
                    key={v.vendorId}
                    onClick={() => handleVendorLeaderClick(v.vendorId)}
                    className={`border-t border-white/5 cursor-pointer transition-colors ${Number(vendorFilter) === v.vendorId ? "bg-primary/10" : "hover:bg-white/5"}`}
                  >
                    <td className="py-3 pr-4 font-medium">{v.vendorName}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{v.vendorCity || "—"}</td>
                    <td className="text-right px-2 tabular-nums">{v.totalViews}</td>
                    <td className="text-right px-2 tabular-nums text-blue-300">{v.knownLeads || "—"}</td>
                    <td className="text-right px-2 tabular-nums text-muted-foreground">{v.anonymousVisitors || "—"}</td>
                    <td className="text-right px-2 tabular-nums text-green-300">{v.conversions || "—"}</td>
                    <td className="text-right pl-2 tabular-nums font-medium text-green-400">
                      {v.totalViews > 0 ? `${v.conversionRate}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leads table */}
      <div className="rounded-2xl glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="font-serif text-xl">Profile view log</h3>
          {!leadsLoading && (
            <span className="text-xs text-muted-foreground">{total.toLocaleString()} records</span>
          )}
        </div>
        {leadsLoading ? (
          <p className="text-muted-foreground p-6">Loading leads…</p>
        ) : leads.length === 0 ? (
          <div className="p-10 text-center">
            <Eye className="h-8 w-8 text-primary mx-auto mb-3" />
            <p className="text-muted-foreground">No profile views found for this period.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-white/10">
                  <tr>
                    <th className="text-left py-3 px-6">Visitor</th>
                    <th className="text-left py-3 px-3">Venue visited</th>
                    <th className="text-left py-3 px-3">City</th>
                    <th className="text-left py-3 px-3">Visit time</th>
                    <th className="text-center py-3 px-3">Status</th>
                    <th className="text-center py-3 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => {
                    const isAnon = !lead.viewerUserId;
                    return (
                      <tr key={lead.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-3 px-6">
                          {isAnon ? (
                            <span className="text-muted-foreground italic">Anonymous visitor</span>
                          ) : (
                            <div>
                              <p className="font-medium">{lead.viewerName || "—"}</p>
                              {lead.viewerEmail && (
                                <p className="text-xs text-muted-foreground">{lead.viewerEmail}</p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-medium">{lead.vendorName}</td>
                        <td className="py-3 px-3 text-muted-foreground">{lead.vendorCity || "—"}</td>
                        <td className="py-3 px-3 text-muted-foreground tabular-nums text-xs">
                          {new Date(lead.viewedAt).toLocaleString("en-IN", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {lead.converted ? (
                            <Badge className="bg-green-600/20 text-green-300 border-green-600/30 hover:bg-green-600/30">Booked</Badge>
                          ) : isAnon ? (
                            <Badge variant="secondary" className="text-muted-foreground">Anonymous</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground border-white/20">Lead</Badge>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Link
                              href={`/partners/${lead.vendorId}`}
                              className="text-xs text-primary underline-offset-2 hover:underline whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View venue
                            </Link>
                            {!isAnon && lead.viewerUserId && (
                              <Link
                                href={`/admin?tab=booking-report&userId=${lead.viewerUserId}&vendorId=${lead.vendorId}`}
                                className="text-xs text-muted-foreground underline-offset-2 hover:underline whitespace-nowrap"
                                onClick={(e) => e.stopPropagation()}
                              >
                                View bookings
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="text-xs"
                >
                  ← Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-7 h-7 text-xs rounded ${p === page ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-white/10 text-muted-foreground"}`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-xs"
                >
                  Next →
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
