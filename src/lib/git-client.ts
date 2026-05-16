import { invoke } from "@tauri-apps/api/core";
import type {
  AheadBehind,
  CommitInfo,
  GitBranchList,
  GitCommandResult,
  GitStatus,
  LastCommit,
  QuickStatus,
} from "./types";

// Thin, single-responsibility wrapper over Tauri invokes. Each function maps
// 1:1 to a Rust command and returns the typed payload. Errors thrown by Tauri
// (e.g. invalid path) propagate as Promise rejections.

export const gitClient = {
  validateRepository: (path: string): Promise<string> =>
    invoke<string>("validate_repository", { path }),

  cloneRepository: (
    url: string,
    targetDir: string,
    sshKeyPath?: string,
  ): Promise<GitCommandResult> =>
    invoke<GitCommandResult>("clone_repository", {
      url,
      targetDir,
      sshKeyPath: sshKeyPath ?? null,
    }),

  getBranches: (path: string): Promise<GitBranchList> =>
    invoke<GitBranchList>("get_branches", { path }),

  switchBranch: (path: string, branch: string): Promise<GitCommandResult> =>
    invoke<GitCommandResult>("switch_branch", { path, branch }),

  createLocalBranchFromRemote: (
    path: string,
    localBranch: string,
    remoteBranch: string,
  ): Promise<GitCommandResult> =>
    invoke<GitCommandResult>("create_local_branch_from_remote", {
      path,
      localBranch,
      remoteBranch,
    }),

  createLocalBranch: (path: string, branch: string): Promise<GitCommandResult> =>
    invoke<GitCommandResult>("create_local_branch", { path, branch }),

  pullBranch: (path: string): Promise<GitCommandResult> =>
    invoke<GitCommandResult>("pull_branch", { path }),

  fetchRemote: (path: string): Promise<GitCommandResult> =>
    invoke<GitCommandResult>("fetch_remote", { path }),

  getAheadBehind: (path: string): Promise<AheadBehind> =>
    invoke<AheadBehind>("get_ahead_behind", { path }),

  quickStatus: (path: string): Promise<QuickStatus> =>
    invoke<QuickStatus>("quick_status", { path }),

  quickStatusBatch: (
    paths: string[],
  ): Promise<Array<[string, QuickStatus | null]>> =>
    invoke<Array<[string, QuickStatus | null]>>("quick_status_batch", {
      paths,
    }),

  watchRepository: (repoId: string, path: string): Promise<void> =>
    invoke<void>("watch_repository", { repoId, path }),

  unwatchRepository: (repoId: string): Promise<void> =>
    invoke<void>("unwatch_repository", { repoId }),

  getStatus: (path: string): Promise<GitStatus> =>
    invoke<GitStatus>("get_status", { path }),

  stageFiles: (path: string, files: string[]): Promise<GitCommandResult> =>
    invoke<GitCommandResult>("stage_files", { path, files }),

  stageAll: (path: string): Promise<GitCommandResult> =>
    invoke<GitCommandResult>("stage_all", { path }),

  unstageFiles: (path: string, files: string[]): Promise<GitCommandResult> =>
    invoke<GitCommandResult>("unstage_files", { path, files }),

  commitChanges: (path: string, message: string): Promise<GitCommandResult> =>
    invoke<GitCommandResult>("commit_changes", { path, message }),

  undoLastCommit: (path: string): Promise<GitCommandResult> =>
    invoke<GitCommandResult>("undo_last_commit", { path }),

  pushBranch: (path: string): Promise<GitCommandResult> =>
    invoke<GitCommandResult>("push_branch", { path }),

  pushBranchWithUpstream: (
    path: string,
    branch: string,
    remote: string = "origin",
  ): Promise<GitCommandResult> =>
    invoke<GitCommandResult>("push_branch_with_upstream", {
      path,
      branch,
      remote,
    }),

  getStagedDiff: (path: string): Promise<GitCommandResult> =>
    invoke<GitCommandResult>("get_staged_diff", { path }),

  addToGitignore: (path: string, entry: string): Promise<GitCommandResult> =>
    invoke<GitCommandResult>("add_to_gitignore", { path, entry }),

  getLastCommit: (path: string): Promise<LastCommit> =>
    invoke<LastCommit>("get_last_commit", { path }),

  getCommitHistory: (path: string, limit: number): Promise<CommitInfo[]> =>
    invoke<CommitInfo[]>("get_commit_history", { path, limit }),

  getFileDiff: (
    path: string,
    file: string,
    staged: boolean,
  ): Promise<string> =>
    invoke<string>("get_file_diff", { path, file, staged }),
} as const;

export type GitClient = typeof gitClient;
