import { Suspense, lazy, useState } from "react";
import {
  FolderGit2,
  FolderTree,
  Settings2,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { SidebarView } from "@/stores/use-ui-store";
import { IconHint } from "./IconHint";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const SettingsDialog = lazy(() =>
  import("./SettingsDialog").then((m) => ({ default: m.SettingsDialog })),
);

export type { SidebarView };

interface ActivityBarProps {
  view: SidebarView;
  sidebarOpen: boolean;
  onSelectView: (view: SidebarView) => void;
}

const VIEWS: ReadonlyArray<{
  id: SidebarView;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "repos", label: "Repositories", icon: FolderGit2 },
  { id: "groups", label: "Groups", icon: FolderTree },
];

export function ActivityBar({
  view,
  sidebarOpen,
  onSelectView,
}: ActivityBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <nav className="flex w-12 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar">
      <div
        className="flex h-12 w-full shrink-0 items-center justify-center"
        data-tauri-drag-region
      >
        <Logo size={20} className="text-foreground" />
      </div>

      <div className="flex w-full flex-col items-center gap-1 pt-1">
        {VIEWS.map(({ id, label, icon: Icon }) => {
          const active = id === view && sidebarOpen;
          return (
            <IconHint key={id} label={label} side="right">
              <button
                type="button"
                className={cn(
                  "relative flex size-10 items-center justify-center rounded-lg transition-colors duration-150",
                  active
                    ? "bg-foreground/8 text-foreground"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                )}
                onClick={() => onSelectView(id)}
                aria-pressed={active}
                aria-label={label}
              >
                {active ? (
                  <span
                    aria-hidden
                    className="absolute -left-1 top-1/2 h-5 w-0.75 -translate-y-1/2 rounded-r-full bg-primary"
                  />
                ) : null}
                <Icon className="size-4.5" strokeWidth={1.75} />
              </button>
            </IconHint>
          );
        })}
      </div>

      <div className="mt-auto flex w-full flex-col items-center gap-1 pb-2">
        <ThemeToggle />
        <IconHint label="Settings" side="right">
          <button
            type="button"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            <Settings2 className="size-3.5" />
          </button>
        </IconHint>
      </div>

      {settingsOpen ? (
        <Suspense fallback={null}>
          <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        </Suspense>
      ) : null}
    </nav>
  );
}
