// Single-responsibility: theme persistence (mode + accent) plus system-
// preference fallback and an in-process change broadcast so every consumer
// stays in sync. Mode and accent are stored under separate keys so
// upgrading existing installs doesn't drop the user's light/dark choice.

export type Theme = "light" | "dark";

export type Accent =
  | "default"
  | "orange"
  | "blue"
  | "green"
  | "rose"
  | "violet";

export const ACCENTS: ReadonlyArray<Accent> = [
  "default",
  "orange",
  "blue",
  "green",
  "rose",
  "violet",
];

const STORAGE_KEY = "git-switch.theme";
const ACCENT_KEY = "git-switch.accent";
const CHANGE_EVENT = "git-switch.theme:change";

function detectSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function isAccent(value: unknown): value is Accent {
  return typeof value === "string" && (ACCENTS as readonly string[]).includes(value);
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

  loadAccent(): Accent {
    if (typeof window === "undefined") return "default";
    const raw = window.localStorage.getItem(ACCENT_KEY);
    return isAccent(raw) ? raw : "default";
  },

  saveAccent(accent: Accent): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ACCENT_KEY, accent);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  },

  subscribe(handler: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  },

  STORAGE_KEY,
  ACCENT_KEY,
} as const;
