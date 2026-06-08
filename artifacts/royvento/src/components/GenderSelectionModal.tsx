import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, useSetGender } from "@workspace/api-client-react";

export function GenderSelectionModal() {
  const { data, isLoading } = useGetMe();
  const [selected, setSelected] = useState<"male" | "female" | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const mutation = useSetGender();

  const user = data?.user;
  const open = !isLoading && !!user && !user.genderCompleted && !done;

  // Block ESC key while modal is visible
  const blockEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", blockEsc, true);
    return () => window.removeEventListener("keydown", blockEsc, true);
  }, [open, blockEsc]);

  if (!open) return null;

  function handleContinue() {
    if (!selected) return;
    setError(null);
    mutation.mutate(
      { data: { gender: selected } },
      {
        onSuccess: (result) => {
          // Write updated user (genderCompleted: true) into the cache so the
          // modal never reopens, then set local done flag to close immediately.
          qc.setQueryData(["/api/auth/me"], result);
          setDone(true);
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : "Something went wrong";
          setError(msg);
        },
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Modal panel */}
      <div
        className="relative w-full max-w-md mx-4"
        style={{
          background: "rgba(18,18,18,0.92)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "20px",
          boxShadow: "0 32px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(185,28,28,0.12)",
          backdropFilter: "blur(24px)",
        }}
      >
        {/* Top accent bar */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-px"
          style={{
            width: "60%",
            height: "2px",
            background: "linear-gradient(90deg, transparent, #b91c1c, transparent)",
            borderRadius: "1px",
          }}
        />

        <div className="px-8 pt-10 pb-8 flex flex-col items-center gap-6">
          {/* Logo mark */}
          <div className="flex flex-col items-center gap-3">
            <img
              src="/images/logo-icon.png"
              alt="Royvento"
              className="h-9 w-9 object-contain select-none"
              draggable={false}
            />
            <div className="text-center">
              <h2
                className="text-[22px] font-bold tracking-tight"
                style={{ color: "#fff", letterSpacing: "-0.3px" }}
              >
                Welcome to Royvento
              </h2>
              <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
                One last step before you explore
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="w-full" style={{ height: "1px", background: "rgba(255,255,255,0.06)" }} />

          {/* Prompt */}
          <div className="text-center">
            <p className="text-base font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>
              Select your gender
            </p>
            <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
              This helps us personalise your experience
            </p>
          </div>

          {/* Gender cards */}
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
                    background: isSelected
                      ? "rgba(185,28,28,0.18)"
                      : "rgba(255,255,255,0.04)",
                    border: isSelected
                      ? "1.5px solid rgba(185,28,28,0.7)"
                      : "1.5px solid rgba(255,255,255,0.08)",
                    boxShadow: isSelected
                      ? "0 0 20px rgba(185,28,28,0.2), inset 0 1px 0 rgba(255,255,255,0.06)"
                      : "inset 0 1px 0 rgba(255,255,255,0.04)",
                    transform: isSelected ? "scale(1.02)" : "scale(1)",
                  }}
                >
                  <span style={{ fontSize: "32px", lineHeight: 1 }}>
                    {g === "male" ? "♂" : "♀"}
                  </span>
                  <span
                    className="text-sm font-semibold tracking-wide uppercase"
                    style={{
                      color: isSelected ? "#fff" : "rgba(255,255,255,0.55)",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {g === "male" ? "Male" : "Female"}
                  </span>
                  {isSelected && (
                    <span
                      className="absolute top-3 right-3 flex items-center justify-center w-5 h-5 rounded-full"
                      style={{ background: "#b91c1c" }}
                    >
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path
                          d="M1 4L3.5 6.5L9 1"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Error */}
          {error && (
            <p
              className="w-full text-xs text-center px-3 py-2 rounded-lg"
              style={{ background: "rgba(185,28,28,0.15)", color: "#fca5a5" }}
            >
              {error}
            </p>
          )}

          {/* Continue button */}
          <button
            type="button"
            onClick={handleContinue}
            disabled={!selected || mutation.isPending}
            className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 focus:outline-none"
            style={{
              background: selected ? "#b91c1c" : "rgba(255,255,255,0.06)",
              color: selected ? "#fff" : "rgba(255,255,255,0.25)",
              cursor: selected && !mutation.isPending ? "pointer" : "not-allowed",
              letterSpacing: "0.04em",
              boxShadow: selected ? "0 4px 20px rgba(185,28,28,0.35)" : "none",
            }}
          >
            {mutation.isPending ? "Saving…" : "Continue"}
          </button>

          <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.2)" }}>
            This information is kept private and is never shared publicly.
          </p>
        </div>
      </div>
    </div>
  );
}
