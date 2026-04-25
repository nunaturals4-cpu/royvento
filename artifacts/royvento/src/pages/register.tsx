import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();
  const register = useRegister();
  const { toast } = useToast();
  const qc = useQueryClient();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    register.mutate(
      { data: { name, email, password } },
      {
        onSuccess: (data) => {
          if (data.token) localStorage.setItem("royvento_token", data.token);
          qc.invalidateQueries();
          toast({ title: "Welcome to Royvento" });
          setLocation("/");
        },
        onError: (err: any) =>
          toast({ title: "Registration failed", description: err?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-20">
      <div className="max-w-md mx-auto rounded-3xl border bg-card p-10">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Get started</p>
        <h1 className="font-serif text-3xl tracking-tight mb-8">Create your account</h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={register.isPending}>
            {register.isPending ? "Creating…" : "Create account"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground text-center">
          Already have one? <Link href="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
