import { useSettingsStore } from "@/stores/use-settings-store";

// Single-responsibility: thin façade over the settings store, preserving the
// historical API. Settings — including the Gemini API key — live in
// localStorage. This is a local-only developer tool, and the key never
// leaves the machine except when calling Gemini's API directly.
export function useSettings() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  return { settings, update } as const;
}
