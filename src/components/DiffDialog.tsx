import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Columns2,
  Copy,
  FileClock,
  FileCode,
  Rows3,
  SquarePen,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconHint } from "@/components/IconHint";
import { copyText } from "@/lib/clipboard";
import { gitClient } from "@/lib/git-client";
import { openInEditor } from "@/lib/system";
import { cn } from "@/lib/utils";
import { useUiStore, type DiffView } from "@/stores/use-ui-store";

// Where the "copy contents before change" action should read from: the repo
// plus the revision that holds the pre-change version (HEAD for working-tree
// diffs, `<hash>^` for a commit's patch).
export interface DiffCopyContext {
  repoPath: string;
  beforeRevision: string;
}

interface DiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositoryPath: string;
  file: string | null;
  staged: boolean;
  untracked?: boolean;
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
  untracked = false,
}: DiffDialogProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["diff", repositoryPath, file ?? "", staged],
    queryFn: () => gitClient.getFileDiff(repositoryPath, file!, staged),
    enabled: open && !!file,
    staleTime: 5_000,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(1100px,95vw)]! w-[min(1100px,95vw)]! overflow-hidden p-0!">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-sm">
            <span className="min-w-0 truncate font-mono" title={file ?? ""}>
              {file ?? ""}
            </span>
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                untracked
                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                  : staged
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
              )}
            >
              {untracked ? "new file" : staged ? "staged" : "unstaged"}
            </span>
            <DiffViewToggle className="ml-auto mr-6" />
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] min-h-50 min-w-0 overflow-hidden">
          {error ? (
            <p className="p-4 text-xs text-destructive">{error.message}</p>
          ) : isLoading ? (
            <p className="p-4 text-xs text-muted-foreground">Loading diff…</p>
          ) : !data || data.trim().length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              No changes for this file.
            </p>
          ) : (
            <DiffBody
              diff={data}
              copy={{ repoPath: repositoryPath, beforeRevision: "HEAD" }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// One run of characters within a line; `changed` runs get the stronger
// word-level highlight on top of the line background.
interface TextSegment {
  text: string;
  changed: boolean;
}

interface DiffLine {
  kind: "context" | "add" | "del" | "hunk" | "file";
  oldNo: number | null;
  newNo: number | null;
  text: string;
  segments?: TextSegment[];
}

// Turn `diff --git a/old b/new` into a human path: the new path, or
// `old → new` for renames. Falls back to the raw line if it doesn't parse.
function parseFileHeader(raw: string): string {
  const match = /^diff --git a\/(.+) b\/(.+)$/.exec(raw);
  if (!match) return raw;
  const [, oldPath, newPath] = match;
  return oldPath === newPath ? newPath : `${oldPath} → ${newPath}`;
}

// File-level metadata lines git emits between `diff --git` and the first
// hunk (mode changes, renames, new/deleted file markers). Real content
// lines always start with " ", "+", "-" or "\", so these prefixes can't
// collide with file contents.
const FILE_META_PREFIXES = [
  "index ",
  "new file mode",
  "deleted file mode",
  "old mode",
  "new mode",
  "similarity index",
  "dissimilarity index",
  "rename from",
  "rename to",
  "copy from",
  "copy to",
];

// Single-responsibility: parse a unified diff into typed lines. Supports
// multiple hunks, multiple file headers (we render the first file's hunks
// since DiffDialog is one-file-at-a-time).
function parseUnifiedDiff(diff: string): DiffLine[] {
  const out: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git")) {
      // File-level metadata — show only the file path as a separator.
      out.push({
        kind: "file",
        oldNo: null,
        newNo: null,
        text: parseFileHeader(raw),
      });
      continue;
    }
    if (FILE_META_PREFIXES.some((prefix) => raw.startsWith(prefix))) {
      continue;
    }
    if (raw.startsWith("Binary files ")) {
      out.push({ kind: "hunk", oldNo: null, newNo: null, text: raw });
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

// Beyond this many token-pair comparisons the O(n·m) LCS isn't worth it
// (think minified bundles); we fall back to highlighting the whole changed
// middle between the common prefix and suffix.
const WORD_DIFF_TOKEN_CAP = 250_000;

// Word-ish tokens: identifier runs, whitespace runs, single punctuation.
// Every character matches exactly one class, so joining tokens reproduces
// the original line.
function tokenize(text: string): string[] {
  return text.match(/[A-Za-z0-9_]+|\s+|[^A-Za-z0-9_\s]/g) ?? [];
}

function mergeSegments(segments: TextSegment[]): TextSegment[] {
  const out: TextSegment[] = [];
  for (const seg of segments) {
    if (!seg.text) continue;
    const last = out[out.length - 1];
    if (last && last.changed === seg.changed) last.text += seg.text;
    else out.push({ ...seg });
  }
  return out;
}

// Token-level LCS (dynamic programming over suffixes), then a backtrack
// that marks non-common tokens as changed on their own side.
function lcsSegments(
  a: string[],
  b: string[],
): [TextSegment[], TextSegment[]] {
  const m = a.length;
  const n = b.length;
  const width = n + 1;
  const dp = new Uint32Array((m + 1) * width);
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }
  const oldSeg: TextSegment[] = [];
  const newSeg: TextSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      oldSeg.push({ text: a[i], changed: false });
      newSeg.push({ text: b[j], changed: false });
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      oldSeg.push({ text: a[i], changed: true });
      i += 1;
    } else {
      newSeg.push({ text: b[j], changed: true });
      j += 1;
    }
  }
  while (i < m) {
    oldSeg.push({ text: a[i], changed: true });
    i += 1;
  }
  while (j < n) {
    newSeg.push({ text: b[j], changed: true });
    j += 1;
  }
  return [oldSeg, newSeg];
}

// GitHub-style intra-line diff for one old/new line pair. Returns null when
// the lines share too little (< 25% of the longer line) — highlighting
// nearly everything is worse than the plain line-level coloring.
function diffWords(
  oldText: string,
  newText: string,
): { old: TextSegment[]; new: TextSegment[] } | null {
  const a = tokenize(oldText);
  const b = tokenize(newText);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start += 1;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  let oldMid: TextSegment[];
  let newMid: TextSegment[];
  if (midA.length * midB.length > WORD_DIFF_TOKEN_CAP) {
    oldMid = [{ text: midA.join(""), changed: true }];
    newMid = [{ text: midB.join(""), changed: true }];
  } else {
    [oldMid, newMid] = lcsSegments(midA, midB);
  }

  const prefix = a.slice(0, start).join("");
  const oldSeg = mergeSegments([
    { text: prefix, changed: false },
    ...oldMid,
    { text: a.slice(endA).join(""), changed: false },
  ]);
  const newSeg = mergeSegments([
    { text: prefix, changed: false },
    ...newMid,
    { text: b.slice(endB).join(""), changed: false },
  ]);

  const common = oldSeg.reduce(
    (sum, seg) => (seg.changed ? sum : sum + seg.text.length),
    0,
  );
  if (common < Math.max(oldText.length, newText.length) * 0.25) return null;

  return { old: oldSeg, new: newSeg };
}

// Pair each run of deletions with the run of additions that follows it
// (index-wise — the same pairing the split view uses) and attach word-level
// segments to both sides of every pair.
function annotateIntraLine(lines: DiffLine[]): DiffLine[] {
  const out = lines.slice();
  let i = 0;
  while (i < out.length) {
    if (out[i].kind !== "del") {
      i += 1;
      continue;
    }
    const delStart = i;
    while (i < out.length && out[i].kind === "del") i += 1;
    const addStart = i;
    while (i < out.length && out[i].kind === "add") i += 1;
    const pairs = Math.min(addStart - delStart, i - addStart);
    for (let j = 0; j < pairs; j += 1) {
      const del = out[delStart + j];
      const add = out[addStart + j];
      if (del.text === add.text) continue;
      const seg = diffWords(del.text, add.text);
      if (!seg) continue;
      out[delStart + j] = { ...del, segments: seg.old };
      out[addStart + j] = { ...add, segments: seg.new };
    }
  }
  return out;
}

// Renders a diff line's text, wrapping changed runs in the stronger
// word-level highlight. `box-decoration-clone` keeps the rounded highlight
// intact when a segment wraps in the split view.
function LineText({
  text,
  segments,
  kind,
}: {
  text: string;
  segments?: TextSegment[];
  kind: "context" | "add" | "del";
}) {
  if (!segments || kind === "context") return <>{text || " "}</>;
  const mark =
    kind === "add"
      ? "rounded-[2px] bg-emerald-500/30 box-decoration-clone"
      : "rounded-[2px] bg-rose-500/30 box-decoration-clone";
  return (
    <>
      {segments.map((seg, idx) =>
        seg.changed ? (
          <span key={idx} className={mark}>
            {seg.text}
          </span>
        ) : (
          <span key={idx}>{seg.text}</span>
        ),
      )}
    </>
  );
}

// Segmented Unified/Split control. Reads/writes the persisted UI store so
// every diff surface (file dialog, commit history) stays in sync.
export function DiffViewToggle({ className }: { className?: string }) {
  const diffView = useUiStore((s) => s.diffView);
  const setDiffView = useUiStore((s) => s.setDiffView);

  const option = (view: DiffView, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setDiffView(view)}
      aria-pressed={diffView === view}
      className={cn(
        "flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[10px] font-medium transition-colors",
        diffView === view
          ? "bg-background text-foreground shadow-2xs ring-1 ring-border/70"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      className={cn(
        "inline-flex shrink-0 rounded-md border bg-muted p-0.5",
        className,
      )}
    >
      {option("unified", <Rows3 className="size-3" />, "Unified")}
      {option("split", <Columns2 className="size-3" />, "Split")}
    </div>
  );
}

interface FileSection {
  header: string | null;
  lines: DiffLine[];
}

// Split the parsed stream into per-file sections so each file gets its own
// sticky header — while scrolling a long patch you always see which file
// the visible hunks belong to (GitHub behavior).
function groupFileSections(lines: DiffLine[]): FileSection[] {
  const sections: FileSection[] = [];
  let current: FileSection | null = null;
  for (const line of lines) {
    if (line.kind === "file") {
      current = { header: line.text, lines: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { header: null, lines: [] };
      sections.push(current);
    }
    current.lines.push(line);
  }
  return sections;
}

// Sticky within its file section: pinned to the top edge while the section
// scrolls, pushed off by the next file's header. The inner span is sticky
// on the horizontal axis too, so the path stays readable while the unified
// view scrolls sideways. The background is solid (content scrolls beneath)
// and mixes in a touch of the accent so the bar reads as a highlight.
function FileHeader({
  text,
  copy,
}: {
  text: string;
  copy?: DiffCopyContext;
}) {
  // Rename headers render as "old → new": the new path is what you'd copy,
  // the old path is where the pre-change contents live.
  const [oldPath, newPath = oldPath] = text.split(" → ");

  const handleCopyPath = async () => {
    try {
      await copyText(newPath);
      toast.success("Path copied", { description: newPath });
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const handleCopyBefore = async () => {
    if (!copy) return;
    try {
      const contents = await gitClient.getFileAtRevision(
        copy.repoPath,
        oldPath,
        copy.beforeRevision,
      );
      await copyText(contents);
      toast.success("Pre-change contents copied", { description: oldPath });
    } catch (err) {
      toast.error("Couldn't copy original contents", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleOpenInEditor = async () => {
    if (!copy) return;
    try {
      await openInEditor(copy.repoPath, newPath);
    } catch (err) {
      toast.error("Couldn't open file", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="sticky top-0 z-20 border-y border-border/70 bg-[color-mix(in_oklch,var(--primary)_12%,var(--muted))] py-1.5 shadow-xs">
      <span
        className="sticky left-0 inline-flex max-w-full items-center gap-1.5 truncate px-3 font-mono text-[11px] font-semibold text-foreground"
        title={text}
      >
        <FileCode className="size-3.5 shrink-0 text-muted-foreground" />
        {text}
        <IconHint label="Copy relative path" side="bottom">
          <button
            type="button"
            className="ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            onClick={() => void handleCopyPath()}
            aria-label={`Copy path of ${newPath}`}
          >
            <Copy className="size-3" />
          </button>
        </IconHint>
        {copy ? (
          <IconHint label="Copy contents before change" side="bottom">
            <button
              type="button"
              className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              onClick={() => void handleCopyBefore()}
              aria-label={`Copy pre-change contents of ${oldPath}`}
            >
              <FileClock className="size-3" />
            </button>
          </IconHint>
        ) : null}
        {copy ? (
          <IconHint label="Open in editor" side="bottom">
            <button
              type="button"
              className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              onClick={() => void handleOpenInEditor()}
              aria-label={`Open ${newPath} in editor`}
            >
              <SquarePen className="size-3" />
            </button>
          </IconHint>
        ) : null}
      </span>
    </div>
  );
}

// Exported so the commit-history viewer can render `git show` output with
// the same parser/row styling — it supports multi-file patches via the
// `diff --git` separator rows. Renders unified or side-by-side depending on
// the persisted preference (see DiffViewToggle).
export function DiffBody({
  diff,
  copy,
}: {
  diff: string;
  copy?: DiffCopyContext;
}) {
  const lines = useMemo(() => annotateIntraLine(parseUnifiedDiff(diff)), [diff]);
  const sections = useMemo(() => groupFileSections(lines), [lines]);
  const view = useUiStore((s) => s.diffView);

  if (view === "split") return <SplitBody sections={sections} copy={copy} />;

  // Native overflow container — both axes scroll independently. Replaces a
  // Radix ScrollArea whose viewport grew to the diff's natural width and
  // pushed past the dialog's right edge.
  return (
    <div className="h-full max-h-[70vh] overflow-auto bg-muted/20">
      {sections.map((section, i) => (
        <section key={i}>
          {section.header ? (
            <FileHeader text={section.header} copy={copy} />
          ) : null}
          <table className="w-max min-w-full border-separate border-spacing-0 font-mono text-[12px] leading-[1.55]">
            <tbody>
              {section.lines.map((line, j) => (
                <DiffRow key={j} line={line} />
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

interface SplitCell {
  no: number | null;
  text: string;
  kind: "context" | "add" | "del";
  segments?: TextSegment[];
}

type SplitRowData =
  | { kind: "file"; text: string }
  | { kind: "hunk"; text: string }
  | { kind: "pair"; left: SplitCell | null; right: SplitCell | null };

// Pair up the unified stream for side-by-side display: context lines mirror
// onto both sides; each run of deletions is matched index-wise with the run
// of additions that follows it (the standard GitHub pairing).
function buildSplitRows(lines: DiffLine[]): SplitRowData[] {
  const rows: SplitRowData[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.kind === "file" || line.kind === "hunk") {
      rows.push({ kind: line.kind, text: line.text });
      i += 1;
      continue;
    }
    if (line.kind === "context") {
      rows.push({
        kind: "pair",
        left: { no: line.oldNo, text: line.text, kind: "context" },
        right: { no: line.newNo, text: line.text, kind: "context" },
      });
      i += 1;
      continue;
    }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i].kind === "del") {
      dels.push(lines[i]);
      i += 1;
    }
    while (i < lines.length && lines[i].kind === "add") {
      adds.push(lines[i]);
      i += 1;
    }
    const span = Math.max(dels.length, adds.length);
    for (let j = 0; j < span; j += 1) {
      rows.push({
        kind: "pair",
        left: dels[j]
          ? {
              no: dels[j].oldNo,
              text: dels[j].text,
              kind: "del",
              segments: dels[j].segments,
            }
          : null,
        right: adds[j]
          ? {
              no: adds[j].newNo,
              text: adds[j].text,
              kind: "add",
              segments: adds[j].segments,
            }
          : null,
      });
    }
  }
  return rows;
}

const SPLIT_NUM_CELL =
  "select-none whitespace-nowrap border-r px-2 text-right align-top font-mono text-[11px] text-muted-foreground/70 tabular-nums";
const SPLIT_TEXT_CELL =
  "whitespace-pre-wrap break-all px-2 py-px align-top";

function splitCellBg(cell: SplitCell | null): string {
  if (!cell) return "bg-muted/40";
  if (cell.kind === "del") return "bg-rose-500/10";
  if (cell.kind === "add") return "bg-emerald-500/10";
  return "";
}

// Side-by-side body. Long lines wrap (like GitHub's split view) instead of
// scrolling horizontally — two independently-scrolling halves aren't worth
// the complexity.
function SplitBody({
  sections,
  copy,
}: {
  sections: FileSection[];
  copy?: DiffCopyContext;
}) {
  const sectionRows = useMemo(
    () => sections.map((section) => buildSplitRows(section.lines)),
    [sections],
  );
  return (
    <div className="h-full max-h-[70vh] overflow-auto bg-muted/20">
      {sections.map((section, i) => (
        <section key={i}>
          {section.header ? (
            <FileHeader text={section.header} copy={copy} />
          ) : null}
          <table className="w-full table-fixed border-separate border-spacing-0 font-mono text-[12px] leading-[1.55]">
            <colgroup>
              <col className="w-12" />
              <col />
              <col className="w-12" />
              <col />
            </colgroup>
            <tbody>
              {sectionRows[i].map((row, j) => {
                if (row.kind === "file") return null;
                if (row.kind === "hunk") {
                  return (
                    <tr key={j}>
                      <td
                        colSpan={4}
                        className="bg-sky-500/10 px-3 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300"
                      >
                        {row.text}
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={j}>
                    <td className={cn(SPLIT_NUM_CELL, splitCellBg(row.left))}>
                      {row.left?.no ?? ""}
                    </td>
                    <td
                      className={cn(
                        SPLIT_TEXT_CELL,
                        "border-r",
                        splitCellBg(row.left),
                      )}
                    >
                      {row.left ? (
                        <LineText
                          text={row.left.text}
                          segments={row.left.segments}
                          kind={row.left.kind}
                        />
                      ) : (
                        ""
                      )}
                    </td>
                    <td className={cn(SPLIT_NUM_CELL, splitCellBg(row.right))}>
                      {row.right?.no ?? ""}
                    </td>
                    <td className={cn(SPLIT_TEXT_CELL, splitCellBg(row.right))}>
                      {row.right ? (
                        <LineText
                          text={row.right.text}
                          segments={row.right.segments}
                          kind={row.right.kind}
                        />
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
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
  if (line.kind === "file") return null;
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
      <td className="whitespace-pre px-3 py-px">
        <span className={cn("mr-2 select-none", markerColor)}>{marker}</span>
        <LineText text={line.text} segments={line.segments} kind={line.kind} />
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
