import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { Repository } from "@/lib/types";

interface TrayStatusInput {
  repository: Repository | null;
  branch: string | null;
  ahead: number;
  behind: number;
  changes: number;
}

// Single-responsibility: push the active repo's status to the menu-bar tray
// label. The Rust side owns the tray; we just feed it a short summary line
// whenever the selected repo or its quick-status changes.
//
// Format: "<repo> · <branch> · ↑2 ↓1 · 3 changes"
export function useTrayStatus({
  repository,
  branch,
  ahead,
  behind,
  changes,
}: TrayStatusInput): void {
  useEffect(() => {
    if (!repository) {
      void invoke("update_tray_status", { label: "" }).catch(() => {});
      return;
    }
    const parts: string[] = [repository.name];
    if (branch) parts.push(branch);
    const counts: string[] = [];
    if (ahead > 0) counts.push(`↑${ahead}`);
    if (behind > 0) counts.push(`↓${behind}`);
    if (counts.length > 0) parts.push(counts.join(" "));
    if (changes > 0) {
      parts.push(`${changes} change${changes === 1 ? "" : "s"}`);
    }
    void invoke("update_tray_status", { label: parts.join(" · ") }).catch(() => {});
  }, [repository, branch, ahead, behind, changes]);
}
