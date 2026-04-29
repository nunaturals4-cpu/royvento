import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView, type SFSymbol } from "expo-symbols";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

function NativeTabLayout({ isVendor }: { isVendor: boolean }) {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore">
        <Icon sf={{ default: "magnifyingglass", selected: "magnifyingglass" }} />
        <Label>Explore</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="pubs">
        <Icon sf={{ default: "wineglass", selected: "wineglass.fill" }} />
        <Label>Pubs</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bookings">
        <Icon sf={{ default: "ticket", selected: "ticket.fill" }} />
        <Label>Bookings</Label>
      </NativeTabs.Trigger>
      {isVendor ? (
        <NativeTabs.Trigger name="vendor">
          <Icon sf={{ default: "building.2", selected: "building.2.fill" }} />
          <Label>Partner</Label>
        </NativeTabs.Trigger>
      ) : null}
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout({ isVendor }: { isVendor: boolean }) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  const iconSize = 22;

  function tabBarIcon(
    focused: boolean,
    color: string,
    iosActive: SFSymbol,
    iosInactive: SFSymbol,
    androidActive: React.ComponentProps<typeof Ionicons>["name"],
    androidInactive: React.ComponentProps<typeof Ionicons>["name"]
  ) {
    return isIOS ? (
      <SymbolView name={focused ? iosActive : iosInactive} tintColor={color} size={iconSize} />
    ) : (
      <Ionicons name={focused ? androidActive : androidInactive} size={iconSize} color={color} />
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 67 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ) : null,
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 10,
          marginBottom: isWeb ? 0 : 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) =>
            tabBarIcon(focused, color, "house.fill", "house", "home", "home-outline"),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color, focused }) =>
            tabBarIcon(focused, color, "magnifyingglass", "magnifyingglass", "search", "search-outline"),
        }}
      />
      <Tabs.Screen
        name="pubs"
        options={{
          title: "Pubs",
          tabBarIcon: ({ color, focused }) =>
            tabBarIcon(focused, color, "wineglass.fill", "wineglass", "beer", "beer-outline"),
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          title: "Wishlist",
          tabBarItemStyle: { display: "none" },
          tabBarIcon: ({ color, focused }) =>
            tabBarIcon(focused, color, "heart.fill", "heart", "heart", "heart-outline"),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Bookings",
          tabBarIcon: ({ color, focused }) =>
            tabBarIcon(focused, color, "ticket.fill", "ticket", "ticket", "ticket-outline"),
        }}
      />
      <Tabs.Screen
        name="vendor"
        options={{
          title: "Partner",
          tabBarItemStyle: { display: isVendor ? "flex" : "none" },
          tabBarIcon: ({ color, focused }) =>
            tabBarIcon(focused, color, "building.2.fill", "building.2", "business", "business-outline"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) =>
            tabBarIcon(focused, color, "person.fill", "person", "person", "person-outline"),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { user } = useAuth();
  const isVendor = user?.role === "vendor" || user?.role === "admin";

  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout isVendor={isVendor} />;
  }
  return <ClassicTabLayout isVendor={isVendor} />;
}
