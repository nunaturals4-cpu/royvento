import React from "react";
import { Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export interface BookingFilters {
  date: string;
  mode: string;
  status: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Completed" },
];

interface BookingFiltersBarProps {
  filters: BookingFilters;
  onChange: (filters: BookingFilters) => void;
  /** Omit to hide the Mode row entirely (e.g. organizer/game bookings share one mode). */
  modeOptions?: { value: string; label: string }[];
}

/** date field is a plain "YYYY-MM-DD" text input — avoids pulling in a native date-picker dependency for one field. */
export function BookingFiltersBar({ filters, onChange, modeOptions }: BookingFiltersBarProps) {
  const colors = useColors();
  const hasFilters = !!filters.date || filters.mode !== "all" || filters.status !== "all";

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, width: 44 }}>Date</Text>
        <TextInput
          value={filters.date}
          onChangeText={(v) => onChange({ ...filters, date: v })}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.mutedForeground}
          style={{ flex: 1, color: colors.foreground, backgroundColor: colors.muted, borderRadius: 8, paddingHorizontal: 10, paddingVertical: Platform.OS === "ios" ? 8 : 4, fontSize: 13, fontFamily: "Inter_400Regular" }}
        />
        {hasFilters && (
          <TouchableOpacity onPress={() => onChange({ date: "", mode: "all", status: "all" })}>
            <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {modeOptions && modeOptions.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {[{ value: "all", label: "All modes" }, ...modeOptions].map((m) => (
            <TouchableOpacity
              key={m.value}
              onPress={() => onChange({ ...filters, mode: m.value })}
              style={{
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                backgroundColor: filters.mode === m.value ? colors.primary : colors.muted,
                borderColor: filters.mode === m.value ? colors.primary : colors.border,
              }}
            >
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: filters.mode === m.value ? colors.primaryForeground : colors.mutedForeground }}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {STATUS_OPTIONS.map((s) => (
          <TouchableOpacity
            key={s.value}
            onPress={() => onChange({ ...filters, status: s.value })}
            style={{
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
              backgroundColor: filters.status === s.value ? colors.primary : colors.muted,
              borderColor: filters.status === s.value ? colors.primary : colors.border,
            }}
          >
            <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: filters.status === s.value ? colors.primaryForeground : colors.mutedForeground }}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
