import { Suspense, lazy, useState } from "react";
import { Download, FolderTree, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuickStatusBatch } from "@/hooks/use-git-operations";
import { cn } from "@/lib/utils";
import type { ProjectGroup, Repository } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconHint } from "./IconHint";
import { Logo } from "./Logo";
import { RepositoryPicker } from "./RepositoryPicker";
import { RepositorySidebarRow } from "./RepositorySidebarRow";
import { SidebarFooter } from "./SidebarFooter";
import { StatusLegend } from "./StatusLegend";
import { ThemeToggle } from "./ThemeToggle";

// Lazy: both dialogs are rarely opened and would otherwise bloat the
// sidebar's chunk (which loads on every launch).
const CloneDialog = lazy(() =>
  import("./CloneDialog").then((m) => ({ default: m.CloneDialog })),
);
const GroupDialog = lazy(() =>
  import("./GroupDialog").then((m) => ({ default: m.GroupDialog })),
);

interface RepositorySidebarProps {
  repositories: Repository[];
  groups: ProjectGroup[];
  selectedRepoId: string | null;
  selectedGroupId: string | null;
  onSelectRepo: (id: string) => void;
  onSelectGroup: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: (repo: Repository) => void;
  hasPath: (path: string) => boolean;
  onCreateGroup: (name: string, repositoryIds: string[]) => void;
  onDeleteGroup: (id: string) => void;
}

// Single-responsibility: render the repository list, theme toggle, and footer.
// Remove actions require explicit confirmation to prevent accidental data loss.
export function RepositorySidebar({
  repositories,
  groups,
  selectedRepoId,
  selectedGroupId,
  onSelectRepo,
  onSelectGroup,
  onRemove,
  onAdd,
  hasPath,
  onCreateGroup,
  onDeleteGroup,
}: RepositorySidebarProps) {
  const [pendingRemoval, setPendingRemoval] = useState<Repository | null>(null);
  const [pendingGroupRemoval, setPendingGroupRemoval] =
    useState<ProjectGroup | null>(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);

  // One IPC fetches quick status for every repo and primes each row's
  // per-repo cache — rows themselves still call `useQuickStatus` and just
  // see instant cache hits.
  useQuickStatusBatch(repositories);

  const confirmRemove = () => {
    if (pendingRemoval) onRemove(pendingRemoval.id);
    setPendingRemoval(null);
  };

  const confirmGroupRemove = () => {
    if (pendingGroupRemoval) onDeleteGroup(pendingGroupRemoval.id);
    setPendingGroupRemoval(null);
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r bg-muted/30">
      <div
        className="flex h-12 items-center gap-2 border-b px-4 text-sm font-semibold"
        data-tauri-drag-region
      >
        <Logo size={18} className="text-foreground" />
        <span className="tracking-tight">Git Switch</span>
        <div className="ml-auto flex items-center gap-1">
          <IconHint label="Clone repository" side="bottom">
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => setCloneOpen(true)}
              aria-label="Clone repository"
            >
              <Download className="size-3.5" />
            </Button>
          </IconHint>
          <ThemeToggle />
        </div>
      </div>

      <div className="p-3">
        <RepositoryPicker hasPath={hasPath} onAdd={onAdd} />
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="px-3 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Groups
            </span>
            <IconHint label="New group" side="right">
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                onClick={() => setGroupDialogOpen(true)}
                disabled={repositories.length === 0}
                aria-label="New group"
              >
                <Plus className="size-3.5" />
              </Button>
            </IconHint>
          </div>

          {groups.length === 0 ? (
            <p className="mb-3 text-[11px] text-muted-foreground">
              Group repos so you can run them together.
            </p>
          ) : (
            <ul className="mb-3 space-y-1">
              {groups.map((g) => {
                const active = g.id === selectedGroupId;
                return (
                  <li key={g.id}>
                    <div
                      className={cn(
                        "group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5",
                        active
                          ? "bg-foreground/10 text-foreground"
                          : "hover:bg-accent",
                      )}
                      onClick={() => onSelectGroup(g.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <FolderTree className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {g.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {g.repositoryIds.length}
                      </span>
                      <IconHint label="Delete group" side="right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6 opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingGroupRemoval(g);
                          }}
                          aria-label={`Delete ${g.name}`}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </IconHint>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <Separator className="mb-2" />
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Repositories
            </span>
            <StatusLegend />
          </div>
        </div>
        {repositories.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            No repositories yet. Click <em>Add repository</em> or drag a folder
            onto the window.
          </p>
        ) : (
          <ul className="space-y-1 p-2">
            {repositories.map((repo) => (
              <li key={repo.id}>
                <RepositorySidebarRow
                  repository={repo}
                  active={repo.id === selectedRepoId}
                  onSelect={onSelectRepo}
                  onRequestRemove={setPendingRemoval}
                />
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      <SidebarFooter />

      {cloneOpen ? (
        <Suspense fallback={null}>
          <CloneDialog
            open={cloneOpen}
            onOpenChange={setCloneOpen}
            onCloned={onAdd}
          />
        </Suspense>
      ) : null}

      {groupDialogOpen ? (
        <Suspense fallback={null}>
          <GroupDialog
            open={groupDialogOpen}
            onOpenChange={setGroupDialogOpen}
            repositories={repositories}
            group={null}
            onSave={onCreateGroup}
          />
        </Suspense>
      ) : null}

      <ConfirmDialog
        open={pendingGroupRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingGroupRemoval(null);
        }}
        title="Delete group?"
        description={
          pendingGroupRemoval ? (
            <>
              This removes the group{" "}
              <strong className="text-foreground">
                {pendingGroupRemoval.name}
              </strong>
              . The repositories inside it stay.
            </>
          ) : null
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmGroupRemove}
      />

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
        title="Remove repository?"
        description={
          pendingRemoval ? (
            <>
              This will remove{" "}
              <strong className="text-foreground">{pendingRemoval.name}</strong>{" "}
              from the list. The folder on disk is not touched.
            </>
          ) : null
        }
        confirmLabel="Remove"
        destructive
        onConfirm={confirmRemove}
      />
    </aside>
  );
}
