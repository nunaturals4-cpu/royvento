import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiPost } from "@/lib/api";
import { Lock, CheckCircle2, ArrowLeft, Smartphone, Check, X } from "lucide-react";
import { PASSWORD_RULES, getPasswordError } from "@workspace/validators";

function getTokenFromSearch() {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") ?? "";
}

function isMobileBrowser() {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function ResetPassword() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [token] = useState(getTokenFromSearch);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [appLinkAttempted, setAppLinkAttempted] = useState(false);
  const [launchingApp, setLaunchingApp] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token || !isMobileBrowser()) return;
    const deepLink = `royvento://reset-password?token=${encodeURIComponent(token)}`;
    setLaunchingApp(true);
    window.location.href = deepLink;
    const timer = setTimeout(() => {
      setLaunchingApp(false);
      setAppLinkAttempted(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    const pwErr = getPasswordError(password);
    if (pwErr) next.password = pwErr;
    if (password !== confirm) next.confirm = "Passwords do not match.";
    setErrors(next);
    if (next.password) { setPasswordTouched(true); passwordRef.current?.focus(); return; }
    if (next.confirm) { confirmRef.current?.focus(); return; }
    setLoading(true);
    try {
      await apiPost("/api/auth/reset-password", { token, newPassword: password });
      setDone(true);
      setTimeout(() => setLocation("/login"), 3000);
    } catch (err: any) {
      toast({ title: "Reset failed", description: err?.message ?? "Invalid or expired token.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-20">
        <SEO title="Reset password | Royvento" canonical="/reset-password" noindex />
        <div className="max-w-md mx-auto rounded-3xl glass-card-strong p-10 red-ring text-center">
          <CheckCircle2 className="h-14 w-14 text-primary mx-auto mb-4" />
          <h1 className="font-serif text-3xl tracking-tight mb-3">Password updated!</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Your password has been reset successfully. Redirecting you to login…
          </p>
          <Link href="/login">
            <Button className="bg-primary text-primary-foreground">Sign in now</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (launchingApp) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-20">
        <div className="max-w-md mx-auto rounded-3xl glass-card-strong p-10 red-ring text-center">
          <Smartphone className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
          <h1 className="font-serif text-2xl tracking-tight mb-2">Opening Royvento app…</h1>
          <p className="text-sm text-muted-foreground">If the app doesn't open, you can reset your password here in a moment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-20">
      <SEO title="Reset password | Royvento" canonical="/reset-password" noindex />
      <div className="max-w-md mx-auto rounded-3xl glass-card-strong p-10 red-ring">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to login
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <Lock className="h-7 w-7 text-primary" />
          <h1 className="font-serif text-3xl tracking-tight">Reset password</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-2 mb-8">
          Enter and confirm your new password below.
        </p>
        {appLinkAttempted && token && (
          <div className="mb-6 p-3 rounded-xl bg-primary/10 border border-primary/20 text-sm text-primary flex items-start gap-2">
            <Smartphone className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Trying to open the Royvento app… If nothing happened,{" "}
              <button
                type="button"
                className="underline underline-offset-2 cursor-pointer"
                onClick={() => { window.location.href = `royvento://reset-password?token=${encodeURIComponent(token)}`; }}
              >
                tap here to try again
              </button>{" "}
              or reset below.
            </span>
          </div>
        )}
        {!token && (
          <div className="mb-6 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            No reset token found. Please use the link from the forgot-password email or demo page.
          </div>
        )}
        <form onSubmit={submit} noValidate className="space-y-4">
          <div>
            <Label htmlFor="newpw">New password</Label>
            <Input
              ref={passwordRef}
              id="newpw"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordTouched(true); if (errors.password) setErrors((p) => ({ ...p, password: undefined })); }}
              aria-invalid={!!errors.password}
              className="bg-black/40 border-white/10 mt-1"
            />
            {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
            {passwordTouched && password.length > 0 && (
              <ul className="mt-2 space-y-1">
                {PASSWORD_RULES.map((rule) => {
                  const ok = rule.test(password);
                  return (
                    <li key={rule.id} className={`flex items-center gap-1.5 text-xs ${ok ? "text-green-400" : "text-muted-foreground"}`}>
                      {ok ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                      {rule.label}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <Label htmlFor="confirmpw">Confirm new password</Label>
            <Input
              ref={confirmRef}
              id="confirmpw"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); if (errors.confirm) setErrors((p) => ({ ...p, confirm: undefined })); }}
              aria-invalid={!!errors.confirm}
              className="bg-black/40 border-white/10 mt-1"
            />
            {errors.confirm && <p className="text-xs text-destructive mt-1">{errors.confirm}</p>}
          </div>
          <Button
            type="submit"
            disabled={loading || !token}
            className="w-full h-11 bg-gradient-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 border-0"
          >
            {loading ? "Resetting…" : "Reset password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
