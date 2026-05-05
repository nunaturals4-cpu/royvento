import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch, useRoute } from "wouter";
import {
  useGetMyVendor,
  useCreateMyVendor,
  useUpdateMyVendor,
  useListMyVendorEvents,
  useCreateEvent,
  useDeleteEvent,
  useListVendorBookings,
  useGetPartnerCheckinReport,
} from "@workspace/api-client-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Trash2, Calendar as CalIcon, Image as ImageIcon, Video,
  Megaphone, Crown, Users, Eye, MapPin, Building2, Wine, Pencil, Upload, Ticket as TicketIcon, ScanLine,
  TrendingUp, IndianRupee, Clock, Navigation, Tag, ChevronDown, GlassWater, Plus, CalendarCheck,
  Banknote, CreditCard, CheckCircle, Search, ChevronLeft, ChevronRight, UserCheck, UserX, Percent,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  apiGet, apiPost, apiDelete, apiPatch, apiPut,
  EVENT_CATEGORIES, PUB_EVENT_TYPES, formatINR, fileToDataUrl,
} from "@/lib/api";
import { COUNTRY_NAMES, getStates, getCities } from "@/lib/locations";
import { Checkbox } from "@/components/ui/checkbox";

const CATEGORIES = [...EVENT_CATEGORIES];
const EVENT_KIND = ["event", "pub"] as const;


interface BlockedDate {
  id: number; date: string; reason: string; source: string;
}
interface Ad {
  id: number; status: string; message: string; createdAt: string;
}
interface Lead {
  premium: boolean;
  crmAccessGranted?: boolean;
  crmTrialActive?: boolean;
  crmTrialDaysRemaining?: number;
  views: any[];
  message?: string;
}

export function VendorDashboard() {
  const search = useSearch();
  const rawTab = new URLSearchParams(search).get("tab") ?? "overview";
  const initialTab = rawTab === "listing" ? "events" : rawTab;
  const { data: vendorData, refetch: refetchVendor } = useGetMyVendor();
  const vendor = (vendorData?.vendor ?? null) as any;
  const { data: eventsResp, refetch: refetchEvents } = useListMyVendorEvents(undefined, { query: { enabled: !!vendor } as any });
  const events = eventsResp?.data ?? [];
  const hasPub = events.some((e: any) => e.type === "pub");

  const [bookTablePage, setBookTablePage] = useState(1);

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <header className="mb-10 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-primary mb-2 accent-underline inline-block">Partner</p>
          <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-3">Studio dashboard</h1>
        </div>
        {vendor?.isPremium && (
          <Badge className="bg-primary border-0 text-primary-foreground red-glow gap-1">
            <Crown className="h-3.5 w-3.5" /> Premium partner
          </Badge>
        )}
      </header>

      {!vendor ? (
        <div className="rounded-3xl glass-card p-10 text-center">
          <p className="font-serif text-2xl mb-2">Setting up your dashboard…</p>
          <p className="text-muted-foreground">Your partner profile is being prepared. Please refresh in a moment or contact support if this persists.</p>
        </div>
      ) : (
        <Tabs defaultValue={initialTab} className="space-y-6">
          <TabsList className="bg-card flex-wrap h-auto p-1 gap-1">
            <TabsTrigger value="overview">Profile</TabsTrigger>
            <TabsTrigger value="events">Events &amp; pubs</TabsTrigger>
            <TabsTrigger value="bookings">Booking Report</TabsTrigger>
            <TabsTrigger value="analytics">
              <TrendingUp className="h-3.5 w-3.5 mr-1 text-primary" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="ads">Ads</TabsTrigger>
            <TabsTrigger value="announcements">
              <Megaphone className="h-3.5 w-3.5 mr-1 text-primary" /> Announcements
            </TabsTrigger>
            <TabsTrigger value="leads">
              <Crown className="h-3.5 w-3.5 mr-1 text-primary" /> Leads
            </TabsTrigger>
            <TabsTrigger value="drinkplans">
              <GlassWater className="h-3.5 w-3.5 mr-1 text-primary" /> Drink Plans
            </TabsTrigger>
            <TabsTrigger value="attendance">
              <UserCheck className="h-3.5 w-3.5 mr-1 text-primary" /> Attendance
            </TabsTrigger>
            <TabsTrigger value="managers">
              <Users className="h-3.5 w-3.5 mr-1 text-primary" /> Managers
            </TabsTrigger>
            <TabsTrigger value="banking">
              <Banknote className="h-3.5 w-3.5 mr-1 text-primary" /> Banking &amp; Settlement
            </TabsTrigger>
            <Link href="/dashboard/vendor/scanner">
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-primary/30 text-primary hover:bg-primary/10 transition-colors">
                <ScanLine className="h-3.5 w-3.5" /> Ticket scanner
              </button>
            </Link>
          </TabsList>

          <TabsContent value="overview"><ProfileEditor vendor={vendor} onSaved={refetchVendor} /></TabsContent>
          <TabsContent value="events"><EventsManager vendor={vendor} events={events} refetchEvents={refetchEvents} onSaved={refetchVendor} /></TabsContent>
          <TabsContent value="bookings"><BookingReport bookTablePage={bookTablePage} setBookTablePage={setBookTablePage} /></TabsContent>
          <TabsContent value="analytics"><AnalyticsPanel /></TabsContent>
          <TabsContent value="calendar"><BlockedCalendar vendorId={vendor.id} /></TabsContent>
          <TabsContent value="ads"><AdsPanel /></TabsContent>
          <TabsContent value="announcements"><AnnouncementsPanel /></TabsContent>
          <TabsContent value="leads"><LeadsPanel /></TabsContent>
          <TabsContent value="drinkplans"><DrinkPlansPanel vendorId={vendor.id} /></TabsContent>
          <TabsContent value="attendance"><AttendancePanel /></TabsContent>
          <TabsContent value="managers"><ManagersPanel /></TabsContent>
          <TabsContent value="banking"><BankingPanel /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const WEEKEND_DAYS = ["Sat", "Sun"] as const;

const DAY_FULL_NAMES: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
  Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

type DayTimes = Record<string, { open: string; close: string }>;

interface PlacesSuggestion { place_id: string; description: string; types: string[]; }

function parseDayHours(raw: unknown): DayTimes {
  if (!raw || typeof raw !== "object") return {};
  const out: DayTimes = {};
  for (const [day, val] of Object.entries(raw as Record<string, unknown>)) {
    if (val && typeof val === "object" && "open" in val && "close" in val) {
      const entry = val as { open: unknown; close: unknown };
      out[day] = { open: String(entry.open), close: String(entry.close) };
    }
  }
  return out;
}

const DANCE_FLOOR_OPTIONS = [
  { value: "dedicated", label: "Dedicated dance floor" },
  { value: "general", label: "Dancing in main area" },
  { value: "none", label: "No dancing / seated only" },
] as const;

function ProfileEditor({ vendor, onSaved }: { vendor: any; onSaved: () => void }) {
  const [businessName, setName] = useState(vendor.businessName);
  const [description, setDescription] = useState(vendor.description);
  const [descError, setDescError] = useState("");
  const update = useUpdateMyVendor();
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 300) {
      setDescError("Description must be at least 300 characters.");
      return;
    }
    setDescError("");
    const city = vendor.city ?? "";
    const stateF = vendor.state ?? "";
    update.mutate(
      { data: { businessName, category: vendor.category, description, location: `${city}${stateF ? ", " + stateF : ""}`, country: vendor.country || "India", state: stateF, city, bannerImage: vendor.bannerImage ?? "", portfolioImages: [] } },
      {
        onSuccess: () => {
          toast({ title: "Profile updated" });
          onSaved();
        },
        onError: (err: unknown) => toast({ title: "Failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
      },
    );
  };

  return (
    <form onSubmit={submit} className="rounded-3xl glass-card-strong p-8 space-y-4">
        <div>
          <Label>Business name</Label>
          <Input value={businessName} onChange={(e) => setName(e.target.value)} className="bg-black/40 border-white/10" />
        </div>
        <div>
          <Label>Description <span className="text-muted-foreground text-xs">(min 300 characters)</span></Label>
          <Textarea
            rows={6}
            value={description}
            onChange={(e) => { setDescription(e.target.value); if (descError) setDescError(""); }}
            className="bg-black/40 border-white/10"
          />
          <div className="flex items-center justify-between mt-1">
            {descError ? (
              <p className="text-xs text-destructive">{descError}</p>
            ) : (
              <span />
            )}
            <p className={`text-xs ml-auto ${description.length >= 300 ? "text-green-400" : "text-muted-foreground"}`}>
              {description.length} / 300
            </p>
          </div>
        </div>
        <Button type="submit" disabled={update.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">
          {update.isPending ? "Saving…" : "Save profile"}
        </Button>
    </form>
  );
}

function ListingEditor({ vendor, onSaved }: { vendor: any; onSaved: () => void }) {
  const [stateF, setStateF] = useState(vendor.state ?? "");
  const [city, setCity] = useState(vendor.city ?? "");
  const [country, setCountry] = useState(vendor.country || "India");
  const [danceFloor, setDanceFloor] = useState<string>(vendor.danceFloor ?? "");
  const [danceFloorPhotos, setDanceFloorPhotos] = useState<string[]>(
    Array.isArray(vendor.danceFloorPhotos) ? vendor.danceFloorPhotos : []
  );
  const [uploadingDfPhoto, setUploadingDfPhoto] = useState(false);
  const [openDays, setOpenDays] = useState<string[]>(
    Array.isArray(vendor.openDays) && vendor.openDays.length > 0 ? vendor.openDays : [...ALL_DAYS]
  );
  const [dayTimes, setDayTimes] = useState<DayTimes>(() => parseDayHours(vendor.dayHours));
  const [address, setAddress] = useState<string>(vendor.address ?? "");
  const [addressQuery, setAddressQuery] = useState<string>(vendor.address ?? "");
  const [fetchedAddress, setFetchedAddress] = useState<string>("");
  const [addressMode, setAddressMode] = useState<"business" | "manual">("business");
  const [suggestions, setSuggestions] = useState<PlacesSuggestion[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuUrls, setMenuUrls] = useState<string[]>(
    Array.isArray(vendor.menuUrls) && vendor.menuUrls.length > 0
      ? vendor.menuUrls
      : vendor.menuUrl ? [vendor.menuUrl] : []
  );
  const [uploadingMenu, setUploadingMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dayHoursErrors, setDayHoursErrors] = useState<Record<string, string>>(() => {
    const initial = parseDayHours(vendor.dayHours);
    const errors: Record<string, string> = {};
    for (const [day, times] of Object.entries(initial)) {
      if (times.open && times.close && times.open === times.close) {
        errors[day] = "Opening and closing time cannot be the same";
      }
    }
    return errors;
  });
  const { toast } = useToast();

  const uploadMenuFile = async (file: File): Promise<string> => {
    const res = await fetch("/api/partner/menu-upload", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? "Could not get upload URL");
    }
    const { uploadURL, objectPath } = await res.json();
    const put = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
    if (!put.ok) throw new Error("Upload failed");
    return `${window.location.origin}/api/storage${objectPath}`;
  };

  const uploadDanceFloorPhoto = async (file: File): Promise<string> => {
    const res = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
    });
    if (!res.ok) throw new Error("Could not get upload URL");
    const { uploadURL, objectPath } = await res.json();
    const put = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
    if (!put.ok) throw new Error("Upload failed");
    return `/api/storage${objectPath}`;
  };

  const checkDayError = (open: string, close: string): string => {
    if (!open || !close) return "";
    if (open === close) return "Opening and closing time cannot be the same";
    return "";
  };

  const searchAddress = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 3) { setSuggestions([]); setShowSugg(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const data: PlacesSuggestion[] = await apiGet(`/api/places/autocomplete?q=${encodeURIComponent(q)}`);
        setSuggestions(data);
        setShowSugg(data.length > 0);
      } catch { setSuggestions([]); }
    }, 400);
  };

  const selectSuggestion = async (s: PlacesSuggestion) => {
    setAddress(s.description);
    setAddressQuery(s.description);
    setFetchedAddress("");
    setSuggestions([]);
    setShowSugg(false);
    try {
      const details = await apiGet<{ address: string | null; city: string | null; state: string | null; country: string | null }>(
        `/api/places/details?place_id=${encodeURIComponent(s.place_id)}`
      );
      if (details.address) setFetchedAddress(details.address);
      if (details.city) setCity(details.city);
      if (details.state) setStateF(details.state);
      if (details.country) setCountry(details.country);
    } catch {
      // silently ignore — address is already set, partner can fill city/state manually
    }
  };

  const toggleDay = (day: string) =>
    setOpenDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);

  const updateDayTime = (day: string, field: "open" | "close", val: string) => {
    setDayTimes((prev) => {
      const updated = { ...prev, [day]: { open: prev[day]?.open ?? "", close: prev[day]?.close ?? "", [field]: val } };
      const { open, close } = updated[day]!;
      const err = checkDayError(open, close);
      setDayHoursErrors((e) => ({ ...e, [day]: err }));
      return updated;
    });
  };

  const copyHours = (sourceDay: string, targets: readonly string[]) => {
    const src = dayTimes[sourceDay];
    if (!src?.open && !src?.close) return;
    setDayTimes((prev) => {
      const next = { ...prev };
      for (const d of targets) {
        if (d !== sourceDay && openDays.includes(d)) {
          next[d] = { open: src.open ?? "", close: src.close ?? "" };
        }
      }
      return next;
    });
    setDayHoursErrors((prev) => {
      const next = { ...prev };
      const err = checkDayError(src.open ?? "", src.close ?? "");
      for (const d of targets) {
        if (d !== sourceDay && openDays.includes(d)) next[d] = err;
      }
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (openDays.length === 0) {
      toast({ title: "Select at least one open day", variant: "destructive" }); return;
    }
    const firstHoursError = openDays.map((d) => dayHoursErrors[d]).find(Boolean);
    if (firstHoursError) {
      toast({ title: "Fix opening hours", description: firstHoursError, variant: "destructive" }); return;
    }
    const dayHoursPayload: DayTimes = {};
    for (const day of openDays) {
      dayHoursPayload[day] = { open: dayTimes[day]?.open ?? "", close: dayTimes[day]?.close ?? "" };
    }
    setSaving(true);
    try {
      await apiPatch("/api/partner/profile", {
        state: stateF, city, country, address, openDays, dayHours: dayHoursPayload,
        danceFloor: danceFloor || null,
        danceFloorPhotos,
        menuUrl: menuUrls[0] ?? "",
        menuUrls,
      });
      toast({ title: "Listing updated" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Listing not saved", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-3xl glass-card-strong p-8 space-y-6">
      <div>
        <Label className="mb-3 block text-sm font-medium">Dance floor</Label>
        <div className="flex flex-col sm:flex-row gap-3">
          {DANCE_FLOOR_OPTIONS.map(({ value, label }) => (
            <label
              key={value}
              className={`flex items-center gap-2.5 cursor-pointer rounded-xl border px-4 py-3 text-sm transition-colors flex-1 ${
                danceFloor === value
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-white/10 bg-black/20 text-muted-foreground hover:border-white/20"
              }`}
            >
              <input
                type="radio"
                name="danceFloor"
                value={value}
                checked={danceFloor === value}
                onChange={() => setDanceFloor(value)}
                className="accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      {danceFloor === "dedicated" && (
        <div>
          <Label className="mb-2 block text-sm font-medium flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5 text-primary" />
            Dance floor photos
            <span className="text-muted-foreground font-normal text-xs">(optional)</span>
          </Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {danceFloorPhotos.map((url, i) => (
              <div key={i} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-white/10">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setDanceFloorPhotos((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-4 w-4 text-white" />
                </button>
              </div>
            ))}
            <label className={`flex flex-col items-center justify-center w-20 h-20 rounded-lg border border-dashed cursor-pointer transition-colors ${uploadingDfPhoto ? "opacity-50 pointer-events-none" : "border-white/20 hover:border-primary/50 bg-black/20 hover:bg-primary/5"}`}>
              {uploadingDfPhoto ? (
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Upload className="h-4 w-4 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">Add</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                multiple
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (!files.length) return;
                  setUploadingDfPhoto(true);
                  try {
                    const urls = await Promise.all(files.map((f) => uploadDanceFloorPhoto(f)));
                    setDanceFloorPhotos((prev) => [...prev, ...urls]);
                  } catch {
                    toast({ title: "Photo upload failed", variant: "destructive" });
                  } finally {
                    setUploadingDfPhoto(false);
                    e.target.value = "";
                  }
                }}
              />
            </label>
          </div>
        </div>
      )}
      <div>
        <Label className="mb-2 block text-sm font-medium">Venue location</Label>
        <div className="flex gap-6 mb-3">
          {([
            { value: "business", label: "Enter your business name (as on Google Maps)" },
            { value: "manual", label: "Add full address" },
          ] as const).map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="addressMode"
                value={value}
                checked={addressMode === value}
                onChange={() => {
                  setAddressMode(value);
                  if (value === "manual") {
                    setSuggestions([]); setShowSugg(false); setFetchedAddress("");
                  } else {
                    setAddressQuery(address);
                  }
                }}
                className="accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
        {addressMode === "business" && (
          <div className="relative">
            <Input
              value={addressQuery}
              onChange={(e) => { setAddressQuery(e.target.value); setAddress(e.target.value); setFetchedAddress(""); searchAddress(e.target.value); }}
              onBlur={() => setTimeout(() => setShowSugg(false), 200)}
              onFocus={() => { if (suggestions.length > 0) setShowSugg(true); }}
              placeholder="e.g. The Bandra Bar Mumbai"
              className="bg-black/40 border-white/10"
              autoComplete="off"
            />
            {showSugg && suggestions.length > 0 && (
              <ul className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl bg-card border border-white/10 shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                {suggestions.map((s) => {
                  const isEstablishment = s.types.some((t) =>
                    ["establishment", "point_of_interest", "premise", "lodging", "food", "bar", "restaurant", "night_club", "event_venue"].includes(t)
                  );
                  const Icon = isEstablishment ? Building2 : MapPin;
                  return (
                    <li key={s.place_id}>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 border-b border-white/5 last:border-0 leading-snug flex items-start gap-2.5"
                        onMouseDown={() => selectSuggestion(s)}
                      >
                        <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        <span>{s.description}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {fetchedAddress && (
              <div className="mt-2">
                <Label className="text-xs text-muted-foreground mb-1 block">Registered address on Google Maps</Label>
                <Input
                  value={fetchedAddress}
                  readOnly
                  className="bg-black/20 border-white/5 text-muted-foreground cursor-default select-all"
                />
              </div>
            )}
            {address.trim() && (
              <div className="mt-3">
                <iframe
                  key={address}
                  title="Venue location"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed&hl=en`}
                  className="w-full h-48 md:h-56 rounded-xl border border-white/10"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <Navigation className="h-3 w-3" />
                  Open in Google Maps ↗
                </a>
              </div>
            )}
          </div>
        )}
        {addressMode === "manual" && (
          <div>
            <Textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 123 Park Street, Kolkata, West Bengal 700016"
              rows={3}
              className="bg-black/40 border-white/10 resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">
              This address will appear on your public profile. You can paste a full address from Google Maps.
            </p>
          </div>
        )}
      </div>
      <div>
        <Label className="mb-3 block text-sm font-medium">Operating hours</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ALL_DAYS.map((day) => {
            const isOpen = openDays.includes(day);
            const hasErr = !!dayHoursErrors[day];
            const crossesMid = !hasErr && dayTimes[day]?.open && dayTimes[day]?.close &&
              dayTimes[day]!.close < dayTimes[day]!.open;
            return (
              <div
                key={day}
                className={`rounded-xl border transition-all ${isOpen
                  ? hasErr
                    ? "border-red-500/40 bg-red-600/5"
                    : "border-white/15 bg-white/[0.04]"
                  : "border-white/8 bg-black/20"
                }`}
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className={`text-sm font-semibold leading-none ${isOpen ? "text-foreground" : "text-muted-foreground"}`}>
                      {DAY_FULL_NAMES[day]}
                    </p>
                    {!isOpen && (
                      <span className="inline-flex items-center mt-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Closed</span>
                    )}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOpen}
                    onClick={() => toggleDay(day)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isOpen ? "bg-primary" : "bg-white/20"}`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition-transform ${isOpen ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                </div>
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-white/8 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" /> Opens
                        </p>
                        <Input
                          type="time"
                          value={dayTimes[day]?.open ?? ""}
                          onChange={(e) => updateDayTime(day, "open", e.target.value)}
                          className={`bg-black/40 h-9 text-sm ${hasErr ? "border-red-500/70" : "border-white/10"}`}
                        />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" /> Closes
                        </p>
                        <Input
                          type="time"
                          value={dayTimes[day]?.close ?? ""}
                          onChange={(e) => updateDayTime(day, "close", e.target.value)}
                          className={`bg-black/40 h-9 text-sm ${hasErr ? "border-red-500/70" : "border-white/10"}`}
                        />
                      </div>
                    </div>
                    {hasErr && (
                      <p className="text-xs text-red-400">{dayHoursErrors[day]}</p>
                    )}
                    {crossesMid && (
                      <p className="text-xs text-amber-400/90">↻ Overnight schedule — closes next day</p>
                    )}
                    {(dayTimes[day]?.open || dayTimes[day]?.close) && (() => {
                      const otherOpenDays = openDays.filter((d) => d !== day);
                      const weekdayTargets = (WEEKDAYS as readonly string[]).filter((d) => d !== day && openDays.includes(d));
                      const weekendTargets = (WEEKEND_DAYS as readonly string[]).filter((d) => d !== day && openDays.includes(d));
                      if (otherOpenDays.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => copyHours(day, ALL_DAYS)}
                            className="text-[11px] text-primary/80 hover:text-primary underline underline-offset-2 transition-colors"
                          >
                            Copy to all days
                          </button>
                          {weekdayTargets.length > 0 && (
                            <button
                              type="button"
                              onClick={() => copyHours(day, WEEKDAYS)}
                              className="text-[11px] text-primary/80 hover:text-primary underline underline-offset-2 transition-colors"
                            >
                              Copy to weekdays
                            </button>
                          )}
                          {weekendTargets.length > 0 && (
                            <button
                              type="button"
                              onClick={() => copyHours(day, WEEKEND_DAYS)}
                              className="text-[11px] text-primary/80 hover:text-primary underline underline-offset-2 transition-colors"
                            >
                              Copy to weekends
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">Toggle each day on or off. If closing time is earlier than opening time it is treated as an overnight schedule (e.g. 10 pm – 2 am).</p>
      </div>
      <div>
        <Label className="flex items-center gap-1.5 mb-2">
          <Upload className="h-3.5 w-3.5 text-primary" />
          Pub menu <span className="text-muted-foreground font-normal text-xs">(PDF or image, up to 5 files)</span>
        </Label>
        <div className="space-y-2">
          {menuUrls.length > 0 && (
            <div className="space-y-1.5">
              {menuUrls.map((url, idx) => (
                <div key={idx} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex-1 truncate">
                    Menu {idx + 1}
                  </a>
                  <button
                    type="button"
                    onClick={() => setMenuUrls((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-xs text-muted-foreground hover:text-destructive shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {menuUrls.length < 5 && (
            <label className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer transition-colors ${uploadingMenu ? "opacity-50 pointer-events-none border-white/10 bg-black/20" : "border-white/20 bg-black/20 hover:border-primary/50 hover:bg-primary/5"}`}>
              {uploadingMenu ? (
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-muted-foreground text-xs">{uploadingMenu ? "Uploading…" : `Add menu file (${menuUrls.length}/5)`}</span>
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingMenu(true);
                  try {
                    const url = await uploadMenuFile(file);
                    setMenuUrls((prev) => [...prev, url]);
                    toast({ title: "Menu uploaded" });
                  } catch {
                    toast({ title: "Menu upload failed", variant: "destructive" });
                  } finally {
                    setUploadingMenu(false);
                    e.target.value = "";
                  }
                }}
              />
            </label>
          )}
        </div>
      </div>
      <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">
        {saving ? "Saving…" : "Save listing"}
      </Button>
    </form>
  );
}

function EventsManager({ vendor, events, refetchEvents, onSaved }: { vendor: any; events: any[]; refetchEvents: () => void; onSaved: () => void }) {
  const [showForm, setShow] = useState(false);
  const [, navigate] = useLocation();
  const del = useDeleteEvent();
  const { toast } = useToast();

  if (vendor.status !== "approved") {
    return (
      <div className="rounded-3xl glass-card p-10 text-center">
        <p className="font-serif text-2xl mb-2">Awaiting approval</p>
        <p className="text-muted-foreground">You'll be able to publish events once your partner profile is approved.</p>
      </div>
    );
  }

  const hasPub = events.some((e: any) => e.type === "pub");
  const hasNonPub = events.some((e: any) => e.type !== "pub");

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="font-serif text-2xl">Your events &amp; pubs</h2>
        {!hasPub && (
          <Button onClick={() => setShow((s) => !s)} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">
            {showForm ? "Close" : "+ New listing"}
          </Button>
        )}
      </div>

      {hasPub && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-300">
          You have a pub listing active. Delete it first if you want to add a different type of listing.
        </div>
      )}
      {!hasPub && hasNonPub && (
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-xs text-muted-foreground">
          Your profile is set up for events — pubs can't be added alongside other types.
        </div>
      )}

      {showForm && !hasPub && (
        <EventForm
          vendor={vendor}
          lockedType={hasPub ? "pub" : hasNonPub ? "event" : null}
          onCancel={() => setShow(false)}
          onSaved={() => { setShow(false); refetchEvents(); }}
        />
      )}

      {events.length === 0 ? (
        <p className="text-muted-foreground">No listings yet. Submit a new listing above for admin review.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {events.map((e: any) => (
            <div key={e.id} className="rounded-2xl glass-card overflow-hidden flex flex-col">
              <div className="flex flex-1">
                {e.imageUrl && <div className="w-32 bg-muted shrink-0"><img src={e.imageUrl} alt="" className="h-full w-full object-cover" /></div>}
                <div className="flex-1 p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex gap-1 mb-2 flex-wrap">
                      <Badge variant="secondary" className="bg-white/10 border-white/10">{e.category}</Badge>
                      {(e.type === "pub") && <Badge className="bg-primary/20 border-primary/40 text-primary"><Wine className="h-3 w-3 mr-1" />Pub</Badge>}
                      {e.type === "pub" && e.pubMode === "ticket" && <Badge variant="outline"><TicketIcon className="h-3 w-3 mr-1" />Tickets</Badge>}
                      {e.type === "pub" && e.pubMode === "event" && <Badge variant="outline">Events</Badge>}
                      {e.type === "pub" && e.pubMode === "both" && <Badge variant="outline">Both</Badge>}
                      {e.approvalStatus === "approved" && (
                        <Badge className="bg-green-600/20 border-green-500/40 text-green-300 text-[10px]">● Live</Badge>
                      )}
                      {e.approvalStatus === "pending" && (
                        <Badge className="bg-amber-600/20 border-amber-500/40 text-amber-300 text-[10px]">⏳ Pending review</Badge>
                      )}
                      {e.approvalStatus === "rejected" && (
                        <Badge className="bg-red-600/20 border-red-500/40 text-red-300 text-[10px]">✕ Rejected</Badge>
                      )}
                    </div>
                    <p className="font-serif text-lg">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{e.location}</p>
                    {e.type === "pub" && (e.pubEventTypes ?? []).length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                        {(e.pubEventTypes as string[]).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm font-medium">
                      {e.type === "pub" ? `from ${formatINR(e.startingPrice ?? e.price)}` : formatINR(e.price)}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => navigate(`/dashboard/vendor/listings/${e.id}/edit`)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (!confirm("Delete this listing?")) return;
                          del.mutate({ eventId: e.id }, {
                            onSuccess: () => { toast({ title: "Deleted" }); refetchEvents(); },
                            onError: (err: unknown) => toast({ title: "Failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              {e.approvalStatus === "rejected" && e.rejectionReason && (
                <div className="border-t border-red-500/20 bg-red-900/10 px-4 py-2">
                  <p className="text-xs text-red-300"><span className="font-medium">Rejection reason:</span> {e.rejectionReason}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

function EventForm({ vendor, lockedType, onCancel, onSaved }: {
  vendor: any; lockedType: "pub" | "event" | null; onCancel: () => void; onSaved: () => void;
}) {
  const [category, setCategory] = useState(vendor.category);
  const [type, setType] = useState<string>(lockedType ?? "pub");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState(vendor.city ?? "");
  const [stateF, setStateF] = useState(vendor.state ?? "");
  const [country, setCountry] = useState(vendor.country ?? "India");
  const [price, setPrice] = useState(0);
  const [capacity, setCapacity] = useState(50);
  const [imageUrl, setImageUrl] = useState("");
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryVideos, setGalleryVideos] = useState<string[]>([]);
  // pub-specific
  const [enableTickets, setEnableTickets] = useState(true);
  const [enableEvents, setEnableEvents] = useState(false);
  const [priceWomen, setPriceWomen] = useState(0);
  const [priceMen, setPriceMen] = useState(0);
  const [priceCouple, setPriceCouple] = useState(0);
  const [pubEventTypes, setPubEventTypes] = useState<string[]>([]);
  const [varyByDay, setVaryByDay] = useState(false);
  const [dayPricingOverrides, setDayPricingOverrides] = useState<Record<string, { women: number | ""; men: number | ""; couple: number | "" }>>({});
  const [freeEntryEnabled, setFreeEntryEnabled] = useState(false);
  const [freeEntryGenders, setFreeEntryGenders] = useState<string[]>([]);
  const [freeEntryDays, setFreeEntryDays] = useState<string[]>([]);
  const [freeEntryBeforeTime, setFreeEntryBeforeTime] = useState("");
  const create = useCreateEvent();
  const { toast } = useToast();

  // ── Venue details state (mirrors ListingEditor, pre-filled from saved profile) ──
  const [venueDanceFloor, setVenueDanceFloor] = useState<string>(vendor.danceFloor ?? "");
  const [venueDanceFloorPhotos, setVenueDanceFloorPhotos] = useState<string[]>(
    Array.isArray(vendor.danceFloorPhotos) ? vendor.danceFloorPhotos : []
  );
  const [uploadingDfPhoto, setUploadingDfPhoto] = useState(false);
  const [venueOpenDays, setVenueOpenDays] = useState<string[]>(
    Array.isArray(vendor.openDays) && vendor.openDays.length > 0 ? vendor.openDays : [...ALL_DAYS]
  );
  const [venueDayTimes, setVenueDayTimes] = useState<DayTimes>(() => parseDayHours(vendor.dayHours));
  const [venueAddress, setVenueAddress] = useState<string>(vendor.address ?? "");
  const [venueAddressQuery, setVenueAddressQuery] = useState<string>(vendor.address ?? "");
  const [venueFetchedAddress, setVenueFetchedAddress] = useState<string>("");
  const [venueAddressMode, setVenueAddressMode] = useState<"business" | "manual">("business");
  const [venueSuggestions, setVenueSuggestions] = useState<PlacesSuggestion[]>([]);
  const [venueShowSugg, setVenueShowSugg] = useState(false);
  const venueDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [venueMenuUrls, setVenueMenuUrls] = useState<string[]>(
    Array.isArray(vendor.menuUrls) && vendor.menuUrls.length > 0
      ? vendor.menuUrls
      : vendor.menuUrl ? [vendor.menuUrl] : []
  );
  const [uploadingVenueMenu, setUploadingVenueMenu] = useState(false);
  const [savingVenue, setSavingVenue] = useState(false);
  const [venueDayHoursErrors, setVenueDayHoursErrors] = useState<Record<string, string>>(() => {
    const initial = parseDayHours(vendor.dayHours);
    const errors: Record<string, string> = {};
    for (const [day, times] of Object.entries(initial)) {
      if (times.open && times.close && times.open === times.close) {
        errors[day] = "Opening and closing time cannot be the same";
      }
    }
    return errors;
  });

  const onImageFile = async (f: File | null) => {
    if (!f) return;
    try { setImageUrl(await fileToDataUrl(f)); } catch { /* ignore */ }
  };

  const onGalleryImagesChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      try { urls.push(await fileToDataUrl(file)); } catch { /* ignore */ }
    }
    setGalleryImages((prev) => [...prev, ...urls]);
  };

  const onGalleryVideosChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      try { urls.push(await fileToDataUrl(file)); } catch { /* ignore */ }
    }
    setGalleryVideos((prev) => [...prev, ...urls]);
  };

  const togglePubEvent = (t: string) =>
    setPubEventTypes((arr) => arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]);

  // ── Venue detail helpers ──
  const uploadVenueMenuFile = async (file: File): Promise<string> => {
    const res = await fetch("/api/partner/menu-upload", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? "Could not get upload URL");
    }
    const { uploadURL, objectPath } = await res.json();
    const put = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
    if (!put.ok) throw new Error("Upload failed");
    return `${window.location.origin}/api/storage${objectPath}`;
  };

  const uploadVenueDanceFloorPhoto = async (file: File): Promise<string> => {
    const res = await fetch("/api/storage/uploads/request-url", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
    });
    if (!res.ok) throw new Error("Could not get upload URL");
    const { uploadURL, objectPath } = await res.json();
    const put = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
    if (!put.ok) throw new Error("Upload failed");
    return `/api/storage${objectPath}`;
  };

  const checkVenueDayError = (open: string, close: string): string => {
    if (!open || !close) return "";
    if (open === close) return "Opening and closing time cannot be the same";
    return "";
  };

  const searchVenueAddress = (q: string) => {
    if (venueDebounceRef.current) clearTimeout(venueDebounceRef.current);
    if (q.trim().length < 3) { setVenueSuggestions([]); setVenueShowSugg(false); return; }
    venueDebounceRef.current = setTimeout(async () => {
      try {
        const data: PlacesSuggestion[] = await apiGet(`/api/places/autocomplete?q=${encodeURIComponent(q)}`);
        setVenueSuggestions(data);
        setVenueShowSugg(data.length > 0);
      } catch { setVenueSuggestions([]); }
    }, 400);
  };

  const selectVenueSuggestion = async (s: PlacesSuggestion) => {
    setVenueAddress(s.description);
    setVenueAddressQuery(s.description);
    setVenueFetchedAddress("");
    setVenueSuggestions([]);
    setVenueShowSugg(false);
    try {
      const details = await apiGet<{ address: string | null; city: string | null; state: string | null; country: string | null }>(
        `/api/places/details?place_id=${encodeURIComponent(s.place_id)}`
      );
      if (details.address) setVenueFetchedAddress(details.address);
      if (details.city) setCity(details.city);
      if (details.state) setStateF(details.state);
      if (details.country) setCountry(details.country);
    } catch { /* silently ignore */ }
  };

  const toggleVenueDay = (day: string) =>
    setVenueOpenDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);

  const updateVenueDayTime = (day: string, field: "open" | "close", val: string) => {
    setVenueDayTimes((prev) => {
      const updated = { ...prev, [day]: { open: prev[day]?.open ?? "", close: prev[day]?.close ?? "", [field]: val } };
      const { open, close } = updated[day]!;
      const err = checkVenueDayError(open, close);
      setVenueDayHoursErrors((e) => ({ ...e, [day]: err }));
      return updated;
    });
  };

  const copyVenueHours = (sourceDay: string, targets: readonly string[]) => {
    const src = venueDayTimes[sourceDay];
    if (!src?.open && !src?.close) return;
    setVenueDayTimes((prev) => {
      const next = { ...prev };
      for (const d of targets) {
        if (d !== sourceDay && venueOpenDays.includes(d)) next[d] = { open: src.open ?? "", close: src.close ?? "" };
      }
      return next;
    });
    setVenueDayHoursErrors((prev) => {
      const next = { ...prev };
      const err = checkVenueDayError(src.open ?? "", src.close ?? "");
      for (const d of targets) {
        if (d !== sourceDay && venueOpenDays.includes(d)) next[d] = err;
      }
      return next;
    });
  };

  const saveVenueDetails = async () => {
    if (venueOpenDays.length === 0) {
      toast({ title: "Select at least one open day", variant: "destructive" }); return;
    }
    const firstHoursError = venueOpenDays.map((d) => venueDayHoursErrors[d]).find(Boolean);
    if (firstHoursError) {
      toast({ title: "Fix opening hours", description: firstHoursError, variant: "destructive" }); return;
    }
    const dayHoursPayload: DayTimes = {};
    for (const day of venueOpenDays) {
      dayHoursPayload[day] = { open: venueDayTimes[day]?.open ?? "", close: venueDayTimes[day]?.close ?? "" };
    }
    setSavingVenue(true);
    try {
      await apiPatch("/api/partner/profile", {
        state: stateF, city, country,
        address: venueAddress,
        openDays: venueOpenDays,
        dayHours: dayHoursPayload,
        danceFloor: venueDanceFloor || null,
        danceFloorPhotos: venueDanceFloorPhotos,
        menuUrl: venueMenuUrls[0] ?? "",
        menuUrls: venueMenuUrls,
      });
      toast({ title: "Venue details saved" });
    } catch (err: unknown) {
      toast({ title: "Venue details not saved", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    } finally {
      setSavingVenue(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === "pub" && !enableTickets && !enableEvents) {
      toast({ title: "Pick at least one of Tickets or Events", variant: "destructive" });
      return;
    }
    if (type === "pub" && freeEntryBeforeTime && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(freeEntryBeforeTime)) {
      toast({ title: "Invalid before time", description: "Please use HH:mm 24-hour format (e.g. 22:00)", variant: "destructive" });
      return;
    }
    const pubMode = type === "pub"
      ? (enableTickets && enableEvents ? "both" : enableTickets ? "ticket" : "event")
      : "";
    const body: any = {
      title: vendor.businessName, description, category,
      location: `${city}${stateF ? ", " + stateF : ""}`,
      price: (() => { if (type !== "pub" || !enableTickets) return price; const t = [priceWomen, priceMen, priceCouple].filter((n) => n > 0); return t.length > 0 ? Math.min(...t) : (price || 0); })(),
      capacity, imageUrl,
      type, city, state: stateF, country,
      pubMode,
      priceWomen: type === "pub" ? priceWomen : 0,
      priceMen: type === "pub" ? priceMen : 0,
      priceCouple: type === "pub" ? priceCouple : 0,
      pubEventTypes: type === "pub" ? pubEventTypes : [],
      dayPricing: (() => {
        if (type !== "pub" || !enableTickets || !varyByDay) return null;
        const result: Record<string, { women: number; men: number; couple: number }> = {};
        for (const [day, ov] of Object.entries(dayPricingOverrides)) {
          if (!ov) continue;
          const w = ov.women === "" ? null : ov.women;
          const m = ov.men === "" ? null : ov.men;
          const c = ov.couple === "" ? null : ov.couple;
          if (w === null && m === null && c === null) continue;
          result[day] = { women: w ?? priceWomen, men: m ?? priceMen, couple: c ?? priceCouple };
        }
        return Object.keys(result).length > 0 ? result : null;
      })(),
      galleryImages,
      galleryVideos,
      ...(type === "pub" ? {
        freeEntryRules: {
          enabled: freeEntryEnabled,
          genders: freeEntryGenders,
          days: freeEntryDays,
          ...(freeEntryBeforeTime ? { beforeTime: freeEntryBeforeTime } : {}),
        },
      } : {}),
    };
    create.mutate(
      { data: body },
      {
        onSuccess: () => { toast({ title: "Submitted for review! An admin will approve your listing shortly." }); onSaved(); },
        onError: (e: unknown) => toast({ title: "Failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
      },
    );
  };

  const eventStateOpts = (() => {
    const list = getStates(country);
    return stateF && !list.includes(stateF) ? [stateF, ...list] : list;
  })();
  const eventCityOpts = (() => {
    const list = getCities(country, stateF);
    return city && !list.includes(city) ? [city, ...list] : list;
  })();

  return (
    <form onSubmit={submit} className="rounded-3xl glass-card-strong p-6 space-y-3">
      <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-2">
        <p className="text-xs text-muted-foreground mb-0.5">Business name (listing title)</p>
        <p className="font-serif text-lg">{vendor.businessName}</p>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <Label>Country</Label>
          <Select value={country || "India"} onValueChange={(v) => { setCountry(v); setStateF(""); setCity(""); }}>
            <SelectTrigger className="bg-black/40 border-white/10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COUNTRY_NAMES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>State / Region</Label>
          <Select value={stateF || "any"} onValueChange={(v) => { setStateF(v === "any" ? "" : v); setCity(""); }}>
            <SelectTrigger className="bg-black/40 border-white/10"><SelectValue placeholder="— select state —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">— select —</SelectItem>
              {eventStateOpts.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>City</Label>
          <Select value={city || "any"} onValueChange={(v) => setCity(v === "any" ? "" : v)} disabled={!stateF}>
            <SelectTrigger className="bg-black/40 border-white/10"><SelectValue placeholder="— select city —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">— select —</SelectItem>
              {eventCityOpts.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {type !== "pub" && (
          <div><Label>Minimum price per person (₹)</Label><Input type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
        )}
        <div><Label>Capacity</Label><Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
      </div>

      {type === "pub" && (
        <div className="rounded-2xl border border-white/10 p-4 space-y-3 bg-black/20">
          <p className="font-serif text-lg flex items-center gap-2"><Wine className="h-4 w-4 text-primary" />Pub setup</p>
          <div className="flex items-center gap-6 flex-wrap">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={enableTickets} onCheckedChange={(v) => setEnableTickets(!!v)} />
              <TicketIcon className="h-4 w-4 text-primary" /> Sell tickets
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={enableEvents} onCheckedChange={(v) => setEnableEvents(!!v)} />
              <CalIcon className="h-4 w-4 text-primary" /> Host events
            </label>
          </div>
          {enableTickets && (
            <div className="space-y-3">
              <div className="grid md:grid-cols-3 gap-3">
                <div><Label>Women (₹)</Label><Input type="number" min={0} value={priceWomen} onChange={(e) => setPriceWomen(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
                <div><Label>Men (₹)</Label><Input type="number" min={0} value={priceMen} onChange={(e) => setPriceMen(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
                <div><Label>Couple (₹)</Label><Input type="number" min={0} value={priceCouple} onChange={(e) => setPriceCouple(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={varyByDay}
                  onCheckedChange={(v) => {
                    const on = !!v;
                    setVaryByDay(on);
                    if (on) {
                      const pre: Record<string, { women: number; men: number; couple: number }> = {};
                      for (const d of ALL_DAYS) pre[d] = { women: priceWomen, men: priceMen, couple: priceCouple };
                      setDayPricingOverrides(pre);
                    }
                  }}
                />
                <span className="text-white/70">Vary prices by day</span>
              </label>
              {varyByDay && (
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <div className="flex items-center justify-between px-3 pt-2">
                    <p className="text-xs text-white/40">Clear a cell to use the default price for that day.</p>
                    <button
                      type="button"
                      onClick={() => {
                        const pre: Record<string, { women: number; men: number; couple: number }> = {};
                        for (const d of ALL_DAYS) pre[d] = { women: priceWomen, men: priceMen, couple: priceCouple };
                        setDayPricingOverrides(pre);
                      }}
                      className="text-xs text-primary/70 hover:text-primary underline"
                    >
                      Reset all to defaults
                    </button>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left px-3 py-2 text-white/50 font-medium w-14">Day</th>
                        <th className="px-2 py-2 text-white/50 font-medium text-center">Women (₹)</th>
                        <th className="px-2 py-2 text-white/50 font-medium text-center">Men (₹)</th>
                        <th className="px-2 py-2 text-white/50 font-medium text-center">Couple (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ALL_DAYS.map((day) => (
                        <tr key={day} className="border-b border-white/5 last:border-0">
                          <td className="px-3 py-1.5 font-semibold text-white/70">{day}</td>
                          {(["women", "men", "couple"] as const).map((field) => (
                            <td key={field} className="px-1.5 py-1">
                              <Input
                                type="number"
                                min={0}
                                value={dayPricingOverrides[day]?.[field] ?? ""}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const val: number | "" = raw === "" ? "" : Number(raw);
                                  setDayPricingOverrides((prev) => {
                                    const existing = prev[day] ?? { women: "" as number | "", men: "" as number | "", couple: "" as number | "" };
                                    return { ...prev, [day]: { ...existing, [field]: val } };
                                  });
                                }}
                                placeholder={String(field === "women" ? priceWomen : field === "men" ? priceMen : priceCouple)}
                                className="bg-black/40 border-white/10 h-7 text-xs px-2"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {enableEvents && (
            <div>
              <Label>Event types you host</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {PUB_EVENT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => togglePubEvent(t)}
                    className={`text-xs px-3 py-1.5 rounded-full border ${
                      pubEventTypes.includes(t)
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "border-white/10 text-white/60 hover:bg-white/5"
                    }`}
                  >{t}</button>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
            <button type="button" onClick={() => setFreeEntryEnabled((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-emerald-500/10 transition-colors">
              <span className="flex items-center gap-2.5 text-sm font-medium text-emerald-400">
                <Checkbox checked={freeEntryEnabled} onCheckedChange={(v) => setFreeEntryEnabled(!!v)}
                  onClick={(e) => e.stopPropagation()} />
                Free Entry
              </span>
              <ChevronDown className={`h-4 w-4 text-emerald-400 transition-transform ${freeEntryEnabled ? "rotate-180" : ""}`} />
            </button>
            {freeEntryEnabled && (
              <div className="space-y-3 px-4 pb-4 pt-1">
                <div>
                  <Label className="text-xs text-white/60 mb-1.5 block">Free for which genders?</Label>
                  <div className="flex flex-wrap gap-2">
                    {["Everyone", "Ladies", "Men", "Couples"].map((g) => (
                      <button key={g} type="button"
                        onClick={() => setFreeEntryGenders((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g])}
                        className={`text-xs px-3 py-1.5 rounded-full border ${freeEntryGenders.includes(g) ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "border-white/10 text-white/60 hover:bg-white/5"}`}
                      >{g}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-white/60 mb-1.5 block">Valid on which days?</Label>
                  <div className="flex flex-wrap gap-2">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                      <button key={d} type="button"
                        onClick={() => setFreeEntryDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])}
                        className={`text-xs px-3 py-1.5 rounded-full border ${freeEntryDays.includes(d) ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "border-white/10 text-white/60 hover:bg-white/5"}`}
                      >{d}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-white/60 mb-1 block">Before time (optional, 24-hour format)</Label>
                  <Input value={freeEntryBeforeTime} onChange={(e) => setFreeEntryBeforeTime(e.target.value)} placeholder="e.g. 22:00" className="bg-black/40 border-white/10 text-sm max-w-xs" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div><Label>Description</Label><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="bg-black/40 border-white/10" /></div>

      {/* Gallery media */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
        <p className="text-sm font-medium flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" />Gallery photos</p>
        <Input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => onGalleryImagesChange(e.target.files)}
          className="bg-black/40 border-white/10"
        />
        {galleryImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {galleryImages.map((src, i) => (
              <div key={i} className="relative group">
                <img src={src} alt="" className="h-20 w-20 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => setGalleryImages((a) => a.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-destructive rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >×</button>
              </div>
            ))}
          </div>
        )}

        <p className="text-sm font-medium flex items-center gap-2 pt-1"><Video className="h-4 w-4 text-primary" />Gallery videos</p>
        <Input
          type="file"
          accept="video/*"
          multiple
          onChange={(e) => onGalleryVideosChange(e.target.files)}
          className="bg-black/40 border-white/10"
        />
        {galleryVideos.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {galleryVideos.map((src, i) => (
              <div key={i} className="relative group">
                <video src={src} className="h-20 w-20 rounded-lg object-cover" muted />
                <button
                  type="button"
                  onClick={() => setGalleryVideos((a) => a.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-destructive rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Venue Details ── */}
      <div className="border-t border-white/10 pt-5 space-y-5">
        <p className="font-serif text-lg flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />Venue Details
        </p>

        {/* Dance floor */}
        <div>
          <Label className="mb-3 block text-sm font-medium">Dance floor</Label>
          <div className="flex flex-col sm:flex-row gap-3">
            {DANCE_FLOOR_OPTIONS.map(({ value, label }) => (
              <label
                key={value}
                className={`flex items-center gap-2.5 cursor-pointer rounded-xl border px-4 py-3 text-sm transition-colors flex-1 ${
                  venueDanceFloor === value
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-white/10 bg-black/20 text-muted-foreground hover:border-white/20"
                }`}
              >
                <input type="radio" name="venueDanceFloor" value={value} checked={venueDanceFloor === value} onChange={() => setVenueDanceFloor(value)} className="accent-primary" />
                {label}
              </label>
            ))}
          </div>
        </div>
        {venueDanceFloor === "dedicated" && (
          <div>
            <Label className="mb-2 block text-sm font-medium flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-primary" />Dance floor photos
              <span className="text-muted-foreground font-normal text-xs">(optional)</span>
            </Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {venueDanceFloorPhotos.map((url, i) => (
                <div key={i} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-white/10">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setVenueDanceFloorPhotos((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="h-4 w-4 text-white" />
                  </button>
                </div>
              ))}
              <label className={`flex flex-col items-center justify-center w-20 h-20 rounded-lg border border-dashed cursor-pointer transition-colors ${uploadingDfPhoto ? "opacity-50 pointer-events-none" : "border-white/20 hover:border-primary/50 bg-black/20 hover:bg-primary/5"}`}>
                {uploadingDfPhoto ? (
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><Upload className="h-4 w-4 text-muted-foreground mb-1" /><span className="text-xs text-muted-foreground">Add</span></>
                )}
                <input type="file" accept="image/*" className="hidden" multiple onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (!files.length) return;
                  setUploadingDfPhoto(true);
                  try {
                    const urls = await Promise.all(files.map((f) => uploadVenueDanceFloorPhoto(f)));
                    setVenueDanceFloorPhotos((prev) => [...prev, ...urls]);
                  } catch { toast({ title: "Photo upload failed", variant: "destructive" }); }
                  finally { setUploadingDfPhoto(false); e.target.value = ""; }
                }} />
              </label>
            </div>
          </div>
        )}

        {/* Venue location */}
        <div>
          <Label className="mb-2 block text-sm font-medium">Venue location</Label>
          <div className="flex gap-6 mb-3">
            {([
              { value: "business", label: "Enter your business name (as on Google Maps)" },
              { value: "manual", label: "Add full address" },
            ] as const).map(({ value, label }) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" name="venueAddressMode" value={value} checked={venueAddressMode === value}
                  onChange={() => {
                    setVenueAddressMode(value);
                    if (value === "manual") { setVenueSuggestions([]); setVenueShowSugg(false); setVenueFetchedAddress(""); }
                    else { setVenueAddressQuery(venueAddress); }
                  }}
                  className="accent-primary"
                />
                {label}
              </label>
            ))}
          </div>
          {venueAddressMode === "business" && (
            <div className="relative">
              <Input value={venueAddressQuery}
                onChange={(e) => { setVenueAddressQuery(e.target.value); setVenueAddress(e.target.value); setVenueFetchedAddress(""); searchVenueAddress(e.target.value); }}
                onBlur={() => setTimeout(() => setVenueShowSugg(false), 200)}
                onFocus={() => { if (venueSuggestions.length > 0) setVenueShowSugg(true); }}
                placeholder="e.g. The Bandra Bar Mumbai"
                className="bg-black/40 border-white/10"
                autoComplete="off"
              />
              {venueShowSugg && venueSuggestions.length > 0 && (
                <ul className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl bg-card border border-white/10 shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                  {venueSuggestions.map((s) => {
                    const isEstablishment = s.types.some((t) =>
                      ["establishment", "point_of_interest", "premise", "lodging", "food", "bar", "restaurant", "night_club", "event_venue"].includes(t)
                    );
                    const Icon = isEstablishment ? Building2 : MapPin;
                    return (
                      <li key={s.place_id}>
                        <button type="button" className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 border-b border-white/5 last:border-0 leading-snug flex items-start gap-2.5"
                          onMouseDown={() => selectVenueSuggestion(s)}>
                          <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                          <span>{s.description}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {venueFetchedAddress && (
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground mb-1 block">Registered address on Google Maps</Label>
                  <Input value={venueFetchedAddress} readOnly className="bg-black/20 border-white/5 text-muted-foreground cursor-default select-all" />
                </div>
              )}
              {venueAddress.trim() && (
                <div className="mt-3">
                  <iframe key={venueAddress} title="Venue location"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(venueAddress)}&output=embed&hl=en`}
                    className="w-full h-48 md:h-56 rounded-xl border border-white/10"
                    loading="lazy" referrerPolicy="no-referrer-when-downgrade"
                  />
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(venueAddress)}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                    <Navigation className="h-3 w-3" />Open in Google Maps ↗
                  </a>
                </div>
              )}
            </div>
          )}
          {venueAddressMode === "manual" && (
            <div>
              <Textarea value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)}
                placeholder="e.g. 123 Park Street, Kolkata, West Bengal 700016" rows={3}
                className="bg-black/40 border-white/10 resize-none" />
              <p className="text-xs text-muted-foreground mt-1">This address will appear on your public profile. You can paste a full address from Google Maps.</p>
            </div>
          )}
        </div>

        {/* Operating hours */}
        <div>
          <Label className="mb-3 block text-sm font-medium">Operating hours</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ALL_DAYS.map((day) => {
              const isOpen = venueOpenDays.includes(day);
              const hasErr = !!venueDayHoursErrors[day];
              const crossesMid = !hasErr && venueDayTimes[day]?.open && venueDayTimes[day]?.close &&
                venueDayTimes[day]!.close < venueDayTimes[day]!.open;
              return (
                <div key={day} className={`rounded-xl border transition-all ${isOpen ? hasErr ? "border-red-500/40 bg-red-600/5" : "border-white/15 bg-white/[0.04]" : "border-white/8 bg-black/20"}`}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className={`text-sm font-semibold leading-none ${isOpen ? "text-foreground" : "text-muted-foreground"}`}>{DAY_FULL_NAMES[day]}</p>
                      {!isOpen && <span className="inline-flex items-center mt-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Closed</span>}
                    </div>
                    <button type="button" role="switch" aria-checked={isOpen} onClick={() => toggleVenueDay(day)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isOpen ? "bg-primary" : "bg-white/20"}`}>
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition-transform ${isOpen ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t border-white/8 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> Opens</p>
                          <Input type="time" value={venueDayTimes[day]?.open ?? ""} onChange={(e) => updateVenueDayTime(day, "open", e.target.value)}
                            className={`bg-black/40 h-9 text-sm ${hasErr ? "border-red-500/70" : "border-white/10"}`} />
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> Closes</p>
                          <Input type="time" value={venueDayTimes[day]?.close ?? ""} onChange={(e) => updateVenueDayTime(day, "close", e.target.value)}
                            className={`bg-black/40 h-9 text-sm ${hasErr ? "border-red-500/70" : "border-white/10"}`} />
                        </div>
                      </div>
                      {hasErr && <p className="text-xs text-red-400">{venueDayHoursErrors[day]}</p>}
                      {crossesMid && <p className="text-xs text-amber-400/90">↻ Overnight schedule — closes next day</p>}
                      {(venueDayTimes[day]?.open || venueDayTimes[day]?.close) && (() => {
                        const otherOpenDays = venueOpenDays.filter((d) => d !== day);
                        const weekdayTargets = (WEEKDAYS as readonly string[]).filter((d) => d !== day && venueOpenDays.includes(d));
                        const weekendTargets = (WEEKEND_DAYS as readonly string[]).filter((d) => d !== day && venueOpenDays.includes(d));
                        if (otherOpenDays.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-2 pt-1">
                            <button type="button" onClick={() => copyVenueHours(day, ALL_DAYS)} className="text-[11px] text-primary/80 hover:text-primary underline underline-offset-2 transition-colors">Copy to all days</button>
                            {weekdayTargets.length > 0 && <button type="button" onClick={() => copyVenueHours(day, WEEKDAYS)} className="text-[11px] text-primary/80 hover:text-primary underline underline-offset-2 transition-colors">Copy to weekdays</button>}
                            {weekendTargets.length > 0 && <button type="button" onClick={() => copyVenueHours(day, WEEKEND_DAYS)} className="text-[11px] text-primary/80 hover:text-primary underline underline-offset-2 transition-colors">Copy to weekends</button>}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Toggle each day on or off. If closing time is earlier than opening time it is treated as an overnight schedule (e.g. 10 pm – 2 am).</p>
        </div>

        {/* Pub menu */}
        <div>
          <Label className="flex items-center gap-1.5 mb-2">
            <Upload className="h-3.5 w-3.5 text-primary" />
            Pub menu <span className="text-muted-foreground font-normal text-xs">(PDF or image, up to 5 files)</span>
          </Label>
          <div className="space-y-2">
            {venueMenuUrls.length > 0 && (
              <div className="space-y-1.5">
                {venueMenuUrls.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex-1 truncate">Menu {idx + 1}</a>
                    <button type="button" onClick={() => setVenueMenuUrls((prev) => prev.filter((_, i) => i !== idx))} className="text-xs text-muted-foreground hover:text-destructive shrink-0">Remove</button>
                  </div>
                ))}
              </div>
            )}
            {venueMenuUrls.length < 5 && (
              <label className={`flex items-center gap-2 cursor-pointer rounded-xl border border-dashed px-4 py-3 transition-colors ${uploadingVenueMenu ? "opacity-50 pointer-events-none border-white/10" : "border-white/20 hover:border-primary/40 hover:bg-primary/5"}`}>
                <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground text-xs">{uploadingVenueMenu ? "Uploading…" : `Add menu file (${venueMenuUrls.length}/5)`}</span>
                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingVenueMenu(true);
                  try {
                    const url = await uploadVenueMenuFile(file);
                    setVenueMenuUrls((prev) => [...prev, url]);
                    toast({ title: "Menu uploaded" });
                  } catch { toast({ title: "Menu upload failed", variant: "destructive" }); }
                  finally { setUploadingVenueMenu(false); e.target.value = ""; }
                }} />
              </label>
            )}
          </div>
        </div>

        <Button type="button" disabled={savingVenue} onClick={saveVenueDetails} variant="outline" className="border-primary/30 text-primary hover:bg-primary/10">
          {savingVenue ? "Saving…" : "Save Venue Details"}
        </Button>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">Submit for review</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function EditListingForm({ event, onBack, onSaved }: { event: any; onBack: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");
  const [imageUrl, setImageUrl] = useState(event.imageUrl ?? "");
  const [galleryImages, setGalleryImages] = useState<string[]>(event.galleryImages ?? []);
  const [galleryVideos, setGalleryVideos] = useState<string[]>(event.galleryVideos ?? []);
  const [price, setPrice] = useState(Number(event.price ?? 0));
  const [priceWomen, setPriceWomen] = useState(Number(event.priceWomen ?? 0));
  const [priceMen, setPriceMen] = useState(Number(event.priceMen ?? 0));
  const [priceCouple, setPriceCouple] = useState(Number(event.priceCouple ?? 0));
  const [capacity, setCapacity] = useState(Number(event.capacity ?? 0));
  const [pubEventTypes, setPubEventTypes] = useState<string[]>(event.pubEventTypes ?? []);
  const [pubMode, setPubMode] = useState<string>(event.pubMode ?? "");
  const [varyByDay, setVaryByDay] = useState<boolean>(!!(event.dayPricing && Object.keys(event.dayPricing).length > 0));
  const [dayPricingOverrides, setDayPricingOverrides] = useState<Record<string, { women: number | ""; men: number | ""; couple: number | "" }>>(() => {
    if (event.dayPricing && typeof event.dayPricing === "object" && !Array.isArray(event.dayPricing)) {
      return event.dayPricing as Record<string, { women: number; men: number; couple: number }>;
    }
    return {};
  });
  const [freeEntryEnabled, setFreeEntryEnabled] = useState<boolean>(!!(event.freeEntryRules?.enabled));
  const [freeEntryGenders, setFreeEntryGenders] = useState<string[]>(event.freeEntryRules?.genders ?? []);
  const [freeEntryDays, setFreeEntryDays] = useState<string[]>(event.freeEntryRules?.days ?? []);
  const [freeEntryBeforeTime, setFreeEntryBeforeTime] = useState<string>(event.freeEntryRules?.beforeTime ?? "");
  const { toast } = useToast();
  const isPub = event.type === "pub";

  const onImageFile = async (f: File | null) => {
    if (!f) return;
    try { setImageUrl(await fileToDataUrl(f)); } catch { /* ignore */ }
  };

  const onGalleryImagesChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      try { urls.push(await fileToDataUrl(file)); } catch { /* ignore */ }
    }
    setGalleryImages((prev) => [...prev, ...urls]);
  };

  const onGalleryVideosChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      try { urls.push(await fileToDataUrl(file)); } catch { /* ignore */ }
    }
    setGalleryVideos((prev) => [...prev, ...urls]);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPub && freeEntryBeforeTime && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(freeEntryBeforeTime)) {
      toast({ title: "Invalid before time", description: "Please use HH:mm 24-hour format (e.g. 22:00)", variant: "destructive" });
      return;
    }
    try {
      const tierArr = [priceWomen, priceMen, priceCouple].filter((n) => n > 0);
      const recalcPrice = isPub
        ? (tierArr.length > 0 ? Math.min(...tierArr) : price)
        : price;
      await apiPatch(`/api/events/${event.id}`, {
        title, description, imageUrl, capacity,
        price: recalcPrice, galleryImages, galleryVideos,
        ...(isPub ? {
          pubMode, priceWomen, priceMen, priceCouple, pubEventTypes,
          dayPricing: (() => {
            if (!varyByDay) return null;
            const result: Record<string, { women: number; men: number; couple: number }> = {};
            for (const [day, ov] of Object.entries(dayPricingOverrides)) {
              if (!ov) continue;
              const w = ov.women === "" ? null : ov.women;
              const m = ov.men === "" ? null : ov.men;
              const c = ov.couple === "" ? null : ov.couple;
              if (w === null && m === null && c === null) continue;
              result[day] = { women: w ?? priceWomen, men: m ?? priceMen, couple: c ?? priceCouple };
            }
            return Object.keys(result).length > 0 ? result : null;
          })(),
          freeEntryRules: {
            enabled: freeEntryEnabled,
            genders: freeEntryGenders,
            days: freeEntryDays,
            ...(freeEntryBeforeTime ? { beforeTime: freeEntryBeforeTime } : {}),
          },
        } : {}),
      });
      toast({ title: "Updated" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    }
  };

  const togglePubEvent = (t: string) =>
    setPubEventTypes((arr) => arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]);

  return (
    <form onSubmit={save} className="space-y-4">
        <p className="font-serif text-2xl sr-only">Edit listing</p>
        <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-black/40 border-white/10" /></div>
        <div><Label>Description</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="bg-black/40 border-white/10" /></div>
        <div>
          <Label className="flex items-center gap-1.5"><Upload className="h-3.5 w-3.5 text-primary" />Listing image (cover)</Label>
          <Input type="file" accept="image/*" onChange={(e) => onImageFile(e.target.files?.[0] ?? null)} className="bg-black/40 border-white/10" />
          {imageUrl && <img src={imageUrl} alt="" className="mt-2 rounded-xl max-h-32 object-cover" />}
        </div>

        {/* Gallery media */}
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
          <p className="text-sm font-medium flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" />Gallery photos</p>
          <Input type="file" accept="image/*" multiple onChange={(e) => onGalleryImagesChange(e.target.files)} className="bg-black/40 border-white/10" />
          {galleryImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {galleryImages.map((src, i) => (
                <div key={i} className="relative group">
                  <img src={src} alt="" className="h-20 w-20 rounded-lg object-cover" />
                  <button type="button" onClick={() => setGalleryImages((a) => a.filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 bg-destructive rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                </div>
              ))}
            </div>
          )}
          <p className="text-sm font-medium flex items-center gap-2 pt-1"><Video className="h-4 w-4 text-primary" />Gallery videos</p>
          <Input type="file" accept="video/*" multiple onChange={(e) => onGalleryVideosChange(e.target.files)} className="bg-black/40 border-white/10" />
          {galleryVideos.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {galleryVideos.map((src, i) => (
                <div key={i} className="relative group">
                  <video src={src} className="h-20 w-20 rounded-lg object-cover" muted />
                  <button type="button" onClick={() => setGalleryVideos((a) => a.filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 bg-destructive rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Price (₹)</Label><Input type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
          <div><Label>Capacity</Label><Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
        </div>
        {isPub && (
          <>
            <div>
              <Label>Mode</Label>
              <Select value={pubMode || "both"} onValueChange={setPubMode}>
                <SelectTrigger className="bg-black/40 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ticket">Tickets only</SelectItem>
                  <SelectItem value="event">Events only</SelectItem>
                  <SelectItem value="both">Both tickets &amp; events</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Women (₹)</Label><Input type="number" min={0} value={priceWomen} onChange={(e) => setPriceWomen(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
                <div><Label>Men (₹)</Label><Input type="number" min={0} value={priceMen} onChange={(e) => setPriceMen(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
                <div><Label>Couple (₹)</Label><Input type="number" min={0} value={priceCouple} onChange={(e) => setPriceCouple(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={varyByDay}
                  onCheckedChange={(v) => {
                    const on = !!v;
                    setVaryByDay(on);
                    if (on && Object.keys(dayPricingOverrides).length === 0) {
                      const pre: Record<string, { women: number; men: number; couple: number }> = {};
                      for (const d of ALL_DAYS) pre[d] = { women: priceWomen, men: priceMen, couple: priceCouple };
                      setDayPricingOverrides(pre);
                    }
                  }}
                />
                <span className="text-white/70">Vary prices by day</span>
              </label>
              {varyByDay && (
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <div className="flex items-center justify-between px-3 pt-2">
                    <p className="text-xs text-white/40">Clear a cell to use the default price for that day.</p>
                    <button
                      type="button"
                      onClick={() => {
                        const pre: Record<string, { women: number; men: number; couple: number }> = {};
                        for (const d of ALL_DAYS) pre[d] = { women: priceWomen, men: priceMen, couple: priceCouple };
                        setDayPricingOverrides(pre);
                      }}
                      className="text-xs text-primary/70 hover:text-primary underline"
                    >
                      Reset all to defaults
                    </button>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left px-3 py-2 text-white/50 font-medium w-14">Day</th>
                        <th className="px-2 py-2 text-white/50 font-medium text-center">Women (₹)</th>
                        <th className="px-2 py-2 text-white/50 font-medium text-center">Men (₹)</th>
                        <th className="px-2 py-2 text-white/50 font-medium text-center">Couple (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ALL_DAYS.map((day) => (
                        <tr key={day} className="border-b border-white/5 last:border-0">
                          <td className="px-3 py-1.5 font-semibold text-white/70">{day}</td>
                          {(["women", "men", "couple"] as const).map((field) => (
                            <td key={field} className="px-1.5 py-1">
                              <Input
                                type="number"
                                min={0}
                                value={dayPricingOverrides[day]?.[field] ?? ""}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const val: number | "" = raw === "" ? "" : Number(raw);
                                  setDayPricingOverrides((prev) => {
                                    const existing = prev[day] ?? { women: "" as number | "", men: "" as number | "", couple: "" as number | "" };
                                    return { ...prev, [day]: { ...existing, [field]: val } };
                                  });
                                }}
                                placeholder={String(field === "women" ? priceWomen : field === "men" ? priceMen : priceCouple)}
                                className="bg-black/40 border-white/10 h-7 text-xs px-2"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <Label>Event types</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {PUB_EVENT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => togglePubEvent(t)}
                    className={`text-xs px-3 py-1.5 rounded-full border ${
                      pubEventTypes.includes(t)
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "border-white/10 text-white/60 hover:bg-white/5"
                    }`}
                  >{t}</button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
              <button type="button" onClick={() => setFreeEntryEnabled((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-emerald-500/10 transition-colors">
                <span className="flex items-center gap-2.5 text-sm font-medium text-emerald-400">
                  <Checkbox checked={freeEntryEnabled} onCheckedChange={(v) => setFreeEntryEnabled(!!v)}
                    onClick={(e) => e.stopPropagation()} />
                  Free Entry
                </span>
                <ChevronDown className={`h-4 w-4 text-emerald-400 transition-transform ${freeEntryEnabled ? "rotate-180" : ""}`} />
              </button>
              {freeEntryEnabled && (
                <div className="space-y-3 px-4 pb-4 pt-1">
                  <div>
                    <Label className="text-xs text-white/60 mb-1.5 block">Free for which genders?</Label>
                    <div className="flex flex-wrap gap-2">
                      {["Everyone", "Ladies", "Men", "Couples"].map((g) => (
                        <button key={g} type="button"
                          onClick={() => setFreeEntryGenders((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g])}
                          className={`text-xs px-3 py-1.5 rounded-full border ${freeEntryGenders.includes(g) ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "border-white/10 text-white/60 hover:bg-white/5"}`}
                        >{g}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-white/60 mb-1.5 block">Valid on which days?</Label>
                    <div className="flex flex-wrap gap-2">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                        <button key={d} type="button"
                          onClick={() => setFreeEntryDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])}
                          className={`text-xs px-3 py-1.5 rounded-full border ${freeEntryDays.includes(d) ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "border-white/10 text-white/60 hover:bg-white/5"}`}
                        >{d}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-white/60 mb-1 block">Before time (optional, 24-hour format)</Label>
                    <Input value={freeEntryBeforeTime} onChange={(e) => setFreeEntryBeforeTime(e.target.value)} placeholder="e.g. 22:00" className="bg-black/40 border-white/10 text-sm max-w-xs" />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        <div className="flex gap-3 justify-end pt-2 border-t border-white/10">
          <Button type="button" variant="outline" onClick={onBack}>Cancel</Button>
          <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">Save changes</Button>
        </div>
    </form>
  );
}

export function VendorListingEditPage() {
  const [, params] = useRoute("/dashboard/vendor/listings/:id/edit");
  const eventId = params ? Number(params.id) : null;
  const [, navigate] = useLocation();
  const { data: vendorData, isLoading: vendorLoading } = useGetMyVendor();
  const vendor = (vendorData?.vendor ?? null) as any;
  const { data: eventsResp2, isLoading: eventsLoading } = useListMyVendorEvents(undefined, { query: { enabled: !!vendor } as any });
  const event = (eventsResp2?.data ?? []).find((e: any) => e.id === eventId) ?? null;
  const loading = vendorLoading || eventsLoading;

  const goBack = () => navigate("/dashboard/vendor?tab=events");

  return (
    <div className="container mx-auto px-4 md:px-6 py-14 max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" /> Back to listings
        </button>
      </div>
      <h1 className="font-serif text-3xl mb-8">Edit listing</h1>
      {loading ? (
        <div className="text-muted-foreground text-sm py-10 text-center">Loading…</div>
      ) : !event ? (
        <div className="text-muted-foreground text-sm py-10 text-center">Listing not found.</div>
      ) : (
        <div className="rounded-3xl glass-card-strong p-6">
          <EditListingForm event={event} onBack={goBack} onSaved={goBack} />
        </div>
      )}
    </div>
  );
}

type ReportPreset = "30d" | "90d" | "12m";

function toReportDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
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

const BR_PAGE_SIZE = 20;

interface VendorBookingSummary {
  totalBookings: number; totalRevenue: number; totalGuests: number;
  countConfirmed: number; countCompleted: number; countCancelled: number; countPending: number;
  monthlyRevenue: { month: string; revenue: number }[];
  monthlyTrend: { month: string; confirmed: number; cancelled: number }[];
  perEvent: { eventId: number | null; eventTitle: string | null; bookingCount: number; ticketWomen: number; ticketMen: number; ticketCouple: number; revenue: number }[];
}

function BookingReport({ bookTablePage, setBookTablePage }: { bookTablePage: number; setBookTablePage: React.Dispatch<React.SetStateAction<number>> }) {
  const [preset, setPreset] = useState<ReportPreset>("12m");

  const now = new Date();
  const startDate = (() => {
    if (preset === "30d") return new Date(now.getTime() - 30 * 86400000);
    if (preset === "90d") return new Date(now.getTime() - 90 * 86400000);
    const s = new Date(now); s.setFullYear(s.getFullYear() - 1); s.setDate(1);
    return s;
  })();
  const startStr = toReportDateStr(startDate);

  const { data: summary } = useQuery<VendorBookingSummary>({
    queryKey: ["vendor-booking-summary", startStr],
    queryFn: () => apiGet<VendorBookingSummary>(`/api/bookings/vendor/summary?from=${encodeURIComponent(startStr)}`),
  });

  const { data: tableResp } = useListVendorBookings({ page: bookTablePage, limit: BR_PAGE_SIZE, from: startStr });

  const totalBookings = summary?.totalBookings ?? 0;
  const totalRevenue = summary?.totalRevenue ?? 0;
  const totalGuests = summary?.totalGuests ?? 0;
  const countConfirmed = summary?.countConfirmed ?? 0;
  const countCompleted = summary?.countCompleted ?? 0;
  const countCancelled = summary?.countCancelled ?? 0;
  const countPending = summary?.countPending ?? 0;
  const cancellationRate = totalBookings > 0 ? Math.round((countCancelled / totalBookings) * 100) : 0;
  const monthlyData = summary?.monthlyRevenue ?? [];
  const monthlyTrendData = summary?.monthlyTrend ?? [];
  const perEvent = summary?.perEvent ?? [];
  const chartMax = Math.max(...monthlyData.map((m) => m.revenue), 1);

  const presetLabel: Record<ReportPreset, string> = {
    "30d": "Last 30 days",
    "90d": "Last 90 days",
    "12m": "Last 12 months",
  };

  const brPageRows = tableResp?.data ?? [];
  const brTotalPages = tableResp?.totalPages ?? 1;
  const safeBrPage = tableResp?.page ?? 1;
  const brTableTotal = tableResp?.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Date preset picker */}
      <div className="rounded-2xl glass-card p-4 flex flex-wrap items-end gap-4">
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Time range</Label>
          <Select value={preset} onValueChange={(v) => { setPreset(v as ReportPreset); setBookTablePage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue>{presetLabel[preset]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="12m">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat icon={CalendarCheck} label="Bookings" value={String(totalBookings)} />
        <Stat icon={Users} label="Guests" value={String(totalGuests)} />
        <Stat icon={IndianRupee} label="Revenue" value={formatINR(totalRevenue)} />
      </div>

      {/* Status breakdown row */}
      {totalBookings > 0 && (
        <div className="rounded-2xl glass-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Status breakdown</p>
            <div className={`flex items-center gap-2 rounded-xl px-3 py-1.5 border ${cancellationRate >= 20 ? "bg-red-500/15 border-red-500/30" : cancellationRate >= 10 ? "bg-amber-500/15 border-amber-500/30" : "bg-green-500/15 border-green-500/30"}`}>
              <span className="text-xs text-muted-foreground">Cancellation rate</span>
              <span className={`text-sm font-bold tabular-nums ${cancellationRate >= 20 ? "text-red-300" : cancellationRate >= 10 ? "text-amber-300" : "text-green-300"}`}>
                {cancellationRate}%
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-xl bg-green-500/10 border border-green-500/20 px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
              <span className="text-xs text-muted-foreground">Confirmed</span>
              <span className="text-sm font-semibold text-green-300 tabular-nums">{countConfirmed}</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-blue-500/10 border border-blue-500/20 px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
              <span className="text-xs text-muted-foreground">Completed</span>
              <span className="text-sm font-semibold text-blue-300 tabular-nums">{countCompleted}</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
              <span className="text-xs text-muted-foreground">Cancelled</span>
              <span className="text-sm font-semibold text-red-300 tabular-nums">{countCancelled}</span>
            </div>
            {countPending > 0 && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span className="text-xs text-muted-foreground">Pending</span>
                <span className="text-sm font-semibold text-amber-300 tabular-nums">{countPending}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {totalBookings === 0 ? (
        <div className="rounded-3xl glass-card p-10 text-center">
          <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-40" />
          <p className="font-serif text-2xl mb-2">{summary ? "No bookings in this period" : "Loading…"}</p>
          <p className="text-muted-foreground text-sm">{summary ? "Try a wider time range to see your booking history." : ""}</p>
        </div>
      ) : (
        <>
          {/* Cancellation rate trend chart */}
          {monthlyTrendData.length >= 2 && (
            <div className="rounded-2xl glass-card p-6">
              <h3 className="font-serif text-xl mb-1">Cancellation rate trend</h3>
              <p className="text-xs text-muted-foreground mb-5">Confirmed vs cancelled bookings per month — spot drop-off patterns early</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyTrendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(m: string) => {
                      const [y, mo] = m.split("-");
                      return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    allowDecimals={false}
                    width={28}
                  />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", fontSize: "12px" }}
                    labelFormatter={(label: string) => {
                      const [y, mo] = label.split("-");
                      return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
                    }}
                    formatter={(v: number, name: string) => [v, name === "confirmed" ? "Confirmed / completed" : "Cancelled"]}
                  />
                  <Bar dataKey="confirmed" name="confirmed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cancelled" name="cancelled" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-6 mt-3 justify-center">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-green-500 shrink-0" />
                  <span className="text-xs text-muted-foreground">Confirmed / completed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-red-500 shrink-0" />
                  <span className="text-xs text-muted-foreground">Cancelled</span>
                </div>
              </div>
            </div>
          )}

          {/* Monthly revenue bar chart */}
          {monthlyData.length > 0 && (
            <div className="rounded-2xl glass-card p-6">
              <h3 className="font-serif text-xl mb-5">Monthly revenue — {presetLabel[preset]}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
                    domain={[0, Math.ceil(chartMax * 1.15)]}
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

          {/* All bookings table with pagination */}
          {totalBookings > 0 && (
            <div className="rounded-2xl glass-card p-6">
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <h3 className="font-serif text-xl">All bookings</h3>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {brTableTotal} booking{brTableTotal !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-white/10">
                    <tr>
                      <th className="text-left py-2 pr-3">ID</th>
                      <th className="text-left py-2 pr-3">Date</th>
                      <th className="text-left py-2 pr-3">Guest</th>
                      <th className="text-left py-2 pr-3">Event</th>
                      <th className="text-left py-2 pr-3">Mode</th>
                      <th className="text-left py-2 pr-3">Arrival</th>
                      <th className="text-right py-2 pr-3">Guests</th>
                      <th className="text-left py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brPageRows.map((b: any) => (
                      <tr key={b.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-2.5 pr-3 text-muted-foreground tabular-nums">#{b.id}</td>
                        <td className="py-2.5 pr-3 tabular-nums">{b.bookingDate}</td>
                        <td className="py-2.5 pr-3">
                          <span className="font-medium">{b.personName || "—"}</span>
                          {b.phone ? <span className="ml-1 text-xs text-muted-foreground">{b.phone}</span> : null}
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground max-w-[120px] truncate">{b.eventTitle || "—"}</td>
                        <td className="py-2.5 pr-3 capitalize text-muted-foreground">{b.pubMode === "event" ? "Table" : b.pubMode === "ticket" ? "Ticket" : "—"}</td>
                        <td className="py-2.5 pr-3">
                          {b.pubMode === "event" && b.arrivalTime
                            ? <span className="text-primary font-medium">{b.arrivalTime}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{b.guests ?? "—"}</td>
                        <td className="py-2.5">
                          <span className={`text-xs font-medium capitalize ${b.status === "confirmed" || b.status === "completed" ? "text-green-400" : b.status === "cancelled" ? "text-red-400" : "text-amber-400"}`}>
                            {b.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {brTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                  <Button variant="outline" size="sm" disabled={safeBrPage <= 1} onClick={() => setBookTablePage((p) => p - 1)}>← Prev</Button>
                  <span className="text-xs text-muted-foreground">
                    {(safeBrPage - 1) * BR_PAGE_SIZE + 1}–{Math.min(safeBrPage * BR_PAGE_SIZE, brTableTotal)} of {brTableTotal}
                  </span>
                  <Button variant="outline" size="sm" disabled={safeBrPage >= brTotalPages} onClick={() => setBookTablePage((p) => p + 1)}>Next →</Button>
                </div>
              )}
            </div>
          )}

          {perEvent.length > 0 && (
            <div className="rounded-2xl glass-card p-6">
              <h3 className="font-serif text-xl mb-4">Revenue by event</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-white/10">
                    <tr>
                      <th className="text-left py-2 pr-4">Event</th>
                      <th className="text-right py-2 px-2">Bookings</th>
                      <th className="text-right py-2 px-2 text-pink-300">Women</th>
                      <th className="text-right py-2 px-2 text-blue-300">Men</th>
                      <th className="text-right py-2 px-2 text-purple-300">Couples</th>
                      <th className="text-right py-2 pl-2">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perEvent.map((row) => (
                      <tr key={row.eventId} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-3 pr-4 font-medium">{row.eventTitle}</td>
                        <td className="text-right px-2 tabular-nums">{row.bookingCount}</td>
                        <td className="text-right px-2 tabular-nums text-pink-300">{row.ticketWomen || "—"}</td>
                        <td className="text-right px-2 tabular-nums text-blue-300">{row.ticketMen || "—"}</td>
                        <td className="text-right px-2 tabular-nums text-purple-300">{row.ticketCouple || "—"}</td>
                        <td className="text-right pl-2 tabular-nums text-primary font-medium">{formatINR(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {perEvent.length > 1 && (
                    <tfoot className="border-t border-white/15 text-xs text-muted-foreground">
                      <tr>
                        <td className="py-2 pr-4 font-semibold text-foreground">Total</td>
                        <td className="text-right px-2 font-semibold text-foreground tabular-nums">
                          {perEvent.reduce((s, r) => s + r.bookingCount, 0)}
                        </td>
                        <td className="text-right px-2 tabular-nums text-pink-300">
                          {perEvent.reduce((s, r) => s + r.ticketWomen, 0) || "—"}
                        </td>
                        <td className="text-right px-2 tabular-nums text-blue-300">
                          {perEvent.reduce((s, r) => s + r.ticketMen, 0) || "—"}
                        </td>
                        <td className="text-right px-2 tabular-nums text-purple-300">
                          {perEvent.reduce((s, r) => s + r.ticketCouple, 0) || "—"}
                        </td>
                        <td className="text-right pl-2 tabular-nums text-primary font-semibold">
                          {formatINR(perEvent.reduce((s, r) => s + r.revenue, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}


function BlockedCalendar({ vendorId: _vendorId }: { vendorId: number }) {
  const [items, setItems] = useState<BlockedDate[]>([]);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const load = () =>
    apiGet<BlockedDate[]>("/api/partner/blocked-dates/me").then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiPost("/api/partner/blocked-dates", { date, reason, source: "manual" });
      toast({ title: "Date blocked" });
      setDate(""); setReason("");
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  const sync = async () => {
    try {
      const r = await apiPost<{ ok: boolean; message: string }>("/api/partner/blocked-dates/google-sync", {});
      toast({ title: r.ok ? "Synced" : "Calendar sync info", description: r.message });
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <form onSubmit={submit} className="rounded-3xl glass-card-strong p-6 space-y-3">
        <p className="font-serif text-xl flex items-center gap-2"><CalIcon className="h-5 w-5 text-primary" />Block a date</p>
        <div>
          <Label>Date</Label>
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="bg-black/40 border-white/10" />
        </div>
        <div>
          <Label>Reason (optional)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} className="bg-black/40 border-white/10" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">Block date</Button>
          <Button type="button" variant="outline" onClick={sync} className="border-white/15 gap-2">
            <CalIcon className="h-4 w-4" /> Sync Google Calendar
          </Button>
        </div>
      </form>
      <div className="rounded-3xl glass-card p-6">
        <p className="font-serif text-xl mb-3">Blocked dates</p>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No blocked dates.</p>
        ) : (
          <div className="space-y-1.5 max-h-96 overflow-auto text-sm">
            {items.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                <div>
                  <span>{b.date}</span>
                  {b.reason && <span className="text-muted-foreground ml-2">— {b.reason}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{b.source}</Badge>
                  <button
                    onClick={() => apiDelete(`/api/partner/blocked-dates/${b.id}`).then(load)}
                    className="text-destructive hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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

function AttendancePanel() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>(today);
  const [statusFilter, setStatusFilter] = useState<"all" | "checkedIn" | "notArrived">("all");
  const [page, setPage] = useState<number>(1);

  const params = {
    ...(date ? { date } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    page,
  } as Parameters<typeof useGetPartnerCheckinReport>[0];

  const { data: report, isLoading } = useGetPartnerCheckinReport(params);

  const rows = report?.rows ?? [];
  const stats = report?.stats ?? { total: 0, checkedIn: 0, notArrived: 0 };
  const totalPages = report?.totalPages ?? 0;
  const attendanceRate = stats.total > 0 ? Math.round((stats.checkedIn / stats.total) * 100) : 0;

  const hasFilters = date || statusFilter !== "all";
  const resetFilters = () => { setDate(""); setStatusFilter("all"); setPage(1); };

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="rounded-2xl glass-card p-4 flex flex-wrap items-end gap-4">
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
                className="text-xs"
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Expected</span>
            <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <CalendarCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
        </div>
        <div className="rounded-2xl glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Checked in</span>
            <div className="w-8 h-8 rounded-lg bg-green-600/15 text-green-400 flex items-center justify-center">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-green-300">{stats.checkedIn}</p>
        </div>
        <div className="rounded-2xl glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Not arrived</span>
            <div className="w-8 h-8 rounded-lg bg-red-600/15 text-red-400 flex items-center justify-center">
              <UserX className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-red-300">{stats.notArrived}</p>
        </div>
        <div className={`rounded-2xl glass-card p-5 ${attendanceRate >= 70 ? "border-green-500/20" : attendanceRate >= 40 ? "border-amber-500/20" : ""}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Rate</span>
            <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className={`text-2xl font-bold tabular-nums ${attendanceRate >= 70 ? "text-green-300" : attendanceRate >= 40 ? "text-amber-300" : "text-red-300"}`}>
            {attendanceRate}%
          </p>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl glass-card p-10 text-center">
          <CheckCircle className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-30" />
          <p className="font-serif text-2xl mb-2">No records found</p>
          <p className="text-muted-foreground text-sm">
            {date ? "No confirmed bookings for this date." : "Select a date to view attendance for a specific day."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl glass-card p-6">
          <h3 className="font-serif text-xl mb-4">
            {statusFilter === "checkedIn" ? "Checked-in guests" : statusFilter === "notArrived" ? "Not-arrived guests" : "All confirmed guests"}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[750px]">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-white/10">
                <tr>
                  <th className="text-left py-2 pr-3">Guest</th>
                  <th className="text-left py-2 pr-3">Email</th>
                  <th className="text-left py-2 pr-3">Phone</th>
                  <th className="text-left py-2 pr-3">Event</th>
                  <th className="text-left py-2 pr-3">Date</th>
                  <th className="text-right py-2 pr-3">Party</th>
                  <th className="text-left py-2 pr-3">Status</th>
                  <th className="text-left py-2">Check-in time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-2.5 pr-3 font-medium">{b.userName || "—"}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground text-xs">{b.userEmail || "—"}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground text-xs">{b.phone || "—"}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground max-w-[140px] truncate">{b.eventTitle || "—"}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">{b.bookingDate}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                      {b.guests || (b.ticketWomen + b.ticketMen + b.ticketCouple) || "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      {b.checkedIn ? (
                        <span className="inline-flex items-center text-xs font-medium text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Checked In</span>
                      ) : (
                        <span className="inline-flex items-center text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">Not Arrived</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      {b.checkedIn && b.checkedInAt ? (
                        <span className="text-xs font-medium text-green-400">
                          {new Date(b.checkedInAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
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
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</Button>
              <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AdsPanel() {
  const [items, setItems] = useState<Ad[]>([]);
  const [message, setMessage] = useState("");
  const { toast } = useToast();
  const load = () => apiGet<Ad[]>("/api/partner/ads/me").then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiPost("/api/partner/ads/request", { message });
      toast({ title: "Ad request submitted", description: "Awaiting admin approval." });
      setMessage(""); load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <form onSubmit={submit} className="rounded-3xl glass-card-strong p-6 space-y-3">
        <p className="font-serif text-xl flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" />Request promoted placement</p>
        <p className="text-sm text-muted-foreground">Approved ads appear in the Popular section.</p>
        <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What would you like to promote?" className="bg-black/40 border-white/10" />
        <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">Submit request</Button>
      </form>
      <div className="rounded-3xl glass-card p-6">
        <p className="font-serif text-xl mb-3">Your requests</p>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        ) : (
          <div className="space-y-3">
            {items.map((a) => (
              <div key={a.id} className="rounded-xl border border-white/10 p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant={a.status === "approved" ? "default" : "secondary"}>{a.status}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-white/70">{a.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface Announcement {
  id: number;
  vendorId: number;
  title: string;
  body: string;
  announceDate: string;
  announceTime: string;
  imageUrl: string;
  genre: string;
  eventType: string;
  createdAt: string;
}

const ANN_GENRES = ["EDM", "Hip Hop", "Bollywood", "Rock", "Pop", "Jazz", "Retro", "House", "Techno", "R&B"];
const ANN_EVENT_TYPES = ["Ladies Night", "DJ Night", "Live Music", "Karaoke", "Open Bar", "Theme Party", "Open Mic", "Brunch", "Pool Party", "Sufi Night"];

const emptyAnnForm = { title: "", body: "", announceDate: "", announceTime: "", imageUrl: "", genre: "", eventType: "" };

function AnnouncementsPanel() {
  const { toast } = useToast();
  const [items, setItems] = useState<Announcement[]>([]);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState(emptyAnnForm);
  const [saving, setSaving] = useState(false);
  const [annGenreFilter, setAnnGenreFilter] = useState("");
  const [annEventTypeFilter, setAnnEventTypeFilter] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const load = () => apiGet<Announcement[]>("/api/partner/announcements").then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const url = imagePreview;
    return () => {
      if (url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    };
  }, [imagePreview]);

  const openNew = () => {
    setEditing(null);
    setImageFile(null);
    setImagePreview("");
    setForm(emptyAnnForm);
  };
  const openEdit = (a: Announcement) => {
    setEditing(a);
    setImageFile(null);
    setImagePreview(a.imageUrl || "");
    setForm({ title: a.title, body: a.body, announceDate: a.announceDate, announceTime: a.announceTime, imageUrl: a.imageUrl, genre: a.genre ?? "", eventType: a.eventType ?? "" });
  };

  const applyFile = (file: File) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Only JPG, PNG or WebP images are allowed", variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Image must be under 8 MB", variant: "destructive" });
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) applyFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) applyFile(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview("");
    setForm((f) => ({ ...f, imageUrl: "" }));
  };

  const uploadImage = async (file: File): Promise<string> => {
    const res = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
    });
    if (!res.ok) throw new Error("Could not get upload URL");
    const { uploadURL, objectPath } = await res.json();
    const putRes = await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
    if (!putRes.ok) throw new Error("Image upload failed");
    return `/api/storage${objectPath}`;
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      let imageUrl = form.imageUrl;
      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      }
      const payload = { ...form, imageUrl };
      if (editing) {
        await apiPatch(`/api/partner/announcements/${editing.id}`, payload);
        toast({ title: "Announcement updated" });
      } else {
        await apiPost("/api/partner/announcements", payload);
        toast({ title: "Announcement posted" });
      }
      setEditing(null);
      setImageFile(null);
      setImagePreview("");
      setForm(emptyAnnForm);
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await apiDelete(`/api/partner/announcements/${id}`);
      toast({ title: "Deleted" });
      load();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="rounded-3xl glass-card-strong p-6 space-y-4">
        <p className="font-serif text-xl flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          {editing ? "Edit announcement" : "New announcement"}
        </p>
        <div>
          <Label htmlFor="ann-title">Title</Label>
          <Input id="ann-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="What's happening?" className="bg-black/40 border-white/10 mt-1" />
        </div>
        <div>
          <Label htmlFor="ann-body">Details</Label>
          <Textarea id="ann-body" rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="More info…" className="bg-black/40 border-white/10 mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ann-date">Date</Label>
            <Input id="ann-date" type="date" value={form.announceDate} onChange={(e) => setForm((f) => ({ ...f, announceDate: e.target.value }))} className="bg-black/40 border-white/10 mt-1" />
          </div>
          <div>
            <Label htmlFor="ann-time">Time</Label>
            <Input id="ann-time" type="time" value={form.announceTime} onChange={(e) => setForm((f) => ({ ...f, announceTime: e.target.value }))} className="bg-black/40 border-white/10 mt-1" />
          </div>
        </div>

        {/* Genre picker */}
        <div>
          <Label className="mb-2 block">Genre</Label>
          <div className="flex flex-wrap gap-2">
            {["", ...ANN_GENRES].map((g) => (
              <button
                key={g || "none"}
                type="button"
                onClick={() => setForm((f) => ({ ...f, genre: g }))}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${form.genre === g ? "bg-primary/20 border-primary text-primary" : "border-white/15 text-white/50 hover:border-white/30 hover:text-white/70"}`}
              >
                {g || "None"}
              </button>
            ))}
          </div>
        </div>

        {/* Event Type picker */}
        <div>
          <Label className="mb-2 block">Event Type</Label>
          <div className="flex flex-wrap gap-2">
            {["", ...ANN_EVENT_TYPES].map((et) => (
              <button
                key={et || "none"}
                type="button"
                onClick={() => setForm((f) => ({ ...f, eventType: et }))}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${form.eventType === et ? "bg-primary/20 border-primary text-primary" : "border-white/15 text-white/50 hover:border-white/30 hover:text-white/70"}`}
              >
                {et || "None"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Image (optional)</Label>
          {imagePreview ? (
            <div className="mt-1 relative rounded-xl overflow-hidden group">
              <img src={imagePreview} alt="Preview" className="w-full h-36 object-cover rounded-xl" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <label className="cursor-pointer px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white border border-white/20 flex items-center gap-1">
                  <Upload className="h-3 w-3" /> Change
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleFileChange} />
                </label>
                <button type="button" onClick={removeImage} className="px-3 py-1 rounded-lg bg-destructive/80 hover:bg-destructive text-xs text-white border border-white/10">
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <label
              htmlFor="ann-img-input"
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`mt-1 flex flex-col items-center justify-center gap-2 h-28 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/10" : "border-white/20 bg-black/20 hover:border-white/40"}`}
            >
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
              <span className="text-xs text-muted-foreground text-center leading-snug">
                Click or drag &amp; drop<br />JPG, PNG or WebP · max 8 MB
              </span>
              <input id="ann-img-input" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleFileChange} />
            </label>
          )}
          {imageFile && (
            <p className="text-xs text-muted-foreground mt-1 truncate">{imageFile.name}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">
            {editing ? "Save changes" : "Post announcement"}
          </Button>
          {editing && (
            <Button variant="outline" onClick={openNew} className="border-white/10">Cancel</Button>
          )}
        </div>
      </div>

      <div className="rounded-3xl glass-card p-6 flex flex-col gap-4">
        <p className="font-serif text-xl">Your announcements</p>

        {/* Genre filter chips */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Genre</p>
          <div className="flex flex-wrap gap-1.5">
            {["", ...ANN_GENRES].map((g) => (
              <button
                key={g || "all"}
                type="button"
                onClick={() => setAnnGenreFilter(g === annGenreFilter ? "" : g)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${annGenreFilter === g ? "bg-primary/20 border-primary text-primary" : "border-white/10 text-white/40 hover:border-white/25 hover:text-white/60"}`}
              >
                {g || "All"}
              </button>
            ))}
          </div>
        </div>

        {/* Event Type filter chips */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Event Type</p>
          <div className="flex flex-wrap gap-1.5">
            {["", ...ANN_EVENT_TYPES].map((et) => (
              <button
                key={et || "all"}
                type="button"
                onClick={() => setAnnEventTypeFilter(et === annEventTypeFilter ? "" : et)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${annEventTypeFilter === et ? "bg-primary/20 border-primary text-primary" : "border-white/10 text-white/40 hover:border-white/25 hover:text-white/60"}`}
              >
                {et || "All"}
              </button>
            ))}
          </div>
        </div>

        {items.filter((a) => (!annGenreFilter || a.genre === annGenreFilter) && (!annEventTypeFilter || a.eventType === annEventTypeFilter)).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {annGenreFilter || annEventTypeFilter ? "No announcements match these filters." : "No announcements yet. Create one to notify your audience."}
          </p>
        ) : (
          <div className="space-y-3">
            {items.filter((a) => (!annGenreFilter || a.genre === annGenreFilter) && (!annEventTypeFilter || a.eventType === annEventTypeFilter)).map((a) => (
              <div key={a.id} className="rounded-xl border border-white/10 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{a.title}</p>
                    {(a.genre || a.eventType) && (
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        {a.genre && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/25">{a.genre}</span>}
                        {a.eventType && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-white/50 border border-white/10">{a.eventType}</span>}
                      </div>
                    )}
                    {a.announceDate && (
                      <p className="text-xs text-primary mt-0.5">
                        {new Date(a.announceDate + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        {a.announceTime && ` · ${a.announceTime}`}
                      </p>
                    )}
                    {a.body && <p className="text-white/60 mt-1 line-clamp-2">{a.body}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)} className="h-7 w-7 p-0">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(a.id)} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface AnalyticsTypeSummary {
  count: number;
  grossRevenue: number;
  commissionAmount: number;
  netRevenue: number;
}

interface AnalyticsData {
  totalEarnings: number;
  monthEarnings: number;
  codRevenue: number;
  onlineRevenue: number;
  grossEarnings: number;
  netEarnings: number;
  totalCommission: number;
  codCommission: number;
  onlineCommission: number;
  commissionRates: {
    freeEntryRate: string;
    ticketRate: string;
    tableBookingRate: string;
  };
  commissionSummary: {
    freeEntry: AnalyticsTypeSummary;
    ticket: AnalyticsTypeSummary;
    table: AnalyticsTypeSummary;
  };
  perEvent: {
    eventId: number;
    eventTitle: string;
    bookingCount: number;
    ticketWomen: number;
    ticketMen: number;
    ticketCouple: number;
    revenue: number;
  }[];
  dailyRevenue: { date: string; revenue: number }[];
  dailyCommission: { date: string; commission: number }[];
  totalWomen: number;
  totalMen: number;
  totalCouple: number;
}

type AnalyticsPreset = "today" | "7d" | "30d" | "3m" | "6m" | "custom";

function toAnalyticsDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function AnalyticsPanel() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<AnalyticsPreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  function buildParams() {
    const now = new Date();
    if (preset === "today") return { from: toAnalyticsDateStr(now), to: toAnalyticsDateStr(now) };
    if (preset === "7d") return { from: toAnalyticsDateStr(new Date(now.getTime() - 6 * 86400000)), to: toAnalyticsDateStr(now) };
    if (preset === "30d") return { from: toAnalyticsDateStr(new Date(now.getTime() - 29 * 86400000)), to: toAnalyticsDateStr(now) };
    if (preset === "3m") return { from: toAnalyticsDateStr(new Date(now.getTime() - 89 * 86400000)), to: toAnalyticsDateStr(now) };
    if (preset === "6m") return { from: toAnalyticsDateStr(new Date(now.getTime() - 179 * 86400000)), to: toAnalyticsDateStr(now) };
    return { from: customFrom || undefined, to: customTo || undefined };
  }

  function load() {
    setLoading(true);
    const { from, to } = buildParams();
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const qStr = qs.toString();
    apiGet<AnalyticsData>(`/api/partner/analytics${qStr ? `?${qStr}` : ""}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [preset, customFrom, customTo]);

  if (loading) {
    return <p className="text-muted-foreground py-8 text-center">Loading analytics…</p>;
  }

  if (!data) {
    return <p className="text-muted-foreground py-8 text-center">Could not load analytics.</p>;
  }

  const hasData = data.totalEarnings > 0 || data.perEvent.length > 0;

  const chartMax = Math.max(...data.dailyRevenue.map((d) => d.revenue), 1);
  const hasTickets = (data.totalWomen + data.totalMen + data.totalCouple) > 0;

  const PRESET_LABELS: Record<AnalyticsPreset, string> = {
    today: "Today", "7d": "Last 7 days", "30d": "Last 30 days",
    "3m": "Last 3 months", "6m": "Last 6 months", custom: "Custom",
  };

  return (
    <div className="space-y-6">
      {/* Time-range filter */}
      <div className="rounded-2xl glass-card p-4 flex flex-wrap items-end gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Time range</p>
          <div className="flex flex-wrap gap-2">
            {(["today", "7d", "30d", "3m", "6m", "custom"] as AnalyticsPreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${preset === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
        {preset === "custom" && (
          <div className="flex gap-3 items-end">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">From</p>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" max={customTo || toAnalyticsDateStr(new Date())} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">To</p>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" min={customFrom} max={toAnalyticsDateStr(new Date())} />
            </div>
          </div>
        )}
      </div>

      {/* Earnings summary cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-2xl glass-card p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <IndianRupee className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Total earnings</p>
            <p className="stat-number text-3xl">{formatINR(data.totalEarnings)}</p>
            <p className="text-xs text-muted-foreground mt-1">all confirmed bookings</p>
          </div>
        </div>
        <div className="rounded-2xl glass-card p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <Banknote className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Pay at venue (COD)</p>
            <p className="stat-number text-3xl text-amber-300">{formatINR(data.codRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">cash / pay-at-door</p>
          </div>
        </div>
        <div className="rounded-2xl glass-card p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
            <CreditCard className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Online payments</p>
            <p className="stat-number text-3xl text-emerald-300">{formatINR(data.onlineRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">paid via gateway</p>
          </div>
        </div>
      </div>

      {/* Ticket audience mix */}
      {hasTickets && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl glass-card p-5 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-pink-500/15 flex items-center justify-center shrink-0">
              <span className="text-pink-400 text-base">♀</span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Women</p>
              <p className="stat-number text-2xl text-pink-300">{data.totalWomen}</p>
              <p className="text-xs text-muted-foreground mt-1">tickets total</p>
            </div>
          </div>
          <div className="rounded-2xl glass-card p-5 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
              <span className="text-blue-400 text-base">♂</span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Men</p>
              <p className="stat-number text-2xl text-blue-300">{data.totalMen}</p>
              <p className="text-xs text-muted-foreground mt-1">tickets total</p>
            </div>
          </div>
          <div className="rounded-2xl glass-card p-5 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
              <span className="text-purple-400 text-base">⚭</span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Couples</p>
              <p className="stat-number text-2xl text-purple-300">{data.totalCouple}</p>
              <p className="text-xs text-muted-foreground mt-1">tickets total</p>
            </div>
          </div>
        </div>
      )}

      {!hasData && (
        <div className="rounded-3xl glass-card p-10 text-center">
          <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-40" />
          <p className="font-serif text-2xl mb-2">No earnings yet</p>
          <p className="text-muted-foreground text-sm">Analytics will appear here once you have confirmed bookings.</p>
        </div>
      )}

      {/* Daily revenue chart */}
      {data.dailyRevenue.some((d) => d.revenue > 0) && (
        <div className="rounded-3xl glass-card-strong p-6">
          <p className="font-serif text-xl mb-5">Revenue — {PRESET_LABELS[preset].toLowerCase()}</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.dailyRevenue} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(d) => {
                  const dt = new Date(d);
                  return `${dt.getDate()}/${dt.getMonth() + 1}`;
                }}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v) => v === 0 ? "₹0" : `₹${(v / 1000).toFixed(0)}k`}
                width={48}
                domain={[0, Math.ceil(chartMax * 1.15)]}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  fontSize: "12px",
                }}
                formatter={(v: number) => [formatINR(v), "Revenue"]}
                labelFormatter={(label) => new Date(label).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
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

      {/* Per-event breakdown table */}
      {data.perEvent.length > 0 && (
        <div className="rounded-3xl glass-card-strong p-6">
          <p className="font-serif text-xl mb-4">Ticket breakdown by listing</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-white/10">
                <tr>
                  <th className="text-left py-2 pr-4">Listing</th>
                  <th className="text-right py-2 px-2">Bookings</th>
                  <th className="text-right py-2 px-2">Women</th>
                  <th className="text-right py-2 px-2">Men</th>
                  <th className="text-right py-2 px-2">Couples</th>
                  <th className="text-right py-2 pl-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.perEvent.map((row) => (
                  <tr key={row.eventId} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-3 pr-4 font-medium">{row.eventTitle}</td>
                    <td className="text-right px-2 tabular-nums">{row.bookingCount}</td>
                    <td className="text-right px-2 tabular-nums text-pink-300">{row.ticketWomen || "—"}</td>
                    <td className="text-right px-2 tabular-nums text-blue-300">{row.ticketMen || "—"}</td>
                    <td className="text-right px-2 tabular-nums text-purple-300">{row.ticketCouple || "—"}</td>
                    <td className="text-right pl-2 tabular-nums text-primary font-medium">{formatINR(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
              {data.perEvent.length > 1 && (
                <tfoot className="border-t border-white/15 text-xs text-muted-foreground">
                  <tr>
                    <td className="py-2 pr-4 font-semibold text-foreground">Total</td>
                    <td className="text-right px-2 font-semibold text-foreground tabular-nums">
                      {data.perEvent.reduce((s, r) => s + r.bookingCount, 0)}
                    </td>
                    <td className="text-right px-2 text-pink-300 tabular-nums">
                      {data.perEvent.reduce((s, r) => s + r.ticketWomen, 0) || "—"}
                    </td>
                    <td className="text-right px-2 text-blue-300 tabular-nums">
                      {data.perEvent.reduce((s, r) => s + r.ticketMen, 0) || "—"}
                    </td>
                    <td className="text-right px-2 text-purple-300 tabular-nums">
                      {data.perEvent.reduce((s, r) => s + r.ticketCouple, 0) || "—"}
                    </td>
                    <td className="text-right pl-2 text-primary font-semibold tabular-nums">
                      {formatINR(data.perEvent.reduce((s, r) => s + r.revenue, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Commission breakdown */}
      {data.commissionRates && (
        <div className="rounded-3xl glass-card-strong p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Percent className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-serif text-xl">Platform charges</p>
              <p className="text-sm text-muted-foreground mt-0.5">Flat fees charged by the platform per person/ticket/booking.</p>
            </div>
          </div>

          {/* Applied flat fees */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Free Entry fee</p>
              <p className="text-2xl font-semibold tabular-nums">₹{data.commissionRates.freeEntryRate}</p>
              <p className="text-xs text-muted-foreground mt-1">per person</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Ticket fee</p>
              <p className="text-2xl font-semibold tabular-nums">₹{data.commissionRates.ticketRate}</p>
              <p className="text-xs text-muted-foreground mt-1">per ticket</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Table Booking fee</p>
              <p className="text-2xl font-semibold tabular-nums">₹{data.commissionRates.tableBookingRate}</p>
              <p className="text-xs text-muted-foreground mt-1">per booking</p>
            </div>
          </div>

          {/* Gross → Net summary — only shown when there are actual earnings */}
          {data.grossEarnings > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Gross earnings</p>
                <p className="stat-number text-2xl">{formatINR(data.grossEarnings)}</p>
                <p className="text-xs text-muted-foreground mt-1">before platform fee</p>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Platform fee</p>
                <p className="stat-number text-2xl text-red-400">−{formatINR(data.totalCommission)}</p>
                <p className="text-xs text-muted-foreground mt-1">deducted by Royvento</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Net earnings</p>
                <p className="stat-number text-2xl text-emerald-300">{formatINR(data.netEarnings)}</p>
                <p className="text-xs text-muted-foreground mt-1">after platform fee</p>
              </div>
            </div>
          )}

          {/* Per-type breakdown */}
          {(() => {
            const cs = data.commissionSummary;
            const types: { key: keyof typeof cs; label: string }[] = [
              { key: "freeEntry", label: "Free Entry" },
              { key: "ticket", label: "Ticket" },
              { key: "table", label: "Table Booking" },
            ];
            const active = types.filter((t) => cs[t.key].count > 0);
            if (active.length === 0) return null;
            return (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Breakdown by booking type</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-white/10">
                      <tr>
                        <th className="text-left py-2 pr-4">Type</th>
                        <th className="text-right py-2 px-2">Bookings</th>
                        <th className="text-right py-2 px-2">Gross</th>
                        <th className="text-right py-2 px-2">Commission</th>
                        <th className="text-right py-2 pl-2">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.map(({ key, label }) => {
                        const row = cs[key];
                        return (
                          <tr key={key} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                            <td className="py-3 pr-4 font-medium">{label}</td>
                            <td className="text-right px-2 tabular-nums">{row.count}</td>
                            <td className="text-right px-2 tabular-nums">{formatINR(row.grossRevenue)}</td>
                            <td className="text-right px-2 tabular-nums text-red-400">−{formatINR(row.commissionAmount)}</td>
                            <td className="text-right pl-2 tabular-nums text-emerald-300 font-medium">{formatINR(row.netRevenue)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {active.length > 1 && (
                      <tfoot className="border-t border-white/15 text-xs">
                        <tr>
                          <td className="py-2 pr-4 font-semibold text-foreground">Total</td>
                          <td className="text-right px-2 font-semibold tabular-nums">{active.reduce((s, t) => s + cs[t.key].count, 0)}</td>
                          <td className="text-right px-2 font-semibold tabular-nums">{formatINR(active.reduce((s, t) => s + cs[t.key].grossRevenue, 0))}</td>
                          <td className="text-right px-2 text-red-400 font-semibold tabular-nums">−{formatINR(active.reduce((s, t) => s + cs[t.key].commissionAmount, 0))}</td>
                          <td className="text-right pl-2 text-emerald-300 font-semibold tabular-nums">{formatINR(active.reduce((s, t) => s + cs[t.key].netRevenue, 0))}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

interface ManagerRow {
  id: number;
  invitedEmail: string;
  status: string;
  createdAt: string;
  manager: { id: number; name: string; email: string } | null;
}

function ManagersPanel() {
  const { toast } = useToast();
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);

  const fetchManagers = () => {
    setLoading(true);
    apiGet<ManagerRow[]>("/api/partner/managers")
      .then(setManagers)
      .catch(() => toast({ title: "Failed to load managers", variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchManagers(); }, []);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    try {
      await apiPost("/api/partner/managers/invite", { email: email.trim() });
      toast({ title: "Invitation sent", description: `${email} will receive their access token.` });
      setEmail("");
      fetchManagers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not send invitation.";
      toast({ title: "Failed", description: msg, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await apiDelete(`/api/partner/managers/${id}`);
      toast({ title: "Manager removed" });
      setManagers((prev) => prev.filter((m) => m.id !== id));
    } catch {
      toast({ title: "Failed to remove manager", variant: "destructive" });
    }
  };

  const statusColor: Record<string, string> = {
    pending: "text-amber-400",
    accepted: "text-green-400",
    rejected: "text-red-400",
  };

  return (
    <div className="space-y-8">
      <div className="rounded-3xl glass-card-strong p-6 md:p-8">
        <h2 className="font-serif text-2xl mb-1">Invite a manager</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Managers can scan tickets at your venue using the ticket scanner. They do not get access to your bookings, events, or settings.
        </p>
        <form onSubmit={invite} className="flex gap-3 max-w-md">
          <Input
            type="email"
            placeholder="manager@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-black/40 border-white/10"
          />
          <Button type="submit" disabled={inviting || !email.trim()} className="bg-primary hover:bg-primary/90 border-0 text-primary-foreground shrink-0">
            {inviting ? "Sending…" : "Send invite"}
          </Button>
        </form>
      </div>

      <div className="rounded-3xl glass-card p-6 md:p-8">
        <h2 className="font-serif text-2xl mb-4">Your managers</h2>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : managers.length === 0 ? (
          <p className="text-muted-foreground text-sm">No managers yet. Invite someone above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-white/10">
                <tr>
                  <th className="text-left py-2 pb-3">Email</th>
                  <th className="text-left py-2 pb-3">Name</th>
                  <th className="text-left py-2 pb-3">Status</th>
                  <th className="text-left py-2 pb-3">Invited</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {managers.map((m) => (
                  <tr key={m.id} className="border-t border-white/5">
                    <td className="py-3 font-mono text-xs">{m.invitedEmail}</td>
                    <td className="py-3 text-muted-foreground">{m.manager?.name ?? "—"}</td>
                    <td className={`py-3 capitalize font-medium ${statusColor[m.status] ?? "text-muted-foreground"}`}>{m.status}</td>
                    <td className="py-3 text-muted-foreground">{new Date(m.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(m.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
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

const PAGE_SIZE = 15;

function LeadBookingTable({ bookings }: { bookings: any[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const q = search.trim().toLowerCase();
  const filtered = bookings.filter((b) => {
    if (!q) return true;
    return (
      (b.userName ?? "").toLowerCase().includes(q) ||
      (b.personName ?? "").toLowerCase().includes(q) ||
      (b.userEmail ?? "").toLowerCase().includes(q) ||
      (b.eventTitle ?? "").toLowerCase().includes(q) ||
      (b.ticketCode ?? "").toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => b.id - a.id);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const statusColor = (s: string) => {
    if (s === "confirmed" || s === "completed") return "text-green-400";
    if (s === "cancelled") return "text-red-400";
    return "text-amber-400";
  };

  return (
    <div className="rounded-3xl glass-card-strong p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-serif text-xl flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-primary" />
          Booking Report
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, event or ticket code…"
            className="pl-8 pr-3 py-1.5 text-sm rounded-lg bg-black/40 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 w-64"
          />
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          {search ? "No bookings match your search." : "No bookings yet."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-white/10">
                <tr>
                  <th className="text-left py-2 pr-3">#</th>
                  <th className="text-left py-2 pr-3">Event / Pub</th>
                  <th className="text-left py-2 pr-3">Customer</th>
                  <th className="text-left py-2 pr-3">Date</th>
                  <th className="text-left py-2 pr-3">Mode</th>
                  <th className="text-right py-2 pr-3">Tickets</th>
                  <th className="text-right py-2 pr-3">Price</th>
                  <th className="text-left py-2 pr-3">Payment</th>
                  <th className="text-left py-2 pr-3">Status</th>
                  <th className="text-left py-2 pr-3">Ticket Code</th>
                  <th className="text-left py-2">Check-in</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b: any) => {
                  const name = b.userName || b.personName || "—";
                  const email = b.userEmail || "";
                  const paid = b.finalPrice ?? b.totalPrice ?? 0;
                  const original = b.discountAmount > 0 ? b.totalPrice : null;
                  const payLabel = b.paymentMethod === "cod" ? "COD" : b.paymentMethod === "online" ? "Online" : (b.paymentMethod ?? "—");
                  const mode = b.pubMode === "ticket" ? "Ticket" : b.pubMode === "event" ? "Table / Event" : (b.pubMode ?? "—");
                  return (
                    <tr key={b.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-2.5 pr-3 text-muted-foreground tabular-nums">#{b.id}</td>
                      <td className="py-2.5 pr-3 max-w-[130px] truncate">{b.eventTitle || "—"}</td>
                      <td className="py-2.5 pr-3">
                        <span className="font-medium">{name}</span>
                        {email && <span className="block text-xs text-muted-foreground">{email}</span>}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-muted-foreground whitespace-nowrap">
                        {b.bookingDate
                          ? new Date(b.bookingDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })
                          : "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground text-xs">{mode}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-xs">
                        {(b.ticketWomen ?? 0) > 0 && <span className="text-pink-400 mr-1">{b.ticketWomen}W</span>}
                        {(b.ticketMen ?? 0) > 0 && <span className="text-blue-400 mr-1">{b.ticketMen}M</span>}
                        {(b.ticketCouple ?? 0) > 0 && <span className="text-purple-400">{b.ticketCouple}C</span>}
                        {!((b.ticketWomen ?? 0) > 0) && !((b.ticketMen ?? 0) > 0) && !((b.ticketCouple ?? 0) > 0) && (
                          <span className="text-muted-foreground">{b.guests ?? "—"}</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                        <span className="font-medium text-primary">{formatINR(paid)}</span>
                        {original && <span className="block text-xs text-muted-foreground line-through">{formatINR(original)}</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground whitespace-nowrap">{payLabel}</td>
                      <td className="py-2.5 pr-3">
                        <span className={`text-xs font-medium capitalize ${statusColor(b.status)}`}>{b.status}</span>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-muted-foreground">{b.ticketCode || "—"}</td>
                      <td className="py-2.5">
                        {b.checkedIn ? (
                          <span className="flex items-center gap-1 text-green-400 text-xs whitespace-nowrap">
                            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                            {b.checkedInAt
                              ? new Date(b.checkedInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                              : "Yes"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <p className="text-xs text-muted-foreground">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sorted.length)} of {sorted.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const p = totalPages <= 7 ? i + 1 : safePage <= 4 ? i + 1 : safePage >= totalPages - 3 ? totalPages - 6 + i : safePage - 3 + i;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-7 h-7 text-xs rounded ${p === safePage ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-white/10 text-muted-foreground"}`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LeadsPanel() {
  const { data: bookingsResp } = useListVendorBookings({ page: 1, limit: 200 });
  const bookings = bookingsResp?.data ?? [];
  const [data, setData] = useState<Lead | null>(null);
  const [sentCodes, setSentCodes] = useState<Record<number, string>>({});
  const [sendingId, setSendingId] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    apiGet<Lead>("/api/partner/leads/me").then((d) => {
      setData(d);
      const initial: Record<number, string> = {};
      (d.views ?? []).forEach((v: any) => {
        if (v.existingCode) initial[v.id] = v.existingCode;
      });
      setSentCodes(initial);
    }).catch(() => {});
  }, []);

  const sendDiscount = async (viewId: number) => {
    setSendingId(viewId);
    try {
      const result = await apiPost<{ code: string; discountPercent: number }>(
        `/api/partner/leads/${viewId}/send-discount`,
        { discountPercent: 15 },
      );
      setSentCodes((prev) => ({ ...prev, [viewId]: result.code }));
      toast({ title: "Discount sent!", description: `Code ${result.code} (${result.discountPercent}% off) is now in the visitor's profile.` });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message ?? "Could not send discount.", variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  if (!data) return <p className="text-muted-foreground">Loading…</p>;

  if (!data.crmAccessGranted) {
    const trialExpired = !data.crmTrialActive && !data.premium;
    return (
      <div className="rounded-3xl glass-card-strong p-10 text-center red-ring">
        <Crown className="h-10 w-10 text-primary mx-auto mb-4" />
        {trialExpired ? (
          <>
            <p className="font-serif text-3xl mb-2">Your 2-month free trial has ended</p>
            <p className="text-muted-foreground mb-6">Upgrade to Partner Premium ({formatINR(999)}/mo) to keep your leads and CRM access.</p>
          </>
        ) : (
          <>
            <p className="font-serif text-3xl mb-2">Leads &amp; CRM is a Premium feature</p>
            <p className="text-muted-foreground mb-6">Subscribe to Partner Premium ({formatINR(999)}/mo) to unlock who's viewing your profile and conversion analytics.</p>
          </>
        )}
        <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">
          <Link href="/subscription">Upgrade to Premium</Link>
        </Button>
      </div>
    );
  }

  const totalViews = data.views.length;
  const known = data.views.filter((v: any) => v.viewerUserId).length;
  const booked = data.views.filter((v: any) => v.hasBooked).length;
  const conv = known ? Math.round((booked / known) * 100) : 0;

  return (
    <div className="space-y-6">
      {data.crmTrialActive && !data.premium && (
        <div className="rounded-2xl border border-primary/40 bg-primary/10 px-5 py-4 flex items-center gap-3">
          <Crown className="h-5 w-5 text-primary shrink-0" />
          <p className="text-sm text-primary font-medium">
            You have <span className="font-bold">{data.crmTrialDaysRemaining} day{data.crmTrialDaysRemaining === 1 ? "" : "s"}</span> of free CRM access remaining.{" "}
            <Link href="/subscription" className="underline underline-offset-2 hover:text-primary/80">Upgrade to keep it.</Link>
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl glass-card p-5">
          <Eye className="h-5 w-5 text-primary mb-2" />
          <p className="stat-number text-3xl">{totalViews}</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Profile views</p>
        </div>
        <div className="rounded-2xl glass-card p-5">
          <Users className="h-5 w-5 text-primary mb-2" />
          <p className="stat-number text-3xl">{known}</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Known leads</p>
        </div>
        <div className="rounded-2xl glass-card p-5">
          <TrendingUp className="h-5 w-5 text-green-400 mb-2" />
          <p className="stat-number text-3xl text-green-400">{booked}</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Already booked</p>
        </div>
        <div className="rounded-2xl glass-card p-5">
          <Crown className="h-5 w-5 text-primary mb-2" />
          <p className="stat-number text-3xl">{conv}%</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Lead→booking rate</p>
        </div>
      </div>
      <div className="rounded-3xl glass-card-strong p-6">
        <p className="font-serif text-xl mb-3">Recent visitors</p>
        {data.views.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one has viewed your profile yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left py-2">Name</th>
                <th className="text-left hidden sm:table-cell">Email</th>
                <th className="text-right hidden md:table-cell">When</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.views.slice(0, 50).map((v: any, i: number) => {
                const sentCode = sentCodes[v.id];
                const isAnon = !v.viewerUserId;
                return (
                  <tr key={i} className="border-t border-white/5">
                    <td className="py-2 pr-2">
                      <span className={isAnon ? "text-muted-foreground italic" : ""}>{v.viewerName || "Anonymous"}</span>
                      {!isAnon && (
                        <span className={`block text-[10px] mt-0.5 font-medium ${v.hasBooked ? "text-green-400" : "text-muted-foreground/60"}`}>
                          {v.hasBooked ? "✓ Booked" : "Not booked yet"}
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground hidden sm:table-cell pr-2">{v.viewerEmail || "—"}</td>
                    <td className="text-right text-muted-foreground hidden md:table-cell pr-2">{new Date(v.viewedAt).toLocaleString()}</td>
                    <td className="text-right">
                      {isAnon ? (
                        <span className="text-xs text-muted-foreground/50">Anonymous</span>
                      ) : sentCode ? (
                        <span className="inline-flex items-center gap-1 text-xs font-mono bg-primary/10 text-primary border border-primary/30 rounded px-2 py-0.5">
                          <Tag className="h-3 w-3" /> {sentCode}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 border-primary/30 text-primary hover:bg-primary/10"
                          disabled={sendingId === v.id}
                          onClick={() => sendDiscount(v.id)}
                        >
                          {sendingId === v.id ? "Sending…" : "Send Discount"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <LeadBookingTable bookings={bookings} />
    </div>
  );
}

const PLAN_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const PLAN_TYPE_BADGE: Record<string, string> = {
  welcome: "Free Drink",
  unlimited: "Unlimited Drinks",
  ticket: "Included with Ticket",
  custom: "Custom Package",
};

interface DrinkPlanLineItem { name: string; qty: number; discountedPrice: number; }

interface DrinkPlan {
  id: number; vendorId: number; type: string; productName: string; gender: string;
  price: number; days: string[]; timeFrom: string; timeTo: string; description: string; createdAt: string;
  lineItems?: DrinkPlanLineItem[] | null;
  drinksOfferLabel?: string;
  foodDiscountLabel?: string;
  validUntil?: string | null;
}

const emptyItem = (): DrinkPlanLineItem => ({ name: "", qty: 1, discountedPrice: 0 });

function DrinkPlansPanel({ vendorId }: { vendorId: number }) {
  const { toast } = useToast();
  const [plans, setPlans] = useState<DrinkPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Add form — Free Entry section
  const [freeEntryChecked, setFreeEntryChecked] = useState(false);
  const [feDrinkTypes, setFeDrinkTypes] = useState<string[]>(["welcome"]);
  const [feGender, setFeGender] = useState<"all" | "female">("all");
  const [feDrinksOffer, setFeDrinksOffer] = useState("");
  const [feFoodDiscount, setFeFoodDiscount] = useState("");

  // Add form — Included with Ticket section
  const [ticketChecked, setTicketChecked] = useState(false);
  const [ticketItems, setTicketItems] = useState<DrinkPlanLineItem[]>([emptyItem()]);
  const [ticketDrinksOffer, setTicketDrinksOffer] = useState("");
  const [ticketFoodDiscount, setTicketFoodDiscount] = useState("");

  // Common fields for add form
  const [days, setDays] = useState<string[]>([]);
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [description, setDescription] = useState("");

  // Edit form state
  const [editType, setEditType] = useState<"welcome" | "unlimited" | "ticket" | "custom">("welcome");
  const [editProductName, setEditProductName] = useState("");
  const [editGender, setEditGender] = useState<"all" | "female">("all");
  const [editItems, setEditItems] = useState<DrinkPlanLineItem[]>([emptyItem()]);
  const [editDays, setEditDays] = useState<string[]>([]);
  const [editTimeFrom, setEditTimeFrom] = useState("");
  const [editTimeTo, setEditTimeTo] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDrinksOffer, setEditDrinksOffer] = useState("");
  const [editFoodDiscount, setEditFoodDiscount] = useState("");
  const [feValidUntil, setFeValidUntil] = useState("");
  const [ticketValidUntil, setTicketValidUntil] = useState("");
  const [editValidUntil, setEditValidUntil] = useState("");

  const errMsg = (err: unknown): string =>
    err instanceof Error ? err.message : typeof err === "string" ? err : "Please try again.";

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const data: DrinkPlan[] = await apiGet(`/api/vendors/${vendorId}/drink-plans`);
      setPlans(data);
    } catch {
      toast({ title: "Failed to load drink plans", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchPlans(); }, [vendorId]);

  const toggleDay = (day: string) =>
    setDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);

  const toggleEditDay = (day: string) =>
    setEditDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);

  const resetForm = () => {
    setFreeEntryChecked(false); setFeDrinkTypes(["welcome"]); setFeGender("all");
    setFeDrinksOffer(""); setFeFoodDiscount(""); setFeValidUntil("");
    setTicketChecked(false); setTicketItems([emptyItem()]);
    setTicketDrinksOffer(""); setTicketFoodDiscount(""); setTicketValidUntil("");
    setDays([]); setTimeFrom(""); setTimeTo(""); setDescription("");
  };

  const startEdit = (plan: DrinkPlan) => {
    setEditingId(plan.id);
    setEditType(plan.type as typeof editType);
    setEditProductName(plan.productName);
    setEditGender(plan.gender as typeof editGender);
    setEditItems(plan.lineItems?.length ? plan.lineItems : [emptyItem()]);
    setEditDays(plan.days);
    setEditTimeFrom(plan.timeFrom);
    setEditTimeTo(plan.timeTo);
    setEditDescription(plan.description);
    setEditDrinksOffer(plan.drinksOfferLabel ?? "");
    setEditFoodDiscount(plan.foodDiscountLabel ?? "");
    setEditValidUntil(plan.validUntil ?? "");
  };

  const cancelEdit = () => setEditingId(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!freeEntryChecked && !ticketChecked) {
      toast({ title: "Select at least one plan type", variant: "destructive" }); return;
    }
    if (freeEntryChecked && feDrinkTypes.length === 0) {
      toast({ title: "Select at least one drink type for free entry", variant: "destructive" }); return;
    }
    if (ticketChecked && ticketItems.some((i) => !i.name.trim())) {
      toast({ title: "Each ticket item must have a name", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const common = { days, timeFrom, timeTo, description: description.trim() };
      if (freeEntryChecked) {
        for (const drinkType of feDrinkTypes) {
          await apiPost("/api/vendors/me/drink-plans", {
            type: drinkType,
            productName: drinkType === "welcome" ? "Free Drink" : "Unlimited Drinks",
            gender: feGender, price: 0,
            drinksOfferLabel: feDrinksOffer.trim(),
            foodDiscountLabel: feFoodDiscount.trim(),
            validUntil: feValidUntil || null,
            ...common,
          });
        }
      }
      if (ticketChecked) {
        await apiPost("/api/vendors/me/drink-plans", {
          type: "ticket", productName: "Included with Ticket", gender: "all", price: 0,
          lineItems: ticketItems.filter((i) => i.name.trim()),
          drinksOfferLabel: ticketDrinksOffer.trim(),
          foodDiscountLabel: ticketFoodDiscount.trim(),
          validUntil: ticketValidUntil || null,
          ...common,
        });
      }
      toast({ title: "Drink plan(s) added" });
      resetForm();
      await fetchPlans();
    } catch (err: unknown) {
      toast({ title: "Failed to add plan", description: errMsg(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const filledTicketItems = editItems.filter((i) => i.name.trim());
    if (editType === "ticket" && editItems.some((i) => !i.name.trim() && (i.qty !== 1 || i.discountedPrice !== 0))) {
      toast({ title: "Each item must have a name", variant: "destructive" }); return;
    }
    setEditSaving(true);
    try {
      const isTicket = editType === "ticket";
      const isFreeEntry = editType === "welcome" || editType === "unlimited";
      const editingPlan = plans.find((p) => p.id === editingId);
      const updated: DrinkPlan = await apiPatch(`/api/vendors/me/drink-plans/${editingId}`, {
        type: editType,
        productName: isTicket ? "Included with Ticket" : isFreeEntry ? (editType === "welcome" ? "Free Drink" : "Unlimited Drinks") : editProductName,
        gender: isTicket ? "all" : editGender,
        price: (isTicket || isFreeEntry) ? 0 : (editingPlan?.price ?? 0),
        ...(isTicket ? { lineItems: filledTicketItems } : {}),
        days: editDays, timeFrom: editTimeFrom, timeTo: editTimeTo,
        description: editDescription.trim(),
        drinksOfferLabel: editDrinksOffer.trim(),
        foodDiscountLabel: editFoodDiscount.trim(),
        validUntil: editValidUntil || null,
      });
      setPlans((prev) => prev.map((p) => p.id === editingId ? updated : p));
      setEditingId(null);
      toast({ title: "Drink plan updated" });
    } catch (err: unknown) {
      toast({ title: "Failed to update plan", description: errMsg(err), variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (planId: number) => {
    setDeleting(planId);
    try {
      await apiDelete(`/api/vendors/me/drink-plans/${planId}`);
      setPlans((prev) => prev.filter((p) => p.id !== planId));
      toast({ title: "Drink plan removed" });
    } catch (err: unknown) {
      toast({ title: "Failed to remove plan", description: errMsg(err), variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const fmtTime = (hhmm: string) => {
    if (!hhmm) return "";
    const [h, m] = hhmm.split(":").map(Number);
    const suffix = h! < 12 ? "AM" : "PM";
    return `${h! % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
  };

  const DayPicker = ({ selected, onToggle }: { selected: string[]; onToggle: (d: string) => void }) => (
    <div className="flex flex-wrap gap-2">
      {PLAN_DAYS.map((day) => (
        <button key={day} type="button" onClick={() => onToggle(day)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${selected.includes(day) ? "bg-primary text-primary-foreground border-primary" : "border-white/15 text-muted-foreground hover:bg-white/5"}`}>
          {day}
        </button>
      ))}
    </div>
  );

  const LineItemsEditor = ({
    items,
    onChange,
  }: {
    items: DrinkPlanLineItem[];
    onChange: (items: DrinkPlanLineItem[]) => void;
  }) => (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <Input
            placeholder="Offer / product name"
            value={item.name}
            onChange={(e) => { const next = [...items]; next[idx] = { ...item, name: e.target.value }; onChange(next); }}
            className="bg-black/40 border-white/10 flex-1"
          />
          <Input
            type="number" min="1" placeholder="Qty"
            value={item.qty}
            onChange={(e) => { const next = [...items]; next[idx] = { ...item, qty: Math.max(1, parseInt(e.target.value) || 1) }; onChange(next); }}
            className="bg-black/40 border-white/10 w-20"
          />
          <div className="relative w-32">
            <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="number" min="0" placeholder="Price"
              value={item.discountedPrice}
              onChange={(e) => { const next = [...items]; next[idx] = { ...item, discountedPrice: Math.max(0, parseInt(e.target.value) || 0) }; onChange(next); }}
              className="bg-black/40 border-white/10 pl-7"
            />
          </div>
          {items.length > 1 && (
            <button type="button" onClick={() => onChange(items.filter((_, i) => i !== idx))}
              className="rounded-lg border border-destructive/30 p-1.5 text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, emptyItem()])}
        className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1">
        <Plus className="h-3.5 w-3.5" /> Add item
      </button>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="rounded-3xl glass-card-strong p-8">
        <h2 className="font-serif text-2xl mb-1 flex items-center gap-2">
          <GlassWater className="h-5 w-5 text-primary" /> Drink Plans &amp; Offers
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Add drink packages that will appear on your public profile. Select one or both offer types below.
        </p>

        <form onSubmit={handleAdd} className="space-y-5 border border-white/10 rounded-2xl p-5 bg-black/20">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Add new plan(s)</h3>

          {/* Free Entry */}
          <div className={`rounded-xl border p-4 transition-colors ${freeEntryChecked ? "border-primary/40 bg-primary/5" : "border-white/10 bg-black/10"}`}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={freeEntryChecked}
                onChange={(e) => setFreeEntryChecked(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span className="font-semibold text-sm">Free Entry</span>
            </label>
            {freeEntryChecked && (
              <div className="mt-4 space-y-4 pl-7">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-2 block text-xs text-muted-foreground uppercase tracking-wider">Drink type <span className="normal-case text-muted-foreground/60">(select one or both)</span></Label>
                    <div className="flex gap-3">
                      {([["welcome", "Free Drink"], ["unlimited", "Unlimited Drinks"]] as const).map(([val, label]) => (
                        <label key={val} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="checkbox" value={val}
                            checked={feDrinkTypes.includes(val)}
                            onChange={(e) => setFeDrinkTypes((prev) => e.target.checked ? [...prev, val] : prev.filter((t) => t !== val))}
                            className="h-4 w-4 accent-primary" />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="mb-2 block text-xs text-muted-foreground uppercase tracking-wider">For guests</Label>
                    <div className="flex gap-3">
                      {([["all", "All Guests"], ["female", "Girls Only"]] as const).map(([val, label]) => (
                        <label key={val} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="radio" name="feGender" value={val} checked={feGender === val}
                            onChange={() => setFeGender(val)} className="accent-primary" />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground uppercase tracking-wider">Drinks discount label <span className="normal-case text-muted-foreground/60">(optional)</span></Label>
                    <Input value={feDrinksOffer} onChange={(e) => setFeDrinksOffer(e.target.value)}
                      placeholder="e.g. 2+1 on cocktails" className="bg-black/40 border-white/10 text-sm" maxLength={255} />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground uppercase tracking-wider">Food discount label <span className="normal-case text-muted-foreground/60">(optional)</span></Label>
                    <Input value={feFoodDiscount} onChange={(e) => setFeFoodDiscount(e.target.value)}
                      placeholder="e.g. 20% off starters" className="bg-black/40 border-white/10 text-sm" maxLength={255} />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground uppercase tracking-wider">Offer valid until <span className="normal-case text-muted-foreground/60">(optional — auto-hides after this date)</span></Label>
                    <Input type="date" value={feValidUntil} onChange={(e) => setFeValidUntil(e.target.value)}
                      className="bg-black/40 border-white/10 text-sm" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Included with Ticket */}
          <div className={`rounded-xl border p-4 transition-colors ${ticketChecked ? "border-primary/40 bg-primary/5" : "border-white/10 bg-black/10"}`}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ticketChecked}
                onChange={(e) => setTicketChecked(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span className="font-semibold text-sm">Included with Ticket</span>
            </label>
            {ticketChecked && (
              <div className="mt-4 pl-7 space-y-3">
                <div>
                  <Label className="mb-2 block text-xs text-muted-foreground uppercase tracking-wider">
                    Items included <span className="normal-case text-muted-foreground/60">(name, quantity, discounted price)</span>
                  </Label>
                  <LineItemsEditor items={ticketItems} onChange={setTicketItems} />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground uppercase tracking-wider">Drinks discount label <span className="normal-case text-muted-foreground/60">(optional)</span></Label>
                    <Input value={ticketDrinksOffer} onChange={(e) => setTicketDrinksOffer(e.target.value)}
                      placeholder="e.g. 1 beer included" className="bg-black/40 border-white/10 text-sm" maxLength={255} />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground uppercase tracking-wider">Food discount label <span className="normal-case text-muted-foreground/60">(optional)</span></Label>
                    <Input value={ticketFoodDiscount} onChange={(e) => setTicketFoodDiscount(e.target.value)}
                      placeholder="e.g. 15% off food" className="bg-black/40 border-white/10 text-sm" maxLength={255} />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground uppercase tracking-wider">Offer valid until <span className="normal-case text-muted-foreground/60">(optional — auto-hides after this date)</span></Label>
                    <Input type="date" value={ticketValidUntil} onChange={(e) => setTicketValidUntil(e.target.value)}
                      className="bg-black/40 border-white/10 text-sm" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Common fields */}
          {(freeEntryChecked || ticketChecked) && (
            <div className="grid sm:grid-cols-2 gap-4 border-t border-white/10 pt-4">
              <div className="sm:col-span-2">
                <Label className="mb-2 block">Applicable days <span className="text-muted-foreground text-xs">(leave blank for all days)</span></Label>
                <DayPicker selected={days} onToggle={toggleDay} />
              </div>
              <div>
                <Label>Valid from</Label>
                <Input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} className="bg-black/40 border-white/10" />
              </div>
              <div>
                <Label>Valid until</Label>
                <Input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} className="bg-black/40 border-white/10" />
              </div>
              <div className="sm:col-span-2">
                <Label>Short description <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Any extra details customers should know…" rows={2}
                  className="bg-black/40 border-white/10 resize-none" maxLength={500} />
              </div>
            </div>
          )}

          <Button type="submit" disabled={saving || (!freeEntryChecked && !ticketChecked)} className="gap-2">
            <Plus className="h-4 w-4" />
            {saving ? "Adding…" : "Add plan(s)"}
          </Button>
        </form>
      </div>

      <div className="rounded-3xl glass-card p-8">
        <h3 className="font-serif text-xl mb-5">Your current plans</h3>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : plans.length === 0 ? (
          <p className="text-muted-foreground text-sm">No drink plans added yet. Add one above to display it on your public profile.</p>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                {editingId === plan.id ? (
                  <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
                    <h4 className="text-sm font-semibold text-primary">Editing plan</h4>

                    {/* Free-entry edit controls */}
                    {(editType === "welcome" || editType === "unlimited") && (
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <Label className="mb-2 block text-xs text-muted-foreground uppercase tracking-wider">Drink type</Label>
                          <div className="flex gap-3">
                            {([["welcome", "Free Drink"], ["unlimited", "Unlimited Drinks"]] as const).map(([val, label]) => (
                              <label key={val} className="flex items-center gap-2 cursor-pointer text-sm">
                                <input type="radio" name="editDrinkType" value={val} checked={editType === val}
                                  onChange={() => setEditType(val)} className="accent-primary" />
                                {label}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label className="mb-2 block text-xs text-muted-foreground uppercase tracking-wider">For guests</Label>
                          <div className="flex gap-3">
                            {([["all", "All Guests"], ["female", "Girls Only"]] as const).map(([val, label]) => (
                              <label key={val} className="flex items-center gap-2 cursor-pointer text-sm">
                                <input type="radio" name="editGender" value={val} checked={editGender === val}
                                  onChange={() => setEditGender(val)} className="accent-primary" />
                                {label}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Ticket edit controls */}
                    {editType === "ticket" && (
                      <div>
                        <Label className="mb-2 block text-xs text-muted-foreground uppercase tracking-wider">
                          Items included <span className="normal-case text-muted-foreground/60">(name, qty, discounted price)</span>
                        </Label>
                        <LineItemsEditor items={editItems} onChange={setEditItems} />
                      </div>
                    )}

                    {/* Custom/legacy type — show product name field */}
                    {editType === "custom" && (
                      <div>
                        <Label>Product / offer name</Label>
                        <Input value={editProductName} onChange={(e) => setEditProductName(e.target.value)} className="bg-black/40 border-white/10" />
                      </div>
                    )}

                    <div className="grid sm:grid-cols-2 gap-4 border-t border-white/10 pt-4">
                      <div className="sm:col-span-2">
                        <Label className="mb-2 block">Applicable days</Label>
                        <DayPicker selected={editDays} onToggle={toggleEditDay} />
                      </div>
                      <div>
                        <Label>Valid from</Label>
                        <Input type="time" value={editTimeFrom} onChange={(e) => setEditTimeFrom(e.target.value)} className="bg-black/40 border-white/10" />
                      </div>
                      <div>
                        <Label>Valid until</Label>
                        <Input type="time" value={editTimeTo} onChange={(e) => setEditTimeTo(e.target.value)} className="bg-black/40 border-white/10" />
                      </div>
                      <div>
                        <Label className="flex items-center gap-1">Drinks discount label <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                        <Input value={editDrinksOffer} onChange={(e) => setEditDrinksOffer(e.target.value)}
                          placeholder="e.g. 2+1 on cocktails" className="bg-black/40 border-white/10" maxLength={255} />
                      </div>
                      <div>
                        <Label className="flex items-center gap-1">Food discount label <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                        <Input value={editFoodDiscount} onChange={(e) => setEditFoodDiscount(e.target.value)}
                          placeholder="e.g. 20% off starters" className="bg-black/40 border-white/10" maxLength={255} />
                      </div>
                      <div>
                        <Label className="flex items-center gap-1">Offer valid until <span className="text-muted-foreground text-xs font-normal">(optional — auto-hides after this date)</span></Label>
                        <Input type="date" value={editValidUntil} onChange={(e) => setEditValidUntil(e.target.value)}
                          className="bg-black/40 border-white/10" />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Description</Label>
                        <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} className="bg-black/40 border-white/10 resize-none" maxLength={500} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button type="submit" disabled={editSaving} size="sm">{editSaving ? "Saving…" : "Save changes"}</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>Cancel</Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                          {PLAN_TYPE_BADGE[plan.type] ?? plan.type}
                        </span>
                        {plan.gender === "female" && (
                          <span className="rounded-full bg-pink-500/10 border border-pink-500/20 px-2 py-0.5 text-[10px] text-pink-400 font-medium">
                            Girls only
                          </span>
                        )}
                        {plan.gender === "all" && (plan.type === "welcome" || plan.type === "unlimited") && (
                          <span className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground font-medium">
                            All guests
                          </span>
                        )}
                        {plan.price > 0 && (
                          <span className="rounded-full bg-white/5 text-muted-foreground border border-white/10 px-2 py-0.5 text-[10px] font-medium">
                            ₹{(plan.price / 100).toFixed(0)}
                          </span>
                        )}
                        {plan.validUntil && (
                          plan.validUntil < new Date().toISOString().slice(0, 10) ? (
                            <span className="rounded-full bg-red-500/10 border border-red-500/30 px-2 py-0.5 text-[10px] text-red-400 font-medium">
                              Expired {plan.validUntil}
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] text-amber-400 font-medium">
                              Until {plan.validUntil}
                            </span>
                          )
                        )}
                      </div>
                      {/* Show legacy productName when there are no line items */}
                      {(!plan.lineItems || plan.lineItems.length === 0) && plan.productName && plan.type !== "welcome" && plan.type !== "unlimited" && (
                        <p className="text-sm font-medium">{plan.productName}</p>
                      )}
                      {plan.lineItems && plan.lineItems.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {plan.lineItems.map((item, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex gap-2">
                              <span className="font-medium text-foreground/80">{item.name}</span>
                              <span>×{item.qty}</span>
                              {item.discountedPrice > 0 && <span>₹{item.discountedPrice}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                        {plan.days.length > 0 && <span>{plan.days.join(", ")}</span>}
                        {plan.timeFrom && plan.timeTo && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {fmtTime(plan.timeFrom)} – {fmtTime(plan.timeTo)}
                          </span>
                        )}
                        {plan.description && <span className="italic text-muted-foreground/70">{plan.description}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => startEdit(plan)}
                        className="rounded-lg border border-white/15 p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors" title="Edit plan">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => handleDelete(plan.id)} disabled={deleting === plan.id}
                        className="rounded-lg border border-destructive/30 p-2 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50" title="Remove plan">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BankingPanel() {
  const { toast } = useToast();
  const [banking, setBanking] = useState<{ accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string } | null>(null);
  const [form, setForm] = useState({ accountHolderName: "", bankName: "", accountNumber: "", ifscCode: "" });
  const [saving, setSaving] = useState(false);
  const [loadingBanking, setLoadingBanking] = useState(true);
  const [requests, setRequests] = useState<Array<{ id: number; amount: string; status: string; adminNote: string; requestedAt: string }>>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestAmount, setRequestAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    setLoadingBanking(true);
    setLoadingRequests(true);
    try {
      const b = await apiGet<{ accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string } | null>("/api/partner/banking-details");
      if (b) {
        setBanking(b);
        setForm({ accountHolderName: b.accountHolderName, bankName: b.bankName, accountNumber: b.accountNumber, ifscCode: b.ifscCode });
      }
    } catch {
      // not saved yet
    } finally {
      setLoadingBanking(false);
    }
    try {
      const r = await apiGet<Array<{ id: number; amount: string; status: string; adminNote: string; requestedAt: string }>>("/api/partner/settlement/requests");
      setRequests(r ?? []);
    } catch {
      // ignore
    } finally {
      setLoadingRequests(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function saveBanking(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[A-Z0-9]{11}$/.test(form.ifscCode)) {
      toast({ title: "Invalid IFSC", description: "IFSC must be 11 uppercase alphanumeric characters.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const saved = await apiPut<{ accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string }>("/api/partner/banking-details", form);
      setBanking(saved);
      toast({ title: "Banking details saved" });
    } catch {
      toast({ title: "Failed to save banking details", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(requestAmount);
    if (!amount || amount <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const created = await apiPost<{ id: number; amount: string; status: string; adminNote: string; requestedAt: string }>("/api/partner/settlement/request", { amount });
      setRequests((prev) => [created, ...prev]);
      setShowRequestModal(false);
      setRequestAmount("");
      toast({ title: "Settlement request submitted" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit request";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function statusBadge(status: string) {
    if (status === "approved") return <span className="rounded-full bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 text-[11px] font-medium">Approved</span>;
    if (status === "rejected") return <span className="rounded-full bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 text-[11px] font-medium">Rejected</span>;
    return <span className="rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 text-[11px] font-medium">Pending</span>;
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl glass-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Banknote className="h-5 w-5 text-primary" />
          <h2 className="font-serif text-xl">Bank Account Details</h2>
        </div>
        {loadingBanking ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <form onSubmit={saveBanking} className="space-y-4 max-w-lg">
            <div className="space-y-1.5">
              <Label>Account Holder Name</Label>
              <Input value={form.accountHolderName} onChange={(e) => setForm((f) => ({ ...f, accountHolderName: e.target.value }))} required placeholder="Full name as per bank records" />
            </div>
            <div className="space-y-1.5">
              <Label>Bank Name</Label>
              <Input value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} required placeholder="e.g. HDFC Bank" />
            </div>
            <div className="space-y-1.5">
              <Label>Account Number</Label>
              <Input value={form.accountNumber} onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))} required placeholder="Bank account number" />
            </div>
            <div className="space-y-1.5">
              <Label>IFSC Code</Label>
              <Input value={form.ifscCode} onChange={(e) => setForm((f) => ({ ...f, ifscCode: e.target.value.toUpperCase() }))} required placeholder="e.g. HDFC0001234" maxLength={11} className="uppercase" />
              <p className="text-xs text-muted-foreground">11 alphanumeric characters</p>
            </div>
            <Button type="submit" disabled={saving} className="gap-2">
              <CreditCard className="h-4 w-4" />
              {saving ? "Saving…" : banking ? "Update Banking Details" : "Save Banking Details"}
            </Button>
          </form>
        )}
      </div>

      <div className="rounded-2xl glass-card p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-xl">Settlement Requests</h2>
          </div>
          {banking && (
            <Button size="sm" onClick={() => setShowRequestModal(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Request Settlement
            </Button>
          )}
        </div>
        {!banking && (
          <p className="text-sm text-muted-foreground">Save your banking details above before requesting a settlement.</p>
        )}
        {loadingRequests ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">{banking ? "No settlement requests yet." : ""}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-white/10">
                <tr>
                  <th className="text-left py-2 pr-4">Date</th>
                  <th className="text-right py-2 px-2">Amount</th>
                  <th className="text-center py-2 px-2">Status</th>
                  <th className="text-left py-2 pl-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-3 pr-4 text-muted-foreground">{new Date(r.requestedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="text-right px-2 tabular-nums font-medium text-primary">{formatINR(Number(r.amount))}</td>
                    <td className="text-center px-2">{statusBadge(r.status)}</td>
                    <td className="text-left pl-2 text-muted-foreground text-xs">{r.adminNote || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowRequestModal(false)}>
          <div className="rounded-2xl glass-card p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-lg mb-4">Request Settlement</h3>
            <form onSubmit={submitRequest} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Amount (₹)</Label>
                <Input type="number" min="1" step="0.01" value={requestAmount} onChange={(e) => setRequestAmount(e.target.value)} placeholder="Enter amount" required />
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowRequestModal(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting} className="flex-1">{submitting ? "Submitting…" : "Submit Request"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
