# Git Switch — backlog

Future improvements grouped by tier. The README's "Roadmap" section is the
high-level marketing version; this file is the granular working backlog.

Items are checked when shipped. Reorder freely.

---

## Distribution maturity

These unblock real-world distribution. Do them before sharing the app.

- [ ] **Tauri auto-updater** — generate a signing keypair, wire
      `tauri-plugin-updater`, point at GitHub Releases. Users get a
      non-intrusive "update available" prompt on launch.
- [ ] **Apple Developer signing + notarization** — set repo secrets
      (`APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_PASSWORD`, `APPLE_CERTIFICATE`,
      `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`) and the
      existing `release.yml` picks them up. Drops the right-click-Open
      Gatekeeper dance for end users.
- [ ] **Crash reporter** — `sentry-tauri` or similar lightweight option so
      Rust panics surface upstream instead of dying silently on the user.

## Power-user git features

Closing the gap with full-featured git clients.

- [ ] **Click a commit in History → view its diff.** Add a Rust command
      `get_commit_diff(hash)` and open the existing `DiffDialog` with it.
      Tiny lift, big payoff — turns the history popup into an archaeology
      tool, not just a list.
- [ ] **Hunk-level staging** (`git add -p` UI). New Rust command returns
      hunks per file; a hunk-selector lives inside `DiffDialog`.
- [ ] **`git revert` button** — the safe counterpart to Undo for
      already-pushed commits. Inverse visibility: shows when
      `ahead === 0 && hasUpstream`. Creates a new commit instead of
      rewriting history.
- [ ] **Compare branches** — pick two branches, see the combined diff via
      `git diff branchA...branchB`. Reuses `DiffDialog`.
- [ ] **Search the history popup** — client-side filter by author, subject,
      or short hash over the already-fetched 50 commits.

## UX polish ("feels premium")

- [ ] **⌘K command palette** — `cmdk` is already in deps. Global overlay
      to jump to any repo, any branch in any repo, run any git action,
      open settings. Biggest productivity win still on the table.
- [ ] **Drag-to-reorder repos** in the sidebar via `@dnd-kit/sortable`.
      Users expect this from any list-of-things app.
- [ ] **Recent branches** at the top of the branch picker — persist last 5
      per repo in zustand.
- [ ] **Side-by-side diff toggle** in `DiffDialog` — same parser, render
      two columns instead of one. CSS-only change.
- [ ] **Resizable panels** between sidebar / dashboard / run panel —
      `react-resizable-panels` (~5KB).
- [ ] **Full-surface macOS vibrancy** — currently the body is opaque so
      vibrancy only shows in the title bar. Decide on per-surface opacity
      and reintroduce it carefully.
- [ ] **Background activity indicator** — spinner in the dashboard header
      when fetch/pull is in flight. Today these are silent and users
      sometimes click Pull while one's already running.
- [ ] **Repo pinning / favorites** — star a repo to keep it at the top of
      the sidebar.
- [ ] **Keyboard shortcut sheet** — `?` opens an overlay listing every
      shortcut. Discoverability.

## Quality / maintenance

- [x] **Unit + smoke tests for parsers** (`parseStatusBranchLine`,
      `parse_ahead_behind`, `is_plausible_git_url`) + a live `validate` /
      `quick_status` smoke test against a tempdir-init'd repo. Already in
      `src-tauri/src/git/service.rs` under `#[cfg(test)]`.
- [x] **CHANGELOG.md auto-generated from conventional-commits** via
      `git-cliff` + the release workflow.
- [ ] **Smoke test in CI that boots the app headless.** Spawn the Tauri
      binary with `--headless` (or a test-only flag) and assert it exits
      cleanly. Catches "doesn't even start" regressions beyond the
      service-level tests we already have.
- [ ] **TypeScript unit tests** for `pickPrimary`, `parseUnifiedDiff`, and
      `summarize` (in `RepositoryPicker`). Vitest, pure-function coverage.

## Cross-platform

- [ ] **Linux build** — gate `notify` features per-platform in
      `Cargo.toml` (the current `macos_fsevent`-only config won't compile
      on Linux). Add `ubuntu-22.04` to the release workflow matrix; need
      `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libappindicator3-dev`,
      `librsvg2-dev`, `patchelf`.
- [ ] **Windows build** — gate `notify` features. Add `windows-2022` to
      the release matrix. WebView2 ships on Windows 10/11 so no extra
      runtime install needed.

## Future / nice-to-haves

- [ ] **Submodules support** — list status, init, update.
- [ ] **Tags** — list, create, push.
- [ ] **Commit message templates** — saved presets (`chore: bump`,
      `fix: …`) accessible from CommitPanel.
- [ ] **GitHub PR via `gh` CLI** — after a successful publish, expose
      "Create PR" that shells out to `gh pr create --fill`. Zero auth
      surface since `gh` handles everything.
- [ ] **Branch "stale" detector** — flag branches untouched for N months.
- [ ] **`gitignore` generator** — scaffold from a template (node, rust, etc.).
- [ ] **Activity timeline** — small weekly heatmap of commits per repo.
- [ ] **Per-repo SSH key override** — currently global via profile.
