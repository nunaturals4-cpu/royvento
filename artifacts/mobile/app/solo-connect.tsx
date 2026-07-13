import { resolveImageUrl } from "@/lib/resolveImageUrl";
import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, Stack } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { uploadImageToStorage } from "@/lib/uploadImage";

// ─── Types (mirror the SoloConnect API responses) ────────────────────────────
interface SoloAccess {
  eligible: boolean;
  reason: string;
  premium: boolean;
  verificationStatus: "none" | "draft" | "pending" | "approved" | "rejected";
  gender: string | null;
  banned: boolean;
  suspendedUntil: string | null;
}
interface SoloVerification {
  status: string;
  phoneVerified: boolean;
  rejectionReason: string;
}
interface SoloGroup {
  id: number;
  name: string;
  activityType: string;
  activityLabel?: string;
  venueName: string;
  city: string;
  status: string;
  maxMembers: number;
  memberCount: number;
  menCount: number;
  womenCount: number;
  myMembershipStatus: string | null;
  isAdmin?: boolean;
  description?: string;
  groupDate?: string;
  startTime?: string;
}
interface SoloMessage {
  id: number;
  userName: string;
  body: string;
  isMine: boolean;
}
interface SoloVenueOption {
  id: number;
  name: string;
  kind: "vendor" | "event" | "game";
  sub?: string;
}
interface SoloMember {
  id: number;
  userId: number;
  userName: string;
  gender: string | null;
  role: string;
  status: string;
}

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;
type Gender = (typeof GENDERS)[number]["value"];

const REPORT_REASONS = [
  { value: "harassment", label: "Harassment" },
  { value: "fake_profile", label: "Fake profile" },
  { value: "abuse", label: "Abuse" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate behaviour" },
  { value: "safety", label: "Safety concern" },
  { value: "other", label: "Other" },
] as const;

function toE164(raw: string): string | null {
  const t = raw.replace(/[\s-]/g, "");
  if (/^\+\d{8,15}$/.test(t)) return t;
  if (/^\d{10}$/.test(t)) return `+91${t}`;
  return null;
}

export default function SoloConnectScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [access, setAccess] = useState<SoloAccess | null>(null);
  const [verification, setVerification] = useState<SoloVerification | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const a = await customFetch<SoloAccess>("/api/solo-connect/access");
      setAccess(a);
      if (a.eligible && a.verificationStatus !== "approved") {
        const v = await customFetch<SoloVerification | null>("/api/solo-connect/verification");
        setVerification(v);
      }
    } catch {
      setAccess(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  let body: React.ReactNode;
  if (loading) {
    body = <ActivityIndicator color={c.primary} style={{ marginTop: 60 }} />;
  } else if (!access) {
    body = <Notice c={c} icon="lock-closed" title="Sign in required" text="Log in to access Solo Connector." />;
  } else if (!access.eligible) {
    body = <Notice c={c} icon="star" title="Premium feature" text="Upgrade to Royvento Premium to use Solo Connector." />;
  } else if (access.banned) {
    body = <Notice c={c} icon="ban" title="Access banned" text="Your Solo Connector access has been revoked." />;
  } else if (access.suspendedUntil) {
    body = <Notice c={c} icon="time" title="Access suspended" text={`Suspended until ${new Date(access.suspendedUntil).toLocaleDateString()}.`} />;
  } else if (access.verificationStatus === "approved") {
    body = <ApprovedView c={c} />;
  } else if (access.verificationStatus === "pending") {
    body = <Notice c={c} icon="hourglass" title="Verification under review" text="Our safety team is reviewing your profile. You'll be notified once approved." />;
  } else {
    body = (
      <OnboardingWizard
        c={c}
        startPhoneVerified={!!verification?.phoneVerified}
        rejectionReason={access.verificationStatus === "rejected" ? verification?.rejectionReason : undefined}
        onDone={refresh}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: "Solo Connector", headerStyle: { backgroundColor: c.background }, headerTintColor: c.text }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 90 }}>
        {body}
      </ScrollView>
    </View>
  );
}

// ─── Onboarding wizard ────────────────────────────────────────────────────────
function OnboardingWizard({
  c,
  startPhoneVerified,
  rejectionReason,
  onDone,
}: {
  c: ReturnType<typeof useColors>;
  startPhoneVerified: boolean;
  rejectionReason?: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState<"phone" | "otp" | "selfie" | "gender" | "consent">(startPhoneVerified ? "selfie" : "phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [selfieUri, setSelfieUri] = useState("");
  const [selfieUrl, setSelfieUrl] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [camOn, setCamOn] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  async function sendCode() {
    if (!toE164(phone)) { Alert.alert("Enter a valid mobile number"); return; }
    setStep("otp");
  }

  async function verifyCode() {
    const e164 = toE164(phone);
    if (!e164) return;
    if (code.trim().length < 4) { Alert.alert("Enter the code"); return; }
    setBusy(true);
    try {
      // NOTE: mobile uses the dev-stub token. Real Firebase Phone Auth on native
      // requires @react-native-firebase/auth + a native build (follow-up).
      await customFetch("/api/solo-connect/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: `dev:${e164}` }),
      });
      setStep("selfie");
    } catch (e) {
      Alert.alert("Verification failed", (e as Error).message || "Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function enableCamera() {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) { Alert.alert("Camera permission is required", "We only allow a live selfie — no gallery uploads."); return; }
    }
    setCamOn(true);
  }

  async function capture() {
    setBusy(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.6 });
      if (!photo?.uri) throw new Error("Capture failed");
      setSelfieUri(photo.uri);
      setCamOn(false);
      const url = await uploadImageToStorage(photo.uri, "image/jpeg");
      // Store relative path so the API's path validator accepts it.
      setSelfieUrl(url.replace(/^https?:\/\/[^/]+/, ""));
    } catch (e) {
      Alert.alert("Could not capture selfie", (e as Error).message || "Try again.");
      setSelfieUri("");
    } finally {
      setBusy(false);
    }
  }

  async function submitAll() {
    if (!selfieUrl || !gender || !agreed) return;
    setBusy(true);
    try {
      await customFetch("/api/solo-connect/verification/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selfieUrl, gender, consent: true }),
      });
      Alert.alert("Submitted", "Your verification is under review.");
      onDone();
    } catch (e) {
      Alert.alert("Could not submit", (e as Error).message || "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: "700", marginBottom: 4 }}>Get verified</Text>
      <Text style={{ color: c.mutedForeground, marginBottom: 16 }}>Phone → selfie → gender → consent.</Text>

      {rejectionReason ? (
        <View style={{ backgroundColor: "#3a0d0d", borderColor: c.red, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 }}>
          <Text style={{ color: c.redLight }}>{rejectionReason}</Text>
        </View>
      ) : null}

      {step === "phone" && (
        <Card c={c}>
          <Label c={c}>Your mobile number</Label>
          <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91 90000 00000" placeholderTextColor={c.mutedForeground}
            style={inputStyle(c)} />
          <PrimaryBtn c={c} label="Send code" onPress={sendCode} />
        </Card>
      )}

      {step === "otp" && (
        <Card c={c}>
          <Label c={c}>Enter the code sent to {toE164(phone)}</Label>
          <TextInput value={code} onChangeText={(t) => setCode(t.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={8} placeholder="123456" placeholderTextColor={c.mutedForeground}
            style={[inputStyle(c), { textAlign: "center", letterSpacing: 6 }]} />
          <Pressable onPress={() => setStep("phone")}><Text style={{ color: c.mutedForeground, marginBottom: 10 }}>Change number</Text></Pressable>
          <PrimaryBtn c={c} label={busy ? "Verifying…" : "Verify"} onPress={verifyCode} disabled={busy} />
        </Card>
      )}

      {step === "selfie" && (
        <Card c={c}>
          <Label c={c}>Take a live selfie (camera only — no gallery)</Label>
          <View style={{ width: 220, height: 220, alignSelf: "center", borderRadius: 18, overflow: "hidden", backgroundColor: c.muted, marginBottom: 12, borderColor: c.border, borderWidth: 1 }}>
            {selfieUri ? (
              <Image source={{ uri: resolveImageUrl(selfieUri) }} style={{ width: "100%", height: "100%" }} />
            ) : camOn ? (
              <CameraView ref={cameraRef} style={{ flex: 1 }} facing="front" />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="camera" size={40} color={c.mutedForeground} />
              </View>
            )}
          </View>
          {!camOn && !selfieUri && <PrimaryBtn c={c} label="Enable camera" onPress={enableCamera} />}
          {camOn && <PrimaryBtn c={c} label={busy ? "Saving…" : "Capture"} onPress={capture} disabled={busy} />}
          {selfieUri ? (
            <>
              <SecondaryBtn c={c} label="Retake" onPress={() => { setSelfieUri(""); setSelfieUrl(""); setCamOn(true); }} />
              <PrimaryBtn c={c} label="Continue" onPress={() => setStep("gender")} disabled={!selfieUrl || busy} />
            </>
          ) : null}
        </Card>
      )}

      {step === "gender" && (
        <Card c={c}>
          <Label c={c}>How do you identify?</Label>
          {GENDERS.map((g) => (
            <TouchableOpacity key={g.value} onPress={() => setGender(g.value)}
              style={{ padding: 14, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: gender === g.value ? c.primary : c.border, backgroundColor: gender === g.value ? c.accent : c.muted }}>
              <Text style={{ color: c.text }}>{g.label}</Text>
            </TouchableOpacity>
          ))}
          <PrimaryBtn c={c} label="Continue" onPress={() => gender && setStep("consent")} disabled={!gender} />
        </Card>
      )}

      {step === "consent" && (
        <Card c={c}>
          <Label c={c}>Before you join</Label>
          <Text style={{ color: c.mutedForeground, fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
            Royvento only provides a platform to discover and join social groups. Royvento does not organize, supervise, or take responsibility for what happens after you join. You participate entirely at your own risk and are responsible for your own safety. Royvento is not responsible for any disputes, misconduct, transactions, injuries, losses, or incidents during or after meeting members.
          </Text>
          <TouchableOpacity onPress={() => setAgreed((v) => !v)} style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
            <Ionicons name={agreed ? "checkbox" : "square-outline"} size={22} color={agreed ? c.primary : c.mutedForeground} />
            <Text style={{ color: c.text, marginLeft: 8, flex: 1, fontSize: 12 }}>I agree to the Terms, Privacy Policy and Community Guidelines, and understand I meet members at my own risk.</Text>
          </TouchableOpacity>
          <Pressable onPress={() => router.push("/community-guidelines" as any)}><Text style={{ color: c.primary, marginBottom: 12, fontSize: 12 }}>Read Community Guidelines</Text></Pressable>
          <PrimaryBtn c={c} label={busy ? "Submitting…" : "Submit for review"} onPress={submitAll} disabled={busy || !agreed} />
        </Card>
      )}
    </View>
  );
}

// ─── Approved view: group list + join + report ───────────────────────────────
function ApprovedView({ c }: { c: ReturnType<typeof useColors> }) {
  const [city, setCity] = useState("");
  const [groups, setGroups] = useState<SoloGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    if (!city.trim()) return;
    setLoading(true);
    try {
      const g = await customFetch<SoloGroup[]>(`/api/solo-connect/groups?city=${encodeURIComponent(city.trim())}`);
      setGroups(g);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View>
      <Label c={c}>Your current city</Label>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <TextInput value={city} onChangeText={setCity} placeholder="e.g. Bengaluru" placeholderTextColor={c.mutedForeground} style={[inputStyle(c), { flex: 1, marginBottom: 0 }]} />
        <TouchableOpacity onPress={load} style={{ backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" }}>
          <Text style={{ color: c.primaryForeground, fontWeight: "700" }}>Find</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={() => { if (!city.trim()) { Alert.alert("Enter your city first"); return; } setCreating(true); }}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: c.primary, borderRadius: 12, paddingVertical: 12, marginBottom: 16, backgroundColor: c.primary + "14" }}
      >
        <Ionicons name="add-circle-outline" size={18} color={c.primary} />
        <Text style={{ color: c.primary, fontWeight: "700" }}>Create a group</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator color={c.primary} />}
      {!loading && city.trim() && groups.length === 0 && (
        <Text style={{ color: c.mutedForeground, textAlign: "center", marginTop: 24 }}>No groups in {city} yet.</Text>
      )}

      {groups.map((g) => (
        <TouchableOpacity key={g.id} onPress={() => setOpenId(g.id)}
          style={{ backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14, marginBottom: 10 }}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: "700" }}>{g.name}</Text>
          {!!g.venueName && <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }}>{g.venueName}</Text>}
          <View style={{ flexDirection: "row", gap: 14, marginTop: 8 }}>
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>👨 {g.menCount}</Text>
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>👩 {g.womenCount}</Text>
            <Text style={{ color: c.primary, fontSize: 13 }}>{g.memberCount}/{g.maxMembers}</Text>
            {g.myMembershipStatus === "approved" && <Text style={{ color: c.success, fontSize: 12 }}>Joined</Text>}
            {g.myMembershipStatus === "requested" && <Text style={{ color: "#fbbf24", fontSize: 12 }}>Pending</Text>}
          </View>
        </TouchableOpacity>
      ))}

      {openId !== null && (
        <GroupDetailModal c={c} groupId={openId} city={city.trim()} onClose={() => { setOpenId(null); load(); }} />
      )}
      {creating && (
        <CreateGroupModal c={c} city={city.trim()} onClose={(created) => { setCreating(false); if (created) load(); }} />
      )}
    </View>
  );
}

// ─── Create Group ─────────────────────────────────────────────────────────────
const ACTIVITY_TYPES = [
  { value: "nightlife", label: "Nightlife", hint: "Pub Crawl · DJ Night" },
  { value: "happy_hours", label: "Happy Hours", hint: "Happy Hour deals" },
  { value: "food_drinks", label: "Food & Drinks", hint: "Dining · Bar offers" },
  { value: "events", label: "Events", hint: "Concert · Comedy · Live" },
  { value: "games", label: "Games", hint: "Bowling · VR · Arcade" },
  { value: "activities", label: "Activities", hint: "Sports · Trivia" },
] as const;
const GENDER_TYPES = [
  { value: "mixed", label: "Mixed" },
  { value: "male", label: "Men" },
  { value: "female", label: "Women" },
] as const;

function CreateGroupModal({ c, city, onClose }: { c: ReturnType<typeof useColors>; city: string; onClose: (created: boolean) => void }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [activityType, setActivityType] = useState<string>("nightlife");
  const [activityLabel, setActivityLabel] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueVendorId, setVenueVendorId] = useState<number | undefined>(undefined);
  const [venueEventId, setVenueEventId] = useState<number | undefined>(undefined);
  const [groupDate, setGroupDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [description, setDescription] = useState("");
  const [maxMembers, setMaxMembers] = useState(8);
  const [genderType, setGenderType] = useState<string>("mixed");
  const [busy, setBusy] = useState(false);

  // Venue suggestions for the chosen activity type.
  const [venues, setVenues] = useState<SoloVenueOption[]>([]);
  const [venueSearch, setVenueSearch] = useState("");
  useEffect(() => {
    let alive = true;
    customFetch<SoloVenueOption[]>(`/api/solo-connect/venues?activityType=${encodeURIComponent(activityType)}`)
      .then((v) => { if (alive) setVenues(v ?? []); })
      .catch(() => { if (alive) setVenues([]); });
    setVenueName(""); setVenueVendorId(undefined); setVenueEventId(undefined); setVenueSearch("");
    return () => { alive = false; };
  }, [activityType]);

  const filteredVenues = venues
    .filter((v) => !venueSearch.trim() || v.name.toLowerCase().includes(venueSearch.trim().toLowerCase()))
    .slice(0, 30);

  async function submit() {
    if (name.trim().length < 3) { Alert.alert("Group name must be at least 3 characters."); return; }
    setBusy(true);
    try {
      await customFetch("/api/solo-connect/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), activityType, activityLabel: activityLabel.trim(),
          venueName: venueName.trim(), vendorId: venueVendorId, eventId: venueEventId,
          groupDate: groupDate || undefined, startTime: startTime || undefined,
          description: description.trim(), maxMembers, visibility: "public", genderType,
          city, country: "India",
        }),
      });
      Alert.alert("Group created!");
      onClose(true);
    } catch (e) {
      Alert.alert("Could not create group", (e as Error).message || "Try again.");
    } finally { setBusy(false); }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={() => onClose(false)}>
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 }}>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: "700" }}>Create a group</Text>
          <Pressable onPress={() => onClose(false)}><Ionicons name="close" size={26} color={c.text} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
          <Label c={c}>Activity type</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {ACTIVITY_TYPES.map((a) => {
              const active = activityType === a.value;
              return (
                <TouchableOpacity key={a.value} onPress={() => setActivityType(a.value)}
                  style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary + "1f" : c.muted, minWidth: "30%", flexGrow: 1 }}>
                  <Text style={{ color: active ? c.text : c.mutedForeground, fontWeight: "700", fontSize: 13 }}>{a.label}</Text>
                  <Text style={{ color: active ? c.primary : c.mutedForeground, fontSize: 10, marginTop: 2 }}>{a.hint}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput value={name} onChangeText={setName} placeholder="Group name (e.g. Pub Crawl Tonight)" placeholderTextColor={c.mutedForeground} style={inputStyle(c)} />
          <TextInput value={activityLabel} onChangeText={setActivityLabel} placeholder="Activity label (optional)" placeholderTextColor={c.mutedForeground} style={inputStyle(c)} />

          <Label c={c}>Venue</Label>
          <TextInput
            value={venueName || venueSearch}
            onChangeText={(t) => { setVenueSearch(t); setVenueName(""); setVenueVendorId(undefined); setVenueEventId(undefined); }}
            placeholder="Search or type a venue name"
            placeholderTextColor={c.mutedForeground}
            style={inputStyle(c)}
          />
          {!venueName && venueSearch.trim().length > 0 && filteredVenues.length > 0 && (
            <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, marginTop: -8, marginBottom: 14, overflow: "hidden" }}>
              {filteredVenues.map((v) => (
                <TouchableOpacity key={`${v.kind}-${v.id}`}
                  onPress={() => { setVenueName(v.name); setVenueVendorId(v.kind === "vendor" ? v.id : undefined); setVenueEventId(v.kind === "event" ? v.id : undefined); setVenueSearch(""); }}
                  style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
                  <Text style={{ color: c.text, fontSize: 14 }}>{v.name}</Text>
                  {!!v.sub && <Text style={{ color: c.mutedForeground, fontSize: 11 }}>{v.sub}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput value={groupDate} onChangeText={setGroupDate} placeholder="Date (YYYY-MM-DD)" placeholderTextColor={c.mutedForeground} style={[inputStyle(c), { flex: 1 }]} />
            <TextInput value={startTime} onChangeText={setStartTime} placeholder="Time (HH:MM)" placeholderTextColor={c.mutedForeground} style={[inputStyle(c), { flex: 1 }]} />
          </View>

          <TextInput value={description} onChangeText={setDescription} multiline placeholder="Describe the plan…" placeholderTextColor={c.mutedForeground} style={[inputStyle(c), { minHeight: 70, textAlignVertical: "top" }]} />

          <Label c={c}>Group vibe (anyone can still join)</Label>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            {GENDER_TYPES.map((g) => {
              const active = genderType === g.value;
              return (
                <TouchableOpacity key={g.value} onPress={() => setGenderType(g.value)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary + "1f" : c.muted, alignItems: "center" }}>
                  <Text style={{ color: active ? c.text : c.mutedForeground, fontWeight: "600" }}>{g.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Label c={c}>Max members: {maxMembers}</Label>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            {[4, 6, 8, 10, 12, 15].map((n) => {
              const active = maxMembers === n;
              return (
                <TouchableOpacity key={n} onPress={() => setMaxMembers(n)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary + "1f" : c.muted, alignItems: "center" }}>
                  <Text style={{ color: active ? c.text : c.mutedForeground, fontWeight: "700" }}>{n}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <SecondaryBtn c={c} label="Cancel" onPress={() => onClose(false)} flex />
            <PrimaryBtn c={c} label={busy ? "Creating…" : "Create group"} onPress={submit} disabled={busy} flex />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function GroupDetailModal({ c, groupId, city, onClose }: { c: ReturnType<typeof useColors>; groupId: number; city: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<{ group: SoloGroup; members: SoloMember[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reportTarget, setReportTarget] = useState<SoloMember | null>(null);

  async function load() {
    try {
      const d = await customFetch<{ group: SoloGroup; members: SoloMember[] }>(`/api/solo-connect/groups/${groupId}?city=${encodeURIComponent(city)}`);
      setData(d);
    } catch { setData(null); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [groupId]);

  async function join() {
    setBusy(true);
    try {
      await customFetch(`/api/solo-connect/groups/${groupId}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city }) });
      Alert.alert("Request sent");
      await load();
    } catch (e) { Alert.alert("Could not join", (e as Error).message || "Try again."); }
    finally { setBusy(false); }
  }

  // Generic POST action against the group, then reload (or close).
  async function act(path: string, opts?: { closeAfter?: boolean; okMsg?: string }) {
    setBusy(true);
    try {
      await customFetch(`/api/solo-connect/groups/${groupId}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (opts?.okMsg) Alert.alert(opts.okMsg);
      if (opts?.closeAfter) onClose();
      else await load();
    } catch (e) { Alert.alert("Action failed", (e as Error).message || "Try again."); }
    finally { setBusy(false); }
  }

  const group = data?.group;
  const members = (data?.members ?? []).filter((m) => m.status === "approved");
  const pendingMembers = (data?.members ?? []).filter((m) => m.status === "requested");
  const isAdmin = group?.isAdmin ?? false;
  const myStatus = group?.myMembershipStatus ?? null;
  const joined = myStatus === "approved" || isAdmin;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 }}>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: "700", flex: 1 }} numberOfLines={1}>{group?.name ?? "Group"}</Text>
          <Pressable onPress={onClose}><Ionicons name="close" size={26} color={c.text} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
          {!group ? <ActivityIndicator color={c.primary} /> : (
            <>
              <View style={{ flexDirection: "row", gap: 16, marginBottom: 16 }}>
                <Text style={{ color: c.mutedForeground }}>👨 {group.menCount}</Text>
                <Text style={{ color: c.mutedForeground }}>👩 {group.womenCount}</Text>
                <Text style={{ color: c.primary }}>{group.memberCount}/{group.maxMembers} members</Text>
              </View>

              {!!group.description && <Text style={{ color: c.mutedForeground, fontSize: 13, marginBottom: 14, lineHeight: 19 }}>{group.description}</Text>}

              {!joined && group.status === "open" && myStatus !== "requested" && (
                <PrimaryBtn c={c} label={busy ? "Requesting…" : "Request to join"} onPress={join} disabled={busy} />
              )}
              {myStatus === "requested" && <Text style={{ color: "#fbbf24", marginBottom: 12 }}>Request pending approval</Text>}
              {myStatus === "approved" && !isAdmin && (
                <SecondaryBtn c={c} label="Leave group" onPress={() => act("leave", { closeAfter: true, okMsg: "You left the group." })} />
              )}

              {/* Admin: pending requests */}
              {isAdmin && pendingMembers.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Label c={c}>Pending requests</Label>
                  {pendingMembers.map((m) => (
                    <View key={m.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: c.card, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                      <Text style={{ color: c.text }}>{m.userName}</Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TouchableOpacity onPress={() => act(`members/${m.id}/approve`)} style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "#16a34a22", alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name="checkmark" size={18} color="#4ade80" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => act(`members/${m.id}/reject`)} style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: c.red + "22", alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name="close" size={18} color={c.redLight} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <Label c={c}>Members ({members.length})</Label>
              {members.map((m) => (
                <View key={m.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: c.card, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                  <Text style={{ color: c.text }}>{m.gender === "male" ? "👨 " : m.gender === "female" ? "👩 " : ""}{m.userName}{m.role === "admin" ? "  ·  admin" : ""}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    {joined && (
                      <Pressable onPress={() => setReportTarget(m)}><Ionicons name="flag-outline" size={18} color={c.mutedForeground} /></Pressable>
                    )}
                    {isAdmin && m.role !== "admin" && (
                      <Pressable onPress={() => act(`members/${m.id}/remove`, { okMsg: "Member removed" })}><Ionicons name="person-remove-outline" size={18} color={c.redLight} /></Pressable>
                    )}
                  </View>
                </View>
              ))}

              {/* Admin: lock / close */}
              {isAdmin && group.status !== "closed" && (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                  {group.status === "open" && (
                    <SecondaryBtn c={c} label="Lock" onPress={() => act("lock", { okMsg: "Group locked" })} flex />
                  )}
                  <TouchableOpacity onPress={() => act("close", { closeAfter: true, okMsg: "Group closed" })}
                    style={{ flex: 1, backgroundColor: c.red + "1a", borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 8 }}>
                    <Text style={{ color: c.redLight, fontWeight: "600" }}>Close group</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Group chat — approved members + admins only */}
              {joined && <SoloGroupChat c={c} groupId={groupId} />}

              <View style={{ backgroundColor: "#2a0d0d", borderRadius: 12, borderWidth: 1, borderColor: c.red, padding: 12, marginTop: 16 }}>
                <Text style={{ color: c.redLight, fontWeight: "700", marginBottom: 6 }}>Safety</Text>
                <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Meet in public places. Never share financial information. In an emergency dial 112.</Text>
              </View>
            </>
          )}
        </ScrollView>

        {reportTarget && (
          <ReportModal c={c} groupId={groupId} member={reportTarget} onClose={() => setReportTarget(null)} />
        )}
      </View>
    </Modal>
  );
}

function ReportModal({ c, groupId, member, onClose }: { c: ReturnType<typeof useColors>; groupId: number; member: SoloMember; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason) { Alert.alert("Choose a reason"); return; }
    setBusy(true);
    try {
      await customFetch(`/api/solo-connect/groups/${groupId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportedUserId: member.userId, reason, description: description.trim() || undefined }),
      });
      Alert.alert("Report submitted", "Our team will review it.");
      onClose();
    } catch (e) { Alert.alert("Could not submit", (e as Error).message || "Try again."); }
    finally { setBusy(false); }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", padding: 20 }}>
        <View style={{ backgroundColor: c.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: c.red }}>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: "700", marginBottom: 12 }}>Report {member.userName}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {REPORT_REASONS.map((r) => (
              <TouchableOpacity key={r.value} onPress={() => setReason(r.value)}
                style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: reason === r.value ? c.primary : c.border, backgroundColor: reason === r.value ? c.accent : c.muted }}>
                <Text style={{ color: c.text, fontSize: 12 }}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput value={description} onChangeText={setDescription} multiline placeholder="Describe what happened (optional)…" placeholderTextColor={c.mutedForeground}
            style={[inputStyle(c), { minHeight: 70, textAlignVertical: "top" }]} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <SecondaryBtn c={c} label="Cancel" onPress={onClose} flex />
            <PrimaryBtn c={c} label={busy ? "Submitting…" : "Submit"} onPress={submit} disabled={busy || !reason} flex />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Group chat ───────────────────────────────────────────────────────────────
// Temporary group chat. Polls every 2s; messages are wiped server-side at 3 AM.
// A one-time acknowledgement is required before the chat is shown.
function SoloGroupChat({ c, groupId }: { c: ReturnType<typeof useColors>; groupId: number }) {
  const [ack, setAck] = useState(false);
  const [messages, setMessages] = useState<SoloMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!ack) return;
    let alive = true;
    async function poll() {
      try {
        const m = await customFetch<SoloMessage[]>(`/api/solo-connect/groups/${groupId}/messages`);
        if (alive) setMessages(m ?? []);
      } catch { /* ignore poll errors */ }
    }
    poll();
    const id = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [ack, groupId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollToEnd({ animated: true });
  }, [messages]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setText("");
    setSending(true);
    try {
      const msg = await customFetch<SoloMessage>(`/api/solo-connect/groups/${groupId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }),
      });
      setMessages((prev) => [...prev, msg]);
    } catch {
      setText(body); // restore on failure
    } finally { setSending(false); }
  }

  if (!ack) {
    return (
      <View style={{ backgroundColor: c.primary + "12", borderRadius: 12, borderWidth: 1, borderColor: c.primary + "40", padding: 14, marginTop: 16 }}>
        <Text style={{ color: c.text, fontWeight: "700", marginBottom: 6 }}>💬 Group Chat</Text>
        <Text style={{ color: c.mutedForeground, fontSize: 12, marginBottom: 10 }}>
          All chat messages are automatically deleted at 3:00 AM for privacy and safety.
        </Text>
        <PrimaryBtn c={c} label="I understand — Enter chat" onPress={() => setAck(true)} />
      </View>
    );
  }

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ color: c.text, fontWeight: "700", marginBottom: 2 }}>💬 Group Chat</Text>
      <Text style={{ color: c.mutedForeground, fontSize: 10, marginBottom: 8 }}>Messages auto-delete at 3:00 AM.</Text>
      <ScrollView ref={scrollRef} style={{ height: 220, backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12 }}>
        {messages.length === 0 && (
          <Text style={{ color: c.mutedForeground, textAlign: "center", marginTop: 28, fontSize: 12 }}>No messages yet. Say hi 👋</Text>
        )}
        {messages.map((m) => (
          <View key={m.id} style={{ alignSelf: m.isMine ? "flex-end" : "flex-start", maxWidth: "78%", marginBottom: 8 }}>
            <View style={{ backgroundColor: m.isMine ? c.primary : "rgba(255,255,255,0.08)", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }}>
              {!m.isMine && <Text style={{ color: c.primary, fontSize: 10, fontWeight: "700", marginBottom: 2 }}>{m.userName}</Text>}
              <Text style={{ color: m.isMine ? c.primaryForeground : c.text, fontSize: 14 }}>{m.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        <TextInput value={text} onChangeText={setText} placeholder="Message…" placeholderTextColor={c.mutedForeground} maxLength={1000}
          style={[inputStyle(c), { flex: 1, marginBottom: 0 }]} onSubmitEditing={send} returnKeyType="send" />
        <TouchableOpacity onPress={send} disabled={!text.trim() || sending}
          style={{ width: 46, borderRadius: 10, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", opacity: !text.trim() ? 0.5 : 1 }}>
          <Ionicons name="send" size={18} color={c.primaryForeground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────
function Notice({ c, icon, title, text }: { c: ReturnType<typeof useColors>; icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  return (
    <View style={{ alignItems: "center", marginTop: 50, paddingHorizontal: 24 }}>
      <Ionicons name={icon} size={44} color={c.primary} />
      <Text style={{ color: c.text, fontSize: 20, fontWeight: "700", marginTop: 14 }}>{title}</Text>
      <Text style={{ color: c.mutedForeground, textAlign: "center", marginTop: 8 }}>{text}</Text>
    </View>
  );
}
function Card({ c, children }: { c: ReturnType<typeof useColors>; children: React.ReactNode }) {
  return <View style={{ backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16 }}>{children}</View>;
}
function Label({ c, children }: { c: ReturnType<typeof useColors>; children: React.ReactNode }) {
  return <Text style={{ color: c.mutedForeground, fontSize: 13, marginBottom: 8 }}>{children}</Text>;
}
function inputStyle(c: ReturnType<typeof useColors>) {
  return { backgroundColor: c.muted, borderColor: c.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: c.text, marginBottom: 14 } as const;
}
function PrimaryBtn({ c, label, onPress, disabled, flex }: { c: ReturnType<typeof useColors>; label: string; onPress: () => void; disabled?: boolean; flex?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled}
      style={{ flex: flex ? 1 : undefined, backgroundColor: disabled ? c.muted : c.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 6 }}>
      <Text style={{ color: disabled ? c.mutedForeground : c.primaryForeground, fontWeight: "700" }}>{label}</Text>
    </TouchableOpacity>
  );
}
function SecondaryBtn({ c, label, onPress, flex }: { c: ReturnType<typeof useColors>; label: string; onPress: () => void; flex?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress}
      style={{ flex: flex ? 1 : undefined, backgroundColor: c.muted, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 8, borderWidth: 1, borderColor: c.border }}>
      <Text style={{ color: c.text }}>{label}</Text>
    </TouchableOpacity>
  );
}
