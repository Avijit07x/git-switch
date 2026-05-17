import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

// Single-responsibility: read the app version from Tauri's authoritative
// source (tauri.conf.json) once on mount. Returns `null` until it resolves
// so callers can hide the chip during the brief async load instead of
// flashing a placeholder.
export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getVersion()
      .then((v) => {
        if (!cancelled) setVersion(v);
      })
      .catch(() => {
        /* non-fatal — chip just stays hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}
