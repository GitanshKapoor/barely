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
    """
    Initialize a new Barely workspace (.barely/) in the current directory.
    """
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
        f.write("---\n")
        f.write("tags: [demo, smoke]\n")
        f.write("timeout: 120\n")
        f.write("---\n")
        f.write("# Verify Example Website\n")
        f.write("1. Navigate to https://example.com\n")
        f.write("2. Click the 'More information' link\n")
        f.write("3. Verify the new page loads successfully\n")
        
    typer.echo("✅ Barely workspace initialized successfully in .barely/")
    typer.echo("👉 Try running: barely run .barely/goals/example.md")

@app.command()
def run(
    goal: str = typer.Argument(..., help="Path to the goal markdown file"),
    url: Optional[str] = typer.Option(None, "--url", help="Override the starting URL"),
    headless: bool = typer.Option(False, "--headless", help="Run browser in headless mode")
):
    """
    Execute a test goal using the AI agent.
    """
    load_dotenv()  # Load keys from .env
    
    goal_path = Path(goal)
    if not goal_path.exists():
        typer.echo(f"❌ Error: Goal file not found at {goal_path}")
        raise typer.Exit(1)
        
    typer.echo(f"📄 Parsing goal: {goal_path.name}")
    try:
        parsed_goal = GoalParser.parse(goal_path)
    except Exception as e:
        typer.echo(f"❌ Error parsing goal file: {e}")
        raise typer.Exit(1)

    start_url = url or "https://example.com"

    typer.echo("🤖 Booting Barely AI Agent...")
    engine = BrowserEngine(headless=headless)
    agent = AgentLoop(engine=engine, model="groq/llama3-70b-8192")
    
    try:
        result = agent.run(parsed_goal, start_url=start_url)
        
        # Plugin Hook: Jira Auto-Bug Filing
        if not result.success:
            jira_domain = os.getenv("JIRA_DOMAIN")
            jira_email = os.getenv("JIRA_EMAIL")
            jira_token = os.getenv("JIRA_API_TOKEN")
            jira_project = os.getenv("JIRA_PROJECT_KEY")
            
            if all([jira_domain, jira_email, jira_token, jira_project]):
                typer.echo("🐛 Jira Plugin: Attempting to file bug ticket...")
                try:
                    # Dynamic import to support optional plugin installation
                    from barely_jira.client import JiraReporter
                    reporter = JiraReporter(jira_domain, jira_email, jira_token, jira_project)
                    
                    history_str = "\n".join(result.step_history)
                    issue_url = reporter.file_bug(result.goal_name, result.failure_reason, history_str)
                    typer.echo(f"✅ Created Jira Bug: {issue_url}")
                    
                except ImportError:
                    typer.echo("⚠️ Jira Plugin configured but 'barely-reporter-jira' is not installed.")
                except Exception as e:
                    typer.echo(f"⚠️ Jira Plugin Error: {e}")
                    
    except Exception as e:
        typer.echo(f"💥 Fatal Agent Error: {e}")
        raise typer.Exit(1)

if __name__ == "__main__":
    app()
