import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

interface UseFileDropOptions {
  onDrop: (paths: string[]) => void;
}

interface UseFileDropResult {
  isDragOver: boolean;
}

// Single-responsibility: subscribe to Tauri's window-level drag-and-drop
// events. Reports a boolean drag-over state for visual feedback and
// invokes `onDrop` with the dropped absolute paths.
export function useFileDrop({ onDrop }: UseFileDropOptions): UseFileDropResult {
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setIsDragOver(true);
        } else if (payload.type === "leave") {
          setIsDragOver(false);
        } else if (payload.type === "drop") {
          setIsDragOver(false);
          if (payload.paths.length > 0) onDrop(payload.paths);
        }
      })
      .then((un) => {
        if (cancelled) un();
        else unlisten = un;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [onDrop]);

  return { isDragOver };
}
