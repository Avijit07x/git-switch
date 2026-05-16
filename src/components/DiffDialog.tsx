import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { gitClient } from "@/lib/git-client";
import { cn } from "@/lib/utils";

interface DiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositoryPath: string;
  file: string | null;
  staged: boolean;
}

// Single-responsibility: fetch the unified diff for one file and render it
// as a syntax-light "GitHub style" view — file header bar, hunk headers,
// added/removed lines with their old/new line numbers. We deliberately
// avoid bringing in monaco-diff (~2MB) — a unified-diff parser + ~100 lines
// of CSS gives us the same UX at zero bundle cost.
export function DiffDialog({
  open,
  onOpenChange,
  repositoryPath,
  file,
  staged,
}: DiffDialogProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["diff", repositoryPath, file ?? "", staged],
    queryFn: () => gitClient.getFileDiff(repositoryPath, file!, staged),
    enabled: open && !!file,
    staleTime: 5_000,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(1100px,95vw)] !w-[min(1100px,95vw)] !p-0 overflow-hidden">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-sm">
            <span className="min-w-0 truncate font-mono" title={file ?? ""}>
              {file ?? ""}
            </span>
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                staged
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
              )}
            >
              {staged ? "staged" : "unstaged"}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] min-h-[200px] min-w-0 overflow-hidden">
          {error ? (
            <p className="p-4 text-xs text-destructive">{error.message}</p>
          ) : isLoading ? (
            <p className="p-4 text-xs text-muted-foreground">Loading diff…</p>
          ) : !data || data.trim().length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              No changes for this file.
            </p>
          ) : (
            <DiffBody diff={data} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface DiffLine {
  kind: "context" | "add" | "del" | "hunk" | "file";
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

// Single-responsibility: parse a unified diff into typed lines. Supports
// multiple hunks, multiple file headers (we render the first file's hunks
// since DiffDialog is one-file-at-a-time).
function parseUnifiedDiff(diff: string): DiffLine[] {
  const out: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git") || raw.startsWith("index ")) {
      // File-level metadata — show only the diff --git line as a separator.
      if (raw.startsWith("diff --git")) {
        out.push({ kind: "file", oldNo: null, newNo: null, text: raw });
      }
      continue;
    }
    if (raw.startsWith("---") || raw.startsWith("+++")) {
      continue;
    }
    if (raw.startsWith("@@")) {
      // Parse the hunk header: @@ -<oldStart>,<oldCount> +<newStart>,<newCount> @@ ...
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (match) {
        oldNo = parseInt(match[1], 10);
        newNo = parseInt(match[2], 10);
      }
      out.push({ kind: "hunk", oldNo: null, newNo: null, text: raw });
      continue;
    }
    if (raw.startsWith("+")) {
      out.push({
        kind: "add",
        oldNo: null,
        newNo: newNo,
        text: raw.slice(1),
      });
      newNo += 1;
    } else if (raw.startsWith("-")) {
      out.push({
        kind: "del",
        oldNo: oldNo,
        newNo: null,
        text: raw.slice(1),
      });
      oldNo += 1;
    } else if (raw.startsWith("\\")) {
      // "\ No newline at end of file" — keep as a hunk-style marker.
      out.push({ kind: "hunk", oldNo: null, newNo: null, text: raw });
    } else if (raw.length > 0 || out.length > 0) {
      out.push({
        kind: "context",
        oldNo: oldNo,
        newNo: newNo,
        text: raw.startsWith(" ") ? raw.slice(1) : raw,
      });
      oldNo += 1;
      newNo += 1;
    }
  }
  return out;
}

function DiffBody({ diff }: { diff: string }) {
  const lines = useMemo(() => parseUnifiedDiff(diff), [diff]);
  // Native overflow container — both axes scroll independently. Replaces a
  // Radix ScrollArea whose viewport grew to the diff's natural width and
  // pushed past the dialog's right edge.
  return (
    <div className="h-full max-h-[70vh] overflow-auto bg-muted/20">
      <table className="w-max min-w-full border-separate border-spacing-0 font-mono text-[12px] leading-[1.55]">
        <tbody>
          {lines.map((line, i) => (
            <DiffRow key={i} line={line} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Two-up gutter as ONE sticky cell. The previous version used two separate
// `sticky left-0` columns; when the user scrolled horizontally both pinned to
// position 0 and stacked on top of each other, producing the misaligned line
// numbers visible in the bug report.
const GUTTER_CELL =
  "sticky left-0 z-10 select-none whitespace-nowrap border-r bg-inherit px-3 text-right font-mono text-[11px] text-muted-foreground/70 tabular-nums";

function DiffRow({ line }: { line: DiffLine }) {
  if (line.kind === "file") {
    return (
      <tr>
        <td
          colSpan={2}
          className="sticky left-0 z-10 bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground"
        >
          {line.text}
        </td>
      </tr>
    );
  }
  if (line.kind === "hunk") {
    return (
      <tr>
        <td
          colSpan={2}
          className="sticky left-0 z-10 bg-sky-500/10 px-3 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300"
        >
          {line.text}
        </td>
      </tr>
    );
  }
  const bg =
    line.kind === "add"
      ? "bg-emerald-500/10"
      : line.kind === "del"
        ? "bg-rose-500/10"
        : "";
  const marker = line.kind === "add" ? "+" : line.kind === "del" ? "−" : " ";
  const markerColor =
    line.kind === "add"
      ? "text-emerald-600 dark:text-emerald-400"
      : line.kind === "del"
        ? "text-rose-600 dark:text-rose-400"
        : "text-muted-foreground/60";

  return (
    <tr className={bg}>
      <td className={GUTTER_CELL}>
        <span className="inline-block w-7 text-right">
          {line.oldNo ?? ""}
        </span>
        <span className="ml-3 inline-block w-7 text-right">
          {line.newNo ?? ""}
        </span>
      </td>
      <td className="whitespace-pre px-3 py-[1px]">
        <span className={cn("mr-2 select-none", markerColor)}>{marker}</span>
        {line.text}
      </td>
    </tr>
  );
}

// Tiny hook helper: allow consumers to control open + selected file in one
// state object, matching the dialog's API.
export function useDiffViewer() {
  const [target, setTarget] = useState<{
    file: string;
    staged: boolean;
  } | null>(null);
  useEffect(() => {
    if (!target) return;
  }, [target]);
  return {
    target,
    open: (file: string, staged: boolean) => setTarget({ file, staged }),
    close: () => setTarget(null),
  };
}
