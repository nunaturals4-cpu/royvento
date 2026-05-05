import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter, useSegments } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

export const BOTTOM_NAV_HEIGHT = 60;

interface Tab {
  labelKey: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconFocused: React.ComponentProps<typeof Ionicons>["name"];
  route: string;
  matchPaths: string[];
}

const TABS: Tab[] = [
  {
    labelKey: "nav.home",
    icon: "home-outline",
    iconFocused: "home",
    route: "/(tabs)",
    matchPaths: ["/(tabs)", "/(tabs)/index", "/", "/index"],
  },
  {
    labelKey: "nav.pubs",
    icon: "beer-outline",
    iconFocused: "beer",
    route: "/(tabs)/explore",
    matchPaths: ["/(tabs)/explore", "/explore"],
  },
  {
    labelKey: "nav.deals",
    icon: "pricetags-outline",
    iconFocused: "pricetags",
    route: "/(tabs)/deals",
    matchPaths: ["/(tabs)/deals", "/deals"],
  },
  {
    labelKey: "nav.bookings",
    icon: "ticket-outline",
    iconFocused: "ticket",
    route: "/(tabs)/bookings",
    matchPaths: ["/(tabs)/bookings", "/bookings"],
  },
  {
    labelKey: "nav.profile",
    icon: "person-outline",
    iconFocused: "person",
    route: "/(tabs)/profile",
    matchPaths: ["/(tabs)/profile", "/profile"],
  },
];

export function PersistentBottomNav() {
  const { t } = useLanguage();
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
            accessibilityLabel={t(tab.labelKey)}
            accessibilityState={{ selected: focused }}
          >
            {focused && (
              <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />
            )}
            <View
              style={[
                styles.indicator,
                focused && {
                  backgroundColor: colors.primary + "28",
                  borderWidth: 1,
                  borderColor: colors.primary + "44",
                },
              ]}
            >
              <Ionicons name={focused ? tab.iconFocused : tab.icon} size={22} color={color} />
            </View>
            <Text
              style={[
                styles.label,
                { color },
                focused && { fontFamily: "Inter_700Bold" },
              ]}
            >
              {t(tab.labelKey)}
            </Text>
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
    borderTopWidth: StyleSheet.hairlineWidth,
    zIndex: 100,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.18,
          shadowRadius: 12,
        }
      : { elevation: 16 }),
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingTop: 6,
    gap: 3,
    position: "relative",
  },
  activeDot: {
    position: "absolute",
    top: 0,
    width: 20,
    height: 2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  indicator: {
    width: 48,
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
