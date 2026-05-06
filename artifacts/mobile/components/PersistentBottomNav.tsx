import { Ionicons } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSegments } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";

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

interface NotificationItem {
  id: number;
  isRead: boolean;
}

export function PersistentBottomNav() {
  const { t } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const { user } = useAuth();

  const { data: notifications } = useQuery<NotificationItem[]>({
    queryKey: ["notifications"],
    queryFn: () => customFetch<NotificationItem[]>("/api/notifications"),
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 90_000,
    select: (data) => data,
  });

  const unreadCount = (notifications ?? []).filter((n) => !n.isRead).length;

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
        const isProfile = tab.route === "/(tabs)/profile";
        const showBadge = isProfile && unreadCount > 0;

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
            <View style={styles.iconWrapper}>
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
              {showBadge && (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? "99+" : String(unreadCount)}
                  </Text>
                </View>
              )}
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
  iconWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  indicator: {
    width: 48,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    lineHeight: 12,
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
  },
});
