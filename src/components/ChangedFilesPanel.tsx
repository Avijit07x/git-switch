import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Copy,
  Eye,
  FileClock,
  FileText,
  RefreshCcw,
  SquarePen,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IconHint } from "@/components/IconHint";
import { copyText } from "@/lib/clipboard";
import { describeStatusCode, shortFilePath } from "@/lib/format";
import { gitClient } from "@/lib/git-client";
import { openInEditor } from "@/lib/system";
import { cn } from "@/lib/utils";
import type { GitOperation, GitStatus, GitStatusFile } from "@/lib/types";

interface ChangedFilesPanelProps {
  repositoryPath: string;
  status: GitStatus | undefined;
  loading: boolean;
  busy: boolean;
  operation: GitOperation;
  onStage: (files: string[]) => void;
  onStageAll: () => void;
  onUnstage: (files: string[]) => void;
  onIgnore: (file: string) => void;
  onRefresh: () => void;
  /** Open the inline diff viewer for a specific file. */
  onViewDiff?: (file: string, staged: boolean, untracked: boolean) => void;
}

// Single-responsibility: show changed files, manage selection (including
// Shift+click range-select), and dispatch stage/unstage actions.
export function ChangedFilesPanel({
  repositoryPath,
  status,
  loading,
  busy,
  operation,
  onStage,
  onStageAll,
  onUnstage,
  onIgnore,
  onRefresh,
  onViewDiff,
}: ChangedFilesPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  // Bumped on every refresh click; remounts the icon so the one-shot spin
  // animation restarts even on rapid consecutive clicks.
  const [refreshTick, setRefreshTick] = useState(0);

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

  const handleOpenInEditor = async (path: string) => {
    try {
      await openInEditor(repositoryPath, path);
    } catch (err) {
      toast.error("Couldn't open file", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleCopyPath = async (path: string) => {
    try {
      await copyText(path);
      toast.success("Path copied", { description: path });
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const handleCopyOriginal = async (path: string) => {
    try {
      const contents = await gitClient.getFileAtRevision(
        repositoryPath,
        path,
        "HEAD",
      );
      await copyText(contents);
      toast.success("Pre-change contents copied", { description: path });
    } catch (err) {
      toast.error("Couldn't copy original contents", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
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
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
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
            className="h-7 px-2.5 text-xs"
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
            className="h-7 px-2.5 text-xs"
            onClick={handleUnstageSelected}
            loading={isUnstaging}
            loadingText="Unstaging…"
            disabled={otherBusy || stagedSelected.length === 0}
          >
            Unstage selected
          </Button>
          <IconHint label="Refresh status" side="top">
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => {
                setRefreshTick((t) => t + 1);
                onRefresh();
              }}
              disabled={busy || loading}
              aria-label="Refresh status"
            >
              <RefreshCcw
                key={refreshTick}
                className={cn(
                  "size-3.5",
                  loading
                    ? "animate-spin"
                    : refreshTick > 0 && "animate-spin-once",
                )}
              />
            </Button>
          </IconHint>
        </div>
      </header>

      <ScrollArea className="flex-1 rounded-lg border bg-card/50">
        {files.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            {loading ? "Loading…" : "Working tree clean."}
          </div>
        ) : (
          <ul className="divide-y">
            {files.map((file, index) => {
              const sensitive = isSensitiveFile(file.path);
              return (
                <ContextMenu key={file.path}>
                  <ContextMenuTrigger asChild>
                    <li
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
                      <span className="flex min-w-0 flex-1">
                        <button
                          type="button"
                          className={cn(
                            "-my-1.5 flex min-w-0 max-w-full items-center py-1.5 text-left",
                            onViewDiff && "cursor-pointer hover:underline",
                          )}
                          title={file.path}
                          onClick={(e) => {
                            // Shift+click keeps range-select; plain click on
                            // the name jumps straight to the diff.
                            if (e.shiftKey) return;
                            if (!onViewDiff) return;
                            e.stopPropagation();
                            onViewDiff(file.path, file.staged, file.untracked);
                          }}
                          tabIndex={-1}
                        >
                          <span
                            className={cn(
                              "truncate font-mono text-xs",
                              sensitive && "font-semibold text-destructive",
                            )}
                          >
                            {shortFilePath(file.path)}
                          </span>
                        </button>
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
                      {onViewDiff ? (
                        <IconHint label="View diff" side="left">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewDiff(
                                file.path,
                                file.staged,
                                file.untracked,
                              );
                            }}
                            disabled={busy}
                            aria-label={`View diff for ${file.path}`}
                          >
                            <Eye className="size-3.5" />
                          </Button>
                        </IconHint>
                      ) : null}
                      <IconHint label="Open in editor" side="left">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleOpenInEditor(file.path);
                          }}
                          aria-label={`Open ${file.path} in editor`}
                        >
                          <SquarePen className="size-3.5" />
                        </Button>
                      </IconHint>
                    </li>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="text-xs">
                    {onViewDiff ? (
                      <ContextMenuItem
                        disabled={busy}
                        onSelect={() =>
                          onViewDiff(file.path, file.staged, file.untracked)
                        }
                      >
                        <Eye className="size-3.5" /> View diff
                      </ContextMenuItem>
                    ) : null}
                    <ContextMenuItem
                      onSelect={() => void handleOpenInEditor(file.path)}
                    >
                      <SquarePen className="size-3.5" /> Open in editor
                    </ContextMenuItem>
                    {file.staged ? (
                      <ContextMenuItem
                        disabled={busy}
                        onSelect={() => onUnstage([file.path])}
                      >
                        <Undo2 className="size-3.5" /> Unstage
                      </ContextMenuItem>
                    ) : (
                      <ContextMenuItem
                        disabled={busy}
                        onSelect={() => onStage([file.path])}
                      >
                        <Undo2 className="size-3.5 rotate-180" /> Stage
                      </ContextMenuItem>
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onSelect={() => void handleCopyPath(file.path)}
                    >
                      <Copy className="size-3.5" /> Copy relative path
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={file.untracked}
                      onSelect={() => void handleCopyOriginal(file.path)}
                    >
                      <FileClock className="size-3.5" /> Copy contents before
                      change
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      disabled={busy}
                      className="text-destructive focus:text-destructive"
                      onSelect={() => onIgnore(file.path)}
                    >
                      <Ban className="size-3.5" /> Add to .gitignore
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </ul>
        )}
      </ScrollArea>
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
