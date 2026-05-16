// Single-responsibility: thin Tauri-facing layer over `fs::watcher`.

use tauri::{AppHandle, State};

use super::watcher::{self, FsWatcherState};

#[tauri::command]
pub fn watch_repository(
    app: AppHandle,
    state: State<'_, FsWatcherState>,
    repo_id: String,
    path: String,
) -> Result<(), String> {
    watcher::start_watching(state.inner(), app, repo_id, path)
}

#[tauri::command]
pub fn unwatch_repository(
    state: State<'_, FsWatcherState>,
    repo_id: String,
) -> Result<(), String> {
    watcher::stop_watching(state.inner(), &repo_id)
}
