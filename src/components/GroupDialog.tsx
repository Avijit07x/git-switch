import { useEffect, useState } from "react";

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
import { ScrollArea } from "@/components/ui/scroll-area";
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

  useEffect(() => {
    if (open) {
      setName(group?.name ?? "");
      setSelected(new Set(group?.repositoryIds ?? []));
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
            <ScrollArea className="max-h-64 rounded-md border">
              {repositories.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  No repositories added yet. Add some from the sidebar first.
                </p>
              ) : (
                <ul className="divide-y">
                  {repositories.map((repo) => (
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
              )}
            </ScrollArea>
            <p className="text-[11px] text-muted-foreground">
              {selected.size} selected
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
