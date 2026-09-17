import json
import uuid
import datetime
from pathlib import Path
from fastapi import FastAPI, BackgroundTasks, HTTPException
from barely_core.db import SessionLocal, RunRecord, init_db
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from typing import Optional, List

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
    use_cache: bool = False
    tags: Optional[List[str]] = []

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
                "start_url": r.start_url,
                "device": r.device,
                "status": r.status,
                "success": r.success,
                "failure_reason": r.failure_reason,
                "strict_mode": bool(r.strict_mode),
                "use_cache": bool(getattr(r, "use_cache", False)),
                "tags": [t for t in r.tags.split(",") if t] if r.tags else [],
                "created_at": r.created_at.isoformat() if r.created_at else None
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
                "strict_mode": bool(r.strict_mode),
                "tags": [t for t in r.tags.split(",") if t] if r.tags else [],
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
            "use_cache": bool(getattr(r, "use_cache", False)),
            "tags": [t for t in r.tags.split(",") if t] if r.tags else [],
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
    tag_str = ",".join([t.strip().lstrip("#") for t in (req.tags or []) if t.strip()]) if req.tags else None
    
    db = SessionLocal()
    try:
        new_run = RunRecord(
            id=job_id, 
            name=req.name or job_id, 
            goal=req.goal_text,
            start_url=req.url,
            device=req.device, 
            strict_mode=req.strict_mode,
            use_cache=req.use_cache,
            tags=tag_str,
            status="pending"
        )
        db.add(new_run)
        db.commit()
    finally:
        db.close()
        
    return {"message": "Job queued successfully", "job_id": job_id}

@app.post("/api/cache/clear")
def clear_cache():
    from barely_core.db import CacheRecord
    db = SessionLocal()
    try:
        deleted = db.query(CacheRecord).delete()
        db.commit()
        return {"message": f"Cleared {deleted} cached decision records", "deleted": deleted}
    finally:
        db.close()

class SaveSettingRequest(BaseModel):
    key: str
    value: str

class TestKeyRequest(BaseModel):
    provider: str
    key: Optional[str] = None

@app.get("/api/settings")
def get_settings():
    from barely_core.settings import list_settings_status
    from barely_core.db import engine, DATABASE_URL
    from barely_core.security.crypto import mask_database_url
    import time
    from sqlalchemy import text

    settings_list = list_settings_status()

    # Test DB status and latency
    db_status = {
        "url_masked": mask_database_url(DATABASE_URL),
        "is_connected": False,
        "latency_ms": None,
        "provider": "Unknown",
        "version": None,
        "ssl_enabled": "sslmode=require" in DATABASE_URL or "sslmode=verify" in DATABASE_URL
    }

    try:
        start_t = time.time()
        with engine.connect() as conn:
            res = conn.execute(text("SELECT version();")).scalar()
            db_status["latency_ms"] = round((time.time() - start_t) * 1000, 1)
            db_status["is_connected"] = True
            db_status["version"] = res.split()[0] + " " + res.split()[1] if res else "PostgreSQL"
            
            low_url = DATABASE_URL.lower()
            if "rds.amazonaws.com" in low_url:
                db_status["provider"] = "AWS RDS / Aurora"
            elif "supabase.com" in low_url or "supabase.co" in low_url:
                db_status["provider"] = "Supabase"
            elif "neon.tech" in low_url:
                db_status["provider"] = "Neon Serverless"
            elif "barely-db" in low_url or "localhost" in low_url or "127.0.0.1" in low_url:
                db_status["provider"] = "Local Docker Container"
            else:
                db_status["provider"] = "Cloud PostgreSQL"
    except Exception as e:
        db_status["error"] = str(e)

    return {
        "settings": settings_list,
        "database": db_status
    }

@app.post("/api/settings")
def save_setting(req: SaveSettingRequest):
    from barely_core.settings import set_setting
    if not req.key or not req.key.strip():
        raise HTTPException(status_code=400, detail="Key cannot be empty")
    set_setting(req.key.strip(), req.value)
    return {"message": f"Setting '{req.key}' updated successfully", "key": req.key}

@app.delete("/api/settings/{key}")
def remove_setting(key: str):
    from barely_core.settings import delete_setting
    deleted = delete_setting(key)
    if not deleted:
        return {"message": f"No database override found for '{key}'", "deleted": False}
    return {"message": f"Setting '{key}' database override removed", "deleted": True}

@app.post("/api/settings/test-key")
def test_key(req: TestKeyRequest):
    import litellm
    from barely_core.settings import get_setting
    provider = req.provider.lower()
    
    # Map provider to lightweight test model and environment key name
    provider_map = {
        "anthropic": ("anthropic/claude-3-haiku-20240307", "ANTHROPIC_API_KEY"),
        "openai": ("gpt-4o-mini", "OPENAI_API_KEY"),
        "groq": ("groq/llama-3.1-8b-instant", "GROQ_API_KEY"),
        "gemini": ("gemini/gemini-1.5-flash", "GEMINI_API_KEY")
    }

    if provider not in provider_map:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}. Supported: anthropic, openai, groq, gemini")

    model_name, key_name = provider_map[provider]
    active_key = req.key.strip() if req.key and req.key.strip() else get_setting(key_name)

    if not active_key:
        return {
            "success": False,
            "error": f"No API key provided or configured for {provider.capitalize()}"
        }

    try:
        response = litellm.completion(
            model=model_name,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=1,
            api_key=active_key
        )
        return {
            "success": True,
            "message": f"{provider.capitalize()} API key verified successfully! Connected to {model_name}."
        }
    except Exception as e:
        err_str = str(e)
        # Redact any sensitive key fragments in the error message
        for part in active_key.split("-"):
            if len(part) > 6 and part in err_str:
                err_str = err_str.replace(part, "••••")
        return {
            "success": False,
            "error": f"Verification failed: {err_str[:250]}"
        }

