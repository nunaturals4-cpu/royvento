import {
  getGetWishlistQueryKey,
  useGetWishlist,
  useRemoveFromWishlist,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { EventCard } from "@/components/EventCard";
import { MobileFooter } from "@/components/MobileFooter";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function WishlistScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useGetWishlist({
    query: { queryKey: getGetWishlistQueryKey(), enabled: !!user },
  });

  const removeMutation = useRemoveFromWishlist({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetWishlistQueryKey() });
      },
      onError: () => Alert.alert("Error", "Failed to remove from wishlist. Please try again."),
    },
  });

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.header, { paddingTop: topPadding + 12, borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Wishlist</Text>
        </View>
        <EmptyState
          icon="heart-outline"
          title="Sign in to see your wishlist"
          subtitle="Save your favourite events and pubs"
          action={{ label: "Sign In", onPress: () => router.push("/(auth)/login") }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={[
          styles.header,
          { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Wishlist</Text>
        {(data?.length ?? 0) > 0 ? (
          <Text style={[styles.count, { color: colors.mutedForeground }]}>
            {data!.length} saved
          </Text>
        ) : null}
      </View>

      {isLoading ? null : !data || data.length === 0 ? (
        <>
          <EmptyState
            icon="heart-outline"
            title="Your wishlist is empty"
            subtitle="Save events you love and come back to them anytime"
            action={{ label: "Explore Events", onPress: () => router.push("/(tabs)/explore") }}
          />
          <MobileFooter />
        </>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => String(item.wishlistId)}
          contentContainerStyle={[styles.list, { paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }]}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isLoading}
          scrollEnabled={!!(data?.length)}
          ListFooterComponent={<MobileFooter />}
          renderItem={({ item }) => (
            <View style={{ position: "relative" }}>
              <EventCard
                id={item.id}
                vendorId={item.vendorId}
                title={item.title}
                imageUrl={item.imageUrl}
                location={item.location}
                price={item.price}
                category={item.category}
                type={item.type}
                rating={item.rating}
                reviewCount={item.reviewCount}
                compact
                style={{ width: "100%" }}
              />
              <TouchableOpacity
                style={[styles.removeBtn, { backgroundColor: colors.destructive }]}
                onPress={() => removeMutation.mutate({ eventId: item.id })}
              >
                <Text style={styles.removeBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  count: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  list: {
    padding: 20,
    gap: 10,
  },
  removeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  removeBtnText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
