import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Download,
  GitBranchPlus,
  MoreHorizontal,
  RefreshCcw,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GitOperation } from "@/lib/types";

interface GitActionsPanelProps {
  currentBranch: string | null;
  hasUpstream: boolean;
  ahead: number;
  behind: number;
  operation: GitOperation;
  busy: boolean;
  onRefresh: () => void;
  onFetch: () => Promise<unknown>;
  onPull: () => Promise<unknown>;
  onPush: () => Promise<{ success: boolean; stderr: string } | null>;
  onPushUpstream: (branch: string) => Promise<unknown>;
  onCreateBranch: () => void;
}

// Single-responsibility: one *adaptive* primary action that changes label
// based on what the branch actually needs, plus a `⋯` overflow menu that
// exposes every git action. Collapses 6 buttons down to 1 + 1.
//
// Primary action priority:
//   1. No upstream         → Publish branch
//   2. Behind > 0          → Pull
//   3. Ahead > 0           → Push
//   4. Otherwise           → Fetch
export function GitActionsPanel({
  currentBranch,
  hasUpstream,
  ahead,
  behind,
  operation,
  busy,
  onRefresh,
  onFetch,
  onPull,
  onPush,
  onPushUpstream,
  onCreateBranch,
}: GitActionsPanelProps) {
  // Recovery flow: even if `hasUpstream` is true, the remote ref may have
  // been deleted. A push failure with "no upstream" message flips this so
  // the primary button switches to Publish until the user retries.
  const [pushNeedsUpstream, setPushNeedsUpstream] = useState(false);

  const isFetching = operation === "fetching";
  const isPulling = operation === "pulling";
  const isPushing = operation === "pushing";
  const isPublishing = operation === "pushingUpstream";
  const isCreating = operation === "creatingBranch";
  const otherBusy = (op: GitOperation) => busy && operation !== op;

  const handlePush = async () => {
    setPushNeedsUpstream(false);
    const result = await onPush();
    if (
      result &&
      !result.success &&
      /no upstream branch|set-upstream/i.test(result.stderr)
    ) {
      setPushNeedsUpstream(true);
    }
  };

  const handlePublish = async () => {
    if (!currentBranch) return;
    setPushNeedsUpstream(false);
    await onPushUpstream(currentBranch);
  };

  const primary = pickPrimary({
    currentBranch,
    hasUpstream: hasUpstream && !pushNeedsUpstream,
    ahead,
    behind,
  });

  // Tooltip text for the primary button — exposes the actual git command we
  // will run, so power users can verify before clicking.
  const primaryTooltip: Record<Primary["kind"], string> = {
    publish: currentBranch
      ? `git push -u origin ${currentBranch}`
      : "Publish current branch",
    pull: "git pull",
    push: "git push",
    fetch: "git fetch --all --prune",
  };

  // Resolve the primary's click handler + loading state from the picked kind.
  const primaryProps = (() => {
    switch (primary.kind) {
      case "publish":
        return {
          onClick: handlePublish,
          loading: isPublishing,
          loadingText: "Publishing…",
          disabled: otherBusy("pushingUpstream") || !currentBranch,
          icon: <Upload className="h-3.5 w-3.5" />,
        };
      case "pull":
        return {
          onClick: onPull,
          loading: isPulling,
          loadingText: "Pulling…",
          disabled: otherBusy("pulling"),
          icon: <ArrowDownToLine className="h-3.5 w-3.5" />,
        };
      case "push":
        return {
          onClick: handlePush,
          loading: isPushing,
          loadingText: "Pushing…",
          disabled: otherBusy("pushing") || !currentBranch,
          icon: <ArrowUpFromLine className="h-3.5 w-3.5" />,
        };
      case "fetch":
        return {
          onClick: onFetch,
          loading: isFetching,
          loadingText: "Fetching…",
          disabled: otherBusy("fetching"),
          icon: <Download className="h-3.5 w-3.5" />,
        };
    }
  })();

  return (
    <section className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            onClick={primaryProps.onClick}
            loading={primaryProps.loading}
            loadingText={primaryProps.loadingText}
            disabled={primaryProps.disabled}
            className="min-w-[8.5rem]"
          >
            {primaryProps.icon}
            {primary.label}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <span className="font-mono text-[11px]">
            {primaryTooltip[primary.kind]}
          </span>
        </TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                aria-label="More git actions"
                className="px-2"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">More git actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel>Sync</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={onRefresh}
            disabled={busy}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void onFetch()}
            disabled={otherBusy("fetching")}
          >
            <Download className="h-3.5 w-3.5" />
            <span>Fetch</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void onPull()}
            disabled={otherBusy("pulling") || !hasUpstream}
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            <span>Pull</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void handlePush()}
            disabled={otherBusy("pushing") || !currentBranch}
          >
            <ArrowUpFromLine className="h-3.5 w-3.5" />
            <span>Push</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuLabel>Branch</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={onCreateBranch}
            disabled={isCreating}
          >
            <GitBranchPlus className="h-3.5 w-3.5" />
            <span>Create branch</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void handlePublish()}
            disabled={
              otherBusy("pushingUpstream") || !currentBranch || hasUpstream
            }
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Publish branch</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </section>
  );
}

interface PickArgs {
  currentBranch: string | null;
  hasUpstream: boolean;
  ahead: number;
  behind: number;
}

interface Primary {
  kind: "publish" | "pull" | "push" | "fetch";
  label: string;
}

// Single-responsibility: choose the right primary action for the current
// branch state. Keeps the JSX dumb and lets us unit-test this in isolation
// later if we want.
function pickPrimary({
  currentBranch,
  hasUpstream,
  ahead,
  behind,
}: PickArgs): Primary {
  if (currentBranch && !hasUpstream) {
    return { kind: "publish", label: "Publish branch" };
  }
  if (behind > 0) {
    return { kind: "pull", label: `Pull (${behind})` };
  }
  if (ahead > 0) {
    return { kind: "push", label: `Push (${ahead})` };
  }
  return { kind: "fetch", label: "Fetch" };
}
