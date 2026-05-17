import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, FolderPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { gitClient } from "@/lib/git-client";
import { repositoryFromPath } from "@/lib/repository-from-path";
import type { Repository } from "@/lib/types";

interface RepositoryPickerProps {
  hasPath: (path: string) => boolean;
  onAdd: (repo: Repository) => void;
}

interface PickError {
  path: string;
  message: string;
}

// Single-responsibility: open a native folder dialog with multi-select on,
// validate every chosen folder in parallel, and summarize the result in one
// toast. Failed folders stay rendered below the button so the user can copy
// the path / re-pick.
export function RepositoryPicker({ hasPath, onAdd }: RepositoryPickerProps) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [errors, setErrors] = useState<PickError[]>([]);

  const handlePick = async () => {
    setErrors([]);
    setLoading(true);
    try {
      const selection = await open({
        directory: true,
        multiple: true,
        title: "Select one or more Git repositories",
      });
      if (!selection) return;
      const paths = Array.isArray(selection) ? selection : [selection];

      // Bucket #1 — paths already in the store; skipped silently in the count.
      const fresh = paths.filter((p) => !hasPath(p));
      const skipped = paths.length - fresh.length;

      setProgress({ done: 0, total: fresh.length });

      // Validate each path in parallel. We need typed results to drive the
      // summary toast, so we use Promise.allSettled and bucket afterwards.
      let done = 0;
      const settled = await Promise.all(
        fresh.map(async (path) => {
          try {
            const toplevel = await gitClient.validateRepository(path);
            return { ok: true as const, path, toplevel };
          } catch (err) {
            return {
              ok: false as const,
              path,
              message: err instanceof Error ? err.message : String(err),
            };
          } finally {
            done += 1;
            setProgress({ done, total: fresh.length });
          }
        }),
      );

      const added: string[] = [];
      const failures: PickError[] = [];
      for (const r of settled) {
        if (r.ok) {
          const repo = repositoryFromPath(r.toplevel);
          onAdd(repo);
          added.push(repo.name);
        } else {
          failures.push({ path: r.path, message: r.message });
        }
      }
      setErrors(failures);
      summarize(added, skipped, failures.length);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const label = progress
    ? `Adding ${progress.done}/${progress.total}…`
    : "Add local repository";

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="outline"
        className="w-full justify-start"
        onClick={handlePick}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FolderPlus className="h-4 w-4" />
        )}
        {label}
      </Button>

      <p className="px-1 text-[10px] text-muted-foreground">
        Pick a folder on your Mac.{" "}
        <kbd className="rounded bg-muted px-1 font-mono">⌘</kbd>+click in the
        dialog to add several at once.
      </p>

      {errors.length > 0 && (
        <ul className="space-y-1 text-xs text-destructive">
          {errors.map((e) => (
            <li key={e.path} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="break-all">
                <span className="font-medium">{e.path}</span>: {e.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Single-responsibility: turn the three counters into one toast. We promote
// the dominant outcome (added wins over skipped wins over failed) and the
// description is the secondary tally.
function summarize(
  added: string[],
  skipped: number,
  failed: number,
): void {
  const desc = describeSecondary(skipped, failed);
  if (added.length > 0) {
    toast.success(
      `Added ${added.length} repositor${added.length === 1 ? "y" : "ies"}`,
      {
        description:
          added.length <= 3
            ? `${added.join(", ")}${desc ? ` · ${desc}` : ""}`
            : desc || undefined,
      },
    );
    return;
  }
  if (skipped > 0 && failed === 0) {
    toast.info(`Skipped ${skipped} — already in the list`);
    return;
  }
  if (failed > 0) {
    toast.error(
      `${failed} folder${failed === 1 ? "" : "s"} couldn't be added`,
      {
        description: "Not Git repositories — see the list below the button.",
      },
    );
  }
}

function describeSecondary(skipped: number, failed: number): string {
  const parts: string[] = [];
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(", ");
}
