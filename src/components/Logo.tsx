import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: number;
}

// Single-responsibility: inline the brand mark so it inherits `currentColor`
// for the branch stems and keeps a fixed warm gradient on the accent stroke
// + tip — the result reads correctly on light, dark, and tinted surfaces.
export function Logo({ className, size = 20 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="git-switch-logo-accent"
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

      <g strokeLinecap="round" fill="none">
        <line
          x1="20"
          y1="12.5"
          x2="20"
          y2="30.5"
          stroke="currentColor"
          strokeWidth="3.25"
        />
        <line
          x1="44"
          y1="33.5"
          x2="44"
          y2="51.5"
          stroke="url(#git-switch-logo-accent)"
          strokeWidth="3.25"
        />
        <path
          d="M 20 30.5 C 20 37.5 25.5 39 32 39 C 38.5 39 44 37.5 44 33.5"
          stroke="url(#git-switch-logo-accent)"
          strokeWidth="3.25"
        />
      </g>

      <circle cx="20" cy="12.5" r="4.75" fill="currentColor" />
      <circle
        cx="44"
        cy="51.5"
        r="4.75"
        fill="url(#git-switch-logo-accent)"
      />
    </svg>
  );
}
