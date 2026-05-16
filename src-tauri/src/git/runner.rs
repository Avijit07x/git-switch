use std::path::{Path, PathBuf};
use std::process::Command;

use super::error::{GitError, GitResult};
use super::types::GitCommandResult;

// Single-responsibility: resolve a Git repo's top-level directory.
pub fn resolve_repo_root(path: &str) -> GitResult<PathBuf> {
    let candidate = PathBuf::from(path);
    if !candidate.exists() {
        return Err(GitError::PathNotFound(path.to_string()));
    }
    if !candidate.is_dir() {
        return Err(GitError::NotADirectory(path.to_string()));
    }

    let output = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(&candidate)
        .output()
        .map_err(|e| GitError::SpawnFailed(e.to_string()))?;

    if !output.status.success() {
        return Err(GitError::NotARepository(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    Ok(PathBuf::from(
        String::from_utf8_lossy(&output.stdout).trim().to_string(),
    ))
}

// Single-responsibility: run `git <args>` inside `cwd` and capture stdout/stderr.
// Never panics on Git failure — always returns a structured GitCommandResult.
pub fn run_git(cwd: &Path, args: &[&str]) -> GitResult<GitCommandResult> {
    if !cwd.exists() {
        return Err(GitError::PathNotFound(cwd.display().to_string()));
    }

    let output = Command::new("git")
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
