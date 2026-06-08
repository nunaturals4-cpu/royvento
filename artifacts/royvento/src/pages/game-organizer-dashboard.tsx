import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "wouter";
import { apiGet, apiPost, apiPatch, apiPut, apiDelete, formatINR } from "@/lib/api";
import { uploadImage, validateImageFile } from "@/lib/uploadImage";
import { useToast } from "@/hooks/use-toast";
import { SEO } from "@/components/SEO";
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
import {
  Gamepad2, LayoutGrid, Plus, Package, Settings, ImagePlus, Trash2, Pencil,
  CheckCircle2, Clock, XCircle, ExternalLink, X,
  ScanLine, UserCog, Camera, CameraOff, Mail, Shield, Wallet, TrendingUp, Banknote,
  BarChart3, Tag, Megaphone, Eye, Clock3, Timer, IndianRupee, Users,
} from "lucide-react";

// ─── shared types (mirror api-server/src/routes/gameOrganizers.ts) ──────────

interface GameOrganizer {
  id: number; name: string; slug: string; description: string;
  logoUrl: string; coverImageUrl: string; galleryImages: string[]; website: string;
  instagram: string; facebook: string; youtube: string;
  supportEmail: string; supportPhone: string; address: string; mapsUrl: string;
  city: string; state: string; verified: boolean; status: string;
}
interface Game {
  id: number; name: string; slug: string; category: string; description: string; rules: string;
  coverImageUrl: string; images: string[]; videos: string[]; capacity: number; ageRestriction: string;
  pricingModel: "fixed" | "hourly"; price: string; hourlyRate: string; minHours: number; maxHours: number;
  commissionPct: string; gatewayFeePercent: string; active: boolean;
  approvalStatus: string; rejectionReason: string; isFeaturedSlider: boolean; soldCount: number;
}
interface PackageItem { gameId: number | null; label: string; quantity: number; }
interface PackageAddon { label: string; price: number; }
interface GamePackage {
  id: number; name: string; slug: string; description: string; coverImageUrl: string; images: string[];
  price: string; items: PackageItem[] | null; addons: PackageAddon[] | null; groupSize: number;
  capacity: number; ageRestriction: string; commissionPct: string; gatewayFeePercent: string;
  active: boolean; approvalStatus: string; rejectionReason: string; soldCount: number;
}

const GAME_CATEGORIES = [
  "Gaming Zone", "Arcade Center", "VR Gaming Arena", "Bowling Alley", "Paintball Arena",
  "Laser Tag", "Go-Kart Racing", "Pool & Snooker Club", "PlayStation/Xbox Lounge",
  "Indoor Sports & Entertainment", "Other",
];

// ─── shared small components (match organizer dashboard visual language) ─────

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

const inputCls = "bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary/40";

function ImageUploadField({ label, value, onChange }: { label: string; value: string; onChange: (url: string) => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { toast({ title: err, variant: "destructive" }); return; }
    setBusy(true);
    try { onChange(await uploadImage(file)); }
    catch { toast({ title: "Upload failed", variant: "destructive" }); }
    finally { setBusy(false); }
  }
  return (
    <div>
      <Label className="text-white/70 text-xs uppercase tracking-wider">{label}</Label>
      <div className="mt-1.5 flex items-center gap-3">
        <label className="relative cursor-pointer">
          <div className="h-20 w-20 rounded-xl border border-dashed border-white/15 bg-white/[0.03] flex items-center justify-center overflow-hidden hover:border-primary/40 transition-colors">
            {value ? <img src={value} alt={label} className="h-full w-full object-cover" /> : busy ? <Spinner /> : <ImagePlus className="h-5 w-5 text-white/40" />}
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

function GalleryEditor({ images, onChange }: { images: string[]; onChange: (imgs: string[]) => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  async function add(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of files) { if (!validateImageFile(f)) urls.push(await uploadImage(f)); }
      onChange([...images, ...urls]);
    } catch { toast({ title: "Upload failed", variant: "destructive" }); }
    finally { setBusy(false); }
  }
  return (
    <div>
      <Label className="text-white/70 text-xs uppercase tracking-wider">Gallery images</Label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {images.map((img, i) => (
          <div key={i} className="relative h-16 w-16 rounded-lg overflow-hidden border border-white/10">
            <img src={img} alt="" className="h-full w-full object-cover" />
            <button type="button" onClick={() => onChange(images.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"><X className="h-3 w-3 text-white" /></button>
          </div>
        ))}
        <label className="h-16 w-16 rounded-lg border border-dashed border-white/15 bg-white/[0.03] flex items-center justify-center cursor-pointer hover:border-primary/40">
          {busy ? <Spinner /> : <Plus className="h-5 w-5 text-white/40" />}
          <input type="file" accept="image/*" multiple className="hidden" onChange={add} />
        </label>
      </div>
    </div>
  );
}

function StringListEditor({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (s: string[]) => void; placeholder?: string }) {
  const [val, setVal] = useState("");
  return (
    <div>
      <Label className="text-white/70 text-xs uppercase tracking-wider">{label}</Label>
      <div className="mt-1.5 flex gap-2">
        <Input className={inputCls} value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (val.trim()) { onChange([...items, val.trim()]); setVal(""); } } }} />
        <Button type="button" variant="outline" className="border-white/15 text-white/80 shrink-0" onClick={() => { if (val.trim()) { onChange([...items, val.trim()]); setVal(""); } }}>Add</Button>
      </div>
      {items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-white/80">
              {it}<button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))}><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    approved: { cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: <CheckCircle2 className="h-3 w-3" />, label: "Approved" },
    pending: { cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", icon: <Clock className="h-3 w-3" />, label: "Pending review" },
    rejected: { cls: "bg-red-500/15 text-red-300 border-red-500/30", icon: <XCircle className="h-3 w-3" />, label: "Rejected" },
  };
  const s = map[status] ?? map["pending"]!;
  return <Badge className={`gap-1 border ${s.cls}`}>{s.icon}{s.label}</Badge>;
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <div className={full ? "sm:col-span-2" : ""}><Label className="text-white/70 text-xs uppercase tracking-wider">{label}</Label><div className="mt-1.5">{children}</div></div>;
}

function priceLabel(g: Game): string {
  if (g.pricingModel === "hourly") return `${formatINR(Number(g.hourlyRate))}/hr`;
  return Number(g.price) > 0 ? `${formatINR(Number(g.price))}/person` : "Free";
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD SHELL
// ════════════════════════════════════════════════════════════════════════════

type Tab = "overview" | "games" | "createGame" | "packages" | "createPackage" | "scanner"
  | "managers" | "earnings" | "insights" | "leads" | "coupons" | "promote" | "profile";

export function GameOrganizerDashboard() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [org, setOrg] = useState<GameOrganizer | null | undefined>(undefined);
  const [games, setGames] = useState<Game[]>([]);
  const [packages, setPackages] = useState<GamePackage[]>([]);
  const [editingGame, setEditingGame] = useState<number | "new" | null>(null);
  const [editingPkg, setEditingPkg] = useState<number | "new" | null>(null);
  const [overview, setOverview] = useState<{ bookings: number; revenue: string; players: number } | null>(null);

  const loadProfile = useCallback(() => {
    apiGet<GameOrganizer>("/api/game-organizer/profile").then(setOrg).catch(() => setOrg(null));
  }, []);
  const loadGames = useCallback(() => { apiGet<Game[]>("/api/game-organizer/games").then(setGames).catch(() => {}); }, []);
  const loadPackages = useCallback(() => { apiGet<GamePackage[]>("/api/game-organizer/packages").then(setPackages).catch(() => {}); }, []);
  const loadOverview = useCallback(() => {
    apiGet<{ totals: { bookings: number; revenue: string; players: number } }>("/api/game-organizer/analytics")
      .then((a) => setOverview(a.totals)).catch(() => {});
  }, []);

  useEffect(() => { loadProfile(); loadGames(); loadPackages(); loadOverview(); }, [loadProfile, loadGames, loadPackages, loadOverview]);

  if (org === undefined) return <div className="flex items-center justify-center py-32 bg-black min-h-[100dvh]"><Spinner /></div>;
  if (org === null) {
    return (
      <div className="min-h-[100dvh] bg-black flex flex-col items-center justify-center text-center px-4 gap-4">
        <p className="text-white/70">No game organizer profile found for this account.</p>
        <Button asChild className="bg-primary text-white"><Link href="/dashboard/become-vendor">Apply as a Game Organizer</Link></Button>
      </div>
    );
  }

  const NAV: { value: Tab; label: string; icon: React.ReactNode }[] = [
    { value: "overview", label: "Overview", icon: <LayoutGrid className="h-4 w-4" /> },
    { value: "games", label: "Games", icon: <Gamepad2 className="h-4 w-4" /> },
    { value: "createGame", label: "Add Game", icon: <Plus className="h-4 w-4" /> },
    { value: "packages", label: "Packages", icon: <Package className="h-4 w-4" /> },
    { value: "scanner", label: "Scanner", icon: <ScanLine className="h-4 w-4" /> },
    { value: "managers", label: "Managers", icon: <UserCog className="h-4 w-4" /> },
    { value: "earnings", label: "Banking", icon: <Wallet className="h-4 w-4" /> },
    { value: "insights", label: "Analytics", icon: <BarChart3 className="h-4 w-4" /> },
    { value: "leads", label: "Leads", icon: <Eye className="h-4 w-4" /> },
    { value: "coupons", label: "Coupons", icon: <Tag className="h-4 w-4" /> },
    { value: "promote", label: "Ads", icon: <Megaphone className="h-4 w-4" /> },
    { value: "profile", label: "Profile Settings", icon: <Settings className="h-4 w-4" /> },
  ];

  const approvedGames = games.filter((g) => g.approvalStatus === "approved").length;

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <SEO title="Game Management | Royvento" canonical="/dashboard/game-organizer" noindex />
      <div className="flex">
        <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-white/[0.06] h-[100dvh] px-3 py-5 sticky top-0">
          <div className="px-3 pb-5 mb-3 border-b border-white/[0.06] shrink-0">
            <p className="font-serif text-lg leading-none">{org.name}</p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/40 mt-1.5">Game Management</p>
            <div className="mt-2"><StatusBadge status={org.status} /></div>
          </div>
          <nav className="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto -mr-1 pr-1">
            {NAV.map((n) => (
              <button key={n.value}
                onClick={() => { setTab(n.value); if (n.value === "createGame") setEditingGame("new"); }}
                className={"flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all " +
                  (tab === n.value ? "bg-gradient-to-r from-primary/20 to-transparent border border-primary/25 text-white" : "text-white/55 hover:text-white hover:bg-white/[0.04] border border-transparent")}>
                {n.icon}{n.label}
              </button>
            ))}
          </nav>
          <div className="pt-4 shrink-0">
            <Button variant="ghost" asChild className="w-full justify-start text-white/50 hover:text-white">
              <Link href={`/game-organizers/${org.slug}`}><ExternalLink className="h-4 w-4 mr-2" /> View public page</Link>
            </Button>
          </div>
        </aside>

        <div className="md:hidden fixed bottom-0 inset-x-0 z-40 flex overflow-x-auto border-t border-white/10 bg-black/95 backdrop-blur">
          {NAV.map((n) => (
            <button key={n.value} onClick={() => { setTab(n.value); if (n.value === "createGame") setEditingGame("new"); }}
              className={"shrink-0 min-w-[68px] flex flex-col items-center gap-1 py-2.5 text-[10px] " + (tab === n.value ? "text-primary" : "text-white/50")}>
              {n.icon}{n.label}
            </button>
          ))}
        </div>

        <main className="flex-1 px-4 md:px-8 py-6 pb-24 md:pb-8 max-w-5xl">
          {tab === "overview" && (
            <div className="space-y-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Game Management</p>
                <h1 className="font-serif text-2xl md:text-3xl">Welcome, {org.name}</h1>
              </div>
              {org.status !== "approved" && (
                <GlassCard className="p-4 border-amber-500/20 bg-amber-500/[0.05]">
                  <p className="text-amber-200 text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Your game organizer profile is {org.status}. An admin will review it shortly — you can still add games in the meantime.</p>
                </GlassCard>
              )}
              <div className="grid gap-4 sm:grid-cols-4">
                <GlassCard className="p-5"><p className="text-white/50 text-xs uppercase tracking-wider">Total games</p><p className="text-3xl font-serif mt-1">{games.length}</p></GlassCard>
                <GlassCard className="p-5"><p className="text-white/50 text-xs uppercase tracking-wider">Live (approved)</p><p className="text-3xl font-serif mt-1">{approvedGames}</p></GlassCard>
                <GlassCard className="p-5"><p className="text-white/50 text-xs uppercase tracking-wider">Packages</p><p className="text-3xl font-serif mt-1">{packages.length}</p></GlassCard>
                <GlassCard className="p-5"><p className="text-white/50 text-xs uppercase tracking-wider">Bookings</p><p className="text-3xl font-serif mt-1">{overview?.bookings ?? 0}</p></GlassCard>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => { setTab("createGame"); setEditingGame("new"); }} className="bg-primary text-white"><Plus className="h-4 w-4 mr-2" /> Add a game</Button>
                <Button onClick={() => { setTab("createPackage"); setEditingPkg("new"); }} variant="outline" className="border-white/15 text-white/80"><Package className="h-4 w-4 mr-2" /> Build a package</Button>
              </div>
            </div>
          )}

          {tab === "games" && <GamesList games={games} onEdit={(id) => { setEditingGame(id); setTab("createGame"); }} onChanged={loadGames} />}
          {tab === "createGame" && (
            <GameEditor gameId={editingGame === "new" ? null : editingGame}
              onDone={() => { loadGames(); setTab("games"); setEditingGame(null); }}
              onCancel={() => { setTab("games"); setEditingGame(null); }} />
          )}

          {tab === "packages" && <PackagesList packages={packages} onEdit={(id) => { setEditingPkg(id); setTab("createPackage"); }} onChanged={loadPackages} onNew={() => { setEditingPkg("new"); setTab("createPackage"); }} />}
          {tab === "createPackage" && (
            <PackageEditor pkgId={editingPkg === "new" ? null : editingPkg} games={games}
              onDone={() => { loadPackages(); setTab("packages"); setEditingPkg(null); }}
              onCancel={() => { setTab("packages"); setEditingPkg(null); }} />
          )}

          {tab === "scanner" && <ScannerPanel />}
          {tab === "managers" && <ManagersPanel />}
          {tab === "earnings" && <EarningsPanel />}
          {tab === "insights" && <InsightsPanel />}
          {tab === "leads" && <LeadsPanel />}
          {tab === "coupons" && <CouponsPanel games={games} />}
          {tab === "promote" && <PromotePanel games={games} />}
          {tab === "profile" && <ProfileSettings org={org} onSaved={loadProfile} />}
        </main>
      </div>
    </div>
  );
}

// ─── games list ──────────────────────────────────────────────────────────────

function GamesList({ games, onEdit, onChanged }: { games: Game[]; onEdit: (id: number) => void; onChanged: () => void }) {
  const { toast } = useToast();
  const remove = async (id: number) => {
    if (!confirm("Delete this game? This cannot be undone.")) return;
    try { await apiDelete(`/api/game-organizer/games/${id}`); toast({ title: "Game deleted" }); onChanged(); }
    catch (e: any) { toast({ title: "Delete failed", description: e?.message, variant: "destructive" }); }
  };
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Catalogue</p>
          <h1 className="font-serif text-2xl md:text-3xl">Your Games</h1>
        </div>
      </div>
      {games.length === 0 ? (
        <GlassCard className="p-10 text-center"><Gamepad2 className="h-8 w-8 text-white/30 mx-auto mb-3" /><p className="text-white/60">No games yet. Add your first game to start taking bookings.</p></GlassCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {games.map((g) => (
            <GlassCard key={g.id} className="p-4">
              <div className="flex gap-3">
                <div className="h-16 w-16 rounded-xl bg-white/[0.04] overflow-hidden shrink-0 flex items-center justify-center">
                  {g.coverImageUrl ? <img src={g.coverImageUrl} alt={g.name} className="h-full w-full object-cover" /> : <Gamepad2 className="h-6 w-6 text-white/30" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{g.name}</p>
                  <p className="text-white/45 text-xs">{g.category || "Game"} · <span className="text-primary/90">{priceLabel(g)}</span></p>
                  <div className="mt-1.5 flex items-center gap-2"><StatusBadge status={g.approvalStatus} />{!g.active && <Badge variant="secondary">hidden</Badge>}</div>
                </div>
              </div>
              {g.rejectionReason && <p className="text-red-300/80 text-xs mt-2">{g.rejectionReason}</p>}
              <div className="flex gap-2 mt-3 pt-3 border-t border-white/[0.06]">
                <Button size="sm" variant="ghost" className="text-white/70" onClick={() => onEdit(g.id)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                <Button size="sm" variant="ghost" className="text-red-300 hover:text-red-200 ml-auto" onClick={() => remove(g.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── game editor (3 pricing models) ──────────────────────────────────────────

function blankGame(): Game {
  return {
    id: 0, name: "", slug: "", category: "", description: "", rules: "",
    coverImageUrl: "", images: [], videos: [], capacity: 0, ageRestriction: "",
    pricingModel: "fixed", price: "0", hourlyRate: "0", minHours: 1, maxHours: 0,
    commissionPct: "8", gatewayFeePercent: "2", active: true,
    approvalStatus: "pending", rejectionReason: "", isFeaturedSlider: false, soldCount: 0,
  };
}

function GameEditor({ gameId, onDone, onCancel }: { gameId: number | null; onDone: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<Game>(() => blankGame());
  const [loading, setLoading] = useState(Boolean(gameId));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (gameId) {
      setLoading(true);
      apiGet<Game>(`/api/game-organizer/games/${gameId}`).then((g) => setF(g)).catch(() => {}).finally(() => setLoading(false));
    } else { setF(blankGame()); }
  }, [gameId]);

  const set = <K extends keyof Game>(k: K) => (v: Game[K]) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) { toast({ title: "Game name is required", variant: "destructive" }); return; }
    setSaving(true);
    const body = {
      name: f.name, category: f.category, description: f.description, rules: f.rules,
      coverImageUrl: f.coverImageUrl, images: f.images, videos: f.videos,
      capacity: f.capacity, ageRestriction: f.ageRestriction,
      pricingModel: f.pricingModel, price: Number(f.price), hourlyRate: Number(f.hourlyRate),
      minHours: f.minHours, maxHours: f.maxHours,
    };
    try {
      if (gameId) await apiPatch(`/api/game-organizer/games/${gameId}`, body);
      else await apiPost("/api/game-organizer/games", body);
      toast({ title: gameId ? "Game updated" : "Game created", description: "Sent for admin review." });
      onDone();
    } catch (e: any) { toast({ title: "Save failed", description: e?.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl md:text-3xl">{gameId ? "Edit game" : "Add a game"}</h1>
        <Button variant="ghost" className="text-white/60" onClick={onCancel}>Cancel</Button>
      </div>

      <GlassCard className="p-6 space-y-4">
        <SectionTitle><Gamepad2 className="h-4 w-4 text-primary" /> Basics</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Game name *" full><Input className={inputCls} value={f.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. VR Battle Arena" /></Field>
          <Field label="Category">
            <Select value={f.category} onValueChange={set("category")}>
              <SelectTrigger className={inputCls}><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{GAME_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Age restriction"><Input className={inputCls} value={f.ageRestriction} onChange={(e) => set("ageRestriction")(e.target.value)} placeholder="e.g. 12+" /></Field>
          <Field label="Capacity (max players)"><Input type="number" className={inputCls} value={f.capacity || ""} onChange={(e) => set("capacity")(Number(e.target.value))} /></Field>
          <Field label="Description" full><Textarea className={inputCls} rows={3} value={f.description} onChange={(e) => set("description")(e.target.value)} /></Field>
          <Field label="Rules" full><Textarea className={inputCls} rows={3} value={f.rules} onChange={(e) => set("rules")(e.target.value)} placeholder="Safety rules, what to bring, etc." /></Field>
        </div>
      </GlassCard>

      <GlassCard className="p-6 space-y-4">
        <SectionTitle><IndianRupee className="h-4 w-4 text-primary" /> Pricing</SectionTitle>
        <div className="flex gap-2">
          {([["fixed", "Fixed per person"], ["hourly", "Hourly"]] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => set("pricingModel")(v)}
              className={"flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-all " + (f.pricingModel === v ? "border-primary/50 bg-primary/15 text-white" : "border-white/10 text-white/55 hover:text-white")}>
              {v === "fixed" ? <IndianRupee className="h-4 w-4 inline mr-1.5" /> : <Timer className="h-4 w-4 inline mr-1.5" />}{label}
            </button>
          ))}
        </div>
        {f.pricingModel === "fixed" ? (
          <Field label="Price per person (₹)"><Input type="number" className={inputCls} value={f.price} onChange={(e) => set("price")(e.target.value)} placeholder="e.g. 299" /></Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Hourly rate (₹)"><Input type="number" className={inputCls} value={f.hourlyRate} onChange={(e) => set("hourlyRate")(e.target.value)} placeholder="e.g. 200" /></Field>
            <Field label="Minimum hours"><Input type="number" className={inputCls} value={f.minHours || ""} onChange={(e) => set("minHours")(Number(e.target.value) || 1)} /></Field>
            <Field label="Maximum hours (0 = none)"><Input type="number" className={inputCls} value={f.maxHours || ""} onChange={(e) => set("maxHours")(Number(e.target.value))} /></Field>
          </div>
        )}
        <p className="text-white/35 text-[11px]">For a package deal across multiple games, use the Packages tab.</p>
      </GlassCard>

      <GlassCard className="p-6 space-y-4">
        <SectionTitle><ImagePlus className="h-4 w-4 text-primary" /> Media</SectionTitle>
        <ImageUploadField label="Cover image" value={f.coverImageUrl} onChange={set("coverImageUrl")} />
        <GalleryEditor images={f.images} onChange={set("images")} />
        <StringListEditor label="Video links (YouTube etc.)" items={f.videos} onChange={set("videos")} placeholder="https://youtube.com/…" />
      </GlassCard>

      <div className="flex justify-end gap-3">
        <Button variant="ghost" className="text-white/60" onClick={onCancel}>Cancel</Button>
        <Button onClick={save} disabled={saving} className="bg-primary text-white min-w-32">{saving ? <Spinner /> : (gameId ? "Save changes" : "Create game")}</Button>
      </div>
    </div>
  );
}

// ─── packages ────────────────────────────────────────────────────────────────

function PackagesList({ packages, onEdit, onChanged, onNew }: { packages: GamePackage[]; onEdit: (id: number) => void; onChanged: () => void; onNew: () => void }) {
  const { toast } = useToast();
  const remove = async (id: number) => {
    if (!confirm("Delete this package?")) return;
    try { await apiDelete(`/api/game-organizer/packages/${id}`); toast({ title: "Package deleted" }); onChanged(); }
    catch (e: any) { toast({ title: "Delete failed", description: e?.message, variant: "destructive" }); }
  };
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Bundles</p>
          <h1 className="font-serif text-2xl md:text-3xl">Packages</h1>
        </div>
        <Button onClick={onNew} className="bg-primary text-white"><Plus className="h-4 w-4 mr-2" /> Build package</Button>
      </div>
      {packages.length === 0 ? (
        <GlassCard className="p-10 text-center"><Package className="h-8 w-8 text-white/30 mx-auto mb-3" /><p className="text-white/60">No packages yet. Bundle multiple games at a discounted price.</p></GlassCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {packages.map((p) => (
            <GlassCard key={p.id} className="p-4">
              <div className="flex gap-3">
                <div className="h-16 w-16 rounded-xl bg-white/[0.04] overflow-hidden shrink-0 flex items-center justify-center">
                  {p.coverImageUrl ? <img src={p.coverImageUrl} alt={p.name} className="h-full w-full object-cover" /> : <Package className="h-6 w-6 text-white/30" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-white/45 text-xs"><span className="text-primary/90">{formatINR(Number(p.price))}</span>{p.groupSize > 0 ? ` · group of ${p.groupSize}` : ""} · {(p.items?.length ?? 0)} games</p>
                  <div className="mt-1.5"><StatusBadge status={p.approvalStatus} /></div>
                </div>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-white/[0.06]">
                <Button size="sm" variant="ghost" className="text-white/70" onClick={() => onEdit(p.id)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                <Button size="sm" variant="ghost" className="text-red-300 hover:text-red-200 ml-auto" onClick={() => remove(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

function blankPkg(): GamePackage {
  return {
    id: 0, name: "", slug: "", description: "", coverImageUrl: "", images: [],
    price: "0", items: [], addons: [], groupSize: 0, capacity: 0, ageRestriction: "",
    commissionPct: "10", gatewayFeePercent: "2", active: true, approvalStatus: "pending", rejectionReason: "", soldCount: 0,
  };
}

function PackageEditor({ pkgId, games, onDone, onCancel }: { pkgId: number | null; games: Game[]; onDone: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<GamePackage>(() => blankPkg());
  const [loading, setLoading] = useState(Boolean(pkgId));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pkgId) {
      setLoading(true);
      apiGet<GamePackage>(`/api/game-organizer/packages/${pkgId}`).then((p) => setF({ ...p, items: p.items ?? [], addons: p.addons ?? [] })).catch(() => {}).finally(() => setLoading(false));
    } else setF(blankPkg());
  }, [pkgId]);

  const set = <K extends keyof GamePackage>(k: K) => (v: GamePackage[K]) => setF((s) => ({ ...s, [k]: v }));
  const items = f.items ?? [];
  const addons = f.addons ?? [];

  const save = async () => {
    if (!f.name.trim()) { toast({ title: "Package name is required", variant: "destructive" }); return; }
    setSaving(true);
    const body = {
      name: f.name, description: f.description, coverImageUrl: f.coverImageUrl, images: f.images,
      price: Number(f.price), items, addons: addons.map((a) => ({ label: a.label, price: Number(a.price) })),
      groupSize: f.groupSize, capacity: f.capacity, ageRestriction: f.ageRestriction,
    };
    try {
      if (pkgId) await apiPatch(`/api/game-organizer/packages/${pkgId}`, body);
      else await apiPost("/api/game-organizer/packages", body);
      toast({ title: pkgId ? "Package updated" : "Package created", description: "Sent for admin review." });
      onDone();
    } catch (e: any) { toast({ title: "Save failed", description: e?.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl md:text-3xl">{pkgId ? "Edit package" : "Build a package"}</h1>
        <Button variant="ghost" className="text-white/60" onClick={onCancel}>Cancel</Button>
      </div>

      <GlassCard className="p-6 space-y-4">
        <SectionTitle><Package className="h-4 w-4 text-primary" /> Package details</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Package name *" full><Input className={inputCls} value={f.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Weekend Combo" /></Field>
          <Field label="Package price (₹)"><Input type="number" className={inputCls} value={f.price} onChange={(e) => set("price")(e.target.value)} placeholder="e.g. 999" /></Field>
          <Field label="Group size (0 = none)"><Input type="number" className={inputCls} value={f.groupSize || ""} onChange={(e) => set("groupSize")(Number(e.target.value))} /></Field>
          <Field label="Age restriction"><Input className={inputCls} value={f.ageRestriction} onChange={(e) => set("ageRestriction")(e.target.value)} placeholder="e.g. 10+" /></Field>
          <Field label="Description" full><Textarea className={inputCls} rows={3} value={f.description} onChange={(e) => set("description")(e.target.value)} /></Field>
        </div>
        <ImageUploadField label="Cover image" value={f.coverImageUrl} onChange={set("coverImageUrl")} />
      </GlassCard>

      <GlassCard className="p-6 space-y-4">
        <SectionTitle><Gamepad2 className="h-4 w-4 text-primary" /> Games included</SectionTitle>
        {items.map((it, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[180px]">
              <Label className="text-white/60 text-[10px] uppercase tracking-wider">Game</Label>
              <Select value={it.gameId ? String(it.gameId) : "custom"} onValueChange={(v) => {
                const next = [...items];
                if (v === "custom") next[i] = { ...it, gameId: null };
                else { const g = games.find((x) => x.id === Number(v)); next[i] = { ...it, gameId: Number(v), label: g?.name ?? it.label }; }
                set("items")(next);
              }}>
                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom item…</SelectItem>
                  {games.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <Label className="text-white/60 text-[10px] uppercase tracking-wider">Label</Label>
              <Input className={inputCls} value={it.label} onChange={(e) => { const n = [...items]; n[i] = { ...it, label: e.target.value }; set("items")(n); }} placeholder="e.g. Arcade Credits" />
            </div>
            <div className="w-20">
              <Label className="text-white/60 text-[10px] uppercase tracking-wider">Qty</Label>
              <Input type="number" className={inputCls} value={it.quantity} onChange={(e) => { const n = [...items]; n[i] = { ...it, quantity: Number(e.target.value) || 1 }; set("items")(n); }} />
            </div>
            <Button type="button" variant="ghost" className="text-red-300" onClick={() => set("items")(items.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" className="border-white/15 text-white/80" onClick={() => set("items")([...items, { gameId: null, label: "", quantity: 1 }])}><Plus className="h-4 w-4 mr-1" /> Add game</Button>
      </GlassCard>

      <GlassCard className="p-6 space-y-4">
        <SectionTitle><Plus className="h-4 w-4 text-primary" /> Add-ons (optional)</SectionTitle>
        {addons.map((a, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[180px]">
              <Label className="text-white/60 text-[10px] uppercase tracking-wider">Add-on</Label>
              <Input className={inputCls} value={a.label} onChange={(e) => { const n = [...addons]; n[i] = { ...a, label: e.target.value }; set("addons")(n); }} placeholder="e.g. Food Combo" />
            </div>
            <div className="w-28">
              <Label className="text-white/60 text-[10px] uppercase tracking-wider">Price ₹</Label>
              <Input type="number" className={inputCls} value={a.price} onChange={(e) => { const n = [...addons]; n[i] = { ...a, price: Number(e.target.value) }; set("addons")(n); }} />
            </div>
            <Button type="button" variant="ghost" className="text-red-300" onClick={() => set("addons")(addons.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" className="border-white/15 text-white/80" onClick={() => set("addons")([...addons, { label: "", price: 0 }])}><Plus className="h-4 w-4 mr-1" /> Add add-on</Button>
      </GlassCard>

      <div className="flex justify-end gap-3">
        <Button variant="ghost" className="text-white/60" onClick={onCancel}>Cancel</Button>
        <Button onClick={save} disabled={saving} className="bg-primary text-white min-w-32">{saving ? <Spinner /> : (pkgId ? "Save changes" : "Create package")}</Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SCANNER  (QR / manual; attendance + duplicate prevention)
// ════════════════════════════════════════════════════════════════════════════

interface ScannedTicket {
  bookingId: number; itemName: string; organizerName: string; attendee: string;
  persons: number; durationHours: number | null; date: string; time: string; venue: string;
  checkedIn: boolean; checkedInAt: string | null;
}
type ScanStatus = "VALID" | "ALREADY_CHECKED_IN" | "CHECKED_IN";

function Info({ k, v }: { k: string; v: string }) {
  return <div><p className="text-white/40 text-[11px] uppercase tracking-wider">{k}</p><p className="text-white/85">{v}</p></div>;
}

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
  const decodeRef = useRef<((d: Uint8ClampedArray, w: number, h: number, o?: { inversionAttempts?: string }) => { data: string } | null) | null>(null);

  const lookup = useCallback(async (raw: string, confirm: boolean) => {
    const c = raw.trim();
    if (!c) return;
    setBusy(true); setError(null);
    try {
      const res = await apiPost<{ status: ScanStatus; ticket: ScannedTicket; message?: string }>("/api/game-organizer/scan-ticket", { code: c, confirm });
      setResult({ status: res.status, ticket: res.ticket });
      if (res.status === "CHECKED_IN") toast({ title: "Checked in ✓", description: res.ticket.attendee });
      if (res.status === "ALREADY_CHECKED_IN") toast({ title: "Already checked in", variant: "destructive" });
    } catch (e: any) { setResult(null); setError(e?.message || "Scan failed"); }
    finally { setBusy(false); }
  }, [toast]);

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
    } catch { toast({ title: "Camera unavailable", description: "Enter the code manually instead.", variant: "destructive" }); }
  }, [tick, toast]);

  useEffect(() => () => stopCam(), [stopCam]);

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Entry & Attendance</p>
        <h1 className="font-serif text-2xl md:text-3xl">Ticket Scanner</h1>
        <p className="text-white/50 text-sm mt-1">Scan or enter a booking code to verify and check players in. Duplicate check-ins are blocked automatically.</p>
      </div>

      <GlassCard className="p-5 space-y-4">
        <div className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") lookup(code, false); }}
            placeholder="e.g. ARCD-000011-76" className="bg-white/[0.04] border-white/10 text-white font-mono uppercase" />
          <Button className="bg-primary text-white shrink-0" disabled={busy} onClick={() => lookup(code, false)}>{busy ? <Spinner /> : <><ScanLine className="h-4 w-4 mr-1.5" /> Verify</>}</Button>
        </div>
        <Button variant="outline" className="w-full border-white/15 text-white/80" onClick={() => (camOn ? stopCam() : startCam())}>
          {camOn ? <><CameraOff className="h-4 w-4 mr-2" /> Stop camera</> : <><Camera className="h-4 w-4 mr-2" /> Scan with camera</>}
        </Button>
        <div className={camOn ? "rounded-xl overflow-hidden border border-white/10" : "hidden"}>
          <video ref={videoRef} className="w-full" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </GlassCard>

      {error && <GlassCard className="p-4 border-red-500/30 bg-red-500/[0.06]"><p className="text-red-300 text-sm flex items-center gap-2"><XCircle className="h-4 w-4" /> {error}</p></GlassCard>}

      {result && (
        <GlassCard className={"p-5 " + (result.status === "ALREADY_CHECKED_IN" ? "border-amber-500/30 bg-amber-500/[0.05]" : result.status === "CHECKED_IN" ? "border-emerald-500/30 bg-emerald-500/[0.05]" : "border-white/10")}>
          <div className="flex items-center gap-2 mb-3">
            {result.status === "CHECKED_IN" ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : result.status === "ALREADY_CHECKED_IN" ? <Clock className="h-5 w-5 text-amber-400" /> : <CheckCircle2 className="h-5 w-5 text-primary" />}
            <span className="font-medium">{result.status === "CHECKED_IN" ? "Checked in" : result.status === "ALREADY_CHECKED_IN" ? "Already checked in" : "Valid ticket"}</span>
          </div>
          <h3 className="font-serif text-xl">{result.ticket.itemName}</h3>
          <p className="text-white/50 text-sm">{result.ticket.organizerName}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-sm">
            <Info k="Attendee" v={result.ticket.attendee} />
            <Info k="Players" v={`${result.ticket.persons}${result.ticket.durationHours ? ` · ${result.ticket.durationHours}h` : ""}`} />
            <Info k="Date" v={`${result.ticket.date}${result.ticket.time ? ` · ${result.ticket.time}` : ""}`} />
            <Info k="Venue" v={result.ticket.venue || "—"} />
            <Info k="Booking" v={`#${result.ticket.bookingId}`} />
            {result.ticket.checkedInAt && <Info k="Checked in at" v={new Date(result.ticket.checkedInAt).toLocaleString()} />}
          </div>
          {result.status === "VALID" && (
            <Button className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-white" disabled={busy} onClick={() => lookup(code, true)}><CheckCircle2 className="h-4 w-4 mr-2" /> Confirm check-in</Button>
          )}
        </GlassCard>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MANAGERS
// ════════════════════════════════════════════════════════════════════════════

interface ManagerPerms { scan: boolean; attendance: boolean; reports: boolean; }
interface ManagerRow { id: number; invitedEmail: string; status: string; permissions: ManagerPerms; manager: { id: number; name: string; email: string } | null; }

function PermToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="text-sm text-white/70 flex items-center gap-1"><Shield className="h-3 w-3 text-white/30" />{label}</span>
    </label>
  );
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
    apiGet<ManagerRow[]>("/api/game-organizer/managers").then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    if (!email.trim()) { toast({ title: "Enter an email", variant: "destructive" }); return; }
    setInviting(true);
    try { await apiPost("/api/game-organizer/managers/invite", { email: email.trim(), permissions: perms }); toast({ title: "Invitation sent", description: email.trim() }); setEmail(""); load(); }
    catch (e: any) { toast({ title: "Invite failed", description: e?.message, variant: "destructive" }); }
    finally { setInviting(false); }
  };
  const togglePerm = async (row: ManagerRow, key: keyof ManagerPerms, val: boolean) => {
    const next = { ...row.permissions, [key]: val };
    setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, permissions: next } : r));
    try { await apiPatch(`/api/game-organizer/managers/${row.id}`, { permissions: next }); }
    catch (e: any) { toast({ title: "Update failed", description: e?.message, variant: "destructive" }); load(); }
  };
  const remove = async (row: ManagerRow) => {
    try { await apiDelete(`/api/game-organizer/managers/${row.id}`); toast({ title: "Manager removed" }); load(); }
    catch (e: any) { toast({ title: "Remove failed", description: e?.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Team</p>
        <h1 className="font-serif text-2xl md:text-3xl">Game Managers</h1>
        <p className="text-white/50 text-sm mt-1">Invite staff to scan tickets and mark attendance. Permissions are configurable per manager.</p>
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
        {loading ? <Spinner /> : rows.length === 0 ? <p className="text-white/50 text-sm">No managers yet.</p> : (
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

// ════════════════════════════════════════════════════════════════════════════
// EARNINGS / BANKING
// ════════════════════════════════════════════════════════════════════════════

interface RevenueRow { id: number; name: string; type: string; commissionPct: string; gatewayFeePercent: string; revenue: string; commission: string; gatewayFee: string; net: string; attended: number; }
interface RevenuePayload { games: RevenueRow[]; packages: RevenueRow[]; totals: { revenue: string; commission: string; gatewayFee: string; net: string }; commissionOwed: string; }
interface BankingPayload { banking: { accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string } | null; settlements: { id: number; amount: string; status: string; adminNote: string; createdAt: string }[]; commissionOwed: string; }

function EarningsPanel() {
  const { toast } = useToast();
  const [rev, setRev] = useState<RevenuePayload | null>(null);
  const [bank, setBank] = useState<BankingPayload | null>(null);
  const [form, setForm] = useState({ accountHolderName: "", bankName: "", accountNumber: "", ifscCode: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiGet<RevenuePayload>("/api/game-organizer/revenue").then(setRev).catch(() => {});
    apiGet<BankingPayload>("/api/game-organizer/banking").then((b) => {
      setBank(b);
      if (b.banking) setForm({ accountHolderName: b.banking.accountHolderName, bankName: b.banking.bankName, accountNumber: b.banking.accountNumber, ifscCode: b.banking.ifscCode });
    }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveBank = async () => {
    setSaving(true);
    try { await apiPut("/api/game-organizer/banking", form); toast({ title: "Banking details saved" }); load(); }
    catch (e: any) { toast({ title: "Save failed", description: e?.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const owed = Number(rev?.commissionOwed ?? bank?.commissionOwed ?? 0);
  const ic = "mt-1 bg-white/[0.04] border-white/10 text-white";
  const rows = [...(rev?.games ?? []), ...(rev?.packages ?? [])];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Finance</p>
        <h1 className="font-serif text-2xl md:text-3xl">Banking &amp; Settlements</h1>
        <p className="text-white/50 text-sm mt-1">Revenue is realised when a player is checked in. You collect the cash and owe the platform its commission per game / package.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-primary" />Gross revenue</p><p className="font-serif text-2xl mt-1">{formatINR(Number(rev?.totals.revenue ?? 0))}</p></GlassCard>
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider">Commission</p><p className="font-serif text-2xl mt-1">{formatINR(Number(rev?.totals.commission ?? 0))}</p></GlassCard>
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider">Net earnings</p><p className="font-serif text-2xl mt-1 text-emerald-300">{formatINR(Number(rev?.totals.net ?? 0))}</p></GlassCard>
        <GlassCard className={"p-4 " + (owed > 0 ? "border-amber-500/30 bg-amber-500/[0.05]" : "")}><p className="text-white/50 text-xs uppercase tracking-wider">Owed to platform</p><p className="font-serif text-2xl mt-1 text-amber-300">{formatINR(owed)}</p></GlassCard>
      </div>

      <div>
        <h2 className="font-serif text-lg mb-3">By game &amp; package</h2>
        {rows.length === 0 ? <p className="text-white/50 text-sm">No revenue yet.</p> : (
          <div className="overflow-x-auto rounded-2xl border border-white/[0.07]">
            <table className="w-full text-sm">
              <thead><tr className="text-white/40 text-[11px] uppercase tracking-wider border-b border-white/[0.07]">
                <th className="text-left font-medium p-3">Item</th>
                <th className="text-left font-medium p-3">Type</th>
                <th className="text-right font-medium p-3">Comm %</th>
                <th className="text-right font-medium p-3">Attended</th>
                <th className="text-right font-medium p-3">Revenue</th>
                <th className="text-right font-medium p-3">Commission</th>
                <th className="text-right font-medium p-3">Net</th>
              </tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={`${e.type}-${e.id}`} className="border-b border-white/[0.04] last:border-0">
                    <td className="p-3">{e.name}</td>
                    <td className="p-3 text-white/50 capitalize">{e.type}</td>
                    <td className="p-3 text-right text-white/60">{Number(e.commissionPct).toFixed(1)}%</td>
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

      <GlassCard className="p-5 space-y-4">
        <h2 className="font-serif text-lg flex items-center gap-2"><Banknote className="h-4 w-4 text-primary" /> Payout / banking details</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label className="text-white/70 text-xs uppercase tracking-wider">Account holder</Label><Input className={ic} value={form.accountHolderName} onChange={(e) => setForm((f) => ({ ...f, accountHolderName: e.target.value }))} /></div>
          <div><Label className="text-white/70 text-xs uppercase tracking-wider">Bank name</Label><Input className={ic} value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} /></div>
          <div><Label className="text-white/70 text-xs uppercase tracking-wider">Account number</Label><Input className={ic} value={form.accountNumber} onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))} /></div>
          <div><Label className="text-white/70 text-xs uppercase tracking-wider">IFSC</Label><Input className={ic} value={form.ifscCode} onChange={(e) => setForm((f) => ({ ...f, ifscCode: e.target.value.toUpperCase() }))} /></div>
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
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ANALYTICS  (popular games/packages, peak hours, repeat, conversion + report)
// ════════════════════════════════════════════════════════════════════════════

interface Analytics {
  totals: { bookings: number; players: number; revenue: string; attended: number; attendanceRate: number; conversionRate: number; totalCustomers: number; repeatCustomers: number };
  popularGames: { id: number; name: string; bookings: number; players: number; revenue: string }[];
  popularPackages: { id: number; name: string; bookings: number; revenue: string }[];
  peakHours: { hour: string; bookings: number }[];
  recent: { day: string; bookings: number; revenue: string }[];
}
interface BookingRow {
  id: number; createdAt: string; bookingDate: string; time: string | null; durationHours: string | null;
  persons: number; amount: string; checkedIn: boolean; attendee: string; phone: string; email: string;
  itemName: string; gameName: string | null; packageName: string | null;
}

function InsightsPanel() {
  const [an, setAn] = useState<Analytics | null>(null);
  const [rows, setRows] = useState<BookingRow[]>([]);

  useEffect(() => { apiGet<Analytics>("/api/game-organizer/analytics").then(setAn).catch(() => {}); }, []);
  useEffect(() => { apiGet<BookingRow[]>("/api/game-organizer/bookings").then(setRows).catch(() => {}); }, []);

  const peakMax = Math.max(1, ...(an?.peakHours ?? []).map((h) => h.bookings));

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Reports</p>
        <h1 className="font-serif text-2xl md:text-3xl">Analytics</h1>
        <p className="text-white/50 text-sm mt-1">Bookings, revenue, attendance, popular games, peak hours and repeat customers.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider">Bookings</p><p className="font-serif text-2xl mt-1">{an?.totals.bookings ?? 0}</p></GlassCard>
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider">Revenue</p><p className="font-serif text-2xl mt-1">{formatINR(Number(an?.totals.revenue ?? 0))}</p></GlassCard>
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider">Attendance rate</p><p className="font-serif text-2xl mt-1">{an?.totals.attendanceRate ?? 0}%</p></GlassCard>
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider">Conversion</p><p className="font-serif text-2xl mt-1">{an?.totals.conversionRate ?? 0}%</p></GlassCard>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-primary" />Players</p><p className="font-serif text-2xl mt-1">{an?.totals.players ?? 0}</p></GlassCard>
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider">Checked in</p><p className="font-serif text-2xl mt-1">{an?.totals.attended ?? 0}</p></GlassCard>
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider">Customers</p><p className="font-serif text-2xl mt-1">{an?.totals.totalCustomers ?? 0}</p></GlassCard>
        <GlassCard className="p-4"><p className="text-white/50 text-xs uppercase tracking-wider">Repeat customers</p><p className="font-serif text-2xl mt-1 text-emerald-300">{an?.totals.repeatCustomers ?? 0}</p></GlassCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <GlassCard className="p-5">
          <p className="font-serif text-lg mb-3">Most popular games</p>
          {!an || an.popularGames.filter((g) => g.bookings > 0).length === 0 ? <p className="text-white/50 text-sm">No bookings yet.</p> : (
            <div className="space-y-2">{an.popularGames.filter((g) => g.bookings > 0).slice(0, 8).map((g) => (
              <div key={g.id} className="flex items-center justify-between text-sm"><span className="text-white/80 truncate">{g.name}</span><span className="text-white/50">{g.bookings} bookings · {formatINR(Number(g.revenue))}</span></div>
            ))}</div>
          )}
        </GlassCard>
        <GlassCard className="p-5">
          <p className="font-serif text-lg mb-3">Most popular packages</p>
          {!an || an.popularPackages.filter((p) => p.bookings > 0).length === 0 ? <p className="text-white/50 text-sm">No package bookings yet.</p> : (
            <div className="space-y-2">{an.popularPackages.filter((p) => p.bookings > 0).slice(0, 8).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm"><span className="text-white/80 truncate">{p.name}</span><span className="text-white/50">{p.bookings} bookings · {formatINR(Number(p.revenue))}</span></div>
            ))}</div>
          )}
        </GlassCard>
      </div>

      <GlassCard className="p-5">
        <p className="font-serif text-lg mb-3 flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /> Peak booking hours</p>
        {!an || an.peakHours.length === 0 ? <p className="text-white/50 text-sm">No data yet.</p> : (
          <div className="flex items-end gap-1.5 h-32">
            {an.peakHours.map((h) => (
              <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-primary/30 rounded-t" style={{ height: `${(h.bookings / peakMax) * 100}%` }} title={`${h.bookings} bookings`} />
                <span className="text-[9px] text-white/40">{h.hour}</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <div>
        <h2 className="font-serif text-lg mb-3">Booking report</h2>
        {rows.length === 0 ? <p className="text-white/50 text-sm">No bookings yet.</p> : (
          <div className="overflow-x-auto rounded-2xl border border-white/[0.07]">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="text-white/40 text-[11px] uppercase tracking-wider border-b border-white/[0.07]">
                <th className="text-left font-medium p-3">Booking</th>
                <th className="text-left font-medium p-3">Item</th>
                <th className="text-left font-medium p-3">Attendee</th>
                <th className="text-left font-medium p-3 hidden sm:table-cell">Contact</th>
                <th className="text-right font-medium p-3">When</th>
                <th className="text-right font-medium p-3">Amount</th>
                <th className="text-center font-medium p-3">In</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="p-3 text-white/60">#{r.id}</td>
                    <td className="p-3">{r.itemName || r.gameName || r.packageName || "—"}{r.durationHours ? ` · ${Number(r.durationHours)}h` : ""}</td>
                    <td className="p-3">{r.attendee}</td>
                    <td className="p-3 text-white/50 text-xs hidden sm:table-cell">{[r.email, r.phone].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="p-3 text-right text-white/60">{r.bookingDate}{r.time ? ` ${r.time}` : ""}</td>
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
// LEADS
// ════════════════════════════════════════════════════════════════════════════

interface LeadView { viewerUserId: number | null; viewerName: string; viewerEmail: string; phone: string; visitCount: number; lastViewedAt: string | null; hasBooked: boolean; }
interface LeadsPayload { totalViews: number; bookedCount: number; views: LeadView[]; }

function LeadsPanel() {
  const [data, setData] = useState<LeadsPayload | null>(null);
  useEffect(() => { apiGet<LeadsPayload>("/api/game-organizer/leads").then(setData).catch(() => {}); }, []);
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Audience</p>
        <h1 className="font-serif text-2xl md:text-3xl">Leads</h1>
        <p className="text-white/50 text-sm mt-1">People who viewed your page, and who's already booked.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <GlassCard className="p-5"><Eye className="h-5 w-5 text-primary mb-2" /><p className="font-serif text-3xl">{data?.totalViews ?? 0}</p><p className="text-xs uppercase tracking-wider text-white/50">Profile views</p></GlassCard>
        <GlassCard className="p-5"><TrendingUp className="h-5 w-5 text-emerald-400 mb-2" /><p className="font-serif text-3xl text-emerald-400">{data?.bookedCount ?? 0}</p><p className="text-xs uppercase tracking-wider text-white/50">Already booked</p></GlassCard>
      </div>
      <GlassCard className="p-5">
        <p className="font-serif text-lg mb-3">Recent visitors</p>
        {!data || data.views.length === 0 ? <p className="text-white/50 text-sm">No one has viewed your page yet.</p> : (
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

interface Coupon { id: number; code: string; discountType: string; discountValue: string; gameId: number | null; active: boolean; maxUses: number | null; usedCount: number; expiresAt: string | null; }

function CouponsPanel({ games }: { games: Game[] }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Coupon[]>([]);
  const [form, setForm] = useState({ code: "", discountType: "percent", discountValue: "10", gameId: "all", maxUses: "", expiresAt: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => { apiGet<Coupon[]>("/api/game-organizer/coupons").then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.code.trim()) { toast({ title: "Enter a code", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await apiPost("/api/game-organizer/coupons", {
        code: form.code, discountType: form.discountType, discountValue: Number(form.discountValue),
        gameId: form.gameId === "all" ? null : Number(form.gameId),
        maxUses: form.maxUses ? Number(form.maxUses) : null, expiresAt: form.expiresAt || null,
      });
      toast({ title: "Coupon created" });
      setForm({ code: "", discountType: "percent", discountValue: "10", gameId: "all", maxUses: "", expiresAt: "" });
      load();
    } catch (e: any) { toast({ title: "Create failed", description: e?.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };
  const toggle = async (c: Coupon) => { try { await apiPatch(`/api/game-organizer/coupons/${c.id}`, { active: !c.active }); load(); } catch {} };
  const remove = async (c: Coupon) => { try { await apiDelete(`/api/game-organizer/coupons/${c.id}`); load(); } catch {} };

  const ic = "mt-1 bg-white/[0.04] border-white/10 text-white";
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Growth</p>
        <h1 className="font-serif text-2xl md:text-3xl">Discount Coupons</h1>
        <p className="text-white/50 text-sm mt-1">Codes players can apply at checkout. Leave game as "All" to cover every game &amp; package.</p>
      </div>

      <GlassCard className="p-5 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label className="text-white/70 text-xs uppercase tracking-wider">Code</Label><Input className={ic} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="PLAY20" /></div>
          <div>
            <Label className="text-white/70 text-xs uppercase tracking-wider">Game</Label>
            <Select value={form.gameId} onValueChange={(v) => setForm((f) => ({ ...f, gameId: v }))}>
              <SelectTrigger className={ic}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All games &amp; packages</SelectItem>{games.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-white/70 text-xs uppercase tracking-wider">Type</Label>
            <Select value={form.discountType} onValueChange={(v) => setForm((f) => ({ ...f, discountType: v }))}>
              <SelectTrigger className={ic}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="percent">Percent %</SelectItem><SelectItem value="fixed">Fixed ₹</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label className="text-white/70 text-xs uppercase tracking-wider">Value</Label><Input className={ic} type="number" value={form.discountValue} onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))} /></div>
          <div><Label className="text-white/70 text-xs uppercase tracking-wider">Max uses (optional)</Label><Input className={ic} type="number" value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} /></div>
          <div><Label className="text-white/70 text-xs uppercase tracking-wider">Expires (optional)</Label><Input className={ic} type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} /></div>
        </div>
        <div className="flex justify-end"><Button className="bg-primary text-white" onClick={create} disabled={saving}>{saving ? <Spinner /> : "Create coupon"}</Button></div>
      </GlassCard>

      <div className="space-y-2">
        {rows.length === 0 ? <p className="text-white/50 text-sm">No coupons yet.</p> : rows.map((c) => (
          <GlassCard key={c.id} className="p-4 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono font-medium">{c.code} <span className="text-primary">{c.discountType === "fixed" ? formatINR(Number(c.discountValue)) : `${Number(c.discountValue)}%`}</span></p>
              <p className="text-white/45 text-xs">
                {c.gameId ? (games.find((g) => g.id === c.gameId)?.name ?? "Game") : "All games"}
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
// ADS / PROMOTE
// ════════════════════════════════════════════════════════════════════════════

interface AdRequest { id: number; status: string; note: string; adminNote: string; createdAt: string; gameName: string; featured: boolean; }

function PromotePanel({ games }: { games: Game[] }) {
  const { toast } = useToast();
  const approved = games.filter((g) => g.approvalStatus === "approved");
  const [rows, setRows] = useState<AdRequest[]>([]);
  const [gameId, setGameId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => { apiGet<AdRequest[]>("/api/game-organizer/ads").then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!gameId) { toast({ title: "Pick a game", variant: "destructive" }); return; }
    setSaving(true);
    try { await apiPost("/api/game-organizer/ads", { gameId: Number(gameId), note }); toast({ title: "Promotion requested" }); setGameId(""); setNote(""); load(); }
    catch (e: any) { toast({ title: "Request failed", description: e?.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Growth</p>
        <h1 className="font-serif text-2xl md:text-3xl">Promote / Ads</h1>
        <p className="text-white/50 text-sm mt-1">Request to feature a game in the Royvento featured slider. Admin reviews each request.</p>
      </div>

      <GlassCard className="p-5 space-y-3">
        <div>
          <Label className="text-white/70 text-xs uppercase tracking-wider">Game</Label>
          <Select value={gameId} onValueChange={setGameId}>
            <SelectTrigger className="mt-1 bg-white/[0.04] border-white/10"><SelectValue placeholder="Select an approved game" /></SelectTrigger>
            <SelectContent>{approved.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-white/70 text-xs uppercase tracking-wider">Note (optional)</Label><Textarea className="mt-1 bg-white/[0.04] border-white/10 text-white" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why should this be featured?" /></div>
        <div className="flex justify-end"><Button className="bg-primary text-white" onClick={submit} disabled={saving}>{saving ? <Spinner /> : "Request promotion"}</Button></div>
      </GlassCard>

      <div className="space-y-2">
        {rows.length === 0 ? <p className="text-white/50 text-sm">No promotion requests yet.</p> : rows.map((r) => (
          <GlassCard key={r.id} className="p-4 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{r.gameName}</p>
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

// ════════════════════════════════════════════════════════════════════════════
// PROFILE SETTINGS
// ════════════════════════════════════════════════════════════════════════════

function ProfileSettings({ org, onSaved }: { org: GameOrganizer; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<GameOrganizer>(org);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof GameOrganizer>(k: K) => (v: GameOrganizer[K]) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await apiPatch("/api/game-organizer/profile", {
        name: f.name, description: f.description, city: f.city, state: f.state, address: f.address, mapsUrl: f.mapsUrl,
        website: f.website, instagram: f.instagram, facebook: f.facebook, youtube: f.youtube,
        supportEmail: f.supportEmail, supportPhone: f.supportPhone, logoUrl: f.logoUrl, coverImageUrl: f.coverImageUrl, galleryImages: f.galleryImages,
      });
      toast({ title: "Profile saved" });
      onSaved();
    } catch (e: any) { toast({ title: "Save failed", description: e?.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-serif text-2xl md:text-3xl">Profile Settings</h1>
      <GlassCard className="p-6 space-y-4">
        <SectionTitle><Settings className="h-4 w-4 text-primary" /> Venue brand</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Venue name" full><Input className={inputCls} value={f.name} onChange={(e) => set("name")(e.target.value)} /></Field>
          <Field label="About" full><Textarea className={inputCls} rows={3} value={f.description} onChange={(e) => set("description")(e.target.value)} /></Field>
          <Field label="City"><Input className={inputCls} value={f.city} onChange={(e) => set("city")(e.target.value)} /></Field>
          <Field label="State"><Input className={inputCls} value={f.state} onChange={(e) => set("state")(e.target.value)} /></Field>
          <Field label="Address" full><Textarea className={inputCls} rows={2} value={f.address} onChange={(e) => set("address")(e.target.value)} /></Field>
          <Field label="Google Maps URL" full><Input className={inputCls} value={f.mapsUrl} onChange={(e) => set("mapsUrl")(e.target.value)} /></Field>
          <ImageUploadField label="Logo" value={f.logoUrl} onChange={set("logoUrl")} />
          <ImageUploadField label="Cover image" value={f.coverImageUrl} onChange={set("coverImageUrl")} />
        </div>
        <GalleryEditor images={f.galleryImages ?? []} onChange={set("galleryImages")} />
      </GlassCard>

      <GlassCard className="p-6 space-y-4">
        <SectionTitle><ExternalLink className="h-4 w-4 text-primary" /> Links & support</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          {([["website", "Website"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["youtube", "YouTube"], ["supportEmail", "Support email"], ["supportPhone", "Support phone"]] as const).map(([k, label]) => (
            <Field key={k} label={label}><Input className={inputCls} value={f[k]} onChange={(e) => set(k)(e.target.value)} /></Field>
          ))}
        </div>
      </GlassCard>

      <div className="flex justify-end gap-3">
        <Button onClick={save} disabled={saving} className="bg-primary text-white min-w-32">{saving ? <Spinner /> : "Save profile"}</Button>
      </div>
    </div>
  );
}
