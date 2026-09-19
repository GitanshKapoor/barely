#!/usr/bin/env bash
# ==============================================================================
# Barely - Automated Setup Script for macOS (Apple Silicon & Intel)
# ==============================================================================
set -euo pipefail

echo ""
echo "🚀 Barely Autonomous QA - macOS Setup"
echo "====================================="

# 1. Verify Python 3
PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif [ -f "/opt/homebrew/bin/python3" ]; then
  PYTHON_BIN="/opt/homebrew/bin/python3"
elif [ -f "/usr/local/bin/python3" ]; then
  PYTHON_BIN="/usr/local/bin/python3"
else
  echo "❌ Python 3 is not installed."
  echo "👉 Please install Python using Homebrew: brew install python"
  exit 1
fi

echo "🐍 [1/5] Using Python: $($PYTHON_BIN --version)"

# 2. Create and activate virtual environment
echo "📁 [2/5] Configuring virtual environment (.venv)..."
if [ ! -d ".venv" ]; then
  $PYTHON_BIN -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

# 3. Install Barely in editable mode
echo "⚙️  [3/5] Installing Barely Core, CLI, and Plugins..."
pip install --upgrade pip -qq
pip install -e packages/core -e packages/cli -e plugins/reporter-pdf -qq

# 4. Install Playwright Chromium
echo "🌐 [4/5] Installing Chromium browser..."
python3 -m playwright install chromium

# 5. Initialize .env file if not present
echo "🔐 [5/5] Checking environment secrets..."
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "    Created .env from .env.example"
fi

# Run diagnostics
echo ""
echo "🩺 Running Barely Doctor..."
barely doctor || true

echo "====================================="
echo "🎉 Barely setup completed successfully!"
echo ""
echo "To begin testing:"
echo "  1. Activate the environment:  source .venv/bin/activate"
echo "  2. Configure your API key:    open .env"
echo "  3. Run a test goal:           barely run .barely/goals/example.md"
echo ""
