import time
import json
import logging
import os
from pathlib import Path
from barely_core.parser.goal_parser import GoalParser
from barely_core.browser.engine import BrowserEngine
from barely_core.agent.loop import AgentLoop

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("barely_worker")

def process_job(job_file: Path):
    try:
        job = json.loads(job_file.read_text())
        logger.info(f"Picked up job: {job['job_id']} targeting {job.get('start_url')}")
        
        goal_path = Path(job["goal_file"])
        if not goal_path.exists():
            logger.error(f"Goal file {goal_path} does not exist.")
            return

        parsed_goal = GoalParser.parse(goal_path)
        
        # Read HEADLESS from environment (default to True for Docker, False for local)
        is_headless = os.getenv("HEADLESS", "true").lower() == "true"
        
        # Initialize browser
        engine = BrowserEngine(headless=is_headless)
        
        agent = AgentLoop(engine=engine, model="anthropic/claude-3-5-sonnet-20240620", run_id=job.get("job_id"))
        
        logger.info(f"Executing goal: {job['job_id']}")
        agent.run(parsed_goal, start_url=job.get("start_url", "https://google.com"))
        logger.info(f"Job {job['job_id']} completed successfully.")
        
    except Exception as e:
        logger.error(f"Job {job_file.name} failed: {e}")
        Path(f".barely/runs/{job.get('job_id')}_error.txt").write_text(str(e))
    finally:
        # Delete job from queue when done
        job_file.unlink(missing_ok=True)

from barely_core.db import init_db

def start_worker():
    init_db()
    queue_dir = Path(".barely/queue/pending")
    queue_dir.mkdir(parents=True, exist_ok=True)
    
    logger.info("Barely Worker Node started. Polling for jobs...")
    
    while True:
        jobs = list(queue_dir.glob("*.json"))
        if jobs:
            jobs.sort(key=lambda x: x.stat().st_mtime)
            process_job(jobs[0])
        else:
            time.sleep(2)

if __name__ == "__main__":
    start_worker()
