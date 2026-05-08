import { Ionicons } from "@expo/vector-icons";
import {
  getGetReviewEligibilityQueryKey,
  getListEventReviewsQueryKey,
  getListVendorReviewsQueryKey,
  useCreateReview,
  getGetReviewEligibilityQueryOptions,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { AuthUser } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { uploadImageToStorage } from "@/lib/uploadImage";

interface ReviewFormProps {
  user: AuthUser | null;
  eventId?: number;
  vendorId: number;
  onPosted?: () => void;
}

export function ReviewForm({ user, eventId, vendorId, onPosted }: ReviewFormProps) {
  const colors = useColors();
  const qc = useQueryClient();
  const createReview = useCreateReview();
  const eligibilityQueryOptions = getGetReviewEligibilityQueryOptions(vendorId);
  const { data: eligibility } = useQuery({
    ...eligibilityQueryOptions,
    enabled: !!user && vendorId > 0,
  });
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  if (!user) return null;
  if (!eligibility) return null;

  const pickImages = async () => {
    if (uploading || images.length >= 5) return;
    const remaining = 5 - images.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.85,
    });
    if (result.canceled || result.assets.length === 0) return;

    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const asset of result.assets.slice(0, remaining)) {
        try {
          const url = await uploadImageToStorage(asset.uri, asset.mimeType ?? undefined);
          uploaded.push(url);
        } catch (e: unknown) {
          Alert.alert("Upload failed", e instanceof Error ? e.message : "Please try again.");
        }
      }
      if (uploaded.length > 0) setImages((prev) => [...prev, ...uploaded].slice(0, 5));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (createReview.isPending) return;
    createReview.mutate(
      { data: { eventId, vendorId, rating, comment, imageUrls: images } },
      {
        onSuccess: () => {
          setComment("");
          setRating(5);
          setImages([]);
          if (eventId) {
            qc.invalidateQueries({ queryKey: getListEventReviewsQueryKey(eventId) });
          }
          qc.invalidateQueries({ queryKey: getListVendorReviewsQueryKey(vendorId) });
          qc.invalidateQueries({ queryKey: getGetReviewEligibilityQueryKey(vendorId) });
          onPosted?.();
          Alert.alert("Review submitted", "Thanks for your feedback!");
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Please try again.";
          const isDup = /already_reviewed|already reviewed/i.test(msg);
          const isNotEligible = /not_eligible|verified guests/i.test(msg);
          Alert.alert(
            isDup ? "Already reviewed" : isNotEligible ? "Not eligible" : "Could not submit",
            msg,
          );
          qc.invalidateQueries({ queryKey: getGetReviewEligibilityQueryKey(vendorId) });
        },
      },
    );
  };

  const reasonMessage =
    eligibility.reason === "no_checkin"
      ? "Only verified guests can review — book and check in first."
      : eligibility.reason === "already_reviewed"
        ? "You've already reviewed this pub. Edit or delete your review above."
        : "You can't review this pub right now.";

  return (
    <View
      style={{
        gap: 14,
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="star-half-outline" size={16} color={colors.primary} />
        <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>
          Write a Review
        </Text>
      </View>

      {!eligibility.eligible ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            padding: 12,
            borderRadius: 10,
            backgroundColor: colors.muted,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Ionicons name="ticket-outline" size={16} color={colors.mutedForeground} />
          <Text
            style={{
              fontSize: 13,
              fontFamily: "Inter_400Regular",
              color: colors.mutedForeground,
              flex: 1,
              lineHeight: 18,
            }}
          >
            {reasonMessage}
          </Text>
        </View>
      ) : (
        <>
          <View style={{ gap: 6 }}>
            <Text
              style={{
                fontSize: 12,
                fontFamily: "Inter_500Medium",
                color: colors.mutedForeground,
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              Your Rating
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[1, 2, 3, 4, 5].map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setRating(s)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Ionicons
                    name={s <= rating ? "star" : "star-outline"}
                    size={30}
                    color={s <= rating ? colors.primary : colors.mutedForeground}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text
              style={{
                fontSize: 12,
                fontFamily: "Inter_500Medium",
                color: colors.mutedForeground,
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              Comment (optional)
            </Text>
            <TextInput
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                padding: 12,
                color: colors.foreground,
                fontFamily: "Inter_400Regular",
                fontSize: 14,
                minHeight: 80,
                textAlignVertical: "top",
              }}
              value={comment}
              onChangeText={setComment}
              placeholder="Share your experience..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={{ gap: 8 }}>
            <Text
              style={{
                fontSize: 12,
                fontFamily: "Inter_500Medium",
                color: colors.mutedForeground,
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              Photos (optional, up to 5)
            </Text>
            {images.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {images.map((url, i) => (
                  <View key={i} style={{ width: 64, height: 64, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: colors.border, position: "relative" }}>
                    <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} />
                    <TouchableOpacity
                      onPress={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 2,
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: "rgba(0,0,0,0.7)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name="close" size={12} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}
            <TouchableOpacity
              onPress={pickImages}
              disabled={uploading || images.length >= 5}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.muted,
                alignSelf: "flex-start",
                opacity: uploading || images.length >= 5 ? 0.5 : 1,
              }}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="image-outline" size={16} color={colors.primary} />
              )}
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground }}>
                {uploading ? "Uploading…" : images.length === 0 ? "Add photos" : "Add more"}
              </Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
              {images.length}/5 · JPEG/PNG/WebP/GIF · max 8 MB
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={createReview.isPending || uploading}
            activeOpacity={0.8}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 10,
              paddingVertical: 13,
              paddingHorizontal: 16,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
              opacity: createReview.isPending || uploading ? 0.6 : 1,
            }}
          >
            {createReview.isPending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <>
                <Ionicons name="send" size={15} color={colors.primaryForeground} />
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: "Inter_600SemiBold",
                    color: colors.primaryForeground,
                  }}
                >
                  Submit Review
                </Text>
              </>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
