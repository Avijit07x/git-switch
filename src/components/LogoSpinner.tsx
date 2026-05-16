import { cn } from "@/lib/utils";

interface LogoSpinnerProps {
  className?: string;
  size?: number;
}

// Single-responsibility: animated brand mark used as the app's loading
// indicator. The two end caps pulse asynchronously while the arc shifts its
// dash offset, evoking a "branch in motion" feel without spinning the whole
// glyph. All motion is CSS-driven so it costs ~0 JS.
export function LogoSpinner({ className, size = 48 }: LogoSpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      className={cn("shrink-0", className)}
      aria-label="Loading"
      role="status"
    >
      <defs>
        <linearGradient
          id="git-switch-loader-accent"
          x1="20"
          y1="30.5"
          x2="44"
          y2="33.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>

      {/* Top stem — always solid */}
      <line
        x1="20"
        y1="12.5"
        x2="20"
        y2="30.5"
        stroke="currentColor"
        strokeWidth="3.25"
        strokeLinecap="round"
      />

      {/* Bottom stem — pulses */}
      <line
        x1="44"
        y1="33.5"
        x2="44"
        y2="51.5"
        stroke="url(#git-switch-loader-accent)"
        strokeWidth="3.25"
        strokeLinecap="round"
        className="git-switch-loader-stem"
      />

      {/* Animated arc */}
      <path
        d="M 20 30.5 C 20 37.5 25.5 39 32 39 C 38.5 39 44 37.5 44 33.5"
        stroke="url(#git-switch-loader-accent)"
        strokeWidth="3.25"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="0.45 0.55"
        className="git-switch-loader-arc"
      />

      {/* Top dot */}
      <circle
        cx="20"
        cy="12.5"
        r="4.75"
        fill="currentColor"
        className="git-switch-loader-dot git-switch-loader-dot-top"
      />

      {/* Bottom dot — leads the animation */}
      <circle
        cx="44"
        cy="51.5"
        r="4.75"
        fill="url(#git-switch-loader-accent)"
        className="git-switch-loader-dot git-switch-loader-dot-bottom"
      />
    </svg>
  );
}

