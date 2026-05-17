import { useCallback, useEffect, useState } from "react";

import { themeStore, type Accent, type Theme } from "@/lib/theme-store";

// Single-responsibility: mirror theme + accent state to the <html> element
// and persist user choice. Mode lives in `<html class="dark|light">`, accent
// lives in `<html data-accent="...">`. Every useTheme() consumer subscribes
// to a shared change event so they all flip together (sidebar toggle,
// settings dialog, xterm.js terminal, etc.).
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => themeStore.load());
  const [accent, setAccentState] = useState<Accent>(() => themeStore.loadAccent());

  // Mode -> <html class>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  // Accent -> <html data-accent>. CSS selectors `[data-accent="orange"]` etc.
  // override the primary/ring tokens defined in `index.css`.
  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
  }, [accent]);

  // Cross-component sync: when any other useTheme() saves, refresh ours.
  useEffect(() => {
    return themeStore.subscribe(() => {
      setThemeState(themeStore.load());
      setAccentState(themeStore.loadAccent());
    });
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

  const setAccent = useCallback((next: Accent) => {
    themeStore.saveAccent(next);
    setAccentState(next);
  }, []);

  return { theme, accent, setTheme, setAccent, toggle } as const;
}
