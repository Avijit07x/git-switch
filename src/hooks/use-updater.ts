import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "restarting"
  | "error";

interface UpdaterState {
  status: UpdateStatus;
  /** Version string of the available update (e.g. "0.6.0"). */
  version: string | null;
  /** Release notes / changelog body. */
  body: string | null;
  /** Download progress 0–100 (null when not downloading). */
  progress: number | null;
  /** Human-readable error message if the check or install failed. */
  error: string | null;
  /** Trigger download + install + relaunch. */
  install: () => void;
  /** Manually re-check for updates. */
  checkNow: () => void;
  /** Dismiss the update banner (hides it until next check cycle finds it). */
  dismiss: () => void;
}

// Check every 30 minutes.
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

// Single-responsibility: periodically check for app updates via Tauri's
// updater plugin and expose the result + an install action to the UI.
// Runs the first check shortly after mount (2 s delay so the main UI
// renders first) then repeats on a 30-minute timer.
export function useUpdater(): UpdaterState {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const updateRef = useRef<Update | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doCheck = useCallback(async () => {
    // Don't re-check if we already found an update or are mid-install.
    if (
      updateRef.current ||
      status === "downloading" ||
      status === "installing" ||
      status === "restarting"
    ) {
      return;
    }

    try {
      setStatus("checking");
      setError(null);

      const update = await check();

      if (update) {
        updateRef.current = update;
        setVersion(update.version);
        setBody(update.body ?? null);
        setStatus("available");
        setDismissed(false);
      } else {
        setStatus("idle");
      }
    } catch (err) {
      // Update check failures are non-fatal — the user can still use the
      // app normally. Log it but don't toast.
      console.warn("[updater] check failed:", err);
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [status]);

  useEffect(() => {
    // Small delay so the main UI renders before we hit the network.
    const timeout = setTimeout(() => {
      void doCheck();
    }, 2_000);

    intervalRef.current = setInterval(() => {
      void doCheck();
    }, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(timeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;

    try {
      setStatus("downloading");
      setProgress(0);

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setProgress(Math.min(100, Math.round((downloaded / contentLength) * 100)));
            }
            break;
          case "Finished":
            setProgress(100);
            break;
        }
      });

      setStatus("restarting");
      // Brief pause so the user sees "Restarting…" before the app exits.
      await new Promise((r) => setTimeout(r, 500));
      await relaunch();
    } catch (err) {
      console.error("[updater] install failed:", err);
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
      setProgress(null);
    }
  }, []);

  const checkNow = useCallback(() => {
    // Reset so doCheck can run again.
    updateRef.current = null;
    setStatus("idle");
    void doCheck();
  }, [doCheck]);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  return {
    status: dismissed && status === "available" ? "idle" : status,
    version,
    body,
    progress,
    error,
    install: () => void install(),
    checkNow,
    dismiss,
  };
}
