// Shared types between frontend and Rust backend. The Rust side serializes
// with `rename_all = "camelCase"`, so keep these aligned.

export interface RunTarget {
  /** Stable id within the repo — never reused once assigned. */
  id: string;
  /** Display name shown on the tab (e.g. "api", "worker"). */
  name: string;
  /** Shell command to launch (e.g. "yarn dev:worker"). */
  command: string;
  /** Optional restart command — falls back to `command`. */
  restartCommand?: string;
  /** Port to free before starting — falls back to repo-level port. */
  port?: number;
}

export interface Repository {
  id: string;
  name: string;
  path: string;
  addedAt: number;
  /** Legacy single-command field. Preserved for backward compat. */
  runCommand?: string;
  /** Legacy restart command for the single-command flow. */
  restartCommand?: string;
  /** Legacy fallback port (still used when a target doesn't set its own). */
  port?: number;
  /** Multi-target list. When present, this supersedes `runCommand`. */
  runTargets?: RunTarget[];
}

export type ProcessStatus = "idle" | "running" | "exited" | "errored";

export interface ProcessDataEvent {
  repoId: string;
  /** Raw bytes from the PTY master, already decoded as UTF-8 (lossy). */
  data: string;
}

export interface ProcessExitEvent {
  repoId: string;
  exitCode: number;
  success: boolean;
}

export interface ProjectGroup {
  id: string;
  name: string;
  /** Repository ids in launch order. */
  repositoryIds: string[];
  createdAt: number;
}

export interface Profile {
  id: string;
  name: string;
  /** Absolute path to the SSH private key (e.g. /Users/you/.ssh/id_ed25519_work). */
  sshKeyPath?: string;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream: string | null;
}

export interface GitStatusFile {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface GitCommandResult {
  command: string;
  args: string[];
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

export interface GitBranchList {
  current: string | null;
  local: GitBranch[];
  remote: GitBranch[];
  result: GitCommandResult;
}

export interface GitStatus {
  files: GitStatusFile[];
  clean: boolean;
  result: GitCommandResult;
}

export interface LastCommit {
  hash: string;
  message: string;
  result: GitCommandResult;
}

export interface AheadBehind {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
}

export interface QuickStatus {
  currentBranch: string | null;
  upstream: string | null;
  changes: number;
  ahead: number;
  behind: number;
}

export interface CommitInfo {
  hash: string;
  short: string;
  author: string;
  email: string;
  /** Unix epoch seconds. */
  timestamp: number;
  subject: string;
}

export type GitOperation =
  | "idle"
  | "validating"
  | "loadingBranches"
  | "switching"
  | "creatingBranch"
  | "pulling"
  | "loadingStatus"
  | "staging"
  | "unstaging"
  | "committing"
  | "undoing"
  | "pushing"
  | "pushingUpstream"
  | "ignoring"
  | "loadingLastCommit"
  | "fetching";

export interface GitOperationState {
  operation: GitOperation;
  repositoryId: string | null;
  startedAt: number | null;
}

export type CommandStatus = "running" | "success" | "error";

export interface CommandLogEntry {
  id: string;
  repositoryId: string;
  timestamp: number;
  label: string;
  status: CommandStatus;
  result: GitCommandResult | null;
}
