import { Check, Palette } from "lucide-react";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const THEMES: { id: Theme; label: string; color: string }[] = [
  { id: "noir", label: "Midnight Noir", color: "#dc2626" },
  { id: "gold", label: "Royal Gold",    color: "#D4A017" },
  { id: "dusk", label: "Velvet Dusk",   color: "#dc5078" },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0]!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 h-9 px-2.5 rounded-md border border-border bg-card/60 hover:border-primary/40 hover:bg-card/80 transition-colors text-sm"
          aria-label="Change theme"
        >
          <span
            className="h-3.5 w-3.5 rounded-full shrink-0"
            style={{ background: current.color }}
          />
          <Palette className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={8} className="w-52 max-w-[calc(100vw-1rem)] glass-card-strong">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEMES.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => setTheme(t.id)}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <span
              className="h-3.5 w-3.5 rounded-full shrink-0"
              style={{ background: t.color }}
            />
            <span className="flex-1 truncate">{t.label}</span>
            {theme === t.id && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
