import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export interface FilterSelectOption {
  value: string;
  label: string;
}

/**
 * A compact dropdown that mirrors the web app's shadcn `Select` (trigger shows
 * the current value + a chevron; tapping opens a menu of options). Used on the
 * Pubs screen for the Crowd and Day filters so the mobile controls match web.
 */
export function FilterSelect({
  value,
  options,
  placeholder,
  onChange,
  minWidth = 128,
  icon,
}: {
  value: string;
  options: FilterSelectOption[];
  placeholder?: string;
  onChange: (value: string) => void;
  minWidth?: number;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.trigger, { backgroundColor: colors.muted, borderColor: colors.border, minWidth }]}
      >
        {icon ? <Ionicons name={icon} size={14} color={colors.mutedForeground} /> : null}
        <Text
          style={[styles.triggerText, { color: selected ? colors.foreground : colors.mutedForeground }]}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder ?? "Select"}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <ScrollView bounces={false} style={{ maxHeight: 320 }}>
              {options.map((opt) => {
                const active = opt.value === value;
                return (
                  <Pressable
                    key={opt.value || "any"}
                    onPress={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      { borderBottomColor: colors.border },
                      pressed && { backgroundColor: colors.muted },
                    ]}
                  >
                    <Text style={[styles.rowText, { color: active ? colors.primary : colors.foreground }]}>
                      {opt.label}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
  },
  triggerText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  menu: {
    width: "100%",
    maxWidth: 340,
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
