import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { customFetch, useUpdateMe } from "@workspace/api-client-react";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
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
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useLogout } from "@/hooks/useLogout";

async function uploadImageToStorage(localUri: string): Promise<string> {
  const filename = localUri.split("/").pop() ?? "profile.jpg";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  };
  const contentType = mimeMap[ext] ?? "image/jpeg";
  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
  const size = blob.size || 1;
  const { uploadURL, objectPath } = await customFetch<{ uploadURL: string; objectPath: string }>(
    "/api/storage/uploads/request-url",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: filename, size, contentType }) },
  );
  const putRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
  if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
  const pathAfterObjects = objectPath.replace(/^\/objects\//, "");
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return `https://${domain}/api/storage/objects/${pathAfterObjects}`;
}

interface ReferralData {
  code: string;
  referralCount: number;
  referralPoints: number;
}

interface Coupon {
  id: number;
  code: string;
  discountPercent: number;
  used: boolean;
  source: string | null;
  vendorId: number | null;
  vendorName: string | null;
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();
  const handleLogout = useLogout();
  const { locale, setLocale, t, languages } = useLanguage();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const [editModal, setEditModal] = useState(false);
  const [langModal, setLangModal] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? "");
  const [editPhone, setEditPhone] = useState(user?.phone ?? "");
  const [editAbout, setEditAbout] = useState(user?.about ?? "");
  const [editProfileImage, setEditProfileImage] = useState(user?.profileImage ?? "");
  const [imageUploading, setImageUploading] = useState(false);

  const updateMeMutation = useUpdateMe({
    mutation: {
      onSuccess: async (updated) => {
        await updateUser({
          name: updated.name,
          phone: updated.phone || undefined,
          about: updated.about || undefined,
          profileImage: updated.profileImage || undefined,
        });
        setEditModal(false);
        Alert.alert(t("profile.saved_title"), t("profile.profile_updated_mobile"));
      },
      onError: (err: Error) => {
        Alert.alert(t("common.error"), err.message || t("profile.update_failed"));
      },
    },
  });

  const pickImageAsset = async (): Promise<string | null> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("profile.permission_needed"), t("profile.photo_permission"));
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return null;
    return result.assets[0].uri;
  };

  const handlePickImage = async () => {
    const uri = await pickImageAsset();
    if (!uri) return;
    setImageUploading(true);
    try {
      const url = await uploadImageToStorage(uri);
      setEditProfileImage(url);
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert(t("profile.upload_failed"), err?.message ?? t("profile.upload_failed_desc"));
    } finally {
      setImageUploading(false);
    }
  };

  const handlePickAndSaveImage = async () => {
    const uri = await pickImageAsset();
    if (!uri) return;
    setImageUploading(true);
    try {
      const url = await uploadImageToStorage(uri);
      updateMeMutation.mutate({ data: { profileImage: url } });
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert(t("profile.upload_failed"), err?.message ?? t("profile.upload_failed_desc"));
    } finally {
      setImageUploading(false);
    }
  };

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
    if (!editName.trim()) { Alert.alert(t("profile.name_required")); return; }
    const phoneNormalized = editPhone.replace(/\D/g, "").slice(-10) || undefined;
    updateMeMutation.mutate({
      data: {
        name: editName.trim(),
        ...(phoneNormalized !== undefined ? { phone: phoneNormalized } : {}),
        about: editAbout.trim(),
        profileImage: editProfileImage,
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
          <Text style={[styles.signInTitle, { color: colors.foreground }]}>{t("profile.welcome_title")}</Text>
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
          <Pressable
            onPress={handlePickAndSaveImage}
            accessibilityLabel="Change profile photo"
          >
            {user.profileImage ? (
              <Image source={{ uri: user.profileImage }} style={[styles.avatar, { backgroundColor: colors.muted }]} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>{initials}</Text>
              </View>
            )}
            <View style={[styles.editAvatar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="camera-outline" size={12} color={colors.primary} />
            </View>
          </Pressable>
          <Pressable
            style={[styles.editProfileBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              setEditName(user.name);
              setEditPhone(user.phone ?? "");
              setEditAbout(user.about ?? "");
              setEditProfileImage(user.profileImage ?? "");
              setEditModal(true);
            }}
            accessibilityLabel="Edit profile"
          >
            <Ionicons name="pencil" size={12} color={colors.primary} />
          </Pressable>
        </View>
        <Text style={[styles.name, { color: colors.foreground }]}>{user.name}</Text>
        <Text style={[styles.email, { color: colors.mutedForeground }]}>{user.email}</Text>
        {user.about ? (
          <Text style={[styles.aboutText, { color: colors.mutedForeground }]} numberOfLines={2}>{user.about}</Text>
        ) : null}
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
              <Text style={[styles.referralSub, { color: colors.mutedForeground, fontSize: 10, marginTop: 2 }]}>
                100 pts = ₹10
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.copyBtn, { backgroundColor: colors.muted }]}
              onPress={() => Alert.alert(t("profile.code_copied"), `${t("profile.share_code")}: ${referral.code}`)}
            >
              <Ionicons name="copy-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Coupons */}
      {coupons.length > 0 ? (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("profile.active_coupons")}</Text>
          {coupons.map((c) => (
            <View key={c.id} style={[styles.couponRow, { borderTopColor: colors.border }]}>
              <View style={[styles.couponTag, { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}>
                <Ionicons name="pricetag-outline" size={12} color={colors.primary} />
                <Text style={[styles.couponCode, { color: colors.primary }]}>{c.code}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.couponDetail, { color: colors.mutedForeground }]}>
                  {`${c.discountPercent}% off`}
                </Text>
                {c.vendorName && c.vendorId ? (
                  <Pressable onPress={() => router.push(`/partner/${c.vendorId}` as any)}>
                    <Text style={{ fontSize: 10, color: colors.primary, fontFamily: "Inter_400Regular", textDecorationLine: "underline" }}>
                      {c.vendorName} only ↗
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Quick Actions (vendor/admin) */}
      {(user.role === "vendor" || user.role === "admin") && (
        <View style={[styles.quickActions, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("profile.quick_actions")}</Text>
          <View style={styles.quickRow}>
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}
              onPress={() => router.push("/vendor/dashboard")}
            >
              <Ionicons name="bar-chart-outline" size={22} color={colors.primary} />
              <Text style={[styles.quickLabel, { color: colors.primary }]}>{t("profile.dashboard")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}
              onPress={() => router.push("/scanner")}
            >
              <Ionicons name="qr-code-outline" size={22} color={colors.primary} />
              <Text style={[styles.quickLabel, { color: colors.primary }]}>{t("profile.scan_ticket")}</Text>
            </TouchableOpacity>
            {user.role === "admin" && (
              <TouchableOpacity
                style={[styles.quickBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}
                onPress={() => router.push("/admin")}
              >
                <Ionicons name="shield-outline" size={22} color={colors.primary} />
                <Text style={[styles.quickLabel, { color: colors.primary }]}>{t("profile.admin_panel")}</Text>
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
            <Text style={[styles.becomeVendorTitle, { color: colors.foreground }]}>{t("profile.list_venue")}</Text>
            <Text style={[styles.becomeVendorSub, { color: colors.mutedForeground }]}>Apply to become a Royvento partner</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </TouchableOpacity>
      )}

      {/* Menu */}
      <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {[
          ...(user.role === "user"
            ? [{ icon: "business-outline" as const, label: t("profile.become_partner"), onPress: () => router.push("/become-vendor") }]
            : []),
          { icon: "ticket-outline" as const, label: t("bookings.title"), onPress: () => router.push("/(tabs)/bookings") },
          { icon: "heart-outline" as const, label: t("profile.wishlist"), onPress: () => router.push("/(tabs)/wishlist") },
          { icon: "search-outline" as const, label: t("profile.explore_events"), onPress: () => router.push("/(tabs)/explore") },
          { icon: "newspaper-outline" as const, label: t("profile.blog_stories"), onPress: () => router.push("/blogs") },
          { icon: "star-outline" as const, label: t("profile.subscription_premium"), onPress: () => router.push("/subscription") },
          { icon: "language-outline" as const, label: t("profile.language"), onPress: () => setLangModal(true) },
          {
            icon: "log-out-outline" as const,
            label: t("profile.sign_out"),
            onPress: () =>
              Alert.alert(t("profile.sign_out_title"), t("profile.sign_out_confirm"), [
                { text: t("common.cancel"), style: "cancel" },
                { text: t("profile.sign_out"), style: "destructive", onPress: handleLogout },
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
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("profile.edit_profile")}</Text>
                <Pressable onPress={() => setEditModal(false)}>
                  <Ionicons name="close" size={22} color={colors.mutedForeground} />
                </Pressable>
              </View>

              {/* Profile Photo */}
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("profile.profile_photo")}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 }}>
                  {editProfileImage ? (
                    <Image source={{ uri: editProfileImage }} style={styles.photoPreview} contentFit="cover" />
                  ) : (
                    <View style={[styles.photoPreview, { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }]}>
                      <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.primaryForeground }}>
                        {editName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.photoBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
                      onPress={handlePickImage}
                      disabled={imageUploading}
                    >
                      {imageUploading ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <>
                          <Ionicons name="camera-outline" size={16} color={colors.primary} />
                          <Text style={[styles.photoBtnText, { color: colors.primary }]}>
                            {editProfileImage ? t("profile.change_photo") : t("profile.upload_photo")}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                    {editProfileImage ? (
                      <TouchableOpacity
                        style={[styles.photoBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
                        onPress={() => setEditProfileImage("")}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.destructive} />
                        <Text style={[styles.photoBtnText, { color: colors.destructive }]}>{t("profile.remove_photo")}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* Name & Phone fields */}
              {[
                { label: t("profile.name"), value: editName, set: setEditName, placeholder: t("profile.name_placeholder"), multiline: false },
                { label: t("profile.phone"), value: editPhone, set: setEditPhone, placeholder: "+91 XXXXXXXXXX", multiline: false },
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

              {/* About */}
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("profile.about")}</Text>
                <TextInput
                  style={[styles.fieldInput, styles.aboutInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                  value={editAbout}
                  onChangeText={setEditAbout}
                  placeholder={t("profile.about_placeholder")}
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  numberOfLines={4}
                  maxLength={2000}
                />
                <Text style={[{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "right", marginTop: 4 }]}>
                  {editAbout.length}/2000
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary }, (updateMeMutation.isPending || imageUploading) && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={updateMeMutation.isPending || imageUploading}
              >
                {updateMeMutation.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Language Picker Modal */}
      <Modal visible={langModal} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: 32 }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("profile.select_language")}</Text>
                <Pressable onPress={() => setLangModal(false)}>
                  <Ionicons name="close" size={22} color={colors.mutedForeground} />
                </Pressable>
              </View>
              {languages.map((lang) => {
                const active = locale === lang.code;
                return (
                  <Pressable
                    key={lang.code}
                    onPress={async () => {
                      await setLocale(lang.code);
                      setLangModal(false);
                    }}
                    style={({ pressed }) => [{
                      flexDirection: "row" as const,
                      alignItems: "center" as const,
                      paddingVertical: 14,
                      paddingHorizontal: 4,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                      opacity: pressed ? 0.7 : 1,
                    }]}
                  >
                    <Text style={{ flex: 1, fontSize: 16, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular", color: active ? colors.primary : colors.foreground }}>
                      {lang.native}
                    </Text>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginRight: 8 }}>
                      {lang.english}
                    </Text>
                    {active && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                  </Pressable>
                );
              })}
            </View>
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
  editProfileBtn: { position: "absolute", top: -4, right: -28, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1 },
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
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)" },
  modalCard: { borderRadius: 24, borderWidth: 1, padding: 24, gap: 16 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4 },
  fieldInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular" },
  aboutInput: { minHeight: 88, textAlignVertical: "top" },
  aboutText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 280, lineHeight: 18 },
  photoPreview: { width: 64, height: 64, borderRadius: 32 },
  photoBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  photoBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
