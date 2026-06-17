import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

// ── Promo marquee (mobile) ───────────────────────────────────────────────────
// Auto-scrolling promo bar beneath the home header. Mirrors the web
// `PromoMarquee`. Two identical groups translate left in a seamless loop.

const PROMO_ITEMS: { icon: React.ComponentProps<typeof Ionicons>["name"]; text: string }[] = [
  { icon: "gift-outline", text: "New users get 200 FREE Royvento Coins" },
  { icon: "beer-outline", text: "Book through Royvento to unlock Free Entry" },
  { icon: "easel-outline", text: "Free Table Booking at Partner Venues" },
  { icon: "ticket-outline", text: "Exclusive Offers Only on Royvento" },
];

function Group({ onLayout }: { onLayout?: (w: number) => void }) {
  const colors = useColors();
  return (
    <View
      style={styles.group}
      onLayout={(e) => onLayout?.(e.nativeEvent.layout.width)}
    >
      {PROMO_ITEMS.map((item, i) => (
        <View key={`${item.text}-${i}`} style={styles.item}>
          <Ionicons name={item.icon} size={14} color={colors.primary} />
          <Text style={[styles.text, { color: colors.foreground }]}>{item.text}</Text>
          <View style={[styles.dot, { backgroundColor: colors.primary + "80" }]} />
        </View>
      ))}
    </View>
  );
}

export function PromoMarquee() {
  const colors = useColors();
  const translateX = useRef(new Animated.Value(0)).current;
  const [groupWidth, setGroupWidth] = useState(0);

  useEffect(() => {
    if (groupWidth <= 0) return;
    translateX.setValue(0);
    const anim = Animated.loop(
      Animated.timing(translateX, {
        toValue: -groupWidth,
        duration: groupWidth * 22, // ~speed; longer content scrolls proportionally
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [groupWidth, translateX]);

  return (
    <View style={[styles.bar, { borderBottomColor: colors.primary + "26", backgroundColor: colors.primary + "10" }]}>
      <Animated.View style={[styles.track, { transform: [{ translateX }] }]}>
        <Group onLayout={(w) => setGroupWidth(w)} />
        <Group />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { width: "100%", overflow: "hidden", borderBottomWidth: 1, paddingVertical: 8 },
  track: { flexDirection: "row" },
  group: { flexDirection: "row", alignItems: "center" },
  item: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 16 },
  text: { fontSize: 12, fontFamily: "Inter_500Medium" },
  dot: { width: 4, height: 4, borderRadius: 2, marginLeft: 8 },
});
