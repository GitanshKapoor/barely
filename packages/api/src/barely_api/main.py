import json
import uuid
import datetime
from pathlib import Path
from fastapi import FastAPI, BackgroundTasks, HTTPException
from barely_core.db import SessionLocal, RunRecord, init_db
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from barely_api.report import router as report_router

app = FastAPI(title="Barely Control Plane API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(report_router)

class RunRequest(BaseModel):
    url: str
    name: str = ""
    goal_text: str
    device: str = "desktop"
    strict_mode: bool = False

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
                "name": r.name or r.id,
                "goal": r.goal,
                "device": r.device,
                "status": r.status,
                "success": r.success,
                "failure_reason": r.failure_reason,
                "strict_mode": bool(r.strict_mode)
            })
        return {"runs": runs}
    finally:
        db.close()

@app.get("/api/baselines")
def list_baselines():
    from barely_core.db import RunStep
    db = SessionLocal()
    try:
        runs_with_steps = (
            db.query(RunRecord)
            .join(RunStep, RunRecord.id == RunStep.run_id)
            .filter(RunStep.screenshot_base64.isnot(None))
            .order_by(RunRecord.created_at.desc())
            .all()
        )
        
        seen_keys = set()
        baselines = []
        for r in runs_with_steps:
            key = f"{r.name or r.id}_{r.device}"
            if key in seen_keys:
                continue
            seen_keys.add(key)
            
            steps = (
                db.query(RunStep)
                .filter(RunStep.run_id == r.id, RunStep.screenshot_base64.isnot(None))
                .order_by(RunStep.step_index.asc())
                .all()
            )
            
            baselines.append({
                "id": r.id,
                "name": r.name or r.id,
                "goal": r.goal,
                "device": r.device or "desktop",
                "start_url": r.start_url,
                "status": r.status,
                "success": r.success,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "snapshots_count": len(steps),
                "snapshots": [
                    {
                        "step_index": s.step_index,
                        "description": s.description,
                        "thought": s.thought,
                        "screenshot": s.screenshot_base64
                    }
                    for s in steps
                ]
            })
            
        return {"baselines": baselines}
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
            "name": r.name or r.id,
            "goal": r.goal,
            "start_url": r.start_url,
            "device": r.device,
            "status": r.status,
            "success": r.success,
            "failure_reason": r.failure_reason,
            "strict_mode": bool(r.strict_mode),
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "logs": r.logs or "",
            "steps": [{"description": s.description, "thought": s.thought, "screenshot": s.screenshot_base64} for s in steps]
        }
    finally:
        db.close()

@app.post("/api/runs/{run_id}/cancel")
def cancel_run(run_id: str):
    db = SessionLocal()
    try:
        r = db.query(RunRecord).filter(RunRecord.id == run_id).first()
        if not r:
            raise HTTPException(status_code=404, detail="Run not found")
        if r.status in ["completed", "cancelled"]:
            return {"message": f"Run is already {r.status}", "status": r.status}
        
        r.status = "cancelled"
        r.success = False
        r.failure_reason = "Cancelled by user"
        r.logs = (r.logs or "") + f"[{datetime.datetime.now().strftime('%H:%M:%S')}] 🛑 Run cancelled via API.\n"
        db.commit()
        return {"message": "Run cancelled successfully", "status": "cancelled"}
    finally:
        db.close()

@app.post("/api/runs")
def trigger_run(req: RunRequest):
    job_id = f"job_{uuid.uuid4().hex[:8]}"
    
    db = SessionLocal()
    try:
        new_run = RunRecord(
            id=job_id, 
            name=req.name or job_id, 
            goal=req.goal_text,
            start_url=req.url,
            device=req.device, 
            strict_mode=req.strict_mode,
            status="pending"
        )
        db.add(new_run)
        db.commit()
    finally:
        db.close()
        
    return {"message": "Job queued successfully", "job_id": job_id}
