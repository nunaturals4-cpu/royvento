import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { getIndianPhoneError, normalizeIndianPhone, isAllowedImageMime, ALLOWED_IMAGE_MIME } from "@workspace/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { apiPatch, apiGet, apiPost, fileToDataUrl } from "@/lib/api";
import { CalendarCheck, Sparkles, Tag, Crown, Gift, Sparkle, Copy, Upload, Bell, ScanLine, Share2, TrendingUp, TrendingDown, Coins } from "lucide-react";

interface VendorRequest {
  id: number;
  status: "pending" | "approved" | "rejected";
  businessName: string;
  category: string;
  createdAt: string;
}

interface Coupon {
  id: number;
  code: string;
  discountPercent: number;
  used: boolean;
  source: string | null;
  vendorId: number | null;
  vendorName: string | null;
}
interface Sub { planType: string; planPeriod: string; status: string; expiresAt: string; }
interface ReferralData {
  code: string;
  points: number;
  referrals: { id: number; referredName: string; referredEmail: string; status: string; pointsAwarded: number; createdAt: string }[];
}
interface DiscountInfo { isNewUser: boolean; daysLeft: number; bookingDiscountPercent: number; subscriptionDiscountPercent: number; points: number; }
interface PointsHistoryEntry { key: string; type: "earned" | "spent"; points: number; label: string; date: string; }
interface PointsHistory { balance: number; history: PointsHistoryEntry[]; }

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
  const [phoneError, setPhoneError] = useState<string | undefined>(undefined);
  const phoneRef = useRef<HTMLInputElement>(null);
  const [request, setRequest] = useState<VendorRequest | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [sub, setSub] = useState<Sub | null>(null);
  const [referrals, setReferrals] = useState<ReferralData | null>(null);
  const [discountInfo, setDiscountInfo] = useState<DiscountInfo | null>(null);
  const [invitations, setInvitations] = useState<{ id: number; vendorName: string; createdAt: string }[]>([]);
  const [actingInv, setActingInv] = useState<number | null>(null);
  const [pointsHistory, setPointsHistory] = useState<PointsHistory | null>(null);


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
    apiGet<ReferralData>("/api/referrals/me").then(setReferrals).catch(() => {});
    apiGet<DiscountInfo>("/api/users/me/discounts").then(setDiscountInfo).catch(() => {});
    apiGet<{ id: number; vendorName: string; createdAt: string }[]>("/api/manager/invitations").then(setInvitations).catch(() => {});
    apiGet<PointsHistory>("/api/users/me/points-history").then(setPointsHistory).catch(() => {});
  }, [user]);

  const handleProfileFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!isAllowedImageMime(f.type)) {
      toast({
        title: "Unsupported image type",
        description: `Please upload a ${ALLOWED_IMAGE_MIME.map((m) => m.replace("image/", "").toUpperCase()).join(", ")} image.`,
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 2 MB.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    try {
      const url = await fileToDataUrl(f);
      setProfileImage(url);
      toast({ title: "Image ready — click Save changes." });
    } catch {
      toast({ title: "Could not read image", variant: "destructive" });
    }
  };

  const copyReferral = async () => {
    if (!referrals?.code) return;
    const url = `${window.location.origin}${import.meta.env.BASE_URL}register?ref=${referrals.code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Referral link copied" });
    } catch {
      toast({ title: "Copy failed", description: url });
    }
  };

  const shareReferral = async () => {
    if (!referrals?.code) return;
    const url = `${window.location.origin}${import.meta.env.BASE_URL}register?ref=${referrals.code}`;
    const text = `Join me on Royvento and get rewards! Sign up with my link: ${url}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Join Royvento", text, url });
        toast({ title: "Shared!" });
      } catch {
        // user cancelled — no-op
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "Referral link copied" });
      } catch {
        toast({ title: "Copy failed", description: url });
      }
    }
  };

  const respondToInvitation = async (id: number, action: "accept" | "reject") => {
    setActingInv(id);
    try {
      await apiPost(`/api/manager/invitations/${id}/${action}`, {});
      toast({ title: action === "accept" ? "Invitation accepted! You can now scan tickets." : "Invitation declined." });
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
    } catch {
      toast({ title: "Error", description: "Failed to respond to invitation.", variant: "destructive" });
    } finally {
      setActingInv(null);
    }
  };

  if (!user) {
    return <div className="container mx-auto px-4 md:px-6 py-20">Loading…</div>;
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const phoneErr = getIndianPhoneError(phone, { required: false });
    setPhoneError(phoneErr ?? undefined);
    if (phoneErr) { phoneRef.current?.focus(); return; }
    const normalizedPhone = phone.trim() ? normalizeIndianPhone(phone) : "";
    setSaving(true);
    try {
      await apiPatch("/api/users/me", { name, phone: normalizedPhone, about, profileImage });
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
            <div>
              <Label htmlFor="pphone">Phone <span className="text-muted-foreground font-normal text-xs">(used for WhatsApp confirmations)</span></Label>
              <Input ref={phoneRef} id="pphone" type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); if (phoneError) setPhoneError(undefined); }} aria-invalid={!!phoneError} placeholder="+91 …" className="bg-black/40 border-white/10" />
              {phoneError && <p className="text-xs text-destructive mt-1">{phoneError}</p>}
            </div>
          </div>
          <div>
            <Label htmlFor="ppic">Profile picture</Label>
            <div className="flex items-center gap-3 mt-1">
              <Avatar className="h-12 w-12 border border-white/10">
                {profileImage ? <AvatarImage src={profileImage} /> : null}
                <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <label className="inline-flex items-center gap-2 px-3 h-10 rounded-md border border-white/15 cursor-pointer text-sm hover:bg-white/5">
                <Upload className="h-4 w-4" /> Upload image
                <input id="ppic" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleProfileFile} />
              </label>
              {profileImage && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setProfileImage("")}>
                  Remove
                </Button>
              )}
            </div>
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
          {invitations.length > 0 && (
            <div className="rounded-3xl glass-card-strong p-6 border border-primary/30 red-ring">
              <div className="flex items-center gap-2 mb-3">
                <Bell className="h-5 w-5 text-primary" />
                <h2 className="font-serif text-lg">Scanner invitations</h2>
              </div>
              <div className="space-y-3">
                {invitations.map((inv) => (
                  <div key={inv.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <p className="text-sm font-medium mb-0.5">{inv.vendorName}</p>
                    <p className="text-xs text-muted-foreground mb-3">Invited you as a ticket scanner manager</p>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={actingInv === inv.id} onClick={() => respondToInvitation(inv.id, "accept")}
                        className="flex-1 bg-gradient-to-br from-red-600 to-red-800 border-0 text-xs">Accept</Button>
                      <Button size="sm" variant="outline" disabled={actingInv === inv.id} onClick={() => respondToInvitation(inv.id, "reject")}
                        className="flex-1 border-white/10 text-muted-foreground text-xs">Decline</Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button asChild variant="ghost" size="sm" className="mt-2 w-full text-xs text-muted-foreground">
                <Link href="/dashboard/vendor/scanner"><ScanLine className="h-3 w-3 mr-1" />Open ticket scanner</Link>
              </Button>
            </div>
          )}
          {discountInfo?.isNewUser && (
            <div className="rounded-3xl glass-card-strong p-6 red-ring border border-primary/30">
              <div className="flex items-center gap-2 mb-2">
                <Sparkle className="h-5 w-5 text-primary" />
                <h2 className="font-serif text-lg">Welcome perks</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                You're a new member! Enjoy these for the next {discountInfo.daysLeft} day{discountInfo.daysLeft === 1 ? "" : "s"}:
              </p>
              <ul className="mt-3 text-sm space-y-1">
                <li>• <span className="text-primary font-medium">{discountInfo.bookingDiscountPercent}% off</span> any booking</li>
                <li>• <span className="text-primary font-medium">{discountInfo.subscriptionDiscountPercent}% off</span> a subscription plan</li>
              </ul>
            </div>
          )}
          {pointsHistory && (
            <div className="rounded-3xl glass-card-strong p-6">
              <div className="flex items-center gap-2 mb-2">
                <Coins className="h-5 w-5 text-primary" />
                <h2 className="font-serif text-lg">Points history</h2>
              </div>
              <div className="flex items-center justify-between text-sm mb-4">
                <span className="text-muted-foreground">Balance <span className="text-xs opacity-60">(100 pts = ₹10)</span></span>
                <span className="font-semibold text-primary">{pointsHistory.balance} pts</span>
              </div>
              {pointsHistory.history.length === 0 ? (
                <p className="text-xs text-muted-foreground">No points activity yet. Refer friends to earn points!</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {pointsHistory.history.slice(0, 20).map((entry) => (
                    <div key={entry.key} className="flex items-center justify-between text-xs border-b border-white/5 pb-1.5 last:border-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {entry.type === "earned"
                          ? <TrendingUp className="h-3 w-3 text-green-400 shrink-0" />
                          : <TrendingDown className="h-3 w-3 text-amber-400 shrink-0" />}
                        <span className="truncate text-muted-foreground">{entry.label}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={entry.type === "earned" ? "text-green-400 font-medium" : "text-amber-400 font-medium"}>
                          {entry.type === "earned" ? "+" : "-"}{entry.points} pts
                        </span>
                        <span className="text-muted-foreground/60">{new Date(entry.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {referrals && (
            <div className="rounded-3xl glass-card-strong p-6">
              <div className="flex items-center gap-2 mb-2">
                <Gift className="h-5 w-5 text-primary" />
                <h2 className="font-serif text-lg">Refer &amp; earn</h2>
              </div>
              <p className="text-xs text-muted-foreground">Share your code — you both get 50 pts (₹5) when they make their first paid booking.</p>
              <div className="mt-3 flex items-center gap-2">
                <code className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 font-mono text-sm tracking-wider flex-1 text-center">{referrals.code}</code>
                <Button size="icon" variant="outline" onClick={copyReferral} aria-label="Copy referral link">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" onClick={shareReferral} aria-label="Share referral link">
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Points balance <span className="text-xs opacity-60">(100 pts = ₹10)</span></span>
                <span className="font-semibold text-primary">{referrals.points} pts</span>
              </div>
              {referrals.referrals.length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/5 space-y-1.5">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Recent referrals</p>
                  {referrals.referrals.slice(0, 4).map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-xs">
                      <span className="truncate">{r.referredName || r.referredEmail}</span>
                      <Badge variant={r.status === "completed" ? "default" : "outline"} className="text-[10px]">
                        {r.status === "completed" ? `+${r.pointsAwarded}` : r.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
              <div className="space-y-2">
                {coupons.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-3 border-b border-white/5 pb-2 last:border-0">
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-red-200 block">{c.code}</span>
                      {c.vendorName && c.vendorId && (
                        <Link href={`/vendors/${c.vendorId}`}>
                          <span className="text-[10px] text-primary/80 hover:text-primary mt-0.5 block underline underline-offset-2 cursor-pointer">
                            Exclusive to {c.vendorName} ↗
                          </span>
                        </Link>
                      )}
                    </div>
                    <Badge variant={c.used ? "outline" : "default"} className="shrink-0">
                      {c.used ? "used" : `${c.discountPercent}% off`}
                    </Badge>
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
