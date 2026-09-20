import os
from pathlib import Path
from typing import Optional, List, Tuple
from barely_cli.secrets import update_dotenv

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv():
        pass

try:
    import typer
    model_app = typer.Typer(help="Inspect and configure the active AI model.")
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
            BLUE = "blue"
        class Exit(Exception):
            pass
        def command(self, *args, **kwargs):
            return lambda fn: fn
    typer = _DummyTyper()
    model_app = typer

SUPPORTED_MODELS: List[Tuple[str, str, str]] = [
    ("anthropic/claude-sonnet-4-5", "Anthropic Claude 3.5/4.5 Sonnet", "ANTHROPIC_API_KEY"),
    ("anthropic/claude-3-7-sonnet", "Anthropic Claude 3.7 Sonnet (Hybrid Reasoning)", "ANTHROPIC_API_KEY"),
    ("openai/gpt-4o", "OpenAI GPT-4o (Vision & Reasoning)", "OPENAI_API_KEY"),
    ("openai/gpt-4o-mini", "OpenAI GPT-4o Mini (Cost-Optimized)", "OPENAI_API_KEY"),
    ("gemini/gemini-2.0-flash", "Google Gemini 2.0 Flash (Ultra-Fast Multimodal)", "GEMINI_API_KEY"),
    ("groq/llama-3.3-70b-versatile", "Groq Llama 3.3 70B (High-Speed Open Source)", "GROQ_API_KEY"),
]

def get_active_model() -> str:
    """Returns the currently active default model."""
    load_dotenv()
    return os.getenv("DEFAULT_MODEL") or os.getenv("BARELY_MODEL") or "anthropic/claude-sonnet-4-5"

@model_app.command("list")
def list_models():
    """List all supported AI models, active default, and API key readiness."""
    load_dotenv()
    active = get_active_model()

    typer.echo("")
    typer.secho("🧠 Supported Barely AI Models", bold=True)
    typer.echo("==================================================================")

    for model_id, model_name, key_name in SUPPORTED_MODELS:
        is_active = (model_id == active)
        has_key = bool(os.getenv(key_name) and os.getenv(key_name).strip())

        prefix = "[✓]" if is_active else "[ ]"
        key_badge = " [Key configured]" if has_key else " [No key - run 'barely secret set']"

        if is_active:
            status_text = f"  {prefix} {model_id:<32} (Active Default)"
            typer.secho(status_text + key_badge, fg=typer.colors.GREEN, bold=True)
        else:
            status_text = f"  {prefix} {model_id:<32}"
            if has_key:
                typer.secho(status_text + key_badge, fg=typer.colors.WHITE)
            else:
                typer.secho(status_text + key_badge, fg=typer.colors.WHITE, dim=True)

    typer.echo("==================================================================")
    typer.echo("💡 Tip: Use 'barely model set <MODEL>' to change the default model.")
    typer.echo("")

@model_app.command("get")
def get_model():
    """Display the currently active default AI model."""
    active = get_active_model()
    typer.secho(f"Default AI Model: {active}", fg=typer.colors.GREEN, bold=True)

@model_app.command("set")
def set_model(
    model: Optional[str] = typer.Argument(None, help="Model identifier to set as default. If omitted, prompts with a selection menu.")
):
    """Set the default AI model in .env."""
    load_dotenv()

    if not model:
        typer.echo("")
        typer.secho("Select default AI model to use across test runs:", bold=True)
        for i, (m_id, m_desc, _) in enumerate(SUPPORTED_MODELS, 1):
            typer.echo(f"  {i}) {m_id:<30} ({m_desc})")
        
        choice = typer.prompt("Choose option [1-6]", default="1")
        try:
            idx = int(choice.strip()) - 1
            if 0 <= idx < len(SUPPORTED_MODELS):
                model = SUPPORTED_MODELS[idx][0]
            else:
                typer.secho(f"❌ Invalid selection '{choice}'.", fg=typer.colors.RED)
                raise typer.Exit(1)
        except ValueError:
            typer.secho(f"❌ Invalid number '{choice}'.", fg=typer.colors.RED)
            raise typer.Exit(1)

    clean_model = model.strip()
    env_file = Path(".env")
    update_dotenv("DEFAULT_MODEL", clean_model, env_file)

    # If DB is configured, also persist in DB
    if os.getenv("DATABASE_URL"):
        try:
            from barely_core.settings import set_setting
            set_setting("DEFAULT_MODEL", clean_model, is_secret=False)
        except Exception:
            pass

    typer.secho(f"✅ Successfully set default model to '{clean_model}' in {env_file}.", fg=typer.colors.GREEN, bold=True)

    # Check if corresponding key is present
    matching = next((m for m in SUPPORTED_MODELS if m[0] == clean_model), None)
    if matching:
        key_name = matching[2]
        if not os.getenv(key_name):
            typer.secho(f"ℹ️  Note: Model '{clean_model}' requires {key_name}.", fg=typer.colors.YELLOW)
            typer.echo(f"👉 Run 'barely secret set {key_name}' to configure your API key.")
