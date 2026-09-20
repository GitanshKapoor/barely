import os
from pathlib import Path
from typing import Optional

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv():
        pass

try:
    import typer
    secret_app = typer.Typer(help="Manage API keys and secrets securely.")
except ImportError:
    class _DummyTyper:
        @staticmethod
        def Argument(default=..., *args, **kwargs):
            return default
        @staticmethod
        def Option(default=..., *args, **kwargs):
            return default
        @staticmethod
        def prompt(msg, **kwargs):
            return ""
        @staticmethod
        def secho(msg, **kwargs):
            print(msg)
        @staticmethod
        def echo(msg):
            print(msg)
        class colors:
            GREEN = "green"
            RED = "red"
            YELLOW = "yellow"
            WHITE = "white"
        class Exit(Exception):
            pass
        def command(self, *args, **kwargs):
            return lambda fn: fn
    typer = _DummyTyper()
    secret_app = typer

STANDARD_SECRETS = [
    ("ANTHROPIC_API_KEY", "Anthropic Claude API Key"),
    ("OPENAI_API_KEY", "OpenAI GPT API Key"),
    ("GEMINI_API_KEY", "Google Gemini API Key"),
    ("GROQ_API_KEY", "Groq Llama API Key"),
    ("JIRA_API_TOKEN", "Atlassian Jira API Token"),
    ("GITHUB_TOKEN", "GitHub Personal Access Token"),
    ("SLACK_WEBHOOK_URL", "Slack Incoming Webhook URL"),
    ("TEAMS_WEBHOOK_URL", "Microsoft Teams Webhook URL"),
    ("BARELY_SECRET_KEY", "Master AES-256 Encryption Key"),
]

def mask_val(val: str) -> str:
    """Safely masks a secret string."""
    if not val:
        return ""
    if len(val) <= 8:
        return "***"
    return f"{val[:6]}...{val[-4:]}"

def update_dotenv(key: str, value: str, filepath: Path = Path(".env")) -> None:
    """Updates or appends a key=value pair in .env without destroying comments."""
    lines = []
    if filepath.exists():
        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()

    found = False
    new_lines = []
    clean_val = value.strip()
    if " " in clean_val and not (clean_val.startswith('"') and clean_val.endswith('"')):
        formatted_line = f'{key}="{clean_val}"\n'
    else:
        formatted_line = f"{key}={clean_val}\n"

    prefix = f"{key}="
    export_prefix = f"export {key}="

    for line in lines:
        stripped = line.strip()
        if stripped.startswith(prefix) or stripped.startswith(export_prefix):
            new_lines.append(formatted_line)
            found = True
        else:
            new_lines.append(line)

    if not found:
        if new_lines and not new_lines[-1].endswith("\n"):
            new_lines.append("\n")
        new_lines.append(formatted_line)

    with open(filepath, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

def unset_dotenv(key: str, filepath: Path = Path(".env")) -> bool:
    """Removes a key from .env file."""
    if not filepath.exists():
        return False
    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()

    prefix = f"{key}="
    export_prefix = f"export {key}="
    new_lines = []
    removed = False

    for line in lines:
        stripped = line.strip()
        if stripped.startswith(prefix) or stripped.startswith(export_prefix):
            removed = True
        else:
            new_lines.append(line)

    if removed:
        with open(filepath, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    return removed

@secret_app.command("set")
def set_secret(
    key: Optional[str] = typer.Argument(None, help="Secret name (e.g. ANTHROPIC_API_KEY). If omitted, prompts with a menu."),
    value: Optional[str] = typer.Argument(None, help="Secret value. If omitted, prompts with hidden input.")
):
    """Set or update an API key or secret securely. Prompts with hidden input to protect shell history."""
    if not key:
        typer.echo("")
        typer.secho("Select a secret to configure:", bold=True)
        for i, (s_key, s_label) in enumerate(STANDARD_SECRETS, 1):
            typer.echo(f"  {i}) {s_key:<20} ({s_label})")
        typer.echo(f"  {len(STANDARD_SECRETS) + 1}) Custom key name...")
        
        choice = typer.prompt(f"Choose option [1-{len(STANDARD_SECRETS) + 1}]", default="1")
        try:
            idx = int(choice.strip()) - 1
            if 0 <= idx < len(STANDARD_SECRETS):
                clean_key = STANDARD_SECRETS[idx][0]
            elif idx == len(STANDARD_SECRETS):
                clean_key = typer.prompt("Enter custom secret name").strip().upper()
            else:
                typer.secho("❌ Invalid selection.", fg=typer.colors.RED)
                raise typer.Exit(1)
        except ValueError:
            clean_key = choice.strip().upper()
    else:
        clean_key = key.strip().upper()
    
    if value is not None:
        typer.secho("💡 Security Tip: To keep secrets out of shell history (~/.bash_history), run 'barely secret set <KEY>' without a value to enter it via hidden prompt.", fg=typer.colors.BLUE)
    else:
        value = typer.prompt(f"Enter secret value for {clean_key}", hide_input=True)

    if not value or not value.strip():
        typer.secho("❌ Secret value cannot be empty.", fg=typer.colors.RED, bold=True)
        raise typer.Exit(1)

    clean_value = value.strip()
    env_file = Path(".env")
    update_dotenv(clean_key, clean_value, env_file)

    # Optional: If database is available, also update in DB
    if os.getenv("DATABASE_URL"):
        try:
            from barely_core.settings import set_setting
            set_setting(clean_key, clean_value, is_secret=True)
            db_note = " and database"
        except Exception:
            db_note = ""
    else:
        db_note = ""

    masked = mask_val(clean_value)
    typer.secho(f"✅ Successfully saved {clean_key} ({masked}) to {env_file}{db_note}.", fg=typer.colors.GREEN, bold=True)

@secret_app.command("list")
def list_secrets():
    """List all configured secrets with safe zero-leak masking."""
    load_dotenv()
    typer.echo("")
    typer.secho("🔐 Configured Barely Secrets", bold=True)
    typer.echo("==================================")

    for sec_key, sec_label in STANDARD_SECRETS:
        val = os.getenv(sec_key)
        if val and val.strip():
            masked = mask_val(val.strip())
            typer.secho(f"  [✓] {sec_key:<20} {masked:<16} ({sec_label})", fg=typer.colors.GREEN)
        else:
            typer.secho(f"  [✗] {sec_key:<20} Not configured  ({sec_label})", fg=typer.colors.WHITE, dim=True)

    typer.echo("==================================")
    typer.echo("💡 Tip: Use 'barely secret set <KEY>' to configure a secret.")
    typer.echo("")

@secret_app.command("get")
def get_secret(
    key: str = typer.Argument(..., help="Secret name to inspect"),
    show: bool = typer.Option(False, "--show", "-s", help="Display full unmasked plaintext value")
):
    """Inspect a configured secret (masked by default)."""
    load_dotenv()
    clean_key = key.strip().upper()
    val = os.getenv(clean_key)
    
    if not val:
        typer.secho(f"❌ Secret '{clean_key}' is not configured.", fg=typer.colors.YELLOW)
        raise typer.Exit(1)

    if show:
        typer.echo(val.strip())
    else:
        typer.secho(f"{clean_key}: {mask_val(val.strip())}", fg=typer.colors.GREEN)

@secret_app.command("unset")
def unset_secret(
    key: str = typer.Argument(..., help="Secret name to remove")
):
    """Remove a secret from .env."""
    clean_key = key.strip().upper()
    env_file = Path(".env")
    removed = unset_dotenv(clean_key, env_file)

    if os.getenv("DATABASE_URL"):
        try:
            from barely_core.settings import delete_setting
            delete_setting(clean_key)
        except Exception:
            pass

    if removed:
        typer.secho(f"✅ Removed {clean_key} from {env_file}.", fg=typer.colors.GREEN)
    else:
        typer.secho(f"ℹ️  {clean_key} was not found in {env_file}.", fg=typer.colors.YELLOW)
