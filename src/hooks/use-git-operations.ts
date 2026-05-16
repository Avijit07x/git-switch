import { useCallback, useState } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { toast } from "sonner";

import { gitClient } from "@/lib/git-client";
import { useIsAppReady } from "@/stores/use-app-ready-store";
import type {
  AheadBehind,
  CommitInfo,
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
  "undoing",
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

// Tiny floor so a 5ms operation doesn't visually flicker, but small enough
// that fast ops still feel instant. Used to be 400ms — left over from when
// every command blocked the IPC thread. With the async backend that delay
// just makes the app feel sluggish.
const MIN_LOADING_MS = 100;

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

  // Optimistic patcher for the `status` query — flips `staged`/`unstaged` on
  // the matching files in cache so the file list updates the instant the
  // user clicks, without waiting for the round-trip + invalidation cycle.
  // If git fails, the post-run `invalidate()` rolls everything back to the
  // server's truth.
  const patchStatus = useCallback(
    (matcher: (path: string) => boolean, staged: boolean) => {
      if (!repository) return;
      queryClient.setQueryData<GitStatus>(
        ["status", repository.id],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            files: prev.files.map((f) =>
              matcher(f.path)
                ? { ...f, staged, unstaged: !staged, untracked: false }
                : f,
            ),
          };
        },
      );
    },
    [queryClient, repository],
  );

  const stageAll = useCallback(
    () => {
      if (!repository) return Promise.resolve(null);
      patchStatus(() => true, true);
      return run("staging", "add .", () => gitClient.stageAll(repository.path));
    },
    [repository, run, patchStatus],
  );

  const stageFiles = useCallback(
    (files: string[]) => {
      if (!repository) return Promise.resolve(null);
      const set = new Set(files);
      patchStatus((p) => set.has(p), true);
      return run("staging", `add ${files.length} file(s)`, () =>
        gitClient.stageFiles(repository.path, files),
      );
    },
    [repository, run, patchStatus],
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
    (files: string[]) => {
      if (!repository) return Promise.resolve(null);
      const set = new Set(files);
      patchStatus((p) => set.has(p), false);
      return run("unstaging", `restore --staged ${files.length} file(s)`, () =>
        gitClient.unstageFiles(repository.path, files),
      );
    },
    [repository, run, patchStatus],
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

  const undoLastCommit = useCallback(
    () =>
      repository
        ? run("undoing", "reset --soft HEAD~1", () =>
            gitClient.undoLastCommit(repository.path),
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
    undoLastCommit,
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

const HISTORY_LIMIT = 50;

export function useCommitHistory(
  repository: Repository | null,
): UseQueryResult<CommitInfo[], Error> {
  const ready = useIsAppReady();
  return useQuery({
    queryKey: ["commitHistory", repository?.id],
    queryFn: () => gitClient.getCommitHistory(repository!.path, HISTORY_LIMIT),
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

// Single-responsibility: fetch quick status for every repo in a single IPC
// and prime each per-repo React Query cache entry. Individual sidebar rows
// then read from `useQuickStatus` and see instant cache hits — no per-row
// IPC fan-out. With 10 repos this drops sidebar refreshes from 10 round-
// trips to 1.
export function useQuickStatusBatch(repositories: Repository[]): void {
  const queryClient = useQueryClient();
  const ready = useIsAppReady();
  // Stable key for the effect — only re-run when the *set* of repos changes,
  // not on every parent re-render.
  const pathsKey = repositories.map((r) => `${r.id}:${r.path}`).join("|");

  useQuery({
    queryKey: ["quickStatusBatch", pathsKey],
    queryFn: async () => {
      const paths = repositories.map((r) => r.path);
      const results = await gitClient.quickStatusBatch(paths);
      // Walk the result tuple and write into per-repo cache slots so the
      // existing `useQuickStatus(repo)` hooks pick them up without a refetch.
      const byPath = new Map(results);
      for (const repo of repositories) {
        const status = byPath.get(repo.path);
        if (status) {
          queryClient.setQueryData(["quickStatus", repo.id], status);
        }
      }
      return results;
    },
    enabled: ready && repositories.length > 0,
    staleTime: QUICK_STALE_MS,
    // Don't render the batch result anywhere — it's pure side-effect.
    notifyOnChangeProps: [],
  });
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
