import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export type FollowTargetType = "vendor" | "event" | "game_organizer" | "organizer";

type FollowState = { following: boolean; followerCount: number };

interface Props {
  targetType: FollowTargetType;
  targetId: number;
  /** Display name used in the confirmation feedback (e.g. the venue name). */
  name?: string;
  /** Extra style merged onto the button. */
  style?: ViewStyle;
  /** Hide the follower count suffix. */
  hideCount?: boolean;
}

/**
 * Server-backed Follow / Following button — the React Native twin of the web
 * FollowButton. Works for any followable profile (venue, event, game zone,
 * organizer). Following also (re)registers the device for push so the user gets
 * instant alerts (e.g. a venue's new food & drink discount or exclusive deal).
 *
 * Logged-out visitors don't see the button (following drives personalised push);
 * the CTA appears once they sign in — matching the web behaviour exactly.
 */
export function FollowButton({ targetType, targetId, name, style, hideCount = false }: Props) {
  const { user } = useAuth();
  const colors = useColors();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const enabled = Number.isFinite(targetId) && targetId > 0 && !!user;
  const key = ["follow", targetType, targetId] as const;

  const { data } = useQuery<FollowState>({
    queryKey: key,
    queryFn: () => customFetch<FollowState>(`/api/follows/${targetType}/${targetId}`),
    enabled,
  });

  const following = data?.following ?? false;
  const followerCount = data?.followerCount ?? 0;

  // Logged-in-only action — hide entirely from logged-out visitors.
  if (!user) return null;

  const toggle = async () => {
    if (busy || !enabled) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = !following;
    qc.setQueryData<FollowState>(key, (old) => ({
      following: next,
      followerCount: Math.max(0, (old?.followerCount ?? 0) + (next ? 1 : -1)),
    }));
    try {
      const res = next
        ? await customFetch<FollowState>(`/api/follows/${targetType}/${targetId}`, { method: "POST" })
        : await customFetch<FollowState>(`/api/follows/${targetType}/${targetId}`, { method: "DELETE" });
      qc.setQueryData(key, res);
      // Push is already registered app-wide at startup for logged-in users
      // (see NotificationHandler in app/_layout.tsx), so following delivers
      // instantly with no extra subscription step here.
    } catch {
      // Roll back the optimistic update on failure.
      qc.invalidateQueries({ queryKey: key });
    } finally {
      setBusy(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={toggle}
      disabled={busy}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected: following }}
      style={[
        styles.btn,
        following
          ? { backgroundColor: colors.card, borderColor: colors.border }
          : { backgroundColor: colors.primary, borderColor: colors.primary },
        busy && { opacity: 0.6 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={following ? colors.foreground : colors.primaryForeground} />
      ) : (
        <Ionicons
          name={following ? "notifications" : "notifications-outline"}
          size={16}
          color={following ? colors.foreground : colors.primaryForeground}
        />
      )}
      <Text
        style={[
          styles.label,
          { color: following ? colors.foreground : colors.primaryForeground },
        ]}
      >
        {following ? "Following" : "Follow"}
        {!hideCount && followerCount > 0 ? ` · ${followerCount}` : ""}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
