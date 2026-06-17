import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetSoloVerification } from "@workspace/api-client-react";
import { apiPost } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { startPhoneVerification, type PhoneVerification } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Check, Phone, Camera, User2, RotateCcw } from "lucide-react";

const GOLD = "#d4af37";
const RED = "#b91c1c";

type Step = "phone" | "otp" | "selfie" | "gender" | "consent";
type Gender = "male" | "female" | "prefer_not_to_say";

const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

// Naive E.164 helper — defaults to India (+91) when the user types a bare
// 10-digit number, otherwise expects a leading +<country>.
function toE164(raw: string): string | null {
  const t = raw.replace(/[\s-]/g, "");
  if (/^\+\d{8,15}$/.test(t)) return t;
  if (/^\d{10}$/.test(t)) return `+91${t}`;
  return null;
}

export function SoloVerificationFlow() {
  const { data: verification } = useGetSoloVerification();
  const qc = useQueryClient();
  const { toast } = useToast();

  const status = verification?.status ?? "none";

  function refresh() {
    qc.invalidateQueries({ queryKey: ["/api/solo-connect/verification"] });
    qc.invalidateQueries({ queryKey: ["/api/solo-connect/access"] });
  }

  // Under-review — onboarding submitted, awaiting admin.
  if (status === "pending") {
    return (
      <ReviewCard
        tone="pending"
        title="Verification under review"
        body="Thanks — we've received your selfie and details. Our safety team is reviewing your profile. You'll be notified the moment you're approved."
      />
    );
  }

  // Rejected — show the reason + let them restart the wizard.
  if (status === "rejected") {
    return (
      <div className="space-y-4">
        <ReviewCard
          tone="rejected"
          title="Verification not approved"
          body={verification?.rejectionReason || "Your verification could not be approved. Please try again."}
        />
        <OnboardingWizard
          startPhoneVerified={!!verification?.phoneVerified}
          onDone={refresh}
        />
      </div>
    );
  }

  // none | draft → run the wizard, resuming at the selfie step if the phone is
  // already verified from a previous attempt.
  return <OnboardingWizard startPhoneVerified={!!verification?.phoneVerified} onDone={refresh} />;
}

function OnboardingWizard({
  startPhoneVerified,
  onDone,
}: {
  startPhoneVerified: boolean;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(startPhoneVerified ? "selfie" : "phone");

  // Phone / OTP state
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirmer, setConfirmer] = useState<PhoneVerification | null>(null);
  const [busy, setBusy] = useState(false);

  // Selfie / gender / consent state
  const [selfieUrl, setSelfieUrl] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [agreed, setAgreed] = useState(false);

  async function sendCode() {
    const e164 = toE164(phone);
    if (!e164) {
      toast({ title: "Enter a valid mobile number.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const verifier = await startPhoneVerification(e164, "solo-recaptcha");
      setConfirmer(verifier);
      setStep("otp");
      toast({ title: "Code sent. Enter the OTP to continue." });
    } catch (err) {
      toast({ title: (err as Error).message || "Could not send the code. Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!confirmer) return;
    setBusy(true);
    try {
      const idToken = await confirmer.confirm(code.trim());
      await apiPost("/api/solo-connect/phone/verify", { idToken });
      toast({ title: "Phone verified." });
      setStep("selfie");
    } catch (err) {
      const msg = (err as { message?: string }).message || "Incorrect or expired code.";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function submitAll() {
    if (!selfieUrl) { toast({ title: "Capture your selfie first.", variant: "destructive" }); return; }
    if (!gender) { toast({ title: "Select your gender.", variant: "destructive" }); return; }
    if (!agreed) { toast({ title: "Please accept the terms to continue.", variant: "destructive" }); return; }
    setBusy(true);
    try {
      await apiPost("/api/solo-connect/verification/submit", { selfieUrl, gender, consent: true });
      toast({ title: "Submitted! Your verification is under review." });
      onDone();
    } catch (err) {
      toast({ title: (err as { message?: string }).message || "Could not submit. Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassPanel>
      <Header title="Get verified" />
      <StepDots step={step} />

      {step === "phone" && (
        <div>
          <StepLead icon={<Phone className="h-4 w-4" />} title="Your mobile number">
            We'll text you a one-time code to confirm it's really you. Your number is private.
          </StepLead>
          <input
            value={phone}
            inputMode="tel"
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 90000 00000"
            className="w-full px-4 py-3 rounded-lg mb-5"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
          />
          {/* Firebase reCAPTCHA mounts here (invisible). */}
          <div id="solo-recaptcha" />
          <PrimaryButton onClick={sendCode} disabled={busy}>
            {busy ? "Sending…" : "Send code"}
          </PrimaryButton>
        </div>
      )}

      {step === "otp" && (
        <div>
          <StepLead icon={<Phone className="h-4 w-4" />} title="Enter the code">
            Enter the 6-digit code we sent to {toE164(phone)}.
          </StepLead>
          <input
            value={code}
            inputMode="numeric"
            maxLength={8}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="w-full px-4 py-3 rounded-lg mb-4 text-center tracking-[0.4em] text-lg"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
          />
          <div className="flex items-center justify-between mb-4">
            <button type="button" onClick={() => setStep("phone")} className="text-xs underline" style={{ color: "rgba(255,255,255,0.55)" }}>
              Change number
            </button>
            <button type="button" onClick={sendCode} disabled={busy} className="text-xs underline inline-flex items-center gap-1" style={{ color: GOLD }}>
              <RotateCcw className="h-3 w-3" /> Resend code
            </button>
          </div>
          <PrimaryButton onClick={verifyCode} disabled={busy || code.length < 4}>
            {busy ? "Verifying…" : "Verify"}
          </PrimaryButton>
        </div>
      )}

      {step === "selfie" && (
        <SelfieStep
          selfieUrl={selfieUrl}
          onCaptured={setSelfieUrl}
          onNext={() => setStep("gender")}
        />
      )}

      {step === "gender" && (
        <div>
          <StepLead icon={<User2 className="h-4 w-4" />} title="How do you identify?">
            This helps members see a group's makeup. You can choose not to say.
          </StepLead>
          <div className="grid gap-2.5 mb-5">
            {GENDERS.map((g) => {
              const active = gender === g.value;
              return (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setGender(g.value)}
                  className="w-full px-4 py-3 rounded-lg text-sm text-left transition-all"
                  style={{
                    background: active ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${active ? GOLD : "rgba(255,255,255,0.12)"}`,
                    color: "#fff",
                  }}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
          <PrimaryButton onClick={() => gender && setStep("consent")} disabled={!gender}>
            Continue
          </PrimaryButton>
        </div>
      )}

      {step === "consent" && (
        <div>
          <StepLead icon={<ShieldCheck className="h-4 w-4" />} title="Before you join">
            Solo Connector only helps you discover and join social groups.
          </StepLead>
          <div
            className="text-xs leading-relaxed mb-4 p-3.5 rounded-xl space-y-2"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.62)" }}
          >
            <p>Royvento does not organize, supervise, verify, monitor, or take responsibility for meetings, outings, conversations, or activities that happen after you join a group.</p>
            <p>You participate entirely at your own risk and are responsible for your own judgment and safety.</p>
            <p>Royvento is not responsible for any disputes, misconduct, transactions, injuries, losses, damages, or incidents during or after meeting group members.</p>
          </div>
          <label
            className="flex items-start gap-3 mb-5 p-3.5 rounded-xl cursor-pointer transition-all"
            style={{ background: agreed ? "rgba(212,175,55,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${agreed ? `${GOLD}55` : "rgba(255,255,255,0.1)"}` }}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={agreed}
              onClick={() => setAgreed((v) => !v)}
              className="mt-0.5 h-5 w-5 shrink-0 flex items-center justify-center rounded-md transition-all"
              style={{ background: agreed ? `linear-gradient(135deg, ${GOLD}, #e0a951)` : "rgba(255,255,255,0.06)", border: `1.5px solid ${agreed ? GOLD : "rgba(255,255,255,0.25)"}` }}
            >
              {agreed && <Check className="h-3.5 w-3.5" style={{ color: "#1a1a1a" }} strokeWidth={3} />}
            </button>
            <span className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>
              I have read and agree to the{" "}
              <Link href="/terms" target="_blank" className="underline" style={{ color: GOLD }} onClick={(e) => e.stopPropagation()}>Terms</Link>,{" "}
              <Link href="/privacy" target="_blank" className="underline" style={{ color: GOLD }} onClick={(e) => e.stopPropagation()}>Privacy Policy</Link>, and{" "}
              <Link href="/community-guidelines" target="_blank" className="underline" style={{ color: GOLD }} onClick={(e) => e.stopPropagation()}>Community Guidelines</Link>, and I understand I meet group members entirely at my own risk.
            </span>
          </label>
          <PrimaryButton onClick={submitAll} disabled={busy || !agreed}>
            {busy ? "Submitting…" : "Submit for review"}
          </PrimaryButton>
        </div>
      )}
    </GlassPanel>
  );
}

// ─── Live selfie capture (camera only, no gallery) ───────────────────────────

function SelfieStep({
  selfieUrl,
  onCaptured,
  onNext,
}: {
  selfieUrl: string;
  onCaptured: (url: string) => void;
  onNext: () => void;
}) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [camOn, setCamOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    return () => stopCam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCam() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamOn(true);
    } catch {
      setErr("Camera permission is required to capture a live selfie. No photo uploads are allowed.");
    }
  }

  function stopCam() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }

  async function capture() {
    const video = videoRef.current;
    if (!video) return;
    const size = Math.min(video.videoWidth, video.videoHeight) || 480;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Center-crop square + mirror so the preview matches what the user sees.
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    // Compress to JPEG (0.8) — keeps the upload small.
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob) return;
    setPreview(URL.createObjectURL(blob));
    stopCam();
    setBusy(true);
    try {
      const file = new File([blob], `selfie-${Date.now()}.jpg`, { type: "image/jpeg" });
      const url = await uploadImage(file);
      onCaptured(url);
      toast({ title: "Selfie captured." });
    } catch {
      toast({ title: "Upload failed. Please retake.", variant: "destructive" });
      setPreview("");
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    setPreview("");
    onCaptured("");
    startCam();
  }

  return (
    <div>
      <StepLead icon={<Camera className="h-4 w-4" />} title="Take a live selfie">
        Capture a quick selfie so we can confirm you're a real person. Live capture only — no gallery uploads.
      </StepLead>

      <div
        className="relative mx-auto mb-4 rounded-2xl overflow-hidden"
        style={{ width: 220, height: 220, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
      >
        {preview ? (
          <img src={preview} alt="Selfie preview" className="w-full h-full object-cover" />
        ) : (
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover" style={{ transform: "scaleX(-1)", display: camOn ? "block" : "none" }} />
        )}
        {!camOn && !preview && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Camera className="h-9 w-9" style={{ color: "rgba(255,255,255,0.25)" }} />
          </div>
        )}
      </div>

      {err && <p className="text-xs mb-3 text-center" style={{ color: RED }}>{err}</p>}

      {!preview && !camOn && (
        <PrimaryButton onClick={startCam} disabled={busy}>Enable camera</PrimaryButton>
      )}
      {camOn && (
        <PrimaryButton onClick={capture} disabled={busy}>{busy ? "Saving…" : "Capture selfie"}</PrimaryButton>
      )}
      {preview && (
        <div className="space-y-2.5">
          <button type="button" onClick={retake} className="w-full py-2.5 rounded-xl text-sm inline-flex items-center justify-center gap-2" style={{ background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" }}>
            <RotateCcw className="h-3.5 w-3.5" /> Retake
          </button>
          <PrimaryButton onClick={onNext} disabled={!selfieUrl || busy}>Continue</PrimaryButton>
        </div>
      )}
    </div>
  );
}

// ─── Shared presentation ─────────────────────────────────────────────────────

function StepDots({ step }: { step: Step }) {
  const order: Step[] = ["phone", "otp", "selfie", "gender", "consent"];
  const idx = order.indexOf(step);
  return (
    <div className="flex items-center gap-1.5 mb-5">
      {order.map((s, i) => (
        <span
          key={s}
          className="h-1.5 rounded-full transition-all"
          style={{ width: i === idx ? 22 : 8, background: i <= idx ? GOLD : "rgba(255,255,255,0.15)" }}
        />
      ))}
    </div>
  );
}

function StepLead({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1.5" style={{ color: GOLD }}>
        {icon}
        <h4 className="font-serif text-lg" style={{ color: "#fff" }}>{title}</h4>
      </div>
      <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>{children}</p>
    </div>
  );
}

function GlassPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative max-w-lg mx-auto p-7 md:p-8 rounded-3xl overflow-hidden"
      style={{
        background: "linear-gradient(180deg, rgba(24,22,26,0.94), rgba(13,12,15,0.94))",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: `0 30px 70px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px ${GOLD}10`,
        backdropFilter: "blur(24px)",
      }}
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-2/3" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
      {children}
    </div>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center h-11 w-11 rounded-2xl shrink-0" style={{ background: `linear-gradient(145deg, ${GOLD}26, ${RED}1a)`, border: `1px solid ${GOLD}55`, boxShadow: `0 0 24px ${GOLD}1f` }}>
          <ShieldCheck className="h-5 w-5" style={{ color: GOLD }} />
        </span>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: GOLD }}>Verification</p>
          <h3 className="font-serif text-xl" style={{ color: "#fff" }}>{title}</h3>
        </div>
      </div>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
      style={{
        background: disabled ? "rgba(255,255,255,0.06)" : `linear-gradient(135deg, ${RED}, #d23a2a)`,
        color: disabled ? "rgba(255,255,255,0.3)" : "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : `0 10px 28px ${RED}4d`,
      }}
    >
      {children}
    </button>
  );
}

function ReviewCard({ tone, title, body }: { tone: "pending" | "rejected"; title: string; body: string }) {
  const accent = tone === "pending" ? GOLD : RED;
  return (
    <GlassPanel>
      <div className="flex items-center gap-3.5 mb-3">
        <span className="flex items-center justify-center h-12 w-12 rounded-2xl shrink-0" style={{ background: `${accent}1f`, border: `1px solid ${accent}66`, boxShadow: `0 0 26px ${accent}26` }}>
          <ShieldCheck className="h-5 w-5" style={{ color: accent }} />
        </span>
        <h3 className="font-serif text-xl" style={{ color: "#fff" }}>{title}</h3>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>{body}</p>
    </GlassPanel>
  );
}
