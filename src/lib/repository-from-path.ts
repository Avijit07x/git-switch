import type { Repository } from "./types";

// Single-responsibility: build a Repository value from an absolute filesystem
// path. Used by the picker, the clone dialog, and the drag-and-drop handler
// to normalize input before it's added to the repo store.
export function repositoryFromPath(path: string): Repository {
  const name = path.split("/").filter(Boolean).pop() ?? path;
  return {
    id: path,
    name,
    path,
    addedAt: Date.now(),
  };
}
