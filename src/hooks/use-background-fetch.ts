import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import { gitClient } from "@/lib/git-client";
import { useIsAppReady } from "@/stores/use-app-ready-store";
import type { QuickStatus, Repository } from "@/lib/types";

// Run a silent `git fetch` per repo on mount + whenever the window regains
// focus (debounced). Without this, the sidebar's "behind" badge is a lie —
// `git status` only knows what local refs say, so a teammate's push is
// invisible until something fetches.
//
// Concurrency is intentionally bounded: a thundering herd of N parallel
// `git fetch` calls (one per repo) saturates the blocking pool and starves
// every other IPC, including the sidebar's `quick_status` reads.
//
// As a side benefit we use the before/after `quick_status` to detect "a
// teammate's commit just landed" and fire a native macOS notification.
// The first fetch on app launch is silent (no baseline to diff against) —
// subsequent fetches that grow `behind` notify per repo.

const FOCUS_COOLDOWN_MS = 60_000;
const MAX_CONCURRENT_FETCHES = 5;

async function withConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try {
          await worker(items[index]!);
        } catch {
          /* swallow */
        }
      }
    },
  );
  await Promise.all(runners);
}

// Ensure we've asked the OS for notification permission exactly once per
// session. macOS will only prompt the user once anyway, but isPermissionGranted
// is cheap and avoids the no-op request.
async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    const requested = await requestPermission();
    return requested === "granted";
  } catch {
    return false;
  }
}

interface PrevState {
  behind: number;
  ahead: number;
  branch: string | null;
}

export function useBackgroundFetch(repositories: Repository[]): void {
  const queryClient = useQueryClient();
  const ready = useIsAppReady();
  const lastRunRef = useRef<number>(0);
  // Remember each repo's last seen { behind, ahead, branch } across fetch
  // cycles so the *change* drives the notification, not the absolute count.
  const lastStateRef = useRef<Map<string, PrevState>>(new Map());
  // First fetch is silent so users don't get flooded the moment the app boots.
  const armedRef = useRef(false);
  const idsKey = repositories.map((r) => r.id).join("|");

  useEffect(() => {
    if (!ready || repositories.length === 0) return;

    let cancelled = false;
    void ensureNotificationPermission();

    const fetchAll = () => {
      const now = Date.now();
      if (now - lastRunRef.current < FOCUS_COOLDOWN_MS) return;
      lastRunRef.current = now;

      void withConcurrency(repositories, MAX_CONCURRENT_FETCHES, async (repo) => {
        if (cancelled) return;
        try {
          // Capture pre-fetch behind so we can detect new commits below.
          let before: QuickStatus | undefined;
          try {
            before = await gitClient.quickStatus(repo.path);
          } catch {
            /* fresh repo / corrupted .git — skip */
          }

          await gitClient.fetchRemote(repo.path);
          if (cancelled) return;

          // Invalidate every per-repo query so the sidebar/dashboard
          // re-render against fresh refs.
          queryClient.invalidateQueries({
            predicate: (q) => q.queryKey.length >= 2 && q.queryKey[1] === repo.id,
          });

          // Notify on "new commits arrived" — i.e. behind grew, on the same
          // branch we were tracking. Skip if this is the first cycle (armed
          // is false) so launch doesn't fire a wall of notifications.
          let after: QuickStatus | undefined;
          try {
            after = await gitClient.quickStatus(repo.path);
          } catch {
            /* ignore */
          }
          maybeNotifyNewCommits(repo, before, after, armedRef.current);
          if (after) {
            lastStateRef.current.set(repo.id, {
              behind: after.behind,
              ahead: after.ahead,
              branch: after.currentBranch,
            });
          }
        } catch {
          /* offline / no remote / auth fail — silent */
        }
      });

      // Arm on the *next* tick so the very first cycle never notifies.
      setTimeout(() => {
        armedRef.current = true;
      }, 0);
    };

    const idle = (cb: () => void): number => {
      const w = window as Window &
        typeof globalThis & {
          requestIdleCallback?: (cb: () => void) => number;
        };
      return w.requestIdleCallback
        ? w.requestIdleCallback(cb)
        : window.setTimeout(cb, 800);
    };
    const handle = idle(fetchAll);

    const onFocus = () => fetchAll();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      const w = window as Window &
        typeof globalThis & {
          cancelIdleCallback?: (h: number) => void;
        };
      if (w.cancelIdleCallback) w.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, idsKey, queryClient]);
}

// Fire a notification when `behind` grew on the same branch. Same-branch
// guard prevents spurious "10 new commits" alerts immediately after the user
// switches to a stale branch.
function maybeNotifyNewCommits(
  repo: Repository,
  before: QuickStatus | undefined,
  after: QuickStatus | undefined,
  armed: boolean,
): void {
  if (!armed || !before || !after) return;
  if (before.currentBranch !== after.currentBranch) return;
  const grew = after.behind > before.behind;
  if (!grew) return;
  const newCommits = after.behind - before.behind;
  const branch = after.currentBranch ?? "branch";
  void (async () => {
    try {
      if (!(await isPermissionGranted())) return;
      sendNotification({
        title: `${repo.name} · ${newCommits} new commit${newCommits === 1 ? "" : "s"}`,
        body: `${branch} is now ${after.behind} behind upstream. Pull when ready.`,
      });
    } catch {
      /* permission denied or plugin offline — silent */
    }
  })();
}
