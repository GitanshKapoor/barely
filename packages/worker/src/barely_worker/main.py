import time
import logging
import os
import litellm
# Automatically drop unsupported parameters (e.g. temperature=0.0 on reasoning models) across worker runs
litellm.drop_params = True

from barely_core.browser.engine import BrowserEngine
from barely_core.agent.loop import AgentLoop
from barely_core.db import SessionLocal, RunRecord, init_db
from barely_core.parser.goal_parser import Goal

from typing import Optional
from barely_core.settings import get_setting

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("barely_worker")

def process_job(run_id: str, test_name: str, goal_text: str, start_url: str, device: str, strict_mode: bool = False, use_cache: bool = False, model: Optional[str] = None, context: Optional[str] = None):
    try:
        active_model = model or get_setting("DEFAULT_MODEL") or "anthropic/claude-3-7-sonnet"

        # Validate that the active model has a configured API key, otherwise auto-fallback to a configured provider
        from barely_core.settings import resolve_model_api_key, get_model_provider
        resolved_key = resolve_model_api_key(active_model)
        if not resolved_key:
            fallback_candidates = [
                ("anthropic", "anthropic/claude-3-7-sonnet", "ANTHROPIC_API_KEY"),
                ("openai", "openai/gpt-4o", "OPENAI_API_KEY"),
                ("groq", "groq/llama-3.3-70b-versatile", "GROQ_API_KEY"),
                ("gemini", "gemini/gemini-2.0-flash", "GEMINI_API_KEY"),
            ]
            for prov, fallback_model, key_name in fallback_candidates:
                cand_key = get_setting(key_name)
                if cand_key and cand_key.strip():
                    logger.warning(
                        f"Selected model '{active_model}' has no {get_model_provider(active_model).upper()}_API_KEY configured. "
                        f"Auto-switching run {run_id} to active provider model '{fallback_model}'."
                    )
                    active_model = fallback_model
                    resolved_key = cand_key.strip()
                    break

        if not resolved_key:
            raise ValueError(
                f"No API key configured for model '{active_model}'. Please configure your {get_model_provider(active_model).upper()}_API_KEY in Settings."
            )

        logger.info(f"Picked up job: {run_id} ({test_name}) targeting {start_url} (model={active_model}, strict_mode={strict_mode}, use_cache={use_cache})")
        
        parsed_goal = Goal(
            name=test_name or "Web Test",
            raw_content=goal_text,
            context=context,
            steps=[]
        )
        
        is_headless = os.getenv("HEADLESS", "true").lower() == "true"
        
        engine = BrowserEngine(headless=is_headless, device=device, strict_mode=strict_mode)
        agent = AgentLoop(engine=engine, model=active_model, run_id=run_id, use_cache=use_cache)
        
        logger.info(f"Executing goal: {run_id}")
        agent.run(parsed_goal, start_url=start_url)
        logger.info(f"Job {run_id} completed successfully.")
        
    except Exception as e:
        logger.error(f"Job {run_id} failed: {e}")
        err_msg = str(e)
        err_lower = err_msg.lower()
        if "invalid api key" in err_lower or "invalid_api_key" in err_lower or "authenticationerror" in err_lower:
            from barely_core.settings import get_model_provider
            prov = get_model_provider(active_model).capitalize()
            failure_reason = f"{prov} Authentication Error: Invalid API key for model '{active_model}'. Please update your {prov.upper()}_API_KEY in Settings."
        elif "no api key configured" in err_lower:
            failure_reason = err_msg
        else:
            failure_reason = f"Execution Failure: {err_msg}"

        db = SessionLocal()
        try:
            run = db.query(RunRecord).filter(RunRecord.id == run_id).first()
            if run:
                run.success = False
                run.failure_reason = failure_reason
                db.commit()
        except Exception as dbe:
            logger.error(f"Failed to update job status after crash: {dbe}")
        finally:
            db.close()

        try:
            from barely_core.integrations.dispatcher import dispatch_run_notifications
            dispatch_run_notifications(run_id)
        except Exception as ne:
            logger.error(f"Failed to dispatch post-crash notifications for {run_id}: {ne}")

        db = SessionLocal()
        try:
            run = db.query(RunRecord).filter(RunRecord.id == run_id).first()
            if run and run.status != "cancelled":
                run.status = "completed"
                db.commit()
        except Exception as dbe:
            logger.error(f"Failed to mark run completed after crash: {dbe}")
        finally:
            db.close()

def run_single_job(run_id: str):
    """
    Executes a single, isolated test run and exits.
    Designed for ephemeral, non-root Kubernetes Pods (1 test run = 1 isolated Pod).
    """
    import sys
    init_db()
    logger.info(f"Barely Ephemeral Runner started for isolated job: {run_id}")

    db = SessionLocal()
    try:
        job = db.query(RunRecord).filter(RunRecord.id == run_id).first()
        if not job:
            logger.error(f"Isolated job {run_id} not found in database.")
            sys.exit(1)

        job.status = "running"
        db.commit()

        test_name = job.name or "Automated E2E Test"
        goal_text = job.goal
        start_url = job.start_url
        device = job.device or "desktop"
        strict_mode = bool(getattr(job, "strict_mode", False))
        use_cache = bool(getattr(job, "use_cache", False))
        model = getattr(job, "model", None)
        context = getattr(job, "context", None)
    finally:
        db.close()

    exit_code = 0
    try:
        process_job(run_id, test_name, goal_text, start_url, device, strict_mode, use_cache, model, context=context)
        logger.info(f"Isolated execution finished for {run_id}. Terminating ephemeral runner pod.")
    except Exception as e:
        logger.error(f"Isolated execution error for {run_id}: {e}")
        exit_code = 1
    finally:
        # A runner pod slot has now been freed; auto-drain next queued run if any exist
        try:
            from barely_core.k8s.spawner import drain_queued_runs
            drain_queued_runs()
        except Exception as qe:
            logger.debug(f"Queue drain check on runner exit: {qe}")
        sys.exit(exit_code)

def start_worker():
    init_db()
    logger.info("Barely Worker Node started. Polling DB for jobs...")
    
    while True:
        db = SessionLocal()
        try:
            job = (
                db.query(RunRecord)
                .filter(RunRecord.status == "pending")
                .filter((RunRecord.isolated_env == False) | (RunRecord.isolated_env.is_(None)))
                .order_by(RunRecord.created_at.asc())
                .with_for_update(skip_locked=True)
                .first()
            )
            if job:
                # Lock the job
                job.status = "running"
                db.commit()
                run_id = job.id
                test_name = job.name or "Automated E2E Test"
                goal_text = job.goal
                start_url = job.start_url
                device = job.device or "desktop"
                strict_mode = bool(getattr(job, "strict_mode", False))
                use_cache = bool(getattr(job, "use_cache", False))
                model = getattr(job, "model", None)
                context = getattr(job, "context", None)
                db.close()
                
                process_job(run_id, test_name, goal_text, start_url, device, strict_mode, use_cache, model, context=context)
            else:
                db.close()
                time.sleep(2)
        except Exception as e:
            logger.error(f"DB Polling error: {e}")
            db.close()
            time.sleep(5)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Barely Autonomous Test Runner")
    parser.add_argument("--single-run", dest="single_run_id", help="Execute an isolated single run and exit")
    args, _ = parser.parse_known_args()

    single_run = args.single_run_id or os.getenv("BARELY_SINGLE_RUN_ID")
    if single_run:
        run_single_job(single_run.strip())
    else:
        start_worker()
