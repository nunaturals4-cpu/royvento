import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
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
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { uploadImageToStorage } from "@/lib/uploadImage";
import { resolveImageUrl, toUploadPath, type PublicParty } from "@/lib/party";

type JoinType = "mixed" | "male_only" | "female_only";
type TicketType = "free" | "paid";
type Visibility = "public" | "private";

const JOIN_OPTS: { value: JoinType; label: string }[] = [
  { value: "mixed", label: "Everyone" },
  { value: "male_only", label: "Men only" },
  { value: "female_only", label: "Women only" },
];

export default function CreatePartyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const [name, setName] = useState("");
  const [organizerName, setOrganizerName] = useState(user?.name ?? "");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [category, setCategory] = useState("party");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [venueName, setVenueName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [partyDate, setPartyDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [joinType, setJoinType] = useState<JoinType>("mixed");
  const [ticketType, setTicketType] = useState<TicketType>("free");
  const [ticketPrice, setTicketPrice] = useState("");
  const [capacity, setCapacity] = useState("");
  const [coverPath, setCoverPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [premiumGate, setPremiumGate] = useState(false);

  async function pickCover() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
        aspect: [16, 9],
      });
      if (res.canceled || !res.assets?.[0]) return;
      setUploading(true);
      const url = await uploadImageToStorage(res.assets[0].uri);
      setCoverPath(toUploadPath(url));
    } catch (e: any) {
      setError(e?.message ?? "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function validate(): string | null {
    if (name.trim().length < 3) return "Give your party a name (at least 3 characters).";
    if (!organizerName.trim()) return "Add the host / organizer name.";
    if (!city.trim()) return "Enter the city.";
    if (ticketType === "paid") {
      if (!(Number(ticketPrice) > 0)) return "Enter a ticket price for a paid party.";
      if (!(Number(capacity) > 0)) return "Enter the total capacity for a paid party.";
    }
    return null;
  }

  async function submit() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        organizerName: organizerName.trim(),
        description: description.trim() || undefined,
        rules: rules.trim() || undefined,
        category: category.trim() || undefined,
        visibility,
        venueName: venueName.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim(),
        state: state.trim() || undefined,
        partyDate: partyDate.trim() || undefined,
        startTime: startTime.trim() || undefined,
        endTime: endTime.trim() || undefined,
        joinType,
        ticketType,
        coverImageUrl: coverPath || undefined,
      };
      if (ticketType === "paid") {
        body.ticketPrice = Number(ticketPrice);
        body.capacity = Number(capacity);
      } else if (Number(capacity) > 0) {
        body.capacity = Number(capacity);
      }
      const party = await customFetch<PublicParty>("/api/create-your-party", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      qc.invalidateQueries({ queryKey: ["parties"] });
      router.replace({ pathname: "/party/[id]", params: { id: String(party.id) } } as never);
    } catch (e: any) {
      const status = e?.status;
      const msg = e?.data?.error ?? e?.message ?? "Could not create the party.";
      if (status === 403) {
        setPremiumGate(true);
      } else {
        setError(String(msg));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const cover = resolveImageUrl(coverPath);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Create a Party</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {!user && (
          <Notice colors={colors} tone="warn" text="Please log in to host a party." />
        )}
        {premiumGate && (
          <View style={[styles.notice, { borderColor: colors.primary, backgroundColor: colors.primary + "12" }]}>
            <Ionicons name="star" size={16} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                Hosting is a Premium feature
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12.5, marginTop: 2 }}>
                Upgrade to Royvento Premium to create and host your own parties.
              </Text>
              <TouchableOpacity onPress={() => router.push("/subscription" as never)} style={{ marginTop: 8 }}>
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>View Premium →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Cover */}
        <TouchableOpacity onPress={pickCover} style={[styles.coverPicker, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.coverImg} contentFit="cover" />
          ) : (
            <View style={{ alignItems: "center", gap: 6 }}>
              {uploading ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="image-outline" size={28} color={colors.mutedForeground} />}
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{uploading ? "Uploading…" : "Add a cover photo"}</Text>
            </View>
          )}
        </TouchableOpacity>

        <Field colors={colors} label="Party name *" value={name} onChangeText={setName} placeholder="Saturday Rooftop Party" />
        <Field colors={colors} label="Host / organizer name *" value={organizerName} onChangeText={setOrganizerName} placeholder="Your name or crew" />
        <Field colors={colors} label="Description" value={description} onChangeText={setDescription} placeholder="What's the plan, the vibe, what to expect…" multiline />

        {/* Visibility */}
        <Segment colors={colors} label="Who can see & join" value={visibility}
          options={[{ value: "public", label: "Public" }, { value: "private", label: "Private (invite only)" }]}
          onChange={(v) => setVisibility(v as Visibility)} />

        {/* Join type */}
        <Segment colors={colors} label="Who can attend" value={joinType}
          options={JOIN_OPTS} onChange={(v) => setJoinType(v as JoinType)} />

        {/* Location */}
        <Field colors={colors} label="Venue name" value={venueName} onChangeText={setVenueName} placeholder="Rooftop lounge, home, club…" />
        <Field colors={colors} label="Address" value={address} onChangeText={setAddress} placeholder="Street / area" />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><Field colors={colors} label="City *" value={city} onChangeText={setCity} placeholder="City" /></View>
          <View style={{ flex: 1 }}><Field colors={colors} label="State" value={state} onChangeText={setState} placeholder="State" /></View>
        </View>

        {/* Date / time */}
        <Field colors={colors} label="Date (YYYY-MM-DD)" value={partyDate} onChangeText={setPartyDate} placeholder="2026-08-15" keyboardType="numbers-and-punctuation" />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><Field colors={colors} label="Start (HH:MM)" value={startTime} onChangeText={setStartTime} placeholder="21:00" keyboardType="numbers-and-punctuation" /></View>
          <View style={{ flex: 1 }}><Field colors={colors} label="End (HH:MM)" value={endTime} onChangeText={setEndTime} placeholder="01:00" keyboardType="numbers-and-punctuation" /></View>
        </View>

        {/* Ticketing */}
        <Segment colors={colors} label="Entry" value={ticketType}
          options={[{ value: "free", label: "Free" }, { value: "paid", label: "Paid ticket" }]}
          onChange={(v) => setTicketType(v as TicketType)} />
        {ticketType === "paid" && (
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}><Field colors={colors} label="Ticket price (₹) *" value={ticketPrice} onChangeText={setTicketPrice} placeholder="499" keyboardType="numeric" /></View>
            <View style={{ flex: 1 }}><Field colors={colors} label="Capacity *" value={capacity} onChangeText={setCapacity} placeholder="50" keyboardType="numeric" /></View>
          </View>
        )}
        {ticketType === "free" && (
          <Field colors={colors} label="Capacity (optional)" value={capacity} onChangeText={setCapacity} placeholder="Leave blank for unlimited" keyboardType="numeric" />
        )}

        <Field colors={colors} label="House rules" value={rules} onChangeText={setRules} placeholder="Dress code, age limit, do's & don'ts…" multiline />

        {error && <Notice colors={colors} tone="error" text={error} />}

        <TouchableOpacity
          disabled={submitting || !user}
          onPress={submit}
          style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting || !user ? 0.6 : 1 }]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={{ color: colors.primaryForeground, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Publish party</Text>
          )}
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
        style={[
          styles.input,
          { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card },
          multiline && { height: 96, textAlignVertical: "top" },
        ]}
        {...props}
      />
    </View>
  );
}

function Segment({
  colors, label, value, options, onChange,
}: {
  colors: ReturnType<typeof useColors>;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <TouchableOpacity
              key={o.value}
              onPress={() => onChange(o.value)}
              style={[
                styles.segPill,
                active
                  ? { borderColor: colors.primary, backgroundColor: colors.primary + "1A" }
                  : { borderColor: colors.border, backgroundColor: colors.card },
              ]}
            >
              <Text style={{ color: active ? colors.foreground : colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium" }}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function Notice({ colors, tone, text }: { colors: ReturnType<typeof useColors>; tone: "warn" | "error"; text: string }) {
  const color = tone === "error" ? colors.destructive : "#f59e0b";
  return (
    <View style={[styles.notice, { borderColor: color, backgroundColor: color + "12" }]}>
      <Ionicons name={tone === "error" ? "alert-circle-outline" : "warning-outline"} size={16} color={color} />
      <Text style={{ color, fontSize: 13, flex: 1 }}>{text}</Text>
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
