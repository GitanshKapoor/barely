import json
import logging
from pathlib import Path
from typing import Dict, Any, List
from dataclasses import dataclass, field
from barely_core.browser.engine import BrowserEngine
from barely_core.parser.goal_parser import Goal
from barely_core.agent.cache import ActionCache
import litellm
import base64
from barely_core.db import SessionLocal, RunRecord, RunStep as DBRunStep

logger = logging.getLogger("barely_agent")

SYSTEM_PROMPT = """You are Barely, an autonomous QA agent.
You are given a Goal and the current simplified DOM of a webpage.
Return a JSON object with:
- "thought": A brief explanation of what you are doing.
- "action": One of ["click", "type", "navigate", "screenshot", "finish", "fail"]
- "element_id": (For click/type) The integer ID of the element to interact with.
- "text": (For type/navigate) The text to type or URL to navigate to.
- "reasoning": (If failing) Why you couldn't accomplish the goal.

Always double check the step history to avoid getting stuck in loops.
If you think the goal is achieved, output {"action": "finish"}.
"""

@dataclass
class StepRecord:
    description: str
    screenshot_base64: str = None

@dataclass
class RunResult:
    goal_name: str
    success: bool
    step_history: List[str] = field(default_factory=list)
    rich_history: List[StepRecord] = field(default_factory=list)
    failure_reason: str = None

class AgentLoop:
    def __init__(self, engine: BrowserEngine, model: str = "anthropic/claude-sonnet-4-5", run_id: str = None):
        self.engine = engine
        self.model = model
        self.cache = ActionCache()
        self.run_id = run_id

    def run(self, goal: Goal, start_url: str) -> RunResult:
        step_history = []
        rich_history = []
        
        try:
            self.engine.start()
            self.engine.navigate(start_url)
            
            step_count = 0
            max_steps = 20
            
            while step_count < max_steps:
                step_count += 1
                dom_elements = self.engine.extract_dom()
                
                # Infinite loop prevention
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
                    
                    b64_snap = None
                    if action not in ["finish", "fail"]:
                        b64_snap = self.engine.take_screenshot_base64()
                        
                    step_history.append(desc)
                    rich_history.append(StepRecord(description=desc, screenshot_base64=b64_snap))
                    
                    if not cached_action and action not in ["fail", "finish"]:
                        self.cache.save_action(goal.name, dom_elements, action_payload)
                        
                except Exception as e:
                    logger.warning(f"Action execution failed: {e}")
                    if cached_action:
                        self.cache.invalidate(goal.name, dom_elements)
                        continue
                    else:
                        self._save_result_db(success=False, reason=str(e), rich_history=rich_history)
                        return RunResult(goal_name=goal.name, success=False, failure_reason=str(e), step_history=step_history, rich_history=rich_history)

                if action == "finish":
                    self._save_result_db(success=True, reason=None, rich_history=rich_history)
                    print("✅ Goal Accomplished Successfully!")
                    return RunResult(goal_name=goal.name, success=True, step_history=step_history, rich_history=rich_history)
                elif action == "fail":
                    reason = action_payload.get('reasoning', 'Unknown AI Failure')
                    self._save_result_db(success=False, reason=reason, rich_history=rich_history)
                    print(f"❌ Test Failed: {reason}")
                    return RunResult(goal_name=goal.name, success=False, failure_reason=reason, step_history=step_history, rich_history=rich_history)
                    
            self._save_result_db(success=False, reason="Max steps (20) exceeded", rich_history=rich_history)
            return RunResult(goal_name=goal.name, success=False, failure_reason="Max steps (20) exceeded", step_history=step_history, rich_history=rich_history)
                    
        finally:
            self.engine.stop()

    def _execute_action(self, action: str, payload: Dict[str, Any]) -> str:
        if action == "click":
            desc = f"Clicked element [{payload.get('element_id')}]"
            self.engine.click_element(payload.get('element_id'))
            return desc
        elif action == "type":
            desc = f"Typed '{payload.get('text')}' into [{payload.get('element_id')}]"
            self.engine.type_element(payload.get('element_id'), payload.get('text'))
            return desc
        elif action == "navigate":
            desc = f"Navigated to {payload.get('text')}"
            self.engine.navigate(payload.get('text'))
            return desc
        elif action == "screenshot":
            return "Took an explicit screenshot of the current page."
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

    def _save_result_db(self, success: bool, reason: str, rich_history: list):
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
                        screenshot_base64=step.screenshot_base64
                    )
                    db.add(db_step)
                db.commit()
        except Exception as e:
            logger.error(f"DB Save Error: {e}")
        finally:
            db.close()
