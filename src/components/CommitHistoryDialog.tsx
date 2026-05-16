import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Repository } from "@/lib/types";

import { CommitHistoryPanel } from "./CommitHistoryPanel";

interface CommitHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repository: Repository;
}

// Single-responsibility: present `CommitHistoryPanel` inside a modal dialog
// so the dashboard layout doesn't have to dedicate vertical space to it.
// Loads on demand (parent wraps in React.lazy) so the history query never
// fires until the user actually opens this view.
export function CommitHistoryDialog({
  open,
  onOpenChange,
  repository,
}: CommitHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(720px,95vw)] !w-[min(720px,95vw)] !p-0 overflow-hidden">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="flex min-w-0 items-baseline gap-2 text-sm">
            History
            <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">
              {repository.name}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="h-[min(70vh,640px)] min-w-0 overflow-hidden px-4 pb-4 pt-3">
          <CommitHistoryPanel repository={repository} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
