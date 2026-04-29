import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl, customFetch } from "@workspace/api-client-react";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { PersistentBottomNav } from "@/components/PersistentBottomNav";

SplashScreen.preventAutoHideAsync();

const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (domain) {
  setBaseUrl(`https://${domain}`);
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowAlert: true,
  }),
});

/**
 * Request notification permission and obtain the Expo push token.
 * Safe to call before any user is logged in (first launch).
 * Returns null on web, when permission is denied, or on any error.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#d4a017",
      });
    }

    return tokenData.data;
  } catch {
    return null;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 2, retry: 1 },
  },
});

function AuthGate() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const inAuth = segments[0] === "(auth)";
    if (!user && !inAuth) {
      router.replace("/(auth)/login");
    } else if (user && inAuth) {
      router.replace("/(tabs)");
    }
  }, [user, isLoading, segments]);

  return null;
}

interface NotificationHandlerProps {
  /** Expo push token obtained at app startup (may be null if permission denied or still loading). */
  pushToken: string | null;
}

/**
 * Registers the push token with the server whenever BOTH the user AND
 * a valid push token are known. Handles three timing scenarios:
 *   A) Token ready before user  — effect fires again when user loads
 *   B) User ready before token  — effect fires again when token resolves
 *   C) Both ready simultaneously — single effect run registers immediately
 *
 * Also handles notification tap navigation.
 */
function NotificationHandler({ pushToken }: NotificationHandlerProps) {
  const { user } = useAuth();
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  // In-memory guard to prevent double-fire within a single session
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!user || !pushToken || Platform.OS === "web") return;
    if (pendingRef.current) return;

    const registeredKey = `@royvento/tokenRegistered/${user.id}/${pushToken}`;

    async function maybeRegister() {
      pendingRef.current = true;
      try {
        const already = await AsyncStorage.getItem(registeredKey);
        if (already === "1") return; // already confirmed for this user+token pair

        await customFetch("/api/auth/push-token", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pushToken }),
        });
        await AsyncStorage.setItem(registeredKey, "1");
      } catch (err) {
        console.error("[PushToken] Failed to register with server:", err);
        // pendingRef stays true to avoid hammering on the same mount,
        // but AsyncStorage key was not written, so next app launch retries.
      } finally {
        pendingRef.current = false;
      }
    }

    maybeRegister();
  }, [user, pushToken]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as Record<string, unknown>;
        if (data?.screen === "bookings") {
          router.push("/(tabs)/bookings" as never);
        }
      },
    );

    return () => {
      responseListener.current?.remove();
    };
  }, []);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Push token lives in state so NotificationHandler re-runs when it resolves,
  // even if the user was already logged in before the token was obtained.
  const [pushToken, setPushToken] = useState<string | null>(null);

  // Request notification permission on first launch — before any user is authenticated
  useEffect(() => {
    if (Platform.OS === "web") return;
    registerForPushNotifications().then((token) => {
      if (token) {
        setPushToken(token);
      }
    });
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <StatusBar style="light" backgroundColor="#0e0d12" />
              <AuthGate />
              <NotificationHandler pushToken={pushToken} />
              <PersistentBottomNav />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: "#0e0d12" },
                  animation:
                    Platform.OS === "android" ? "fade_from_bottom" : "default",
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="event/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="partner/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="vendor/dashboard" options={{ headerShown: false }} />
                <Stack.Screen name="+not-found" />
              </Stack>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
