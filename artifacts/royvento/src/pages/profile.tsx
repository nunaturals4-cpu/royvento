import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { apiPatch, apiGet } from "@/lib/api";
import { CalendarCheck, Sparkles } from "lucide-react";

interface VendorRequest {
  id: number;
  status: "pending" | "approved" | "rejected";
  businessName: string;
  category: string;
  createdAt: string;
}

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

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
    setAbout(user.about ?? "");
    setProfileImage(user.profileImage ?? "");
  }, [user]);

  useEffect(() => {
    if (!user) return;
    apiGet<{ request: VendorRequest | null }>("/api/vendor-requests/me")
      .then((r) => setRequest(r.request))
      .catch(() => {});
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
    <div className="container mx-auto px-4 md:px-6 py-14 max-w-4xl">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">My account</p>
        <h1 className="font-serif text-4xl tracking-tight">Profile</h1>
        <p className="mt-2 text-muted-foreground">Manage your details and how vendors see you on Royvento.</p>
      </header>

      <div className="grid lg:grid-cols-[1fr_300px] gap-8">
        <form onSubmit={save} className="rounded-3xl border bg-card p-8 space-y-5">
          <div className="flex items-center gap-5 pb-4 border-b">
            <Avatar className="h-20 w-20 border border-primary/20">
              {profileImage ? <AvatarImage src={profileImage} /> : null}
              <AvatarFallback className="bg-primary/10 text-primary text-2xl font-serif">
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
            <div><Label htmlFor="pname">Full name</Label><Input id="pname" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label htmlFor="pphone">Phone</Label><Input id="pphone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 123-4567" /></div>
          </div>
          <div>
            <Label htmlFor="ppic">Profile picture URL</Label>
            <Input id="ppic" value={profileImage} onChange={(e) => setProfileImage(e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <Label htmlFor="pabout">About you</Label>
            <Textarea id="pabout" rows={4} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Tell vendors a bit about yourself, the kinds of events you host…" />
          </div>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </form>

        <aside className="space-y-4">
          {user.role === "user" && (
            <div className="rounded-3xl border bg-card p-6">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="font-serif text-lg">Become a vendor</h2>
              </div>
              {request?.status === "pending" ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Your request to become a vendor is awaiting admin review.
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
                    Want to list your own events? Apply for a vendor account. An admin will review your request.
                  </p>
                  <Button asChild className="mt-4 w-full">
                    <Link href="/dashboard/become-vendor">Apply now</Link>
                  </Button>
                </>
              )}
            </div>
          )}
          {user.role === "vendor" && (
            <div className="rounded-3xl border bg-card p-6">
              <p className="text-sm text-muted-foreground">
                You're a vendor. Set up your team profile and event listings in the dashboard.
              </p>
              <Button asChild className="mt-4 w-full" onClick={() => setLocation("/dashboard/vendor")}>
                <Link href="/dashboard/vendor">Open vendor dashboard</Link>
              </Button>
            </div>
          )}
          <div className="rounded-3xl border bg-card p-6">
            <div className="flex items-center gap-2 mb-2">
              <CalendarCheck className="h-5 w-5 text-primary" />
              <h2 className="font-serif text-lg">My bookings</h2>
            </div>
            <p className="text-sm text-muted-foreground">View and track all your reserved events.</p>
            <Button asChild className="mt-4 w-full" variant="outline">
              <Link href="/dashboard/bookings">View bookings</Link>
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
