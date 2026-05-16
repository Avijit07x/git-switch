import { create } from "zustand";

import type { CommandLogEntry, GitCommandResult } from "@/lib/types";

// Single-responsibility: keep a bounded rolling log of git command results
// the user can scroll through in the output panel. Lives only in memory —
// no need to persist across launches.

const MAX_ENTRIES = 200;

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface CommandLogState {
  entries: CommandLogEntry[];
  startEntry: (repositoryId: string, label: string) => string;
  completeEntry: (id: string, result: GitCommandResult) => void;
  clearEntries: (repositoryId?: string) => void;
}

export const useCommandLogStore = create<CommandLogState>((set) => ({
  entries: [],

  startEntry: (repositoryId, label) => {
    const id = makeId();
    set((state) => {
      const next: CommandLogEntry = {
        id,
        repositoryId,
        timestamp: Date.now(),
        label,
        status: "running",
        result: null,
      };
      const out = [next, ...state.entries];
      if (out.length > MAX_ENTRIES) out.length = MAX_ENTRIES;
      return { entries: out };
    });
    return id;
  },

  completeEntry: (id, result) => {
    if (!id) return;
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id
          ? { ...e, status: result.success ? "success" : "error", result }
          : e,
      ),
    }));
  },

  clearEntries: (repositoryId) =>
    set((state) => ({
      entries: repositoryId
        ? state.entries.filter((e) => e.repositoryId !== repositoryId)
        : [],
    })),
}));

