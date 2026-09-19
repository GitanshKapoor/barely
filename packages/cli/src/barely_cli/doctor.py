import os
import sys
import platform
from pathlib import Path
from typing import Dict, Any, List, Tuple
try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv():
        pass

# Lightweight ANSI formatting helper (requires zero third-party dependencies)
def _format_text(msg: str, color: str = None, bold: bool = False) -> str:
    # Disable colors if NO_COLOR or dumb terminal
    if os.getenv("NO_COLOR") or os.getenv("TERM") == "dumb":
        return msg
    codes = {
        "green": "\033[92m",
        "red": "\033[91m",
        "yellow": "\033[93m",
        "blue": "\033[94m",
        "bold": "\033[1m",
        "reset": "\033[0m"
    }
    prefix = ""
    if bold:
        prefix += codes["bold"]
    if color and color in codes:
        prefix += codes[color]
    return f"{prefix}{msg}{codes['reset']}" if prefix else msg

def print_status(msg: str, status: str = "info"):
    if status == "ok":
        print(f"  {_format_text('[✓]', 'green', bold=True)} {msg}")
    elif status == "error":
        print(f"  {_format_text('[✗]', 'red', bold=True)} {_format_text(msg, 'red')}")
    elif status == "warn":
        print(f"  {_format_text('[!]', 'yellow', bold=True)} {_format_text(msg, 'yellow')}")
    else:
        print(f"  {msg}")

def check_python_version() -> Tuple[bool, str]:
    version = sys.version_info
    v_str = f"{version.major}.{version.minor}.{version.micro}"
    if version >= (3, 10):
        in_venv = sys.prefix != sys.base_prefix
        env_note = "virtualenv active" if in_venv else "system python (virtual environment recommended)"
        return True, f"Python {v_str} ({env_note})"
    return False, f"Python {v_str} detected. Barely requires Python 3.10 or higher."

def check_display_environment() -> Tuple[bool, str]:
    sys_name = platform.system()
    if sys_name == "Darwin":
        return True, "macOS desktop environment detected (GUI window and headless modes supported)"
    elif sys_name == "Windows":
        return True, "Windows desktop environment detected"
    
    # Linux / Cloud VM / Container
    display = os.getenv("DISPLAY") or os.getenv("WAYLAND_DISPLAY")
    if display:
        return True, f"Linux display detected ({display}). GUI and headless modes supported."
    return True, "Headless Linux server detected (no $DISPLAY). CLI will auto-enable --headless mode."

def check_playwright() -> Tuple[bool, str]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return False, "Playwright package not installed. Run: pip install playwright"

    try:
        with sync_playwright() as p:
            exec_path = p.chromium.executable_path
            if os.path.exists(exec_path):
                return True, f"Chromium browser installed ({exec_path})"
            else:
                cmd = "python3 -m playwright install --with-deps chromium" if platform.system() == "Linux" else "playwright install chromium"
                return False, f"Chromium binary not found.\n      👉 Fix: Run '{cmd}'"
    except Exception as e:
        cmd = "python3 -m playwright install --with-deps chromium" if platform.system() == "Linux" else "playwright install chromium"
        return False, f"Chromium launch check failed ({e}).\n      👉 Fix: Run '{cmd}'"

def check_api_keys() -> Tuple[bool, List[str]]:
    load_dotenv()
    providers = [
        ("Anthropic", "ANTHROPIC_API_KEY"),
        ("OpenAI", "OPENAI_API_KEY"),
        ("Google Gemini", "GEMINI_API_KEY"),
        ("Groq", "GROQ_API_KEY"),
    ]
    
    found = []
    missing = []
    
    for prov_name, env_var in providers:
        val = os.getenv(env_var)
        if val and val.strip():
            masked = val[:6] + "..." + val[-4:] if len(val) > 10 else "***"
            found.append(f"{prov_name} ({env_var}): configured ({masked})")
        else:
            missing.append(f"{prov_name} ({env_var})")
            
    if found:
        return True, found
    return False, [
        "No AI provider API key found.",
        "👉 Fix: Copy .env.example to .env and set at least one provider key (e.g. ANTHROPIC_API_KEY or GROQ_API_KEY)."
    ]

def check_database() -> Tuple[bool, str]:
    db_url = os.getenv("DATABASE_URL")
    if not db_url or not db_url.strip():
        return True, "DATABASE_URL not configured (Standalone file/local mode active)"
    
    try:
        from sqlalchemy import create_engine, text
        engine = create_engine(db_url, connect_args={"connect_timeout": 3})
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, "PostgreSQL database connection verified"
    except Exception as e:
        return False, f"Database configured but unreachable: {e}"

def run_doctor() -> bool:
    """Runs all environment checks and prints formatted report."""
    load_dotenv()
    print("")
    print(_format_text("🩺 Barely Environment Diagnostics", "bold"))
    print("==================================")
    
    all_healthy = True

    # 1. Python
    ok, msg = check_python_version()
    if ok:
        print_status(msg, "ok")
    else:
        print_status(msg, "error")
        all_healthy = False

    # 2. Display / OS
    ok, msg = check_display_environment()
    print_status(msg, "ok")

    # 3. Playwright & Chromium
    ok, msg = check_playwright()
    if ok:
        print_status(msg, "ok")
    else:
        print_status(msg, "error")
        all_healthy = False

    # 4. AI API Keys
    ok, msgs = check_api_keys()
    if ok:
        print_status("AI Provider Keys:", "ok")
        for m in msgs:
            print(f"      • {m}")
    else:
        for m in msgs:
            print_status(m, "warn")
        all_healthy = False

    # 5. Database (Optional)
    ok, msg = check_database()
    if ok:
        print_status(msg, "ok")
    else:
        print_status(msg, "warn")

    print("==================================")
    if all_healthy:
        print(_format_text("🎉 Ready! All core requirements are satisfied.", "green", bold=True))
    else:
        print(_format_text("⚠️  Some prerequisites require attention before running tests.", "yellow", bold=True))
    print("")

    return all_healthy

if __name__ == "__main__":
    success = run_doctor()
    sys.exit(0 if success else 1)
