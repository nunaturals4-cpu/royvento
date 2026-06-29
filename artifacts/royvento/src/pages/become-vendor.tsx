import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LocationSelect } from "@/components/LocationSelect";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPost } from "@/lib/api";
import { Sparkles, MapPin, CheckCircle2, Clock, AlertCircle, Phone } from "lucide-react";
import { Link } from "wouter";
import { useGetMe } from "@workspace/api-client-react";

// Roles that mean the account is an active partner. The "already a partner"
// screen keys off the live role — NOT a stale vendor_requests row — so a user
// whose partner profile was deleted by an admin (role reset to "user") always
// sees the application form again, even if an old "approved" request lingers.
const PARTNER_ROLES = new Set(["vendor", "organizer", "game_organizer"]);

interface VendorRequest {
  id: number;
  businessName: string;
  category: string;
  status: string;
  createdAt: string;
}

const VENUE_CATEGORIES = [
  "Pub",
  "Club",
  "Pub & Club",
  "Event Organizer",
  "Game Organizer",
] as const;

export function BecomeVendor() {
  const { toast } = useToast();
  const { data: me } = useGetMe({ query: { retry: false } as any });
  const role = (me?.user as any)?.role as string | undefined;
  const isPartner = role != null && PARTNER_ROLES.has(role);
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState<string>("Pub");
  const [reason, setReason] = useState("");
  const [country, setCountry] = useState("India");
  const [stateF, setStateF] = useState("");
  const [city, setCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingRequest, setExistingRequest] = useState<VendorRequest | null | undefined>(undefined);

  useEffect(() => {
    apiGet<{ request: VendorRequest | null }>("/api/vendor-requests/me")
      .then((r) => setExistingRequest(r.request))
      .catch(() => setExistingRequest(null));
  }, []);

  // All fields are required. Validate before hitting the API so the user gets a
  // clear inline message instead of a generic server rejection.
  const validate = (): string | null => {
    if (!businessName.trim()) return "Please enter your business name.";
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return "Please enter a valid phone number.";
    if (!category) return "Please select a venue category.";
    if (!country.trim()) return "Please select your country.";
    if (!stateF.trim()) return "Please select your state.";
    if (!city.trim()) return "Please select your city.";
    if (!reason.trim()) return "Please tell us about your business.";
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = validate();
    if (error) {
      toast({ title: "Missing details", description: error, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiPost("/api/vendor-requests", {
        businessName: businessName.trim(),
        phone: phone.trim(),
        category,
        message: reason.trim(),
        country,
        state: stateF,
        city,
      });
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: "Could not submit", description: err?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-14 max-w-2xl flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <CheckCircle2 className="h-10 w-10 text-primary" />
        </div>
        <h1 className="font-serif text-4xl tracking-tight mb-3">Application submitted!</h1>
        <p className="text-muted-foreground text-lg max-w-md leading-relaxed">
          Thank you for applying to become a Royvento partner. Our team will review your application within <strong>1 working day</strong> and get in touch with you. Once approved, your dashboard unlocks automatically based on the category you chose.
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          Keep an eye on your notifications and email for updates.
        </p>
        <div className="flex gap-3 mt-8">
          <Link href="/">
            <Button variant="outline">Back to home</Button>
          </Link>
          <Link href="/dashboard/profile">
            <Button className="bg-primary text-primary-foreground">Go to my profile</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (existingRequest === undefined) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-14 max-w-2xl flex items-center justify-center min-h-[40vh]">
        <p className="text-muted-foreground text-sm animate-pulse">Checking your application…</p>
      </div>
    );
  }

  // Source of truth for "already a partner" is the live role, not the request
  // row. An admin-deleted partner (role back to "user") falls through to the
  // application form even if a stale "approved" vendor_requests row remains.
  if (isPartner) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-14 max-w-2xl flex flex-col items-center text-center">
        <SEO title="Already a Partner" canonical="/dashboard/become-vendor" noindex />
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <CheckCircle2 className="h-10 w-10 text-primary" />
        </div>
        <h1 className="font-serif text-4xl tracking-tight mb-3">You're already a partner!</h1>
        <p className="text-muted-foreground text-lg max-w-md leading-relaxed">
          Your application was approved. Head to your dashboard to manage your listing.
        </p>
        <Link href="/dashboard/profile" className="mt-8">
          <Button className="bg-primary text-primary-foreground">Go to dashboard</Button>
        </Link>
      </div>
    );
  }

  if (existingRequest?.status === "pending") {
    return (
      <div className="container mx-auto px-4 md:px-6 py-14 max-w-2xl flex flex-col items-center text-center">
        <SEO title="Application Under Review" canonical="/dashboard/become-vendor" noindex />
        <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-6">
          <Clock className="h-10 w-10 text-amber-500" />
        </div>
        <h1 className="font-serif text-4xl tracking-tight mb-3">Application under review</h1>
        <p className="text-muted-foreground text-lg max-w-md leading-relaxed">
          Your application for <strong className="text-foreground">{existingRequest.businessName}</strong> is being reviewed by our team. We'll notify you once a decision has been made.
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          You can re-apply only if your application is declined.
        </p>
        <Link href="/dashboard/profile" className="mt-8">
          <Button variant="outline">Back to profile</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-14 max-w-2xl">
      <SEO title="Become a Royvento Partner" canonical="/dashboard/become-vendor" noindex />
      <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Partner application</p>
      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="h-7 w-7 text-primary" />
        <h1 className="font-serif text-4xl tracking-tight">Become a partner</h1>
      </div>
      <p className="mt-2 text-muted-foreground">
        Tell us about your business. Pick the category that fits — pubs and clubs get the partner dashboard, while event organizers unlock the event management dashboard. Once an admin approves your request, the right tools unlock automatically.
      </p>

      {existingRequest?.status === "rejected" && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Your previous application was declined. You're welcome to submit a new one.
          </p>
        </div>
      )}

      <form onSubmit={submit} className="mt-8 rounded-3xl border bg-card p-8 space-y-5">
        <div>
          <Label htmlFor="bname">Business name</Label>
          <Input id="bname" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. The Royal Arms Pub" />
        </div>
        <div>
          <Label htmlFor="bphone" className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-primary" />Phone number</Label>
          <Input id="bphone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. +91 98765 43210" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="bcategory">Venue category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="bcategory" className="mt-1">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {VENUE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {category === "Event Organizer" && (
            <p className="mt-2 text-xs text-primary/80">
              Once approved, you'll get the Event Management dashboard to create events, sell tickets and scan entries.
            </p>
          )}
          {category === "Game Organizer" && (
            <p className="mt-2 text-xs text-primary/80">
              For gaming businesses — arcades, VR arenas, bowling, paintball, go-kart, pool & PS/Xbox lounges. Once approved, you'll get the Game Management dashboard to list games, build packages, take bookings and scan QR tickets.
            </p>
          )}
        </div>
        <div>
          <Label className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" />Where are you based?</Label>
          <div className="mt-2">
            <LocationSelect
              country={country}
              state={stateF}
              city={city}
              onChange={(next) => { setCountry(next.country); setStateF(next.state); setCity(next.city); }}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="breason">Tell us about your business</Label>
          <Textarea id="breason" rows={5} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="A short description of your venue or events, what you host, and why you'd like to be on Royvento." />
        </div>
        <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit application"}</Button>
      </form>
    </div>
  );
}
