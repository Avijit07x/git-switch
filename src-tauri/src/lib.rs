mod editor;
mod fs;
mod git;
mod platform;
mod process;
mod repository;
mod scan;
mod tray;

use fs::commands::*;
use fs::FsWatcherState;
use git::commands::*;
use process::commands::*;
use process::ProcessState;
use scan::scan_directory;
use tauri::{Manager, RunEvent};
use tray::{update_tray_status, TrayStatus};


/// Smoke-test the host environment so the app can warn the user *once* on
/// launch instead of failing every command silently. Pushed to the blocking
/// pool so spawning `git --version` (slow first launch on macOS while the
/// Command Line Tools resolve) doesn't stall the IPC executor.
#[tauri::command]
async fn check_git() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = crate::platform::command("git").arg("--version").output();
        match output {
            Ok(out) if out.status.success() => {
                Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
            }
            _ => None,
        }
    })
    .await
    .map_err(|e| e.to_string())
}

/// Open a URL (or file path) in the system's default handler — `open` on
/// macOS, `xdg-open` on Linux, `start` on Windows. Allows the frontend to
/// route links to the user's real browser instead of the Tauri webview.
/// Fire-and-forget `spawn()` is non-blocking, so this stays sync.
#[tauri::command]
fn open_external(target: String) -> Result<(), String> {
    if target.trim().is_empty() {
        return Err("Empty target".into());
    }
    platform::open_with_default(&target)
}

/// Open the whole repository as a project in the user's code editor,
/// focusing `file` inside it when provided. A lone file in an editor has no
/// project context, so the folder always comes along. The relative path is
/// resolved against the repo root and must stay inside it, so a crafted
/// status entry can never escape the repository.
#[tauri::command]
fn open_in_editor(repo_path: String, file: Option<String>) -> Result<(), String> {
    let root = std::path::Path::new(&repo_path)
        .canonicalize()
        .map_err(|e| format!("Invalid repository path: {e}"))?;

    let file_abs = match file.as_deref().map(str::trim).filter(|f| !f.is_empty()) {
        Some(rel) => {
            let target = root
                .join(rel)
                .canonicalize()
                .map_err(|_| format!("File not found on disk: {rel}"))?;
            if !target.starts_with(&root) {
                return Err("File is outside the repository".into());
            }
            if !target.is_file() {
                return Err(format!("Not a file: {rel}"));
            }
            Some(target)
        }
        None => None,
    };

    editor::open_project(&root, file_abs.as_deref())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ProcessState::default())
        .manage(FsWatcherState::default())
        .manage(TrayStatus::default())
        .setup(|app| {
            if let Err(err) = tray::init(app.handle()) {
                eprintln!("[git-switch] tray init failed: {err}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            validate_repository,
            init_repository,
            clone_repository,
            scan_directory,
            get_branches,
            switch_branch,
            create_local_branch_from_remote,
            create_local_branch,
            pull_branch,
            fetch_remote,
            get_ahead_behind,
            quick_status,
            quick_status_batch,
            get_status,
            stage_files,
            stage_all,
            unstage_files,
            commit_changes,
            undo_last_commit,
            push_branch,
            push_branch_with_upstream,
            get_staged_diff,
            add_to_gitignore,
            get_last_commit,
            get_commit_history,
            get_file_diff,
            get_commit_diff,
            get_file_at_revision,
            cherry_pick_commit,
            start_process,
            stop_process,
            is_process_running,
            write_to_process,
            resize_process,
            detect_port,
            check_port,
            open_external,
            open_in_editor,
            check_git,
            watch_repository,
            unwatch_repository,
            update_tray_status,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Cleanup hook: when the user closes the app, or the OS issues a
    // termination signal (e.g. shutdown), kill every tracked process group.
    // Sleep mode does NOT fire ExitRequested — sleeping apps stay alive, so
    // dev servers keep running, which is what we want.
    app.run(|app_handle, event| match event {
        RunEvent::ExitRequested { .. } | RunEvent::Exit => {
            if let Some(state) = app_handle.try_state::<ProcessState>() {
                process::runner::stop_all(state.inner());
            }
        }
        _ => {}
    });
}
