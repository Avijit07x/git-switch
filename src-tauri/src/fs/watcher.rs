// Single-responsibility: own one `RecommendedWatcher` per tracked repository
// and translate raw filesystem events into a single debounced
// `git-fs-change:<repo_id>` Tauri event. We intentionally ignore noise from
// `.git/objects`, `.git/index.lock`, and `node_modules/` because they fire
// constantly during normal Git operations and would flood React Query.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

#[derive(Default)]
pub struct FsWatcherState {
    inner: Mutex<HashMap<String, WatchHandle>>,
}

struct WatchHandle {
    _watcher: RecommendedWatcher,
    /// Flag flipped to false when the entry is dropped, telling the debouncer
    /// thread to exit cleanly.
    alive: Arc<Mutex<bool>>,
}

impl Drop for WatchHandle {
    fn drop(&mut self) {
        if let Ok(mut a) = self.alive.lock() {
            *a = false;
        }
    }
}

/// Coalesce filesystem bursts (e.g. `yarn install`, `git checkout`, dev
/// server rebuilds) into a single emit. Generous enough that an HMR cycle
/// settles into one refresh, tight enough to feel live.
const DEBOUNCE_MS: u64 = 750;

pub fn start_watching(
    state: &FsWatcherState,
    app: AppHandle,
    repo_id: String,
    repo_path: String,
) -> Result<(), String> {
    let path = PathBuf::from(&repo_path);
    if !path.exists() {
        return Err(format!("Path does not exist: {repo_path}"));
    }

    let mut map = state.inner.lock().map_err(|e| e.to_string())?;
    // Idempotent: re-watching the same repo replaces the old handle.
    map.remove(&repo_id);

    let last_event: Arc<Mutex<Option<Instant>>> = Arc::new(Mutex::new(None));
    let alive: Arc<Mutex<bool>> = Arc::new(Mutex::new(true));

    // ── notify handler: filter noise, then bump `last_event` so the
    //    debouncer thread fires a single emit per quiet-period.
    let last_event_for_handler = Arc::clone(&last_event);
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            let Ok(event) = res else { return };
            if event.paths.iter().all(|p| should_ignore(p)) {
                return;
            }
            if let Ok(mut le) = last_event_for_handler.lock() {
                *le = Some(Instant::now());
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&path, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // ── debouncer thread: every 100ms check whether DEBOUNCE_MS has elapsed
    //    since the last raw event. If so, emit once and clear the marker.
    let last_event_for_thread = Arc::clone(&last_event);
    let alive_for_thread = Arc::clone(&alive);
    let app_for_thread = app.clone();
    let repo_id_for_thread = repo_id.clone();
    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_millis(100));
            if !*alive_for_thread.lock().unwrap_or_else(|e| e.into_inner()) {
                break;
            }
            let should_emit = {
                let mut le = match last_event_for_thread.lock() {
                    Ok(g) => g,
                    Err(_) => continue,
                };
                match *le {
                    Some(ts) if ts.elapsed() >= Duration::from_millis(DEBOUNCE_MS) => {
                        *le = None;
                        true
                    }
                    _ => false,
                }
            };
            if should_emit {
                let _ = app_for_thread
                    .emit(&format!("git-fs-change:{repo_id_for_thread}"), ());
            }
        }
    });

    map.insert(
        repo_id,
        WatchHandle {
            _watcher: watcher,
            alive,
        },
    );
    drop(last_event);
    Ok(())
}

pub fn stop_watching(state: &FsWatcherState, repo_id: &str) -> Result<(), String> {
    let mut map = state.inner.lock().map_err(|e| e.to_string())?;
    map.remove(repo_id);
    Ok(())
}

/// Filter out paths that change constantly during normal Git activity. We
/// match against any path component so the rules apply at any depth.
fn should_ignore(path: &Path) -> bool {
    let mut saw_git = false;
    for component in path.components() {
        let name = component.as_os_str();
        if name == ".git" {
            saw_git = true;
            continue;
        }
        if saw_git {
            // Inside `.git/`: only `HEAD` and `refs/` are interesting (branch
            // pointer changes); everything else is internal churn.
            if name == "objects"
                || name == "logs"
                || name == "info"
                || name == "hooks"
                || name == "index.lock"
                || name == "FETCH_HEAD"
                || name == "ORIG_HEAD"
                || name == "MERGE_HEAD"
                || name == "packed-refs"
            {
                return true;
            }
        }
        if name == "node_modules"
            || name == "target"
            || name == ".DS_Store"
            || name == ".next"
            || name == ".turbo"
            || name == ".vite"
            || name == ".cache"
            || name == ".parcel-cache"
            || name == ".swc"
            || name == "coverage"
            || name == "dist"
            || name == "build"
            || name == "out"
            || name == "tsconfig.tsbuildinfo"
        {
            return true;
        }
    }
    false
}
