import {
  useGetAdminAnalytics,
  useListPendingVendors,
  useApproveVendor,
  useRejectVendor,
  useListUsers,
  useUpdateUserRole,
  useDeleteUser,
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
  Tag, Megaphone, Trash2, Crown, IndianRupee, CheckCircle, XCircle,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost, apiDelete, apiPatch, formatINR } from "@/lib/api";

export function AdminPanel() {
  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-2 accent-underline inline-block">Admin</p>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-3">Royvento control room</h1>
      </header>

      <Tabs defaultValue="analytics" className="space-y-6">
        <TabsList className="bg-card flex-wrap h-auto p-1 gap-1">
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="vendors">Partner approvals</TabsTrigger>
          <TabsTrigger value="requests">Partner requests</TabsTrigger>
          <TabsTrigger value="booking-requests">Booking Requests</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="coupons">Coupons</TabsTrigger>
          <TabsTrigger value="ads">Ads</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="analytics"><Analytics /></TabsContent>
        <TabsContent value="vendors"><PendingVendors /></TabsContent>
        <TabsContent value="requests"><VendorRequests /></TabsContent>
        <TabsContent value="booking-requests"><BookingRequestsAdmin /></TabsContent>
        <TabsContent value="events"><EventsAdmin /></TabsContent>
        <TabsContent value="subscriptions"><SubscriptionsAdmin /></TabsContent>
        <TabsContent value="coupons"><CouponsAdmin /></TabsContent>
        <TabsContent value="ads"><AdsAdmin /></TabsContent>
        <TabsContent value="messages"><Messages /></TabsContent>
        <TabsContent value="users"><UsersPanel /></TabsContent>
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

function Analytics() {
  const { data, isLoading } = useGetAdminAnalytics();
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!data) return null;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Stat icon={Users} label="Users" value={String(data.totalUsers)} />
        <Stat icon={Briefcase} label="Partners" value={String(data.totalVendors)} />
        <Stat icon={Clock} label="Pending" value={String(data.pendingVendors)} />
        <Stat icon={CalendarCheck} label="Bookings" value={String(data.totalBookings)} />
        <Stat icon={IndianRupee} label="Revenue" value={formatINR(data.totalRevenue)} />
      </div>

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
            <div className="flex gap-2 shrink-0">
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

function PendingVendors() {
  const { data: pending = [], refetch } = useListPendingVendors();
  const approve = useApproveVendor();
  const reject = useRejectVendor();
  const { toast } = useToast();

  if (pending.length === 0) return <p className="text-muted-foreground">No partners awaiting approval.</p>;
  return (
    <div className="space-y-4">
      {pending.map((v) => (
        <div key={v.id} className="rounded-2xl glass-card overflow-hidden flex flex-col md:flex-row">
          {v.bannerImage && <div className="md:w-48 aspect-video md:aspect-auto bg-muted"><img src={v.bannerImage} alt="" className="h-full w-full object-cover" /></div>}
          <div className="flex-1 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <Badge variant="outline" className="mb-2">{v.category}</Badge>
              <p className="font-serif text-xl">{v.businessName}</p>
              <p className="text-sm text-muted-foreground">{v.location}</p>
              <p className="text-sm mt-2 max-w-xl text-muted-foreground">{v.description}</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  approve.mutate({ vendorId: v.id }, {
                    onSuccess: () => { toast({ title: "Partner approved" }); refetch(); },
                    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
                  })
                }
                className="bg-gradient-to-br from-red-600 to-red-800 border-0"
              >Approve</Button>
              <Button
                variant="outline"
                onClick={() =>
                  reject.mutate({ vendorId: v.id }, {
                    onSuccess: () => { toast({ title: "Partner rejected" }); refetch(); },
                  })
                }
              >Reject</Button>
            </div>
          </div>
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
  city: string;
  state: string;
  isPublished: boolean;
  popular: boolean;
  imageUrl: string;
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
            <th className="text-center p-3">Popular</th>
            <th className="text-right p-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id} className="border-t border-white/5">
              <td className="p-3 font-medium">{e.title}</td>
              <td className="p-3 text-muted-foreground">{e.vendorName}</td>
              <td className="p-3"><Badge variant="outline">{e.type}</Badge></td>
              <td className="p-3 text-muted-foreground">{e.city}{e.state ? `, ${e.state}` : ""}</td>
              <td className="p-3 text-right">{formatINR(e.price)}</td>
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
