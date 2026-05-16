import { useEffect } from "react";

import { useAppReadyStore } from "@/stores/use-app-ready-store";

// Single-responsibility: schedule the app-ready flip for one idle frame
// after mount, so the first paint and the OS window chrome (fullscreen,
// drag, traffic lights) run before any heavy IPC work starts.
export function useMarkAppReady(): void {
  const markReady = useAppReadyStore((s) => s.markReady);

  useEffect(() => {
    const w = window as Window &
      typeof globalThis & {
        requestIdleCallback?: (cb: () => void) => number;
        cancelIdleCallback?: (handle: number) => void;
      };
    const handle = w.requestIdleCallback
      ? w.requestIdleCallback(markReady)
      : window.setTimeout(markReady, 250);

    return () => {
      if (w.cancelIdleCallback) w.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [markReady]);
}
