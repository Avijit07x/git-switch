// Single-responsibility: open a repository folder — optionally focusing one
// file inside it — in the user's code editor. Folders have no OS "default
// app", so this probes a list of popular editors and falls back to the
// system default handler when none is installed.

use std::path::Path;

use crate::platform;

#[cfg(target_os = "macos")]
pub fn open_project(root: &Path, file: Option<&Path>) -> Result<(), String> {
    const APPS: [&str; 5] = [
        "Visual Studio Code",
        "Cursor",
        "Windsurf",
        "Zed",
        "Sublime Text",
    ];
    for app in APPS {
        let installed = platform::command("open")
            .args(["-Ra", app])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !installed {
            continue;
        }
        let mut cmd = platform::command("open");
        cmd.args(["-a", app]).arg(root);
        if let Some(f) = file {
            cmd.arg(f);
        }
        return cmd
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open {app}: {e}"));
    }
    fallback(root, file)
}

#[cfg(not(target_os = "macos"))]
pub fn open_project(root: &Path, file: Option<&Path>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    const CLIS: [&str; 5] = ["code.cmd", "cursor.cmd", "windsurf.cmd", "zed.exe", "subl.exe"];
    #[cfg(not(target_os = "windows"))]
    const CLIS: [&str; 5] = ["code", "cursor", "windsurf", "zed", "subl"];

    for cli in CLIS {
        let mut cmd = platform::command(cli);
        cmd.arg(root);
        if let Some(f) = file {
            cmd.arg(f);
        }
        if cmd.spawn().is_ok() {
            return Ok(());
        }
    }
    fallback(root, file)
}

/// No known editor found: open the file with its default app (still an
/// editor for most source files), or the folder in the file manager.
fn fallback(root: &Path, file: Option<&Path>) -> Result<(), String> {
    platform::open_with_default(file.unwrap_or(root))
}
