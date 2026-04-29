import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  useGetMyVendor,
  useCreateMyVendor,
  useUpdateMyVendor,
  useListMyVendorEvents,
  useCreateEvent,
  useDeleteEvent,
  useListVendorBookings,
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
  TrendingUp, IndianRupee, Clock,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  apiGet, apiPost, apiDelete, apiPatch,
  EVENT_CATEGORIES, INDIAN_STATES, PUB_EVENT_TYPES, formatINR, fileToDataUrl,
} from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";

const CATEGORIES = [...EVENT_CATEGORIES];
const EVENT_KIND = ["event", "pub"] as const;

const COUNTRIES = ["India", "United States", "United Kingdom", "United Arab Emirates", "Singapore", "Australia", "Canada", "Other"];

const INDIAN_CITIES = [
  "Agra", "Ahmedabad", "Amritsar", "Aurangabad", "Bengaluru", "Bhopal", "Bhubaneswar",
  "Chandigarh", "Chennai", "Coimbatore", "Dehradun", "Delhi", "Guwahati", "Gwalior",
  "Hyderabad", "Indore", "Jaipur", "Jamshedpur", "Jodhpur", "Kochi", "Kolkata",
  "Lucknow", "Ludhiana", "Madurai", "Mangaluru", "Mumbai", "Mysuru", "Nagpur",
  "Nashik", "Noida", "Patna", "Pune", "Raipur", "Rajkot", "Ranchi", "Surat",
  "Thiruvananthapuram", "Udaipur", "Vadodara", "Varanasi", "Vijayawada", "Visakhapatnam",
];


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
  const { data: vendorData, refetch: refetchVendor } = useGetMyVendor();
  const vendor = (vendorData?.vendor ?? null) as any;
  const { data: events = [], refetch: refetchEvents } = useListMyVendorEvents({ query: { enabled: !!vendor } as any });
  const { data: bookings = [], refetch: refetchBookings } = useListVendorBookings({ query: { enabled: !!vendor } as any });

  const hasPub = (events as any[]).some((e: any) => e.type === "pub");

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
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-card flex-wrap h-auto p-1 gap-1">
            <TabsTrigger value="overview">Profile</TabsTrigger>
            <TabsTrigger value="events">Events &amp; pubs</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
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
            <TabsTrigger value="managers">
              <Users className="h-3.5 w-3.5 mr-1 text-primary" /> Managers
            </TabsTrigger>
            <Link href="/dashboard/vendor/scanner">
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-primary/30 text-primary hover:bg-primary/10 transition-colors">
                <ScanLine className="h-3.5 w-3.5" /> Ticket scanner
              </button>
            </Link>
          </TabsList>

          <TabsContent value="overview"><ProfileEditor vendor={vendor} onSaved={refetchVendor} /></TabsContent>
          <TabsContent value="events"><EventsManager vendor={vendor} events={events} refetchEvents={refetchEvents} /></TabsContent>
          <TabsContent value="bookings"><BookingsManager bookings={bookings} refetch={refetchBookings} /></TabsContent>
          <TabsContent value="analytics"><AnalyticsPanel /></TabsContent>
          <TabsContent value="calendar"><BlockedCalendar vendorId={vendor.id} /></TabsContent>
          <TabsContent value="ads"><AdsPanel /></TabsContent>
          <TabsContent value="announcements"><AnnouncementsPanel /></TabsContent>
          <TabsContent value="leads"><LeadsPanel /></TabsContent>
          <TabsContent value="managers"><ManagersPanel /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

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

function ProfileEditor({ vendor, onSaved }: { vendor: any; onSaved: () => void }) {
  const [businessName, setName] = useState(vendor.businessName);
  const [description, setDescription] = useState(vendor.description);
  const [stateF, setStateF] = useState(vendor.state ?? "");
  const [city, setCity] = useState(vendor.city ?? "");
  const [country, setCountry] = useState(vendor.country || "India");
  const [openDays, setOpenDays] = useState<string[]>(
    Array.isArray(vendor.openDays) && vendor.openDays.length > 0 ? vendor.openDays : [...ALL_DAYS]
  );
  const [dayTimes, setDayTimes] = useState<DayTimes>(() => parseDayHours(vendor.dayHours));
  const [address, setAddress] = useState<string>(vendor.address ?? "");
  const [addressQuery, setAddressQuery] = useState<string>(vendor.address ?? "");
  const [suggestions, setSuggestions] = useState<PlacesSuggestion[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [descError, setDescError] = useState("");
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
  const update = useUpdateMyVendor();
  const { toast } = useToast();

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

  const selectSuggestion = (s: PlacesSuggestion) => {
    setAddress(s.description);
    setAddressQuery(s.description);
    setSuggestions([]);
    setShowSugg(false);
  };

  const toggleDay = (day: string) =>
    setOpenDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);

  const setDayTime = (day: string, field: "open" | "close", val: string) => {
    setDayTimes((prev) => {
      const updated = { ...prev, [day]: { open: prev[day]?.open ?? "", close: prev[day]?.close ?? "", [field]: val } };
      const { open, close } = updated[day]!;
      const err = checkDayError(open, close);
      setDayHoursErrors((e) => ({ ...e, [day]: err }));
      return updated;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 300) {
      setDescError("Description must be at least 300 characters.");
      return;
    }
    if (openDays.length === 0) {
      toast({ title: "Select at least one open day", variant: "destructive" }); return;
    }
    const firstHoursError = openDays.map((d) => dayHoursErrors[d]).find(Boolean);
    if (firstHoursError) {
      toast({ title: "Fix opening hours", description: firstHoursError, variant: "destructive" }); return;
    }
    setDescError("");
    const dayHoursPayload: DayTimes = {};
    for (const day of openDays) {
      dayHoursPayload[day] = { open: dayTimes[day]?.open ?? "", close: dayTimes[day]?.close ?? "" };
    }
    update.mutate(
      { data: { businessName, category: vendor.category, description, location: `${city}${stateF ? ", " + stateF : ""}`, country, state: stateF, city, bannerImage: vendor.bannerImage ?? "", portfolioImages: [] } },
      {
        onSuccess: async () => {
          try {
            await apiPatch("/api/partner/profile", {
              state: stateF, city, country, address, openDays, dayHours: dayHoursPayload,
            });
            toast({ title: "Profile updated" });
            onSaved();
          } catch (err: any) {
            toast({ title: "Location / schedule not saved", description: err?.message ?? "Please try again.", variant: "destructive" });
          }
        },
        onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="grid lg:grid-cols-[1fr_auto] gap-6">
      <form onSubmit={submit} className="rounded-3xl glass-card-strong p-8 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Business name</Label>
            <Input value={businessName} onChange={(e) => setName(e.target.value)} className="bg-black/40 border-white/10" />
          </div>
          <div>
            <Label>City</Label>
            <Select value={city || "any"} onValueChange={(v) => setCity(v === "any" ? "" : v)}>
              <SelectTrigger className="bg-black/40 border-white/10"><SelectValue placeholder="— select city —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">— select —</SelectItem>
                {INDIAN_CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>State</Label>
            <Select value={stateF || "any"} onValueChange={(v) => setStateF(v === "any" ? "" : v)}>
              <SelectTrigger className="bg-black/40 border-white/10"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">— select —</SelectItem>
                {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Country</Label>
            <Select value={country || "India"} onValueChange={setCountry}>
              <SelectTrigger className="bg-black/40 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
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
        <div className="relative">
          <Label className="mb-1 block">Venue address <span className="text-muted-foreground text-xs">(optional — for map link)</span></Label>
          <Input
            value={addressQuery}
            onChange={(e) => { setAddressQuery(e.target.value); setAddress(e.target.value); searchAddress(e.target.value); }}
            onBlur={() => setTimeout(() => setShowSugg(false), 200)}
            onFocus={() => { if (suggestions.length > 0) setShowSugg(true); }}
            placeholder="Start typing your venue address…"
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
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Closed</p>
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
                            onChange={(e) => setDayTime(day, "open", e.target.value)}
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
                            onChange={(e) => setDayTime(day, "close", e.target.value)}
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Toggle each day on or off. If closing time is earlier than opening time it is treated as an overnight schedule (e.g. 10 pm – 2 am).</p>
        </div>
        <Button type="submit" disabled={update.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">
          {update.isPending ? "Saving…" : "Save profile"}
        </Button>
      </form>
      <aside className="rounded-3xl glass-card p-6 lg:w-72 h-fit space-y-3">
        <p className="font-serif text-xl">{businessName}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={vendor.status === "approved" ? "default" : "secondary"}>{vendor.status}</Badge>
          <Badge variant="outline">{vendor.category}</Badge>
          {vendor.isPremium && <Badge className="bg-primary text-primary-foreground border-0">Premium</Badge>}
        </div>
        {(city || stateF) && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {city}{stateF && `, ${stateF}`}
          </p>
        )}
        {country && <p className="text-xs text-muted-foreground">{country}</p>}
      </aside>
    </div>
  );
}

function EventsManager({ vendor, events, refetchEvents }: { vendor: any; events: any[]; refetchEvents: () => void }) {
  const [showForm, setShow] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
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
          <Button onClick={() => { setShow((s) => !s); setEditingId(null); }} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">
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
                      <Button size="icon" variant="ghost" onClick={() => setEditingId(e.id)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (!confirm("Delete this listing?")) return;
                          del.mutate({ eventId: e.id }, {
                            onSuccess: () => { toast({ title: "Deleted" }); refetchEvents(); },
                            onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
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

      {editingId != null && (
        <EditEventModal
          event={events.find((e: any) => e.id === editingId)!}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); refetchEvents(); }}
        />
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
  const create = useCreateEvent();
  const { toast } = useToast();

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === "pub" && !enableTickets && !enableEvents) {
      toast({ title: "Pick at least one of Tickets or Events", variant: "destructive" });
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
      galleryImages,
      galleryVideos,
    };
    create.mutate(
      { data: body },
      {
        onSuccess: () => { toast({ title: "Submitted for review! An admin will approve your listing shortly." }); onSaved(); },
        onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <form onSubmit={submit} className="rounded-3xl glass-card-strong p-6 space-y-3">
      <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-2">
        <p className="text-xs text-muted-foreground mb-0.5">Business name (listing title)</p>
        <p className="font-serif text-lg">{vendor.businessName}</p>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label className="flex items-center gap-1.5"><Upload className="h-3.5 w-3.5 text-primary" />Listing image (cover)</Label>
          <Input type="file" accept="image/*" onChange={(e) => onImageFile(e.target.files?.[0] ?? null)} className="bg-black/40 border-white/10" />
          {imageUrl && <img src={imageUrl} alt="" className="mt-2 rounded-xl max-h-28 object-cover" />}
        </div>
        <div>
          <Label>City</Label>
          <Select value={city || "any"} onValueChange={(v) => setCity(v === "any" ? "" : v)}>
            <SelectTrigger className="bg-black/40 border-white/10"><SelectValue placeholder="— select city —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">— select —</SelectItem>
              {INDIAN_CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>State</Label>
          <Select value={stateF || "any"} onValueChange={(v) => setStateF(v === "any" ? "" : v)}>
            <SelectTrigger className="bg-black/40 border-white/10"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">— select —</SelectItem>
              {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Country</Label>
          <Select value={country || "India"} onValueChange={setCountry}>
            <SelectTrigger className="bg-black/40 border-white/10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
            <div className="grid md:grid-cols-3 gap-3">
              <div><Label>Women (₹)</Label><Input type="number" min={0} value={priceWomen} onChange={(e) => setPriceWomen(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
              <div><Label>Men (₹)</Label><Input type="number" min={0} value={priceMen} onChange={(e) => setPriceMen(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
              <div><Label>Couple (₹)</Label><Input type="number" min={0} value={priceCouple} onChange={(e) => setPriceCouple(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
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

      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">Submit for review</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function EditEventModal({ event, onClose, onSaved }: { event: any; onClose: () => void; onSaved: () => void }) {
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
    try {
      const tierArr = [priceWomen, priceMen, priceCouple].filter((n) => n > 0);
      const recalcPrice = isPub
        ? (tierArr.length > 0 ? Math.min(...tierArr) : price)
        : price;
      await apiPatch(`/api/events/${event.id}`, {
        title, description, imageUrl, capacity,
        price: recalcPrice, galleryImages, galleryVideos,
        ...(isPub ? { pubMode, priceWomen, priceMen, priceCouple, pubEventTypes } : {}),
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <form onSubmit={save} className="bg-card border border-white/10 rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-3 my-auto" onClick={(e) => e.stopPropagation()}>
        <p className="font-serif text-2xl">Edit listing</p>
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
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Women (₹)</Label><Input type="number" min={0} value={priceWomen} onChange={(e) => setPriceWomen(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
              <div><Label>Men (₹)</Label><Input type="number" min={0} value={priceMen} onChange={(e) => setPriceMen(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
              <div><Label>Couple (₹)</Label><Input type="number" min={0} value={priceCouple} onChange={(e) => setPriceCouple(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
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
          </>
        )}
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">Save</Button>
        </div>
      </form>
    </div>
  );
}

function BookingsManager({ bookings, refetch }: { bookings: any[]; refetch: () => void }) {
  const { toast } = useToast();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const approve = async (id: number) => {
    try {
      await apiPatch(`/api/bookings/${id}/status`, { status: "confirmed" });
      toast({ title: "Booking approved" });
      refetch();
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
      await apiPatch(`/api/bookings/${id}/status`, { status: "cancelled", rejectionReason: reason.trim() });
      toast({ title: "Booking rejected" });
      setRejectingId(null);
      setReason("");
      refetch();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  if (bookings.length === 0) return <p className="text-muted-foreground">No bookings yet.</p>;
  const pending = bookings.filter((b) => b.status === "pending");
  const others = bookings.filter((b) => b.status !== "pending");

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div>
          <h3 className="font-serif text-xl mb-1 flex items-center gap-2">
            Manual review queue
            <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full px-2 py-0.5">{pending.length}</span>
          </h3>
          <p className="text-xs text-muted-foreground mb-3">These are legacy bookings that weren't auto-approved. Approve or reject each one manually.</p>
          <div className="space-y-3">
            {pending.map((b) => (
              <div key={b.id} className="rounded-2xl glass-card overflow-hidden border border-amber-500/20">
                <div className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div>
                    <p className="font-serif text-lg">{b.eventTitle}</p>
                    <p className="text-sm text-muted-foreground">{b.userName} · {b.userEmail}</p>
                    <p className="text-sm mt-1">
                      {b.bookingDate} · {b.guests} guests · {formatINR(b.finalPrice ?? b.totalPrice)}
                      {b.couponCode && <span className="text-green-400 ml-2">(coupon {b.couponCode})</span>}
                    </p>
                    {b.notes && <p className="text-sm italic text-muted-foreground mt-1">"{b.notes}"</p>}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <div className="flex gap-2">
                      <Button onClick={() => approve(b.id)} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0 gap-1.5 text-sm">
                        Approve
                      </Button>
                      <Button variant="outline" className="gap-1.5 text-sm" onClick={() => { setRejectingId(b.id); setReason(""); }}>
                        Reject
                      </Button>
                    </div>
                    <a href={`/events/${b.eventId}`} target="_blank" rel="noreferrer"
                      className="text-xs text-center text-muted-foreground hover:text-foreground transition-colors">
                      View event details →
                    </a>
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
                      <Button size="sm" onClick={() => reject(b.id)} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">
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
        </div>
      )}
      {others.length > 0 && (
        <div>
          <h3 className="font-serif text-xl mb-3">All bookings</h3>
          <div className="space-y-3">
            {others.map((b) => (
              <div key={b.id} className="rounded-2xl glass-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      b.status === "confirmed" ? "bg-green-500/20 text-green-300 border-green-500/30" :
                      b.status === "cancelled" ? "bg-red-500/20 text-red-300 border-red-500/30" :
                      b.status === "completed" ? "bg-blue-500/20 text-blue-300 border-blue-500/30" :
                      "bg-white/10 text-white/60 border-white/10"
                    }`}>{b.status}</span>
                  </div>
                  <p className="font-serif text-lg">{b.eventTitle}</p>
                  <p className="text-sm text-muted-foreground">{b.userName} · {b.userEmail}</p>
                  <p className="text-sm mt-1">
                    {b.bookingDate} · {b.guests} guests · {formatINR(b.finalPrice ?? b.totalPrice)}
                  </p>
                  {b.status === "cancelled" && b.approvedBy === "customer" && (
                    <p className="text-xs text-amber-400 mt-1 font-medium">Cancelled by customer</p>
                  )}
                  {b.rejectionReason && (
                    <p className="text-xs text-red-400 mt-1">Reason: {b.rejectionReason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
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
  createdAt: string;
}

function AnnouncementsPanel() {
  const { toast } = useToast();
  const [items, setItems] = useState<Announcement[]>([]);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState({ title: "", body: "", announceDate: "", announceTime: "", imageUrl: "" });
  const [saving, setSaving] = useState(false);
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
    setForm({ title: "", body: "", announceDate: "", announceTime: "", imageUrl: "" });
  };
  const openEdit = (a: Announcement) => {
    setEditing(a);
    setImageFile(null);
    setImagePreview(a.imageUrl || "");
    setForm({ title: a.title, body: a.body, announceDate: a.announceDate, announceTime: a.announceTime, imageUrl: a.imageUrl });
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
      setForm({ title: "", body: "", announceDate: "", announceTime: "", imageUrl: "" });
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

      <div className="rounded-3xl glass-card p-6">
        <p className="font-serif text-xl mb-3">Your announcements</p>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No announcements yet. Create one to notify your audience.</p>
        ) : (
          <div className="space-y-3">
            {items.map((a) => (
              <div key={a.id} className="rounded-xl border border-white/10 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{a.title}</p>
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

interface AnalyticsData {
  totalEarnings: number;
  monthEarnings: number;
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
  totalWomen: number;
  totalMen: number;
  totalCouple: number;
}

function AnalyticsPanel() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiGet<AnalyticsData>("/api/partner/analytics")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-muted-foreground py-8 text-center">Loading analytics…</p>;
  }

  if (!data) {
    return <p className="text-muted-foreground py-8 text-center">Could not load analytics.</p>;
  }

  const hasData = data.totalEarnings > 0 || data.perEvent.length > 0;

  const chartMax = Math.max(...data.dailyRevenue.map((d) => d.revenue), 1);
  const monthName = new Date().toLocaleString("en-IN", { month: "long" });
  const hasTickets = (data.totalWomen + data.totalMen + data.totalCouple) > 0;

  return (
    <div className="space-y-6">
      {/* Earnings summary cards */}
      <div className="grid sm:grid-cols-2 gap-4">
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
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">This month ({monthName})</p>
            <p className="stat-number text-3xl">{formatINR(data.monthEarnings)}</p>
            <p className="text-xs text-muted-foreground mt-1">month-to-date</p>
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
          <p className="font-serif text-xl mb-5">Revenue — last 30 days</p>
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

function LeadsPanel() {
  const [data, setData] = useState<Lead | null>(null);
  useEffect(() => {
    apiGet<Lead>("/api/partner/leads/me").then(setData).catch(() => {});
  }, []);

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
        <a href="/subscription"><Button className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">Upgrade to Premium</Button></a>
      </div>
    );
  }

  const totalViews = data.views.length;
  const known = data.views.filter((v: any) => v.viewerUserId).length;
  const conv = totalViews ? Math.round((known / totalViews) * 100) : 0;

  return (
    <div className="space-y-6">
      {data.crmTrialActive && !data.premium && (
        <div className="rounded-2xl border border-primary/40 bg-primary/10 px-5 py-4 flex items-center gap-3">
          <Crown className="h-5 w-5 text-primary shrink-0" />
          <p className="text-sm text-primary font-medium">
            You have <span className="font-bold">{data.crmTrialDaysRemaining} day{data.crmTrialDaysRemaining === 1 ? "" : "s"}</span> of free CRM access remaining.{" "}
            <a href="/subscription" className="underline underline-offset-2 hover:text-primary/80">Upgrade to keep it.</a>
          </p>
        </div>
      )}
      <div className="grid md:grid-cols-3 gap-4">
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
          <Crown className="h-5 w-5 text-primary mb-2" />
          <p className="stat-number text-3xl">{conv}%</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Lead conversion</p>
        </div>
      </div>
      <div className="rounded-3xl glass-card-strong p-6">
        <p className="font-serif text-xl mb-3">Recent visitors</p>
        {data.views.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one has viewed your profile yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left py-2">Name</th><th className="text-left">Email</th><th className="text-right">When</th></tr>
            </thead>
            <tbody>
              {data.views.slice(0, 50).map((v: any, i: number) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="py-2">{v.viewerName || "Anonymous"}</td>
                  <td className="text-muted-foreground">{v.viewerEmail || "—"}</td>
                  <td className="text-right text-muted-foreground">{new Date(v.viewedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
