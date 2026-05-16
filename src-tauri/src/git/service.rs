// Single-responsibility: pure (non-Tauri) Git operations. Each function takes
// primitive inputs, validates the repo, runs the appropriate `git` command,
// parses the result into a typed payload, and returns a `GitResult`. No `#[tauri::command]`
// glue lives here — that's `commands.rs`.

use super::error::{GitError, GitResult};
use super::runner::{resolve_repo_root, run_git};
use super::types::{
    AheadBehind, CommitInfo, GitBranch, GitBranchList, GitCommandResult, GitStatus, GitStatusFile,
    LastCommit, QuickStatus,
};

pub fn validate_repository(path: &str) -> GitResult<String> {
    resolve_repo_root(path).map(|p| p.display().to_string())
}

/// Accept only the transports `git` actually supports + a conservative
/// character set that covers every real-world clone URL. No shell metachars
/// can reach git anyway (we pass args as an array), but rejecting suspicious
/// input early gives the user a clear error instead of a cryptic git failure.
fn is_plausible_git_url(url: &str) -> bool {
    // Strip a leading scp-style "git@host:" or "user@host:" before validating.
    let body = if let Some(rest) = url.strip_prefix("https://") {
        rest
    } else if let Some(rest) = url.strip_prefix("http://") {
        rest
    } else if let Some(rest) = url.strip_prefix("ssh://") {
        rest
    } else if let Some(rest) = url.strip_prefix("git://") {
        rest
    } else if let Some((_user_host, path)) = url.split_once(':') {
        // scp-like: "git@github.com:user/repo.git"
        if !_user_host.contains('@') || _user_host.contains('/') {
            return false;
        }
        path
    } else {
        return false;
    };
    if body.is_empty() {
        return false;
    }
    body.chars().all(|c| {
        c.is_ascii_alphanumeric()
            || matches!(
                c,
                '.' | '_'
                    | '~'
                    | '-'
                    | '/'
                    | ':'
                    | '@'
                    | '%'
                    | '+'
                    | '?'
                    | '='
                    | '&'
                    | '#'
            )
    })
}

/// Clone a remote repository. Optional `ssh_key_path` selects which private
/// key is used via `GIT_SSH_COMMAND` — the key file stays on disk; we only
/// pass its path. `IdentitiesOnly=yes` forces ssh to use only this key,
/// ignoring others loaded into the agent.
pub fn clone_repository(
    url: &str,
    target_dir: &str,
    ssh_key_path: Option<&str>,
) -> GitResult<GitCommandResult> {
    let url = url.trim();
    if url.is_empty() {
        return Err(GitError::InvalidInput("URL is required".into()));
    }
    if target_dir.trim().is_empty() {
        return Err(GitError::InvalidInput("Target directory is required".into()));
    }
    // Reject obvious command-injection shapes. Note: arguments are passed as
    // an array to `git` so shell metachars can't actually break out, but
    // CR/LF and null bytes are still illegitimate in any real Git URL.
    if url.chars().any(|c| c.is_control()) {
        return Err(GitError::InvalidInput("URL contains control characters".into()));
    }
    if !is_plausible_git_url(url) {
        return Err(GitError::InvalidInput(format!(
            "URL doesn't look like a Git remote: {url}"
        )));
    }
    let parent = std::path::Path::new(target_dir)
        .parent()
        .ok_or_else(|| GitError::InvalidInput(format!("Invalid target: {target_dir}")))?;
    if !parent.exists() {
        return Err(GitError::PathNotFound(parent.display().to_string()));
    }

    let mut cmd = std::process::Command::new("git");
    cmd.args(["clone", url, target_dir]);

    if let Some(key) = ssh_key_path {
        let key = key.trim();
        if !key.is_empty() {
            if !std::path::Path::new(key).is_file() {
                return Err(GitError::PathNotFound(format!("SSH key: {key}")));
            }
            cmd.env(
                "GIT_SSH_COMMAND",
                format!(
                    "ssh -i '{}' -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new",
                    key.replace('\'', r"'\''")
                ),
            );
        }
    }

    let output = cmd
        .output()
        .map_err(|e| GitError::SpawnFailed(e.to_string()))?;

    Ok(GitCommandResult {
        command: "git".to_string(),
        args: vec!["clone".to_string(), url.to_string(), target_dir.to_string()],
        cwd: parent.display().to_string(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
        success: output.status.success(),
    })
}

pub fn get_branches(path: &str) -> GitResult<GitBranchList> {
    let root = resolve_repo_root(path)?;

    let current_res = run_git(&root, &["branch", "--show-current"])?;
    let current = current_res.stdout.trim();
    let current_opt = if current.is_empty() {
        None
    } else {
        Some(current.to_string())
    };

    let local_res = run_git(
        &root,
        &[
            "for-each-ref",
            "--format=%(refname:short)\t%(upstream:short)",
            "refs/heads",
        ],
    )?;
    let remote_res = run_git(
        &root,
        &["for-each-ref", "--format=%(refname:short)", "refs/remotes"],
    )?;

    let local: Vec<GitBranch> = local_res
        .stdout
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let mut parts = line.splitn(2, '\t');
            let name = parts.next().unwrap_or("").trim().to_string();
            let upstream_raw = parts.next().unwrap_or("").trim();
            GitBranch {
                is_current: current_opt.as_deref() == Some(name.as_str()),
                upstream: if upstream_raw.is_empty() {
                    None
                } else {
                    Some(upstream_raw.to_string())
                },
                name,
                is_remote: false,
            }
        })
        .collect();

    let remote: Vec<GitBranch> = remote_res
        .stdout
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter(|l| !l.contains("HEAD ->"))
        .map(|line| GitBranch {
            name: line.trim().to_string(),
            is_current: false,
            is_remote: true,
            upstream: None,
        })
        .collect();

    Ok(GitBranchList {
        current: current_opt,
        local,
        remote,
        result: local_res,
    })
}

pub fn switch_branch(path: &str, branch: &str) -> GitResult<GitCommandResult> {
    let root = resolve_repo_root(path)?;
    run_git(&root, &["switch", branch])
}

pub fn create_local_branch_from_remote(
    path: &str,
    local_branch: &str,
    remote_branch: &str,
) -> GitResult<GitCommandResult> {
    let root = resolve_repo_root(path)?;
    run_git(
        &root,
        &["switch", "-c", local_branch, "--track", remote_branch],
    )
}

/// Create a brand-new local branch (no upstream, no tracking) and switch to
/// it. Mirrors `git switch -c <name>` exactly. Use `push_branch_with_upstream`
/// afterwards to publish it.
pub fn create_local_branch(path: &str, branch: &str) -> GitResult<GitCommandResult> {
    let name = branch.trim();
    if name.is_empty() {
        return Err(GitError::InvalidInput("Branch name cannot be empty".into()));
    }
    // Reject characters Git itself rejects in refs (subset — Git's rules are
    // long, but these are the ones a human would actually try to type).
    if name.starts_with('-')
        || name.contains("..")
        || name.contains(' ')
        || name.chars().any(|c| matches!(c, '~' | '^' | ':' | '?' | '*' | '[' | '\\'))
    {
        return Err(GitError::InvalidInput(format!(
            "Invalid branch name: {name}"
        )));
    }
    let root = resolve_repo_root(path)?;
    run_git(&root, &["switch", "-c", name])
}

pub fn pull_branch(path: &str) -> GitResult<GitCommandResult> {
    let root = resolve_repo_root(path)?;
    run_git(&root, &["pull"])
}

/// Fetch refs from all remotes without merging. `--prune` so deleted upstream
/// branches stop appearing in `git branch -r`. Safe to run frequently — does
/// not touch the working tree or current branch.
pub fn fetch_remote(path: &str) -> GitResult<GitCommandResult> {
    let root = resolve_repo_root(path)?;
    run_git(&root, &["fetch", "--all", "--prune"])
}

/// Compute the ahead/behind counts between the current branch and its
/// upstream. Returns zeros (and `upstream = None`) when no upstream is
/// configured. Never errors on detached HEAD — falls back to all-None.
pub fn get_ahead_behind(path: &str) -> GitResult<AheadBehind> {
    let root = resolve_repo_root(path)?;

    let branch_res = run_git(&root, &["branch", "--show-current"])?;
    let branch = branch_res.stdout.trim();
    if branch.is_empty() {
        return Ok(AheadBehind {
            branch: None,
            upstream: None,
            ahead: 0,
            behind: 0,
        });
    }

    let upstream_res = run_git(
        &root,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    )?;
    if !upstream_res.success {
        return Ok(AheadBehind {
            branch: Some(branch.to_string()),
            upstream: None,
            ahead: 0,
            behind: 0,
        });
    }
    let upstream = upstream_res.stdout.trim().to_string();
    if upstream.is_empty() {
        return Ok(AheadBehind {
            branch: Some(branch.to_string()),
            upstream: None,
            ahead: 0,
            behind: 0,
        });
    }

    // `git rev-list --left-right --count <branch>...<upstream>` prints
    // "<ahead>\t<behind>" — left side is unique to <branch>, right side is
    // unique to <upstream>.
    let spec = format!("{branch}...{upstream}");
    let counts_res = run_git(&root, &["rev-list", "--left-right", "--count", &spec])?;
    let (ahead, behind) = parse_ahead_behind(&counts_res.stdout);

    Ok(AheadBehind {
        branch: Some(branch.to_string()),
        upstream: Some(upstream),
        ahead,
        behind,
    })
}

fn parse_ahead_behind(stdout: &str) -> (u32, u32) {
    let line = stdout.lines().next().unwrap_or("");
    let mut parts = line.split_whitespace();
    let ahead = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let behind = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    (ahead, behind)
}

/// Batch version — resolve quick status for many repos in parallel using
/// rayon-free std threads. Returns `None` for any repo whose status couldn't
/// be read (path moved, .git corrupted) so the sidebar still renders the row
/// instead of failing the whole batch.
pub fn quick_status_batch(paths: Vec<String>) -> Vec<(String, Option<QuickStatus>)> {
    use std::thread;
    if paths.is_empty() {
        return Vec::new();
    }
    let handles: Vec<_> = paths
        .into_iter()
        .map(|p| {
            thread::spawn(move || {
                let status = quick_status(&p).ok();
                (p, status)
            })
        })
        .collect();
    handles
        .into_iter()
        .filter_map(|h| h.join().ok())
        .collect()
}

/// Lightweight status used by the sidebar. A single `git status --porcelain
/// --branch` returns the branch header AND every changed file in one shot,
/// so we don't have to fan out into `branch --show-current`, `rev-parse
/// @{upstream}`, and `rev-list --count`. With N repos in the sidebar this
/// drops sidebar refreshes from ~4N git invocations to N.
pub fn quick_status(path: &str) -> GitResult<QuickStatus> {
    let root = resolve_repo_root(path)?;
    let res = run_git(&root, &["status", "--porcelain=v1", "--branch"])?;

    let mut lines = res.stdout.lines();
    let header = lines.next().unwrap_or("");
    let (current_branch, upstream, ahead, behind) = parse_status_branch_line(header);
    let changes = lines.filter(|l| !l.is_empty()).count() as u32;

    Ok(QuickStatus {
        current_branch,
        upstream,
        changes,
        ahead,
        behind,
    })
}

/// Parse the `## ...` header emitted by `git status --branch`. Formats:
///   `## main`
///   `## main...origin/main`
///   `## main...origin/main [ahead 1]`
///   `## main...origin/main [ahead 1, behind 2]`
///   `## HEAD (no branch)`              (detached)
///   `## No commits yet on main`        (fresh repo)
fn parse_status_branch_line(line: &str) -> (Option<String>, Option<String>, u32, u32) {
    let body = line.strip_prefix("## ").unwrap_or(line);
    if body.starts_with("HEAD (no branch)") || body.starts_with("No commits yet") {
        return (None, None, 0, 0);
    }
    let (refs_part, ab_part) = match body.split_once(" [") {
        Some((r, rest)) => (r, Some(rest.trim_end_matches(']'))),
        None => (body, None),
    };
    let (branch, upstream) = match refs_part.split_once("...") {
        Some((b, u)) => (Some(b.to_string()), Some(u.to_string())),
        None => (Some(refs_part.to_string()), None),
    };
    let (ahead, behind) = ab_part.map(parse_ahead_behind_text).unwrap_or((0, 0));
    (branch, upstream, ahead, behind)
}

fn parse_ahead_behind_text(s: &str) -> (u32, u32) {
    let mut ahead = 0u32;
    let mut behind = 0u32;
    for token in s.split(", ") {
        if let Some(n) = token.strip_prefix("ahead ") {
            ahead = n.parse().unwrap_or(0);
        } else if let Some(n) = token.strip_prefix("behind ") {
            behind = n.parse().unwrap_or(0);
        }
    }
    (ahead, behind)
}

pub fn get_status(path: &str) -> GitResult<GitStatus> {
    let root = resolve_repo_root(path)?;
    let res = run_git(
        &root,
        &["status", "--porcelain", "--untracked-files=all"],
    )?;
    let files: Vec<GitStatusFile> = res
        .stdout
        .lines()
        .filter(|l| l.len() >= 3)
        .map(parse_porcelain_line)
        .collect();
    Ok(GitStatus {
        clean: files.is_empty(),
        files,
        result: res,
    })
}

fn parse_porcelain_line(line: &str) -> GitStatusFile {
    let bytes = line.as_bytes();
    let index_status = (bytes[0] as char).to_string();
    let worktree_status = (bytes[1] as char).to_string();
    let path = line.get(3..).unwrap_or("").to_string();
    let untracked = index_status == "?" && worktree_status == "?";
    let staged = !untracked && index_status != " " && index_status != "?";
    let unstaged = untracked || (worktree_status != " " && worktree_status != "?");

    GitStatusFile {
        path,
        index_status,
        worktree_status,
        staged,
        unstaged,
        untracked,
    }
}

pub fn stage_files(path: &str, files: &[String]) -> GitResult<GitCommandResult> {
    let root = resolve_repo_root(path)?;
    if files.is_empty() {
        return Err(GitError::InvalidInput("No files provided to stage".into()));
    }
    let mut args: Vec<&str> = vec!["add", "--"];
    args.extend(files.iter().map(|s| s.as_str()));
    run_git(&root, &args)
}

pub fn stage_all(path: &str) -> GitResult<GitCommandResult> {
    let root = resolve_repo_root(path)?;
    run_git(&root, &["add", "."])
}

pub fn unstage_files(path: &str, files: &[String]) -> GitResult<GitCommandResult> {
    let root = resolve_repo_root(path)?;
    if files.is_empty() {
        return Err(GitError::InvalidInput("No files provided to unstage".into()));
    }
    let mut args: Vec<&str> = vec!["restore", "--staged", "--"];
    args.extend(files.iter().map(|s| s.as_str()));
    run_git(&root, &args)
}

pub fn commit_changes(path: &str, message: &str) -> GitResult<GitCommandResult> {
    let root = resolve_repo_root(path)?;
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err(GitError::InvalidInput(
            "Commit message cannot be empty".into(),
        ));
    }
    run_git(&root, &["commit", "-m", trimmed])
}

/// Undo the most recent commit, keeping every change staged in the index
/// (`git reset --soft HEAD~1`). NEVER passes `--hard` — this is a one-way
/// safe operation: the only thing lost is the commit object itself, and
/// only if it's not referenced elsewhere (which the frontend gates on).
///
/// Safety: refuses to run when HEAD~1 doesn't exist (the repo only has one
/// commit). The frontend additionally hides the button when the commit has
/// already been pushed (would rewrite published history), but we don't
/// re-check that here — git reset --soft is already non-destructive to data,
/// and a user who really wants to amend an already-pushed commit can just
/// push again afterwards.
pub fn undo_last_commit(path: &str) -> GitResult<GitCommandResult> {
    let root = resolve_repo_root(path)?;
    // Verify HEAD~1 exists so we don't try to reset the very first commit.
    let parent = run_git(&root, &["rev-parse", "--verify", "HEAD~1"])?;
    if !parent.success {
        return Err(GitError::InvalidInput(
            "No previous commit to undo to (this is the first commit).".into(),
        ));
    }
    run_git(&root, &["reset", "--soft", "HEAD~1"])
}

pub fn push_branch(path: &str) -> GitResult<GitCommandResult> {
    let root = resolve_repo_root(path)?;
    run_git(&root, &["push"])
}

pub fn push_branch_with_upstream(
    path: &str,
    branch: &str,
    remote: &str,
) -> GitResult<GitCommandResult> {
    let root = resolve_repo_root(path)?;
    run_git(&root, &["push", "-u", remote, branch])
}

pub fn get_staged_diff(path: &str) -> GitResult<GitCommandResult> {
    let root = resolve_repo_root(path)?;
    run_git(&root, &["diff", "--cached", "--no-color"])
}

// Single-responsibility: append a pattern to the repo's .gitignore (creating
// it if needed). Returns a synthesized GitCommandResult so it can appear in
// the same command log as real git invocations.
pub fn add_to_gitignore(path: &str, entry: &str) -> GitResult<GitCommandResult> {
    let trimmed = entry.trim();
    if trimmed.is_empty() {
        return Err(GitError::InvalidInput(
            "Ignore pattern cannot be empty".into(),
        ));
    }
    let root = resolve_repo_root(path)?;
    let gitignore_path = root.join(".gitignore");
    let existing = std::fs::read_to_string(&gitignore_path).unwrap_or_default();

    let already_present = existing
        .lines()
        .map(|l| l.trim())
        .any(|l| l == trimmed);

    if !already_present {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&gitignore_path)
            .map_err(|e| GitError::SpawnFailed(format!("open .gitignore: {e}")))?;
        let needs_leading_newline = !existing.is_empty() && !existing.ends_with('\n');
        let to_write = if needs_leading_newline {
            format!("\n{trimmed}\n")
        } else {
            format!("{trimmed}\n")
        };
        file.write_all(to_write.as_bytes())
            .map_err(|e| GitError::SpawnFailed(format!("write .gitignore: {e}")))?;
    }

    // If the file was previously tracked, untrack it so .gitignore actually
    // hides it from future status output. Ignore errors (file may not have
    // been tracked, which is the common case for .env-style additions).
    let _ = run_git(&root, &["rm", "--cached", "--quiet", "--", trimmed]);

    Ok(GitCommandResult {
        command: "gitignore".to_string(),
        args: vec!["append".to_string(), trimmed.to_string()],
        cwd: root.display().to_string(),
        stdout: if already_present {
            format!("'{trimmed}' already in .gitignore")
        } else {
            format!("Added '{trimmed}' to .gitignore")
        },
        stderr: String::new(),
        exit_code: 0,
        success: true,
    })
}

#[cfg(test)]
mod tests {
    //! Smoke tests for the pure parsers + the live git surface. The git-
    //! invoking tests spawn a real `git init` inside a `tempfile::TempDir`,
    //! so they need the `git` CLI on PATH (which CI runners have by default).

    use super::*;
    use std::process::Command;

    // ── Pure parsers ───────────────────────────────────────────────────

    #[test]
    fn parse_ahead_behind_text_handles_both() {
        assert_eq!(parse_ahead_behind_text("ahead 3, behind 5"), (3, 5));
        assert_eq!(parse_ahead_behind_text("ahead 1"), (1, 0));
        assert_eq!(parse_ahead_behind_text("behind 2"), (0, 2));
        assert_eq!(parse_ahead_behind_text(""), (0, 0));
    }

    #[test]
    fn parse_status_branch_line_detached_and_fresh() {
        let (b, u, a, be) = parse_status_branch_line("## HEAD (no branch)");
        assert!(b.is_none() && u.is_none() && a == 0 && be == 0);

        let (b, u, a, be) = parse_status_branch_line("## No commits yet on main");
        assert!(b.is_none() && u.is_none() && a == 0 && be == 0);
    }

    #[test]
    fn parse_status_branch_line_tracking() {
        let (b, u, a, be) =
            parse_status_branch_line("## main...origin/main [ahead 1, behind 2]");
        assert_eq!(b.as_deref(), Some("main"));
        assert_eq!(u.as_deref(), Some("origin/main"));
        assert_eq!(a, 1);
        assert_eq!(be, 2);
    }

    #[test]
    fn is_plausible_git_url_accepts_common_shapes() {
        assert!(is_plausible_git_url("https://github.com/x/y.git"));
        assert!(is_plausible_git_url("git@github.com:x/y.git"));
        assert!(is_plausible_git_url("ssh://git@host.tld/x/y"));
        assert!(!is_plausible_git_url("rm -rf /"));
        assert!(!is_plausible_git_url(""));
    }

    // ── Live git surface ───────────────────────────────────────────────

    fn init_repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().expect("create temp dir");
        for args in [
            &["init", "-q"][..],
            &["config", "user.email", "test@test"][..],
            &["config", "user.name", "Test"][..],
            &["commit", "--allow-empty", "-q", "-m", "initial"][..],
        ] {
            let out = Command::new("git")
                .args(args)
                .current_dir(dir.path())
                .output()
                .expect("spawn git");
            assert!(
                out.status.success(),
                "git {args:?} failed: {}",
                String::from_utf8_lossy(&out.stderr),
            );
        }
        dir
    }

    #[test]
    fn validate_repository_returns_toplevel_for_init_repo() {
        let dir = init_repo();
        let path = dir.path().to_str().unwrap();
        let toplevel = validate_repository(path).expect("validate");
        // macOS resolves /var into /private/var, so compare canonicalized.
        let want = std::fs::canonicalize(dir.path()).unwrap();
        let got = std::fs::canonicalize(&toplevel).unwrap();
        assert_eq!(got, want);
    }

    #[test]
    fn validate_repository_rejects_non_repo() {
        let dir = tempfile::tempdir().unwrap();
        let result = validate_repository(dir.path().to_str().unwrap());
        assert!(result.is_err(), "expected not-a-repo error");
    }

    #[test]
    fn quick_status_reports_clean_fresh_repo() {
        let dir = init_repo();
        let path = dir.path().to_str().unwrap();
        let status = quick_status(path).expect("quick_status");
        assert_eq!(status.changes, 0);
        assert_eq!(status.ahead, 0);
        assert_eq!(status.behind, 0);
    }

    #[test]
    fn quick_status_counts_untracked() {
        let dir = init_repo();
        std::fs::write(dir.path().join("new.txt"), b"hello").unwrap();
        let status = quick_status(dir.path().to_str().unwrap()).expect("quick_status");
        assert_eq!(status.changes, 1);
    }
}

pub fn get_last_commit(path: &str) -> GitResult<LastCommit> {
    let root = resolve_repo_root(path)?;
    let res = run_git(&root, &["log", "--oneline", "-n", "1"])?;
    let line = res.stdout.lines().next().unwrap_or("").to_string();
    let mut parts = line.splitn(2, ' ');
    let hash = parts.next().unwrap_or("").to_string();
    let message = parts.next().unwrap_or("").to_string();
    Ok(LastCommit {
        hash,
        message,
        result: res,
    })
}

/// Read the last `limit` commits on the current branch. Uses a custom
/// `--pretty=format` with `\x1f` (unit separator) between fields and `\x1e`
/// (record separator) between commits so subjects with tabs/spaces survive.
pub fn get_commit_history(path: &str, limit: u32) -> GitResult<Vec<CommitInfo>> {
    let root = resolve_repo_root(path)?;
    let limit = limit.clamp(1, 500);
    let limit_str = limit.to_string();
    // %H = full hash, %h = short, %an = author name, %ae = email,
    // %at = author timestamp (epoch), %s = subject.
    let format = "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%s%x1e";
    let res = run_git(&root, &["log", format, "-n", &limit_str])?;
    if !res.success {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for record in res.stdout.split('\x1e') {
        let record = record.trim_start_matches('\n');
        if record.is_empty() {
            continue;
        }
        let mut parts = record.splitn(6, '\x1f');
        let hash = parts.next().unwrap_or("").to_string();
        let short = parts.next().unwrap_or("").to_string();
        let author = parts.next().unwrap_or("").to_string();
        let email = parts.next().unwrap_or("").to_string();
        let timestamp = parts
            .next()
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0);
        let subject = parts.next().unwrap_or("").to_string();
        if hash.is_empty() {
            continue;
        }
        out.push(CommitInfo {
            hash,
            short,
            author,
            email,
            timestamp,
            subject,
        });
    }
    Ok(out)
}

/// Unified diff for a single file. When `staged` is true, diffs the index
/// against HEAD (i.e. what's about to be committed); otherwise diffs the
/// working tree against the index (i.e. what's unstaged). Untracked files
/// have no diff base, so we synthesize a diff against `/dev/null`.
pub fn get_file_diff(path: &str, file: &str, staged: bool) -> GitResult<String> {
    let trimmed = file.trim();
    if trimmed.is_empty() {
        return Err(GitError::InvalidInput("File path is required".into()));
    }
    let root = resolve_repo_root(path)?;
    let args: Vec<&str> = if staged {
        vec!["diff", "--cached", "--no-color", "--", trimmed]
    } else {
        vec!["diff", "--no-color", "--", trimmed]
    };
    let res = run_git(&root, &args)?;
    if res.success && !res.stdout.is_empty() {
        return Ok(res.stdout);
    }
    // Empty diff usually means: untracked file. Fall back to comparing the
    // whole file content against /dev/null so the user still sees something.
    if !staged {
        let untracked =
            run_git(&root, &["diff", "--no-color", "--no-index", "--", "/dev/null", trimmed]);
        if let Ok(r) = untracked {
            if !r.stdout.is_empty() {
                return Ok(r.stdout);
            }
        }
    }
    Ok(res.stdout)
}
