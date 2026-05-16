import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertOctagon,
  ArrowDown,
  ArrowUp,
  FolderGit2,
  GitBranch as GitBranchIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DashboardErrorBoundary } from "@/components/DashboardErrorBoundary";
import {
  useAheadBehind,
  useBranches,
  useGitOperations,
  useLastCommit,
  useStatus,
} from "@/hooks/use-git-operations";
import { useFileWatcher } from "@/hooks/use-file-watcher";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useWindowFocus } from "@/hooks/use-window-focus";
import { gitClient } from "@/lib/git-client";
import { shortenPath } from "@/lib/format";
import type {
  CommandLogEntry,
  GitCommandResult,
  Repository,
  RunTarget,
} from "@/lib/types";

import { BranchSelector } from "./BranchSelector";
import { ChangedFilesPanel } from "./ChangedFilesPanel";
import { CommandOutputPanel } from "./CommandOutputPanel";
import { CommitPanel } from "./CommitPanel";
import { CreateBranchDialog } from "./CreateBranchDialog";
import { GitActionsPanel } from "./GitActionsPanel";
import { RunPanel } from "./RunPanel";

interface RepositoryDashboardProps {
  repository: Repository;
  logEntries: CommandLogEntry[];
  onLogStart: (label: string) => string;
  onLogComplete: (id: string, result: GitCommandResult) => void;
  onClearLog: () => void;
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
  logEntries,
  onLogStart,
  onLogComplete,
  onClearLog,
  onUpdateRepository,
}: RepositoryDashboardProps) {
  const queryClient = useQueryClient();
  const ops = useGitOperations({ repository, onLogStart, onLogComplete });

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

  // ⌘R refresh, ⌘P pull, ⌘⇧P push.
  const shortcuts = useMemo(
    () => [
      { key: "r", meta: true, run: handleRefresh },
      { key: "p", meta: true, run: () => void ops.pull() },
      { key: "p", meta: true, shift: true, run: () => void ops.push() },
    ],
    [handleRefresh, ops],
  );
  useKeyboardShortcuts(shortcuts);

  // Dirty-tree switch confirmation.
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
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
  const stagedCount = (statusQuery.data?.files ?? []).filter((f) => f.staged)
    .length;
  const current = branchesQuery.data?.current ?? null;
  const ahead = aheadBehindQuery.data?.ahead ?? 0;
  const behind = aheadBehindQuery.data?.behind ?? 0;
  // Drives the "Publish branch" button — true once the current branch has a
  // configured upstream (i.e. has been published at least once).
  const hasUpstream = !!aheadBehindQuery.data?.upstream;

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
        className="flex h-12 items-center gap-3 border-b bg-muted/20 px-6 text-sm"
        data-tauri-drag-region
      >
        <FolderGit2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">{repository.name}</span>
        <span
          className="truncate text-xs text-muted-foreground"
          title={repository.path}
        >
          {shortenPath(repository.path, 72)}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <GitBranchIcon className="h-3 w-3" />
            {current ?? "(detached)"}
          </Badge>
          {ahead > 0 ? (
            <Badge variant="outline" className="gap-1" title={`${ahead} commit(s) ahead of upstream`}>
              <ArrowUp className="h-3 w-3" />
              {ahead}
            </Badge>
          ) : null}
          {behind > 0 ? (
            <Badge variant="outline" className="gap-1" title={`${behind} commit(s) behind upstream`}>
              <ArrowDown className="h-3 w-3" />
              {behind}
            </Badge>
          ) : null}
          {uncommitted > 0 ? (
            <Badge variant="warning">
              {uncommitted} change{uncommitted === 1 ? "" : "s"}
            </Badge>
          ) : (
            <Badge variant="success">clean</Badge>
          )}
        </span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]">
        <div className="flex min-h-0 min-w-0 flex-col gap-4">
          <Card className="shrink-0">
            <CardContent className="space-y-4 pt-4">
              <BranchSelector
                branches={branchesQuery.data}
                loading={branchesQuery.isLoading}
                busy={ops.isBusy}
                operation={ops.operation}
                onSwitch={handleSwitchRequest}
                onCreateFromRemote={ops.createLocalBranchFromRemote}
              />
              <Separator />
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
              />
              {lastCommitQuery.data?.message ? (
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{lastCommitQuery.data.hash}</span>{" "}
                  · {lastCommitQuery.data.message}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-1 flex-col">
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-4">
              <ChangedFilesPanel
                status={statusQuery.data}
                loading={statusQuery.isLoading}
                busy={ops.isBusy}
                operation={ops.operation}
                onStage={ops.stageFiles}
                onStageAll={ops.stageAll}
                onUnstage={ops.unstageFiles}
                onIgnore={ops.ignoreFile}
                onRefresh={handleRefresh}
              />
              <Separator />
              <CommitPanel
                repositoryPath={repository.path}
                status={statusQuery.data}
                busy={ops.isBusy}
                operation={ops.operation}
                onCommit={async (msg) => {
                  await ops.commit(msg);
                }}
              />
              {stagedCount === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Stage at least one file to enable commit.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-h-[600px] min-w-0 flex-col gap-3 xl:min-h-0">
          <div className="min-h-0 flex-1">
            <CommandOutputPanel
              entries={logEntries}
              repositoryId={repository.id}
              onClear={onClearLog}
            />
          </div>
          <div className="min-h-[260px] flex-1 min-h-0">
            <RunPanel
              repository={repository}
              currentBranch={current}
              onUpdate={onUpdateRepository}
            />
          </div>
        </div>
      </div>

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

// Single-responsibility: fallback UI when a repository's path is invalid
// (moved, deleted, or no longer a Git repo).
function RepoUnavailable({
  repository,
  message,
  onRetry,
}: {
  repository: Repository;
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertOctagon className="size-8 text-destructive" />
      <h2 className="text-base font-semibold">Repository unavailable</h2>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{repository.name}</span> ·{" "}
        {repository.path}
      </p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </main>
  );
}
