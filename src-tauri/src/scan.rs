// Single-responsibility: recursively scan a base directory for subfolders
// and report whether each one is a Git repository. Powers the "Add multiple
// repos at once" flow on the sidebar — user picks a parent folder, we hand
// back a list of children plus an is_git_repo flag. We don't filter the
// non-git ones here; the frontend decides whether to show them (and offers
// `git init` for those that aren't).

use std::path::{Path, PathBuf};

use serde::Serialize;

/// One entry in the scan result. Sent to the frontend as JSON.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedEntry {
    pub name: String,
    pub path: String,
    pub is_git_repo: bool,
}

/// Folders we never want to descend into. Big checkout artifacts (node_modules,
/// target, vendor) and IDE/cache noise. We DON'T descend into `.git` itself —
/// every regular file under it is irrelevant to "is this a repo".
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "vendor",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".cache",
    ".turbo",
    ".vercel",
    ".idea",
    ".vscode",
    "__pycache__",
    ".venv",
    "venv",
    ".pytest_cache",
];

const MAX_DEPTH: u32 = 4;

/// Detect a git repo by the presence of a `.git` entry inside `dir`. Git
/// represents repos two ways: a `.git/` directory (normal clone) or a `.git`
/// file (worktree / submodule pointer). Either is a repo for our purposes.
fn is_git_repo(dir: &Path) -> bool {
    let dotgit = dir.join(".git");
    dotgit.exists()
}

fn is_skip(name: &str) -> bool {
    name.starts_with('.') || SKIP_DIRS.contains(&name)
}

fn walk(base: &Path, depth: u32, out: &mut Vec<ScannedEntry>) {
    if depth > MAX_DEPTH {
        return;
    }
    let read = match std::fs::read_dir(base) {
        Ok(r) => r,
        Err(_) => return,
    };
    for entry in read.flatten() {
        let path = entry.path();
        let Ok(meta) = entry.file_type() else { continue };
        if !meta.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if is_skip(&name) {
            continue;
        }
        let is_repo = is_git_repo(&path);
        out.push(ScannedEntry {
            name: name.clone(),
            path: path.display().to_string(),
            is_git_repo: is_repo,
        });
        // Don't recurse into a repo — the user wants the repo itself, not
        // its subdirs.
        if !is_repo {
            walk(&path, depth + 1, out);
        }
    }
}

/// Public entry point. Returns every child folder of `base` (up to MAX_DEPTH
/// deep) along with whether it's a git repo. Sorted: git repos first, then
/// alphabetic.
pub fn scan(base: &str) -> Result<Vec<ScannedEntry>, String> {
    let base_path = PathBuf::from(base);
    if !base_path.exists() {
        return Err(format!("Folder not found: {base}"));
    }
    if !base_path.is_dir() {
        return Err(format!("Not a folder: {base}"));
    }

    let mut out = Vec::new();
    walk(&base_path, 0, &mut out);

    out.sort_by(|a, b| match (a.is_git_repo, b.is_git_repo) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(out)
}

/// Tauri-exposed command. Runs on the blocking pool because directory
/// traversal hits the filesystem and shouldn't stall the IPC executor.
#[tauri::command]
pub async fn scan_directory(base: String) -> Result<Vec<ScannedEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || scan(&base))
        .await
        .map_err(|e| e.to_string())?
}
