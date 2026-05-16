import { create } from "zustand";

// Single-responsibility: hold the boolean that gates heavy work
// (sidebar queries, dashboard queries, file watcher, background fetch).
// Flipping it is the only mutation. The side-effect hook that decides
// *when* to flip it lives in `use-mark-app-ready.ts`.

interface AppReadyState {
  ready: boolean;
  markReady: () => void;
}

export const useAppReadyStore = create<AppReadyState>((set) => ({
  ready: false,
  markReady: () => set({ ready: true }),
}));

export const useIsAppReady = (): boolean => useAppReadyStore((s) => s.ready);
