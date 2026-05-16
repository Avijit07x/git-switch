<div align="center">

<img src="assets/logo.svg" alt="Git Switch" width="128" height="128" />

# Git Switch

**A fast, native macOS Git client that runs your dev servers, too.**

[![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Rust](https://img.shields.io/badge/Rust-DEA584?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![macOS](https://img.shields.io/badge/macOS-Apple_Silicon_%2B_Intel-000000?logo=apple&logoColor=white)](#install)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## Features

**Git**
- Multi-repo sidebar — folder picker (multi-select) or drag-and-drop, persists across launches
- Per-repo status tints in the sidebar — behind = rose · uncommitted = amber · ahead = emerald
- Searchable branch picker · create branch from scratch (`git switch -c`) or check out remote as local
- Dirty-tree guard before switching, with confirmation dialog
- Adaptive primary action button — switches between **Pull / Push / Publish / Fetch** based on ahead / behind / upstream state
- `⋯` overflow menu consolidates every git action: refresh, fetch, pull, push, create branch, publish branch, show history
- Publish branch with one click (`git push -u origin <branch>`) when upstream is missing
- Stage / unstage selected · stage all · commit · optimistic UI (file list flips instantly)
- **Undo last commit** — safe `git reset --soft HEAD~1`, only shown when the commit hasn't been pushed
- **Inline diff viewer** for any changed file (eye icon on the row) — syntax-light unified diff with sticky line-number gutter
- **Commit history popup** — last 50 commits with author, short hash, relative time
- Sensitive files (`.env`, `*.pem`, SSH keys, …) surface at the top of the changes list in red — one click adds them to `.gitignore` and untracks
- Ahead / behind indicators in the dashboard header
- Native FS watcher (`notify` / FSEvents) auto-refreshes the GUI when the terminal touches the repo
- Shift-click range select · `⌘↵` commit · `⌘R` refresh · `⌘P` pull · `⌘⇧P` push

**AI commits**
- ✨ Generate Conventional-Commits messages from the staged diff via Gemini
- Live model picker — only shows models your API key can actually invoke, auto-falls back when quota's hit

**Run / dev environments**
- Multiple run targets per repo — `yarn dev`, `yarn dev:worker`, `cargo run`, each with its own terminal tab, port, and restart command
- Real PTY (xterm.js + `portable-pty`) → ANSI colors, progress bars, `⌃C`, login-shell PATH all work
- Smart port management — read from `.env` or set per-target; conflicts prompt before killing the holder
- Process-group kills (`setsid` + `killpg`) — `nodemon` orphans and detached `node` children die with the parent, no zombie servers
- Branch-aware auto-restart — switch branch, every running target relaunches
- Sleep-safe; clean shutdown on app close

**Groups**
- Bundle multiple repos as a group, fire them all in parallel with one click
- Filterable picker with sticky select-all row (handy when you've added 20+ repos)
- Color-coded bulk actions (Run / Stop / Restart) react to live aggregate status
- Each member runs with **its own** saved config — the group is just a launcher

**UX & performance**
- Light + dark themes that propagate instantly across every panel (including xterm.js)
- macOS-style frosted-glass toasts (Sonner) with severity-encoded icons
- Tooltips on every icon and the adaptive sync button (shows the underlying git command)
- Rolling command-output log with per-row status
- Async backend — `git fetch` / `pull` / `push` never freeze the UI
- Batched sidebar refresh — one IPC fetches quick-status for every repo in parallel
- Lazy-loaded heavy panels (xterm.js, every dialog) — small initial JS payload

---

## Install

```bash
# Prerequisites (one-time)
xcode-select --install                                                       # git
brew install node                                                            # Node 20+
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh && source "$HOME/.cargo/env"
brew install librsvg                                                         # for icon generation

# Clone + run
git clone git@github.com:Avijit07x/git-switch.git
cd git-switch
yarn install
yarn tauri:dev
```

First launch compiles ~400 Rust crates — expect 2–5 min cold, seconds thereafter.

### Build a `.app` / `.dmg`

```bash
yarn tauri icon assets/logo.svg     # first time only
yarn tauri:build
```

Output: `src-tauri/target/release/bundle/macos/Git Switch.app` and the matching `.dmg`. For a Universal binary:

```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin
yarn tauri build --target universal-apple-darwin
```

### First launch on macOS

Git Switch ships with **ad-hoc signing** (free, no Apple Developer account). macOS Gatekeeper will warn you the very first time:

1. Right-click **Git Switch.app** in Finder → **Open**
2. Confirm in the dialog that appears
3. macOS remembers your choice — every launch after that is normal

If you'd rather skip the prompt entirely, you can strip the quarantine flag once:

```bash
xattr -dr com.apple.quarantine "/Applications/Git Switch.app"
```

---

## Safety

Out of scope by design: force push, rebase, hard reset, discard, stash, merge-conflict resolution, raw command input. The one carve-out is `git reset --soft HEAD~1` (the **Undo last commit** button), which never touches your working tree and only appears when the commit hasn't been pushed.

Auth relies on your existing Git setup (SSH keys, Keychain, `gh`, credential helper) — Git Switch stores nothing related to remotes.

The Gemini API key (if set) lives in `localStorage` and is only ever sent to `generativelanguage.googleapis.com` when you click ✨ Generate.


---

## License

MIT © Avijit Dey
