mod fs;
mod git;
mod process;
mod repository;

use fs::commands::*;
use fs::FsWatcherState;
use git::commands::*;
use process::commands::*;
use process::ProcessState;
use tauri::{Manager, RunEvent};

#[cfg(target_os = "macos")]
use tauri::utils::{config::WindowEffectsConfig, WindowEffect, WindowEffectState};

/// Smoke-test the host environment so the app can warn the user *once* on
/// launch instead of failing every command silently. Pushed to the blocking
/// pool so spawning `git --version` (slow first launch on macOS while the
/// Command Line Tools resolve) doesn't stall the IPC executor.
#[tauri::command]
async fn check_git() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = std::process::Command::new("git").arg("--version").output();
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

    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(target_os = "linux")]
    let program = "xdg-open";
    #[cfg(target_os = "windows")]
    let program = "explorer";

    std::process::Command::new(program)
        .arg(&target)
        .spawn()
        .map_err(|e| format!("Failed to open: {e}"))?;
    Ok(())
}

// Single-responsibility: apply NSVisualEffectView ("vibrancy") to the main
// window so the title bar and side panels blend with the desktop wallpaper,
// matching native macOS apps. The transparent flag in `tauri.conf.json` +
// the CSS variable token system on the frontend handle the rest.
#[cfg(target_os = "macos")]
fn apply_vibrancy(app: &tauri::App) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_effects(WindowEffectsConfig {
            effects: vec![WindowEffect::HudWindow, WindowEffect::Sidebar],
            state: Some(WindowEffectState::Active),
            radius: None,
            color: None,
        });
    }
}

#[cfg(not(target_os = "macos"))]
fn apply_vibrancy(_app: &tauri::App) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ProcessState::default())
        .manage(FsWatcherState::default())
        .setup(|app| {
            apply_vibrancy(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            validate_repository,
            clone_repository,
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
            start_process,
            stop_process,
            is_process_running,
            write_to_process,
            resize_process,
            detect_port,
            check_port,
            open_external,
            check_git,
            watch_repository,
            unwatch_repository,
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
