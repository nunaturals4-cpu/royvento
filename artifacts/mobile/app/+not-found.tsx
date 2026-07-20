import { Ionicons } from "@expo/vector-icons";
import { Link, router, Stack } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export default function NotFoundScreen() {
  const colors = useColors();

  return (
    <>
      <Stack.Screen options={{ title: "Page not found", headerShown: false }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.headerRow}>
            <Ionicons name="alert-circle" size={26} color="#ef4444" />
            <Text style={[styles.title, { color: colors.foreground }]}>404 Page Not Found</Text>
          </View>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            The page you're looking for doesn't exist or may have moved.
          </Text>

          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => router.replace("/(tabs)")}>
            <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Go back home</Text>
          </TouchableOpacity>

          <Text style={[styles.exploreLabel, { color: colors.mutedForeground }]}>Or explore</Text>
          <View style={styles.shortcutRow}>
            <Link href={"/(tabs)/pubs" as never} asChild>
              <TouchableOpacity style={[styles.shortcutBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                <Text style={[styles.shortcutText, { color: colors.foreground }]}>Pubs</Text>
              </TouchableOpacity>
            </Link>
            <Link href={"/events" as never} asChild>
              <TouchableOpacity style={[styles.shortcutBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                <Text style={[styles.shortcutText, { color: colors.foreground }]}>Events</Text>
              </TouchableOpacity>
            </Link>
            <Link href={"/blogs" as never} asChild>
              <TouchableOpacity style={[styles.shortcutBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                <Text style={[styles.shortcutText, { color: colors.foreground }]}>Guides</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 420, borderRadius: 20, borderWidth: 1, padding: 24, gap: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  body: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, marginTop: 4 },
  primaryBtn: { borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 18 },
  primaryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  exploreLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 18, marginBottom: 8 },
  shortcutRow: { flexDirection: "row", gap: 8 },
  shortcutBtn: { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 10, alignItems: "center" },
  shortcutText: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
});
