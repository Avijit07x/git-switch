import { create } from "zustand";

import { themeStore, type Accent, type Theme } from "@/lib/theme-store";

// Single-responsibility: own theme + accent state. The DOM mirror
// (<html class="dark"> / data-accent) and localStorage write-through happen
// exactly once via the module-level subscription below — consumers just
// read state and call actions, no per-component side effects.

interface ThemeState {
  theme: Theme;
  accent: Accent;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setAccent: (accent: Accent) => void;
}

export const useThemeStore = create<ThemeState>()((set, get) => ({
  theme: themeStore.load(),
  accent: themeStore.loadAccent(),
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set({ theme: get().theme === "light" ? "dark" : "light" }),
  setAccent: (accent) => set({ accent }),
}));

function applyToDom(theme: Theme, accent: Accent): void {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.setAttribute("data-accent", accent);
}

if (typeof window !== "undefined") {
  const { theme, accent } = useThemeStore.getState();
  applyToDom(theme, accent);

  useThemeStore.subscribe((state, prev) => {
    if (state.theme !== prev.theme) themeStore.save(state.theme);
    if (state.accent !== prev.accent) themeStore.saveAccent(state.accent);
    applyToDom(state.theme, state.accent);
  });
}
