import { memo, useMemo } from "react";
import { Loader2 } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useCommandLogStore } from "@/stores/use-command-log-store";
import type { CommandLogEntry } from "@/lib/types";

interface CommandOutputPanelProps {
  repositoryId: string | null;
}

// Single-responsibility: render the rolling command log for the active repo.
// Entries appear immediately on click as "RUNNING", then transition to
// "OK" or "EXIT <code>" once the underlying Git command resolves. Panel
// chrome (tab strip, Clear action) is owned by the dashboard's bottom panel.
// Subscribes to the log store directly so log churn re-renders only this
// panel, not the component tree above it.
export function CommandOutputPanel({ repositoryId }: CommandOutputPanelProps) {
  const entries = useCommandLogStore((s) => s.entries);
  const filtered = useMemo(
    () =>
      repositoryId ? entries.filter((e) => e.repositoryId === repositoryId) : [],
    [entries, repositoryId],
  );

  return (
    <ScrollArea className="min-h-0 flex-1 rounded-lg border bg-card/50">
      {filtered.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          No commands run yet.
        </p>
      ) : (
        <ul className="divide-y">
          {filtered.map((entry) => (
            <LogRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </ScrollArea>
  );
}

// Single-responsibility: render one log row with its status badge and output.
const LogRow = memo(function LogRow({ entry }: { entry: CommandLogEntry }) {
  const isRunning = entry.status === "running";
  const isError = entry.status === "error";

  return (
    <li
      className={cn(
        "px-3 py-2 text-xs font-mono",
        isRunning && "bg-amber-500/5",
      )}
    >
      <div className="flex items-center justify-between gap-2 font-sans text-[11px]">
        <StatusBadge entry={entry} />
        <span className="text-muted-foreground">
          {new Date(entry.timestamp).toLocaleTimeString()}
        </span>
      </div>

      <p className="mt-1 break-all text-[11px] text-muted-foreground">
        $ git {entry.result?.args.join(" ") || entry.label}
      </p>

      {entry.result?.stdout ? (
        <pre className="mt-1 whitespace-pre-wrap break-all text-[11px]">
          {entry.result.stdout}
        </pre>
      ) : null}
      {entry.result?.stderr ? (
        <pre
          className={cn(
            "mt-1 whitespace-pre-wrap break-all text-[11px]",
            isError ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {entry.result.stderr}
        </pre>
      ) : null}
    </li>
  );
});

function StatusBadge({ entry }: { entry: CommandLogEntry }) {
  if (entry.status === "running") {
    return (
      <span className="flex items-center gap-1.5 font-semibold uppercase text-amber-600 dark:text-amber-400">
        <Loader2 className="size-3 animate-spin" strokeWidth={2.5} />
        Running…
      </span>
    );
  }
  if (entry.status === "success") {
    return (
      <span className="font-semibold uppercase text-emerald-600 dark:text-emerald-400">
        OK
      </span>
    );
  }
  return (
    <span className="font-semibold uppercase text-destructive">
      Exit {entry.result?.exitCode ?? "?"}
    </span>
  );
}
