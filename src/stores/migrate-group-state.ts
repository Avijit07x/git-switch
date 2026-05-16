import type { ProjectGroup } from "@/lib/types";

// Single-responsibility: read the old hand-rolled `git-switch.groups` key
// and normalize it to the persisted-state shape. Kept apart from the store
// definition so each file owns one concern.

export interface PersistedGroupState {
  groups: ProjectGroup[];
}

const EMPTY: PersistedGroupState = { groups: [] };

export function migrateGroupState(persistedState: unknown): PersistedGroupState {
  if (
    persistedState &&
    typeof persistedState === "object" &&
    "groups" in persistedState
  ) {
    return { ...EMPTY, ...(persistedState as Partial<PersistedGroupState>) };
  }
  try {
    const raw = window.localStorage.getItem("git-switch.groups");
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return { groups: parsed as ProjectGroup[] };
      }
    }
  } catch {
    /* ignore — start fresh */
  }
  return EMPTY;
}
