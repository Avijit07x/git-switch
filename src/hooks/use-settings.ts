import { useCallback, useEffect, useState } from "react";

import { settingsStore, type AppSettings } from "@/lib/settings-store";

// Single-responsibility: read/write app-wide settings and stay reactive to
// changes made from any other component in the same window. Settings —
// including the Gemini API key — live in localStorage. This is a local-only
// developer tool, and the key never leaves the machine except when calling
// Gemini's API directly.
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() =>
    settingsStore.load(),
  );

  useEffect(() => {
    return settingsStore.subscribe(() => setSettings(settingsStore.load()));
  }, []);

  const update = useCallback((patch: Partial<AppSettings>) => {
    const current = settingsStore.load();
    settingsStore.save({ ...current, ...patch });
  }, []);

  return { settings, update } as const;
}
