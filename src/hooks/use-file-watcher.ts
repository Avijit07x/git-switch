import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";

import { gitClient } from "@/lib/git-client";
import { useIsAppReady } from "@/stores/use-app-ready-store";

// Single-responsibility: subscribe to the Rust filesystem watcher for `repoId`
// and invalidate the React Query caches that depend on the repository state.
// The Rust side already debounces raw FS bursts (500ms), so we just react to
// the higher-level `git-fs-change:<repoId>` event.
export function useFileWatcher(
  repoId: string | null,
  path: string | null,
): void {
  const queryClient = useQueryClient();
  const ready = useIsAppReady();

  useEffect(() => {
    if (!ready || !repoId || !path) return;

    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    void (async () => {
      // Attach the listener BEFORE starting the watcher — otherwise a fast
      // first FS event from Rust could fire into the void.
      try {
        unlisten = await listen(`git-fs-change:${repoId}`, () => {
          queryClient.invalidateQueries({
            predicate: (q) => q.queryKey.length >= 2 && q.queryKey[1] === repoId,
          });
        });
      } catch {
        return;
      }
      if (cancelled) {
        unlisten?.();
        return;
      }
      try {
        await gitClient.watchRepository(repoId, path);
      } catch {
        unlisten?.();
        unlisten = null;
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
      void gitClient.unwatchRepository(repoId).catch(() => {});
    };
  }, [ready, repoId, path, queryClient]);
}
