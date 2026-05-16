use serde::Serialize;
use thiserror::Error;

// Single-responsibility: structured, exhaustive error type for the git layer.
// Internal Rust callers use this directly; Tauri commands convert it to a
// String via `to_string()` for backward-compat with the existing frontend.
#[derive(Debug, Clone, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum GitError {
    #[error("Path does not exist: {0}")]
    PathNotFound(String),

    #[error("Path is not a directory: {0}")]
    NotADirectory(String),

    #[error("Not a Git repository: {0}")]
    NotARepository(String),

    #[error("Failed to spawn git: {0}")]
    SpawnFailed(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),
}

pub type GitResult<T> = Result<T, GitError>;
