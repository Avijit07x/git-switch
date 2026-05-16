// Single-responsibility: theme persistence + system-preference fallback +
// in-process change broadcast so every useTheme() consumer stays in sync.

export type Theme = "light" | "dark";

const STORAGE_KEY = "git-switch.theme";
const CHANGE_EVENT = "git-switch.theme:change";

function detectSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export const themeStore = {
  load(): Theme {
    if (typeof window === "undefined") return "light";
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") return raw;
    return detectSystemTheme();
  },

  save(theme: Theme): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, theme);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  },

  subscribe(handler: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  },

  STORAGE_KEY,
} as const;
