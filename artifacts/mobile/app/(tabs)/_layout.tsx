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

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore">
        <Icon sf={{ default: "wineglass", selected: "wineglass.fill" }} />
        <Label>Pub</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bookings">
        <Icon sf={{ default: "ticket", selected: "ticket.fill" }} />
        <Label>Bookings</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
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
        tabBarStyle: { display: "none" },
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
          title: "Pub",
          tabBarIcon: ({ color, focused }) =>
            tabBarIcon(focused, color, "wineglass.fill", "wineglass", "beer", "beer-outline"),
        }}
      />
      <Tabs.Screen
        name="pubs"
        options={{
          title: "Pubs",
          tabBarItemStyle: { display: "none" },
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
          tabBarItemStyle: { display: "none" },
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
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
