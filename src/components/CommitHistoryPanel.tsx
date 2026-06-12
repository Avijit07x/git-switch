import { useMemo } from "react";
import { Cherry, Clock, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { IconHint } from "@/components/IconHint";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCommitHistory } from "@/hooks/use-git-operations";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { CommitInfo, Repository } from "@/lib/types";

interface CommitHistoryPanelProps {
  repository: Repository;
  /** Branch to read history from. Defaults to the current branch. */
  branch?: string;
  /** When provided, rows become clickable (used to open the commit's diff). */
  onSelectCommit?: (commit: CommitInfo) => void;
  /**
   * When provided, each row's menu offers "Cherry-pick onto <current>".
   * Pass only while browsing a branch other than the checked-out one.
   */
  cherryPick?: {
    targetBranch: string;
    onPick: (commit: CommitInfo) => void;
  };
}

// Single-responsibility: read-only `git log` viewer for one branch (current
// by default). Shows the last N commits with short hash, subject, author,
// and a relative timestamp; row menu carries commit-level actions.
export function CommitHistoryPanel({
  repository,
  branch,
  onSelectCommit,
  cherryPick,
}: CommitHistoryPanelProps) {
  const { data, isLoading, error } = useCommitHistory(repository, branch);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between px-1 pb-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Clock className="size-3.5" /> History
        </h3>
        {data ? (
          <span className="text-[10px] text-muted-foreground">
            {data.length} commit{data.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </header>

      <ScrollArea className="flex-1 rounded-md border">
        {error ? (
          <p className="p-4 text-xs text-destructive">{error.message}</p>
        ) : isLoading ? (
          <p className="p-4 text-xs text-muted-foreground">Loading…</p>
        ) : !data || data.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">No commits yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((commit) => (
              <CommitRow
                key={commit.hash}
                commit={commit}
                onSelect={onSelectCommit}
                cherryPick={cherryPick}
              />
            ))}
          </ul>
        )}
      </ScrollArea>
    </section>
  );
}

// Single-responsibility: render one commit row. Avatar is a derived initial
// circle so the layout doesn't depend on Gravatar / network.
function CommitRow({
  commit,
  onSelect,
  cherryPick,
}: {
  commit: CommitInfo;
  onSelect?: (commit: CommitInfo) => void;
  cherryPick?: CommitHistoryPanelProps["cherryPick"];
}) {
  const initials = useMemo(() => deriveInitials(commit.author), [commit.author]);
  const when = useMemo(() => relativeTime(commit.timestamp), [commit.timestamp]);

  const handleCopyHash = async () => {
    try {
      await copyText(commit.hash);
      toast.success("Commit hash copied", { description: commit.short });
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <li
      className={cn(
        "group flex items-center gap-2.5 px-3 py-2 hover:bg-accent/50",
        onSelect && "cursor-pointer",
      )}
      onClick={onSelect ? () => onSelect(commit) : undefined}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
    >
      <div
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-semibold text-foreground"
        title={`${commit.author} <${commit.email}>`}
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        {/* Native `title=` attributes fire the OS tooltip on hover even
            when text isn't truncated, producing the ugly duplicate
            bubble. The subject column is wide enough that truncation is
            rare; if you need the full text, expand the dialog. */}
        <p className="truncate text-xs font-medium">
          {commit.subject || "(no subject)"}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">
          <span className="font-mono">{commit.short}</span>
          {" · "}
          {commit.author}
          {" · "}
          {when}
        </p>
      </div>
      {cherryPick ? (
        <IconHint
          label={`Cherry-pick onto ${cherryPick.targetBranch}`}
          side="left"
        >
          <Button
            size="icon"
            variant="ghost"
            className="size-6 shrink-0 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              cherryPick.onPick(commit);
            }}
            aria-label={`Cherry-pick ${commit.short} onto ${cherryPick.targetBranch}`}
          >
            <Cherry className="size-3.5" />
          </Button>
        </IconHint>
      ) : null}
      <IconHint label="Copy commit hash" side="left">
        <Button
          size="icon"
          variant="ghost"
          className="size-6 shrink-0 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            void handleCopyHash();
          }}
          aria-label={`Copy hash of ${commit.short}`}
        >
          <Copy className="size-3.5" />
        </Button>
      </IconHint>
    </li>
  );
}

function deriveInitials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Compact relative time. We intentionally avoid pulling in date-fns/dayjs
// just for this single use site.
function relativeTime(epochSeconds: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds);
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}
