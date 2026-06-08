import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Mail, Phone, MapPin } from "lucide-react";
import { apiPost } from "@/lib/api";
import { getEmailError, getIndianPhoneError, normalizeIndianPhone } from "@workspace/validators";
import { useFormErrors, fieldClass } from "@/lib/formErrors";

export function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const formErrors = useFormErrors();
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    formErrors.reset();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Name is required.";
    const emailErr = getEmailError(email);
    if (emailErr) next.email = emailErr;
    const phoneErr = getIndianPhoneError(phone, { required: false });
    if (phoneErr) next.phone = phoneErr;
    if (!subject.trim()) next.subject = "Subject is required.";
    if (!message.trim()) next.message = "Message is required.";
    Object.entries(next).forEach(([k, v]) => formErrors.setFieldError(k, v));
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
      formErrors.setFromError(err);
      toast({ title: "Failed to send", description: err?.data?.error ?? err?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const nameError = formErrors.fieldError("name");
  const emailError = formErrors.fieldError("email");
  const phoneError = formErrors.fieldError("phone");
  const subjectError = formErrors.fieldError("subject");
  const messageError = formErrors.fieldError("message");

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Contact Royvento — Talk to Our Team"
        description="Have a question or planning something out of the ordinary? Reach the Royvento team — we typically respond within 24 hours."
        canonical="/contact"
      />

      {/* ── Hero header ── */}
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 left-1/4 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -top-10 right-1/3 h-56 w-56 rounded-full bg-primary/6 blur-3xl" />
        </div>
        <div className="container mx-auto px-4 md:px-6 py-14 relative text-center max-w-2xl">
          <p className="text-xs uppercase tracking-[0.28em] text-primary font-semibold mb-4">Get in touch</p>
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight text-white">
            Talk to our team
          </h1>
          <p className="mt-4 text-white/60 leading-relaxed">
            Facing an issue or planning something out of the ordinary?<br className="hidden sm:block" />
            Send us a note and we'll respond within 24 hours.
          </p>
        </div>
      </div>

      {/* ── Contact info cards ── */}
      <div className="container mx-auto px-4 md:px-6 py-8 max-w-5xl">
        <div className="grid sm:grid-cols-3 gap-4 mb-10">
          {[
            { icon: Mail,   label: "Email us",    value: "support@royvento.com",  sub: "We respond within 24 hours." },
            { icon: Phone,  label: "Call us",     value: "+91 9875554165",     sub: "Mon–Sat, 10am–7pm IST"       },
            { icon: MapPin, label: "Find us",     value: "Kolkata, West Bengal", sub: "India"                    },
          ].map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="flex items-start gap-4 rounded-2xl border border-white/[0.06] bg-[#111] p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 border border-primary/20 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
                <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Two-column: left copy + right form ── */}
        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-10 items-start">

          {/* Left — decorative side */}
          <div className="hidden lg:flex flex-col gap-8">
            <div>
              <h2 className="text-2xl font-bold text-white leading-snug">We'd love to hear from you</h2>
              <p className="mt-3 text-white/60 text-sm leading-relaxed">
                Whether you have a question about features, plans, need a demo, or anything else — our team is ready to answer all your questions.
              </p>
            </div>
            <div className="space-y-4">
              {[
                { title: "Support",      desc: "Issues with bookings, payments or your account" },
                { title: "Partnerships", desc: "List your venue or explore business opportunities" },
                { title: "Feedback",     desc: "Tell us how we can improve Royvento for you" },
              ].map(({ title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Decorative image */}
            <div className="relative rounded-2xl overflow-hidden aspect-[4/3] mt-2">
              <img
                src="https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?w=600&q=70"
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-transparent to-transparent mix-blend-screen" />
            </div>
          </div>

          {/* Right — form */}
          <form onSubmit={submit} noValidate className="rounded-2xl border border-white/[0.06] bg-[#111] p-7 space-y-5">
            <h2 className="text-lg font-bold text-white mb-1">Send us a message</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cname" className="text-xs text-muted-foreground uppercase tracking-wide">Your name *</Label>
                <Input
                  ref={nameRef}
                  id="cname"
                  required
                  value={name}
                  onChange={(e) => { setName(e.target.value); formErrors.clearField("name"); }}
                  aria-invalid={!!nameError}
                  className={fieldClass("mt-1.5 bg-white/[0.04] border-white/[0.08] focus:border-primary/40 rounded-xl h-10", nameError)}
                />
                {nameError && <p className="text-xs text-destructive mt-1">{nameError}</p>}
              </div>
              <div>
                <Label htmlFor="cphone" className="text-xs text-muted-foreground uppercase tracking-wide">Phone</Label>
                <Input
                  ref={phoneRef}
                  id="cphone"
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); formErrors.clearField("phone"); }}
                  aria-invalid={!!phoneError}
                  placeholder="Optional"
                  className={fieldClass("mt-1.5 bg-white/[0.04] border-white/[0.08] focus:border-primary/40 rounded-xl h-10", phoneError)}
                />
                {phoneError && <p className="text-xs text-destructive mt-1">{phoneError}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor="cemail" className="text-xs text-muted-foreground uppercase tracking-wide">Email *</Label>
              <Input
                ref={emailRef}
                id="cemail"
                type="email"
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); formErrors.clearField("email"); }}
                aria-invalid={!!emailError}
                className={fieldClass("mt-1.5 bg-white/[0.04] border-white/[0.08] focus:border-primary/40 rounded-xl h-10", emailError)}
              />
              {emailError && <p className="text-xs text-destructive mt-1">{emailError}</p>}
            </div>

            <div>
              <Label htmlFor="csub" className="text-xs text-muted-foreground uppercase tracking-wide">Subject *</Label>
              <Input
                ref={subjectRef}
                id="csub"
                required
                value={subject}
                onChange={(e) => { setSubject(e.target.value); formErrors.clearField("subject"); }}
                aria-invalid={!!subjectError}
                placeholder="Briefly, what is this about?"
                className={fieldClass("mt-1.5 bg-white/[0.04] border-white/[0.08] focus:border-primary/40 rounded-xl h-10", subjectError)}
              />
              {subjectError && <p className="text-xs text-destructive mt-1">{subjectError}</p>}
            </div>

            <div>
              <Label htmlFor="cmsg" className="text-xs text-muted-foreground uppercase tracking-wide">Message *</Label>
              <Textarea
                ref={messageRef}
                id="cmsg"
                rows={5}
                required
                value={message}
                onChange={(e) => { setMessage(e.target.value); formErrors.clearField("message"); }}
                aria-invalid={!!messageError}
                className={fieldClass("mt-1.5 bg-white/[0.04] border-white/[0.08] focus:border-primary/40 rounded-xl resize-none", messageError)}
              />
              {messageError && <p className="text-xs text-destructive mt-1">{messageError}</p>}
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 bg-primary text-primary-foreground border-0 rounded-xl font-semibold hover:bg-primary-hover transition-all"
            >
              {submitting ? "Sending…" : "Send Message"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
