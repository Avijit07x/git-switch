import { useEffect, useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { Download, FolderOpen, Globe, KeyRound } from "lucide-react";

import { LogoSpinner } from "./LogoSpinner";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/use-settings";
import { gitClient } from "@/lib/git-client";
import { repositoryFromPath } from "@/lib/repository-from-path";
import type { Repository } from "@/lib/types";

interface CloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloned: (repo: Repository) => void;
}

function deriveDirName(url: string): string {
  const last = url.trim().split("/").pop() ?? "";
  return last.replace(/\.git$/, "") || "repository";
}

function isSshUrl(url: string): boolean {
  return /^git@|^ssh:\/\//.test(url.trim());
}

export function CloneDialog({ open, onOpenChange, onCloned }: CloneDialogProps) {
  const { settings } = useSettings();
  const [url, setUrl] = useState("");
  const [parentDir, setParentDir] = useState("");
  const [profileId, setProfileId] = useState<string>("none");
  const [busy, setBusy] = useState(false);

  // Seed default parent dir to ~/Projects (or home) on first open.
  useEffect(() => {
    if (!open) return;
    setUrl("");
    setProfileId(settings.activeProfileId ?? "none");
    setBusy(false);
    if (!parentDir) {
      void homeDir().then((h) => {
        setParentDir(`${h.replace(/\/$/, "")}/Projects`);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sshDetected = useMemo(() => isSshUrl(url), [url]);
  const dirName = useMemo(() => deriveDirName(url), [url]);
  const targetPreview = useMemo(() => {
    if (!url.trim() || !parentDir.trim()) return null;
    return `${parentDir.replace(/\/$/, "")}/${dirName}`;
  }, [url, parentDir, dirName]);

  const pickFolder = async () => {
    const selection = await openDialog({
      directory: true,
      multiple: false,
      title: "Choose a parent folder",
    });
    if (typeof selection === "string") setParentDir(selection);
  };

  const handleClone = async () => {
    if (!url.trim() || !targetPreview) return;
    const profile = settings.profiles.find((p) => p.id === profileId);
    const sshKey = profile?.sshKeyPath?.trim() || undefined;

    setBusy(true);
    try {
      const res = await gitClient.cloneRepository(url.trim(), targetPreview, sshKey);
      if (!res.success) {
        toast.error("Clone failed", {
          description: res.stderr.trim().split("\n")[0] || "Check the URL or your SSH key.",
        });
        return;
      }
      const toplevel = await gitClient.validateRepository(targetPreview);
      const repo = repositoryFromPath(toplevel);
      onCloned(repo);
      toast.success(`Cloned ${repo.name}`, {
        description: profile?.name ? `Used profile: ${profile.name}` : undefined,
      });
      onOpenChange(false);
    } catch (err) {
      toast.error("Clone failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Download className="size-4" />
            Clone repository
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Paste a Git URL — HTTPS or SSH — and we'll clone it into the
            folder you choose.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          {/* URL */}
          <Field
            label="Repository URL"
            badge={
              url.trim() ? (
                sshDetected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <KeyRound className="size-2.5" /> SSH
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <Globe className="size-2.5" /> HTTPS
                  </span>
                )
              ) : null
            }
          >
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="git@github.com:user/repo.git"
              spellCheck={false}
              autoComplete="off"
              className="font-mono text-xs"
            />
          </Field>

          {/* Destination */}
          <Field label="Save to">
            <div className="flex gap-2">
              <Input
                value={parentDir}
                onChange={(e) => setParentDir(e.target.value)}
                placeholder="/Users/you/Projects"
                spellCheck={false}
                className="flex-1 font-mono text-xs"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={pickFolder}
                aria-label="Choose folder"
              >
                <FolderOpen className="size-4" />
              </Button>
            </div>
            {targetPreview ? (
              <p className="text-[11px] text-muted-foreground">
                Will create{" "}
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                  {targetPreview}
                </span>
              </p>
            ) : null}
          </Field>

          {/* Profile picker — only show when there's something to pick. */}
          {settings.profiles.length > 0 ? (
            <Field
              label="SSH identity"
              hint={
                sshDetected
                  ? "Select which key to use for this SSH clone."
                  : "Only matters for SSH URLs — ignored for HTTPS."
              }
            >
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Use system default</SelectItem>
                  {settings.profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-medium">{p.name}</span>
                      {p.sshKeyPath ? (
                        <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                          {p.sshKeyPath.split("/").slice(-1)[0]}
                        </span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              No SSH profiles yet — using your system's default SSH config.
              Add a profile in Settings to clone with a specific key.
            </p>
          )}
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={handleClone}
            disabled={!url.trim() || !parentDir.trim() || busy}
            className="min-w-[100px]"
          >
            {busy ? (
              <>
                <LogoSpinner size={16} className="text-current" /> Cloning…
              </>
            ) : (
              <>
                <Download className="size-4" /> Clone
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Field primitive — keeps the dialog rows visually consistent ─────────

function Field({
  label,
  badge,
  hint,
  children,
}: {
  label: string;
  badge?: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label className="text-[12px]">{label}</Label>
        {badge}
      </div>
      {children}
      {hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
