import type { Repository, RunTarget } from "./types";

// Single-responsibility: resolve the active set of run targets for a repo.
// If the repo stores an explicit `runTargets` list (new flow), use it.
// Otherwise synthesize a single "main" target from the legacy
// `runCommand` / `restartCommand` / `port` fields so existing data keeps
// working without migration.

export function getRunTargets(repo: Repository): RunTarget[] {
  if (repo.runTargets && repo.runTargets.length > 0) return repo.runTargets;
  if (repo.runCommand?.trim()) {
    return [
      {
        id: "primary",
        name: "main",
        command: repo.runCommand,
        restartCommand: repo.restartCommand,
        port: repo.port,
      },
    ];
  }
  return [];
}

/** Compose the Tauri-side process id used to track a (repo, target) pair. */
export function processIdFor(repoId: string, targetId: string): string {
  return `${repoId}::${targetId}`;
}

export function newTargetId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
