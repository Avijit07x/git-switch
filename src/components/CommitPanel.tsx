import { useState } from "react";
import { GitCommitHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "@/hooks/use-settings";
import {
  generateCommitMessage,
  listGeminiModels,
  type ListedModel,
} from "@/lib/gemini";
import { gitClient } from "@/lib/git-client";
import type { GitOperation, GitStatus } from "@/lib/types";

// Treat both "model doesn't exist" and "quota exhausted" as triggers to
// auto-pick a different model. limit:0 means the key has no free quota for
// that model at all — pick something more generous instead.
function shouldFallbackModel(message: string): boolean {
  return /not found|not supported|not available|unsupported model|quota|limit:\s*0|resource_exhausted|rate.?limit/i.test(
    message,
  );
}

// Prefer models with the widest free-tier availability so the auto-fallback
// lands on one that actually works for first-time keys.
const PREFERENCE_PATTERNS: RegExp[] = [
  /^gemini-1\.5-flash-8b$/,
  /^gemini-1\.5-flash$/,
  /^gemini-1\.5-flash/,
  /^gemini-1\.5-pro/,
  /^gemini-2\.5-flash-lite/,
  /^gemini-2\.0-flash-lite/,
  /^gemini-2\.5-flash/,
  /^gemini-2\.0-flash/,
];

function pickFallbackModel(
  available: ListedModel[],
  exclude: ReadonlySet<string>,
): ListedModel | null {
  const pool = available.filter((m) => !exclude.has(m.id));
  if (pool.length === 0) return null;
  for (const pattern of PREFERENCE_PATTERNS) {
    const match = pool.find((m) => pattern.test(m.id));
    if (match) return match;
  }
  return pool[0];
}

interface CommitPanelProps {
  repositoryPath: string;
  status: GitStatus | undefined;
  busy: boolean;
  operation: GitOperation;
  onCommit: (message: string) => Promise<unknown>;
}

// Single-responsibility: capture a commit message (manually or via Gemini)
// and trigger the commit.
export function CommitPanel({
  repositoryPath,
  status,
  busy,
  operation,
  onCommit,
}: CommitPanelProps) {
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const { settings, update } = useSettings();

  const isCommitting = operation === "committing";
  const stagedCount = (status?.files ?? []).filter((f) => f.staged).length;
  const canCommit = stagedCount > 0 && message.trim().length > 0;
  const hasApiKey = settings.geminiApiKey.trim().length > 0;

  const handleCommit = async () => {
    if (!canCommit) return;
    await onCommit(message.trim());
    setMessage("");
  };

  const handleGenerate = async () => {
    if (generating) return;
    if (!hasApiKey) {
      toast.error("Add your Gemini API key in Settings first.");
      return;
    }
    if (stagedCount === 0) {
      toast.info("Stage at least one file to generate a message.");
      return;
    }

    setGenerating(true);
    try {
      const diffRes = await gitClient.getStagedDiff(repositoryPath);
      if (!diffRes.success) {
        throw new Error(diffRes.stderr.trim() || "git diff --cached failed");
      }

      const tried = new Set<string>();
      let currentModel = settings.geminiModel;
      let availableCache: ListedModel[] | null = null;
      let generated: string | null = null;

      while (true) {
        tried.add(currentModel);
        try {
          generated = await generateCommitMessage(
            settings.geminiApiKey,
            currentModel,
            diffRes.stdout,
          );
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!shouldFallbackModel(msg)) throw err;

          // Fetch the live list once and try the next-best model we haven't
          // already attempted. Stop when we run out of candidates.
          availableCache ??= await listGeminiModels(settings.geminiApiKey);
          const next = pickFallbackModel(availableCache, tried);
          if (!next) {
            throw new Error(
              `No working Gemini model for this key. Last error: ${msg}`,
            );
          }
          toast.info(`Switched model to ${next.id}`, {
            description: `${currentModel} was unavailable or out of quota.`,
          });
          currentModel = next.id;
        }
      }

      if (currentModel !== settings.geminiModel) {
        update({ geminiModel: currentModel });
      }
      setMessage(generated);
      toast.success("Commit message generated");
    } catch (err) {
      toast.error("Generation failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor="commit-message">Commit message</Label>
        <span className="text-xs text-muted-foreground">
          {stagedCount} file{stagedCount === 1 ? "" : "s"} staged
        </span>
      </div>
      <Textarea
        id="commit-message"
        placeholder="Describe your change…  ⌘↵ to commit"
        className="placeholder:text-xs"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            if (canCommit && !busy) void handleCommit();
          }
        }}
        rows={3}
        disabled={busy || generating}
      />
      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleGenerate}
          loading={generating}
          loadingText="Generating…"
          disabled={busy || stagedCount === 0}
          title={
            !hasApiKey ? "Add your Gemini API key in Settings" : undefined
          }
        >
          <Sparkles className="size-3.5" />
          Generate with Gemini
        </Button>

        <Button
          onClick={handleCommit}
          loading={isCommitting}
          loadingText="Committing…"
          disabled={!canCommit || (busy && !isCommitting)}
        >
          <GitCommitHorizontal className="h-4 w-4" />
          Commit
        </Button>
      </div>
    </section>
  );
}
