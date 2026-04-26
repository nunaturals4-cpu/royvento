import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiPost, EVENT_CATEGORIES } from "@/lib/api";
import { Sparkles } from "lucide-react";

export function BecomeVendor() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("Wedding");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiPost("/api/vendor-requests", { businessName, category, message: reason });
      toast({ title: "Request submitted", description: "An admin will review your application shortly." });
      setLocation("/dashboard/profile");
    } catch (err: any) {
      toast({ title: "Could not submit", description: err?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-14 max-w-2xl">
      <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Vendor application</p>
      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="h-7 w-7 text-primary" />
        <h1 className="font-serif text-4xl tracking-tight">Become a vendor</h1>
      </div>
      <p className="mt-2 text-muted-foreground">
        Tell us about your business. Once an admin approves your request, you'll be able to publish events and accept bookings.
      </p>
      <form onSubmit={submit} className="mt-10 rounded-3xl border bg-card p-8 space-y-5">
        <div>
          <Label htmlFor="bname">Business name</Label>
          <Input id="bname" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Lumière Atelier" />
        </div>
        <div>
          <Label htmlFor="bcat">Primary category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="bcat"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVENT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="breason">Why join Royvento?</Label>
          <Textarea id="breason" rows={5} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="A short note about your work, the events you produce, and why you'd like to be on Royvento." />
        </div>
        <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit application"}</Button>
      </form>
    </div>
  );
}
