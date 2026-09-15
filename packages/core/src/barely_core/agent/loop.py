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

SYSTEM_PROMPT = """You are Barely, an autonomous precision E2E QA testing agent.
Your objective is to execute the user's test instructions sequentially and accurately.
You will receive:
1. USER TEST INSTRUCTIONS (the exact numbered steps you must follow)
2. PAST ACTIONS ALREADY PERFORMED (actions you have already taken)
3. CURRENT DOM ACCESSIBILITY TREE (the interactive elements on the page)

Rules:
- Strictly follow the numbered user instructions in sequence.
- Once an instruction has been executed (e.g. taking a screenshot, clicking a button, or typing text), move on to the next instruction immediately.
- If the current instruction says "Take a screenshot", execute {"action": "screenshot"}. Do NOT take multiple screenshots for the same instruction.
- If the user instructions say "Test End", "Finish", "Done", or all steps have been executed, immediately output:
  {"thought": "All steps completed.", "action": "finish"}
- Return ONLY a JSON object with:
  - "thought": A brief explanation of which instruction step you are addressing.
  - "action": One of ["click", "type", "press_key", "navigate", "screenshot", "finish", "fail"]
  - "element_id": (Integer ID if clicking, typing, or targeting an element)
  - "text": (String if typing text or navigating to a URL)
  - "press_enter": (Optional boolean for "type") Set to true to submit/press Enter immediately after typing (recommended for search bars & forms)
  - "key": (String for "press_key", e.g. "Enter", "Tab", "Escape")
  - "reasoning": (Required if action is "fail") A comprehensive root-cause analysis explaining exactly why the test failed, which expected element or state was missing, and what occurred instead.
"""

@dataclass
class StepRecord:
    description: str
    screenshot_base64: str = None
    thought: str = None

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

    def _append_log(self, text: str):
        if not self.run_id:
            return
        import datetime
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        formatted = f"[{timestamp}] {text}\n"
        db = SessionLocal()
        try:
            r = db.query(RunRecord).filter(RunRecord.id == self.run_id).first()
            if r:
                r.logs = (r.logs or "") + formatted
                db.commit()
        except Exception as e:
            logger.debug(f"Failed to append log: {e}")
        finally:
            db.close()

    def _is_cancelled(self) -> bool:
        if not self.run_id:
            return False
        db = SessionLocal()
        try:
            r = db.query(RunRecord).filter(RunRecord.id == self.run_id).first()
            return bool(r and r.status == "cancelled")
        finally:
            db.close()

    def run(self, goal: Goal, start_url: str) -> RunResult:
        step_history = []
        rich_history = []
        self._append_log(f"🚀 Initializing Barely Agent Runner on {start_url}...")
        
        try:
            self.engine.start()
            self._append_log("🌐 Browser instance launched successfully.")
            self.engine.navigate(start_url)
            self._append_log(f"📍 Navigated to initial URL: {start_url}")
            
            step_count = 0
            max_steps = 20
            
            while step_count < max_steps:
                if self._is_cancelled():
                    self._append_log("🛑 Execution interrupted: Run cancelled by user.")
                    return RunResult(goal_name=goal.name, success=False, failure_reason="Cancelled by user", step_history=step_history, rich_history=rich_history)

                step_count += 1
                dom_elements = self.engine.extract_dom()
                
                # Infinite loop prevention
                current_dom_hash = hash(str(dom_elements))
                if step_count > 1 and getattr(self, "_last_dom_hash", None) == current_dom_hash:
                    self._append_log("⚠️ DOM unchanged since last action. Bypassing action cache.")
                    cached_action = None
                else:
                    cached_action = self.cache.get_action(goal.name, dom_elements)
                self._last_dom_hash = current_dom_hash
                
                if cached_action:
                    self._append_log(f"⚡ Step {step_count}: Cached decision match retrieved.")
                    action_payload = cached_action
                else:
                    self._append_log(f"🧠 Step {step_count}: Analyzing DOM and prompting AI agent...")
                    prompt = self._build_prompt(goal, dom_elements, step_history)
                    action_payload = self._call_llm(prompt)
                    thought_log = action_payload.get('thought') or 'No thought provided'
                    self._append_log(f"💭 Agent Thought: {thought_log}")
                
                action = action_payload.get('action')
                thought = action_payload.get('thought')
                try:
                    desc = self._execute_action(action, action_payload, dom_elements=dom_elements)
                    self._append_log(f"▶️ Executed: {desc}")
                    
                    b64_snap = None
                    if action not in ["finish", "fail"]:
                        b64_snap = self.engine.take_screenshot_base64()
                        
                    step_record = StepRecord(description=desc, screenshot_base64=b64_snap, thought=thought)
                    step_history.append(desc)
                    rich_history.append(step_record)
                    
                    # Persist step to database immediately in real-time
                    if self.run_id:
                        db = SessionLocal()
                        try:
                            db_step = DBRunStep(
                                run_id=self.run_id,
                                step_index=len(rich_history) - 1,
                                thought=thought,
                                description=desc,
                                screenshot_base64=b64_snap
                            )
                            db.add(db_step)
                            db.commit()
                        except Exception as dbe:
                            logger.error(f"Error persisting real-time step: {dbe}")
                        finally:
                            db.close()

                    if not cached_action and action not in ["fail", "finish"]:
                        self.cache.save_action(goal.name, dom_elements, action_payload)
                        
                except Exception as e:
                    err_msg = f"Action execution failed: {str(e)}"
                    logger.warning(err_msg)
                    self._append_log(f"❌ Error: {err_msg}")
                    if cached_action:
                        self.cache.invalidate(goal.name, dom_elements)
                        continue
                    else:
                        self._save_result_db(success=False, reason=str(e), rich_history=rich_history)
                        return RunResult(goal_name=goal.name, success=False, failure_reason=str(e), step_history=step_history, rich_history=rich_history)

                if action == "finish":
                    self._append_log("✅ Goal accomplished successfully. Test passed!")
                    self._save_result_db(success=True, reason=None, rich_history=rich_history)
                    return RunResult(goal_name=goal.name, success=True, step_history=step_history, rich_history=rich_history)
                elif action == "fail":
                    reason = action_payload.get('reasoning', 'Unknown AI Failure')
                    self._append_log(f"❌ Test marked as failed by agent: {reason}")
                    self._save_result_db(success=False, reason=reason, rich_history=rich_history)
                    return RunResult(goal_name=goal.name, success=False, failure_reason=reason, step_history=step_history, rich_history=rich_history)
                    
            self._append_log("⏱️ Max steps (20) exceeded before goal completion.")
            self._save_result_db(success=False, reason="Max steps (20) exceeded", rich_history=rich_history)
            return RunResult(goal_name=goal.name, success=False, failure_reason="Max steps (20) exceeded", step_history=step_history, rich_history=rich_history)
                    
        finally:
            self.engine.stop()

    def _get_element_label(self, elem_id: Any, dom_elements: List[Dict[str, Any]] = None) -> str:
        """Translates technical element IDs into clean, human-readable UI element descriptions."""
        if elem_id is None:
            return "element"
        if dom_elements:
            for el in dom_elements:
                if str(el.get("id")) == str(elem_id):
                    tag = (el.get("tag") or "").lower()
                    text = (el.get("text") or "").strip()
                    el_type = (el.get("type") or "").lower()

                    if tag == "a":
                        return f'"{text}" link' if text else "link"
                    elif tag == "button" or (tag == "input" and el_type in ["submit", "button"]):
                        return f'"{text}" button' if text else "button"
                    elif tag in ["input", "textarea"]:
                        if text and text.lower() not in ["input", "text", "search"]:
                            return f'"{text}" input field'
                        return f'{text or el_type or "text"} input field'
                    elif tag == "select":
                        return f'"{text}" dropdown' if text else "dropdown"
                    elif text:
                        return f'"{text}"'
        return "element"

    def _execute_action(self, action: str, payload: Dict[str, Any], dom_elements: List[Dict[str, Any]] = None) -> str:
        elem_id = payload.get('element_id')
        target_label = self._get_element_label(elem_id, dom_elements)

        if action == "click":
            desc = f"Clicked {target_label}"
            self.engine.click_element(elem_id)
            return desc
        elif action == "type":
            press_enter = bool(payload.get('press_enter', False))
            text = str(payload.get('text', ''))
            desc = f"Typed '{text}' into {target_label}" + (" and pressed Enter" if press_enter else "")
            self.engine.type_element(elem_id, text, press_enter=press_enter)
            return desc
        elif action == "press_key":
            key = payload.get('key', 'Enter')
            desc = f"Pressed key '{key}'" + (f" on {target_label}" if elem_id else "")
            self.engine.press_key(key=key, element_id=elem_id)
            return desc
        elif action == "navigate":
            desc = f"Navigated to {payload.get('text')}"
            self.engine.navigate(payload.get('text'))
            return desc
        elif action == "screenshot":
            return "Captured visual verification screenshot."
        elif action == "finish":
            return "Goal successfully accomplished. Test completed."
        elif action == "fail":
            return f"Test failed: {payload.get('reasoning')}"
        else:
            raise ValueError(f"Unknown action: {action}")

    def _build_prompt(self, goal, dom, history):
        prompt = f"""TEST NAME: {goal.name}

USER TEST INSTRUCTIONS:
{goal.raw_content}

PAST ACTIONS ALREADY PERFORMED:
"""
        if not history:
            prompt += "(None yet - this is Step 1)\n"
        else:
            for i, h in enumerate(history):
                prompt += f"- Step {i + 1}: {h}\n"

        prompt += f"""
CURRENT DOM ACCESSIBILITY TREE:
{json.dumps(dom, indent=2)}

INSTRUCTION:
Review PAST ACTIONS ALREADY PERFORMED against USER TEST INSTRUCTIONS.
- If the current step or all instructions have already been completed, IMMEDIATELY return: {{"thought": "All user instructions are complete. Finishing test.", "action": "finish"}}
- Otherwise, execute the single NEXT pending user instruction without repeating past actions.
"""
        return prompt

    def _call_llm(self, prompt: str) -> Dict[str, Any]:
        import re
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ]
        response = litellm.completion(model=self.model, messages=messages, temperature=0.0)
        raw_output = response.choices[0].message.content
        
        # More robust JSON extraction using regex to find the first { and last }
        json_match = re.search(r'\{.*\}', raw_output, re.DOTALL)
        if json_match:
            raw_output = json_match.group(0)
            
        try:
            return json.loads(raw_output)
        except json.JSONDecodeError:
            return {"action": "fail", "reasoning": "LLM output invalid JSON: " + raw_output[:100]}

    def _save_result_db(self, success: bool, reason: str, rich_history: list):
        if not self.run_id:
            return
        db = SessionLocal()
        try:
            run_rec = db.query(RunRecord).filter(RunRecord.id == self.run_id).first()
            if run_rec:
                if run_rec.status != "cancelled":
                    run_rec.status = "completed"
                    run_rec.success = success
                    run_rec.failure_reason = reason
                db.commit()
        except Exception as e:
            logger.error(f"DB Save Error: {e}")
        finally:
            db.close()
