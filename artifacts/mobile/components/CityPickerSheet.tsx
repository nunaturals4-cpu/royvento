import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
import { COUNTRIES } from "@/utils/locations";

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedCity: string;
  onSelect: (city: string) => void;
}

const POPULAR_CITIES: { name: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { name: "Mumbai",     icon: "boat-outline" },
  { name: "Delhi",      icon: "business-outline" },
  { name: "Bengaluru",  icon: "code-slash-outline" },
  { name: "Hyderabad",  icon: "globe-outline" },
  { name: "Chennai",    icon: "water-outline" },
  { name: "Kolkata",    icon: "library-outline" },
  { name: "Pune",       icon: "trail-sign-outline" },
  { name: "Goa",        icon: "sunny-outline" },
  { name: "Jaipur",     icon: "color-palette-outline" },
  { name: "Kochi",      icon: "musical-notes-outline" },
  { name: "Chandigarh", icon: "leaf-outline" },
  { name: "Ahmedabad",  icon: "restaurant-outline" },
];

const ALL_CITIES: string[] = Array.from(
  new Set(
    COUNTRIES.flatMap((country) =>
      country.states.flatMap((state) => state.cities)
    )
  )
).sort((a, b) => a.localeCompare(b));

function groupByLetter(cities: string[]): { title: string; data: string[] }[] {
  const groups: Record<string, string[]> = {};
  for (const city of cities) {
    const letter = city[0].toUpperCase();
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(city);
  }
  return Object.keys(groups)
    .sort()
    .map((letter) => ({ title: letter, data: groups[letter] }));
}

class LocationDetectionError extends Error {}

async function detectCityFromLocation(): Promise<string> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new LocationDetectionError("Location permission denied. Enable it in your device settings to auto-detect your city.");
  }
  const coords = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const [place] = await Location.reverseGeocodeAsync({
    latitude: coords.coords.latitude,
    longitude: coords.coords.longitude,
  });
  const normalized = (name: string) => name.trim().toLowerCase();
  const candidates = [place?.city, place?.subregion, place?.region].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const match =
      ALL_CITIES.find((c) => normalized(c) === normalized(candidate)) ??
      ALL_CITIES.find((c) => normalized(candidate).includes(normalized(c))) ??
      ALL_CITIES.find((c) => normalized(c).includes(normalized(candidate)));
    if (match) return match;
  }
  throw new LocationDetectionError("Couldn't determine your area from GPS. Please search for your city below.");
}

export function CityPickerSheet({ visible, onClose, selectedCity, onSelect }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  const filteredCities = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_CITIES;
    return ALL_CITIES.filter((c) => c.toLowerCase().includes(q));
  }, [query]);

  const sections = useMemo(() => groupByLetter(filteredCities), [filteredCities]);

  const isSearching = query.trim().length > 0;

  function handleSelect(city: string) {
    onSelect(city);
    setQuery("");
    onClose();
  }

  function handleClear() {
    onSelect("");
    setQuery("");
    onClose();
  }

  async function handleUseMyLocation() {
    setLocating(true);
    setLocationError("");
    try {
      const city = await detectCityFromLocation();
      onSelect(city);
      setQuery("");
      onClose();
    } catch (e) {
      setLocationError(e instanceof LocationDetectionError ? e.message : "Couldn't detect your location. Please try again or search for your city below.");
    } finally {
      setLocating(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={() => { setQuery(""); onClose(); }}
    >
      <Pressable style={styles.overlay} onPress={() => { setQuery(""); onClose(); }}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingBottom: insets.bottom + 16,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
              {selectedCity ? (
                <>
                  City:{" "}
                  <Text style={{ color: colors.primary }}>{selectedCity}</Text>
                </>
              ) : (
                "Select your city"
              )}
            </Text>
            <Pressable onPress={() => { setQuery(""); onClose(); }}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View
            style={[
              styles.searchRow,
              { backgroundColor: colors.muted, borderColor: colors.border },
            ]}
          >
            <Ionicons name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              value={query}
              onChangeText={setQuery}
              placeholder="Search city…"
              placeholderTextColor={colors.mutedForeground}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")}>
                <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionButton, { borderColor: colors.primary + "60", backgroundColor: colors.primary + "12" }]}
              onPress={handleUseMyLocation}
              disabled={locating}
              activeOpacity={0.7}
            >
              {locating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="navigate" size={13} color={colors.primary} />
              )}
              <Text style={[styles.actionButtonText, { color: colors.primary }]}>
                {locating ? "Detecting…" : "Use my location"}
              </Text>
            </TouchableOpacity>

            {selectedCity ? (
              <TouchableOpacity
                style={[styles.actionButton, { borderColor: colors.border }]}
                onPress={handleClear}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle-outline" size={13} color={colors.mutedForeground} />
                <Text style={[styles.actionButtonText, { color: colors.mutedForeground }]}>
                  Show all cities
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {locationError ? (
            <View style={[styles.locationErrorBox, { backgroundColor: "#f59e0b15", borderColor: "#f59e0b40" }]}>
              <Ionicons name="alert-circle-outline" size={14} color="#f59e0b" />
              <Text style={styles.locationErrorText}>{locationError}</Text>
            </View>
          ) : null}

          {isSearching ? (
            <FlatList
              data={filteredCities}
              keyExtractor={(item) => item}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No cities match "{query}"
                </Text>
              }
              renderItem={({ item }) => (
                <CityRow
                  city={item}
                  selected={item === selectedCity}
                  colors={colors}
                  onPress={() => handleSelect(item)}
                />
              )}
            />
          ) : (
            <ScrollView
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                Popular Cities
              </Text>
              <View style={styles.popularGrid}>
                {POPULAR_CITIES.map(({ name, icon }) => (
                  <TouchableOpacity
                    key={name}
                    style={[
                      styles.popularCard,
                      {
                        backgroundColor:
                          selectedCity === name
                            ? colors.primary + "18"
                            : colors.background,
                        borderColor:
                          selectedCity === name ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => handleSelect(name)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={icon}
                      size={20}
                      color={selectedCity === name ? colors.primary : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.popularName,
                        {
                          color:
                            selectedCity === name ? colors.primary : colors.foreground,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                All Cities
              </Text>

              {sections.map((section) => (
                <View key={section.title}>
                  <Text style={[styles.letterLabel, { color: colors.mutedForeground }]}>
                    {section.title}
                  </Text>
                  {section.data.map((city) => (
                    <CityRow
                      key={city}
                      city={city}
                      selected={city === selectedCity}
                      colors={colors}
                      onPress={() => handleSelect(city)}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CityRow({
  city,
  selected,
  colors,
  onPress,
}: {
  city: string;
  selected: boolean;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.cityRow,
        {
          borderBottomColor: colors.border,
          backgroundColor: selected ? colors.primary + "12" : "transparent",
        },
      ]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Text style={[styles.cityRowText, { color: selected ? colors.primary : colors.foreground }]}>
        {city}
      </Text>
      {selected ? (
        <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: "88%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 10,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionButtonText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  locationErrorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  locationErrorText: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#f59e0b",
    lineHeight: 15,
  },
  list: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
    marginTop: 4,
  },
  popularGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  popularCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: "29%",
    flexShrink: 1,
  },
  popularName: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flexShrink: 1,
  },
  divider: {
    height: 1,
    marginBottom: 14,
  },
  letterLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
    marginTop: 8,
  },
  cityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cityRowText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  emptyText: {
    textAlign: "center",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingVertical: 32,
  },
});
