// Single-responsibility: thin Tauri-facing layer. Each `#[tauri::command]` is
// async and pushes the blocking `git` invocation onto Tauri's blocking pool so
// the IPC executor stays free. Without this, a single `git fetch` or `git pull`
// (network-bound, multi-second) freezes the entire app — every other command,
// including supposedly-fast reads like `quick_status`, queues behind it.

use super::error::GitError;
use super::service;
use super::types::{
    AheadBehind, GitBranchList, GitCommandResult, GitStatus, LastCommit, QuickStatus,
};

fn map_err(err: GitError) -> String {
    err.to_string()
}

/// Wrap a blocking git invocation so it runs on Tauri's blocking pool
/// instead of stalling the async runtime. Concurrent reads (sidebar, dashboard)
/// then actually execute in parallel — limited only by the pool size.
async fn blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, GitError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
        .map_err(map_err)
}

#[tauri::command]
pub async fn validate_repository(path: String) -> Result<String, String> {
    blocking(move || service::validate_repository(&path)).await
}

#[tauri::command]
pub async fn clone_repository(
    url: String,
    target_dir: String,
    ssh_key_path: Option<String>,
) -> Result<GitCommandResult, String> {
    blocking(move || service::clone_repository(&url, &target_dir, ssh_key_path.as_deref())).await
}

#[tauri::command]
pub async fn get_branches(path: String) -> Result<GitBranchList, String> {
    blocking(move || service::get_branches(&path)).await
}

#[tauri::command]
pub async fn switch_branch(path: String, branch: String) -> Result<GitCommandResult, String> {
    blocking(move || service::switch_branch(&path, &branch)).await
}

#[tauri::command]
pub async fn create_local_branch_from_remote(
    path: String,
    local_branch: String,
    remote_branch: String,
) -> Result<GitCommandResult, String> {
    blocking(move || service::create_local_branch_from_remote(&path, &local_branch, &remote_branch))
        .await
}

#[tauri::command]
pub async fn create_local_branch(
    path: String,
    branch: String,
) -> Result<GitCommandResult, String> {
    blocking(move || service::create_local_branch(&path, &branch)).await
}

#[tauri::command]
pub async fn pull_branch(path: String) -> Result<GitCommandResult, String> {
    blocking(move || service::pull_branch(&path)).await
}

#[tauri::command]
pub async fn fetch_remote(path: String) -> Result<GitCommandResult, String> {
    blocking(move || service::fetch_remote(&path)).await
}

#[tauri::command]
pub async fn get_ahead_behind(path: String) -> Result<AheadBehind, String> {
    blocking(move || service::get_ahead_behind(&path)).await
}

#[tauri::command]
pub async fn quick_status(path: String) -> Result<QuickStatus, String> {
    blocking(move || service::quick_status(&path)).await
}

#[tauri::command]
pub async fn get_status(path: String) -> Result<GitStatus, String> {
    blocking(move || service::get_status(&path)).await
}

#[tauri::command]
pub async fn stage_files(path: String, files: Vec<String>) -> Result<GitCommandResult, String> {
    blocking(move || service::stage_files(&path, &files)).await
}

#[tauri::command]
pub async fn stage_all(path: String) -> Result<GitCommandResult, String> {
    blocking(move || service::stage_all(&path)).await
}

#[tauri::command]
pub async fn unstage_files(path: String, files: Vec<String>) -> Result<GitCommandResult, String> {
    blocking(move || service::unstage_files(&path, &files)).await
}

#[tauri::command]
pub async fn commit_changes(path: String, message: String) -> Result<GitCommandResult, String> {
    blocking(move || service::commit_changes(&path, &message)).await
}

#[tauri::command]
pub async fn push_branch(path: String) -> Result<GitCommandResult, String> {
    blocking(move || service::push_branch(&path)).await
}

#[tauri::command]
pub async fn push_branch_with_upstream(
    path: String,
    branch: String,
    remote: Option<String>,
) -> Result<GitCommandResult, String> {
    let remote_name = remote.unwrap_or_else(|| "origin".into());
    blocking(move || service::push_branch_with_upstream(&path, &branch, &remote_name)).await
}

#[tauri::command]
pub async fn get_staged_diff(path: String) -> Result<GitCommandResult, String> {
    blocking(move || service::get_staged_diff(&path)).await
}

#[tauri::command]
pub async fn add_to_gitignore(path: String, entry: String) -> Result<GitCommandResult, String> {
    blocking(move || service::add_to_gitignore(&path, &entry)).await
}

#[tauri::command]
pub async fn get_last_commit(path: String) -> Result<LastCommit, String> {
    blocking(move || service::get_last_commit(&path)).await
}
