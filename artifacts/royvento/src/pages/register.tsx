import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";

export function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    apiGet<{ enabled: boolean }>("/api/auth/google/status")
      .then((r) => setGoogleEnabled(r.enabled))
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await apiPost<{ token?: string; user: { name: string; role: string } }>(
        "/api/auth/register",
        { name, email, password, phone },
      );
      if (data.token) localStorage.setItem("royvento_token", data.token);
      qc.invalidateQueries();
      toast({ title: "Welcome to Royvento" });
      setLocation("/");
    } catch (err: any) {
      toast({ title: "Registration failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = () => {
    if (!googleEnabled) {
      toast({
        title: "Google sign-up not configured",
        description: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable.",
      });
      return;
    }
    window.location.href = "/api/auth/google/start";
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-20">
      <div className="max-w-md mx-auto rounded-3xl glass-card-strong p-10 red-ring">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2 accent-underline inline-block">Get started</p>
        <h1 className="font-serif text-4xl tracking-tight mt-3 mb-8">Create your account</h1>

        <Button
          type="button"
          variant="outline"
          className="w-full h-11 border-white/15 hover:bg-white/5 mb-4 gap-2"
          onClick={handleGoogle}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4">
            <path fill="#EA4335" d="M12 5.04c2.16 0 4.1.74 5.62 2.18l4.18-4.18C19.16.96 15.84-.5 12-.5 7.27-.5 3.2 2.2 1.18 6.16l4.86 3.78C7.04 6.94 9.3 5.04 12 5.04z" />
            <path fill="#4285F4" d="M23.5 12.27c0-.83-.07-1.64-.21-2.41H12v4.56h6.46c-.28 1.5-1.13 2.78-2.42 3.64l3.92 3.04c2.29-2.12 3.6-5.24 3.6-8.83z" />
            <path fill="#FBBC05" d="M6.04 14.06A7.46 7.46 0 0 1 5.66 12c0-.71.13-1.4.36-2.04L1.16 6.16A12 12 0 0 0 0 12c0 1.94.46 3.78 1.28 5.42l4.76-3.36z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.92-3.04c-1.08.72-2.46 1.16-4.02 1.16-3.08 0-5.7-2.07-6.64-4.86L1.4 17.72C3.4 21.46 7.4 24 12 24z" />
          </svg>
          Sign up with Google
        </Button>
        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-muted-foreground uppercase tracking-wider">or email</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} className="bg-black/40 border-white/10 mt-1" />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-black/40 border-white/10 mt-1" />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" type="tel" placeholder="+91 …" value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-black/40 border-white/10 mt-1" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="bg-black/40 border-white/10 mt-1" />
          </div>
          <Button type="submit" className="w-full h-11 bg-gradient-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 border-0" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground text-center">
          Already have one? <Link href="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
