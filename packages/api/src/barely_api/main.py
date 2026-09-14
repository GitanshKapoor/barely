import json
import uuid
import datetime
from pathlib import Path
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Barely Control Plane API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

runs_dir = Path(".barely/runs")
queue_dir = Path(".barely/queue/pending")

for d in [runs_dir, queue_dir]:
    d.mkdir(parents=True, exist_ok=True)

app.mount("/static/runs", StaticFiles(directory=".barely/runs"), name="runs")

class RunRequest(BaseModel):
    goal_file: str

@app.get("/api/runs")
def list_runs():
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
    runs.sort(key=lambda x: x["id"], reverse=True)
    return {"runs": runs}

@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    result_file = runs_dir / run_id / "result.json"
    if result_file.exists():
        return json.loads(result_file.read_text())
    raise HTTPException(status_code=404, detail="Run not found")

@app.post("/api/runs")
def trigger_run(req: RunRequest):
    """Phase 4: API pushes the execution job to the Queue for the Worker to pick up."""
    job_id = f"job_{uuid.uuid4().hex[:8]}"
    job_payload = {
        "job_id": job_id,
        "goal_file": req.goal_file,
        "status": "pending",
        "timestamp": datetime.datetime.now().isoformat()
    }
    (queue_dir / f"{job_id}.json").write_text(json.dumps(job_payload))
    return {"message": "Job queued successfully", "job_id": job_id}
