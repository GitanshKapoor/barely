#!/usr/bin/env bash
# ==============================================================================
# Barely - Automated Setup Script for RHEL, Fedora, CentOS & Amazon Linux
# ==============================================================================
set -euo pipefail

echo ""
echo "🚀 Barely Autonomous QA - RHEL / Fedora / Amazon Linux Setup"
echo "============================================================"

# 1. Detect root or sudo privileges
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "❌ Error: This script requires root or sudo privileges to install system packages."
    exit 1
  fi
fi

# Detect package manager (dnf or yum)
PKG_MGR="dnf"
if ! command -v dnf >/dev/null 2>&1; then
  PKG_MGR="yum"
fi

# 2. Install essential system packages
echo "📦 [1/6] Installing system packages via $PKG_MGR..."
$SUDO $PKG_MGR install -y python3 python3-pip git curl

# 3. Create Python virtual environment
echo "🐍 [2/6] Configuring Python virtual environment (.venv)..."
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

# 4. Install Barely in editable mode
echo "⚙️  [3/6] Installing Barely Core, CLI, and Plugins..."
pip install --upgrade pip -qq
pip install -e packages/core -e packages/cli -e plugins/reporter-pdf -qq

# 5. Install Playwright Chromium with Linux system libraries
echo "🌐 [4/6] Installing Chromium browser and system dependencies..."
$SUDO .venv/bin/python3 -m playwright install --with-deps chromium

# 6. Initialize .env file if not present
echo "🔐 [5/6] Checking environment secrets..."
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "    Created .env from .env.example"
fi

# 7. Run self-diagnostics
echo "🩺 [6/6] Running Barely Doctor..."
.venv/bin/barely doctor || true

echo "============================================================"
echo "🎉 Barely setup completed successfully!"
echo ""
echo "To begin testing:"
echo "  1. Activate the environment:  source .venv/bin/activate"
echo "  2. Configure your API key:    nano .env"
echo "  3. Run a test goal:           barely run --headless .barely/goals/example.md"
echo ""
