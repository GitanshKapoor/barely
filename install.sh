#!/usr/bin/env bash
# ==============================================================================
# Barely - Cross-Platform OS Installer Dispatcher
# Automatically detects OS and runs the corresponding installation script.
# ==============================================================================
set -euo pipefail

OS="$(uname -s)"

case "$OS" in
  Darwin*)
    echo "🍏 Detected macOS"
    bash scripts/install-mac.sh "$@"
    ;;
  Linux*)
    if [ -f /etc/os-release ]; then
      # shellcheck disable=SC1091
      . /etc/os-release
      case "$ID" in
        ubuntu|debian|pop|mint)
          echo "🐧 Detected Debian/Ubuntu ($ID)"
          bash scripts/install-ubuntu.sh "$@"
          ;;
        rhel|centos|fedora|rocky|almalinux|amzn)
          echo "🐧 Detected RHEL/Fedora/CentOS/Amazon Linux ($ID)"
          bash scripts/install-rhel.sh "$@"
          ;;
        *)
          # Fallback check for Debian-like or RedHat-like ID_LIKE
          if echo "${ID_LIKE:-}" | grep -q "debian"; then
            echo "🐧 Detected Debian-compatible system ($ID)"
            bash scripts/install-ubuntu.sh "$@"
          elif echo "${ID_LIKE:-}" | grep -q -E "rhel|fedora|centos"; then
            echo "🐧 Detected RHEL-compatible system ($ID)"
            bash scripts/install-rhel.sh "$@"
          else
            echo "⚠️  Unknown Linux distribution: $ID. Attempting Ubuntu/Debian installer..."
            bash scripts/install-ubuntu.sh "$@"
          fi
          ;;
      esac
    else
      echo "⚠️  Cannot detect Linux distribution. Defaulting to Ubuntu installer..."
      bash scripts/install-ubuntu.sh "$@"
    fi
    ;;
  MINGW*|MSYS*|CYGWIN*)
    echo "🪟 Detected Windows (Bash environment)"
    echo "👉 Please run the PowerShell script in Windows PowerShell:"
    echo "   powershell -ExecutionPolicy Bypass -File scripts\\install-windows.ps1"
    ;;
  *)
    echo "❌ Unsupported operating system: $OS"
    exit 1
    ;;
esac
