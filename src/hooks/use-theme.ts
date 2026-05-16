import { useCallback, useEffect, useState } from "react";

import { themeStore, type Theme } from "@/lib/theme-store";

// Single-responsibility: mirror theme state to <html class="dark|light"> and
// persist user choice. Every useTheme() consumer subscribes to a shared
// change event so they all flip together (toggle in the sidebar instantly
// updates the xterm.js terminal, etc.).
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => themeStore.load());

  // Keep <html> class in sync with our local state.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  // Cross-component sync: when any other useTheme() saves, refresh ours.
  useEffect(() => {
    return themeStore.subscribe(() => setThemeState(themeStore.load()));
  }, []);

  const setTheme = useCallback((next: Theme) => {
    themeStore.save(next);
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    const next = themeStore.load() === "light" ? "dark" : "light";
    themeStore.save(next);
    setThemeState(next);
  }, []);

  return { theme, setTheme, toggle } as const;
}
