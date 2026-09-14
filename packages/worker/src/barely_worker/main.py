import time
import logging
import os
from barely_core.browser.engine import BrowserEngine
from barely_core.agent.loop import AgentLoop
from barely_core.db import SessionLocal, RunRecord, init_db
from barely_core.parser.goal_parser import Goal

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("barely_worker")

def process_job(run_id: str, goal_text: str, start_url: str, device: str):
    try:
        logger.info(f"Picked up job: {run_id} targeting {start_url}")
        
        # We manually construct a Goal object since we don't have markdown files anymore
        parsed_goal = Goal(
            name=f"Run {run_id}",
            description=goal_text,
            start_url=start_url,
            steps=[]
        )
        
        is_headless = os.getenv("HEADLESS", "true").lower() == "true"
        
        engine = BrowserEngine(headless=is_headless, device=device)
        agent = AgentLoop(engine=engine, model="anthropic/claude-sonnet-4-5", run_id=run_id)
        
        logger.info(f"Executing goal: {run_id}")
        agent.run(parsed_goal, start_url=start_url)
        logger.info(f"Job {run_id} completed successfully.")
        
    except Exception as e:
        logger.error(f"Job {run_id} failed: {e}")

def start_worker():
    init_db()
    logger.info("Barely Worker Node started. Polling DB for jobs...")
    
    while True:
        db = SessionLocal()
        try:
            job = db.query(RunRecord).filter(RunRecord.status == "pending").order_by(RunRecord.created_at.asc()).first()
            if job:
                # Lock the job
                job.status = "running"
                db.commit()
                run_id = job.id
                goal_text = job.goal
                start_url = job.start_url
                device = job.device
                db.close()
                
                process_job(run_id, goal_text, start_url, device)
            else:
                db.close()
                time.sleep(2)
        except Exception as e:
            logger.error(f"DB Polling error: {e}")
            db.close()
            time.sleep(5)

if __name__ == "__main__":
    start_worker()
