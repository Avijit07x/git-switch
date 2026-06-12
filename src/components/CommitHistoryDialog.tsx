import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, GitBranch } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { gitClient } from "@/lib/git-client";
import { cn } from "@/lib/utils";
import type { CommitInfo, Repository } from "@/lib/types";

import { CommitHistoryPanel } from "./CommitHistoryPanel";
import { DiffBody, DiffViewToggle } from "./DiffDialog";

interface CommitHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repository: Repository;
}

// Single-responsibility: present the commit history inside a modal dialog,
// with drill-down — clicking a commit swaps the list for that commit's full
// patch (`git show`), with a back affordance to return to the list. A branch
// picker lets the user browse any local branch's history and cherry-pick a
// commit onto the checked-out branch (the AI-era "salvage commits from a
// sibling branch" workflow). Loads on demand (parent wraps in React.lazy) so
// the history query never fires until the user actually opens this view.
export function CommitHistoryDialog({
  open,
  onOpenChange,
  repository,
}: CommitHistoryDialogProps) {
  const [selected, setSelected] = useState<CommitInfo | null>(null);
  const [browseBranch, setBrowseBranch] = useState<string | null>(null);
  const [pickTarget, setPickTarget] = useState<CommitInfo | null>(null);
  const [picking, setPicking] = useState(false);
  const queryClient = useQueryClient();

  const branchesQuery = useQuery({
    queryKey: ["branches", repository.id],
    queryFn: () => gitClient.getBranches(repository.path),
    enabled: open,
    staleTime: 10_000,
  });
  const currentBranch = branchesQuery.data?.current ?? null;
  const localBranches = useMemo(
    () => branchesQuery.data?.local ?? [],
    [branchesQuery.data],
  );

  const effectiveBranch = browseBranch ?? currentBranch ?? undefined;
  const browsingOther =
    !!effectiveBranch && !!currentBranch && effectiveBranch !== currentBranch;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelected(null);
      setBrowseBranch(null);
      setPickTarget(null);
    }
    onOpenChange(next);
  };

  const handleCherryPick = async () => {
    if (!pickTarget) return;
    setPicking(true);
    try {
      const res = await gitClient.cherryPickCommit(
        repository.path,
        pickTarget.hash,
      );
      if (res.success) {
        toast.success(`Cherry-picked ${pickTarget.short}`, {
          description: `${pickTarget.subject} → ${currentBranch}`,
        });
      } else {
        toast.error("Cherry-pick failed — no changes were applied", {
          description: res.stderr.trim() || res.stdout.trim() || undefined,
        });
      }
    } catch (err) {
      toast.error("Cherry-pick failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setPicking(false);
      setPickTarget(null);
      void queryClient.invalidateQueries({
        queryKey: ["commitHistory", repository.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["status", repository.id] });
      void queryClient.invalidateQueries({
        queryKey: ["lastCommit", repository.id],
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "overflow-hidden p-0!",
          selected
            ? "max-w-[min(1100px,95vw)]! w-[min(1100px,95vw)]!"
            : "max-w-[min(720px,95vw)]! w-[min(720px,95vw)]!",
        )}
      >
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-sm">
            {selected ? (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="-ml-1 size-6 shrink-0"
                  onClick={() => setSelected(null)}
                  aria-label="Back to history"
                >
                  <ArrowLeft className="size-3.5" />
                </Button>
                <span className="min-w-0 truncate" title={selected.subject}>
                  {selected.subject || "(no subject)"}
                </span>
                <span className="shrink-0 font-mono text-xs font-normal text-muted-foreground">
                  {selected.short}
                </span>
                <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">
                  · {selected.author}
                </span>
                <DiffViewToggle className="ml-auto mr-6" />
              </>
            ) : (
              <>
                History
                <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">
                  {repository.name}
                </span>
                {localBranches.length > 0 ? (
                  <Select
                    value={effectiveBranch ?? ""}
                    onValueChange={(v) => setBrowseBranch(v)}
                  >
                    <SelectTrigger
                      className="ml-auto mr-6 h-7 w-auto max-w-56 gap-1.5 text-xs"
                      aria-label="Branch to browse"
                    >
                      <GitBranch className="size-3 shrink-0 text-muted-foreground" />
                      <SelectValue placeholder="Branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {localBranches.map((b) => (
                        <SelectItem key={b.name} value={b.name}>
                          <span className="font-mono text-xs">{b.name}</span>
                          {b.name === currentBranch ? (
                            <span className="ml-1.5 text-[10px] text-muted-foreground">
                              current
                            </span>
                          ) : null}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="h-[min(70vh,640px)] min-w-0 overflow-hidden">
          {selected ? (
            <CommitDiff repository={repository} commit={selected} />
          ) : (
            <div className="h-full px-4 pb-4 pt-3">
              <CommitHistoryPanel
                repository={repository}
                branch={effectiveBranch}
                onSelectCommit={setSelected}
                cherryPick={
                  browsingOther && currentBranch
                    ? {
                        targetBranch: currentBranch,
                        onPick: setPickTarget,
                      }
                    : undefined
                }
              />
            </div>
          )}
        </div>
      </DialogContent>

      <ConfirmDialog
        open={pickTarget !== null}
        onOpenChange={(o) => {
          if (!o) setPickTarget(null);
        }}
        title={`Cherry-pick onto ${currentBranch}?`}
        description={
          pickTarget ? (
            <>
              Apply{" "}
              <span className="font-mono text-foreground">
                {pickTarget.short}
              </span>{" "}
              <strong className="text-foreground">{pickTarget.subject}</strong>{" "}
              from <span className="font-mono">{effectiveBranch}</span> as a new
              commit on{" "}
              <span className="font-mono text-foreground">{currentBranch}</span>
              . If it conflicts, nothing is applied.
            </>
          ) : null
        }
        confirmLabel={picking ? "Cherry-picking…" : "Cherry-pick"}
        onConfirm={() => void handleCherryPick()}
      />
    </Dialog>
  );
}

// Single-responsibility: fetch and render one commit's full patch with the
// shared unified-diff renderer (it handles multi-file patches).
function CommitDiff({
  repository,
  commit,
}: {
  repository: Repository;
  commit: CommitInfo;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["commitDiff", repository.path, commit.hash],
    queryFn: () => gitClient.getCommitDiff(repository.path, commit.hash),
    staleTime: Infinity,
  });

  if (error) {
    return <p className="p-4 text-xs text-destructive">{error.message}</p>;
  }
  if (isLoading) {
    return <p className="p-4 text-xs text-muted-foreground">Loading diff…</p>;
  }
  if (!data || data.trim().length === 0) {
    return (
      <p className="p-4 text-xs text-muted-foreground">
        No textual changes in this commit (merge or empty commit).
      </p>
    );
  }
  return (
    <DiffBody
      diff={data}
      copy={{
        repoPath: repository.path,
        beforeRevision: `${commit.hash}^`,
      }}
    />
  );
}
