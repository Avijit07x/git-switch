import { Suspense, lazy, useEffect, useState } from "react";

import { useTheme } from "@/hooks/use-theme";
import type { ProcessStatus } from "@/lib/types";

// Single-responsibility: gate xterm.js Terminal construction until a process
// has actually been started. `new Terminal()` + `term.open()` allocates
// buffers, addons, and a few hundred DOM nodes synchronously — heavy enough
// to spin the macOS beachball when the dashboard remounts on repo switch.
// While the target is idle we render an identical-looking placeholder so
// the layout stays put without any cost.
//
// We also lazy-import LiveTerminal so the xterm.js bundle (~200KB gzipped)
// stays out of the initial JS payload entirely — only repos that actually
// run a target pay for it.

const LiveTerminal = lazy(() => import("./LiveTerminal"));

// Local theme palette mirror (same shape as the one inside LiveTerminal).
// Duplicated here so the idle placeholder doesn't have to pull in xterm.
function idlePalette(isDark: boolean) {
  return isDark
    ? { background: "#0a0a0a", foreground: "#f5f5f5" }
    : { background: "#fafafa", foreground: "#171717" };
}

interface ProcessOutputPanelProps {
  status: ProcessStatus;
  exitCode: number | null;
  registerSink: (sink: ((chunk: string) => void) | null) => void;
  onInput?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

export function ProcessOutputPanel(props: ProcessOutputPanelProps) {
  const [shouldMount, setShouldMount] = useState(props.status !== "idle");

  useEffect(() => {
    if (props.status !== "idle") setShouldMount(true);
  }, [props.status]);

  if (!shouldMount) {
    return <IdleTerminal />;
  }
  return (
    <Suspense fallback={<IdleTerminal />}>
      <LiveTerminal {...props} />
    </Suspense>
  );
}

function IdleTerminal() {
  const { theme } = useTheme();
  const palette = idlePalette(theme === "dark");
  return (
    <section
      className="flex h-full flex-col overflow-hidden rounded-md border text-popover-foreground"
      style={{ backgroundColor: palette.background }}
    >
      <header className="flex items-center justify-between border-b px-3 py-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Terminal
        </h3>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center px-2 py-1">
        <p
          className="text-[11px] font-medium"
          style={{ color: palette.foreground, opacity: 0.4 }}
        >
          Click Run to start this target.
        </p>
      </div>
    </section>
  );
}
