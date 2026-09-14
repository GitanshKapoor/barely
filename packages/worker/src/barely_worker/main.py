import time
import json
import logging
from pathlib import Path
from barely_core.parser.goal_parser import GoalParser
from barely_core.browser.engine import BrowserEngine
from barely_core.agent.loop import AgentLoop

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("barely_worker")

def process_job(job_file: Path):
    try:
        job = json.loads(job_file.read_text())
        logger.info(f"Picked up job: {job['job_id']}")
        
        goal_path = Path(job["goal_file"])
        if not goal_path.exists():
            logger.error(f"Goal file {goal_path} does not exist.")
            return

        parsed_goal = GoalParser.parse(goal_path)
        
        # Always run Headless on worker nodes
        engine = BrowserEngine(headless=True)
        agent = AgentLoop(engine=engine, model="groq/llama3-70b-8192")
        
        logger.info(f"Executing goal: {parsed_goal.name}")
        agent.run(parsed_goal, start_url="https://example.com")
        logger.info(f"Job {job['job_id']} completed successfully.")
        
    except Exception as e:
        logger.error(f"Job {job_file.name} failed: {e}")
    finally:
        # Delete job from queue when done
        job_file.unlink(missing_ok=True)

def start_worker():
    """Polls the queue directory for new jobs and executes them."""
    queue_dir = Path(".barely/queue/pending")
    queue_dir.mkdir(parents=True, exist_ok=True)
    
    logger.info("Barely Worker Node started. Polling for jobs...")
    
    while True:
        jobs = list(queue_dir.glob("*.json"))
        if jobs:
            # Pick the oldest job
            jobs.sort(key=lambda x: x.stat().st_mtime)
            process_job(jobs[0])
        else:
            time.sleep(2)

if __name__ == "__main__":
    start_worker()
