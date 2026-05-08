import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LocationSelect } from "@/components/LocationSelect";
import { useToast } from "@/hooks/use-toast";
import { apiPost } from "@/lib/api";
import { Sparkles, MapPin, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

const VENUE_CATEGORIES = [
  "Pub",
  "Bar",
  "Club",
  "Lounge",
  "Rooftop",
  "Restaurant",
  "Live Music Venue",
  "Comedy Club",
  "Other",
] as const;

export function BecomeVendor() {
  const { toast } = useToast();
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState<string>("Pub");
  const [reason, setReason] = useState("");
  const [country, setCountry] = useState("India");
  const [stateF, setStateF] = useState("");
  const [city, setCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiPost("/api/vendor-requests", {
        businessName,
        category,
        message: reason,
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
          Thank you for applying to become a Royvento partner. Our team will review your application within <strong>1 working day</strong> and get in touch with you. Once approved, you'll be able to list your pub and manage bookings straight away.
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

  return (
    <div className="container mx-auto px-4 md:px-6 py-14 max-w-2xl">
      <SEO title="Become a Royvento Partner" canonical="/dashboard/become-vendor" noindex />
      <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Partner application</p>
      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="h-7 w-7 text-primary" />
        <h1 className="font-serif text-4xl tracking-tight">Become a partner</h1>
      </div>
      <p className="mt-2 text-muted-foreground">
        Tell us about your pub. Once an admin approves your request, you'll be able to publish your listing and accept bookings.
      </p>
      <form onSubmit={submit} className="mt-10 rounded-3xl border bg-card p-8 space-y-5">
        <div>
          <Label htmlFor="bname">Business name</Label>
          <Input id="bname" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. The Royal Arms Pub" />
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
          <Label htmlFor="breason">Tell us about your venue</Label>
          <Textarea id="breason" rows={5} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="A short description of your pub, the events you host, and why you'd like to be on Royvento." />
        </div>
        <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit application"}</Button>
      </form>
    </div>
  );
}
