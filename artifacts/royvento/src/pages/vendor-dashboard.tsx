import { useEffect, useState } from "react";
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
  Megaphone, Crown, Users, Eye, MapPin, Wine, Pencil, Upload, Ticket as TicketIcon, ScanLine,
} from "lucide-react";
import {
  apiGet, apiPost, apiDelete, apiPatch,
  EVENT_CATEGORIES, INDIAN_STATES, BUDGET_RANGES, PUB_EVENT_TYPES, formatINR, fileToDataUrl,
} from "@/lib/api";
import { LocationSelect } from "@/components/LocationSelect";
import { Checkbox } from "@/components/ui/checkbox";

const CATEGORIES = [...EVENT_CATEGORIES];
const EVENT_KIND = ["event", "pub"] as const;

interface Media {
  id: number; type: "photo" | "video"; url: string; caption: string;
  eventCategories: string[];
}
interface BlockedDate {
  id: number; date: string; reason: string; source: string;
}
interface Ad {
  id: number; status: string; message: string; createdAt: string;
}
interface Lead {
  premium: boolean; views: any[]; message?: string;
}

export function VendorDashboard() {
  const { data: vendorData, refetch: refetchVendor } = useGetMyVendor();
  const vendor = (vendorData?.vendor ?? null) as any;
  const { data: events = [], refetch: refetchEvents } = useListMyVendorEvents({ query: { enabled: !!vendor } as any });
  const { data: bookings = [], refetch: refetchBookings } = useListVendorBookings({ query: { enabled: !!vendor } as any });

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
        <CreateVendorForm onCreated={refetchVendor} />
      ) : (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-card flex-wrap h-auto p-1 gap-1">
            <TabsTrigger value="overview">Profile</TabsTrigger>
            <TabsTrigger value="events">Events &amp; pubs</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="media">Media</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="ads">Ads</TabsTrigger>
            <TabsTrigger value="leads">
              <Crown className="h-3.5 w-3.5 mr-1 text-primary" /> Leads
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
          <TabsContent value="media"><MediaManager /></TabsContent>
          <TabsContent value="calendar"><BlockedCalendar vendorId={vendor.id} /></TabsContent>
          <TabsContent value="ads"><AdsPanel /></TabsContent>
          <TabsContent value="leads"><LeadsPanel isPremium={!!vendor.isPremium} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function CreateVendorForm({ onCreated }: { onCreated: () => void }) {
  const [businessName, setName] = useState("");
  const [category, setCategory] = useState("Wedding");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [bannerImage, setBanner] = useState("");
  const [coverImageUrl, setCover] = useState("");
  const [country, setCountry] = useState("India");
  const [stateF, setStateF] = useState("");
  const [city, setCity] = useState("");
  const create = useCreateMyVendor();
  const { toast } = useToast();

  const onBannerFile = async (f: File | null) => {
    if (!f) return;
    try { setBanner(await fileToDataUrl(f)); } catch { /* ignore */ }
  };
  const onCoverFile = async (f: File | null) => {
    if (!f) return;
    try { setCover(await fileToDataUrl(f)); } catch { /* ignore */ }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const loc = location || [city, stateF].filter(Boolean).join(", ");
    create.mutate(
      { data: { businessName, category, description, location: loc, bannerImage, portfolioImages: [] } },
      {
        onSuccess: async () => {
          try { await apiPatch("/api/partner/profile", { state: stateF, city, country, coverImageUrl }); } catch { /* silent */ }
          toast({ title: "Partner profile submitted!" });
          onCreated();
        },
        onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <form onSubmit={submit} className="max-w-2xl rounded-3xl glass-card-strong p-8 space-y-4">
      <div>
        <h2 className="font-serif text-2xl">Create your partner profile</h2>
        <p className="text-sm text-muted-foreground mt-1">Submit your studio for review.</p>
      </div>
      <div><Label>Business name</Label><Input required value={businessName} onChange={(e) => setName(e.target.value)} className="bg-black/40 border-white/10" /></div>
      <div>
        <Label>Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="bg-black/40 border-white/10"><SelectValue /></SelectTrigger>
          <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-primary" />Location</Label>
        <div className="mt-1.5">
          <LocationSelect
            country={country}
            state={stateF}
            city={city}
            onChange={(n) => { setCountry(n.country); setStateF(n.state); setCity(n.city); }}
          />
        </div>
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Optional location label (e.g. Park Street)"
          className="bg-black/40 border-white/10 mt-2"
        />
      </div>
      <div>
        <Label className="flex items-center gap-1.5"><Upload className="h-3.5 w-3.5 text-primary" />Profile banner image</Label>
        <Input type="file" accept="image/*" onChange={(e) => onBannerFile(e.target.files?.[0] ?? null)} className="bg-black/40 border-white/10 mt-1" />
        {bannerImage && <img src={bannerImage} alt="" className="mt-2 rounded-xl max-h-32 object-cover" />}
      </div>
      <div>
        <Label className="flex items-center gap-1.5"><Upload className="h-3.5 w-3.5 text-primary" />Cover photo <span className="text-muted-foreground text-[10px] ml-1">(shown to visitors on your page)</span></Label>
        <Input type="file" accept="image/*" onChange={(e) => onCoverFile(e.target.files?.[0] ?? null)} className="bg-black/40 border-white/10 mt-1" />
        {coverImageUrl && <img src={coverImageUrl} alt="" className="mt-2 rounded-xl max-h-28 w-full object-cover" />}
      </div>
      <div><Label>Description</Label><Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} className="bg-black/40 border-white/10" /></div>
      <Button type="submit" disabled={create.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">{create.isPending ? "Submitting…" : "Submit for review"}</Button>
    </form>
  );
}

function ProfileEditor({ vendor, onSaved }: { vendor: any; onSaved: () => void }) {
  const [businessName, setName] = useState(vendor.businessName);
  const [category, setCategory] = useState(vendor.category);
  const [description, setDescription] = useState(vendor.description);
  const [location, setLocation] = useState(vendor.location);
  const [bannerImage, setBanner] = useState(vendor.bannerImage);
  const [coverImageUrl, setCover] = useState(vendor.coverImageUrl ?? "");
  const [stateF, setStateF] = useState(vendor.state ?? "");
  const [city, setCity] = useState(vendor.city ?? "");
  const [country, setCountry] = useState(vendor.country ?? "India");
  const [eventTypes, setEventTypes] = useState<string[]>(vendor.eventTypes ?? []);
  const [budgetMin, setBudgetMin] = useState<number>(Number(vendor.budgetMin ?? 0));
  const [budgetMax, setBudgetMax] = useState<number>(Number(vendor.budgetMax ?? 0));
  const [portfolio, setPortfolio] = useState((vendor.portfolioImages ?? []).join("\n"));
  const update = useUpdateMyVendor();
  const { toast } = useToast();

  const toggleType = (t: string) =>
    setEventTypes((arr) => arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      {
        data: {
          businessName, category, description, location, bannerImage,
          portfolioImages: portfolio.split("\n").map((s: string) => s.trim()).filter(Boolean),
        },
      },
      {
        onSuccess: async () => {
          try {
            await apiPatch("/api/partner/profile", {
              eventTypes, budgetMin, budgetMax, state: stateF, city, country, coverImageUrl,
            });
          } catch {
            // silent
          }
          toast({ title: "Profile updated" });
          onSaved();
        },
        onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="grid lg:grid-cols-[1fr_auto] gap-6">
      <form onSubmit={submit} className="rounded-3xl glass-card-strong p-8 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div><Label>Business name</Label><Input value={businessName} onChange={(e) => setName(e.target.value)} className="bg-black/40 border-white/10" /></div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-black/40 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>City</Label><Input value={city} onChange={(e) => setCity(e.target.value)} className="bg-black/40 border-white/10" /></div>
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
          <div><Label>Country</Label><Input value={country} onChange={(e) => setCountry(e.target.value)} className="bg-black/40 border-white/10" /></div>
          <div><Label>Location label</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} className="bg-black/40 border-white/10" /></div>
        </div>
        <div>
          <Label className="flex items-center gap-1.5"><Upload className="h-3.5 w-3.5 text-primary" />Profile banner image</Label>
          <Input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              try { setBanner(await fileToDataUrl(f)); } catch { /* ignore */ }
            }}
            className="bg-black/40 border-white/10 mt-1"
          />
          {bannerImage && <img src={bannerImage} alt="" className="mt-2 rounded-xl max-h-24 object-cover" />}
        </div>
        <div>
          <Label className="flex items-center gap-1.5"><Upload className="h-3.5 w-3.5 text-primary" />Cover photo <span className="text-muted-foreground text-[10px] ml-1">(full-width hero shown to visitors)</span></Label>
          <Input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              try { setCover(await fileToDataUrl(f)); } catch { /* ignore */ }
            }}
            className="bg-black/40 border-white/10 mt-1"
          />
          {coverImageUrl && <img src={coverImageUrl} alt="" className="mt-2 rounded-xl max-h-24 w-full object-cover" />}
        </div>
        <div>
          <Label>Description</Label>
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="bg-black/40 border-white/10" />
        </div>
        <div>
          <Label>Event types you serve</Label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {["Wedding","Birthday","Corporate","Cultural","Festival","Concert","Private","Brand Activation"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  eventTypes.includes(t)
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "border-white/10 text-white/60 hover:bg-white/5"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Min budget (₹)</Label>
            <Input type="number" min={0} value={budgetMin} onChange={(e) => setBudgetMin(Number(e.target.value))} className="bg-black/40 border-white/10" />
          </div>
          <div>
            <Label>Max budget (₹)</Label>
            <Input type="number" min={0} value={budgetMax} onChange={(e) => setBudgetMax(Number(e.target.value))} className="bg-black/40 border-white/10" />
          </div>
        </div>
        <div>
          <Label>Portfolio image URLs (one per line)</Label>
          <Textarea rows={5} value={portfolio} onChange={(e) => setPortfolio(e.target.value)} className="bg-black/40 border-white/10" />
        </div>
        <Button type="submit" disabled={update.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">
          {update.isPending ? "Saving…" : "Save profile"}
        </Button>
      </form>
      <aside className="rounded-3xl glass-card p-6 lg:w-72 h-fit space-y-3">
        <div className="aspect-video bg-muted rounded-xl overflow-hidden">
          {bannerImage && <img src={bannerImage} alt="" className="h-full w-full object-cover" />}
        </div>
        <p className="font-serif text-xl">{businessName}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={vendor.status === "approved" ? "default" : "secondary"}>{vendor.status}</Badge>
          <Badge variant="outline">{category}</Badge>
          {vendor.isPremium && <Badge className="bg-primary text-primary-foreground border-0">Premium</Badge>}
        </div>
        {(city || stateF) && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {city}{stateF && `, ${stateF}`}
          </p>
        )}
        {budgetMin > 0 && budgetMax > 0 && (
          <p className="text-xs text-muted-foreground">{formatINR(budgetMin)} – {formatINR(budgetMax)}</p>
        )}
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
        <Button onClick={() => { setShow((s) => !s); setEditingId(null); }} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">
          {showForm ? "Close" : "+ New listing"}
        </Button>
      </div>

      {(hasPub || hasNonPub) && (
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-xs text-muted-foreground">
          {hasPub
            ? "Your profile is set up for pubs — only pub listings can be added."
            : "Your profile is set up for events — pubs can't be added alongside other types."}
        </div>
      )}

      {showForm && (
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
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(vendor.category);
  const [type, setType] = useState<string>(lockedType ?? "event");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState(vendor.city ?? "");
  const [stateF, setStateF] = useState(vendor.state ?? "");
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
      title, description, category,
      location: `${city}${stateF ? ", " + stateF : ""}`,
      price: type === "pub" && enableTickets ? Math.min(...[priceWomen, priceMen, priceCouple].filter((n) => n > 0).concat([price || 0])) : price,
      capacity, imageUrl,
      type, city, state: stateF, country: "India",
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
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label>Type</Label>
          <Select value={type} onValueChange={setType} disabled={!!lockedType}>
            <SelectTrigger className="bg-black/40 border-white/10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVENT_KIND.map((k) => <SelectItem key={k} value={k}>{k === "event" ? "Event" : "Pub / Lounge"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Title</Label>
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} className="bg-black/40 border-white/10" />
        </div>
        <div>
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="bg-black/40 border-white/10"><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="flex items-center gap-1.5"><Upload className="h-3.5 w-3.5 text-primary" />Listing image (cover)</Label>
          <Input type="file" accept="image/*" onChange={(e) => onImageFile(e.target.files?.[0] ?? null)} className="bg-black/40 border-white/10" />
          {imageUrl && <img src={imageUrl} alt="" className="mt-2 rounded-xl max-h-28 object-cover" />}
        </div>
        <div><Label>City</Label><Input value={city} onChange={(e) => setCity(e.target.value)} className="bg-black/40 border-white/10" /></div>
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
        {type !== "pub" && (
          <div><Label>Price (₹ per person)</Label><Input type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="bg-black/40 border-white/10" /></div>
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
      await apiPatch(`/api/events/${event.id}`, {
        title, description, imageUrl, capacity,
        price, galleryImages, galleryVideos,
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
          <h3 className="font-serif text-xl mb-3 flex items-center gap-2">
            Pending requests
            <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full px-2 py-0.5">{pending.length}</span>
          </h3>
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

function MediaManager() {
  const [items, setItems] = useState<Media[]>([]);
  const [type, setType] = useState<"photo" | "video">("photo");
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const { toast } = useToast();

  const load = () => apiGet<Media[]>("/api/partner/media/me").then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiPost("/api/partner/media", { type, url, caption, eventCategories: cats });
      toast({ title: "Media added" });
      setUrl(""); setCaption(""); setCats([]);
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  const toggleCat = (c: string) =>
    setCats((arr) => arr.includes(c) ? arr.filter((x) => x !== c) : [...arr, c]);

  return (
    <div className="grid lg:grid-cols-[1fr_1.4fr] gap-6">
      <form onSubmit={submit} className="rounded-3xl glass-card-strong p-6 space-y-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          <p className="font-serif text-xl">Add photo or video</p>
        </div>
        <div>
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as any)}>
            <SelectTrigger className="bg-black/40 border-white/10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="photo">Photo</SelectItem>
              <SelectItem value="video">Video</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>URL</Label>
          <Input required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="bg-black/40 border-white/10" />
        </div>
        <div>
          <Label>Caption</Label>
          <Input value={caption} onChange={(e) => setCaption(e.target.value)} className="bg-black/40 border-white/10" />
        </div>
        <div>
          <Label>Tag event categories &amp; budget</Label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {[...EVENT_CATEGORIES, ...BUDGET_RANGES.map((b) => b.label)].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleCat(c)}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  cats.includes(c) ? "bg-primary/20 border-primary/50 text-primary" : "border-white/10 text-white/60 hover:bg-white/5"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">Upload</Button>
      </form>
      <div className="rounded-3xl glass-card p-6">
        <p className="font-serif text-xl mb-3">Your gallery</p>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No media yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {items.map((m) => (
              <div key={m.id} className="relative rounded-xl overflow-hidden border border-white/10 group">
                {m.type === "photo" ? (
                  <img src={m.url} alt={m.caption} className="aspect-square object-cover w-full" />
                ) : (
                  <div className="aspect-square bg-black/40 flex items-center justify-center">
                    <Video className="h-8 w-8 text-primary" />
                  </div>
                )}
                <button
                  className="absolute top-1 right-1 bg-black/70 hover:bg-destructive/80 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition"
                  onClick={() => apiDelete(`/api/partner/media/${m.id}`).then(load)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                {m.caption && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-[10px] text-white truncate">
                    {m.caption}
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

function LeadsPanel({ isPremium }: { isPremium: boolean }) {
  const [data, setData] = useState<Lead | null>(null);
  useEffect(() => {
    apiGet<Lead>("/api/partner/leads/me").then(setData).catch(() => {});
  }, []);

  if (!isPremium) {
    return (
      <div className="rounded-3xl glass-card-strong p-10 text-center red-ring">
        <Crown className="h-10 w-10 text-primary mx-auto mb-4" />
        <p className="font-serif text-3xl mb-2">Leads &amp; CRM is a Premium feature</p>
        <p className="text-muted-foreground mb-6">Subscribe to Partner Premium ({formatINR(999)}/mo) to unlock who's viewing your profile and conversion analytics.</p>
        <a href="/subscription"><Button className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">Upgrade to Premium</Button></a>
      </div>
    );
  }

  if (!data) return <p className="text-muted-foreground">Loading…</p>;
  if (!data.premium) {
    return (
      <div className="rounded-3xl glass-card p-10 text-center">
        <p className="font-serif text-2xl mb-2">{data.message ?? "Subscribe to Partner Premium"}</p>
      </div>
    );
  }

  const totalViews = data.views.length;
  const known = data.views.filter((v: any) => v.viewerUserId).length;
  const conv = totalViews ? Math.round((known / totalViews) * 100) : 0;

  return (
    <div className="space-y-6">
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
