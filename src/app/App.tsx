import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useTransition,
} from "react";
import { toast } from "sonner";

import { RepositorySidebar } from "@/components/RepositorySidebar";
import { Toaster } from "@/components/ui/sonner";
import { useBackgroundFetch } from "@/hooks/use-background-fetch";
import { useFileDrop } from "@/hooks/use-file-drop";
import { gitClient } from "@/lib/git-client";
import { repositoryFromPath } from "@/lib/repository-from-path";
import { checkGit } from "@/lib/system";
import type { GitCommandResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useMarkAppReady } from "@/hooks/use-mark-app-ready";
import { useCommandLogStore } from "@/stores/use-command-log-store";
import { useGroupStore } from "@/stores/use-group-store";
import { useRepoStore } from "@/stores/use-repo-store";

// Module-level dynamic imports — assigning them to variables guarantees we
// only ever fetch each chunk once. The promises resolve to the modules,
// which React.lazy reads, and our preload effect awaits the same promise to
// warm the cache before the user clicks anything.
const repoDashboardModule = () => import("@/components/RepositoryDashboard");
const groupDashboardModule = () => import("@/components/GroupDashboard");

const RepositoryDashboard = lazy(() =>
  repoDashboardModule().then((m) => ({ default: m.RepositoryDashboard })),
);
const GroupDashboard = lazy(() =>
  groupDashboardModule().then((m) => ({ default: m.GroupDashboard })),
);

// Single-responsibility: top-level layout. All persistent state (repos,
// groups, selection, command log) lives in zustand stores. App.tsx is just
// the wiring + the few transient effects that don't belong in a store.
export default function App() {
  // ── Stores (subscribed via stable selectors) ──────────────────────
  const repositories = useRepoStore((s) => s.repositories);
  const selectedRepoId = useRepoStore((s) => s.selectedRepoId);
  const selectedGroupId = useRepoStore((s) => s.selectedGroupId);
  const addRepository = useRepoStore((s) => s.addRepository);
  const removeRepository = useRepoStore((s) => s.removeRepository);
  const updateRepository = useRepoStore((s) => s.updateRepository);
  const hasPath = useRepoStore((s) => s.hasPath);
  const selectRepo = useRepoStore((s) => s.selectRepo);
  const selectGroup = useRepoStore((s) => s.selectGroup);

  const groups = useGroupStore((s) => s.groups);
  const createGroup = useGroupStore((s) => s.createGroup);
  const updateGroup = useGroupStore((s) => s.updateGroup);
  const removeGroup = useGroupStore((s) => s.removeGroup);

  const entries = useCommandLogStore((s) => s.entries);
  const startEntry = useCommandLogStore((s) => s.startEntry);
  const completeEntry = useCommandLogStore((s) => s.completeEntry);
  const clearEntries = useCommandLogStore((s) => s.clearEntries);

  // Gate the entire heavy-query layer behind an idle frame so the window
  // chrome (fullscreen, drag, traffic lights) stays responsive on launch.
  useMarkAppReady();

  // Mark navigation as non-urgent so React can pause the dashboard remount
  // and yield back to the browser, killing the macOS spinner on switches.
  const [, startNav] = useTransition();

  // Derived view — memoized so child equality checks stay cheap.
  const selected = useMemo(
    () => repositories.find((r) => r.id === selectedRepoId) ?? null,
    [repositories, selectedRepoId],
  );
  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  // Default to first repository when nothing's selected, and drop dangling
  // selections in one effect.
  useEffect(() => {
    if (selectedRepoId && !repositories.some((r) => r.id === selectedRepoId)) {
      selectRepo(null);
      return;
    }
    if (!selectedRepoId && !selectedGroupId && repositories.length > 0) {
      selectRepo(repositories[0].id);
    }
  }, [repositories, selectedRepoId, selectedGroupId, selectRepo]);

  useEffect(() => {
    if (selectedGroupId && !groups.some((g) => g.id === selectedGroupId)) {
      selectGroup(null);
    }
  }, [groups, selectedGroupId, selectGroup]);

  // Keep remote-tracking refs fresh so the sidebar's ahead/behind badges
  // reflect what teammates have actually pushed. (Gated on app-ready inside.)
  useBackgroundFetch(repositories);

  // Warm both dashboard chunks after first paint so the user never sees
  // Suspense again when switching repos / groups.
  useEffect(() => {
    const w = window as Window &
      typeof globalThis & {
        requestIdleCallback?: (cb: () => void) => number;
      };
    const preload = () => {
      void repoDashboardModule();
      void groupDashboardModule();
    };
    if (w.requestIdleCallback) w.requestIdleCallback(preload);
    else window.setTimeout(preload, 200);
  }, []);

  // One-time host smoke test — warn early instead of failing every git command.
  useEffect(() => {
    void checkGit().then((version) => {
      if (!version) {
        toast.error("Git not found", {
          description:
            "Install Xcode Command Line Tools: `xcode-select --install`",
          duration: 12_000,
        });
      }
    });
  }, []);

  const handleSelectRepo = useCallback(
    (id: string) => {
      startNav(() => selectRepo(id));
    },
    [selectRepo],
  );

  const handleSelectGroup = useCallback(
    (id: string) => {
      startNav(() => selectGroup(id));
    },
    [selectGroup],
  );

  const handleLogStart = useCallback(
    (label: string): string =>
      selected ? startEntry(selected.id, label) : "",
    [selected, startEntry],
  );

  const handleLogComplete = useCallback(
    (id: string, result: GitCommandResult) => completeEntry(id, result),
    [completeEntry],
  );

  const handleClearLog = useCallback(() => {
    if (selected) clearEntries(selected.id);
  }, [selected, clearEntries]);

  const handleDrop = useCallback(
    async (paths: string[]) => {
      for (const path of paths) {
        if (hasPath(path)) {
          toast.info("Already added", { description: path });
          continue;
        }
        try {
          const toplevel = await gitClient.validateRepository(path);
          const repo = repositoryFromPath(toplevel);
          addRepository(repo);
          toast.success(`Added ${repo.name}`);
        } catch (err) {
          toast.error("Not a Git repository", {
            description: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },
    [addRepository, hasPath],
  );

  const handleCreateGroup = useCallback(
    (name: string, ids: string[]) => {
      const group = createGroup(name, ids);
      selectGroup(group.id);
    },
    [createGroup, selectGroup],
  );

  const handleUpdateGroup = useCallback(
    (id: string, name: string, ids: string[]) => {
      updateGroup(id, { name, repositoryIds: ids });
    },
    [updateGroup],
  );

  const { isDragOver } = useFileDrop({ onDrop: handleDrop });

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      <RepositorySidebar
        repositories={repositories}
        groups={groups}
        selectedRepoId={selectedRepoId}
        selectedGroupId={selectedGroupId}
        onSelectRepo={handleSelectRepo}
        onSelectGroup={handleSelectGroup}
        onRemove={removeRepository}
        onAdd={addRepository}
        hasPath={hasPath}
        onCreateGroup={handleCreateGroup}
        onDeleteGroup={removeGroup}
      />

      <Suspense fallback={null}>
        {selectedGroup ? (
          <GroupDashboard
            key={selectedGroup.id}
            group={selectedGroup}
            repositories={selectedGroup.repositoryIds
              .map((id) => repositories.find((r) => r.id === id))
              .filter((r): r is NonNullable<typeof r> => Boolean(r))}
            allRepositories={repositories}
            onEdit={handleUpdateGroup}
            onOpenRepo={handleSelectRepo}
          />
        ) : selected ? (
          <RepositoryDashboard
            key={selected.id}
            repository={selected}
            logEntries={entries}
            onLogStart={handleLogStart}
            onLogComplete={handleLogComplete}
            onClearLog={handleClearLog}
            onUpdateRepository={updateRepository}
          />
        ) : (
          <EmptyState />
        )}
      </Suspense>

      <DragOverlay visible={isDragOver} />
      <Toaster />
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-1 items-center justify-center"
      data-tauri-drag-region
    >
      <div className="max-w-sm text-center">
        <h2 className="text-lg font-semibold">No repository selected</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add one or more local Git repositories using the sidebar, or drag a
          folder anywhere onto the window.
        </p>
      </div>
    </div>
  );
}

function DragOverlay({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-40 flex items-center justify-center border-2 border-dashed border-primary bg-primary/5 transition-opacity",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <p className="rounded-md bg-background/90 px-4 py-2 text-sm font-medium shadow">
        Drop folders to add as repositories
      </p>
    </div>
  );
}
