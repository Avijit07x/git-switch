import { Suspense, lazy, useState } from "react";
import { GitCommitHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "@/hooks/use-settings";
import type { GitOperation, GitStatus } from "@/lib/types";

// Lazy — only loaded the first time the user reaches for AI generation.
const GenerateCommitDialog = lazy(() =>
  import("./GenerateCommitDialog").then((m) => ({
    default: m.GenerateCommitDialog,
  })),
);

interface CommitPanelProps {
  repositoryPath: string;
  status: GitStatus | undefined;
  busy: boolean;
  operation: GitOperation;
  onCommit: (message: string) => Promise<unknown>;
}

// Single-responsibility: capture a commit message (manually or via the AI
// dialog) and trigger the commit.
export function CommitPanel({
  repositoryPath,
  status,
  busy,
  operation,
  onCommit,
}: CommitPanelProps) {
  const [message, setMessage] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const { settings } = useSettings();

  const isCommitting = operation === "committing";
  const stagedCount = (status?.files ?? []).filter((f) => f.staged).length;
  const canCommit = stagedCount > 0 && message.trim().length > 0;
  const hasApiKey = settings.geminiApiKey.trim().length > 0;

  const handleCommit = async () => {
    if (!canCommit) return;
    await onCommit(message.trim());
    setMessage("");
  };

  const handleOpenGenerate = () => {
    if (!hasApiKey) {
      toast.error("Add your Gemini API key in Settings first.");
      return;
    }
    setAiOpen(true);
  };

  return (
    <section className="shrink-0 space-y-2">
      <Textarea
        id="commit-message"
        aria-label="Commit message"
        placeholder="Commit message…  ⌘↵ to commit"
        className="resize-none placeholder:text-xs"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            if (canCommit && !busy) void handleCommit();
          }
        }}
        rows={2}
        disabled={busy}
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleOpenGenerate}
          disabled={busy || stagedCount === 0}
          title={
            !hasApiKey ? "Add your Gemini API key in Settings" : undefined
          }
        >
          <Sparkles className="size-3.5" />
          Generate with AI
        </Button>

        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {stagedCount === 0
            ? "Stage files to commit"
            : `${stagedCount} file${stagedCount === 1 ? "" : "s"} staged`}
        </span>
        <Button
          size="sm"
          onClick={handleCommit}
          loading={isCommitting}
          loadingText="Committing…"
          disabled={!canCommit || (busy && !isCommitting)}
        >
          <GitCommitHorizontal className="size-3.5" />
          Commit
        </Button>
      </div>

      {aiOpen ? (
        <Suspense fallback={null}>
          <GenerateCommitDialog
            open={aiOpen}
            onOpenChange={setAiOpen}
            repositoryPath={repositoryPath}
            onUse={setMessage}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
