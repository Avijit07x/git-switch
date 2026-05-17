// Single-responsibility: spawn child processes without flashing a console
// window on Windows. Every `std::process::Command::new(...)` for git, lsof,
// and any other CLI tool we invoke needs the `CREATE_NO_WINDOW` flag on
// Windows or the user sees a cmd.exe window pop up for each one. macOS and
// Linux ignore the flag.

use std::process::Command;

/// Construct a `Command` that won't open a console window on Windows.
/// Returns an `std::process::Command` ready to have args/cwd/etc. set.
pub fn command<S: AsRef<std::ffi::OsStr>>(program: S) -> Command {
    let mut cmd = Command::new(program);
    apply_no_window(&mut cmd);
    cmd
}

#[cfg(target_os = "windows")]
fn apply_no_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    // CREATE_NO_WINDOW = 0x08000000. Prevents Windows from allocating a
    // console for the child process, which is what causes the brief
    // black cmd.exe flash for every git / lsof call.
    cmd.creation_flags(0x08000000);
}

#[cfg(not(target_os = "windows"))]
fn apply_no_window(_cmd: &mut Command) {}
