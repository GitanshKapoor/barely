import os
import typer
from pathlib import Path
from typing import Optional

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
    
    # Write default config
    with open(base_dir / "barely.yaml", "w") as f:
        f.write("project_name: my-barely-project\n")
        f.write("ai_provider: groq\n")
        f.write("ai_model: llama3-70b-8192\n")
        
    # Write a sample goal
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
        agent.run(parsed_goal, start_url=start_url)
    except Exception as e:
        typer.echo(f"💥 Fatal Agent Error: {e}")
        raise typer.Exit(1)

if __name__ == "__main__":
    app()
