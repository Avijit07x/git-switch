// Single-responsibility: own one `RecommendedWatcher` per tracked repository
// and translate raw filesystem events into a single debounced
// `git-fs-change:<repo_id>` Tauri event. We intentionally ignore noise from
// `.git/objects`, `.git/index.lock`, and `node_modules/` because they fire
// constantly during normal Git operations and would flood React Query.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex};
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
    /// Signals the debouncer thread to wake up — either because a new event
    /// arrived (re-arms the timer) or because we're shutting down.
    signal: Arc<(Mutex<DebouncerState>, Condvar)>,
}

#[derive(Default)]
struct DebouncerState {
    /// When the most recent raw FS event landed. None = no pending event.
    last_event: Option<Instant>,
    /// Flipped to false when the handle is dropped; the debouncer thread
    /// reads this on every wake to know whether to exit.
    alive: bool,
}

impl Drop for WatchHandle {
    fn drop(&mut self) {
        let (lock, cvar) = &*self.signal;
        if let Ok(mut state) = lock.lock() {
            state.alive = false;
            cvar.notify_all();
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

    // Shared (state, condvar) — the notify callback writes `last_event` and
    // signals; the debouncer thread waits on the condvar instead of spinning
    // a 100ms polling loop, which was burning one CPU thread per watcher.
    let signal: Arc<(Mutex<DebouncerState>, Condvar)> = Arc::new((
        Mutex::new(DebouncerState {
            last_event: None,
            alive: true,
        }),
        Condvar::new(),
    ));

    // ── notify handler: filter noise, then bump `last_event` so the
    //    debouncer thread fires a single emit per quiet-period.
    let signal_for_handler = Arc::clone(&signal);
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            let Ok(event) = res else { return };
            if event.paths.iter().all(|p| should_ignore(p)) {
                return;
            }
            let (lock, cvar) = &*signal_for_handler;
            if let Ok(mut s) = lock.lock() {
                s.last_event = Some(Instant::now());
                cvar.notify_all();
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&path, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // ── debouncer thread: blocks on the condvar until an event arrives,
    //    then waits the remaining quiet-period, then emits. No spinning.
    let signal_for_thread = Arc::clone(&signal);
    let app_for_thread = app.clone();
    let repo_id_for_thread = repo_id.clone();
    let debounce = Duration::from_millis(DEBOUNCE_MS);
    thread::spawn(move || {
        let (lock, cvar) = &*signal_for_thread;
        loop {
            let mut state = match lock.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            // Wait until either: a new event has been recorded, or we're
            // told to shut down.
            while state.alive && state.last_event.is_none() {
                state = match cvar.wait(state) {
                    Ok(g) => g,
                    Err(_) => return,
                };
            }
            if !state.alive {
                return;
            }
            // We have a pending event. Compute remaining quiet time, drop
            // the lock, and sleep — if a *new* event arrives during the
            // sleep, the next iteration will find `last_event` advanced and
            // wait longer. Effectively: emit once the FS has been quiet for
            // DEBOUNCE_MS.
            let pending = state.last_event.expect("guarded above");
            let elapsed = pending.elapsed();
            let to_wait = debounce.checked_sub(elapsed).unwrap_or_default();
            drop(state);
            if !to_wait.is_zero() {
                thread::sleep(to_wait);
            }
            // Re-check: maybe a new event reset the timer while we slept.
            let mut state = match lock.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            if !state.alive {
                return;
            }
            let still = state.last_event;
            if let Some(ts) = still {
                if ts.elapsed() >= debounce {
                    state.last_event = None;
                    drop(state);
                    let _ = app_for_thread
                        .emit(&format!("git-fs-change:{repo_id_for_thread}"), ());
                }
            }
        }
    });

    map.insert(
        repo_id,
        WatchHandle {
            _watcher: watcher,
            signal,
        },
    );
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
