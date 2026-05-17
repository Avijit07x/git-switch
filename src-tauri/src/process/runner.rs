// Single-responsibility: spawn shell commands inside a PTY so colors,
// progress bars, and TTY-aware tools behave normally. Stream the raw bytes
// back to the frontend as `process-data:<repoId>` events, terminate the
// child cleanly via portable-pty's ChildKiller, and report exit status.

use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::sync::Mutex;

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct ProcessState {
    inner: Mutex<HashMap<String, ProcessHandle>>,
}

struct ProcessHandle {
    pid: u32,
    master: Box<dyn MasterPty + Send>,
    killer: Box<dyn portable_pty::ChildKiller + Send + Sync>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessData {
    pub repo_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessExit {
    pub repo_id: String,
    pub exit_code: i32,
    pub success: bool,
}

fn data_event(repo_id: &str) -> String {
    format!("process-data:{repo_id}")
}

fn exit_event(repo_id: &str) -> String {
    format!("process-exit:{repo_id}")
}

fn started_event(repo_id: &str) -> String {
    format!("process-started:{repo_id}")
}

fn stopping_event(repo_id: &str) -> String {
    format!("process-stopping:{repo_id}")
}

pub fn is_running(state: &ProcessState, repo_id: &str) -> bool {
    state.inner.lock().unwrap().contains_key(repo_id)
}

// SIGTERM then SIGKILL the whole process group rooted at `pid`. This catches
// descendants (e.g. nodemon's spawned `node`) that have detached from the
// controlling TTY and would survive a plain SIGHUP.
#[cfg(unix)]
fn killpg(pid: u32) {
    if pid == 0 {
        return;
    }
    let pid_i32 = pid as i32;
    unsafe {
        // Polite shutdown first…
        libc::kill(-pid_i32, libc::SIGTERM);
    }
    std::thread::sleep(std::time::Duration::from_millis(200));
    unsafe {
        // …then the hammer.
        libc::kill(-pid_i32, libc::SIGKILL);
    }
}

#[cfg(not(unix))]
fn killpg(_pid: u32) {}

pub fn stop(state: &ProcessState, repo_id: &str) -> bool {
    let handle = state.inner.lock().unwrap().remove(repo_id);
    if let Some(mut h) = handle {
        #[cfg(debug_assertions)]
        eprintln!("[git-switch] stop pid={}", h.pid);
        // 1) Ask portable-pty to kill — this sends SIGHUP through the PTY.
        let _ = h.killer.kill();
        // 2) Hammer the whole process group — catches anything that detached
        //    from the TTY (nodemon's grandchild `node` is the usual culprit).
        killpg(h.pid);
        true
    } else {
        #[cfg(debug_assertions)]
        eprintln!("[git-switch] stop: no handle for {repo_id}");
        false
    }
}

/// Hint to frontend listeners that a stop is in flight — they can flip their
/// optimistic state immediately rather than waiting for `process-exit`.
pub fn emit_stopping(app: &AppHandle, repo_id: &str) {
    let _ = app.emit(&stopping_event(repo_id), repo_id.to_string());
}

pub fn stop_all(state: &ProcessState) {
    let handles: Vec<ProcessHandle> = {
        let mut map = state.inner.lock().unwrap();
        map.drain().map(|(_, h)| h).collect()
    };
    for mut h in handles {
        #[cfg(debug_assertions)]
        eprintln!("[git-switch] stop_all pid={}", h.pid);
        let _ = h.killer.kill();
        killpg(h.pid);
    }
}

pub fn write_input(state: &ProcessState, repo_id: &str, data: &str) -> Result<(), String> {
    let mut map = state.inner.lock().unwrap();
    let handle = map
        .get_mut(repo_id)
        .ok_or_else(|| format!("No running process for {repo_id}"))?;
    let mut writer = handle
        .master
        .take_writer()
        .map_err(|e| format!("take_writer failed: {e}"))?;
    use std::io::Write;
    writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("write failed: {e}"))?;
    Ok(())
}

pub fn resize(
    state: &ProcessState,
    repo_id: &str,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let map = state.inner.lock().unwrap();
    let handle = map
        .get(repo_id)
        .ok_or_else(|| format!("No running process for {repo_id}"))?;
    handle
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("resize failed: {e}"))?;
    Ok(())
}

/// Best-effort parse of `PORT=<n>` from a project's `.env` (or `.env.local`)
/// so the user doesn't have to configure the port twice.
pub fn detect_port_from_env(cwd: &str) -> Option<u16> {
    let candidates = [".env.local", ".env"];
    for name in candidates {
        let path = std::path::Path::new(cwd).join(name);
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            for key in ["PORT", "SERVER_PORT", "APP_PORT"] {
                let prefix = format!("{key}=");
                if let Some(rest) = line.strip_prefix(&prefix) {
                    let value = rest
                        .trim()
                        .trim_matches(|c| c == '"' || c == '\'')
                        .split('#')
                        .next()
                        .unwrap_or("")
                        .trim();
                    if let Ok(p) = value.parse::<u16>() {
                        return Some(p);
                    }
                }
            }
        }
    }
    None
}

/// Returns the PIDs currently listening on `port` without killing anything.
/// Used by the frontend to ask the user whether to kill them before Run.
pub fn pids_on_port(port: u16) -> Vec<u32> {
    let mut pids = Vec::new();
    let output = crate::platform::command("lsof")
        .args(["-ti", &format!(":{port}")])
        .output();
    if let Ok(out) = output {
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            if let Ok(pid) = line.trim().parse::<u32>() {
                pids.push(pid);
            }
        }
    }
    pids
}

/// Use lsof to find any PIDs listening on the given port and SIGKILL them.
/// Best-effort — silently no-ops if lsof isn't available or nothing matches.
fn free_port(port: u16) -> Vec<u32> {
    let mut killed = Vec::new();
    let output = crate::platform::command("lsof")
        .args(["-ti", &format!(":{port}")])
        .output();
    if let Ok(out) = output {
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            if let Ok(pid) = line.trim().parse::<u32>() {
                #[cfg(debug_assertions)]
                eprintln!("[git-switch] free_port {port}: SIGKILL pid {pid}");
                #[cfg(unix)]
                unsafe {
                    libc::kill(pid as i32, libc::SIGKILL);
                }
                killed.push(pid);
            }
        }
        if !killed.is_empty() {
            // Give the kernel a moment to release the socket.
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
    }
    killed
}

pub async fn start(
    app: AppHandle,
    state: &ProcessState,
    repo_id: String,
    command: String,
    cwd: String,
    kill_port: Option<u16>,
) -> Result<(), String> {
    stop(state, &repo_id);

    if !Path::new(&cwd).is_dir() {
        return Err(format!("Working directory not found: {cwd}"));
    }
    if command.trim().is_empty() {
        return Err("Command is empty".into());
    }

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let data_evt = data_event(&repo_id);

    // Pre-flight: only free the port if the frontend explicitly asks (after
    // confirming with the user). No silent kills here.
    if let Some(port) = kill_port {
        let killed = free_port(port);
        if !killed.is_empty() {
            let _ = app.emit(
                &data_evt,
                ProcessData {
                    repo_id: repo_id.clone(),
                    data: format!(
                        "\x1b[33m✦ freed port {port} (killed pid{} {})\x1b[0m\r\n",
                        if killed.len() == 1 { "" } else { "s" },
                        killed
                            .iter()
                            .map(|p| p.to_string())
                            .collect::<Vec<_>>()
                            .join(", ")
                    ),
                },
            );
        }
    }

    // Emit a banner so the user sees feedback before the shell prints anything.
    let _ = app.emit(
        &data_evt,
        ProcessData {
            repo_id: repo_id.clone(),
            data: format!("\x1b[2m$ {command}\r\n  (shell: {shell})\x1b[0m\r\n"),
        },
    );

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 30,
            cols: 100,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty failed: {e}"))?;

    let mut builder = CommandBuilder::new(&shell);
    // -l: login shell (sources ~/.zprofile / ~/.bash_profile)
    // -i: interactive shell (sources ~/.zshrc / ~/.bashrc — this is where nvm,
    //     fnm, asdf, pnpm, etc. live, so PATH matches Terminal.app exactly).
    // -c: run the user's command and exit.
    builder.args(["-lic", &command]);
    builder.cwd(&cwd);
    // Force programs that check $TERM to behave correctly.
    builder.env("TERM", "xterm-256color");
    builder.env("FORCE_COLOR", "1");

    let mut child = pair
        .slave
        .spawn_command(builder)
        .map_err(|e| format!("spawn failed: {e}"))?;
    // Close the slave end on our side so EOF propagates correctly to the child.
    drop(pair.slave);

    let pid = child.process_id().unwrap_or(0);
    let killer = child.clone_killer();

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("try_clone_reader failed: {e}"))?;

    state.inner.lock().unwrap().insert(
        repo_id.clone(),
        ProcessHandle {
            pid,
            master: pair.master,
            killer,
        },
    );

    // Tell the frontend a process has begun for this repo so any useProcess()
    // consumer flips its status to "running" — including callers that bypass
    // the hook (e.g. bulk Run from the Group dashboard).
    let _ = app.emit(&started_event(&repo_id), repo_id.clone());

    // Blocking reader → emit data chunks.
    {
        let app = app.clone();
        let repo_id = repo_id.clone();
        let evt = data_evt.clone();
        tokio::task::spawn_blocking(move || {
            let mut reader = reader;
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app.emit(
                            &evt,
                            ProcessData {
                                repo_id: repo_id.clone(),
                                data,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }
        });
    }

    // Wait task — child.wait() is blocking, run on blocking pool.
    {
        let app = app.clone();
        let exit_evt = exit_event(&repo_id);
        let repo_id_for_state = repo_id.clone();
        tokio::task::spawn_blocking(move || {
            let status = child.wait();
            let exit_code = match status {
                Ok(s) if s.success() => 0,
                Ok(s) => s.exit_code() as i32,
                Err(_) => -1,
            };
            let success = exit_code == 0;

            if let Some(state) = app.try_state::<ProcessState>() {
                state.inner.lock().unwrap().remove(&repo_id_for_state);
            }
            let _ = app.emit(
                &exit_evt,
                ProcessExit {
                    repo_id: repo_id_for_state,
                    exit_code,
                    success,
                },
            );
        });
    }

    Ok(())
}
