import type { GitStatusFile } from "./types";

export function describeStatusCode(file: GitStatusFile): string {
  if (file.untracked) return "Untracked";
  const map: Record<string, string> = {
    M: "Modified",
    A: "Added",
    D: "Deleted",
    R: "Renamed",
    C: "Copied",
    U: "Unmerged",
    "?": "Untracked",
    "!": "Ignored",
    " ": "",
  };
  const index = map[file.indexStatus] ?? file.indexStatus;
  const tree = map[file.worktreeStatus] ?? file.worktreeStatus;
  if (index && tree) return `${index} / ${tree}`;
  return index || tree || "Changed";
}

export function shortenPath(path: string, maxLen = 56): string {
  if (path.length <= maxLen) return path;
  return `…${path.slice(path.length - maxLen + 1)}`;
}

// Single-responsibility: collapse a path down to its parent folder + filename,
// e.g. "src/components/ui/button.tsx" → "…/ui/button.tsx". Root-level files
// (".env", "package.json") and one-level paths ("src/main.tsx") are returned
// unchanged so they don't get unnecessary ellipses.
export function shortFilePath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return `…/${parts.slice(-2).join("/")}`;
}
