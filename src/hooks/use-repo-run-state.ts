import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { processClient } from "@/lib/process-client";
import { getRunTargets, processIdFor } from "@/lib/run-targets";
import type { Repository } from "@/lib/types";

interface RunState {
  /** Number of run targets currently in the "running" state for this repo. */
  runningCount: number;
  /** First port we know about across the running targets (for the badge). */
  port?: number;
}

// Single-responsibility: observe which of a repo's run targets are currently
// running. Aggregates the per-target process events into one count + a
// representative port, so the sidebar row can render a single indicator
// regardless of how many targets the repo has.
export function useRepoRunState(repo: Repository): RunState {
  const [state, setState] = useState<RunState>({ runningCount: 0 });

  useEffect(() => {
    const targets = getRunTargets(repo);
    if (targets.length === 0) {
      setState({ runningCount: 0 });
      return;
    }

    const running = new Set<string>();
    const unlisteners: UnlistenFn[] = [];
    let cancelled = false;

    const emit = () => {
      if (cancelled) return;
      if (running.size === 0) {
        setState({ runningCount: 0 });
        return;
      }
      const firstId = running.values().next().value;
      const firstTarget = targets.find((t) => t.id === firstId);
      setState({
        runningCount: running.size,
        port: firstTarget?.port ?? repo.port,
      });
    };

    void (async () => {
      // Bootstrap from Rust state so a freshly mounted row reflects already-
      // running processes (e.g. user switched repos and is coming back).
      await Promise.all(
        targets.map(async (t) => {
          try {
            const isRunning = await processClient.isRunning(
              processIdFor(repo.id, t.id),
            );
            if (isRunning) running.add(t.id);
          } catch {
            /* ignore — assume not running */
          }
        }),
      );
      emit();

      // Subscribe to each target's lifecycle events.
      for (const t of targets) {
        const procId = processIdFor(repo.id, t.id);

        const offStart = await listen<string>(
          `process-started:${procId}`,
          () => {
            running.add(t.id);
            emit();
          },
        );
        const offExit = await listen(`process-exit:${procId}`, () => {
          running.delete(t.id);
          emit();
        });
        const offStop = await listen<string>(
          `process-stopping:${procId}`,
          () => {
            running.delete(t.id);
            emit();
          },
        );

        if (cancelled) {
          offStart();
          offExit();
          offStop();
        } else {
          unlisteners.push(offStart, offExit, offStop);
        }
      }
    })();

    return () => {
      cancelled = true;
      for (const off of unlisteners) off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.id, repo.runTargets, repo.runCommand, repo.port]);

  return state;
}
