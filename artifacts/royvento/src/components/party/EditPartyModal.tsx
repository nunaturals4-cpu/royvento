import { useState } from "react";
import { useUpdateParty, type Party } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { uploadImage } from "@/lib/uploadImage";
import { resolveImageMime } from "@workspace/validators";
import { JOIN_TYPES, AGE_GROUPS, DRESS_CODES, PARTY_PREFS } from "@/components/solo-connect/CreatePartyWizard";
import { LocationSelect } from "@/components/LocationSelect";
import { X, Camera, Loader2, Pencil, Plus } from "lucide-react";

const GOLD = "#d4af37";
const RED = "#b91c1c";
const PARTY = "#f472b6";

const IMG_TYPES = ["image/jpeg", "image/png", "image/avif"];
const MAX_BYTES = 5 * 1024 * 1024;
const GALLERY_MAX = 8;

// Creator-only edit modal. Mirrors the wizard's editable fields (name, cover,
// description, category, visibility, location, rules, who-can-join). The server
// re-checks ownership and returns 403 for non-hosts.
export function EditPartyModal({ party, onClose, onSaved }: { party: Party; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const update = useUpdateParty();
  const [uploading, setUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  // Party has no country column — drive the cascade locally (defaults to India).
  const [country, setCountry] = useState("India");
  const [f, setF] = useState({
    name: party.name,
    coverImageUrl: party.coverImageUrl,
    galleryImages: party.galleryImages ?? [],
    description: party.description,
    rules: party.rules,
    category: party.category,
    visibility: party.visibility as "public" | "private",
    organizerName: party.organizerName,
    venueName: party.venueName,
    address: party.address,
    city: party.city,
    state: party.state,
    pinCode: party.pinCode,
    mapLocation: party.mapLocation,
    partyDate: party.partyDate ?? "",
    startTime: party.startTime,
    endTime: party.endTime,
    joinType: party.joinType as (typeof JOIN_TYPES)[number]["value"],
    ageGroup: party.ageGroup,
    dressCode: party.dressCode,
    drinking: party.drinking,
    smoking: party.smoking,
    coupleFriendly: party.coupleFriendly,
    lgbtqFriendly: party.lgbtqFriendly,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function onFile(file: File) {
    if (!IMG_TYPES.includes(resolveImageMime(file))) { toast({ title: "Only JPG, PNG or AVIF.", variant: "destructive" }); return; }
    if (file.size > MAX_BYTES) { toast({ title: "Image must be 5 MB or smaller.", variant: "destructive" }); return; }
    setUploading(true);
    try {
      set("coverImageUrl", await uploadImage(file));
    } catch {
      toast({ title: "Upload failed. Try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function onGalleryFiles(files: FileList) {
    const remaining = GALLERY_MAX - f.galleryImages.length;
    if (remaining <= 0) { toast({ title: `Up to ${GALLERY_MAX} gallery photos.`, variant: "destructive" }); return; }
    const picked = Array.from(files).slice(0, remaining);
    setGalleryUploading(true);
    try {
      for (const file of picked) {
        if (!IMG_TYPES.includes(resolveImageMime(file))) { toast({ title: `Skipped "${file.name}" — JPG/PNG/AVIF only.`, variant: "destructive" }); continue; }
        if (file.size > MAX_BYTES) { toast({ title: `Skipped "${file.name}" — max 5 MB.`, variant: "destructive" }); continue; }
        const url = await uploadImage(file);
        setF((p) => ({ ...p, galleryImages: [...p.galleryImages, url] }));
      }
    } catch {
      toast({ title: "Upload failed. Try again.", variant: "destructive" });
    } finally {
      setGalleryUploading(false);
    }
  }

  const removeGalleryImage = (url: string) =>
    setF((p) => ({ ...p, galleryImages: p.galleryImages.filter((u) => u !== url) }));

  function save() {
    if (f.name.trim().length < 3) { toast({ title: "Party name must be at least 3 characters.", variant: "destructive" }); return; }
    if (!f.organizerName.trim()) { toast({ title: "Organizer name is required.", variant: "destructive" }); return; }
    if (!f.city.trim()) { toast({ title: "City is required.", variant: "destructive" }); return; }
    update.mutate(
      {
        id: party.id,
        data: {
          name: f.name.trim(),
          coverImageUrl: f.coverImageUrl,
          galleryImages: f.galleryImages,
          description: f.description.trim(),
          rules: f.rules.trim(),
          category: f.category,
          visibility: f.visibility,
          organizerName: f.organizerName.trim(),
          venueName: f.venueName.trim(),
          address: f.address.trim(),
          city: f.city.trim(),
          state: f.state.trim(),
          pinCode: f.pinCode.trim(),
          mapLocation: f.mapLocation.trim(),
          partyDate: f.partyDate,
          startTime: f.startTime,
          endTime: f.endTime,
          joinType: f.joinType,
          ageGroup: f.ageGroup as any,
          dressCode: f.dressCode as any,
          drinking: f.drinking as any,
          smoking: f.smoking as any,
          coupleFriendly: f.coupleFriendly as any,
          lgbtqFriendly: f.lgbtqFriendly as any,
        },
      },
      {
        onSuccess: () => { toast({ title: "Party updated." }); onSaved(); },
        onError: (e) => toast({ title: e instanceof Error ? e.message : "Could not save", variant: "destructive" }),
      },
    );
  }

  const field = "w-full px-3.5 py-2.5 rounded-lg text-sm";
  const fieldStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" } as const;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)" }}>
      <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl p-6 md:p-7"
        style={{ background: "linear-gradient(180deg, rgba(24,22,26,0.98), rgba(13,12,15,0.98))", border: "1px solid rgba(255,255,255,0.08)", boxShadow: `0 30px 70px rgba(0,0,0,0.7), 0 0 0 1px ${GOLD}10` }}>
        <button type="button" onClick={onClose} aria-label="Close"
          className="absolute top-4 right-4 h-9 w-9 flex items-center justify-center rounded-full border text-white transition-all hover:scale-110"
          style={{ background: `${RED}33`, borderColor: RED }}>
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <span className="flex items-center justify-center h-10 w-10 rounded-2xl shrink-0" style={{ background: `${PARTY}1f`, border: `1px solid ${PARTY}44` }}>
            <Pencil className="h-5 w-5" style={{ color: PARTY }} />
          </span>
          <h3 className="font-serif text-2xl" style={{ color: "#fff" }}>Edit party</h3>
        </div>

        <div className="space-y-4">
          {/* Cover */}
          <div>
            <p className="text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Cover image</p>
            <label className="block w-full rounded-2xl overflow-hidden cursor-pointer transition-all hover:brightness-110"
              style={{ border: `1.5px dashed ${f.coverImageUrl ? PARTY : "rgba(255,255,255,0.2)"}` }}>
              <input type="file" accept="image/jpeg,image/png,image/avif" className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file); e.currentTarget.value = ""; }} />
              {f.coverImageUrl ? (
                <div className="relative">
                  <img src={f.coverImageUrl} alt="" className="w-full h-44 object-cover" />
                  <span className="absolute bottom-2 right-2 text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}>
                    <Camera className="h-3 w-3" /> Change
                  </span>
                </div>
              ) : (
                <div className="h-44 flex flex-col items-center justify-center gap-2">
                  {uploading ? <Loader2 className="h-6 w-6 animate-spin" style={{ color: PARTY }} /> : <Camera className="h-6 w-6" style={{ color: PARTY }} />}
                  <span className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>{uploading ? "Uploading…" : "Upload cover"}</span>
                </div>
              )}
            </label>
          </div>

          {/* Gallery */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                Photo gallery <span style={{ color: "rgba(255,255,255,0.35)" }}>(optional · up to {GALLERY_MAX})</span>
              </p>
              {f.galleryImages.length > 0 && <span className="text-[11px]" style={{ color: PARTY }}>{f.galleryImages.length}/{GALLERY_MAX}</span>}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {f.galleryImages.map((url) => (
                <div key={url} className="relative rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                  <img src={url} alt="" className="w-full h-20 object-cover" />
                  <button type="button" onClick={() => removeGalleryImage(url)} aria-label="Remove photo"
                    className="absolute top-1 right-1 h-6 w-6 flex items-center justify-center rounded-full transition-all hover:scale-110"
                    style={{ background: "rgba(0,0,0,0.7)", color: "#fff", border: `1px solid ${RED}66` }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {f.galleryImages.length < GALLERY_MAX && (
                <label className="h-20 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-all hover:brightness-110"
                  style={{ border: "1.5px dashed rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.03)" }}>
                  <input type="file" accept="image/jpeg,image/png,image/avif" multiple className="hidden"
                    onChange={(e) => { if (e.target.files?.length) onGalleryFiles(e.target.files); e.currentTarget.value = ""; }} />
                  {galleryUploading ? <Loader2 className="h-5 w-5 animate-spin" style={{ color: PARTY }} /> : <Plus className="h-5 w-5" style={{ color: PARTY }} />}
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>{galleryUploading ? "Uploading…" : "Add"}</span>
                </label>
              )}
            </div>
          </div>

          <input className={field} style={fieldStyle} placeholder="Party name" value={f.name} onChange={(e) => set("name", e.target.value)} />
          <input className={field} style={fieldStyle} placeholder="Organizer name (Hosted by)" value={f.organizerName} onChange={(e) => set("organizerName", e.target.value)} />
          <textarea className={field} style={fieldStyle} rows={3} placeholder="Description" value={f.description} onChange={(e) => set("description", e.target.value)} />
          <textarea className={field} style={fieldStyle} rows={2} placeholder="House rules" value={f.rules} onChange={(e) => set("rules", e.target.value)} />

          {/* Who can join */}
          <div>
            <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Who can join</p>
            <div className="grid grid-cols-3 gap-2">
              {JOIN_TYPES.map((o) => {
                const active = f.joinType === o.value;
                return (
                  <button key={o.value} type="button" onClick={() => set("joinType", o.value)}
                    className="py-2.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: active ? `${PARTY}1f` : "rgba(255,255,255,0.04)", border: `1px solid ${active ? PARTY : "rgba(255,255,255,0.12)"}`, color: active ? "#fff" : "rgba(255,255,255,0.7)" }}>
                    {o.badge}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Visibility */}
          <div>
            <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Visibility</p>
            <div className="grid grid-cols-2 gap-2">
              {(["public", "private"] as const).map((v) => {
                const active = f.visibility === v;
                return (
                  <button key={v} type="button" onClick={() => set("visibility", v)}
                    className="py-2.5 rounded-lg text-sm font-medium capitalize transition-all"
                    style={{ background: active ? `${GOLD}1f` : "rgba(255,255,255,0.04)", border: `1px solid ${active ? GOLD : "rgba(255,255,255,0.12)"}`, color: active ? "#fff" : "rgba(255,255,255,0.7)" }}>
                    {v}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
              {f.visibility === "private"
                ? "Stays listed, but only people with your invite link can book."
                : "Listed for everyone — anyone can book."}
            </p>
          </div>

          {/* Location */}
          <input className={field} style={fieldStyle} placeholder="Venue name" value={f.venueName} onChange={(e) => set("venueName", e.target.value)} />
          <textarea className={field} style={fieldStyle} rows={2} placeholder="Full address" value={f.address} onChange={(e) => set("address", e.target.value)} />
          <LocationSelect
            compact
            country={country}
            state={f.state}
            city={f.city}
            onChange={(n) => { setCountry(n.country); setF((p) => ({ ...p, state: n.state, city: n.city })); }}
          />
          <input className={field} style={fieldStyle} placeholder="Pin code" value={f.pinCode} onChange={(e) => set("pinCode", e.target.value)} />
          <input className={field} style={fieldStyle} placeholder="Google Maps link (optional)" value={f.mapLocation} onChange={(e) => set("mapLocation", e.target.value)} />

          {/* Date & time */}
          <div>
            <p className="text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Date & time</p>
            <div className="grid grid-cols-3 gap-2">
              <input className={field} style={fieldStyle} type="date" value={f.partyDate} onChange={(e) => set("partyDate", e.target.value)} />
              <input className={field} style={fieldStyle} type="time" value={f.startTime} onChange={(e) => set("startTime", e.target.value)} />
              <input className={field} style={fieldStyle} type="time" value={f.endTime} onChange={(e) => set("endTime", e.target.value)} />
            </div>
          </div>

          {/* Age group */}
          <div>
            <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Age group <span style={{ color: "rgba(255,255,255,0.35)" }}>(optional)</span></p>
            <div className="grid grid-cols-3 gap-2">
              {AGE_GROUPS.map((a) => {
                const active = f.ageGroup === a;
                return (
                  <button key={a} type="button" onClick={() => set("ageGroup", active ? "" : a)}
                    className="py-2.5 rounded-lg text-sm font-medium transition-all"
                    style={{ background: active ? `${GOLD}1f` : "rgba(255,255,255,0.04)", border: `1px solid ${active ? GOLD : "rgba(255,255,255,0.12)"}`, color: active ? "#fff" : "rgba(255,255,255,0.7)" }}>
                    {a}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preferences */}
          <div>
            <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Preferences</p>
            <div className="space-y-2">
              {PARTY_PREFS.map((p) => {
                const val = f[p.key];
                return (
                  <div key={p.key} className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <span className="text-sm" style={{ color: "rgba(255,255,255,0.82)" }}>{p.label}?</span>
                    <div className="flex gap-1.5">
                      {(["yes", "no"] as const).map((opt) => {
                        const active = val === opt;
                        const accent = opt === "yes" ? "#4ade80" : RED;
                        return (
                          <button key={opt} type="button" onClick={() => set(p.key, active ? "" : opt)}
                            className="px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all"
                            style={{ background: active ? `${accent}1f` : "rgba(255,255,255,0.04)", border: `1px solid ${active ? accent : "rgba(255,255,255,0.1)"}`, color: active ? "#fff" : "rgba(255,255,255,0.7)" }}>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dress code */}
          <div>
            <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Dress code <span style={{ color: "rgba(255,255,255,0.35)" }}>(optional)</span></p>
            <div className="grid grid-cols-2 gap-2">
              {DRESS_CODES.map((d) => {
                const active = f.dressCode === d.value;
                return (
                  <button key={d.value} type="button" onClick={() => set("dressCode", active ? "" : d.value)}
                    className="py-2.5 rounded-lg text-sm font-medium transition-all"
                    style={{ background: active ? `${PARTY}1f` : "rgba(255,255,255,0.04)", border: `1px solid ${active ? PARTY : "rgba(255,255,255,0.12)"}`, color: active ? "#fff" : "rgba(255,255,255,0.7)" }}>
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-3.5 rounded-xl text-sm font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.15)" }}>
              Cancel
            </button>
            <button type="button" onClick={save} disabled={update.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
              style={{ background: `linear-gradient(135deg, ${PARTY}, #db2777)`, color: "#fff", opacity: update.isPending ? 0.6 : 1 }}>
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {update.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
