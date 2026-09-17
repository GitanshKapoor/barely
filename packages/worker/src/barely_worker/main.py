import time
import logging
import os
from barely_core.browser.engine import BrowserEngine
from barely_core.agent.loop import AgentLoop
from barely_core.db import SessionLocal, RunRecord, init_db
from barely_core.parser.goal_parser import Goal

from typing import Optional
from barely_core.settings import get_setting

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("barely_worker")

def process_job(run_id: str, test_name: str, goal_text: str, start_url: str, device: str, strict_mode: bool = False, use_cache: bool = False, model: Optional[str] = None):
    try:
        active_model = model or get_setting("DEFAULT_MODEL") or "anthropic/claude-sonnet-4-5"
        logger.info(f"Picked up job: {run_id} ({test_name}) targeting {start_url} (model={active_model}, strict_mode={strict_mode}, use_cache={use_cache})")
        
        parsed_goal = Goal(
            name=test_name or "Web Test",
            raw_content=goal_text,
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
        db = SessionLocal()
        try:
            run = db.query(RunRecord).filter(RunRecord.id == run_id).first()
            if run:
                run.status = "completed"
                run.success = False
                run.failure_reason = f"Fatal Worker Crash: {str(e)}"
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

def start_worker():
    init_db()
    logger.info("Barely Worker Node started. Polling DB for jobs...")
    
    while True:
        db = SessionLocal()
        try:
            job = (
                db.query(RunRecord)
                .filter(RunRecord.status == "pending")
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
                db.close()
                
                process_job(run_id, test_name, goal_text, start_url, device, strict_mode, use_cache, model)
            else:
                db.close()
                time.sleep(2)
        except Exception as e:
            logger.error(f"DB Polling error: {e}")
            db.close()
            time.sleep(5)

if __name__ == "__main__":
    start_worker()
