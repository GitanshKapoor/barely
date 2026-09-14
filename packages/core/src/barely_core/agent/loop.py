import json
import logging
from typing import List, Dict, Any
import litellm
from barely_core.models.domain import Goal, Step
from barely_core.browser.engine import BrowserEngine

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

    def run(self, goal: Goal, start_url: str):
        """Executes the Plan -> Act -> Observe loop."""
        print(f"\n🚀 Starting Goal: {goal.name}")
        self.engine.start()
        
        try:
            print(f"🌐 Navigating to {start_url}")
            self.engine.navigate(start_url)
            
            step_count = 0
            max_steps = 20
            
            while step_count < max_steps:
                step_count += 1
                print(f"\n--- Step {step_count} ---")
                
                # 1. OBSERVE
                dom_elements = self.engine.extract_dom()
                
                # 2. PLAN
                prompt = self._build_prompt(goal, dom_elements)
                response = self._call_llm(prompt)
                
                print(f"🧠 Thought: {response.get('thought')}")
                
                # 3. ACT
                action = response.get('action')
                if action == "click":
                    print(f"🖱️  Action: Click element [{response.get('element_id')}]")
                    self.engine.click_element(response.get('element_id'))
                elif action == "type":
                    print(f"⌨️  Action: Type '{response.get('text')}' into [{response.get('element_id')}]")
                    self.engine.type_element(response.get('element_id'), response.get('text'))
                elif action == "navigate":
                    print(f"🌐 Action: Navigate to {response.get('text')}")
                    self.engine.navigate(response.get('text'))
                elif action == "finish":
                    print("✅ Goal Accomplished Successfully!")
                    break
                elif action == "fail":
                    print(f"❌ Test Failed: {response.get('reasoning')}")
                    break
                else:
                    print(f"⚠️ Unknown action: {action}")
                    
        finally:
            self.engine.stop()

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
