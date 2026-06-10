import { listen } from "@tauri-apps/api/event";

import type { ProcessDataEvent } from "@/lib/types";

const MAX_BUFFER_SIZE = 200_000;

const buffers = new Map<string, string>();
const tracked = new Set<string>();

function append(processId: string, chunk: string): void {
  const existing = buffers.get(processId) ?? "";
  let next = existing + chunk;
  if (next.length > MAX_BUFFER_SIZE) {
    next = next.slice(next.length - MAX_BUFFER_SIZE);
    // Drop the (likely) partial first line so a replay never starts
    // mid-ANSI-escape-sequence.
    const newline = next.indexOf("\n");
    if (newline !== -1) next = next.slice(newline + 1);
  }
  buffers.set(processId, next);
}

// Subscriptions are app-lifetime on purpose: PTY output must keep landing in
// the buffer while the owning dashboard is unmounted (user viewing another
// repo). One listener per process id, bounded by the number of run targets.
function track(processId: string): void {
  if (tracked.has(processId)) return;
  tracked.add(processId);
  listen<ProcessDataEvent>(`process-data:${processId}`, (event) => {
    append(processId, event.payload.data);
  }).catch(() => {
    tracked.delete(processId);
  });
}

export const processOutputStore = {
  track,
  append,

  get(processId: string): string {
    return buffers.get(processId) ?? "";
  },

  clear(processId: string): void {
    buffers.delete(processId);
  },
};
