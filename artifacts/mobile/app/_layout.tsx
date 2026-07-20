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
import { Linking, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CityProvider } from "@/context/CityContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { PersistentBottomNav } from "@/components/PersistentBottomNav";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { resolveNotificationRoute } from "@/lib/resolveNotificationRoute";

SplashScreen.preventAutoHideAsync();

const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (apiUrl) {
  setBaseUrl(apiUrl);
} else if (domain) {
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
 * Map a notification's payload to a mobile route so tapping it opens the exact
 * page (fixing "notifications show but don't navigate"). Server notifications
 * carry a web-style `url` (e.g. "/organizer-events/nye-12"); the mobile app's
 * Expo Router routes mirror those paths, so most pass straight through. The one
 * exception is a venue: web uses "/pubs/{city}/{slug}-{id}" while mobile uses
 * "/partner/{id}", so we extract the trailing id. Returns null when there is
 * nothing safe to navigate to.
 */
/**
 * One-tap "Call" action on a booking notification (see the "booking-call"
 * category registered in registerForPushNotifications). Returns true when it
 * handled the tap, so the caller skips its normal deep-link navigation.
 */
function handleCallAction(actionIdentifier: string, data: Record<string, unknown> | undefined): boolean {
  if (actionIdentifier !== "call") return false;
  const phone = typeof data?.phone === "string" ? data.phone.trim() : "";
  if (!phone) return false;
  Linking.openURL(`tel:${phone}`).catch(() => {});
  return true;
}

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

    // Partner Booking Notification System — registers one-tap "Call" and
    // "View Booking" actions on any notification tagged with this category
    // (booking alerts carrying a customer phone number). "View Booking" needs
    // no special handling below — it falls through to the same
    // resolveNotificationRoute() deep-link logic as a plain tap. Safe to
    // re-register on every launch.
    await Notifications.setNotificationCategoryAsync("booking-call", [
      { identifier: "view", buttonTitle: "View Booking", options: { opensAppToForeground: true } },
      { identifier: "call", buttonTitle: "Call", options: { opensAppToForeground: true } },
    ]);

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
        if (handleCallAction(response.actionIdentifier, data)) return;
        const target = resolveNotificationRoute(data);
        if (target) router.push(target as never);
      },
    );

    // If the app was cold-started by tapping a notification, honour its deep
    // link too (the listener above only fires for taps while already running).
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        const data = response.notification.request.content.data as Record<string, unknown>;
        if (handleCallAction(response.actionIdentifier, data)) return;
        const target = resolveNotificationRoute(data);
        if (target) router.push(target as never);
      })
      .catch(() => {});

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
        <AuthProvider onAfterLogout={() => { queryClient.clear(); }}>
          <ThemeProvider>
          <LanguageProvider>
          <CityProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <ErrorBoundary>
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
                  <Stack.Screen name="tonight-plans" options={{ headerShown: false }} />
                  <Stack.Screen name="events" options={{ headerShown: false }} />
                  <Stack.Screen name="games-and-sports" options={{ headerShown: false }} />
                  <Stack.Screen name="game-organizers/[slug]" options={{ headerShown: false }} />
                  <Stack.Screen name="organizers/[slug]" options={{ headerShown: false }} />
                  <Stack.Screen name="organizer-events/[slug]" options={{ headerShown: false }} />
                  <Stack.Screen name="vendor/dashboard" options={{ headerShown: false }} />
                  <Stack.Screen name="organizer/dashboard" options={{ headerShown: false }} />
                  <Stack.Screen name="game-organizer/dashboard" options={{ headerShown: false }} />
                  <Stack.Screen name="city/[city]/index" options={{ headerShown: false }} />
                  <Stack.Screen name="city/[city]/[locality]" options={{ headerShown: false }} />
                  <Stack.Screen name="+not-found" />
                </Stack>
              </ErrorBoundary>
            </KeyboardProvider>
          </GestureHandlerRootView>
          </CityProvider>
          </LanguageProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
