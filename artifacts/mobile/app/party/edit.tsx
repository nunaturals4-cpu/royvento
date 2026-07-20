import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { uploadImageToStorage } from "@/lib/uploadImage";
import { resolveImageUrl, toUploadPath } from "@/lib/party";

// ── Edit a published party (creator-only) ────────────────────────────────────
// Mirrors web's EditPartyModal. Fetches current values via the dashboard
// endpoint (already used by party/dashboard.tsx) and PATCHes /api/create-your-party/:id.

type Visibility = "public" | "private";
type JoinType = "mixed" | "male_only" | "female_only";
type YesNo = "" | "yes" | "no";

const JOIN_OPTS: { value: JoinType; label: string }[] = [
  { value: "mixed", label: "Everyone" },
  { value: "male_only", label: "Men only" },
  { value: "female_only", label: "Women only" },
];
const AGE_GROUPS = ["18-25", "25-35", "35+"] as const;
const DRESS_CODES = [
  { value: "casual", label: "Casual" },
  { value: "smart_casual", label: "Smart Casual" },
  { value: "black_theme", label: "Black Theme" },
  { value: "white_theme", label: "White Theme" },
] as const;
const PARTY_PREFS = [
  { key: "drinking" as const, label: "Drinking" },
  { key: "smoking" as const, label: "Smoking" },
  { key: "coupleFriendly" as const, label: "Couple Friendly" },
  { key: "lgbtqFriendly" as const, label: "LGBTQ+ Friendly" },
];

interface EditableParty {
  id: number; name: string; coverImageUrl: string; description: string; rules: string; category: string;
  visibility: Visibility; organizerName: string; venueName: string; address: string; city: string; state: string;
  pinCode: string; mapLocation: string; partyDate: string | null; startTime: string; endTime: string;
  joinType: JoinType; ageGroup: string; dressCode: string; drinking: YesNo; smoking: YesNo; coupleFriendly: YesNo; lgbtqFriendly: YesNo;
}

export default function EditPartyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const partyId = parseInt(String(id), 10);
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const [loading, setLoading] = useState(true);
  const [f, setF] = useState<EditableParty | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(partyId)) { setLoading(false); return; }
    customFetch<{ party: EditableParty }>(`/api/create-your-party/${partyId}/dashboard`)
      .then((r) => setF(r.party))
      .catch((e) => setError(e?.message ?? "Could not load party"))
      .finally(() => setLoading(false));
  }, [partyId]);

  const upd = <K extends keyof EditableParty>(k: K, v: EditableParty[K]) => setF((p) => (p ? { ...p, [k]: v } : p));

  async function pickCover() {
    if (!f) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsEditing: true, aspect: [16, 9] });
      if (res.canceled || !res.assets?.[0]) return;
      setUploading(true);
      const url = await uploadImageToStorage(res.assets[0].uri);
      upd("coverImageUrl", toUploadPath(url));
    } catch (e: any) {
      setError(e?.message ?? "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!f) return;
    if (f.name.trim().length < 3) { setError("Party name must be at least 3 characters."); return; }
    if (!f.organizerName.trim()) { setError("Organizer name is required."); return; }
    if (!f.city.trim()) { setError("City is required."); return; }
    setError(null);
    setSubmitting(true);
    try {
      await customFetch(`/api/create-your-party/${partyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name.trim(), coverImageUrl: f.coverImageUrl, description: f.description.trim(), rules: f.rules.trim(),
          category: f.category, visibility: f.visibility, organizerName: f.organizerName.trim(),
          venueName: f.venueName.trim(), address: f.address.trim(), city: f.city.trim(), state: f.state.trim(),
          pinCode: f.pinCode.trim(), mapLocation: f.mapLocation.trim(), ...(f.partyDate ? { partyDate: f.partyDate } : {}),
          startTime: f.startTime, endTime: f.endTime, joinType: f.joinType,
          ageGroup: f.ageGroup, dressCode: f.dressCode, drinking: f.drinking, smoking: f.smoking,
          coupleFriendly: f.coupleFriendly, lgbtqFriendly: f.lgbtqFriendly,
        }),
      });
      qc.invalidateQueries({ queryKey: ["party-dashboard", partyId] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      router.back();
    } catch (e: any) {
      setError(e?.data?.error ?? e?.message ?? "Could not save changes.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!f) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 24, gap: 12 }}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>{error ?? "Party not found."}</Text>
        <Pressable onPress={() => router.back()}><Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Go back</Text></Pressable>
      </View>
    );
  }

  const cover = resolveImageUrl(f.coverImageUrl);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: topPadding + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Edit Party</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 16 }} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={pickCover} style={[styles.coverPicker, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.coverImg} contentFit="cover" />
          ) : (
            <View style={{ alignItems: "center", gap: 6 }}>
              {uploading ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="image-outline" size={28} color={colors.mutedForeground} />}
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{uploading ? "Uploading…" : "Change cover photo"}</Text>
            </View>
          )}
        </TouchableOpacity>

        <Field colors={colors} label="Party name *" value={f.name} onChangeText={(v) => upd("name", v)} />
        <Field colors={colors} label="Host / organizer name *" value={f.organizerName} onChangeText={(v) => upd("organizerName", v)} />
        <Field colors={colors} label="Description" value={f.description} onChangeText={(v) => upd("description", v)} multiline />
        <Field colors={colors} label="House rules" value={f.rules} onChangeText={(v) => upd("rules", v)} multiline />

        <Segment colors={colors} label="Who can see & join" value={f.visibility}
          options={[{ value: "public", label: "Public" }, { value: "private", label: "Private (invite only)" }]}
          onChange={(v) => upd("visibility", v as Visibility)} />
        <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: -10 }}>
          {f.visibility === "private" ? "Stays listed, but only people with your invite link can book." : "Listed for everyone — anyone can book."}
        </Text>

        <Segment colors={colors} label="Who can attend" value={f.joinType} options={JOIN_OPTS} onChange={(v) => upd("joinType", v as JoinType)} />

        <Field colors={colors} label="Venue name" value={f.venueName} onChangeText={(v) => upd("venueName", v)} />
        <Field colors={colors} label="Address" value={f.address} onChangeText={(v) => upd("address", v)} multiline />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><Field colors={colors} label="City *" value={f.city} onChangeText={(v) => upd("city", v)} /></View>
          <View style={{ flex: 1 }}><Field colors={colors} label="State" value={f.state} onChangeText={(v) => upd("state", v)} /></View>
        </View>
        <Field colors={colors} label="Pin code" value={f.pinCode} onChangeText={(v) => upd("pinCode", v)} keyboardType="number-pad" />
        <Field colors={colors} label="Google Maps link (optional)" value={f.mapLocation} onChangeText={(v) => upd("mapLocation", v)} autoCapitalize="none" />

        <Field colors={colors} label="Date (YYYY-MM-DD)" value={f.partyDate ?? ""} onChangeText={(v) => upd("partyDate", v)} keyboardType="numbers-and-punctuation" />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><Field colors={colors} label="Start (HH:MM)" value={f.startTime} onChangeText={(v) => upd("startTime", v)} keyboardType="numbers-and-punctuation" /></View>
          <View style={{ flex: 1 }}><Field colors={colors} label="End (HH:MM)" value={f.endTime} onChangeText={(v) => upd("endTime", v)} keyboardType="numbers-and-punctuation" /></View>
        </View>

        <Segment colors={colors} label="Age group (optional)" value={f.ageGroup}
          options={AGE_GROUPS.map((a) => ({ value: a, label: a }))}
          onChange={(v) => upd("ageGroup", f.ageGroup === v ? "" : v)} />

        <Segment colors={colors} label="Dress code (optional)" value={f.dressCode}
          options={DRESS_CODES.map((d) => ({ value: d.value, label: d.label }))}
          onChange={(v) => upd("dressCode", f.dressCode === v ? "" : v)} />

        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>Preferences</Text>
          {PARTY_PREFS.map((p) => (
            <View key={p.key} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12 }}>
              <Text style={{ color: colors.foreground, fontSize: 13 }}>{p.label}?</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["yes", "no"] as const).map((opt) => {
                  const active = f[p.key] === opt;
                  const accent = opt === "yes" ? "#4ade80" : colors.destructive;
                  return (
                    <TouchableOpacity key={opt} onPress={() => upd(p.key, active ? "" : opt)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: active ? accent : colors.border, backgroundColor: active ? accent + "1f" : "transparent" }}>
                      <Text style={{ color: active ? colors.foreground : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        {error && <Notice colors={colors} text={error} />}

        <TouchableOpacity disabled={submitting} onPress={submit} style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}>
          {submitting ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Save changes</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  colors, label, multiline, ...props
}: { colors: ReturnType<typeof useColors>; label: string; multiline?: boolean } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        multiline={multiline}
        style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }, multiline && { height: 90, textAlignVertical: "top" }]}
        {...props}
      />
    </View>
  );
}

function Segment({
  colors, label, value, options, onChange,
}: { colors: ReturnType<typeof useColors>; label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <TouchableOpacity key={o.value} onPress={() => onChange(o.value)} style={[styles.segPill, active ? { borderColor: colors.primary, backgroundColor: colors.primary + "1A" } : { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={{ color: active ? colors.foreground : colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium" }}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function Notice({ colors, text }: { colors: ReturnType<typeof useColors>; text: string }) {
  return (
    <View style={[styles.notice, { borderColor: colors.destructive, backgroundColor: colors.destructive + "12" }]}>
      <Ionicons name="alert-circle-outline" size={16} color={colors.destructive} />
      <Text style={{ color: colors.destructive, fontSize: 13, flex: 1 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  coverPicker: { height: 170, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  coverImg: { width: "100%", height: "100%" },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular" },
  segPill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  submitBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 4 },
});
