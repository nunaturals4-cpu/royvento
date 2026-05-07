import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, MailWarning } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useTranslation } from "react-i18next";

export function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
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

  const resend = async () => {
    setResendBusy(true);
    try {
      await apiPost("/api/auth/resend-verification", { email: unverifiedEmail });
      toast({ title: t("auth.resend_success") });
    } catch {
      toast({ title: t("auth.resend_error"), variant: "destructive" });
    } finally {
      setResendBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setUnverifiedEmail("");
    login.mutate(
      { data: { email, password } },
      {
        onSuccess: (data) => {
          qc.invalidateQueries();
          toast({ title: `${t("auth.welcome_back")}, ${data.user.name.split(" ")[0]}` });
          setLocation("/");
        },
        onError: (err: any) => {
          if (err?.code === "EMAIL_NOT_VERIFIED" || err?.message?.includes("EMAIL_NOT_VERIFIED") || err?.message?.includes("verify your email")) {
            setUnverifiedEmail(email);
          } else {
            toast({ title: t("common.error"), description: err?.message ?? "Check your credentials.", variant: "destructive" });
          }
        },
      },
    );
  };

  const handleGoogle = () => {
    if (!googleEnabled) {
      toast({
        title: t("auth.google_not_configured"),
        description: t("auth.google_not_configured_desc"),
      });
      return;
    }
    window.location.href = "/api/auth/google/start";
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-20">
      <div className="max-w-md mx-auto rounded-3xl glass-card-strong p-10 red-ring">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2 accent-underline inline-block">{t("auth.welcome_back")}</p>
        <h1 className="font-serif text-4xl tracking-tight mt-3 mb-8">{t("auth.sign_in_to")}</h1>

        {/* Email not verified banner */}
        {unverifiedEmail && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex gap-3 items-start">
              <MailWarning className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-300 mb-1">{t("auth.email_not_verified")}</p>
                <p className="text-xs text-amber-200/80 mb-3">{t("auth.email_not_verified_desc")}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 h-8 text-xs"
                  onClick={resend}
                  disabled={resendBusy}
                >
                  {resendBusy ? t("auth.resend_sending") : t("auth.resend_verification")}
                </Button>
              </div>
            </div>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full h-11 border-white/15 hover:bg-white/5 mb-4 gap-2"
          onClick={handleGoogle}
        >
          <GoogleIcon /> {t("auth.continue_google")}
        </Button>
        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("auth.or_email")}</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-black/40 border-white/10 mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Link href="/forgot-password" className="text-xs text-primary hover:underline">{t("auth.forgot_password")}</Link>
            </div>
            <div className="relative mt-1">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-black/40 border-white/10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? t("auth.hide_password") : t("auth.show_password")}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full h-11 bg-gradient-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 border-0" disabled={login.isPending}>
            {login.isPending ? t("auth.signing_in") : t("auth.sign_in")}
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground text-center">
          {t("auth.no_account")} <Link href="/register" className="text-primary hover:underline">{t("auth.create_account_link")}</Link>
        </p>
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
