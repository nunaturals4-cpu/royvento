import { useCallback } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export function useLogout() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    try {
      await logout();
    } catch {
      Alert.alert("Error", "Sign out encountered an issue. You have been signed out.");
    } finally {
      queryClient.clear();
      router.replace("/(tabs)/profile" as never);
    }
  }, [logout, queryClient]);
}
