import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";

/**
 * Returns the minimum bottom padding needed to ensure scrollable content
 * is not obscured by the persistent bottom navigation bar.
 *
 * Usage:
 *   const bottomPadding = useBottomNavPadding();
 *   <ScrollView contentContainerStyle={{ paddingBottom: bottomPadding }}>
 */
export function useBottomNavPadding(extra = 16): number {
  const insets = useSafeAreaInsets();
  return BOTTOM_NAV_HEIGHT + insets.bottom + extra;
}
