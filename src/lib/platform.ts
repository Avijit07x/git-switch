// Single-responsibility: detect the host OS once at startup and mark the
// <html> element with `data-os="<linux|macos|windows>"`. CSS rules in
// `index.css` target `[data-os="linux"]` to defuse the animations and
// transitions that jitter under WebKitGTK's slower compositor.

export type Os = "linux" | "macos" | "windows" | "unknown";

export function detectOs(): Os {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("linux") && !ua.includes("android")) return "linux";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  return "unknown";
}

export function markOs(): Os {
  const os = detectOs();
  document.documentElement.setAttribute("data-os", os);
  return os;
}
