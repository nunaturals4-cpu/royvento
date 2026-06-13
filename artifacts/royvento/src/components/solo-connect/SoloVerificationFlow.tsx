import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSoloVerification,
  useSubmitSoloVerification,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Check, ChevronDown } from "lucide-react";

const GOLD = "#d4af37";
const RED = "#b91c1c";

const ID_TYPES = [
  { value: "aadhaar", label: "Aadhaar" },
  { value: "passport", label: "Passport" },
  { value: "driving_license", label: "Driving License" },
  { value: "voter_id", label: "Voter ID" },
] as const;

type IdType = (typeof ID_TYPES)[number]["value"];

export function SoloVerificationFlow() {
  const { data: verification } = useGetSoloVerification();
  const qc = useQueryClient();
  const { toast } = useToast();

  // Empty until the user picks one — the ID-number field only appears after a
  // government ID type is selected.
  const [idType, setIdType] = useState<IdType | "">("");
  const [idNumber, setIdNumber] = useState("");

  const submit = useSubmitSoloVerification();

  const status = verification?.status ?? "none";
  const hasRecord = !!verification && status !== "none";

  function refresh() {
    qc.invalidateQueries({ queryKey: ["/api/solo-connect/verification"] });
    qc.invalidateQueries({ queryKey: ["/api/solo-connect/access"] });
  }

  function handleSubmitDetails() {
    if (!idType) {
      toast({ title: "Select your government ID type.", variant: "destructive" });
      return;
    }
    if (!idNumber.trim()) {
      toast({ title: "Enter your government ID number.", variant: "destructive" });
      return;
    }
    submit.mutate(
      { data: { idType, idNumber: idNumber.trim() } },
      {
        onSuccess: () => {
          toast({ title: "Identity submitted. Your details are now under review." });
          refresh();
        },
        onError: () => toast({ title: "Could not submit. Try again.", variant: "destructive" }),
      },
    );
  }

  // Approved users never see this component (page routes them onward).
  // Under-review state:
  if (hasRecord && status === "pending") {
    return (
      <ReviewCard
        tone="pending"
        title="Identity under review"
        body="Thanks — we've received your details. Our safety team is reviewing your identity. You'll get access to Solo Connect once approved."
      />
    );
  }
  if (status === "rejected") {
    return (
      <div className="space-y-4">
        <ReviewCard
          tone="rejected"
          title="Verification rejected"
          body={verification?.rejectionReason || "Your verification could not be approved. Please re-submit with correct details."}
        />
        <DetailsForm
          idType={idType}
          setIdType={setIdType}
          idNumber={idNumber}
          setIdNumber={setIdNumber}
          onSubmit={handleSubmitDetails}
          submitting={submit.isPending}
        />
      </div>
    );
  }

  // No record yet — show the details form.
  return (
    <DetailsForm
      idType={idType}
      setIdType={setIdType}
      idNumber={idNumber}
      setIdNumber={setIdNumber}
      onSubmit={handleSubmitDetails}
      submitting={submit.isPending}
    />
  );
}

interface DetailsFormProps {
  idType: IdType | "";
  setIdType: (v: IdType | "") => void;
  idNumber: string;
  setIdNumber: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

// Top-level (stable) component. Defining this INSIDE SoloVerificationFlow made
// React remount it on every keystroke — which dropped focus from inputs.
function DetailsForm({
  idType,
  setIdType,
  idNumber,
  setIdNumber,
  onSubmit,
  submitting,
}: DetailsFormProps) {
  // Mandatory agreement to the Solo Connect terms before identity can be submitted.
  const [agreed, setAgreed] = useState(false);
  const canSubmit = !!idType && !!idNumber.trim() && agreed;
  return (
    <GlassPanel>
      <Header title="Identity verification" />
      <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.55)" }}>
        For everyone's safety, Solo Connect requires a one-time identity check. Your details are private and used only for verification.
      </p>

      <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Government ID type</p>
      <div className="relative mb-5">
        <select
          value={idType}
          onChange={(e) => setIdType(e.target.value as IdType | "")}
          className="w-full appearance-none px-4 py-3 rounded-lg text-sm pr-10"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${idType ? `${GOLD}55` : "rgba(255,255,255,0.12)"}`,
            color: idType ? "#fff" : "rgba(255,255,255,0.5)",
          }}
        >
          <option value="" disabled style={{ color: "#000" }}>
            Select government ID
          </option>
          {ID_TYPES.map((t) => (
            <option key={t.value} value={t.value} style={{ color: "#000" }}>
              {t.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4"
          style={{ color: "rgba(255,255,255,0.5)" }}
        />
      </div>

      {/* ID number field appears only once an ID type is selected. */}
      {idType && (
        <div className="mb-5">
          <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>
            {ID_TYPES.find((t) => t.value === idType)?.label} number
          </p>
          <input
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            placeholder="Enter your ID number"
            className="w-full px-4 py-3 rounded-lg"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#fff",
            }}
          />
        </div>
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
          I confirm my details are genuine and I have read and agree to the{" "}
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

function Header({ title }: { title: string }) {
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
          <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: GOLD }}>Verification</p>
          <h3 className="font-serif text-xl" style={{ color: "#fff" }}>{title}</h3>
        </div>
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
