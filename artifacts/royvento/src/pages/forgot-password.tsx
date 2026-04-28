import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiPost } from "@/lib/api";
import { Mail, CheckCircle2, ArrowLeft } from "lucide-react";

export function ForgotPassword() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiPost<{ ok: boolean; token?: string; message: string }>(
        "/api/auth/forgot-password",
        { email },
      );
      setSubmitted(true);
      if (res.token) setResetToken(res.token);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-20">
        <div className="max-w-md mx-auto rounded-3xl glass-card-strong p-10 red-ring text-center">
          <CheckCircle2 className="h-14 w-14 text-primary mx-auto mb-4" />
          <h1 className="font-serif text-3xl tracking-tight mb-3">Check your inbox</h1>
          <p className="text-muted-foreground text-sm leading-relaxed mb-6">
            If <strong>{email}</strong> is registered on Royvento, you will receive a password reset link shortly.
          </p>
          {resetToken && (
            <div className="bg-card border border-border rounded-xl p-4 mb-6 text-left">
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Demo mode — reset token</p>
              <code className="text-xs break-all text-primary">{resetToken}</code>
              <p className="text-xs text-muted-foreground mt-2">
                Use this token on the{" "}
                <Link href={`/reset-password?token=${resetToken}`} className="text-primary hover:underline">
                  reset password page
                </Link>
                .
              </p>
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <Link href="/login">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Back to login
              </Button>
            </Link>
            {resetToken && (
              <Link href={`/reset-password?token=${resetToken}`}>
                <Button className="bg-primary text-primary-foreground">Reset password</Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-20">
      <div className="max-w-md mx-auto rounded-3xl glass-card-strong p-10 red-ring">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to login
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <Mail className="h-7 w-7 text-primary" />
          <h1 className="font-serif text-3xl tracking-tight">Forgot password?</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-2 mb-8">
          Enter your email and we'll send you a link to reset your password.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-black/40 border-white/10 mt-1"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-gradient-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 border-0"
          >
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      </div>
    </div>
  );
}
