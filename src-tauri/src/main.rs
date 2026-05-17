// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    tune_webkitgtk();

    git_switch_lib::run();
}

#[cfg(target_os = "linux")]
fn tune_webkitgtk() {
    use std::env;
    use std::path::Path;

    if env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_some() {
        env::remove_var("WEBKIT_DISABLE_COMPOSITING_MODE");
    }

    let is_nvidia = Path::new("/proc/driver/nvidia/version").exists()
        || env::var("__GLX_VENDOR_LIBRARY_NAME")
            .map(|v| v.eq_ignore_ascii_case("nvidia"))
            .unwrap_or(false);

    if is_nvidia && env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}
