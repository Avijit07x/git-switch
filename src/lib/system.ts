import { invoke } from "@tauri-apps/api/core";

// Single-responsibility: small wrappers over Tauri commands that aren't
// git- or process-specific.

/** Open a URL or file path in the OS default handler (browser, Finder, …). */
export function openExternal(target: string): Promise<void> {
  return invoke<void>("open_external", { target });
}

/** Returns the installed git version string, or null if git isn't on PATH. */
export function checkGit(): Promise<string | null> {
  return invoke<string | null>("check_git");
}
