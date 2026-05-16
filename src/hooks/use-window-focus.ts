import { useEffect, useRef } from "react";

const DEFAULT_DEBOUNCE_MS = 400;

// Single-responsibility: run `onFocus` whenever the OS window regains focus.
// Debounced so rapid alt-tabbing doesn't fan-out into multiple refreshes.
export function useWindowFocus(
  onFocus: () => void,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): void {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const handler = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        onFocus();
      }, debounceMs);
    };
    window.addEventListener("focus", handler);
    return () => {
      window.removeEventListener("focus", handler);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [onFocus, debounceMs]);
}
