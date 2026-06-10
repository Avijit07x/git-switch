import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// Single-responsibility: own the app-shell layout preferences — which
// sidebar view is active, whether the sidebar and bottom panel are open,
// which panel tab is selected, and the panel height. Global (not per-repo)
// so the shell feels stable across repo switches, and persisted so it
// survives restarts, matching VS Code's behavior.

export type SidebarView = "repos" | "groups";
export type PanelTab = "output" | "run";
export type DiffView = "unified" | "split";

export const PANEL_HEIGHT_DEFAULT = 320;
export const PANEL_HEIGHT_MIN = 160;

// Leave room above the panel for the header, toolbar, a few list rows, and
// the commit composer — the panel must never make committing impossible.
export function clampPanelHeight(height: number): number {
  const max = Math.max(PANEL_HEIGHT_MIN, window.innerHeight - 380);
  return Math.min(Math.max(height, PANEL_HEIGHT_MIN), max);
}

// The pre-store implementation persisted only the height, under this key.
const LEGACY_PANEL_HEIGHT_KEY = "git-switch:panel-height";

function readLegacyPanelHeight(): number {
  if (typeof window === "undefined") return PANEL_HEIGHT_DEFAULT;
  const stored = Number(window.localStorage.getItem(LEGACY_PANEL_HEIGHT_KEY));
  return Number.isFinite(stored) && stored >= PANEL_HEIGHT_MIN
    ? stored
    : PANEL_HEIGHT_DEFAULT;
}

interface UiState {
  sidebarView: SidebarView;
  sidebarOpen: boolean;
  panelOpen: boolean;
  panelTab: PanelTab;
  panelHeight: number;
  diffView: DiffView;

  /** Activity-bar click: switch views, or collapse when re-clicking the
   *  active view (VS Code behavior). */
  selectSidebarView: (view: SidebarView) => void;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  /** Reveal a panel tab, expanding the panel if collapsed. */
  openPanelTab: (tab: PanelTab) => void;
  setPanelTab: (tab: PanelTab) => void;
  setPanelHeight: (height: number) => void;
  resetPanelHeight: () => void;
  setDiffView: (view: DiffView) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarView: "repos",
      sidebarOpen: true,
      panelOpen: true,
      panelTab: "output",
      panelHeight: readLegacyPanelHeight(),
      diffView: "split",

      selectSidebarView: (view) => {
        const { sidebarView, sidebarOpen } = get();
        if (view === sidebarView) set({ sidebarOpen: !sidebarOpen });
        else set({ sidebarView: view, sidebarOpen: true });
      },

      setPanelOpen: (open) => set({ panelOpen: open }),
      togglePanel: () => set({ panelOpen: !get().panelOpen }),
      openPanelTab: (tab) => set({ panelTab: tab, panelOpen: true }),
      setPanelTab: (tab) => set({ panelTab: tab }),
      setPanelHeight: (height) =>
        set({ panelHeight: clampPanelHeight(height) }),
      resetPanelHeight: () => set({ panelHeight: PANEL_HEIGHT_DEFAULT }),
      setDiffView: (view) => set({ diffView: view }),
    }),
    {
      name: "git-switch.ui.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarView: state.sidebarView,
        sidebarOpen: state.sidebarOpen,
        panelOpen: state.panelOpen,
        panelTab: state.panelTab,
        panelHeight: state.panelHeight,
        diffView: state.diffView,
      }),
      version: 2,
      // v1 → v2: "unified" was the old implicit default, not a user choice —
      // reset it so the new split default lands for existing installs.
      migrate: (persisted, version) => {
        const state = persisted as Partial<UiState>;
        if (version < 2) {
          return { ...state, diffView: "split" as DiffView };
        }
        return state;
      },
    },
  ),
);
