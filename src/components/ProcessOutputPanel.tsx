import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import type { ProcessStatus } from "@/lib/types";

interface ProcessOutputPanelProps {
  status: ProcessStatus;
  exitCode: number | null;
  registerSink: (sink: ((chunk: string) => void) | null) => void;
  onInput?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

// Single-responsibility: gate xterm.js Terminal construction until a process
// has actually been started. `new Terminal()` + `term.open()` allocates
// buffers, addons, and a few hundred DOM nodes synchronously — heavy enough
// to spin the macOS beachball when the dashboard remounts on repo switch.
// While the target is idle we render an identical-looking placeholder so
// the layout stays put without any cost.
export function ProcessOutputPanel(props: ProcessOutputPanelProps) {
  const [shouldMount, setShouldMount] = useState(props.status !== "idle");

  useEffect(() => {
    if (props.status !== "idle") setShouldMount(true);
  }, [props.status]);

  if (!shouldMount) {
    return <IdleTerminal />;
  }
  return <LiveTerminal {...props} />;
}

function IdleTerminal() {
  const { theme } = useTheme();
  const palette = paletteFor(theme === "dark");
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

// Theme palette that follows the app's light/dark mode.
function paletteFor(isDark: boolean) {
  return isDark
    ? {
        background: "#0a0a0a",
        foreground: "#f5f5f5",
        cursor: "#f5f5f5",
        selectionBackground: "#3a3a3a",
      }
    : {
        background: "#fafafa",
        foreground: "#171717",
        cursor: "#171717",
        selectionBackground: "#d4d4d4",
      };
}

// Single-responsibility: render a real terminal via xterm.js, hand its write
// callback up to the parent so PTY chunks can stream in, forward user
// keystrokes back to the PTY, and propagate resize events.
function LiveTerminal({
  status,
  exitCode,
  registerSink,
  onInput,
  onResize,
}: ProcessOutputPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Bootstrap once on mount.
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily:
        "Menlo, Monaco, ui-monospace, SF Mono, 'Courier New', monospace",
      fontSize: 12,
      lineHeight: 1.3,
      scrollback: 5000,
      convertEol: true,
      theme: paletteFor(isDark),
      cursorBlink: false,
      disableStdin: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    try {
      fit.fit();
    } catch {
      /* container not measured yet */
    }

    termRef.current = term;
    fitRef.current = fit;

    registerSink((chunk) => term.write(chunk));

    const inputDisposable = term.onData((data) => onInput?.(data));
    const resizeDisposable = term.onResize(({ cols, rows }) =>
      onResize?.(cols, rows),
    );

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    });
    ro.observe(containerRef.current);

    return () => {
      registerSink(null);
      ro.disconnect();
      inputDisposable.dispose();
      resizeDisposable.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // We intentionally bootstrap once; theme changes patched separately below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Repaint terminal theme when light/dark toggles. Setting `options.theme`
  // updates new writes but xterm.js doesn't re-tint the existing scrollback
  // automatically — `refresh(0, rows-1)` forces a full redraw.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = paletteFor(isDark);
    term.refresh(0, term.rows - 1);
  }, [isDark]);

  return (
    <section
      className="flex h-full flex-col overflow-hidden rounded-md border text-popover-foreground"
      style={{ backgroundColor: paletteFor(isDark).background }}
    >
      <header className="flex items-center justify-between border-b px-3 py-1.5 text-popover-foreground">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Terminal
          <StatusBadge status={status} exitCode={exitCode} />
        </h3>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => termRef.current?.clear()}
        >
          Clear
        </Button>
      </header>
      <div ref={containerRef} className="min-h-0 flex-1 px-2 py-1" />
    </section>
  );
}

function StatusBadge({
  status,
  exitCode,
}: {
  status: ProcessStatus;
  exitCode: number | null;
}) {
  if (status === "running") {
    return (
      <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-700 dark:text-emerald-300">
        running
      </span>
    );
  }
  if (status === "errored") {
    return (
      <span className="rounded-md bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-destructive">
        exit {exitCode ?? "?"}
      </span>
    );
  }
  if (status === "exited") {
    return (
      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
        exited
      </span>
    );
  }
  return null;
}
