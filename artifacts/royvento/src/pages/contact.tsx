import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Mail, Phone, MapPin } from "lucide-react";
import { apiPost } from "@/lib/api";
import { getEmailError, getIndianPhoneError, normalizeIndianPhone } from "@workspace/validators";

export function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; phone?: string; subject?: string; message?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Name is required.";
    const emailErr = getEmailError(email);
    if (emailErr) next.email = emailErr;
    const phoneErr = getIndianPhoneError(phone, { required: false });
    if (phoneErr) next.phone = phoneErr;
    if (!subject.trim()) next.subject = "Subject is required.";
    if (!message.trim()) next.message = "Message is required.";
    setErrors(next);
    if (next.name) { nameRef.current?.focus(); return; }
    if (next.email) { emailRef.current?.focus(); return; }
    if (next.phone) { phoneRef.current?.focus(); return; }
    if (next.subject) { subjectRef.current?.focus(); return; }
    if (next.message) { messageRef.current?.focus(); return; }
    setSubmitting(true);
    try {
      await apiPost("/api/contact", {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() ? normalizeIndianPhone(phone) : "",
        subject: subject.trim(),
        message: message.trim(),
      });
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
      <form onSubmit={submit} noValidate className="rounded-3xl border bg-card p-8 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="cname">Your name</Label>
            <Input ref={nameRef} id="cname" required value={name} onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((p) => ({ ...p, name: undefined })); }} aria-invalid={!!errors.name} />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
          </div>
          <div>
            <Label htmlFor="cphone">Phone</Label>
            <Input ref={phoneRef} id="cphone" type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); if (errors.phone) setErrors((p) => ({ ...p, phone: undefined })); }} aria-invalid={!!errors.phone} placeholder="Optional" />
            {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
          </div>
        </div>
        <div>
          <Label htmlFor="cemail">Email</Label>
          <Input ref={emailRef} id="cemail" type="email" required value={email} onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); }} aria-invalid={!!errors.email} />
          {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
        </div>
        <div>
          <Label htmlFor="csub">Subject</Label>
          <Input ref={subjectRef} id="csub" required value={subject} onChange={(e) => { setSubject(e.target.value); if (errors.subject) setErrors((p) => ({ ...p, subject: undefined })); }} aria-invalid={!!errors.subject} placeholder="Briefly, what is this about?" />
          {errors.subject && <p className="text-xs text-destructive mt-1">{errors.subject}</p>}
        </div>
        <div>
          <Label htmlFor="cmsg">Message</Label>
          <Textarea ref={messageRef} id="cmsg" rows={6} required value={message} onChange={(e) => { setMessage(e.target.value); if (errors.message) setErrors((p) => ({ ...p, message: undefined })); }} aria-invalid={!!errors.message} />
          {errors.message && <p className="text-xs text-destructive mt-1">{errors.message}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Sending…" : "Send message"}
        </Button>
      </form>
    </div>
  );
}
