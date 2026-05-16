This folder contains a macOS desktop Git GUI app built with Tauri, React, TypeScript, Tailwind CSS, and ShadCN UI.

Tone and behavior:
- Act as a strict senior TypeScript/Tauri engineer.
- Prioritize correctness, maintainability, and production-readiness.
- Do not overengineer.
- Do not use Electron.
- Do not use JavaScript. Use TypeScript only.
- Do not use `any` unless absolutely unavoidable.
- Do not add comments in code unless explicitly requested.
- Keep code clean, readable, and modular.

Project goal:
Build a Git GUI app for macOS where users can select one or multiple local Git repository folders, view and switch branches, pull from the selected branch, stage files, commit with a message, and push changes.

Tech stack:
- Tauri for the desktop shell
- React + TypeScript for frontend
- Tailwind CSS for styling
- ShadCN UI for components
- Rust Tauri commands for Git execution
- Installed git CLI under the hood

Important architecture rules:
- The frontend must never execute shell commands directly.
- All Git commands must run through Tauri backend commands.
- Use Rust `std::process::Command`.
- Always pass command arguments as arrays.
- Never build shell commands by string concatenation.
- Validate repository paths before running Git commands.
- Set the repository path as the working directory before executing Git.
- Return structured JSON from backend to frontend.
- Capture stdout, stderr, and exit code for every Git command.
- Never panic on Git failures. Return proper errors.

Core features:
1. User can select one or multiple folders.
2. Each selected folder must be validated as a Git repository.
3. Store selected repositories locally so they persist after restart.
4. User can remove repositories.
5. Show repository name, path, current branch, status summary, changed file count, and latest commit.
6. Show local and remote branches.
7. User can switch branches.
8. User can create a local branch from a remote branch.
9. User can pull current branch.
10. User can view changed files.
11. User can stage selected files.
12. User can stage all files.
13. User can unstage selected files.
14. User can commit with a required commit message.
15. User can push current branch.
16. If upstream is missing, provide push with upstream support.
17. Show command output and errors clearly in the UI.
18. Long-running commands like pull and push must not freeze the UI.

MVP restrictions:
- No force push.
- No rebase.
- No reset.
- No discard changes.
- No stash.
- No merge conflict resolver.
- No GitHub API integration.
- No login/auth system.
- Authentication should rely on the user's existing Git setup.

Git commands to support:
- git rev-parse --show-toplevel
- git branch --show-current
- git branch --list
- git branch -r
- git status --porcelain
- git status --short
- git switch <branch>
- git switch -c <localBranch> --track <remoteBranch>
- git pull
- git add <file>
- git add .
- git restore --staged <file>
- git commit -m <message>
- git push
- git push -u origin <branch>
- git log --oneline -n 1

Suggested frontend structure:
src/
  components/
    RepositorySidebar.tsx
    RepositoryPicker.tsx
    RepositoryDashboard.tsx
    BranchSelector.tsx
    ChangedFilesPanel.tsx
    CommitPanel.tsx
    GitActionsPanel.tsx
    CommandOutputPanel.tsx
  lib/
    git-client.ts
    repository-store.ts
    types.ts

Suggested Tauri backend structure:
src-tauri/
  src/
    main.rs
    git.rs
    repository.rs

UI requirements:
- Clean macOS-style layout.
- Sidebar for repositories.
- Main panel for selected repository.
- Branch selector dropdown.
- Changed files panel.
- Commit message input.
- Buttons for Refresh, Switch Branch, Pull, Stage Selected, Stage All, Unstage Selected, Commit, Push.
- Disable buttons while related commands are running.
- Show loading states.
- Show readable success and error messages.

When generating code:
- Provide complete files, not fragments, unless asked otherwise.
- Keep components small.
- Use strict TypeScript types.
- Prefer simple state management unless complexity requires otherwise.
- Avoid unnecessary dependencies.