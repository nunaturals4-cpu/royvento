import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiPost } from "@/lib/api";
import { Mail, CheckCircle2, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ForgotPassword() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost<{ ok: boolean; message: string }>(
        "/api/auth/forgot-password",
        { email },
      );
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: t("auth.error"), description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-20">
        <div className="max-w-md mx-auto rounded-3xl glass-card-strong p-10 red-ring text-center">
          <CheckCircle2 className="h-14 w-14 text-primary mx-auto mb-4" />
          <h1 className="font-serif text-3xl tracking-tight mb-3">{t("auth.check_inbox_web")}</h1>
          <p className="text-muted-foreground text-sm leading-relaxed mb-6">
            {t("auth.check_inbox_sub_web", { email })}
          </p>
          <Link href="/login">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> {t("auth.back_to_login")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-20">
      <div className="max-w-md mx-auto rounded-3xl glass-card-strong p-10 red-ring">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("auth.back_to_login")}
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <Mail className="h-7 w-7 text-primary" />
          <h1 className="font-serif text-3xl tracking-tight">{t("auth.forgot_password")}</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-2 mb-8">
          {t("auth.forgot_sub_web")}
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="email">{t("auth.email_address")}</Label>
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
            {loading ? t("auth.sending") : t("auth.send_reset_link")}
          </Button>
        </form>
      </div>
    </div>
  );
}
