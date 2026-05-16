import { useCallback, useEffect, useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IconHint } from "@/components/IconHint";
import { useSettings } from "@/hooks/use-settings";
import { listGeminiModels, type ListedModel } from "@/lib/gemini";
import { openExternal } from "@/lib/system";
import {
  GEMINI_MODELS,
  newProfileId,
  type GeminiModel,
} from "@/lib/settings-store";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type VerifyState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; models: ListedModel[] }
  | { kind: "error"; message: string };

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { settings, update } = useSettings();

  const [draftKey, setDraftKey] = useState(settings.geminiApiKey);
  const [draftModel, setDraftModel] = useState<string>(settings.geminiModel);
  const [verify, setVerify] = useState<VerifyState>({ kind: "idle" });

  const [draftProfiles, setDraftProfiles] = useState<Profile[]>(
    settings.profiles,
  );
  const [draftActiveId, setDraftActiveId] = useState<string | undefined>(
    settings.activeProfileId,
  );

  useEffect(() => {
    if (!open) return;
    setDraftKey(settings.geminiApiKey);
    setDraftModel(settings.geminiModel);
    setDraftProfiles(settings.profiles);
    setDraftActiveId(settings.activeProfileId);
    setVerify({ kind: "idle" });
  }, [open, settings]);

  // Debounced Gemini key verification.
  useEffect(() => {
    if (!draftKey.trim()) {
      setVerify({ kind: "idle" });
      return;
    }
    setVerify({ kind: "loading" });
    const id = setTimeout(async () => {
      try {
        const models = await listGeminiModels(draftKey);
        setVerify({ kind: "ok", models });
        if (models.length > 0 && !models.some((m) => m.id === draftModel)) {
          setDraftModel(models[0].id);
        }
      } catch (err) {
        setVerify({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }, 600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const availableModels = useMemo(() => {
    if (verify.kind === "ok") return verify.models;
    return GEMINI_MODELS.map((id) => ({ id, displayName: id }));
  }, [verify]);

  const addProfile = () =>
    setDraftProfiles((prev) => [
      ...prev,
      { id: newProfileId(), name: `Profile ${prev.length + 1}`, sshKeyPath: "" },
    ]);

  const updateProfile = (id: string, patch: Partial<Profile>) =>
    setDraftProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );

  const removeProfile = (id: string) => {
    setDraftProfiles((prev) => prev.filter((p) => p.id !== id));
    if (draftActiveId === id) setDraftActiveId(undefined);
  };

  const pickKey = useCallback(async (id: string) => {
    // Resolve the actual home dir — macOS Finder dialogs don't tilde-expand.
    let defaultPath: string | undefined;
    try {
      const home = await homeDir();
      defaultPath = `${home.replace(/\/$/, "")}/.ssh`;
    } catch {
      /* fall through with undefined */
    }
    const result = await openDialog({
      multiple: false,
      directory: false,
      title: "Select SSH private key (⌘⇧. to show hidden folders)",
      defaultPath,
    });
    if (typeof result === "string") updateProfile(id, { sshKeyPath: result });
  }, []);

  const handleSave = () => {
    update({
      geminiApiKey: draftKey.trim(),
      geminiModel: draftModel as GeminiModel,
      profiles: draftProfiles.map((p) => ({
        ...p,
        name: p.name.trim() || "Profile",
        sshKeyPath: p.sshKeyPath?.trim() || undefined,
      })),
      activeProfileId: draftActiveId,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-base">Settings</DialogTitle>
          <DialogDescription className="text-[12px]">
            Stored locally on this machine. Private keys never leave disk.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="profiles" className="flex flex-col">
          <div className="border-b px-6 pt-3">
            <TabsList className="h-9 bg-transparent p-0">
              <TabsTrigger
                value="profiles"
                className="gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 pb-2 pt-1 text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <UserRound className="size-3.5" />
                Profiles
              </TabsTrigger>
              <TabsTrigger
                value="ai"
                className="gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 pb-2 pt-1 text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <Sparkles className="size-3.5" />
                AI
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Fixed-height body so swapping tabs doesn't resize the dialog. */}
          <div className="h-[460px]">
            <TabsContent value="profiles" className="m-0 h-full">
              <ScrollArea className="h-full">
                <ProfilesTab
                  profiles={draftProfiles}
                  activeId={draftActiveId}
                  onAdd={addProfile}
                  onUpdate={updateProfile}
                  onRemove={removeProfile}
                  onSetActive={setDraftActiveId}
                  onPickKey={pickKey}
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="ai" className="m-0 h-full">
              <ScrollArea className="h-full">
                <AITab
                  draftKey={draftKey}
                  setDraftKey={setDraftKey}
                  draftModel={draftModel}
                  setDraftModel={setDraftModel}
                  verify={verify}
                  availableModels={availableModels}
                />
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="border-t px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Profiles tab ─────────────────────────────────────────────────────────

function ProfilesTab({
  profiles,
  activeId,
  onAdd,
  onUpdate,
  onRemove,
  onSetActive,
  onPickKey,
}: {
  profiles: Profile[];
  activeId: string | undefined;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Profile>) => void;
  onRemove: (id: string) => void;
  onSetActive: (id: string | undefined) => void;
  onPickKey: (id: string) => void;
}) {
  return (
    <div className="space-y-4 px-6 py-5">
      <SectionIntro
        icon={<KeyRound className="size-3.5" />}
        title="SSH profiles"
        body={
          <>
            One named profile per identity (e.g. Work / Personal). Each profile
            points at an SSH private key on disk — the file stays put, we just
            store the path. The Finder picker opens at{" "}
            <code className="rounded bg-muted px-1 text-[11px]">~/.ssh</code>;
            press{" "}
            <kbd className="rounded border bg-muted px-1 text-[10px]">⌘⇧.</kbd>{" "}
            to reveal hidden folders, or paste the path directly.
          </>
        }
      />

      <div className="space-y-2">
        {profiles.length === 0 ? (
          <EmptyState
            icon={<UserRound className="size-5" />}
            title="No profiles yet"
            body="Add one to clone repos with a specific SSH key."
            action={
              <Button size="sm" onClick={onAdd}>
                <Plus className="size-3.5" /> Add profile
              </Button>
            }
          />
        ) : (
          <>
            {profiles.map((p) => (
              <ProfileCard
                key={p.id}
                profile={p}
                isDefault={p.id === activeId}
                onUpdate={(patch) => onUpdate(p.id, patch)}
                onRemove={() => onRemove(p.id)}
                onMakeDefault={() => onSetActive(p.id)}
                onPickKey={() => onPickKey(p.id)}
              />
            ))}
            <Button
              size="sm"
              variant="outline"
              className="w-full border-dashed"
              onClick={onAdd}
            >
              <Plus className="size-3.5" /> Add another profile
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function ProfileCard({
  profile,
  isDefault,
  onUpdate,
  onRemove,
  onMakeDefault,
  onPickKey,
}: {
  profile: Profile;
  isDefault: boolean;
  onUpdate: (patch: Partial<Profile>) => void;
  onRemove: () => void;
  onMakeDefault: () => void;
  onPickKey: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card/40 p-3 transition-colors",
        isDefault && "border-foreground/40 bg-card/80",
      )}
    >
      <div className="flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <UserRound className="size-3.5" />
        </div>
        <Input
          value={profile.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Profile name"
          className="h-8 border-transparent bg-transparent px-2 text-sm font-medium focus-visible:border-input"
        />
        {isDefault ? (
          <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-background">
            default
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-muted-foreground"
            onClick={onMakeDefault}
          >
            Make default
          </Button>
        )}
        <IconHint label="Delete profile" side="left">
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label="Delete profile"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </IconHint>
      </div>

      <div className="mt-2 flex items-center gap-2 pl-9">
        <KeyRound className="size-3 shrink-0 text-muted-foreground" />
        <Input
          value={profile.sshKeyPath ?? ""}
          onChange={(e) => onUpdate({ sshKeyPath: e.target.value })}
          placeholder="/Users/you/.ssh/id_ed25519"
          className="h-7 font-mono text-[11px]"
          spellCheck={false}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0"
          onClick={onPickKey}
        >
          Browse…
        </Button>
      </div>
    </div>
  );
}

// ─── AI tab ───────────────────────────────────────────────────────────────

function AITab({
  draftKey,
  setDraftKey,
  draftModel,
  setDraftModel,
  verify,
  availableModels,
}: {
  draftKey: string;
  setDraftKey: (v: string) => void;
  draftModel: string;
  setDraftModel: (v: string) => void;
  verify: VerifyState;
  availableModels: ListedModel[];
}) {
  return (
    <div className="space-y-5 px-6 py-5">
      <SectionIntro
        icon={<Sparkles className="size-3.5" />}
        title="Gemini commit messages"
        body="Paste your API key once. The ✨ button in the commit panel will turn your staged diff into a Conventional Commits message."
      />

      <div className="space-y-2">
        <Label htmlFor="gemini-key" className="text-[12px]">
          API key
        </Label>
        <Input
          id="gemini-key"
          type="password"
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          placeholder="AIza…"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="flex items-center justify-between gap-2">
          <VerifyStatus state={verify} />
          <button
            type="button"
            onClick={() =>
              void openExternal("https://aistudio.google.com/apikey")
            }
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Get a free key
            <ExternalLink className="size-3" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="gemini-model" className="text-[12px]">
          Model
        </Label>
        <Select
          value={draftModel}
          onValueChange={setDraftModel}
          disabled={verify.kind === "loading" || availableModels.length === 0}
        >
          <SelectTrigger id="gemini-model">
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            {availableModels.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <span className="font-mono">{m.id}</span>
                {m.displayName !== m.id ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {m.displayName}
                  </span>
                ) : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          {verify.kind === "ok"
            ? `Showing ${availableModels.length} models your key can use.`
            : "Once your key verifies, this list filters to models your account can invoke."}
        </p>
      </div>
    </div>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────

function SectionIntro({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-6 py-10 text-center">
      <div className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-xs text-[12px] text-muted-foreground">{body}</p>
      <div className="mt-2">{action}</div>
    </div>
  );
}

function VerifyStatus({ state }: { state: VerifyState }) {
  if (state.kind === "idle")
    return <span className="text-[11px] text-muted-foreground">&nbsp;</span>;
  if (state.kind === "loading") {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Checking key…
      </p>
    );
  }
  if (state.kind === "ok") {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3" />
        {state.models.length} model{state.models.length === 1 ? "" : "s"} available
      </p>
    );
  }
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-destructive">
      <XCircle className="size-3 shrink-0" />
      <span className="truncate" title={state.message}>
        {state.message}
      </span>
    </p>
  );
}
