import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { customFetch, useUpdateMe } from "@workspace/api-client-react";
import { getIndianPhoneError, normalizeIndianPhone } from "@workspace/validators";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { uploadImageToStorage } from "@/lib/uploadImage";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
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
import { useThemeId } from "@/context/ThemeContext";
import { THEMES } from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { useLogout } from "@/hooks/useLogout";
import { useUnreadNotificationCount } from "@/hooks/useNotifications";

interface ReferralData {
  code: string;
  referralCount: number;
  referralPoints: number;
}

interface DiscountInfo {
  isNewUser: boolean;
  daysLeft: number;
  bookingDiscountPercent: number;
  subscriptionDiscountPercent: number;
  points: number;
}

interface Invitation {
  id: number;
  vendorName: string;
  createdAt: string;
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

interface PointsHistoryEntry {
  key: string;
  type: "earned" | "spent";
  points: number;
  label: string;
  date: string;
}

interface PointsHistory {
  balance: number;
  history: PointsHistoryEntry[];
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();
  const handleLogout = useLogout();
  const { locale, setLocale, t, languages } = useLanguage();
  const { theme, setTheme } = useThemeId();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const [editModal, setEditModal] = useState(false);
  const [langModal, setLangModal] = useState(false);
  const [themeModal, setThemeModal] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? "");
  const [editPhone, setEditPhone] = useState(user?.phone ?? "");
  const [editAbout, setEditAbout] = useState(user?.about ?? "");
  const [editProfileImage, setEditProfileImage] = useState(user?.profileImage ?? "");
  const [imageUploading, setImageUploading] = useState(false);
  const [editPhoneError, setEditPhoneError] = useState<string | undefined>(undefined);
  const [editNameError, setEditNameError] = useState<string | undefined>(undefined);
  const editNameRef = useRef<TextInput>(null);
  const editPhoneRef = useRef<TextInput>(null);

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
      onError: (err: any) => {
        const fe: Record<string, string> = err?.data?.fieldErrors ?? err?.fieldErrors ?? {};
        if (Object.keys(fe).length > 0) {
          if (fe.name) setEditNameError(fe.name);
          if (fe.phone) setEditPhoneError(fe.phone);
          if (fe.name) editNameRef.current?.focus();
          else if (fe.phone) editPhoneRef.current?.focus();
          return;
        }
        Alert.alert(t("common.error"), err?.data?.error ?? err?.message ?? t("profile.update_failed"));
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

  const discountQuery = useQuery<DiscountInfo>({
    queryKey: ["discounts-me"],
    queryFn: () => customFetch<DiscountInfo>("/api/users/me/discounts"),
    enabled: !!user,
  });

  const invitationsQuery = useQuery<Invitation[]>({
    queryKey: ["manager-invitations"],
    queryFn: () => customFetch<Invitation[]>("/api/manager/invitations"),
    enabled: !!user,
  });

  const pointsHistoryQuery = useQuery<PointsHistory>({
    queryKey: ["points-history-me"],
    queryFn: () => customFetch<PointsHistory>("/api/users/me/points-history"),
    enabled: !!user,
  });

  // Shared with the persistent bottom-nav so we only poll /api/notifications
  // once per 90 s for the whole app — see hooks/useNotifications.ts.
  const unreadCount = useUnreadNotificationCount();

  const [actingInv, setActingInv] = useState<number | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current); };
  }, []);

  React.useEffect(() => {
    if (invitationsQuery.data) setInvitations(invitationsQuery.data);
  }, [invitationsQuery.data]);

  const respondToInvitation = async (id: number, action: "accept" | "reject") => {
    setActingInv(id);
    try {
      await customFetch(`/api/manager/invitations/${id}/${action}`, { method: "POST" });
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
      Alert.alert(
        action === "accept" ? t("profile.invitation_accepted") : t("profile.invitation_declined"),
        action === "accept" ? t("profile.invitation_accepted_desc") : "",
      );
    } catch {
      Alert.alert(t("common.error"), t("bookings.invitation_error"));
    } finally {
      setActingInv(null);
    }
  };

  const handleSave = () => {
    const nameErr = !editName.trim() ? t("profile.name_required") : undefined;
    const phoneErr = getIndianPhoneError(editPhone, { required: false }) ?? undefined;
    setEditNameError(nameErr);
    setEditPhoneError(phoneErr);
    if (nameErr) { editNameRef.current?.focus(); return; }
    if (phoneErr) { editPhoneRef.current?.focus(); return; }
    const phoneNormalized = editPhone.trim() ? normalizeIndianPhone(editPhone) : undefined;
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
      <>
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: topPadding + 12 }}>
          <View style={styles.signInContainer}>
            <LinearGradient
              colors={[colors.primary, colors.greenHover ?? "#4ade80"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarPlaceholder}
            >
              <Ionicons name="person" size={40} color={colors.primaryForeground} />
            </LinearGradient>
            <Text style={[styles.signInTitle, { color: colors.foreground }]}>{t("profile.welcome_title")}</Text>
            <Text style={[styles.signInSub, { color: colors.mutedForeground }]}>
              {t("profile.sign_in_sub")}
            </Text>
            <Pressable
              style={[styles.signInBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push("/(auth)/login")}
            >
              <Text style={[styles.signInBtnText, { color: colors.primaryForeground }]}>{t("auth.sign_in")}</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/(auth)/register")}>
              <Text style={[styles.registerLink, { color: colors.primary }]}>{t("auth.create_account")}</Text>
            </Pressable>
            <Pressable
              onPress={() => setLangModal(true)}
              style={[styles.languageSignedOutBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}
            >
              <Ionicons name="language-outline" size={18} color={colors.mutedForeground} />
              <Text style={[styles.languageSignedOutText, { color: colors.mutedForeground }]}>{t("profile.language")}</Text>
            </Pressable>
          </View>
        </View>
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
                <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
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
                          gap: 12,
                          paddingVertical: 14,
                          paddingHorizontal: 4,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                          opacity: pressed ? 0.7 : 1,
                        }]}
                      >
                        <Text
                          style={{ flexShrink: 1, fontSize: 16, lineHeight: 22, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular", color: active ? colors.primary : colors.foreground }}
                        >
                          {lang.native}
                        </Text>
                        <Text
                          style={{ flex: 1, textAlign: "right", fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}
                        >
                          {lang.english}
                        </Text>
                        {active && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const referral = referralQuery.data;
  const coupons = couponQuery.data ?? [];
  const discountInfo = discountQuery.data ?? null;
  const pointsHistory = pointsHistoryQuery.data ?? null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }}
    >
      {/* Hero */}
      <LinearGradient
        colors={["#121212", colors.background]}
        style={[styles.hero, { paddingTop: topPadding + 24 }]}
      >
        {/* Avatar row */}
        <View style={{ position: "relative" }}>
          <Pressable
            onPress={handlePickAndSaveImage}
            accessibilityLabel={t("profile.change_photo")}
          >
            {user.profileImage ? (
              <Image
                source={{ uri: user.profileImage }}
                style={[styles.avatar, { backgroundColor: colors.muted, borderWidth: 3, borderColor: colors.primary + "40" }]}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.primary + "40" }]}>
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
            accessibilityLabel={t("profile.edit_profile")}
          >
            <Ionicons name="pencil" size={12} color={colors.primary} />
          </Pressable>
        </View>

        <Text style={[styles.name, { color: colors.foreground, fontSize: 24 }]}>{user.name}</Text>
        <Text style={[styles.email, { color: colors.mutedForeground }]}>{user.email}</Text>

        {user.about ? (
          <Text style={[styles.aboutText, { color: colors.mutedForeground }]} numberOfLines={2}>{user.about}</Text>
        ) : null}

        {/* Role badge + points row */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
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
          {(user.points ?? 0) > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary + "18", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.primary + "30" }}>
              <Ionicons name="star" size={11} color={colors.primary} />
              <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.primary }}>
                {user.points ?? 0} pts
              </Text>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* Reward Points — ₹ value + redeem CTA (mirrors web account menu).
          Rate matches checkout: POINTS_RUPEE_RATE = 0.05 → 100 pts = ₹5. */}
      {(() => {
        const pts = user.points ?? 0;
        const rupee = Math.floor(pts * 0.05);
        return (
          <Pressable
            onPress={() => router.push("/(tabs)/deals")}
            style={[styles.section, { backgroundColor: colors.card, borderColor: colors.primary + "33", marginBottom: 0 }]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.8 }}>
                Reward Points
              </Text>
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>{pts} PTS</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
              <Ionicons name="gift-outline" size={15} color={colors.primary} />
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary }}>
                {rupee > 0 ? `₹${rupee} discount available` : "Earn points to unlock discounts"}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} style={{ marginLeft: "auto" }} />
            </View>
          </Pressable>
        );
      })()}

      {/* Scanner Invitations */}
      {invitations.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.primary + "60" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Ionicons name="notifications-outline" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("profile.scanner_invitations_title")}</Text>
          </View>
          {invitations.map((inv) => (
            <View
              key={inv.id}
              style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 4 }}
            >
              <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 2 }}>
                {inv.vendorName}
              </Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 10 }}>
                {t("profile.scanner_invitations_desc")}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={[styles.quickBtn, { flex: 1, backgroundColor: colors.primary, borderColor: colors.primary, flexDirection: "row", justifyContent: "center", paddingVertical: 10 }]}
                  onPress={() => respondToInvitation(inv.id, "accept")}
                  disabled={actingInv === inv.id}
                >
                  {actingInv === inv.id ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground }}>{t("profile.invitation_accept")}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickBtn, { flex: 1, backgroundColor: colors.muted, borderColor: colors.border, flexDirection: "row", justifyContent: "center", paddingVertical: 10 }]}
                  onPress={() => respondToInvitation(inv.id, "reject")}
                  disabled={actingInv === inv.id}
                >
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>{t("profile.invitation_decline")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Welcome Perks */}
      {discountInfo?.isNewUser && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.primary + "60" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("profile.welcome_perks_title")}</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 10 }}>
            {t("profile.welcome_perks_sub", { days: discountInfo.daysLeft })}
          </Text>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="checkmark-circle-outline" size={14} color={colors.primary} />
              <Text style={{ fontSize: 13, color: colors.foreground, fontFamily: "Inter_400Regular" }}>
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{discountInfo.bookingDiscountPercent}% off</Text>
                {" "}any booking
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="checkmark-circle-outline" size={14} color={colors.primary} />
              <Text style={{ fontSize: 13, color: colors.foreground, fontFamily: "Inter_400Regular" }}>
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{discountInfo.subscriptionDiscountPercent}% off</Text>
                {" "}a subscription plan
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Referral Card */}
      {referral ? (
        <View style={[styles.referralCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.referralRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.referralTitle, { color: colors.foreground }]}>{t("profile.your_referral_code")}</Text>
              <Text style={[styles.referralCode, { color: colors.primary }]}>{referral.code}</Text>
              <Text style={[styles.referralSub, { color: colors.mutedForeground }]}>
                {t("profile.referral_stats", { count: referral.referralCount, points: referral.referralPoints })}
              </Text>
              <Text style={[styles.referralSub, { color: colors.mutedForeground, fontSize: 10, marginTop: 2 }]}>
                {t("profile.pts_conversion")}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={[styles.copyBtn, { backgroundColor: colors.muted }]}
                  onPress={async () => {
                    const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "royvento.com";
                    const url = `https://${domain}/register?ref=${referral.code}`;
                    await Clipboard.setStringAsync(url);
                    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
                    setLinkCopied(true);
                    copyTimeoutRef.current = setTimeout(() => setLinkCopied(false), 2000);
                  }}
                >
                  <Ionicons name={linkCopied ? "checkmark-outline" : "copy-outline"} size={16} color={linkCopied ? "#22c55e" : colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.copyBtn, { backgroundColor: colors.muted }]}
                  onPress={async () => {
                    const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "royvento.com";
                    const url = `https://${domain}/register?ref=${referral.code}`;
                    const message = `Join me on Royvento and get rewards! Sign up with my link: ${url}`;
                    try {
                      await Share.share({ message, url });
                    } catch {
                      // user cancelled — no-op
                    }
                  }}
                >
                  <Ionicons name="share-social-outline" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
              {linkCopied && (
                <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#22c55e" }}>{t("profile.link_copied")}</Text>
              )}
            </View>
          </View>
        </View>
      ) : null}

      {/* Points History */}
      {pointsHistory && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Ionicons name="star-outline" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>Points history</Text>
            <View style={{ flex: 1 }} />
            <View style={[{ backgroundColor: colors.primary + "20", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }]}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.primary }}>
                {pointsHistory.balance} pts
              </Text>
            </View>
          </View>
          {pointsHistory.history.length === 0 ? (
            <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", paddingVertical: 12 }}>
              No transactions yet
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {pointsHistory.history.map((entry) => {
                const earned = entry.type === "earned";
                return (
                  <View
                    key={entry.key}
                    style={{ flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 10, marginBottom: 2 }}
                  >
                    <View style={[{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: earned ? "#22c55e20" : "#ef444420" }]}>
                      <Ionicons
                        name={earned ? "arrow-up-circle-outline" : "arrow-down-circle-outline"}
                        size={18}
                        color={earned ? "#22c55e" : "#ef4444"}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground }} numberOfLines={1}>
                        {entry.label}
                      </Text>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 }}>
                        {new Date(entry.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: earned ? "#22c55e" : "#ef4444" }}>
                      {earned ? "+" : "−"}{Math.abs(entry.points)}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

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
                  {t("profile.percent_off", { percent: c.discountPercent })}
                </Text>
                {c.vendorName && c.vendorId ? (
                  <Pressable onPress={() => router.push(`/partner/${c.vendorId}` as any)}>
                    <Text style={{ fontSize: 10, color: colors.primary, fontFamily: "Inter_400Regular", textDecorationLine: "underline" }}>
                      {t("profile.vendor_only", { vendor: c.vendorName })} ↗
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Quick Actions (partner roles + admin) */}
      {(user.role === "vendor" || user.role === "admin" || user.role === "organizer" || user.role === "game_organizer") && (
        <View style={[styles.quickActions, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("profile.quick_actions")}</Text>
          <View style={styles.quickRow}>
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}
              onPress={() => router.push(
                user.role === "organizer" ? "/organizer/dashboard" as any
                  : user.role === "game_organizer" ? "/game-organizer/dashboard" as any
                  : "/vendor/dashboard"
              )}
            >
              <Ionicons name="bar-chart-outline" size={22} color={colors.primary} />
              <Text style={[styles.quickLabel, { color: colors.primary }]}>
                {user.role === "organizer" ? "Event Management" : user.role === "game_organizer" ? "Game Management" : t("profile.dashboard")}
              </Text>
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

      {/* Menu */}
      <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {[
          { icon: "flame-outline" as const, label: "Tonight Plans", onPress: () => router.push("/tonight-plans" as any), badge: 0 },
          { icon: "game-controller-outline" as const, label: "Games & Sports", onPress: () => router.push("/games-and-sports" as any), badge: 0 },
          { icon: "mic-outline" as const, label: "Events", onPress: () => router.push("/events" as any), badge: 0 },
          { icon: "balloon-outline" as const, label: "Private Parties", onPress: () => router.push("/private-parties" as any), badge: 0 },
          { icon: "people-outline" as const, label: "Solo Connector", onPress: () => router.push("/solo-connect" as any), badge: 0 },
          { icon: "storefront-outline" as const, label: "Become a Partner", onPress: () => router.push("/become-vendor"), badge: 0 },
          { icon: "notifications-outline" as const, label: "Notifications", onPress: () => router.push("/notifications"), badge: unreadCount },
          { icon: "ticket-outline" as const, label: t("bookings.title"), onPress: () => router.push("/(tabs)/bookings"), badge: 0 },
          { icon: "heart-outline" as const, label: t("profile.wishlist"), onPress: () => router.push("/(tabs)/wishlist"), badge: 0 },
          { icon: "beer-outline" as const, label: t("nav.pubs"), onPress: () => router.push("/(tabs)/explore"), badge: 0 },
          { icon: "pricetags-outline" as const, label: t("nav.deals"), onPress: () => router.push("/(tabs)/deals"), badge: 0 },
          { icon: "newspaper-outline" as const, label: t("profile.blog_stories"), onPress: () => router.push("/blogs"), badge: 0 },
          { icon: "calculator-outline" as const, label: "Split Expense", onPress: () => router.push("/split-expense" as any), badge: 0 },
          { icon: "star-outline" as const, label: t("profile.subscription_premium"), onPress: () => router.push("/subscription"), badge: 0 },
          { icon: "headset-outline" as const, label: t("profile.contact_help"), onPress: () => router.push("/contact"), badge: 0 },
          { icon: "information-circle-outline" as const, label: "About Us", onPress: () => router.push("/about" as any), badge: 0 },
          { icon: "language-outline" as const, label: t("profile.language"), onPress: () => setLangModal(true), badge: 0 },
          { icon: "color-palette-outline" as const, label: "Theme", onPress: () => setThemeModal(true), badge: 0 },
          { icon: "document-text-outline" as const, label: "Terms of Service", onPress: () => router.push("/terms"), badge: 0 },
          { icon: "shield-checkmark-outline" as const, label: "Privacy Policy", onPress: () => router.push("/privacy"), badge: 0 },
          {
            icon: "log-out-outline" as const,
            label: t("profile.sign_out"),
            onPress: () =>
              Alert.alert(t("profile.sign_out_title"), t("profile.sign_out_confirm"), [
                { text: t("common.cancel"), style: "cancel" },
                { text: t("profile.sign_out"), style: "destructive", onPress: handleLogout },
              ]),
            tint: colors.destructive,
            badge: 0,
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {item.badge > 0 && (
                  <View style={[styles.menuBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.menuBadgeText}>{item.badge > 99 ? "99+" : String(item.badge)}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </View>
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

              {/* Name field */}
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("profile.name")}</Text>
                <TextInput
                  ref={editNameRef}
                  style={[styles.fieldInput, { backgroundColor: colors.muted, borderColor: editNameError ? colors.destructive : colors.border, color: colors.foreground }]}
                  value={editName}
                  onChangeText={(v) => { setEditName(v); if (editNameError) setEditNameError(undefined); }}
                  placeholder={t("profile.name_placeholder")}
                  placeholderTextColor={colors.mutedForeground}
                />
                {editNameError ? <Text style={{ fontSize: 12, color: colors.destructive, fontFamily: "Inter_400Regular", marginTop: 4 }}>{editNameError}</Text> : null}
              </View>

              {/* Phone field */}
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("profile.phone")}</Text>
                <TextInput
                  ref={editPhoneRef}
                  style={[styles.fieldInput, { backgroundColor: colors.muted, borderColor: editPhoneError ? colors.destructive : colors.border, color: colors.foreground }]}
                  value={editPhone}
                  onChangeText={(v) => { setEditPhone(v); if (editPhoneError) setEditPhoneError(undefined); }}
                  placeholder="+91 XXXXXXXXXX"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                />
                {editPhoneError ? <Text style={{ fontSize: 12, color: colors.destructive, fontFamily: "Inter_400Regular", marginTop: 4 }}>{editPhoneError}</Text> : null}
              </View>

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
                  <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>{t("profile.save_changes")}</Text>
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
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
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
                        gap: 12,
                        paddingVertical: 14,
                        paddingHorizontal: 4,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                        opacity: pressed ? 0.7 : 1,
                      }]}
                    >
                      <Text
                        style={{ flexShrink: 1, fontSize: 16, lineHeight: 22, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular", color: active ? colors.primary : colors.foreground }}
                      >
                        {lang.native}
                      </Text>
                      <Text
                        style={{ flex: 1, textAlign: "right", fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}
                      >
                        {lang.english}
                      </Text>
                      {active && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      {/* Theme picker — mirrors the web Noir / Gold / Dusk switcher */}
      <Modal visible={themeModal} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: 32 }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Choose a theme</Text>
                <Pressable onPress={() => setThemeModal(false)}>
                  <Ionicons name="close" size={22} color={colors.mutedForeground} />
                </Pressable>
              </View>
              {THEMES.map((th) => {
                const active = theme === th.id;
                return (
                  <Pressable
                    key={th.id}
                    onPress={() => {
                      setTheme(th.id);
                      setThemeModal(false);
                    }}
                    style={({ pressed }) => [{
                      flexDirection: "row" as const,
                      alignItems: "center" as const,
                      gap: 12,
                      paddingVertical: 14,
                      paddingHorizontal: 4,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                      opacity: pressed ? 0.7 : 1,
                    }]}
                  >
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: th.color, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" }} />
                    <Text style={{ flex: 1, fontSize: 16, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular", color: active ? colors.primary : colors.foreground }}>
                      {th.label}
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
  languageSignedOutBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginTop: 4 },
  languageSignedOutText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  hero: { alignItems: "center", paddingBottom: 32, paddingHorizontal: 20, gap: 8 },
  avatar: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  avatarText: { fontSize: 30, fontFamily: "Inter_700Bold" },
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
  menuBadge: { borderRadius: 10, minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  menuBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold", lineHeight: 14 },
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
