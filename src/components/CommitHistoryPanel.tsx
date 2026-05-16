import { useMemo } from "react";
import { Clock } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useCommitHistory } from "@/hooks/use-git-operations";
import type { CommitInfo, Repository } from "@/lib/types";

interface CommitHistoryPanelProps {
  repository: Repository;
}

// Single-responsibility: read-only `git log` viewer for the current branch.
// Shows the last N commits with short hash, subject, author, and a relative
// timestamp. No interaction yet — clicking a commit could open a diff
// against HEAD later, but the read-only flow is the bigger UX win to ship
// first.
export function CommitHistoryPanel({ repository }: CommitHistoryPanelProps) {
  const { data, isLoading, error } = useCommitHistory(repository);

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
              <CommitRow key={commit.hash} commit={commit} />
            ))}
          </ul>
        )}
      </ScrollArea>
    </section>
  );
}

// Single-responsibility: render one commit row. Avatar is a derived initial
// circle so the layout doesn't depend on Gravatar / network.
function CommitRow({ commit }: { commit: CommitInfo }) {
  const initials = useMemo(() => deriveInitials(commit.author), [commit.author]);
  const when = useMemo(() => relativeTime(commit.timestamp), [commit.timestamp]);

  return (
    <li className="group flex items-center gap-2.5 px-3 py-2 hover:bg-accent/50">
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
