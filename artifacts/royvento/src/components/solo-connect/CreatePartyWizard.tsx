import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateParty } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useSelectedCity } from "@/components/LocationContext";
import { LocationSelect } from "@/components/LocationSelect";
import { uploadImage } from "@/lib/uploadImage";
import {
  Camera,
  MapPin,
  Ticket,
  User,
  CalendarDays,
  Sparkles,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Navigation,
  Pencil,
  PartyPopper,
  IndianRupee,
  Users,
  UsersRound,
  Plus,
  X,
  SlidersHorizontal,
} from "lucide-react";

// Who-Can-Join options with display badges (gender-gated server-side).
export const JOIN_TYPES = [
  { value: "male_only", label: "Male Only", badge: "👨 Male Only" },
  { value: "female_only", label: "Female Only", badge: "👩 Female Only" },
  { value: "mixed", label: "Mixed", badge: "👨👩 Mixed" },
] as const;
export type JoinType = (typeof JOIN_TYPES)[number]["value"];
export const joinBadge = (jt: string) => JOIN_TYPES.find((j) => j.value === jt)?.badge ?? "👨👩 Mixed";

// Optional vibe metadata — shared with the profile display.
export const AGE_GROUPS = ["18-25", "25-35", "35+"] as const;
export const DRESS_CODES = [
  { value: "casual", label: "Casual" },
  { value: "smart_casual", label: "Smart Casual" },
  { value: "black_theme", label: "Black Theme" },
  { value: "white_theme", label: "White Theme" },
] as const;
export const prettyDressCode = (v: string) => DRESS_CODES.find((d) => d.value === v)?.label ?? "";
// Yes/No preference toggles.
export const PARTY_PREFS = [
  { key: "drinking", label: "Drinking" },
  { key: "smoking", label: "Smoking" },
  { key: "coupleFriendly", label: "Couple Friendly" },
  { key: "lgbtqFriendly", label: "LGBTQ+ Friendly" },
] as const;

const GOLD = "#d4af37";
const RED = "#b91c1c";
const PARTY = "#d4af37";

// Cover photo constraints per the create-party workflow (JPG/PNG, ≤5 MB).
const PARTY_IMAGE_TYPES = ["image/jpeg", "image/png"];
const PARTY_MAX_BYTES = 5 * 1024 * 1024;

const DESC_MIN = 50;
const DESC_MAX = 1000;

type TicketType = "" | "free" | "paid";

// Optional gallery cap — keeps uploads reasonable and the grid tidy.
const GALLERY_MAX = 8;

interface PartyForm {
  name: string;
  coverImageUrl: string;
  galleryImages: string[];
  venueName: string;
  address: string;
  country: string;
  state: string;
  city: string;
  pinCode: string;
  mapLocation: string;
  ticketType: TicketType;
  ticketPrice: string;
  capacity: string;
  organizerName: string;
  joinType: JoinType | "";
  groupDate: string;
  startTime: string;
  endTime: string;
  description: string;
  rules: string;
  ageGroup: string;
  dressCode: string;
  drinking: string;
  smoking: string;
  coupleFriendly: string;
  lgbtqFriendly: string;
}

const STEPS = [
  { key: "photo", label: "Photo", icon: Camera },
  { key: "location", label: "Location", icon: MapPin },
  { key: "ticket", label: "Ticket", icon: Ticket },
  { key: "organizer", label: "Organizer", icon: User },
  { key: "audience", label: "Who Can Join", icon: UsersRound },
  { key: "preferences", label: "Preferences", icon: SlidersHorizontal },
  { key: "datetime", label: "Date & Time", icon: CalendarDays },
  { key: "describe", label: "Describe", icon: Sparkles },
  { key: "review", label: "Review", icon: Check },
] as const;

/**
 * "Create Your Own Party" multi-step wizard. Every field is mandatory; the user
 * cannot advance past a step until it validates. The final review summarises the
 * party before publishing. Renders inside the CreateGroupModal shell.
 */
export function CreatePartyWizard({ city, onClose }: { city: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { detectLocation, detecting } = useSelectedCity();
  const create = useCreateParty();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [step, setStep] = useState(0);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<PartyForm>({
    name: "",
    coverImageUrl: "",
    galleryImages: [],
    venueName: "",
    address: "",
    country: "India",
    state: "",
    city: city || "",
    pinCode: "",
    mapLocation: "",
    ticketType: "",
    ticketPrice: "",
    capacity: "",
    organizerName: "",
    joinType: "",
    groupDate: "",
    startTime: "",
    endTime: "",
    description: "",
    rules: "",
    ageGroup: "",
    dressCode: "",
    drinking: "",
    smoking: "",
    coupleFriendly: "",
    lgbtqFriendly: "",
  });

  const set = <K extends keyof PartyForm>(k: K, v: PartyForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Per-step validation → returns an error message (shown via toast) or null.
  function validateStep(s: number): string | null {
    const f = form;
    switch (STEPS[s]!.key) {
      case "photo":
        if (f.name.trim().length < 3) return "Please give your party a name (min 3 characters).";
        if (!f.coverImageUrl) return "Please upload a party cover photo.";
        return null;
      case "location":
        // Google Maps link is optional; the rest of the location is required.
        if (!f.venueName.trim() || !f.address.trim() || !f.city.trim() || !f.pinCode.trim())
          return "Please complete your party location.";
        return null;
      case "ticket":
        if (f.ticketType !== "free" && f.ticketType !== "paid") return "Please choose Free or Paid ticket.";
        if (f.ticketType === "paid") {
          if (!(Number(f.ticketPrice) > 0)) return "Please enter a ticket price.";
          if (!(Number(f.capacity) > 0)) return "Please enter the total capacity.";
        }
        return null;
      case "organizer":
        if (!f.organizerName.trim()) return "Please enter organizer name.";
        return null;
      case "audience":
        if (f.joinType !== "male_only" && f.joinType !== "female_only" && f.joinType !== "mixed")
          return "Please choose who can join your party.";
        return null;
      case "datetime":
        if (!f.groupDate || !f.startTime || !f.endTime) return "Please select party date and time.";
        return null;
      case "describe":
        if (f.description.trim().length < DESC_MIN) return "Describe your plan so people know what to expect.";
        return null;
      default:
        return null;
    }
  }

  function next() {
    const err = validateStep(step);
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  const back = () => setStep((s) => Math.max(s - 1, 0));

  async function handleFile(file: File) {
    if (!PARTY_IMAGE_TYPES.includes(file.type)) {
      toast({ title: "Only JPG or PNG images are supported.", variant: "destructive" });
      return;
    }
    if (file.size > PARTY_MAX_BYTES) {
      toast({ title: "Image must be 5 MB or smaller.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadImage(file);
      set("coverImageUrl", url);
    } catch {
      toast({ title: "Could not upload the photo. Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  // Optional gallery — multi-select, validated + uploaded one by one, capped.
  async function handleGalleryFiles(files: FileList) {
    const remaining = GALLERY_MAX - form.galleryImages.length;
    if (remaining <= 0) {
      toast({ title: `You can add up to ${GALLERY_MAX} gallery photos.`, variant: "destructive" });
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    setGalleryUploading(true);
    try {
      for (const file of picked) {
        if (!PARTY_IMAGE_TYPES.includes(file.type)) {
          toast({ title: `Skipped "${file.name}" — only JPG or PNG.`, variant: "destructive" });
          continue;
        }
        if (file.size > PARTY_MAX_BYTES) {
          toast({ title: `Skipped "${file.name}" — must be 5 MB or smaller.`, variant: "destructive" });
          continue;
        }
        const url = await uploadImage(file);
        setForm((f) => ({ ...f, galleryImages: [...f.galleryImages, url] }));
      }
    } catch {
      toast({ title: "Could not upload one of the photos.", variant: "destructive" });
    } finally {
      setGalleryUploading(false);
    }
  }

  const removeGalleryImage = (url: string) =>
    setForm((f) => ({ ...f, galleryImages: f.galleryImages.filter((u) => u !== url) }));

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast({ title: "Location is not available on this device.", variant: "destructive" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        set("mapLocation", `https://www.google.com/maps?q=${latitude},${longitude}`);
        toast({ title: "Map location captured." });
      },
      () => toast({ title: "Couldn't get your location. Paste a Google Maps link instead.", variant: "destructive" }),
    );
  }

  function publish() {
    // Final guard — re-run every step's validation before publishing.
    for (let i = 0; i < STEPS.length - 1; i++) {
      const err = validateStep(i);
      if (err) {
        toast({ title: "Please complete all required fields before publishing your party.", variant: "destructive" });
        setStep(i);
        return;
      }
    }
    create.mutate(
      {
        data: {
          name: form.name.trim(),
          category: "party",
          visibility: "public",
          coverImageUrl: form.coverImageUrl,
          galleryImages: form.galleryImages,
          description: form.description.trim(),
          rules: form.rules.trim(),
          venueName: form.venueName.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          pinCode: form.pinCode.trim(),
          mapLocation: form.mapLocation.trim(),
          partyDate: form.groupDate,
          startTime: form.startTime,
          endTime: form.endTime,
          joinType: (form.joinType || "mixed") as JoinType,
          organizerName: form.organizerName.trim(),
          ticketType: form.ticketType === "" ? "free" : form.ticketType,
          ticketPrice: form.ticketType === "paid" ? Number(form.ticketPrice) : undefined,
          capacity: form.ticketType === "paid" ? Number(form.capacity) : undefined,
          ageGroup: (form.ageGroup || undefined) as any,
          dressCode: (form.dressCode || undefined) as any,
          drinking: (form.drinking || undefined) as any,
          smoking: (form.smoking || undefined) as any,
          coupleFriendly: (form.coupleFriendly || undefined) as any,
          lgbtqFriendly: (form.lgbtqFriendly || undefined) as any,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "🎉 Party Created Successfully!", description: "Your party is now live for people to discover." });
          // Refresh any party + solo-connect lists (generated keys aren't clean strings).
          qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0].includes("create-your-party") || q.queryKey[0].includes("solo-connect")) });
          onClose();
        },
        onError: (e) =>
          toast({ title: e instanceof Error ? e.message : "Could not create party", variant: "destructive" }),
      },
    );
  }

  const isReview = STEPS[step]!.key === "review";

  return (
    <div className="space-y-5">
      <StepIndicator step={step} />

      <div className="min-h-[260px]">
        {STEPS[step]!.key === "photo" && (
          <PhotoStep
            form={form}
            set={set}
            uploading={uploading}
            fileRef={fileRef}
            onPick={() => fileRef.current?.click()}
            onFile={handleFile}
            galleryRef={galleryRef}
            galleryUploading={galleryUploading}
            onPickGallery={() => galleryRef.current?.click()}
            onGalleryFiles={handleGalleryFiles}
            onRemoveGallery={removeGalleryImage}
          />
        )}
        {STEPS[step]!.key === "location" && (
          <LocationStep form={form} set={set} onUseCurrent={useCurrentLocation} detecting={detecting} detectLocation={detectLocation} />
        )}
        {STEPS[step]!.key === "ticket" && <TicketStep form={form} set={set} />}
        {STEPS[step]!.key === "organizer" && <OrganizerStep form={form} set={set} />}
        {STEPS[step]!.key === "audience" && <AudienceStep form={form} set={set} />}
        {STEPS[step]!.key === "preferences" && <PreferencesStep form={form} set={set} />}
        {STEPS[step]!.key === "datetime" && <DateTimeStep form={form} set={set} />}
        {STEPS[step]!.key === "describe" && <DescribeStep form={form} set={set} />}
        {isReview && <ReviewStep form={form} goto={setStep} />}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-1">
        {step > 0 ? (
          <button
            type="button"
            onClick={back}
            className="flex items-center justify-center gap-1.5 px-5 py-3.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            Cancel
          </button>
        )}

        {isReview ? (
          <button
            type="button"
            onClick={publish}
            disabled={create.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
            style={{ background: `linear-gradient(135deg, ${RED}, #d23a2a)`, color: "#fff", boxShadow: `0 10px 28px ${RED}4d`, opacity: create.isPending ? 0.6 : 1 }}
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PartyPopper className="h-4 w-4" />}
            {create.isPending ? "Publishing…" : "Publish Party"}
          </button>
        ) : (
          <button
            type="button"
            onClick={next}
            className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
            style={{ background: `linear-gradient(135deg, ${RED}, #d23a2a)`, color: "#fff", boxShadow: `0 10px 28px ${RED}40` }}
          >
            Continue <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const done = i < step;
        const active = i === step;
        const Icon = s.icon;
        return (
          <div key={s.key} className="flex items-center gap-1.5 flex-1 last:flex-none">
            <span
              className="flex items-center justify-center h-7 w-7 rounded-full shrink-0 transition-all"
              style={{
                background: active ? PARTY : done ? `${PARTY}33` : "rgba(255,255,255,0.05)",
                border: `1px solid ${active || done ? PARTY : "rgba(255,255,255,0.12)"}`,
                color: active ? "#fff" : done ? PARTY : "rgba(255,255,255,0.45)",
              }}
              title={s.label}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
            </span>
            {i < STEPS.length - 1 && (
              <span className="h-px flex-1 rounded" style={{ background: done ? PARTY : "rgba(255,255,255,0.1)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Shared field styling ───────────────────────────────────────────────────
const field = "w-full px-3.5 py-2.5 rounded-lg text-sm";
const fieldStyle = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#fff",
} as const;

function StepHeading({ icon: Icon, title, hint }: { icon: typeof Camera; title: string; hint: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="flex items-center justify-center h-10 w-10 rounded-2xl shrink-0"
        style={{ background: `${PARTY}1f`, border: `1px solid ${PARTY}44`, boxShadow: `0 0 22px ${PARTY}1f` }}>
        <Icon className="h-5 w-5" style={{ color: PARTY }} />
      </span>
      <div>
        <h4 className="font-serif text-xl leading-tight" style={{ color: "#fff" }}>{title}</h4>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>{hint}</p>
      </div>
    </div>
  );
}

type SetFn = <K extends keyof PartyForm>(k: K, v: PartyForm[K]) => void;

function PhotoStep({
  form,
  set,
  uploading,
  fileRef,
  onPick,
  onFile,
  galleryRef,
  galleryUploading,
  onPickGallery,
  onGalleryFiles,
  onRemoveGallery,
}: {
  form: PartyForm;
  set: SetFn;
  uploading: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onPick: () => void;
  onFile: (f: File) => void;
  galleryRef: React.RefObject<HTMLInputElement | null>;
  galleryUploading: boolean;
  onPickGallery: () => void;
  onGalleryFiles: (files: FileList) => void;
  onRemoveGallery: (url: string) => void;
}) {
  const galleryFull = form.galleryImages.length >= GALLERY_MAX;
  return (
    <div>
      <StepHeading icon={Camera} title="Upload party photo" hint="JPG or PNG · 4:5 or 1:1 · max 5 MB" />
      <input className={`${field} mb-3`} style={fieldStyle} placeholder="Party name (e.g. Rooftop EDM Night)" value={form.name} onChange={(e) => set("name", e.target.value)} />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }}
      />
      <button
        type="button"
        onClick={onPick}
        className="w-full rounded-2xl overflow-hidden transition-all hover:brightness-110"
        style={{ border: `1.5px dashed ${form.coverImageUrl ? PARTY : "rgba(255,255,255,0.2)"}` }}
      >
        {form.coverImageUrl ? (
          <div className="relative">
            <img src={form.coverImageUrl} alt="Party cover" className="w-full h-56 object-cover" />
            <span className="absolute bottom-2 right-2 text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1"
              style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}>
              <Camera className="h-3 w-3" /> Change photo
            </span>
          </div>
        ) : (
          <div className="h-56 flex flex-col items-center justify-center gap-2">
            {uploading ? (
              <Loader2 className="h-7 w-7 animate-spin" style={{ color: PARTY }} />
            ) : (
              <Camera className="h-7 w-7" style={{ color: PARTY }} />
            )}
            <span className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
              {uploading ? "Uploading…" : "Tap to upload your cover photo"}
            </span>
          </div>
        )}
      </button>

      {/* Optional photo gallery — shown to guests below the hero on the party page. */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
            Photo gallery <span style={{ color: "rgba(255,255,255,0.35)" }}>(optional · up to {GALLERY_MAX})</span>
          </p>
          {form.galleryImages.length > 0 && (
            <span className="text-[11px]" style={{ color: PARTY }}>{form.galleryImages.length}/{GALLERY_MAX}</span>
          )}
        </div>
        <input
          ref={galleryRef}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) onGalleryFiles(e.target.files); e.currentTarget.value = ""; }}
        />
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {form.galleryImages.map((url) => (
            <div key={url} className="relative group rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
              <img src={url} alt="Party gallery" className="w-full h-20 object-cover" />
              <button
                type="button"
                onClick={() => onRemoveGallery(url)}
                aria-label="Remove photo"
                className="absolute top-1 right-1 h-6 w-6 flex items-center justify-center rounded-full transition-all hover:scale-110"
                style={{ background: "rgba(0,0,0,0.7)", color: "#fff", border: `1px solid ${RED}66` }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {!galleryFull && (
            <button
              type="button"
              onClick={onPickGallery}
              disabled={galleryUploading}
              className="h-20 rounded-xl flex flex-col items-center justify-center gap-1 transition-all hover:brightness-110"
              style={{ border: "1.5px dashed rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.03)" }}
            >
              {galleryUploading ? (
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: PARTY }} />
              ) : (
                <Plus className="h-5 w-5" style={{ color: PARTY }} />
              )}
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                {galleryUploading ? "Uploading…" : "Add photos"}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LocationStep({
  form,
  set,
  onUseCurrent,
  detecting,
  detectLocation,
}: {
  form: PartyForm;
  set: SetFn;
  onUseCurrent: () => void;
  detecting: boolean;
  detectLocation: () => Promise<boolean>;
}) {
  return (
    <div>
      <StepHeading icon={MapPin} title="Party location" hint="Where is your party happening?" />
      <div className="space-y-3">
        <input className={field} style={fieldStyle} placeholder="Venue name" value={form.venueName} onChange={(e) => set("venueName", e.target.value)} />
        <textarea className={field} style={fieldStyle} rows={2} placeholder="Full address" value={form.address} onChange={(e) => set("address", e.target.value)} />
        <LocationSelect
          compact
          country={form.country}
          state={form.state}
          city={form.city}
          onChange={(n) => { set("country", n.country); set("state", n.state); set("city", n.city); }}
        />
        <input className={field} style={fieldStyle} placeholder="Pin code" inputMode="numeric" value={form.pinCode} onChange={(e) => set("pinCode", e.target.value)} />
        <input className={field} style={fieldStyle} placeholder="Google Maps link or coordinates (optional)" value={form.mapLocation} onChange={(e) => set("mapLocation", e.target.value)} />
        <button
          type="button"
          onClick={() => { void detectLocation(); onUseCurrent(); }}
          disabled={detecting}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-all"
          style={{ background: `${PARTY}14`, color: PARTY, border: `1px solid ${PARTY}40`, opacity: detecting ? 0.6 : 1 }}
        >
          <Navigation className="h-3.5 w-3.5" /> Use my current location
        </button>
      </div>
    </div>
  );
}

function TicketStep({ form, set }: { form: PartyForm; set: SetFn }) {
  return (
    <div>
      <StepHeading icon={Ticket} title="Ticket type" hint="Free entry or a paid ticket?" />
      <div className="grid grid-cols-2 gap-3 mb-4">
        {([
          { value: "free", label: "Free Entry", sub: "₹0 · open to all" },
          { value: "paid", label: "Paid Ticket", sub: "Set a price & capacity" },
        ] as const).map((o) => {
          const active = form.ticketType === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => set("ticketType", o.value)}
              className="text-left p-4 rounded-2xl transition-all"
              style={{
                background: active ? `${PARTY}1f` : "rgba(255,255,255,0.04)",
                border: active ? `1.5px solid ${PARTY}` : "1.5px solid rgba(255,255,255,0.08)",
                boxShadow: active ? `0 0 18px ${PARTY}33` : "none",
              }}
            >
              <p className="text-sm font-semibold" style={{ color: active ? "#fff" : "rgba(255,255,255,0.75)" }}>{o.label}</p>
              <p className="text-[11px] mt-0.5" style={{ color: active ? PARTY : "rgba(255,255,255,0.4)" }}>{o.sub}</p>
            </button>
          );
        })}
      </div>

      {form.ticketType === "paid" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Ticket price (₹)</p>
            <div className="relative">
              <IndianRupee className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.4)" }} />
              <input className={`${field} pl-9`} style={fieldStyle} type="number" min={1} placeholder="499" value={form.ticketPrice} onChange={(e) => set("ticketPrice", e.target.value)} />
            </div>
          </div>
          <div>
            <p className="text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Total capacity</p>
            <div className="relative">
              <Users className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.4)" }} />
              <input className={`${field} pl-9`} style={fieldStyle} type="number" min={1} placeholder="50" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrganizerStep({ form, set }: { form: PartyForm; set: SetFn }) {
  return (
    <div>
      <StepHeading icon={User} title="Organizer information" hint="Who's hosting this party?" />
      <input className={field} style={fieldStyle} placeholder="Organizer name (e.g. Rahul Sharma)" value={form.organizerName} onChange={(e) => set("organizerName", e.target.value)} />
      {form.organizerName.trim() && (
        <p className="text-xs mt-2.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Hosted by: <span style={{ color: PARTY }}>{form.organizerName.trim()}</span>
        </p>
      )}
    </div>
  );
}

function AudienceStep({ form, set }: { form: PartyForm; set: SetFn }) {
  return (
    <div>
      <StepHeading icon={UsersRound} title="Who can join?" hint="This decides who can book — enforced at checkout." />
      <div className="grid gap-2.5">
        {JOIN_TYPES.map((o) => {
          const active = form.joinType === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => set("joinType", o.value)}
              className="flex items-center justify-between p-4 rounded-2xl transition-all text-left"
              style={{
                background: active ? `${PARTY}1f` : "rgba(255,255,255,0.04)",
                border: active ? `1.5px solid ${PARTY}` : "1.5px solid rgba(255,255,255,0.08)",
                boxShadow: active ? `0 0 18px ${PARTY}33` : "none",
              }}
            >
              <span className="text-sm font-semibold" style={{ color: active ? "#fff" : "rgba(255,255,255,0.78)" }}>{o.label}</span>
              <span className="text-lg">{o.badge.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreferencesStep({ form, set }: { form: PartyForm; set: SetFn }) {
  const chip = (active: boolean, accent: string) => ({
    background: active ? `${accent}1f` : "rgba(255,255,255,0.04)",
    border: `1.5px solid ${active ? accent : "rgba(255,255,255,0.1)"}`,
    color: active ? "#fff" : "rgba(255,255,255,0.7)",
  });
  return (
    <div>
      <StepHeading icon={SlidersHorizontal} title="Party preferences" hint="All optional — helps the right crowd find your party." />

      {/* Age group */}
      <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Age group <span style={{ color: "rgba(255,255,255,0.35)" }}>(optional)</span></p>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {AGE_GROUPS.map((a) => {
          const active = form.ageGroup === a;
          return (
            <button key={a} type="button" onClick={() => set("ageGroup", active ? "" : a)}
              className="py-2.5 rounded-xl text-sm font-medium transition-all" style={chip(active, GOLD)}>
              {a}
            </button>
          );
        })}
      </div>

      {/* Yes/No preferences */}
      <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Preferences</p>
      <div className="space-y-2 mb-5">
        {PARTY_PREFS.map((p) => {
          const val = form[p.key];
          return (
            <div key={p.key} className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <span className="text-sm" style={{ color: "rgba(255,255,255,0.82)" }}>{p.label}?</span>
              <div className="flex gap-1.5">
                {(["yes", "no"] as const).map((opt) => {
                  const active = val === opt;
                  const accent = opt === "yes" ? "#4ade80" : RED;
                  return (
                    <button key={opt} type="button" onClick={() => set(p.key, active ? "" : opt)}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all" style={chip(active, accent)}>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dress code */}
      <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Dress code <span style={{ color: "rgba(255,255,255,0.35)" }}>(optional)</span></p>
      <div className="grid grid-cols-2 gap-2">
        {DRESS_CODES.map((d) => {
          const active = form.dressCode === d.value;
          return (
            <button key={d.value} type="button" onClick={() => set("dressCode", active ? "" : d.value)}
              className="py-2.5 rounded-xl text-sm font-medium transition-all" style={chip(active, PARTY)}>
              {d.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DateTimeStep({ form, set }: { form: PartyForm; set: SetFn }) {
  return (
    <div>
      <StepHeading icon={CalendarDays} title="Date & time" hint="When does your party start and end?" />
      <div className="space-y-3">
        <div>
          <p className="text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Party date</p>
          <input className={field} style={fieldStyle} type="date" value={form.groupDate} onChange={(e) => set("groupDate", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Start time</p>
            <input className={field} style={fieldStyle} type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
          </div>
          <div>
            <p className="text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>End time</p>
            <input className={field} style={fieldStyle} type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DescribeStep({ form, set }: { form: PartyForm; set: SetFn }) {
  const len = form.description.trim().length;
  return (
    <div>
      <StepHeading icon={Sparkles} title="Describe your plan" hint="Pub hopping · birthday bash · EDM after-party…" />
      <textarea
        className={field}
        style={fieldStyle}
        rows={5}
        maxLength={DESC_MAX}
        placeholder="Tell people what to expect — the vibe, the plan, who should come…"
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
      />
      <p className="text-[11px] mt-1.5 text-right" style={{ color: len < DESC_MIN ? "#fca5a5" : "rgba(255,255,255,0.45)" }}>
        {len < DESC_MIN ? `${DESC_MIN - len} more characters needed` : `${len}/${DESC_MAX}`}
      </p>
      <p className="text-xs mt-4 mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>House rules <span style={{ color: "rgba(255,255,255,0.35)" }}>(optional)</span></p>
      <textarea
        className={field}
        style={fieldStyle}
        rows={3}
        maxLength={1000}
        placeholder="e.g. No outside drinks · Smart casual · 21+ only"
        value={form.rules}
        onChange={(e) => set("rules", e.target.value)}
      />
    </div>
  );
}

function ReviewStep({ form, goto }: { form: PartyForm; goto: (s: number) => void }) {
  const rows = useMemo(
    () => [
      { label: "Party name", value: form.name, step: 0 },
      { label: "Organizer", value: `Hosted by: ${form.organizerName}`, step: 3 },
      { label: "Who can join", value: joinBadge(form.joinType || "mixed"), step: 4 },
      { label: "Location", value: `${form.venueName}, ${form.address}, ${form.city} ${form.pinCode}`, step: 1 },
      { label: "Date & time", value: `${form.groupDate} · ${form.startTime}–${form.endTime}`, step: 5 },
      {
        label: "Ticket",
        value: form.ticketType === "paid" ? `Paid · ₹${form.ticketPrice} · ${form.capacity} seats` : "Free entry",
        step: 2,
      },
      { label: "Description", value: form.description, step: 6 },
    ],
    [form],
  );

  return (
    <div>
      <StepHeading icon={Check} title="Review your party" hint="Check the details, then publish." />
      {form.coverImageUrl && (
        <img src={form.coverImageUrl} alt="Party cover" className="w-full h-40 object-cover rounded-xl mb-2" />
      )}
      {form.galleryImages.length > 0 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto">
          {form.galleryImages.map((url) => (
            <img key={url} src={url} alt="" className="h-14 w-14 object-cover rounded-lg shrink-0" style={{ border: "1px solid rgba(255,255,255,0.1)" }} />
          ))}
        </div>
      )}
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-3 p-3 rounded-xl"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: PARTY }}>{r.label}</p>
              <p className="text-sm break-words" style={{ color: "rgba(255,255,255,0.85)" }}>{r.value}</p>
            </div>
            <button
              type="button"
              onClick={() => goto(r.step)}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg"
              style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
