import typer
from typing import Optional

app = typer.Typer(help="Barely - AI-powered end-to-end web testing agent.")

@app.command()
def init():
    """
    Initialize a new Barely workspace (.barely/) in the current directory.
    """
    typer.echo("Initializing Barely workspace... (Not implemented yet)")

@app.command()
def run(
    url: Optional[str] = typer.Option(None, help="The target URL to test"),
    goal: Optional[str] = typer.Option(None, help="Path to a specific goal file to run"),
):
    """
    Run test goals via the AI agent.
    """
    typer.echo(f"Running tests for {url} with goal {goal}...")

if __name__ == "__main__":
    app()
