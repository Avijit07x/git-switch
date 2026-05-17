# Git Switch installer for Windows.
#
# Usage:
#   irm https://raw.githubusercontent.com/Avijit07x/git-switch/main/install.ps1 | iex
#
# Re-running this script installs the newest published release, so it
# works as both an installer and an updater.

$ErrorActionPreference = "Stop"

# ───────────────────────────────────────────────────────────────────────
# Configuration
# ───────────────────────────────────────────────────────────────────────

$Repo = "Avijit07x/git-switch"
$AppName = "Git Switch"

# ───────────────────────────────────────────────────────────────────────
# Output helpers
# ───────────────────────────────────────────────────────────────────────

function Write-Step($msg) { Write-Host "  > $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  + $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Stop-WithErr($msg) {
    Write-Host "  x $msg" -ForegroundColor Red
    exit 1
}

function Show-Banner {
    Write-Host ""
    Write-Host "  $AppName" -ForegroundColor Blue -NoNewline
    Write-Host "  Windows installer" -ForegroundColor DarkGray
    Write-Host "  a native Git client that runs your dev servers" -ForegroundColor DarkGray
    Write-Host ""
}

# ───────────────────────────────────────────────────────────────────────
# Pre-flight
# ───────────────────────────────────────────────────────────────────────

function Test-Windows {
    if (-not $IsWindows -and $PSVersionTable.Platform -ne $null -and $PSVersionTable.Platform -ne "Win32NT") {
        Stop-WithErr "$AppName Windows installer only runs on Windows."
    }
}

# ───────────────────────────────────────────────────────────────────────
# Resolve latest release
# ───────────────────────────────────────────────────────────────────────

function Resolve-Release {
    Write-Step "Resolving latest release"
    try {
        $script:Release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest" -UseBasicParsing
    } catch {
        Stop-WithErr "Couldn't reach GitHub. Check your network."
    }

    $script:Asset = $script:Release.assets | Where-Object { $_.name -like "*.msi" } | Select-Object -First 1
    if (-not $script:Asset) {
        Stop-WithErr "Release $($script:Release.tag_name) has no Windows .msi attached."
    }

    Write-Ok "Found $($script:Release.tag_name)"
}

# ───────────────────────────────────────────────────────────────────────
# Download + install
# ───────────────────────────────────────────────────────────────────────

function Install-Msi {
    $tempDir = Join-Path $env:TEMP "git-switch-install"
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path $tempDir | Out-Null
    $msiPath = Join-Path $tempDir $script:Asset.name

    Write-Step "Downloading $($script:Asset.name)"
    try {
        $ProgressPreference = "SilentlyContinue"
        Invoke-WebRequest -Uri $script:Asset.browser_download_url -OutFile $msiPath -UseBasicParsing
    } catch {
        Stop-WithErr "Download failed."
    } finally {
        $ProgressPreference = "Continue"
    }

    Write-Step "Running installer (may prompt for admin)"
    $proc = Start-Process msiexec.exe `
        -ArgumentList "/i", "`"$msiPath`"", "/qb", "/norestart" `
        -Wait `
        -PassThru
    if ($proc.ExitCode -ne 0) {
        Stop-WithErr "msiexec exited with code $($proc.ExitCode)."
    }

    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host ""
    Write-Ok "Installed $AppName $($script:Release.tag_name)"
    Write-Host ""
    Write-Host "  Launch:   Start menu > $AppName" -ForegroundColor DarkGray
    Write-Host "  Update:   re-run this same command" -ForegroundColor DarkGray
    Write-Host "  Issues:   https://github.com/$Repo/issues" -ForegroundColor DarkGray
    Write-Host ""
}

# ───────────────────────────────────────────────────────────────────────
# Run
# ───────────────────────────────────────────────────────────────────────

Show-Banner
Test-Windows
Resolve-Release
Install-Msi
