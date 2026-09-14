import json
import uuid
import datetime
from pathlib import Path
from fastapi import FastAPI, BackgroundTasks, HTTPException
from barely_core.db import SessionLocal, RunRecord, init_db
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
goals_dir = Path(".barely/goals")

for d in [runs_dir, queue_dir, goals_dir]:
    d.mkdir(parents=True, exist_ok=True)

app.mount("/static/runs", StaticFiles(directory=".barely/runs"), name="runs")

class RunRequest(BaseModel):
    url: str
    goal_text: str
    device: str = "desktop"

@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/api/runs")
def list_runs():
    db = SessionLocal()
    try:
        records = db.query(RunRecord).order_by(RunRecord.created_at.desc()).all()
        runs = []
        for r in records:
            runs.append({
                "id": r.id,
                "goal": r.goal,
                "status": r.status,
                "success": r.success,
                "failure_reason": r.failure_reason
            })
        return {"runs": runs}
    finally:
        db.close()

@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    from barely_core.db import RunStep
    db = SessionLocal()
    try:
        r = db.query(RunRecord).filter(RunRecord.id == run_id).first()
        if not r:
            raise HTTPException(status_code=404, detail="Run not found")
        steps = db.query(RunStep).filter(RunStep.run_id == run_id).order_by(RunStep.step_index).all()
        return {
            "id": r.id,
            "goal": r.goal,
            "status": r.status,
            "success": r.success,
            "failure_reason": r.failure_reason,
            "steps": [{"description": s.description, "screenshot": s.screenshot_path} for s in steps]
        }
    finally:
        db.close()

@app.post("/api/runs")
def trigger_run(req: RunRequest):
    job_id = f"job_{uuid.uuid4().hex[:8]}"
    
    # 1. DB Save
    db = SessionLocal()
    try:
        new_run = RunRecord(id=job_id, goal=req.goal_text, status="pending")
        db.add(new_run)
        db.commit()
    finally:
        db.close()
        
    # Generate the Markdown Goal File dynamically from the UI Form
    goal_file = goals_dir / f"{job_id}.md"
    markdown_content = f"---\nname: \"Dynamic UI Run {job_id}\"\n---\n{req.goal_text}"
    goal_file.write_text(markdown_content)

    job_payload = {
        "job_id": job_id,
        "goal_file": str(goal_file),
        "start_url": req.url,
        "device": req.device,
    }
    
    (queue_dir / f"{job_id}.json").write_text(json.dumps(job_payload))
    return {"message": "Job queued successfully", "job_id": job_id}
