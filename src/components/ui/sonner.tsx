import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useTheme } from "@/hooks/use-theme";

// Single-responsibility: themed wrapper around Sonner's Toaster.
//
// Premium macOS-style design philosophy:
//   • Frosted-glass surface (heavy backdrop blur, translucent fill)
//   • Layered shadow + inner top-edge highlight to fake a light source
//   • Neutral surface for ALL severities; severity reads only via the icon
//     color + a subtle matching glow. Apple's own notifications do this.
//   • Tight typography with a clear weight contrast
//   • Smooth, eased entrance — no harsh pop
export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Sonner CSS variables — set a single neutral surface across every variant.
  // Severity color shows up via the icon-color rules below.
  const surface = isDark
    ? {
        bg: "oklch(0.22 0.005 270 / 0.78)",
        border: "oklch(1 0 0 / 0.10)",
        text: "oklch(0.985 0 0)",
      }
    : {
        bg: "oklch(1 0 0 / 0.82)",
        border: "oklch(0 0 0 / 0.08)",
        text: "oklch(0.145 0 0)",
      };

  const vars = {
    "--normal-bg": surface.bg,
    "--normal-border": surface.border,
    "--normal-text": surface.text,
    "--success-bg": surface.bg,
    "--success-border": surface.border,
    "--success-text": surface.text,
    "--error-bg": surface.bg,
    "--error-border": surface.border,
    "--error-text": surface.text,
    "--warning-bg": surface.bg,
    "--warning-border": surface.border,
    "--warning-text": surface.text,
    "--info-bg": surface.bg,
    "--info-border": surface.border,
    "--info-text": surface.text,
  } as React.CSSProperties;

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="bottom-right"
      offset={20}
      gap={10}
      duration={4000}
      style={vars}
      toastOptions={{
        classNames: {
          toast: [
            "group toast",
            // Layered premium shadow + 1px inner highlight on top edge.
            // The inset white line is what gives macOS its "light from above"
            // bezel — without it everything looks flat.
            isDark
              ? "!shadow-[0_18px_40px_-12px_rgba(0,0,0,0.55),0_0_0_0.5px_rgba(255,255,255,0.06),inset_0_1px_0_0_rgba(255,255,255,0.08)]"
              : "!shadow-[0_18px_40px_-12px_rgba(0,0,0,0.18),0_0_0_0.5px_rgba(0,0,0,0.04),inset_0_1px_0_0_rgba(255,255,255,0.9)]",
            "!rounded-xl !backdrop-blur-2xl !backdrop-saturate-150",
            "!border !p-3.5 !pr-4",
            "transition-all duration-200 ease-out",
          ].join(" "),
          title:
            "!text-[13px] !font-semibold !leading-tight !tracking-tight",
          description:
            "!text-[12px] !leading-snug !mt-1 !opacity-60 !tracking-tight",
          icon: "!mt-0.5 !mr-1",
          // Severity = icon color + a tiny soft glow behind it. Surface stays
          // neutral so the toast reads as one design language regardless of
          // severity.
          success: "[&_[data-icon]>svg]:!text-emerald-400 [&_[data-icon]]:drop-shadow-[0_0_6px_rgba(52,211,153,0.35)]",
          error: "[&_[data-icon]>svg]:!text-rose-400 [&_[data-icon]]:drop-shadow-[0_0_6px_rgba(251,113,133,0.35)]",
          warning: "[&_[data-icon]>svg]:!text-amber-400 [&_[data-icon]]:drop-shadow-[0_0_6px_rgba(251,191,36,0.35)]",
          info: "[&_[data-icon]>svg]:!text-sky-400 [&_[data-icon]]:drop-shadow-[0_0_6px_rgba(56,189,248,0.35)]",
          loading: "[&_[data-icon]>svg]:!text-zinc-400",
          actionButton: [
            "!h-7 !px-3 !text-[12px] !rounded-md !font-medium",
            "group-[.toast]:!bg-primary group-[.toast]:!text-primary-foreground",
            "hover:!opacity-90 transition-opacity",
          ].join(" "),
          cancelButton: [
            "!h-7 !px-3 !text-[12px] !rounded-md !font-medium",
            "group-[.toast]:!bg-white/10 group-[.toast]:!text-foreground",
            "hover:!bg-white/15 transition-colors",
          ].join(" "),
        },
      }}
      {...props}
    />
  );
}
