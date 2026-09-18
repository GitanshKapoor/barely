import os
import typer
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

from barely_core.parser.goal_parser import GoalParser
from barely_core.browser.engine import BrowserEngine
from barely_core.agent.loop import AgentLoop

app = typer.Typer(help="Barely - Declarative AI-driven end-to-end testing.")

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
    model: Optional[str] = typer.Option(None, "--model", "-m", help="AI model to use (default: anthropic/claude-sonnet-4-5)"),
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
    selected_model = model or os.getenv("BARELY_MODEL") or "anthropic/claude-sonnet-4-5"

    typer.echo(f"🤖 Booting Barely AI Agent (model: {selected_model})...")
    engine = BrowserEngine(headless=headless)
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
            
        # 2. Jira Plugin (Runs only on failure)
        if not result.success:
            jira_domain = os.getenv("JIRA_DOMAIN")
            if jira_domain:
                try:
                    from barely_jira.client import JiraReporter
                    reporter = JiraReporter(jira_domain, os.getenv("JIRA_EMAIL"), os.getenv("JIRA_API_TOKEN"), os.getenv("JIRA_PROJECT_KEY"))
                    issue_url = reporter.file_bug(result.goal_name, result.failure_reason, "\n".join(result.step_history))
                    typer.echo(f"✅ Created Jira Bug: {issue_url}")
                except ImportError:
                    pass

    except Exception as e:
        typer.echo(f"💥 Fatal Agent Error: {e}")
        raise typer.Exit(1)

if __name__ == "__main__":
    app()
