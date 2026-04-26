import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { apiPatch, apiGet } from "@/lib/api";
import { CalendarCheck, Sparkles, Tag, Crown } from "lucide-react";

interface VendorRequest {
  id: number;
  status: "pending" | "approved" | "rejected";
  businessName: string;
  category: string;
  createdAt: string;
}

interface Coupon { id: number; code: string; discountPercent: number; isUsed: boolean; }
interface Sub { planType: string; planPeriod: string; status: string; expiresAt: string; }

export function Profile() {
  const { data: me, refetch } = useGetMe({ query: { retry: false } as any });
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const user = me?.user as any;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [about, setAbout] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [request, setRequest] = useState<VendorRequest | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [sub, setSub] = useState<Sub | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
    setAbout(user.about ?? "");
    setProfileImage(user.profileImage ?? "");
    apiGet<{ request: VendorRequest | null }>("/api/vendor-requests/me")
      .then((r) => setRequest(r.request))
      .catch(() => {});
    apiGet<Coupon[]>("/api/coupons/me").then(setCoupons).catch(() => {});
    apiGet<Sub | null>("/api/subscriptions/me").then(setSub).catch(() => {});
  }, [user]);

  if (!user) {
    return <div className="container mx-auto px-4 md:px-6 py-20">Loading…</div>;
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPatch("/api/users/me", { name, phone, about, profileImage });
      qc.invalidateQueries();
      await refetch();
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-14 max-w-5xl">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-2 accent-underline inline-block">My account</p>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-3">Profile</h1>
        <p className="mt-2 text-muted-foreground">Manage your details, coupons, and subscription.</p>
      </header>

      <div className="grid lg:grid-cols-[1fr_320px] gap-8">
        <form onSubmit={save} className="rounded-3xl glass-card-strong p-8 space-y-5">
          <div className="flex items-center gap-5 pb-4 border-b border-white/10">
            <Avatar className="h-20 w-20 border border-primary/40 ring-2 ring-primary/10">
              {profileImage ? <AvatarImage src={profileImage} /> : null}
              <AvatarFallback className="bg-gradient-to-br from-red-600 to-red-900 text-white text-2xl font-serif">
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-serif text-xl">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <p className="text-xs uppercase tracking-wider text-primary mt-1">{user.role}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><Label htmlFor="pname">Full name</Label><Input id="pname" value={name} onChange={(e) => setName(e.target.value)} className="bg-black/40 border-white/10" /></div>
            <div><Label htmlFor="pphone">Phone</Label><Input id="pphone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" className="bg-black/40 border-white/10" /></div>
          </div>
          <div>
            <Label htmlFor="ppic">Profile picture URL</Label>
            <Input id="ppic" value={profileImage} onChange={(e) => setProfileImage(e.target.value)} placeholder="https://…" className="bg-black/40 border-white/10" />
          </div>
          <div>
            <Label htmlFor="pabout">About you</Label>
            <Textarea id="pabout" rows={4} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Tell partners a bit about yourself…" className="bg-black/40 border-white/10" />
          </div>
          <Button type="submit" disabled={saving} className="bg-gradient-to-br from-red-600 to-red-800 border-0">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>

        <aside className="space-y-4">
          {sub && (
            <div className="rounded-3xl glass-card-strong p-6 red-ring">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="h-5 w-5 text-primary" />
                <h2 className="font-serif text-lg">Premium</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {sub.planType === "user" ? "Royvento Member" : "Royvento Partner Premium"} · {sub.planPeriod}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Renews {new Date(sub.expiresAt).toLocaleDateString()}</p>
              <Button asChild className="mt-3 w-full" variant="outline">
                <Link href="/subscription">Manage</Link>
              </Button>
            </div>
          )}
          {!sub && (
            <div className="rounded-3xl glass-card p-6">
              <Crown className="h-5 w-5 text-primary mb-2" />
              <h2 className="font-serif text-lg">Go Premium</h2>
              <p className="text-sm text-muted-foreground mt-1">Members get 10% off and early access.</p>
              <Button asChild className="mt-3 w-full bg-gradient-to-br from-red-600 to-red-800 border-0">
                <Link href="/subscription">See plans</Link>
              </Button>
            </div>
          )}

          <div className="rounded-3xl glass-card p-6">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="h-5 w-5 text-primary" />
              <h2 className="font-serif text-lg">My coupons</h2>
            </div>
            {coupons.length === 0 ? (
              <p className="text-sm text-muted-foreground">No coupons yet.</p>
            ) : (
              <div className="space-y-1.5">
                {coupons.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm border-b border-white/5 pb-1.5 last:border-0">
                    <span className="font-mono text-xs text-red-200">{c.code}</span>
                    <Badge variant={c.isUsed ? "outline" : "default"}>{c.isUsed ? "used" : `${c.discountPercent}% off`}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {user.role === "user" && (
            <div className="rounded-3xl glass-card p-6">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="font-serif text-lg">Become a partner</h2>
              </div>
              {request?.status === "pending" ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Your request is awaiting admin review.
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Submitted as <span className="font-medium text-foreground">{request.businessName}</span> ({request.category}).
                  </p>
                </>
              ) : request?.status === "rejected" ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Your previous request was declined. You can submit a new one.
                  </p>
                  <Button asChild className="mt-4 w-full" variant="outline">
                    <Link href="/dashboard/become-vendor">Apply again</Link>
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    List your studio, venue, or services on Royvento.
                  </p>
                  <Button asChild className="mt-4 w-full bg-gradient-to-br from-red-600 to-red-800 border-0">
                    <Link href="/dashboard/become-vendor">Apply now</Link>
                  </Button>
                </>
              )}
            </div>
          )}
          {user.role === "vendor" && (
            <div className="rounded-3xl glass-card p-6">
              <p className="text-sm text-muted-foreground">
                You're a partner. Manage your studio profile and listings.
              </p>
              <Button asChild className="mt-4 w-full bg-gradient-to-br from-red-600 to-red-800 border-0" onClick={() => setLocation("/dashboard/partner")}>
                <Link href="/dashboard/partner">Open partner dashboard</Link>
              </Button>
            </div>
          )}
          <div className="rounded-3xl glass-card p-6">
            <div className="flex items-center gap-2 mb-2">
              <CalendarCheck className="h-5 w-5 text-primary" />
              <h2 className="font-serif text-lg">My bookings</h2>
            </div>
            <p className="text-sm text-muted-foreground">Track every event you've reserved.</p>
            <Button asChild className="mt-4 w-full" variant="outline">
              <Link href="/dashboard/bookings">View bookings</Link>
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
