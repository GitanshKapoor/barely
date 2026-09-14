import json
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Barely Control Plane API")

# Enable CORS for the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve the raw screenshots and PDFs directly from the workspace
runs_dir = Path(".barely/runs")
if not runs_dir.exists():
    runs_dir.mkdir(parents=True)
app.mount("/static/runs", StaticFiles(directory=".barely/runs"), name="runs")

@app.get("/api/runs")
def list_runs():
    """Returns a list of all historical test runs for the Dashboard."""
    runs = []
    for run_folder in runs_dir.iterdir():
        if run_folder.is_dir():
            result_file = run_folder / "result.json"
            if result_file.exists():
                try:
                    data = json.loads(result_file.read_text())
                    data["id"] = run_folder.name
                    runs.append(data)
                except Exception:
                    pass
    
    # Sort newest first
    runs.sort(key=lambda x: x["id"], reverse=True)
    return {"runs": runs}

@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    """Returns detailed step-by-step history for a specific run."""
    result_file = runs_dir / run_id / "result.json"
    if result_file.exists():
        return json.loads(result_file.read_text())
    return {"error": "Run not found"}
