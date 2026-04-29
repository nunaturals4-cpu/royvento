import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter, useSegments } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export const BOTTOM_NAV_HEIGHT = 60;

interface Tab {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconFocused: React.ComponentProps<typeof Ionicons>["name"];
  route: string;
  matchPaths: string[];
}

const TABS: Tab[] = [
  {
    label: "Home",
    icon: "home-outline",
    iconFocused: "home",
    route: "/(tabs)",
    matchPaths: ["/(tabs)", "/(tabs)/index", "/", "/index"],
  },
  {
    label: "Pub",
    icon: "beer-outline",
    iconFocused: "beer",
    route: "/(tabs)/explore",
    matchPaths: ["/(tabs)/explore", "/explore"],
  },
  {
    label: "Bookings",
    icon: "ticket-outline",
    iconFocused: "ticket",
    route: "/(tabs)/bookings",
    matchPaths: ["/(tabs)/bookings", "/bookings"],
  },
  {
    label: "Profile",
    icon: "person-outline",
    iconFocused: "person",
    route: "/(tabs)/profile",
    matchPaths: ["/(tabs)/profile", "/profile"],
  },
];

export function PersistentBottomNav() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();

  const isAuth = segments[0] === "(auth)";
  if (isAuth) return null;

  const bottomInset = Platform.OS === "web" ? 0 : insets.bottom;
  const totalHeight = BOTTOM_NAV_HEIGHT + bottomInset;

  function isActive(tab: Tab): boolean {
    if (tab.route === "/(tabs)") {
      return pathname === "/" || pathname === "" || pathname === "/(tabs)" || pathname === "/(tabs)/index";
    }
    return tab.matchPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: totalHeight,
          paddingBottom: bottomInset,
        },
      ]}
    >
      {TABS.map((tab) => {
        const focused = isActive(tab);
        const color = focused ? colors.primary : colors.mutedForeground;
        return (
          <Pressable
            key={tab.route}
            onPress={() => router.push(tab.route as never)}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: focused }}
          >
            <View style={[styles.indicator, focused && { backgroundColor: colors.primary + "22" }]}>
              <Ionicons name={focused ? tab.iconFocused : tab.icon} size={22} color={color} />
            </View>
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    borderTopWidth: 1,
    zIndex: 100,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.12,
          shadowRadius: 8,
        }
      : { elevation: 12 }),
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingTop: 8,
    gap: 3,
  },
  indicator: {
    width: 44,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
  },
});
