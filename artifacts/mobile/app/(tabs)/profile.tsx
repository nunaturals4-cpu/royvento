import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface MenuItem {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  tint?: string;
  chevron?: boolean;
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: topPadding + 12 }}>
        <View style={styles.signInContainer}>
          <LinearGradient
            colors={[colors.primary, colors.goldLight ?? "#e8c050"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarPlaceholder}
          >
            <Ionicons name="person" size={40} color={colors.primaryForeground} />
          </LinearGradient>
          <Text style={[styles.signInTitle, { color: colors.foreground }]}>
            Welcome to Royvento
          </Text>
          <Text style={[styles.signInSub, { color: colors.mutedForeground }]}>
            Sign in to manage bookings, wishlists, and more
          </Text>
          <Pressable
            style={[styles.signInBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/(auth)/login")}
          >
            <Text style={[styles.signInBtnText, { color: colors.primaryForeground }]}>
              Sign In
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push("/(auth)/register")}>
            <Text style={[styles.registerLink, { color: colors.primary }]}>Create account</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const menuItems: MenuItem[] = [
    {
      icon: "ticket-outline",
      label: "My Bookings",
      onPress: () => router.push("/(tabs)/bookings"),
      chevron: true,
    },
    {
      icon: "heart-outline",
      label: "Wishlist",
      onPress: () => router.push("/(tabs)/wishlist"),
      chevron: true,
    },
    ...(user.role === "vendor"
      ? [
          {
            icon: "business-outline" as const,
            label: "Vendor Dashboard",
            onPress: () => router.push("/vendor/dashboard"),
            chevron: true,
            tint: colors.primary,
          },
        ]
      : []),
    {
      icon: "search-outline",
      label: "Explore Events",
      onPress: () => router.push("/(tabs)/explore"),
      chevron: true,
    },
    {
      icon: "log-out-outline",
      label: "Sign Out",
      onPress: () => {
        Alert.alert("Sign Out", "Are you sure?", [
          { text: "Cancel", style: "cancel" },
          { text: "Sign Out", style: "destructive", onPress: logout },
        ]);
      },
      tint: colors.destructive,
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : 100 }}
    >
      {/* Header */}
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={[styles.hero, { paddingTop: topPadding + 20 }]}
      >
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>{initials}</Text>
        </View>
        <Text style={[styles.name, { color: colors.foreground }]}>{user.name}</Text>
        <Text style={[styles.email, { color: colors.mutedForeground }]}>{user.email}</Text>
        <View style={[styles.roleBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons
            name={user.role === "vendor" ? "business-outline" : user.role === "admin" ? "shield-outline" : "person-outline"}
            size={12}
            color={colors.primary}
          />
          <Text style={[styles.roleText, { color: colors.primary }]}>
            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
          </Text>
        </View>
      </LinearGradient>

      {/* Menu */}
      <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {menuItems.map((item, idx) => (
          <Pressable
            key={item.label}
            onPress={item.onPress}
            style={({ pressed }) => [
              styles.menuItem,
              idx < menuItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={[styles.menuIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name={item.icon} size={18} color={item.tint ?? colors.foreground} />
            </View>
            <Text style={[styles.menuLabel, { color: item.tint ?? colors.foreground }]}>
              {item.label}
            </Text>
            {item.chevron ? (
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            ) : null}
          </Pressable>
        ))}
      </View>

      <Text style={[styles.version, { color: colors.mutedForeground }]}>
        Royvento v1.0.0
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  signInContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  signInTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  signInSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
  signInBtn: {
    marginTop: 8,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 14,
  },
  signInBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  registerLink: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  hero: {
    alignItems: "center",
    paddingBottom: 28,
    paddingHorizontal: 20,
    gap: 6,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarText: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  name: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  email: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
  },
  roleText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  menuCard: {
    margin: 20,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  version: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
  },
});
