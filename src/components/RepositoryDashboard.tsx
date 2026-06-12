import { Suspense, lazy, useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  FolderGit2,
  Play,
  ScrollText,
  Trash2,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DashboardErrorBoundary } from "@/components/DashboardErrorBoundary";
import { IconHint } from "@/components/IconHint";
import {
  useAheadBehind,
  useBranches,
  useGitOperations,
  useLastCommit,
  useStatus,
} from "@/hooks/use-git-operations";
import { useFileWatcher } from "@/hooks/use-file-watcher";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useRepoRunState } from "@/hooks/use-repo-run-state";
import { useTrayStatus } from "@/hooks/use-tray-status";
import { useWindowFocus } from "@/hooks/use-window-focus";
import { gitClient } from "@/lib/git-client";
import { shortenPath } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCommandLogStore } from "@/stores/use-command-log-store";
import { clampPanelHeight, useUiStore } from "@/stores/use-ui-store";
import type { Repository, RunTarget } from "@/lib/types";

import { BranchSelector } from "./BranchSelector";
import { ChangedFilesPanel } from "./ChangedFilesPanel";
import { CommandOutputPanel } from "./CommandOutputPanel";
import { CommitPanel } from "./CommitPanel";
import { GitActionsPanel } from "./GitActionsPanel";
import { RunPanel } from "./RunPanel";

// Lazy — only loaded on first open.
const CreateBranchDialog = lazy(() =>
  import("./CreateBranchDialog").then((m) => ({
    default: m.CreateBranchDialog,
  })),
);

const DiffDialog = lazy(() =>
  import("./DiffDialog").then((m) => ({ default: m.DiffDialog })),
);

const CommitHistoryDialog = lazy(() =>
  import("./CommitHistoryDialog").then((m) => ({
    default: m.CommitHistoryDialog,
  })),
);

interface RepositoryDashboardProps {
  repository: Repository;
  onUpdateRepository: (
    id: string,
    patch: {
      runTargets?: RunTarget[];
      port?: number | undefined;
    },
  ) => void;
}

// Outer wrapper applies the error boundary. Real logic is in the inner
// component so the boundary's children are isolated from its own state.
export function RepositoryDashboard(props: RepositoryDashboardProps) {
  return (
    <DashboardErrorBoundary resetKey={props.repository.id}>
      <DashboardInner {...props} />
    </DashboardErrorBoundary>
  );
}

function DashboardInner({
  repository,
  onUpdateRepository,
}: RepositoryDashboardProps) {
  const queryClient = useQueryClient();

  // Command log wiring — subscribed here (not in App) so log churn only
  // re-renders this subtree.
  const startEntry = useCommandLogStore((s) => s.startEntry);
  const completeEntry = useCommandLogStore((s) => s.completeEntry);
  const clearEntries = useCommandLogStore((s) => s.clearEntries);
  const onLogStart = useCallback(
    (label: string) => startEntry(repository.id, label),
    [startEntry, repository.id],
  );

  const ops = useGitOperations({
    repository,
    onLogStart,
    onLogComplete: completeEntry,
  });

  // Validate the repo path on mount; surface a friendly fallback if the
  // folder has been moved or .git is corrupted.
  const validation = useQuery({
    queryKey: ["validate", repository.id],
    queryFn: () => gitClient.validateRepository(repository.path),
    retry: false,
    staleTime: Infinity,
  });

  const branchesQuery = useBranches(
    validation.isSuccess ? repository : null,
  );
  const statusQuery = useStatus(validation.isSuccess ? repository : null);
  const lastCommitQuery = useLastCommit(
    validation.isSuccess ? repository : null,
  );
  const aheadBehindQuery = useAheadBehind(
    validation.isSuccess ? repository : null,
  );

  const handleRefresh = useCallback(() => ops.invalidate(), [ops]);

  // Auto-refresh whenever the window regains focus, plus a native filesystem
  // watcher so external changes (terminal, editor) show up without focus.
  useWindowFocus(handleRefresh);
  useFileWatcher(
    validation.isSuccess ? repository.id : null,
    validation.isSuccess ? repository.path : null,
  );

  // Bottom panel (Output / Run) — layout state lives in the persisted UI
  // store so it survives repo switches and restarts. Both tab bodies stay
  // mounted so xterm sessions and log scroll positions survive switches.
  const panelOpen = useUiStore((s) => s.panelOpen);
  const panelTab = useUiStore((s) => s.panelTab);
  const panelHeight = useUiStore((s) => s.panelHeight);
  const setPanelOpen = useUiStore((s) => s.setPanelOpen);
  const setPanelTab = useUiStore((s) => s.setPanelTab);
  const openPanelTab = useUiStore((s) => s.openPanelTab);
  const togglePanel = useUiStore((s) => s.togglePanel);
  const setPanelHeight = useUiStore((s) => s.setPanelHeight);
  const resetPanelHeight = useUiStore((s) => s.resetPanelHeight);
  const run = useRepoRunState(repository);

  // VS Code-style resize: drag the panel's top edge. The transient height
  // stays in local state during the gesture (no localStorage churn at 60Hz)
  // and is committed to the persisted store on release. Pointer capture
  // keeps the gesture alive even when the cursor crosses the xterm canvas.
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const dragHeightRef = useRef<number | null>(null);
  const effectivePanelHeight = dragHeight ?? panelHeight;

  const handlePanelResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = dragHeightRef.current ?? panelHeight;
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const next = clampPanelHeight(startHeight + (startY - ev.clientY));
        dragHeightRef.current = next;
        setDragHeight(next);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (dragHeightRef.current !== null) {
          setPanelHeight(dragHeightRef.current);
        }
        dragHeightRef.current = null;
        setDragHeight(null);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [panelHeight, setPanelHeight],
  );

  const outputCount = useCommandLogStore((s) =>
    s.entries.reduce(
      (n, e) => (e.repositoryId === repository.id ? n + 1 : n),
      0,
    ),
  );

  // ⌘R refresh, ⌘P pull, ⌘⇧P push, ⌘⇧F fetch, ⌘⇧N create branch,
  // ⌘⇧H history, ctrl+` toggles the panel (VS Code).
  const shortcuts = useMemo(
    () => [
      { key: "r", meta: true, run: handleRefresh },
      { key: "p", meta: true, run: () => void ops.pull() },
      { key: "p", meta: true, shift: true, run: () => void ops.push() },
      { key: "f", meta: true, shift: true, run: () => void ops.fetch() },
      {
        key: "n",
        meta: true,
        shift: true,
        run: () => setCreateBranchOpen(true),
      },
      { key: "h", meta: true, shift: true, run: () => setHistoryOpen(true) },
      { key: "`", ctrl: true, allowInInput: true, run: togglePanel },
    ],
    [handleRefresh, ops, togglePanel],
  );
  useKeyboardShortcuts(shortcuts);

  // Dirty-tree switch confirmation.
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingUndo, setPendingUndo] = useState(false);

  const [diffTarget, setDiffTarget] = useState<{
    file: string;
    staged: boolean;
    untracked: boolean;
  } | null>(null);
  const dirty = (statusQuery.data?.files ?? []).length > 0;

  const handleSwitchRequest = useCallback(
    (branch: string) => {
      if (dirty) setPendingSwitch(branch);
      else void ops.switchBranch(branch);
    },
    [dirty, ops],
  );

  const handlePush = async () => {
    const res = await ops.push();
    return res ? { success: res.success, stderr: res.stderr } : null;
  };

  const uncommitted = (statusQuery.data?.files ?? []).length;
  const current = branchesQuery.data?.current ?? null;
  const ahead = aheadBehindQuery.data?.ahead ?? 0;
  const behind = aheadBehindQuery.data?.behind ?? 0;
  // Drives the "Publish branch" button — true once the current branch has a
  // configured upstream (i.e. has been published at least once).
  const hasUpstream = !!aheadBehindQuery.data?.upstream;

  // Push the active repo's status to the menu-bar tray label so it's visible
  // even when the window is hidden.
  useTrayStatus({
    repository,
    branch: current,
    ahead,
    behind,
    changes: uncommitted,
  });
  // Show the Undo button only when the latest commit is safely local:
  // either the branch has no upstream at all (brand-new branch) or there
  // are unpushed commits ahead of upstream. We never expose this for commits
  // that have been published — that would rewrite shared history.
  const canUndoLastCommit = !hasUpstream || ahead > 0;

  if (validation.isError) {
    return (
      <RepoUnavailable
        repository={repository}
        message={
          validation.error instanceof Error
            ? validation.error.message
            : String(validation.error)
        }
        onRetry={() =>
          queryClient.invalidateQueries({
            queryKey: ["validate", repository.id],
          })
        }
      />
    );
  }

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col">
      <header
        className="flex h-12 shrink-0 items-center gap-3 border-b border-border/70 px-6 text-sm"
        data-tauri-drag-region
      >
        <span className="flex size-6 items-center justify-center rounded-md border border-border/60 bg-card shadow-2xs">
          <FolderGit2 className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
        <span className="font-semibold tracking-tight">{repository.name}</span>
        <span
          className="truncate text-xs text-muted-foreground"
          title={repository.path}
        >
          {shortenPath(repository.path, 72)}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {canUndoLastCommit ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() => setPendingUndo(true)}
              disabled={ops.isBusy}
              title="git reset --soft HEAD~1 — keeps your changes staged"
            >
              <Undo2 className="h-3 w-3" />
              Undo last commit
            </Button>
          ) : null}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          <Card className="shrink-0">
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <BranchSelector
                  branches={branchesQuery.data}
                  loading={branchesQuery.isLoading}
                  busy={ops.isBusy}
                  operation={ops.operation}
                  onSwitch={handleSwitchRequest}
                  onCreateFromRemote={ops.createLocalBranchFromRemote}
                />
                <div className="ml-auto">
                  <GitActionsPanel
                    currentBranch={current}
                    hasUpstream={hasUpstream}
                    ahead={ahead}
                    behind={behind}
                    operation={ops.operation}
                    busy={ops.isBusy}
                    onRefresh={handleRefresh}
                    onFetch={ops.fetch}
                    onPull={ops.pull}
                    onPush={handlePush}
                    onPushUpstream={ops.pushWithUpstream}
                    onCreateBranch={() => setCreateBranchOpen(true)}
                    onShowHistory={() => setHistoryOpen(true)}
                  />
                </div>
              </div>
              {lastCommitQuery.data?.message ? (
                <p className="mt-2 truncate border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                  <span className="font-mono">{lastCommitQuery.data.hash}</span>{" "}
                  · {lastCommitQuery.data.message}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="flex min-h-0 min-w-0 flex-1 flex-col">
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
              <ChangedFilesPanel
                repositoryPath={repository.path}
                status={statusQuery.data}
                loading={statusQuery.isLoading}
                busy={ops.isBusy}
                operation={ops.operation}
                onStage={ops.stageFiles}
                onStageAll={ops.stageAll}
                onUnstage={ops.unstageFiles}
                onIgnore={ops.ignoreFile}
                onRefresh={handleRefresh}
                onViewDiff={(file, staged, untracked) =>
                  setDiffTarget({ file, staged, untracked })
                }
              />
              <CommitPanel
                repositoryPath={repository.path}
                status={statusQuery.data}
                busy={ops.isBusy}
                operation={ops.operation}
                onCommit={async (msg) => {
                  await ops.commit(msg);
                }}
              />
            </CardContent>
          </Card>
        </div>

        <section
          className="relative flex shrink-0 flex-col border-t border-border/70 bg-background"
          style={
            panelOpen
              ? { height: clampPanelHeight(effectivePanelHeight) }
              : undefined
          }
        >
          {/* Collapsed: only this slim strip remains, to reopen the panel. */}
          {!panelOpen ? (
            <div className="flex h-9 shrink-0 items-center gap-1 px-3">
              <PanelTab
                label="Output"
                icon={<ScrollText className="size-3" />}
                active={false}
                onClick={() => openPanelTab("output")}
              />
              <PanelTab
                label="Run"
                icon={<Play className="size-3" />}
                active={false}
                live={run.runningCount > 0}
                onClick={() => openPanelTab("run")}
              />
              <IconHint label="Expand panel (Ctrl+`)" side="top">
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-auto size-6"
                  onClick={() => setPanelOpen(true)}
                  aria-label="Expand panel"
                >
                  <ChevronUp className="size-3.5" />
                </Button>
              </IconHint>
            </div>
          ) : null}

          {/* VS Code-style push panel: it takes layout height so the main
              area resizes — only the changes *list* shrinks (it scrolls
              internally) while the commit composer stays pinned and always
              reachable. Drag the top edge to rebalance; the clamp guarantees
              the composer can never be pushed out of view. */}
          {panelOpen ? (
            <div
              className="group absolute inset-x-0 -top-1 z-10 h-2.5 cursor-row-resize touch-none"
              onPointerDown={handlePanelResizeStart}
              onDoubleClick={resetPanelHeight}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize panel"
              title="Drag to resize · double-click to reset"
            >
              <div className="absolute inset-x-0 top-1 h-0.5 bg-primary opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-active:opacity-100" />
            </div>
          ) : null}

          <div
            className={cn(
              "flex h-9 shrink-0 items-center gap-1 border-b border-border/60 px-3",
              !panelOpen && "hidden",
            )}
          >
              <PanelTab
                label="Output"
                icon={<ScrollText className="size-3" />}
                active={panelTab === "output"}
                onClick={() => setPanelTab("output")}
              />
              <PanelTab
                label="Run"
                icon={<Play className="size-3" />}
                active={panelTab === "run"}
                live={run.runningCount > 0}
                onClick={() => setPanelTab("run")}
              />
              {panelTab === "output" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-6 gap-1 px-2 text-[11px]"
                  onClick={() => clearEntries(repository.id)}
                  disabled={outputCount === 0}
                >
                  <Trash2 className="size-3" />
                  Clear
                </Button>
              ) : null}
              <IconHint label="Collapse panel (Ctrl+`)" side="top">
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn("size-6", panelTab !== "output" && "ml-auto")}
                  onClick={() => setPanelOpen(false)}
                  aria-label="Collapse panel"
                >
                  <ChevronDown className="size-3.5" />
                </Button>
              </IconHint>
            </div>

          <div
            className={cn(
              "relative min-h-0 flex-1",
              !panelOpen && "hidden",
            )}
          >
            <div
              className={cn(
                "absolute inset-0 flex flex-col px-4 pb-4 pt-3",
                panelTab !== "output" && "pointer-events-none invisible",
              )}
            >
              <CommandOutputPanel repositoryId={repository.id} />
            </div>
            <div
              className={cn(
                "absolute inset-0 flex flex-col px-4 pb-4 pt-3",
                panelTab !== "run" && "pointer-events-none invisible",
              )}
            >
              <RunPanel
                repository={repository}
                onUpdate={onUpdateRepository}
              />
            </div>
          </div>
        </section>
      </div>

      {createBranchOpen ? (
        <Suspense fallback={null}>
          <CreateBranchDialog
            open={createBranchOpen}
            onOpenChange={setCreateBranchOpen}
            baseBranch={current}
            busy={ops.operation === "creatingBranch"}
            onCreate={async (name) => {
              const result = await ops.createLocalBranch(name);
              if (result?.success) setCreateBranchOpen(false);
            }}
          />
        </Suspense>
      ) : null}

      {diffTarget ? (
        <Suspense fallback={null}>
          <DiffDialog
            open={diffTarget !== null}
            onOpenChange={(open) => {
              if (!open) setDiffTarget(null);
            }}
            repositoryPath={repository.path}
            file={diffTarget.file}
            staged={diffTarget.staged}
            untracked={diffTarget.untracked}
          />
        </Suspense>
      ) : null}

      {historyOpen ? (
        <Suspense fallback={null}>
          <CommitHistoryDialog
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            repository={repository}
          />
        </Suspense>
      ) : null}

      <ConfirmDialog
        open={pendingUndo}
        onOpenChange={(open) => {
          if (!open) setPendingUndo(false);
        }}
        title="Undo last commit?"
        description={
          <>
            Runs{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">
              git reset --soft HEAD~1
            </code>
            . The commit is removed but every change in it stays{" "}
            <strong className="text-foreground">staged</strong> — nothing is
            deleted from your working tree.
          </>
        }
        confirmLabel="Undo commit"
        onConfirm={() => {
          void ops.undoLastCommit();
          setPendingUndo(false);
        }}
      />

      <ConfirmDialog
        open={pendingSwitch !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSwitch(null);
        }}
        title="You have uncommitted changes"
        description={
          <>
            Switching to{" "}
            <strong className="text-foreground">{pendingSwitch}</strong> may
            fail or carry your changes across. Commit, stash, or revert first
            if you want a clean swap.
          </>
        }
        confirmLabel="Switch anyway"
        onConfirm={() => {
          if (pendingSwitch) void ops.switchBranch(pendingSwitch);
          setPendingSwitch(null);
        }}
      />
    </main>
  );
}

// Single-responsibility: one tab button in the bottom panel strip. Clicking
// always reveals its panel (expanding the strip if collapsed); `live` shows
// a pulsing dot while any run target is active.
function PanelTab({
  label,
  icon,
  active,
  live = false,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  live?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-6.5 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold uppercase tracking-widest transition-colors duration-150",
        active
          ? "bg-foreground/8 text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
      aria-pressed={active}
    >
      {icon}
      {label}
      {live ? (
        <span className="relative inline-flex size-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-70" />
          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
        </span>
      ) : null}
    </button>
  );
}

// Single-responsibility: fallback UI when a repository's path is invalid
// (moved, deleted, or no longer a Git repo). When the folder exists but
// just lacks a `.git`, offer to initialize one with a single click — that's
// the common path for folders added via the directory scanner.
function RepoUnavailable({
  repository,
  message,
  onRetry,
}: {
  repository: Repository;
  message: string;
  onRetry: () => void;
}) {
  const [initializing, setInitializing] = useState(false);

  const handleInit = async () => {
    setInitializing(true);
    try {
      await gitClient.initRepository(repository.path);
      toast.success("Initialized Git", {
        description: `${repository.name} is ready to commit.`,
      });
      onRetry();
    } catch (err) {
      toast.error("Initialize failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setInitializing(false);
    }
  };

  return (
    <main className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertOctagon className="size-8 text-destructive" />
      <h2 className="text-base font-semibold">Not a Git repository</h2>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{repository.name}</span> ·{" "}
        {repository.path}
      </p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleInit} disabled={initializing}>
          {initializing ? "Initializing…" : "Initialize Git"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          disabled={initializing}
        >
          Try again
        </Button>
      </div>
    </main>
  );
}
