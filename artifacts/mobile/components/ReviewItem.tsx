import { resolveImageUrl } from "@/lib/resolveImageUrl";
import { Ionicons } from "@expo/vector-icons";
import { useUpdateReview, useDeleteReview } from "@workspace/api-client-react";
import type { Review } from "@workspace/api-client-react";
import { Image } from "expo-image";
import React, { useState } from "react";
import {
  Alert,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

interface ReviewItemProps {
  review: Review;
  isOwner: boolean;
  onChanged?: () => void;
  onImagePress?: (url: string) => void;
}

export function ReviewItem({ review, isOwner, onChanged, onImagePress }: ReviewItemProps) {
  const colors = useColors();
  const updateReview = useUpdateReview();
  const deleteReview = useDeleteReview();
  const [isEditing, setIsEditing] = useState(false);
  const [editRating, setEditRating] = useState(review.rating);
  const [editComment, setEditComment] = useState(review.comment ?? "");

  const handleSave = () => {
    updateReview.mutate(
      { reviewId: review.id, data: { rating: editRating, comment: editComment } },
      {
        onSuccess: () => {
          setIsEditing(false);
          onChanged?.();
        },
        onError: (e: unknown) => Alert.alert(
          "Could not update",
          e instanceof Error ? e.message : "Please try again.",
        ),
      },
    );
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete review?",
      "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteReview.mutate(
              { reviewId: review.id },
              {
                onSuccess: () => onChanged?.(),
                onError: (e: unknown) => Alert.alert(
                  "Could not delete",
                  e instanceof Error ? e.message : "Please try again.",
                ),
              },
            );
          },
        },
      ],
    );
  };

  return (
    <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted }}>
          <Ionicons name="person" size={14} color={colors.mutedForeground} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
            {review.userName || "Customer"}{isOwner ? " (you)" : ""}
          </Text>
          <View style={{ flexDirection: "row", gap: 2 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Ionicons
                key={i}
                name={i < (isEditing ? editRating : review.rating) ? "star" : "star-outline"}
                size={11}
                color={colors.primary}
              />
            ))}
          </View>
        </View>
      </View>

      {isEditing ? (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setEditRating(n)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Ionicons name={n <= editRating ? "star" : "star-outline"} size={24} color={colors.primary} />
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            value={editComment}
            onChangeText={setEditComment}
            placeholder="Update your review…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={3}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              padding: 10,
              color: colors.foreground,
              backgroundColor: colors.muted,
              minHeight: 70,
              textAlignVertical: "top",
              fontSize: 13,
            }}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={handleSave}
              disabled={updateReview.isPending}
              style={{
                paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8,
                backgroundColor: colors.primary, opacity: updateReview.isPending ? 0.6 : 1,
              }}
            >
              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setIsEditing(false)}
              style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 12 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          {review.comment ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 18 }}>{review.comment}</Text>
          ) : null}
          {review.imageUrls && review.imageUrls.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {review.imageUrls.map((url, i) => (
                <Pressable
                  key={i}
                  onPress={() => onImagePress?.(url)}
                  style={{ width: 64, height: 64, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}
                >
                  <Image source={{ uri: resolveImageUrl(url) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                </Pressable>
              ))}
            </View>
          ) : null}
          {isOwner ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => { setEditRating(review.rating); setEditComment(review.comment ?? ""); setIsEditing(true); }}
                style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 12 }}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDelete}
                disabled={deleteReview.isPending}
                style={{
                  paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6,
                  borderWidth: 1, borderColor: colors.border,
                  opacity: deleteReview.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 12 }}>Delete</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
