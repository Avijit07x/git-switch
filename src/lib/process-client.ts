import { invoke } from "@tauri-apps/api/core";

// Single-responsibility: thin typed wrappers over the Rust process commands.
export const processClient = {
  start: (
    repoId: string,
    command: string,
    cwd: string,
    killPort?: number,
  ): Promise<void> =>
    invoke<void>("start_process", { repoId, command, cwd, killPort }),

  stop: (repoId: string): Promise<boolean> =>
    invoke<boolean>("stop_process", { repoId }),

  isRunning: (repoId: string): Promise<boolean> =>
    invoke<boolean>("is_process_running", { repoId }),

  write: (repoId: string, data: string): Promise<void> =>
    invoke<void>("write_to_process", { repoId, data }),

  resize: (repoId: string, cols: number, rows: number): Promise<void> =>
    invoke<void>("resize_process", { repoId, cols, rows }),

  detectPort: (cwd: string): Promise<number | null> =>
    invoke<number | null>("detect_port", { cwd }),

  checkPort: (port: number): Promise<number[]> =>
    invoke<number[]>("check_port", { port }),
} as const;
