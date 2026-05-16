import { create } from "zustand";

import type { CommandLogEntry, GitCommandResult } from "@/lib/types";

// Single-responsibility: keep a bounded rolling log of git command results
// the user can scroll through in the output panel. Lives only in memory —
// no need to persist across launches.
//
// Two-tier cap:
//   • per-repo: a heavy user can fire 50+ git commands in a single session
//     against one repo (push/pull cycles, staging, ignoring noisy files).
//     Capping per-repo means each repo gets its fair share.
//   • global: cheap safety net so total memory stays bounded even with
//     dozens of repos open.

const MAX_ENTRIES_PER_REPO = 100;
const MAX_ENTRIES_TOTAL = 500;

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Trim the prepended list so each repo holds at most `MAX_ENTRIES_PER_REPO`
// entries and the whole list never exceeds `MAX_ENTRIES_TOTAL`. Entries are
// ordered newest-first, so we keep the newest N per repo.
function trim(entries: CommandLogEntry[]): CommandLogEntry[] {
  const seen = new Map<string, number>();
  const kept: CommandLogEntry[] = [];
  for (const entry of entries) {
    const count = seen.get(entry.repositoryId) ?? 0;
    if (count >= MAX_ENTRIES_PER_REPO) continue;
    seen.set(entry.repositoryId, count + 1);
    kept.push(entry);
    if (kept.length >= MAX_ENTRIES_TOTAL) break;
  }
  return kept;
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
      return { entries: trim([next, ...state.entries]) };
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
