import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCcw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "@/hooks/use-settings";
import { generateCommitMessageWithFallback } from "@/lib/gemini";
import { gitClient } from "@/lib/git-client";

type Phase = "generating" | "ready" | "error";

interface GenerateCommitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositoryPath: string;
  onUse: (message: string) => void;
}

// Single-responsibility: AI commit-message flow as an explicit review step.
// Generates on open, lets the user edit or regenerate, and only writes into
// the commit box when they accept. Model fallback happens transparently and
// the switch is surfaced inline instead of as a toast.
export function GenerateCommitDialog({
  open,
  onOpenChange,
  repositoryPath,
  onUse,
}: GenerateCommitDialogProps) {
  const { settings, update } = useSettings();
  const [phase, setPhase] = useState<Phase>("generating");
  const [message, setMessage] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [switchedFrom, setSwitchedFrom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setPhase("generating");
    setError(null);
    setSwitchedFrom(null);
    try {
      const diffRes = await gitClient.getStagedDiff(repositoryPath);
      if (!diffRes.success) {
        throw new Error(diffRes.stderr.trim() || "git diff --cached failed");
      }
      const result = await generateCommitMessageWithFallback(
        settings.geminiApiKey,
        settings.geminiModel,
        diffRes.stdout,
        (from) => setSwitchedFrom(from),
      );
      if (result.model !== settings.geminiModel) {
        update({ geminiModel: result.model });
      }
      setMessage(result.message);
      setModel(result.model);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [repositoryPath, settings.geminiApiKey, settings.geminiModel, update]);

  // Kick off exactly once per dialog open — `generate`'s identity changes
  // when the fallback persists a new model, which must not retrigger it.
  const startedRef = useRef(false);
  useEffect(() => {
    if (open && !startedRef.current) {
      startedRef.current = true;
      void generate();
    }
    if (!open) startedRef.current = false;
  }, [open, generate]);

  const canUse = phase === "ready" && message.trim().length > 0;

  const handleUse = () => {
    if (!canUse) return;
    onUse(message.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" />
            AI commit message
          </DialogTitle>
          <DialogDescription>
            Gemini drafts a Conventional Commits message from your staged
            diff. Review and edit it before using.
          </DialogDescription>
        </DialogHeader>

        {phase === "generating" ? (
          <div className="flex h-36 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/30 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            Analyzing staged changes…
          </div>
        ) : phase === "error" ? (
          <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-destructive">
              Generation failed
            </p>
            <p className="break-words text-xs text-muted-foreground">
              {error}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleUse();
                }
              }}
              rows={6}
              className="resize-none font-mono text-xs"
              aria-label="Generated commit message"
              autoFocus
            />
            {model ? (
              <p className="text-[11px] text-muted-foreground">
                Generated with <span className="font-mono">{model}</span>
                {switchedFrom ? (
                  <>
                    {" "}
                    — switched from{" "}
                    <span className="font-mono">{switchedFrom}</span>{" "}
                    (unavailable or out of quota)
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button
            size="sm"
            variant="outline"
            className="sm:mr-auto"
            onClick={() => void generate()}
            disabled={phase === "generating"}
          >
            <RefreshCcw className="size-3.5" />
            Regenerate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleUse} disabled={!canUse}>
            Use message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
