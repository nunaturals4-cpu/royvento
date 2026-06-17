import { getPalette } from "@/constants/colors";
import { useThemeId } from "@/context/ThemeContext";

export function useColors() {
  const { theme } = useThemeId();
  return getPalette(theme);
}
