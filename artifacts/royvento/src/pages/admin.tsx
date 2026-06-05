// Trigger Railway deploy: API-only changes are skipped by watch-path filter
// (bump) fix: inArray for thread header match — 2026-05-21f
import { SEO } from "@/components/SEO";
import { Logo } from "@/components/Logo";
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
  useGetAdminCheckinReport,
  useListVendors,
  importGooglePub,
  useListReviewsAdmin,
  useUpdateReview,
  useDeleteReview,
} from "@workspace/api-client-react";
import type { ImportGooglePubResponse } from "@workspace/api-client-react";
import {
  useGetAdminLiveOccupancy,
  useGetAdminLiveOccupancyBookings,
  getGetAdminLiveOccupancyQueryKey,
  getGetAdminLiveOccupancyBookingsQueryKey,
} from "@workspace/api-client-react";
import type {
  OccupancyRow as ApiOccupancyRow,
  GetAdminLiveOccupancyBookingsParams,
} from "@workspace/api-client-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFormErrors, fieldClass } from "@/lib/formErrors";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { LocationSelect } from "@/components/LocationSelect";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Briefcase, CalendarCheck, Clock, Mail, UserPlus,
  Tag, Megaphone, Trash2, Crown, IndianRupee, CheckCircle, XCircle, Pencil,
  ChevronDown, ChevronUp, FileText, Search, SortDesc, SortAsc,
  Eye, UserCheck, UserX, TrendingUp, Filter, Trophy, Gift, Banknote, CreditCard,
  Percent, Save, Upload, ImageIcon, Video, X, Check, Navigation, RefreshCw,
  Activity, Plus, Star, Sparkles, Menu, ArrowUpRight, ShieldCheck, BookOpen,
  Download, Users2, ArrowUpDown, ChevronRight,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Area, AreaChart, PieChart, Pie, Cell,
} from "recharts";
import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Link, useLocation, useSearch } from "wouter";
import { pubDetailSlug } from "@/lib/seo-slug";
import { apiGet, apiPost, apiDelete, apiPatch, apiPut, formatINR, PUB_EVENT_TYPES } from "@/lib/api";
import { uploadImage, validateImageFile } from "@/lib/uploadImage";
import { cn } from "@/lib/utils";

const ADMIN_TABS = [
  "analytics", "commissions", "vendors", "requests", "event-approvals",
  "events", "subscriptions", "coupons", "ads", "messages", "users", "blogs",
  "booking-report", "attendance", "live-occupancy", "crm-leads",
  "create-pub", "announcement-slider", "settlements", "reviews",
] as const;
const DEFAULT_ADMIN_TAB = "analytics";
const isValidAdminTab = (t: string | null | undefined): t is typeof ADMIN_TABS[number] =>
  !!t && (ADMIN_TABS as readonly string[]).includes(t);

interface AdminNavItem {
  value: typeof ADMIN_TABS[number];
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "control" | "partners" | "customers" | "growth" | "finance";
}

const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { value: "analytics",            label: "Analytics",         icon: TrendingUp,    group: "control" },
  { value: "live-occupancy",       label: "Live Occupancy",    icon: Activity,      group: "control" },
  { value: "commissions",          label: "Commissions",       icon: Percent,       group: "control" },
  { value: "vendors",              label: "Partners",          icon: Briefcase,     group: "partners" },
  { value: "requests",             label: "Partner Requests",  icon: UserPlus,      group: "partners" },
  { value: "event-approvals",      label: "Event Approvals",   icon: ShieldCheck,   group: "partners" },
  { value: "events",               label: "Events",            icon: Tag,           group: "partners" },
  { value: "create-pub",           label: "Create Pub/Club",   icon: Plus,          group: "partners" },
  { value: "users",                label: "Users",             icon: Users,         group: "customers" },
  { value: "booking-report",       label: "Booking Report",    icon: FileText,      group: "customers" },
  { value: "attendance",           label: "Attendance",        icon: UserCheck,     group: "customers" },
  { value: "crm-leads",            label: "CRM & Leads",       icon: Crown,         group: "customers" },
  { value: "reviews",              label: "Reviews",           icon: Star,          group: "customers" },
  { value: "messages",             label: "Messages",          icon: Mail,          group: "customers" },
{ value: "subscriptions",        label: "Subscriptions",     icon: Trophy,        group: "growth" },
  { value: "coupons",              label: "Coupons",           icon: Gift,          group: "growth" },
  { value: "ads",                  label: "Ads",               icon: Sparkles,      group: "growth" },
  { value: "announcement-slider",  label: "Announcement Slider", icon: Megaphone,   group: "growth" },
  { value: "blogs",                label: "Blogs",             icon: BookOpen,      group: "growth" },
  { value: "settlements",          label: "Settlements",       icon: Banknote,      group: "finance" },
];

const ADMIN_GROUP_LABELS: Record<AdminNavItem["group"], string> = {
  control: "Control Room",
  partners: "Partners",
  customers: "Customers",
  growth: "Growth",
  finance: "Finance",
};

function AdminSidebarTrigger({
  value, label, Icon, active,
}: { value: string; label: string; Icon: React.ComponentType<{ className?: string }>; active: boolean }) {
  return (
    <TabsTrigger
      value={value}
      className={
        "group relative w-full justify-start gap-3 px-3 py-2.5 rounded-xl text-sm font-medium overflow-hidden " +
        "transition-all duration-200 border border-transparent " +
        "data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/[0.18] data-[state=active]:to-primary/[0.02] " +
        "data-[state=active]:border-primary/25 data-[state=active]:text-white " +
        "data-[state=active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_-12px_rgba(232,41,28,0.45)] " +
        "data-[state=inactive]:text-white/55 hover:text-white hover:bg-white/[0.04] " +
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      }
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-primary shadow-[0_0_12px_rgba(232,41,28,0.9)]" />
      )}
      <span className={
        "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-all " +
        (active
          ? "bg-gradient-to-br from-primary/30 to-primary/10 text-primary border border-primary/40 shadow-[0_0_14px_-4px_rgba(232,41,28,0.7)]"
          : "bg-white/[0.04] text-white/50 border border-white/[0.06] group-hover:bg-white/[0.08] group-hover:text-white/80")
      }>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="flex-1 text-left truncate">{label}</span>
      {active && (
        <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 shadow-[0_0_10px_rgba(232,41,28,0.8)] animate-pulse" />
      )}
    </TabsTrigger>
  );
}

function AdminNav({ currentTab }: { currentTab: string }) {
  const groups: AdminNavItem["group"][] = ["control", "partners", "customers", "growth", "finance"];
  return (
    <div className="flex h-full flex-col gap-1 px-3 py-5">
      <div className="px-3 pb-5 mb-2 border-b border-white/[0.06]">
        <Link href="/" className="flex items-center gap-2.5 group">
          <Logo variant="icon" size={44} className="group-hover:scale-[1.04] transition-transform" />
          <div className="min-w-0">
            <p className="font-serif text-lg tracking-tight leading-none">Royvento</p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mt-1">Control Room</p>
          </div>
        </Link>
      </div>

      <TabsList className="flex flex-col w-full h-auto items-stretch bg-transparent p-0 gap-0 overflow-visible">
        {groups.map((g) => {
          const gItems = ADMIN_NAV_ITEMS.filter((i) => i.group === g);
          if (gItems.length === 0) return null;
          return (
            <div key={g} className="mb-3 w-full">
              <p className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.2em] text-white/30 font-semibold">
                {ADMIN_GROUP_LABELS[g]}
              </p>
              <div className="flex flex-col gap-0.5">
                {gItems.map((item) => (
                  <AdminSidebarTrigger
                    key={item.value}
                    value={item.value}
                    label={item.label}
                    Icon={item.icon}
                    active={currentTab === item.value}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </TabsList>
    </div>
  );
}

function AdminHeader({
  currentTabLabel,
  onMenu,
}: {
  currentTabLabel: string;
  onMenu: () => void;
}) {
  return (
    <header className="sticky top-[68px] z-30 px-4 md:px-8 py-4 md:py-5 backdrop-blur-xl bg-background/70 border-b border-white/[0.06]">
      <div className="flex items-center gap-3 md:gap-5">
        <button
          type="button"
          onClick={onMenu}
          className="md:hidden h-9 w-9 rounded-lg flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-white/70 transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary/70 font-semibold leading-none flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-primary shadow-[0_0_8px_rgba(232,41,28,0.8)]" />
            {currentTabLabel}
          </p>
          <h1 className="font-serif text-lg sm:text-xl md:text-2xl tracking-tight mt-1.5 leading-tight truncate">
            <span className="whitespace-nowrap text-gradient-red">Royvento</span>
            <span className="text-white/30 font-normal hidden sm:inline"> Control Room</span>
          </h1>
        </div>
      </div>
    </header>
  );
}

export function AdminPanel() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const rawTab = new URLSearchParams(search).get("tab");
  const initialTab = isValidAdminTab(rawTab) ? rawTab : DEFAULT_ADMIN_TAB;
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(search).get("tab");
    const next = isValidAdminTab(t) ? t : DEFAULT_ADMIN_TAB;
    if (next !== activeTab) setActiveTab(next);
    if (t && !isValidAdminTab(t)) {
      navigate(`/admin?tab=${DEFAULT_ADMIN_TAB}`, { replace: true });
    }
  }, [search]);

  useEffect(() => { setDrawerOpen(false); }, [activeTab]);

  const handleTabChange = (t: string) => {
    setActiveTab(t);
    navigate(`/admin?tab=${t}`, { replace: true });
  };

  const currentTabLabel = ADMIN_NAV_ITEMS.find((i) => i.value === activeTab)?.label ?? "Control Room";

  return (
    <div>
      <SEO title="Admin | Royvento" canonical="/admin" noindex />

      <Tabs value={activeTab} onValueChange={handleTabChange} orientation="vertical" className="block">
        <div className="md:grid md:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)] min-h-[calc(100vh-68px)]">
          {/* Desktop sidebar */}
          <aside className="hidden md:block sticky top-[68px] h-[calc(100vh-68px)] overflow-y-auto border-r border-white/[0.06] bg-gradient-to-b from-[#140405]/70 via-sidebar/40 to-black/50 backdrop-blur-xl">
            <AdminNav currentTab={activeTab} />
          </aside>

          {/* Mobile drawer */}
          {drawerOpen && (
            <div className="md:hidden fixed inset-0 z-[60] flex">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setDrawerOpen(false)}
                aria-hidden="true"
              />
              <div className="relative w-72 max-w-[85vw] h-full bg-sidebar/95 backdrop-blur-xl border-r border-white/[0.08] overflow-y-auto animate-in slide-in-from-left">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="absolute top-4 right-3 h-8 w-8 rounded-lg flex items-center justify-center bg-white/[0.04] text-white/60 hover:bg-white/[0.08] z-10"
                  aria-label="Close navigation"
                >
                  <X className="h-4 w-4" />
                </button>
                <AdminNav currentTab={activeTab} />
              </div>
            </div>
          )}

          {/* Main */}
          <main className="relative min-w-0">
            {/* Ambient premium glow */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] -z-10 bg-[radial-gradient(800px_420px_at_82%_-8%,rgba(232,41,28,0.10),transparent_62%)]" />
            <AdminHeader
              currentTabLabel={currentTabLabel}
              onMenu={() => setDrawerOpen(true)}
            />
            <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
              <TabsContent value="analytics" className="mt-0"><Analytics /></TabsContent>
              <TabsContent value="vendors" className="mt-0"><AllVendorsAdmin /></TabsContent>
              <TabsContent value="requests" className="mt-0"><VendorRequests /></TabsContent>
              <TabsContent value="event-approvals" className="mt-0">
                <div className="space-y-10">
                  <div>
                    <h2 className="font-serif text-xl mb-4">Event Approvals</h2>
                    <EventApprovalsAdmin />
                  </div>
                  <div>
                    <h2 className="font-serif text-xl mb-4">Announcement Approvals</h2>
                    <AnnouncementApprovalsAdmin />
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="events" className="mt-0"><EventsAdmin /></TabsContent>
              <TabsContent value="subscriptions" className="mt-0"><SubscriptionsAdmin /></TabsContent>
              <TabsContent value="coupons" className="mt-0"><CouponsAdmin /></TabsContent>
              <TabsContent value="ads" className="mt-0"><AdsAdmin /></TabsContent>
              <TabsContent value="messages" className="mt-0"><Messages /></TabsContent>
<TabsContent value="users" className="mt-0"><UsersPanel /></TabsContent>
              <TabsContent value="blogs" className="mt-0"><BlogsAdmin /></TabsContent>
              <TabsContent value="booking-report" className="mt-0"><BookingReport /></TabsContent>
              <TabsContent value="attendance" className="mt-0"><AttendanceReport /></TabsContent>
              <TabsContent value="live-occupancy" className="mt-0"><LiveOccupancyAdmin /></TabsContent>
              <TabsContent value="crm-leads" className="mt-0"><CrmLeads /></TabsContent>
              <TabsContent value="create-pub" className="mt-0"><CreatePubAdmin /></TabsContent>
              <TabsContent value="announcement-slider" className="mt-0"><AnnouncementSliderAdmin /><DrinkPlanPriorityAdmin /></TabsContent>
              <TabsContent value="commissions" className="mt-0"><CommissionsAdmin /></TabsContent>
              <TabsContent value="settlements" className="mt-0"><SettlementsAdmin /></TabsContent>
              <TabsContent value="reviews" className="mt-0"><ReviewsAdmin /></TabsContent>
            </div>
          </main>
        </div>
      </Tabs>
    </div>
  );
}

function Stat({ icon: Icon, label, value, valueClassName, subLabel, subValue, subHint }: { icon: any; label: string; value: string; valueClassName?: string; subLabel?: string; subValue?: string; subHint?: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl glass-card p-5 lift-3d">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/70 via-transparent to-transparent opacity-60 group-hover:opacity-100 transition-opacity" />
      <div className="pointer-events-none absolute -top-12 -right-12 h-28 w-28 rounded-full bg-primary/[0.07] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-600/25 to-red-600/5 border border-primary/25 text-primary flex items-center justify-center red-ring shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className={`relative stat-number text-3xl ${valueClassName ?? ""}`}>{value}</p>
      {subValue !== undefined && (
        <div className="relative mt-2 pt-2 border-t border-amber-500/20">
          {subLabel && <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{subLabel}</p>}
          <p className="text-base font-semibold text-amber-200 tabular-nums">{subValue}</p>
          {subHint && <p className="text-[10px] text-muted-foreground">{subHint}</p>}
        </div>
      )}
    </div>
  );
}

type AnalyticsPreset = "today" | "7d" | "30d" | "3m" | "6m" | "custom";

const _istFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
function toDateStr(d: Date) {
  return _istFmt.format(d);
}

const ADMIN_VENDOR_PAGE_SIZE = 10;

function Analytics() {
  const [preset, setPreset] = useState<AnalyticsPreset>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const now = new Date();
  const computedRange = (() => {
    if (preset === "today") return { startDate: toDateStr(now), endDate: toDateStr(now) };
    if (preset === "7d") return { startDate: toDateStr(new Date(now.getTime() - 6 * 86400000)), endDate: toDateStr(now) };
    if (preset === "30d") return { startDate: toDateStr(new Date(now.getTime() - 29 * 86400000)), endDate: toDateStr(now) };
    if (preset === "3m") return { startDate: toDateStr(new Date(now.getTime() - 89 * 86400000)), endDate: toDateStr(now) };
    if (preset === "6m") return { startDate: toDateStr(new Date(now.getTime() - 179 * 86400000)), endDate: toDateStr(now) };
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
    actualWomen?: number;
    actualMen?: number;
    actualCouple?: number;
    actualsRecordedCount?: number;
    actualsEligibleCount?: number;
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
    today: "Today",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "3m": "Last 3 months",
    "6m": "Last 6 months",
    custom: "Custom range",
  };

  const pendingActuals = (data as { pendingActualsCount?: number } | undefined)?.pendingActualsCount ?? 0;
  const totalCommission = (data as { totalCommission?: number } | undefined)?.totalCommission ?? 0;
  const totalBaseFee = (data as { totalBaseFee?: number } | undefined)?.totalBaseFee ?? 0;

  return (
    <div className="space-y-6">
      {/* Date range filter */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-3 md:gap-4">
          <div className="flex items-center gap-2 mr-1">
            <div className="h-8 w-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold">Platform analytics</p>
              <p className="text-sm font-medium text-white/90">{presetLabel[preset]}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 ml-auto rounded-xl border border-white/[0.07] bg-white/[0.02] p-1">
            {(["today", "7d", "30d", "3m", "6m", "custom"] as AnalyticsPreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all " +
                  (preset === p
                    ? "bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "text-white/55 hover:text-white hover:bg-white/[0.04]")
                }
              >
                {presetLabel[p]}
              </button>
            ))}
          </div>

          {(preset !== "30d" || customStart || customEnd) && (
            <Button variant="outline" size="sm" onClick={() => { setPreset("30d"); setCustomStart(""); setCustomEnd(""); }}>
              Clear
            </Button>
          )}
        </div>

        {preset === "custom" && (
          <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-white/[0.06]">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 mb-1.5 font-semibold">From</p>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9 w-40 rounded-lg border-white/[0.08] bg-white/[0.03]" max={customEnd || toDateStr(now)} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 mb-1.5 font-semibold">To</p>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9 w-40 rounded-lg border-white/[0.08] bg-white/[0.03]" min={customStart} max={toDateStr(now)} />
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[0,1,2,3,4,5,6,7].map((i) => (
              <div key={i} className="rounded-2xl glass-card p-5 h-32 animate-pulse">
                <div className="h-3 w-24 rounded bg-white/[0.06] mb-3" />
                <div className="h-8 w-32 rounded bg-white/[0.08] mb-2" />
                <div className="h-3 w-40 rounded bg-white/[0.05]" />
              </div>
            ))}
          </div>
          <div className="rounded-3xl glass-card-strong h-72 animate-pulse" />
        </div>
      ) : !data ? null : (
      <>
      {/* Primary KPI tiles */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpi label="Revenue" value={formatINR(data.totalRevenue)} hint="Total bookings revenue" Icon={IndianRupee} accent="primary" />
        <AdminKpi label="COD collected (actual)" value={formatINR(data.actualCodRevenue ?? 0)} hint={`${data.actualCodRecordedCount ?? 0} bookings scanned`} Icon={Banknote} accent="amber" warning={pendingActuals > 0 ? `${pendingActuals} bookings awaiting QR scan` : null} />
        <AdminKpi label="Online payments" value={formatINR(data.onlineRevenue)} hint="Paid via gateway" Icon={CreditCard} accent="emerald" />
        <AdminKpi label="Total commission" value={formatINR(totalCommission)} hint="Platform commission charged" Icon={Percent} accent="violet" />
        <AdminKpi label="Total base fee" value={formatINR(totalBaseFee)} hint="Base fee (Incl. GST) collected" Icon={Banknote} accent="amber" />
      </div>

      {/* Secondary count tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <AdminCountTile label="New users" value={data.totalUsers} Icon={Users} />
        <AdminCountTile label="New partners" value={data.totalVendors} Icon={Briefcase} />
        <AdminCountTile label="Pending approval" value={data.pendingVendors} Icon={Clock} tone="amber" />
        <AdminCountTile label="Bookings" value={data.totalBookings} Icon={CalendarCheck} />
      </div>

      {/* Ticket audience strip */}
      {hasTickets && (
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold">Tickets sold</p>
          <div className="grid grid-cols-3 gap-3">
            <AudienceTile label="Women" count={adminData.totalWomen ?? 0} tint="pink" />
            <AudienceTile label="Men" count={adminData.totalMen ?? 0} tint="blue" />
            <AudienceTile label="Couples" count={adminData.totalCouple ?? 0} tint="purple" />
          </div>
          {(adminData.actualsEligibleCount ?? 0) > 0 && (
            <>
              <div className="flex items-baseline justify-between pt-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold">Real check-ins</p>
                <p className="text-[11px] text-white/45">
                  {adminData.actualsRecordedCount ?? 0} of {adminData.actualsEligibleCount ?? 0} bookings recorded
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <AudienceTile label="Women" count={adminData.actualWomen ?? 0} tint="pink" sub="checked in" />
                <AudienceTile label="Men" count={adminData.actualMen ?? 0} tint="blue" sub="checked in" />
                <AudienceTile label="Couples" count={adminData.actualCouple ?? 0} tint="purple" sub="checked in" />
              </div>
            </>
          )}
        </div>
      )}

      {/* Revenue area chart */}
      {hasDailyRevenue && (
        <div className="rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.03] to-white/[0.01] backdrop-blur-xl p-5 md:p-6">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/40 font-semibold mb-1">Revenue</p>
              <p className="font-serif text-xl tracking-tight">Daily earnings — last 30 days</p>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/25 px-3 py-1">
              <ArrowUpRight className="h-3 w-3 text-primary" />
              <span className="text-[11px] font-semibold text-primary">{formatINR(data.totalRevenue)}</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={adminData.dailyRevenue} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="adminRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                tickFormatter={(d: string) => {
                  const dt = new Date(d);
                  return `${dt.getDate()}/${dt.getMonth() + 1}`;
                }}
                interval={Math.max(1, Math.floor((adminData.dailyRevenue ?? []).length / 8) - 1)}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`}
                width={56}
                domain={[0, Math.ceil(dailyChartMax * 1.15)]}
              />
              <Tooltip
                cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }}
                contentStyle={{
                  background: "rgba(15,15,17,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  fontSize: "12px",
                  backdropFilter: "blur(10px)",
                }}
                formatter={(v: number) => [formatINR(v), "Revenue"]}
                labelFormatter={(label: string) => new Date(label).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                fill="url(#adminRevGrad)"
                dot={false}
                activeDot={{ r: 5, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "rgba(0,0,0,0.4)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly bars + booking status side-by-side */}
      <div className="grid lg:grid-cols-3 gap-5">
        {(adminData.monthlyRevenue ?? []).length > 0 && (
          <div className="lg:col-span-2 rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.03] to-white/[0.01] backdrop-blur-xl p-5 md:p-6">
            <div className="mb-5">
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/40 font-semibold mb-1">Monthly revenue</p>
              <p className="font-serif text-xl tracking-tight">{presetLabel[preset]}</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={adminData.monthlyRevenue} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                  tickFormatter={(m: string) => {
                    const [y, mo] = m.split("-");
                    const d = new Date(Number(y), Number(mo) - 1, 1);
                    return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`}
                  width={56}
                  domain={[0, Math.ceil(monthlyChartMax * 1.15)]}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{
                    background: "rgba(15,15,17,0.95)",
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

        <div className="rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.03] to-white/[0.01] backdrop-blur-xl p-5 md:p-6">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/40 font-semibold mb-1">Bookings</p>
          <p className="font-serif text-xl tracking-tight mb-4">Status mix</p>
          {data.bookingsByStatus.length === 0 || data.bookingsByStatus.every((s) => s.count === 0) ? (
            <p className="text-sm text-white/40 py-8 text-center">No bookings yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.bookingsByStatus} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} />
                <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} tickLine={false} axisLine={false} width={32} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{
                    background: "rgba(15,15,17,0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top partners */}
      <div className="rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.03] to-white/[0.01] backdrop-blur-xl p-5 md:p-6">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/40 font-semibold mb-1">Top performers</p>
            <p className="font-serif text-xl tracking-tight">Highest-grossing partners</p>
          </div>
          <Trophy className="h-5 w-5 text-amber-400/60" />
        </div>
        {data.topVendors.length === 0 ? (
          <p className="text-sm text-white/40">No data yet.</p>
        ) : (
          <div className="space-y-2">
            {data.topVendors.map((v, i) => (
              <div key={v.vendorId} className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 hover:bg-white/[0.04] transition-colors">
                <span className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold tabular-nums shrink-0 ${
                  i === 0 ? "bg-amber-500/15 text-amber-300 border border-amber-500/30" :
                  i === 1 ? "bg-white/[0.08] text-white/80 border border-white/[0.12]" :
                  i === 2 ? "bg-orange-500/10 text-orange-300 border border-orange-500/25" :
                  "bg-white/[0.04] text-white/45 border border-white/[0.06]"
                }`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-medium text-white/90 truncate flex-1">{v.businessName}</span>
                <span className="text-xs text-white/45 tabular-nums whitespace-nowrap hidden sm:inline">{v.bookingCount} bookings</span>
                <span className="text-sm font-semibold text-primary tabular-nums whitespace-nowrap">{formatINR(v.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent bookings */}
      <div className="rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.03] to-white/[0.01] backdrop-blur-xl overflow-hidden">
        <div className="px-5 md:px-6 pt-5 md:pt-6 pb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/40 font-semibold mb-1">Recent bookings</p>
            <p className="font-serif text-xl tracking-tight">Latest activity</p>
          </div>
          <span className="text-[10px] uppercase tracking-[0.18em] text-white/30 font-mono tabular-nums">
            {data.recentBookings.length} {data.recentBookings.length === 1 ? "row" : "rows"}
          </span>
        </div>
        {data.recentBookings.length === 0 ? (
          <p className="text-sm text-white/40 px-5 md:px-6 pb-6">No bookings yet.</p>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="sticky top-0 z-10 text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold border-y border-white/[0.05] bg-black/90 backdrop-blur">
                <tr>
                  <th className="text-left py-3 px-5 md:px-6">Event</th>
                  <th className="text-left py-3 px-3">User</th>
                  <th className="text-left py-3 px-3">Booked at</th>
                  <th className="text-right py-3 px-3">People</th>
                  <th className="text-center py-3 px-3">Status</th>
                  <th className="text-right py-3 pr-5 md:pr-6 pl-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recentBookings.map((b) => {
                  const bx = b as typeof b & { peopleCount?: number };
                  const peopleCount = bx.peopleCount ?? bx.guests ?? 0;
                  const bookedAt = new Date(bx.createdAt);
                  const bookedAtStr = `${bookedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}, ${bookedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
                  return (
                    <tr key={bx.id} className="border-t border-white/[0.04] hover:bg-white/[0.025] transition-colors">
                      <td className="py-3.5 px-5 md:px-6 font-medium text-white/90">{bx.eventTitle}</td>
                      <td className="px-3 text-white/70">{bx.userName}</td>
                      <td className="px-3 text-white/60 tabular-nums whitespace-nowrap">{bookedAtStr}</td>
                      <td className="text-right px-3 tabular-nums text-white/80">{peopleCount}</td>
                      <td className="text-center px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                          bx.status === "completed" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" :
                          bx.status === "confirmed" ? "bg-blue-500/10 text-blue-300 border-blue-500/20" :
                          bx.status === "cancelled" ? "bg-red-500/10 text-red-300 border-red-500/20" :
                          "bg-amber-500/10 text-amber-300 border-amber-500/20"
                        }`}>{bx.status}</span>
                      </td>
                      <td className="text-right pr-5 md:pr-6 pl-3 tabular-nums text-primary font-semibold">{formatINR(bx.totalPrice)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}

function AdminKpi({
  label, value, hint, Icon, accent, warning,
}: {
  label: string;
  value: string;
  hint?: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: "primary" | "amber" | "emerald" | "violet";
  warning?: string | null;
}) {
  const accents = {
    primary: { chip: "bg-gradient-to-br from-primary/25 to-primary/5 border-primary/30 text-primary", text: "", bar: "from-primary/70", glow: "group-hover:shadow-[0_16px_50px_-12px_rgba(232,41,28,0.30)]" },
    amber:   { chip: "bg-gradient-to-br from-amber-500/25 to-amber-500/5 border-amber-500/30 text-amber-400", text: "text-amber-300", bar: "from-amber-400/70", glow: "group-hover:shadow-[0_16px_50px_-12px_rgba(245,158,11,0.28)]" },
    emerald: { chip: "bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 border-emerald-500/30 text-emerald-400", text: "text-emerald-300", bar: "from-emerald-400/70", glow: "group-hover:shadow-[0_16px_50px_-12px_rgba(16,185,129,0.28)]" },
    violet:  { chip: "bg-gradient-to-br from-violet-500/25 to-violet-500/5 border-violet-500/30 text-violet-400", text: "text-violet-300", bar: "from-violet-400/70", glow: "group-hover:shadow-[0_16px_50px_-12px_rgba(139,92,246,0.28)]" },
  }[accent];
  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-white/[0.01] backdrop-blur-xl p-5 transition-all duration-300 hover:border-white/[0.14] hover:-translate-y-0.5 ${accents.glow}`}>
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accents.bar} via-transparent to-transparent opacity-60 group-hover:opacity-100 transition-opacity`} />
      <div className="pointer-events-none absolute -top-12 -right-12 h-28 w-28 rounded-full bg-white/[0.04] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative flex items-start gap-3 mb-4">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${accents.chip} shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/40 font-semibold leading-none">{label}</p>
        </div>
        <ArrowUpRight className="h-4 w-4 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
      </div>
      <p className={`relative stat-number text-3xl md:text-[2rem] leading-none tabular-nums ${accents.text}`}>{value}</p>
      {hint && <p className="relative text-xs text-white/45 mt-2">{hint}</p>}
      {warning && (
        <p className="relative text-[11px] text-amber-300/90 mt-2 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          {warning}
        </p>
      )}
    </div>
  );
}

function AdminCountTile({
  label, value, Icon, tone,
}: { label: string; value: number; Icon: React.ComponentType<{ className?: string }>; tone?: "amber" }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${tone === "amber" ? "bg-amber-500/10 text-amber-300 border border-amber-500/20" : "bg-white/[0.04] text-white/55 border border-white/[0.06]"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold leading-none">{label}</p>
        <p className={`stat-number text-2xl tabular-nums leading-tight mt-1 ${tone === "amber" ? "text-amber-200" : ""}`}>{value}</p>
      </div>
    </div>
  );
}

function AudienceTile({ label, count, tint, sub }: { label: string; count: number; tint: "pink" | "blue" | "purple"; sub?: string }) {
  const tints = {
    pink:   { bg: "bg-pink-500/10 border-pink-500/20",     text: "text-pink-300",   sym: "♀" },
    blue:   { bg: "bg-blue-500/10 border-blue-500/20",     text: "text-blue-300",   sym: "♂" },
    purple: { bg: "bg-purple-500/10 border-purple-500/20", text: "text-purple-300", sym: "⚭" },
  }[tint];
  return (
    <div className={`rounded-xl border ${tints.bg} px-4 py-3 flex items-center gap-3`}>
      <span className={`h-9 w-9 rounded-lg flex items-center justify-center text-lg ${tints.text} bg-black/20`}>
        {tints.sym}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold">{label}</p>
        <p className={`stat-number text-xl ${tints.text} tabular-nums leading-tight`}>{count}</p>
        {sub && <p className="text-[10px] text-white/35">{sub}</p>}
      </div>
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
  country: string;
  bannerImage: string;
  status: string;
  eventCount: number;
  userEmail: string;
  createdAt: string;
  baseFeePercent?: string;
  baseFeeEnabled?: boolean;
}

interface VendorManagerUser {
  id: number;
  name: string;
  email: string;
  profileImage: string;
  phone: string;
}

interface VendorManagerRow {
  id: number;
  vendorId: number;
  invitedEmail: string;
  status: string;
  createdAt: string;
  manager: VendorManagerUser | null;
  invitedBy: VendorManagerUser | null;
}

function statusColor(s: string) {
  if (s === "approved") return "bg-green-500/20 text-green-300 border-green-500/30";
  if (s === "rejected") return "bg-red-500/20 text-red-300 border-red-500/30";
  return "bg-amber-500/20 text-amber-300 border-amber-500/30";
}

function managerStatusColor(s: string) {
  if (s === "accepted") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
  if (s === "rejected") return "bg-red-500/15 text-red-300 border-red-500/25";
  return "bg-amber-500/15 text-amber-300 border-amber-500/25";
}

function UserAvatar({ name, photo, size = "md" }: { name: string; photo?: string; size?: "sm" | "md" }) {
  const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  if (photo) {
    return <img src={photo} alt={name} className={`${dim} rounded-full object-cover shrink-0 border border-white/10`} />;
  }
  return (
    <div className={`${dim} rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center shrink-0 font-semibold text-white/80`}>
      {initials}
    </div>
  );
}

function ManagersPanel({ vendorId, vendorName }: { vendorId: number; vendorName: string }) {
  const [managers, setManagers] = useState<VendorManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [removing, setRemoving] = useState<number | null>(null);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    apiGet<VendorManagerRow[]>(`/api/admin/vendors/${vendorId}/managers`)
      .then(setManagers)
      .catch((e) => toast({ title: "Failed to load managers", description: e?.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [vendorId]);

  const remove = async (mgr: VendorManagerRow) => {
    const label = mgr.manager?.name || mgr.invitedEmail;
    if (!confirm(`Remove "${label}" as manager of ${vendorName}?`)) return;
    setRemoving(mgr.id);
    try {
      await apiDelete(`/api/admin/vendors/${vendorId}/managers/${mgr.id}`);
      toast({ title: "Manager removed" });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally {
      setRemoving(null);
    }
  };

  const filtered = managers.filter((m) => {
    const q = search.toLowerCase();
    const nameMatch = (m.manager?.name ?? "").toLowerCase().includes(q);
    const emailMatch = m.invitedEmail.toLowerCase().includes(q);
    if (q && !nameMatch && !emailMatch) return false;
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="border-t border-white/[0.08] bg-gradient-to-b from-black/30 to-black/10">
      <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Users className="h-3.5 w-3.5 text-primary/70" />
          </div>
          <span className="text-sm font-medium text-white/90">Managers</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.07] border border-white/[0.12] text-white/50 font-medium">
            {managers.length}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email..."
              className="pl-7 pr-3 py-1.5 text-xs bg-white/[0.05] border border-white/[0.10] rounded-lg text-white/80 placeholder:text-white/30 focus:outline-none focus:border-primary/30 w-44"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-white/[0.05] border border-white/[0.10] rounded-lg px-2.5 py-1.5 text-white/70 focus:outline-none focus:border-primary/30"
          >
            <option value="all">All status</option>
            <option value="accepted">Accepted</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>
      <div className="px-5 pb-5">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-white/40 text-sm">
            <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-primary/60 animate-spin" />
            Loading managers...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center">
            <div className="h-10 w-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-3">
              <Users className="h-5 w-5 text-white/25" />
            </div>
            <p className="text-sm text-white/40">
              {search || statusFilter !== "all" ? "No managers match your filters" : "No managers assigned yet"}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((mgr) => (
              <div
                key={mgr.id}
                className="group relative rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] hover:border-white/[0.14] transition-all duration-200 p-4"
              >
                <div className="absolute top-3 right-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold capitalize ${managerStatusColor(mgr.status)}`}>
                    {mgr.status}
                  </span>
                </div>
                <div className="flex items-start gap-3 mb-3 pr-16">
                  <UserAvatar name={mgr.manager?.name || mgr.invitedEmail} photo={mgr.manager?.profileImage || undefined} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white/90 truncate leading-tight">
                      {mgr.manager?.name || "—"}
                    </p>
                    <p className="text-[11px] text-white/45 mt-0.5 leading-tight">Scanner Manager</p>
                  </div>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center gap-2 text-white/55">
                    <Mail className="h-3 w-3 shrink-0 text-white/30" />
                    <span className="truncate">{mgr.invitedEmail}</span>
                  </div>
                  {mgr.manager?.phone && (
                    <div className="flex items-center gap-2 text-white/55">
                      <span className="h-3 w-3 shrink-0 flex items-center justify-center text-[10px]">📞</span>
                      <span>{mgr.manager.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-white/40">
                    <Clock className="h-3 w-3 shrink-0 text-white/25" />
                    <span>Invited {new Date(mgr.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                  {mgr.invitedBy && (
                    <div className="flex items-center gap-2 text-white/40">
                      <UserCheck className="h-3 w-3 shrink-0 text-white/25" />
                      <span className="truncate">By {mgr.invitedBy.name}</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-white/[0.06]">
                  <button
                    onClick={() => remove(mgr)}
                    disabled={removing === mgr.id}
                    className="flex items-center gap-1.5 text-[11px] text-red-400/70 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                    {removing === mgr.id ? "Removing..." : "Remove manager"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AllVendorsAdmin() {
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverTotalPages, setServerTotalPages] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<AdminVendor>>({});
  const [saving, setSaving] = useState(false);
  const [expandedManagers, setExpandedManagers] = useState<Set<number>>(new Set());
  const [globalSearch, setGlobalSearch] = useState("");
  const { toast } = useToast();
  const vendorFormErrors = useFormErrors();
  const approve = useApproveVendor();
  const reject = useRejectVendor();

  const load = (pg = 1) => {
    setLoading(true);
    apiGet<{ data: AdminVendor[]; total: number; page: number; totalPages: number }>(
      `/api/admin/vendors?page=${pg}&limit=${ADMIN_VENDOR_PAGE_SIZE}`,
    )
      .then((resp) => {
        setVendors(resp.data);
        setServerTotal(resp.total);
        setServerTotalPages(resp.totalPages);
        setPage(resp.page);
      })
      .catch((e) => toast({ title: "Failed to load", description: e?.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(1); }, []);

  const startEdit = (v: AdminVendor) => {
    setEditingId(v.id);
    setEditForm({ businessName: v.businessName, description: v.description, category: v.category, status: v.status, city: v.city, state: v.state, country: v.country });
    vendorFormErrors.reset();
  };

  const saveEdit = async (id: number) => {
    setSaving(true);
    vendorFormErrors.reset();
    try {
      await apiPatch(`/api/admin/vendors/${id}`, editForm);
      toast({ title: "Partner updated" });
      setEditingId(null);
      load(page);
    } catch (e: any) {
      vendorFormErrors.setFromError(e);
      toast({ title: "Failed to save", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (v: AdminVendor) => {
    if (!confirm(`Delete "${v.businessName}" and all ${v.eventCount} of their listings? This cannot be undone.`)) return;
    try {
      await apiDelete(`/api/admin/vendors/${v.id}`);
      toast({ title: "Partner deleted", description: `${v.businessName} and all related data removed.` });
      load(page);
    } catch (e: any) {
      toast({
        title: "Failed to delete partner",
        description: e?.message ?? "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
  };

  const toggleManagers = (id: number) => {
    setExpandedManagers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filteredVendors = vendors.filter((v) => {
    if (!globalSearch) return true;
    const q = globalSearch.toLowerCase();
    return v.businessName.toLowerCase().includes(q) || v.userEmail.toLowerCase().includes(q) || v.city.toLowerCase().includes(q);
  });

  if (loading) return (
    <div className="flex items-center gap-3 py-12 text-white/40">
      <div className="h-5 w-5 rounded-full border-2 border-white/20 border-t-primary/60 animate-spin" />
      <span className="text-sm">Loading partners...</span>
    </div>
  );
  if (vendors.length === 0 && serverTotal === 0) return <p className="text-muted-foreground">No partners found.</p>;

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-lg font-semibold text-white/90">{serverTotal} Partner{serverTotal !== 1 ? "s" : ""}</p>
          <p className="text-xs text-white/40 mt-0.5">Manage pub partners, their listings and assigned managers</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
          <input
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Search partners..."
            className="pl-9 pr-4 py-2 text-sm bg-white/[0.05] border border-white/[0.10] rounded-xl text-white/80 placeholder:text-white/30 focus:outline-none focus:border-primary/30 w-56"
          />
        </div>
      </div>

      {/* Vendor cards */}
      <div className="space-y-4">
        {filteredVendors.map((v) => (
          <div key={v.id} className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/60 to-black/40 overflow-hidden transition-all duration-200 hover:border-white/[0.13]">

            {/* Vendor main row */}
            <div className="flex flex-col md:flex-row">
              {v.bannerImage && (
                <div className="md:w-36 aspect-video md:aspect-auto shrink-0 bg-white/[0.03]">
                  <img src={v.bannerImage} alt="" className="h-full w-full object-cover opacity-80" />
                </div>
              )}
              <div className="flex-1 p-5 flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-semibold capitalize ${statusColor(v.status)}`}>{v.status}</span>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full border border-white/[0.12] bg-white/[0.05] text-white/55 font-medium">{v.category}</span>
                  </div>
                  <p className="font-serif text-lg leading-tight text-white/95">{v.businessName}</p>
                  <p className="text-xs text-white/45 mt-1">
                    {v.userEmail}{v.city ? ` · ${v.city}` : ""}{v.state ? `, ${v.state}` : ""}
                  </p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-xs text-white/35">{v.eventCount} listing{v.eventCount !== 1 ? "s" : ""}</span>
                    <span className="text-xs text-white/25">·</span>
                    <span className="text-xs text-white/35">Since {new Date(v.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap items-start">
                  {v.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        className="bg-gradient-to-br from-red-600 to-red-800 border-0 text-xs h-8"
                        onClick={() => approve.mutate({ vendorId: v.id }, {
                          onSuccess: () => { toast({ title: "Approved" }); load(); },
                          onError: (e: unknown) => toast({ title: "Failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
                        })}
                      ><CheckCircle className="h-3.5 w-3.5 mr-1" />Approve</Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs border-red-500/30 text-red-300 h-8"
                        onClick={() => reject.mutate({ vendorId: v.id }, {
                          onSuccess: () => { toast({ title: "Rejected" }); load(); },
                          onError: (e: unknown) => toast({ title: "Failed to reject", description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
                        })}
                      ><XCircle className="h-3.5 w-3.5 mr-1" />Reject</Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs border-white/[0.12] h-8"
                    onClick={() => editingId === v.id ? setEditingId(null) : startEdit(v)}
                  ><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs border-red-500/20 text-red-400/80 hover:bg-red-900/20 hover:text-red-300 h-8"
                    onClick={() => remove(v)}
                  ><Trash2 className="h-3.5 w-3.5 mr-1" />Delete</Button>
                </div>
              </div>
            </div>

            {/* Edit panel */}
            {editingId === v.id && (
              <div className="border-t border-white/[0.08] px-5 py-5 bg-black/20 space-y-4">
                <p className="text-sm font-medium text-white/80">Edit partner profile</p>
                {vendorFormErrors.topError && <p className="text-xs text-red-400">{vendorFormErrors.topError}</p>}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-white/60">Business name</Label>
                    <Input
                      value={editForm.businessName ?? ""}
                      onChange={(e) => { setEditForm((f) => ({ ...f, businessName: e.target.value })); vendorFormErrors.clearField("businessName"); }}
                      className={fieldClass("bg-black/40 border-white/10 h-9 text-sm", vendorFormErrors.fieldError("businessName"))}
                    />
                    {vendorFormErrors.fieldError("businessName") && <p className="text-xs text-red-400">{vendorFormErrors.fieldError("businessName")}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-white/60">Category</Label>
                    <Input
                      value={editForm.category ?? ""}
                      onChange={(e) => { setEditForm((f) => ({ ...f, category: e.target.value })); vendorFormErrors.clearField("category"); }}
                      className={fieldClass("bg-black/40 border-white/10 h-9 text-sm", vendorFormErrors.fieldError("category"))}
                    />
                    {vendorFormErrors.fieldError("category") && <p className="text-xs text-red-400">{vendorFormErrors.fieldError("category")}</p>}
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs text-white/60">Location</Label>
                    <LocationSelect
                      country={editForm.country ?? ""}
                      state={editForm.state ?? ""}
                      city={editForm.city ?? ""}
                      onChange={(loc) => { setEditForm((f) => ({ ...f, country: loc.country, state: loc.state, city: loc.city })); vendorFormErrors.clearField("country"); vendorFormErrors.clearField("state"); vendorFormErrors.clearField("city"); }}
                      className="[&>button]:bg-black/40 [&>button]:border-white/10"
                    />
                    {(vendorFormErrors.fieldError("country") || vendorFormErrors.fieldError("state") || vendorFormErrors.fieldError("city")) && (
                      <p className="text-xs text-red-400">{vendorFormErrors.fieldError("country") || vendorFormErrors.fieldError("state") || vendorFormErrors.fieldError("city")}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-white/60">Status</Label>
                    <Select
                      value={editForm.status ?? "pending"}
                      onValueChange={(val) => { setEditForm((f) => ({ ...f, status: val })); vendorFormErrors.clearField("status"); }}
                    >
                      <SelectTrigger className={fieldClass("bg-black/40 border-white/10 h-9 text-sm", vendorFormErrors.fieldError("status"))}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                    {vendorFormErrors.fieldError("status") && <p className="text-xs text-red-400">{vendorFormErrors.fieldError("status")}</p>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/60">Description</Label>
                  <Textarea
                    rows={3}
                    value={editForm.description ?? ""}
                    onChange={(e) => { setEditForm((f) => ({ ...f, description: e.target.value })); vendorFormErrors.clearField("description"); }}
                    className={fieldClass("bg-black/40 border-white/10 text-sm", vendorFormErrors.fieldError("description"))}
                  />
                  {vendorFormErrors.fieldError("description") && <p className="text-xs text-red-400">{vendorFormErrors.fieldError("description")}</p>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={saving} onClick={() => saveEdit(v.id)} className="bg-gradient-to-br from-red-600 to-red-800 border-0 text-xs">
                    {saving ? "Saving..." : "Save changes"}
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Base Fee toggle bar */}
            <div className="flex items-center justify-between px-5 py-2.5 border-t border-white/[0.06] bg-black/10">
              <div className="flex items-center gap-2">
                <Percent className="h-3.5 w-3.5 text-amber-400/60" />
                <span className="text-xs text-white/50 font-medium">Base Fee ({v.baseFeePercent ?? "3.50"}%) — {v.baseFeeEnabled !== false ? "Enabled" : "Disabled"}</span>
              </div>
              <Switch
                checked={v.baseFeeEnabled !== false}
                onCheckedChange={async (enabled) => {
                  try {
                    await apiPatch(`/api/admin/vendors/${v.id}/base-fee`, { baseFeeEnabled: enabled });
                    load(page);
                  } catch (e: any) {
                    toast({ title: "Failed to update base fee", description: e?.message, variant: "destructive" });
                  }
                }}
              />
            </div>

            {/* Managers toggle bar */}
            <button
              onClick={() => toggleManagers(v.id)}
              className="w-full flex items-center justify-between px-5 py-3 border-t border-white/[0.06] hover:bg-white/[0.02] transition-colors group"
            >
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-white/35 group-hover:text-primary/60 transition-colors" />
                <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors font-medium">
                  {expandedManagers.has(v.id) ? "Hide" : "View"} Managers
                </span>
              </div>
              {expandedManagers.has(v.id)
                ? <ChevronUp className="h-3.5 w-3.5 text-white/30 group-hover:text-white/60 transition-colors" />
                : <ChevronDown className="h-3.5 w-3.5 text-white/30 group-hover:text-white/60 transition-colors" />
              }
            </button>

            {/* Managers panel */}
            {expandedManagers.has(v.id) && (
              <ManagersPanel vendorId={v.id} vendorName={v.businessName} />
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {serverTotalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-white/[0.08]">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => load(page - 1)} className="text-xs border-white/10">Prev</Button>
          <span className="text-xs text-white/40">Page {page} of {serverTotalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= serverTotalPages} onClick={() => load(page + 1)} className="text-xs border-white/10">Next</Button>
        </div>
      )}
    </div>
  );
}

interface AdminEvent {
  id: number;
  vendorId: number;
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
  popularSince: string | null;
  approvalStatus: string;
  imageUrl: string;
  retainForever: boolean;
  vendorCrowdLevel: string | null;
}

interface PendingAnnouncement {
  id: number;
  title: string;
  body: string;
  announceDate: string;
  announceTime: string;
  imageUrl: string;
  price: string;
  genre: string;
  eventType: string;
  vendorId: number;
  vendorName: string;
  createdAt: string;
}

function AnnouncementApprovalsAdmin() {
  const [items, setItems] = useState<PendingAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    setLoadError(null);
    apiGet<PendingAnnouncement[]>("/api/admin/announcements/pending")
      .then((data) => { setItems(data); setLoadError(null); })
      .catch((e) => { setLoadError(e?.message ?? "Failed to load"); toast({ title: "Failed to load announcements", description: e?.message, variant: "destructive" }); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const approve = async (id: number) => {
    try {
      await apiPatch(`/api/admin/announcements/${id}/approve`, {});
      toast({ title: "Announcement approved — users will be notified." });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  const reject = async (id: number) => {
    try {
      await apiPatch(`/api/admin/announcements/${id}/reject`, { rejectionReason: reason.trim() });
      toast({ title: "Announcement rejected" });
      setRejecting(null);
      setReason("");
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  if (loading) return <p className="text-muted-foreground text-sm">Loading announcements...</p>;
  if (loadError) return (
    <div className="rounded-2xl glass-card p-6 text-center space-y-3">
      <XCircle className="h-8 w-8 text-red-400 mx-auto" />
      <p className="text-sm text-muted-foreground">{loadError}</p>
      <Button size="sm" variant="outline" onClick={load}>Retry</Button>
    </div>
  );
  if (items.length === 0) return (
    <div className="rounded-2xl glass-card p-6 text-center">
      <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">No pending announcements</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{items.length} announcement{items.length !== 1 ? "s" : ""} awaiting review</p>
      {items.map((a) => (
        <div key={a.id} className="rounded-2xl glass-card overflow-hidden">
          <div className="flex gap-4 p-4">
            {a.imageUrl ? (
              <img src={a.imageUrl} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                <Megaphone className="h-7 w-7 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p className="font-serif text-base">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.vendorName}</p>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {a.genre && <Badge variant="outline">{a.genre}</Badge>}
                  {a.eventType && <Badge variant="secondary" className="bg-white/10">{a.eventType}</Badge>}
                </div>
              </div>
              {a.body && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.body}</p>}
              <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                {a.announceDate && <span>{a.announceDate}{a.announceTime ? ` at ${a.announceTime}` : ""}</span>}
                {a.price && Number(a.price) > 0 && <span>₹{Number(a.price).toLocaleString("en-IN")}</span>}
              </div>
            </div>
          </div>
          {rejecting === a.id ? (
            <div className="border-t border-white/10 p-4 space-y-3 bg-red-900/10">
              <p className="text-sm font-medium text-red-300">Reason for rejection (optional)</p>
              <Textarea
                value={reason}
                onChange={(ev) => setReason(ev.target.value)}
                rows={2}
                placeholder="E.g. Inappropriate content, missing details..."
                className="bg-black/40 border-white/10"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => reject(a.id)} className="bg-red-700 hover:bg-red-600 border-0">
                  <XCircle className="h-4 w-4 mr-1" /> Confirm rejection
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setRejecting(null); setReason(""); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="border-t border-white/10 p-4 flex gap-2 justify-end">
              <Button size="sm" onClick={() => approve(a.id)} className="bg-green-700 hover:bg-green-600 border-0">
                <CheckCircle className="h-4 w-4 mr-1" /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setRejecting(a.id); setReason(""); }}
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
  const eventFormErrors = useFormErrors();

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
      toast({ title: "Event approved -- it is now live." });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  const reject = async (id: number) => {
    if (!reason.trim()) {
      eventFormErrors.setFieldError("rejectionReason", "Please provide a reason for rejection.");
      toast({ title: "Please provide a reason for rejection", variant: "destructive" });
      return;
    }
    eventFormErrors.reset();
    try {
      await apiPatch(`/api/admin/events/${id}`, { approvalStatus: "rejected", rejectionReason: reason.trim() });
      toast({ title: "Event rejected" });
      setRejecting(null);
      setReason("");
      load();
    } catch (e: any) {
      eventFormErrors.setFromError(e);
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
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
              {eventFormErrors.topError && <p className="text-xs text-red-400">{eventFormErrors.topError}</p>}
              <Textarea
                value={reason}
                onChange={(ev) => { setReason(ev.target.value); eventFormErrors.clearField("rejectionReason"); }}
                rows={2}
                placeholder="E.g. Incomplete information, inappropriate content..."
                className={fieldClass("bg-black/40 border-white/10", eventFormErrors.fieldError("rejectionReason"))}
              />
              {eventFormErrors.fieldError("rejectionReason") && <p className="text-xs text-red-400">{eventFormErrors.fieldError("rejectionReason")}</p>}
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

function popularDays(popularSince: string | null): string {
  if (!popularSince) return "--";
  const ms = Date.now() - new Date(popularSince).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  return `${days}d`;
}

const ADMIN_CROWD_LEVELS = [
  { value: "low", label: "Low", color: "text-green-400", bg: "bg-green-500/15 border-green-500/30" },
  { value: "moderate", label: "Moderate", color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/30" },
  { value: "party", label: "High 🔥", color: "text-red-400", bg: "bg-red-500/15 border-red-500/30" },
] as const;

function EventsAdmin() {
  const [items, setItems] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterPartner, setFilterPartner] = useState("all");
  const [crowdLevelOpen, setCrowdLevelOpen] = useState<number | null>(null);
  const [savingCrowd, setSavingCrowd] = useState<number | null>(null);
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

  const toggleRetain = async (e: AdminEvent) => {
    try {
      await apiPatch(`/api/admin/events/${e.id}`, { retainForever: !e.retainForever });
      toast({ title: e.retainForever ? "Retention removed" : "Event retained forever" });
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    }
  };

  const setCrowdLevel = async (vendorId: number, level: string | null) => {
    setSavingCrowd(vendorId);
    try {
      await apiPatch(`/api/admin/vendors/${vendorId}/crowd-level`, { crowdLevel: level });
      setItems((prev) => prev.map((e) => e.vendorId === vendorId ? { ...e, vendorCrowdLevel: level } : e));
      toast({ title: level ? `Crowd level set to "${level}"` : "Crowd level cleared" });
      setCrowdLevelOpen(null);
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    } finally {
      setSavingCrowd(null);
    }
  };

  // Close crowd level dropdown when clicking outside
  useEffect(() => {
    if (!crowdLevelOpen) return;
    const handler = () => setCrowdLevelOpen(null);
    setTimeout(() => document.addEventListener("click", handler), 0);
    return () => document.removeEventListener("click", handler);
  }, [crowdLevelOpen]);

  const uniqueTypes = Array.from(new Set(items.map((e) => e.type).filter(Boolean))).sort();
  const uniquePartners = Array.from(new Set(items.map((e) => e.partnerName).filter(Boolean))).sort();

  const filtered = items.filter((e) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!e.title.toLowerCase().includes(q) && !e.partnerName.toLowerCase().includes(q)) return false;
    }
    if (filterStatus !== "all" && e.approvalStatus !== filterStatus) return false;
    if (filterType !== "all" && e.type !== filterType) return false;
    if (filterPartner !== "all" && e.partnerName !== filterPartner) return false;
    return true;
  });

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            placeholder="Search title or partner..."
            className="pl-8 h-8 text-sm bg-white/5 border-white/10"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(ev) => setFilterStatus(ev.target.value)}
          className="h-8 text-sm rounded-md bg-white/5 border border-white/10 px-2 text-foreground"
        >
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={filterType}
          onChange={(ev) => setFilterType(ev.target.value)}
          className="h-8 text-sm rounded-md bg-white/5 border border-white/10 px-2 text-foreground"
        >
          <option value="all">All types</option>
          {uniqueTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={filterPartner}
          onChange={(ev) => setFilterPartner(ev.target.value)}
          className="h-8 text-sm rounded-md bg-white/5 border border-white/10 px-2 text-foreground max-w-[180px]"
        >
          <option value="all">All partners</option>
          {uniquePartners.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} / {items.length}</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">No events match the current filters.</p>
      ) : (
        <div className="rounded-2xl glass-card overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="sticky top-0 z-10 bg-white/5 backdrop-blur text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Title</th>
                <th className="text-left p-3">Partner</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Location</th>
                <th className="text-right p-3">Price</th>
                <th className="text-center p-3">Status</th>
                <th className="text-center p-3">Crowd Level</th>
                <th className="text-center p-3">Popular Since</th>
                <th className="text-center p-3">Retain</th>
                <th className="text-right p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const crowdOpt = ADMIN_CROWD_LEVELS.find((o) => o.value === e.vendorCrowdLevel);
                const isSaving = savingCrowd === e.vendorId;
                return (
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
                  <td className="p-3 text-center relative">
                    {e.type === "pub" ? (
                      <div className="inline-block relative">
                        <button
                          disabled={isSaving}
                          onClick={() => setCrowdLevelOpen(crowdLevelOpen === e.vendorId ? null : e.vendorId)}
                          className={`text-xs px-2.5 py-1 rounded-full border inline-flex items-center gap-1 transition-colors disabled:opacity-50 ${crowdOpt ? `${crowdOpt.bg} ${crowdOpt.color}` : "bg-white/5 border-white/15 text-white/40 hover:border-white/30"}`}
                        >
                          {isSaving ? "…" : (crowdOpt?.label ?? "Set level")}
                        </button>
                        {crowdLevelOpen === e.vendorId && (
                          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 min-w-[160px] rounded-xl border border-white/15 bg-card shadow-2xl p-2 space-y-1">
                            {ADMIN_CROWD_LEVELS.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => setCrowdLevel(e.vendorId, opt.value)}
                                className={`w-full text-left text-xs px-3 py-2 rounded-lg transition-colors ${e.vendorCrowdLevel === opt.value ? `${opt.bg} ${opt.color} font-semibold` : "text-foreground/80 hover:bg-white/8"}`}
                              >
                                {opt.label}
                              </button>
                            ))}
                            {e.vendorCrowdLevel && (
                              <button
                                onClick={() => setCrowdLevel(e.vendorId, null)}
                                className="w-full text-left text-xs px-3 py-2 rounded-lg text-muted-foreground hover:bg-white/8 transition-colors border-t border-white/8 mt-1 pt-2"
                              >
                                Clear crowd level
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-white/20 text-xs">—</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => togglePopular(e)}
                      title={e.popular && e.popularSince ? `Popular since ${new Date(e.popularSince).toLocaleDateString()}` : "Mark as popular"}
                      className={`text-xs px-2 py-1 rounded inline-flex items-center gap-1 ${e.popular ? "bg-amber-600/30 text-amber-200" : "bg-white/5 text-white/40"}`}
                    >
                      ★ {popularDays(e.popular ? e.popularSince : null)}
                    </button>
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => toggleRetain(e)}
                      title={e.retainForever ? "Click to allow cleanup deletion" : "Click to protect from cleanup deletion"}
                      className={`text-xs px-2 py-1 rounded inline-flex items-center gap-1 ${e.retainForever ? "bg-blue-600/30 text-blue-200" : "bg-white/5 text-white/40"}`}
                    >
                      {e.retainForever ? "🔒 Kept" : "-"}
                    </button>
                  </td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => remove(e.id, e.title)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const SUB_PLAN_LABELS: Record<string, string> = {
  user:            "Member (Legacy)",
  user_plus:       "RoyVento Plus",
  user_vip:        "RoyVento VIP",
  partner:         "Partner Premium (Legacy)",
  partner_growth:  "Growth Plan",
  partner_premium: "Premium Partner Plan",
  partner_royal:   "Royal Partner Plan",
};

const SUB_PLAN_COLORS: Record<string, string> = {
  user_plus:       "bg-blue-500/20 text-blue-300 border-blue-500/30",
  user_vip:        "bg-primary/20 text-primary border-primary/30",
  partner_growth:  "bg-amber-500/20 text-amber-300 border-amber-500/30",
  partner_premium: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  partner_royal:   "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
};

interface AdminSub {
  id: number; userId: number; planType: string; planPeriod: string;
  price: string; status: string; expiresAt: string; userName: string; userEmail: string;
}
function SubscriptionsAdmin() {
  const [items, setItems] = useState<AdminSub[]>([]);
  const { toast } = useToast();
  const load = () => apiGet<AdminSub[]>("/api/admin/subscriptions").then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);

  const active = items.filter((s) => s.status === "active");
  const totalRevenue = active.reduce((sum, s) => sum + Number(s.price), 0);
  const userSubs = active.filter((s) => ["user", "user_plus", "user_vip"].includes(s.planType));
  const partnerSubs = active.filter((s) => ["partner", "partner_growth", "partner_premium", "partner_royal"].includes(s.planType));

  return (
    <div className="space-y-5">
      {/* Revenue stats */}
      <div className="grid sm:grid-cols-4 gap-4">
        {[
          { label: "Total Active", value: active.length, suffix: "subscribers" },
          { label: "Active Revenue", value: formatINR(totalRevenue), suffix: "/period" },
          { label: "User Plans", value: userSubs.length, suffix: "active" },
          { label: "Partner Plans", value: partnerSubs.length, suffix: "active" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl glass-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
            <p className="font-serif text-2xl mt-1">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.suffix}</p>
          </div>
        ))}
      </div>

      {/* Plan breakdown */}
      <div className="grid sm:grid-cols-3 gap-3">
        {(["user_plus", "user_vip", "partner_growth", "partner_premium", "partner_royal"] as const).map((pt) => {
          const count = active.filter((s) => s.planType === pt).length;
          return (
            <div key={pt} className={`rounded-xl border px-4 py-3 ${SUB_PLAN_COLORS[pt] ?? "bg-white/5 border-white/10"}`}>
              <p className="text-xs font-semibold">{SUB_PLAN_LABELS[pt] ?? pt}</p>
              <p className="text-lg font-serif mt-0.5">{count} <span className="text-xs opacity-70">active</span></p>
            </div>
          );
        })}
      </div>

      {/* Subscriber table */}
      <div className="rounded-2xl glass-card overflow-x-auto overflow-y-auto max-h-[55vh]">
        {items.length === 0 ? (
          <p className="p-6 text-muted-foreground">No subscriptions yet.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="sticky top-0 z-10 bg-white/5 backdrop-blur text-xs uppercase tracking-wider text-muted-foreground">
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
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${SUB_PLAN_COLORS[s.planType] ?? "bg-white/10 border-white/20 text-white/70"}`}>
                      {SUB_PLAN_LABELS[s.planType] ?? s.planType}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1.5">{s.planPeriod}</span>
                  </td>
                  <td className="p-3"><Badge variant={s.status === "active" ? "default" : "outline"}>{s.status}</Badge></td>
                  <td className="p-3 text-right tabular-nums">{formatINR(Number(s.price))}</td>
                  <td className="p-3 text-right text-muted-foreground">{new Date(s.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
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
  const formErrors = useFormErrors();
  const load = () => apiGet<AdminCoupon[]>("/api/admin/coupons").then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);

  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    formErrors.reset();
    try {
      await apiPost("/api/admin/coupons", { email, discountPercent: discount });
      toast({ title: "Coupon granted" });
      setEmail("");
      load();
    } catch (e: any) {
      formErrors.setFromError(e);
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={grant} className="rounded-2xl glass-card-strong p-5 grid md:grid-cols-[2fr_1fr_auto] gap-3 items-end">
        <div>
          <Label className="flex items-center gap-1"><Tag className="h-3.5 w-3.5 text-primary" /> Grant coupon to user (email)</Label>
          <Input value={email} onChange={(e) => { setEmail(e.target.value); formErrors.clearField("email"); }} placeholder="user@example.com" required className={fieldClass("bg-black/40 border-white/10 mt-1", formErrors.fieldError("email"))} />
          {formErrors.fieldError("email") && <p className="mt-1 text-xs text-red-400">{formErrors.fieldError("email")}</p>}
        </div>
        <div>
          <Label>Discount %</Label>
          <Input type="number" min={1} max={50} value={discount} onChange={(e) => { setDiscount(Number(e.target.value)); formErrors.clearField("discountPercent"); }} className={fieldClass("bg-black/40 border-white/10 mt-1", formErrors.fieldError("discountPercent"))} />
          {formErrors.fieldError("discountPercent") && <p className="mt-1 text-xs text-red-400">{formErrors.fieldError("discountPercent")}</p>}
        </div>
        <Button className="bg-gradient-to-br from-red-600 to-red-800 border-0">Grant</Button>
      </form>
      {formErrors.topError && <p className="text-sm text-red-400">{formErrors.topError}</p>}

      <div className="rounded-2xl glass-card overflow-x-auto overflow-y-auto max-h-[70vh]">
        {items.length === 0 ? (
          <p className="p-6 text-muted-foreground">No coupons issued.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="sticky top-0 z-10 bg-white/5 backdrop-blur text-xs uppercase tracking-wider text-muted-foreground">
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
                    {c.userName ? (<><span>{c.userName}</span><span className="text-xs text-muted-foreground ml-2">{c.userEmail}</span></>) : <span className="text-muted-foreground">-- public --</span>}
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

function UserTable({ users, refetch }: { users: any[]; refetch: () => void }) {
  const updateRole = useUpdateUserRole();
  const del = useDeleteUser();
  const { toast } = useToast();

  if (users.length === 0) return <p className="text-sm text-muted-foreground">No records found.</p>;

  return (
    <div className="rounded-2xl glass-card overflow-x-auto overflow-y-auto max-h-[60vh]">
      <table className="w-full text-sm min-w-[760px]">
        <thead className="sticky top-0 z-10 bg-white/5 backdrop-blur text-xs uppercase tracking-wider text-muted-foreground">
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
              <td className="p-4 text-muted-foreground">{u.phone ?? "--"}</td>
              <td className="p-4">
                <Select
                  value={u.role}
                  onValueChange={(role) =>
                    updateRole.mutate(
                      { userId: u.id, data: { role: role as any } },
                      {
                        onSuccess: () => { toast({ title: "Role updated" }); refetch(); },
                        onError: (e: unknown) => toast({ title: "Failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
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
                      onError: (e: unknown) => toast({ title: "Failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
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

function UsersPanel() {
  const { data: users = [], refetch } = useListUsers();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const filtered = (users as any[]).filter((u) => {
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    const q = search.trim().toLowerCase();
    const matchSearch = !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.phone?.toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  const partners = filtered.filter((u) => u.role === "vendor");
  const regularUsers = filtered.filter((u) => u.role !== "vendor");

  return (
    <div className="space-y-8">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name, email or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-black/40 border-white/10"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-36 bg-black/40 border-white/10"><SelectValue placeholder="All roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} of {(users as any[]).length} users</span>
      </div>

      <div>
        <h2 className="font-serif text-xl mb-4">Partner Details <span className="text-sm font-sans text-muted-foreground ml-2">({partners.length})</span></h2>
        <UserTable users={partners} refetch={refetch} />
      </div>
      <div>
        <h2 className="font-serif text-xl mb-4">User Details <span className="text-sm font-sans text-muted-foreground ml-2">({regularUsers.length})</span></h2>
        <UserTable users={regularUsers} refetch={refetch} />
      </div>
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

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
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

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
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
          <Textarea rows={8} value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} placeholder="<p>Article body...</p>" className="font-mono text-xs" />
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
            {saving ? "Saving..." : editing != null ? "Update post" : "Create post"}
          </Button>
          {editing != null && (
            <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm({ title: "", slug: "", excerpt: "", content: "", imageUrl: "", authorName: "Royvento Editorial", tags: "", published: true }); }}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
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

// -- Booking Report ------------------------------------------------------------

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
  const [reportSubTab, setReportSubTab] = useState<"all" | "unique">("all");

  type TopUser = { userId: number; name: string; email: string; phone: string; totalTickets: number; bookingCount: number };
  type TopPub = { vendorId: number; businessName: string; city: string; totalTickets: number; bookingCount: number };
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [topPubs, setTopPubs] = useState<TopPub[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [couponUser, setCouponUser] = useState<TopUser | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState<string>("10");
  const [couponType, setCouponType] = useState<string>("general");
  const [couponSending, setCouponSending] = useState(false);
  const { toast } = useToast();
  const couponFormErrors = useFormErrors();

  useEffect(() => {
    let cancelled = false;
    setInsightsLoading(true);
    const qs = new URLSearchParams();
    if (startDate) qs.set("startDate", startDate);
    if (endDate) qs.set("endDate", endDate);
    if (vendorId !== "all") qs.set("partnerId", vendorId);
    const q = qs.toString() ? `?${qs.toString()}` : "";
    Promise.all([
      apiGet<TopUser[]>(`/api/admin/booking-report/top-users${q}`),
      apiGet<TopPub[]>(`/api/admin/booking-report/top-pubs${q}`),
    ]).then(([u, p]) => {
      if (!cancelled) { setTopUsers(u ?? []); setTopPubs(p ?? []); }
    }).catch(() => { if (!cancelled) { setTopUsers([]); setTopPubs([]); } })
      .finally(() => { if (!cancelled) setInsightsLoading(false); });
    return () => { cancelled = true; };
  }, [startDate, endDate, vendorId]);

  async function handleSendCoupon() {
    if (!couponUser) return;
    const code = couponCode.trim().toUpperCase();
    const discount = Number(couponDiscount);
    if (!code || !discount || discount < 1 || discount > 100) {
      toast({ title: "Invalid input", description: "Enter a code and discount between 1-100.", variant: "destructive" });
      return;
    }
    setCouponSending(true);
    couponFormErrors.reset();
    try {
      await apiPost(`/api/admin/users/${couponUser.userId}/send-coupon`, { code, discount, type: couponType });
      toast({ title: "Coupon sent", description: `${code} (${discount}% off) sent to ${couponUser.name}.` });
      setCouponUser(null);
      setCouponCode("");
      setCouponDiscount("10");
      setCouponType("general");
    } catch (err: unknown) {
      couponFormErrors.setFromError(err);
      const msg = err instanceof Error ? err.message : "Failed to send coupon";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setCouponSending(false);
    }
  }

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
      {/* Sub-tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10 w-fit">
        {([
          { id: "all" as const, label: "Ticket Sales" },
          { id: "unique" as const, label: "Unique Customers" },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setReportSubTab(tab.id)}
            className={"flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors " + (reportSubTab === tab.id ? "bg-primary text-white" : "text-white/60 hover:text-white hover:bg-white/5")}
          >
            {tab.id === "unique" && <Users2 className="h-3.5 w-3.5" />}
            {tab.label}
          </button>
        ))}
      </div>

      {reportSubTab === "unique" ? <UniqueCustomerReport /> : <>
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
              placeholder="Search customer name or email..."
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

      {/* Top 3 Users + Top 3 Pubs panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top 3 Users */}
        <div className="rounded-2xl glass-card p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="h-4 w-4 text-yellow-400" />
            <h3 className="text-sm font-semibold">Top 3 Bookers</h3>
            <span className="text-xs text-muted-foreground ml-auto">by tickets booked</span>
          </div>
          {insightsLoading ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Loading...</p>
          ) : topUsers.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No confirmed bookings in range.</p>
          ) : (
            <div className="space-y-2">
              {topUsers.map((u, i) => (
                <div key={u.userId} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <div className="flex items-start gap-3">
                    <span className={`text-sm font-bold mt-0.5 w-5 shrink-0 ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : "text-orange-400"}`}>
                      #{i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        <span><span className="text-foreground font-semibold">{u.totalTickets}</span> tickets</span>
                        <span><span className="text-foreground font-semibold">{u.bookingCount}</span> bookings</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-7 px-2 text-xs border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => { setCouponUser(u); setCouponCode(""); setCouponDiscount("10"); setCouponType("general"); }}
                    >
                      <Gift className="h-3 w-3 mr-1" />
                      Send Coupon
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 3 Pubs */}
        <div className="rounded-2xl glass-card p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Top 3 Pubs / Clubs</h3>
            <span className="text-xs text-muted-foreground ml-auto">by tickets sold</span>
          </div>
          {insightsLoading ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Loading...</p>
          ) : topPubs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No confirmed bookings in range.</p>
          ) : (
            <div className="space-y-2">
              {topPubs.map((p, i) => (
                <div
                  key={p.vendorId}
                  className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 flex items-start gap-3 cursor-pointer hover:border-primary/30 transition-colors"
                  onClick={() => { setVendorId(String(p.vendorId)); setPage(1); }}
                >
                  <span className={`text-sm font-bold mt-0.5 w-5 shrink-0 ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : "text-orange-400"}`}>
                    #{i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.businessName}</p>
                    {p.city && <p className="text-xs text-muted-foreground">{p.city}</p>}
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      <span><span className="text-foreground font-semibold">{p.totalTickets}</span> tickets</span>
                      <span><span className="text-foreground font-semibold">{p.bookingCount}</span> bookings</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Send Coupon Dialog */}
      <Dialog open={!!couponUser} onOpenChange={(open) => { if (!open) setCouponUser(null); }}>
        <DialogContent className="sm:max-w-md bg-[#16151a] border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-primary" />
              Send Coupon
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              {couponUser ? `Sending coupon to ${couponUser.name} (${couponUser.email})` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {couponFormErrors.topError && <p className="text-xs text-red-400">{couponFormErrors.topError}</p>}
            <div className="space-y-1.5">
              <Label className="text-xs">Coupon Code</Label>
              <Input
                placeholder="e.g. SAVE20"
                value={couponCode}
                onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); couponFormErrors.clearField("code"); }}
                className={fieldClass("h-9", couponFormErrors.fieldError("code"))}
              />
              {couponFormErrors.fieldError("code") && <p className="mt-1 text-xs text-red-400">{couponFormErrors.fieldError("code")}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Discount %</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  placeholder="10"
                  value={couponDiscount}
                  onChange={(e) => { setCouponDiscount(e.target.value); couponFormErrors.clearField("discount"); }}
                  className={fieldClass("h-9", couponFormErrors.fieldError("discount"))}
                />
                {couponFormErrors.fieldError("discount") && <p className="mt-1 text-xs text-red-400">{couponFormErrors.fieldError("discount")}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Coupon Type</Label>
                <Select value={couponType} onValueChange={setCouponType}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                    <SelectItem value="loyalty">Loyalty</SelectItem>
                    <SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="ghost" size="sm" disabled={couponSending}>Cancel</Button>
            </DialogClose>
            <Button size="sm" disabled={couponSending} onClick={handleSendCoupon}>
              {couponSending ? "Sending..." : "Send Coupon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Results count + Export */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total > 0 ? `${total} booking${total !== 1 ? "s" : ""} found` : "No bookings found"}</span>
        <div className="flex items-center gap-3">
          {totalPages > 1 && <span>Page {page} of {totalPages}</span>}
          <a
            href={`/api/admin/bookings/report/download?${new URLSearchParams({
              ...(vendorId !== "all" ? { vendorId } : {}),
              ...(status !== "all" ? { status } : {}),
              ...(startDate ? { startDate } : {}),
              ...(endDate ? { endDate } : {}),
            }).toString()}`}
            download
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/5 transition-colors text-white/70 hover:text-white"
          >
            <Download className="h-3.5 w-3.5" />
            Export Excel
          </a>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-2xl glass-card p-10 text-center text-muted-foreground text-sm">Loading...</div>
      ) : bookings.length === 0 ? (
        <div className="rounded-2xl glass-card p-10 text-center text-muted-foreground text-sm">
          No bookings match the selected filters.
        </div>
      ) : (
        <div className="rounded-2xl glass-card overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Partner · Event</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Mobile</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Mode</th>
                  <th className="px-4 py-3 text-right">Tickets</th>
                  <th className="px-4 py-3 text-right">
                    <button
                      className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors"
                      onClick={() => { setSortBy(sortBy === "price" ? "date" : "price"); setPage(1); }}
                    >
                      Ticket
                      {sortBy === "price" ? <SortDesc className="h-3 w-3" /> : <SortAsc className="h-3 w-3" />}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-amber-400/70">Base Fee</th>
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
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">
                      {(b as any).phone || "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {b.bookingDate
                        ? new Date(b.bookingDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                        : "--"}
                      <p className="text-xs">{new Date(b.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs capitalize">{b.pubMode?.replace("_", " ")}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-xs">
                      {(() => {
                        const hasActuals = b.checkedIn && (b.actualWomen != null || b.actualMen != null || b.actualCouple != null || b.actualGuests != null);
                        const w = hasActuals ? (b.actualWomen ?? 0) : b.ticketWomen;
                        const m = hasActuals ? (b.actualMen ?? 0) : b.ticketMen;
                        const c = hasActuals ? (b.actualCouple ?? 0) : b.ticketCouple;
                        const g = hasActuals ? (b.actualGuests ?? b.guests) : b.guests;
                        const hasTiers = w > 0 || m > 0 || c > 0;
                        return <>
                          {w > 0 && <span className={`mr-1 ${hasActuals ? "text-pink-300" : "text-pink-400"}`}>{w}W</span>}
                          {m > 0 && <span className={`mr-1 ${hasActuals ? "text-blue-300" : "text-blue-400"}`}>{m}M</span>}
                          {c > 0 && <span className={hasActuals ? "text-purple-300" : "text-purple-400"}>{c}C</span>}
                          {!hasTiers && <span className="text-muted-foreground">{g}g</span>}
                          {hasActuals && <span className="ml-1 text-green-400 opacity-70">✓</span>}
                        </>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {(() => {
                        const isCOD = b.paymentMethod === "COD";
                        const collected = isCOD && b.checkedIn;
                        const displayAmt = collected ? b.effectiveRevenue ?? b.finalPrice : b.finalPrice;
                        return <>
                          <span className="font-medium text-primary">{formatINR(displayAmt)}</span>
                          {isCOD && !b.checkedIn && b.finalPrice > 0 && (
                            <p className="text-xs text-muted-foreground">est.</p>
                          )}
                          {!isCOD && b.discountAmount > 0 && (
                            <p className="text-xs text-muted-foreground line-through">{formatINR(b.totalPrice)}</p>
                          )}
                        </>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {(b.baseFee ?? 0) > 0
                        ? <span className="text-amber-400/80 text-xs tabular-nums">+{formatINR(b.baseFee ?? 0)}</span>
                        : <span className="text-muted-foreground text-xs">—</span>}
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
                        <span className="text-xs text-muted-foreground">--</span>
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
                â† Previous
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
                Next â†’
              </Button>
            </div>
          )}
        </div>
      )}
      </>}
    </div>
  );
}

// ─── Unique Customer Report ───────────────────────────────────────────────────

interface UniqueCustomer {
  userId: number;
  name: string;
  email: string;
  phone: string;
  bookingCount: number;
}

interface UCRSummary {
  totalCustomers: number;
  totalBookings: number;
  returningCustomers: number;
  newCustomers: number;
}

function UniqueCustomerReport() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"name" | "email" | "bookings">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [customers, setCustomers] = useState<UniqueCustomer[]>([]);
  const [summary, setSummary] = useState<UCRSummary>({ totalCustomers: 0, totalBookings: 0, returningCustomers: 0, newCustomers: 0 });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), sortBy, sortDir });
    if (debouncedSearch) qs.set("search", debouncedSearch);
    apiGet<{ customers: UniqueCustomer[]; total: number; totalPages: number; summary: UCRSummary }>(
      `/api/admin/bookings/unique-customers?${qs}`,
    ).then((r) => {
      if (!cancelled) {
        setCustomers(r.customers);
        setTotal(r.total);
        setTotalPages(r.totalPages);
        setSummary(r.summary);
      }
    }).catch(() => {
      if (!cancelled) toast({ title: "Failed to load customers", variant: "destructive" });
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedSearch, page, sortBy, sortDir, toast]);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const qs = new URLSearchParams();
      if (debouncedSearch) qs.set("search", debouncedSearch);
      const url = `/api/admin/bookings/unique-customers/download${qs.toString() ? `?${qs}` : ""}`;
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) throw new Error("Download failed");
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `unique-customers-${_istFmt.format(new Date())}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) => {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 text-white/30" />;
    return sortDir === "asc"
      ? <ChevronRight className="h-3 w-3 rotate-90 text-primary" />
      : <ChevronRight className="h-3 w-3 -rotate-90 text-primary" />;
  };

  const summaryCards = [
    { label: "Total Unique Customers", value: summary.totalCustomers, icon: Users2, color: "text-sky-300" },
    { label: "Total Bookings", value: summary.totalBookings, icon: CalendarCheck, color: "text-emerald-300" },
    { label: "Returning Customers", value: summary.returningCustomers, icon: UserCheck, color: "text-violet-300" },
    { label: "New Customers", value: summary.newCustomers, icon: UserPlus, color: "text-amber-300" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users2 className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Unique Customer Report</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            All unique customers across all pubs — deduplicated by account.
          </p>
        </div>
        <Button
          onClick={handleDownload}
          disabled={downloading || total === 0}
          className="gap-2 shrink-0"
          size="sm"
        >
          {downloading
            ? <RefreshCw className="h-4 w-4 animate-spin" />
            : <Download className="h-4 w-4" />}
          Download Excel Report
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((c) => (
          <div key={c.label} className="rounded-2xl glass-card p-4 flex items-center gap-3">
            <div className={"w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0 " + c.color}>
              <c.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{c.label}</p>
              <p className={"text-2xl font-bold tabular-nums " + c.color}>{c.value.toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="rounded-2xl glass-card p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name, email, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                <th className="text-left px-4 py-3 font-medium text-white/60 w-8">#</th>
                <th className="text-left px-4 py-3">
                  <button onClick={() => toggleSort("name")} className="flex items-center gap-1.5 hover:text-white transition-colors">
                    Customer Name <SortIcon col="name" />
                  </button>
                </th>
                <th className="text-left px-4 py-3">
                  <button onClick={() => toggleSort("email")} className="flex items-center gap-1.5 hover:text-white transition-colors">
                    Email Address <SortIcon col="email" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Phone Number</th>
                <th className="text-right px-4 py-3">
                  <button onClick={() => toggleSort("bookings")} className="flex items-center gap-1.5 hover:text-white transition-colors ml-auto">
                    Bookings <SortIcon col="bookings" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Loading…
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    <Users2 className="h-7 w-7 mx-auto mb-2 text-white/20" />
                    {debouncedSearch ? "No customers match your search." : "No customer data yet."}
                  </td>
                </tr>
              ) : (
                customers.map((c, i) => (
                  <tr key={c.userId} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3 text-white/30 text-xs tabular-nums">{(page - 1) * 25 + i + 1}</td>
                    <td className="px-4 py-3 font-medium">{c.name || <span className="text-white/30 italic">—</span>}</td>
                    <td className="px-4 py-3 text-white/70">{c.email || <span className="text-white/30 italic">—</span>}</td>
                    <td className="px-4 py-3 text-white/70 hidden sm:table-cell">{c.phone || <span className="text-white/30 italic">—</span>}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={"text-xs font-semibold px-2 py-0.5 rounded-full " + (c.bookingCount > 1 ? "bg-violet-500/15 text-violet-300" : "bg-white/[0.06] text-white/50")}>
                        {c.bookingCount}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-white/8 flex items-center justify-between text-xs text-white/50">
            <span>{total.toLocaleString()} total · page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="text-xs h-7">Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="text-xs h-7">Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// -- Attendance Report ---------------------------------------------------------

type AttendanceSortKey = "id" | "userName" | "vendorName" | "bookingDate" | "guests" | "checkedIn";

function AttendanceReport() {
  const [vendorId, setVendorId] = useState<string>("all");
  const [date, setDate] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "checkedIn" | "notArrived">("all");
  const [page, setPage] = useState<number>(1);
  const [sortKey, setSortKey] = useState<AttendanceSortKey>("bookingDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: allVendors } = useListVendors({ limit: 500 } as Parameters<typeof useListVendors>[0]);
  const vendors = allVendors ?? [];

  const today = _istFmt.format(new Date());

  const params = {
    ...(vendorId !== "all" ? { vendorId: Number(vendorId) } : {}),
    ...(date ? { date } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    page,
  } as Parameters<typeof useGetAdminCheckinReport>[0];

  const { data: report, isLoading } = useGetAdminCheckinReport(params);

  const rawRows = report?.rows ?? [];
  const stats = report?.stats ?? { total: 0, checkedIn: 0, notArrived: 0 };
  const totalPages = report?.totalPages ?? 0;
  const attendanceRate = stats.total > 0 ? Math.round((stats.checkedIn / stats.total) * 100) : 0;

  const rows = [...rawRows].sort((a, b) => {
    let av: string | number = a[sortKey] as string | number ?? "";
    let bv: string | number = b[sortKey] as string | number ?? "";
    if (typeof av === "boolean") av = av ? 1 : 0;
    if (typeof bv === "boolean") bv = bv ? 1 : 0;
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const handleSort = (key: AttendanceSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ k }: { k: AttendanceSortKey }) =>
    sortKey === k ? <span className="ml-1">{sortDir === "asc" ? "\u2191" : "\u2193"}</span> : <span className="ml-1 opacity-20">{"\u2195"}</span>;

  const resetFilters = () => { setVendorId("all"); setDate(""); setStatusFilter("all"); setPage(1); };
  const hasFilters = vendorId !== "all" || date || statusFilter !== "all";

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="rounded-2xl glass-card p-4 flex flex-wrap items-end gap-4">
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Partner</Label>
          <Select value={vendorId} onValueChange={(v) => { setVendorId(v); setPage(1); }}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All partners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All partners</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={String(v.id)}>{v.businessName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Booking date</Label>
          <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} className="w-44" max={today} />
        </div>
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
          <div className="flex gap-1">
            {(["all", "checkedIn", "notArrived"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className="text-xs capitalize"
              >
                {s === "all" ? "All" : s === "checkedIn" ? "Checked In" : "Not Arrived"}
              </Button>
            ))}
          </div>
        </div>
        {hasFilters && (
          <Button variant="outline" size="sm" onClick={resetFilters}>Clear</Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl glass-card p-5 lift-3d">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Expected</span>
            <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <CalendarCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="stat-number text-3xl">{stats.total.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl glass-card p-5 lift-3d">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Checked in</span>
            <div className="w-9 h-9 rounded-lg bg-green-600/15 text-green-400 flex items-center justify-center">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="stat-number text-3xl text-green-300">{stats.checkedIn.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl glass-card p-5 lift-3d">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Not arrived</span>
            <div className="w-9 h-9 rounded-lg bg-red-600/15 text-red-400 flex items-center justify-center">
              <UserX className="h-4 w-4" />
            </div>
          </div>
          <p className="stat-number text-3xl text-red-300">{stats.notArrived.toLocaleString()}</p>
        </div>
        <div className={`rounded-2xl glass-card p-5 lift-3d ${attendanceRate >= 70 ? "border-green-500/20" : attendanceRate >= 40 ? "border-amber-500/20" : ""}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Attendance rate</span>
            <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className={`stat-number text-3xl ${attendanceRate >= 70 ? "text-green-300" : attendanceRate >= 40 ? "text-amber-300" : "text-red-300"}`}>
            {attendanceRate}%
          </p>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl glass-card p-10 text-center">
          <CheckCircle className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-30" />
          <p className="font-serif text-2xl mb-2">No records found</p>
          <p className="text-muted-foreground text-sm">Try adjusting the filters to see attendance data.</p>
        </div>
      ) : (
        <div className="rounded-2xl glass-card p-6">
          <h3 className="font-serif text-xl mb-4">
            {statusFilter === "checkedIn" ? "Checked-in guests" : statusFilter === "notArrived" ? "Not-arrived guests" : "All confirmed guests"}
          </h3>

          {/* Booked vs attended totals -- one row per event on the current page. */}
          {(() => {
            const byEvent = new Map<number, {
              eventId: number;
              eventTitle: string;
              vendorName: string;
              bookedW: number; bookedM: number; bookedC: number; bookedG: number;
              attW: number; attM: number; attC: number; attG: number;
              codDue: number;
              hasActuals: boolean;
            }>();
            for (const r of rows) {
              const cur = byEvent.get(r.eventId) ?? {
                eventId: r.eventId, eventTitle: r.eventTitle, vendorName: r.vendorName,
                bookedW: 0, bookedM: 0, bookedC: 0, bookedG: 0,
                attW: 0, attM: 0, attC: 0, attG: 0,
                codDue: 0, hasActuals: false,
              };
              cur.bookedW += r.ticketWomen ?? 0;
              cur.bookedM += r.ticketMen ?? 0;
              cur.bookedC += r.ticketCouple ?? 0;
              cur.bookedG += r.guests ?? 0;
              if (r.actualWomen != null) { cur.attW += r.actualWomen; cur.hasActuals = true; }
              if (r.actualMen != null) { cur.attM += r.actualMen; cur.hasActuals = true; }
              if (r.actualCouple != null) { cur.attC += r.actualCouple; cur.hasActuals = true; }
              if (r.actualGuests != null) { cur.attG += r.actualGuests; cur.hasActuals = true; }
              if (r.paymentMethod === "cod" && typeof r.actualAmountDue === "number") cur.codDue += r.actualAmountDue;
              byEvent.set(r.eventId, cur);
            }
            const totals = Array.from(byEvent.values());
            if (totals.length === 0) return null;
            return (
              <div className="mb-5 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
                <table className="w-full text-xs min-w-[700px]">
                  <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-white/5">
                    <tr>
                      <th className="text-left py-2 px-3">Event</th>
                      <th className="text-right py-2 px-3">Booked (W/M/C/Guests)</th>
                      <th className="text-right py-2 px-3">Attended (W/M/C/Guests)</th>
                      <th className="text-right py-2 px-3">Pay at Venue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totals.map((t) => (
                      <tr key={t.eventId} className="border-t border-white/5">
                        <td className="py-2 px-3">
                          <span className="font-medium">{t.eventTitle || `Event #${t.eventId}`}</span>
                          <span className="block text-[10px] text-muted-foreground">{t.vendorName}</span>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                          {t.bookedW}/{t.bookedM}/{t.bookedC}/{t.bookedG}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {t.hasActuals
                            ? <span className="text-foreground">{t.attW}/{t.attM}/{t.attC}/{t.attG}</span>
                            : <span className="text-muted-foreground/50">--</span>}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {t.codDue > 0
                            ? <span className="text-amber-300 font-semibold">₹{t.codDue.toLocaleString("en-IN")}</span>
                            : <span className="text-muted-foreground/50">--</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="sticky top-0 z-10 text-xs uppercase tracking-wider text-muted-foreground border-b border-white/10 bg-black/90 backdrop-blur">
                <tr>
                  <th className="text-left py-2 pr-3 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("id")}>ID<SortIcon k="id" /></th>
                  <th className="text-left py-2 pr-3 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("userName")}>Guest<SortIcon k="userName" /></th>
                  <th className="text-left py-2 pr-3">Email</th>
                  <th className="text-left py-2 pr-3">Phone</th>
                  <th className="text-left py-2 pr-3 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("vendorName")}>Partner<SortIcon k="vendorName" /></th>
                  <th className="text-left py-2 pr-3">Event</th>
                  <th className="text-left py-2 pr-3 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("bookingDate")}>Booking date<SortIcon k="bookingDate" /></th>
                  <th className="text-right py-2 pr-3 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("guests")}>Party<SortIcon k="guests" /></th>
                  <th className="text-right py-2 pr-3">Actual Entry</th>
                  <th className="text-right py-2 pr-3">Pay at Venue</th>
                  <th className="text-left py-2 pr-3 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("checkedIn")}>Status<SortIcon k="checkedIn" /></th>
                  <th className="text-left py-2">Check-in time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-2.5 pr-3 text-muted-foreground tabular-nums">#{b.id}</td>
                    <td className="py-2.5 pr-3 font-medium">{b.userName || "--"}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground text-xs">{b.userEmail || "--"}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground text-xs">{b.phone || "--"}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{b.vendorName || "--"}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground max-w-[140px] truncate">{b.eventTitle || "--"}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">{b.bookingDate}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                      {b.guests || (b.ticketWomen + b.ticketMen + b.ticketCouple) || "--"}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-xs">
                      {(() => {
                        const aw = b.actualWomen, am = b.actualMen, ac = b.actualCouple, ag = b.actualGuests;
                        const has = aw != null || am != null || ac != null || ag != null;
                        if (!has) return <span className="text-muted-foreground/60">--</span>;
                        if (b.pubMode === "ticket") {
                          return (
                            <>
                              {(aw ?? 0) > 0 && <span className="text-pink-300 mr-1">{aw}W</span>}
                              {(am ?? 0) > 0 && <span className="text-blue-300 mr-1">{am}M</span>}
                              {(ac ?? 0) > 0 && <span className="text-purple-300">{ac}C</span>}
                              {(aw ?? 0) === 0 && (am ?? 0) === 0 && (ac ?? 0) === 0 && <span className="text-muted-foreground">0</span>}
                            </>
                          );
                        }
                        return <span className="text-foreground">{ag}</span>;
                      })()}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-xs">
                      {b.paymentMethod !== "cod"
                        ? <span className="text-muted-foreground/40">--</span>
                        : b.actualAmountDue == null
                          ? <span className="text-muted-foreground/60">--</span>
                          : <span className="text-amber-300 font-semibold">₹{b.actualAmountDue.toLocaleString("en-IN")}</span>}
                    </td>
                    <td className="py-2.5 pr-3">
                      {b.checkedIn ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Checked In</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">Not Arrived</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      {b.checkedIn && b.checkedInAt ? (
                        <span className="text-xs font-medium text-green-400">
                          {new Date(b.checkedInAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>â† Prev</Button>
              <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next â†’</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// -- CRM & Leads --------------------------------------------------------------

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
        <p className="text-muted-foreground">Loading summary...</p>
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
            <p className="text-xs text-muted-foreground mt-1">{summary.conversions} views â†’ bookings</p>
          </div>
        </div>
      )}

      {/* Partner leaderboard */}
      {!summaryLoading && vendors.length > 0 && (
        <div className="rounded-2xl glass-card p-6">
          <h3 className="font-serif text-xl mb-1">Per-partner breakdown</h3>
          <p className="text-xs text-muted-foreground mb-4">Click a row to filter the leads table to that partner.</p>
          <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="sticky top-0 z-10 text-xs uppercase tracking-wider text-muted-foreground border-b border-white/10 bg-black/90 backdrop-blur">
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
                    <td className="py-3 pr-4 text-muted-foreground">{v.vendorCity || "--"}</td>
                    <td className="text-right px-2 tabular-nums">{v.totalViews}</td>
                    <td className="text-right px-2 tabular-nums text-blue-300">{v.knownLeads || "--"}</td>
                    <td className="text-right px-2 tabular-nums text-muted-foreground">{v.anonymousVisitors || "--"}</td>
                    <td className="text-right px-2 tabular-nums text-green-300">{v.conversions || "--"}</td>
                    <td className="text-right pl-2 tabular-nums font-medium text-green-400">
                      {v.totalViews > 0 ? `${v.conversionRate}%` : "--"}
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
          <p className="text-muted-foreground p-6">Loading leads...</p>
        ) : leads.length === 0 ? (
          <div className="p-10 text-center">
            <Eye className="h-8 w-8 text-primary mx-auto mb-3" />
            <p className="text-muted-foreground">No profile views found for this period.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
              <table className="w-full text-sm min-w-[820px]">
                <thead className="sticky top-0 z-10 text-xs uppercase tracking-wider text-muted-foreground border-b border-white/10 bg-black/90 backdrop-blur">
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
                              <p className="font-medium">{lead.viewerName || "--"}</p>
                              {lead.viewerEmail && (
                                <p className="text-xs text-muted-foreground">{lead.viewerEmail}</p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-medium">{lead.vendorName}</td>
                        <td className="py-3 px-3 text-muted-foreground">{lead.vendorCity || "--"}</td>
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
                              href={pubDetailSlug({ id: lead.vendorId, name: lead.vendorName, city: lead.vendorCity })}
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
                  â† Previous
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
                  Next â†’
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

type GooglePubPreview = {
  vendor: { id: number; businessName: string; userEmail: string };
  place: {
    placeId: string;
    name: string;
    formattedAddress: string;
    city: string;
    state: string;
    country: string;
    phone: string;
    website: string;
    openingHours: Record<string, { open: string; close: string } | null> | null;
    hasPhoto: boolean;
    photoPreviewUrl: string | null;
  };
};

type ImportStep = "form" | "previewing" | "preview" | "importing" | "success";

function ImportPubFromGoogle() {
  const { toast } = useToast();
  const [step, setStep] = useState<ImportStep>("form");
  const [googleUrl, setGoogleUrl] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [pubMode, setPubMode] = useState("both");
  const [category, setCategory] = useState("bar");
  const [preview, setPreview] = useState<GooglePubPreview | null>(null);
  const [result, setResult] = useState<ImportGooglePubResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep("previewing");
    try {
      const data = await apiPost<GooglePubPreview>("/api/admin/pubs/preview-google", {
        googleUrl,
        partnerEmail,
      });
      setPreview(data);
      setStep("preview");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Preview failed. Check the URL and partner email.";
      setError(msg);
      setStep("form");
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setError(null);
    setStep("importing");
    try {
      const data = await importGooglePub({
        googleUrl,
        partnerEmail,
        pubMode,
        category,
        placeId: preview.place.placeId,
      });
      setResult(data);
      setStep("success");
      toast({ title: "Pub imported", description: `"${data.event.title}" has been created and approved.` });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Import failed. Please try again.";
      setError(msg);
      setStep("preview");
    }
  }

  function handleReset() {
    setStep("form");
    setPreview(null);
    setResult(null);
    setError(null);
    setGoogleUrl("");
    setPartnerEmail("");
    setPubMode("entry");
    setCategory("bar");
  }

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="font-serif text-2xl tracking-tight mb-1">Import Pub from Google</h2>
        <p className="text-sm text-muted-foreground">
          Paste a Google Maps or Google Business Profile URL to automatically create a pub listing for an approved partner.
        </p>
      </div>

      {step === "success" && result ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-5 space-y-4">
            <div className="flex items-start gap-4">
              {result.event.imageUrl && (
                <img
                  src={result.event.imageUrl.startsWith("/objects/")
                    ? `/api/storage${result.event.imageUrl}`
                    : result.event.imageUrl}
                  alt={result.event.title}
                  className="w-20 h-20 rounded-lg object-cover shrink-0"
                />
              )}
              <div className="min-w-0">
                <p className="text-xs text-green-400 font-medium uppercase tracking-widest mb-1">Imported successfully</p>
                <h3 className="font-semibold text-lg leading-tight">{result.event.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{result.place.formattedAddress}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {[result.place.city, result.place.state, result.place.country].filter(Boolean).join(", ")}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {result.place.phone && (
                <><span className="text-muted-foreground">Phone</span><span>{result.place.phone}</span></>
              )}
              {result.place.website && (
                <>
                  <span className="text-muted-foreground">Website</span>
                  <a href={result.place.website} target="_blank" rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline truncate">
                    {result.place.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                </>
              )}
              <span className="text-muted-foreground">Event ID</span>
              <span className="font-mono text-xs">{result.event.id}</span>
              <span className="text-muted-foreground">Status</span>
              <span className="text-green-400 capitalize">{result.event.approvalStatus}</span>
            </div>
            {result.place.openingHours && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Opening Hours</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
                  {DAYS.map((day) => {
                    const h = result.place.openingHours?.[day];
                    return (
                      <div key={day} className="flex gap-2">
                        <span className="text-muted-foreground w-8 shrink-0">{day}</span>
                        <span>{h ? `${h.open} - ${h.close}` : "Closed"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleReset} className="flex-1">Import another pub</Button>
            <Button variant="secondary" asChild className="flex-1">
              <Link href={`/admin?tab=events`}>View in Events tab</Link>
            </Button>
          </div>
        </div>

      ) : step === "preview" || step === "importing" ? (
        <div className="space-y-4">
          <div className="rounded-xl border p-5 space-y-4">
            <div className="flex items-start gap-4">
              {preview?.place.photoPreviewUrl && (
                <img
                  src={preview.place.photoPreviewUrl}
                  alt={preview.place.name}
                  className="w-20 h-20 rounded-lg object-cover shrink-0 border"
                />
              )}
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Place found</p>
                <h3 className="font-semibold text-lg leading-tight">{preview?.place.name}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{preview?.place.formattedAddress}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {[preview?.place.city, preview?.place.state, preview?.place.country].filter(Boolean).join(", ")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {preview?.place.phone && (
                <><span className="text-muted-foreground">Phone</span><span>{preview.place.phone}</span></>
              )}
              {preview?.place.website && (
                <>
                  <span className="text-muted-foreground">Website</span>
                  <a href={preview.place.website} target="_blank" rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline truncate">
                    {preview.place.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                </>
              )}
              {!preview?.place.photoPreviewUrl && (
                <>
                  <span className="text-muted-foreground">Cover photo</span>
                  <span className="text-muted-foreground text-xs">Not available</span>
                </>
              )}
              <span className="text-muted-foreground">Partner</span>
              <span>{preview?.vendor.businessName} <span className="text-muted-foreground text-xs">({preview?.vendor.userEmail})</span></span>
            </div>

            {preview?.place.openingHours && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Opening Hours</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
                  {DAYS.map((day) => {
                    const h = preview.place.openingHours?.[day];
                    return (
                      <div key={day} className="flex gap-2">
                        <span className="text-muted-foreground w-8 shrink-0">{day}</span>
                        <span>{h ? `${h.open} - ${h.close}` : "Closed"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pubModeConfirm">Pub mode</Label>
              <Select value={pubMode} onValueChange={setPubMode} disabled={step === "importing"}>
                <SelectTrigger id="pubModeConfirm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ticket">Tickets only</SelectItem>
                  <SelectItem value="event">Events only</SelectItem>
                  <SelectItem value="both">Tickets &amp; Events</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="categoryConfirm">Category</Label>
              <Select value={category} onValueChange={setCategory} disabled={step === "importing"}>
                <SelectTrigger id="categoryConfirm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">Bar</SelectItem>
                  <SelectItem value="club">Club</SelectItem>
                  <SelectItem value="lounge">Lounge</SelectItem>
                  <SelectItem value="pub">Pub</SelectItem>
                  <SelectItem value="rooftop">Rooftop</SelectItem>
                  <SelectItem value="restaurant">Restaurant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setStep("form"); setError(null); }}
              disabled={step === "importing"} className="flex-1">
              Back
            </Button>
            <Button onClick={handleConfirm} disabled={step === "importing"} className="flex-1">
              {step === "importing" ? "Importing..." : "Confirm & Import"}
            </Button>
          </div>
        </div>

      ) : (
        <form onSubmit={handlePreview} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="googleUrl">Google Maps / Business Profile URL</Label>
            <Input
              id="googleUrl"
              placeholder="https://www.google.com/maps/place/..."
              value={googleUrl}
              onChange={(e) => setGoogleUrl(e.target.value)}
              disabled={step === "previewing"}
              required
            />
            <p className="text-xs text-muted-foreground">
              Paste the full Google Maps URL or a short maps.app.goo.gl link.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="partnerEmail">Partner email</Label>
            <Input
              id="partnerEmail"
              type="email"
              placeholder="partner@example.com"
              value={partnerEmail}
              onChange={(e) => setPartnerEmail(e.target.value)}
              disabled={step === "previewing"}
              required
            />
            <p className="text-xs text-muted-foreground">
              The email of an approved partner account. The pub will be created under their profile.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={step === "previewing" || !googleUrl.trim() || !partnerEmail.trim()}
            className="w-full"
          >
            {step === "previewing" ? "Fetching from Google..." : "Preview pub details"}
          </Button>
        </form>
      )}
    </div>
  );
}

interface AdminAnnouncement {
  id: number;
  title: string;
  body: string;
  announceDate: string;
  announceTime: string;
  imageUrl: string;
  isFeaturedSlider: boolean;
  vendorId: number;
  vendorName: string;
  createdAt: string;
}

function AnnouncementSliderAdmin() {
  const [items, setItems] = useState<AdminAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    apiGet<AdminAnnouncement[]>("/api/admin/announcements")
      .then(setItems)
      .catch(() => toast({ title: "Failed to load announcements", variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggle = async (item: AdminAnnouncement) => {
    setToggling(item.id);
    try {
      const updated = await apiPatch<AdminAnnouncement>(
        `/api/admin/announcements/${item.id}/slider`,
        { isFeaturedSlider: !item.isFeaturedSlider },
      );
      setItems((prev) => prev.map((a) => (a.id === item.id ? { ...a, isFeaturedSlider: updated.isFeaturedSlider } : a)));
      toast({
        title: updated.isFeaturedSlider ? "Added to slider" : "Removed from slider",
      });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    } finally {
      setToggling(null);
    }
  };

  const featured = items.filter((a) => a.isFeaturedSlider);
  const rest = items.filter((a) => !a.isFeaturedSlider);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl glass-card p-6">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-amber-400/15 flex items-center justify-center shrink-0">
            <Megaphone className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h2 className="font-serif text-2xl">Announcement Slider</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Toggle which announcements appear in the hero image slider on the Events page.
              When none are selected, the slider falls back to the most recent announcements automatically.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No announcements found.</p>
        ) : (
          <div className="space-y-8">
            {featured.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-amber-400 font-semibold mb-3 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                  Featured in slider ({featured.length})
                </p>
                <div className="space-y-2">
                  {featured.map((a) => (
                    <AnnouncementSliderRow key={a.id} item={a} toggling={toggling} onToggle={toggle} />
                  ))}
                </div>
              </div>
            )}
            {rest.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-white/20" />
                  Not in slider ({rest.length})
                </p>
                <div className="space-y-2">
                  {rest.map((a) => (
                    <AnnouncementSliderRow key={a.id} item={a} toggling={toggling} onToggle={toggle} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Drink Plan Priority -----------------------------------------------------

interface DrinkPlanRow {
  id: number;
  vendorId: number;
  vendorName: string | null;
  type: string;
  productName: string | null;
  price: number | null;
  gender: string | null;
  globalPriority: number | null;
}

function DrinkPlanPriorityAdmin() {
  const [plans, setPlans] = useState<DrinkPlanRow[]>([]);
  const [featured, setFeatured] = useState<DrinkPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    try {
      const data = await apiGet<DrinkPlanRow[]>("/api/admin/drink-plans");
      setPlans(data);
      const prioritized = [...data]
        .filter((p) => p.globalPriority !== null)
        .sort((a, b) => (a.globalPriority ?? 999) - (b.globalPriority ?? 999));
      setFeatured(prioritized);
    } catch {
      toast({ title: "Failed to load drink plans", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const featuredIds = new Set(featured.map((p) => p.id));
  const available = plans.filter((p) => !featuredIds.has(p.id));

  function moveUp(idx: number) {
    if (idx === 0) return;
    setFeatured((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
    setDirty(true);
  }

  function moveDown(idx: number) {
    setFeatured((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
    setDirty(true);
  }

  function addPlan(plan: DrinkPlanRow) {
    if (featured.length >= 10) {
      toast({ title: "Maximum 10 plans can be featured", variant: "destructive" });
      return;
    }
    setFeatured((prev) => [...prev, plan]);
    setDirty(true);
  }

  function removePlan(id: number) {
    setFeatured((prev) => prev.filter((p) => p.id !== id));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await apiPost("/api/admin/drink-plans/priorities", { orderedIds: featured.map((p) => p.id) });
      toast({ title: "Priority order saved" });
      setDirty(false);
      await load();
    } catch {
      toast({ title: "Failed to save priorities", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const planLabel = (p: DrinkPlanRow) =>
    [p.productName || p.type, p.vendorName || "Unknown pub",
     p.gender && p.gender !== "all" ? `(${p.gender})` : null,
     p.price ? `₹${p.price}` : null]
      .filter(Boolean).join(" — ");

  return (
    <div className="space-y-6 p-6 border-t mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Drinks Plan Priority
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Select up to 10 drinks plans to feature first on the Pub Offer Page. Use arrows to reorder.
          </p>
        </div>
        <Button onClick={save} disabled={!dirty || saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? "Saving…" : "Save Order"}
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm">Featured ({featured.length}/10)</h3>
            </div>
            {featured.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded">
                Add plans from the right panel
              </div>
            ) : (
              featured.map((p, idx) => (
                <div key={p.id} className="flex items-center gap-2 bg-muted/50 rounded px-3 py-2">
                  <span className="text-xs font-mono w-5 text-center text-muted-foreground">{idx + 1}</span>
                  <span className="flex-1 text-sm truncate">{planLabel(p)}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => moveUp(idx)} disabled={idx === 0}
                      className="p-1 rounded hover:bg-background disabled:opacity-30">
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button onClick={() => moveDown(idx)} disabled={idx === featured.length - 1}
                      className="p-1 rounded hover:bg-background disabled:opacity-30">
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <button onClick={() => removePlan(p.id)}
                      className="p-1 rounded hover:bg-background text-destructive ml-1">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border rounded-lg p-4 space-y-2">
            <h3 className="font-medium text-sm mb-3">Available Plans ({available.length})</h3>
            {available.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">All plans are featured</div>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {available.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded px-3 py-2 hover:bg-muted/50">
                    <span className="flex-1 text-sm truncate">{planLabel(p)}</span>
                    <button onClick={() => addPlan(p)} disabled={featured.length >= 10}
                      className="text-xs text-primary font-medium hover:underline disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Commissions -------------------------------------------------------------

interface CommissionRates {
  freeEntryRate: string;
  ticketRate: string;
  tableBookingRate: string;
  eventRate: string;
  eventCommissionEnabled: boolean;
  baseFeePercent: string;
}

interface CommissionBookingLine {
  id: number;
  finalPrice: number;
  effectiveRevenue: number;
  bookingType: "free_entry" | "ticket" | "table" | "event_booking";
  commissionRate: number;
  unitCount: number;
  commissionAmount: number;
  collected: boolean;
  createdAt: string;
}

interface CommissionVendorRow {
  vendorId: number;
  businessName: string;
  city: string;
  appliedRates: CommissionRates;
  baseFeePercent: string;
  baseFeeEnabled: boolean;
  totalBookings: number;
  totalRevenue: number;
  totalCommission: number;
  totalBaseFee: number;
  freeEntryCount: number;
  freeEntryRevenue: number;
  freeEntryCommission: number;
  freeEntryPeople: number;
  freeEntryBaseFee: number;
  ticketCount: number;
  ticketRevenue: number;
  ticketCommission: number;
  ticketPeople: number;
  ticketBaseFee: number;
  tableCount: number;
  tableRevenue: number;
  tableCommission: number;
  tablePeople: number;
  tableBaseFee: number;
  eventBookingCount: number;
  eventBookingRevenue: number;
  eventBookingCommission: number;
  eventBookingPeople: number;
  eventBookingBaseFee: number;
  bookings: CommissionBookingLine[];
}

interface CommissionReport {
  rows: CommissionVendorRow[];
  totals: { totalBookings: number; totalRevenue: number; totalCommission: number; totalBaseFee: number; collectedCommission: number; pendingCommission: number };
}

function CommissionsAdmin() {
  const { toast } = useToast();

  // Partner plan visibility state
  const [planConfig, setPlanConfig] = useState({ showGrowthPlan: true, showPremiumPartner: true, showRoyalPlan: true });
  const [planConfigSaving, setPlanConfigSaving] = useState(false);

  useEffect(() => {
    apiGet<{ showGrowthPlan: boolean; showPremiumPartner: boolean; showRoyalPlan: boolean }>("/api/plan-config")
      .then(setPlanConfig)
      .catch(() => {});
  }, []);

  const togglePlanVisibility = async (key: "showGrowthPlan" | "showPremiumPartner" | "showRoyalPlan") => {
    const next = { ...planConfig, [key]: !planConfig[key] };
    setPlanConfigSaving(true);
    try {
      await apiPost("/api/admin/plan-config", next);
      setPlanConfig(next);
      toast({ title: "Plan visibility updated" });
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally {
      setPlanConfigSaving(false);
    }
  };

  // Rate editor state
  const [ratesReport, setRatesReport] = useState<CommissionReport | null>(null);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [rateEdits, setRateEdits] = useState<Record<number, CommissionRates>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  // Commission report state
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [report, setReport] = useState<CommissionReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportLastUpdated, setReportLastUpdated] = useState<Date | null>(null);
  const [expandedVendors, setExpandedVendors] = useState<Set<number>>(new Set());

  const loadRates = async () => {
    setRatesLoading(true);
    try {
      const data = await apiGet<CommissionReport>("/api/admin/commission-report");
      setRatesReport(data);
      const edits: Record<number, CommissionRates> = {};
      for (const row of data.rows) {
        edits[row.vendorId] = { ...row.appliedRates, baseFeePercent: row.baseFeePercent ?? "3.50" };
      }
      setRateEdits(edits);
    } catch (e: any) {
      toast({ title: "Failed to load commission data", description: e?.message, variant: "destructive" });
    } finally {
      setRatesLoading(false);
    }
  };

  const loadReport = async () => {
    setReportLoading(true);
    try {
      const qs = new URLSearchParams();
      if (reportFrom) qs.set("from", reportFrom);
      if (reportTo) qs.set("to", reportTo);
      const data = await apiGet<CommissionReport>(`/api/admin/commission-report${qs.toString() ? `?${qs}` : ""}`);
      setReport(data);
      setReportLastUpdated(new Date());
    } catch (e: any) {
      toast({ title: "Failed to load report", description: e?.message, variant: "destructive" });
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => { loadRates(); }, []);

  useEffect(() => { loadReport(); }, [reportFrom, reportTo]);

  const saveRates = async (vendorId: number) => {
    const rates = rateEdits[vendorId];
    if (!rates) return;
    const free = Number(rates.freeEntryRate);
    const ticket = Number(rates.ticketRate);
    const table = Number(rates.tableBookingRate);
    const evtRate = Number(rates.eventRate ?? 0);
    const bfp = Number(rates.baseFeePercent);
    if ([free, ticket, table, evtRate, bfp].some((n) => !Number.isFinite(n) || n < 0)) {
      toast({ title: "Fees must be valid non-negative numbers", variant: "destructive" });
      return;
    }
    if (ticket > 100 || bfp > 100 || evtRate > 100) {
      toast({ title: "Percentage rates must be 0–100%", variant: "destructive" });
      return;
    }
    setSavingId(vendorId);
    try {
      await Promise.all([
        apiPut(`/api/admin/vendors/${vendorId}/commission`, { freeEntryRate: free, ticketRate: ticket, tableBookingRate: table, eventRate: evtRate, eventCommissionEnabled: rates.eventCommissionEnabled !== false }),
        apiPatch(`/api/admin/vendors/${vendorId}/base-fee`, { baseFeePercent: bfp }),
      ]);
      toast({ title: "Commission fees saved" });
      await Promise.all([loadRates(), loadReport()]);
    } catch (e: any) {
      toast({ title: "Failed to save", description: e?.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const updateRate = (vendorId: number, field: keyof CommissionRates, value: string) => {
    setRateEdits((prev) => ({
      ...prev,
      [vendorId]: { ...prev[vendorId], [field]: value },
    }));
  };

  const toggleEventCommission = (vendorId: number, enabled: boolean) => {
    setRateEdits((prev) => ({
      ...prev,
      [vendorId]: { ...prev[vendorId], eventCommissionEnabled: enabled },
    }));
  };

  const toggleVendor = (vendorId: number) => {
    setExpandedVendors((prev) => {
      const next = new Set(prev);
      if (next.has(vendorId)) next.delete(vendorId);
      else next.add(vendorId);
      return next;
    });
  };

  const bookingTypeLabel = (t: "free_entry" | "ticket" | "table" | "event_booking") => {
    if (t === "free_entry") return "Free Entry";
    if (t === "ticket") return "Ticket";
    if (t === "event_booking") return "Events";
    return "Table";
  };

  return (
    <div className="space-y-8">

      {/* -- Partner subscription plan visibility -------------------------- */}
      <div className="rounded-2xl glass-card p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 red-ring">
            <Crown className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-serif text-xl">Partner Subscription Plans Visibility</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Toggle which partner subscription plans are shown on the public subscription page.</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="flex items-center justify-between flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 gap-4">
            <div>
              <p className="font-medium text-sm">Growth Plan</p>
              <p className="text-xs text-muted-foreground">₹2,999/mo — featured badge, CRM, reports</p>
            </div>
            <Switch
              checked={planConfig.showGrowthPlan}
              onCheckedChange={() => togglePlanVisibility("showGrowthPlan")}
              disabled={planConfigSaving}
            />
          </div>
          <div className="flex items-center justify-between flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 gap-4">
            <div>
              <p className="font-medium text-sm">Premium Partner Plan</p>
              <p className="text-xs text-muted-foreground">₹5,999/mo — email, WhatsApp, dedicated manager</p>
            </div>
            <Switch
              checked={planConfig.showPremiumPartner}
              onCheckedChange={() => togglePlanVisibility("showPremiumPartner")}
              disabled={planConfigSaving}
            />
          </div>
          <div className="flex items-center justify-between flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 gap-4">
            <div>
              <p className="font-medium text-sm">Royal Partner Plan</p>
              <p className="text-xs text-muted-foreground">₹9,999/mo — homepage, drinks, 16-day ads</p>
            </div>
            <Switch
              checked={planConfig.showRoyalPlan}
              onCheckedChange={() => togglePlanVisibility("showRoyalPlan")}
              disabled={planConfigSaving}
            />
          </div>
        </div>
      </div>

      {/* -- Fee management ----------------------------------------------- */}
      <div className="rounded-2xl glass-card p-6">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 red-ring">
            <Percent className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-serif text-2xl">Commission fees per partner</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Set platform commission per booking type: Free Entry and Table Booking are a flat ₹ per verified guest; Ticket is a percentage (%) of the final verified revenue.</p>
          </div>
        </div>

        {ratesLoading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : !ratesReport || ratesReport.rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No approved partners found.</p>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
            <table className="w-full text-sm min-w-[780px]">
              <thead className="sticky top-0 z-10 text-xs uppercase tracking-wider text-muted-foreground border-b border-white/10 bg-black/90 backdrop-blur">
                <tr>
                  <th className="text-left py-2 pr-4">Partner</th>
                  <th className="text-right py-2 px-3">Free Entry ₹/person</th>
                  <th className="text-right py-2 px-3">Ticket %</th>
                  <th className="text-right py-2 px-3">Table ₹/person</th>
                  <th className="text-right py-2 px-3">Event %</th>
                  <th className="text-center py-2 px-3">Event Comm.</th>
                  <th className="text-right py-2 px-3">Base Fee %</th>
                  <th className="text-right py-2 pl-3"></th>
                </tr>
              </thead>
              <tbody>
                {ratesReport.rows.map((row) => {
                  const edits = rateEdits[row.vendorId] ?? row.appliedRates;
                  const dirty =
                    edits.freeEntryRate !== row.appliedRates.freeEntryRate ||
                    edits.ticketRate !== row.appliedRates.ticketRate ||
                    edits.tableBookingRate !== row.appliedRates.tableBookingRate ||
                    edits.eventRate !== (row.appliedRates.eventRate ?? "0") ||
                    (edits.eventCommissionEnabled !== false) !== (row.appliedRates.eventCommissionEnabled !== false) ||
                    edits.baseFeePercent !== (row.baseFeePercent ?? "3.50");
                  return (
                    <tr key={row.vendorId} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{row.businessName}</p>
                        {row.city && <p className="text-xs text-muted-foreground">{row.city}</p>}
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          min={0}
                          max={99999.99}
                          step={0.01}
                          value={edits.freeEntryRate}
                          onChange={(e) => updateRate(row.vendorId, "freeEntryRate", e.target.value)}
                          className="w-20 text-right h-8 text-sm ml-auto"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={edits.ticketRate}
                          onChange={(e) => updateRate(row.vendorId, "ticketRate", e.target.value)}
                          className="w-20 text-right h-8 text-sm ml-auto"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          min={0}
                          max={99999.99}
                          step={0.01}
                          value={edits.tableBookingRate}
                          onChange={(e) => updateRate(row.vendorId, "tableBookingRate", e.target.value)}
                          className="w-20 text-right h-8 text-sm ml-auto"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={edits.eventRate ?? "0"}
                          disabled={edits.eventCommissionEnabled === false}
                          onChange={(e) => updateRate(row.vendorId, "eventRate", e.target.value)}
                          className="w-20 text-right h-8 text-sm ml-auto disabled:opacity-40"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={edits.eventCommissionEnabled !== false}
                          onClick={() => toggleEventCommission(row.vendorId, edits.eventCommissionEnabled === false)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${edits.eventCommissionEnabled !== false ? "bg-primary" : "bg-white/15"}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${edits.eventCommissionEnabled !== false ? "translate-x-[18px]" : "translate-x-1"}`} />
                        </button>
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={edits.baseFeePercent ?? "3.50"}
                          onChange={(e) => updateRate(row.vendorId, "baseFeePercent", e.target.value)}
                          className="w-20 text-right h-8 text-sm ml-auto"
                        />
                      </td>
                      <td className="py-2 pl-3 text-right">
                        <Button
                          size="sm"
                          disabled={!dirty || savingId === row.vendorId}
                          onClick={() => saveRates(row.vendorId)}
                          className="text-xs h-8 px-3"
                        >
                          <Save className="h-3 w-3 mr-1" />
                          {savingId === row.vendorId ? "Saving..." : "Save"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* -- Commission report --------------------------------------------- */}
      <div className="rounded-2xl glass-card p-6">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-serif text-2xl">Commission report</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Platform earnings from confirmed and completed bookings.</p>
          </div>
        </div>

        {/* Date filter */}
        <div className="flex flex-wrap items-end gap-4 mb-6 p-4 rounded-xl bg-white/[0.03] border border-white/8">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">From</Label>
            <Input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className="w-40" max={reportTo || undefined} />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">To</Label>
            <Input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className="w-40" min={reportFrom || undefined} />
          </div>
          {(reportFrom || reportTo) && (
            <Button variant="outline" size="sm" onClick={() => { setReportFrom(""); setReportTo(""); }}>Clear dates</Button>
          )}
          <div className="ml-auto flex items-center gap-3">
            {reportLastUpdated && (
              <p className="text-xs text-muted-foreground">Updated {reportLastUpdated.toLocaleTimeString()}</p>
            )}
            <Button variant="outline" size="sm" onClick={loadReport} disabled={reportLoading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${reportLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {reportLoading ? (
          <p className="text-muted-foreground text-sm">Loading report...</p>
        ) : !report ? null : (
          <div className="space-y-6">
            {/* Platform totals — single column on small screens so the rupee
                values never get clipped at the card edge. Original 3-col
                layout returns at sm+. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Total bookings</p>
                <p className="stat-number text-xl sm:text-2xl truncate">{report.totals.totalBookings}</p>
              </div>
              <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Gross revenue</p>
                <p className="stat-number text-xl sm:text-2xl truncate" title={formatINR(report.totals.totalRevenue)}>{formatINR(report.totals.totalRevenue)}</p>
              </div>
              <div className="min-w-0 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Commission collected</p>
                <p className="stat-number text-xl sm:text-2xl text-primary truncate" title={formatINR(report.totals.totalCommission)}>{formatINR(report.totals.totalCommission)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Sum of commission across all pubs in this window.</p>
              </div>
            </div>

            {/* Per-vendor rows */}
            {report.rows.filter((r) => r.totalBookings > 0).length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings in this date range.</p>
            ) : (
              <div className="space-y-2">
                {report.rows.filter((r) => r.totalBookings > 0).map((row) => {
                  const expanded = expandedVendors.has(row.vendorId);
                  return (
                    <div key={row.vendorId} className="rounded-xl border border-white/10 overflow-hidden">
                      {/* Vendor summary row */}
                      <button
                        onClick={() => toggleVendor(row.vendorId)}
                        className="w-full flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0 w-full">
                          <p className="font-medium text-sm break-words">{row.businessName}{row.city ? <span className="text-muted-foreground font-normal"> · {row.city}</span> : ""}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 break-words">
                            <span className="opacity-80">Fees:</span>{" "}
                            <span className="whitespace-nowrap">FE ₹{row.appliedRates.freeEntryRate}/person</span>
                            <span className="opacity-40"> · </span>
                            <span className="whitespace-nowrap">Ticket {row.appliedRates.ticketRate}%</span>
                            <span className="opacity-40"> · </span>
                            <span className="whitespace-nowrap">Table ₹{row.appliedRates.tableBookingRate}/person</span>
                          </p>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-6 tabular-nums text-sm sm:shrink-0 w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-white/5">
                          <span className="text-muted-foreground text-xs sm:text-sm">{row.totalBookings} booking{row.totalBookings !== 1 ? "s" : ""}</span>
                          <span className="ml-auto sm:ml-0">{formatINR(row.totalRevenue)}</span>
                          <span className="text-primary font-semibold">{formatINR(row.totalCommission)}</span>
                          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                        </div>
                      </button>

                      {/* Expanded breakdown */}
                      {expanded && (
                        <div className="border-t border-white/8 bg-white/[0.02] px-4 py-3 space-y-4">
                          {/* Booking-type breakdown — one row per booking type
                              (Free Entry / Ticket Booking / Table Booking),
                              showing total people and realised commission. */}
                          <div>
                            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Booking type breakdown</p>
                            <div className="overflow-hidden rounded-lg border border-white/8">
                              <table className="w-full text-xs">
                                <thead className="bg-white/[0.04] text-muted-foreground">
                                  <tr>
                                    <th className="text-left py-2 px-3 font-medium">Booking Type</th>
                                    <th className="text-right py-2 px-3 font-medium">No of People</th>
                                    <th className="text-right py-2 px-3 font-medium">Commission</th>
                                    <th className="text-right py-2 px-3 font-medium">Base Fee</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  <tr>
                                    <td className="py-2 px-3">Free Entry</td>
                                    <td className="text-right px-3 tabular-nums">{row.freeEntryPeople}</td>
                                    <td className="text-right px-3 tabular-nums text-primary">{formatINR(row.freeEntryCommission)}</td>
                                    <td className="text-right px-3 tabular-nums text-amber-400">{formatINR(row.freeEntryBaseFee ?? 0)}</td>
                                  </tr>
                                  <tr>
                                    <td className="py-2 px-3">Ticket Booking</td>
                                    <td className="text-right px-3 tabular-nums">{row.ticketPeople}</td>
                                    <td className="text-right px-3 tabular-nums text-primary">{formatINR(row.ticketCommission)}</td>
                                    <td className="text-right px-3 tabular-nums text-amber-400">{formatINR(row.ticketBaseFee ?? 0)}</td>
                                  </tr>
                                  <tr>
                                    <td className="py-2 px-3">Table Booking</td>
                                    <td className="text-right px-3 tabular-nums">{row.tablePeople}</td>
                                    <td className="text-right px-3 tabular-nums text-primary">{formatINR(row.tableCommission)}</td>
                                    <td className="text-right px-3 tabular-nums text-amber-400">{formatINR(row.tableBaseFee ?? 0)}</td>
                                  </tr>
                                  {(row.eventBookingCount ?? 0) > 0 && (
                                    <tr>
                                      <td className="py-2 px-3">Events Booking</td>
                                      <td className="text-right px-3 tabular-nums">{row.eventBookingPeople ?? 0}</td>
                                      <td className="text-right px-3 tabular-nums text-primary">{formatINR(row.eventBookingCommission ?? 0)}</td>
                                      <td className="text-right px-3 tabular-nums text-amber-400">{formatINR(row.eventBookingBaseFee ?? 0)}</td>
                                    </tr>
                                  )}
                                  <tr className="bg-white/[0.04] font-medium">
                                    <td className="py-2 px-3">Total</td>
                                    <td className="text-right px-3 tabular-nums">{row.freeEntryPeople + row.ticketPeople + row.tablePeople + (row.eventBookingPeople ?? 0)}</td>
                                    <td className="text-right px-3 tabular-nums text-primary">{formatINR(row.totalCommission)}</td>
                                    <td className="text-right px-3 tabular-nums text-amber-400">{formatINR(row.totalBaseFee ?? 0)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Individual booking lines */}
                          {row.bookings.length > 0 && (
                            <div>
                              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Individual bookings</p>
                              <table className="w-full text-xs">
                                <thead className="text-muted-foreground">
                                  <tr>
                                    <th className="text-left py-1 pr-3">Booking #</th>
                                    <th className="text-left py-1 pr-3">Date</th>
                                    <th className="text-left py-1 pr-3">Type</th>
                                    <th className="text-right py-1 px-2">Price</th>
                                    <th className="text-right py-1 px-2">Rate</th>
                                    <th className="text-right py-1 pl-2">Commission</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.bookings.map((b) => (
                                    <tr key={b.id} className="border-t border-white/5">
                                      <td className="py-1.5 pr-3 text-muted-foreground">#{b.id}</td>
                                      <td className="py-1.5 pr-3 text-muted-foreground">
                                        {new Date(b.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                                      </td>
                                      <td className="py-1.5 pr-3">{bookingTypeLabel(b.bookingType)}</td>
                                      <td className="text-right px-2">
                                        {formatINR(b.effectiveRevenue ?? b.finalPrice)}
                                        {b.effectiveRevenue != null && b.effectiveRevenue !== b.finalPrice && (
                                          <p className="text-xs text-muted-foreground">booked {formatINR(b.finalPrice)}</p>
                                        )}
                                      </td>
                                      <td className="text-right px-2">
                                        {b.commissionRate > 0
                                          ? b.bookingType === "ticket"
                                            ? `${b.commissionRate % 1 === 0 ? b.commissionRate.toFixed(0) : b.commissionRate.toFixed(2)}%`
                                            : `₹${b.commissionRate % 1 === 0 ? b.commissionRate.toFixed(0) : b.commissionRate.toFixed(2)} × ${b.unitCount} person${b.unitCount !== 1 ? "s" : ""}`
                                          : "--"}
                                      </td>
                                      <td className="text-right pl-2 text-primary">{formatINR(b.commissionAmount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AnnouncementSliderRow({
  item,
  toggling,
  onToggle,
}: {
  item: AdminAnnouncement;
  toggling: number | null;
  onToggle: (item: AdminAnnouncement) => void;
}) {
  return (
    <div
      className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors ${
        item.isFeaturedSlider
          ? "border-amber-400/30 bg-amber-400/5"
          : "border-white/8 bg-white/[0.02]"
      }`}
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          className="w-12 h-12 rounded-lg object-cover flex-shrink-0 opacity-80"
        />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
          <Megaphone className="h-5 w-5 text-white/25" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm leading-snug truncate">{item.title}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {item.vendorName}
          {item.announceDate && (
            <span className="ml-2">
              · {new Date(item.announceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
        </p>
      </div>
      <Switch
        checked={item.isFeaturedSlider}
        onCheckedChange={() => onToggle(item)}
        disabled={toggling === item.id}
        aria-label={item.isFeaturedSlider ? "Remove from slider" : "Add to slider"}
        className={item.isFeaturedSlider ? "data-[state=checked]:bg-amber-400" : ""}
      />
    </div>
  );
}

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
  bankingDetails: {
    accountHolderName: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
  } | null;
}

function SettlementsAdmin() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<AdminSettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [processing, setProcessing] = useState<number | null>(null);

  async function loadRequests() {
    setLoading(true);
    try {
      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const rows = await apiGet<AdminSettlementRow[]>(`/api/admin/settlement-requests${qs}`);
      setRequests(rows ?? []);
    } catch {
      toast({ title: "Failed to load settlement requests", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadRequests(); }, [statusFilter]);

  async function approve(id: number) {
    setProcessing(id);
    try {
      await apiPost(`/api/admin/settlement-requests/${id}/approve`);
      await loadRequests();
      toast({ title: "Settlement approved" });
    } catch {
      toast({ title: "Failed to approve", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  }

  async function reject(id: number) {
    setProcessing(id);
    try {
      await apiPost(`/api/admin/settlement-requests/${id}/reject`, { note: rejectNote });
      setRejectingId(null);
      setRejectNote("");
      await loadRequests();
      toast({ title: "Settlement rejected" });
    } catch {
      toast({ title: "Failed to reject", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  }

  function statusBadge(status: string) {
    if (status === "approved") return <Badge className="bg-green-500/20 text-green-300 border-green-500/30">Approved</Badge>;
    if (status === "rejected") return <Badge className="bg-red-500/20 text-red-300 border-red-500/30">Rejected</Badge>;
    return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">Pending</Badge>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl glass-card p-6">
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-xl">Settlement Requests</h2>
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No settlement requests found.</p>
        ) : (
          <div className="space-y-4">
            {requests.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/10 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium">{r.businessName ?? `Vendor #${r.vendorId}`}</p>
                    {r.city && <p className="text-xs text-muted-foreground">{r.city}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(r.status)}
                    <span className="text-primary font-semibold tabular-nums">{formatINR(Number(r.amount))}</span>
                  </div>
                </div>
                {r.bankingDetails ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CreditCard className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Banking Details</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                      <div>
                        <span className="text-muted-foreground">Account Holder</span>
                        <p className="font-semibold text-foreground mt-0.5">{r.bankingDetails.accountHolderName}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Bank</span>
                        <p className="font-semibold text-foreground mt-0.5">{r.bankingDetails.bankName}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Account No.</span>
                        <p className="font-mono font-semibold text-foreground mt-0.5">{r.bankingDetails.accountNumber}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">IFSC Code</span>
                        <p className="font-mono font-semibold text-foreground mt-0.5">{r.bankingDetails.ifscCode}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 flex items-center gap-2">
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                    No banking details on record for this partner
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground flex-wrap">
                  <span>Requested: {new Date(r.requestedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  {r.processedAt && <span>Processed: {new Date(r.processedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>}
                  {r.adminNote && <span className="text-amber-400">Note: {r.adminNote}</span>}
                </div>
                {r.status === "pending" && (
                  rejectingId === r.id ? (
                    <div className="space-y-2">
                      <textarea
                        className="w-full rounded-lg bg-white/5 border border-white/10 p-2 text-sm resize-none min-h-[60px] focus:outline-none"
                        placeholder="Rejection reason (optional)"
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setRejectingId(null); setRejectNote(""); }}>Cancel</Button>
                        <Button size="sm" variant="destructive" disabled={processing === r.id} onClick={() => reject(r.id)}>
                          {processing === r.id ? "Rejecting..." : "Confirm Reject"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50" onClick={() => setRejectingId(r.id)}>
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </Button>
                      <Button size="sm" className="gap-1.5" disabled={processing === r.id} onClick={() => approve(r.id)}>
                        <CheckCircle className="h-3.5 w-3.5" /> {processing === r.id ? "Approving..." : "Approve"}
                      </Button>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewsAdmin() {
  const { data: allVendors } = useListVendors({ limit: 500 } as Parameters<typeof useListVendors>[0]);
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [verifiedFilter, setVerifiedFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const params: Record<string, number | boolean> = { page, pageSize: 20 };
  if (vendorFilter !== "all") params["vendorId"] = Number(vendorFilter);
  if (ratingFilter !== "all") params["rating"] = Number(ratingFilter);
  if (verifiedFilter !== "all") params["verified"] = verifiedFilter === "true";
  const { data, refetch, isLoading } = useListReviewsAdmin(params);
  const updateReview = useUpdateReview();
  const deleteReview = useDeleteReview();
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 20));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editComment, setEditComment] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-serif text-2xl">Reviews moderation</h2>
        <Badge variant="secondary">{total}</Badge>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={vendorFilter}
            onChange={(e) => { setVendorFilter(e.target.value); setPage(1); }}
            className="px-3 py-1.5 text-sm rounded-md border bg-background"
          >
            <option value="all">All pubs</option>
            {(allVendors ?? []).map((v: { id: number; businessName: string }) => (
              <option key={v.id} value={v.id}>{v.businessName}</option>
            ))}
          </select>
          <select
            value={ratingFilter}
            onChange={(e) => { setRatingFilter(e.target.value); setPage(1); }}
            className="px-3 py-1.5 text-sm rounded-md border bg-background"
          >
            <option value="all">All ratings</option>
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>{r} star{r > 1 ? "s" : ""}</option>
            ))}
          </select>
          <select
            value={verifiedFilter}
            onChange={(e) => { setVerifiedFilter(e.target.value); setPage(1); }}
            className="px-3 py-1.5 text-sm rounded-md border bg-background"
          >
            <option value="all">All reviewers</option>
            <option value="true">Verified only</option>
            <option value="false">Unverified only</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading reviews...</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No reviews match these filters.</p>
      ) : (
        <div className="space-y-3">
          {items.map((r) => {
            const isEditing = editingId === r.id;
            return (
              <div key={r.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{r.userName}</p>
                    <p className="text-xs text-muted-foreground">
                      on <span className="text-foreground">{r.vendorName}</span> · {new Date(r.createdAt).toLocaleString()}
                      {r.verifiedBooking ? " · ✓ verified" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} className={`text-xs ${i < (isEditing ? editRating : r.rating) ? "text-amber-400" : "text-muted-foreground"}`}>â˜…</span>
                    ))}
                  </div>
                </div>
                {isEditing ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map((n) => (
                        <button key={n} type="button" onClick={() => setEditRating(n)} className={`text-xl ${n <= editRating ? "text-amber-400" : "text-muted-foreground"}`}>â˜…</button>
                      ))}
                    </div>
                    <Textarea value={editComment} onChange={(e) => setEditComment(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => updateReview.mutate(
                        { reviewId: r.id, data: { rating: editRating, comment: editComment } },
                        { onSuccess: () => { setEditingId(null); refetch(); } },
                      )} disabled={updateReview.isPending}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {r.comment && <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{r.comment}</p>}
                    <div className="mt-3 flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setEditingId(r.id); setEditRating(r.rating); setEditComment(r.comment || ""); }}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        if (!window.confirm("Delete this review? This cannot be undone.")) return;
                        deleteReview.mutate({ reviewId: r.id }, { onSuccess: () => refetch() });
                      }} disabled={deleteReview.isPending}>Delete</Button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next</Button>
        </div>
      )}
    </div>
  );
}

interface OccRow {
  vendorId: number; businessName: string; city: string | null;
  capacity: number; currentlyInside: number; available: number;
  occupancyPercent: number; totalBookingsToday: number;
  checkedInCount: number; checkedOutCount: number; notArrivedCount: number; today: string;
}
interface OccResponse {
  today: string; rows: OccRow[];
  totals: { totalCapacity: number; totalCurrentlyInside: number; totalCheckedInToday: number; totalCheckedOutToday: number };
}
interface ScannerRow {
  id: number; ticketCode: string; eventTitle: string; vendorName: string;
  bookingDate: string; personName: string | null; userName: string;
  phone: string | null; pubMode: string; guests: number; ticketWomen: number;
  ticketMen: number; ticketCouple: number; finalPrice: number; status: string;
  checkedIn: boolean; checkedInAt: string | null;
  checkedOut: boolean; checkedOutAt: string | null;
  liveStatus: "notArrived" | "inside" | "checkedOut";
}

function pctColor(p: number) {
  if (p >= 90) return "text-red-400 border-red-500/40 bg-red-500/10";
  if (p >= 70) return "text-amber-300 border-amber-500/40 bg-amber-500/10";
  if (p >= 30) return "text-emerald-300 border-emerald-500/40 bg-emerald-500/10";
  return "text-muted-foreground border-white/10 bg-black/30";
}

function LiveOccupancyAdmin() {
  const [drillVendor, setDrillVendor] = useState<ApiOccupancyRow | null>(null);
  const [city, setCity] = useState("");
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<"occupancy" | "name" | "city">("occupancy");

  const params = {
    ...(city.trim() ? { city: city.trim() } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
  };
  const { data, isLoading, error } = useGetAdminLiveOccupancy(params, {
    query: { queryKey: getGetAdminLiveOccupancyQueryKey(params), refetchInterval: 15000 },
  });
  const loading = isLoading;
  const err = error ? (error instanceof Error ? error.message : "Failed to load") : null;

  if (loading && !data) return <div className="text-muted-foreground">Loading occupancy...</div>;
  if (err) return <div className="text-red-400">{err}</div>;
  if (!data) return null;

  const overallPct = data.totals.totalCapacity > 0
    ? Math.round((data.totals.totalCurrentlyInside / data.totals.totalCapacity) * 1000) / 10
    : 0;

  const sortedRows = [...data.rows].sort((a, b) => {
    if (sortBy === "name") return a.businessName.localeCompare(b.businessName);
    if (sortBy === "city") return (a.city ?? "").localeCompare(b.city ?? "") || a.businessName.localeCompare(b.businessName);
    return b.occupancyPercent - a.occupancyPercent || a.businessName.localeCompare(b.businessName);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs uppercase text-muted-foreground">Search</label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pub or city" className="bg-black/40 border-white/10" />
        </div>
        <div className="w-48">
          <label className="text-xs uppercase text-muted-foreground">City</label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Bengaluru" className="bg-black/40 border-white/10" />
        </div>
        <div>
          <label className="text-xs uppercase text-muted-foreground block">Sort</label>
          <div className="flex gap-1 mt-1">
            {(["occupancy", "name", "city"] as const).map((s) => (
              <button key={s} onClick={() => setSortBy(s)}
                className={`text-xs px-3 py-1.5 rounded-md border ${sortBy === s ? "bg-primary border-primary text-primary-foreground" : "border-white/10 text-muted-foreground"}`}>
                {s === "occupancy" ? "% Full" : s === "name" ? "Name" : "City"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl glass-card p-4"><p className="text-xs uppercase text-muted-foreground">Date (IST)</p><p className="text-lg font-semibold">{data.today}</p></div>
        <div className="rounded-2xl glass-card p-4"><p className="text-xs uppercase text-muted-foreground">Currently inside</p><p className="text-lg font-semibold tabular-nums">{data.totals.totalCurrentlyInside} / {data.totals.totalCapacity}</p><p className="text-xs text-muted-foreground">{overallPct}% full</p></div>
        <div className="rounded-2xl glass-card p-4"><p className="text-xs uppercase text-muted-foreground">Check-ins today</p><p className="text-lg font-semibold tabular-nums">{data.totals.totalCheckedInToday}</p></div>
        <div className="rounded-2xl glass-card p-4"><p className="text-xs uppercase text-muted-foreground">Check-outs today</p><p className="text-lg font-semibold tabular-nums">{data.totals.totalCheckedOutToday}</p></div>
      </div>

      <div className="rounded-2xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-black/90 backdrop-blur text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Pub</th>
                <th className="text-left p-3">City</th>
                <th className="text-right p-3">Capacity</th>
                <th className="text-right p-3">Inside</th>
                <th className="text-right p-3">% Full</th>
                <th className="text-right p-3">In / Out / Pending</th>
                <th className="text-right p-3"></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No approved partners match your filters.</td></tr>
              )}
              {sortedRows.map((r) => (
                <tr key={r.vendorId} className="border-t border-white/5 hover:bg-white/5">
                  <td className="p-3 font-medium">{r.businessName}</td>
                  <td className="p-3 text-muted-foreground">{r.city ?? "--"}</td>
                  <td className="p-3 text-right tabular-nums">{r.capacity || "--"}</td>
                  <td className="p-3 text-right tabular-nums font-semibold">{r.currentlyInside}</td>
                  <td className="p-3 text-right">
                    <span className={`inline-flex px-2 py-0.5 rounded-md border text-xs tabular-nums ${pctColor(r.occupancyPercent)}`}>
                      {r.capacity > 0 ? `${r.occupancyPercent}%` : "--"}
                    </span>
                  </td>
                  <td className="p-3 text-right tabular-nums text-xs text-muted-foreground">
                    <span className="text-emerald-300">{r.checkedInCount}</span> / <span className="text-amber-300">{r.checkedOutCount}</span> / <span>{r.notArrivedCount}</span>
                  </td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setDrillVendor(r)}>View bookings</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {drillVendor && <LiveOccupancyDrill vendor={drillVendor} onClose={() => setDrillVendor(null)} />}
    </div>
  );
}

function LiveOccupancyDrill({ vendor, onClose }: { vendor: ApiOccupancyRow; onClose: () => void }) {
  const [statusF, setStatusF] = useState<"all" | "notArrived" | "inside" | "checkedOut">("all");
  const [drillQ, setDrillQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Generated React Query hook keeps the params object aligned with the
  // OpenAPI contract. Date range is optional; when blank the server defaults
  // to today (IST) which is the desired behaviour for the live drill-in.
  const params: GetAdminLiveOccupancyBookingsParams = {};
  if (statusF !== "all") params.status = statusF;
  if (drillQ.trim()) params.q = drillQ.trim();
  if (from && to) { params.from = from; params.to = to; }

  const { data, isLoading } = useGetAdminLiveOccupancyBookings(vendor.vendorId, params, {
    query: { queryKey: getGetAdminLiveOccupancyBookingsQueryKey(vendor.vendorId, params), refetchInterval: 20000 },
  });
  const rows = data?.rows ?? [];
  const loading = isLoading;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-white/10 rounded-3xl max-w-5xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-white/10 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Today's bookings</p>
            <p className="font-serif text-2xl">{vendor.businessName}</p>
            <p className="text-xs text-muted-foreground">Inside: {vendor.currentlyInside} / {vendor.capacity || "--"}</p>
          </div>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <div className="p-3 border-b border-white/10 flex flex-wrap gap-2 items-center">
          {(["all", "notArrived", "inside", "checkedOut"] as const).map((s) => (
            <button key={s} onClick={() => setStatusF(s)}
              className={`text-xs px-3 py-1.5 rounded-full border ${statusF === s ? "bg-primary border-primary text-primary-foreground" : "border-white/10 text-muted-foreground hover:text-foreground"}`}>
              {s === "all" ? "All" : s === "notArrived" ? "Not arrived" : s === "inside" ? "Inside" : "Checked out"}
            </button>
          ))}
          <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-black/40 border-white/10 w-36" title="From" />
            <span className="text-xs text-muted-foreground">â†’</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-black/40 border-white/10 w-36" title="To" />
            <Input value={drillQ} onChange={(e) => setDrillQ(e.target.value)} placeholder="Search name / phone / ticket #" className="bg-black/40 border-white/10 w-full sm:w-64" />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">No bookings.</div>
          ) : (
            <table className="w-full text-sm min-w-[840px]">
              <thead className="bg-black/40 text-xs uppercase text-muted-foreground sticky top-0 z-10 backdrop-blur">
                <tr>
                  <th className="text-left p-3">Ticket</th>
                  <th className="text-left p-3">Guest</th>
                  <th className="text-left p-3">Phone</th>
                  <th className="text-right p-3">Pax</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">In / Out</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pax = r.pubMode === "ticket" ? r.ticketWomen + r.ticketMen + r.ticketCouple * 2 : r.guests;
                  return (
                    <tr key={r.id} className="border-t border-white/5">
                      <td className="p-3 font-mono text-xs">{r.ticketCode}</td>
                      <td className="p-3">{r.personName || r.userName}</td>
                      <td className="p-3 text-muted-foreground">{r.phone || "--"}</td>
                      <td className="p-3 text-right tabular-nums">{pax}</td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-md border ${r.liveStatus === "inside" ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" : r.liveStatus === "checkedOut" ? "border-amber-500/40 text-amber-300 bg-amber-500/10" : "border-white/10 text-muted-foreground"}`}>
                          {r.liveStatus === "inside" ? "Inside" : r.liveStatus === "checkedOut" ? "Checked out" : "Not arrived"}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground tabular-nums">
                        {r.checkedInAt ? new Date(r.checkedInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "--"}
                        {" / "}
                        {r.checkedOutAt ? new Date(r.checkedOutAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const CP_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const CP_GENDERS = [
  { canon: "women", label: "Ladies" },
  { canon: "men", label: "Men" },
  { canon: "couple", label: "Couple" },
] as const;

type LookupResult = {
  user: { id: number; name: string; email: string; role: string; signInMethod: string };
  vendor: { id: number; businessName: string; status: string; category: string; city: string; state: string } | null;
  existingPub: { id: number; title: string } | null;
  canCreate: boolean;
  blockReason: string | null;
};

function CreatePubAdmin() {
  const { toast } = useToast();

  // -- Step 1: partner lookup ------------------------------------------------
  const [emailInput, setEmailInput] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupError, setLookupError] = useState("");

  // -- Step 2: pub details ---------------------------------------------------
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("");
  const [stateF, setStateF] = useState("");
  const [city, setCity] = useState("");
  const [capacity, setCapacity] = useState("");
  const [pubMode, setPubMode] = useState<"ticket" | "event" | "both">("both");
  const [priceWomen, setPriceWomen] = useState("");
  const [priceMen, setPriceMen] = useState("");
  const [priceCouple, setPriceCouple] = useState("");
  const [varyByDay, setVaryByDay] = useState(false);
  const [dayPricingOverrides, setDayPricingOverrides] = useState<
    Record<string, { women: string; men: string; couple: string }>
  >({});
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryUploading, setGalleryUploading] = useState(0);
  const [galleryVideo, setGalleryVideo] = useState("");
  const [videoUploading, setVideoUploading] = useState(false);
  const [pubEventTypes, setPubEventTypes] = useState<string[]>([]);
  const [freeEntryEnabled, setFreeEntryEnabled] = useState(false);
  const [freeEntryGenders, setFreeEntryGenders] = useState<string[]>([]);
  const [freeEntryDays, setFreeEntryDays] = useState<string[]>([]);
  const [freeEntryBeforeTime, setFreeEntryBeforeTime] = useState("");
  const [danceFloor, setDanceFloor] = useState("");
  const [danceFloorPhotos, setDanceFloorPhotos] = useState<string[]>([]);
  const [danceFloorUploading, setDanceFloorUploading] = useState(0);
  const [menuUrls, setMenuUrls] = useState<string[]>([]);
  const [menuUploading, setMenuUploading] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ pubId: number; vendorId: number; partnerName: string } | null>(null);
  const [submitError, setSubmitError] = useState("");

  // -- Lookup handler --------------------------------------------------------

  async function handleLookup(e: any) {
    e.preventDefault();
    const email = emailInput.trim();
    if (!email) return;
    setLooking(true);
    setLookupResult(null);
    setLookupError("");
    setResult(null);
    setSubmitError("");
    try {
      const data = await apiGet<LookupResult>(`/api/admin/lookup-partner?email=${encodeURIComponent(email)}`);
      setLookupResult(data);
      // Pre-fill location from vendor profile
      if (data.vendor) {
        setCity(data.vendor.city ?? "");
        setStateF(data.vendor.state ?? "");
        setCountry("India");
      }
    } catch (err: any) {
      setLookupError(err?.message ?? "Lookup failed");
    } finally {
      setLooking(false);
    }
  }

  function resetLookup() {
    setLookupResult(null);
    setLookupError("");
    setTitle(""); setDescription(""); setImageUrl("");
    setLocation(""); setCountry(""); setStateF(""); setCity("");
    setCapacity(""); setPubMode("both");
    setPriceWomen(""); setPriceMen(""); setPriceCouple("");
    setVaryByDay(false); setDayPricingOverrides({});
    setGalleryImages([]); setGalleryVideo("");
    setPubEventTypes([]);
    setFreeEntryEnabled(false); setFreeEntryGenders([]); setFreeEntryDays([]); setFreeEntryBeforeTime("");
    setDanceFloor(""); setDanceFloorPhotos([]); setMenuUrls([]);
    setSubmitError("");
  }

  // -- Upload handlers -------------------------------------------------------

  async function handleCoverImage(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const v = validateImageFile(file);
    if (v) { toast({ title: v, variant: "destructive" }); return; }
    setImageUploading(true);
    try { setImageUrl(await uploadImage(file)); }
    catch { toast({ title: "Image upload failed", variant: "destructive" }); }
    finally { setImageUploading(false); }
  }

  async function handleGalleryImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const toUpload = Array.from(files).slice(0, 6 - galleryImages.length);
    if (toUpload.length === 0) { toast({ title: "Maximum 6 gallery photos allowed" }); return; }
    setGalleryUploading(toUpload.length);
    let remaining = toUpload.length;
    const urls: string[] = [];
    for (const file of toUpload) {
      const v = validateImageFile(file);
      if (v) { toast({ title: v, variant: "destructive" }); remaining--; setGalleryUploading(remaining); continue; }
      try { urls.push(await uploadImage(file)); }
      catch { toast({ title: "Gallery upload failed", variant: "destructive" }); }
      finally { remaining--; setGalleryUploading(remaining); }
    }
    if (urls.length > 0) setGalleryImages((prev) => [...prev, ...urls]);
  }

  async function handleGalleryVideo(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.type !== "video/mp4") { toast({ title: "Only MP4 videos are allowed", variant: "destructive" }); return; }
    if (file.size > 4 * 1024 * 1024) { toast({ title: "Video must be under 4 MB", variant: "destructive" }); return; }
    setVideoUploading(true);
    try { setGalleryVideo(await uploadImage(file)); }
    catch { toast({ title: "Video upload failed", variant: "destructive" }); }
    finally { setVideoUploading(false); }
  }

  async function handleMenuUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const cap = 6;
    const toUpload = Array.from(files).slice(0, cap - menuUrls.length);
    if (toUpload.length === 0) { toast({ title: `Maximum ${cap} menu images allowed` }); return; }
    setMenuUploading(toUpload.length);
    let remaining = toUpload.length;
    const urls: string[] = [];
    for (const file of toUpload) {
      const v = validateImageFile(file);
      if (v) { toast({ title: v, variant: "destructive" }); remaining--; setMenuUploading(remaining); continue; }
      try { urls.push(await uploadImage(file)); }
      catch { toast({ title: "Menu upload failed", variant: "destructive" }); }
      finally { remaining--; setMenuUploading(remaining); }
    }
    if (urls.length > 0) setMenuUrls((prev) => [...prev, ...urls]);
  }

  async function handleDanceFloorUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const cap = 6;
    const toUpload = Array.from(files).slice(0, cap - danceFloorPhotos.length);
    if (toUpload.length === 0) { toast({ title: `Maximum ${cap} dance floor photos allowed` }); return; }
    setDanceFloorUploading(toUpload.length);
    let remaining = toUpload.length;
    const urls: string[] = [];
    for (const file of toUpload) {
      const v = validateImageFile(file);
      if (v) { toast({ title: v, variant: "destructive" }); remaining--; setDanceFloorUploading(remaining); continue; }
      try { urls.push(await uploadImage(file)); }
      catch { toast({ title: "Dance floor photo upload failed", variant: "destructive" }); }
      finally { remaining--; setDanceFloorUploading(remaining); }
    }
    if (urls.length > 0) setDanceFloorPhotos((prev) => [...prev, ...urls]);
  }

  function setDayPrice(day: string, field: "women" | "men" | "couple", val: string) {
    setDayPricingOverrides((prev) => ({
      ...prev,
      [day]: { ...(prev[day] ?? { women: "", men: "", couple: "" }), [field]: val },
    }));
  }

  function togglePubEventType(t: string) {
    setPubEventTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }
  function toggleFreeEntryGender(g: string) {
    setFreeEntryGenders((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
  }
  function toggleFreeEntryDay(d: string) {
    setFreeEntryDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  }

  async function handleSubmit(e: any) {
    e.preventDefault();
    if (!title.trim()) { setSubmitError("Pub name is required."); return; }
    setSubmitError("");
    setResult(null);
    setSubmitting(true);

    const dayPricing = varyByDay
      ? Object.fromEntries(
          Object.entries(dayPricingOverrides)
            .filter(([, v]) => v.women !== "" || v.men !== "" || v.couple !== "")
            .map(([day, v]) => [day, { women: Number(v.women) || 0, men: Number(v.men) || 0, couple: Number(v.couple) || 0 }]),
        )
      : undefined;

    try {
      const data = await apiPost<{ ok: boolean; pubId: number; vendorId: number; partnerName: string }>(
        "/api/admin/create-pub",
        {
          email: emailInput.trim(),
          title: title.trim(),
          description: description.trim() || undefined,
          imageUrl: imageUrl || undefined,
          location: location.trim() || undefined,
          country: country || undefined,
          state: stateF || undefined,
          city: city || undefined,
          capacity: capacity ? Number(capacity) : undefined,
          pubMode,
          priceWomen: priceWomen ? Number(priceWomen) : undefined,
          priceMen: priceMen ? Number(priceMen) : undefined,
          priceCouple: priceCouple ? Number(priceCouple) : undefined,
          galleryImages: galleryImages.length > 0 ? galleryImages : undefined,
          galleryVideo: galleryVideo || undefined,
          pubEventTypes: pubEventTypes.length > 0 ? pubEventTypes : undefined,
          dayPricing: dayPricing && Object.keys(dayPricing).length > 0 ? dayPricing : undefined,
          freeEntryEnabled,
          freeEntryGenders,
          freeEntryDays,
          freeEntryBeforeTime: freeEntryBeforeTime || undefined,
          danceFloor: danceFloor || undefined,
          danceFloorPhotos: danceFloorPhotos.length > 0 ? danceFloorPhotos : undefined,
          menuUrls: menuUrls.length > 0 ? menuUrls : undefined,
        },
      );
      setResult(data);
      toast({ title: "Pub created", description: `"${title}" assigned to ${data.partnerName}` });
      setEmailInput("");
      resetLookup();
    } catch (err: any) {
      setSubmitError(err?.message ?? "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Create Pub / Club for Partner</h2>
        <p className="text-sm text-muted-foreground">
          Assign a new listing to an approved Pub or Club partner by their registered email (normal or Google Sign-In). The form adapts to the partner's category.
        </p>
      </div>

      {result && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300 space-y-1">
          <p className="font-semibold flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Pub created successfully</p>
          <p>Partner: <span className="font-medium text-white">{result.partnerName}</span></p>
          <p>Pub ID: <span className="font-mono text-white">#{result.pubId}</span></p>
        </div>
      )}

      {/* -- Step 1: Find partner --------------------------------------------- */}
      <section className="rounded-xl border border-white/8 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Find Partner</p>
        <form onSubmit={handleLookup} className="flex gap-2">
          <Input
            type="email"
            placeholder="partner@example.com"
            value={emailInput}
            onChange={(e) => { setEmailInput(e.target.value); setLookupResult(null); setLookupError(""); }}
            className="bg-black/40 border-white/10 flex-1"
            required
          />
          <Button type="submit" variant="outline" disabled={looking || !emailInput.trim()} className="shrink-0">
            {looking ? "Looking..." : "Find Partner"}
          </Button>
        </form>

        {lookupError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300 flex items-start gap-2">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" /> {lookupError}
          </div>
        )}

        {lookupResult && (
          <div className={cn(
            "rounded-lg border p-3 text-sm space-y-2",
            lookupResult.canCreate
              ? "border-emerald-500/30 bg-emerald-500/8"
              : "border-amber-500/30 bg-amber-500/8",
          )}>
            <div className="flex items-center justify-between">
              <p className="font-medium text-white">{lookupResult.user.name}</p>
              <span className="text-xs text-muted-foreground">{lookupResult.user.signInMethod} Sign-In</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">{lookupResult.user.email}</p>
            <div className="flex flex-wrap gap-2 pt-0.5">
              <span className={cn(
                "text-xs px-2 py-0.5 rounded-full border",
                lookupResult.user.role === "vendor" ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" : "border-red-500/40 text-red-300 bg-red-500/10",
              )}>
                Role: {lookupResult.user.role}
              </span>
              {lookupResult.vendor && (
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full border",
                  lookupResult.vendor.status === "approved" ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" : "border-amber-500/40 text-amber-300 bg-amber-500/10",
                )}>
                  Vendor: {lookupResult.vendor.status}
                </span>
              )}
              {lookupResult.existingPub && (
                <span className="text-xs px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-300 bg-amber-500/10">
                  Has pub: {lookupResult.existingPub.title}
                </span>
              )}
            </div>
            {lookupResult.blockReason && (
              <p className="text-xs text-amber-300 flex items-center gap-1.5 pt-0.5">
                <XCircle className="h-3.5 w-3.5 shrink-0" /> {lookupResult.blockReason}
              </p>
            )}
            {lookupResult.canCreate && (
              <p className="text-xs text-emerald-300 flex items-center gap-1.5 pt-0.5">
                <CheckCircle className="h-3.5 w-3.5" /> Ready -- fill in pub details below.
              </p>
            )}
          </div>
        )}
      </section>

      {/* -- Step 2: Pub details (only when partner is verified and eligible) -- */}
      {lookupResult?.canCreate && (
        <form onSubmit={handleSubmit} className="space-y-6">

          {submitError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 flex items-center gap-2">
              <XCircle className="h-4 w-4 shrink-0" /> {submitError}
            </div>
          )}

          {/* -- Pub Info ---------------------------------------------------- */}
          <section className="rounded-xl border border-white/8 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step 2 -- Pub Info</p>

            <div className="space-y-1.5">
              <Label htmlFor="cp-title">Pub Name <span className="text-red-400">*</span></Label>
              <Input id="cp-title" placeholder="e.g. The Brew House"
                value={title} onChange={(e) => setTitle(e.target.value)}
                className="bg-black/40 border-white/10" required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cp-desc">Description</Label>
              <Textarea id="cp-desc" placeholder="Short description..."
                value={description} onChange={(e) => setDescription(e.target.value)}
                className="bg-black/40 border-white/10 min-h-[80px]" />
            </div>

            {/* Cover image */}
            <div className="space-y-1.5">
              <Label>Cover Image</Label>
              {imageUrl ? (
                <div className="relative w-32 h-20 rounded-lg overflow-hidden border border-white/10">
                  <img src={imageUrl} alt="cover" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setImageUrl("")}
                    className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center text-white">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-white/20 text-sm text-muted-foreground cursor-pointer hover:border-white/40 transition-colors w-fit",
                  imageUploading && "opacity-50 pointer-events-none",
                )}>
                  <Upload className="h-4 w-4" />
                  {imageUploading ? "Uploading..." : "Upload cover photo"}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => handleCoverImage(e.target.files)} />
                </label>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cp-location">Address</Label>
              <Input id="cp-location" placeholder="Street address"
                value={location} onChange={(e) => setLocation(e.target.value)}
                className="bg-black/40 border-white/10" />
              {location.trim() && (
                <div className="mt-2">
                  <iframe key={location} title="Pub location"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent([location, city, stateF].filter(Boolean).join(", "))}&output=embed&hl=en`}
                    className="w-full h-48 md:h-56 rounded-xl border border-white/10"
                    loading="lazy" referrerPolicy="no-referrer-when-downgrade"
                  />
                  <a href={`https://maps.google.com/?q=${encodeURIComponent([location, city, stateF].filter(Boolean).join(", "))}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                    <Navigation className="h-3 w-3" />Open in Google Maps
                  </a>
                </div>
              )}
            </div>

            <LocationSelect country={country} state={stateF} city={city}
              onChange={(next) => { setCountry(next.country); setStateF(next.state); setCity(next.city); }} />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cp-capacity">Capacity</Label>
                <Input id="cp-capacity" type="number" min={0} placeholder="e.g. 200"
                  value={capacity} onChange={(e) => setCapacity(e.target.value)}
                  className="bg-black/40 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label>Pub Mode</Label>
                <Select value={pubMode} onValueChange={(v) => setPubMode(v as "ticket" | "event" | "both")}>
                  <SelectTrigger className="bg-black/40 border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Ticket + Table</SelectItem>
                    <SelectItem value="ticket">Ticket only</SelectItem>
                    <SelectItem value="event">Table only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* -- Gallery Photos ----------------------------------------------- */}
          <section className="rounded-xl border border-white/8 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gallery Photos</p>
            {galleryImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {galleryImages.map((src, i) => (
                  <div key={i} className="relative w-20 h-16 rounded-lg overflow-hidden border border-white/10">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setGalleryImages((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/70 flex items-center justify-center text-white">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {galleryImages.length < 6 && (
              <label className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-white/20 text-sm text-muted-foreground cursor-pointer hover:border-white/40 transition-colors w-fit",
                galleryUploading > 0 && "opacity-50 pointer-events-none",
              )}>
                <ImageIcon className="h-4 w-4" />
                {galleryUploading > 0 ? `Uploading ${galleryUploading}...` : `Add photos (${galleryImages.length}/6)`}
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => handleGalleryImages(e.target.files)} />
              </label>
            )}
          </section>

          {/* -- Gallery Video ------------------------------------------------ */}
          <section className="rounded-xl border border-white/8 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gallery Video</p>
            {galleryVideo ? (
              <div className="flex items-center gap-3">
                <video src={galleryVideo} className="w-24 h-16 rounded-lg object-cover border border-white/10" />
                <button type="button" onClick={() => setGalleryVideo("")}
                  className="text-xs text-red-400 hover:text-red-300">Remove</button>
              </div>
            ) : (
              <label className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-white/20 text-sm text-muted-foreground cursor-pointer hover:border-white/40 transition-colors w-fit",
                videoUploading && "opacity-50 pointer-events-none",
              )}>
                <Video className="h-4 w-4" />
                {videoUploading ? "Uploading..." : "Upload MP4 video (max 4 MB)"}
                <input type="file" accept="video/mp4" className="hidden"
                  onChange={(e) => handleGalleryVideo(e.target.files)} />
              </label>
            )}
          </section>

          {/* -- Pricing ------------------------------------------------------ */}
          <section className="rounded-xl border border-white/8 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pricing</p>
            <div className="grid grid-cols-3 gap-3">
              {(["Women", "Men", "Couple"] as const).map((label) => {
                const val = label === "Women" ? priceWomen : label === "Men" ? priceMen : priceCouple;
                const setter = label === "Women" ? setPriceWomen : label === "Men" ? setPriceMen : setPriceCouple;
                return (
                  <div key={label} className="space-y-1.5">
                    <Label className="text-xs">{label} (₹)</Label>
                    <Input type="number" min={0} placeholder="0" value={val}
                      onChange={(e) => setter(e.target.value)} className="bg-black/40 border-white/10" />
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2.5 pt-1">
              <Switch id="cp-varybyday" checked={varyByDay} onCheckedChange={setVaryByDay} />
              <Label htmlFor="cp-varybyday" className="text-sm cursor-pointer select-none">Vary prices by day</Label>
            </div>
            {varyByDay && (
              <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left pb-1.5 font-normal">Day</th>
                      <th className="pb-1.5 font-normal">Women (₹)</th>
                      <th className="pb-1.5 font-normal">Men (₹)</th>
                      <th className="pb-1.5 font-normal">Couple (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {CP_DAYS.map((day) => (
                      <tr key={day}>
                        <td className="py-1 pr-2 font-medium w-10">{day}</td>
                        {(["women", "men", "couple"] as const).map((field) => (
                          <td key={field} className="py-1 px-1">
                            <Input type="number" min={0}
                              placeholder={field === "women" ? priceWomen || "--" : field === "men" ? priceMen || "--" : priceCouple || "--"}
                              value={dayPricingOverrides[day]?.[field] ?? ""}
                              onChange={(e) => setDayPrice(day, field, e.target.value)}
                              className="bg-black/40 border-white/10 h-7 px-1.5 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* -- Event Types -------------------------------------------------- */}
          <section className="rounded-xl border border-white/8 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Event Types</p>
            <div className="flex flex-wrap gap-1.5">
              {PUB_EVENT_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => togglePubEventType(t)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border transition-colors",
                    pubEventTypes.includes(t) ? "bg-primary/20 border-primary/50 text-primary" : "border-white/10 text-white/60 hover:bg-white/5",
                  )}>
                  {t}
                </button>
              ))}
            </div>
          </section>

          {/* -- Free Entry --------------------------------------------------- */}
          <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
            <button type="button" onClick={() => setFreeEntryEnabled((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-emerald-500/10 transition-colors">
              <span className="flex items-center gap-2.5 text-sm font-medium text-emerald-400">
                <span className={cn(
                  "inline-flex h-4 w-4 items-center justify-center rounded border",
                  freeEntryEnabled ? "border-emerald-500 bg-emerald-500" : "border-emerald-500/40 bg-transparent",
                )}>
                  {freeEntryEnabled && <Check className="h-3 w-3 text-black" />}
                </span>
                Free Entry
              </span>
              <ChevronDown className={cn("h-4 w-4 text-emerald-400 transition-transform", freeEntryEnabled && "rotate-180")} />
            </button>
            {freeEntryEnabled && (
              <div className="space-y-3 px-4 pb-4 pt-1">
                <div>
                  <Label className="text-xs text-white/60 mb-1.5 block">Free for which genders? <span className="text-red-400">*</span></Label>
                  <div className="flex flex-wrap gap-2">
                    {CP_GENDERS.map(({ canon, label }) => (
                      <button key={canon} type="button" onClick={() => toggleFreeEntryGender(canon)}
                        className={cn(
                          "text-xs px-3 py-1.5 rounded-full border",
                          freeEntryGenders.includes(canon) ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "border-white/10 text-white/60 hover:bg-white/5",
                        )}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-white/60 mb-1.5 block">Valid on which days? <span className="text-red-400">*</span></Label>
                  <div className="flex flex-wrap gap-2">
                    {CP_DAYS.map((d) => (
                      <button key={d} type="button" onClick={() => toggleFreeEntryDay(d)}
                        className={cn(
                          "text-xs px-3 py-1.5 rounded-full border",
                          freeEntryDays.includes(d) ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "border-white/10 text-white/60 hover:bg-white/5",
                        )}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/60 block">Before time (optional, e.g. 22:00)</Label>
                  <Input placeholder="HH:MM" value={freeEntryBeforeTime}
                    onChange={(e) => setFreeEntryBeforeTime(e.target.value)}
                    className="bg-black/40 border-white/10 w-32 text-sm" />
                </div>
              </div>
            )}
          </section>

          {/* -- Venue Details ------------------------------------------------ */}
          <section className="rounded-xl border border-white/8 p-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Venue Details</p>

            <div className="space-y-1.5">
              <Label>Dance Floor</Label>
              <Select value={danceFloor === "" ? "none-selected" : danceFloor}
                onValueChange={(v) => setDanceFloor(v === "none-selected" ? "" : v)}>
                <SelectTrigger className="w-52 bg-black/40 border-white/10"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none-selected">Not specified</SelectItem>
                  <SelectItem value="dedicated">Dedicated dance floor</SelectItem>
                  <SelectItem value="general">General area</SelectItem>
                  <SelectItem value="none">No dance floor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Dance Floor Photos</Label>
              {danceFloorPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {danceFloorPhotos.map((src, i) => (
                    <div key={i} className="relative w-20 h-16 rounded-lg overflow-hidden border border-white/10">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setDanceFloorPhotos((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/70 flex items-center justify-center text-white">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {danceFloorPhotos.length < 6 && (
                <label className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-white/20 text-sm text-muted-foreground cursor-pointer hover:border-white/40 transition-colors w-fit",
                  danceFloorUploading > 0 && "opacity-50 pointer-events-none",
                )}>
                  <ImageIcon className="h-4 w-4" />
                  {danceFloorUploading > 0 ? `Uploading ${danceFloorUploading}...` : `Add dance floor photos (${danceFloorPhotos.length}/6)`}
                  <input type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => handleDanceFloorUpload(e.target.files)} />
                </label>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Pub Menu (images)</Label>
              {menuUrls.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {menuUrls.map((src, i) => (
                    <div key={i} className="relative w-20 h-16 rounded-lg overflow-hidden border border-white/10">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setMenuUrls((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/70 flex items-center justify-center text-white">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {menuUrls.length < 6 && (
                <label className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-white/20 text-sm text-muted-foreground cursor-pointer hover:border-white/40 transition-colors w-fit",
                  menuUploading > 0 && "opacity-50 pointer-events-none",
                )}>
                  <Upload className="h-4 w-4" />
                  {menuUploading > 0 ? `Uploading ${menuUploading}...` : `Add menu images (${menuUrls.length}/6)`}
                  <input type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => handleMenuUpload(e.target.files)} />
                </label>
              )}
            </div>
          </section>

          <div className="flex gap-3">
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? "Creating..." : `Create ${lookupResult.vendor?.category === "Club" ? "Club" : "Pub"} for ${lookupResult.user.name}`}
            </Button>
            <Button type="button" variant="outline" onClick={resetLookup}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
