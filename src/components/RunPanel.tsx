import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  RefreshCw,
  Settings as SettingsIcon,
  Square,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IconHint } from "@/components/IconHint";
import { useProcess } from "@/hooks/use-process";
import { processClient } from "@/lib/process-client";
import { getRunTargets, processIdFor } from "@/lib/run-targets";
import type { ProcessStatus, Repository, RunTarget } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ProcessOutputPanel } from "./ProcessOutputPanel";

// Lazy: the run-config UI is opened on demand and pulls in form/validation
// components that we don't need on every dashboard mount.
const RunConfigDialog = lazy(() =>
  import("./RunConfigDialog").then((m) => ({ default: m.RunConfigDialog })),
);

interface RunPanelProps {
  repository: Repository;
  onUpdate: (
    id: string,
    patch: {
      runTargets?: RunTarget[];
      port?: number | undefined;
    },
  ) => void;
}

interface PortConflict {
  procId: string;
  target: RunTarget;
  port: number;
  pids: number[];
  command: string;
}

// Single-responsibility: per-repo Run / Stop / Restart controls with live
// streaming output across one or more run targets. Each target gets its own
// PTY-backed process id and (when there are 2+) its own terminal tab.
export function RunPanel({ repository, onUpdate }: RunPanelProps) {
  const targets = useMemo(() => getRunTargets(repository), [repository]);
  const [configOpen, setConfigOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(
    () => targets[0]?.id ?? "",
  );
  const [portConflict, setPortConflict] = useState<PortConflict | null>(null);

  // Keep the active tab valid when targets change.
  useEffect(() => {
    if (!targets.some((t) => t.id === activeTab)) {
      setActiveTab(targets[0]?.id ?? "");
    }
  }, [targets, activeTab]);

  return (
    <section className="flex h-full min-h-0 flex-col gap-2">
      {targets.length === 0 ? (
        <EmptyTargets onConfigure={() => setConfigOpen(true)} />
      ) : (
        <>
          {targets.length > 1 ? (
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1 self-stretch overflow-x-auto rounded-lg border bg-card p-1 shadow-2xs">
                {targets.map((t) => (
                  <TargetTab
                    key={t.id}
                    target={t}
                    repoId={repository.id}
                    active={t.id === activeTab}
                    onClick={() => setActiveTab(t.id)}
                  />
                ))}
              </div>
              <BulkBar
                repository={repository}
                targets={targets}
                onPortConflict={setPortConflict}
              />
            </div>
          ) : null}

          <div className="relative min-h-0 flex-1">
            {targets.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "absolute inset-0 flex overflow-hidden",
                  t.id === activeTab ? "" : "pointer-events-none invisible",
                )}
              >
                <TargetPanel
                  repository={repository}
                  target={t}
                  onPortConflict={setPortConflict}
                  onConfigure={() => setConfigOpen(true)}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {configOpen ? (
        <Suspense fallback={null}>
          <RunConfigDialog
            open={configOpen}
            onOpenChange={setConfigOpen}
            repository={repository}
            onSave={(patch) => onUpdate(repository.id, patch)}
          />
        </Suspense>
      ) : null}

      <ConfirmDialog
        open={portConflict !== null}
        onOpenChange={(open) => {
          if (!open) setPortConflict(null);
        }}
        title={`Port ${portConflict?.port} is in use`}
        description={
          portConflict ? (
            <>
              PID{portConflict.pids.length === 1 ? "" : "s"}{" "}
              <strong className="text-foreground">
                {portConflict.pids.join(", ")}
              </strong>{" "}
              {portConflict.pids.length === 1 ? "is" : "are"} listening on port{" "}
              <strong className="text-foreground">{portConflict.port}</strong>.
              Kill and start <strong>{portConflict.target.name}</strong>?
            </>
          ) : null
        }
        confirmLabel="Kill and run"
        destructive
        onConfirm={() => {
          if (!portConflict) return;
          void processClient.start(
            portConflict.procId,
            portConflict.command,
            repository.path,
            portConflict.port,
          );
          setPortConflict(null);
        }}
      />
    </section>
  );
}

// ─── Bulk bar (Run all / Stop all / Restart all) ───────────────────────────

function BulkBar({
  repository,
  targets,
  onPortConflict,
}: {
  repository: Repository;
  targets: RunTarget[];
  onPortConflict: (c: PortConflict) => void;
}) {
  const launchAll = async () => {
    for (const target of targets) {
      await launchTarget(repository, target, onPortConflict);
    }
  };

  const stopAll = async () => {
    for (const target of targets) {
      try {
        await processClient.stop(processIdFor(repository.id, target.id));
      } catch {
        /* ignore */
      }
    }
  };

  const restartAll = async () => {
    for (const target of targets) {
      const cmd = target.restartCommand?.trim() || target.command?.trim() || "";
      if (!cmd) continue;
      const port = target.port ?? repository.port;
      try {
        await processClient.start(
          processIdFor(repository.id, target.id),
          cmd,
          repository.path,
          port,
        );
      } catch (err) {
        toast.error(`${target.name} failed to restart`, {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  return (
    <div className="flex w-44 shrink-0 items-center gap-1.5 rounded-lg border bg-card p-1 shadow-2xs">
      <Button
        size="sm"
        className="h-7 flex-1"
        onClick={() => void launchAll()}
      >
        <Play className="size-3" /> Run all
      </Button>
      <IconHint label="Stop all" side="bottom">
        <Button
          size="icon"
          variant="outline"
          className="size-7"
          onClick={() => void stopAll()}
          aria-label="Stop all"
        >
          <Square className="size-3" />
        </Button>
      </IconHint>
      <IconHint label="Restart all" side="bottom">
        <Button
          size="icon"
          variant="outline"
          className="size-7"
          onClick={() => void restartAll()}
          aria-label="Restart all"
        >
          <RefreshCw className="size-3" />
        </Button>
      </IconHint>
    </div>
  );
}

// ─── Tab pill (one per target) — uses its own useProcess for the status dot ─

function TargetTab({
  target,
  repoId,
  active,
  onClick,
}: {
  target: RunTarget;
  repoId: string;
  active: boolean;
  onClick: () => void;
}) {
  const proc = useProcess(processIdFor(repoId, target.id));
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      <StatusDot status={proc.status} small />
      {target.name}
    </button>
  );
}

// ─── Single target panel: per-target buttons + terminal ────────────────────

function TargetPanel({
  repository,
  target,
  onPortConflict,
  onConfigure,
}: {
  repository: Repository;
  target: RunTarget;
  onPortConflict: (c: PortConflict) => void;
  onConfigure: () => void;
}) {
  const procId = processIdFor(repository.id, target.id);
  const proc = useProcess(procId);
  const isRunning = proc.status === "running";
  const isError = proc.status === "errored";

  const handleRun = () => void launchTarget(repository, target, onPortConflict);
  const handleRestart = async () => {
    const cmd = target.restartCommand?.trim() || target.command?.trim() || "";
    if (!cmd) return;
    await proc.start(cmd, repository.path, target.port ?? repository.port);
  };

  // Track previous branch so auto-restart on branch switch works per target.
  const prevBranch = useRef<string | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ repositoryId: string }>).detail;
      if (detail.repositoryId !== repository.id) return;
      if (proc.status !== "running") return;
      const cmd = target.restartCommand?.trim() || target.command?.trim() || "";
      if (!cmd) return;
      toast.info(`Branch changed — restarting ${target.name}`);
      void proc.start(cmd, repository.path, target.port ?? repository.port);
    };
    window.addEventListener("git-switch:branch-switched", handler);
    return () =>
      window.removeEventListener("git-switch:branch-switched", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    repository.id,
    repository.path,
    repository.port,
    target.id,
    target.command,
    target.restartCommand,
    target.port,
  ]);

  useEffect(() => {
    prevBranch.current = prevBranch.current ?? null;
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-2">
      <div className="min-h-0 min-w-0 flex-1">
        <ProcessOutputPanel
          processId={procId}
          status={proc.status}
          exitCode={proc.exitCode}
          registerSink={proc.setSink}
          onInput={(data) => void proc.write(data)}
          onResize={(cols, rows) => void proc.resize(cols, rows)}
        />
      </div>

      <aside className="flex max-h-full w-44 shrink-0 flex-col gap-2 overflow-y-auto rounded-lg border bg-card p-2 shadow-2xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Button
          size="sm"
          className="h-8 w-full shrink-0"
          onClick={handleRun}
          disabled={isRunning}
          variant={isError ? "outline" : "default"}
        >
          <Play className="size-3.5" /> Run
        </Button>

        <div className="flex shrink-0 items-center gap-1.5">
          <IconHint label="Stop" side="top">
            <Button
              size="icon"
              variant="outline"
              className="h-7 flex-1"
              onClick={() => void proc.stop()}
              disabled={!isRunning}
              aria-label="Stop"
            >
              <Square className="size-3" />
            </Button>
          </IconHint>
          <IconHint label="Restart" side="top">
            <Button
              size="icon"
              variant="outline"
              className="h-7 flex-1"
              onClick={() => void handleRestart()}
              disabled={!isRunning}
              aria-label="Restart"
            >
              <RefreshCw className="size-3" />
            </Button>
          </IconHint>
          <IconHint label="Run configuration" side="top">
            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0"
              onClick={onConfigure}
              aria-label="Run configuration"
            >
              <SettingsIcon className="size-3.5" />
            </Button>
          </IconHint>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <StatusDot status={proc.status} />
          <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {proc.status === "running"
              ? "running"
              : proc.status === "errored"
                ? "stopped · error"
                : "idle"}
          </span>
        </div>

        <code
          className="block shrink-0 truncate rounded-md bg-muted px-1.5 py-1 text-[11px]"
          title={target.command}
        >
          {target.command || "no command"}
        </code>
        {(target.port ?? repository.port) ? (
          <Badge variant="outline" className="shrink-0 self-start text-[10px]">
            :{target.port ?? repository.port}
          </Badge>
        ) : null}
      </aside>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function launchTarget(
  repository: Repository,
  target: RunTarget,
  onPortConflict: (c: PortConflict) => void,
): Promise<void> {
  const cmd = target.command?.trim() ?? "";
  if (!cmd) {
    toast.error(`${target.name} has no run command`);
    return;
  }
  const port =
    target.port ??
    repository.port ??
    (await processClient.detectPort(repository.path)) ??
    undefined;
  const procId = processIdFor(repository.id, target.id);

  if (port) {
    const pids = await processClient.checkPort(port);
    if (pids.length > 0) {
      onPortConflict({ procId, target, port, pids, command: cmd });
      return;
    }
  }
  try {
    await processClient.start(procId, cmd, repository.path, port);
  } catch (err) {
    toast.error(`${target.name} failed to start`, {
      description: err instanceof Error ? err.message : String(err),
    });
  }
}

function StatusDot({
  status,
  small,
}: {
  status: ProcessStatus;
  small?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "shrink-0 rounded-full transition-colors",
        small ? "size-1.5" : "size-2",
        status === "running" && "animate-pulse bg-emerald-500",
        status === "errored" && "bg-destructive",
        status !== "running" &&
          status !== "errored" &&
          "bg-muted-foreground/30",
      )}
    />
  );
}

function EmptyTargets({ onConfigure }: { onConfigure: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      <p>No run target configured.</p>
      <Button size="sm" variant="outline" onClick={onConfigure} className="shrink-0">
        <SettingsIcon className="size-3.5" /> Configure
      </Button>
    </div>
  );
}
