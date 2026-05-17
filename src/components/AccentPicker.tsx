import { Check, Moon, Sun } from "lucide-react";

import { useTheme } from "@/hooks/use-theme";
import { ACCENTS, type Accent } from "@/lib/theme-store";
import { cn } from "@/lib/utils";

interface SwatchPreset {
  id: Accent;
  label: string;
  /** Inline CSS color used purely for the swatch dot. Independent from the
   *  actual CSS-var pipeline so the swatches always render even when the
   *  user is previewing a different accent. */
  color: string;
}

const SWATCHES: ReadonlyArray<SwatchPreset> = [
  { id: "default", label: "Neutral", color: "oklch(0.22 0.005 250)" },
  { id: "orange", label: "Orange", color: "oklch(0.7 0.19 45)" },
  { id: "blue", label: "Blue", color: "oklch(0.62 0.19 255)" },
  { id: "green", label: "Green", color: "oklch(0.6 0.16 155)" },
  { id: "rose", label: "Rose", color: "oklch(0.62 0.22 18)" },
  { id: "violet", label: "Violet", color: "oklch(0.58 0.22 295)" },
];

// Single-responsibility: theme controls. Two rows.
//   1. Light / Dark mode toggle (segmented).
//   2. Accent swatch grid — every selectable color the user can apply.
// Both write through to `useTheme()`, which persists in localStorage and
// broadcasts to every other consumer so the change is live.
export function AccentPicker() {
  const { theme, accent, setTheme, setAccent } = useTheme();

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Mode
        </p>
        <div className="inline-flex rounded-md border bg-muted/30 p-0.5">
          <ModeButton
            label="Light"
            icon={<Sun className="size-3.5" />}
            active={theme === "light"}
            onClick={() => setTheme("light")}
          />
          <ModeButton
            label="Dark"
            icon={<Moon className="size-3.5" />}
            active={theme === "dark"}
            onClick={() => setTheme("dark")}
          />
        </div>
      </div>

      {/* Accent swatches */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Accent color
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {SWATCHES.map((s) => (
            <Swatch
              key={s.id}
              {...s}
              active={accent === s.id}
              onClick={() => setAccent(s.id)}
            />
          ))}
        </div>
        <p className="pt-1 text-[11px] text-muted-foreground">
          Applies to primary buttons (Commit, Push), focus rings, and active
          states. Other surfaces stay on the neutral palette.
        </p>
      </div>

      {/* Verify accents map to the type set so a future rename trips TS. */}
      <span className="sr-only">{ACCENTS.join(",")}</span>
    </div>
  );
}

function ModeButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
  );
}

function Swatch({
  label,
  color,
  active,
  onClick,
}: SwatchPreset & { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center gap-1.5 rounded-md border p-2 transition-colors",
        active
          ? "border-foreground/30 bg-muted/40"
          : "border-border hover:bg-muted/30",
      )}
      aria-pressed={active}
      title={label}
    >
      <span
        className="relative flex size-7 items-center justify-center rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/10"
        style={{ backgroundColor: color }}
      >
        {active ? (
          <Check className="size-3.5 text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]" />
        ) : null}
      </span>
      <span className="text-[11px] font-medium text-foreground">{label}</span>
    </button>
  );
}
