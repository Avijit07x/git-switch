import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  FolderGit2,
  Pencil,
  Play,
  RefreshCw,
  Square,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { IconHint } from "@/components/IconHint";
import { useProcess } from "@/hooks/use-process";
import { processClient } from "@/lib/process-client";
import { getRunTargets, processIdFor } from "@/lib/run-targets";
import type {
  ProcessStatus,
  ProjectGroup,
  Repository,
  RunTarget,
} from "@/lib/types";
import { cn } from "@/lib/utils";

import { GroupDialog } from "./GroupDialog";

interface GroupDashboardProps {
  group: ProjectGroup;
  repositories: Repository[];
  allRepositories: Repository[];
  onEdit: (groupId: string, name: string, repositoryIds: string[]) => void;
  onOpenRepo: (repositoryId: string) => void;
}

// Aggregates the per-target statuses of a single repo into one bucket so the
// row dot + bulk buttons reflect the whole repo, not just its first target.
function aggregateStatus(perTarget: ProcessStatus[]): ProcessStatus {
  if (perTarget.some((s) => s === "running")) return "running";
  if (perTarget.some((s) => s === "errored")) return "errored";
  return "idle";
}

export function GroupDashboard({
  group,
  repositories,
  allRepositories,
  onEdit,
  onOpenRepo,
}: GroupDashboardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(repositories.map((r) => r.id)),
  );
  const [statuses, setStatuses] = useState<Map<string, ProcessStatus>>(
    () => new Map(),
  );

  const handleStatusChange = useCallback(
    (repoId: string, status: ProcessStatus) => {
      setStatuses((prev) => {
        if (prev.get(repoId) === status) return prev;
        const next = new Map(prev);
        next.set(repoId, status);
        return next;
      });
    },
    [],
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col">
      <header
        className="flex h-12 items-center gap-3 border-b bg-muted/20 px-6 text-sm"
        data-tauri-drag-region
      >
        <FolderGit2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">{group.name}</span>
        <Badge variant="outline">
          {repositories.length} project{repositories.length === 1 ? "" : "s"}
        </Badge>
        <IconHint label="Edit group" side="bottom">
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto size-7"
            onClick={() => setEditOpen(true)}
            aria-label="Edit group"
          >
            <Pencil className="size-3.5" />
          </Button>
        </IconHint>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <GroupBulkActions
          repositories={repositories}
          selected={selected}
          statuses={statuses}
        />

        <Card>
          <CardContent className="space-y-1 p-2">
            {repositories.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                This group has no projects yet. Click the pencil icon to add
                some.
              </p>
            ) : (
              repositories.map((repo) => (
                <MemberRow
                  key={repo.id}
                  repository={repo}
                  checked={selected.has(repo.id)}
                  onCheckChange={() => toggle(repo.id)}
                  onOpenRepo={() => onOpenRepo(repo.id)}
                  onStatusChange={handleStatusChange}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <GroupDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        repositories={allRepositories}
        group={group}
        onSave={(name, ids) => onEdit(group.id, name, ids)}
      />
    </main>
  );
}

// ─── Bulk actions ─────────────────────────────────────────────────────────

function GroupBulkActions({
  repositories,
  selected,
  statuses,
}: {
  repositories: Repository[];
  selected: Set<string>;
  statuses: Map<string, ProcessStatus>;
}) {
  const targets = useMemo(
    () => repositories.filter((r) => selected.has(r.id)),
    [repositories, selected],
  );

  const agg = useMemo(() => {
    let running = 0;
    let errored = 0;
    for (const repo of targets) {
      const s = statuses.get(repo.id) ?? "idle";
      if (s === "running") running++;
      else if (s === "errored") errored++;
    }
    return {
      running,
      errored,
      total: targets.length,
      allRunning: targets.length > 0 && running === targets.length,
      anyStoppable: running > 0,
      anyRestartable: running > 0,
    };
  }, [targets, statuses]);

  const noTargets = targets.length === 0;

  // Fan out across each repo's run targets — this is the bit that was missing.
  const forEachTarget = async (
    visit: (repo: Repository, target: RunTarget) => Promise<void>,
  ) => {
    for (const repo of targets) {
      for (const target of getRunTargets(repo)) {
        await visit(repo, target);
      }
    }
  };

  const launchAll = async () => {
    if (noTargets) {
      toast.info("Select at least one project to run.");
      return;
    }
    await forEachTarget(async (repo, target) => {
      const cmd = target.command?.trim();
      if (!cmd) {
        toast.error(`${repo.name} · ${target.name}: no command`, {
          description: "Open the repo to configure it.",
        });
        return;
      }
      try {
        await processClient.start(
          processIdFor(repo.id, target.id),
          cmd,
          repo.path,
          target.port ?? repo.port,
        );
      } catch (err) {
        toast.error(`${repo.name} · ${target.name} failed`, {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    });
  };

  const stopAll = async () => {
    await forEachTarget(async (repo, target) => {
      try {
        await processClient.stop(processIdFor(repo.id, target.id));
      } catch {
        /* ignore */
      }
    });
  };

  const restartAll = async () => {
    if (noTargets) return;
    await forEachTarget(async (repo, target) => {
      const cmd =
        target.restartCommand?.trim() || target.command?.trim() || "";
      if (!cmd) return;
      try {
        await processClient.start(
          processIdFor(repo.id, target.id),
          cmd,
          repo.path,
          target.port ?? repo.port,
        );
      } catch (err) {
        toast.error(`${repo.name} · ${target.name} failed to restart`, {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    });
  };

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-2 p-3">
        <Button
          size="sm"
          variant="outline"
          className={cn(
            "border-transparent",
            !agg.allRunning &&
              "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300",
          )}
          onClick={() => void launchAll()}
          disabled={noTargets || agg.allRunning}
        >
          <Play className="size-3.5" />
          Run selected
        </Button>

        <Button
          size="sm"
          variant="outline"
          className={cn(
            "border-transparent",
            agg.anyStoppable &&
              "bg-destructive/15 text-destructive hover:bg-destructive/25",
          )}
          onClick={() => void stopAll()}
          disabled={noTargets || !agg.anyStoppable}
        >
          <Square className="size-3.5" />
          Stop selected
        </Button>

        <Button
          size="sm"
          variant="outline"
          className={cn(
            "border-transparent",
            agg.anyRestartable &&
              "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300",
          )}
          onClick={() => void restartAll()}
          disabled={noTargets || !agg.anyRestartable}
        >
          <RefreshCw className="size-3.5" />
          Restart selected
        </Button>

        <span className="ml-2 text-[11px] text-muted-foreground">
          {targets.length} of {repositories.length} selected
          {agg.running > 0 ? ` · ${agg.running} running` : ""}
          {agg.errored > 0 ? ` · ${agg.errored} errored` : ""}
        </span>
      </CardContent>
    </Card>
  );
}

// ─── One row per repo (aggregates all its run targets) ────────────────────

function MemberRow({
  repository,
  checked,
  onCheckChange,
  onOpenRepo,
  onStatusChange,
}: {
  repository: Repository;
  checked: boolean;
  onCheckChange: () => void;
  onOpenRepo: () => void;
  onStatusChange: (repoId: string, status: ProcessStatus) => void;
}) {
  const runTargets = useMemo(() => getRunTargets(repository), [repository]);
  const [perTarget, setPerTarget] = useState<Map<string, ProcessStatus>>(
    () => new Map(),
  );

  const aggregate = useMemo(
    () => aggregateStatus(runTargets.map((t) => perTarget.get(t.id) ?? "idle")),
    [runTargets, perTarget],
  );

  // Bubble the aggregate up so the parent's bulk buttons stay accurate.
  useEffect(() => {
    onStatusChange(repository.id, aggregate);
  }, [repository.id, aggregate, onStatusChange]);

  const handleTargetStatus = useCallback(
    (targetId: string, status: ProcessStatus) => {
      setPerTarget((prev) => {
        if (prev.get(targetId) === status) return prev;
        const next = new Map(prev);
        next.set(targetId, status);
        return next;
      });
    },
    [],
  );

  const isRunning = aggregate === "running";
  const isError = aggregate === "errored";
  const noCommand = runTargets.length === 0;

  const handleRun = async () => {
    if (noCommand) {
      toast.error(`${repository.name} has no run target`);
      return;
    }
    for (const target of runTargets) {
      const cmd = target.command?.trim();
      if (!cmd) continue;
      try {
        await processClient.start(
          processIdFor(repository.id, target.id),
          cmd,
          repository.path,
          target.port ?? repository.port,
        );
      } catch (err) {
        toast.error(`${repository.name} · ${target.name} failed`, {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  const handleStop = async () => {
    for (const target of runTargets) {
      try {
        await processClient.stop(processIdFor(repository.id, target.id));
      } catch {
        /* ignore */
      }
    }
  };

  const handleRestart = async () => {
    for (const target of runTargets) {
      const cmd =
        target.restartCommand?.trim() || target.command?.trim() || "";
      if (!cmd) continue;
      try {
        await processClient.start(
          processIdFor(repository.id, target.id),
          cmd,
          repository.path,
          target.port ?? repository.port,
        );
      } catch (err) {
        toast.error(`${repository.name} · ${target.name} failed`, {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  return (
    <div
      className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/40"
      onClick={onCheckChange}
      role="button"
      tabIndex={0}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onCheckChange}
        onClick={(e) => e.stopPropagation()}
      />

      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          isRunning && "animate-pulse bg-emerald-500",
          isError && "bg-destructive",
          !isRunning && !isError && "bg-muted-foreground/30",
        )}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <button
          className="block w-full truncate text-left text-sm font-medium hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onOpenRepo();
          }}
        >
          {repository.name}
        </button>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {noCommand ? (
            <span className="inline-flex items-center gap-1 text-destructive">
              <AlertTriangle className="size-3" />
              No run target — open the repo to configure
            </span>
          ) : (
            runTargets.map((t) => (
              <code
                key={t.id}
                className="truncate rounded bg-muted px-1.5 py-0.5"
                title={t.command}
              >
                {t.name}: {t.command}
              </code>
            ))
          )}
        </div>
      </div>

      {/* Invisible watchers — each subscribes to its target's process events
          and reports status up. Mounting them here keeps useProcess() inside
          a component (no hooks-in-loop violation). */}
      {runTargets.map((t) => (
        <TargetStatusWatcher
          key={t.id}
          repoId={repository.id}
          target={t}
          onStatusChange={handleTargetStatus}
        />
      ))}

      <div
        className="flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <IconHint label="Run" side="top">
          <Button
            size="icon"
            variant="outline"
            className={cn(
              "size-7 border-transparent",
              !isRunning &&
                "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300",
            )}
            onClick={() => void handleRun()}
            disabled={isRunning || noCommand}
            aria-label="Run"
          >
            <Play className="size-3.5" />
          </Button>
        </IconHint>

        <IconHint label="Stop" side="top">
          <Button
            size="icon"
            variant="outline"
            className={cn(
              "size-7 border-transparent",
              isRunning &&
                "bg-destructive/15 text-destructive hover:bg-destructive/25",
            )}
            onClick={() => void handleStop()}
            disabled={!isRunning}
            aria-label="Stop"
          >
            <Square className="size-3.5" />
          </Button>
        </IconHint>

        <IconHint label="Restart" side="top">
          <Button
            size="icon"
            variant="outline"
            className={cn(
              "size-7 border-transparent",
              isRunning &&
                "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300",
            )}
            onClick={() => void handleRestart()}
            disabled={!isRunning || noCommand}
            aria-label="Restart"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </IconHint>
      </div>
    </div>
  );
}

// Tiny render-nothing component whose only job is to host one useProcess
// instance and forward status changes up. Keeps hooks-per-render stable.
// Memo'd because the parent re-renders on every status tick.
const TargetStatusWatcher = memo(function TargetStatusWatcher({
  repoId,
  target,
  onStatusChange,
}: {
  repoId: string;
  target: RunTarget;
  onStatusChange: (targetId: string, status: ProcessStatus) => void;
}) {
  const proc = useProcess(processIdFor(repoId, target.id));
  useEffect(() => {
    onStatusChange(target.id, proc.status);
  }, [target.id, proc.status, onStatusChange]);
  return null;
});
