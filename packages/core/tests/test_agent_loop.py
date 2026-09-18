import sys
import unittest
from unittest.mock import patch, MagicMock

# Gracefully provide mocks for container-only dependencies
for mod in [
    "yaml", "pydantic", "playwright", "playwright.sync_api", 
    "sqlalchemy", "sqlalchemy.orm", "sqlalchemy.ext.declarative"
]:
    if mod not in sys.modules:
        m = MagicMock()
        if mod == "pydantic":
            m.BaseModel = object
            m.Field = lambda *args, **kwargs: None
        elif mod in ("sqlalchemy.orm", "sqlalchemy.ext.declarative"):
            m.declarative_base = lambda: object
        sys.modules[mod] = m

if "litellm" not in sys.modules:
    try:
        import litellm
    except ImportError:
        mock_litellm = MagicMock()
        class MockUnsupportedParamsError(Exception):
            def __init__(self, model="", message=""):
                super().__init__(message)
                self.model = model
                self.message = message
        mock_litellm.UnsupportedParamsError = MockUnsupportedParamsError
        mock_litellm.drop_params = False
        sys.modules["litellm"] = mock_litellm

import litellm
from barely_core.agent.loop import AgentLoop

class TestAgentLoopLiteLLM(unittest.TestCase):
    def test_litellm_drop_params_is_true(self):
        """Verify that litellm.drop_params is globally set to True to prevent crashes on unsupported params."""
        self.assertTrue(litellm.drop_params)

    @patch("barely_core.agent.loop.resolve_model_api_key")
    @patch("barely_core.agent.loop.litellm.completion")
    def test_call_llm_handles_unsupported_params_error(self, mock_completion, mock_resolve_key):
        """
        Verify that if litellm.completion raises UnsupportedParamsError for temperature=0.0
        (such as on claude-sonnet-5 or reasoning models), it automatically retries without temperature.
        """
        mock_resolve_key.return_value = "sk-ant-test"

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = '{"thought": "Navigate to home", "action": "navigate", "text": "https://example.com"}'

        error = litellm.UnsupportedParamsError(
            model="claude-sonnet-5",
            message="claude-sonnet-5 does not support temperature=0.0. Only temperature=1 is supported. To drop unsupported params, set `litellm.drop_params = True`."
        )
        mock_completion.side_effect = [error, mock_response]

        dummy_engine = MagicMock()
        agent = AgentLoop(engine=dummy_engine, model="claude-sonnet-5")

        result = agent._call_llm("Test prompt")

        self.assertEqual(result.get("action"), "navigate")
        self.assertEqual(result.get("text"), "https://example.com")
        self.assertEqual(mock_completion.call_count, 2)

        second_call_kwargs = mock_completion.call_args_list[1][1]
        self.assertNotIn("temperature", second_call_kwargs)
        self.assertTrue(second_call_kwargs.get("drop_params"))

    @patch("barely_core.agent.loop.resolve_model_api_key")
    @patch("barely_core.agent.loop.litellm.completion")
    def test_call_llm_handles_mandated_temperature_1(self, mock_completion, mock_resolve_key):
        """
        Verify that if a model specifically requires temperature=1.0, it retries with temperature=1.0.
        """
        mock_resolve_key.return_value = "sk-ant-test"

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = '{"thought": "All steps done", "action": "finish"}'

        err1 = litellm.UnsupportedParamsError(
            model="claude-sonnet-5",
            message="claude-sonnet-5 does not support temperature=0.0. Only temperature=1 is supported."
        )
        err2 = Exception("Provider error: Only temperature=1 is supported when thinking is enabled.")
        mock_completion.side_effect = [err1, err2, mock_response]

        dummy_engine = MagicMock()
        agent = AgentLoop(engine=dummy_engine, model="claude-sonnet-5")

        result = agent._call_llm("Test prompt")
        self.assertEqual(result.get("action"), "finish")
        self.assertEqual(mock_completion.call_count, 3)
        third_call_kwargs = mock_completion.call_args_list[2][1]
        self.assertEqual(third_call_kwargs.get("temperature"), 1.0)

if __name__ == "__main__":
    unittest.main()
