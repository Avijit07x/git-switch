import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProjectGroup, Repository } from "@/lib/types";

interface GroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositories: Repository[];
  /** Existing group to edit, or `null` to create a new one. */
  group: ProjectGroup | null;
  onSave: (name: string, repositoryIds: string[]) => void;
}

// Single-responsibility: create or edit a project group — pick a name and
// check which already-added repositories should be members.
export function GroupDialog({
  open,
  onOpenChange,
  repositories,
  group,
  onSave,
}: GroupDialogProps) {
  const [name, setName] = useState(group?.name ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(group?.repositoryIds ?? []),
  );
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (open) {
      setName(group?.name ?? "");
      setSelected(new Set(group?.repositoryIds ?? []));
      setFilter("");
    }
  }, [open, group]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Single-responsibility: case-insensitive filter on name + path so users
  // with many repos can narrow the list with a few keystrokes.
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return repositories;
    return repositories.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q),
    );
  }, [repositories, filter]);

  const allVisibleSelected =
    visible.length > 0 && visible.every((r) => selected.has(r.id));
  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const r of visible) next.delete(r.id);
      } else {
        for (const r of visible) next.add(r.id);
      }
      return next;
    });
  };

  const canSave = name.trim().length > 0 && selected.size > 0;

  const handleSave = () => {
    if (!canSave) return;
    // Preserve member order: keep current order for existing members, then
    // append newly-checked ones in repo-list order.
    const existing = (group?.repositoryIds ?? []).filter((id) =>
      selected.has(id),
    );
    const added = repositories
      .map((r) => r.id)
      .filter((id) => selected.has(id) && !existing.includes(id));
    onSave(name.trim(), [...existing, ...added]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{group ? "Edit group" : "New group"}</DialogTitle>
          <DialogDescription>
            Pick which repositories belong to this group. You can start, stop,
            and restart them together.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My app"
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Repositories</Label>

            {repositories.length > 5 ? (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter…"
                  className="h-8 pl-8 text-xs"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            ) : null}

            {/* Native overflow container — always-visible macOS scrollbar,
                no Radix ScrollArea hover-discoverability trap. Height is
                sized so ~7 rows fit comfortably; longer lists scroll. */}
            <div className="max-h-[22rem] overflow-y-auto rounded-md border">
              {repositories.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  No repositories added yet. Add some from the sidebar first.
                </p>
              ) : visible.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  No matches for “{filter}”.
                </p>
              ) : (
                <>
                  {/* Sticky "Select all" row — always visible at the top of
                      the list, even while scrolling. Acts on the *filtered*
                      view so "select all <query>" works as expected. */}
                  <div
                    className="sticky top-0 z-10 flex cursor-pointer items-center gap-2 border-b bg-muted/60 px-3 py-2 text-xs font-medium backdrop-blur"
                    onClick={toggleAllVisible}
                  >
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={toggleAllVisible}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={
                        allVisibleSelected ? "Clear all" : "Select all"
                      }
                    />
                    <span className="flex-1">
                      {allVisibleSelected ? "Clear all" : "Select all"}
                    </span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {visible.length}
                    </span>
                  </div>

                  <ul className="divide-y">
                    {visible.map((repo) => (
                      <li
                        key={repo.id}
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent/40"
                        onClick={() => toggle(repo.id)}
                      >
                        <Checkbox
                          checked={selected.has(repo.id)}
                          onCheckedChange={() => toggle(repo.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{repo.name}</p>
                          <p
                            className="truncate text-[11px] text-muted-foreground"
                            title={repo.path}
                          >
                            {repo.path}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              {selected.size} selected · {visible.length} of{" "}
              {repositories.length} shown
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {group ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
