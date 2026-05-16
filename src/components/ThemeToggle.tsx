import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { IconHint } from "./IconHint";

// Single-responsibility: toggle between light and dark theme.
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const label = `Switch to ${isDark ? "light" : "dark"} mode`;

  return (
    <IconHint label={label} side="bottom">
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        onClick={toggle}
        aria-label={label}
      >
        {isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
      </Button>
    </IconHint>
  );
}
