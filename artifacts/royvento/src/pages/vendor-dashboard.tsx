import { useState } from "react";
import {
  useGetMyVendor,
  useCreateMyVendor,
  useUpdateMyVendor,
  useListMyVendorEvents,
  useCreateEvent,
  useDeleteEvent,
  useListVendorBookings,
  useUpdateBookingStatus,
  useListVendorAvailability,
  useSetAvailability,
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
import { Trash2, Calendar as CalIcon } from "lucide-react";

const CATEGORIES = ["Wedding", "Corporate", "Festival", "Private", "Birthday"];
const STATUSES = ["pending", "confirmed", "completed", "cancelled"] as const;

export function VendorDashboard() {
  const { data: vendorData, refetch: refetchVendor } = useGetMyVendor();
  const vendor = vendorData?.vendor ?? null;
  const { data: events = [], refetch: refetchEvents } = useListMyVendorEvents({ query: { enabled: !!vendor } as any });
  const { data: bookings = [], refetch: refetchBookings } = useListVendorBookings({ query: { enabled: !!vendor } as any });
  const { data: availability = [], refetch: refetchAvail } = useListVendorAvailability(vendor?.id ?? 0, { query: { enabled: !!vendor } as any });

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Vendor</p>
        <h1 className="font-serif text-4xl tracking-tight">Studio dashboard</h1>
      </header>

      {!vendor ? (
        <CreateVendorForm onCreated={refetchVendor} />
      ) : (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-card">
            <TabsTrigger value="overview">Profile</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <ProfileEditor vendor={vendor} onSaved={refetchVendor} />
          </TabsContent>

          <TabsContent value="events">
            <EventsManager
              vendor={vendor}
              events={events}
              refetchEvents={refetchEvents}
            />
          </TabsContent>

          <TabsContent value="bookings">
            <BookingsManager bookings={bookings} refetch={refetchBookings} />
          </TabsContent>

          <TabsContent value="availability">
            <AvailabilityManager availability={availability} refetch={refetchAvail} />
          </TabsContent>
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
  const create = useCreateMyVendor();
  const { toast } = useToast();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { data: { businessName, category, description, location, bannerImage, portfolioImages: [] } },
      {
        onSuccess: () => {
          toast({ title: "Vendor profile submitted!", description: "Awaiting admin approval." });
          onCreated();
        },
        onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <form onSubmit={submit} className="max-w-2xl rounded-3xl border bg-card p-8 space-y-4">
      <div>
        <h2 className="font-serif text-2xl">Create your vendor profile</h2>
        <p className="text-sm text-muted-foreground mt-1">Submit your studio for review. We'll approve and list you within 1–2 business days.</p>
      </div>
      <div><Label htmlFor="bn">Business name</Label><Input id="bn" required value={businessName} onChange={(e) => setName(e.target.value)} /></div>
      <div>
        <Label>Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label htmlFor="loc">Location</Label><Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
      <div><Label htmlFor="bi">Banner image URL</Label><Input id="bi" value={bannerImage} onChange={(e) => setBanner(e.target.value)} placeholder="https://..." /></div>
      <div><Label htmlFor="desc">Description</Label><Textarea id="desc" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <Button type="submit" disabled={create.isPending}>{create.isPending ? "Submitting…" : "Submit for review"}</Button>
    </form>
  );
}

function ProfileEditor({ vendor, onSaved }: { vendor: any; onSaved: () => void }) {
  const [businessName, setName] = useState(vendor.businessName);
  const [category, setCategory] = useState(vendor.category);
  const [description, setDescription] = useState(vendor.description);
  const [location, setLocation] = useState(vendor.location);
  const [bannerImage, setBanner] = useState(vendor.bannerImage);
  const [portfolio, setPortfolio] = useState((vendor.portfolioImages ?? []).join("\n"));
  const update = useUpdateMyVendor();
  const { toast } = useToast();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      {
        data: {
          businessName, category, description, location, bannerImage,
          portfolioImages: portfolio.split("\n").map((s: string) => s.trim()).filter(Boolean),
        },
      },
      {
        onSuccess: () => { toast({ title: "Profile updated" }); onSaved(); },
        onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="grid lg:grid-cols-[1fr_auto] gap-6">
      <form onSubmit={submit} className="rounded-3xl border bg-card p-8 space-y-4">
        <div><Label>Business name</Label><Input value={businessName} onChange={(e) => setName(e.target.value)} /></div>
        <div>
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
        <div><Label>Banner image URL</Label><Input value={bannerImage} onChange={(e) => setBanner(e.target.value)} /></div>
        <div><Label>Description</Label><Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div>
          <Label>Portfolio image URLs (one per line)</Label>
          <Textarea rows={5} value={portfolio} onChange={(e) => setPortfolio(e.target.value)} />
        </div>
        <Button type="submit" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save profile"}</Button>
      </form>
      <aside className="rounded-3xl border bg-card p-6 lg:w-72 h-fit space-y-3">
        <div className="aspect-video bg-muted rounded-xl overflow-hidden">
          {bannerImage && <img src={bannerImage} alt="" className="h-full w-full object-cover" />}
        </div>
        <p className="font-serif text-xl">{businessName}</p>
        <div className="flex items-center gap-2">
          <Badge variant={vendor.status === "approved" ? "default" : "secondary"}>{vendor.status}</Badge>
          <Badge variant="outline">{category}</Badge>
        </div>
      </aside>
    </div>
  );
}

function EventsManager({ vendor, events, refetchEvents }: { vendor: any; events: any[]; refetchEvents: () => void }) {
  const [showForm, setShow] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(vendor.category);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState(vendor.location);
  const [price, setPrice] = useState(0);
  const [capacity, setCapacity] = useState(50);
  const [imageUrl, setImageUrl] = useState("");
  const create = useCreateEvent();
  const del = useDeleteEvent();
  const { toast } = useToast();

  if (vendor.status !== "approved") {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center">
        <p className="font-serif text-2xl mb-2">Awaiting approval</p>
        <p className="text-muted-foreground">You'll be able to publish events once your vendor profile is approved.</p>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { data: { title, description, category, location, price, capacity, imageUrl } },
      {
        onSuccess: () => {
          toast({ title: "Event published" });
          setShow(false); setTitle(""); setDescription(""); setImageUrl(""); setPrice(0); setCapacity(50);
          refetchEvents();
        },
        onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="font-serif text-2xl">Your events</h2>
        <Button onClick={() => setShow((s) => !s)}>{showForm ? "Close" : "+ New event"}</Button>
      </div>
      {showForm && (
        <form onSubmit={submit} className="rounded-2xl border bg-card p-6 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div><Label>Title</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
            <div><Label>Image URL</Label><Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} /></div>
            <div><Label>Price ($)</Label><Input type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} /></div>
            <div><Label>Capacity</Label><Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} /></div>
          </div>
          <div><Label>Description</Label><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <Button type="submit" disabled={create.isPending}>Publish event</Button>
        </form>
      )}
      {events.length === 0 ? (
        <p className="text-muted-foreground">No events published yet.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {events.map((e: any) => (
            <div key={e.id} className="rounded-2xl border bg-card overflow-hidden flex">
              {e.imageUrl && <div className="w-32 bg-muted shrink-0"><img src={e.imageUrl} alt="" className="h-full w-full object-cover" /></div>}
              <div className="flex-1 p-4 flex flex-col justify-between">
                <div>
                  <Badge variant="secondary" className="mb-2">{e.category}</Badge>
                  <p className="font-serif text-lg">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{e.location}</p>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-sm font-medium">${e.price.toLocaleString()}</span>
                  <Button size="icon" variant="ghost" onClick={() => del.mutate({ eventId: e.id }, { onSuccess: () => refetchEvents() })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BookingsManager({ bookings, refetch }: { bookings: any[]; refetch: () => void }) {
  const update = useUpdateBookingStatus();
  const { toast } = useToast();
  if (bookings.length === 0) return <p className="text-muted-foreground">No bookings yet.</p>;
  return (
    <div className="space-y-4">
      {bookings.map((b) => (
        <div key={b.id} className="rounded-2xl border bg-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="font-serif text-lg">{b.eventTitle}</p>
            <p className="text-sm text-muted-foreground">{b.userName} · {b.userEmail}</p>
            <p className="text-sm mt-1">{b.bookingDate} · {b.guests} guests · ${b.totalPrice.toLocaleString()}</p>
            {b.notes && <p className="text-sm italic text-muted-foreground mt-1">"{b.notes}"</p>}
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={b.status}
              onValueChange={(v) =>
                update.mutate(
                  { bookingId: b.id, data: { status: v as any } },
                  {
                    onSuccess: () => { toast({ title: "Status updated" }); refetch(); },
                    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
                  },
                )
              }
            >
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      ))}
    </div>
  );
}

function AvailabilityManager({ availability, refetch }: { availability: any[]; refetch: () => void }) {
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<"available" | "booked" | "blocked">("blocked");
  const set = useSetAvailability();
  const { toast } = useToast();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    set.mutate(
      { data: { date, status } },
      {
        onSuccess: () => { toast({ title: "Availability set" }); setDate(""); refetch(); },
        onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <form onSubmit={submit} className="rounded-2xl border bg-card p-6 space-y-3">
        <h3 className="font-serif text-xl flex items-center gap-2"><CalIcon className="h-5 w-5 text-primary" />Set a date</h3>
        <div><Label>Date</Label><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={set.isPending}>Set date</Button>
      </form>
      <div className="rounded-2xl border bg-card p-6">
        <h3 className="font-serif text-xl mb-4">Calendar overview</h3>
        {availability.length === 0 ? (
          <p className="text-muted-foreground text-sm">No dates set yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-96 overflow-auto text-sm">
            {availability
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((a) => (
                <div key={a.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <span>{a.date}</span>
                  <Badge variant={a.status === "available" ? "default" : a.status === "booked" ? "secondary" : "outline"}>{a.status}</Badge>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
