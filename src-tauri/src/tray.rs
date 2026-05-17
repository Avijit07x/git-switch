// Single-responsibility: menu-bar status indicator. Shows a tray icon with a
// dropdown menu that exposes (a) the active repo's branch + ahead/behind
// status, (b) Show / Hide window, and (c) Quit. The status line is updated
// from the frontend via the `update_tray_status` Tauri command, called from
// the dashboard whenever the active repo or its quick-status changes.

use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

/// Holds the always-disabled menu item we mutate when the frontend pushes a
/// new status line. Stored in Tauri state so the command can reach it.
pub struct TrayStatus {
    pub item: Mutex<Option<MenuItem<tauri::Wry>>>,
}

impl Default for TrayStatus {
    fn default() -> Self {
        Self {
            item: Mutex::new(None),
        }
    }
}

/// Build the tray icon, menu, and click handlers. Called from `lib.rs`
/// during app setup.
pub fn init(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // ── Menu items ────────────────────────────────────────────────────
    let status = MenuItem::with_id(
        app,
        "status",
        "Git Switch · No repo selected",
        false, // disabled — informational only
        None::<&str>,
    )?;

    let show = MenuItem::with_id(app, "show", "Show window", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide window", true, None::<&str>)?;
    let separator_a = PredefinedMenuItem::separator(app)?;
    let separator_b = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Git Switch", true, Some("CmdOrCtrl+Q"))?;

    let menu = Menu::with_items(
        app,
        &[
            &status,
            &separator_a,
            &show,
            &hide,
            &separator_b,
            &quit,
        ],
    )?;

    if let Some(state) = app.try_state::<TrayStatus>() {
        if let Ok(mut slot) = state.item.lock() {
            *slot = Some(status);
        }
    }

    // ── Tray icon + behaviors ─────────────────────────────────────────
    let icon = build_tray_glyph();

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        // Monochrome glyph on transparent: macOS treats it as a template
        // image and auto-tints to the menu bar's foreground color.
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "hide" => hide_app(app),
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    // App-level hide/show goes through NSApp on macOS, which
                    // avoids the WebView blackout you can get from
                    // window.hide() + window.show().
                    match win.is_visible() {
                        Ok(true) => hide_app(app),
                        _ => show_main_window(app),
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn show_main_window(app: &AppHandle) {
    // macOS: NSApp-level show brings everything back at once and avoids
    // the WebView blackout that window.hide()+show() can cause.
    // Linux: AppHandle has no show(), so fall back to window-level show.
    #[cfg(target_os = "macos")]
    {
        let _ = app.show();
    }
    if let Some(win) = app.get_webview_window("main") {
        #[cfg(not(target_os = "macos"))]
        {
            let _ = win.show();
        }
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn hide_app(app: &AppHandle) {
    // macOS: NSApp's `hide:` preserves WebView state so it repaints
    // correctly. Linux falls back to window-level hide.
    #[cfg(target_os = "macos")]
    {
        let _ = app.hide();
    }
    #[cfg(not(target_os = "macos"))]
    {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.hide();
        }
    }
}

#[tauri::command]
pub fn update_tray_status(
    state: tauri::State<'_, TrayStatus>,
    label: String,
) -> Result<(), String> {
    let trimmed = label.trim();
    let value = if trimmed.is_empty() {
        "Git Switch · No repo selected".to_string()
    } else {
        format!("Git Switch · {trimmed}")
    };
    if let Ok(slot) = state.item.lock() {
        if let Some(item) = slot.as_ref() {
            item.set_text(&value).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// ─── Tray glyph rasterizer ────────────────────────────────────────────
// Procedural version of the app logo, drawn into a 44x44 RGBA buffer
// (sized for retina menu bars: 22pt × @2x). Faithful to assets/logo.svg:
// two donut-style dots connected by an S-shaped cubic-bezier curve. Black
// on transparent so macOS treats it as a template image and tints it to
// the menu-bar foreground color. No file asset needed.

const TRAY_SIZE: u32 = 44;

fn build_tray_glyph() -> Image<'static> {
    let size = TRAY_SIZE as i32;
    let mut mask = vec![false; (size * size) as usize];

    // Geometry — scaled from the 1024x1024 logo:
    //   top dot   (320, 200) → (14, 9)
    //   bottom    (704, 824) → (30, 35)
    //   stroke    52         → ~2.3 (use 3 for clarity at this scale)
    //
    // Donut outer/inner radii so the dots read as rings, matching the
    // hollow circles in the logo.
    let top = (14.0_f32, 9.0_f32);
    let bot = (30.0_f32, 35.0_f32);
    let dot_outer = 5.0_f32;
    let dot_inner = 2.4_f32;
    let stroke_half: i32 = 1; // 3px stroke

    // Donut dots.
    let r_out_sq = dot_outer * dot_outer;
    let r_in_sq = dot_inner * dot_inner;
    for y in 0..size {
        for x in 0..size {
            let fx = x as f32 + 0.5;
            let fy = y as f32 + 0.5;
            let d_top = dist_sq(fx, fy, top.0, top.1);
            let d_bot = dist_sq(fx, fy, bot.0, bot.1);
            let in_top_ring = d_top <= r_out_sq && d_top >= r_in_sq;
            let in_bot_ring = d_bot <= r_out_sq && d_bot >= r_in_sq;
            if in_top_ring || in_bot_ring {
                mask[(y * size + x) as usize] = true;
            }
        }
    }

    // Vertical top line: from outer edge of top dot down to the start of
    // the S-curve. Same x as the top dot.
    let top_line_start_y = top.1 + dot_outer - 0.5;
    let curve_start = (top.0, 21.0_f32);
    let curve_end = (bot.0, 23.0_f32);
    let bot_line_end_y = bot.1 - dot_outer + 0.5;

    stamp_v_line(&mut mask, size, top.0, top_line_start_y, curve_start.1, stroke_half);
    stamp_v_line(&mut mask, size, bot.0, curve_end.1, bot_line_end_y, stroke_half);

    // S-curve: scaled-down version of the logo's two cubic-bezier path.
    //   M (14, 21) C (14, 26) (17, 27) (22, 27) C (26, 27) (30, 26) (30, 23)
    let p0 = curve_start;
    let p1 = (14.0, 26.0);
    let p2 = (17.0, 27.0);
    let p3 = (22.0, 27.0);
    let p4 = (26.0, 27.0);
    let p5 = (30.0, 26.0);
    let p6 = curve_end;

    sample_cubic(&mut mask, size, p0, p1, p2, p3, stroke_half);
    sample_cubic(&mut mask, size, p3, p4, p5, p6, stroke_half);

    // Materialize mask → RGBA. Black foreground, alpha drives visibility.
    let mut buf = vec![0u8; (TRAY_SIZE * TRAY_SIZE * 4) as usize];
    for y in 0..size {
        for x in 0..size {
            if mask[(y * size + x) as usize] {
                let idx = ((y * size + x) * 4) as usize;
                buf[idx + 3] = 255;
            }
        }
    }

    Image::new_owned(buf, TRAY_SIZE, TRAY_SIZE)
}

fn dist_sq(x: f32, y: f32, cx: f32, cy: f32) -> f32 {
    let dx = x - cx;
    let dy = y - cy;
    dx * dx + dy * dy
}

fn stamp_disk(mask: &mut [bool], size: i32, cx: f32, cy: f32, radius: i32) {
    let r2 = (radius * radius) as f32;
    let cxi = cx.round() as i32;
    let cyi = cy.round() as i32;
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            let px = cxi + dx;
            let py = cyi + dy;
            if px < 0 || py < 0 || px >= size || py >= size {
                continue;
            }
            if (dx * dx + dy * dy) as f32 <= r2 {
                mask[(py * size + px) as usize] = true;
            }
        }
    }
}

fn stamp_v_line(
    mask: &mut [bool],
    size: i32,
    cx: f32,
    y1: f32,
    y2: f32,
    half: i32,
) {
    let lo = y1.min(y2);
    let hi = y1.max(y2);
    let steps = ((hi - lo) * 4.0).ceil() as i32;
    for i in 0..=steps {
        let t = i as f32 / steps as f32;
        let y = lo + (hi - lo) * t;
        stamp_disk(mask, size, cx, y, half);
    }
}

fn sample_cubic(
    mask: &mut [bool],
    size: i32,
    p0: (f32, f32),
    p1: (f32, f32),
    p2: (f32, f32),
    p3: (f32, f32),
    radius: i32,
) {
    // Dense enough sampling that adjacent disks always overlap at this
    // resolution. 120 steps for a short curve segment is overkill but cheap.
    for i in 0..=120 {
        let t = i as f32 / 120.0;
        let one_t = 1.0 - t;
        let b0 = one_t * one_t * one_t;
        let b1 = 3.0 * one_t * one_t * t;
        let b2 = 3.0 * one_t * t * t;
        let b3 = t * t * t;
        let x = b0 * p0.0 + b1 * p1.0 + b2 * p2.0 + b3 * p3.0;
        let y = b0 * p0.1 + b1 * p1.1 + b2 * p2.1 + b3 * p3.1;
        stamp_disk(mask, size, x, y, radius);
    }
}
