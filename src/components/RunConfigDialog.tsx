import { useEffect, useMemo, useState } from "react";
import { Plus, Plug, Terminal, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IconHint } from "@/components/IconHint";
import { getRunTargets, newTargetId } from "@/lib/run-targets";
import type { Repository, RunTarget } from "@/lib/types";

interface RunConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repository: Repository;
  onSave: (patch: { runTargets: RunTarget[]; port: number | undefined }) => void;
}

interface Draft {
  id: string;
  name: string;
  command: string;
  restartCommand: string;
  port: string;
}

function toDraft(t: RunTarget): Draft {
  return {
    id: t.id,
    name: t.name,
    command: t.command,
    restartCommand: t.restartCommand ?? "",
    port: t.port?.toString() ?? "",
  };
}

function parsePort(value: string): number | undefined {
  const n = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : undefined;
}

// Single-responsibility: edit a repository's run targets (multi-command).
// Backward compat: when the repo only has legacy fields, the dialog seeds
// the list with a single "main" target derived from them.
export function RunConfigDialog({
  open,
  onOpenChange,
  repository,
  onSave,
}: RunConfigDialogProps) {
  const [targets, setTargets] = useState<Draft[]>([]);
  const [fallbackPort, setFallbackPort] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    const initial = getRunTargets(repository);
    setTargets(
      initial.length > 0
        ? initial.map(toDraft)
        : [
            {
              id: newTargetId(),
              name: "main",
              command: "",
              restartCommand: "",
              port: "",
            },
          ],
    );
    setFallbackPort(repository.port?.toString() ?? "");
  }, [open, repository]);

  const updateAt = (idx: number, patch: Partial<Draft>) => {
    setTargets((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    );
  };

  const addTarget = () => {
    setTargets((prev) => [
      ...prev,
      {
        id: newTargetId(),
        name: `target ${prev.length + 1}`,
        command: "",
        restartCommand: "",
        port: "",
      },
    ]);
  };

  const removeAt = (idx: number) => {
    setTargets((prev) => prev.filter((_, i) => i !== idx));
  };

  const canSave = useMemo(
    () => targets.some((t) => t.command.trim().length > 0),
    [targets],
  );

  const handleSave = () => {
    const cleaned: RunTarget[] = targets
      .map((t) => ({
        id: t.id,
        name: t.name.trim() || "target",
        command: t.command.trim(),
        restartCommand: t.restartCommand.trim() || undefined,
        port: parsePort(t.port),
      }))
      .filter((t) => t.command.length > 0);

    onSave({
      runTargets: cleaned,
      port: parsePort(fallbackPort),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Terminal className="size-4" />
            Run configuration
            <span
              className="ml-1 truncate text-[12px] font-normal text-muted-foreground"
              title={repository.name}
            >
              · {repository.name}
            </span>
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            One repo, multiple commands. Each target gets its own terminal tab
            and runs in parallel under an interactive login shell.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[440px]">
          <div className="space-y-3 px-6 py-5">
            {targets.map((t, idx) => (
              <TargetCard
                key={t.id}
                index={idx}
                draft={t}
                canRemove={targets.length > 1}
                onChange={(patch) => updateAt(idx, patch)}
                onRemove={() => removeAt(idx)}
              />
            ))}

            <button
              type="button"
              onClick={addTarget}
              className="group flex w-full items-center justify-center gap-2 rounded-md border border-dashed bg-muted/10 px-3 py-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/30 hover:text-foreground"
            >
              <Plus className="size-3.5" />
              Add another target
            </button>
          </div>
        </ScrollArea>

        <div className="space-y-2 border-t bg-muted/15 px-6 py-4">
          <div className="flex items-center gap-2">
            <Plug className="size-3.5 text-foreground opacity-70" />
            <Label htmlFor="fallback-port" className="text-[12px]">
              Repo-level fallback port
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <Input
              id="fallback-port"
              value={fallbackPort}
              onChange={(e) => setFallbackPort(e.target.value)}
              placeholder="3000"
              type="number"
              min={1}
              max={65535}
              className="h-8 max-w-[120px] font-mono"
            />
            <p className="text-[11px] leading-snug text-muted-foreground">
              Used by any target without its own port. Also read from{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                .env
              </code>{" "}
              if blank.
            </p>
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave} className="min-w-[80px]">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Target card primitive ─────────────────────────────────────────────────
// Single-responsibility: edit one run target. Visually framed so multiple
// targets feel distinct and the form doesn't read as a wall of inputs.

interface TargetCardProps {
  index: number;
  draft: Draft;
  canRemove: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}

function TargetCard({
  index,
  draft,
  canRemove,
  onChange,
  onRemove,
}: TargetCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow focus-within:shadow-md">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-semibold tabular-nums text-foreground">
          {index + 1}
        </span>
        <Input
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="target name"
          spellCheck={false}
          className="h-7 max-w-[180px] border-transparent bg-transparent px-2 text-[13px] font-semibold shadow-none focus-visible:border-input focus-visible:bg-background"
        />
        <div className="ml-auto flex items-center gap-2">
          <Input
            value={draft.port}
            onChange={(e) => onChange({ port: e.target.value })}
            placeholder="port"
            spellCheck={false}
            type="number"
            min={1}
            max={65535}
            className="h-7 w-[100px] font-mono text-xs"
          />
          <IconHint label="Remove target" side="left">
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground hover:text-destructive disabled:opacity-30"
              onClick={onRemove}
              disabled={!canRemove}
              aria-label="Remove target"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </IconHint>
        </div>
      </div>

      <div className="space-y-3 px-3 py-3">
        <Field label="Run command" required>
          <Input
            value={draft.command}
            onChange={(e) => onChange({ command: e.target.value })}
            placeholder="yarn dev:worker"
            spellCheck={false}
            className="h-8 font-mono text-xs"
          />
        </Field>
        <Field
          label="Restart command"
          optional
          hint="Sent to the running PTY when you hit Restart. Falls back to the run command."
        >
          <Input
            value={draft.restartCommand}
            onChange={(e) => onChange({ restartCommand: e.target.value })}
            placeholder="rs"
            spellCheck={false}
            className="h-8 font-mono text-xs"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  optional,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Label className="text-[11px] font-medium">{label}</Label>
        {required ? (
          <span className="text-[10px] text-destructive">required</span>
        ) : null}
        {optional ? (
          <span className="text-[10px] text-muted-foreground">optional</span>
        ) : null}
      </div>
      {children}
      {hint ? (
        <p className="text-[10.5px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
