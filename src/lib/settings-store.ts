// Single-responsibility: persist app-wide settings (Gemini API key + model,
// etc.) to localStorage and broadcast in-process changes so all useSettings()
// consumers stay in sync without needing a context provider.

// Fallback catalog used before the user verifies a key. Once we've fetched
// the live list from the API, we use that instead.
export const GEMINI_MODELS = [
  // 1.5 family
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
  // 2.0 family
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  // 2.5 family
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  // 3.0 family
  "gemini-3.0-flash",
  "gemini-3.0-flash-lite",
  "gemini-3.0-pro",
] as const;

// Kept as a plain string so newly-released model ids returned by the API
// (e.g. versioned snapshots like "gemini-1.5-flash-001") round-trip safely.
export type GeminiModel = string;

export interface AppSettings {
  geminiApiKey: string;
  geminiModel: GeminiModel;
  profiles: Profile[];
  activeProfileId?: string;
}

import type { Profile } from "./types";

function isProfile(value: unknown): value is Profile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    (v.sshKeyPath === undefined || typeof v.sshKeyPath === "string")
  );
}

const STORAGE_KEY = "git-switch.settings";
const CHANGE_EVENT = "git-switch.settings:change";

const defaults: AppSettings = {
  geminiApiKey: "",
  geminiModel: "gemini-1.5-flash",
  profiles: [],
  activeProfileId: undefined,
};

function isGeminiModel(value: unknown): value is GeminiModel {
  return typeof value === "string" && /^gemini-/.test(value);
}

function isSettings(value: unknown): value is AppSettings {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.geminiApiKey === "string" &&
    (v.geminiModel === undefined || isGeminiModel(v.geminiModel)) &&
    (v.profiles === undefined ||
      (Array.isArray(v.profiles) && v.profiles.every(isProfile))) &&
    (v.activeProfileId === undefined || typeof v.activeProfileId === "string")
  );
}

export function newProfileId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const settingsStore = {
  load(): AppSettings {
    if (typeof window === "undefined") return defaults;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return isSettings(parsed) ? { ...defaults, ...parsed } : defaults;
    } catch {
      return defaults;
    }
  },

  save(next: AppSettings): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  },

  subscribe(handler: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  },
} as const;
