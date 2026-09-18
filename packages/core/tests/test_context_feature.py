import sys
import unittest
from unittest.mock import MagicMock

# Gracefully provide mocks for container-only dependencies
if "yaml" not in sys.modules:
    try:
        import yaml
    except ImportError:
        mock_yaml = MagicMock()
        mock_yaml.safe_load = lambda s: {}
        sys.modules["yaml"] = mock_yaml

if "pydantic" not in sys.modules:
    try:
        import pydantic
    except ImportError:
        class MockBaseModel:
            def __init__(self, **kwargs):
                for k, v in kwargs.items():
                    setattr(self, k, v)
        mock_pydantic = MagicMock()
        mock_pydantic.BaseModel = MockBaseModel
        mock_pydantic.Field = lambda default=None, default_factory=None, **kwargs: (default_factory() if default_factory else default)
        sys.modules["pydantic"] = mock_pydantic

for mod in ["playwright", "playwright.sync_api", "sqlalchemy", "sqlalchemy.orm", "sqlalchemy.ext.declarative"]:
    if mod not in sys.modules:
        m = MagicMock()
        if "sqlalchemy" in mod:
            m.declarative_base = lambda: object
        sys.modules[mod] = m

if "litellm" not in sys.modules:
    mock_litellm = MagicMock()
    mock_litellm.drop_params = True
    sys.modules["litellm"] = mock_litellm

from barely_core.models.domain import Goal
from barely_core.parser.goal_parser import GoalParser
from barely_core.agent.loop import AgentLoop

class TestContextFeature(unittest.TestCase):
    def test_goal_model_context_field(self):
        """Verify Goal model accepts optional context string."""
        g = Goal(
            name="Checkout Test",
            start_url="https://shop.example.com",
            steps=["Add item to cart", "Proceed to checkout"],
            context="Test User: qa@example.com, Card: 4242-4242-4242-4242"
        )
        self.assertEqual(g.context, "Test User: qa@example.com, Card: 4242-4242-4242-4242")

    def test_goal_parser_extracts_context_from_frontmatter(self):
        """Verify GoalParser extracts context from YAML frontmatter."""
        md_content = """---
name: Login Flow
url: https://app.example.com/login
context: "Valid test credentials: user=admin@corp.io, otp_bypass=123456"
---

1. Enter email
2. Enter OTP
3. Verify dashboard loads
"""
        with unittest.mock.patch("barely_core.parser.goal_parser.yaml.safe_load") as mock_yaml_load:
            mock_yaml_load.return_value = {
                "name": "Login Flow",
                "url": "https://app.example.com/login",
                "context": "Valid test credentials: user=admin@corp.io, otp_bypass=123456"
            }
            goal = GoalParser.parse_content(md_content)
            self.assertEqual(goal.name, "Login Flow")
            self.assertIn("user=admin@corp.io", goal.context)
            self.assertEqual(len(goal.steps), 3)

    def test_goal_parser_extracts_context_from_markdown_heading(self):
        """Verify GoalParser extracts context from a ## Context section in markdown."""
        md_content = """---
name: Subscription Flow
url: https://app.example.com/billing
---

## Context
Payment sandbox card: 4000-0000-0000-1111 (CVC: 123)
Note: Discount code 'SAVE50' applies 50% discount.

## Steps
1. Select Pro plan
2. Enter card details
3. Click Subscribe
"""
        with unittest.mock.patch("barely_core.parser.goal_parser.yaml.safe_load") as mock_yaml_load:
            mock_yaml_load.return_value = {
                "name": "Subscription Flow",
                "url": "https://app.example.com/billing"
            }
            goal = GoalParser.parse_content(md_content)
            self.assertEqual(goal.name, "Subscription Flow")
            self.assertIsNotNone(goal.context)
            self.assertIn("Payment sandbox card: 4000-0000-0000-1111", goal.context)
            self.assertIn("Discount code 'SAVE50'", goal.context)
            self.assertEqual(len(goal.steps), 3)

    def test_agent_loop_injects_context_into_prompt(self):
        """Verify AgentLoop._build_prompt includes APPLICATION CONTEXT before USER TEST GOAL & INSTRUCTIONS."""
        dummy_engine = MagicMock()
        agent = AgentLoop(engine=dummy_engine)

        goal = Goal(
            name="E-Commerce Checkout Test",
            start_url="https://shop.example.com",
            steps=["Submit form"],
            context="You are testing an e-commerce store ABC. Act as a customer purchasing items."
        )

        prompt = agent._build_prompt(
            goal=goal,
            dom="<button id='pay'>Pay</button>",
            history=[]
        )

        self.assertIn("APPLICATION CONTEXT (WHAT YOU ARE TESTING):", prompt)
        self.assertIn("You are testing an e-commerce store ABC. Act as a customer purchasing items.", prompt)
        self.assertIn("USER TEST GOAL & INSTRUCTIONS:", prompt)

    def test_agent_loop_omits_context_when_not_provided(self):
        """Verify AgentLoop._build_prompt omits context section when goal.context is None or empty."""
        dummy_engine = MagicMock()
        agent = AgentLoop(engine=dummy_engine)

        goal = Goal(
            name="Simple Test",
            start_url="https://simple.example.com",
            steps=["Click link"],
            context=None
        )

        prompt = agent._build_prompt(
            goal=goal,
            dom="<a href='/about'>About</a>",
            history=[]
        )

        self.assertNotIn("APPLICATION CONTEXT", prompt)
        self.assertIn("USER TEST GOAL & INSTRUCTIONS:", prompt)

    def test_call_llm_injects_application_context_into_system_prompt(self):
        """Verify _call_llm injects application persona and domain context into system messages."""
        dummy_engine = MagicMock()
        agent = AgentLoop(engine=dummy_engine)

        with unittest.mock.patch("barely_core.agent.loop.litellm.completion") as mock_completion, \
             unittest.mock.patch("barely_core.agent.loop.resolve_model_api_key", return_value="dummy_key"):
            mock_resp = MagicMock()
            mock_resp.choices = [MagicMock()]
            mock_resp.choices[0].message.content = '{"thought": "On e-commerce home", "action": "finish"}'
            mock_completion.return_value = mock_resp

            agent._call_llm("Prompt text", context="You are testing an e-commerce store ABC")

            call_kwargs = mock_completion.call_args[1]
            messages = call_kwargs["messages"]
            system_msg = next(m for m in messages if m["role"] == "system")
            self.assertIn("APPLICATION CONTEXT & TESTING PERSONA:", system_msg["content"])
            self.assertIn("You are testing the following application:", system_msg["content"])
            self.assertIn("You are testing an e-commerce store ABC", system_msg["content"])

if __name__ == '__main__':
    unittest.main()
