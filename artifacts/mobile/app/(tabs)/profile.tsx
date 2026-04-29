import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { customFetch, useUpdateMe } from "@workspace/api-client-react";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface ReferralData {
  code: string;
  referralCount: number;
  referralPoints: number;
}

interface Coupon {
  id: number;
  code: string;
  discountType: string;
  discountValue: number;
  expiresAt: string | null;
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, updateUser } = useAuth();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const [editModal, setEditModal] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? "");
  const [editPhone, setEditPhone] = useState(user?.phone ?? "");

  const updateMeMutation = useUpdateMe({
    mutation: {
      onSuccess: async (updated) => {
        await updateUser({ name: updated.name, phone: updated.phone });
        setEditModal(false);
        Alert.alert("Saved", "Profile updated successfully");
      },
      onError: (err: Error) => {
        Alert.alert("Error", err.message || "Failed to update profile");
      },
    },
  });

  const referralQuery = useQuery<ReferralData>({
    queryKey: ["referral-me"],
    queryFn: () => customFetch<ReferralData>("/api/referrals/me"),
    enabled: !!user,
  });

  const couponQuery = useQuery<Coupon[]>({
    queryKey: ["coupons-me"],
    queryFn: () => customFetch<Coupon[]>("/api/coupons/me"),
    enabled: !!user,
  });

  const handleSave = () => {
    if (!editName.trim()) { Alert.alert("Name required"); return; }
    const phoneNormalized = editPhone.replace(/\D/g, "").slice(-10) || undefined;
    updateMeMutation.mutate({
      data: {
        name: editName.trim(),
        ...(phoneNormalized !== undefined ? { phone: phoneNormalized } : {}),
      },
    });
  };

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
          <Text style={[styles.signInTitle, { color: colors.foreground }]}>Welcome to Royvento</Text>
          <Text style={[styles.signInSub, { color: colors.mutedForeground }]}>
            Sign in to manage bookings, wishlists, and more
          </Text>
          <Pressable
            style={[styles.signInBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/(auth)/login")}
          >
            <Text style={[styles.signInBtnText, { color: colors.primaryForeground }]}>Sign In</Text>
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

  const referral = referralQuery.data;
  const coupons = couponQuery.data ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }}
    >
      {/* Hero */}
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={[styles.hero, { paddingTop: topPadding + 20 }]}
      >
        <View style={{ position: "relative" }}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>{initials}</Text>
          </View>
          <Pressable
            style={[styles.editAvatar, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => { setEditName(user.name); setEditPhone(user.phone ?? ""); setEditModal(true); }}
          >
            <Ionicons name="pencil" size={12} color={colors.primary} />
          </Pressable>
        </View>
        <Text style={[styles.name, { color: colors.foreground }]}>{user.name}</Text>
        <Text style={[styles.email, { color: colors.mutedForeground }]}>{user.email}</Text>
        <View style={[styles.roleBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons
            name={
              user.role === "vendor"
                ? "business-outline"
                : user.role === "admin"
                ? "shield-outline"
                : "person-outline"
            }
            size={12}
            color={colors.primary}
          />
          <Text style={[styles.roleText, { color: colors.primary }]}>
            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
          </Text>
        </View>
      </LinearGradient>

      {/* Referral Card */}
      {referral ? (
        <View style={[styles.referralCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.referralRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.referralTitle, { color: colors.foreground }]}>Your Referral Code</Text>
              <Text style={[styles.referralCode, { color: colors.primary }]}>{referral.code}</Text>
              <Text style={[styles.referralSub, { color: colors.mutedForeground }]}>
                {referral.referralCount} referral{referral.referralCount !== 1 ? "s" : ""} · {referral.referralPoints} points
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.copyBtn, { backgroundColor: colors.muted }]}
              onPress={() => Alert.alert("Code Copied", `Share your code: ${referral.code}`)}
            >
              <Ionicons name="copy-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Coupons */}
      {coupons.length > 0 ? (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Active Coupons</Text>
          {coupons.map((c) => (
            <View key={c.id} style={[styles.couponRow, { borderTopColor: colors.border }]}>
              <View style={[styles.couponTag, { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}>
                <Ionicons name="pricetag-outline" size={12} color={colors.primary} />
                <Text style={[styles.couponCode, { color: colors.primary }]}>{c.code}</Text>
              </View>
              <Text style={[styles.couponDetail, { color: colors.mutedForeground }]}>
                {c.discountType === "percent"
                  ? `${c.discountValue}% off`
                  : `₹${c.discountValue} off`}
                {c.expiresAt ? ` · exp ${new Date(c.expiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Quick Actions (vendor/admin) */}
      {(user.role === "vendor" || user.role === "admin") && (
        <View style={[styles.quickActions, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Quick Actions</Text>
          <View style={styles.quickRow}>
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}
              onPress={() => router.push("/vendor/dashboard")}
            >
              <Ionicons name="bar-chart-outline" size={22} color={colors.primary} />
              <Text style={[styles.quickLabel, { color: colors.primary }]}>Dashboard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}
              onPress={() => router.push("/scanner")}
            >
              <Ionicons name="qr-code-outline" size={22} color={colors.primary} />
              <Text style={[styles.quickLabel, { color: colors.primary }]}>Scan Ticket</Text>
            </TouchableOpacity>
            {user.role === "admin" && (
              <TouchableOpacity
                style={[styles.quickBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}
                onPress={() => router.push("/admin")}
              >
                <Ionicons name="shield-outline" size={22} color={colors.primary} />
                <Text style={[styles.quickLabel, { color: colors.primary }]}>Admin Panel</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Become Vendor CTA */}
      {user.role === "user" && (
        <TouchableOpacity
          style={[styles.becomeVendorCard, { backgroundColor: colors.card, borderColor: colors.primary + "60" }]}
          onPress={() => router.push("/become-vendor")}
        >
          <View style={[styles.becomeVendorIcon, { backgroundColor: colors.primary + "20" }]}>
            <Ionicons name="business-outline" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.becomeVendorTitle, { color: colors.foreground }]}>List Your Venue</Text>
            <Text style={[styles.becomeVendorSub, { color: colors.mutedForeground }]}>Apply to become a Royvento partner</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </TouchableOpacity>
      )}

      {/* Menu */}
      <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {[
          (user.role === "vendor" || user.role === "admin")
            ? { icon: "business-outline" as const, label: "Partner Dashboard", onPress: () => router.push("/vendor/dashboard") }
            : { icon: "business-outline" as const, label: "Become a Partner", onPress: () => router.push("/become-vendor") },
          { icon: "ticket-outline" as const, label: "My Bookings", onPress: () => router.push("/(tabs)/bookings") },
          { icon: "heart-outline" as const, label: "Wishlist", onPress: () => router.push("/(tabs)/wishlist") },
          { icon: "search-outline" as const, label: "Explore Events", onPress: () => router.push("/(tabs)/explore") },
          { icon: "newspaper-outline" as const, label: "Blog & Stories", onPress: () => router.push("/blogs") },
          {
            icon: "log-out-outline" as const,
            label: "Sign Out",
            onPress: () =>
              Alert.alert("Sign Out", "Are you sure?", [
                { text: "Cancel", style: "cancel" },
                { text: "Sign Out", style: "destructive", onPress: logout },
              ]),
            tint: colors.destructive,
          },
        ].map((item, idx, arr) => (
          <Pressable
            key={item.label}
            onPress={item.onPress}
            style={({ pressed }) => [
              styles.menuItem,
              idx < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={[styles.menuIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name={item.icon} size={18} color={item.tint ?? colors.foreground} />
            </View>
            <Text style={[styles.menuLabel, { color: item.tint ?? colors.foreground }]}>{item.label}</Text>
            {"tint" in item && item.tint === colors.destructive ? null : (
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            )}
          </Pressable>
        ))}
      </View>

      <Text style={[styles.version, { color: colors.mutedForeground }]}>Royvento v1.0.0</Text>

      <MobileFooter />

      {/* Edit Profile Modal */}
      <Modal visible={editModal} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Profile</Text>
              <Pressable onPress={() => setEditModal(false)}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {[
              { label: "Name", value: editName, set: setEditName, placeholder: "Your name" },
              { label: "Phone", value: editPhone, set: setEditPhone, placeholder: "+91 XXXXXXXXXX" },
            ].map((f) => (
              <View key={f.label} style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                <TextInput
                  style={[styles.fieldInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                  value={f.value}
                  onChangeText={f.set}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
            ))}
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }, updateMeMutation.isPending && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={updateMeMutation.isPending}
            >
              {updateMeMutation.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  signInContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  avatarPlaceholder: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  signInTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  signInSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  signInBtn: { marginTop: 8, paddingHorizontal: 40, paddingVertical: 14, borderRadius: 14 },
  signInBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  registerLink: { fontSize: 14, fontFamily: "Inter_500Medium" },
  hero: { alignItems: "center", paddingBottom: 28, paddingHorizontal: 20, gap: 6 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  avatarText: { fontSize: 28, fontFamily: "Inter_700Bold" },
  editAvatar: { position: "absolute", bottom: 4, right: -4, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  name: { fontSize: 22, fontFamily: "Inter_700Bold" },
  email: { fontSize: 14, fontFamily: "Inter_400Regular" },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginTop: 4 },
  roleText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  referralCard: { margin: 20, marginBottom: 0, borderRadius: 16, borderWidth: 1, padding: 16 },
  referralRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  referralTitle: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 4 },
  referralCode: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  referralSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  copyBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  section: { margin: 20, marginBottom: 0, borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 8 },
  couponRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, paddingTop: 10 },
  couponTag: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  couponCode: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  couponDetail: { fontSize: 12, fontFamily: "Inter_400Regular" },
  quickActions: { margin: 20, marginBottom: 0, borderRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  quickRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  quickBtn: { flex: 1, minWidth: 90, borderWidth: 1, borderRadius: 14, padding: 14, alignItems: "center", gap: 6 },
  quickLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  becomeVendorCard: { margin: 20, marginBottom: 0, borderRadius: 16, borderWidth: 1.5, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  becomeVendorIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  becomeVendorTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  becomeVendorSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  menuCard: { margin: 20, borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  menuItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  menuIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  menuLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  version: { textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { borderRadius: 24, borderWidth: 1, padding: 24, margin: 16, gap: 16 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4 },
  fieldInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular" },
  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
