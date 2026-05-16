import { useMemo, useState, type ReactNode } from "react";
import { GitBranch as GitBranchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { GitBranchList, GitOperation } from "@/lib/types";

import { BranchCombobox, type BranchOption } from "./BranchCombobox";

interface BranchSelectorProps {
  branches: GitBranchList | undefined;
  loading: boolean;
  busy: boolean;
  operation: GitOperation;
  onSwitch: (branch: string) => void;
  onCreateFromRemote: (localName: string, remoteRef: string) => void;
}

// Single-responsibility: pick a local branch to switch to, or check out a
// remote branch as a new local branch. Uses a searchable combobox so the
// user can filter long branch lists by typing.
export function BranchSelector({
  branches,
  loading,
  busy,
  operation,
  onSwitch,
  onCreateFromRemote,
}: BranchSelectorProps) {
  const [pendingLocal, setPendingLocal] = useState<string>("");
  const [pendingRemote, setPendingRemote] = useState<string>("");

  const isSwitching = operation === "switching";
  const isCreating = operation === "creatingBranch";

  const localItems = branches?.local ?? [];
  const remoteItems = useMemo(() => {
    const localNames = new Set(localItems.map((b) => b.name));
    return (branches?.remote ?? []).filter((r) => {
      const short = r.name.includes("/")
        ? r.name.split("/").slice(1).join("/")
        : r.name;
      return !localNames.has(short);
    });
  }, [branches, localItems]);

  const localOptions: BranchOption[] = useMemo(
    () =>
      localItems.map((b) => ({
        value: b.name,
        label: b.name,
        hint: b.upstream ? `→ ${b.upstream}` : undefined,
      })),
    [localItems],
  );

  const remoteOptions: BranchOption[] = useMemo(
    () => remoteItems.map((b) => ({ value: b.name, label: b.name })),
    [remoteItems],
  );

  const current = branches?.current ?? "";
  const localValue = pendingLocal || current || undefined;
  const remoteValue = pendingRemote || undefined;

  const handleSwitch = () => {
    if (pendingLocal && pendingLocal !== current) onSwitch(pendingLocal);
  };

  const handleCheckoutRemote = () => {
    if (!pendingRemote) return;
    const localName = pendingRemote.includes("/")
      ? pendingRemote.split("/").slice(1).join("/")
      : pendingRemote;
    onCreateFromRemote(localName, pendingRemote);
  };

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Field label="Local branch">
        <BranchCombobox
          value={localValue}
          onChange={setPendingLocal}
          options={localOptions}
          placeholder="Select branch"
          searchPlaceholder="Search local branches…"
          emptyMessage="No matching branches."
          groupHeading="Local branches"
          disabled={loading || busy || localOptions.length === 0}
          triggerIcon={
            <GitBranchIcon className="size-3.5 shrink-0 opacity-60" />
          }
        />

        <Button
          size="sm"
          className="shrink-0"
          onClick={handleSwitch}
          loading={isSwitching}
          loadingText="Switching…"
          disabled={
            (busy && !isSwitching) ||
            loading ||
            !pendingLocal ||
            pendingLocal === current
          }
        >
          Switch
        </Button>
      </Field>

      <Field label="Remote branch (check out as local)">
        <BranchCombobox
          value={remoteValue}
          onChange={setPendingRemote}
          options={remoteOptions}
          placeholder="Select remote branch"
          searchPlaceholder="Search remote branches…"
          emptyMessage="No matching branches."
          groupHeading="Remote branches"
          disabled={loading || busy || remoteOptions.length === 0}
        />

        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={handleCheckoutRemote}
          loading={isCreating}
          loadingText="Checking out…"
          disabled={(busy && !isCreating) || loading || !pendingRemote}
        >
          Check out
        </Button>
      </Field>
    </div>
  );
}

// Single-responsibility: label + control-row layout for one branch field.
interface FieldProps {
  label: string;
  children: ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div className="min-w-0 space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  );
}
