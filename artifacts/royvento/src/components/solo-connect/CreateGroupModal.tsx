import { useState, useRef, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateSoloGroup, useListSoloVenues } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useSelectedCity } from "@/components/LocationContext";
import { LocationSelect } from "@/components/LocationSelect";
import { X, Search, ChevronDown, Check, Plus } from "lucide-react";

const GOLD = "#d4af37";
const RED = "#b91c1c";

const ACTIVITY_TYPES = [
  { value: "nightlife", label: "Nightlife", hint: "Pub Crawl · DJ Night" },
  { value: "happy_hours", label: "Happy Hours", hint: "Happy Hour deals" },
  { value: "food_drinks", label: "Food & Drinks", hint: "Dining · Bar offers" },
  { value: "events", label: "Events", hint: "Concert · Comedy · Live" },
  { value: "games", label: "Games", hint: "Bowling · VR · Arcade" },
  { value: "activities", label: "Activities", hint: "Sports Screening · Trivia" },
] as const;

type ActivityType = (typeof ACTIVITY_TYPES)[number]["value"];

const ACTIVITY_ACCENT: Record<string, string> = {
  nightlife: "#a78bfa",
  happy_hours: "#fbbf24",
  food_drinks: "#fb7185",
  events: "#60a5fa",
  games: "#34d399",
  activities: "#fb923c",
};

interface VenueOption {
  id: number;
  name: string;
  /** which id (if any) to link on the group: vendorId / eventId / none. */
  kind: "vendor" | "event" | "game";
  sub?: string;
}

// Searchable venue picker. The option source depends on the activity type:
// "events" → events in the city; everything else → venues (pubs/clubs/partners).
// A typed name that matches nothing is still usable via the "Use …" row, so
// game zones / activity spots not yet listed never block group creation.
function VenueSelect({
  activityType,
  value,
  onSelect,
}: {
  activityType: ActivityType;
  value: string;
  onSelect: (name: string, vendorId?: number, eventId?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const isEventy = activityType === "events" || activityType === "activities";
  const isGames = activityType === "games";
  const noun = isGames ? "game venues" : isEventy ? "events" : "venues";

  // Single endpoint whose data source CHANGES by activity type (vendors /
  // drink-deal venues / food-offer venues / events / games), so the dropdown
  // genuinely differs per type.
  const { data: venues } = useListSoloVenues(
    { activityType },
    { query: { retry: false } as any },
  );

  const options: VenueOption[] = useMemo(
    () => (venues ?? []).map((v) => ({ id: v.id, name: v.name, kind: v.kind as VenueOption["kind"], sub: v.sub })),
    [venues],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    return options.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 50);
  }, [options, search]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const trimmed = search.trim();
  const exactMatch = options.some((o) => o.name.toLowerCase() === trimmed.toLowerCase());

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: value ? "#fff" : "rgba(255,255,255,0.4)" }}
      >
        <span className="truncate">{value || "Select a venue"}</span>
        <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "rgba(255,255,255,0.4)" }} />
      </button>

      {open && (
        <div
          className="absolute z-20 left-0 right-0 mt-1 rounded-xl overflow-hidden"
          style={{ background: "rgba(22,22,26,0.99)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 18px 40px rgba(0,0,0,0.6)" }}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
            <Search className="h-4 w-4 shrink-0" style={{ color: "rgba(255,255,255,0.4)" }} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${noun}…`}
              className="w-full bg-transparent text-sm outline-none"
              style={{ color: "#fff" }}
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.map((o) => (
              <button
                key={`${o.kind}-${o.id}`}
                type="button"
                onClick={() => {
                  onSelect(o.name, o.kind === "vendor" ? o.id : undefined, o.kind === "event" ? o.id : undefined);
                  setOpen(false);
                  setSearch("");
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/[0.06]"
              >
                <span className="min-w-0">
                  <span className="block text-sm truncate" style={{ color: "#fff" }}>{o.name}</span>
                  {o.sub && <span className="block text-[10px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{o.sub}</span>}
                </span>
                {value === o.name && <Check className="h-4 w-4 shrink-0" style={{ color: GOLD }} />}
              </button>
            ))}

            {filtered.length === 0 && !trimmed && (
              <p className="px-3 py-3 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                No {noun} yet. Type a name to add it.
              </p>
            )}

            {/* Custom free-typed venue — covers spots not yet listed. */}
            {trimmed && !exactMatch && (
              <button
                type="button"
                onClick={() => {
                  onSelect(trimmed, undefined, undefined);
                  setOpen(false);
                  setSearch("");
                }}
                className="w-full px-3 py-2 text-left hover:bg-white/[0.06] border-t border-white/10"
              >
                <span className="text-sm" style={{ color: GOLD }}>Use “{trimmed}”</span>
                <span className="block text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>Custom venue name</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const GENDER_TYPES = [
  { value: "mixed", label: "Mixed" },
  { value: "male", label: "Men" },
  { value: "female", label: "Women" },
] as const;
type GenderType = (typeof GENDER_TYPES)[number]["value"];

export function CreateGroupModal({
  city,
  onClose,
}: {
  city: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const create = useCreateSoloGroup();

  const [name, setName] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("nightlife");
  const [activityLabel, setActivityLabel] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueVendorId, setVenueVendorId] = useState<number | undefined>(undefined);
  const [venueEventId, setVenueEventId] = useState<number | undefined>(undefined);
  const [groupDate, setGroupDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [description, setDescription] = useState("");
  const [maxMembers, setMaxMembers] = useState(8);
  // Non-gating vibe label — anyone can join any group regardless.
  const [genderType, setGenderType] = useState<GenderType>("mixed");
  // public → anyone can request to join; private → invite-link only (still listed).
  const [visibility, setVisibility] = useState<"public" | "private">("public");

  // Country / state / city — prefilled from the detected location, editable so
  // the group's location is explicit. State drives state-based discovery.
  const { selectedState } = useSelectedCity();
  const [groupCountry, setGroupCountry] = useState("India");
  const [groupState, setGroupState] = useState(selectedState || "");
  const [groupCity, setGroupCity] = useState(city || "");

  function pickActivity(value: ActivityType) {
    setActivityType(value);
    // Venue options differ per activity type — clear any prior selection.
    setVenueName("");
    setVenueVendorId(undefined);
    setVenueEventId(undefined);
  }

  function submit() {
    if (name.trim().length < 3) {
      toast({ title: "Group name must be at least 3 characters.", variant: "destructive" });
      return;
    }
    if (!groupCity.trim()) {
      toast({ title: "Please enter the group's city.", variant: "destructive" });
      return;
    }
    create.mutate(
      {
        data: {
          name: name.trim(),
          activityType,
          activityLabel: activityLabel.trim(),
          venueName: venueName.trim(),
          vendorId: venueVendorId,
          eventId: venueEventId,
          groupDate: groupDate || undefined,
          startTime: startTime || undefined,
          description: description.trim(),
          maxMembers,
          visibility,
          genderType,
          city: groupCity.trim(),
          state: groupState.trim() || undefined,
          country: groupCountry.trim() || "India",
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Group created!" });
          // Match the generated list query key by predicate (it isn't a clean
          // "/api/..." string), so the new group appears without a manual reload.
          qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].includes("solo-connect") });
          onClose();
        },
        onError: (e) =>
          toast({ title: e instanceof Error ? e.message : "Could not create group", variant: "destructive" }),
      },
    );
  }

  const field = "w-full px-3.5 py-2.5 rounded-lg text-sm";
  const fieldStyle = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#fff",
  } as const;

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
            <Plus className="h-5 w-5" style={{ color: GOLD }} />
          </span>
          <h3 className="font-serif text-2xl" style={{ color: "#fff" }}>Create a group</h3>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-6 ml-[3.25rem]">
          {[city, "Open to everyone", "3–15 members"].map((chip) => (
            <span key={chip} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: `${GOLD}14`, color: GOLD, border: `1px solid ${GOLD}33` }}>{chip}</span>
          ))}
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>Activity type</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ACTIVITY_TYPES.map((a) => {
                const active = activityType === a.value;
                const accent = ACTIVITY_ACCENT[a.value] ?? GOLD;
                return (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => pickActivity(a.value)}
                    className="text-left p-3 rounded-xl transition-all"
                    style={{
                      background: active ? `${accent}1f` : "rgba(255,255,255,0.04)",
                      border: active ? `1.5px solid ${accent}` : "1.5px solid rgba(255,255,255,0.08)",
                      boxShadow: active ? `0 0 18px ${accent}33` : "none",
                    }}
                  >
                    <p className="text-sm font-semibold" style={{ color: active ? "#fff" : "rgba(255,255,255,0.72)" }}>{a.label}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: active ? `${accent}` : "rgba(255,255,255,0.4)" }}>{a.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <input className={field} style={fieldStyle} placeholder="Group name (e.g. Pub Crawl Tonight)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={field} style={fieldStyle} placeholder="Activity label (optional)" value={activityLabel} onChange={(e) => setActivityLabel(e.target.value)} />

          <div>
            <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Venue</p>
            <VenueSelect
              activityType={activityType}
              value={venueName}
              onSelect={(vname, vendorId, eventId) => {
                setVenueName(vname);
                setVenueVendorId(vendorId);
                setVenueEventId(eventId);
              }}
            />
          </div>

          <div>
            <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Location <span style={{ color: "rgba(255,255,255,0.35)" }}>— people in your state can discover this group</span></p>
            <LocationSelect
              compact
              country={groupCountry}
              state={groupState}
              city={groupCity}
              onChange={(n) => { setGroupCountry(n.country); setGroupState(n.state); setGroupCity(n.city); }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input className={field} style={fieldStyle} type="date" value={groupDate} onChange={(e) => setGroupDate(e.target.value)} />
            <input className={field} style={fieldStyle} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>

          <textarea className={field} style={fieldStyle} rows={3} placeholder="Describe the plan…" value={description} onChange={(e) => setDescription(e.target.value)} />

          <div>
            <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Group vibe (anyone can still join)</p>
            <div className="grid grid-cols-3 gap-2">
              {GENDER_TYPES.map((gt) => {
                const active = genderType === gt.value;
                return (
                  <button
                    key={gt.value}
                    type="button"
                    onClick={() => setGenderType(gt.value)}
                    className="py-2.5 rounded-lg text-sm transition-all"
                    style={{
                      background: active ? `${GOLD}1f` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${active ? GOLD : "rgba(255,255,255,0.12)"}`,
                      color: active ? "#fff" : "rgba(255,255,255,0.7)",
                    }}
                  >
                    {gt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Max members: <span style={{ color: GOLD }}>{maxMembers}</span></p>
            <input type="range" min={3} max={15} value={maxMembers} onChange={(e) => setMaxMembers(Number(e.target.value))} className="w-full" style={{ accentColor: RED }} />
          </div>

          {/* Public vs Private (invite-only). Both stay listed for discovery. */}
          <div>
            <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Visibility</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "public", label: "Public", sub: "Anyone can request to join" },
                { value: "private", label: "Private", sub: "Invite link only" },
              ] as const).map((o) => {
                const active = visibility === o.value;
                return (
                  <button key={o.value} type="button" onClick={() => setVisibility(o.value)}
                    className="text-left p-3 rounded-xl transition-all"
                    style={{
                      background: active ? `${GOLD}1f` : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${active ? GOLD : "rgba(255,255,255,0.08)"}`,
                      boxShadow: active ? `0 0 18px ${GOLD}33` : "none",
                    }}>
                    <p className="text-sm font-semibold" style={{ color: active ? "#fff" : "rgba(255,255,255,0.72)" }}>{o.label}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: active ? GOLD : "rgba(255,255,255,0.4)" }}>{o.sub}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={create.isPending}
              className="flex-1 py-3.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
              style={{ background: `linear-gradient(135deg, ${RED}, #d23a2a)`, color: "#fff", boxShadow: `0 10px 28px ${RED}4d`, opacity: create.isPending ? 0.6 : 1 }}
            >
              {create.isPending ? "Creating…" : "Create group"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
