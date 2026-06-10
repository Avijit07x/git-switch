import { useCallback, useMemo, useState } from "react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { FolderSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { gitClient } from "@/lib/git-client";
import { repositoryFromPath } from "@/lib/repository-from-path";
import type { Repository, ScannedEntry } from "@/lib/types";

interface ScanFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasPath: (path: string) => boolean;
  onAdd: (repo: Repository) => void;
}

// Single-responsibility: pick a base folder, scan it for git repos and
// non-git subfolders, let the user checkbox the ones to import, then bulk-add
// them to the repository store. Non-git folders import too so the user can
// `git init` them from the dashboard's empty state.
export function ScanFolderDialog({
  open,
  onOpenChange,
  hasPath,
  onAdd,
}: ScanFolderDialogProps) {
  const [base, setBase] = useState<string | null>(null);
  const [entries, setEntries] = useState<ScannedEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState(false);

  const reset = useCallback(() => {
    setBase(null);
    setEntries([]);
    setSelected(new Set());
  }, []);

  const handlePickBase = useCallback(async () => {
    const picked = await openFolderDialog({
      directory: true,
      multiple: false,
      title: "Select a parent folder to scan",
    });
    if (!picked || Array.isArray(picked)) return;

    setBase(picked);
    setScanning(true);
    try {
      const result = await gitClient.scanDirectory(picked);
      setEntries(result);
      // Default-select every fresh git repo; deselect non-git and dupes.
      setSelected(
        new Set(
          result
            .filter((e) => e.isGitRepo && !hasPath(e.path))
            .map((e) => e.path),
        ),
      );
    } catch (err) {
      toast.error("Scan failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setScanning(false);
    }
  }, [hasPath]);

  const toggle = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (only: "git" | "all") => {
      const target = entries
        .filter((e) => only === "all" || e.isGitRepo)
        .filter((e) => !hasPath(e.path))
        .map((e) => e.path);
      setSelected((prev) => {
        const allSelected = target.every((p) => prev.has(p));
        const next = new Set(prev);
        if (allSelected) {
          target.forEach((p) => next.delete(p));
        } else {
          target.forEach((p) => next.add(p));
        }
        return next;
      });
    },
    [entries, hasPath],
  );

  const handleAdd = useCallback(() => {
    setAdding(true);
    let count = 0;
    for (const e of entries) {
      if (!selected.has(e.path)) continue;
      if (hasPath(e.path)) continue;
      onAdd(repositoryFromPath(e.path));
      count += 1;
    }
    setAdding(false);
    if (count > 0) {
      toast.success(`Added ${count} folder${count === 1 ? "" : "s"}`);
    }
    onOpenChange(false);
    reset();
  }, [entries, selected, hasPath, onAdd, onOpenChange, reset]);

  const summary = useMemo(() => {
    if (!entries.length) return null;
    const git = entries.filter((e) => e.isGitRepo).length;
    const nonGit = entries.length - git;
    return `${git} git ${git === 1 ? "repo" : "repos"} · ${nonGit} other`;
  }, [entries]);

  const selectableCount = useMemo(
    () => entries.filter((e) => !hasPath(e.path)).length,
    [entries, hasPath],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scan a folder for repositories</DialogTitle>
          <DialogDescription>
            Pick a parent folder. We find every git repo inside, plus other
            folders you can initialize from the dashboard.
          </DialogDescription>
        </DialogHeader>

        {!base ? (
          <Button
            variant="outline"
            onClick={handlePickBase}
            className="w-full justify-start"
          >
            <FolderSearch className="mr-2 h-4 w-4" />
            Choose a folder to scan…
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <code
                className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1"
                title={base}
              >
                {base}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={handlePickBase}
                disabled={scanning}
              >
                Change
              </Button>
            </div>

            {scanning ? (
              <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Scanning…
              </div>
            ) : entries.length === 0 ? (
              <p className="px-1 py-6 text-sm text-muted-foreground">
                Nothing usable in this folder.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{summary}</span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleAll("git")}
                      className="h-6 px-2 text-xs"
                    >
                      Toggle git
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleAll("all")}
                      className="h-6 px-2 text-xs"
                    >
                      Toggle all
                    </Button>
                  </div>
                </div>

                <ul className="max-h-[320px] overflow-auto rounded-md border">
                  {entries.map((e) => {
                    const dupe = hasPath(e.path);
                    const checked = selected.has(e.path);
                    return (
                      <li
                        key={e.path}
                        className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
                      >
                        <Checkbox
                          id={`scan-${e.path}`}
                          checked={checked}
                          disabled={dupe}
                          onCheckedChange={() => toggle(e.path)}
                        />
                        <label
                          htmlFor={`scan-${e.path}`}
                          className="min-w-0 flex-1 cursor-pointer truncate"
                        >
                          <span className="font-medium">{e.name}</span>
                          <span
                            className="ml-2 text-[10px] text-muted-foreground"
                            title={e.path}
                          >
                            {e.path}
                          </span>
                        </label>
                        {dupe ? (
                          <Badge variant="outline" className="text-[10px]">
                            already added
                          </Badge>
                        ) : e.isGitRepo ? (
                          <Badge variant="success" className="text-[10px]">
                            git
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            not init
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={selected.size === 0 || adding || selectableCount === 0}
          >
            {adding
              ? "Adding…"
              : selected.size === 0
                ? "Add selected"
                : `Add ${selected.size}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
