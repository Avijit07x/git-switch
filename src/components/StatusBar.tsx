import { ArrowDown, ArrowUp, Download, FolderTree, GitBranch, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";

import { useAppVersion } from "@/hooks/use-app-version";
import { useQuickStatus } from "@/hooks/use-git-operations";
import { useUpdater } from "@/hooks/use-updater";
import { cn } from "@/lib/utils";
import type { ProjectGroup, Repository } from "@/lib/types";

interface StatusBarProps {
  repository: Repository | null;
  group: ProjectGroup | null;
}

export function StatusBar({ repository, group }: StatusBarProps) {
  const { data } = useQuickStatus(repository);
  const version = useAppVersion();
  const updater = useUpdater();
  const changes = data?.changes ?? 0;

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-sidebar-border bg-sidebar px-3 text-[11px] text-muted-foreground">
      {repository ? (
        <>
          <span className="max-w-44 truncate font-medium text-foreground/85">
            {repository.name}
          </span>
          <span className="flex items-center gap-1">
            <GitBranch className="size-3" />
            {data?.currentBranch ?? "…"}
          </span>
          {data && data.ahead > 0 ? (
            <span
              className="flex items-center gap-0.5 tabular-nums"
              title={`${data.ahead} commit(s) ahead of upstream`}
            >
              <ArrowUp className="size-3" />
              {data.ahead}
            </span>
          ) : null}
          {data && data.behind > 0 ? (
            <span
              className="flex items-center gap-0.5 tabular-nums"
              title={`${data.behind} commit(s) behind upstream`}
            >
              <ArrowDown className="size-3" />
              {data.behind}
            </span>
          ) : null}
          {data ? (
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  changes > 0 ? "bg-amber-500" : "bg-emerald-500",
                )}
              />
              {changes > 0
                ? `${changes} change${changes === 1 ? "" : "s"}`
                : "clean"}
            </span>
          ) : null}
        </>
      ) : group ? (
        <>
          <span className="flex max-w-44 items-center gap-1.5 truncate font-medium text-foreground/85">
            <FolderTree className="size-3" />
            {group.name}
          </span>
          <span>
            {group.repositoryIds.length} project
            {group.repositoryIds.length === 1 ? "" : "s"}
          </span>
        </>
      ) : (
        <span>No repository selected</span>
      )}

      <span className="ml-auto flex items-center gap-2">
        <UpdateBanner updater={updater} />
        {version ? (
          <span className="font-mono text-[10px] tracking-wide">
            v{version}
          </span>
        ) : null}
      </span>
    </footer>
  );
}

// Single-responsibility: renders the update pill in the status bar.
// States: checking → available → downloading → restarting.
function UpdateBanner({
  updater,
}: {
  updater: ReturnType<typeof useUpdater>;
}) {
  const { status, version, progress, install, checkNow, dismiss } = updater;

  if (status === "idle" || status === "checking") {
    return null;
  }

  if (status === "error") {
    return (
      <button
        type="button"
        onClick={checkNow}
        className="flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Update check failed — click to retry"
      >
        <RefreshCw className="size-2.5" />
        Retry update check
      </button>
    );
  }

  if (status === "restarting") {
    return (
      <span className="flex items-center gap-1.5 rounded-sm bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
        <RotateCcw className="size-2.5 animate-spin" />
        Restarting…
      </span>
    );
  }

  if (status === "downloading" || status === "installing") {
    return (
      <span className="flex items-center gap-1.5 rounded-sm bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
        <Loader2 className="size-2.5 animate-spin" />
        Updating… {progress !== null ? `${progress}%` : ""}
      </span>
    );
  }

  // status === "available"
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        onClick={install}
        className="flex items-center gap-1.5 rounded-sm bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/20"
        title={`Update to v${version}`}
      >
        <Download className="size-2.5" />
        Update to v{version}
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Dismiss"
        aria-label="Dismiss update notification"
      >
        <X className="size-2.5" />
      </button>
    </span>
  );
}
