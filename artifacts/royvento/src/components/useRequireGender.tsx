import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, useSetGender } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

const RED = "#b91c1c";

/**
 * Gate an action behind a known binary gender (male/female).
 *
 * `ensureGender(run)` runs `run()` immediately when the logged-in user already
 * has male/female on file (set at registration/login or a previous prompt);
 * otherwise it opens a male/female picker, saves the choice, and THEN runs the
 * action. Used before joining a Solo Connect group or booking a party so the
 * gender that drives 👨/👩 counts and gender-gated entry is always present.
 *
 * Render `modal` somewhere in the component tree to show the picker.
 */
export function useRequireGender() {
  const { data: me } = useGetMe({ query: { retry: false } as any });
  const qc = useQueryClient();
  const setGender = useSetGender();
  const [open, setOpen] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);

  const gender = me?.user?.gender;
  const hasGender = gender === "male" || gender === "female";

  const ensureGender = useCallback(
    (run: () => void) => {
      if (gender === "male" || gender === "female") {
        run();
        return;
      }
      pendingRef.current = run;
      setOpen(true);
    },
    [gender],
  );

  const cancel = () => {
    pendingRef.current = null;
    setOpen(false);
  };

  const pick = (g: "male" | "female") => {
    setGender.mutate(
      { data: { gender: g } },
      {
        onSuccess: (result) => {
          // Keep the shared me-cache in sync so the prompt never re-triggers.
          qc.setQueryData(["/api/auth/me"], result);
          setOpen(false);
          const run = pendingRef.current;
          pendingRef.current = null;
          run?.();
        },
      },
    );
  };

  const modal = open ? (
    <GenderPromptModal saving={setGender.isPending} onPick={pick} onClose={cancel} />
  ) : null;

  return { ensureGender, modal, hasGender };
}

function GenderPromptModal({
  saving,
  onPick,
  onClose,
}: {
  saving: boolean;
  onPick: (g: "male" | "female") => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<"male" | "female" | null>(null);
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="relative w-full max-w-md"
        style={{
          background: "rgba(18,18,18,0.95)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "20px",
          boxShadow: "0 32px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(185,28,28,0.12)",
        }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-px" style={{ width: "60%", height: "2px", background: `linear-gradient(90deg, transparent, ${RED}, transparent)` }} />
        <div className="px-8 pt-9 pb-7 flex flex-col items-center gap-6">
          <div className="text-center">
            <h2 className="text-[20px] font-bold tracking-tight" style={{ color: "#fff" }}>One quick step</h2>
            <p className="mt-1.5 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
              Select your gender to continue. We only ask once.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 w-full">
            {(["male", "female"] as const).map((g) => {
              const isSelected = selected === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setSelected(g)}
                  className="relative flex flex-col items-center gap-3 py-7 px-4 rounded-xl transition-all duration-200 select-none focus:outline-none"
                  style={{
                    background: isSelected ? "rgba(185,28,28,0.18)" : "rgba(255,255,255,0.04)",
                    border: isSelected ? "1.5px solid rgba(185,28,28,0.7)" : "1.5px solid rgba(255,255,255,0.08)",
                    transform: isSelected ? "scale(1.02)" : "scale(1)",
                  }}
                >
                  <span style={{ fontSize: "32px", lineHeight: 1 }}>{g === "male" ? "♂" : "♀"}</span>
                  <span className="text-sm font-semibold tracking-wide uppercase" style={{ color: isSelected ? "#fff" : "rgba(255,255,255,0.55)", letterSpacing: "0.08em" }}>
                    {g === "male" ? "Male" : "Female"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex gap-3 w-full">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => selected && onPick(selected)}
              disabled={!selected || saving}
              className="flex-1 py-3.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
              style={{ background: selected ? RED : "rgba(255,255,255,0.06)", color: selected ? "#fff" : "rgba(255,255,255,0.25)", boxShadow: selected ? "0 4px 20px rgba(185,28,28,0.35)" : "none" }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Saving…" : "Continue"}
            </button>
          </div>
          <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.25)" }}>
            Kept private — shown only as an aggregate count.
          </p>
        </div>
      </div>
    </div>
  );
}
