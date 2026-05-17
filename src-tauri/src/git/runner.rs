use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use super::error::{GitError, GitResult};
use super::types::GitCommandResult;
use crate::platform::command;

// Single-responsibility: cache resolved repo roots so we don't spawn a
// `git rev-parse --show-toplevel` on every command. The same `path` value is
// almost always passed (it's the stored repository path), and re-resolving
// is pure overhead — one fewer process spawn per IPC call adds up quickly
// when the sidebar fans out N quick_status reads.
fn root_cache() -> &'static Mutex<HashMap<String, PathBuf>> {
    static CACHE: OnceLock<Mutex<HashMap<String, PathBuf>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

// Single-responsibility: resolve a Git repo's top-level directory, with a
// process-wide cache to skip the `git rev-parse` call when we've seen this
// path before. Invalidates lazily — if a cached root no longer exists on
// disk we fall through to a fresh resolution.
pub fn resolve_repo_root(path: &str) -> GitResult<PathBuf> {
    if let Ok(cache) = root_cache().lock() {
        if let Some(cached) = cache.get(path) {
            if cached.exists() {
                return Ok(cached.clone());
            }
        }
    }

    let candidate = PathBuf::from(path);
    if !candidate.exists() {
        return Err(GitError::PathNotFound(path.to_string()));
    }
    if !candidate.is_dir() {
        return Err(GitError::NotADirectory(path.to_string()));
    }

    let output = command("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(&candidate)
        .output()
        .map_err(|e| GitError::SpawnFailed(e.to_string()))?;

    if !output.status.success() {
        return Err(GitError::NotARepository(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    let root = PathBuf::from(
        String::from_utf8_lossy(&output.stdout).trim().to_string(),
    );

    if let Ok(mut cache) = root_cache().lock() {
        cache.insert(path.to_string(), root.clone());
    }

    Ok(root)
}

// Single-responsibility: run `git <args>` inside `cwd` and capture stdout/stderr.
// Never panics on Git failure — always returns a structured GitCommandResult.
pub fn run_git(cwd: &Path, args: &[&str]) -> GitResult<GitCommandResult> {
    if !cwd.exists() {
        return Err(GitError::PathNotFound(cwd.display().to_string()));
    }

    let output = command("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| GitError::SpawnFailed(e.to_string()))?;

    Ok(GitCommandResult {
        command: "git".to_string(),
        args: args.iter().map(|s| s.to_string()).collect(),
        cwd: cwd.display().to_string(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
        success: output.status.success(),
    })
}
