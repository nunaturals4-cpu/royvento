import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Mail, Check, X } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useTranslation } from "react-i18next";
import {
  PASSWORD_RULES,
  isStrongPassword,
  getEmailError,
  getIndianPhoneError,
  normalizeIndianPhone,
} from "@workspace/validators";
import { useFormErrors, fieldClass } from "@/lib/formErrors";

export function Register() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("email") ?? "";
    } catch {
      return "";
    }
  });
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [useGoogleHint, setUseGoogleHint] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const formErrors = useFormErrors();
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<{ enabled: boolean }>("/api/auth/google/status")
      .then((r) => setGoogleEnabled(r.enabled))
      .catch(() => {});
    try {
      const params = new URLSearchParams(window.location.search);
      const r = params.get("ref");
      if (r) setReferralCode(r);
    } catch {}
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUseGoogleHint(false);
    formErrors.reset();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Name is required.";
    const emailErr = getEmailError(email);
    if (emailErr) next.email = emailErr;
    const phoneErr = getIndianPhoneError(phone, { required: false });
    if (phoneErr) next.phone = phoneErr;
    if (!isStrongPassword(password)) {
      setPasswordTouched(true);
      next.password = "Please meet all password requirements.";
    }
    Object.entries(next).forEach(([k, v]) => formErrors.setFieldError(k, v));
    if (next.name) { nameRef.current?.focus(); return; }
    if (next.email) { emailRef.current?.focus(); return; }
    if (next.phone) { phoneRef.current?.focus(); return; }
    if (next.password) { passwordRef.current?.focus(); return; }
    setBusy(true);
    try {
      const normalizedPhone = phone.trim() ? normalizeIndianPhone(phone) : "";
      await apiPost("/api/auth/register", {
        name: name.trim(),
        email: email.trim(),
        password,
        phone: normalizedPhone,
        referralCode: referralCode.trim().toUpperCase(),
      });
      setPendingEmail(email);
    } catch (err: any) {
      const status = err?.status;
      const code = err?.data?.code ?? err?.code;
      const serverMsg = err?.data?.error ?? err?.message ?? "";
      const fe: Record<string, string> = err?.data?.fieldErrors ?? err?.fieldErrors ?? {};
      const isDuplicate = status === 409 || /already in use|already exists/i.test(serverMsg);
      if (Object.keys(fe).length > 0) {
        Object.entries(fe).forEach(([k, v]) => formErrors.setFieldError(k, v));
        if (fe.name) nameRef.current?.focus();
        else if (fe.email) emailRef.current?.focus();
        else if (fe.phone) phoneRef.current?.focus();
        else if (fe.password) passwordRef.current?.focus();
      } else if (code === "USE_GOOGLE_SIGNIN") {
        setUseGoogleHint(true);
      } else if (isDuplicate) {
        formErrors.setFieldError("email", "An account with this email already exists.");
        emailRef.current?.focus();
      } else {
        toast({ title: t("common.error"), description: serverMsg || undefined, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResendBusy(true);
    try {
      await apiPost("/api/auth/resend-verification", { email: pendingEmail });
      toast({ title: t("auth.resend_success") });
    } catch {
      toast({ title: t("auth.resend_error"), variant: "destructive" });
    } finally {
      setResendBusy(false);
    }
  };

  const handleGoogle = () => {
    if (!googleEnabled) {
      toast({
        title: t("auth.google_signup_not_configured"),
        description: t("auth.google_not_configured_desc"),
      });
      return;
    }
    window.location.href = "/api/auth/google/start";
  };

  const nameError = formErrors.fieldError("name");
  const emailError = formErrors.fieldError("email");
  const phoneError = formErrors.fieldError("phone");
  const passwordError = formErrors.fieldError("password");

  // ── Pending verification screen ──
  if (pendingEmail) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-20">
        <div className="max-w-md mx-auto rounded-3xl glass-card-strong p-10 red-ring text-center">
          <div className="flex justify-center mb-6">
            <div className="rounded-full bg-primary/10 p-4">
              <Mail className="h-10 w-10 text-primary" />
            </div>
          </div>
          <h1 className="font-serif text-3xl tracking-tight mb-3">{t("auth.verify_email_title")}</h1>
          <p className="text-muted-foreground mb-2">
            {t("auth.verify_email_sub", { email: pendingEmail })}
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            {t("auth.verify_email_hint")}
          </p>
          <Button
            variant="outline"
            className="w-full border-white/15 hover:bg-white/5 mb-4"
            onClick={resend}
            disabled={resendBusy}
          >
            {resendBusy ? t("auth.resend_sending") : t("auth.resend_verification")}
          </Button>
          <p className="text-sm text-muted-foreground">
            {t("auth.already_have_account")}{" "}
            <Link href="/login" className="text-primary hover:underline">{t("auth.sign_in_link")}</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-20">
      <SEO title="Create an account | Royvento" canonical="/register" noindex />
      <div className="max-w-md mx-auto rounded-3xl glass-card-strong p-10 red-ring">
        <Link href="/" className="flex justify-center mb-8" aria-label="Royvento home">
          <Logo variant="full" size={96} />
        </Link>
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2 accent-underline inline-block">{t("auth.get_started")}</p>
        <h1 className="font-serif text-4xl tracking-tight mt-3 mb-8">{t("auth.create_your_account")}</h1>

        {useGoogleHint && (
          <div className="mb-6 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
            <div className="flex gap-3 items-start">
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 mt-0.5">
                <path fill="#EA4335" d="M12 5.04c2.16 0 4.1.74 5.62 2.18l4.18-4.18C19.16.96 15.84-.5 12-.5 7.27-.5 3.2 2.2 1.18 6.16l4.86 3.78C7.04 6.94 9.3 5.04 12 5.04z" />
                <path fill="#4285F4" d="M23.5 12.27c0-.83-.07-1.64-.21-2.41H12v4.56h6.46c-.28 1.5-1.13 2.78-2.42 3.64l3.92 3.04c2.29-2.12 3.6-5.24 3.6-8.83z" />
                <path fill="#FBBC05" d="M6.04 14.06A7.46 7.46 0 0 1 5.66 12c0-.71.13-1.4.36-2.04L1.16 6.16A12 12 0 0 0 0 12c0 1.94.46 3.78 1.28 5.42l4.76-3.36z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.92-3.04c-1.08.72-2.46 1.16-4.02 1.16-3.08 0-5.7-2.07-6.64-4.86L1.4 17.72C3.4 21.46 7.4 24 12 24z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-300 mb-1">{t("auth.use_google_signin_title")}</p>
                <p className="text-xs text-blue-200/80 mb-3">{t("auth.use_google_signin")}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-500/40 text-blue-300 hover:bg-blue-500/10 h-8 text-xs"
                  onClick={handleGoogle}
                >
                  {t("auth.continue_google")}
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
          <svg viewBox="0 0 24 24" className="h-4 w-4">
            <path fill="#EA4335" d="M12 5.04c2.16 0 4.1.74 5.62 2.18l4.18-4.18C19.16.96 15.84-.5 12-.5 7.27-.5 3.2 2.2 1.18 6.16l4.86 3.78C7.04 6.94 9.3 5.04 12 5.04z" />
            <path fill="#4285F4" d="M23.5 12.27c0-.83-.07-1.64-.21-2.41H12v4.56h6.46c-.28 1.5-1.13 2.78-2.42 3.64l3.92 3.04c2.29-2.12 3.6-5.24 3.6-8.83z" />
            <path fill="#FBBC05" d="M6.04 14.06A7.46 7.46 0 0 1 5.66 12c0-.71.13-1.4.36-2.04L1.16 6.16A12 12 0 0 0 0 12c0 1.94.46 3.78 1.28 5.42l4.76-3.36z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.92-3.04c-1.08.72-2.46 1.16-4.02 1.16-3.08 0-5.7-2.07-6.64-4.86L1.4 17.72C3.4 21.46 7.4 24 12 24z" />
          </svg>
          {t("auth.sign_up_google")}
        </Button>
        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("auth.or_email")}</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={submit} noValidate className="space-y-4">
          <div>
            <Label htmlFor="name">{t("auth.full_name")}</Label>
            <Input
              ref={nameRef}
              id="name"
              required
              value={name}
              onChange={(e) => { setName(e.target.value); formErrors.clearField("name"); }}
              aria-invalid={!!nameError}
              className={fieldClass("bg-black/40 border-white/10 mt-1", nameError)}
            />
            {nameError && <p className="text-xs text-destructive mt-1">{nameError}</p>}
          </div>
          <div>
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              ref={emailRef}
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); formErrors.clearField("email"); }}
              aria-invalid={!!emailError}
              className={fieldClass("bg-black/40 border-white/10 mt-1", emailError)}
            />
            {emailError && (
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <p className="text-xs text-destructive">{emailError}</p>
                {/already exists/i.test(emailError) && (
                  <Link href={`/login?email=${encodeURIComponent(email)}`} className="text-xs text-primary hover:underline">
                    Sign in instead
                  </Link>
                )}
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="phone">{t("auth.phone")}</Label>
            <Input
              ref={phoneRef}
              id="phone"
              type="tel"
              placeholder="Phone number (optional)"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); formErrors.clearField("phone"); }}
              aria-invalid={!!phoneError}
              className={fieldClass("bg-black/40 border-white/10 mt-1", phoneError)}
            />
            {phoneError && <p className="text-xs text-destructive mt-1">{phoneError}</p>}
          </div>
          <div>
            <Label htmlFor="password">{t("auth.password")}</Label>
            <div className="relative mt-1">
              <Input
                ref={passwordRef}
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordTouched(true); formErrors.clearField("password"); }}
                aria-invalid={!!passwordError}
                className={fieldClass("bg-black/40 border-white/10 pr-10", passwordError)}
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
            {passwordError && <p className="text-xs text-destructive mt-1">{passwordError}</p>}
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
            <Label htmlFor="referralCode">{t("auth.referral_code")} <span className="text-muted-foreground">({t("auth.optional")})</span></Label>
            <Input
              id="referralCode"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              placeholder="ABCD1234"
              className="bg-black/40 border-white/10 mt-1 uppercase tracking-wider"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              {t("auth.referral_earn_note")}
            </p>
          </div>
          <Button type="submit" className="w-full h-11 bg-gradient-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 border-0" disabled={busy}>
            {busy ? t("auth.creating") : t("auth.create_account")}
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground text-center">
          {t("auth.already_have_account")} <Link href="/login" className="text-primary hover:underline">{t("auth.sign_in_link")}</Link>
        </p>
      </div>
    </div>
  );
}
