import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { Repository, RunTarget } from "@/lib/types";
import { migrateRepoState } from "./migrate-repo-state";

// Single-responsibility: own the list of repositories and the user's current
// selection. Persistence and legacy-key migration are delegated to zustand's
// persist middleware + `migrateRepoState` respectively — this file only
// describes state shape and mutations.

interface RepoState {
  repositories: Repository[];
  selectedRepoId: string | null;
  selectedGroupId: string | null;

  addRepository: (repo: Repository) => void;
  removeRepository: (id: string) => void;
  updateRepository: (
    id: string,
    patch: { runTargets?: RunTarget[]; port?: number | undefined },
  ) => void;
  hasPath: (path: string) => boolean;

  selectRepo: (id: string | null) => void;
  selectGroup: (id: string | null) => void;
}

export const useRepoStore = create<RepoState>()(
  persist(
    (set, get) => ({
      repositories: [],
      selectedRepoId: null,
      selectedGroupId: null,

      addRepository: (repo) =>
        set((state) =>
          state.repositories.some((r) => r.path === repo.path)
            ? state
            : { repositories: [...state.repositories, repo] },
        ),

      removeRepository: (id) =>
        set((state) => ({
          repositories: state.repositories.filter((r) => r.id !== id),
          selectedRepoId:
            state.selectedRepoId === id ? null : state.selectedRepoId,
        })),

      updateRepository: (id, patch) =>
        set((state) => ({
          repositories: state.repositories.map((r) =>
            r.id === id ? { ...r, ...patch } : r,
          ),
        })),

      hasPath: (path) => get().repositories.some((r) => r.path === path),

      selectRepo: (id) => set({ selectedRepoId: id, selectedGroupId: null }),
      selectGroup: (id) => set({ selectedGroupId: id, selectedRepoId: null }),
    }),
    {
      name: "git-switch.repositories.v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        repositories: state.repositories,
        selectedRepoId: state.selectedRepoId,
        selectedGroupId: state.selectedGroupId,
      }),
      version: 1,
      migrate: (persisted) =>
        migrateRepoState(persisted) as unknown as RepoState,
    },
  ),
);
