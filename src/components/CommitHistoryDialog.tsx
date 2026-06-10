import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
// patch (`git show`), with a back affordance to return to the list. Loads
// on demand (parent wraps in React.lazy) so the history query never fires
// until the user actually opens this view.
export function CommitHistoryDialog({
  open,
  onOpenChange,
  repository,
}: CommitHistoryDialogProps) {
  const [selected, setSelected] = useState<CommitInfo | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) setSelected(null);
    onOpenChange(next);
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
                onSelectCommit={setSelected}
              />
            </div>
          )}
        </div>
      </DialogContent>
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
  return <DiffBody diff={data} />;
}
