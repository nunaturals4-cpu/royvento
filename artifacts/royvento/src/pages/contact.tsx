import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Mail, Phone, MapPin } from "lucide-react";
import { apiPost } from "@/lib/api";

export function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiPost("/api/contact", { name, email, phone, subject, message });
      toast({ title: "Message sent", description: "Our team will get back to you shortly." });
      setName(""); setEmail(""); setPhone(""); setSubject(""); setMessage("");
    } catch (err: any) {
      toast({ title: "Failed to send", description: err?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-20 grid lg:grid-cols-2 gap-12">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Contact</p>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight">Talk to our team</h1>
        <p className="mt-4 text-muted-foreground leading-relaxed max-w-md">
          Facing an issue or planning something out of the ordinary? Send us a note and we'll respond within 24 hours.
        </p>
        <div className="mt-10 space-y-5 text-sm">
          <div className="flex items-start gap-3"><Mail className="h-5 w-5 text-primary mt-0.5" /><div><p className="font-medium">hello@royvento.com</p><p className="text-muted-foreground">We respond within 24 hours.</p></div></div>
          <div className="flex items-start gap-3"><Phone className="h-5 w-5 text-primary mt-0.5" /><div><p className="font-medium">+91 9875554165</p><p className="text-muted-foreground">Mon–Sat, 10am–7pm IST</p></div></div>
          <div className="flex items-start gap-3"><MapPin className="h-5 w-5 text-primary mt-0.5" /><div><p className="font-medium">Kolkata, West Bengal</p><p className="text-muted-foreground">India</p></div></div>
        </div>
      </div>
      <form onSubmit={submit} className="rounded-3xl border bg-card p-8 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><Label htmlFor="cname">Your name</Label><Input id="cname" required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label htmlFor="cphone">Phone</Label><Input id="cphone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" /></div>
        </div>
        <div><Label htmlFor="cemail">Email</Label><Input id="cemail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label htmlFor="csub">Subject</Label><Input id="csub" required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Briefly, what is this about?" /></div>
        <div><Label htmlFor="cmsg">Message</Label><Textarea id="cmsg" rows={6} required value={message} onChange={(e) => setMessage(e.target.value)} /></div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Sending…" : "Send message"}
        </Button>
      </form>
    </div>
  );
}
