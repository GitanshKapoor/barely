import os
import re
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

def extract_clean_llm_error(raw_err: str) -> str:
    """Extracts human-readable message from litellm/provider exception strings."""
    if not raw_err:
        return "Unknown error occurred"
    
    # Check if there is embedded JSON in the error (e.g. Anthropic, OpenAI, LiteLLM)
    json_match = re.search(r'\{.*\}', raw_err)
    if json_match:
        try:
            parsed = json.loads(json_match.group(0))
            if isinstance(parsed, dict):
                if "error" in parsed and isinstance(parsed["error"], dict):
                    err_obj = parsed["error"]
                    msg = err_obj.get("message")
                    err_type = err_obj.get("type", "")
                    if msg:
                        prefix = f"{err_type.replace('_', ' ').title()}: " if err_type else ""
                        return f"{prefix}{msg}"
                elif "message" in parsed:
                    return str(parsed["message"])
        except Exception:
            pass

    # Strip verbose exception class prefixes
    cleaned = re.sub(r'^(litellm\.[a-zA-Z0-9_.]+:|Exception:|\w+Exception:)\s*', '', raw_err).strip()
    cleaned = re.sub(r',\s*request_id:.*$', '', cleaned).strip()
    return cleaned or raw_err

app = FastAPI(title="Barely Control Plane API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(report_router)

@app.get("/health")
@app.get("/healthz")
@app.get("/")
def health_check():
    return {"status": "ok", "timestamp": datetime.datetime.utcnow().isoformat()}

class RunRequest(BaseModel):
    url: str
    name: str = ""
    goal_text: str
    device: str = "desktop"
    strict_mode: bool = False
    use_cache: bool = False
    model: Optional[str] = None
    tags: Optional[List[str]] = []
    isolated_env: Optional[bool] = None
    create_jira_ticket: Optional[bool] = None
    notification_channel: Optional[str] = None
    context: Optional[str] = None

@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/api/runs")
def list_runs():
    from barely_core.k8s.spawner import drain_queued_runs
    db = SessionLocal()
    try:
        try:
            drain_queued_runs(db)
        except Exception:
            pass
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
                "model": getattr(r, "model", None) or "anthropic/claude-3-7-sonnet",
                "tags": [t for t in r.tags.split(",") if t] if r.tags else [],
                "jira_issue_key": getattr(r, "jira_issue_key", None),
                "jira_issue_url": getattr(r, "jira_issue_url", None),
                "create_jira_ticket": (
                    r.create_jira_ticket
                    if getattr(r, "create_jira_ticket", None) is not None
                    else (get_setting("JIRA_AUTO_CREATE") or "").strip().lower() in ("true", "1", "yes")
                ),
                "notification_channel": getattr(r, "notification_channel", None),
                "isolated_env": bool(getattr(r, "isolated_env", False)),
                "runner_pod": getattr(r, "runner_pod", None),
                "context": getattr(r, "context", None),
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
            "model": getattr(r, "model", None) or "anthropic/claude-3-7-sonnet",
            "tags": [t for t in r.tags.split(",") if t] if r.tags else [],
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "logs": r.logs or "",
            "jira_issue_key": getattr(r, "jira_issue_key", None),
            "jira_issue_url": getattr(r, "jira_issue_url", None),
            "create_jira_ticket": (
                r.create_jira_ticket
                if getattr(r, "create_jira_ticket", None) is not None
                else (get_setting("JIRA_AUTO_CREATE") or "").strip().lower() in ("true", "1", "yes")
            ),
            "notification_channel": getattr(r, "notification_channel", None),
            "isolated_env": bool(getattr(r, "isolated_env", False)),
            "runner_pod": getattr(r, "runner_pod", None),
            "context": getattr(r, "context", None),
            "steps": [{"description": s.description, "thought": s.thought, "screenshot": s.screenshot_base64} for s in steps]
        }
    finally:
        db.close()

@app.get("/api/models")
def get_models():
    from barely_core.settings import list_supported_models
    return list_supported_models()

@app.post("/api/runs/{run_id}/cancel")
def cancel_run(run_id: str):
    from barely_core.k8s.spawner import drain_queued_runs
    db = SessionLocal()
    try:
        r = db.query(RunRecord).filter(RunRecord.id == run_id).first()
        if not r:
            raise HTTPException(status_code=404, detail="Run not found")
        if r.status in ["completed", "cancelled"]:
            return {"message": f"Run is already {r.status}", "status": r.status}
        
        was_isolated = bool(r.isolated_env)
        r.status = "cancelled"
        r.success = False
        r.failure_reason = "Cancelled by user"
        r.logs = (r.logs or "") + f"[{datetime.datetime.now().strftime('%H:%M:%S')}] 🛑 Run cancelled via API.\n"
        db.commit()

        # If an isolated run slot was freed, auto-drain queued runs
        if was_isolated:
            try:
                drain_queued_runs(db)
            except Exception as de:
                logger.error(f"Error auto-draining queue on run cancellation: {de}")

        return {"message": "Run cancelled successfully", "status": "cancelled"}
    finally:
        db.close()

@app.post("/api/runs")
def trigger_run(req: RunRequest):
    from barely_core.settings import get_setting
    from barely_core.k8s.spawner import K8sJobSpawner, can_spawn_runner

    job_id = f"job_{uuid.uuid4().hex[:8]}"
    tag_str = ",".join([t.strip().lstrip("#") for t in (req.tags or []) if t.strip()]) if req.tags else None
    
    # Determine execution mode: request-level override or platform global default
    global_mode = (get_setting("EXECUTION_MODE") or "worker_pool").strip().lower()
    if req.isolated_env is not None:
        should_isolate = bool(req.isolated_env)
    else:
        should_isolate = (global_mode == "k8s_job")

    now_str = datetime.datetime.now().strftime("%H:%M:%S")
    initial_logs = ""
    runner_pod_name = None
    initial_status = "pending"

    if should_isolate:
        spawner = K8sJobSpawner()
        if spawner.is_available:
            can_spawn, active_pods, max_pods = can_spawn_runner()
            if can_spawn:
                ok, job_name, err = spawner.spawn_job(job_id)
                if ok:
                    runner_pod_name = job_name
                    initial_status = "pending"
                    initial_logs = (
                        f"[{now_str}] 🛡️ Ephemeral Pod Dispatched: Kubernetes Job '{job_name}' spawned in namespace '{spawner._namespace}' "
                        f"(Active slots: {active_pods + 1}/{max_pods} - Helm values.yaml).\n"
                        f"[{now_str}] 🔒 Security Hardening: Non-Root UID 10001, GID 10001, allowPrivilegeEscalation: false, capabilities: drop: ['ALL'], /dev/shm 1Gi.\n"
                    )
                else:
                    initial_logs = f"[{now_str}] ⚠️ Kubernetes Job Spawner notice: {err}. Falling back to persistent worker pool.\n"
                    should_isolate = False
            else:
                # Concurrency cap reached! Queue the run
                initial_status = "queued"
                runner_pod_name = None
                initial_logs = (
                    f"[{now_str}] ⏳ Concurrency Cap Reached: All {active_pods}/{max_pods} runner pod slots in use (configured via Helm execution.maxParallelPods).\n"
                    f"[{now_str}] 📋 Run queued. Will automatically spawn as soon as an active pod finishes execution.\n"
                )
        else:
            initial_logs = f"[{now_str}] ℹ️ Running outside Kubernetes cluster. Executing run on persistent worker pool.\n"
            should_isolate = False

    active_model = req.model.strip() if req.model and req.model.strip() else (get_setting("DEFAULT_MODEL") or "anthropic/claude-3-7-sonnet")
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
            model=active_model,
            tags=tag_str,
            status=initial_status,
            isolated_env=should_isolate,
            runner_pod=runner_pod_name,
            create_jira_ticket=req.create_jira_ticket,
            notification_channel=req.notification_channel.strip().lower() if req.notification_channel else None,
            context=req.context.strip() if req.context and req.context.strip() else None,
            logs=initial_logs or None
        )
        db.add(new_run)
        db.commit()
    finally:
        db.close()
        
    return {
        "message": "Job queued successfully",
        "job_id": job_id,
        "isolated_env": should_isolate,
        "runner_pod": runner_pod_name
    }

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
    model: Optional[str] = None

def get_storage_target_info():
    """Classifies database & storage target at a high level (Docker vs GCP vs AWS vs Azure) with ZERO credential leakage."""
    import os
    from urllib.parse import urlparse

    db_url = os.getenv("DATABASE_URL", "")
    storage_provider_env = (os.getenv("STORAGE_PROVIDER") or "").lower()
    aws_region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")
    s3_bucket = os.getenv("S3_BUCKET") or os.getenv("AWS_S3_BUCKET")

    provider_name = "Docker (Local)"
    storage_type = "docker"
    subtext = "Local PostgreSQL container on docker-compose network"
    chip = "Docker Volume (barely_pgdata)"

    if storage_provider_env == "gcp" or "cloudsql" in db_url or "googleapis.com" in db_url:
        provider_name = "GCP Cloud SQL"
        storage_type = "gcp"
        subtext = "State storage connected to Google Cloud SQL (Private VNet)"
        chip = "PostgreSQL 15 (TLS)"
    elif storage_provider_env == "aws" or s3_bucket or "rds.amazonaws.com" in db_url or "aurora.amazonaws.com" in db_url or (aws_region and "amazonaws" in db_url):
        provider_name = "AWS RDS"
        storage_type = "aws"
        subtext = "State storage connected to AWS RDS / Aurora Cluster"
        chip = "PostgreSQL 15 (TLS)"
    elif storage_provider_env == "azure" or "postgres.database.azure.com" in db_url:
        provider_name = "Azure PostgreSQL"
        storage_type = "azure"
        subtext = "State storage connected to Azure Database for PostgreSQL"
        chip = "PostgreSQL 15 (TLS)"
    elif "neon.tech" in db_url:
        provider_name = "Neon Cloud"
        storage_type = "neon"
        subtext = "State storage connected to Neon Serverless PostgreSQL"
        chip = "PostgreSQL 15 (TLS)"
    elif "supabase.co" in db_url:
        provider_name = "Supabase"
        storage_type = "supabase"
        subtext = "State storage connected to Supabase PostgreSQL"
        chip = "PostgreSQL 15 (TLS)"
    elif db_url:
        try:
            parsed = urlparse(db_url)
            host = (parsed.hostname or "").lower()
            if host in ("barely-db", "localhost", "127.0.0.1", "postgres", "db"):
                provider_name = "Docker (Local)"
                storage_type = "docker"
                subtext = "Local PostgreSQL container on docker-compose network"
                chip = "Docker Volume (barely_pgdata)"
            else:
                provider_name = "Managed Cloud DB"
                storage_type = "cloud"
                subtext = "State storage connected to managed PostgreSQL cluster"
                chip = "PostgreSQL 15 (TLS)"
        except Exception:
            pass

    return {
        "provider_name": provider_name,
        "storage_type": storage_type,
        "subtext": subtext,
        "chip": chip,
        "engine": "PostgreSQL 15"
    }

@app.get("/api/settings")
def get_settings():
    from barely_core.settings import list_settings_status, get_deployment_mode
    from barely_core.k8s.spawner import get_execution_engine_status
    from barely_core.db import engine
    from sqlalchemy import text

    settings_list = list_settings_status()
    deployment_info = get_deployment_mode()

    # Minimal connection status check — zero leakage of credentials, URLs, or hostnames
    is_connected = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1;"))
            is_connected = True
    except Exception:
        is_connected = False

    storage_info = get_storage_target_info()

    return {
        "settings": settings_list,
        "database": {
            "is_connected": is_connected,
            **storage_info
        },
        "deployment": deployment_info,
        "execution_engine": get_execution_engine_status()
    }

class SetSecretsModeRequest(BaseModel):
    mode: str

@app.post("/api/settings/mode")
def update_secrets_mode(req: SetSecretsModeRequest):
    from barely_core.settings import set_secrets_mode
    try:
        updated_mode = set_secrets_mode(req.mode)
        return {
            "success": True,
            "message": f"Secrets management mode updated to '{req.mode.upper()}'",
            "secrets_mode": updated_mode
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

class SetExecutionEngineRequest(BaseModel):
    mode: str
    max_parallel_pods: Optional[int] = 5

@app.get("/api/execution-engine")
def get_execution_engine():
    from barely_core.k8s.spawner import get_execution_engine_status
    return get_execution_engine_status()

@app.post("/api/execution-engine/mode")
def update_execution_engine(req: SetExecutionEngineRequest):
    from barely_core.settings import set_setting
    from barely_core.k8s.spawner import get_execution_engine_status
    
    mode_clean = req.mode.strip().lower()
    if mode_clean not in ("worker_pool", "k8s_job"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid execution mode '{req.mode}'. Must be 'worker_pool' or 'k8s_job'."
        )
    
    set_setting("EXECUTION_MODE", mode_clean)
    if req.max_parallel_pods is not None and req.max_parallel_pods > 0:
        set_setting("MAX_PARALLEL_PODS", str(req.max_parallel_pods))
        
    return {
        "success": True,
        "message": f"Execution engine updated to '{mode_clean}'",
        "engine": get_execution_engine_status()
    }

@app.post("/api/settings")
def save_setting(req: SaveSettingRequest):
    from barely_core.settings import set_setting, read_k8s_secret_file, get_secrets_mode
    if not req.key or not req.key.strip():
        raise HTTPException(status_code=400, detail="Key cannot be empty")
    
    key_clean = req.key.strip()

    # Priority infrastructure locks:
    # 1. Kubernetes Secret Volume file mount (Helm/ESO)
    if read_k8s_secret_file(key_clean):
        raise HTTPException(
            status_code=403, 
            detail=f"Setting '{key_clean}' is mounted via Kubernetes Secret volume and locked against UI modifications."
        )

    # 2. Maximum pod concurrency is strictly infrastructure-managed
    if key_clean == "MAX_PARALLEL_PODS":
        raise HTTPException(
            status_code=403,
            detail="MAX_PARALLEL_PODS is an infrastructure capacity constraint managed via Helm values or Environment."
        )

    # 3. Helm mode active for secret credentials
    secrets_mode = get_secrets_mode()
    if secrets_mode["mode"] == "helm" and key_clean in [
        "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY",
        "JIRA_API_TOKEN", "SLACK_WEBHOOK_URL", "TEAMS_WEBHOOK_URL"
    ]:
        raise HTTPException(
            status_code=403,
            detail=f"Helm / GitOps Mode is active. Secret '{key_clean}' must be configured via Helm values or Kubernetes Secret."
        )
        
    set_setting(key_clean, req.value)
    
    # Invalidate model discovery cache if an LLM key changed
    llm_key_map = {
        "ANTHROPIC_API_KEY": "anthropic",
        "GROQ_API_KEY": "groq",
        "OPENAI_API_KEY": "openai",
        "GEMINI_API_KEY": "gemini"
    }
    if key_clean in llm_key_map:
        from barely_core.models_provider import invalidate_models_cache
        invalidate_models_cache(llm_key_map[key_clean])

    return {"message": f"Setting '{key_clean}' updated successfully", "key": key_clean}

@app.delete("/api/settings/{key}")
def remove_setting(key: str):
    from barely_core.settings import delete_setting, read_k8s_secret_file
    
    key_clean = key.strip()
    if read_k8s_secret_file(key_clean):
        raise HTTPException(
            status_code=403,
            detail=f"Cannot delete setting '{key_clean}': mounted via Kubernetes Secret volume."
        )

    deleted = delete_setting(key_clean)
    if not deleted and key_clean != "DEFAULT_MODEL":
        return {"message": f"Setting '{key_clean}' was not found", "deleted": False}

    llm_key_map = {
        "ANTHROPIC_API_KEY": "anthropic",
        "GROQ_API_KEY": "groq",
        "OPENAI_API_KEY": "openai",
        "GEMINI_API_KEY": "gemini"
    }
    if key_clean in llm_key_map:
        from barely_core.models_provider import invalidate_models_cache
        invalidate_models_cache(llm_key_map[key_clean])

    if key_clean == "DEFAULT_MODEL":
        from barely_core.models_provider import invalidate_models_cache
        invalidate_models_cache()

    friendly_names = {
        "ANTHROPIC_API_KEY": "Anthropic API key",
        "GROQ_API_KEY": "Groq API key",
        "OPENAI_API_KEY": "OpenAI API key",
        "GEMINI_API_KEY": "Google Gemini API key",
        "DEFAULT_MODEL": "Default model configuration",
    }
    label = friendly_names.get(key_clean, f"Setting '{key_clean}'")
    return {"message": f"{label} deleted successfully", "deleted": True}

@app.post("/api/settings/test-key")
def test_key(req: TestKeyRequest):
    import litellm
    litellm.drop_params = True
    from barely_core.settings import get_setting
    provider = req.provider.lower()
    
    # Map provider to lightweight test model and environment key name
    provider_map = {
        "anthropic": (
            [
                "anthropic/claude-3-7-sonnet",
                "anthropic/claude-3-5-sonnet-20241022",
                "anthropic/claude-3-5-haiku-20241022",
                "claude-3-7-sonnet",
                "claude-3-5-sonnet"
            ],
            "ANTHROPIC_API_KEY"
        ),
        "openai": (
            ["gpt-4o-mini", "gpt-4o", "openai/gpt-4o-mini", "openai/gpt-4o"],
            "OPENAI_API_KEY"
        ),
        "groq": (
            [
                "groq/llama-3.3-70b-versatile",
                "llama-3.3-70b-versatile",
                "groq/llama-3.1-8b-instant",
                "llama-3.1-8b-instant",
                "groq/deepseek-r1-distill-llama-70b"
            ],
            "GROQ_API_KEY"
        ),
        "gemini": (
            ["gemini/gemini-2.0-flash", "gemini/gemini-1.5-flash", "gemini/gemini-1.5-pro"],
            "GEMINI_API_KEY"
        )
    }

    if provider not in provider_map:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}. Supported: anthropic, openai, groq, gemini")

    candidate_models, key_name = provider_map[provider]
    active_key = req.key.strip() if req.key and req.key.strip() else get_setting(key_name)

    if not active_key:
        return {
            "success": False,
            "error": f"No API key provided or configured for {provider.capitalize()}"
        }

    # Prepend requested model or configured default model if applicable
    models_to_try = []
    if req.model and req.model.strip():
        m_req = req.model.strip()
        models_to_try.append(m_req)
        if "/" in m_req:
            models_to_try.append(m_req.split("/", 1)[1])
        else:
            models_to_try.append(f"{provider}/{m_req}")

    for m in candidate_models:
        if m not in models_to_try:
            models_to_try.append(m)

    last_error_message = None
    if provider == "groq" and active_key:
        os.environ["GROQ_API_KEY"] = active_key

    for model_name in models_to_try:
        try:
            response = litellm.completion(
                model=model_name,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=16 if provider == "groq" else 1,
                drop_params=True,
                api_key=active_key
            )
            return {
                "success": True,
                "message": f"{provider.capitalize()} API key verified successfully! Connected to {model_name}."
            }
        except Exception as e:
            err_str = str(e)
            last_error_message = err_str
            err_lower = err_str.lower()
            # If genuine authentication failure (401, invalid key), stop trying immediately
            if "invalid_api_key" in err_lower or "invalid api key" in err_lower or "401" in err_lower or "unauthorized" in err_lower:
                break

            # Secondary attempt for Groq via OpenAI-compatible endpoint
            if provider == "groq" and active_key:
                try:
                    clean_m = model_name.replace("groq/", "")
                    litellm.completion(
                        model=f"openai/{clean_m}",
                        api_base="https://api.groq.com/openai/v1",
                        messages=[{"role": "user", "content": "ping"}],
                        max_tokens=16,
                        drop_params=True,
                        api_key=active_key
                    )
                    return {
                        "success": True,
                        "message": f"Groq API key verified successfully via Groq LPU (model: {clean_m})!"
                    }
                except Exception as groq_e:
                    last_error_message = str(groq_e)

            # Otherwise (model mismatch, decommissioned, not found, rate limit on specific model), continue trying candidate models
            continue

    # Fallback verification: Check directly against provider's models endpoint
    # If the provider's models endpoint returns 200 OK, the key is 100% valid!
    if "401" not in (last_error_message or "").lower() and "invalid_api_key" not in (last_error_message or "").lower() and "unauthorized" not in (last_error_message or "").lower():
        try:
            from barely_core.models_provider import (
                fetch_groq_models,
                fetch_anthropic_models,
                fetch_openai_models,
                fetch_gemini_models
            )
            live_models = []
            if provider == "groq":
                live_models = fetch_groq_models(active_key)
            elif provider == "anthropic":
                live_models = fetch_anthropic_models(active_key)
            elif provider == "openai":
                live_models = fetch_openai_models(active_key)
            elif provider == "gemini":
                live_models = fetch_gemini_models(active_key)

            if live_models:
                first_model = live_models[0]["name"]
                return {
                    "success": True,
                    "message": f"{provider.capitalize()} API key verified successfully via live API! Discovered {len(live_models)} active models (e.g. {first_model})."
                }
        except Exception as probe_err:
            logger.debug(f"Direct {provider} probe fallback error: {probe_err}")

    err_display = extract_clean_llm_error(last_error_message or "Unknown verification failure")
    if active_key:
        for part in active_key.split("-"):
            if len(part) > 6 and part in err_display:
                err_display = err_display.replace(part, "••••")

    return {
        "success": False,
        "error": f"Verification failed: {err_display}"
    }

class TestModelRequest(BaseModel):
    model: str
    api_key: Optional[str] = None

@app.post("/api/settings/test-model")
def test_model(req: TestModelRequest):
    import litellm
    litellm.drop_params = True
    from barely_core.settings import resolve_model_api_key, get_setting
    
    target_model = req.model.strip() if req.model else ""
    if not target_model:
        raise HTTPException(status_code=400, detail="Model name cannot be empty")

    m_lower = target_model.lower()
    is_groq = "groq" in m_lower or "llama" in m_lower or "mixtral" in m_lower or "deepseek" in m_lower

    # Auto-prefix groq if omitted (e.g. 'llama-3.3-70b-versatile')
    if is_groq and not m_lower.startswith("openai/") and not m_lower.startswith("anthropic/") and not m_lower.startswith("gemini/"):
        if not target_model.startswith("groq/"):
            target_model = f"groq/{target_model}"

    active_key = req.api_key.strip() if req.api_key and req.api_key.strip() else resolve_model_api_key(target_model)
    if not active_key and is_groq:
        active_key = get_setting("GROQ_API_KEY")

    if not active_key:
        provider_name = "Groq" if is_groq else ("Anthropic" if "claude" in m_lower else ("OpenAI" if "gpt" in m_lower else "Provider"))
        return {
            "success": False,
            "error": f"No API key configured for {provider_name}. Please configure your API key in Section 1 first."
        }

    # If Groq, export GROQ_API_KEY into os.environ for underlying SDK compatibility
    if is_groq and active_key:
        os.environ["GROQ_API_KEY"] = active_key

    # For Groq, avoid max_tokens=1 which is rejected with a 400 Bad Request by Groq's API
    token_limit = 16 if is_groq else 1

    last_error = None
    # 1. Primary invocation attempt via litellm.completion
    try:
        kwargs = {
            "model": target_model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": token_limit,
            "drop_params": True,
            "api_key": active_key
        }
        litellm.completion(**kwargs)
        return {
            "success": True,
            "message": f"Verified '{target_model}' successfully (1-token test passed)!"
        }
    except Exception as e:
        last_error = str(e)
        logger.warning(f"Initial test_model failure for {target_model}: {e}")

    # 2. For Groq: secondary invocation attempt via Groq's official OpenAI-compatible endpoint
    if is_groq and active_key:
        clean_model = target_model.replace("groq/", "")
        try:
            kwargs = {
                "model": f"openai/{clean_model}",
                "api_base": "https://api.groq.com/openai/v1",
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 16,
                "drop_params": True,
                "api_key": active_key
            }
            litellm.completion(**kwargs)
            return {
                "success": True,
                "message": f"Verified '{target_model}' successfully on Groq LPU!"
            }
        except Exception as e2:
            last_error = str(e2)
            logger.warning(f"Secondary OpenAI-compatible test_model failure for {target_model}: {e2}")

        # 3. Fallback: verify via direct Groq models API probe
        err_lower = (last_error or "").lower()
        if "401" not in err_lower and "invalid_api_key" not in err_lower and "unauthorized" not in err_lower:
            try:
                from barely_core.models_provider import fetch_groq_models
                live_models = fetch_groq_models(active_key)
                if live_models:
                    model_ids = [m["id"].replace("groq/", "") for m in live_models]
                    if clean_model in model_ids or any(clean_model in mid for mid in model_ids):
                        return {
                            "success": True,
                            "message": f"Verified '{target_model}' successfully! Model is active on your Groq account."
                        }
                    else:
                        active_names = ", ".join(m["name"] for m in live_models[:4])
                        return {
                            "success": False,
                            "error": f"Model '{clean_model}' is not active on Groq. Active models include: {active_names}."
                        }
            except Exception as probe_err:
                logger.debug(f"Direct Groq probe fallback error: {probe_err}")

    clean_msg = extract_clean_llm_error(last_error or "Model verification failed")
    if active_key:
        for part in active_key.split("-"):
            if len(part) > 6 and part in clean_msg:
                clean_msg = clean_msg.replace(part, "••••")
    return {
        "success": False,
        "error": clean_msg
    }

# -------------------------------------------------------------
# Enterprise Jira & Incident Integration Endpoints
# -------------------------------------------------------------

class CreateJiraIssueRequest(BaseModel):
    issue_type: Optional[str] = None
    summary: Optional[str] = None

@app.post("/api/runs/{run_id}/jira")
def create_run_jira_issue(run_id: str, req: Optional[CreateJiraIssueRequest] = None):
    """
    1-Click Manual Jira Ticket Creation from Run Details page.
    Generates an ADF reproduction report and creates a ticket in Atlassian Jira Cloud.
    """
    from barely_core.db import RunStep
    from barely_core.integrations.jira import JiraClient
    
    db = SessionLocal()
    try:
        r = db.query(RunRecord).filter(RunRecord.id == run_id).first()
        if not r:
            raise HTTPException(status_code=404, detail="Run not found")
            
        if r.jira_issue_key and r.jira_issue_url:
            return {
                "success": True,
                "issue_key": r.jira_issue_key,
                "issue_url": r.jira_issue_url,
                "message": f"Jira ticket {r.jira_issue_key} already exists for this run."
            }
            
        steps = db.query(RunStep).filter(RunStep.run_id == run_id).order_by(RunStep.step_index.asc()).all()
        run_data = {
            "id": r.id,
            "name": (req.summary if req and req.summary else None) or r.name or r.id,
            "start_url": r.start_url or "",
            "device": r.device or "desktop",
            "status": r.status or "completed",
            "success": r.success,
            "failure_reason": r.failure_reason or "Manual failure ticket created from Barely UI",
            "model": getattr(r, "model", None) or "Claude Sonnet",
            "steps": [{"description": s.description, "thought": s.thought} for s in steps]
        }
        
        jira_client = JiraClient()
        if not jira_client.is_configured:
            raise HTTPException(
                status_code=400,
                detail="Jira is not fully configured. Please configure your Jira Cloud Domain, Email, API Token, and Project Key in Settings."
            )
            
        custom_issue_type = req.issue_type if req and req.issue_type else None
        success, issue_key, issue_url, error = jira_client.create_issue(run_data, issue_type=custom_issue_type)
        if not success or not issue_key:
            raise HTTPException(status_code=400, detail=error or "Failed to create Jira issue.")
            
        r.jira_issue_key = issue_key
        r.jira_issue_url = issue_url
        db.commit()
        
        return {
            "success": True,
            "issue_key": issue_key,
            "issue_url": issue_url,
            "message": f"Created Jira ticket {issue_key} successfully!"
        }
    finally:
        db.close()

class SaveIntegrationsRequest(BaseModel):
    jira_host: Optional[str] = None
    jira_email: Optional[str] = None
    jira_api_token: Optional[str] = None
    jira_project_key: Optional[str] = None
    jira_issue_type: Optional[str] = None
    jira_auto_create: Optional[bool] = None
    slack_webhook_url: Optional[str] = None
    slack_notify_on: Optional[str] = None
    teams_webhook_url: Optional[str] = None
    teams_notify_on: Optional[str] = None
    default_notification_mechanism: Optional[str] = None

@app.get("/api/integrations")
def get_integrations():
    """Returns the status and configuration for Jira, Slack, and Teams without leaking credentials."""
    from barely_core.settings import get_integrations_summary, get_secrets_mode
    return {
        "integrations": get_integrations_summary(),
        "secrets_mode": get_secrets_mode()
    }

@app.post("/api/integrations")
def save_integrations(req: SaveIntegrationsRequest):
    """
    Saves enterprise integration settings with AES-256 encryption-at-rest for tokens and webhooks.
    Enforces GitOps/Helm locks when Helm mode is active.
    """
    from barely_core.settings import set_setting, get_secrets_mode, get_integrations_summary
    
    secrets_mode = get_secrets_mode()
    is_helm_mode = secrets_mode["mode"] == "helm"
    
    # Check if attempting to modify secret credentials in Helm mode
    has_secret_edits = any([
        req.jira_api_token is not None and req.jira_api_token.strip(),
        req.slack_webhook_url is not None and req.slack_webhook_url.strip(),
        req.teams_webhook_url is not None and req.teams_webhook_url.strip(),
    ])
    if is_helm_mode and has_secret_edits:
        raise HTTPException(
            status_code=403,
            detail="Helm / GitOps Mode is active. Secret credentials must be configured via Helm values or Kubernetes Secret."
        )

    # Save Jira settings
    if req.jira_host is not None:
        set_setting("JIRA_HOST", req.jira_host.strip(), is_secret=False)
    if req.jira_email is not None:
        set_setting("JIRA_EMAIL", req.jira_email.strip(), is_secret=False)
    if req.jira_api_token is not None and req.jira_api_token.strip():
        set_setting("JIRA_API_TOKEN", req.jira_api_token.strip(), is_secret=True)
    if req.jira_project_key is not None:
        set_setting("JIRA_PROJECT_KEY", req.jira_project_key.strip().upper(), is_secret=False)
    if req.jira_issue_type is not None:
        set_setting("JIRA_ISSUE_TYPE", req.jira_issue_type.strip(), is_secret=False)
    if req.jira_auto_create is not None:
        set_setting("JIRA_AUTO_CREATE", "true" if req.jira_auto_create else "false", is_secret=False)

    # Save Slack settings
    if req.slack_webhook_url is not None and req.slack_webhook_url.strip():
        set_setting("SLACK_WEBHOOK_URL", req.slack_webhook_url.strip(), is_secret=True)
    if req.slack_notify_on is not None:
        set_setting("SLACK_NOTIFY_ON", req.slack_notify_on.strip(), is_secret=False)

    # Save Teams settings
    if req.teams_webhook_url is not None and req.teams_webhook_url.strip():
        set_setting("TEAMS_WEBHOOK_URL", req.teams_webhook_url.strip(), is_secret=True)
    if req.teams_notify_on is not None:
        set_setting("TEAMS_NOTIFY_ON", req.teams_notify_on.strip(), is_secret=False)

    # Save General Notification settings
    if req.default_notification_mechanism is not None:
        set_setting("DEFAULT_NOTIFICATION_MECHANISM", req.default_notification_mechanism.strip().lower(), is_secret=False)

    return {
        "success": True,
        "message": "Enterprise integration settings updated successfully!",
        "integrations": get_integrations_summary()
    }

class TestIntegrationRequest(BaseModel):
    provider: str
    jira_host: Optional[str] = None
    jira_email: Optional[str] = None
    jira_api_token: Optional[str] = None
    jira_project_key: Optional[str] = None
    slack_webhook_url: Optional[str] = None
    teams_webhook_url: Optional[str] = None

@app.post("/api/integrations/test")
def test_integration(req: TestIntegrationRequest):
    """Verifies credentials and connectivity for Jira, Slack, or Teams."""
    provider = req.provider.strip().lower()
    
    if provider == "jira":
        from barely_core.integrations.jira import JiraClient
        client = JiraClient()
        success, message = client.test_connection(
            host=req.jira_host,
            email=req.jira_email,
            api_token=req.jira_api_token,
            project_key=req.jira_project_key
        )
        return {"success": success, "message": message}
        
    elif provider == "slack":
        from barely_core.integrations.slack import SlackClient
        client = SlackClient()
        success, message = client.test_connection(webhook_url=req.slack_webhook_url)
        return {"success": success, "message": message}
        
    elif provider in ("teams", "ms_teams"):
        from barely_core.integrations.teams import TeamsClient
        client = TeamsClient()
        success, message = client.test_connection(webhook_url=req.teams_webhook_url)
        return {"success": success, "message": message}
        
    else:
        raise HTTPException(status_code=400, detail=f"Unknown provider '{provider}'. Must be 'jira', 'slack', or 'teams'.")

@app.delete("/api/integrations/{provider}")
def delete_integration(provider: str):
    """
    Deletes enterprise integration configuration for Slack, Teams, or Jira.
    Reverts status to unconfigured and wipes encrypted webhooks/tokens from the database.
    Enforces GitOps/Helm mode protection if active.
    """
    from barely_core.settings import delete_setting, get_setting, set_setting, get_secrets_mode, get_integrations_summary
    
    secrets_mode = get_secrets_mode()
    is_helm_mode = secrets_mode["mode"] == "helm"
    
    if is_helm_mode:
        raise HTTPException(
            status_code=403,
            detail="Helm / GitOps Mode is active. Integrations managed via Kubernetes Secret cannot be deleted from the UI."
        )
        
    p = provider.strip().lower()
    if p == "slack":
        delete_setting("SLACK_WEBHOOK_URL")
        delete_setting("SLACK_NOTIFY_ON")
        curr_mech = (get_setting("DEFAULT_NOTIFICATION_MECHANISM") or "both").strip().lower()
        if curr_mech in ("slack", "both"):
            teams_url = get_setting("TEAMS_WEBHOOK_URL")
            set_setting("DEFAULT_NOTIFICATION_MECHANISM", "teams" if teams_url else "none", is_secret=False)
    elif p in ("teams", "ms_teams"):
        delete_setting("TEAMS_WEBHOOK_URL")
        delete_setting("TEAMS_NOTIFY_ON")
        curr_mech = (get_setting("DEFAULT_NOTIFICATION_MECHANISM") or "both").strip().lower()
        if curr_mech in ("teams", "both"):
            slack_url = get_setting("SLACK_WEBHOOK_URL")
            set_setting("DEFAULT_NOTIFICATION_MECHANISM", "slack" if slack_url else "none", is_secret=False)
    elif p == "jira":
        delete_setting("JIRA_HOST")
        delete_setting("JIRA_EMAIL")
        delete_setting("JIRA_API_TOKEN")
        delete_setting("JIRA_PROJECT_KEY")
        delete_setting("JIRA_ISSUE_TYPE")
        delete_setting("JIRA_AUTO_CREATE")
    else:
        raise HTTPException(status_code=400, detail=f"Unknown integration provider '{provider}'. Must be 'slack', 'teams', or 'jira'.")

    return {
        "success": True,
        "message": f"{p.capitalize()} integration removed successfully.",
        "integrations": get_integrations_summary()
    }


