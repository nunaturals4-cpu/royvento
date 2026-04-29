import { useCallback } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export function useLogout() {
  const { logout } = useAuth();

  return useCallback(async () => {
    try {
      await logout();
    } catch {
      Alert.alert("Error", "Sign out encountered an issue. You have been signed out.");
    } finally {
      router.replace("/(auth)/login");
    }
  }, [logout]);
}
