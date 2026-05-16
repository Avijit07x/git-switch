import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { gitClient } from "@/lib/git-client";
import { useIsAppReady } from "@/stores/use-app-ready-store";
import type { Repository } from "@/lib/types";

// Run a silent `git fetch` per repo on mount + whenever the window regains
// focus (debounced). Without this, the sidebar's "behind" badge is a lie —
// `git status` only knows what local refs say, so a teammate's push is
// invisible until something fetches.
//
// Concurrency is intentionally bounded: a thundering herd of N parallel
// `git fetch` calls (one per repo) saturates the blocking pool and starves
// every other IPC, including the sidebar's `quick_status` reads. We rate-limit
// by *time* per repo (COOLDOWN_MS) AND by max in-flight requests.

const FOCUS_COOLDOWN_MS = 60_000;
const MAX_CONCURRENT_FETCHES = 5;

// Single-responsibility: walk `items` with at most `limit` in flight at once.
// Each task runs `worker(item)`; failures are swallowed (offline/no remote is
// not an error path for a background fetch).
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
          await worker(items[index]);
        } catch {
          /* swallow — caller decides whether to log */
        }
      }
    },
  );
  await Promise.all(runners);
}

export function useBackgroundFetch(repositories: Repository[]): void {
  const queryClient = useQueryClient();
  const ready = useIsAppReady();
  const lastRunRef = useRef<number>(0);
  // Keep a stable identity for the list so the effect only re-runs when the
  // *set* of repos changes, not on every parent re-render.
  const idsKey = repositories.map((r) => r.id).join("|");

  useEffect(() => {
    if (!ready || repositories.length === 0) return;

    let cancelled = false;

    const fetchAll = () => {
      const now = Date.now();
      if (now - lastRunRef.current < FOCUS_COOLDOWN_MS) return;
      lastRunRef.current = now;

      void withConcurrency(repositories, MAX_CONCURRENT_FETCHES, async (repo) => {
        if (cancelled) return;
        try {
          await gitClient.fetchRemote(repo.path);
          if (cancelled) return;
          queryClient.invalidateQueries({
            predicate: (q) => q.queryKey.length >= 2 && q.queryKey[1] === repo.id,
          });
        } catch {
          /* offline / no remote / auth fail — sidebar just stays stale */
        }
      });
    };

    // Defer the initial run so it doesn't compete with the first paint.
    // Using `requestIdleCallback` when available, falling back to a short
    // timeout — either way we let the UI settle before firing the first wave.
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
    // idsKey changes only when the actual set of repos changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, idsKey, queryClient]);
}
