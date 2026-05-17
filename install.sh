#!/usr/bin/env bash
#
# Git Switch installer for macOS and Linux.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Avijit07x/git-switch/main/install.sh | bash
#
# Re-running this script installs the newest published release, so it
# works as both an installer and an updater.

set -euo pipefail

# ───────────────────────────────────────────────────────────────────────
# Configuration
# ───────────────────────────────────────────────────────────────────────

REPO="Avijit07x/git-switch"
APP_NAME="Git Switch"

# macOS
MAC_APP_BUNDLE="${APP_NAME}.app"
MAC_DEST_DIR="/Applications"

# Linux
LINUX_BIN_NAME="git-switch"
LINUX_DEST_DIR="${HOME}/.local/bin"
LINUX_ICON_DIR="${HOME}/.local/share/icons/hicolor/512x512/apps"
LINUX_DESKTOP_DIR="${HOME}/.local/share/applications"

# ───────────────────────────────────────────────────────────────────────
# Output helpers
# ───────────────────────────────────────────────────────────────────────

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'
  C_DIM=$'\033[2m'
  C_BOLD=$'\033[1m'
  C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'
  C_CYAN=$'\033[36m'
else
  C_RESET="" C_DIM="" C_BOLD="" C_RED="" C_GREEN="" C_YELLOW="" C_BLUE="" C_CYAN=""
fi

step()    { printf "  %s%s%s %s\n" "$C_CYAN" "›" "$C_RESET" "$*"; }
ok()      { printf "  %s%s%s %s\n" "$C_GREEN" "✓" "$C_RESET" "$*"; }
warn()    { printf "  %s%s%s %s\n" "$C_YELLOW" "!" "$C_RESET" "$*"; }
err()     { printf "  %s%s%s %s\n" "$C_RED"   "✗" "$C_RESET" "$*" >&2; }
abort()   { err "$*"; exit 1; }
banner() {
  printf "\n"
  printf "  %s%s${APP_NAME}%s  %s%s%s\n" "$C_BOLD" "$C_BLUE" "$C_RESET" "$C_DIM" "installer" "$C_RESET"
  printf "  %sa native Git client that runs your dev servers%s\n" "$C_DIM" "$C_RESET"
  printf "\n"
}

# ───────────────────────────────────────────────────────────────────────
# OS detection
# ───────────────────────────────────────────────────────────────────────

detect_os() {
  case "$(uname -s)" in
    Darwin) OS="macos" ;;
    Linux)  OS="linux" ;;
    *)      abort "Unsupported OS: $(uname -s). Supported: macOS, Linux." ;;
  esac
}

# ───────────────────────────────────────────────────────────────────────
# Resolve the latest release
# ───────────────────────────────────────────────────────────────────────

resolve_release() {
  step "Resolving latest release"
  local json
  json=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest") \
    || abort "Couldn't reach GitHub. Check your network."

  RELEASE_VERSION=$(printf "%s" "$json" \
    | grep -m1 '"tag_name"' \
    | sed -E 's/.*"tag_name":[[:space:]]*"([^"]+)".*/\1/')

  [[ -n "$RELEASE_VERSION" ]] || abort "Couldn't parse the release tag."

  # Pick the asset matching the current OS.
  local pattern
  if [[ "$OS" == "macos" ]]; then
    pattern='\.dmg"'
  else
    pattern='\.AppImage"'
  fi

  RELEASE_ASSET_URL=$(printf "%s" "$json" \
    | grep -oE "\"browser_download_url\":[[:space:]]*\"[^\"]+${pattern}" \
    | head -n1 \
    | sed -E 's/.*"browser_download_url":[[:space:]]*"([^"]+)".*/\1/')

  [[ -n "$RELEASE_ASSET_URL" ]] \
    || abort "Release ${RELEASE_VERSION} has no ${OS} asset attached."

  ok "Found ${C_BOLD}${RELEASE_VERSION}${C_RESET}"
}

# ───────────────────────────────────────────────────────────────────────
# macOS install path
# ───────────────────────────────────────────────────────────────────────

mac_skip_if_up_to_date() {
  if [[ ! -d "${MAC_DEST_DIR}/${MAC_APP_BUNDLE}" ]]; then
    return 0
  fi
  local installed
  installed=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" \
    "${MAC_DEST_DIR}/${MAC_APP_BUNDLE}/Contents/Info.plist" 2>/dev/null || true)
  if [[ -z "$installed" ]]; then
    return 0
  fi
  local clean_tag="${RELEASE_VERSION#v}"
  if [[ "$installed" == "$clean_tag" ]]; then
    ok "Already on ${C_BOLD}v${installed}${C_RESET}. Nothing to do."
    printf "\n  %sLaunch:%s open '%s/%s'\n\n" "$C_DIM" "$C_RESET" "$MAC_DEST_DIR" "$MAC_APP_BUNDLE"
    exit 0
  fi
  step "Upgrading from ${C_DIM}v${installed}${C_RESET} to ${C_BOLD}${RELEASE_VERSION}${C_RESET}"
}

mac_install() {
  for bin in curl hdiutil xattr; do
    command -v "$bin" >/dev/null 2>&1 \
      || abort "Required tool '$bin' not found."
  done

  if pgrep -x "git-switch" >/dev/null 2>&1; then
    abort "${APP_NAME} is currently running. Quit it first, then re-run."
  fi

  mac_skip_if_up_to_date

  TMP_DIR=$(mktemp -d -t git-switch-install)
  trap 'rm -rf "$TMP_DIR" 2>/dev/null || true; [[ -n "${MOUNT_POINT:-}" ]] && hdiutil detach -quiet "$MOUNT_POINT" 2>/dev/null || true' EXIT
  local dmg_path="${TMP_DIR}/${APP_NAME// /-}.dmg"

  step "Downloading ${C_DIM}${RELEASE_ASSET_URL##*/}${C_RESET}"
  curl -fL --progress-bar -o "$dmg_path" "$RELEASE_ASSET_URL" \
    || abort "Download failed."

  step "Mounting disk image"
  local plist
  plist=$(hdiutil attach -nobrowse -readonly -noverify -plist "$dmg_path") \
    || abort "Couldn't mount the disk image."

  MOUNT_POINT=$(printf "%s" "$plist" \
    | grep -A1 "<key>mount-point</key>" \
    | grep "<string>" \
    | head -n1 \
    | sed -E 's@.*<string>([^<]+)</string>.*@\1@')

  [[ -d "$MOUNT_POINT" ]] || abort "Mounted volume not found."

  local src="${MOUNT_POINT}/${MAC_APP_BUNDLE}"
  local dst="${MAC_DEST_DIR}/${MAC_APP_BUNDLE}"
  [[ -d "$src" ]] || abort "'${MAC_APP_BUNDLE}' not found in the DMG."

  if [[ -d "$dst" ]]; then
    step "Replacing existing ${MAC_APP_BUNDLE}"
    rm -rf "$dst" 2>/dev/null || sudo rm -rf "$dst"
  fi

  step "Copying to ${MAC_DEST_DIR}"
  cp -R "$src" "$dst" 2>/dev/null || sudo cp -R "$src" "$dst"

  step "Clearing Gatekeeper quarantine"
  xattr -dr com.apple.quarantine "$dst" 2>/dev/null || true

  hdiutil detach -quiet "$MOUNT_POINT" || true

  printf "\n"
  ok "Installed ${C_BOLD}${APP_NAME} ${RELEASE_VERSION}${C_RESET} to ${MAC_DEST_DIR}"
  printf "\n"
  printf "  %sLaunch:%s   open '%s/%s'\n" "$C_DIM" "$C_RESET" "$MAC_DEST_DIR" "$MAC_APP_BUNDLE"
  printf "  %sUpdate:%s   re-run this same command\n" "$C_DIM" "$C_RESET"
  printf "  %sIssues:%s   https://github.com/%s/issues\n" "$C_DIM" "$C_RESET" "$REPO"
  printf "\n"
}

# ───────────────────────────────────────────────────────────────────────
# Linux install path (AppImage based, no root required)
# ───────────────────────────────────────────────────────────────────────

linux_install() {
  for bin in curl install; do
    command -v "$bin" >/dev/null 2>&1 \
      || abort "Required tool '$bin' not found."
  done

  mkdir -p "$LINUX_DEST_DIR" "$LINUX_ICON_DIR" "$LINUX_DESKTOP_DIR"

  TMP_DIR=$(mktemp -d -t git-switch-install-XXXXXX)
  trap 'rm -rf "$TMP_DIR" 2>/dev/null || true' EXIT
  local appimage_path="${TMP_DIR}/${RELEASE_ASSET_URL##*/}"

  step "Downloading ${C_DIM}${RELEASE_ASSET_URL##*/}${C_RESET}"
  curl -fL --progress-bar -o "$appimage_path" "$RELEASE_ASSET_URL" \
    || abort "Download failed."

  step "Installing AppImage to ${LINUX_DEST_DIR}"
  install -m 0755 "$appimage_path" "${LINUX_DEST_DIR}/${LINUX_BIN_NAME}.AppImage"

  # Optional: write a .desktop entry so it appears in the application menu.
  step "Writing desktop entry"
  cat > "${LINUX_DESKTOP_DIR}/${LINUX_BIN_NAME}.desktop" <<EOF
[Desktop Entry]
Name=${APP_NAME}
Comment=Native Git client that runs your dev servers too
Exec=${LINUX_DEST_DIR}/${LINUX_BIN_NAME}.AppImage
Terminal=false
Type=Application
Categories=Development;
StartupNotify=true
EOF

  # Refresh the desktop database if the helper is available (Ubuntu, Fedora,
  # Arch all have it; on minimal distros it just no-ops).
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "${LINUX_DESKTOP_DIR}" 2>/dev/null || true
  fi

  # Verify the install dir is on PATH; warn if not.
  case ":$PATH:" in
    *":${LINUX_DEST_DIR}:"*) : ;;
    *) warn "${LINUX_DEST_DIR} is not on your PATH. Add it to ~/.bashrc or ~/.zshrc:"
       printf "      %sexport PATH=\"%s:\$PATH\"%s\n" "$C_DIM" "$LINUX_DEST_DIR" "$C_RESET" ;;
  esac

  printf "\n"
  ok "Installed ${C_BOLD}${APP_NAME} ${RELEASE_VERSION}${C_RESET} to ${LINUX_DEST_DIR}"
  printf "\n"
  printf "  %sLaunch:%s   %s/%s.AppImage\n" "$C_DIM" "$C_RESET" "$LINUX_DEST_DIR" "$LINUX_BIN_NAME"
  printf "  %sUpdate:%s   re-run this same command\n" "$C_DIM" "$C_RESET"
  printf "  %sIssues:%s   https://github.com/%s/issues\n" "$C_DIM" "$C_RESET" "$REPO"
  printf "\n"
}

# ───────────────────────────────────────────────────────────────────────
# Entry point
# ───────────────────────────────────────────────────────────────────────

main() {
  banner
  detect_os
  resolve_release
  if [[ "$OS" == "macos" ]]; then
    mac_install
  else
    linux_install
  fi
}

main "$@"
