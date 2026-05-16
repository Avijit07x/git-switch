import type { ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface IconHintProps {
  label: string;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}

// Single-responsibility: wrap an icon-only control with a hover tooltip.
export function IconHint({ label, children, side = "top" }: IconHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
