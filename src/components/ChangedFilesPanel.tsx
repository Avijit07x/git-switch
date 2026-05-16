import { useMemo, useState } from "react";
import { AlertTriangle, Ban, FileText, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IconHint } from "@/components/IconHint";
import { describeStatusCode, shortFilePath } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GitOperation, GitStatus, GitStatusFile } from "@/lib/types";

interface ChangedFilesPanelProps {
  status: GitStatus | undefined;
  loading: boolean;
  busy: boolean;
  operation: GitOperation;
  onStage: (files: string[]) => void;
  onStageAll: () => void;
  onUnstage: (files: string[]) => void;
  onIgnore: (file: string) => void;
  onRefresh: () => void;
}

// Single-responsibility: show changed files, manage selection (including
// Shift+click range-select), and dispatch stage/unstage actions.
export function ChangedFilesPanel({
  status,
  loading,
  busy,
  operation,
  onStage,
  onStageAll,
  onUnstage,
  onIgnore,
  onRefresh,
}: ChangedFilesPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);

  const rawFiles = status?.files ?? [];
  const files = useMemo(() => sortFiles(rawFiles), [rawFiles]);

  const isStaging = operation === "staging";
  const isUnstaging = operation === "unstaging";
  const otherBusy = busy && !isStaging && !isUnstaging;

  const { stagedSelected, unstagedSelected } = useMemo(() => {
    const stagedSel: string[] = [];
    const unstagedSel: string[] = [];
    for (const file of files) {
      if (!selected.has(file.path)) continue;
      if (file.staged) stagedSel.push(file.path);
      if (file.unstaged || file.untracked) unstagedSel.push(file.path);
    }
    return { stagedSelected: stagedSel, unstagedSelected: unstagedSel };
  }, [files, selected]);

  const toggleOne = (path: string, index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    setAnchorIndex(index);
  };

  const selectRange = (index: number) => {
    if (anchorIndex === null) {
      toggleOne(files[index].path, index);
      return;
    }
    const start = Math.min(anchorIndex, index);
    const end = Math.max(anchorIndex, index);
    setSelected((prev) => {
      const next = new Set(prev);
      for (let i = start; i <= end; i++) next.add(files[i].path);
      return next;
    });
  };

  const handleRowClick = (e: React.MouseEvent, index: number) => {
    if (e.shiftKey) {
      e.preventDefault();
      selectRange(index);
    } else {
      toggleOne(files[index].path, index);
    }
  };

  const handleStageSelected = () => {
    if (unstagedSelected.length === 0) return;
    onStage(unstagedSelected);
    setSelected(new Set());
  };

  const handleUnstageSelected = () => {
    if (stagedSelected.length === 0) return;
    onUnstage(stagedSelected);
    setSelected(new Set());
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between px-1 pb-2">
        <h3 className="text-sm font-semibold">
          Changes
          {files.length > 0 ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {files.length} file{files.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleStageSelected}
            loading={isStaging}
            loadingText="Staging…"
            disabled={otherBusy || unstagedSelected.length === 0}
          >
            Stage selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onStageAll}
            loading={isStaging}
            loadingText="Staging…"
            disabled={otherBusy || files.length === 0}
          >
            Stage all
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleUnstageSelected}
            loading={isUnstaging}
            loadingText="Unstaging…"
            disabled={otherBusy || stagedSelected.length === 0}
          >
            Unstage selected
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            loading={loading}
            loadingText="Refreshing…"
            disabled={busy}
          >
            Refresh
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1 rounded-md border">
        {files.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            {loading ? "Loading…" : "Working tree clean."}
          </div>
        ) : (
          <ul className="divide-y">
            {files.map((file, index) => {
              const sensitive = isSensitiveFile(file.path);
              return (
                <li
                  key={file.path}
                  className={cn(
                    "group flex select-none items-center gap-3 px-3 py-1.5 transition-colors hover:bg-accent/40",
                    sensitive && "bg-destructive/5 hover:bg-destructive/10",
                  )}
                  onClick={(e) => handleRowClick(e, index)}
                >
                  <Checkbox
                    checked={selected.has(file.path)}
                    onCheckedChange={() => toggleOne(file.path, index)}
                    tabIndex={-1}
                    aria-label={`Select ${file.path}`}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {sensitive ? (
                    <IconHint
                      label="Likely contains secrets — should not be committed"
                      side="top"
                    >
                      <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
                    </IconHint>
                  ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    className={cn(
                      "flex-1 truncate text-xs font-mono",
                      sensitive && "font-semibold text-destructive",
                    )}
                    title={file.path}
                  >
                    {shortFilePath(file.path)}
                  </span>
                  <Badge
                    variant={
                      sensitive
                        ? "destructive"
                        : file.staged
                          ? "success"
                          : file.untracked
                            ? "warning"
                            : "outline"
                    }
                  >
                    {sensitive ? "sensitive" : describeStatusCode(file)}
                  </Badge>
                  {file.staged ? (
                    <IconHint label="Unstage this file" side="left">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnstage([file.path]);
                        }}
                        disabled={busy}
                        aria-label={`Unstage ${file.path}`}
                      >
                        <Undo2 className="size-3.5" />
                      </Button>
                    </IconHint>
                  ) : null}
                  <IconHint label="Add to .gitignore" side="left">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onIgnore(file.path);
                      }}
                      disabled={busy}
                      aria-label={`Ignore ${file.path}`}
                    >
                      <Ban className="size-3.5" />
                    </Button>
                  </IconHint>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Tip: hold <kbd className="rounded bg-muted px-1">Shift</kbd> to select a
        range.
      </p>
    </section>
  );
}

// Single-responsibility: detect files that almost certainly should NOT be
// committed (secrets, keys, env files). Surfaced at the top of the list in
// red so the user notices and can ignore them before staging.
export function isSensitiveFile(path: string): boolean {
  const filename = (path.split("/").pop() ?? path).toLowerCase();

  // .env, .env.local, .env.production etc. — but allow templates like
  // .env.example / .env.sample / .env.template since those are safe.
  if (/^\.env(\..+)?$/.test(filename)) {
    return !/\.(example|sample|template|dist)$/.test(filename);
  }

  // SSH private keys (the matching .pub files are safe to commit).
  if (/^id_(rsa|ed25519|ecdsa|dsa)$/.test(filename)) return true;

  // Cert / keystore extensions.
  if (/\.(pem|key|p12|pfx|kdbx|jks)$/.test(filename)) return true;

  // Common credential filenames.
  if (filename === ".npmrc") return true;
  if (filename === "serviceaccountkey.json") return true;
  if (filename === "credentials" || filename === "credentials.json") return true;
  if (/^secrets?(\.\w+)?$/.test(filename)) return true;

  return false;
}

// Single-responsibility: order files so sensitive ones surface first (so the
// user can ignore them), then Modified, then Untracked, then everything else.
// Alphabetical within each group.
function sortFiles(files: GitStatusFile[]): GitStatusFile[] {
  const priority = (f: GitStatusFile): number => {
    if (isSensitiveFile(f.path)) return 0;
    const isModified = f.indexStatus === "M" || f.worktreeStatus === "M";
    if (isModified) return 1;
    if (f.untracked) return 2;
    return 3;
  };
  return [...files].sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    return a.path.localeCompare(b.path);
  });
}
