import { useEffect } from "react";

export interface ShortcutHandler {
  /** Lower-case key, e.g. "r", "p", "enter". Matched case-insensitively. */
  key: string;
  shift?: boolean;
  meta?: boolean; // ⌘ on macOS / ctrl elsewhere
  /** Whether to fire when the focus is inside an input/textarea. Default: false. */
  allowInInput?: boolean;
  run: (e: KeyboardEvent) => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

// Single-responsibility: bind a list of keyboard shortcuts to the window
// for the lifetime of the component. Pass `allowInInput` for shortcuts that
// should fire even while typing (e.g. ⌘Enter to commit).
export function useKeyboardShortcuts(handlers: ShortcutHandler[]): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      for (const h of handlers) {
        if (h.key.toLowerCase() !== e.key.toLowerCase()) continue;
        if (h.meta && !meta) continue;
        if (!h.meta && meta) continue;
        if (!!h.shift !== e.shiftKey) continue;
        if (!h.allowInInput && isEditableTarget(e.target)) continue;
        e.preventDefault();
        h.run(e);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
