import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderPlus, Loader2, AlertTriangle } from "lucide-react";

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

// Single-responsibility: open a folder dialog, validate each selection,
// and forward valid repositories to the parent.
export function RepositoryPicker({ hasPath, onAdd }: RepositoryPickerProps) {
  const [loading, setLoading] = useState(false);
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

      const failures: PickError[] = [];
      for (const path of paths) {
        if (hasPath(path)) continue;
        try {
          const toplevel = await gitClient.validateRepository(path);
          onAdd(repositoryFromPath(toplevel));
        } catch (err) {
          failures.push({
            path,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      setErrors(failures);
    } finally {
      setLoading(false);
    }
  };

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
        Add repository
      </Button>

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
