// Single-responsibility: Tauri-facing wrappers for the process runner.

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::runner::{self, ProcessState};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StopBanner {
    repo_id: String,
    data: &'static str,
}

#[tauri::command]
pub async fn start_process(
    app: AppHandle,
    state: State<'_, ProcessState>,
    repo_id: String,
    command: String,
    cwd: String,
    kill_port: Option<u16>,
) -> Result<(), String> {
    runner::start(app, state.inner(), repo_id, command, cwd, kill_port).await
}

#[tauri::command]
pub fn stop_process(
    app: AppHandle,
    state: State<'_, ProcessState>,
    repo_id: String,
) -> Result<bool, String> {
    // 1) Banner in the terminal for visible feedback.
    let _ = app.emit(
        &format!("process-data:{repo_id}"),
        StopBanner {
            repo_id: repo_id.clone(),
            data: "\r\n\x1b[33m↪ stop requested\x1b[0m\r\n",
        },
    );
    // 2) State-change signal so useProcess() flips to "exited" optimistically
    //    (parent-driven bulk stops bypass the hook's own stop() helper).
    runner::emit_stopping(&app, &repo_id);

    Ok(runner::stop(state.inner(), &repo_id))
}

#[tauri::command]
pub fn is_process_running(
    state: State<'_, ProcessState>,
    repo_id: String,
) -> Result<bool, String> {
    Ok(runner::is_running(state.inner(), &repo_id))
}

#[tauri::command]
pub fn write_to_process(
    state: State<'_, ProcessState>,
    repo_id: String,
    data: String,
) -> Result<(), String> {
    runner::write_input(state.inner(), &repo_id, &data)
}

#[tauri::command]
pub fn resize_process(
    state: State<'_, ProcessState>,
    repo_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    runner::resize(state.inner(), &repo_id, cols, rows)
}

#[tauri::command]
pub fn detect_port(cwd: String) -> Option<u16> {
    runner::detect_port_from_env(&cwd)
}

#[tauri::command]
pub fn check_port(port: u16) -> Vec<u32> {
    runner::pids_on_port(port)
}
