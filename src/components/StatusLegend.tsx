import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Single-responsibility: explain what the row tints mean. Lives next to the
// "Repositories" header so it's discoverable without taking space.
export function StatusLegend() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-5 text-muted-foreground hover:text-foreground"
          aria-label="What do the colors mean?"
        >
          <Info className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-64 p-3 text-[12px]"
      >
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Row colors
        </p>
        <ul className="space-y-2">
          <LegendItem
            swatch="bg-rose-500/40"
            label="Behind upstream"
            hint="Run Pull. Highest priority — teammate(s) pushed."
          />
          <LegendItem
            swatch="bg-amber-500/40"
            label="Uncommitted changes"
            hint="Files modified, staged, or untracked."
          />
          <LegendItem
            swatch="bg-emerald-500/40"
            label="Ahead of upstream"
            hint="Local commits waiting to be pushed."
          />
        </ul>
        <p className="mt-3 border-t pt-2 text-[10.5px] leading-snug text-muted-foreground">
          Auto-fetches in the background on app focus so the badges reflect
          remote pushes, not just local state.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function LegendItem({
  swatch,
  label,
  hint,
}: {
  swatch: string;
  label: string;
  hint: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-0.5 size-3 shrink-0 rounded-sm ${swatch}`} />
      <div className="min-w-0">
        <p className="font-medium leading-tight">{label}</p>
        <p className="text-[10.5px] leading-snug text-muted-foreground">
          {hint}
        </p>
      </div>
    </li>
  );
}
