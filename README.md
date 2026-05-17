<div align="center">

<img src="assets/logo.svg" alt="Git Switch" width="96" height="96" />

# Git Switch

A fast, native Git client that runs your dev servers too.

[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-stable-DEA584?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![macOS](https://img.shields.io/badge/macOS-Apple_Silicon_%2B_Intel-000?logo=apple&logoColor=white)](#install)
[![Linux](https://img.shields.io/badge/Linux-x86__64-FCC624?logo=linux&logoColor=black)](#install)
[![Windows](https://img.shields.io/badge/Windows-x86__64-0078D6?logo=windows&logoColor=white)](#install)
[![MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## What it does

Multi-repo Git GUI with a built-in PTY-backed dev-server launcher. Switch
branches, commit, push, and start every project's dev server from one
window.

## Highlights

- **Multi-repo sidebar** with live status tints and an FS watcher.
- **Adaptive sync button** that switches between Pull / Push / Publish / Fetch based on branch state.
- **Inline diff viewer** and **commit history popup**.
- **Undo last commit** (safe `git reset --soft`, never on pushed history).
- **AI commit messages** via Gemini, with auto-fallback when a model is rate-limited.
- **Run targets** like `yarn dev`, `cargo run`, each with its own xterm tab and port management.
- **Groups** to bundle repos and run them in parallel.
- **Menu-bar tray** showing the active repo's branch and ahead/behind status.
- **Desktop notifications** when teammates push new commits to your branch.
- **Six accent themes** (Neutral, Orange, Blue, Green, Rose, Violet) plus light/dark mode.
- **Async backend**, so `git fetch` / `pull` / `push` never freeze the UI.

## Install

One command. Fetches the latest release for your OS and drops it in the
right place. Re-run to update.

**macOS / Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/Avijit07x/git-switch/main/install.sh | bash
```

**Windows** (PowerShell)

```powershell
irm https://raw.githubusercontent.com/Avijit07x/git-switch/main/install.ps1 | iex
```

### Build from source

```bash
git clone git@github.com:Avijit07x/git-switch.git
cd git-switch
yarn install
yarn tauri:dev
```

Prerequisites: Git, Node 20+, Rust stable. On Debian / Ubuntu also install
`libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf`.

First launch compiles roughly 400 Rust crates. Expect 2 to 5 minutes
cold, seconds thereafter.

### Build a release bundle

```bash
yarn tauri:build
```

Output lands in `src-tauri/target/release/bundle/`. The installer script
handles signing quirks automatically; if you're distributing a manual
build on macOS, strip the quarantine flag once:

```bash
xattr -dr com.apple.quarantine "/Applications/Git Switch.app"
```

## Safety

Out of scope: force push, rebase, hard reset, discard, stash, and
merge-conflict resolution. The one carve-out is `git reset --soft HEAD~1`
behind the **Undo** button, which only appears for local-only commits
that haven't been pushed.

Auth uses your existing Git setup (SSH keys, Keychain, `gh`, credential
helper). The Gemini API key, if set, lives in `localStorage` and is only
sent to `generativelanguage.googleapis.com` when you click ✨ Generate.

## License

MIT © Avijit Dey
