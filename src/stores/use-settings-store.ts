import { create } from "zustand";

import { settingsStore, type AppSettings } from "@/lib/settings-store";

// Single-responsibility: own app settings state. Validation + the storage
// key live in `lib/settings-store`; the write-through happens exactly once
// via the module-level subscription so consumers never touch localStorage.

interface SettingsState {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: settingsStore.load(),
  update: (patch) => set({ settings: { ...get().settings, ...patch } }),
}));

if (typeof window !== "undefined") {
  useSettingsStore.subscribe((state, prev) => {
    if (state.settings !== prev.settings) settingsStore.save(state.settings);
  });
}
