import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { processClient } from "@/lib/process-client";
import type {
  ProcessDataEvent,
  ProcessExitEvent,
  ProcessStatus,
} from "@/lib/types";

interface UseProcessResult {
  status: ProcessStatus;
  exitCode: number | null;
  start: (command: string, cwd: string, killPort?: number) => Promise<void>;
  stop: () => Promise<void>;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  /** Register a sink for raw PTY chunks (xterm.js write callback). */
  setSink: (sink: ((chunk: string) => void) | null) => void;
}

// Single-responsibility: own the live process state for a single repository
// and forward PTY data chunks to whatever sink the consumer registers
// (typically an xterm.js terminal). The hook never stores raw bytes itself —
// xterm.js owns the scrollback buffer.
export function useProcess(repoId: string | undefined): UseProcessResult {
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [exitCode, setExitCode] = useState<number | null>(null);
  const sinkRef = useRef<((chunk: string) => void) | null>(null);
  const readyRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!repoId) {
      readyRef.current = null;
      return;
    }
    let unlistenData: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;
    let cancelled = false;

    readyRef.current = (async () => {
      const offData = await listen<ProcessDataEvent>(
        `process-data:${repoId}`,
        (event) => {
          sinkRef.current?.(event.payload.data);
        },
      );
      const offExit = await listen<ProcessExitEvent>(
        `process-exit:${repoId}`,
        (event) => {
          setStatus(event.payload.success ? "exited" : "errored");
          setExitCode(event.payload.exitCode);
        },
      );
      // Fired by Rust after a successful spawn — catches start() calls that
      // bypass this hook (e.g. parent-driven bulk Run in GroupDashboard).
      const offStarted = await listen<string>(
        `process-started:${repoId}`,
        () => {
          setStatus("running");
          setExitCode(null);
        },
      );
      // Optimistic transition so bulk Stop reflects in the UI before the
      // process-exit event lands.
      const offStopping = await listen<string>(
        `process-stopping:${repoId}`,
        () => {
          setStatus((prev) => (prev === "running" ? "exited" : prev));
        },
      );
      if (cancelled) {
        offData();
        offExit();
        offStarted();
        offStopping();
      } else {
        unlistenData = () => {
          offData();
          offStarted();
          offStopping();
        };
        unlistenExit = offExit;
      }
    })();

    void processClient.isRunning(repoId).then((running) => {
      if (!cancelled && running) setStatus("running");
    });

    return () => {
      cancelled = true;
      unlistenData?.();
      unlistenExit?.();
      readyRef.current = null;
    };
  }, [repoId]);

  const start = useCallback(
    async (command: string, cwd: string, killPort?: number) => {
      if (!repoId) return;
      if (readyRef.current) {
        try {
          await readyRef.current;
        } catch {
          /* listener setup failed — start anyway */
        }
      }
      setExitCode(null);
      setStatus("running");
      try {
        await processClient.start(repoId, command, cwd, killPort);
      } catch (err) {
        setStatus("errored");
        const msg = err instanceof Error ? err.message : String(err);
        sinkRef.current?.(`\r\n\x1b[31m${msg}\x1b[0m\r\n`);
      }
    },
    [repoId],
  );

  const stop = useCallback(async () => {
    if (!repoId) return;
    try {
      await processClient.stop(repoId);
    } finally {
      setStatus((prev) => (prev === "running" ? "exited" : prev));
    }
  }, [repoId]);

  const write = useCallback(
    async (data: string) => {
      if (!repoId) return;
      try {
        await processClient.write(repoId, data);
      } catch {
        /* ignore — the process may have just exited */
      }
    },
    [repoId],
  );

  const resize = useCallback(
    async (cols: number, rows: number) => {
      if (!repoId) return;
      try {
        await processClient.resize(repoId, cols, rows);
      } catch {
        /* not running yet — ignore */
      }
    },
    [repoId],
  );

  const setSink = useCallback((sink: ((chunk: string) => void) | null) => {
    sinkRef.current = sink;
  }, []);

  return { status, exitCode, start, stop, write, resize, setSink };
}
