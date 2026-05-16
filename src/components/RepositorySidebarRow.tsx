import { memo } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useQuickStatus } from "@/hooks/use-git-operations";
import { cn } from "@/lib/utils";
import type { Repository } from "@/lib/types";

import { IconHint } from "./IconHint";

interface RepositorySidebarRowProps {
  repository: Repository;
  active: boolean;
  onSelect: (id: string) => void;
  onRequestRemove: (repo: Repository) => void;
}

// Single-responsibility: render one repository row in the sidebar. The row's
// background tint encodes status at a glance:
//   - behind  → rose    (upstream moved, you should pull — most urgent)
//   - changes → amber   (uncommitted work)
//   - ahead   → emerald (commits to push)
// Selected always wins and goes white so the active repo reads as a
// pressed-elevated card.
export const RepositorySidebarRow = memo(RepositorySidebarRowImpl);

type Tone = "rose" | "amber" | "emerald" | null;

// Priority-pick the single most-important status so the row never looks
// muddy from layered colors.
function pickTone(changes: number, ahead: number, behind: number): Tone {
  if (behind > 0) return "rose";
  if (changes > 0) return "amber";
  if (ahead > 0) return "emerald";
  return null;
}

const TONE_BG: Record<Exclude<Tone, null>, string> = {
  rose: "bg-rose-500/8 hover:bg-rose-500/15 dark:bg-rose-500/10 dark:hover:bg-rose-500/15",
  amber:
    "bg-amber-500/8 hover:bg-amber-500/15 dark:bg-amber-500/10 dark:hover:bg-amber-500/15",
  emerald:
    "bg-emerald-500/8 hover:bg-emerald-500/15 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15",
};

function RepositorySidebarRowImpl({
  repository,
  active,
  onSelect,
  onRequestRemove,
}: RepositorySidebarRowProps) {
  const { data } = useQuickStatus(repository);
  const changes = data?.changes ?? 0;
  const ahead = data?.ahead ?? 0;
  const behind = data?.behind ?? 0;
  const branch = data?.currentBranch;
  const tone = pickTone(changes, ahead, behind);

  // Until quick_status resolves, we don't apply a tint or paint a subtitle —
  // a stable empty row is far less jarring than "—" → branch swap or a
  // late-arriving amber flash.
  const loaded = data !== undefined;

  return (
    <div
      className={cn(
        "group flex h-[48px] cursor-pointer items-center gap-2 rounded-md px-2.5 text-left",
        active
          ? "bg-foreground/10 text-foreground"
          : loaded && tone
            ? TONE_BG[tone]
            : "hover:bg-accent",
      )}
      onClick={() => onSelect(repository.id)}
      role="button"
      tabIndex={0}
      title={repository.path}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">
          {repository.name}
        </p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground">
          {loaded ? (branch ?? "(detached)") : " "}
        </p>
      </div>

      <IconHint label="Remove repository" side="right">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onRequestRemove(repository);
          }}
          aria-label={`Remove ${repository.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </IconHint>
    </div>
  );
}
