import { CreatePartyWizard } from "@/components/solo-connect/CreatePartyWizard";
import { X, PartyPopper } from "lucide-react";

const GOLD = "#d4af37";
const RED = "#b91c1c";

/**
 * Standalone "Create your own party" modal — the same multi-step wizard used in
 * Solo Connect, lifted into its own shell so the dedicated Private Parties page
 * can host the create flow without the group/activity chooser around it.
 */
export function CreatePartyModal({ city, onClose }: { city: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl p-6 md:p-7"
        style={{
          background: "linear-gradient(180deg, rgba(24,22,26,0.98), rgba(13,12,15,0.98))",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: `0 30px 70px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px ${GOLD}10`,
        }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-2/3" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 h-9 w-9 flex items-center justify-center rounded-full border text-white transition-all hover:scale-110"
          style={{ background: `${RED}33`, borderColor: RED, boxShadow: `0 0 14px ${RED}55` }}
          onMouseEnter={(e) => { e.currentTarget.style.background = RED; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = `${RED}33`; }}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-1">
          <span className="flex items-center justify-center h-10 w-10 rounded-2xl shrink-0"
            style={{ background: `linear-gradient(145deg, ${GOLD}26, ${RED}1a)`, border: `1px solid ${GOLD}44`, boxShadow: `0 0 22px ${GOLD}1f` }}>
            <PartyPopper className="h-5 w-5" style={{ color: GOLD }} />
          </span>
          <h3 className="font-serif text-2xl" style={{ color: "#fff" }}>Create your party</h3>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-6 ml-[3.25rem]">
          {[city, "You're the host", "Discoverable in your city"].map((chip) => (
            <span key={chip} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: `${GOLD}14`, color: GOLD, border: `1px solid ${GOLD}33` }}>{chip}</span>
          ))}
        </div>

        <CreatePartyWizard city={city} onClose={onClose} />
      </div>
    </div>
  );
}
