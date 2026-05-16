use serde::{Deserialize, Serialize};

/// Structured response returned to the frontend for every Git invocation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommandResult {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusFile {
    pub path: String,
    /// Index status character from `git status --porcelain` (e.g. 'M', 'A', 'D', '?', ' ').
    pub index_status: String,
    /// Working tree status character.
    pub worktree_status: String,
    pub staged: bool,
    pub unstaged: bool,
    pub untracked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchList {
    pub current: Option<String>,
    pub local: Vec<GitBranch>,
    pub remote: Vec<GitBranch>,
    pub result: GitCommandResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub files: Vec<GitStatusFile>,
    pub clean: bool,
    pub result: GitCommandResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastCommit {
    pub hash: String,
    pub message: String,
    pub result: GitCommandResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AheadBehind {
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
}

/// Lightweight per-repo status used by the sidebar. Avoids running a full
/// `--porcelain` parse for every repo on every refresh.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickStatus {
    pub current_branch: Option<String>,
    pub upstream: Option<String>,
    pub changes: u32,
    pub ahead: u32,
    pub behind: u32,
}

/// Single commit row for the history panel.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    /// Full SHA (40 hex chars).
    pub hash: String,
    /// Short SHA (first 7 chars).
    pub short: String,
    /// Author display name.
    pub author: String,
    /// Author email.
    pub email: String,
    /// Unix epoch seconds.
    pub timestamp: i64,
    /// First line of the commit message.
    pub subject: String,
}
