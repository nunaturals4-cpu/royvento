import { useState, useRef } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSoloVerification,
  useSubmitSoloVerification,
  useRequestSoloOtp,
  useVerifySoloOtp,
} from "@workspace/api-client-react";
import { uploadImage, validateImageFile } from "@/lib/uploadImage";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Upload, Loader2, Check } from "lucide-react";

const GOLD = "#d4af37";
const RED = "#b91c1c";

const ID_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "driving_license", label: "Driving License" },
  { value: "voter_id", label: "Voter ID" },
] as const;

type IdType = (typeof ID_TYPES)[number]["value"];

// Keep only digits and a single leading "+", so the field can never hold
// letters/spaces/symbols. Used as the onChange sanitizer.
function sanitizePhone(raw: string): string {
  let v = raw.replace(/[^\d+]/g, "");
  // collapse any "+" that isn't the very first character
  v = (v.startsWith("+") ? "+" : "") + v.replace(/\+/g, "");
  return v.slice(0, 13); // +91 + 10 digits
}

// Valid Indian mobile: 10 digits starting 6–9, optionally prefixed with +91/91.
function isValidIndianMobile(raw: string): boolean {
  return /^(\+?91)?[6-9]\d{9}$/.test(sanitizePhone(raw));
}

function UploadField({
  label,
  value,
  onUploaded,
}: {
  label: string;
  value: string;
  onUploaded: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function handleFile(file: File) {
    const err = validateImageFile(file);
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const path = await uploadImage(file);
      onUploaded(path);
    } catch {
      toast({ title: "Upload failed. Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>{label}</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 py-6 rounded-xl transition-all"
        style={{
          background: value ? "rgba(212,175,55,0.10)" : "rgba(255,255,255,0.04)",
          border: `1.5px dashed ${value ? "rgba(212,175,55,0.6)" : "rgba(255,255,255,0.15)"}`,
          color: value ? GOLD : "rgba(255,255,255,0.6)",
        }}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : value ? (
          <Check className="h-4 w-4" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        <span className="text-sm font-medium">
          {busy ? "Uploading…" : value ? "Uploaded — replace" : "Tap to upload"}
        </span>
      </button>
      {value && (
        <img
          src={value}
          alt={label}
          className="mt-2 h-20 w-full object-cover rounded-lg"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        />
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function SoloVerificationFlow() {
  const { data: verification } = useGetSoloVerification();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [idType, setIdType] = useState<IdType>("passport");
  const [idDocumentUrl, setIdDocumentUrl] = useState("");
  const [selfieUrl, setSelfieUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");

  const submit = useSubmitSoloVerification();
  const requestOtp = useRequestSoloOtp();
  const verifyOtp = useVerifySoloOtp();

  const status = verification?.status ?? "none";
  const phoneVerified = verification?.phoneVerified ?? false;
  // Once details are submitted, the record exists and we move to the OTP step.
  const hasRecord = !!verification && status !== "none";

  function refresh() {
    qc.invalidateQueries({ queryKey: ["/api/solo-connect/verification"] });
    qc.invalidateQueries({ queryKey: ["/api/solo-connect/access"] });
  }

  function handleSubmitDetails() {
    if (!idDocumentUrl || !selfieUrl) {
      toast({ title: "Upload your government ID and a selfie first.", variant: "destructive" });
      return;
    }
    if (!isValidIndianMobile(phone)) {
      toast({ title: "Enter a valid 10-digit Indian mobile number.", variant: "destructive" });
      return;
    }
    submit.mutate(
      { data: { idType, idDocumentUrl, selfieUrl, phone: sanitizePhone(phone) } },
      {
        onSuccess: () => {
          toast({ title: "Details submitted. Verify your mobile number next." });
          refresh();
        },
        onError: () => toast({ title: "Could not submit. Try again.", variant: "destructive" }),
      },
    );
  }

  function handleRequestOtp() {
    requestOtp.mutate(undefined, {
      onSuccess: (res) => {
        toast({
          title: "OTP sent",
          description: res.devCode ? `Dev code: ${res.devCode}` : "Check your phone for the code.",
        });
      },
      onError: () => toast({ title: "Could not send OTP.", variant: "destructive" }),
    });
  }

  function handleVerifyOtp() {
    verifyOtp.mutate(
      { data: { code: otp.trim() } },
      {
        onSuccess: () => {
          toast({ title: "Mobile verified! Your identity is now under review." });
          setOtp("");
          refresh();
        },
        onError: (e) =>
          toast({ title: e instanceof Error ? e.message : "Incorrect OTP", variant: "destructive" }),
      },
    );
  }

  // Approved users never see this component (page routes them onward).
  // Under-review state:
  if (hasRecord && phoneVerified && status === "pending") {
    return (
      <ReviewCard
        tone="pending"
        title="Identity under review"
        body="Thanks — your documents and mobile are verified. Our safety team is reviewing your identity. You'll get access to Solo Connect once approved."
      />
    );
  }
  if (status === "rejected") {
    return (
      <div className="space-y-4">
        <ReviewCard
          tone="rejected"
          title="Verification rejected"
          body={verification?.rejectionReason || "Your verification could not be approved. Please re-submit with clear documents."}
        />
        <DetailsForm
          idType={idType}
          setIdType={setIdType}
          idDocumentUrl={idDocumentUrl}
          setIdDocumentUrl={setIdDocumentUrl}
          selfieUrl={selfieUrl}
          setSelfieUrl={setSelfieUrl}
          phone={phone}
          setPhone={setPhone}
          onSubmit={handleSubmitDetails}
          submitting={submit.isPending}
        />
      </div>
    );
  }

  // Step 2 — OTP (record exists but mobile not yet verified)
  if (hasRecord && !phoneVerified) {
    return (
      <GlassPanel>
        <Header step={2} title="Verify your mobile number" />
        <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>
          We sent a 6-digit code to <span style={{ color: "#fff" }}>{verification?.phone}</span>.
        </p>
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={handleRequestOtp}
            disabled={requestOtp.isPending}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: "rgba(255,255,255,0.06)", color: GOLD, border: `1px solid ${GOLD}55` }}
          >
            {requestOtp.isPending ? "Sending…" : "Send / Resend OTP"}
          </button>
        </div>
        <input
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="Enter 6-digit code"
          inputMode="numeric"
          className="w-full px-4 py-3 rounded-lg mb-3 tracking-[0.4em] text-center text-lg"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
        />
        <PrimaryButton onClick={handleVerifyOtp} disabled={otp.length < 4 || verifyOtp.isPending}>
          {verifyOtp.isPending ? "Verifying…" : "Verify mobile"}
        </PrimaryButton>
      </GlassPanel>
    );
  }

  // Step 1 — details form (no record yet)
  return (
    <DetailsForm
      idType={idType}
      setIdType={setIdType}
      idDocumentUrl={idDocumentUrl}
      setIdDocumentUrl={setIdDocumentUrl}
      selfieUrl={selfieUrl}
      setSelfieUrl={setSelfieUrl}
      phone={phone}
      setPhone={setPhone}
      onSubmit={handleSubmitDetails}
      submitting={submit.isPending}
    />
  );
}

interface DetailsFormProps {
  idType: IdType;
  setIdType: (v: IdType) => void;
  idDocumentUrl: string;
  setIdDocumentUrl: (v: string) => void;
  selfieUrl: string;
  setSelfieUrl: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

// Top-level (stable) component. Defining this INSIDE SoloVerificationFlow made
// React remount it on every keystroke — which dropped focus from the phone
// input after a single character (looked like focus "jumping" away).
function DetailsForm({
  idType,
  setIdType,
  idDocumentUrl,
  setIdDocumentUrl,
  selfieUrl,
  setSelfieUrl,
  phone,
  setPhone,
  onSubmit,
  submitting,
}: DetailsFormProps) {
  // Mandatory agreement to the Solo Connect terms before identity can be submitted.
  const [agreed, setAgreed] = useState(false);
  // Only flag invalid once the user has typed something, so the field isn't red
  // on first paint. Submit stays disabled until everything is provided + valid.
  const phoneInvalid = phone.length > 0 && !isValidIndianMobile(phone);
  const canSubmit = !!idDocumentUrl && !!selfieUrl && isValidIndianMobile(phone) && agreed;
  return (
    <GlassPanel>
      <Header step={1} title="Identity verification" />
      <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.55)" }}>
        For everyone's safety, Solo Connect requires a one-time identity check. Your documents are private and used only for verification.
      </p>

      <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Government ID type</p>
      <div className="grid grid-cols-2 gap-2 mb-5">
        {ID_TYPES.map((t) => {
          const active = idType === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setIdType(t.value)}
              className="py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: active ? "rgba(185,28,28,0.18)" : "rgba(255,255,255,0.04)",
                border: active ? `1.5px solid ${RED}` : "1.5px solid rgba(255,255,255,0.08)",
                color: active ? "#fff" : "rgba(255,255,255,0.6)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-4 mb-5">
        <UploadField label="Upload Government ID" value={idDocumentUrl} onUploaded={setIdDocumentUrl} />
        <UploadField label="Upload a clear selfie" value={selfieUrl} onUploaded={setSelfieUrl} />
      </div>

      <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Mobile number</p>
      <input
        value={phone}
        onChange={(e) => setPhone(sanitizePhone(e.target.value))}
        placeholder="+91 9876543210"
        inputMode="tel"
        maxLength={13}
        aria-invalid={phoneInvalid}
        className="w-full px-4 py-3 rounded-lg"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: `1px solid ${phoneInvalid ? "rgba(239,68,68,0.7)" : "rgba(255,255,255,0.12)"}`,
          color: "#fff",
        }}
      />
      {phoneInvalid ? (
        <p className="text-xs mt-2 mb-4" style={{ color: "#fca5a5" }}>
          Enter a valid 10-digit mobile number (starting 6–9).
        </p>
      ) : (
        <div className="mb-4" />
      )}

      {/* Mandatory terms agreement — gates submission. */}
      <label
        className="flex items-start gap-3 mb-5 p-3.5 rounded-xl cursor-pointer transition-all"
        style={{
          background: agreed ? "rgba(212,175,55,0.08)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${agreed ? `${GOLD}55` : "rgba(255,255,255,0.1)"}`,
        }}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={agreed}
          onClick={() => setAgreed((v) => !v)}
          className="mt-0.5 h-5 w-5 shrink-0 flex items-center justify-center rounded-md transition-all"
          style={{
            background: agreed ? `linear-gradient(135deg, ${GOLD}, #e0a951)` : "rgba(255,255,255,0.06)",
            border: `1.5px solid ${agreed ? GOLD : "rgba(255,255,255,0.25)"}`,
          }}
        >
          {agreed && <Check className="h-3.5 w-3.5" style={{ color: "#1a1a1a" }} strokeWidth={3} />}
        </button>
        <span className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>
          I confirm my documents are genuine and I have read and agree to the{" "}
          <Link href="/terms" target="_blank" className="underline" style={{ color: GOLD }} onClick={(e) => e.stopPropagation()}>
            Terms &amp; Conditions
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" className="underline" style={{ color: GOLD }} onClick={(e) => e.stopPropagation()}>
            Privacy Policy
          </Link>
          . I understand Solo Connect meetups happen offline at my own risk and that Royvento is not responsible for what happens between members.
        </span>
      </label>

      <PrimaryButton onClick={onSubmit} disabled={submitting || !canSubmit}>
        {submitting ? "Submitting…" : "Submit & continue"}
      </PrimaryButton>
    </GlassPanel>
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

function Header({ step, title }: { step: number; title: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-3">
        <span
          className="flex items-center justify-center h-11 w-11 rounded-2xl shrink-0"
          style={{ background: `linear-gradient(145deg, ${GOLD}26, ${RED}1a)`, border: `1px solid ${GOLD}55`, boxShadow: `0 0 24px ${GOLD}1f` }}
        >
          <ShieldCheck className="h-5 w-5" style={{ color: GOLD }} />
        </span>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: GOLD }}>Step {step} of 2</p>
          <h3 className="font-serif text-xl" style={{ color: "#fff" }}>{title}</h3>
        </div>
      </div>
      {/* progress rail */}
      <div className="flex gap-1.5 mt-4">
        {[1, 2].map((s) => (
          <span key={s} className="h-1 flex-1 rounded-full transition-all"
            style={{ background: s <= step ? `linear-gradient(90deg, ${GOLD}, #e0a951)` : "rgba(255,255,255,0.1)" }} />
        ))}
      </div>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
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
        <span
          className="flex items-center justify-center h-12 w-12 rounded-2xl shrink-0"
          style={{ background: `${accent}1f`, border: `1px solid ${accent}66`, boxShadow: `0 0 26px ${accent}26` }}
        >
          <ShieldCheck className="h-5 w-5" style={{ color: accent }} />
        </span>
        <h3 className="font-serif text-xl" style={{ color: "#fff" }}>{title}</h3>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>{body}</p>
    </GlassPanel>
  );
}
