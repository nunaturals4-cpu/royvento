import { Ionicons } from "@expo/vector-icons";
import {
  getListEventReviewsQueryKey,
  getListVendorReviewsQueryKey,
  useCreateReview,
} from "@workspace/api-client-react";
import type { Review } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { AuthUser } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface ReviewFormProps {
  user: AuthUser | null;
  reviews: Review[] | undefined;
  eventId?: number;
  vendorId: number;
  isEligible: boolean;
}

export function ReviewForm({ user, reviews, eventId, vendorId, isEligible }: ReviewFormProps) {
  const colors = useColors();
  const qc = useQueryClient();
  const createReview = useCreateReview();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (!user) return null;

  const hasDuplicate = submitted || (reviews ?? []).some((r) => r.userId === user.id);

  const handleSubmit = () => {
    if (createReview.isPending || submitted) return;
    createReview.mutate(
      { data: { eventId, vendorId, rating, comment } },
      {
        onSuccess: () => {
          setSubmitted(true);
          setComment("");
          setRating(5);
          if (eventId) {
            qc.invalidateQueries({ queryKey: getListEventReviewsQueryKey(eventId) });
          }
          qc.invalidateQueries({ queryKey: getListVendorReviewsQueryKey(vendorId) });
          Alert.alert("Review submitted", "Thanks for your feedback!");
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Please try again.";
          Alert.alert("Could not submit", msg);
        },
      },
    );
  };

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

      {!isEligible ? (
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
            You need to book this to leave a review.
          </Text>
        </View>
      ) : hasDuplicate ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            padding: 12,
            borderRadius: 10,
            backgroundColor: colors.primary + "15",
            borderWidth: 1,
            borderColor: colors.primary + "30",
          }}
        >
          <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
          <Text
            style={{
              fontSize: 13,
              fontFamily: "Inter_500Medium",
              color: colors.primary,
              flex: 1,
            }}
          >
            You've already submitted a review. Thank you!
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

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={createReview.isPending}
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
              opacity: createReview.isPending ? 0.6 : 1,
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
