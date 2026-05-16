import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
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

interface CreateBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseBranch: string | null;
  busy: boolean;
  onCreate: (name: string) => void;
}

// Single-responsibility: prompt the user for a new local branch name, validate
// the obvious bad shapes client-side so they don't have to round-trip to git,
// and call `onCreate` with the cleaned name. The Rust side runs `git switch
// -c <name>` which both creates and checks out the branch.
export function CreateBranchDialog({
  open,
  onOpenChange,
  baseBranch,
  busy,
  onCreate,
}: CreateBranchDialogProps) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  // Clear the field when the dialog closes so re-opens start fresh.
  useEffect(() => {
    if (!open) setName("");
  }, [open]);

  const validationError = validate(trimmed);
  const canSubmit = !busy && trimmed.length > 0 && validationError === null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onCreate(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create branch</DialogTitle>
            <DialogDescription>
              {baseBranch ? (
                <>
                  Branch from{" "}
                  <span className="font-medium text-foreground">
                    {baseBranch}
                  </span>{" "}
                  and switch to it.
                </>
              ) : (
                "Create a new local branch and switch to it."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label htmlFor="branch-name">Branch name</Label>
            <Input
              id="branch-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="feature/new-thing"
              autoComplete="off"
              spellCheck={false}
            />
            {trimmed.length > 0 && validationError ? (
              <p className="text-xs text-destructive">{validationError}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                After creating, click <strong>Publish branch</strong> to push
                it upstream.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              loading={busy}
              loadingText="Creating…"
            >
              Create branch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Same forbidden-character set the Rust side enforces — mirrored here so the
// user gets feedback as they type instead of after a round-trip.
function validate(name: string): string | null {
  if (name.length === 0) return null;
  if (name.startsWith("-")) return "Branch name cannot start with “-”.";
  if (name.includes("..")) return "Branch name cannot contain “..”.";
  if (name.includes(" ")) return "Branch name cannot contain spaces.";
  if (/[~^:?*[\\]/.test(name)) return "Contains a reserved character.";
  return null;
}
