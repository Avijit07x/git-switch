import type { Repository } from "@/lib/types";

// Single-responsibility: one-time read of the old hand-rolled
// `git-switch.repositories` localStorage key, normalized into the shape
// zustand's persist middleware expects. Lives apart from the store so the
// store file only describes state shape and mutations.

export interface PersistedRepoState {
  repositories: Repository[];
  selectedRepoId: string | null;
  selectedGroupId: string | null;
}

const EMPTY: PersistedRepoState = {
  repositories: [],
  selectedRepoId: null,
  selectedGroupId: null,
};

export function migrateRepoState(persistedState: unknown): PersistedRepoState {
  if (
    persistedState &&
    typeof persistedState === "object" &&
    "repositories" in persistedState
  ) {
    return { ...EMPTY, ...(persistedState as Partial<PersistedRepoState>) };
  }

  try {
    const raw = window.localStorage.getItem("git-switch.repositories");
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return { ...EMPTY, repositories: parsed as Repository[] };
      }
    }
  } catch {
    /* ignore — start fresh */
  }
  return EMPTY;
}
