import { Suspense, lazy, useState } from "react";
import { Download, FolderSearch, FolderTree, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuickStatusBatch } from "@/hooks/use-git-operations";
import { cn } from "@/lib/utils";
import type { ProjectGroup, Repository } from "@/lib/types";
import type { SidebarView } from "./ActivityBar";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconHint } from "./IconHint";
import { RepositoryPicker } from "./RepositoryPicker";
import { RepositorySidebarRow } from "./RepositorySidebarRow";
import { SidebarFooter } from "./SidebarFooter";
import { StatusLegend } from "./StatusLegend";

// Lazy: rarely opened, would otherwise bloat the sidebar's launch chunk.
const CloneDialog = lazy(() =>
  import("./CloneDialog").then((m) => ({ default: m.CloneDialog })),
);
const GroupDialog = lazy(() =>
  import("./GroupDialog").then((m) => ({ default: m.GroupDialog })),
);
const ScanFolderDialog = lazy(() =>
  import("./ScanFolderDialog").then((m) => ({ default: m.ScanFolderDialog })),
);

interface RepositorySidebarProps {
  view: SidebarView;
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

// Single-responsibility: render the active sidebar view (repositories or
// groups) selected via the activity bar. Remove actions require explicit
// confirmation to prevent accidental data loss.
export function RepositorySidebar({
  view,
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
  const [scanOpen, setScanOpen] = useState(false);

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
    <aside className="flex w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div
        className="flex h-12 shrink-0 items-center gap-2 px-4"
        data-tauri-drag-region
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
          {view === "repos" ? "Repositories" : "Groups"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {view === "repos" ? (
            <>
              <StatusLegend />
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
            </>
          ) : (
            <IconHint label="New group" side="bottom">
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={() => setGroupDialogOpen(true)}
                disabled={repositories.length === 0}
                aria-label="New group"
              >
                <Plus className="size-3.5" />
              </Button>
            </IconHint>
          )}
        </div>
      </div>

      {view === "repos" ? (
        <>
          <div className="space-y-1.5 px-3 pb-3 pt-1">
            <RepositoryPicker hasPath={hasPath} onAdd={onAdd} />
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start text-xs"
              onClick={() => setScanOpen(true)}
            >
              <FolderSearch className="h-3.5 w-3.5" />
              Scan a folder for repos
            </Button>
          </div>

          <Separator className="bg-sidebar-border" />

          <ScrollArea className="flex-1">
            {repositories.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                No repositories yet. Click <em>Add repository</em> or drag a
                folder onto the window.
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
        </>
      ) : (
        <ScrollArea className="flex-1">
          {groups.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              No groups yet. Group repos so you can run them together.
            </p>
          ) : (
            <ul className="space-y-1 p-2">
              {groups.map((g) => {
                const active = g.id === selectedGroupId;
                return (
                  <li key={g.id}>
                    <div
                      className={cn(
                        "group relative flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition-colors duration-150",
                        active
                          ? "surface-sheen bg-card text-foreground shadow-sm ring-1 ring-border/70"
                          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                      )}
                      onClick={() => onSelectGroup(g.id)}
                      role="button"
                      tabIndex={0}
                    >
                      {active ? (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1/2 h-5 w-0.75 -translate-y-1/2 rounded-r-full bg-primary"
                        />
                      ) : null}
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
        </ScrollArea>
      )}

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

      {scanOpen ? (
        <Suspense fallback={null}>
          <ScanFolderDialog
            open={scanOpen}
            onOpenChange={setScanOpen}
            hasPath={hasPath}
            onAdd={onAdd}
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
