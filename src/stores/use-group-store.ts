import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { ProjectGroup } from "@/lib/types";
import { migrateGroupState } from "./migrate-group-state";

// Single-responsibility: own the list of project groups. Persistence + the
// id factory + legacy-key migration are all isolated so this file only
// describes state shape and mutations.

function newId(): string {
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface GroupState {
  groups: ProjectGroup[];

  createGroup: (name: string, repositoryIds: string[]) => ProjectGroup;
  updateGroup: (
    id: string,
    patch: Partial<Omit<ProjectGroup, "id" | "createdAt">>,
  ) => void;
  removeGroup: (id: string) => void;
}

export const useGroupStore = create<GroupState>()(
  persist(
    (set) => ({
      groups: [],

      createGroup: (name, repositoryIds) => {
        const group: ProjectGroup = {
          id: newId(),
          name: name.trim() || "Untitled",
          repositoryIds: [...repositoryIds],
          createdAt: Date.now(),
        };
        set((state) => ({ groups: [...state.groups, group] }));
        return group;
      },

      updateGroup: (id, patch) =>
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === id
              ? { ...g, ...patch, name: patch.name?.trim() || g.name }
              : g,
          ),
        })),

      removeGroup: (id) =>
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== id),
        })),
    }),
    {
      name: "git-switch.groups.v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ groups: state.groups }),
      version: 1,
      migrate: (persisted) =>
        migrateGroupState(persisted) as unknown as GroupState,
    },
  ),
);
