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
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Users, Briefcase, CalendarCheck, DollarSign, Clock, Mail, UserPlus } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/api";

export function AdminPanel() {
  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Admin</p>
        <h1 className="font-serif text-4xl tracking-tight">Royvento control room</h1>
      </header>

      <Tabs defaultValue="analytics" className="space-y-6">
        <TabsList className="bg-card flex-wrap h-auto">
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="vendors">Vendor approvals</TabsTrigger>
          <TabsTrigger value="requests">Vendor requests</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="analytics"><Analytics /></TabsContent>
        <TabsContent value="vendors"><PendingVendors /></TabsContent>
        <TabsContent value="requests"><VendorRequests /></TabsContent>
        <TabsContent value="messages"><Messages /></TabsContent>
        <TabsContent value="users"><UsersPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Icon className="h-4 w-4" /></div>
      </div>
      <p className="font-serif text-3xl tracking-tight">{value}</p>
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
        <Stat icon={Briefcase} label="Vendors" value={String(data.totalVendors)} />
        <Stat icon={Clock} label="Pending" value={String(data.pendingVendors)} />
        <Stat icon={CalendarCheck} label="Bookings" value={String(data.totalBookings)} />
        <Stat icon={DollarSign} label="Revenue" value={`$${data.totalRevenue.toLocaleString()}`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border bg-card p-6">
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

        <div className="rounded-2xl border bg-card p-6">
          <h3 className="font-serif text-xl mb-4">Top vendors</h3>
          <div className="space-y-3">
            {data.topVendors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : data.topVendors.map((v) => (
              <div key={v.vendorId} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                <span className="font-medium">{v.businessName}</span>
                <span className="text-muted-foreground">{v.bookingCount} bookings · ${v.revenue.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <h3 className="font-serif text-xl mb-4">Recent bookings</h3>
        <div className="space-y-2">
          {data.recentBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          ) : data.recentBookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
              <div>
                <span className="font-medium">{b.eventTitle}</span>
                <span className="text-muted-foreground"> · {b.userName}</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="secondary">{b.status}</Badge>
                <span className="text-muted-foreground">${b.totalPrice.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PendingVendors() {
  const { data: pending = [], refetch } = useListPendingVendors();
  const approve = useApproveVendor();
  const reject = useRejectVendor();
  const { toast } = useToast();

  if (pending.length === 0) return <p className="text-muted-foreground">No vendors awaiting approval. 🎉</p>;
  return (
    <div className="space-y-4">
      {pending.map((v) => (
        <div key={v.id} className="rounded-2xl border bg-card overflow-hidden flex flex-col md:flex-row">
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
                    onSuccess: () => { toast({ title: "Vendor approved" }); refetch(); },
                    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
                  })
                }
              >Approve</Button>
              <Button
                variant="outline"
                onClick={() =>
                  reject.mutate({ vendorId: v.id }, {
                    onSuccess: () => { toast({ title: "Vendor rejected" }); refetch(); },
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

const ROLES = ["user", "vendor", "admin"] as const;

function UsersPanel() {
  const { data: users = [], refetch } = useListUsers();
  const updateRole = useUpdateUserRole();
  const del = useDeleteUser();
  const { toast } = useToast();

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left p-4">Name</th>
            <th className="text-left p-4">Email</th>
            <th className="text-left p-4">Role</th>
            <th className="text-right p-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t">
              <td className="p-4 font-medium">{u.name}</td>
              <td className="p-4 text-muted-foreground">{u.email}</td>
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
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
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
  if (items.length === 0) return <p className="text-muted-foreground">No vendor requests yet.</p>;

  const act = async (id: number, action: "approve" | "reject") => {
    try {
      await apiPost(`/api/admin/vendor-requests/${id}/${action}`);
      toast({ title: action === "approve" ? "Request approved" : "Request rejected", description: action === "approve" ? "User has been promoted to vendor." : undefined });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {items.map((r) => (
        <div key={r.id} className="rounded-2xl border bg-card p-6">
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
                <Button onClick={() => act(r.id, "approve")}>Approve & promote</Button>
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
      <div className="rounded-2xl border bg-card p-10 text-center">
        <Mail className="h-8 w-8 text-primary mx-auto mb-3" />
        <p className="text-muted-foreground">No contact messages right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((m) => (
        <div key={m.id} className="rounded-2xl border bg-card p-6">
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
              <Button onClick={() => remove(m.id, "Marked resolved")}>Resolved</Button>
              <Button variant="outline" onClick={() => remove(m.id, "Cancelled")}>Cancel</Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
