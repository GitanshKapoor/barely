import json
import logging
import datetime
from pathlib import Path
from typing import List, Dict, Any
import litellm

from barely_core.models.domain import Goal, RunResult, StepRecord
from barely_core.browser.engine import BrowserEngine
from barely_core.agent.cache import ActionCache
from barely_core.vrt.engine import VRTEngine
from barely_core.db import SessionLocal, RunRecord, RunStep as DBRunStep

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are Barely, an autonomous QA testing agent.
Your objective is to accomplish the user's test goal by interacting with a web browser.

You will be provided with:
1. The overall Goal and the Steps to accomplish.
2. The current simplified DOM (Accessibility Tree). It is a JSON list of interactive elements, each with a unique 'id'.

You must respond ONLY with a valid JSON object matching this schema:
{
    "thought": "Your reasoning for what to do next based on the current DOM",
    "action": "click" | "type" | "navigate" | "screenshot" | "finish" | "fail",
    "element_id": <int> (Required if action is click or type. Use the 'id' from the DOM array),
    "text": <str> (Required if action is type or navigate),
    "reasoning": "If failing, explain why."
}

Do not include markdown blocks like ```json in your output. Just output the raw JSON object.
"""

class AgentLoop:
    def __init__(self, engine: BrowserEngine, model: str = "anthropic/claude-3-5-sonnet-20240620", run_id: str = None):
        self.engine = engine
        self.model = model
        self.cache = ActionCache()
        self.vrt = VRTEngine(threshold=0.05)
        self.run_id = run_id

    def run(self, goal: Goal, start_url: str) -> RunResult:
        print(f"\n🚀 Starting Goal: {goal.name}")
        
        if self.run_id:
            db = SessionLocal()
            try:
                run_rec = db.query(RunRecord).filter(RunRecord.id == self.run_id).first()
                if run_rec:
                    run_rec.status = "running"
                    db.commit()
            except: pass
            finally: db.close()
            
        self.engine.start()
        
        step_history = []
        rich_history = []
        
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        run_dir = Path(f".barely/runs/{goal.name}_{timestamp}")
        run_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            print(f"🌐 Navigating to {start_url}")
            self.engine.navigate(start_url)
            
            snap_path = str(run_dir / "step_0.png")
            self.engine.take_screenshot(snap_path)
            step_history.append(f"Navigated to {start_url}")
            rich_history.append(StepRecord(description=f"Navigated to {start_url}", screenshot_path=snap_path))
            
            # Initial VRT check
            if not self.vrt.assert_match(goal.name, 0, snap_path):
                return RunResult(goal_name=goal.name, success=False, failure_reason="Visual Regression Failed on initial page load", step_history=step_history, rich_history=rich_history, run_dir=str(run_dir))
            
            step_count = 0
            max_steps = 20
            
            while step_count < max_steps:
                step_count += 1
                
                dom_elements = self.engine.extract_dom()
                
                # Infinite loop prevention: if DOM hasn't changed, bypass cache!
                current_dom_hash = hash(str(dom_elements))
                if step_count > 1 and getattr(self, "_last_dom_hash", None) == current_dom_hash:
                    print("DOM unchanged since last step. Bypassing cache to prevent infinite loop.")
                    cached_action = None
                else:
                    cached_action = self.cache.get_action(goal.name, dom_elements)
                self._last_dom_hash = current_dom_hash
                
                if cached_action:
                    print(f"\n--- Step {step_count} [⚡ CACHED] ---")
                    action_payload = cached_action
                else:
                    print(f"\n--- Step {step_count} [🧠 AI] ---")
                    prompt = self._build_prompt(goal, dom_elements, step_history)
                    action_payload = self._call_llm(prompt)
                    print(f"Thought: {action_payload.get('thought')}")
                
                action = action_payload.get('action')
                try:
                    desc = self._execute_action(action, action_payload)
                    
                    # Only take screenshot if it's an actionable step
                    if action not in ["finish", "fail"]:
                        snap_path = str(run_dir / f"step_{step_count}.png")
                        self.engine.take_screenshot(snap_path)
                        
                        # Run Visual Regression Testing
                        if not self.vrt.assert_match(goal.name, step_count, snap_path):
                            step_history.append(f"Executed: {desc} (VRT FAILED)")
                            rich_history.append(StepRecord(description=f"{desc} (VRT FAILED)", screenshot_path=snap_path))
                            return RunResult(goal_name=goal.name, success=False, failure_reason=f"Visual Regression Failed at step {step_count}", step_history=step_history, rich_history=rich_history, run_dir=str(run_dir))
                        
                    step_history.append(desc)
                    rich_history.append(StepRecord(description=desc, screenshot_path=snap_path if action not in ["finish", "fail"] else None))
                    
                    if not cached_action and action not in ["fail", "finish"]:
                        self.cache.save_action(goal.name, dom_elements, action_payload)
                        
                except Exception as e:
                    logger.warning(f"Action execution failed: {e}")
                    if cached_action:
                        print("⚠️ Cached action failed. Invalidating cache and forcing LLM fallback...")
                        self.cache.invalidate(goal.name, dom_elements)
                        continue
                    else:
                        print("❌ Fatal Execution Error.")
                        self._save_result_json(run_dir, goal.name, False, str(e), step_history, rich_history)
                        return RunResult(goal_name=goal.name, success=False, failure_reason=str(e), step_history=step_history, rich_history=rich_history, run_dir=str(run_dir))

                if action == "finish":
                    self._save_result_json(run_dir, goal.name, True, None, step_history, rich_history)

                    print("✅ Goal Accomplished Successfully!")
                    return RunResult(goal_name=goal.name, success=True, step_history=step_history, rich_history=rich_history, run_dir=str(run_dir))
                elif action == "fail":
                    reason = action_payload.get('reasoning', 'Unknown AI Failure')
                    self._save_result_json(run_dir, goal.name, False, reason, step_history, rich_history)

                    print(f"❌ Test Failed: {reason}")
                    return RunResult(goal_name=goal.name, success=False, failure_reason=reason, step_history=step_history, rich_history=rich_history, run_dir=str(run_dir))
                    
            self._save_result_json(run_dir, goal.name, False, "Max steps (20) exceeded", step_history, rich_history)
            return RunResult(goal_name=goal.name, success=False, failure_reason="Max steps (20) exceeded", step_history=step_history, rich_history=rich_history, run_dir=str(run_dir))
                    
        finally:
            self.engine.stop()

    def _execute_action(self, action: str, payload: Dict[str, Any]) -> str:
        if action == "click":
            desc = f"Clicked element [{payload.get('element_id')}]"
            print(f"🖱️  Action: {desc}")
            self.engine.click_element(payload.get('element_id'))
            return desc
        elif action == "type":
            desc = f"Typed '{payload.get('text')}' into [{payload.get('element_id')}]"
            print(f"⌨️  Action: {desc}")
            self.engine.type_element(payload.get('element_id'), payload.get('text'))
            return desc
        elif action == "navigate":
            desc = f"Navigated to {payload.get('text')}"
            print(f"🌐 Action: {desc}")
            self.engine.navigate(payload.get('text'))
            return desc
        elif action == "screenshot":
            desc = "Took an explicit screenshot of the current page."
            print(f"📸 Action: {desc}")
            return desc
        elif action == "finish":
            return "Agent marked goal as finished."
        elif action == "fail":
            return f"Agent marked goal as failed: {payload.get('reasoning')}"
        else:
            raise ValueError(f"Unknown action: {action}")

    def _build_prompt(self, goal, dom, history):
        goal_text = f"GOAL: {goal.name}\nINSTRUCTIONS:\n{goal.raw_content}\n"
        hist_text = "\nPAST ACTIONS HISTORY:\n"
        if not history:
            hist_text += "(No actions taken yet)\n"
        else:
            for i, h in enumerate(history):
                hist_text += f"Step {i}: {h}\n"
        return goal_text + hist_text + f"\nCURRENT DOM:\n{json.dumps(dom, indent=2)}\n"

    def _call_llm(self, prompt: str) -> Dict[str, Any]:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ]
        response = litellm.completion(model=self.model, messages=messages, temperature=0.0)
        raw_output = response.choices[0].message.content
        
        if raw_output.startswith("```json"):
            raw_output = raw_output.replace("```json", "").replace("```", "").strip()
            
        try:
            return json.loads(raw_output)
        except json.JSONDecodeError:
            return {"action": "fail", "reasoning": "LLM output invalid JSON"}

    def _save_result_json(self, run_dir: Path, goal_name: str, success: bool, reason: str, step_history: list, rich_history: list):
        if not self.run_id:
            return
        db = SessionLocal()
        try:
            run_rec = db.query(RunRecord).filter(RunRecord.id == self.run_id).first()
            if run_rec:
                run_rec.status = "completed"
                run_rec.success = success
                run_rec.failure_reason = reason
                for i, step in enumerate(rich_history):
                    db_step = DBRunStep(
                        run_id=self.run_id,
                        step_index=i,
                        description=step.description,
                        screenshot_path=step.screenshot_path
                    )
                    db.add(db_step)
                db.commit()
        except Exception as e:
            logger.error(f"DB Save Error: {e}")
        finally:
            db.close()
