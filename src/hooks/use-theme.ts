import { useThemeStore } from "@/stores/use-theme-store";

// Single-responsibility: thin façade over the theme store, preserving the
// historical API. DOM mirroring + persistence live in the store module so
// they run once, not per consumer.
export function useTheme() {
  const theme = useThemeStore((s) => s.theme);
  const accent = useThemeStore((s) => s.accent);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setAccent = useThemeStore((s) => s.setAccent);
  const toggle = useThemeStore((s) => s.toggleTheme);

  return { theme, accent, setTheme, setAccent, toggle } as const;
}
