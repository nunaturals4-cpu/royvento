import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { SymbolView, type SFSymbol } from "expo-symbols";
import React from "react";
import { Platform } from "react-native";
import { useColors } from "@/hooks/useColors";

export default function TabLayout() {
  const colors = useColors();
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
          title: "Pubs",
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
        name="vendors"
        options={{
          title: "Partners",
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
