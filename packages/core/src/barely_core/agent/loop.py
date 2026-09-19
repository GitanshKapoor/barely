import json
import logging
from pathlib import Path
from typing import Dict, Any, List
from dataclasses import dataclass, field
from barely_core.browser.engine import BrowserEngine
from barely_core.parser.goal_parser import Goal
from barely_core.agent.cache import ActionCache
import litellm
# Automatically drop unsupported parameters (e.g. temperature=0.0 on reasoning/thinking models like claude-sonnet-5, o1, o3-mini)
litellm.drop_params = True
import base64
from barely_core.db import SessionLocal, RunRecord, RunStep as DBRunStep
from barely_core.settings import resolve_model_api_key

logger = logging.getLogger("barely_agent")

SYSTEM_PROMPT = """You are Barely, an autonomous precision E2E QA testing agent.
Your objective is to execute the user's test instructions sequentially and accurately.
You will receive:
1. USER TEST INSTRUCTIONS (the exact numbered steps you must follow)
2. APPLICATION & TEST CONTEXT (optional domain knowledge, credentials, or background rules to guide your decisions)
3. PAST ACTIONS ALREADY PERFORMED (actions you have already taken)
4. CURRENT DOM ACCESSIBILITY TREE (the interactive elements on the page)

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
    def __init__(self, engine: BrowserEngine, model: str = "anthropic/claude-3-7-sonnet", run_id: str = None, use_cache: bool = False):
        self.engine = engine
        self.model = model
        self.cache = ActionCache()
        self.run_id = run_id
        self.use_cache = use_cache

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
        if getattr(goal, "context", None) and str(goal.context).strip():
            self._append_log(f"🧠 Application Context: \"{goal.context.strip()}\"")
        
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
                
                # Check Action Cache only if explicitly enabled
                cached_action = None
                if self.use_cache:
                    current_dom_hash = hash(str(dom_elements))
                    if step_count > 1 and getattr(self, "_last_dom_hash", None) == current_dom_hash:
                        self._append_log("⚠️ DOM unchanged since last action. Bypassing action cache.")
                    else:
                        cached_action = self.cache.get_action(goal.name, dom_elements)
                    self._last_dom_hash = current_dom_hash
                
                if cached_action:
                    self._append_log(f"⚡ Step {step_count}: Cached decision match retrieved.")
                    action_payload = cached_action
                else:
                    self._append_log(f"🧠 Step {step_count}: Analyzing DOM and prompting AI agent...")
                    prompt = self._build_prompt(goal, dom_elements, step_history)
                    action_payload = self._call_llm(prompt, context=getattr(goal, "context", None))
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

                    if self.use_cache and not cached_action and action not in ["fail", "finish"]:
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

    def _get_element_label(self, elem_id: Any, dom_elements: List[Dict[str, Any]] = None, thought: str = None) -> str:
        """Translates technical element IDs into clean, human-readable UI element descriptions."""
        if elem_id is None:
            return "target element"
        if dom_elements:
            for el in dom_elements:
                if str(el.get("id")) == str(elem_id):
                    tag = (el.get("tag") or "").lower()
                    text = (el.get("text") or "").strip()
                    el_type = (el.get("type") or "").lower()
                    placeholder = (el.get("placeholder") or "").strip()
                    aria_label = (el.get("aria_label") or "").strip()
                    name = (el.get("name") or "").strip()

                    label_text = text or aria_label or placeholder or name

                    if tag == "a":
                        return f'"{label_text}" link' if label_text else "navigation link"
                    elif tag == "button" or (tag == "input" and el_type in ["submit", "button"]):
                        return f'"{label_text}" button' if label_text else "button"
                    elif tag in ["input", "textarea"]:
                        if label_text and label_text.lower() not in ["input", "text", "search", "textarea"]:
                            return f'"{label_text}" input field'
                        return f'{label_text or el_type or "text"} input field'
                    elif tag == "select":
                        return f'"{label_text}" dropdown' if label_text else "dropdown"
                    elif label_text:
                        return f'"{label_text}"'

        # Fallback: check if the thought mentions what element is being targeted
        if thought:
            import re
            match = re.search(r'click(?:ing|ed)?\s+(?:on\s+)?(?:the\s+)?([^.,;]+)', thought, re.IGNORECASE)
            if match and len(match.group(1).strip()) < 35:
                return f'"{match.group(1).strip()}"'

        return "target element"

    def _execute_action(self, action: str, payload: Dict[str, Any], dom_elements: List[Dict[str, Any]] = None) -> str:
        elem_id = payload.get('element_id')
        thought = payload.get('thought')
        target_label = self._get_element_label(elem_id, dom_elements, thought=thought)

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
"""
        if getattr(goal, "context", None) and str(goal.context).strip():
            prompt += f"""
APPLICATION CONTEXT (WHAT YOU ARE TESTING):
{goal.context.strip()}
"""

        prompt += f"""
USER TEST GOAL & INSTRUCTIONS:
{goal.raw_content}

PAST ACTIONS ALREADY PERFORMED:
"""
        if not history:
            prompt += "(None yet - this is Step 1)\n"
        else:
            for i, h in enumerate(history):
                prompt += f"- Step {i + 1}: {h}\n"

        context_instruction = " within the specified APPLICATION CONTEXT" if getattr(goal, "context", None) and str(goal.context).strip() else ""

        prompt += f"""
CURRENT DOM ACCESSIBILITY TREE:
{json.dumps(dom, indent=2)}

INSTRUCTION:
Review PAST ACTIONS ALREADY PERFORMED against USER TEST GOAL & INSTRUCTIONS{context_instruction}.
- If the current step or all instructions have already been completed, IMMEDIATELY return: {{"thought": "All user instructions are complete. Finishing test.", "action": "finish"}}
- Otherwise, execute the single NEXT pending user instruction without repeating past actions.
"""
        return prompt

    def _call_llm(self, prompt: str, context: str = None) -> Dict[str, Any]:
        import re

        system_content = SYSTEM_PROMPT
        if context and str(context).strip():
            system_content += f"""

APPLICATION CONTEXT & TESTING PERSONA:
You are testing the following application:
"{context.strip()}"
Always adopt the persona, domain knowledge, and testing mindset appropriate for this specific application (e.g. e-commerce shopping flow, FinTech banking portal, SaaS dashboard). Interpret navigation, buttons, forms, and validation states accordingly.
"""

        messages = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": prompt}
        ]
        
        import os

        # Dynamically resolve encrypted key from DB or fallback to environment
        api_key = resolve_model_api_key(self.model)

        # If active model has no API key configured, check if any alternate provider is configured
        if not api_key:
            from barely_core.settings import get_model_provider, get_setting
            active_prov = get_model_provider(self.model)
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
                        f"Active model '{self.model}' has no {active_prov.upper()}_API_KEY configured. "
                        f"Auto-falling back to configured model '{fallback_model}'."
                    )
                    self.model = fallback_model
                    api_key = cand_key.strip()
                    break

        if not api_key:
            from barely_core.settings import get_model_provider
            raise ValueError(
                f"No API key configured for model '{self.model}'. Please configure your {get_model_provider(self.model).upper()}_API_KEY in Settings."
            )

        call_kwargs = {}
        call_kwargs["api_key"] = api_key

        model_name = self.model
        from barely_core.settings import get_model_provider
        prov = get_model_provider(model_name)
        is_groq = (prov == "groq")
        if is_groq:
            if not model_name.startswith("groq/"):
                model_name = f"groq/{model_name}"
            os.environ["GROQ_API_KEY"] = api_key

        # Safe token ceiling to prevent LiteLLM/Groq token overflow or missing token errors
        call_kwargs["max_tokens"] = 2048

        # Call LiteLLM with drop_params=True and resilient fallback for models rejecting custom temperature (e.g. claude-sonnet-5, o1, o3-mini)
        response = None
        try:
            response = litellm.completion(
                model=model_name,
                messages=messages,
                temperature=0.0,
                drop_params=True,
                **call_kwargs
            )
        except Exception as e:
            err_str = str(e).lower()
            if "unsupportedparamserror" in err_str or "temperature" in err_str or "unsupported params" in err_str:
                logger.warning(
                    f"Model '{model_name}' rejected temperature=0.0 ({e}). Retrying without temperature..."
                )
                try:
                    response = litellm.completion(
                        model=model_name,
                        messages=messages,
                        drop_params=True,
                        **call_kwargs
                    )
                except Exception as e2:
                    if "temperature=1" in str(e2).lower() or "only temperature=1" in err_str:
                        logger.warning(f"Model '{model_name}' mandates temperature=1.0. Retrying with temperature=1.0...")
                        response = litellm.completion(
                            model=model_name,
                            messages=messages,
                            temperature=1.0,
                            drop_params=True,
                            **call_kwargs
                        )
                    else:
                        raise e2
            elif is_groq and ("not_found" in err_str or "connection" in err_str or "unsupported" in err_str or "provider" in err_str):
                # Resilient fallback: Try Groq via its OpenAI-compatible endpoint
                clean_slug = model_name[5:] if model_name.startswith("groq/") else model_name
                call_slug = clean_slug if clean_slug.startswith("openai/") else f"openai/{clean_slug}"
                logger.warning(f"Groq provider invocation error ({e}). Retrying via Groq OpenAI-compatible endpoint...")
                try:
                    call_kwargs_openai = dict(call_kwargs)
                    call_kwargs_openai["api_base"] = "https://api.groq.com/openai/v1"
                    response = litellm.completion(
                        model=call_slug,
                        messages=messages,
                        drop_params=True,
                        **call_kwargs_openai
                    )
                except Exception as e_retry:
                    raise e_retry
            else:
                raise

        raw_output = ""
        if response and response.choices and len(response.choices) > 0 and response.choices[0].message:
            raw_output = response.choices[0].message.content or ""
        
        # Strip DeepSeek R1 reasoning thought tags (<think>...</think>) if present
        raw_output = re.sub(r'<think>.*?</think>', '', raw_output, flags=re.DOTALL).strip()

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
        # 1. Record outcome and failure reason first
        db = SessionLocal()
        try:
            run_rec = db.query(RunRecord).filter(RunRecord.id == self.run_id).first()
            if run_rec and run_rec.status != "cancelled":
                run_rec.success = success
                run_rec.failure_reason = reason
                db.commit()
        except Exception as e:
            logger.error(f"DB Save Error: {e}")
        finally:
            db.close()

        # 2. Trigger integrations (Jira ticket auto-creation, Slack/Teams)
        # Executing before marking status 'completed' eliminates race condition with UI polling.
        try:
            from barely_core.integrations.dispatcher import dispatch_run_notifications
            dispatch_run_notifications(self.run_id)
        except Exception as ne:
            logger.error(f"Failed to dispatch post-run integrations for {self.run_id}: {ne}")

        # 3. Mark run status as completed
        db = SessionLocal()
        try:
            run_rec = db.query(RunRecord).filter(RunRecord.id == self.run_id).first()
            if run_rec and run_rec.status != "cancelled":
                run_rec.status = "completed"
                db.commit()
        except Exception as e:
            logger.error(f"DB Status Completion Error: {e}")
        finally:
            db.close()


