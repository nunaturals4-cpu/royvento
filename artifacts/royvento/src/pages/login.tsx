import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();
  const login = useLogin();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    apiGet<{ enabled: boolean }>("/api/auth/google/status")
      .then((r) => setGoogleEnabled(r.enabled))
      .catch(() => {});
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(
      { data: { email, password } },
      {
        onSuccess: (data) => {
          if (data.token) localStorage.setItem("royvento_token", data.token);
          qc.invalidateQueries();
          toast({ title: `Welcome back, ${data.user.name.split(" ")[0]}` });
          setLocation("/");
        },
        onError: (err: any) =>
          toast({ title: "Login failed", description: err?.message ?? "Check your credentials.", variant: "destructive" }),
      },
    );
  };

  const handleGoogle = () => {
    if (!googleEnabled) {
      toast({
        title: "Google sign-in not configured",
        description: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable.",
      });
      return;
    }
    window.location.href = "/api/auth/google/start";
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-20">
      <div className="max-w-md mx-auto rounded-3xl glass-card-strong p-10 red-ring">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2 accent-underline inline-block">Welcome back</p>
        <h1 className="font-serif text-4xl tracking-tight mt-3 mb-8">Sign in to Royvento</h1>

        <Button
          type="button"
          variant="outline"
          className="w-full h-11 border-white/15 hover:bg-white/5 mb-4 gap-2"
          onClick={handleGoogle}
        >
          <GoogleIcon /> Continue with Google
        </Button>
        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-muted-foreground uppercase tracking-wider">or email</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-black/40 border-white/10 mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
            </div>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="bg-black/40 border-white/10 mt-1" />
          </div>
          <Button type="submit" className="w-full h-11 bg-gradient-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 border-0" disabled={login.isPending}>
            {login.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground text-center">
          New to Royvento? <Link href="/register" className="text-primary hover:underline">Create an account</Link>
        </p>
        <div className="mt-8 pt-6 border-t border-white/10 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Demo accounts</p>
          <p>admin@admin.com / admin123@</p>
          <p>showcase@royvento.in / partner123 (partner)</p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#EA4335" d="M12 5.04c2.16 0 4.1.74 5.62 2.18l4.18-4.18C19.16.96 15.84-.5 12-.5 7.27-.5 3.2 2.2 1.18 6.16l4.86 3.78C7.04 6.94 9.3 5.04 12 5.04z" />
      <path fill="#4285F4" d="M23.5 12.27c0-.83-.07-1.64-.21-2.41H12v4.56h6.46c-.28 1.5-1.13 2.78-2.42 3.64l3.92 3.04c2.29-2.12 3.6-5.24 3.6-8.83z" />
      <path fill="#FBBC05" d="M6.04 14.06A7.46 7.46 0 0 1 5.66 12c0-.71.13-1.4.36-2.04L1.16 6.16A12 12 0 0 0 0 12c0 1.94.46 3.78 1.28 5.42l4.76-3.36z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.92-3.04c-1.08.72-2.46 1.16-4.02 1.16-3.08 0-5.7-2.07-6.64-4.86L1.4 17.72C3.4 21.46 7.4 24 12 24z" />
      <path fill="none" d="M0 0h24v24H0z" />
    </svg>
  );
}
