import { Suspense, lazy, useState } from "react";
import { KeyRound, Settings as SettingsIcon, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconHint } from "@/components/IconHint";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

import { Logo } from "./Logo";

// Single-responsibility: keep SettingsDialog out of the initial bundle —
// users open it rarely. Lazy-load on first state flip.
const SettingsDialog = lazy(() =>
  import("./SettingsDialog").then((m) => ({ default: m.SettingsDialog })),
);

// Single-responsibility: bottom sidebar slot showing the active profile,
// integration status (SSH key + AI key) and a settings shortcut. Replaces
// the older "Made with ❤" credit line.
export function SidebarFooter() {
  const { settings } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const active = settings.profiles.find((p) => p.id === settings.activeProfileId);
  const hasSshKey = !!active?.sshKeyPath?.trim();
  const hasGeminiKey = settings.geminiApiKey.trim().length > 0;

  return (
    <>
      <footer className="flex items-center gap-2.5 border-t bg-muted/20 px-3 py-2.5">
        <Avatar name={active?.name ?? null} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold leading-tight">
            {active?.name ?? "No profile"}
          </p>
          <div className="mt-1 flex items-center gap-1">
            <StatusChip
              icon={<KeyRound className="size-2.5" strokeWidth={2.5} />}
              label={hasSshKey ? "SSH" : "System SSH"}
              active={hasSshKey}
              title={
                hasSshKey
                  ? `Using ${active?.sshKeyPath}`
                  : "No profile selected — using your system's default SSH config"
              }
            />
            <StatusChip
              icon={<Sparkles className="size-2.5" strokeWidth={2.5} />}
              label="AI"
              active={hasGeminiKey}
              title={
                hasGeminiKey
                  ? "Gemini key configured"
                  : "No Gemini key — AI commit messages disabled"
              }
            />
          </div>
        </div>

        <IconHint label="Settings" side="top">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            <SettingsIcon className="size-3.5" />
          </Button>
        </IconHint>
      </footer>

      {settingsOpen ? (
        <Suspense fallback={null}>
          <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        </Suspense>
      ) : null}
    </>
  );
}

// Single-responsibility: 28px round avatar. Shows initials when a profile
// is active; falls back to the brand mark so the footer always feels
// branded even before the user configures anything.
function Avatar({ name }: { name: string | null }) {
  const initials = name ? deriveInitials(name) : null;
  return (
    <div
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ring-border",
        initials
          ? "bg-gradient-to-br from-foreground/15 to-foreground/5 text-foreground"
          : "bg-muted text-foreground",
      )}
    >
      {initials ? (
        <span className="text-[10px] font-semibold leading-none">
          {initials}
        </span>
      ) : (
        <Logo size={16} />
      )}
    </div>
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

// Single-responsibility: tiny dual-state chip. "active" lights up the icon
// + label and gives a soft tinted background; otherwise it's muted, signaling
// the integration is available but not configured.
function StatusChip({
  icon,
  label,
  active,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  title: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-[16px] items-center gap-1 rounded-full px-1.5 text-[9.5px] font-medium leading-none",
        active
          ? "bg-foreground/10 text-foreground"
          : "bg-transparent text-muted-foreground/70 ring-1 ring-inset ring-border",
      )}
    >
      {icon}
      {label}
    </span>
  );
}
