import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();
  const login = useLogin();
  const { toast } = useToast();
  const qc = useQueryClient();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(
      { data: { email, password } },
      {
        onSuccess: (data) => {
          if (data.token) localStorage.setItem("royvento_token", data.token);
          qc.invalidateQueries();
          toast({ title: `Welcome back, ${data.user.name.split(" ")[0]}` });
          if (data.user.role === "admin") setLocation("/admin");
          else if (data.user.role === "vendor") setLocation("/dashboard/vendor");
          else setLocation("/dashboard/bookings");
        },
        onError: (err: any) =>
          toast({ title: "Login failed", description: err?.message ?? "Check your credentials.", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-20">
      <div className="max-w-md mx-auto rounded-3xl border bg-card p-10">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Welcome back</p>
        <h1 className="font-serif text-3xl tracking-tight mb-8">Sign in to Royvento</h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground text-center">
          New to Royvento? <Link href="/register" className="text-primary hover:underline">Create an account</Link>
        </p>
        <div className="mt-8 pt-6 border-t text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Demo accounts</p>
          <p>admin@royvento.com / admin123</p>
          <p>alice@example.com / password123</p>
          <p>lumiere@royvento.com / vendor123</p>
        </div>
      </div>
    </div>
  );
}
