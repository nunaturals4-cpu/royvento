import { Flame, Zap, Ticket, Clock } from "lucide-react";

// ── Happening Tonight — partner visibility controls ─────────────────────────
// Shared, fully-controlled fieldset embedded in every partner listing editor
// (pub/club events, organizer events, games). Lets a partner opt their listing
// in/out of the real-time "Happening Tonight" discovery feed, set the tonight
// session window, and flag a last-minute deal. See HappeningTonight.tsx.

export interface TonightVisibilityValue {
  startTime: string;
  endTime: string;
  happeningTonight: boolean;
  startingSoon: boolean;
  lastMinuteDeal: boolean;
  dealLabel: string;
}

export const defaultTonightVisibility: TonightVisibilityValue = {
  startTime: "",
  endTime: "",
  happeningTonight: true,
  startingSoon: true,
  lastMinuteDeal: false,
  dealLabel: "",
};

function Toggle({
  label, description, icon, checked, onChange,
}: {
  label: string; description: string; icon: React.ReactNode; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
        checked ? "border-primary/50 bg-primary/10" : "border-white/10 bg-white/3 hover:bg-white/5"
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${checked ? "bg-primary/20 text-primary" : "bg-white/5 text-white/40"}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{label}</span>
        <span className="block text-xs text-white/50">{description}</span>
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

export function TonightVisibilityFields({
  value, onChange, showTimes = true,
}: {
  value: TonightVisibilityValue;
  onChange: (v: TonightVisibilityValue) => void;
  /** Hide the start/end time inputs when the listing already has them elsewhere. */
  showTimes?: boolean;
}) {
  const set = <K extends keyof TonightVisibilityValue>(k: K, v: TonightVisibilityValue[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="rounded-2xl border border-primary/15 bg-black/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Flame className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold text-white">Happening Tonight visibility</h4>
      </div>
      <p className="text-xs text-white/50 -mt-1">
        Control how this listing appears in Royvento's real-time "Happening Tonight" discovery feed.
      </p>

      {showTimes && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs text-white/60 mb-1 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Tonight starts</span>
            <input
              type="time"
              value={value.startTime}
              onChange={(e) => set("startTime", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-white/60 mb-1 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Tonight ends</span>
            <input
              type="time"
              value={value.endTime}
              onChange={(e) => set("endTime", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
            />
          </label>
        </div>
      )}

      <div className="space-y-2">
        <Toggle
          label="Show in Happening Tonight"
          description="List this in the real-time tonight feed"
          icon={<Flame className="h-4 w-4" />}
          checked={value.happeningTonight}
          onChange={(v) => set("happeningTonight", v)}
        />
        <Toggle
          label="Show in Starting Soon"
          description="Surface when it's starting within a few hours"
          icon={<Zap className="h-4 w-4" />}
          checked={value.startingSoon}
          onChange={(v) => set("startingSoon", v)}
        />
        <Toggle
          label="Last-Minute Deal"
          description="Free entry, cover discount, happy hour or flash offer"
          icon={<Ticket className="h-4 w-4" />}
          checked={value.lastMinuteDeal}
          onChange={(v) => set("lastMinuteDeal", v)}
        />
      </div>

      {value.lastMinuteDeal && (
        <label className="block">
          <span className="block text-xs text-white/60 mb-1">Deal label (shown on the card)</span>
          <input
            type="text"
            maxLength={120}
            value={value.dealLabel}
            onChange={(e) => set("dealLabel", e.target.value)}
            placeholder="e.g. Free entry before 9 PM · 30% off VR"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50"
          />
        </label>
      )}
    </div>
  );
}
