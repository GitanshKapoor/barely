import os
import sys
import typer
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

from barely_core.parser.goal_parser import GoalParser
from barely_core.browser.engine import BrowserEngine
from barely_core.agent.loop import AgentLoop
from barely_cli.secrets import secret_app
from barely_cli.models import model_app

app = typer.Typer(help="Barely - Declarative AI-driven end-to-end testing.")
app.add_typer(secret_app, name="secret")
app.add_typer(model_app, name="model")

@app.command()
def doctor():
    """Diagnose local environment, Playwright installation, and AI API keys."""
    from barely_cli.doctor import run_doctor
    healthy = run_doctor()
    if not healthy:
        raise typer.Exit(1)

@app.command()
def init():
    base_dir = Path(".barely")
    if base_dir.exists():
        typer.echo("⚠️  Barely workspace (.barely/) already exists!")
        raise typer.Exit(1)
        
    (base_dir / "goals").mkdir(parents=True)
    (base_dir / "runs").mkdir(parents=True)
    
    with open(base_dir / "barely.yaml", "w") as f:
        f.write("project_name: my-barely-project\n")
        f.write("ai_provider: groq\n")
        f.write("ai_model: llama3-70b-8192\n")
        
    with open(base_dir / "goals" / "example.md", "w") as f:
        f.write("---\ntags: [demo]\ntimeout: 120\n---\n# Verify Example Website\n1. Navigate to https://example.com\n2. Click 'More information'\n")
        
    typer.echo("✅ Barely workspace initialized in .barely/")

@app.command()
def run(
    goal: str = typer.Argument(..., help="Path to the goal markdown file"),
    url: Optional[str] = typer.Option(None, "--url", help="Override the starting URL"),
    context: Optional[str] = typer.Option(None, "--context", "-c", help="Application & domain context (credentials, test rules, sandbox notes)"),
    model: Optional[str] = typer.Option(None, "--model", "-m", help="AI model to use (default: anthropic/claude-3-7-sonnet)"),
    headless: bool = typer.Option(False, "--headless", help="Run browser in headless mode")
):
    load_dotenv()
    
    goal_path = Path(goal)
    if not goal_path.exists():
        typer.echo(f"❌ Error: Goal file not found at {goal_path}")
        raise typer.Exit(1)
        
    parsed_goal = GoalParser.parse(goal_path)
    if context:
        parsed_goal.context = context

    start_url = url or "https://example.com"
    selected_model = model or os.getenv("BARELY_MODEL") or os.getenv("DEFAULT_MODEL") or "anthropic/claude-sonnet-4-5"

    # Auto-detect headless mode on Linux if no display is attached (e.g. EC2, CI, SSH)
    if not headless and sys.platform.startswith("linux"):
        if not (os.getenv("DISPLAY") or os.getenv("WAYLAND_DISPLAY")):
            typer.secho("ℹ️  Headless environment detected (no $DISPLAY). Auto-enabling --headless mode.", fg=typer.colors.BLUE)
            headless = True

    # Pre-flight API Key Validation
    from barely_core.settings import resolve_model_api_key, get_model_provider
    resolved_key = resolve_model_api_key(selected_model)
    if not resolved_key:
        prov = get_model_provider(selected_model).upper()
        typer.secho(f"❌ Error: No API key configured for model '{selected_model}'.", fg=typer.colors.RED, bold=True)
        typer.echo(f"👉 Please set {prov}_API_KEY in your .env file or environment.")
        typer.echo("💡 Tip: Run 'barely doctor' to inspect your environment.")
        raise typer.Exit(1)

    typer.echo(f"🤖 Booting Barely AI Agent (model: {selected_model})...")
    try:
        engine = BrowserEngine(headless=headless)
    except Exception as e:
        err_msg = str(e)
        if "Executable doesn't exist" in err_msg or "playwright install" in err_msg.lower():
            typer.secho("❌ Error: Playwright Chromium browser binary is not installed.", fg=typer.colors.RED, bold=True)
            cmd = "python3 -m playwright install --with-deps chromium" if sys.platform.startswith("linux") else "playwright install chromium"
            typer.echo(f"👉 Fix: Run '{cmd}' to install browser dependencies.")
            raise typer.Exit(1)
        raise e

    agent = AgentLoop(engine=engine, model=selected_model)
    
    try:
        result = agent.run(parsed_goal, start_url=start_url)
        
        # 1. PDF Plugin (Runs always)
        try:
            from barely_pdf.reporter import PDFReporter
            pdf_path = str(Path(result.run_dir) / "execution_report.pdf")
            typer.echo(f"📄 Generating PDF Report...")
            PDFReporter().generate(result, pdf_path)
            typer.echo(f"✅ PDF Report saved to: {pdf_path}")
        except ImportError:
            typer.echo("⚠️ PDF Reporter plugin not installed.")
            
        # 2. Automated Defect Filing (Jira & GitHub) and Channel Notifications (Slack & Teams)
        try:
            from barely_core.integrations.dispatcher import dispatch_cli_notifications
            run_id = Path(result.run_dir).name if hasattr(result, "run_dir") and result.run_dir else "cli-run"
            run_data = {
                "id": run_id,
                "name": parsed_goal.name,
                "start_url": start_url,
                "device": "desktop",
                "status": "completed" if result.success else "failed",
                "success": result.success,
                "failure_reason": result.failure_reason,
                "model": selected_model,
                "steps": [
                    {"description": s.description, "thought": getattr(s, "thought", "")}
                    for s in getattr(result, "rich_history", [])
                ]
            }
            outcomes = dispatch_cli_notifications(run_data)
            if outcomes.get("jira_url"):
                typer.secho(f"🎫 Created Jira Bug: {outcomes['jira_url']}", fg=typer.colors.GREEN, bold=True)
            if outcomes.get("github_url"):
                typer.secho(f"🐙 Created GitHub Issue: {outcomes['github_url']}", fg=typer.colors.GREEN, bold=True)
            if outcomes.get("slack_sent"):
                typer.secho("📢 Dispatched incident notification to Slack.", fg=typer.colors.GREEN)
            if outcomes.get("teams_sent"):
                typer.secho("📢 Dispatched incident notification to Microsoft Teams.", fg=typer.colors.GREEN)
            for err in outcomes.get("errors", []):
                typer.secho(f"⚠️  Integration Warning: {err}", fg=typer.colors.YELLOW)
        except Exception as ie:
            pass

    except Exception as e:
        typer.echo(f"💥 Fatal Agent Error: {e}")
        raise typer.Exit(1)

if __name__ == "__main__":
    app()
