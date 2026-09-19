#!/usr/bin/env bash
# ==============================================================================
# Barely - Automated Setup Script for Ubuntu & Debian Linux (EC2 / Cloud VM)
# ==============================================================================
set -euo pipefail

echo ""
echo "🚀 Barely Autonomous QA - Ubuntu & Debian Setup"
echo "==============================================="

# 1. Detect root or sudo privileges
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "❌ Error: This script requires root or sudo privileges to install system dependencies."
    exit 1
  fi
fi

# 2. Install essential system packages
echo "📦 [1/6] Installing system packages (python3, venv, pip, curl, git)..."
$SUDO apt-get update -qq
$SUDO apt-get install -y -qq python3 python3-venv python3-pip curl git

# 3. Create and activate Python virtual environment
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

# 5. Install Playwright Chromium with Linux shared OS libraries
echo "🌐 [4/6] Installing Chromium browser and Linux system libraries..."
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

echo "==============================================="
echo "🎉 Barely setup completed successfully!"
echo ""
echo "To begin testing:"
echo "  1. Activate the environment:  source .venv/bin/activate"
echo "  2. Configure your API key:    nano .env (set ANTHROPIC_API_KEY, GROQ_API_KEY, etc.)"
echo "  3. Run a test goal:           barely run --headless .barely/goals/example.md"
echo ""
