import json
import logging
import datetime
from pathlib import Path
from typing import List, Dict, Any
import litellm

from barely_core.models.domain import Goal, RunResult, StepRecord
from barely_core.browser.engine import BrowserEngine
from barely_core.agent.cache import ActionCache

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
    "action": "click" | "type" | "navigate" | "finish" | "fail",
    "element_id": <int> (Required if action is click or type. Use the 'id' from the DOM array),
    "text": <str> (Required if action is type or navigate),
    "reasoning": "If failing, explain why."
}

Do not include markdown blocks like ```json in your output. Just output the raw JSON object.
"""

class AgentLoop:
    def __init__(self, engine: BrowserEngine, model: str = "groq/llama3-70b-8192"):
        self.engine = engine
        self.model = model
        self.cache = ActionCache()

    def run(self, goal: Goal, start_url: str) -> RunResult:
        print(f"\n🚀 Starting Goal: {goal.name}")
        self.engine.start()
        
        step_history = []
        rich_history = []
        
        # Setup run directory for screenshots
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        run_dir = Path(f".barely/runs/{goal.name}_{timestamp}")
        run_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            print(f"🌐 Navigating to {start_url}")
            self.engine.navigate(start_url)
            
            # Initial screenshot
            snap_path = str(run_dir / "step_0.png")
            self.engine.take_screenshot(snap_path)
            step_history.append(f"Navigated to {start_url}")
            rich_history.append(StepRecord(description=f"Navigated to {start_url}", screenshot_path=snap_path))
            
            step_count = 0
            max_steps = 20
            
            while step_count < max_steps:
                step_count += 1
                
                dom_elements = self.engine.extract_dom()
                cached_action = self.cache.get_action(goal.name, dom_elements)
                
                if cached_action:
                    print(f"\n--- Step {step_count} [⚡ CACHED] ---")
                    action_payload = cached_action
                else:
                    print(f"\n--- Step {step_count} [🧠 AI] ---")
                    prompt = self._build_prompt(goal, dom_elements)
                    action_payload = self._call_llm(prompt)
                    print(f"Thought: {action_payload.get('thought')}")
                
                action = action_payload.get('action')
                try:
                    desc = self._execute_action(action, action_payload)
                    snap_path = str(run_dir / f"step_{step_count}.png")
                    self.engine.take_screenshot(snap_path)
                    
                    step_history.append(desc)
                    rich_history.append(StepRecord(description=desc, screenshot_path=snap_path))
                    
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
                        return RunResult(goal_name=goal.name, success=False, failure_reason=str(e), step_history=step_history, rich_history=rich_history, run_dir=str(run_dir))

                if action == "finish":
                    print("✅ Goal Accomplished Successfully!")
                    return RunResult(goal_name=goal.name, success=True, step_history=step_history, rich_history=rich_history, run_dir=str(run_dir))
                elif action == "fail":
                    reason = action_payload.get('reasoning', 'Unknown AI Failure')
                    print(f"❌ Test Failed: {reason}")
                    return RunResult(goal_name=goal.name, success=False, failure_reason=reason, step_history=step_history, rich_history=rich_history, run_dir=str(run_dir))
                    
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
        elif action == "finish":
            return "Agent marked goal as finished."
        elif action == "fail":
            return f"Agent marked goal as failed: {payload.get('reasoning')}"
        else:
            raise ValueError(f"Unknown action: {action}")

    def _build_prompt(self, goal: Goal, dom: List[Dict[str, Any]]) -> str:
        goal_text = f"GOAL: {goal.name}\nSTEPS:\n"
        for step in goal.steps:
            goal_text += f"{step.index}. {step.instruction}\n"
        return goal_text + f"\nCURRENT DOM:\n{json.dumps(dom, indent=2)}\n"

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
