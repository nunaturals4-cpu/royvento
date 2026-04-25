import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Mail, Phone, MapPin } from "lucide-react";

export function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const { toast } = useToast();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({ title: "Message sent", description: "We'll be in touch within 24 hours." });
    setName(""); setEmail(""); setMessage("");
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-20 grid lg:grid-cols-2 gap-12">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Contact</p>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight">Talk to our team</h1>
        <p className="mt-4 text-muted-foreground leading-relaxed max-w-md">
          Planning something out of the ordinary? Tell us about it. We'll match you with the right vendors personally.
        </p>
        <div className="mt-10 space-y-5 text-sm">
          <div className="flex items-start gap-3"><Mail className="h-5 w-5 text-primary mt-0.5" /><div><p className="font-medium">hello@royvento.com</p><p className="text-muted-foreground">We respond within 24 hours.</p></div></div>
          <div className="flex items-start gap-3"><Phone className="h-5 w-5 text-primary mt-0.5" /><div><p className="font-medium">+1 (415) 555-0142</p><p className="text-muted-foreground">Mon–Fri, 9am–6pm PT</p></div></div>
          <div className="flex items-start gap-3"><MapPin className="h-5 w-5 text-primary mt-0.5" /><div><p className="font-medium">San Francisco</p><p className="text-muted-foreground">Studio by appointment.</p></div></div>
        </div>
      </div>
      <form onSubmit={submit} className="rounded-3xl border bg-card p-8 space-y-4">
        <div><Label htmlFor="cname">Your name</Label><Input id="cname" required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label htmlFor="cemail">Email</Label><Input id="cemail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label htmlFor="cmsg">Tell us about your event</Label><Textarea id="cmsg" rows={6} required value={message} onChange={(e) => setMessage(e.target.value)} /></div>
        <Button type="submit" className="w-full">Send message</Button>
      </form>
    </div>
  );
}
