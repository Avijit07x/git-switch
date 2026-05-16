import { useCallback, useState } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { toast } from "sonner";

import { gitClient } from "@/lib/git-client";
import { useIsAppReady } from "@/stores/use-app-ready-store";
import type {
  AheadBehind,
  GitBranchList,
  GitCommandResult,
  GitOperation,
  GitStatus,
  LastCommit,
  QuickStatus,
  Repository,
} from "@/lib/types";

// Operations significant enough to deserve a toast on completion.
const TOASTABLE_OPS: ReadonlySet<GitOperation> = new Set<GitOperation>([
  "pulling",
  "pushing",
  "pushingUpstream",
  "committing",
  "switching",
  "creatingBranch",
  "fetching",
]);

function summarizeStdout(stdout: string, max = 120): string {
  const line = stdout.split("\n").find((l) => l.trim().length > 0) ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

interface OperationDeps {
  repository: Repository | null;
  // Append a "running" log entry the moment the user clicks. Returns the
  // entry's id so we can finalize it later.
  onLogStart: (label: string) => string;
  // Transition the entry to "success" or "error" once the Git command resolves.
  onLogComplete: (id: string, result: GitCommandResult) => void;
}

// Keep the loading state visible for at least this long so the spinner never
// flashes too fast to perceive (common for `git pull` when already up to date).
const MIN_LOADING_MS = 400;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Single-responsibility: expose typed wrappers for every Git mutation,
// tracking which operation is in-flight so the UI can disable buttons.
// Reads (branches/status/lastCommit) are exposed via React Query hooks below.
export function useGitOperations({
  repository,
  onLogStart,
  onLogComplete,
}: OperationDeps) {
  const queryClient = useQueryClient();
  const [operation, setOperation] = useState<GitOperation>("idle");

  const invalidate = useCallback(() => {
    if (!repository) return;
    // One predicate sweep catches every per-repo query (branches/status/
    // lastCommit/aheadBehind/quickStatus/…). New per-repo queries pick up
    // the invalidation automatically.
    const repoId = repository.id;
    queryClient.invalidateQueries({
      predicate: (q) => q.queryKey.length >= 2 && q.queryKey[1] === repoId,
    });
  }, [queryClient, repository]);

  const run = useCallback(
    async <T extends GitCommandResult>(
      kind: GitOperation,
      label: string,
      fn: () => Promise<T>,
    ): Promise<T | null> => {
      if (!repository) return null;
      const logId = onLogStart(label);
      setOperation(kind);
      const startedAt = performance.now();
      try {
        const result = await fn();
        onLogComplete(logId, result);
        if (TOASTABLE_OPS.has(kind)) {
          if (result.success) {
            toast.success(`git ${label}`, {
              description: summarizeStdout(result.stdout) || undefined,
            });
          } else {
            toast.error(`git ${label} failed`, {
              description:
                result.stderr.trim().split("\n")[0] || "Check command output.",
            });
          }
        }
        invalidate();
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onLogComplete(logId, {
          command: "git",
          args: [],
          cwd: repository.path,
          stdout: "",
          stderr: message,
          exitCode: -1,
          success: false,
        });
        if (TOASTABLE_OPS.has(kind)) {
          toast.error(`git ${label} failed`, { description: message });
        }
        return null;
      } finally {
        const elapsed = performance.now() - startedAt;
        if (elapsed < MIN_LOADING_MS) await wait(MIN_LOADING_MS - elapsed);
        setOperation("idle");
      }
    },
    [repository, onLogStart, onLogComplete, invalidate],
  );

  const switchBranch = useCallback(
    async (branch: string) => {
      if (!repository) return null;
      const result = await run("switching", `switch ${branch}`, () =>
        gitClient.switchBranch(repository.path, branch),
      );
      // Broadcast so dependent UI (e.g. the RunPanel) can react — typical
      // use case is auto-restarting a dev server after a branch swap.
      if (result?.success) {
        window.dispatchEvent(
          new CustomEvent("git-switch:branch-switched", {
            detail: { repositoryId: repository.id, branch },
          }),
        );
      }
      return result;
    },
    [repository, run],
  );

  const createLocalBranchFromRemote = useCallback(
    (local: string, remote: string) =>
      repository
        ? run("creatingBranch", `switch -c ${local} --track ${remote}`, () =>
            gitClient.createLocalBranchFromRemote(repository.path, local, remote),
          )
        : Promise.resolve(null),
    [repository, run],
  );

  const createLocalBranch = useCallback(
    (name: string) =>
      repository
        ? run("creatingBranch", `switch -c ${name}`, () =>
            gitClient.createLocalBranch(repository.path, name),
          )
        : Promise.resolve(null),
    [repository, run],
  );

  const pull = useCallback(
    () =>
      repository
        ? run("pulling", "pull", () => gitClient.pullBranch(repository.path))
        : Promise.resolve(null),
    [repository, run],
  );

  const fetch = useCallback(
    () =>
      repository
        ? run("fetching", "fetch --all --prune", () =>
            gitClient.fetchRemote(repository.path),
          )
        : Promise.resolve(null),
    [repository, run],
  );

  const stageAll = useCallback(
    () =>
      repository
        ? run("staging", "add .", () => gitClient.stageAll(repository.path))
        : Promise.resolve(null),
    [repository, run],
  );

  const stageFiles = useCallback(
    (files: string[]) =>
      repository
        ? run("staging", `add ${files.length} file(s)`, () =>
            gitClient.stageFiles(repository.path, files),
          )
        : Promise.resolve(null),
    [repository, run],
  );

  const ignoreFile = useCallback(
    (file: string) =>
      repository
        ? run("ignoring", `gitignore += ${file}`, () =>
            gitClient.addToGitignore(repository.path, file),
          )
        : Promise.resolve(null),
    [repository, run],
  );

  const unstageFiles = useCallback(
    (files: string[]) =>
      repository
        ? run("unstaging", `restore --staged ${files.length} file(s)`, () =>
            gitClient.unstageFiles(repository.path, files),
          )
        : Promise.resolve(null),
    [repository, run],
  );

  const commit = useCallback(
    (message: string) =>
      repository
        ? run("committing", `commit -m "${truncate(message, 40)}"`, () =>
            gitClient.commitChanges(repository.path, message),
          )
        : Promise.resolve(null),
    [repository, run],
  );

  const push = useCallback(
    () =>
      repository
        ? run("pushing", "push", () => gitClient.pushBranch(repository.path))
        : Promise.resolve(null),
    [repository, run],
  );

  const pushWithUpstream = useCallback(
    (branch: string) =>
      repository
        ? run("pushingUpstream", `push -u origin ${branch}`, () =>
            gitClient.pushBranchWithUpstream(repository.path, branch),
          )
        : Promise.resolve(null),
    [repository, run],
  );

  return {
    operation,
    isBusy: operation !== "idle",
    switchBranch,
    createLocalBranchFromRemote,
    createLocalBranch,
    pull,
    fetch,
    stageAll,
    stageFiles,
    unstageFiles,
    ignoreFile,
    commit,
    push,
    pushWithUpstream,
    invalidate,
  } as const;
}

// Reads ─ exposed as React Query hooks for caching + background refresh.

// All read hooks gate on `isAppReady` so the first paint isn't competing
// with N concurrent Tauri IPC calls. After the idle frame flips the flag,
// every active query fires together — but only after the OS chrome (window,
// fullscreen, drag) has had a chance to settle.

export function useBranches(
  repository: Repository | null,
): UseQueryResult<GitBranchList, Error> {
  const ready = useIsAppReady();
  return useQuery({
    queryKey: ["branches", repository?.id],
    queryFn: () => gitClient.getBranches(repository!.path),
    enabled: ready && !!repository,
  });
}

export function useStatus(
  repository: Repository | null,
): UseQueryResult<GitStatus, Error> {
  const ready = useIsAppReady();
  return useQuery({
    queryKey: ["status", repository?.id],
    queryFn: () => gitClient.getStatus(repository!.path),
    enabled: ready && !!repository,
  });
}

export function useLastCommit(
  repository: Repository | null,
): UseQueryResult<LastCommit, Error> {
  const ready = useIsAppReady();
  return useQuery({
    queryKey: ["lastCommit", repository?.id],
    queryFn: () => gitClient.getLastCommit(repository!.path),
    enabled: ready && !!repository,
  });
}

// Sidebar/dashboard metadata changes rarely on its own — let cached values
// serve subsequent reads instantly. The file watcher and explicit
// invalidations still force a refresh whenever something actually moves.
const QUICK_STALE_MS = 15_000;

export function useAheadBehind(
  repository: Repository | null,
): UseQueryResult<AheadBehind, Error> {
  const ready = useIsAppReady();
  return useQuery({
    queryKey: ["aheadBehind", repository?.id],
    queryFn: () => gitClient.getAheadBehind(repository!.path),
    enabled: ready && !!repository,
    staleTime: QUICK_STALE_MS,
  });
}

export function useQuickStatus(
  repository: Repository | null,
): UseQueryResult<QuickStatus, Error> {
  const ready = useIsAppReady();
  return useQuery({
    queryKey: ["quickStatus", repository?.id],
    queryFn: () => gitClient.quickStatus(repository!.path),
    enabled: ready && !!repository,
    staleTime: QUICK_STALE_MS,
  });
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
