import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { apiGet, apiPost, apiPatch, apiPut, apiDelete, formatINR } from "@/lib/api";
import { uploadImage, validateImageFile } from "@/lib/uploadImage";
import { useToast } from "@/hooks/use-toast";
import { SEO } from "@/components/SEO";
import { TonightVisibilityFields } from "@/components/TonightVisibilityFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LocationSelect } from "@/components/LocationSelect";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import {
  CalendarDays, LayoutGrid, Plus, Ticket, Settings, ImagePlus, Trash2, Pencil,
  Users, Sparkles, CheckCircle2, Clock, XCircle, ArrowLeft, ExternalLink, X,
  ScanLine, UserCog, Camera, CameraOff, Mail, Shield, Wallet, TrendingUp, Banknote,
  BarChart3, Tag, Megaphone, Download, Eye, User, Phone, MapPin, Check, ChevronsUpDown, CalendarX2,
} from "lucide-react";

// ─── shared types (mirror api-server/src/routes/organizers.ts) ──────────────

interface Organizer {
  id: number; name: string; slug: string; description: string;
  logoUrl: string; coverImageUrl: string; website: string;
  instagram: string; facebook: string; youtube: string;
  supportEmail: string; supportPhone: string; city: string; state: string;
  verified: boolean; status: string;
}
interface Artist { name: string; role: string; imageUrl: string; bio: string; socials: string; }
interface ScheduleItem { time: string; title: string; desc: string; }
interface Policies { dressCode: string; entryRules: string; agePolicy: string; refundPolicy: string; cancellationPolicy: string; }
interface Faq { q: string; a: string; }
export interface OrganizerEvent {
  id: number; title: string; slug: string; category: string; subcategory: string;
  shortDescription: string; description: string; tags: string[]; language: string; ageRestriction: string;
  coverImageUrl: string; bannerUrl: string; mobileBannerUrl: string; galleryImages: string[]; promoVideos: string[];
  venueName: string; address: string; mapsUrl: string; capacity: number; country: string; city: string; state: string;
  startDate: string | null; endDate: string | null; startTime: string; endTime: string; isMultiDay: boolean;
  happeningTonight?: boolean; startingSoon?: boolean; lastMinuteDeal?: boolean; dealLabel?: string;
  artists: Artist[] | null; highlights: string[] | null; schedule: ScheduleItem[] | null;
  policies: Policies | null; faqs: Faq[] | null;
  approvalStatus: string; rejectionReason: string;
  venueId?: number | null; venueApprovalStatus?: string; venueRejectionReason?: string;
}
interface TicketTier {
  id: number; type: string; name: string; description: string; price: string;
  quantity: number; soldCount: number; bookingLimit: number;
  salesStartAt: string | null; salesEndAt: string | null; active: boolean;
}

const EVENT_CATEGORIES = ["Ladies Night", "DJ Night", "Live Music", "Karaoke", "Theme Party", "Pool Party", "Open Mics", "Standup Shows", "Concert", "Festival", "Sports", "Other"];
const HIGHLIGHT_OPTIONS = ["Free Drinks", "VIP Access", "Complimentary Entry", "Food Included", "Meet & Greet", "Special Benefits"];
const TICKET_TYPES = [
  { value: "free", label: "Free" }, { value: "paid", label: "Paid" },
  { value: "early_bird", label: "Early Bird" }, { value: "vip", label: "VIP" },
  { value: "couple", label: "Couple Pass" }, { value: "group", label: "Group Pass" },
  { value: "student", label: "Student Pass" },
];

// ─── shared small components ────────────────────────────────────────────────

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={
      "rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent " +
      "backdrop-blur-xl shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)] " + className
    }>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-serif text-lg text-white mb-3 flex items-center gap-2">{children}</h3>;
}

function ImageUploadField({
  label, value, onChange,
}: { label: string; value: string; onChange: (url: string) => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { toast({ title: err, variant: "destructive" }); return; }
    setBusy(true);
    try {
      const url = await uploadImage(file);
      onChange(url);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Label className="text-white/70 text-xs uppercase tracking-wider">{label}</Label>
      <div className="mt-1.5 flex items-center gap-3">
        <label className="relative cursor-pointer">
          <div className="h-20 w-20 rounded-xl border border-dashed border-white/15 bg-white/[0.03] flex items-center justify-center overflow-hidden hover:border-primary/40 transition-colors">
            {value
              ? <img src={value} alt={label} className="h-full w-full object-cover" />
              : busy ? <Spinner /> : <ImagePlus className="h-5 w-5 text-white/40" />}
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={handle} />
        </label>
        {value && (
          <Button type="button" variant="ghost" size="sm" className="text-white/50 hover:text-red-400" onClick={() => onChange("")}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

const inputCls = "bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary/40";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    approved: { cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: <CheckCircle2 className="h-3 w-3" />, label: "Approved" },
    pending: { cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", icon: <Clock className="h-3 w-3" />, label: "Pending review" },
    rejected: { cls: "bg-red-500/15 text-red-300 border-red-500/30", icon: <XCircle className="h-3 w-3" />, label: "Rejected" },
  };
  const s = map[status] ?? map["pending"]!;
  return <Badge className={`gap-1 border ${s.cls}`}>{s.icon}{s.label}</Badge>;
}

// ════════════════════════════════════════════════════════════════════════════
// BECOME ORGANIZER (onboarding)
// ════════════════════════════════════════════════════════════════════════════

export function BecomeOrganizer() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: me, isLoading } = useGetMe();
  const [form, setForm] = useState({
    name: "", description: "", city: "", state: "",
    website: "", instagram: "", facebook: "", youtube: "",
    supportEmail: "", supportPhone: "", logoUrl: "", coverImageUrl: "",
  });
  // Organizers store only city + state; a local country (default India) drives
  // the dependent LocationSelect cascade.
  const [country, setCountry] = useState("India");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && me?.user?.role === "organizer") setLocation("/dashboard/organizer");
  }, [me, isLoading, setLocation]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.name.trim()) { toast({ title: "Organizer name is required", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      await apiPost("/api/organizer/profile", form);
      toast({ title: "Welcome aboard!", description: "Your organizer account is ready. Set up your first event." });
      // hard reload so useGetMe picks up the new role
      window.location.href = "/dashboard/organizer";
    } catch (e: any) {
      toast({ title: "Could not create organizer profile", description: e?.message, variant: "destructive" });
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-black">
      <SEO title="Become an Event Organizer | Royvento" canonical="/dashboard/become-organizer" noindex />
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-black to-black" />
        <div className="relative max-w-3xl mx-auto px-4 py-14 text-center">
          <Badge className="mb-4 bg-primary/15 text-primary border border-primary/30 gap-1"><Sparkles className="h-3 w-3" /> Event Organizer</Badge>
          <h1 className="font-serif text-3xl md:text-4xl text-white">Host ticketed events on Royvento</h1>
          <p className="mt-3 text-white/60 max-w-xl mx-auto">Create a premium organizer profile, publish events with tiered tickets, and reach Royvento's nightlife audience.</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <GlassCard className="p-6 space-y-4">
          <SectionTitle><Settings className="h-4 w-4 text-primary" /> Organizer brand</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-white/70 text-xs uppercase tracking-wider">Organizer name *</Label>
              <Input className={inputCls + " mt-1.5"} value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Midnight Live Co." />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-white/70 text-xs uppercase tracking-wider">Brand description</Label>
              <Textarea className={inputCls + " mt-1.5"} value={form.description} onChange={(e) => set("description")(e.target.value)} rows={3} placeholder="Tell guests what your events are about." />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-white/70 text-xs uppercase tracking-wider">Country / State / City</Label>
              <LocationSelect className="mt-1.5" country={country} state={form.state} city={form.city}
                onChange={(n) => { setCountry(n.country); setForm((f) => ({ ...f, state: n.state, city: n.city })); }} />
            </div>
            <ImageUploadField label="Logo" value={form.logoUrl} onChange={set("logoUrl")} />
            <ImageUploadField label="Cover image" value={form.coverImageUrl} onChange={set("coverImageUrl")} />
          </div>
        </GlassCard>

        <GlassCard className="p-6 space-y-4">
          <SectionTitle><ExternalLink className="h-4 w-4 text-primary" /> Links & support</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ["website", "Website"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["youtube", "YouTube"],
              ["supportEmail", "Support email"], ["supportPhone", "Support phone"],
            ] as const).map(([k, label]) => (
              <div key={k}>
                <Label className="text-white/70 text-xs uppercase tracking-wider">{label}</Label>
                <Input className={inputCls + " mt-1.5"} value={form[k]} onChange={(e) => set(k)(e.target.value)} />
              </div>
            ))}
          </div>
        </GlassCard>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" className="text-white/60" asChild><Link href="/dashboard/profile">Cancel</Link></Button>
          <Button onClick={submit} disabled={submitting} className="bg-primary hover:bg-primary/90 text-white min-w-36">
            {submitting ? <Spinner /> : "Create organizer account"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ORGANIZER DASHBOARD
// ════════════════════════════════════════════════════════════════════════════

type Tab = "overview" | "identity" | "events" | "create" | "scanner" | "managers" | "earnings" | "insights" | "leads" | "coupons" | "promote" | "profile";

export function OrganizerDashboard() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [organizer, setOrganizer] = useState<Organizer | null | undefined>(undefined);
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);

  const [overview, setOverview] = useState<{ tickets: number; revenue: string } | null>(null);

  const loadProfile = useCallback(() => {
    apiGet<Organizer>("/api/organizer/profile").then(setOrganizer).catch(() => setOrganizer(null));
  }, []);
  const loadEvents = useCallback(() => {
    apiGet<OrganizerEvent[]>("/api/organizer/events").then(setEvents).catch(() => {});
  }, []);
  const loadOverview = useCallback(() => {
    apiGet<{ totals: { tickets: number; revenue: string } }>("/api/organizer/analytics")
      .then((a) => setOverview(a.totals)).catch(() => {});
  }, []);

  useEffect(() => { loadProfile(); loadEvents(); loadOverview(); }, [loadProfile, loadEvents, loadOverview]);

  if (organizer === undefined) {
    return <div className="flex items-center justify-center py-32 bg-black min-h-[100dvh]"><Spinner /></div>;
  }
  if (organizer === null) {
    return (
      <div className="min-h-[100dvh] bg-black flex flex-col items-center justify-center text-center px-4 gap-4">
        <p className="text-white/70">No organizer profile found for this account.</p>
        <Button asChild className="bg-primary text-white"><Link href="/dashboard/become-organizer">Set up organizer account</Link></Button>
      </div>
    );
  }

  const NAV: { value: Tab; label: string; icon: React.ReactNode }[] = [
    { value: "overview", label: "Overview", icon: <LayoutGrid className="h-4 w-4" /> },
    { value: "identity", label: "Profile", icon: <User className="h-4 w-4" /> },
    { value: "events", label: "Events", icon: <CalendarDays className="h-4 w-4" /> },
    { value: "create", label: "Create Event", icon: <Plus className="h-4 w-4" /> },
    { value: "scanner", label: "Scanner", icon: <ScanLine className="h-4 w-4" /> },
    { value: "managers", label: "Managers", icon: <UserCog className="h-4 w-4" /> },
    { value: "earnings", label: "Earnings", icon: <Wallet className="h-4 w-4" /> },
    { value: "insights", label: "Insights", icon: <BarChart3 className="h-4 w-4" /> },
    { value: "leads", label: "Leads", icon: <Eye className="h-4 w-4" /> },
    { value: "coupons", label: "Coupons", icon: <Tag className="h-4 w-4" /> },
    { value: "promote", label: "Promote", icon: <Megaphone className="h-4 w-4" /> },
    { value: "profile", label: "Profile Settings", icon: <Settings className="h-4 w-4" /> },
  ];

  const ticketsSold = overview?.tickets ?? 0;
  const approvedCount = events.filter((e) => e.approvalStatus === "approved").length;

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <SEO title="Event Management | Royvento" canonical="/dashboard/organizer" noindex />
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-white/[0.06] h-[100dvh] px-3 py-5 sticky top-0">
          <div className="px-3 pb-5 mb-3 border-b border-white/[0.06] shrink-0">
            <p className="font-serif text-lg leading-none">{organizer.name}</p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/40 mt-1.5">Event Management</p>
            <div className="mt-2"><StatusBadge status={organizer.status} /></div>
          </div>
          <nav className="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto -mr-1 pr-1">
            {NAV.map((n) => (
              <button
                key={n.value}
                onClick={() => { setTab(n.value); if (n.value === "create") setEditingId("new"); }}
                className={
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all " +
                  (tab === n.value
                    ? "bg-gradient-to-r from-primary/20 to-transparent border border-primary/25 text-white"
                    : "text-white/55 hover:text-white hover:bg-white/[0.04] border border-transparent")
                }
              >
                {n.icon}{n.label}
              </button>
            ))}
          </nav>
          <div className="pt-4 shrink-0">
            <Button variant="ghost" asChild className="w-full justify-start text-white/50 hover:text-white">
              <Link href={`/organizers/${organizer.slug}`}><ExternalLink className="h-4 w-4 mr-2" /> View public page</Link>
            </Button>
          </div>
        </aside>

        {/* Mobile tab bar — horizontally scrollable so all tabs are reachable */}
        <div className="md:hidden fixed bottom-0 inset-x-0 z-40 flex overflow-x-auto border-t border-white/10 bg-black/95 backdrop-blur">
          {NAV.map((n) => (
            <button key={n.value} onClick={() => { setTab(n.value); if (n.value === "create") setEditingId("new"); }}
              className={"shrink-0 min-w-[68px] flex flex-col items-center gap-1 py-2.5 text-[10px] " + (tab === n.value ? "text-primary" : "text-white/50")}>
              {n.icon}{n.label}
            </button>
          ))}
        </div>

        {/* Main */}
        <main className="flex-1 px-4 md:px-8 py-6 pb-24 md:pb-8 max-w-5xl">
          {tab === "overview" && (
            <div className="space-y-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Event Management</p>
                <h1 className="font-serif text-2xl md:text-3xl">Welcome, {organizer.name}</h1>
              </div>
              {organizer.status !== "approved" && (
                <GlassCard className="p-4 border-amber-500/20 bg-amber-500/[0.05]">
                  <p className="text-amber-200 text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Your organizer profile is {organizer.status}. An admin will review it shortly — you can still create events in the meantime.</p>
                </GlassCard>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <GlassCard className="p-5"><p className="text-white/50 text-xs uppercase tracking-wider">Total events</p><p className="text-3xl font-serif mt-1">{events.length}</p></GlassCard>
                <GlassCard className="p-5"><p className="text-white/50 text-xs uppercase tracking-wider">Approved (live)</p><p className="text-3xl font-serif mt-1">{approvedCount}</p></GlassCard>
                <GlassCard className="p-5"><p className="text-white/50 text-xs uppercase tracking-wider">Tickets sold</p><p className="text-3xl font-serif mt-1">{ticketsSold}</p></GlassCard>
              </div>
              <Button onClick={() => { setTab("create"); setEditingId("new"); }} className="bg-primary text-white"><Plus className="h-4 w-4 mr-2" /> Create new event</Button>
            </div>
          )}

          {tab === "identity" && (
            <ProfileBasics organizer={organizer} onSaved={loadProfile} />
          )}

          {tab === "events" && (
            <EventsList events={events} onEdit={(id) => { setEditingId(id); setTab("create"); }} onChanged={loadEvents} />
          )}

          {tab === "create" && (
            <EventEditor
              eventId={editingId === "new" ? null : editingId}
              onDone={() => { loadEvents(); setTab("events"); setEditingId(null); }}
              onCancel={() => { setTab("events"); setEditingId(null); }}
            />
          )}

          {tab === "scanner" && <ScannerPanel />}

          {tab === "managers" && <ManagersPanel />}

          {tab === "earnings" && <EarningsPanel />}

          {tab === "insights" && <InsightsPanel events={events} />}

          {tab === "leads" && <LeadsPanel />}

          {tab === "coupons" && <CouponsPanel events={events} />}

          {tab === "promote" && <PromotePanel events={events} />}

          {tab === "profile" && (
            <ProfileSettings organizer={organizer} onSaved={loadProfile} />
          )}
        </main>
      </div>
    </div>
  );
}

// ─── events list ─────────────────────────────────────────────────────────────

function EventsList({ events, onEdit, onChanged }: { events: OrganizerEvent[]; onEdit: (id: number) => void; onChanged: () => void }) {
  const { toast } = useToast();
  async function remove(id: number) {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    try { await apiDelete(`/api/organizer/events/${id}`); toast({ title: "Event deleted" }); onChanged(); }
    catch (e: any) { toast({ title: "Delete failed", description: e?.message, variant: "destructive" }); }
  }
  if (events.length === 0) {
    return <GlassCard className="p-10 text-center"><CalendarDays className="h-10 w-10 mx-auto text-white/30 mb-3" /><p className="text-white/60">No events yet. Create your first one.</p></GlassCard>;
  }
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">Your events</h1>
      <div className="grid gap-3">
        {events.map((e) => (
          <GlassCard key={e.id} className="p-4 flex items-center gap-4">
            <div className="h-16 w-24 rounded-lg overflow-hidden bg-white/5 shrink-0">
              {e.coverImageUrl ? <img src={e.coverImageUrl} alt={e.title} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center"><CalendarDays className="h-5 w-5 text-white/30" /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{e.title}</p>
              <p className="text-white/50 text-sm truncate">{e.category || "—"} · {e.city || "—"} · {e.startDate || "no date"}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <StatusBadge status={e.approvalStatus} />
                {e.venueId ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-white/50"><MapPin className="h-3 w-3" />
                    {e.venueApprovalStatus === "approved" ? "Venue approved"
                      : e.venueApprovalStatus === "rejected" ? "Venue declined"
                      : "Awaiting venue approval"}
                  </span>
                ) : null}
              </div>
              {e.approvalStatus === "rejected" && e.rejectionReason && <p className="text-red-300/80 text-xs mt-1">Reason: {e.rejectionReason}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {e.approvalStatus === "approved" && (
                <Button variant="ghost" size="sm" asChild className="text-white/50 hover:text-white"><Link href={`/organizer-events/${e.slug}`}><ExternalLink className="h-4 w-4" /></Link></Button>
              )}
              <Button variant="ghost" size="sm" className="text-white/60 hover:text-white" onClick={() => onEdit(e.id)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" className="text-white/50 hover:text-red-400" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

// ─── event editor (create + edit, all field groups) ─────────────────────────

const EMPTY_POLICIES: Policies = { dressCode: "", entryRules: "", agePolicy: "", refundPolicy: "", cancellationPolicy: "" };

// Endpoint + UI config so the same editor serves both the organizer (their own
// events) and the host venue partner (events at their venue, via /partner/*).
export interface EventEditorApi {
  getEvent: (id: number) => string;
  saveEvent: (id: number) => string;
  createEvent: string;
  ticketsList: (id: number) => string;
  ticketCreate: (id: number) => string;
  ticketUpdate: (tid: number) => string;
  ticketDelete: (tid: number) => string;
  showVenuePicker: boolean;
  showHeader: boolean;
  editedToast: string;
}

const ORGANIZER_EVENT_API: EventEditorApi = {
  getEvent: (id) => `/api/organizer/events/${id}`,
  saveEvent: (id) => `/api/organizer/events/${id}`,
  createEvent: "/api/organizer/events",
  ticketsList: (id) => `/api/organizer/events/${id}/tickets`,
  ticketCreate: (id) => `/api/organizer/events/${id}/tickets`,
  ticketUpdate: (tid) => `/api/organizer/tickets/${tid}`,
  ticketDelete: (tid) => `/api/organizer/tickets/${tid}`,
  showVenuePicker: true,
  showHeader: true,
  editedToast: "Event updated — sent for re-approval",
};

// Config for an admin authoring an organizer event from the Venues tab. The
// event is created unassigned (sentinel organizer 0) and an organizer is linked
// later. By-id routes use the singular "/admin/organizer-event/:id" prefix.
export const ADMIN_EVENT_API: EventEditorApi = {
  getEvent: (id) => `/api/admin/organizer-event/${id}`,
  saveEvent: (id) => `/api/admin/organizer-event/${id}`,
  createEvent: "/api/admin/organizer-events",
  ticketsList: (id) => `/api/admin/organizer-event/${id}/tickets`,
  ticketCreate: (id) => `/api/admin/organizer-event/${id}/tickets`,
  ticketUpdate: (tid) => `/api/admin/organizer-ticket/${tid}`,
  ticketDelete: (tid) => `/api/admin/organizer-ticket/${tid}`,
  // The host-venue picker calls the organizer-only /api/organizer/host-venues
  // endpoint (403 for admins), so hide it here — admins set venue details
  // manually and link an organizer later instead.
  showVenuePicker: false,
  showHeader: true,
  editedToast: "Event updated",
};

// Config for the venue partner editing an event hosted at their venue. The venue
// link can't be changed here, so the host picker is hidden.
export function partnerEventApi(vq: string): EventEditorApi {
  return {
    getEvent: (id) => `/api/partner/organizer-events/${id}${vq}`,
    saveEvent: (id) => `/api/partner/organizer-events/${id}${vq}`,
    createEvent: "",
    ticketsList: (id) => `/api/partner/organizer-events/${id}/tickets${vq}`,
    ticketCreate: (id) => `/api/partner/organizer-events/${id}/tickets${vq}`,
    ticketUpdate: (tid) => `/api/partner/organizer-tickets/${tid}${vq}`,
    ticketDelete: (tid) => `/api/partner/organizer-tickets/${tid}${vq}`,
    showVenuePicker: false,
    showHeader: false,
    editedToast: "Event updated",
  };
}

export function EventEditor({ eventId, onDone, onCancel, api = ORGANIZER_EVENT_API }: { eventId: number | null; onDone: (created?: OrganizerEvent) => void; onCancel: () => void; api?: EventEditorApi }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(eventId != null);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<OrganizerEvent>(() => blankEvent());
  const isEdit = eventId != null;

  useEffect(() => {
    if (eventId == null) { setF(blankEvent()); setLoading(false); return; }
    setLoading(true);
    apiGet<OrganizerEvent & { tickets: TicketTier[] }>(api.getEvent(eventId))
      .then((data) => setF({ ...blankEvent(), ...data }))
      .catch(() => toast({ title: "Could not load event", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [eventId, toast, api]);

  const upd = <K extends keyof OrganizerEvent>(k: K, v: OrganizerEvent[K]) => setF((p) => ({ ...p, [k]: v }));

  // Selecting a host venue auto-fills the venue fields (kept editable). Clearing
  // it drops the link so the event follows the normal admin-approval path.
  const onVenueSelect = (v: VenueOption | null) => {
    if (!v) { setF((p) => ({ ...p, venueId: null })); return; }
    setF((p) => ({
      ...p,
      venueId: v.id,
      venueName: v.businessName,
      address: v.address || p.address,
      country: v.country || p.country,
      city: v.city || p.city,
      state: v.state || p.state,
    }));
  };

  async function save() {
    if (!f.title.trim()) { toast({ title: "Event name is required", variant: "destructive" }); return; }
    setSaving(true);
    const body = { ...f };
    try {
      if (isEdit) {
        await apiPatch(api.saveEvent(eventId), body);
        toast({ title: api.editedToast });
        onDone();
      } else {
        const created = await apiPost<OrganizerEvent>(api.createEvent, body);
        toast({ title: "Event created", description: f.venueId ? "Add ticket tiers — then the venue partner approves it." : "Add ticket tiers, then it goes for admin approval." });
        // Pass the created event back so callers can jump into edit mode (to add
        // ticket tiers). Existing callers ignore the argument.
        onDone(created);
      }
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-5">
      {api.showHeader && (
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-white/60" onClick={onCancel}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <h1 className="font-serif text-2xl">{isEdit ? "Edit event" : "Create event"}</h1>
        </div>
      )}

      {/* BASIC */}
      <GlassCard className="p-6 space-y-4">
        <SectionTitle><Sparkles className="h-4 w-4 text-primary" /> Basic details</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Event name *" full><Input className={inputCls} value={f.title} onChange={(e) => upd("title", e.target.value)} /></Field>
          {api.showVenuePicker && (
            <Field label="Host venue (pub / club / bar / lounge)" full>
              <VenuePicker value={f.venueId} onSelect={onVenueSelect} />
              {f.venueId ? (
                <p className="text-xs text-primary/80 mt-1.5 flex items-center gap-1.5"><MapPin className="h-3 w-3" /> Sent to this venue for approval before going public. Once approved, it shows on the venue's page too.</p>
              ) : (
                <p className="text-xs text-white/40 mt-1.5">Optional. Pick a venue to host the event there — the venue partner approves it and it's listed on their page as well.</p>
              )}
            </Field>
          )}
          <Field label="Category">
            <Select value={f.category} onValueChange={(v) => upd("category", v)}>
              <SelectTrigger className={inputCls}><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{EVENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Subcategory"><Input className={inputCls} value={f.subcategory} onChange={(e) => upd("subcategory", e.target.value)} /></Field>
          <Field label="Short description" full><Input className={inputCls} value={f.shortDescription} onChange={(e) => upd("shortDescription", e.target.value)} placeholder="One-line teaser" /></Field>
          <Field label="Full description" full><Textarea className={inputCls} rows={4} value={f.description} onChange={(e) => upd("description", e.target.value)} /></Field>
          <Field label="Language"><Input className={inputCls} value={f.language} onChange={(e) => upd("language", e.target.value)} placeholder="Hindi, English" /></Field>
          <Field label="Age restriction"><Input className={inputCls} value={f.ageRestriction} onChange={(e) => upd("ageRestriction", e.target.value)} placeholder="18+ / All ages" /></Field>
        </div>
      </GlassCard>

      {/* MEDIA */}
      <GlassCard className="p-6 space-y-4">
        <SectionTitle><ImagePlus className="h-4 w-4 text-primary" /> Media</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <ImageUploadField label="Cover image" value={f.coverImageUrl} onChange={(v) => upd("coverImageUrl", v)} />
          <ImageUploadField label="Event banner" value={f.bannerUrl} onChange={(v) => upd("bannerUrl", v)} />
        </div>
        <GalleryEditor images={f.galleryImages || []} onChange={(imgs) => upd("galleryImages", imgs)} />
        <Field label="Promo video URLs (comma separated)" full><Input className={inputCls} value={(f.promoVideos || []).join(", ")} onChange={(e) => upd("promoVideos", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="https://youtube.com/..." /></Field>
      </GlassCard>

      {/* VENUE */}
      <GlassCard className="p-6 space-y-4">
        <SectionTitle><Users className="h-4 w-4 text-primary" /> Venue</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Venue name"><Input className={inputCls} value={f.venueName} onChange={(e) => upd("venueName", e.target.value)} /></Field>
          <Field label="Capacity"><Input type="number" className={inputCls} value={f.capacity || 0} onChange={(e) => upd("capacity", Number(e.target.value) || 0)} /></Field>
          <Field label="Address" full><Input className={inputCls} value={f.address} onChange={(e) => upd("address", e.target.value)} /></Field>
          <Field label="Google Maps URL" full><Input className={inputCls} value={f.mapsUrl} onChange={(e) => upd("mapsUrl", e.target.value)} /></Field>
          <Field label="Location (country / state / city)" full>
            <LocationSelect
              country={f.country || ""}
              state={f.state}
              city={f.city}
              onChange={(n) => setF((p) => ({ ...p, country: n.country, state: n.state, city: n.city }))}
            />
          </Field>
        </div>
      </GlassCard>

      {/* DATE & TIME */}
      <GlassCard className="p-6 space-y-4">
        <SectionTitle><CalendarDays className="h-4 w-4 text-primary" /> Date & time</SectionTitle>
        <div className="flex items-center gap-3 mb-2">
          <Switch checked={f.isMultiDay} onCheckedChange={(v) => upd("isMultiDay", v)} />
          <span className="text-sm text-white/70">Multi-day event</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date"><Input type="date" className={inputCls} value={f.startDate || ""} onChange={(e) => upd("startDate", e.target.value || null)} /></Field>
          {f.isMultiDay && <Field label="End date"><Input type="date" className={inputCls} value={f.endDate || ""} onChange={(e) => upd("endDate", e.target.value || null)} /></Field>}
          <Field label="Start time"><Input type="time" className={inputCls} value={f.startTime} onChange={(e) => upd("startTime", e.target.value)} /></Field>
          <Field label="End time"><Input type="time" className={inputCls} value={f.endTime} onChange={(e) => upd("endTime", e.target.value)} /></Field>
        </div>
      </GlassCard>

      {/* HAPPENING TONIGHT */}
      <TonightVisibilityFields
        showTimes={false}
        value={{
          startTime: f.startTime, endTime: f.endTime,
          happeningTonight: f.happeningTonight ?? true,
          startingSoon: f.startingSoon ?? true,
          lastMinuteDeal: f.lastMinuteDeal ?? false,
          dealLabel: f.dealLabel ?? "",
        }}
        onChange={(v) => setF((p) => ({ ...p, happeningTonight: v.happeningTonight, startingSoon: v.startingSoon, lastMinuteDeal: v.lastMinuteDeal, dealLabel: v.dealLabel }))}
      />

      {/* ARTISTS */}
      <GlassCard className="p-6 space-y-4">
        <SectionTitle><Users className="h-4 w-4 text-primary" /> Artists & performers</SectionTitle>
        <RepeatableArtists artists={f.artists || []} onChange={(a) => upd("artists", a)} />
      </GlassCard>

      {/* HIGHLIGHTS */}
      <GlassCard className="p-6 space-y-3">
        <SectionTitle><Sparkles className="h-4 w-4 text-primary" /> Event highlights</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {HIGHLIGHT_OPTIONS.map((h) => {
            const on = (f.highlights || []).includes(h);
            return (
              <button key={h} type="button"
                onClick={() => upd("highlights", on ? (f.highlights || []).filter((x) => x !== h) : [...(f.highlights || []), h])}
                className={"px-3 py-1.5 rounded-full text-sm border transition-colors " + (on ? "bg-primary/20 border-primary/40 text-white" : "bg-white/[0.03] border-white/10 text-white/60 hover:text-white")}>
                {h}
              </button>
            );
          })}
        </div>
      </GlassCard>

      {/* SCHEDULE */}
      <GlassCard className="p-6 space-y-4">
        <SectionTitle><Clock className="h-4 w-4 text-primary" /> Schedule / timeline</SectionTitle>
        <RepeatableSchedule items={f.schedule || []} onChange={(s) => upd("schedule", s)} />
      </GlassCard>

      {/* POLICIES */}
      <GlassCard className="p-6 space-y-4">
        <SectionTitle><Settings className="h-4 w-4 text-primary" /> Policies</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          {([
            ["dressCode", "Dress code"], ["entryRules", "Entry rules"], ["agePolicy", "Age policy"],
            ["refundPolicy", "Refund policy"], ["cancellationPolicy", "Cancellation policy"],
          ] as const).map(([k, label]) => (
            <Field key={k} label={label} full={k === "refundPolicy" || k === "cancellationPolicy"}>
              <Textarea className={inputCls} rows={2} value={(f.policies || EMPTY_POLICIES)[k]} onChange={(e) => upd("policies", { ...(f.policies || EMPTY_POLICIES), [k]: e.target.value })} />
            </Field>
          ))}
        </div>
      </GlassCard>

      {/* FAQ */}
      <GlassCard className="p-6 space-y-4">
        <SectionTitle><Sparkles className="h-4 w-4 text-primary" /> FAQ</SectionTitle>
        <RepeatableFaqs faqs={f.faqs || []} onChange={(q) => upd("faqs", q)} />
      </GlassCard>

      {/* TICKETS (edit mode only — needs an event id) */}
      {isEdit
        ? <TicketManager eventId={eventId!} api={api} />
        : <GlassCard className="p-5 text-sm text-white/55 flex items-center gap-2"><Ticket className="h-4 w-4 text-primary" /> Save the event first, then add ticket tiers from its edit screen.</GlassCard>}

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" className="text-white/60" onClick={onCancel}>Cancel</Button>
        <Button onClick={save} disabled={saving} className="bg-primary text-white min-w-32">{saving ? <Spinner /> : isEdit ? "Save changes" : "Create event"}</Button>
      </div>
    </div>
  );
}

function blankEvent(): OrganizerEvent {
  return {
    id: 0, title: "", slug: "", category: "", subcategory: "", shortDescription: "", description: "",
    tags: [], language: "", ageRestriction: "", coverImageUrl: "", bannerUrl: "", mobileBannerUrl: "",
    galleryImages: [], promoVideos: [], venueName: "", address: "", mapsUrl: "", capacity: 0, country: "India", city: "", state: "",
    startDate: null, endDate: null, startTime: "", endTime: "", isMultiDay: false,
    happeningTonight: true, startingSoon: true, lastMinuteDeal: false, dealLabel: "",
    artists: [], highlights: [], schedule: [], policies: { ...EMPTY_POLICIES }, faqs: [],
    approvalStatus: "pending", rejectionReason: "",
    venueId: null, venueApprovalStatus: "", venueRejectionReason: "",
  };
}

// ─── host-venue picker (searchable pub/club/bar/lounge dropdown) ────────────

interface VenueOption {
  id: number; businessName: string; category: string;
  country: string; city: string; state: string; address: string | null;
}

function VenuePicker({ value, onSelect }: { value: number | null | undefined; onSelect: (v: VenueOption | null) => void }) {
  const [open, setOpen] = useState(false);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  useEffect(() => {
    apiGet<VenueOption[]>("/api/organizer/host-venues").then(setVenues).catch(() => setVenues([]));
  }, []);
  const selected = venues.find((v) => v.id === value) ?? null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={inputCls + " flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm"}
        >
          <span className={selected ? "truncate" : "text-white/40 truncate"}>
            {selected ? selected.businessName : "No venue — standalone event"}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-zinc-900 border-white/10 text-white" align="start">
        <Command className="bg-transparent">
          <CommandInput placeholder="Search pubs, clubs, bars, lounges…" className="text-white" />
          <CommandList>
            <CommandEmpty>No venues found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="none standalone no venue" onSelect={() => { onSelect(null); setOpen(false); }}>
                <span className="text-white/60">No venue — standalone event</span>
                {value == null && <Check className="ml-auto h-4 w-4" />}
              </CommandItem>
              {venues.map((v) => (
                <CommandItem
                  key={v.id}
                  value={`${v.businessName} ${v.category} ${v.city} ${v.state}`}
                  onSelect={() => { onSelect(v); setOpen(false); }}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{v.businessName}</span>
                    <span className="text-xs text-white/40 truncate">{[v.category, v.city].filter(Boolean).join(" · ")}</span>
                  </div>
                  {value === v.id && <Check className="ml-auto h-4 w-4 shrink-0" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <Label className="text-white/70 text-xs uppercase tracking-wider">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

// ─── repeatable sub-editors ─────────────────────────────────────────────────

function GalleryEditor({ images, onChange }: { images: string[]; onChange: (imgs: string[]) => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  async function add(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    const next = [...images];
    for (const file of files) {
      const err = validateImageFile(file);
      if (err) { toast({ title: err, variant: "destructive" }); continue; }
      try { next.push(await uploadImage(file)); } catch { toast({ title: "Upload failed", variant: "destructive" }); }
    }
    onChange(next); setBusy(false);
  }
  return (
    <div>
      <Label className="text-white/70 text-xs uppercase tracking-wider">Gallery images</Label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {images.map((src, i) => (
          <div key={i} className="relative h-20 w-20 rounded-lg overflow-hidden group">
            <img src={src} alt="" className="h-full w-full object-cover" />
            <button type="button" onClick={() => onChange(images.filter((_, j) => j !== i))} className="absolute top-1 right-1 bg-black/70 rounded-full p-0.5 opacity-0 group-hover:opacity-100"><X className="h-3 w-3 text-white" /></button>
          </div>
        ))}
        <label className="h-20 w-20 rounded-lg border border-dashed border-white/15 bg-white/[0.03] flex items-center justify-center cursor-pointer hover:border-primary/40">
          {busy ? <Spinner /> : <Plus className="h-5 w-5 text-white/40" />}
          <input type="file" accept="image/*" multiple className="hidden" onChange={add} />
        </label>
      </div>
    </div>
  );
}

function RepeatableArtists({ artists, onChange }: { artists: Artist[]; onChange: (a: Artist[]) => void }) {
  const blank: Artist = { name: "", role: "", imageUrl: "", bio: "", socials: "" };
  return (
    <div className="space-y-3">
      {artists.map((a, i) => (
        <div key={i} className="rounded-xl border border-white/10 p-4 grid gap-3 sm:grid-cols-2">
          <Input className={inputCls} placeholder="Artist / DJ name" value={a.name} onChange={(e) => onChange(artists.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
          <Input className={inputCls} placeholder="Role (DJ, Performer…)" value={a.role} onChange={(e) => onChange(artists.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} />
          <Input className={inputCls} placeholder="Image URL" value={a.imageUrl} onChange={(e) => onChange(artists.map((x, j) => j === i ? { ...x, imageUrl: e.target.value } : x))} />
          <Textarea className={inputCls + " sm:col-span-2"} rows={2} placeholder="Short bio" value={a.bio} onChange={(e) => onChange(artists.map((x, j) => j === i ? { ...x, bio: e.target.value } : x))} />
          <div className="sm:col-span-2 flex justify-end"><Button type="button" variant="ghost" size="sm" className="text-white/50 hover:text-red-400" onClick={() => onChange(artists.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 mr-1" /> Remove</Button></div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="border-white/15 text-white/70" onClick={() => onChange([...artists, blank])}><Plus className="h-4 w-4 mr-1" /> Add artist</Button>
    </div>
  );
}

function RepeatableSchedule({ items, onChange }: { items: ScheduleItem[]; onChange: (s: ScheduleItem[]) => void }) {
  const blank: ScheduleItem = { time: "", title: "", desc: "" };
  return (
    <div className="space-y-3">
      {items.map((s, i) => (
        <div key={i} className="rounded-xl border border-white/10 p-4 grid gap-3 sm:grid-cols-[120px_1fr_auto] items-start">
          <Input className={inputCls} placeholder="Time" value={s.time} onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, time: e.target.value } : x))} />
          <div className="grid gap-2">
            <Input className={inputCls} placeholder="Title" value={s.title} onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
            <Input className={inputCls} placeholder="Description" value={s.desc} onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))} />
          </div>
          <Button type="button" variant="ghost" size="sm" className="text-white/50 hover:text-red-400" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="border-white/15 text-white/70" onClick={() => onChange([...items, blank])}><Plus className="h-4 w-4 mr-1" /> Add slot</Button>
    </div>
  );
}

function RepeatableFaqs({ faqs, onChange }: { faqs: Faq[]; onChange: (q: Faq[]) => void }) {
  const blank: Faq = { q: "", a: "" };
  return (
    <div className="space-y-3">
      {faqs.map((q, i) => (
        <div key={i} className="rounded-xl border border-white/10 p-4 grid gap-2">
          <Input className={inputCls} placeholder="Question" value={q.q} onChange={(e) => onChange(faqs.map((x, j) => j === i ? { ...x, q: e.target.value } : x))} />
          <Textarea className={inputCls} rows={2} placeholder="Answer" value={q.a} onChange={(e) => onChange(faqs.map((x, j) => j === i ? { ...x, a: e.target.value } : x))} />
          <div className="flex justify-end"><Button type="button" variant="ghost" size="sm" className="text-white/50 hover:text-red-400" onClick={() => onChange(faqs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 mr-1" /> Remove</Button></div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="border-white/15 text-white/70" onClick={() => onChange([...faqs, blank])}><Plus className="h-4 w-4 mr-1" /> Add FAQ</Button>
    </div>
  );
}

// ─── ticket manager ──────────────────────────────────────────────────────────

function TicketManager({ eventId, api = ORGANIZER_EVENT_API }: { eventId: number; api?: EventEditorApi }) {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<TicketTier[]>([]);
  const [draft, setDraft] = useState<Partial<TicketTier> | null>(null);

  const load = useCallback(() => {
    apiGet<TicketTier[]>(api.ticketsList(eventId)).then(setTickets).catch(() => {});
  }, [eventId, api]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!draft?.name?.trim()) { toast({ title: "Ticket name required", variant: "destructive" }); return; }
    try {
      if (draft.id) await apiPatch(api.ticketUpdate(draft.id), draft);
      else await apiPost(api.ticketCreate(eventId), draft);
      toast({ title: "Ticket saved" }); setDraft(null); load();
    } catch (e: any) { toast({ title: "Save failed", description: e?.message, variant: "destructive" }); }
  }
  async function remove(id: number) {
    if (!confirm("Delete this ticket tier?")) return;
    try { await apiDelete(api.ticketDelete(id)); load(); } catch (e: any) { toast({ title: "Delete failed", description: e?.message, variant: "destructive" }); }
  }

  return (
    <GlassCard className="p-6 space-y-4">
      <SectionTitle><Ticket className="h-4 w-4 text-primary" /> Ticket tiers</SectionTitle>
      <div className="space-y-2">
        {tickets.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
            <Badge className="bg-white/[0.06] border border-white/10 text-white/70">{TICKET_TYPES.find((x) => x.value === t.type)?.label ?? t.type}</Badge>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{t.name}</p>
              <p className="text-white/50 text-xs">{Number(t.price) > 0 ? formatINR(Number(t.price)) : "Free"} · {t.quantity - t.soldCount} of {t.quantity} left</p>
            </div>
            <Button variant="ghost" size="sm" className="text-white/60 hover:text-white" onClick={() => setDraft(t)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" className="text-white/50 hover:text-red-400" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {tickets.length === 0 && <p className="text-white/50 text-sm">No ticket tiers yet.</p>}
      </div>

      {draft ? (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4 grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <Select value={draft.type ?? "paid"} onValueChange={(v) => setDraft((d) => ({ ...d, type: v }))}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent>{TICKET_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Name"><Input className={inputCls} value={draft.name ?? ""} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} /></Field>
          <Field label="Description" full><Input className={inputCls} value={draft.description ?? ""} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} /></Field>
          <Field label="Price (₹)"><Input type="number" className={inputCls} value={draft.price ?? "0"} onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))} /></Field>
          <Field label="Quantity"><Input type="number" className={inputCls} value={draft.quantity ?? 0} onChange={(e) => setDraft((d) => ({ ...d, quantity: Number(e.target.value) || 0 }))} /></Field>
          <Field label="Booking limit / order"><Input type="number" className={inputCls} value={draft.bookingLimit ?? 0} onChange={(e) => setDraft((d) => ({ ...d, bookingLimit: Number(e.target.value) || 0 }))} /></Field>
          <Field label="Sales start"><Input type="datetime-local" className={inputCls} value={draft.salesStartAt ?? ""} onChange={(e) => setDraft((d) => ({ ...d, salesStartAt: e.target.value }))} /></Field>
          <Field label="Sales end"><Input type="datetime-local" className={inputCls} value={draft.salesEndAt ?? ""} onChange={(e) => setDraft((d) => ({ ...d, salesEndAt: e.target.value }))} /></Field>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="ghost" className="text-white/60" onClick={() => setDraft(null)}>Cancel</Button>
            <Button className="bg-primary text-white" onClick={save}>Save ticket</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="border-white/15 text-white/70" onClick={() => setDraft({ type: "paid", price: "0", quantity: 0, bookingLimit: 0, active: true })}><Plus className="h-4 w-4 mr-1" /> Add ticket tier</Button>
      )}
    </GlassCard>
  );
}

// ─── profile settings ────────────────────────────────────────────────────────

// Focused identity card: the organizer's business name + contact phone. The
// name here IS the business name used everywhere in the app (events, public
// page, bookings, scanner) — those read it via a live join, so editing it here
// updates it everywhere. Changing the name also re-slugs the public URL.
function ProfileBasics({ organizer, onSaved }: { organizer: Organizer; onSaved: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(organizer.name);
  const [phone, setPhone] = useState(organizer.supportPhone);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setName(organizer.name); setPhone(organizer.supportPhone); }, [organizer]);

  const dirty = name.trim() !== organizer.name || phone.trim() !== organizer.supportPhone;

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) { toast({ title: "Business name is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await apiPatch("/api/organizer/profile", { name: trimmed, supportPhone: phone.trim() });
      toast({ title: "Profile updated", description: "Your business name updates across the app." });
      onSaved();
    } catch (e: any) { toast({ title: "Save failed", description: e?.message, variant: "destructive" }); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Event Management</p>
        <h1 className="font-serif text-2xl md:text-3xl">Profile</h1>
        <p className="text-white/50 text-sm mt-1">Your business name and contact number. The business name is your organizer name shown everywhere.</p>
      </div>
      <GlassCard className="p-6 space-y-4 max-w-xl">
        <Field label="Business name (organizer name)" full>
          <div className="relative">
            <User className="h-4 w-4 text-white/35 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input className={inputCls + " pl-9"} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Royvento Events" />
          </div>
        </Field>
        <Field label="Phone number" full>
          <div className="relative">
            <Phone className="h-4 w-4 text-white/35 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input className={inputCls + " pl-9"} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. +91 98765 43210" />
          </div>
        </Field>
        <p className="text-white/40 text-xs">Updating the business name changes it across your events, public page, tickets and bookings. Your public link may change too.</p>
        <div className="flex justify-end">
          <Button className="bg-primary text-white min-w-28" onClick={save} disabled={saving || !dirty}>{saving ? <Spinner /> : "Save changes"}</Button>
        </div>
      </GlassCard>
    </div>
  );
}

function ProfileSettings({ organizer, onSaved }: { organizer: Organizer; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<Organizer>(organizer);
  const [country, setCountry] = useState("India"); // no country column — drives the cascade locally
  const [saving, setSaving] = useState(false);
  useEffect(() => { setF(organizer); }, [organizer]);
  const set = (k: keyof Organizer) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      await apiPatch("/api/organizer/profile", {
        name: f.name, description: f.description, logoUrl: f.logoUrl, coverImageUrl: f.coverImageUrl,
        website: f.website, instagram: f.instagram, facebook: f.facebook, youtube: f.youtube,
        supportEmail: f.supportEmail, supportPhone: f.supportPhone, city: f.city, state: f.state,
      });
      toast({ title: "Profile saved" }); onSaved();
    } catch (e: any) { toast({ title: "Save failed", description: e?.message, variant: "destructive" }); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl">Profile settings</h1>
      <GlassCard className="p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <ImageUploadField label="Logo" value={f.logoUrl} onChange={set("logoUrl")} />
          <ImageUploadField label="Cover image" value={f.coverImageUrl} onChange={set("coverImageUrl")} />
          <Field label="Organizer name" full><Input className={inputCls} value={f.name} onChange={(e) => set("name")(e.target.value)} /></Field>
          <Field label="Description" full><Textarea className={inputCls} rows={3} value={f.description} onChange={(e) => set("description")(e.target.value)} /></Field>
          <Field label="Country / State / City" full>
            <LocationSelect country={country} state={f.state} city={f.city}
              onChange={(n) => { setCountry(n.country); setF((p) => ({ ...p, state: n.state, city: n.city })); }} />
          </Field>
          {([["website","Website"],["instagram","Instagram"],["facebook","Facebook"],["youtube","YouTube"],["supportEmail","Support email"],["supportPhone","Support phone"]] as const).map(([k,label]) => (
            <Field key={k} label={label}><Input className={inputCls} value={f[k] as string} onChange={(e) => set(k)(e.target.value)} /></Field>
          ))}
        </div>
        <div className="flex justify-end"><Button className="bg-primary text-white min-w-28" onClick={save} disabled={saving}>{saving ? <Spinner /> : "Save"}</Button></div>
      </GlassCard>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SCANNER  (verify QR, mark attendance, prevent duplicate check-ins)
// ════════════════════════════════════════════════════════════════════════════

interface ScannedTicket {
  bookingId: number; eventTitle: string; organizerName: string; ticketType: string;
  attendee: string; quantity: number; date: string; time: string; venue: string;
  checkedIn: boolean; checkedInAt: string | null;
}
type ScanStatus = "VALID" | "ALREADY_CHECKED_IN" | "CHECKED_IN" | "EVENT_ENDED";

function ScannerPanel() {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ status: ScanStatus; ticket: ScannedTicket } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [camOn, setCamOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lockRef = useRef(false);
  // jsQR is lazy-loaded only when the camera starts, so the heavy QR decoder
  // can never block this panel from rendering.
  const decodeRef = useRef<((d: Uint8ClampedArray, w: number, h: number, o?: { inversionAttempts?: string }) => { data: string } | null) | null>(null);

  const lookup = useCallback(async (raw: string, confirm: boolean) => {
    const c = raw.trim();
    if (!c) return;
    setBusy(true); setError(null);
    try {
      const res = await apiPost<{ status: ScanStatus; ticket: ScannedTicket; message?: string }>(
        "/api/organizer/scan-ticket", { code: c, confirm });
      setResult({ status: res.status, ticket: res.ticket });
      if (res.status === "CHECKED_IN") toast({ title: "Checked in ✓", description: res.ticket.attendee });
      if (res.status === "ALREADY_CHECKED_IN") toast({ title: "Already checked in", variant: "destructive" });
      if (res.status === "EVENT_ENDED") toast({ title: "Event ended", description: "Tickets can no longer be scanned.", variant: "destructive" });
    } catch (e: any) {
      setResult(null);
      setError(e?.message || "Scan failed");
    } finally {
      setBusy(false);
    }
  }, [toast]);

  // Camera scan loop
  const stopCam = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }, []);

  const tick = useCallback(() => {
    const video = videoRef.current, canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && !lockRef.current) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qr = decodeRef.current?.(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (qr?.data) {
          lockRef.current = true;
          setCode(qr.data.trim());
          lookup(qr.data, false).finally(() => { setTimeout(() => { lockRef.current = false; }, 2500); });
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [lookup]);

  const startCam = useCallback(async () => {
    try {
      if (!decodeRef.current) decodeRef.current = (await import("jsqr")).default as unknown as typeof decodeRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCamOn(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      toast({ title: "Camera unavailable", description: "Enter the code manually instead.", variant: "destructive" });
    }
  }, [tick, toast]);

  useEffect(() => () => stopCam(), [stopCam]);

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Entry</p>
        <h1 className="font-serif text-2xl md:text-3xl">Ticket Scanner</h1>
        <p className="text-white/50 text-sm mt-1">Scan or enter a ticket code to verify and check in attendees.</p>
      </div>

      <GlassCard className="p-5 space-y-4">
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") lookup(code, false); }}
            placeholder="e.g. MIDN-000011-76"
            className="bg-white/[0.04] border-white/10 text-white font-mono uppercase"
          />
          <Button className="bg-primary text-white shrink-0" disabled={busy} onClick={() => lookup(code, false)}>
            {busy ? <Spinner /> : <><ScanLine className="h-4 w-4 mr-1.5" /> Verify</>}
          </Button>
        </div>
        <Button variant="outline" className="w-full border-white/15 text-white/80" onClick={() => (camOn ? stopCam() : startCam())}>
          {camOn ? <><CameraOff className="h-4 w-4 mr-2" /> Stop camera</> : <><Camera className="h-4 w-4 mr-2" /> Scan with camera</>}
        </Button>
        <div className={camOn ? "rounded-xl overflow-hidden border border-white/10" : "hidden"}>
          <video ref={videoRef} className="w-full" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </GlassCard>

      {error && (
        <GlassCard className="p-4 border-red-500/30 bg-red-500/[0.06]">
          <p className="text-red-300 text-sm flex items-center gap-2"><XCircle className="h-4 w-4" /> {error}</p>
        </GlassCard>
      )}

      {result && result.status === "EVENT_ENDED" && (
        <GlassCard className="p-6 border-red-500/30 bg-red-500/[0.06] flex flex-col items-center text-center">
          <div className="h-16 w-16 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-3">
            <CalendarX2 className="h-8 w-8 text-red-400" />
          </div>
          <p className="font-serif text-xl text-red-200">Event has ended</p>
          <p className="text-white/60 text-sm mt-1 max-w-xs">This ticket is for <span className="text-white/80">{result.ticket.eventTitle || "an event"}</span> which is over. Tickets can no longer be scanned.</p>
          <p className="text-white/40 text-xs mt-3">Booking #{result.ticket.bookingId} · {result.ticket.date}</p>
        </GlassCard>
      )}

      {result && result.status !== "EVENT_ENDED" && (
        <GlassCard className={"p-5 " + (result.status === "ALREADY_CHECKED_IN" ? "border-amber-500/30 bg-amber-500/[0.05]" : result.status === "CHECKED_IN" ? "border-emerald-500/30 bg-emerald-500/[0.05]" : "border-white/10")}>
          <div className="flex items-center gap-2 mb-3">
            {result.status === "CHECKED_IN" ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              : result.status === "ALREADY_CHECKED_IN" ? <Clock className="h-5 w-5 text-amber-400" />
              : <CheckCircle2 className="h-5 w-5 text-primary" />}
            <span className="font-medium">
              {result.status === "CHECKED_IN" ? "Checked in" : result.status === "ALREADY_CHECKED_IN" ? "Already checked in" : "Valid ticket"}
            </span>
          </div>
          <h3 className="font-serif text-xl">{result.ticket.eventTitle}</h3>
          <p className="text-white/50 text-sm">{result.ticket.organizerName}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-sm">
            <Info k="Attendee" v={result.ticket.attendee} />
            <Info k="Ticket" v={`${result.ticket.ticketType}${result.ticket.quantity > 1 ? ` ×${result.ticket.quantity}` : ""}`} />
            <Info k="Date" v={`${result.ticket.date}${result.ticket.time ? ` · ${result.ticket.time}` : ""}`} />
            <Info k="Venue" v={result.ticket.venue || "—"} />
            <Info k="Booking" v={`#${result.ticket.bookingId}`} />
            {result.ticket.checkedInAt && <Info k="Checked in at" v={new Date(result.ticket.checkedInAt).toLocaleString()} />}
          </div>
          {result.status === "VALID" && (
            <Button className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-white" disabled={busy} onClick={() => lookup(code, true)}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Confirm check-in
            </Button>
          )}
        </GlassCard>
      )}
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return <div><p className="text-white/40 text-[11px] uppercase tracking-wider">{k}</p><p className="text-white/85">{v}</p></div>;
}

// ════════════════════════════════════════════════════════════════════════════
// MANAGERS  (invite existing users; configurable permissions)
// ════════════════════════════════════════════════════════════════════════════

interface ManagerPerms { scan: boolean; attendance: boolean; reports: boolean; }
interface ManagerRow {
  id: number; invitedEmail: string; status: string; permissions: ManagerPerms;
  manager: { id: number; name: string; email: string } | null;
}

function ManagersPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [perms, setPerms] = useState<ManagerPerms>({ scan: true, attendance: true, reports: false });
  const [inviting, setInviting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<ManagerRow[]>("/api/organizer/managers").then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    if (!email.trim()) { toast({ title: "Enter an email", variant: "destructive" }); return; }
    setInviting(true);
    try {
      await apiPost("/api/organizer/managers/invite", { email: email.trim(), permissions: perms });
      toast({ title: "Invitation sent", description: email.trim() });
      setEmail(""); load();
    } catch (e: any) {
      toast({ title: "Invite failed", description: e?.message, variant: "destructive" });
    } finally { setInviting(false); }
  };

  const togglePerm = async (row: ManagerRow, key: keyof ManagerPerms, val: boolean) => {
    const next = { ...row.permissions, [key]: val };
    setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, permissions: next } : r));
    try { await apiPatch(`/api/organizer/managers/${row.id}`, { permissions: next }); }
    catch (e: any) { toast({ title: "Update failed", description: e?.message, variant: "destructive" }); load(); }
  };

  const remove = async (row: ManagerRow) => {
    try { await apiDelete(`/api/organizer/managers/${row.id}`); toast({ title: "Manager removed" }); load(); }
    catch (e: any) { toast({ title: "Remove failed", description: e?.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Team</p>
        <h1 className="font-serif text-2xl md:text-3xl">Event Managers</h1>
        <p className="text-white/50 text-sm mt-1">Invite people to scan tickets and mark attendance. Permissions are configurable per manager.</p>
      </div>

      <GlassCard className="p-5 space-y-4">
        <h2 className="font-serif text-lg flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Invite a manager</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="manager@email.com" className="bg-white/[0.04] border-white/10 text-white" />
          <Button className="bg-primary text-white shrink-0" disabled={inviting} onClick={invite}>{inviting ? <Spinner /> : "Send invite"}</Button>
        </div>
        <div className="flex flex-wrap gap-4">
          <PermToggle label="Scan tickets" checked={perms.scan} onChange={(v) => setPerms((p) => ({ ...p, scan: v }))} />
          <PermToggle label="Mark attendance" checked={perms.attendance} onChange={(v) => setPerms((p) => ({ ...p, attendance: v }))} />
          <PermToggle label="View reports" checked={perms.reports} onChange={(v) => setPerms((p) => ({ ...p, reports: v }))} />
        </div>
        <p className="text-white/35 text-[11px]">The person must already have a Royvento account. They'll get an invite to accept from their profile.</p>
      </GlassCard>

      <div>
        <h2 className="font-serif text-lg mb-3">Your managers</h2>
        {loading ? <Spinner /> : rows.length === 0 ? (
          <p className="text-white/50 text-sm">No managers yet.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <GlassCard key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.manager?.name || r.invitedEmail}</p>
                    <p className="text-white/45 text-xs truncate">{r.manager?.email || r.invitedEmail}</p>
                    <div className="mt-1.5"><Badge variant={r.status === "accepted" ? "default" : r.status === "pending" ? "secondary" : "destructive"}>{r.status}</Badge></div>
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-300 hover:text-red-200 shrink-0" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-white/[0.06]">
                  <PermToggle label="Scan" checked={r.permissions.scan} onChange={(v) => togglePerm(r, "scan", v)} />
                  <PermToggle label="Attendance" checked={r.permissions.attendance} onChange={(v) => togglePerm(r, "attendance", v)} />
                  <PermToggle label="Reports" checked={r.permissions.reports} onChange={(v) => togglePerm(r, "reports", v)} />
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PermToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="text-sm text-white/70 flex items-center gap-1"><Shield className="h-3 w-3 text-white/30" />{label}</span>
    </label>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EARNINGS  (per-event revenue / commission / net + dues + banking)
// ════════════════════════════════════════════════════════════════════════════

interface RevenueEvent {
  id: number; title: string; commissionPct: string; gatewayFeePercent: string;
  ticketsSold: number; revenue: string; commission: string; gatewayFee: string; net: string; attended: number;
}
interface RevenuePayload {
  events: RevenueEvent[];
  totals: { revenue: string; commission: string; gatewayFee: string; net: string };
  commissionOwed: string;
}
interface BankingPayload {
  banking: { accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string } | null;
  settlements: { id: number; amount: string; status: string; adminNote: string; createdAt: string }[];
  commissionOwed: string;
}

// Endpoint config so the dashboard panels (Earnings/Insights/Leads/Coupons) serve
// both the organizer (their own data, default) and an admin viewing a specific
// organizer's data via /admin/organizer/:orgId/* in the Venues Manage view.
export interface OrganizerDashboardApi {
  revenue: string; banking: string; analytics: string; bookings: string; leads: string;
  couponsList: string; couponCreate: string; couponMutate: (id: number) => string; events: string;
}
const SELF_API: OrganizerDashboardApi = {
  revenue: "/api/organizer/revenue", banking: "/api/organizer/banking", analytics: "/api/organizer/analytics",
  bookings: "/api/organizer/bookings", leads: "/api/organizer/leads",
  couponsList: "/api/organizer/coupons", couponCreate: "/api/organizer/coupons",
  couponMutate: (id) => `/api/organizer/coupons/${id}`, events: "/api/organizer/events",
};
export function adminOrganizerApi(orgId: number): OrganizerDashboardApi {
  return {
    revenue: `/api/admin/organizer/${orgId}/revenue`, banking: `/api/admin/organizer/${orgId}/banking`,
    analytics: `/api/admin/organizer/${orgId}/analytics`, bookings: `/api/admin/organizer/${orgId}/bookings`,
    leads: `/api/admin/organizer/${orgId}/leads`, couponsList: `/api/admin/organizer/${orgId}/coupons`,
    couponCreate: `/api/admin/organizer/${orgId}/coupons`, couponMutate: (id) => `/api/admin/organizer-coupon/${id}`,
    events: `/api/admin/organizer/${orgId}/events`,
  };
}
// Per-event admin config — Earnings/Insights/Leads/Coupons scoped to ONE event,
// usable before assignment (data is event-keyed and follows the event on assign).
// Banking is hidden (organizer-level); leads = the event's bookers.
export function adminEventApi(eventId: number): OrganizerDashboardApi {
  return {
    revenue: `/api/admin/organizer-event/${eventId}/revenue`, banking: "",
    analytics: `/api/admin/organizer-event/${eventId}/analytics`, bookings: `/api/admin/organizer-event/${eventId}/bookings`,
    leads: `/api/admin/organizer-event/${eventId}/leads`, couponsList: `/api/admin/organizer-event/${eventId}/coupons`,
    couponCreate: `/api/admin/organizer-event/${eventId}/coupons`, couponMutate: (id) => `/api/admin/organizer-coupon/${id}`,
    events: "",
  };
}

export function EarningsPanel({ api = SELF_API, showBanking = true }: { api?: OrganizerDashboardApi; showBanking?: boolean } = {}) {
  const { toast } = useToast();
  const [rev, setRev] = useState<RevenuePayload | null>(null);
  const [bank, setBank] = useState<BankingPayload | null>(null);
  const [form, setForm] = useState({ accountHolderName: "", bankName: "", accountNumber: "", ifscCode: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiGet<RevenuePayload>(api.revenue).then(setRev).catch(() => {});
    if (showBanking) apiGet<BankingPayload>(api.banking).then((b) => {
      setBank(b);
      if (b.banking) setForm({ accountHolderName: b.banking.accountHolderName, bankName: b.banking.bankName, accountNumber: b.banking.accountNumber, ifscCode: b.banking.ifscCode });
    }).catch(() => {});
  }, [api, showBanking]);
  useEffect(() => { load(); }, [load]);

  const saveBank = async () => {
    setSaving(true);
    try { await apiPut(api.banking, form); toast({ title: "Banking details saved" }); load(); }
    catch (e: any) { toast({ title: "Save failed", description: e?.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const owed = Number(rev?.commissionOwed ?? bank?.commissionOwed ?? 0);
  const inputCls = "mt-1 bg-white/[0.04] border-white/10 text-white";

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Finance</p>
        <h1 className="font-serif text-2xl md:text-3xl">Earnings &amp; Settlements</h1>
        <p className="text-white/50 text-sm mt-1">Revenue is realised when an attendee is checked in at the door. You collect the cash and owe the platform its commission.</p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-primary" />Revenue</p><p className="font-serif text-2xl mt-1">{formatINR(Number(rev?.totals.revenue ?? 0))}</p></GlassCard>
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider">Commission</p><p className="font-serif text-2xl mt-1">{formatINR(Number(rev?.totals.commission ?? 0))}</p></GlassCard>
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider">Net earnings</p><p className="font-serif text-2xl mt-1 text-emerald-300">{formatINR(Number(rev?.totals.net ?? 0))}</p></GlassCard>
        <GlassCard className={"p-4 " + (owed > 0 ? "border-amber-500/30 bg-amber-500/[0.05]" : "")}><p className="text-white/50 text-xs uppercase tracking-wider">Owed to platform</p><p className="font-serif text-2xl mt-1 text-amber-300">{formatINR(owed)}</p></GlassCard>
      </div>

      {/* Per-event table */}
      <div>
        <h2 className="font-serif text-lg mb-3">By event</h2>
        {!rev || rev.events.length === 0 ? <p className="text-white/50 text-sm">No events yet.</p> : (
          <div className="overflow-x-auto rounded-2xl border border-white/[0.07]">
            <table className="w-full text-sm">
              <thead><tr className="text-white/40 text-[11px] uppercase tracking-wider border-b border-white/[0.07]">
                <th className="text-left font-medium p-3">Event</th>
                <th className="text-right font-medium p-3">Comm %</th>
                <th className="text-right font-medium p-3">Sold</th>
                <th className="text-right font-medium p-3">Attended</th>
                <th className="text-right font-medium p-3">Revenue</th>
                <th className="text-right font-medium p-3">Commission</th>
                <th className="text-right font-medium p-3">Net</th>
              </tr></thead>
              <tbody>
                {rev.events.map((e) => (
                  <tr key={e.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="p-3">{e.title}</td>
                    <td className="p-3 text-right text-white/60">{Number(e.commissionPct).toFixed(1)}%</td>
                    <td className="p-3 text-right text-white/60">{e.ticketsSold}</td>
                    <td className="p-3 text-right text-white/60">{e.attended}</td>
                    <td className="p-3 text-right">{formatINR(Number(e.revenue))}</td>
                    <td className="p-3 text-right text-amber-300/80">{formatINR(Number(e.commission))}</td>
                    <td className="p-3 text-right text-emerald-300">{formatINR(Number(e.net))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Banking */}
      {showBanking && (
      <GlassCard className="p-5 space-y-4">
        <h2 className="font-serif text-lg flex items-center gap-2"><Banknote className="h-4 w-4 text-primary" /> Payout / banking details</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label className="text-white/70 text-xs uppercase tracking-wider">Account holder</Label><Input className={inputCls} value={form.accountHolderName} onChange={(e) => setForm((f) => ({ ...f, accountHolderName: e.target.value }))} /></div>
          <div><Label className="text-white/70 text-xs uppercase tracking-wider">Bank name</Label><Input className={inputCls} value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} /></div>
          <div><Label className="text-white/70 text-xs uppercase tracking-wider">Account number</Label><Input className={inputCls} value={form.accountNumber} onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))} /></div>
          <div><Label className="text-white/70 text-xs uppercase tracking-wider">IFSC</Label><Input className={inputCls} value={form.ifscCode} onChange={(e) => setForm((f) => ({ ...f, ifscCode: e.target.value.toUpperCase() }))} /></div>
        </div>
        <div className="flex justify-end"><Button className="bg-primary text-white min-w-28" onClick={saveBank} disabled={saving}>{saving ? <Spinner /> : "Save"}</Button></div>
        {bank && bank.settlements.length > 0 && (
          <div className="pt-3 border-t border-white/[0.06]">
            <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Settlement history</p>
            <div className="space-y-1.5">
              {bank.settlements.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-white/60">{new Date(s.createdAt).toLocaleDateString()}{s.adminNote ? ` · ${s.adminNote}` : ""}</span>
                  <span className="text-emerald-300">{formatINR(Number(s.amount))} settled</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassCard>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// INSIGHTS  (Analytics + Booking Reports + Attendance + Leads)
// ════════════════════════════════════════════════════════════════════════════

interface Analytics {
  totals: { bookings: number; tickets: number; revenue: string; attended: number; attendanceRate: number };
  perEvent: { id: number; title: string; bookings: number; tickets: number; revenue: string; attended: number }[];
  byTicketType: { ticketType: string; tickets: number; revenue: string }[];
  recent: { day: string; bookings: number; revenue: string }[];
}
interface BookingRow {
  id: number; createdAt: string; bookingDate: string; quantity: number; amount: string;
  checkedIn: boolean; attendee: string; phone: string; email: string; eventTitle: string; ticketType: string;
  bookingLocation?: string;
}

export function InsightsPanel({ events, api = SELF_API }: { events: OrganizerEvent[]; api?: OrganizerDashboardApi }) {
  const [an, setAn] = useState<Analytics | null>(null);
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [eventFilter, setEventFilter] = useState("all");

  useEffect(() => { apiGet<Analytics>(api.analytics).then(setAn).catch(() => {}); }, [api]);
  useEffect(() => {
    const q = eventFilter === "all" ? "" : `?eventId=${eventFilter}`;
    apiGet<BookingRow[]>(`${api.bookings}${q}`).then(setRows).catch(() => {});
  }, [eventFilter, api]);

  const exportCsv = () => {
    const header = ["Booking", "Event", "Ticket", "Attendee", "Phone", "Email", "Qty", "Amount", "Date", "Location", "CheckedIn"];
    const lines = rows.map((r) => [r.id, r.eventTitle, r.ticketType, r.attendee, r.phone, r.email, r.quantity, r.amount, r.bookingDate, r.bookingLocation ?? "", r.checkedIn ? "yes" : "no"]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "royvento-leads.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Business</p>
        <h1 className="font-serif text-2xl md:text-3xl">Insights &amp; Reports</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider">Bookings</p><p className="font-serif text-2xl mt-1">{an?.totals.bookings ?? 0}</p></GlassCard>
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider">Tickets</p><p className="font-serif text-2xl mt-1">{an?.totals.tickets ?? 0}</p></GlassCard>
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider">Revenue</p><p className="font-serif text-2xl mt-1">{formatINR(Number(an?.totals.revenue ?? 0))}</p></GlassCard>
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider">Attended</p><p className="font-serif text-2xl mt-1">{an?.totals.attended ?? 0}</p></GlassCard>
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider">Attendance</p><p className="font-serif text-2xl mt-1">{an?.totals.attendanceRate ?? 0}%</p></GlassCard>
      </div>

      {an && an.byTicketType.length > 0 && (
        <GlassCard className="p-5">
          <h2 className="font-serif text-lg mb-3">Popular ticket types</h2>
          <div className="space-y-2">
            {an.byTicketType.map((t) => (
              <div key={t.ticketType} className="flex items-center justify-between text-sm">
                <span className="text-white/70">{t.ticketType}</span>
                <span className="text-white/50">{t.tickets} sold · {formatINR(Number(t.revenue))}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <div>
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="font-serif text-lg">Bookings &amp; leads</h2>
          <div className="flex items-center gap-2">
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-44 h-9 bg-white/[0.04] border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                {events.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="border-white/15" onClick={exportCsv} disabled={rows.length === 0}><Download className="h-4 w-4 mr-1.5" />CSV</Button>
          </div>
        </div>
        {rows.length === 0 ? <p className="text-white/50 text-sm">No bookings yet.</p> : (
          <div className="overflow-x-auto rounded-2xl border border-white/[0.07]">
            <table className="w-full text-sm">
              <thead><tr className="text-white/40 text-[11px] uppercase tracking-wider border-b border-white/[0.07]">
                <th className="text-left font-medium p-3">Attendee</th>
                <th className="text-left font-medium p-3">Event</th>
                <th className="text-left font-medium p-3">Ticket</th>
                <th className="text-left font-medium p-3">Contact</th>
                <th className="text-left font-medium p-3">Location</th>
                <th className="text-right font-medium p-3">Qty</th>
                <th className="text-right font-medium p-3">Amount</th>
                <th className="text-center font-medium p-3">In</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="p-3">{r.attendee || "—"}</td>
                    <td className="p-3 text-white/60">{r.eventTitle}</td>
                    <td className="p-3 text-white/60">{r.ticketType}</td>
                    <td className="p-3 text-white/50 text-xs">{[r.phone, r.email].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="p-3 text-white/50 text-xs">{r.bookingLocation || "—"}</td>
                    <td className="p-3 text-right">{r.quantity}</td>
                    <td className="p-3 text-right">{formatINR(Number(r.amount))}</td>
                    <td className="p-3 text-center">{r.checkedIn ? <CheckCircle2 className="h-4 w-4 text-emerald-400 inline" /> : <span className="text-white/20">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LEADS  (profile views + already-booked — mirrors the partner Leads tab)
// ════════════════════════════════════════════════════════════════════════════

interface LeadView {
  viewerUserId: number | null; viewerName: string; viewerEmail: string; phone: string;
  visitCount: number; lastViewedAt: string; hasBooked: boolean;
}
interface LeadsPayload { totalViews: number; bookedCount: number; views: LeadView[]; }

export function LeadsPanel({ api = SELF_API }: { api?: OrganizerDashboardApi } = {}) {
  const [data, setData] = useState<LeadsPayload | null>(null);
  useEffect(() => { apiGet<LeadsPayload>(api.leads).then(setData).catch(() => {}); }, [api]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Audience</p>
        <h1 className="font-serif text-2xl md:text-3xl">Leads</h1>
        <p className="text-white/50 text-sm mt-1">People who viewed your organizer page, and who's already booked.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <GlassCard className="p-5"><Eye className="h-5 w-5 text-primary mb-2" /><p className="font-serif text-3xl">{data?.totalViews ?? 0}</p><p className="text-xs uppercase tracking-wider text-white/50">Profile views</p></GlassCard>
        <GlassCard className="p-5"><TrendingUp className="h-5 w-5 text-emerald-400 mb-2" /><p className="font-serif text-3xl text-emerald-400">{data?.bookedCount ?? 0}</p><p className="text-xs uppercase tracking-wider text-white/50">Already booked</p></GlassCard>
      </div>

      <GlassCard className="p-5">
        <p className="font-serif text-lg mb-3">Recent visitors</p>
        {!data || data.views.length === 0 ? (
          <p className="text-white/50 text-sm">No one has viewed your page yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
            <table className="w-full text-sm min-w-[520px]">
              <thead><tr className="text-white/40 text-[11px] uppercase tracking-wider border-b border-white/[0.07]">
                <th className="text-left font-medium p-3">Name</th>
                <th className="text-left font-medium p-3 hidden sm:table-cell">Contact</th>
                <th className="text-right font-medium p-3">Visits</th>
                <th className="text-right font-medium p-3 hidden md:table-cell">Last visit</th>
                <th className="text-center font-medium p-3">Booked</th>
              </tr></thead>
              <tbody>
                {data.views.map((v, i) => {
                  const isAnon = !v.viewerUserId;
                  return (
                    <tr key={i} className="border-b border-white/[0.04] last:border-0">
                      <td className="p-3"><span className={isAnon ? "text-white/40 italic" : ""}>{v.viewerName}</span></td>
                      <td className="p-3 text-white/50 text-xs hidden sm:table-cell">{[v.viewerEmail, v.phone].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="p-3 text-right tabular-nums">{v.visitCount}</td>
                      <td className="p-3 text-right text-white/50 hidden md:table-cell">{v.lastViewedAt ? new Date(v.lastViewedAt).toLocaleDateString() : "—"}</td>
                      <td className="p-3 text-center">{v.hasBooked ? <CheckCircle2 className="h-4 w-4 text-emerald-400 inline" /> : <span className="text-white/20">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COUPONS
// ════════════════════════════════════════════════════════════════════════════

interface Coupon {
  id: number; code: string; discountType: string; discountValue: string; eventId: number | null;
  active: boolean; maxUses: number | null; usedCount: number; expiresAt: string | null;
}

export function CouponsPanel({ events, api = SELF_API, lockedEventId = null }: { events: OrganizerEvent[]; api?: OrganizerDashboardApi; lockedEventId?: number | null }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Coupon[]>([]);
  const [form, setForm] = useState({ code: "", discountType: "percent", discountValue: "10", eventId: "all", maxUses: "", expiresAt: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => { apiGet<Coupon[]>(api.couponsList).then(setRows).catch(() => {}); }, [api]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.code.trim()) { toast({ title: "Enter a code", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await apiPost(api.couponCreate, {
        code: form.code, discountType: form.discountType, discountValue: Number(form.discountValue),
        eventId: lockedEventId != null ? lockedEventId : (form.eventId === "all" ? null : Number(form.eventId)),
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        expiresAt: form.expiresAt || null,
      });
      toast({ title: "Coupon created" });
      setForm({ code: "", discountType: "percent", discountValue: "10", eventId: "all", maxUses: "", expiresAt: "" });
      load();
    } catch (e: any) { toast({ title: "Create failed", description: e?.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };
  const toggle = async (c: Coupon) => { try { await apiPatch(api.couponMutate(c.id), { active: !c.active }); load(); } catch {} };
  const remove = async (c: Coupon) => { try { await apiDelete(api.couponMutate(c.id)); load(); } catch {} };

  const inputCls = "mt-1 bg-white/[0.04] border-white/10 text-white";
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Growth</p>
        <h1 className="font-serif text-2xl md:text-3xl">Discount Coupons</h1>
        <p className="text-white/50 text-sm mt-1">Codes attendees can apply at checkout for your events.</p>
      </div>

      <GlassCard className="p-5 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label className="text-white/70 text-xs uppercase tracking-wider">Code</Label><Input className={inputCls} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="NEON20" /></div>
          {lockedEventId == null && (
          <div>
            <Label className="text-white/70 text-xs uppercase tracking-wider">Event</Label>
            <Select value={form.eventId} onValueChange={(v) => setForm((f) => ({ ...f, eventId: v }))}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All events</SelectItem>{events.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          )}
          <div>
            <Label className="text-white/70 text-xs uppercase tracking-wider">Type</Label>
            <Select value={form.discountType} onValueChange={(v) => setForm((f) => ({ ...f, discountType: v }))}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="percent">Percent %</SelectItem><SelectItem value="fixed">Fixed ₹</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label className="text-white/70 text-xs uppercase tracking-wider">Value</Label><Input className={inputCls} type="number" value={form.discountValue} onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))} /></div>
          <div><Label className="text-white/70 text-xs uppercase tracking-wider">Max uses (optional)</Label><Input className={inputCls} type="number" value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} /></div>
          <div><Label className="text-white/70 text-xs uppercase tracking-wider">Expires (optional)</Label><Input className={inputCls} type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} /></div>
        </div>
        <div className="flex justify-end"><Button className="bg-primary text-white" onClick={create} disabled={saving}>{saving ? <Spinner /> : "Create coupon"}</Button></div>
      </GlassCard>

      <div className="space-y-2">
        {rows.length === 0 ? <p className="text-white/50 text-sm">No coupons yet.</p> : rows.map((c) => (
          <GlassCard key={c.id} className="p-4 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono font-medium">{c.code} <span className="text-primary">{c.discountType === "fixed" ? formatINR(Number(c.discountValue)) : `${Number(c.discountValue)}%`}</span></p>
              <p className="text-white/45 text-xs">
                {c.eventId ? (events.find((e) => e.id === c.eventId)?.title ?? "Event") : "All events"}
                {c.maxUses ? ` · ${c.usedCount}/${c.maxUses} used` : ` · ${c.usedCount} used`}
                {c.expiresAt ? ` · exp ${new Date(c.expiresAt).toLocaleDateString()}` : ""}
              </p>
            </div>
            <Badge variant={c.active ? "default" : "secondary"}>{c.active ? "active" : "off"}</Badge>
            <Switch checked={c.active} onCheckedChange={() => toggle(c)} />
            <Button size="sm" variant="ghost" className="text-red-300 hover:text-red-200" onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></Button>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PROMOTE  (request to feature an event in the Events-page hero slider)
// ════════════════════════════════════════════════════════════════════════════

interface AdRequest { id: number; status: string; note: string; adminNote: string; createdAt: string; eventTitle: string; featured: boolean; }

function PromotePanel({ events }: { events: OrganizerEvent[] }) {
  const { toast } = useToast();
  const approved = events.filter((e) => e.approvalStatus === "approved");
  const [rows, setRows] = useState<AdRequest[]>([]);
  const [eventId, setEventId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => { apiGet<AdRequest[]>("/api/organizer/ads").then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!eventId) { toast({ title: "Pick an event", variant: "destructive" }); return; }
    setSaving(true);
    try { await apiPost("/api/organizer/ads", { organizerEventId: Number(eventId), note }); toast({ title: "Promotion requested" }); setEventId(""); setNote(""); load(); }
    catch (e: any) { toast({ title: "Request failed", description: e?.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Growth</p>
        <h1 className="font-serif text-2xl md:text-3xl">Promote Events</h1>
        <p className="text-white/50 text-sm mt-1">Request to feature an event in the Royvento Events hero slider. Admin reviews each request.</p>
      </div>

      <GlassCard className="p-5 space-y-3">
        <div>
          <Label className="text-white/70 text-xs uppercase tracking-wider">Event</Label>
          <Select value={eventId} onValueChange={setEventId}>
            <SelectTrigger className="mt-1 bg-white/[0.04] border-white/10"><SelectValue placeholder="Select an approved event" /></SelectTrigger>
            <SelectContent>{approved.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-white/70 text-xs uppercase tracking-wider">Note (optional)</Label><Textarea className="mt-1 bg-white/[0.04] border-white/10 text-white" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why should this be featured?" /></div>
        <div className="flex justify-end"><Button className="bg-primary text-white" onClick={submit} disabled={saving}>{saving ? <Spinner /> : "Request promotion"}</Button></div>
      </GlassCard>

      <div className="space-y-2">
        {rows.length === 0 ? <p className="text-white/50 text-sm">No promotion requests yet.</p> : rows.map((r) => (
          <GlassCard key={r.id} className="p-4 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{r.eventTitle}</p>
              <p className="text-white/45 text-xs">{new Date(r.createdAt).toLocaleDateString()}{r.adminNote ? ` · ${r.adminNote}` : ""}</p>
            </div>
            {r.featured && <Badge className="bg-amber-500/20 border-amber-500/40 text-amber-300">Featured</Badge>}
            <Badge variant={r.status === "approved" ? "default" : r.status === "pending" ? "secondary" : "destructive"}>{r.status}</Badge>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
