import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { COUNTRY_NAMES, getCities, getStates } from "@/utils/locations";

interface LocationValue {
  country: string;
  state: string;
  city: string;
}

interface Props {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
}

type Step = "country" | "state" | "city";

export function LocationPicker({ value, onChange }: Props) {
  const colors = useColors();
  const [openStep, setOpenStep] = useState<Step | null>(null);

  const states = value.country ? getStates(value.country) : [];
  const cities = value.country && value.state ? getCities(value.country, value.state) : [];

  function selectCountry(name: string) {
    onChange({ country: name, state: "", city: "" });
    setOpenStep(null);
  }

  function selectState(name: string) {
    onChange({ country: value.country, state: name, city: "" });
    setOpenStep(null);
  }

  function selectCity(name: string) {
    onChange({ ...value, city: name });
    setOpenStep(null);
  }

  function clear() {
    onChange({ country: "", state: "", city: "" });
  }

  const listForStep = openStep === "country" ? COUNTRY_NAMES : openStep === "state" ? states : cities;

  return (
    <>
      <View style={styles.row}>
        <PickerRow
          label="Country"
          value={value.country}
          placeholder="Any country"
          colors={colors}
          disabled={false}
          onPress={() => setOpenStep("country")}
        />
        <PickerRow
          label="State"
          value={value.state}
          placeholder={value.country ? "Any state" : "Pick country first"}
          colors={colors}
          disabled={!value.country}
          onPress={() => value.country && setOpenStep("state")}
        />
        <PickerRow
          label="City"
          value={value.city}
          placeholder={value.state ? "Any city" : "Pick state first"}
          colors={colors}
          disabled={!value.state}
          onPress={() => value.state && setOpenStep("city")}
        />
        {(value.country || value.state || value.city) ? (
          <TouchableOpacity onPress={clear} style={[styles.clearBtn, { borderColor: colors.border }]}>
            <Ionicons name="close" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      <Modal visible={openStep !== null} transparent animationType="slide" presentationStyle="overFullScreen">
        <Pressable style={styles.overlay} onPress={() => setOpenStep(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {openStep === "country" ? "Select Country" : openStep === "state" ? "Select State" : "Select City"}
              </Text>
              <Pressable onPress={() => setOpenStep(null)}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <FlatList
              data={listForStep}
              keyExtractor={(item) => item}
              style={{ maxHeight: 400 }}
              showsVerticalScrollIndicator
              renderItem={({ item }) => {
                const selected =
                  openStep === "country" ? value.country === item :
                  openStep === "state" ? value.state === item :
                  value.city === item;
                return (
                  <TouchableOpacity
                    style={[styles.listItem, { borderBottomColor: colors.border, backgroundColor: selected ? colors.primary + "15" : "transparent" }]}
                    onPress={() => {
                      if (openStep === "country") selectCountry(item);
                      else if (openStep === "state") selectState(item);
                      else selectCity(item);
                    }}
                  >
                    <Text style={[styles.listItemText, { color: selected ? colors.primary : colors.foreground }]}>{item}</Text>
                    {selected ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No options available</Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function PickerRow({
  label,
  value,
  placeholder,
  colors,
  disabled,
  onPress,
}: {
  label: string;
  value: string;
  placeholder: string;
  colors: ReturnType<typeof useColors>;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.pickerRow,
        {
          backgroundColor: disabled ? colors.muted + "60" : colors.muted,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={styles.pickerRowInner}>
        <Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text
          style={[styles.pickerValue, { color: value ? colors.foreground : colors.mutedForeground }]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
      </View>
      <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "column", gap: 8 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  pickerRowInner: { flex: 1 },
  pickerLabel: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  pickerValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
  clearBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 8,
    padding: 6,
  },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    paddingBottom: 32,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    gap: 16,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: -8 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  listItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1 },
  listItemText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  emptyText: { textAlign: "center", fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 24 },
});
